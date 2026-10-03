"use client";

import { useI18n } from "@/lib/i18n/provider";
import { useSyncExternalStore } from "react";
import { DEMO_HOST } from "@/lib/env";

const DISMISS_KEY = "openreply:demo-notice-dismissed";
const SETUP_DOCS_URL =
  "https://github.com/diwenne/openreply/blob/main/docs/setup.md";

/// Module-level so both variants agree, and so dismissing survives a
/// client-side navigation between the landing page and the login page.
let dismissed: boolean | null = null;
let listeners: Array<() => void> = [];

function isDismissed(): boolean {
  if (dismissed === null) {
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Storage can throw in private modes. Showing the notice is the safe side.
      dismissed = false;
    }
  }
  return dismissed;
}

function subscribe(onChange: () => void) {
  listeners.push(onChange);
  return () => {
    listeners = listeners.filter((listener) => listener !== onChange);
  };
}

/// The host is only knowable in the browser, so the server snapshot is always
/// false. Rendering on the server instead would flash the notice onto every
/// instance that is not the demo.
function getSnapshot(): boolean {
  return window.location.hostname === DEMO_HOST && !isDismissed();
}

function getServerSnapshot(): boolean {
  return false;
}

function dismiss() {
  dismissed = true;
  try {
    window.localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Dismissal simply does not persist if storage is unavailable.
  }
  for (const listener of listeners) listener();
}

export function DemoNotice({ variant }: { variant: "banner" | "panel" }) {
  const { t } = useI18n();
  const visible = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  if (!visible) return null;

  if (variant === "banner") {
    return (
      <div className="material relative border-b border-border">
        <p className="mx-auto w-full max-w-6xl px-10 py-2 text-center text-[12px] leading-[18px] text-muted sm:px-14 sm:text-[13px]">
          <span className="font-semibold text-foreground">{DEMO_HOST}</span> {t("is a demo. OpenReply is self-hosted — signing in here will not send DMs for your account.")}{" "}
          <a
            href={SETUP_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent-text hover:underline"
          >
            {t("Deploy your own copy")}
          </a>
          .
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("Dismiss demo notice")}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted transition hover:text-foreground sm:right-4"
        >
          <DismissIcon />
        </button>
      </div>
    );
  }

  return (
    <div className="relative mb-8 rounded-xl bg-surface px-4 py-3.5 pr-10 text-left">
      <p className="text-[15px] font-semibold text-warning">{DEMO_HOST} {t("is a demo instance.")}</p>
      <p className="mt-1 text-[14px] leading-[20px] text-muted">
        {t("Signing in here will not send DMs for your Instagram account. OpenReply is self-hosted, so it only works on a deployment you run yourself, with your own Meta app and your own domain.")}{" "}
        <a
          href={SETUP_DOCS_URL}
          target="_blank"
          rel="noreferrer"
          className="text-accent-text hover:underline"
        >
          {t("Read the setup guide")}
        </a>
        .
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("Dismiss demo notice")}
        className="absolute right-1.5 top-1.5 rounded-full p-2 text-tertiary transition-colors hover:text-foreground"
      >
        <DismissIcon />
      </button>
    </div>
  );
}

function DismissIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5 stroke-current"
      fill="none"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M3 3l10 10M13 3L3 13" />
    </svg>
  );
}
