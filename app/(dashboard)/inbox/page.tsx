"use client";

/**
 * Inbox
 *
 * Instagram DM conversations for the selected account, with live message
 * history and a reply composer. Messages are read from the Conversations API
 * (Meta only exposes the 20 most recent per thread) and refreshed by polling.
 * Sending is subject to Instagram's 24-hour messaging window — Meta's error is
 * surfaced verbatim when it applies.
 */

import type { Locale } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronLeft, MessagesSquare } from "lucide-react";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import { readCache, writeCache } from "@/lib/client-cache";
import type { ConversationListItem } from "@/app/api/instagram/conversations/route";
import type { ThreadMessage } from "@/app/api/instagram/conversations/[id]/route";

const POLL_MS = 12_000;
// Cached list/threads are shown instantly on revisit, then revalidated in the
// background. The Instagram Conversations API is slow (often several seconds),
// so this is what makes the inbox feel fast after the first load.
const CACHE_MAX_AGE_MS = 60_000;
const convCacheKey = (accountId: string) => `inbox:convs:${accountId}`;
const msgCacheKey = (conversationId: string) => `inbox:msgs:${conversationId}`;

// Outside the component so the React compiler does not treat it as render work.
function optimisticId(): string {
  return `optimistic-${Date.now()}`;
}

function formatTime(iso: string | null, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export default function InboxPage() {
  const { t, locale } = useI18n();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  // Seed from the last-used account so a revisit can paint the cached
  // conversation list immediately, before the account list even loads.
  const [selectedAccountId, setSelectedAccountId] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem("inbox:selectedAccount") ?? "";
  });

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [convError, setConvError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationRequests = useRef(new Set<string>());

  const active = conversations.find((c) => c.id === activeId) ?? null;

  // Accounts for the selector; default to the first connected account. Uses the
  // lightweight accounts endpoint (one query) rather than the heavy dashboard
  // stats aggregation, so the inbox isn't gated on analytics before it can load.
  useEffect(() => {
    fetch("/api/instagram/accounts")
      .then((r) => r.json())
      .then((payload) => {
        if (!payload.success) return;
        const next: AccountOption[] = payload.data.instagramAccounts ?? [];
        setAccounts(next);
        setSelectedAccountId((prev) => {
          // Keep the seeded account only if it's still connected; otherwise
          // fall back to the default so a removed account can't wedge the inbox.
          const stillValid = prev && next.some((a) => a.id === prev);
          return stillValid
            ? prev
            : payload.data.selectedInstagramAccountId || next[0]?.id || "";
        });
      })
      .catch(() => setAccounts([]));
  }, []);

  // Remember the chosen account for the next visit.
  useEffect(() => {
    if (typeof window === "undefined" || !selectedAccountId) return;
    window.sessionStorage.setItem("inbox:selectedAccount", selectedAccountId);
  }, [selectedAccountId]);

  const loadConversations = useCallback(
    async (silent: boolean) => {
      if (!selectedAccountId || conversationRequests.current.has(selectedAccountId)) return;
      conversationRequests.current.add(selectedAccountId);
      if (!silent) setConvLoading(true);
      try {
        const res = await fetch(
          `/api/instagram/conversations?instagramAccountId=${selectedAccountId}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (data.success) {
          setConversations(data.data.conversations);
          writeCache(convCacheKey(selectedAccountId), data.data.conversations);
          setConvError(null);
        } else if (!silent) {
          setConvError(data.error ?? "Failed to load conversations");
        }
      } catch {
        if (!silent) setConvError("Failed to load conversations");
      } finally {
        conversationRequests.current.delete(selectedAccountId);
        if (!silent) setConvLoading(false);
      }
    },
    [selectedAccountId]
  );

  // Load + poll conversations for the selected account. A cached list is shown
  // immediately (so revisits are instant) while a fresh copy loads silently.
  useEffect(() => {
    if (!selectedAccountId) return;
    // Reset the open thread when switching accounts. This is an intentional
    // synchronous reset on a dependency change, not derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveId(null);
    setMessages([]);
    const cached = readCache<ConversationListItem[]>(
      convCacheKey(selectedAccountId),
      CACHE_MAX_AGE_MS
    );
    if (cached.data) {
      setConversations(cached.data);
      setConvLoading(false);
    } else {
      setConversations([]);
      setConvLoading(true);
    }
    void loadConversations(Boolean(cached.data));
    const timer = window.setInterval(() => void loadConversations(true), POLL_MS);
    return () => window.clearInterval(timer);
  }, [selectedAccountId, loadConversations]);

  const loadMessages = useCallback(
    async (conversationId: string, silent: boolean) => {
      if (!selectedAccountId) return;
      if (!silent) setThreadLoading(true);
      try {
        const res = await fetch(
          `/api/instagram/conversations/${conversationId}?instagramAccountId=${selectedAccountId}`,
          { cache: "no-store" }
        );
        const data = await res.json();
        if (data.success) {
          setMessages(data.data.messages);
          writeCache(msgCacheKey(conversationId), data.data.messages);
        }
      } catch {
        // keep whatever is shown
      } finally {
        if (!silent) setThreadLoading(false);
      }
    },
    [selectedAccountId]
  );

  // Load + poll the open thread. Cached messages render instantly while a fresh
  // copy loads silently; opening a thread never shows a blank pane on revisit.
  useEffect(() => {
    if (!activeId || active?.detailsUnavailable) return;
    const cached = readCache<ThreadMessage[]>(
      msgCacheKey(activeId),
      CACHE_MAX_AGE_MS
    );
    if (cached.data) {
      // Paint cached messages instantly on thread change; intentional reset.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages(cached.data);
      setThreadLoading(false);
    } else {
      setMessages([]);
      setThreadLoading(true);
    }
    void loadMessages(activeId, Boolean(cached.data));
    const timer = window.setInterval(
      () => void loadMessages(activeId, true),
      POLL_MS
    );
    return () => window.clearInterval(timer);
  }, [activeId, active?.detailsUnavailable, loadMessages]);

  // Keep the thread pinned to the latest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function openConversation(id: string) {
    setActiveId(id);
    setSendError(null);
    // Paint any cached thread synchronously so the pane never flashes empty
    // or shows the previously open conversation while the fetch runs.
    const cached = readCache<ThreadMessage[]>(msgCacheKey(id), CACHE_MAX_AGE_MS);
    setMessages(cached.data ?? []);
    setThreadLoading(!cached.data);
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text || !active?.contact.id || sending) return;
    setSending(true);
    setSendError(null);

    // Optimistically show the reply immediately, then confirm with the server.
    const optimistic: ThreadMessage = {
      id: optimisticId(),
      text,
      fromMe: true,
      fromUsername: null,
      createdTime: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    try {
      const res = await fetch("/api/instagram/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instagramAccountId: selectedAccountId,
          recipientId: active.contact.id,
          text,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await loadMessages(active.id, true);
        void loadConversations(true);
      } else {
        // Roll the optimistic message back and restore the draft so it's not lost.
        setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
        setDraft(text);
        setSendError(data.error ?? t("Failed to send message"));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(text);
      setSendError(t("Failed to send message"));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const contactName = (c: ConversationListItem) =>
    c.detailsUnavailable ? t("Details unavailable") : `@${c.contact.username ?? "unknown"}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 sm:mb-6">
        <h1 className="large-title">{t("Inbox")}</h1>
        {accounts.length > 1 && (
          <AccountSelect
            accounts={accounts}
            value={selectedAccountId}
            onChange={setSelectedAccountId}
            includeAll={false}
          />
        )}
      </div>

      {/* Messages-style split view: list on the leading side, thread on the
          trailing side. On phones only one pane shows at a time. */}
      <div className="grid h-[calc(100dvh-12.5rem)] min-h-[440px] grid-cols-1 overflow-hidden rounded-xl bg-surface sm:h-[calc(100dvh-14rem)] md:grid-cols-[300px_1fr] lg:grid-cols-[320px_1fr]">
        {/* Conversation list */}
        <div
          className={`min-h-0 flex-col md:flex md:border-r md:border-border ${
            active ? "hidden" : "flex"
          }`}
        >
          <div className="flex h-12 shrink-0 items-center px-4">
            <h2 className="title-3">{t("Conversations")}</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {convLoading ? (
              <div aria-busy="true" className="space-y-1 pt-1">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 px-2 py-2.5">
                    <span className="size-10 shrink-0 rounded-full bg-surface-2" />
                    <span className="flex-1 space-y-2">
                      <span className="block h-3 w-28 rounded bg-surface-2" />
                      <span className="block h-2.5 w-44 max-w-full rounded bg-surface-2" />
                    </span>
                  </div>
                ))}
                <span className="sr-only">{t("Loading…")}</span>
              </div>
            ) : convError ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-[14px] text-error">
                  {convError === "Failed to load conversations" ? t("Failed to load conversations") : convError}
                </p>
                <button
                  type="button"
                  onClick={() => void loadConversations(false)}
                  className="btn btn-sm btn-secondary"
                >
                  {t("Try again")}
                </button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex h-full items-center justify-center px-6 text-center">
                <p className="footnote">{t("No conversations yet.")}</p>
              </div>
            ) : (
              <ul>
                {conversations.map((c, index) => {
                  const isActive = c.id === activeId;
                  const nextActive = conversations[index + 1]?.id === activeId;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => openConversation(c.id)}
                        aria-current={isActive ? "true" : undefined}
                        className={`flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left transition-colors ${
                          isActive ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.04]"
                        }`}
                      >
                        <Avatar name={c.detailsUnavailable ? "" : c.contact.username ?? ""} />
                        <span
                          className={`relative min-w-0 flex-1 ${
                            // Hairline under each row, inset to the text like Messages,
                            // hidden around the selected row.
                            index < conversations.length - 1 && !isActive && !nextActive
                              ? "after:absolute after:-bottom-2.5 after:left-0 after:-right-2 after:border-b after:border-border"
                              : ""
                          }`}
                        >
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                              {contactName(c)}
                            </span>
                            <span className="shrink-0 text-[12px] text-muted">
                              {formatTime(c.updatedTime, locale)}
                            </span>
                          </span>
                          {c.detailsUnavailable ? (
                            <span className="mt-0.5 block truncate text-[13px] text-muted">
                              {t("Instagram could not load this conversation.")}
                            </span>
                          ) : c.lastMessage ? (
                            <span className="mt-0.5 block truncate text-[13px] text-muted">
                              {c.lastMessage.fromMe ? t("You: ") : ""}
                              {c.lastMessage.text || t("(no text)")}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Thread */}
        <div className={`min-h-0 flex-col ${active ? "flex" : "hidden md:flex"}`}>
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <MessagesSquare aria-hidden strokeWidth={1.4} className="size-10 text-tertiary" />
              <p className="footnote">{t("Select a conversation to read and reply.")}</p>
            </div>
          ) : (
            <>
              <div className="relative flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 md:px-4">
                <button
                  type="button"
                  onClick={() => setActiveId(null)}
                  className="-ml-1 inline-flex items-center text-[15px] text-accent-text md:hidden"
                  aria-label={t("Back to conversations")}
                >
                  <ChevronLeft aria-hidden strokeWidth={2.2} className="size-5" />
                  <span className="max-[359px]:sr-only">{t("Back")}</span>
                </button>
                <span className="absolute inset-x-24 flex items-center justify-center gap-2 md:static md:inset-auto md:justify-start">
                  <Avatar name={active.detailsUnavailable ? "" : active.contact.username ?? ""} size="sm" />
                  <span className="truncate text-[15px] font-semibold tracking-[-0.01em]">
                    {contactName(active)}
                  </span>
                </span>
              </div>

              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-5">
                {active.detailsUnavailable ? (
                  <p role="status" className="footnote mx-auto max-w-sm pt-10 text-center">
                    {t("Instagram could not load the details of this conversation. Other conversations are still available. You can check this chat in Instagram.")}
                  </p>
                ) : threadLoading && messages.length === 0 ? (
                  <p className="footnote pt-10 text-center">{t("Loading…")}</p>
                ) : messages.length === 0 ? (
                  <p className="footnote pt-10 text-center">{t("No messages.")}</p>
                ) : (
                  <ol className="flex flex-col">
                    {messages.map((m, i) => {
                      const prev = messages[i - 1];
                      const next = messages[i + 1];
                      const firstOfRun = !prev || prev.fromMe !== m.fromMe;
                      const lastOfRun = !next || next.fromMe !== m.fromMe;
                      return (
                        <li
                          key={m.id}
                          className={`flex flex-col ${m.fromMe ? "items-end" : "items-start"} ${
                            firstOfRun && i > 0 ? "mt-3" : i > 0 ? "mt-0.5" : ""
                          }`}
                        >
                          <div
                            className={`max-w-[78%] rounded-[18px] px-3.5 py-2 text-[15px] leading-[20px] sm:max-w-[65%] ${
                              m.fromMe
                                ? `bg-accent text-on-accent ${lastOfRun ? "rounded-br-[6px]" : ""}`
                                : `bg-surface-2 text-foreground ${lastOfRun ? "rounded-bl-[6px]" : ""}`
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words">{m.text}</p>
                          </div>
                          {lastOfRun && (
                            <time
                              dateTime={m.createdTime ?? undefined}
                              className="mt-1 px-1 text-[11px] text-muted"
                            >
                              {formatTime(m.createdTime, locale)}
                            </time>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              <div className="shrink-0 px-3 pb-3 pt-1 md:px-4">
                {sendError && (
                  <p role="alert" className="mb-2 px-1 text-[13px] text-error">{sendError}</p>
                )}
                <div className="flex items-end gap-1 rounded-[20px] border border-border-hover bg-surface py-1 pl-3.5 pr-1 focus-within:border-accent">
                  <textarea
                    disabled={active.detailsUnavailable || !active.contact.id}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    placeholder={t("Message")}
                    aria-label={t("Write a reply…  (Enter to send, Shift+Enter for a new line)")}
                    title={t("Write a reply…  (Enter to send, Shift+Enter for a new line)")}
                    className="max-h-32 min-h-[30px] flex-1 resize-none bg-transparent py-[5px] text-[15px] leading-[20px] text-foreground placeholder:text-tertiary focus:outline-none focus-visible:outline-none disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={sending || !draft.trim() || !active.contact.id || active.detailsUnavailable}
                    aria-label={sending ? t("Sending…") : t("Send")}
                    className="mb-px grid size-7 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition-opacity hover:bg-accent-hover disabled:opacity-30"
                  >
                    <ArrowUp aria-hidden strokeWidth={2.6} className="size-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Contact placeholder: initial in a neutral gray circle, like Messages. */
function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initial = name.replace(/^@/, "").charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-surface-2 font-semibold text-muted ${
        size === "sm" ? "size-7 text-[12px]" : "size-10 text-[15px]"
      }`}
    >
      {initial || "?"}
    </span>
  );
}
