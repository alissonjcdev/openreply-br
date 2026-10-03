import { describe, expect, it } from "vitest";
import { magicLinkEmail } from "../lib/auth-email";

describe("magic-link e-mail", () => {
  it("is written in Brazilian Portuguese and carries the sign-in link", () => {
    const url = "https://app.example.com/api/auth/callback/resend?token=a&email=b";
    const { subject, text, html } = magicLinkEmail({ url, host: "app.example.com" });
    expect(subject).toBe("Seu link de acesso ao OpenReply");
    expect(text).toContain(url);
    expect(text).toContain("Se você não pediu este e-mail");
    expect(html).toContain('href="https://app.example.com/api/auth/callback/resend?token=a&amp;email=b"');
    expect(html).toContain("Entrar no OpenReply");
  });

  it("escapes the link and host in the HTML body", () => {
    const { html } = magicLinkEmail({ url: 'https://x.test/"><script>', host: "x.test" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });
});
