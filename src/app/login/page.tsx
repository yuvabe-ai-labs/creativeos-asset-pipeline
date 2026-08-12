import { LoginForm } from "./login-form";
import { LoginPanel } from "./login-panel";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Sign in — CreativeOS" };

// The panel picks its photograph at render time, so this page must render per request.
// Without it Next would prerender the route at build and freeze one frame forever.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="grid w-full max-w-5xl overflow-hidden p-0 md:min-h-[34rem] md:grid-cols-2">
        <LoginPanel />

        <div className="flex flex-col justify-center px-8 py-12 sm:px-12">
          <p className="text-eyebrow text-[0.65rem] text-muted-foreground">Welcome back</p>
          <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight">
            Sign in
          </h1>
          <p className="mt-1 mb-8 text-sm text-muted-foreground">
            Continue to your studio.
          </p>

          <LoginForm />

          <p className="mt-10 text-xs text-muted-foreground/80">
            © {new Date().getFullYear()} Yuvabe Studios
          </p>
        </div>
      </Card>
    </main>
  );
}
