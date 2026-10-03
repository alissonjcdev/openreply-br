import { createTransport } from "nodemailer";

/**
 * Magic-link e-mail in Brazilian Portuguese, the default interface language.
 * Replaces the English Auth.js template for both the Resend and SMTP
 * transports.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function magicLinkEmail({ url, host }: { url: string; host: string }) {
  // A zero-width space stops mail clients from auto-linking the host name,
  // which would look like the link to click.
  const safeHost = escapeHtml(host).replace(/\./g, "&#8203;.");
  const safeUrl = escapeHtml(url);
  const subject = "Seu link de acesso ao OpenReply";
  const text = [
    "Use o link abaixo para entrar no OpenReply:",
    url,
    "",
    "O link expira em 24 horas e só pode ser usado uma vez.",
    "Se você não pediu este e-mail, pode ignorá-lo.",
    "",
  ].join("\n");
  const html = `<body style="background:#f6f6f6;margin:0;padding:24px 0;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:560px;margin:auto;background:#ffffff;border-radius:8px;">
    <tr>
      <td style="padding:32px 32px 8px;font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:bold;color:#111111;">
        Entrar no OpenReply
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 24px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#444444;">
        Clique no botão abaixo para acessar sua conta em ${safeHost}.
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 24px;">
        <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:12px 20px;border-radius:6px;background:#111111;color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none;">Entrar no OpenReply</a>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 32px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#777777;">
        O link expira em 24 horas e só pode ser usado uma vez. Se você não pediu este e-mail, pode ignorá-lo.
      </td>
    </tr>
  </table>
</body>`;
  return { subject, text, html };
}

type VerificationParams = {
  identifier: string;
  url: string;
  provider: { from?: string; apiKey?: string; server?: unknown };
};

export async function sendMagicLinkViaResend({ identifier, url, provider }: VerificationParams) {
  const { subject, text, html } = magicLinkEmail({ url, host: new URL(url).host });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: provider.from, to: identifier, subject, html, text }),
  });
  if (!res.ok) {
    throw new Error("Resend error: " + JSON.stringify(await res.json()));
  }
}

export async function sendMagicLinkViaSmtp({ identifier, url, provider }: VerificationParams) {
  const { subject, text, html } = magicLinkEmail({ url, host: new URL(url).host });
  const transport = createTransport(provider.server as Parameters<typeof createTransport>[0]);
  const result = await transport.sendMail({ to: identifier, from: provider.from, subject, text, html });
  const failed = [...(result.rejected ?? []), ...(result.pending ?? [])].filter(Boolean);
  if (failed.length) {
    throw new Error(`Email (${failed.join(", ")}) could not be sent`);
  }
}
