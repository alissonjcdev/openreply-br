"use client";

import type { StaticMessageKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/provider";
import { useSearchParams } from "next/navigation";

type Tone = "error" | "warning" | "success";

// Status is carried by the title colour alone; the body stays secondary text.
const TONE_CLASSES: Record<Tone, string> = {
  error: "text-error",
  warning: "text-warning",
  success: "text-success",
};

const MESSAGES: Record<string, { tone: Tone; title: StaticMessageKey; detail: StaticMessageKey }> = {
  denied: {
    tone: "warning",
    title: "Instagram connection cancelled",
    detail:
      "You declined the permission prompt on Instagram. Start again and accept all requested permissions.",
  },
  invalid: {
    tone: "error",
    title: "Instagram connection expired",
    detail:
      "The login link was missing or older than 10 minutes. Click Connect Instagram to start a fresh attempt.",
  },
  forbidden: {
    tone: "error",
    title: "Not permitted",
    detail:
      "Only workspace owners and admins can connect an Instagram account.",
  },
  already_connected: {
    tone: "warning",
    title: "Account already connected",
    detail:
      "That Instagram account is connected to another workspace. Disconnect it there first, or connect a different account.",
  },
};

export function InstagramConnectNotice() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const status = searchParams.get("instagram");

  if (!status) return null;

  if (status === "misconfigured") {
    const missing = (searchParams.get("missing") ?? "")
      .split(",")
      .filter(Boolean);

    return (
      <Notice tone="error" title={t("Instagram app not configured")}>
        <p>
          {t("Set")}{" "}
          {missing.length > 0
            ? t("these environment variables")
            : t("the required environment variables")}{" "}
          {t("and restart the server:")}
        </p>
        {missing.length > 0 && (
          <ul className="mt-2 space-y-1">
            {missing.map((name) => (
              <li key={name} className="font-mono text-[12px] text-foreground">
                {name}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2">
          {t("See")} <span className="font-mono text-[12px] text-foreground">docs/setup.md</span> {t("for how to obtain each value. Note that")}{" "}
          <span className="font-mono text-[12px] text-foreground">ENCRYPTION_KEY</span> {t("must be a 64-character hex string.")}
        </p>
      </Notice>
    );
  }

  if (status === "failed") {
    const reason = searchParams.get("reason");

    return (
      <Notice tone="error" title={t("Instagram connection failed")}>
        <p>
          {t("Instagram accepted the login but the connection could not be completed. This is usually a mismatched redirect URI or an app that is missing the required permissions.")}
        </p>
        {reason && (
          <p className="mt-2 font-mono text-[12px] break-words">
            {reason}
          </p>
        )}
      </Notice>
    );
  }

  const known = MESSAGES[status];
  if (!known) return null;

  return (
    <Notice tone={known.tone} title={t(known.title)}>
      <p>{t(known.detail)}</p>
    </Notice>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" className="rounded-xl bg-surface px-4 py-3.5">
      <p className={`text-[15px] font-semibold ${TONE_CLASSES[tone]}`}>{title}</p>
      <div className="mt-1 text-[14px] leading-[20px] text-muted">{children}</div>
    </div>
  );
}
