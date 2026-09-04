# Signal-Flavoured Script Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A designer attaches one or more market signals (plus a tint/rewrite mode) to a Script node, and the parse injects the signals' briefs so every extracted shot carries the flavour.

**Architecture:** Rides the existing KB-slices rail: signal selection persists on script node data, the parse route resolves the client's signals server-side and composes a signal brief into `compileScript`'s user message. No new node type, no edges, no DB migration, zero downstream changes (shots are extracted inside the flavoured call).

**Tech Stack:** Next.js (App Router), TypeScript, vitest, shadcn/Base UI primitives, Supabase DAL, OpenAI structured outputs.

**Spec:** `docs/superpowers/specs/2026-08-31-signal-flavoured-scripts-design.md` (ADR D204 in `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7)

## Global Constraints

- **Work in the worktree** `c:\Users\cyril varghese\code\canvas-apps\asset-pipleline\.claude\worktrees\market-signals` on branch `worktree-market-signals`. Run all commands from that directory.
- **shadcn primitives only, never native controls** (`Button`, `Label`, etc. from `src/components/ui/*`; Base UI composes via `render` prop, not `asChild`). Non-interactive `div`/`span`/`p` are fine.
- **Import, don't redefine** — constants in `src/lib/market/constants.ts`, prompt text in `src/prompts/script-parse.ts` (the canonical prompt file).
- **Purple is used sparingly** — active chips use the existing `bg-primary/10 text-primary` pattern from `slice-toggles.tsx`, nothing larger.
- **Lucide icons only, 1.5 stroke** (this feature needs none).
- **ADR numbering:** D184–D200 are claimed on `feat/gemini-omni-provider`; this feature's ADR is already recorded as **D204**. Do not add new ADR entries.
- **Known test flake:** `src/lib/video-gen/__tests__/kling-provider.test.ts` times out (~8s) on cold module cache in full-suite runs. If it is the ONLY failure, re-run it in isolation before investigating; green in isolation = not a regression.
- **With no signals attached, the composed prompt must be byte-identical to today's** (regression-pinned in Task 2).
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Signal mode constants + pure brief builder

**Files:**
- Modify: `src/lib/market/constants.ts` (currently 17 lines: `REFERENCE_KINDS`, `MARKET_BUCKETS`, `THUMBNAIL_SIZE_LIMIT`)
- Create: `src/lib/market/signal-brief.ts`
- Test: `src/lib/market/signal-brief.test.ts` (sibling placement — matches `classify.test.ts`, `ingest.test.ts` in the same folder)

**Interfaces:**
- Consumes: `SignalWithItems` type from `src/lib/db/signals.ts` (**type-only import** — that module has a runtime `import "server-only"`; `import type` is erased so tests and shared code stay safe).
- Produces (later tasks rely on these exact names):
  - `SIGNAL_MODES: readonly ["tint", "rewrite"]`, `type SignalMode = "tint" | "rewrite"`, `DEFAULT_SIGNAL_MODE: SignalMode` — from `constants.ts`
  - `normalizeSignalMode(input: unknown): SignalMode`
  - `normalizeSignalIds(input: unknown): string[]`
  - `selectSignalsByIds(signals: SignalWithItems[], ids: string[]): SignalWithItems[]`
  - `buildSignalBrief(signals: SignalWithItems[]): string` — from `signal-brief.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/market/signal-brief.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { MoodboardItem } from "@/lib/db/moodboards";
import type { SignalWithItems } from "@/lib/db/signals";
import {
  buildSignalBrief,
  normalizeSignalIds,
  normalizeSignalMode,
  selectSignalsByIds,
} from "./signal-brief";

function item(note: string | null): MoodboardItem {
  return {
    id: `it-${Math.random().toString(36).slice(2, 8)}`,
    moodboard_id: "mb-1",
    image_url: "https://cdn.example.com/x.jpg",
    source_url: null,
    kind: "image",
    note,
    added_by: null,
    thumbnail_url: null,
    position: 0,
    added_at: "2026-08-30T00:00:00Z",
  };
}

function signal(overrides: Partial<SignalWithItems> = {}): SignalWithItems {
  return {
    id: "sig-1",
    client_id: "cl-1",
    name: "Rakshabandhan",
    tags: ["festival", "gifting"],
    description: "Sibling gifting moments trend every August.",
    created_by: null,
    created_at: "2026-08-28T00:00:00Z",
    updated_at: "2026-08-28T00:00:00Z",
    items: [item("rakhi tying close-up"), item(null), item("  ")],
    ...overrides,
  };
}

describe("normalizeSignalMode", () => {
  it("accepts the two valid modes", () => {
    expect(normalizeSignalMode("tint")).toBe("tint");
    expect(normalizeSignalMode("rewrite")).toBe("rewrite");
  });
  it("falls back to tint for anything else", () => {
    expect(normalizeSignalMode("REWRITE")).toBe("tint");
    expect(normalizeSignalMode(undefined)).toBe("tint");
    expect(normalizeSignalMode(42)).toBe("tint");
  });
});

describe("normalizeSignalIds", () => {
  it("keeps string ids, deduped, in order", () => {
    expect(normalizeSignalIds(["a", "b", "a", "c"])).toEqual(["a", "b", "c"]);
  });
  it("drops non-strings and empties; non-array yields []", () => {
    expect(normalizeSignalIds(["a", 1, null, ""])).toEqual(["a"]);
    expect(normalizeSignalIds("a")).toEqual([]);
    expect(normalizeSignalIds(undefined)).toEqual([]);
  });
});

describe("selectSignalsByIds", () => {
  it("returns owned signals in the requested order, dropping unknown ids", () => {
    const a = signal({ id: "a", name: "A" });
    const b = signal({ id: "b", name: "B" });
    const picked = selectSignalsByIds([a, b], ["b", "deleted", "a"]);
    expect(picked.map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("buildSignalBrief", () => {
  it("renders name, tags, description, and only non-empty notes", () => {
    expect(buildSignalBrief([signal()])).toBe(
      [
        "Market signal: Rakshabandhan  [tags: festival, gifting]",
        "Sibling gifting moments trend every August.",
        "Evidence notes:",
        "- rakhi tying close-up",
      ].join("\n"),
    );
  });
  it("omits the tags suffix, description line, and notes section when empty", () => {
    const bare = signal({ tags: [], description: "", items: [item(null)] });
    expect(buildSignalBrief([bare])).toBe("Market signal: Rakshabandhan");
  });
  it("joins multiple signals with a blank line, preserving order", () => {
    const a = signal({ id: "a", name: "A", tags: [], description: "da", items: [] });
    const b = signal({ id: "b", name: "B", tags: [], description: "db", items: [] });
    expect(buildSignalBrief([a, b])).toBe(
      "Market signal: A\nda\n\nMarket signal: B\ndb",
    );
  });
  it("returns empty string for no signals", () => {
    expect(buildSignalBrief([])).toBe("");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/market/signal-brief.test.ts`
Expected: FAIL — cannot resolve `./signal-brief`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/market/constants.ts`:

```ts
/** How strongly attached market signals reshape a script parse (D204). */
export const SIGNAL_MODES = ["tint", "rewrite"] as const;
export type SignalMode = (typeof SIGNAL_MODES)[number];
export const DEFAULT_SIGNAL_MODE: SignalMode = "tint";
```

Create `src/lib/market/signal-brief.ts`:

```ts
import { DEFAULT_SIGNAL_MODE, SIGNAL_MODES, type SignalMode } from "./constants";
import type { SignalWithItems } from "@/lib/db/signals";

// Validate a mode from a request body; anything unrecognised is the safe default.
export function normalizeSignalMode(input: unknown): SignalMode {
  return (SIGNAL_MODES as readonly string[]).includes(input as string)
    ? (input as SignalMode)
    : DEFAULT_SIGNAL_MODE;
}

// Validate an id list from a request body: strings only, deduped, order kept.
export function normalizeSignalIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v === "string" && v && !out.includes(v)) out.push(v);
  }
  return out;
}

// Keep only signals the client actually owns, in the designer's order. Unknown
// ids drop silently — a signal deleted after being attached must not break parse.
export function selectSignalsByIds(
  signals: SignalWithItems[],
  ids: string[],
): SignalWithItems[] {
  const byId = new Map(signals.map((s) => [s.id, s]));
  return ids
    .map((id) => byId.get(id))
    .filter((s): s is SignalWithItems => s != null);
}

// One brief per signal: name + tags, the description (the interpretation written
// at grouping), and the non-empty per-reference notes (D186's "MR's voice").
export function buildSignalBrief(signals: SignalWithItems[]): string {
  return signals
    .map((s) => {
      const tags = s.tags.length ? `  [tags: ${s.tags.join(", ")}]` : "";
      const lines = [`Market signal: ${s.name}${tags}`];
      if (s.description.trim()) lines.push(s.description.trim());
      const notes = s.items
        .map((it) => it.note?.trim())
        .filter((n): n is string => !!n);
      if (notes.length) {
        lines.push("Evidence notes:", ...notes.map((n) => `- ${n}`));
      }
      return lines.join("\n");
    })
    .join("\n\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/market/signal-brief.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/market/constants.ts src/lib/market/signal-brief.ts src/lib/market/signal-brief.test.ts
git commit -m "feat(market): signal brief builder + mode/id normalizers (D204)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Mode instructions in the prompt file + `compileScript` composition

**Files:**
- Modify: `src/prompts/script-parse.ts` (add `signalModes` to the exported object; bump `version` 1 → 2)
- Modify: `src/lib/nodes/script.ts` (extend `compileScript` — currently 13 lines)
- Test: `src/lib/nodes/__tests__/compile-script.test.ts` (folder pattern matches `compose-message.test.ts` etc.)

**Interfaces:**
- Consumes: `SignalMode` from Task 1 (`@/lib/market/constants`).
- Produces: `compileScript(source: string, clientContext: string, signalBrief?: string, signalMode?: SignalMode): { system: string; user: string }` — Task 3's route calls this 4-arg form. `scriptParsePrompt.signalModes: Record<SignalMode, string>` and `scriptParsePrompt.version === 2`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/__tests__/compile-script.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { compileScript } from "@/lib/nodes/script";
import { scriptParsePrompt } from "@/prompts/script-parse";

const SRC = "Shot 1: hands apply cream.";
const CTX = "Tone of voice: warm";
const BRIEF = "Market signal: Rakshabandhan\nSibling gifting moments.";

describe("compileScript", () => {
  it("without a brief is byte-identical to the legacy composition", () => {
    expect(compileScript(SRC, CTX)).toEqual({
      system: scriptParsePrompt.system,
      user:
        "Client context (brand tone + compliance — do not introduce avoided words):\n" +
        `${CTX}\n\nReel script to extract:\n${SRC}`,
    });
    expect(compileScript(SRC, "").user).toBe(`Reel script to extract:\n${SRC}`);
  });

  it("places the brief and tint instruction between context and source", () => {
    const { user } = compileScript(SRC, CTX, BRIEF, "tint");
    const iCtx = user.indexOf("Client context");
    const iBrief = user.indexOf(BRIEF);
    const iMode = user.indexOf(scriptParsePrompt.signalModes.tint);
    const iSrc = user.indexOf("Reel script to extract:");
    expect(iCtx).toBeGreaterThanOrEqual(0);
    expect(iBrief).toBeGreaterThan(iCtx);
    expect(iMode).toBeGreaterThan(iBrief);
    expect(iSrc).toBeGreaterThan(iMode);
  });

  it("uses the rewrite instruction when asked", () => {
    const { user } = compileScript(SRC, CTX, BRIEF, "rewrite");
    expect(user).toContain(scriptParsePrompt.signalModes.rewrite);
    expect(user).not.toContain(scriptParsePrompt.signalModes.tint);
  });

  it("a whitespace-only brief composes exactly like no brief", () => {
    expect(compileScript(SRC, CTX, "  \n ", "tint")).toEqual(compileScript(SRC, CTX));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/compile-script.test.ts`
Expected: FAIL — `signalModes` does not exist on `scriptParsePrompt` (type error) / composition missing.

- [ ] **Step 3: Write the implementation**

In `src/prompts/script-parse.ts`, add above the `export const scriptParsePrompt` block:

```ts
// D204: how attached market signals reshape the parse. Composed into the USER
// message by compileScript (after the signal briefs, before the source script).
const signalModes = {
  tint: `Market-signal instruction (TINT VISUALS): keep the voiceover, on-screen text, caption and CTA faithful to the source script. Adapt ONLY the visual side — shot descriptions, settings, props, wardrobe and moods — so every shot reflects the market signal(s) above.`,
  rewrite: `Market-signal instruction (FULL REWRITE): adapt the whole script — hooks, voiceover, on-screen text, caption AND visuals — to the market signal(s) above, while keeping the product message and the client compliance rules intact.`,
} as const;
```

Then change the exported object: add `signalModes,` as a property and bump `version: 1` → `version: 2` (the composition of the user message changed; `paramsUsed.promptVersion` in saved versions must reflect that).

Replace `src/lib/nodes/script.ts` content with:

```ts
// The Script node's `compile` step — a pure function: (script + client context
// + optional market-signal brief) → the model payload. The prompt + schema and
// the mode instructions live in `src/prompts/script-parse.ts` (versioned,
// evaluable, DB-ready); this file only *composes* the user message.
import { scriptParsePrompt } from "@/prompts/script-parse";
import type { SignalMode } from "@/lib/market/constants";

export function compileScript(
  source: string,
  clientContext: string,
  signalBrief = "",
  signalMode: SignalMode = "tint",
) {
  const ctx = clientContext.trim()
    ? `Client context (brand tone + compliance — do not introduce avoided words):\n${clientContext.trim()}\n\n`
    : "";
  const signals = signalBrief.trim()
    ? `${signalBrief.trim()}\n\n${scriptParsePrompt.signalModes[signalMode]}\n\n`
    : "";
  const user = `${ctx}${signals}Reel script to extract:\n${source.trim()}`;
  return { system: scriptParsePrompt.system, user };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/compile-script.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/prompts/script-parse.ts src/lib/nodes/script.ts src/lib/nodes/__tests__/compile-script.test.ts
git commit -m "feat(script): compileScript accepts a signal brief + tint/rewrite mode (D204)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: `getNodeActiveKB` exposes clientId; parse route injects signals

**Files:**
- Modify: `src/lib/db/nodes.ts:22-51` (`getNodeActiveKB`)
- Modify: `src/app/api/nodes/[id]/parse/route.ts`

**Interfaces:**
- Consumes: `listSignalsWithItems(clientId)` from `src/lib/db/signals.ts`; `buildSignalBrief`, `normalizeSignalIds`, `normalizeSignalMode`, `selectSignalsByIds` from Task 1; 4-arg `compileScript` from Task 2.
- Produces: `getNodeActiveKB` return type becomes `{ kb: TraceableBrandKB | null; kbVersionId: string | null; clientId: string } | null` (additive — the three `resolve-inputs.ts` call sites read only `.kb`/`.kbVersionId` and keep compiling). Parse request body accepts `{ source, slices, signalIds?, signalMode? }`; `inputsUsed` on saved versions gains `signalIds: string[] | null` and `signalMode: SignalMode | null`.

- [ ] **Step 1: Extend `getNodeActiveKB` to return `clientId`**

In `src/lib/db/nodes.ts`, the function already resolves the client internally. Change the signature and both success returns:

```ts
export async function getNodeActiveKB(
  nodeId: string,
): Promise<
  { kb: TraceableBrandKB | null; kbVersionId: string | null; clientId: string } | null
> {
```

and after the canvas lookup:

```ts
  const clientId = (canvas as { client_id: string }).client_id;

  const versionRow = await getActiveKBVersion(clientId);
  if (!versionRow) return { kb: null, kbVersionId: null, clientId };
  return {
    kb: versionRow.output as unknown as TraceableBrandKB,
    kbVersionId: versionRow.id,
    clientId,
  };
```

(The two `return null` not-found branches are unchanged.)

- [ ] **Step 2: Verify nothing broke**

Run: `npx tsc --noEmit`
Expected: clean — the change is additive; `resolve-inputs.ts` destructures nothing removed.

- [ ] **Step 3: Wire the route**

In `src/app/api/nodes/[id]/parse/route.ts`:

Add imports:

```ts
import { listSignalsWithItems } from "@/lib/db/signals";
import {
  buildSignalBrief,
  normalizeSignalIds,
  normalizeSignalMode,
  selectSignalsByIds,
} from "@/lib/market/signal-brief";
```

Widen the body type and normalize (after the existing `slices` line):

```ts
    const body = (await req.json().catch(() => null)) as
      | { source?: unknown; slices?: unknown; signalIds?: unknown; signalMode?: unknown }
      | null;
```

```ts
    const requestedSignalIds = normalizeSignalIds(body?.signalIds);
    const signalMode = normalizeSignalMode(body?.signalMode);
```

Between the `clientContext` line and `compileScript`, resolve the signals (client scoping via `ctx.clientId` is the authorization boundary — unknown/foreign ids drop silently, D204):

```ts
    let signalBrief = "";
    let usedSignalIds: string[] = [];
    if (requestedSignalIds.length > 0) {
      const signals = selectSignalsByIds(
        await listSignalsWithItems(ctx.clientId),
        requestedSignalIds,
      );
      usedSignalIds = signals.map((s) => s.id);
      signalBrief = buildSignalBrief(signals);
    }
    const { system, user } = compileScript(source, clientContext, signalBrief, signalMode);
```

(This replaces the existing `const { system, user } = compileScript(source, clientContext);` line.)

Extend provenance in the SUCCESS `insertVersion` call only (the failure-path call records no inputs today — keep it that way):

```ts
        inputsUsed: {
          kbSlices: ctx.kb ? slices : null,
          kbVersionId: ctx.kbVersionId,
          signalIds: usedSignalIds.length ? usedSignalIds : null,
          signalMode: usedSignalIds.length ? signalMode : null,
        },
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` then `npx vitest run`
Expected: tsc clean; full suite green (modulo the known kling flake — re-run it in isolation if it is the only failure).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/nodes.ts "src/app/api/nodes/[id]/parse/route.ts"
git commit -m "feat(parse): inject client-scoped signal briefs into script extraction (D204)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Node data fields + the ScriptSignalsPicker component

**Files:**
- Modify: `src/lib/canvas-nodes.ts:12-17` (`ScriptNodeData`)
- Create: `src/components/nodes/script-signals-picker.tsx`

**Interfaces:**
- Consumes: `SignalMode`, `DEFAULT_SIGNAL_MODE` from `@/lib/market/constants`; `useClientId()` from `@/components/canvas/client-id-context` (provided at `canvas.tsx:359`, precedent: `post-focus-view.tsx:102`); `useMarket(clientId)` from `@/hooks/use-market` (exposes `data.signals: SignalWithItems[]`, `loading`).
- Produces: `ScriptNodeData` gains `signalIds?: string[]` and `signalMode?: SignalMode`. Component export:
  `ScriptSignalsPicker({ selected: string[]; mode: SignalMode; onChange: (next: string[]) => void; onModeChange: (mode: SignalMode) => void; className?: string })` — Task 5 renders it with these exact props.

- [ ] **Step 1: Extend `ScriptNodeData`**

In `src/lib/canvas-nodes.ts`, add to the imports:

```ts
import type { SignalMode } from "@/lib/market/constants";
```

and extend the type (currently lines 12-17):

```ts
export type ScriptNodeData = {
  title?: string;
  source?: string; // raw script text (pasted or uploaded .md/.txt)
  parsed?: unknown; // active parsed output — DISPLAY ONLY, hydrated from the active version (D19); never persisted
  kbSlices?: KBSliceKey[]; // KB slices injected into parse context; undefined = DEFAULT_PARSE_SLICES
  signalIds?: string[]; // market signals flavouring the parse (D204); undefined = none
  signalMode?: SignalMode; // tint | rewrite; undefined = "tint"
};
```

- [ ] **Step 2: Create the picker component**

Create `src/components/nodes/script-signals-picker.tsx`. It mirrors `slice-toggles.tsx`'s chip styling exactly, fetches the client's signals itself (it renders only inside the focus-view sheet, so the market GET fires when the sheet shows, not per canvas node):

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useClientId } from "@/components/canvas/client-id-context";
import { useMarket } from "@/hooks/use-market";
import type { SignalMode } from "@/lib/market/constants";

type Props = {
  selected: string[];
  mode: SignalMode;
  onChange: (next: string[]) => void;
  onModeChange: (mode: SignalMode) => void;
  className?: string;
};

const MODES: { key: SignalMode; label: string; hint: string }[] = [
  { key: "tint", label: "Tint visuals", hint: "Voiceover stays faithful; shots carry the signal" },
  { key: "rewrite", label: "Full rewrite", hint: "The whole script may adapt to the signal" },
];

const CHIP = "nodrag h-auto rounded-full px-2.5 py-1 text-xs transition-colors";
const CHIP_ON =
  "border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary";
const CHIP_OFF =
  "border-border text-muted-foreground hover:bg-muted hover:text-muted-foreground";

/** Market-signal chips for the Script node (D204). Multi-select; a tint/rewrite
 *  mode row appears once something is selected. Selection is recomputed from
 *  signals that still exist, so a stale id disappears on the next patch. */
export function ScriptSignalsPicker({ selected, mode, onChange, onModeChange, className }: Props) {
  const clientId = useClientId();
  const market = useMarket(clientId);
  const signals = market.data?.signals ?? [];

  function toggle(id: string) {
    const valid = new Set(signals.map((s) => s.id));
    const next = selected.filter((sid) => valid.has(sid) && sid !== id);
    if (!selected.includes(id)) next.push(id);
    onChange(next);
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Label>Market signals</Label>
      {signals.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {market.loading
            ? "Loading signals…"
            : "No signals yet — group references on the client's Market page."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {signals.map((s) => {
              const active = selected.includes(s.id);
              return (
                <Button
                  key={s.id}
                  type="button"
                  variant="ghost"
                  aria-pressed={active}
                  onClick={() => toggle(s.id)}
                  className={cn(CHIP, active ? CHIP_ON : CHIP_OFF)}
                >
                  {s.name}
                  {s.tags.length > 0 && (
                    <span className="ml-1 opacity-60">{s.tags.join(" · ")}</span>
                  )}
                </Button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Flavour:</span>
              {MODES.map((m) => (
                <Button
                  key={m.key}
                  type="button"
                  variant="ghost"
                  aria-pressed={mode === m.key}
                  title={m.hint}
                  onClick={() => onModeChange(m.key)}
                  className={cn(CHIP, mode === m.key ? CHIP_ON : CHIP_OFF)}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Woven into extraction — every shot reflects the signal.
          </p>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` and `npx eslint src/components/nodes/script-signals-picker.tsx src/lib/canvas-nodes.ts --max-warnings 0`
Expected: both clean. (No component-test precedent for focus-view pieces — behavior is manually verified in Task 5.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/canvas-nodes.ts src/components/nodes/script-signals-picker.tsx
git commit -m "feat(script): signalIds/signalMode node data + signal picker chips (D204)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Wire the picker through the focus view, empty state, and script node

**Files:**
- Modify: `src/components/nodes/script-focus-view.tsx`
- Modify: `src/components/nodes/script-empty-state.tsx`
- Modify: `src/components/nodes/script-node.tsx`

**Interfaces:**
- Consumes: `ScriptSignalsPicker` (Task 4, exact props above); `DEFAULT_SIGNAL_MODE`, `SignalMode` from `@/lib/market/constants`.
- Produces: the parse POST body becomes `{ source, slices, signalIds, signalMode }` (matching Task 3's route contract). `ScriptFocusView` gains required props `signalIds: string[]` and `signalMode: SignalMode`. `ScriptEmptyState` gains optional prop `signalsSection?: React.ReactNode`.

- [ ] **Step 1: Extend `ScriptEmptyState` with a slot**

In `src/components/nodes/script-empty-state.tsx`: add to the props type and destructuring:

```ts
  signalsSection?: React.ReactNode;
```

and render it after the closing `</div>` of the "Brand context" grid (the last block in the returned JSX):

```tsx
      {signalsSection}
```

- [ ] **Step 2: Extend `ScriptFocusView`**

In `src/components/nodes/script-focus-view.tsx`:

Add imports:

```ts
import { ScriptSignalsPicker } from "./script-signals-picker";
import type { SignalMode } from "@/lib/market/constants";
```

Add to `ScriptFocusViewProps` and the destructured params:

```ts
  signalIds: string[];
  signalMode: SignalMode;
```

Change the `runParse` fetch body (line ~106) to:

```ts
        body: JSON.stringify({ source: src, slices, signalIds, signalMode }),
```

Define the picker element once inside the component body (before `return`), so the empty state and parsed mode render the same thing:

```tsx
  const signalsPicker = (
    <ScriptSignalsPicker
      selected={signalIds}
      mode={signalMode}
      onChange={(next) => onPatch({ signalIds: next })}
      onModeChange={(m) => onPatch({ signalMode: m })}
    />
  );
```

Pass it to the empty state (add to the existing `<ScriptEmptyState ... />` props):

```tsx
                signalsSection={signalsPicker}
```

In parsed mode, render a compact strip above the document — insert as the FIRST child of the `mode === "parsed" && (<> ... </>)` fragment, before the `<AnimatePresence>` block:

```tsx
                <div className="mb-6 rounded-xl border bg-muted/20 p-4">
                  {signalsPicker}
                </div>
```

(This is what makes the core flow work: attach a signal to an already-parsed script, then hit **Re-extract**.)

- [ ] **Step 3: Wire `ScriptNode`**

In `src/components/nodes/script-node.tsx`:

Add import:

```ts
import { DEFAULT_SIGNAL_MODE, type SignalMode } from "@/lib/market/constants";
```

Extend the `d` cast (lines 28-33):

```ts
  const d = data as {
    title?: string;
    source?: string;
    parsed?: unknown;
    kbSlices?: KBSliceKey[];
    signalIds?: string[];
    signalMode?: SignalMode;
  };
```

Pass to the focus view (add to the existing `<ScriptFocusView ... />` props):

```tsx
      signalIds={d.signalIds ?? []}
      signalMode={d.signalMode ?? DEFAULT_SIGNAL_MODE}
```

- [ ] **Step 4: Static verification**

Run: `npx tsc --noEmit` and `npx eslint src/components/nodes --max-warnings 0`
Expected: both clean.

- [ ] **Step 5: Manual verification (dev server)**

Run: `npm run dev`, open a client that has signals (seeded client), open a canvas, then verify:
1. Script node → Open → empty state shows **Market signals** chips below Brand context; select one → the Flavour row (Tint visuals / Full rewrite) appears.
2. Paste a script → Extract → shots in the parsed doc reflect the signal's theme; toast "Script extracted".
3. Parsed mode shows the signals strip above the document; change selection → **Re-extract** → flavour changes accordingly.
4. A client with no signals shows the "No signals yet" hint; parse still works (no-signal path unchanged).
5. Close and reopen the focus view — selection and mode persist (autosaved node data).

Note: image generation is testable locally; video generation is remote-only (known project constraint) — out of scope here anyway.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/script-focus-view.tsx src/components/nodes/script-empty-state.tsx src/components/nodes/script-node.tsx
git commit -m "feat(script): attach signals + flavour mode from the focus view (D204)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification sweep

**Files:** none new — verification only.

- [ ] **Step 1: Full checks**

Run, from the worktree root:

```bash
npx tsc --noEmit
npx eslint src --max-warnings 0
npx vitest run
```

Expected: tsc clean; eslint clean (pre-existing warnings outside touched files are acceptable only if they exist on the branch BEFORE this feature — compare with `git stash` if unsure); vitest fully green, allowing one isolated re-run of `src/lib/video-gen/__tests__/kling-provider.test.ts` per the known-flake rule.

- [ ] **Step 2: Review the diff as a whole**

Run: `git log --oneline origin/staging..HEAD` and `git diff origin/staging..HEAD --stat`
Confirm: only the files named in Tasks 1–5 changed; no stray edits.

- [ ] **Step 3: Report**

Do NOT push. Report completion to the user with the commit list; pushing (and the staging push) is the user's call.

---

## Self-Review Notes

- **Spec coverage:** §3 node data → Task 4; §4 UI (picker, mode toggle, empty-state hint, stale-id pruning) → Tasks 4–5; §5 route (normalization, client-scoped filter, provenance, silent skip) → Tasks 1+3; §6 prompt (brief format, canonical mode text, byte-identical no-signal path) → Tasks 1–2; §7 no downstream changes → no task touches `resolve-inputs.ts`/`fanOutShots` (Task 3 Step 2 verifies compile); §8 testing → Tasks 1, 2, and manual steps in Task 5.
- **Route-level tests:** the parse route has no existing test harness (no `route.test.ts`); the filtering/normalization logic it uses is fully covered as pure functions in Task 1, keeping the route thin glue. This matches how the repo tests other OpenAI routes.
- **Type consistency check:** `SignalMode`/`DEFAULT_SIGNAL_MODE` always from `@/lib/market/constants`; brief helpers always from `@/lib/market/signal-brief`; picker props `selected/mode/onChange/onModeChange` consistent between Tasks 4 and 5; POST body keys `signalIds`/`signalMode` consistent between Tasks 3 and 5.
