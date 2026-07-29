import { LoginForm } from "./login-form";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Sign in — CreativeOS" };

export default function LoginPage() {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center px-6 py-20">
      <Card className="w-full max-w-sm p-8 shadow-card">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 mb-6 text-sm text-muted-foreground">
          Welcome back to CreativeOS.
        </p>
        <LoginForm />
      </Card>
    </main>
  );
}
