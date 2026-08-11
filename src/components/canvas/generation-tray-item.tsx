import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ImageIcon,
  Clapperboard,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TRAY_KIND_META, type TrayItem } from "@/lib/generation-tray";

// Status is icon-only (D142) — the word survives in title/aria-label so the row stays
// readable by screen reader and on hover. Every state has a distinct glyph SHAPE, so
// status is never encoded by color alone. Tones are globals.css tokens; the -text (700)
// variants are used because the 500s wash out against a white card.
const STATUS_META: Record<
  TrayItem["status"],
  { label: string; icon: LucideIcon; tone: string; spin?: boolean }
> = {
  running: { label: "Running", icon: Loader2, tone: "text-warning-text", spin: true },
  ready: { label: "Ready", icon: CheckCircle2, tone: "text-success-text" },
  failed: { label: "Failed", icon: AlertTriangle, tone: "text-destructive-text" },
};

// Two glyphs, not four: a shot's prompt and the output it produced share a track glyph and
// differ only in chip weight, so the rail's left edge scans as a pipeline. Both glyphs are
// the ones already on the corresponding node cards.
const TRACK_ICON: Record<"image" | "video", LucideIcon> = {
  image: ImageIcon,
  video: Clapperboard,
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
  const kind = TRAY_KIND_META[item.kind];
  const TrackIcon = TRACK_ICON[kind.track];
  const isOutput = kind.stage === "output";
  const isFailed = item.status === "failed";
  const accessibleName = `${item.shotLabel} · ${kind.label} — ${status.label}`;

  return (
    <Button
      variant="ghost"
      onClick={() => onOpen(item.nodeId)}
      title={accessibleName}
      aria-label={accessibleName}
      className={cn(
        "h-auto w-full justify-start gap-2.5 rounded-xl border px-3 py-3 text-left font-normal",
        // No shadow — the row sits inside an already-shadowed panel, where a second
        // shadow reads as mud. Inside a container, the border IS the elevation.
        "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px",
        isFailed
          ? "border-destructive/30 bg-destructive/10 hover:bg-destructive/15"
          : "border-border bg-card hover:bg-card",
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-lg",
          isOutput
            ? "bg-accent text-foreground"
            : "border border-border text-muted-foreground",
        )}
      >
        <TrackIcon className="size-3.5 stroke-[1.5]" />
      </span>
      <span className="flex-1 truncate text-sm text-foreground">
        {item.shotLabel} <span className="text-muted-foreground">·</span> {kind.label}
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
