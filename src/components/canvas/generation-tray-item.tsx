import { Loader2, CheckCircle2, AlertTriangle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TRAY_KIND_META, type TrayItem } from "@/lib/generation-tray";

// Status is icon-only (D142) — the word survives in title/aria-label so the row stays
// readable by screen reader and on hover. Every state has a distinct glyph SHAPE, so
// status is never encoded by color alone, which is what lets the tones come from the
// design comp (--gen-*) rather than the higher-contrast semantic 700s. See globals.css.
const STATUS_META: Record<
  TrayItem["status"],
  { label: string; icon: LucideIcon; tone: string; spin?: boolean }
> = {
  running: { label: "Running", icon: Loader2, tone: "text-gen-running", spin: true },
  ready: { label: "Ready", icon: CheckCircle2, tone: "text-gen-ready" },
  failed: { label: "Failed", icon: AlertTriangle, tone: "text-gen-failed" },
};

export function GenerationTrayItem({
  item,
  onOpen,
}: {
  item: TrayItem;
  onOpen: (nodeId: string) => void;
}) {
  const status = STATUS_META[item.status];
  const StatusIcon = status.icon;
  // The label is the ONLY thing distinguishing an Image Prompt from a Motion Prompt, which
  // is why the kind derivation (D142) had to stop reading the job row's `type` column —
  // both prompt nodes write "prompt" there.
  const kind = TRAY_KIND_META[item.kind];
  const isFailed = item.status === "failed";
  const accessibleName = `${item.shotLabel} · ${kind.label} — ${status.label}`;

  return (
    <Button
      variant="ghost"
      onClick={() => onOpen(item.nodeId)}
      title={accessibleName}
      aria-label={accessibleName}
      className={cn(
        "h-auto w-full justify-between gap-3 rounded-lg border px-4 py-2.5 text-left font-semibold",
        // No shadow — the row sits inside an already-shadowed panel, where a second
        // shadow reads as mud. Inside a container, the border IS the elevation.
        "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px",
        isFailed
          ? "border-gen-failed/30 bg-gen-failed/5 hover:bg-gen-failed/10"
          : "border-border bg-card hover:bg-card",
      )}
    >
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {item.shotLabel}
        <span className="px-1.5 text-muted-foreground">·</span>
        {kind.label}
      </span>
      <StatusIcon
        className={cn(
          "size-[18px] shrink-0 stroke-[1.5]",
          status.tone,
          status.spin && "animate-spin",
        )}
      />
    </Button>
  );
}
