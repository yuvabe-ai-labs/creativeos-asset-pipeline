# Script-parse KB context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject the client's active-KB brand/compliance context into script parsing, with user-selectable slices toggled on the Script node.

**Architecture:** A new pure module `src/lib/kb/parse-context.ts` owns the selectable-slice catalog and a pure `buildParseContext(kb, slices)` renderer. The parse route resolves the node's client's active KB (node → canvas → client → `active_kb_version_id` → version output), builds the context string from the requested slices, and feeds it to the unchanged `compileScript`. The Script node renders toggle chips and sends its selection in the request body.

**Tech Stack:** Next.js 16, TypeScript (strict), Supabase JS, Zod, React Flow (`@xyflow/react`), Vitest (added in Task 0).

**Spec:** `docs/superpowers/specs/2026-06-06-script-parse-kb-context-design.md`

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `vitest.config.ts` | Vitest config with `@` → `src` alias | 0 (create) |
| `package.json` | add `vitest` dep + `test` scripts | 0 (modify) |
| `src/lib/kb/parse-context.ts` | slice catalog, `normalizeSlices`, pure `buildParseContext` | 1 (create) |
| `src/lib/kb/parse-context.test.ts` | unit tests for the pure logic | 1 (create) |
| `src/lib/canvas-nodes.ts` | add `kbSlices?` to `ScriptNodeData` | 2 (modify) |
| `src/lib/db/nodes.ts` | replace `getNodeClientContext` with `getNodeActiveKB` | 3 (modify) |
| `src/app/api/nodes/[id]/parse/route.ts` | resolve KB, normalize slices, build context, log | 4 (modify) |
| `src/components/nodes/script-node.tsx` | toggle chips, send `slices` | 5 (modify) |

`src/lib/nodes/script.ts` (`compileScript`) and `src/prompts/script-parse.ts` are **unchanged**.

---

## Task 0: Vitest setup

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`
Expected: `vitest` added under `devDependencies`, install completes without error.

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirrors the tsconfig path alias (@/* -> ./src/*) so tests can import via "@/...".
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
```

- [ ] **Step 3: Add test scripts**

In `package.json`, add to `"scripts"` (after `"lint": "eslint"`):

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 4: Verify Vitest runs**

Run: `npx vitest run`
Expected: Vitest starts and reports **"No test files found"** (no tests exist yet) — this confirms the runner and config load without error.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test runner"
```

---

## Task 1: `parse-context.ts` — slice catalog + pure renderer (TDD)

**Files:**
- Create: `src/lib/kb/parse-context.ts`
- Test: `src/lib/kb/parse-context.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/kb/parse-context.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { TraceableBrandKB } from "./schema";
import {
  buildParseContext,
  normalizeSlices,
  DEFAULT_PARSE_SLICES,
} from "./parse-context";

// Minimal KBField factory — buildParseContext only reads `.value`.
const f = (value: unknown) => ({
  value,
  confidence: "high",
  evidence_type: "explicit",
  status: "needs_review",
});

// Partial KB cast to the full type; only fields under test are populated.
const kb = {
  brand_profile: {
    brand_name: f("Acme"),
    tagline: f(null),
    positioning: f(null),
    mission: f(null),
    industry: f(null),
    tone_of_voice: f("warm, conversational"),
    personality: f(["premium", "educational"]),
  },
  compliance: {
    never_use_words: f(["cure", "heal"]),
    never_use_claims: f([]),
    never_use_tone: f(null),
    preferred_verbs: f(["helps"]),
    preferred_phrases: f(null),
    disclaimers: f(["results may vary"]),
  },
} as unknown as TraceableBrandKB;

describe("normalizeSlices", () => {
  it("keeps valid keys", () => {
    expect(normalizeSlices(["compliance", "tone_of_voice"])).toEqual([
      "compliance",
      "tone_of_voice",
    ]);
  });
  it("drops unknown keys", () => {
    expect(normalizeSlices(["compliance", "bogus"])).toEqual(["compliance"]);
  });
  it("falls back to defaults on empty array", () => {
    expect(normalizeSlices([])).toEqual(DEFAULT_PARSE_SLICES);
  });
  it("falls back to defaults on non-array input", () => {
    expect(normalizeSlices(undefined)).toEqual(DEFAULT_PARSE_SLICES);
  });
});

describe("buildParseContext", () => {
  it("renders the default slices, skipping null/empty fields", () => {
    const out = buildParseContext(kb, DEFAULT_PARSE_SLICES);
    expect(out).toContain("Tone of voice: warm, conversational");
    expect(out).toContain("Personality: premium, educational");
    expect(out).toContain("Avoid words: cure, heal");
    expect(out).toContain("Preferred verbs: helps");
    expect(out).toContain("Disclaimers: results may vary");
    // null / empty-array compliance fields are omitted
    expect(out).not.toContain("Avoid claims");
    expect(out).not.toContain("Avoid tone");
    expect(out).not.toContain("Preferred phrases");
    // brand_profile slice is off by default
    expect(out).not.toContain("Brand name");
  });

  it("includes brand_profile fields when that slice is selected", () => {
    const out = buildParseContext(kb, ["brand_profile"]);
    expect(out).toContain("Brand name: Acme");
    expect(out).not.toContain("Tagline"); // null, omitted
  });

  it("returns empty string for an empty selection", () => {
    expect(buildParseContext(kb, [])).toBe("");
  });

  it("returns empty string when all selected fields are null", () => {
    const emptyKb = {
      brand_profile: { tone_of_voice: f(null), personality: f(null) },
      compliance: {
        never_use_words: f(null),
        never_use_claims: f(null),
        never_use_tone: f(null),
        preferred_verbs: f(null),
        preferred_phrases: f(null),
        disclaimers: f(null),
      },
    } as unknown as TraceableBrandKB;
    expect(buildParseContext(emptyKb, DEFAULT_PARSE_SLICES)).toBe("");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/kb/parse-context.test.ts`
Expected: FAIL — cannot resolve `./parse-context` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/kb/parse-context.ts`:

```ts
import type { TraceableBrandKB } from "./schema";

// Which KB slices a Script node can inject into the parse context. The catalog is
// the single source of truth shared by the route (validation) and the node UI
// (toggle labels + default-checked state).
export type KBSliceKey =
  | "compliance"
  | "tone_of_voice"
  | "personality"
  | "brand_profile";

export const KB_PARSE_SLICES: {
  key: KBSliceKey;
  label: string;
  default: boolean;
}[] = [
  { key: "compliance", label: "Compliance", default: true },
  { key: "tone_of_voice", label: "Tone", default: true },
  { key: "personality", label: "Personality", default: true },
  { key: "brand_profile", label: "Brand profile", default: false },
];

export const DEFAULT_PARSE_SLICES: KBSliceKey[] = KB_PARSE_SLICES.filter(
  (s) => s.default,
).map((s) => s.key);

const VALID_KEYS = new Set<string>(KB_PARSE_SLICES.map((s) => s.key));

// Validate an arbitrary slice list (e.g. from a request body). Unknown keys are
// dropped; an empty or non-array input falls back to the default set.
export function normalizeSlices(input: unknown): KBSliceKey[] {
  if (!Array.isArray(input)) return [...DEFAULT_PARSE_SLICES];
  const out: KBSliceKey[] = [];
  for (const v of input) {
    if (typeof v === "string" && VALID_KEYS.has(v) && !out.includes(v as KBSliceKey)) {
      out.push(v as KBSliceKey);
    }
  }
  return out.length > 0 ? out : [...DEFAULT_PARSE_SLICES];
}

// ── Rendering ─────────────────────────────────────────────────────────────────

// A KBField's value is string | string[] | null. Flatten to a trimmed string;
// empty / null / empty-array yields "".
function fieldText(field: { value: unknown } | undefined): string {
  const v = field?.value;
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.filter(Boolean).join(", ");
  return String(v).trim();
}

function line(label: string, field: { value: unknown } | undefined): string {
  const text = fieldText(field);
  return text ? `${label}: ${text}` : "";
}

// Pure: (active KB + selected slices) -> compact labeled context string.
// Reads only the selected slices; returns "" when nothing is filled.
export function buildParseContext(
  kb: TraceableBrandKB,
  slices: KBSliceKey[],
): string {
  const want = new Set(slices);
  const lines: string[] = [];
  const bp = kb.brand_profile;
  const c = kb.compliance;

  if (want.has("tone_of_voice")) lines.push(line("Tone of voice", bp?.tone_of_voice));
  if (want.has("personality")) lines.push(line("Personality", bp?.personality));
  if (want.has("brand_profile")) {
    lines.push(line("Brand name", bp?.brand_name));
    lines.push(line("Tagline", bp?.tagline));
    lines.push(line("Positioning", bp?.positioning));
    lines.push(line("Mission", bp?.mission));
    lines.push(line("Industry", bp?.industry));
  }
  if (want.has("compliance")) {
    lines.push(line("Avoid words", c?.never_use_words));
    lines.push(line("Avoid claims", c?.never_use_claims));
    lines.push(line("Avoid tone", c?.never_use_tone));
    lines.push(line("Preferred verbs", c?.preferred_verbs));
    lines.push(line("Preferred phrases", c?.preferred_phrases));
    lines.push(line("Disclaimers", c?.disclaimers));
  }

  return lines.filter(Boolean).join("\n");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/kb/parse-context.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kb/parse-context.ts src/lib/kb/parse-context.test.ts
git commit -m "feat: add KB parse-context slice catalog and renderer"
```

---

## Task 2: Add `kbSlices` to `ScriptNodeData`

**Files:**
- Modify: `src/lib/canvas-nodes.ts:6-10`

- [ ] **Step 1: Add the field**

In `src/lib/canvas-nodes.ts`, add the import at the top (after the existing `import type` lines):

```ts
import type { KBSliceKey } from "@/lib/kb/parse-context";
```

Then extend `ScriptNodeData`:

```ts
export type ScriptNodeData = {
  title?: string;
  source?: string; // raw script text (pasted or uploaded .md/.txt)
  parsed?: unknown; // active parsed output (display cache; full log in node_versions)
  kbSlices?: KBSliceKey[]; // KB slices injected into parse context; undefined = DEFAULT_PARSE_SLICES
};
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors. (`KBSliceKey` is a type-only import — erased at runtime, so this file stays safe to import from Server Components.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/canvas-nodes.ts
git commit -m "feat: add kbSlices to ScriptNodeData"
```

---

## Task 3: Replace `getNodeClientContext` with `getNodeActiveKB`

**Files:**
- Modify: `src/lib/db/nodes.ts:1-27`

- [ ] **Step 1: Replace the stub function**

In `src/lib/db/nodes.ts`, add this import near the top (after the existing `import type { NodeRow }` line):

```ts
import type { TraceableBrandKB } from "@/lib/kb/schema";
```

Then replace the entire `getNodeClientContext` function (lines 13-27, from the `// Verify the node exists;` comment through its closing brace) with:

```ts
// Resolve a node's client's active KB by walking node -> canvas -> client ->
// active_kb_version_id -> client_kb_versions.output.
// Returns null ONLY when the node itself is missing (lets the route 404 + hint a
// retry during the autosave race). A node whose client has no active KB returns
// { kb: null } — not normally reachable, since the canvas-list page redirects to
// /kb unless kb_status === 'ready'.
export async function getNodeActiveKB(
  nodeId: string,
): Promise<{ kb: TraceableBrandKB | null; kbVersionId: string | null } | null> {
  const supabase = createServerSupabase();

  const { data: node, error: nodeErr } = await supabase
    .from("nodes")
    .select("canvas_id")
    .eq("id", nodeId)
    .maybeSingle();
  if (nodeErr) throw nodeErr;
  if (!node) return null;

  const { data: canvas, error: canvasErr } = await supabase
    .from("canvases")
    .select("client_id")
    .eq("id", (node as { canvas_id: string }).canvas_id)
    .maybeSingle();
  if (canvasErr) throw canvasErr;
  if (!canvas) return { kb: null, kbVersionId: null };

  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .select("active_kb_version_id")
    .eq("id", (canvas as { client_id: string }).client_id)
    .maybeSingle();
  if (clientErr) throw clientErr;
  const versionId =
    (client as { active_kb_version_id: string | null } | null)
      ?.active_kb_version_id ?? null;
  if (!versionId) return { kb: null, kbVersionId: null };

  const { data: version, error: versionErr } = await supabase
    .from("client_kb_versions")
    .select("output")
    .eq("id", versionId)
    .maybeSingle();
  if (versionErr) throw versionErr;
  const output = (version as { output: unknown } | null)?.output ?? null;
  return { kb: (output as TraceableBrandKB) ?? null, kbVersionId: versionId };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: FAIL — `src/app/api/nodes/[id]/parse/route.ts` still imports the now-removed `getNodeClientContext`. This is expected; Task 4 fixes the call site. (Do not commit yet.)

- [ ] **Step 3: Commit together with Task 4**

This task's change is committed at the end of Task 4 (the route is the only caller, so they must change together to keep the build green).

---

## Task 4: Wire the route — resolve KB, normalize slices, build context, log

**Files:**
- Modify: `src/app/api/nodes/[id]/parse/route.ts`

- [ ] **Step 1: Update imports**

In `src/app/api/nodes/[id]/parse/route.ts`, replace:

```ts
import { getNodeClientContext } from "@/lib/db/nodes";
```

with:

```ts
import { getNodeActiveKB } from "@/lib/db/nodes";
import { normalizeSlices, buildParseContext } from "@/lib/kb/parse-context";
```

- [ ] **Step 2: Update the body parse + context build**

Replace these lines (the body read through the `compileScript` call, currently lines 16-25):

```ts
  const body = (await req.json().catch(() => null)) as { source?: unknown } | null;
  const source = typeof body?.source === "string" ? body.source : "";
  if (!source.trim()) {
    return apiError("Provide a non-empty script to parse.", 400);
  }

  const ctx = await getNodeClientContext(nodeId);
  if (!ctx) return apiError("Node not found.", 404);

  const { system, user } = compileScript(source, ctx.contextNotes);
```

with:

```ts
  const body = (await req.json().catch(() => null)) as
    | { source?: unknown; slices?: unknown }
    | null;
  const source = typeof body?.source === "string" ? body.source : "";
  if (!source.trim()) {
    return apiError("Provide a non-empty script to parse.", 400);
  }
  const slices = normalizeSlices(body?.slices);

  const ctx = await getNodeActiveKB(nodeId);
  if (!ctx) return apiError("Node not found.", 404);

  const clientContext = ctx.kb ? buildParseContext(ctx.kb, slices) : "";
  const { system, user } = compileScript(source, clientContext);
```

- [ ] **Step 3: Update the success-path version log**

Replace the `inputsUsed` line in the successful `insertVersion` call (currently line 49):

```ts
      inputsUsed: { clientContext: ctx.contextNotes ? "included" : "none" },
```

with:

```ts
      inputsUsed: { kbSlices: slices, kbVersionId: ctx.kbVersionId },
```

- [ ] **Step 4: Verify the whole project type-checks**

Run: `npx tsc --noEmit`
Expected: PASS — no errors (Task 3 + Task 4 now consistent).

- [ ] **Step 5: Verify existing unit tests still pass**

Run: `npm test`
Expected: PASS — the Task 1 suite is green.

- [ ] **Step 6: Commit (Tasks 3 + 4 together)**

```bash
git add src/lib/db/nodes.ts src/app/api/nodes/[id]/parse/route.ts
git commit -m "feat: inject client active-KB context into script parse"
```

---

## Task 5: Script node toggle UI

**Files:**
- Modify: `src/components/nodes/script-node.tsx`

- [ ] **Step 1: Add imports + read the selection**

In `src/components/nodes/script-node.tsx`, add after the existing `import { ReelOutput }` line:

```ts
import {
  KB_PARSE_SLICES,
  DEFAULT_PARSE_SLICES,
  type KBSliceKey,
} from "@/lib/kb/parse-context";
```

Extend the `d` cast and derive the selection. Replace:

```ts
  const d = data as { title?: string; source?: string; parsed?: unknown };
  const title = d.title ?? "";
  const source = d.source ?? "";
  const parsed = d.parsed;
```

with:

```ts
  const d = data as {
    title?: string;
    source?: string;
    parsed?: unknown;
    kbSlices?: KBSliceKey[];
  };
  const title = d.title ?? "";
  const source = d.source ?? "";
  const parsed = d.parsed;
  const selectedSlices = d.kbSlices ?? DEFAULT_PARSE_SLICES;

  function toggleSlice(key: KBSliceKey) {
    const next = selectedSlices.includes(key)
      ? selectedSlices.filter((k) => k !== key)
      : [...selectedSlices, key];
    updateNodeData(id, { kbSlices: next });
  }
```

- [ ] **Step 2: Send the selection in the parse request**

In `handleParse`, replace:

```ts
        body: JSON.stringify({ source }),
```

with:

```ts
        body: JSON.stringify({ source, slices: selectedSlices }),
```

- [ ] **Step 3: Render the toggle chips + fix the caption**

Replace the Extract button block (currently lines 152-163, the `<div className="grid gap-1.5">` containing the Button and the caption `<p>`) with:

```tsx
              <div className="grid gap-2">
                <Label>Brand context</Label>
                <div className="flex flex-wrap gap-1.5">
                  {KB_PARSE_SLICES.map((s) => {
                    const active = selectedSlices.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => toggleSlice(s.key)}
                        className={cn(
                          "nodrag rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-1.5">
                <Button onClick={handleParse} disabled={parsing || !source.trim()}>
                  {parsing ? "Extracting…" : "Extract"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Injects the selected brand context into extraction.
                </p>
              </div>
```

- [ ] **Step 4: Verify type-check + lint**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm run lint`
Expected: no new errors in `script-node.tsx`.

- [ ] **Step 5: Manual verification in the app**

Run: `npm run dev`, open a canvas that has a KB node + Script node, open the Script node's panel.
Expected: a "Brand context" row shows four chips — **Compliance, Tone, Personality** active (purple), **Brand profile** inactive. Toggling a chip persists (close/reopen the panel; selection sticks via autosave). Paste a script with a banned word from the client's compliance list, click Extract, and confirm the extracted `qc_notes` / output respects the brand context.

- [ ] **Step 6: Commit**

```bash
git add src/components/nodes/script-node.tsx
git commit -m "feat: add brand-context slice toggles to Script node"
```

---

## Self-Review

**Spec coverage:**
- Section A (slice model, `KB_PARSE_SLICES`, `DEFAULT_PARSE_SLICES`, `buildParseContext`, four slices) → Task 1. ✅
- Section B (persist `kbSlices` → Task 2; `getNodeActiveKB` resolution → Task 3; route validates slices + builds context + logs → Task 4) ✅
- Section C (toggle chips in Sheet, send `slices`, caption fix) → Task 5. ✅
- Testing (Vitest setup + `buildParseContext`/`normalizeSlices` units) → Tasks 0–1. ✅
- "compileScript and prompt unchanged" — no task touches them. ✅

**Placeholder scan:** none — every code step shows complete code; every command lists expected output.

**Type consistency:** `KBSliceKey`, `KB_PARSE_SLICES`, `DEFAULT_PARSE_SLICES`, `normalizeSlices`, `buildParseContext` defined in Task 1 and used with identical names/signatures in Tasks 2, 4, 5. `getNodeActiveKB` returns `{ kb, kbVersionId }`; the route reads `ctx.kb` and `ctx.kbVersionId` to match. `kbSlices` field name consistent across Tasks 2, 4 (logged), 5 (read/written).

**Note on Task 3/4 coupling:** Task 3 intentionally leaves the build red (the route is the sole caller of the removed function); Task 4 restores green and they commit together. This is called out in both tasks.
