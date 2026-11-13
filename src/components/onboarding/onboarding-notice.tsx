import { Hourglass } from "lucide-react";
import { Card } from "@/components/ui/card";

export function OnboardingNotice({ orgName }: { orgName: string }) {
  return (
    <Card className="animate-rise mx-auto flex max-w-md flex-col items-center gap-3 p-10 text-center shadow-card">
      <Hourglass className="size-6 text-muted-foreground" strokeWidth={1.5} />
      <h1 className="font-display text-2xl font-semibold tracking-tight">You&apos;re being onboarded. Hang in there.</h1>
      <p className="text-sm text-muted-foreground">
        {orgName} is setting up your access. Your clients will appear here once it&apos;s ready.
      </p>
    </Card>
  );
}
