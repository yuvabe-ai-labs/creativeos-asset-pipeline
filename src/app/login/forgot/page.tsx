import { Card } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Forgot password — CreativeOS" };

// D598. Outside the session proxy (src/proxy.ts skips every /login path): whoever asks is signed out.
export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { email } = await searchParams;
  return (
    <main className="login-surface flex flex-1 items-center justify-center p-6">
      <Card className="flex w-full max-w-md flex-col gap-6 p-8 shadow-card">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Forgot password</h1>
          <p className="text-sm text-muted-foreground">
            Enter the email you sign in with and we&apos;ll send you a link to set a new password.
          </p>
        </div>
        <ForgotPasswordForm email={typeof email === "string" ? email.slice(0, 320) : ""} />
      </Card>
    </main>
  );
}
