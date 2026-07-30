"use client";

import { NodeIcon } from "./connected-inputs-card";
import { deriveShotType } from "@/lib/nodes/shot-types";

// The read-only Shot text pinned in the Prompt focus view's center column. The shot
// description is what the operator reads to decide Lens/Composition/Lighting, so it stays
// on screen while composing (never hidden behind a rail click). Purely presentational.
export function PromptShotReference({ label, text }: { label: string; text: string }) {
  const shotType = text.trim() ? deriveShotType(text) : undefined;

  return (
    <div className="flex shrink-0 flex-col gap-3 px-6 py-5">
      <div className="flex items-center gap-1.5">
        <NodeIcon type="shot" />
        <span className="text-eyebrow">{label || "Shot"}</span>
        {shotType && (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[0.6rem] font-semibold leading-none bg-muted text-muted-foreground">
            {shotType}
          </span>
        )}
      </div>
      <div className="max-h-56 overflow-y-auto rounded-xl border border-border bg-muted/20 p-4">
        {text.trim() ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{text}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No shot description yet — edit the Shot node.</p>
        )}
      </div>
    </div>
  );
}

// Empty state for the center column when no Shot is connected to this prompt.
export function PromptShotReferenceEmpty() {
  return (
    <div className="flex shrink-0 flex-col gap-3 px-6 py-5">
      <div className="flex items-center gap-1.5">
        <NodeIcon type="shot" />
        <span className="text-eyebrow">Shot</span>
      </div>
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border p-4">
        <p className="max-w-xs text-center text-sm text-muted-foreground">
          Connect a Shot to see its text and steer the camera &amp; lighting.
        </p>
      </div>
    </div>
  );
}
