import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONES = {
  bad: "border-destructive/30 bg-destructive/10 text-destructive-text",
  warn: "border-warning/60 bg-warning/15 text-warning-text",
  ok: "border-success/45 bg-success/10 text-success-text",
  plain: "bg-muted text-muted-foreground",
} as const;

/** The agencies list's small status tag: an issue, or a billing state. A dot marks a live plan. */
export function AgencyTag({ tone, children, dot = false }: { tone: keyof typeof TONES; children: React.ReactNode; dot?: boolean }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", TONES[tone])}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </Badge>
  );
}
