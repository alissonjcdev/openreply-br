import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import InvitationAcceptCard from "@/components/invitation-accept-card";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db/client";

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: t("Accept Workspace Invitation - OpenReply"),
    robots: { index: false, follow: false },
  };
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { t, label } = await getI18n();
  const { token } = await params;
  const [session, invitation] = await Promise.all([
    auth(),
    prisma.workspaceInvitation.findUnique({
      where: { token },
      include: {
        workspace: { select: { name: true } },
      },
    }),
  ]);

  if (!invitation || invitation.status !== "PENDING") {
    notFound();
  }

  const expired = invitation.expiresAt <= new Date();

  return (
    <main className="flex min-h-[calc(100dvh-3rem)] items-center justify-center bg-background px-6 pb-16 text-foreground">
      <div className="w-full max-w-[380px] text-center">
        <Link href="/" className="text-[15px] font-semibold tracking-[-0.02em] text-muted hover:text-foreground">
          OpenReply
        </Link>
        <p className="footnote mt-6">{t("Workspace invitation")}</p>
        <h1 className="large-title mt-1">
          {t("Join {workspace}", { workspace: invitation.workspace.name })}
        </h1>
        <p className="mt-2 text-balance text-[15px] leading-[22px] text-muted">
          {t("You were invited as {role} for {email}.", { role: label(invitation.role), email: invitation.email })}
        </p>
        <div className="mt-8">
          {expired ? (
            <p className="text-[15px] text-error">
              {t("This invitation has expired. Ask the workspace owner to resend it.")}
            </p>
          ) : (
            <InvitationAcceptCard
              token={token}
              isSignedIn={Boolean(session?.user?.id)}
              invitedEmail={invitation.email}
            />
          )}
        </div>
      </div>
    </main>
  );
}
