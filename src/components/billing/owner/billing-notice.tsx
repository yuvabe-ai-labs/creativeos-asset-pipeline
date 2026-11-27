import type { ReactNode } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const ICON = { bad: "text-destructive-text", warn: "text-warning-text", ok: "text-primary" } as const;

// The one notice at the top of the owner's Usage page (D595, D597): a due payment, a price to
// approve, credits running low, free credits ending, a managed limit close. A line that says what
// happened, one that says what to do, and at most one action.
export function BillingNotice({
  tone,
  title,
  children,
  action,
}: {
  tone: "bad" | "warn" | "ok";
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const Icon = tone === "ok" ? CircleCheck : TriangleAlert;
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-card"
    >
      <div className="flex min-w-0 flex-1 basis-64 items-start gap-2">
        <Icon className={cn("mt-0.5 size-4 shrink-0", ICON[tone])} strokeWidth={1.5} aria-hidden />
        <div className="flex min-w-0 flex-col gap-1">
          <span className={cn("text-sm", children ? "font-medium" : "")}>{title}</span>
          {children && <div className="text-sm text-muted-foreground">{children}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}
