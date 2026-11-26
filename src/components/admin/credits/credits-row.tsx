import { cn } from "@/lib/utils";

/** One row of the credit settings card: when on the left, what in the middle, an action or a date on the right. */
export function CreditsRow({
  icon,
  label,
  action,
  muted,
  children,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  action?: React.ReactNode;
  /** The "No change scheduled" row: a quieter label. */
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-1 items-center gap-x-5 gap-y-1.5 border-b border-border/60 px-4 py-4 text-sm md:grid-cols-[200px_minmax(0,1fr)_auto] md:px-5">
      <div className={cn("flex items-start gap-2", muted ? "text-muted-foreground" : "font-medium")}>
        <span className="mt-0.5 shrink-0">{icon}</span>
        {label}
      </div>
      <div>{children}</div>
      {action ? <div className="justify-self-start md:justify-self-end">{action}</div> : <div aria-hidden className="max-md:hidden" />}
    </div>
  );
}
