import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { text: string; className: string }> = {
  live: { text: "Live", className: "gap-1.5 border-success/45 bg-success/10 text-success-text" },
  draft: { text: "Draft", className: "border-warning/60 bg-warning/15 text-warning-text" },
  hidden: { text: "Hidden", className: "bg-muted text-muted-foreground" },
  retired: { text: "Retired", className: "border-dashed bg-card text-muted-foreground" },
};

/** A model's status as the admin pages show it: Live, Draft, Hidden or Retired. `text` replaces the word ("Live now"). */
export function ModelStatusBadge({ status, text, className }: { status: string; text?: string; className?: string }) {
  const s = STATUS[status] ?? { text: status, className: "" };
  return (
    <Badge variant="outline" className={cn("font-medium", s.className, className)}>
      {status === "live" && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {text ?? s.text}
    </Badge>
  );
}
