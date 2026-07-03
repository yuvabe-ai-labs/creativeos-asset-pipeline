"use client";

import { useState, type ReactNode } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TraceVersion } from "@/lib/eval/node-traces";
import { OutputRenderer } from "./output-renderer";
import { ModelRequestPanel } from "@/components/nodes/model-request-panel";

type Decision = "pass" | "fail" | null;

function Panel({ eyebrow, children }: { eyebrow: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3"><span className="text-eyebrow">{eyebrow}</span></div>
      {children}
    </section>
  );
}

// Open coding only (spec §3): Good/Bad + a free note. Keyed by versionId in the
// parent so the note draft resets when the viewed version changes.
function OpenCoding({
  decision, note, onLabel,
}: {
  decision: Decision;
  note: string;
  onLabel: (decision: Decision, note: string) => void;
}) {
  const [draft, setDraft] = useState(note);
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3"><span className="text-eyebrow">D · Open coding</span></div>
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => onLabel(decision === "pass" ? null : "pass", draft)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
            decision === "pass" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          <ThumbsUp className="size-4" strokeWidth={1.5} /> Good
        </button>
        <button
          type="button"
          onClick={() => onLabel(decision === "fail" ? null : "fail", draft)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
            decision === "fail" ? "border-red-300 bg-red-50 text-red-700" : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          <ThumbsDown className="size-4" strokeWidth={1.5} /> Bad
        </button>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== note) onLabel(decision, draft); }}
        placeholder="note (open code) — why did it pass / fail?"
        className="min-h-16 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </section>
  );
}

export function TraceDetail({
  version, onLabel,
}: {
  version: TraceVersion;
  onLabel: (versionId: string, decision: Decision, note: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Panel eyebrow="A · Input">
          {(version.input.images ?? []).length > 0 && (
            <div className="mb-2"><OutputRenderer slot={{ kind: "image", urls: version.input.images }} /></div>
          )}
          <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{version.input.text || "—"}</p>
        </Panel>
        <Panel eyebrow="C · Output">
          <OutputRenderer slot={version.output} />
        </Panel>
      </div>

      {version.request && <ModelRequestPanel request={version.request} />}

      <OpenCoding
        key={version.versionId}
        decision={version.decision}
        note={version.note ?? ""}
        onLabel={(d, n) => onLabel(version.versionId, d, n)}
      />
    </div>
  );
}
