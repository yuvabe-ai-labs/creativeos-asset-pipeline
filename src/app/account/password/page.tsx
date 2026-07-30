import { redirect } from "next/navigation";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { getUserWithRetry } from "@/lib/supabase/get-user-with-retry";
import { mapAppMetadataToMustChangePassword } from "@/lib/dal-logic";
import { ChangePasswordForm } from "./change-password-form";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Set a new password — CreativeOS" };

export default async function ChangePasswordPage() {
  const supabase = await createSSRServerClient();
  const user = await getUserWithRetry(supabase);
  if (!user) redirect("/login");
  if (!mapAppMetadataToMustChangePassword(user.app_metadata)) redirect("/");

  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-6 py-20">
      <Card className="w-full max-w-sm p-8 shadow-card">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Set a new password
        </h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Set a new password to continue.
        </p>
        <ChangePasswordForm />
      </Card>
    </main>
  );
}
