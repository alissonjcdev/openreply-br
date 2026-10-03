import { EMAIL_PROVIDER_ID, signIn } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getCampaignTemplate } from "@/lib/templates/campaign-templates";
import { DemoNotice } from "@/components/demo-notice";
import { isPublicDemoHost } from "@/lib/env";

const GITHUB_URL = "https://github.com/diwenne/openreply";
const SETUP_DOCS_URL = `${GITHUB_URL}/blob/main/docs/setup.md`;

export async function generateMetadata() {
  const { t } = await getI18n();
  return {
    title: t("Login - OpenReply"),
    description: t("Sign in to manage Instagram comment-to-DM campaigns."),
  };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    checkEmail?: string;
    callbackUrl?: string;
    template?: string;
  }>;
}) {
  const { t } = await getI18n();
  if (await isPublicDemoHost()) {
    return (
      <main className="flex min-h-[calc(100dvh-3rem)] items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[380px] text-center">
          <p className="text-[15px] font-semibold tracking-[-0.02em] text-muted">OpenReply</p>
          <h1 className="large-title mt-2">{t("Sign-in is off on this demo")}</h1>
          <p className="mt-3 text-balance text-[15px] leading-[22px] text-muted">
            {t("This is the public demo — it doesn’t create real accounts or send DMs. To use OpenReply for real, clone it and run your own instance with your own Meta app and domain.")}
          </p>
          <a
            href={SETUP_DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary btn-lg mt-8 w-full"
          >
            {t("Clone it yourself")} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </main>
    );
  }

  const params = await searchParams;
  const checkEmail = params.checkEmail === "1";
  const selectedTemplate = getCampaignTemplate(params.template);
  const templateCallbackUrl = selectedTemplate
    ? `/campaigns/new?template=${selectedTemplate.slug}`
    : null;
  const callbackUrl = params.callbackUrl ?? templateCallbackUrl ?? "/dashboard";

  async function sendMagicLink(formData: FormData) {
    "use server";
    await signIn(EMAIL_PROVIDER_ID, {
      email: String(formData.get("email") ?? ""),
      redirectTo: callbackUrl,
    });
  }

  return (
    <main className="flex min-h-[calc(100dvh-3rem)] items-center justify-center px-6 pb-16">
      <div className="w-full max-w-[360px]">
        <DemoNotice variant="panel" />

        <div className="text-center">
          <p className="text-[15px] font-semibold tracking-[-0.02em] text-muted">OpenReply</p>
          <h1 className="large-title mt-2">
            {checkEmail ? t("Check your email") : t("Sign in to OpenReply")}
          </h1>
          <p className="mt-2 text-balance text-[15px] leading-[22px] text-muted">
            {checkEmail
              ? t("We sent you a secure sign-in link. Open it on this device to continue.")
              : selectedTemplate
                ? t("Sign in to use the {name} template.", { name: selectedTemplate.title })
                : t("Sign in by email, then connect your Instagram professional account.")}
          </p>
        </div>

        {!checkEmail && (
          <>
            {selectedTemplate && (
              <div className="group mt-8">
                <div className="group-row">
                  <span className="text-[15px] text-muted">{t("Template selected")}</span>
                  <span className="ml-auto truncate text-[15px] font-medium">{selectedTemplate.title}</span>
                </div>
              </div>
            )}

            <form action={sendMagicLink} className={selectedTemplate ? "mt-4" : "mt-8"}>
              <label htmlFor="email" className="sr-only">
                {t("Work email")}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder={t("Work email")}
                className="field min-h-[44px] px-3.5 text-[17px]"
              />
              <button type="submit" className="btn btn-primary btn-lg mt-4 w-full">
                {t("Email me a magic link")}
              </button>
            </form>
            <p className="footnote mt-4 text-center text-balance">
              {t("No password needed. We email you a link to sign in.")}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
