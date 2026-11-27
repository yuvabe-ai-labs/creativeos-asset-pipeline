import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";
import { LinkExpired } from "./link-expired";

// no-referrer: the token is in this page's URL and must not travel to anything it links to.
export const metadata: Metadata = { title: "Set a new password — CreativeOS", referrer: "no-referrer" };

// D598. Opening the page only shows the form: the token is checked and used up when the form is
// sent (resetPasswordAction), never here, because email link scanners open links before people
// do. Outside the session proxy (src/proxy.ts skips every /login path), so it works signed out,
// and signed in too: the link signs in whoever it belongs to when the form is sent.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token_hash: tokenHash } = await searchParams;
  return (
    <main className="login-surface flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md p-8 shadow-card">
        {typeof tokenHash === "string" && tokenHash ? <ResetPasswordForm tokenHash={tokenHash} /> : <LinkExpired />}
      </Card>
    </main>
  );
}
