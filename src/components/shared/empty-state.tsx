import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

// Consolidates the near-identical inline empty cards. The body line explains what the
// thing *is* — an empty state that only labels the absence teaches nothing, and this is
// the highest-intent teaching surface a new user sees (D102).
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="animate-rise flex flex-col items-center justify-center gap-3 border-dashed p-14 text-center">
      <p className="font-display text-lg font-medium">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}
