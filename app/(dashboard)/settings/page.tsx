"use client";

import LanguageSwitcher from "@/components/language-switcher";
import ThemeToggle from "@/components/theme-toggle";
import { useI18n } from "@/lib/i18n/provider";
import { Suspense, useEffect, useState } from "react";
import type { AccountOption } from "@/components/account-select";
import { ZernioConnection } from "@/components/zernio-connection";
import { InstagramConnectNotice } from "@/components/instagram-connect-notice";

interface SettingsData {
  workspace: {
    name: string;
    dmsSentThisPeriod: number;
  };
  instagramAccount: {
    id: string;
    username: string;
    instagramId: string;
    tokenExpiresAt: string | null;
    webhookSubscribed: boolean;
  } | null;
  instagramAccounts: Array<
    AccountOption & {
      provider?: "META" | "ZERNIO";
      tokenExpiresAt: string | null;
      webhookSubscribed: boolean;
    }
  >;
}

interface WorkspaceMembersData {
  currentUserRole: "OWNER" | "ADMIN" | "MEMBER";
  members: Array<{
    id: string;
    role: "OWNER" | "ADMIN" | "MEMBER";
    createdAt: string;
    user: {
      id: string;
      email: string | null;
      name: string | null;
    };
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: "OWNER" | "ADMIN" | "MEMBER";
    inviteUrl: string;
    expiresAt: string;
  }>;
}

export default function SettingsPage() {
  const { t, label, locale } = useI18n();
  const [data, setData] = useState<SettingsData | null>(null);
  const [membersData, setMembersData] = useState<WorkspaceMembersData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [memberError, setMemberError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/stats").then((res) => res.json()),
      fetch("/api/workspace/members").then((res) => res.json()),
    ])
      .then(([statsPayload, membersPayload]) => {
        if (statsPayload.success) setData(statsPayload.data);
        if (membersPayload.success) setMembersData(membersPayload.data);
      })
      .finally(() => setLoading(false));
  }, []);

  async function refreshMembers() {
    const res = await fetch("/api/workspace/members");
    const payload = await res.json();
    if (payload.success) setMembersData(payload.data);
  }

  async function disconnectInstagram(instagramAccountId: string) {
    if (!confirm(t("Disconnect Instagram? Campaigns for this account will stop sending DMs."))) {
      return;
    }

    setBusy(`disconnect:${instagramAccountId}`);
    await fetch("/api/instagram/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instagramAccountId }),
    });
    window.location.reload();
  }

  async function inviteMember(event: React.FormEvent) {
    event.preventDefault();
    setMemberError(null);
    setBusy("invite");
    const res = await fetch("/api/workspace/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const payload = await res.json();
    if (payload.success) {
      setMembersData(payload.data);
      setInviteEmail("");
    } else {
      setMemberError(payload.error ?? t("Could not invite member"));
    }
    setBusy(null);
  }

  async function removeInvitation(invitationId: string) {
    setBusy(`invite:${invitationId}`);
    await fetch("/api/workspace/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitationId }),
    });
    await refreshMembers();
    setBusy(null);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl" aria-busy="true">
        <h1 className="large-title">{t("Settings")}</h1>
        <div className="mt-8 space-y-8">
          {[88, 132, 44].map((height, index) => (
            <div key={index}>
              <div className="mx-4 mb-2 h-3 w-28 rounded bg-surface-2" />
              <div className="rounded-xl bg-surface" style={{ height }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const accounts = data?.instagramAccounts ?? [];
  const canManageMembers =
    membersData?.currentUserRole === "OWNER" ||
    membersData?.currentUserRole === "ADMIN";

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="large-title">{t("Settings")}</h1>

      <div className="mt-6 space-y-8 sm:mt-8">
        {/* Surfaces the ?instagram= code the OAuth routes redirect back with.
            Needs a Suspense boundary: useSearchParams in a prerendered client
            page fails the production build without one. */}
        <Suspense fallback={null}>
          <InstagramConnectNotice />
        </Suspense>

        {/* Instagram account */}
        <section aria-labelledby="settings-instagram">
          <h2 id="settings-instagram" className="group-header">
            {t("Instagram account")}
          </h2>
          <div className="group">
            <div className="group-row">
              <span className="text-[15px]">{t("Status")}</span>
              <span
                className={`ml-auto text-[15px] ${
                  accounts.length > 0 ? "text-success" : "text-warning"
                }`}
              >
                {accounts.length > 0
                  ? accounts.length > 1
                    ? t("{count} connected", { count: accounts.length })
                    : t("Connected")
                  : t("Not connected")}
              </span>
            </div>

            {accounts.map((account) => (
              <div key={account.id} className="group-row flex-wrap gap-y-2 py-2.5">
                <Monogram name={account.username} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">@{account.username}</p>
                  <p className="footnote">
                    {account.provider === "ZERNIO" ? t("Connected via Zernio") : <>{t("Token expires")}{" "}
                    {account.tokenExpiresAt
                      ? new Date(account.tokenExpiresAt).toLocaleDateString(locale)
                      : t("not available")}</>}
                    {" · "}
                    <span className={account.webhookSubscribed ? "" : "text-warning"}>
                      {account.webhookSubscribed ? t("Webhook ready") : t("Webhook pending")}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => disconnectInstagram(account.id)}
                  disabled={busy === `disconnect:${account.id}`}
                  className="btn btn-sm btn-destructive ml-auto"
                >
                  {busy === `disconnect:${account.id}`
                    ? t("Disconnecting...")
                    : t("Disconnect")}
                </button>
              </div>
            ))}

            <a href="/api/instagram/connect" className="group-row text-[15px] text-accent-text">
              {t("Connect using your own Meta app")}
            </a>
          </div>
          <p className="group-footer">
            {accounts.length === 0
              ? t("Connect an Instagram professional account to launch campaigns.")
              : t("Comment webhooks and private replies depend on this connection.")}
          </p>
        </section>

        {/* Integrations */}
        <section aria-labelledby="settings-integrations">
          <h2 id="settings-integrations" className="group-header">
            {t("Integrations")}
          </h2>
          <ZernioConnection canManage={canManageMembers} />
        </section>

        {/* Appearance */}
        <section aria-labelledby="settings-appearance">
          <h2 id="settings-appearance" className="group-header">
            {t("Appearance")}
          </h2>
          <div className="group">
            <ThemeToggle />
          </div>
        </section>

        {/* Language. The menu opens a popover, so this group must not clip. */}
        <section aria-labelledby="settings-language">
          <h2 id="settings-language" className="group-header">
            {t("Interface language")}
          </h2>
          <div className="group overflow-visible">
            <LanguageSwitcher variant="row" />
          </div>
          <p className="group-footer">
            {t("Saved in this browser. Campaign messages stay unchanged.")}
          </p>
        </section>

        {/* Team */}
        <section aria-labelledby="settings-team">
          <h2 id="settings-team" className="group-header">
            {t("Team")}
          </h2>
          <div className="group">
            {membersData?.members.map((member) => {
              const name = member.user.name ?? member.user.email ?? t("Unknown member");
              return (
                <div key={member.id} className="group-row py-2.5">
                  <Monogram name={name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px]">{name}</p>
                    {member.user.email && member.user.email !== name && (
                      <p className="footnote truncate">{member.user.email}</p>
                    )}
                  </div>
                  <span className="shrink-0 text-[15px] text-muted">
                    {label(member.role)}
                  </span>
                </div>
              );
            })}
            {canManageMembers && (
              <form onSubmit={inviteMember} className="group-row flex-wrap gap-y-3 py-3">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="teammate@agency.com"
                  aria-label={t("Email")}
                  className="field min-w-0 flex-1 basis-60"
                  required
                />
                <div className="flex w-full items-center gap-3 sm:w-auto">
                  <div role="radiogroup" aria-label={t("Role")} className="segmented">
                    {(["MEMBER", "ADMIN"] as const).map((role) => (
                      <button
                        key={role}
                        type="button"
                        role="radio"
                        aria-checked={inviteRole === role}
                        onClick={() => setInviteRole(role)}
                      >
                        {label(role)}
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={busy === "invite"}
                    className="btn btn-primary ml-auto"
                  >
                    {busy === "invite" ? t("Inviting...") : t("Invite")}
                  </button>
                </div>
              </form>
            )}
          </div>
          {memberError && (
            <p role="alert" className="group-footer text-error">{memberError}</p>
          )}
        </section>

        {membersData?.invitations.length ? (
          <section aria-labelledby="settings-invites">
            <h2 id="settings-invites" className="group-header">
              {t("Pending invites")}
            </h2>
            <div className="group">
              {membersData.invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="group-row flex-wrap gap-y-2 py-2.5"
                >
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="truncate text-[15px]">{invitation.email}</p>
                    <p className="footnote truncate">
                      {label(invitation.role)} · {invitation.inviteUrl}
                    </p>
                  </div>
                  <div className="ml-auto flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void navigator.clipboard?.writeText(invitation.inviteUrl)
                      }
                      className="btn btn-sm btn-secondary"
                    >
                      {t("Copy")}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeInvitation(invitation.id)}
                      disabled={busy === `invite:${invitation.id}`}
                      className="btn btn-sm btn-destructive"
                    >
                      {t("Revoke")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Usage */}
        <section aria-labelledby="settings-usage">
          <h2 id="settings-usage" className="group-header">
            {t("Usage")}
          </h2>
          <div className="group">
            <div className="group-row">
              <span className="text-[15px]">{t("DMs sent this month")}</span>
              <span className="numeral ml-auto text-[15px] text-muted">
                {(data?.workspace.dmsSentThisPeriod ?? 0).toLocaleString(locale)}
              </span>
            </div>
          </div>
          <p className="group-footer">{t("Self-hosted — no plan limits.")}</p>
        </section>
      </div>
    </div>
  );
}

/** Neutral initial in a gray circle, like a contact without a photo. */
function Monogram({ name }: { name: string }) {
  const initial = name.replace(/^@/, "").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-[13px] font-semibold text-muted"
    >
      {initial}
    </span>
  );
}
