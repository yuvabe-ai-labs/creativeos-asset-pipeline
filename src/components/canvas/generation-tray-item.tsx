import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrayItem } from "@/lib/generation-tray";

const STATUS_META: Record<
  TrayItem["status"],
  { label: string; icon: typeof Loader2; tone: string; spin?: boolean }
> = {
  running: { label: "Running", icon: Loader2, tone: "text-primary", spin: true },
  ready:   { label: "Ready",   icon: CheckCircle2, tone: "text-primary" },
  failed:  { label: "Failed",  icon: AlertTriangle, tone: "text-muted-foreground" },
};

export function GenerationTrayItem({
  item,
  onOpen,
}: {
  item: TrayItem;
  onOpen: (nodeId: string) => void;
}) {
  const meta = STATUS_META[item.status];
  const Icon = meta.icon;
  const assetLabel = item.assetType === "image" ? "Image" : "Video";
  return (
    <button
      onClick={() => onOpen(item.nodeId)}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left",
        "shadow-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0 stroke-[1.5]", meta.tone, meta.spin && "animate-spin")} />
      <span className="flex-1 truncate text-xs font-medium text-foreground">
        {item.shotLabel} · {assetLabel}
      </span>
      <span className="text-eyebrow !text-[0.6rem] text-muted-foreground">{meta.label}</span>
    </button>
  );
}
