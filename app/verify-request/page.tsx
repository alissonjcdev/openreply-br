import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";

export async function generateMetadata() {
  const { t } = await getI18n();
  return {
    title: t("Check your email - OpenReply"),
    description: t("A sign-in link was sent to your email."),
  };
}

export default async function VerifyRequestPage() {
  const { t } = await getI18n();
  return (
    <main className="flex min-h-[calc(100dvh-3rem)] items-center justify-center px-6 pb-16">
      <div className="w-full max-w-[360px] text-center">
        <p className="text-[15px] font-semibold tracking-[-0.02em] text-muted">OpenReply</p>
        <h1 className="large-title mt-2">{t("Check your email")}</h1>
        <p className="mt-2 text-balance text-[15px] leading-[22px] text-muted">
          {t("We sent you a secure sign-in link. Open it on this device to continue.")}
        </p>
        <Link href="/login" className="btn btn-secondary btn-lg mt-8 w-full">
          {t("Back to sign in")}
        </Link>
      </div>
    </main>
  );
}
