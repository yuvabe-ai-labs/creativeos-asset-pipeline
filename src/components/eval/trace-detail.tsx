"use client";

import { useState, type ReactNode } from "react";
import { ThumbsUp, ThumbsDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NodeTrace } from "@/lib/eval/node-traces";
import { diffVersions } from "@/lib/eval/diff-versions";
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
  trace, versionIx, onStep, onLabel,
}: {
  trace: NodeTrace;
  versionIx: number;
  onStep: (ix: number) => void;
  onLabel: (versionId: string, decision: Decision, note: string) => void;
}) {
  const n = trace.versions.length;
  const ix = Math.min(Math.max(versionIx, 0), n - 1);
  const version = trace.versions[ix];
  const prev = trace.versions[ix + 1]; // versions are newest → oldest; +1 is the older attempt
  const delta = prev ? diffVersions(prev, version) : null;
  const vNum = (i: number) => n - i; // index → human version number

  return (
    <div className="space-y-4">
      {n > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs">
            <button type="button" disabled={ix >= n - 1} onClick={() => onStep(ix + 1)} className="disabled:opacity-30" title="Older">
              <ChevronLeft className="size-4" strokeWidth={1.5} />
            </button>
            <span>v{vNum(ix)} <span className="text-muted-foreground">of {n}</span></span>
            <button type="button" disabled={ix <= 0} onClick={() => onStep(ix - 1)} className="disabled:opacity-30" title="Newer">
              <ChevronRight className="size-4" strokeWidth={1.5} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {trace.versions.map((v, i) => (
              <button
                key={v.versionId}
                type="button"
                onClick={() => onStep(i)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem]",
                  i === ix ? "border-primary bg-primary/8 font-medium text-primary" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {v.decision === "pass" && <span className="text-emerald-600">✓</span>}
                {v.decision === "fail" && <span className="text-red-600">✕</span>}
                v{vNum(i)}
              </button>
            ))}
          </div>
        </div>
      )}

      {delta && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <p className="text-eyebrow mb-1 text-primary">Δ vs v{vNum(ix + 1)} — what changed</p>
          {delta.reroll ? (
            <p className="text-xs text-amber-700">Re-roll — same request, output moved (model nondeterminism).</p>
          ) : (
            <ul className="space-y-0.5 text-xs">
              {delta.changes.map((c) => (
                <li key={c.field}>
                  <b>{c.field}</b>: <span className="text-muted-foreground line-through">{c.from || "∅"}</span> → <span className="text-emerald-700">{c.to || "∅"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
        onLabel={(d, note) => onLabel(version.versionId, d, note)}
      />
    </div>
  );
}
