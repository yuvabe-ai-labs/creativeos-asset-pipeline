# Eval Viewer (error-analysis surface) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the eval viewer into a per-canvas, per-node error-analysis surface: list every generated node grouped by action, show a polymorphic **A input → C output** detail with the **B exact request** and **D open coding**, and (Phase B) walk a node's versions with a **Δ** that names what the human changed.

**Architecture:** A query + mapping generalization over the existing `node_versions` envelope (no migration) feeds a new list+detail client shell. A pure `mapNodeTraces` assembles typed traces (input/output slots + per-version request + version list); a pure `diffVersions` computes the Δ by structured field-compare (no LLM). UI reuses the built `ModelRequestPanel` (B) and `label-bar` (D), and the Yuvabe design system.

**Tech Stack:** Next.js App Router, TypeScript, Supabase JS, vitest, React client components, Tailwind v4 + shadcn (Base UI), Lucide.

## Global Constraints

- **No migration.** All data reads from existing columns (`inputs_used` incl. `.request`, `params_used`, `generated_output`, `output`, `decision`, `note`). Verbatim from spec §5.
- **Open coding only** (spec §3): writes `decision`/`note` via the existing `setVersionLabelAction`. **No failure tags.** **Do not touch `approval_status`** (D29/D34 — a separate axis).
- **Δ is a structured field-compare — no LLM, no diff engine** for detecting *which* field changed (spec §4.5).
- **"Generated node"** = `prompt` · `image-gen` · `video-prompt` · `video-gen` · `script`. Exclude `text`/`note`/`file`/`draw`/`shot` (spec §4.2).
- **Reuse:** `ModelRequestPanel` (B), `label-bar` (D), `setVersionLabelAction`. Yuvabe system: neutral-led, `.text-eyebrow`, `shadow-card`, purple sparingly, Lucide 1.5.
- **Tests:** `npx vitest run <file>` for units; `npx tsc --noEmit` must stay clean.

---

## File Structure

- **Create** `src/lib/eval/node-traces.ts` — trace types (`Modality`, `NodeAction`, `TraceVersion`, `NodeTrace`) + pure `mapNodeTraces`.
- **Create** `src/lib/eval/node-traces.test.ts` — unit tests.
- **Modify** `src/lib/db/eval.ts` — add `listNodeTraces(canvasId)` (all generated types, all versions per node).
- **Create** `src/components/eval/output-renderer.tsx` — polymorphic renderer (text/image/video/structured), used by A and C.
- **Create** `src/components/eval/trace-detail.tsx` — composes A / C / B (`ModelRequestPanel`) / D (`label-bar`) for the selected version.
- **Create** `src/components/eval/action-list.tsx` — the trace list grouped by action.
- **Create** `src/components/eval/eval-workbench.tsx` — client shell: list + detail, selection state.
- **Modify** `src/app/eval/[canvasId]/page.tsx` — swap to `listNodeTraces` + `<EvalWorkbench>`.
- **Phase B — Create** `src/lib/eval/diff-versions.ts` + `.test.ts` — the Δ field-compare.
- **Phase B — Modify** `src/components/eval/trace-detail.tsx` + `eval-workbench.tsx` — version stepper + Δ banner.
- **Modify** `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` — append ADR **D94** to §7.

The existing sequential components (`review-screen.tsx`, `trace-panels.tsx`) are left in place (dead after the page swap); removing them is out of scope for this plan.

---

# PHASE A — Generalized viewer (active version)

## Task A1: Typed trace model + `mapNodeTraces` (pure, TDD)

**Files:**
- Create: `src/lib/eval/node-traces.ts`
- Test: `src/lib/eval/node-traces.test.ts`

**Interfaces:**
- Produces:
  - `type NodeAction = "prompt" | "image-gen" | "video-prompt" | "video-gen" | "script"`
  - `type Modality = "text" | "image" | "video" | "structured"`
  - `type TraceVersion` and `type NodeTrace` (below)
  - `GENERATED_TYPES: NodeAction[]`
  - `mapNodeTraces(nodes: TraceNodeRow[], versions: TraceVersionRow[]): NodeTrace[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/eval/node-traces.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapNodeTraces, GENERATED_TYPES } from "@/lib/eval/node-traces";

const promptNode = { id: "n1", type: "prompt", data: { evalKey: "s22-shot2" }, active_version_id: "v2" };
const imageNode  = { id: "n2", type: "image-gen", data: { title: "s22 image" }, active_version_id: "iv1" };
const textNode   = { id: "n3", type: "text", data: {}, active_version_id: "tv1" }; // excluded

const v1 = { id: "v1", node_id: "n1", created_at: "2026-07-01T10:00:00Z",
  inputs_used: { shotText: "wide shot", request: { systemPrompt: "SYS", compiledUser: "U1", attachments: [], effectiveInstruction: "go" } },
  params_used: { instruction: "", controls: { lens: "auto" }, promptVersion: "2" },
  generated_output: "85mm portrait", output: "85mm portrait", decision: "fail", note: "lens" };
const v2 = { id: "v2", node_id: "n1", created_at: "2026-07-01T11:00:00Z",
  inputs_used: { shotText: "wide shot", request: { systemPrompt: "SYS", compiledUser: "U2", attachments: [], effectiveInstruction: "wide" } },
  params_used: { instruction: "wide", controls: { lens: "wide-24" }, promptVersion: "2" },
  generated_output: "24mm wide", output: "24mm wide", decision: null, note: null };
const iv1 = { id: "iv1", node_id: "n2", created_at: "2026-07-01T12:00:00Z",
  inputs_used: { request: { systemPrompt: "S", compiledUser: "prompt text", attachments: ["https://cdn/ref.png"], effectiveInstruction: "" } },
  params_used: {}, generated_output: "https://cdn/out.png", output: "https://cdn/out.png", decision: "pass", note: null };

describe("mapNodeTraces", () => {
  it("groups versions under their node, newest first, and excludes content nodes", () => {
    const traces = mapNodeTraces([promptNode, imageNode, textNode], [v1, v2, iv1]);
    expect(traces.map((t) => t.nodeId)).toEqual(["n1", "n2"]); // text node dropped
    const prompt = traces[0];
    expect(prompt.action).toBe("prompt");
    expect(prompt.title).toBe("s22-shot2");
    expect(prompt.activeVersionId).toBe("v2");
    expect(prompt.versions.map((v) => v.versionId)).toEqual(["v2", "v1"]); // newest → oldest
  });

  it("builds a text output for prompt nodes and an image output (urls) for image-gen", () => {
    const traces = mapNodeTraces([promptNode, imageNode], [v2, iv1]);
    expect(traces[0].versions[0].output).toEqual({ kind: "text", text: "24mm wide" });
    expect(traces[1].versions[0].output).toEqual({ kind: "image", urls: ["https://cdn/out.png"] });
  });

  it("carries the input (shot text + attachment images), the request, and the Δ fields", () => {
    const [prompt, image] = mapNodeTraces([promptNode, imageNode], [v2, iv1]);
    expect(prompt.versions[0].input).toEqual({ text: "wide shot", images: [] });
    expect(image.versions[0].input.images).toEqual(["https://cdn/ref.png"]);
    expect(prompt.versions[0].request?.compiledUser).toBe("U2");
    expect(prompt.versions[0].controls).toEqual({ lens: "wide-24" });
    expect(prompt.versions[0].instruction).toBe("wide");
    expect(prompt.versions[0].decision).toBe(null);
  });

  it("exposes the generated-type allowlist", () => {
    expect(GENERATED_TYPES).toContain("prompt");
    expect(GENERATED_TYPES).not.toContain("text");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/eval/node-traces.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/lib/eval/node-traces.ts`:

```ts
import type { ModelRequestRecord } from "@/lib/nodes/model-request";

export type NodeAction = "prompt" | "image-gen" | "video-prompt" | "video-gen" | "script";
export type Modality = "text" | "image" | "video" | "structured";

export const GENERATED_TYPES: NodeAction[] = ["prompt", "image-gen", "video-prompt", "video-gen", "script"];

// Which modality a node type's OUTPUT is.
const OUTPUT_KIND: Record<NodeAction, Modality> = {
  prompt: "text", "video-prompt": "text", script: "structured",
  "image-gen": "image", "video-gen": "video",
};

export type TraceVersion = {
  versionId: string;
  createdAt: string;
  input: { text?: string; images?: string[] };
  output: { kind: Modality; text?: string; urls?: string[] };
  request: ModelRequestRecord | null;
  instruction?: string;
  controls?: Record<string, unknown> | null;
  kbSlices?: string[];
  upstream?: { nodeId: string; versionId: string }[];
  promptVersion?: string;
  decision: "pass" | "fail" | null;
  note: string | null;
};

export type NodeTrace = {
  nodeId: string;
  action: NodeAction;
  title: string;
  activeVersionId: string | null;
  versions: TraceVersion[]; // newest → oldest
};

export type TraceNodeRow = {
  id: string;
  type: string;
  data: Record<string, unknown> | null;
  active_version_id: string | null;
};
export type TraceVersionRow = {
  id: string;
  node_id: string;
  created_at: string;
  inputs_used: Record<string, unknown> | null;
  params_used: Record<string, unknown> | null;
  generated_output: unknown;
  output: unknown;
  decision: unknown;
  note: unknown;
};

function str(v: unknown): string | undefined { return typeof v === "string" ? v : undefined; }
function strArr(v: unknown): string[] { return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; }

function toVersion(action: NodeAction, row: TraceVersionRow): TraceVersion {
  const inp = (row.inputs_used ?? {}) as Record<string, unknown>;
  const params = (row.params_used ?? {}) as Record<string, unknown>;
  const request = (inp.request ?? null) as ModelRequestRecord | null;
  const kind = OUTPUT_KIND[action];

  const text = str(row.generated_output) ?? str(row.output) ?? "";
  const output =
    kind === "text" || kind === "structured"
      ? { kind, text }
      : { kind, urls: str(row.output) ? [str(row.output)!] : [] };

  return {
    versionId: row.id,
    createdAt: row.created_at,
    input: { text: str(inp.shotText), images: request?.attachments ?? [] },
    output,
    request,
    instruction: str(params.instruction),
    controls: (params.controls ?? null) as Record<string, unknown> | null,
    kbSlices: strArr(inp.kbSlices),
    upstream: Array.isArray(inp.upstream) ? (inp.upstream as { nodeId: string; versionId: string }[]) : [],
    promptVersion: str(params.promptVersion),
    decision: row.decision === "pass" || row.decision === "fail" ? row.decision : null,
    note: str(row.note) ?? null,
  };
}

export function mapNodeTraces(nodes: TraceNodeRow[], versions: TraceVersionRow[]): NodeTrace[] {
  const generated = nodes.filter((n) => (GENERATED_TYPES as string[]).includes(n.type));
  const byNode = new Map<string, TraceVersionRow[]>();
  for (const v of versions) {
    (byNode.get(v.node_id) ?? byNode.set(v.node_id, []).get(v.node_id)!).push(v);
  }

  const traces: NodeTrace[] = [];
  for (const n of generated) {
    const action = n.type as NodeAction;
    const rows = (byNode.get(n.id) ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (rows.length === 0) continue;
    traces.push({
      nodeId: n.id,
      action,
      title: str(n.data?.evalKey) ?? str(n.data?.title) ?? n.id,
      activeVersionId: n.active_version_id,
      versions: rows.map((r) => toVersion(action, r)),
    });
  }
  return traces;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/eval/node-traces.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/eval/node-traces.ts src/lib/eval/node-traces.test.ts
git commit -m "feat(eval): typed node-trace model + mapNodeTraces (pure)"
```

---

## Task A2: `listNodeTraces` — the generalized query

**Files:**
- Modify: `src/lib/db/eval.ts`

**Interfaces:**
- Consumes: `mapNodeTraces`, `GENERATED_TYPES`, `NodeTrace` (Task A1).
- Produces: `listNodeTraces(canvasId: string): Promise<NodeTrace[]>` — all generated nodes on the canvas + **all** their versions.

- [ ] **Step 1: Add the query**

In `src/lib/db/eval.ts`, add (leave the existing `listEvalTraces` in place):

```ts
import { mapNodeTraces, GENERATED_TYPES, type NodeTrace, type TraceVersionRow } from "@/lib/eval/node-traces";

export type { NodeTrace } from "@/lib/eval/node-traces";

// The error-analysis dataset: every generated node on a canvas + ALL its versions
// (D4 "a node = one task"; D18 versions = attempts). Production later swaps the
// filter to a client. Pure shaping happens in mapNodeTraces.
export async function listNodeTraces(canvasId: string): Promise<NodeTrace[]> {
  const supabase = createServerSupabase();

  const { data: nodes, error: nErr } = await supabase
    .from("nodes")
    .select("id, type, data, active_version_id")
    .eq("canvas_id", canvasId)
    .in("type", GENERATED_TYPES);
  if (nErr) throw nErr;

  const nodeRows = (nodes ?? []) as { id: string; type: string; data: Record<string, unknown> | null; active_version_id: string | null }[];
  const nodeIds = nodeRows.map((n) => n.id);
  if (nodeIds.length === 0) return [];

  const { data: versions, error: vErr } = await supabase
    .from("node_versions")
    .select("id, node_id, created_at, inputs_used, params_used, generated_output, output, decision, note")
    .in("node_id", nodeIds);
  if (vErr) throw vErr;

  return mapNodeTraces(nodeRows, (versions ?? []) as TraceVersionRow[]);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, then in a browser/curl-authenticated session hit the eval canvas. (Or add a temporary `console.log` in the page — Task A6 — once wired.) Confirm the query returns the eval-canvas prompt nodes, each with its version list.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/eval.ts
git commit -m "feat(eval): listNodeTraces — all generated nodes + versions per canvas"
```

---

## Task A3: Polymorphic `OutputRenderer`

**Files:**
- Create: `src/components/eval/output-renderer.tsx`

**Interfaces:**
- Consumes: `Modality` (Task A1).
- Produces: `<OutputRenderer slot={{ kind: Modality; text?: string; urls?: string[] }} />` — renders text / image(s) / video / structured.

- [ ] **Step 1: Write the component**

Create `src/components/eval/output-renderer.tsx`:

```tsx
"use client";

import type { Modality } from "@/lib/eval/node-traces";

type Slot = { kind: Modality; text?: string; urls?: string[] };

// One renderer per modality — the type filter guarantees a homogeneous slot,
// so each branch stays single-purpose (spec §4.4).
export function OutputRenderer({ slot }: { slot: Slot }) {
  if (slot.kind === "image") {
    return (
      <div className="grid grid-cols-2 gap-2">
        {(slot.urls ?? []).map((u) => (
          <img key={u} src={u} alt="" className="w-full rounded-lg border border-border object-cover" />
        ))}
        {(slot.urls ?? []).length === 0 && <p className="text-xs text-muted-foreground">—</p>}
      </div>
    );
  }
  if (slot.kind === "video") {
    const url = (slot.urls ?? [])[0];
    return url ? (
      <video src={url} controls className="w-full rounded-lg border border-border" />
    ) : (
      <p className="text-xs text-muted-foreground">—</p>
    );
  }
  // text + structured
  return (
    <p className="max-h-72 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground">
      {slot.text || "—"}
    </p>
  );
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/eval/output-renderer.tsx
git commit -m "feat(eval): polymorphic OutputRenderer (text/image/video)"
```

---

## Task A4: `TraceDetail` — compose A / C / B / D for the active version

**Files:**
- Create: `src/components/eval/trace-detail.tsx`

**Interfaces:**
- Consumes: `NodeTrace`, `TraceVersion` (A1); `OutputRenderer` (A3); `ModelRequestPanel` (built); `LabelBar` (`src/components/eval/label-bar.tsx`, existing); `setVersionLabelAction` (`src/lib/actions/eval.ts`, existing).
- Produces: `<TraceDetail trace={NodeTrace} version={TraceVersion} onLabel={(versionId, decision, note) => void} />`.

- [ ] **Step 1: Confirm the LabelBar props**

Run: `sed -n '1,40p' src/components/eval/label-bar.tsx` (read its exported prop names). Use them verbatim in Step 2. (Expected: a `decision`/`note`/`onDecision`/`onNote`-style API — mirror it; if names differ, use the actual ones.)

- [ ] **Step 2: Write the component**

Create `src/components/eval/trace-detail.tsx`:

```tsx
"use client";

import { Aperture, Wand2, FileInput } from "lucide-react";
import type { NodeTrace, TraceVersion } from "@/lib/eval/node-traces";
import { OutputRenderer } from "./output-renderer";
import { ModelRequestPanel } from "@/components/nodes/model-request-panel";
import { LabelBar } from "./label-bar";

function Panel({ eyebrow, children }: { eyebrow: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3"><span className="text-eyebrow">{eyebrow}</span></div>
      {children}
    </section>
  );
}

export function TraceDetail({
  trace, version, onLabel,
}: {
  trace: NodeTrace;
  version: TraceVersion;
  onLabel: (versionId: string, decision: "pass" | "fail" | null, note: string) => void;
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

      <LabelBar
        decision={version.decision}
        note={version.note ?? ""}
        onSave={(decision, note) => onLabel(version.versionId, decision, note)}
      />
    </div>
  );
}
```

> **Adapt:** if `label-bar.tsx` exposes a different prop shape (checked in Step 1), match it here — the contract is "show the version's `decision`/`note`, and on change call back with the new `decision`/`note`". If wiring `LabelBar` cleanly is awkward, inline a minimal Good/Bad + note control instead (two buttons + a textarea) that calls `onLabel`.

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/eval/trace-detail.tsx
git commit -m "feat(eval): TraceDetail — A/C/B/D for a version"
```

---

## Task A5: `ActionList` — traces grouped by action

**Files:**
- Create: `src/components/eval/action-list.tsx`

**Interfaces:**
- Consumes: `NodeTrace`, `NodeAction` (A1).
- Produces: `<ActionList traces={NodeTrace[]} selectedId={string} onSelect={(nodeId) => void} />`.

- [ ] **Step 1: Write the component**

Create `src/components/eval/action-list.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";
import type { NodeTrace, NodeAction } from "@/lib/eval/node-traces";

const GROUP_LABEL: Record<NodeAction, string> = {
  prompt: "Prompts", "image-gen": "Images", "video-gen": "Videos",
  "video-prompt": "Video prompts", script: "Scripts",
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
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/components/eval/action-list.tsx
git commit -m "feat(eval): ActionList — traces grouped by action"
```

---

## Task A6: `EvalWorkbench` shell + wire the page

**Files:**
- Create: `src/components/eval/eval-workbench.tsx`
- Modify: `src/app/eval/[canvasId]/page.tsx`

**Interfaces:**
- Consumes: `NodeTrace` (A1), `ActionList` (A5), `TraceDetail` (A4), `setVersionLabelAction` (existing).
- Produces: `<EvalWorkbench traces={NodeTrace[]} />`; the page renders it from `listNodeTraces`.

- [ ] **Step 1: Write the workbench**

Create `src/components/eval/eval-workbench.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { NodeTrace } from "@/lib/eval/node-traces";
import { ActionList } from "./action-list";
import { TraceDetail } from "./trace-detail";
import { setVersionLabelAction } from "@/lib/actions/eval";

export function EvalWorkbench({ traces: initial }: { traces: NodeTrace[] }) {
  const [traces, setTraces] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.nodeId ?? null);

  const trace = traces.find((t) => t.nodeId === selectedId) ?? traces[0] ?? null;
  const version = trace ? (trace.versions.find((v) => v.versionId === trace.activeVersionId) ?? trace.versions[0]) : null;

  async function onLabel(versionId: string, decision: "pass" | "fail" | null, note: string) {
    // optimistic
    setTraces((prev) => prev.map((t) => ({
      ...t,
      versions: t.versions.map((v) => (v.versionId === versionId ? { ...v, decision, note: note || null } : v)),
    })));
    try {
      await setVersionLabelAction(versionId, { decision, note: note.trim() || null });
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    }
  }

  return (
    <div className="flex h-screen">
      <aside className="w-[300px] shrink-0 overflow-y-auto border-r border-border bg-background">
        <ActionList traces={traces} selectedId={selectedId} onSelect={setSelectedId} />
      </aside>
      <main className="min-h-0 flex-1 overflow-y-auto bg-neutral-50">
        <div className="mx-auto max-w-4xl px-8 py-6">
          {trace && version ? (
            <>
              <h1 className="mb-4 font-display text-2xl font-semibold tracking-tight">{trace.title}</h1>
              <TraceDetail trace={trace} version={version} onLabel={onLabel} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No generated nodes on this canvas yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Rewire the page**

Replace the body of `src/app/eval/[canvasId]/page.tsx` with:

```tsx
import { listNodeTraces } from "@/lib/db/eval";
import { EvalWorkbench } from "@/components/eval/eval-workbench";

export default async function EvalCanvasPage({ params }: { params: Promise<{ canvasId: string }> }) {
  const { canvasId } = await params;
  const traces = await listNodeTraces(canvasId);
  return <EvalWorkbench traces={traces} />;
}
```

> If the current page reads `params` synchronously (older signature), match its existing signature — only the data source (`listNodeTraces`) and the rendered component (`EvalWorkbench`) change.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`; open `/eval/6508a73f-...` (the eval-harness canvas). Expect: left list grouped under **Prompts** with the 20 shot nodes; selecting one shows **A input → C output**, the **B "Sent to model"** panel, and **D** Good/Bad + note. Mark one Good/Bad + note → reload → it persists.

- [ ] **Step 5: Full check + commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; all tests pass.

```bash
git add src/components/eval/eval-workbench.tsx "src/app/eval/[canvasId]/page.tsx"
git commit -m "feat(eval): list+detail workbench replaces the sequential reviewer"
```

---

## Task A7: Record ADR D94

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`

- [ ] **Step 1: Append D94 to §7** (after the D34 entry), copying the D94 block from the spec's §10 (`2026-07-02-eval-viewer-error-analysis-design.md`).

- [ ] **Step 2: Commit**

```bash
git add "docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md"
git commit -m "docs(adr): record D94 — eval viewer error-analysis surface"
```

**→ End of Phase A. The generalized viewer ships here (all node types, grouped, A/B/C/D on the active version, open coding). Phase B is additive.**

---

# PHASE B — Version Δ (walk a node's attempts)

## Task B1: `diffVersions` — structured field-compare (pure, TDD)

**Files:**
- Create: `src/lib/eval/diff-versions.ts`
- Test: `src/lib/eval/diff-versions.test.ts`

**Interfaces:**
- Consumes: `TraceVersion` (A1).
- Produces: `diffVersions(prev: TraceVersion, curr: TraceVersion): VersionDelta` where
  `type VersionDelta = { reroll: boolean; changes: { field: "instruction"|"controls"|"kbSlices"|"reference"|"promptVersion"; from: string; to: string }[] }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/eval/diff-versions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { diffVersions } from "@/lib/eval/diff-versions";
import type { TraceVersion } from "@/lib/eval/node-traces";

const base = {
  versionId: "x", createdAt: "", input: {}, output: { kind: "text" as const, text: "" },
  request: null, decision: null, note: null,
  instruction: "", controls: { lens: "auto" }, kbSlices: ["Tone"],
  upstream: [{ nodeId: "s", versionId: "sv1" }], promptVersion: "2",
} satisfies TraceVersion;

describe("diffVersions", () => {
  it("names a control change and an instruction change", () => {
    const prev = base;
    const curr = { ...base, controls: { lens: "wide-24" }, instruction: "wide" };
    const d = diffVersions(prev, curr);
    expect(d.reroll).toBe(false);
    expect(d.changes.map((c) => c.field).sort()).toEqual(["controls", "instruction"]);
    const lens = d.changes.find((c) => c.field === "controls")!;
    expect(lens.from).toContain("auto"); expect(lens.to).toContain("wide-24");
  });

  it("detects a reference (upstream versionId) change", () => {
    const curr = { ...base, upstream: [{ nodeId: "s", versionId: "sv2" }] };
    expect(diffVersions(base, curr).changes.map((c) => c.field)).toEqual(["reference"]);
  });

  it("flags a re-roll when nothing structured changed", () => {
    const d = diffVersions(base, { ...base, versionId: "y" });
    expect(d.reroll).toBe(true);
    expect(d.changes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/eval/diff-versions.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/lib/eval/diff-versions.ts`:

```ts
import type { TraceVersion } from "@/lib/eval/node-traces";

export type VersionDelta = {
  reroll: boolean;
  changes: { field: "instruction" | "controls" | "kbSlices" | "reference" | "promptVersion"; from: string; to: string }[];
};

const j = (v: unknown) => JSON.stringify(v ?? null);
const refKey = (v: TraceVersion) => (v.upstream ?? []).map((u) => u.versionId).join(",");

export function diffVersions(prev: TraceVersion, curr: TraceVersion): VersionDelta {
  const changes: VersionDelta["changes"] = [];
  const push = (field: VersionDelta["changes"][number]["field"], from: string, to: string) => changes.push({ field, from, to });

  if ((prev.instruction ?? "") !== (curr.instruction ?? "")) push("instruction", prev.instruction ?? "", curr.instruction ?? "");
  if (j(prev.controls) !== j(curr.controls)) push("controls", j(prev.controls), j(curr.controls));
  if (j(prev.kbSlices) !== j(curr.kbSlices)) push("kbSlices", j(prev.kbSlices), j(curr.kbSlices));
  if (refKey(prev) !== refKey(curr)) push("reference", refKey(prev), refKey(curr));
  if ((prev.promptVersion ?? "") !== (curr.promptVersion ?? "")) push("promptVersion", prev.promptVersion ?? "", curr.promptVersion ?? "");

  return { reroll: changes.length === 0, changes };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/eval/diff-versions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/eval/diff-versions.ts src/lib/eval/diff-versions.test.ts
git commit -m "feat(eval): diffVersions — structured field-compare (no LLM)"
```

---

## Task B2: Version stepper + Δ banner in the detail

**Files:**
- Modify: `src/components/eval/eval-workbench.tsx` (track a selected version per node)
- Modify: `src/components/eval/trace-detail.tsx` (accept a version index; render the stepper, the version timeline, and the Δ banner)

**Interfaces:**
- Consumes: `diffVersions`, `VersionDelta` (B1).

- [ ] **Step 1: Track the selected version in the workbench**

In `eval-workbench.tsx`, add version-index state keyed by node, defaulting to the active version, and reset it when the selected node changes:

```tsx
  const [versionIx, setVersionIx] = useState(0); // 0 = active/newest for the selected node
  // when node changes, reset to its active version:
  //   in onSelect: setSelectedId(id); setVersionIx(0);
  const version = trace ? (trace.versions[versionIx] ?? trace.versions[0]) : null;
```

Change `onSelect` passed to `<ActionList>` to `(id) => { setSelectedId(id); setVersionIx(0); }`, and pass `versionIx`, `onStep={setVersionIx}` to `<TraceDetail>`.

- [ ] **Step 2: Render the stepper, timeline, and Δ in `TraceDetail`**

Extend `TraceDetail`'s props to `{ trace, versionIx, onStep, onLabel }`, derive `version = trace.versions[versionIx]` and `prev = trace.versions[versionIx + 1]` (older), compute `const delta = prev ? diffVersions(prev, version) : null`, and render above the A/C grid:

```tsx
import { diffVersions } from "@/lib/eval/diff-versions";
// …
const version = trace.versions[versionIx];
const prev = trace.versions[versionIx + 1]; // versions are newest→oldest
const delta = prev ? diffVersions(prev, version) : null;
const n = trace.versions.length;

// stepper
<div className="mb-2 flex items-center gap-2 text-xs">
  <button disabled={versionIx >= n - 1} onClick={() => onStep(versionIx + 1)}>‹</button>
  <span>v{n - versionIx} of {n}</span>
  <button disabled={versionIx <= 0} onClick={() => onStep(versionIx - 1)}>›</button>
</div>

// Δ banner
{delta && (
  <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
    <p className="text-eyebrow mb-1 text-primary">Δ what changed</p>
    {delta.reroll ? (
      <p className="text-xs text-amber-700">Re-roll — same request, output moved (model nondeterminism).</p>
    ) : (
      <ul className="text-xs">
        {delta.changes.map((c) => (
          <li key={c.field}><b>{c.field}</b>: <span className="line-through text-muted-foreground">{c.from || "∅"}</span> → <span className="text-emerald-700">{c.to || "∅"}</span></li>
        ))}
      </ul>
    )}
  </div>
)}
```

Use `version` (not the old `version` prop) throughout the panels.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual verification**

Open a node with >1 version on `/eval/<canvasId>` (re-run the bootstrap once to create v2s, or use a production canvas). Step ‹ ›: the version label changes, A/C update, and the **Δ banner** names the changed field (or shows "re-roll" when nothing structured differs).

- [ ] **Step 5: Full check + commit**

Run: `npx tsc --noEmit && npx vitest run` → clean; all pass.

```bash
git add src/components/eval/eval-workbench.tsx src/components/eval/trace-detail.tsx
git commit -m "feat(eval): version stepper + Δ banner (input change → output change)"
```

---

## Self-Review

**Spec coverage** (against `2026-07-02-eval-viewer-error-analysis-design.md`):
- §4.1 per-node, walked by version → A1 (versions list), B2 (stepper). ✓
- §4.2 generated-node allowlist → A1 (`GENERATED_TYPES`, excludes content nodes). ✓
- §4.3 list grouped by action → A5. ✓
- §4.4 polymorphic A/C, B via ModelRequestPanel, D open coding, no tags → A3/A4/A6. ✓
- §4.5 Δ structured field-compare, re-roll marker, no LLM → B1/B2. ✓
- §5 no migration, generalize query+mapping, reuse ReviewScreen shell/label-bar → A1/A2/A4/A6. ✓ (We replace the *sequential* ReviewScreen with a list+detail workbench but reuse `label-bar` + `setVersionLabelAction` + `ModelRequestPanel`.)
- §8 tests → A1, B1 full TDD; UI via tsc + manual. ✓
- §10 ADR D94 → A7. ✓

**Placeholder scan:** none — every code step has complete code. (Two adapt-notes in A4/A6 are conditional wiring instructions with a concrete fallback, not placeholders.)

**Type consistency:** `NodeTrace`/`TraceVersion`/`Modality`/`NodeAction` defined in A1 and consumed unchanged in A2–A6, B1–B2. `mapNodeTraces`/`listNodeTraces`/`diffVersions`/`VersionDelta` signatures match across tasks. `setVersionLabelAction(versionId, {decision, note})` matches the existing action.

## Out of scope (follow-on plans)

- **Production input resolution** — for production prompt nodes without `inputs_used.shotText`, resolve the upstream shot for panel A (Phase A shows what's captured). 
- **Failure tags / axial clustering**, **cross-client rollup**, **LLM-judge scorers**, **structured (script) rich rendering** — deferred (spec §3/§9).
- **Removing the dead sequential components** (`review-screen.tsx`, `trace-panels.tsx`) after the page swap.
