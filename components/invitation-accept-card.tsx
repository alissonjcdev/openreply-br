"use client";

import { useI18n } from "@/lib/i18n/provider";
import { useState } from "react";

interface InvitationAcceptCardProps {
  token: string;
  isSignedIn: boolean;
  invitedEmail: string;
}

export default function InvitationAcceptCard({
  token,
  isSignedIn,
  invitedEmail,
}: InvitationAcceptCardProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function acceptInvite() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/workspace/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const payload = await response.json();
    if (payload.success) {
      window.location.assign("/dashboard");
      return;
    }
    setMessage(payload.error ?? t("Could not accept invitation"));
    setBusy(false);
  }

  if (!isSignedIn) {
    return (
      <a
        href="/login"
        className="btn btn-primary btn-lg w-full"
      >
        {t("Sign in to accept")}
      </a>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={acceptInvite}
        disabled={busy}
        className="btn btn-primary btn-lg w-full"
      >
        {busy ? t("Accepting...") : t("Accept invitation")}
      </button>
      {message && <p role="alert" className="mt-3 text-[14px] text-error">{message}</p>}
      <p className="footnote mt-4">
        {t("Use the magic link account for")} {invitedEmail}.
      </p>
    </div>
  );
}

