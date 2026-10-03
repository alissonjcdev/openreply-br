"use client";

/**
 * Import Campaigns Page
 *
 * Paste a CSV of everything except the post. Each row is queued and opened in
 * the campaign builder prefilled and editable, one at a time, so you review
 * each campaign and pick its reel before saving.
 */

import { useI18n } from "@/lib/i18n/provider";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import AccountSelect, { type AccountOption } from "@/components/account-select";
import { parseCsv } from "@/lib/utils/csv";
import { IMPORT_QUEUE_KEY, IMPORT_ACCOUNT_KEY } from "@/lib/import-queue";

const SAMPLE = `keywords,dm_message,public_reply,tracked_url,opening_dm,opening_dm_button
"yc","here it is: {link}","sent. check dms","https://events.ycombinator.com/startup-school-2026","hey! click below for the referral","send link"
"LINK,SHOP","grab it here: {link}","dmed u",,,`;

export default function ImportCampaignsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [csv, setCsv] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((res) => res.json())
      .then((payload) => {
        if (payload.success) {
          const next = payload.data.instagramAccounts ?? [];
          setAccounts(next);
          setSelectedAccountId(next[0]?.id ?? "");
        }
      })
      .catch(() => setAccounts([]));
  }, []);

  function startImport() {
    setError(null);
    const parsed = parseCsv(csv);
    if (parsed.length === 0) {
      setError(t("Paste a CSV with a header row and at least one campaign."));
      return;
    }

    const rows = [];
    for (let i = 0; i < parsed.length; i++) {
      const r = parsed[i];
      const keywords = (r.keywords ?? "")
        .split(/[,;]/)
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 10);
      const dmMessage = (r.dm_message ?? r.message ?? "").trim();
      if (keywords.length === 0 || !dmMessage) {
        setError(t("Row {row} is missing keywords or a message.", { row: i + 1 }));
        return;
      }
      rows.push({
        name: (r.name ?? "").trim(),
        keywords,
        dmMessage,
        publicReply: (r.public_reply ?? "").trim(),
        trackedUrl: (r.tracked_url ?? "").trim(),
        openingDmMessage: (r.opening_dm ?? "").trim(),
        openingDmButtonLabel: (r.opening_dm_button ?? "").trim(),
      });
    }

    try {
      window.localStorage.setItem(IMPORT_QUEUE_KEY, JSON.stringify(rows));
      if (selectedAccountId) {
        window.localStorage.setItem(IMPORT_ACCOUNT_KEY, selectedAccountId);
      }
    } catch {
      setError(t("Could not stage the import in this browser."));
      return;
    }
    router.push("/campaigns/new");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <div className="space-y-3">
        <Link
          href="/campaigns"
          className="-ml-1 inline-flex items-center gap-0.5 text-[15px] text-accent-text hover:opacity-75"
        >
          <ChevronLeft aria-hidden strokeWidth={2.2} className="size-[18px]" />
          {t("Campaigns")}
        </Link>
        <h1 className="large-title">{t("Import campaigns")}</h1>
        <p className="text-[15px] leading-[22px] text-muted">
          {t("Paste a CSV with one row per campaign. Each row opens in the builder prefilled and editable, so you can review it and pick the reel before saving. Required columns are")}{" "}
          <Code>keywords</Code> {t("and")} <Code>dm_message</Code>
          {t(". Optional:")} <Code>name</Code>, <Code>public_reply</Code>,{" "}
          <Code>tracked_url</Code>, <Code>opening_dm</Code>,{" "}
          <Code>opening_dm_button</Code>
          {t(". Keywords go in one cell, separated by commas. Use")}{" "}
          <Code>{"{link}"}</Code> {t("in the message to insert the tracked link.")}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-[15px] text-error">
          {error}
        </p>
      )}

      {accounts.length > 1 && (
        <section>
          <div className="group overflow-visible">
            <div className="group-row justify-between">
              <span className="text-[15px]">{t("Instagram account")}</span>
              <AccountSelect
                accounts={accounts}
                value={selectedAccountId}
                onChange={setSelectedAccountId}
                includeAll={false}
              />
            </div>
          </div>
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between px-4 pb-1.5">
          <label htmlFor="import-csv" className="text-[13px] font-semibold text-muted">
            CSV
          </label>
          <button
            type="button"
            onClick={() => setCsv(SAMPLE)}
            className="btn-plain text-[13px]"
          >
            {t("Fill with a sample")}
          </button>
        </div>
        <div className="group p-1.5 transition-shadow focus-within:ring-2 focus-within:ring-accent/40">
          <textarea
            id="import-csv"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={SAMPLE}
            rows={10}
            spellCheck={false}
            className="block w-full resize-y rounded-[8px] bg-transparent px-2.5 py-2 font-mono text-[13px] leading-5 text-foreground placeholder:text-tertiary focus:outline-none focus-visible:outline-none"
          />
        </div>
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => router.push("/campaigns")}
          className="btn btn-secondary"
        >
          {t("Cancel")}
        </button>
        <button type="button" onClick={startImport} className="btn btn-primary">
          {t("Review and import")}
        </button>
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-[5px] bg-surface-2 px-1 py-px font-mono text-[13px] text-foreground">
      {children}
    </code>
  );
}
