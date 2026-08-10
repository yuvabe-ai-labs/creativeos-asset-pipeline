"use client";

import { cn } from "@/lib/utils";
import type { NodeTrace, NodeAction } from "@/lib/eval/node-traces";

const GROUP_LABEL: Record<NodeAction, string> = {
  prompt: "Prompts", "image-gen": "Images", "video-gen": "Videos",
  "video-prompt": "Motion prompts", script: "Scripts",
};
const ORDER: NodeAction[] = ["prompt", "image-gen", "video-prompt", "video-gen", "script"];

function statusOf(t: NodeTrace): "pass" | "fail" | "pending" {
  const active = t.versions.find((v) => v.versionId === t.activeVersionId) ?? t.versions[0];
  return active?.decision ?? "pending";
}

export function ActionList({
  traces, selectedId, onSelect,
}: {
  traces: NodeTrace[];
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
}) {
  return (
    <div className="p-2">
      <div className="flex items-center justify-between px-2 pb-2">
        <span className="text-eyebrow">All generations</span>
        <span className="text-xs text-muted-foreground">{traces.length}</span>
      </div>
      {ORDER.map((action) => {
        const group = traces.filter((t) => t.action === action);
        if (group.length === 0) return null;
        return (
          <div key={action} className="mb-2">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">{GROUP_LABEL[action]}</span>
              <span className="text-[0.6rem] text-muted-foreground">{group.length}</span>
            </div>
            <ul className="space-y-1">
              {group.map((t) => {
                const status = statusOf(t);
                const active = t.nodeId === selectedId;
                return (
                  <li key={t.nodeId}>
                    <button
                      onClick={() => onSelect(t.nodeId)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                        active ? "border-primary bg-primary/8" : "border-border hover:bg-muted",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("truncate text-sm font-medium", active && "text-primary")}>{t.title}</span>
                        <span className={cn(
                          "size-2 shrink-0 rounded-full",
                          status === "pass" ? "bg-emerald-500" : status === "fail" ? "bg-red-500" : "bg-muted-foreground/40",
                        )} />
                      </div>
                      {t.versions.length > 1 && (
                        <span className="text-[0.65rem] text-muted-foreground">{t.versions.length} versions</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
