# Reference Binding by Id Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prompt text stores image citations as `@[Label](nodeId)` and is numbered only at the
writer / video-model boundary, so disconnecting or reordering images never re-points a citation;
a cited image that is gone blocks Video Gen with a named message.

**Architecture:** One pure module, `src/lib/nodes/ref-binding.ts`, composes the existing token
dialects (`prompt-token-dialect.ts`): a *stored* dialect that reads ids AND legacy positions and
always writes ids, `toStoredRefs` (writer output → ids), `renderRefs` (ids → numbers + missing
list). Routes convert at the edges; `resolveVideoGenPrompt` renders and reports missing refs;
`video-generate` refuses on them; focus views edit in the stored dialect.

**Tech Stack:** Next.js route handlers, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-reference-binding-by-id-design.md`

## Global Constraints

- Scope is token dialects only: Omni `<IMAGE_REF_N>` (0-based), Seedance `@Image N`, Kling `@image_N` (1-based). Veo/Kling single-take prose is untouched.
- No migration of stored data. Legacy positional text must render byte-identically to today when nothing was disconnected.
- Reference ORDER is `visionAttachmentsOf(mapUpstreamForVideo(promptUpstream))` — the same order the writer was sent — on both the write and send side.
- Missing-image copy, exactly: `'<name>' is cited in the prompt but no longer connected — reconnect it or regenerate the prompt.` (plural: `'<a>' and '<b>' are cited in the prompt but no longer connected — reconnect them or regenerate the prompt.`)
- Refusal happens before `insertGeneration` and `reserveCredits`.
- Commits end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`; commit via `git commit -F <file> -- <paths>` (PowerShell mangles quoted `-m`).

---

### Task 1: `ref-binding` core

**Files:**
- Create: `src/lib/nodes/ref-binding.ts`
- Test: `src/lib/nodes/__tests__/ref-binding.test.ts`

**Interfaces:**
- Consumes: `mentionDialect`, `imageRefDialect`, `seedanceImageDialect`, `klingImageDialect`, `TokenDialect`, `Segment` from `./prompt-token-dialect`; `visionAttachmentsOf` from `./compose-message`.
- Produces:
  - `type RefEntry = { id: string; label: string }`
  - `storedRefDialect(model: TokenDialect, labelOf?: (id: string) => string | undefined): TokenDialect`
  - `toStoredRefs(text: string, model: TokenDialect, labelOf: (id: string) => string | undefined): string`
  - `renderRefs(text: string, model: TokenDialect): { text: string; missing: RefEntry[] }`
  - `citedRefIds(text: string, model: TokenDialect): string[]`
  - `refDisplayName(label: string): string` — strips the `Type: ` prefix
  - `missingRefsMessage(missing: RefEntry[]): string`
  - `singleTakeRefDialect(target: string | undefined, ids: string[]): TokenDialect | null` — `"gemini-omni"` → Omni, `"seedance"` → Seedance, else null

- [ ] **Step 1: Write the failing tests** — `src/lib/nodes/__tests__/ref-binding.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  storedRefDialect,
  toStoredRefs,
  renderRefs,
  citedRefIds,
  missingRefsMessage,
  singleTakeRefDialect,
} from "../ref-binding";
import {
  imageRefDialect,
  seedanceImageDialect,
  klingImageDialect,
  serializeSegments,
} from "../prompt-token-dialect";

const LABELS: Record<string, string> = { a: "File: A.png", b: "File: B.png", c: "File: C.png" };
const labelOf = (id: string) => LABELS[id];

describe("toStoredRefs + renderRefs", () => {
  it.each([
    ["Omni", imageRefDialect, "the jar <IMAGE_REF_1> beside <IMAGE_REF_2>", "the jar <IMAGE_REF_0> beside <IMAGE_REF_1>"],
    ["Seedance", seedanceImageDialect, "the jar @Image 2 beside @Image 3", "the jar @Image 1 beside @Image 2"],
    ["Kling", klingImageDialect, "the jar @image_2 beside @image_3", "the jar @image_1 beside @image_2"],
  ])("%s: removing the FIRST image keeps B and C bound to B and C", (_, dialect, written, afterRemoval) => {
    const stored = toStoredRefs(written, dialect(["a", "b", "c"]), labelOf);
    expect(stored).toBe("the jar @[File: B.png](b) beside @[File: C.png](c)");
    const out = renderRefs(stored, dialect(["b", "c"]));
    expect(out.text).toBe(afterRemoval);
    expect(out.missing).toEqual([]);
  });

  it("round-trips to the original text when nothing changed", () => {
    const d = imageRefDialect(["a", "b", "c"]);
    const written = "a <IMAGE_REF_0> and <IMAGE_REF_2>";
    expect(renderRefs(toStoredRefs(written, d, labelOf), d).text).toBe(written);
  });

  it("reports a cited image that is gone and never renumbers it onto a neighbour", () => {
    const stored = "the jar @[File: B.png](b) beside @[File: C.png](c)";
    const out = renderRefs(stored, imageRefDialect(["a", "c"]));
    expect(out.text).toBe("the jar B.png beside <IMAGE_REF_1>");
    expect(out.missing).toEqual([{ id: "b", label: "File: B.png" }]);
  });

  it("passes legacy positional text through unchanged (no migration)", () => {
    const legacy = "the jar <IMAGE_REF_1>";
    expect(renderRefs(legacy, imageRefDialect(["a", "b"]))).toEqual({ text: legacy, missing: [] });
  });

  it("echoes a legacy token past the end rather than inventing a binding", () => {
    const legacy = "the jar <IMAGE_REF_5>";
    expect(renderRefs(legacy, imageRefDialect(["a"])).text).toBe(legacy);
    expect(toStoredRefs(legacy, imageRefDialect(["a"]), labelOf)).toBe(legacy);
  });

  it("handles mixed stored ids and legacy positions", () => {
    const mixed = "@[File: C.png](c) then <IMAGE_REF_0>";
    expect(renderRefs(mixed, imageRefDialect(["a", "c"])).text).toBe("<IMAGE_REF_1> then <IMAGE_REF_0>");
  });
});

describe("storedRefDialect", () => {
  it("parses both forms and always writes ids", () => {
    const d = storedRefDialect(imageRefDialect(["a", "b"]), labelOf);
    const segs = d.parse("x <IMAGE_REF_1> y @[File: A.png](a)");
    expect(serializeSegments(segs, d)).toBe("x @[File: B.png](b) y @[File: A.png](a)");
    expect(d.tokenForId("b", "File: B.png")).toBe("@[File: B.png](b)");
  });
});

describe("citedRefIds", () => {
  it("lists the ids a text cites, from either form, deduplicated", () => {
    expect(citedRefIds("@[B](b) <IMAGE_REF_0> @[B](b)", imageRefDialect(["a", "b"]))).toEqual(["b", "a"]);
  });
});

describe("missingRefsMessage", () => {
  it("names one image", () => {
    expect(missingRefsMessage([{ id: "b", label: "File: Sandals.png" }])).toBe(
      "'Sandals.png' is cited in the prompt but no longer connected — reconnect it or regenerate the prompt.",
    );
  });
  it("names several", () => {
    expect(
      missingRefsMessage([
        { id: "a", label: "File: A.png" },
        { id: "b", label: "File: B.png" },
      ]),
    ).toBe("'A.png' and 'B.png' are cited in the prompt but no longer connected — reconnect them or regenerate the prompt.");
  });
});

describe("singleTakeRefDialect", () => {
  it("gives Omni and Seedance a dialect and the prose targets none", () => {
    expect(singleTakeRefDialect("gemini-omni", ["a"])?.tokenForId("a", "")).toBe("<IMAGE_REF_0>");
    expect(singleTakeRefDialect("seedance", ["a"])?.tokenForId("a", "")).toBe("@Image 1");
    expect(singleTakeRefDialect("veo", ["a"])).toBeNull();
    expect(singleTakeRefDialect("kling", ["a"])).toBeNull();
    expect(singleTakeRefDialect(undefined, ["a"])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/ref-binding.test.ts`
Expected: FAIL — cannot resolve `../ref-binding`.

- [ ] **Step 3: Implement** — `src/lib/nodes/ref-binding.ts`:

```ts
// D272 / BUG-010 — prompt text stores WHICH image it cites, not WHERE that image sits.
//
// A generated prompt used to store positions (`<IMAGE_REF_1>`, `@Image 2`, `@image_2`), and every
// reader resolved them against the images connected NOW. Disconnect the first of three and the
// second's citation bound to the third — silently, in a paid clip. The Instruction field never
// drifted because it stores `@[Label](nodeId)`. Now generated text does too: positions exist only
// at the boundary with a writer or a video model, computed over the images connected at that moment.
import {
  mentionDialect,
  imageRefDialect,
  seedanceImageDialect,
  type Segment,
  type TokenDialect,
} from "./prompt-token-dialect";

export type RefEntry = { id: string; label: string };

// A positional token past the end of the roster — the model invented it, or it predates a removal
// with no stored id. The model dialects give it this id prefix and echo its original text.
const MISSING_PREFIX = "__missing_";
const isInvented = (id: string) => id.startsWith(MISSING_PREFIX);

const MENTION = mentionDialect();

/** "File: Sandals.png" → "Sandals.png". The stored label is "Type: Name", like the Instruction's. */
export function refDisplayName(label: string): string {
  return label.replace(/^[^:]+:\s*/, "");
}

/**
 * The dialect generated prompt text is EDITED and STORED in. Reads both forms — `@[Label](id)`
 * and the model's own positional tokens (resolved via `model`, i.e. the current order, exactly as
 * before) — and always writes `@[Label](id)`. So an old prompt still shows its chips, and the first
 * save converts it: no migration.
 */
export function storedRefDialect(
  model: TokenDialect,
  labelOf: (id: string) => string | undefined = () => undefined,
): TokenDialect {
  return {
    parse(value) {
      const out: Segment[] = [];
      for (const seg of MENTION.parse(value)) {
        if (seg.kind === "mention") {
          out.push(seg);
          continue;
        }
        for (const inner of model.parse(seg.text)) {
          out.push(
            inner.kind === "mention" && !isInvented(inner.id)
              ? { ...inner, label: labelOf(inner.id) ?? inner.label }
              : inner,
          );
        }
      }
      return out;
    },
    // An invented position has no image to name; echo its original text rather than minting an
    // id-shaped token that would claim a binding it never had.
    tokenOf: (s) => (isInvented(s.id) ? s.label : MENTION.tokenOf(s)),
    tokenForId: (id, label) => MENTION.tokenForId(id, label),
    chipLabel: (s, upstreamLabel) => upstreamLabel ?? refDisplayName(s.label),
  };
}

/** Writer output (positions, in the order the writer was sent) → stored form (ids). */
export function toStoredRefs(
  text: string,
  model: TokenDialect,
  labelOf: (id: string) => string | undefined,
): string {
  const stored = storedRefDialect(model, labelOf);
  return stored.parse(text).map((s) => (s.kind === "text" ? s.text : stored.tokenOf(s))).join("");
}

/**
 * Stored form → the model's positions over the images connected now (`model` is built from that
 * order). A cited image that is no longer connected is reported in `missing` and written as its
 * plain name — never renumbered onto whichever image now sits in its old slot.
 */
export function renderRefs(
  text: string,
  model: TokenDialect,
): { text: string; missing: RefEntry[] } {
  const missing: RefEntry[] = [];
  const parts = storedRefDialect(model).parse(text).map((s) => {
    if (s.kind === "text") return s.text;
    if (isInvented(s.id)) return s.label; // legacy / invented: behave exactly as before
    const token = model.tokenForId(s.id, s.label);
    if (token !== null) return token;
    if (!missing.some((m) => m.id === s.id)) missing.push({ id: s.id, label: s.label });
    return refDisplayName(s.label);
  });
  return { text: parts.join(""), missing };
}

/** The ids a text cites, from either form, in first-seen order. */
export function citedRefIds(text: string, model: TokenDialect): string[] {
  const seen: string[] = [];
  for (const s of storedRefDialect(model).parse(text)) {
    if (s.kind === "mention" && !isInvented(s.id) && !seen.includes(s.id)) seen.push(s.id);
  }
  return seen;
}

export function missingRefsMessage(missing: RefEntry[]): string {
  const names = missing.map((m) => `'${refDisplayName(m.label)}'`);
  if (names.length === 1) {
    return `${names[0]} is cited in the prompt but no longer connected — reconnect it or regenerate the prompt.`;
  }
  const list = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list} are cited in the prompt but no longer connected — reconnect them or regenerate the prompt.`;
}

/**
 * The positional dialect a single-take motion prompt is written in for `target` (a
 * VideoPromptTarget), or null for the prose targets (Veo, Kling), whose "the first image" cannot be
 * converted and stays out of scope.
 */
export function singleTakeRefDialect(
  target: string | undefined,
  ids: string[],
): TokenDialect | null {
  if (target === "gemini-omni") return imageRefDialect(ids);
  if (target === "seedance") return seedanceImageDialect(ids);
  return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/nodes/__tests__/ref-binding.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit** — message `feat(refs): ref-binding — stored image ids, rendered to positions at the edge (BUG-010)`; paths `src/lib/nodes/ref-binding.ts src/lib/nodes/__tests__/ref-binding.test.ts`.

---

### Task 2: Reference order + labels from upstream, and plan-level helpers

**Files:**
- Modify: `src/lib/nodes/resolve-inputs.ts` (`UpstreamPreview`, `mapUpstreamForVideo`)
- Modify: `src/lib/nodes/ref-binding.ts` (add `refEntriesOf`)
- Modify: `src/lib/nodes/multishot-plan.ts` (`renderPlan`, `checkPlanLimits`; add `storePlanRefs`, `renderPlanRefs`, `planMissingRefs`, `planCitedRefIds`; delete `refsCitedIn`)
- Test: `src/lib/nodes/__tests__/multishot-plan.test.ts`, `src/lib/nodes/__tests__/ref-binding.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `UpstreamPreview.name?: string` — `data.title || data.filename` for file / draw / image-gen.
  - `refEntriesOf(previews: Array<{ nodeId: string; label: string; type: string; fileUrl?: string; fileKind?: string; useLlm?: boolean; name?: string }>): RefEntry[]` — `visionAttachmentsOf` order; label `"<label>: <name>"` when `name`, else `label`.
  - `renderPlan(plan, cuts, cap, refIds: string[] = [])`
  - `checkPlanLimits(plan, cuts, cap, refIds: string[] = [])` — measures RENDERED beats.
  - `storePlanRefs(plan: MultishotPlan, cap: MultishotCapability, refs: RefEntry[]): MultishotPlan`
  - `renderPlanRefs(plan: MultishotPlan, cap: MultishotCapability, refIds: string[]): MultishotPlan`
  - `planMissingRefs(plan: MultishotPlan, cap: MultishotCapability, refIds: string[]): RefEntry[]`
  - `planCitedRefIds(plan: MultishotPlan, cap: MultishotCapability, refIds: string[]): Set<string>`

- [ ] **Step 1: Failing tests.** In `ref-binding.test.ts` append:

```ts
import { refEntriesOf } from "../ref-binding";

describe("refEntriesOf", () => {
  it("keeps visionAttachmentsOf order and names each image", () => {
    const entries = refEntriesOf([
      { nodeId: "s", label: "Shot", type: "shot" },
      { nodeId: "a", label: "File", type: "file", fileKind: "image", fileUrl: "u", name: "A.png" },
      { nodeId: "g", label: "Image", type: "image-gen", fileKind: "image", fileUrl: "v" },
    ]);
    expect(entries).toEqual([
      { id: "a", label: "File: A.png" },
      { id: "g", label: "Image" },
    ]);
  });
});
```

In `multishot-plan.test.ts`: change the import on line 2 to
`import { parsePlan, renderPlan, mergeRefinedPlan, checkPlanLimits, planIsDirty, setBeatText, storePlanRefs, renderPlanRefs, planMissingRefs, planCitedRefIds } from "../multishot-plan";`,
delete both `describe("refsCitedIn" …)` and `describe("refsCitedIn per model" …)` blocks, and append:

```ts
describe("plan reference binding (BUG-010)", () => {
  const plan: MultishotPlan = {
    version: 1,
    look: "",
    beats: [
      { cutId: "c1", text: "the jar <IMAGE_REF_1>" },
      { cutId: "c2", text: "the strap <IMAGE_REF_2>" },
    ],
  };
  const cuts = [
    { id: "c1", text: "", seconds: 3 },
    { id: "c2", text: "", seconds: 3 },
  ];
  const refs = [
    { id: "a", label: "File: A.png" },
    { id: "b", label: "File: B.png" },
    { id: "c", label: "File: C.png" },
  ];

  it("stores ids, then renders against the images connected now", () => {
    const stored = storePlanRefs(plan, OMNI, refs);
    expect(stored.beats[0].text).toBe("the jar @[File: B.png](b)");
    expect(renderPlan(stored, cuts, OMNI, ["b", "c"])).toBe(
      "[0-3s] the jar <IMAGE_REF_0>\n[3-6s] the strap <IMAGE_REF_1>",
    );
  });

  it("reports and names a cited image that is gone", () => {
    const stored = storePlanRefs(plan, OMNI, refs);
    expect(planMissingRefs(stored, OMNI, ["a", "c"])).toEqual([{ id: "b", label: "File: B.png" }]);
  });

  it("renders a plan's beats for the writer, keeping the plan shape", () => {
    const stored = storePlanRefs(plan, OMNI, refs);
    expect(renderPlanRefs(stored, OMNI, ["a", "b", "c"]).beats[0].text).toBe("the jar <IMAGE_REF_1>");
  });

  it("lists cited ids across beats", () => {
    expect([...planCitedRefIds(storePlanRefs(plan, OMNI, refs), OMNI, ["a", "b", "c"])]).toEqual(["b", "c"]);
  });

  it("measures Kling's per-shot limit on the RENDERED beat, not the longer stored id form", () => {
    const beat = `${"x".repeat(500)} @[File: A-very-long-reference-name.png](a)`;
    const p: MultishotPlan = { version: 1, look: "", beats: [{ cutId: "c1", text: beat }] };
    expect(checkPlanLimits(p, [{ id: "c1", text: "", seconds: 3 }], KLING, ["a"])).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/nodes/__tests__/multishot-plan.test.ts src/lib/nodes/__tests__/ref-binding.test.ts` — expected FAIL (missing exports).

- [ ] **Step 3: Implement.**

`resolve-inputs.ts` — add to `UpstreamPreview`:
```ts
  /** BUG-010 — the image's own name (title or filename), used to label a stored citation. */
  name?: string;
```
and in `mapUpstreamForVideo`, after `const base …`, add a name for image-bearing nodes:
```ts
  const name =
    typeof u.data.title === "string" && u.data.title.trim()
      ? u.data.title.trim()
      : typeof u.data.filename === "string" && u.data.filename.trim()
        ? u.data.filename.trim()
        : undefined;
```
and spread `...(name ? { name } : {})` into the `image-gen` and `file`/`draw` return objects.

`ref-binding.ts` — append:
```ts
import { visionAttachmentsOf } from "./compose-message";

/** The references a writer is sent, in the order it numbers them, each with a stored label. */
export function refEntriesOf(
  previews: Array<{
    nodeId: string;
    label: string;
    type: string;
    fileUrl?: string;
    fileKind?: string;
    useLlm?: boolean;
    name?: string;
  }>,
): RefEntry[] {
  return visionAttachmentsOf(previews).map((u) => ({
    id: u.nodeId,
    label: u.name ? `${u.label}: ${u.name}` : u.label,
  }));
}
```

`multishot-plan.ts` — add imports:
```ts
import { dialectForCapability } from "./prompt-token-dialect";
import { renderRefs, toStoredRefs, citedRefIds, type RefEntry } from "./ref-binding";
```
Change `renderPlan`'s signature to `(plan, cuts, cap, refIds: string[] = [])` and make its first line render every beat and the look:
```ts
  plan = renderPlanRefs(plan, cap, refIds);
```
(`renderPlanRefs` returns an equal plan when there is nothing to render, so the rest of the body is unchanged.) Change `checkPlanLimits` to `(plan, cuts, cap, refIds: string[] = [])` and replace its first line in the body with `const rendered = renderPlanRefs(plan, cap, refIds);`, then read `rendered.beats` in the per-cut loop and call `renderPlan(rendered, cuts, cap)` for the whole-prompt check. Delete `refsCitedIn` and its three regex constants. Append:

```ts
/** BUG-010 — writer output (positions) → stored ids, look and every beat. */
export function storePlanRefs(
  plan: MultishotPlan,
  cap: MultishotCapability,
  refs: RefEntry[],
): MultishotPlan {
  const dialect = dialectForCapability(cap, refs.map((r) => r.id));
  const labelOf = (id: string) => refs.find((r) => r.id === id)?.label;
  return {
    ...plan,
    look: toStoredRefs(plan.look, dialect, labelOf),
    beats: plan.beats.map((b) => ({ ...b, text: toStoredRefs(b.text, dialect, labelOf) })),
  };
}

/** Stored ids → positions over `refIds`, keeping the plan shape (for the writer, and renderPlan). */
export function renderPlanRefs(
  plan: MultishotPlan,
  cap: MultishotCapability,
  refIds: string[],
): MultishotPlan {
  const dialect = dialectForCapability(cap, refIds);
  return {
    ...plan,
    look: renderRefs(plan.look, dialect).text,
    beats: plan.beats.map((b) => ({ ...b, text: renderRefs(b.text, dialect).text })),
  };
}

/** Cited images no longer among `refIds`, across the look and every beat, deduplicated. */
export function planMissingRefs(
  plan: MultishotPlan,
  cap: MultishotCapability,
  refIds: string[],
): RefEntry[] {
  const dialect = dialectForCapability(cap, refIds);
  const out: RefEntry[] = [];
  for (const text of [plan.look, ...plan.beats.map((b) => b.text)]) {
    for (const m of renderRefs(text, dialect).missing) {
      if (!out.some((o) => o.id === m.id)) out.push(m);
    }
  }
  return out;
}

/** Every image id the plan cites (replaces the positional `refsCitedIn`). */
export function planCitedRefIds(
  plan: MultishotPlan,
  cap: MultishotCapability,
  refIds: string[],
): Set<string> {
  const dialect = dialectForCapability(cap, refIds);
  return new Set([plan.look, ...plan.beats.map((b) => b.text)].flatMap((t) => citedRefIds(t, dialect)));
}
```

- [ ] **Step 4: Run** the two test files — expected PASS; then `npx vitest run src/lib/nodes` — expected PASS.

- [ ] **Step 5: Commit** — `feat(refs): plan-level reference binding; renderPlan/checkPlanLimits render stored ids`; paths the five files above.

---

### Task 3: Write path — routes store ids

**Files:**
- Modify: `src/app/api/nodes/[id]/video-prompt/route.ts`
- Modify: `src/app/api/nodes/[id]/multishot-prompt/route.ts`
- Test: `src/app/api/nodes/[id]/multishot-prompt/route.test.ts`

**Interfaces:**
- Consumes: `refEntriesOf`, `singleTakeRefDialect`, `toStoredRefs` (Task 1–2); `storePlanRefs`, `renderPlanRefs`, `renderPlan(…, refIds)` (Task 2).

- [ ] **Step 1: Failing test** — in `multishot-prompt/route.test.ts`, add a case where the resolver returns an image upstream and the writer echoes a positional token:

```ts
  it("stores a returned citation as an image id, not a position (BUG-010)", async () => {
    vi.mocked(resolveMultishotPromptInputs).mockResolvedValueOnce({
      clientContext: "",
      kbVersionId: null,
      slices: [],
      upstream: [
        { nodeId: "img-a", versionId: null, label: "File", type: "file", text: "", fileKind: "image", fileUrl: "https://x/a.png", name: "A.png" },
      ],
      cuts: CUTS,
      targetModel: undefined,
      scriptNotes: "",
      voiceover: "",
    });
    returns({ ...PLAN, beats: PLAN.beats.map((b, i) => (i === 0 ? { ...b, text: "the jar <IMAGE_REF_0>" } : b)) });
    const res = await post({});
    const json = await res.json();
    expect(json.plan.beats[0].text).toBe("the jar @[File: A.png](img-a)");
    expect(json.prompt).toContain("<IMAGE_REF_0>");
  });
```
(Use the file's existing `returns`, `post`, `PLAN`, `CUTS` helpers.)

- [ ] **Step 2: Run** `npx vitest run src/app/api/nodes` — expected FAIL on the new case.

- [ ] **Step 3: Implement.**

`multishot-prompt/route.ts`:
- import `{ refEntriesOf }` from `@/lib/nodes/ref-binding` and `storePlanRefs, renderPlanRefs` from `@/lib/nodes/multishot-plan`.
- after `const spec = …`: 
```ts
    // BUG-010 — the order the writer numbers references in (the images it is sent below), and the
    // model whose dialect the plan is in. A narrow refine keeps the plan's own stamp (D236).
    const refs = refEntriesOf(resolved.upstream);
    const refIds = refs.map((r) => r.id);
    const planCap = multishotCapabilityFor(
      scope === "all" ? resolved.targetModel : previousPlan?.targetModel,
    );
```
- in `refineInstruction({...})` pass `plan: previousPlan ? renderPlanRefs(previousPlan, planCap, refIds) : { look: "", beats: [] }` — the writer reads positions, never ids.
- in `mergeRefinedPlan(previousPlan!, …)` pass `renderPlanRefs(previousPlan!, planCap, refIds)` so the merged plan is uniformly positional before storing.
- replace `return { output: stamped, usage };` with `return { output: storePlanRefs(stamped, planCap, refs), usage };`
- in the response, `prompt: renderPlan(output, resolved.cuts, multishotCapabilityFor(output.targetModel), refIds)`.

`video-prompt/route.ts`:
- import `{ refEntriesOf, singleTakeRefDialect, toStoredRefs }` from `@/lib/nodes/ref-binding`.
- after `resolved`: 
```ts
    // BUG-010 — Omni / Seedance write positions over these images, in this order; store ids.
    const refs = refEntriesOf(resolved.upstream);
    const refDialect = singleTakeRefDialect(targetProvider, refs.map((r) => r.id));
```
- in `call`, replace `return { output, usage };` with
```ts
          const stored = refDialect
            ? toStoredRefs(output, refDialect, (id) => refs.find((r) => r.id === id)?.label)
            : output;
          return { output: stored, usage };
```

- [ ] **Step 4: Run** `npx vitest run src/app/api/nodes` — expected PASS.

- [ ] **Step 5: Commit** — `feat(refs): prompt routes store generated citations as image ids`.

---

### Task 4: Send path — render, and refuse on a missing image

**Files:**
- Modify: `src/lib/video-gen/resolve-prompt.ts`
- Modify: `src/app/api/nodes/[id]/video-generate/route.ts`
- Modify: `src/app/api/nodes/[id]/upstream-images/route.ts`
- Test: `src/lib/video-gen/__tests__/resolve-prompt.test.ts`

**Interfaces:**
- Consumes: `refEntriesOf`, `renderRefs`, `singleTakeRefDialect`, `missingRefsMessage` (Task 1–2); `renderPlan(…, refIds)`, `planMissingRefs` (Task 2); `mapUpstreamForVideo` (existing).
- Produces: `resolveVideoGenPrompt(upstream, fetchUpstream, singleTakeTarget?: string)`; ok result gains `missingRefs: RefEntry[]`.

- [ ] **Step 1: Failing tests** — append to `resolve-prompt.test.ts`:

```ts
describe("resolveVideoGenPrompt reference binding (BUG-010)", () => {
  const img = (id: string, name: string) =>
    output({ nodeId: id, type: "file", data: { fileKind: "image", fileUrl: `https://x/${id}.png`, filename: name } });

  it("renders a stored single-take citation against the images connected now", async () => {
    const vp = output({ nodeId: "vp", type: "video-prompt", activeOutput: "the jar @[File: B.png](b)" });
    const res = await resolveVideoGenPrompt([vp], async () => [img("b", "B.png")], "gemini-omni");
    expect(res.ok && res.prompt).toBe("the jar <IMAGE_REF_0>");
    expect(res.ok && res.missingRefs).toEqual([]);
  });

  it("reports a cited image that is no longer connected", async () => {
    const vp = output({ nodeId: "vp", type: "video-prompt", activeOutput: "the jar @[File: B.png](b)" });
    const res = await resolveVideoGenPrompt([vp], async () => [img("a", "A.png")], "gemini-omni");
    expect(res.ok && res.missingRefs).toEqual([{ id: "b", label: "File: B.png" }]);
  });

  it("reports a missing citation in a multishot plan", async () => {
    const stored: MultishotPlan = { ...plan, beats: [{ cutId: "cut-1", text: "@[File: B.png](b)" }, plan.beats[1]] };
    const mp = output({ nodeId: "mp", type: "multishot-prompt", activeOutput: stored });
    const ms = output({ nodeId: "m", type: "multishot", data: { cuts } });
    const res = await resolveVideoGenPrompt([mp], async (id) => (id === "mp" ? [ms, img("a", "A.png")] : []));
    expect(res.ok && res.missingRefs.map((m) => m.id)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/video-gen/__tests__/resolve-prompt.test.ts` — expected FAIL.

- [ ] **Step 3: Implement.**

`resolve-prompt.ts`: add `missingRefs: RefEntry[]` to the ok branch type; add third param `singleTakeTarget?: string`. Import `mapUpstreamForVideo` from `@/lib/nodes/resolve-inputs`, `refEntriesOf, renderRefs, singleTakeRefDialect, type RefEntry` from `@/lib/nodes/ref-binding`, `planMissingRefs` from `@/lib/nodes/multishot-plan`. Add:
```ts
// BUG-010 — the order the prompt node's writer numbered references in. Same mapping and filter
// the write side used (refEntriesOf over mapUpstreamForVideo), so an unchanged canvas renders a
// stored prompt back to exactly the text it was written as.
function refIdsOf(promptUpstream: UpstreamOutput[]): string[] {
  return refEntriesOf(promptUpstream.map((u) => mapUpstreamForVideo(u))).map((r) => r.id);
}
```
Video-prompt lane: after `promptUpstream`, 
```ts
    const dialect = singleTakeRefDialect(singleTakeTarget, refIdsOf(promptUpstream));
    const rendered = dialect
      ? renderRefs(String(promptNode.activeOutput), dialect)
      : { text: String(promptNode.activeOutput), missing: [] };
    return { ok: true, prompt: rendered.text, promptNode, promptUpstream, cuts: null, targetModel: null, missingRefs: rendered.missing };
```
Multishot lane: `const refIds = refIdsOf(promptUpstream);` then `prompt: renderPlan(plan, cuts, cap, refIds)` and `missingRefs: planMissingRefs(plan, cap, refIds)`.

`video-generate/route.ts`: import `missingRefsMessage` from `@/lib/nodes/ref-binding` and a mapper from the registry provider to a prompt target:
```ts
    const singleTakeTarget =
      config.provider === "gemini" ? "gemini-omni" : config.provider === "seedance" ? "seedance" : undefined;
    const resolved = await resolveVideoGenPrompt(upstream, getUpstreamOutputs, singleTakeTarget);
    if (!resolved.ok) return apiError(resolved.reason, 400);
    // BUG-010 — refuse before any generation row or credit reservation.
    if (resolved.missingRefs.length > 0) return apiError(missingRefsMessage(resolved.missingRefs), 400);
```
(Confirm `videoGenRegistry[modelId].provider` exists; if the registry entry names it differently, read it from `videoGenClientModelMap[modelId].provider` — the client map's `provider` values are `"veo" | "kling" | "seedance" | "gemini"`.) Pass `refIds` into `checkPlanLimits`: compute `const limitRefIds = refEntriesOf(resolved.promptUpstream.map((u) => mapUpstreamForVideo(u))).map((r) => r.id);` and call `checkPlanLimits(plan, cuts, cap, limitRefIds)`.

`upstream-images/route.ts`: for the multishot branch pass `refEntriesOf(ownUpstream.map((u) => mapUpstreamForVideo(u))).map((r) => r.id)` as `renderPlan`'s fourth argument; for the video-prompt branch, render with `singleTakeRefDialect` from the Video Gen node's own model provider (`node.data.modelId` → `videoGenClientModelMap[…]?.provider`, mapped as above) over the connected prompt node's upstream (fetch it with `getUpstreamOutputs(connectedPromptNode.nodeId)` — it is already in `promptUpstreamBatches[promptNodeIndex]`).

- [ ] **Step 4: Run** `npx vitest run src/lib/video-gen src/app/api/nodes` — expected PASS.

- [ ] **Step 5: Commit** — `fix(video-gen): render stored citations at send time; refuse on a disconnected cited image (BUG-010)`.

---

### Task 5: Display path, ADR, bug log

**Files:**
- Modify: `src/components/nodes/video-prompt-focus-view.tsx` (output editor dialect, missing warning)
- Modify: `src/components/nodes/multishot-prompt-focus-view.tsx` (beat dialect, Prompt tab render, uncited, missing warning)
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (append D272)
- Modify: `docs/qa/bugs.md` (BUG-010 → Fixed)

**Interfaces:**
- Consumes: `storedRefDialect`, `renderRefs`, `missingRefsMessage` (Task 1); `renderPlan(…, refIds)`, `planMissingRefs`, `planCitedRefIds` (Task 2).

- [ ] **Step 1: video-prompt-focus-view.** Wrap the output dialect and compute missing refs:
```ts
  const labelOfRef = useCallback(
    (id: string) => upstream.find((u) => u.id === id)?.label,
    [upstream],
  );
  const omniRefs = useMemo(() => {
    const dialectFor = REF_DIALECT_FOR_PROVIDER[effectiveProvider];
    const model = dialectFor ? dialectFor(refIdsKey ? refIdsKey.split(",") : []) : null;
    // BUG-010 — edited and saved as image ids; positions only at send time.
    return model ? storedRefDialect(model, labelOfRef) : null;
  }, [effectiveProvider, refIdsKey, labelOfRef]);
  const missingRefs = useMemo(() => {
    const dialectFor = REF_DIALECT_FOR_PROVIDER[effectiveProvider];
    return dialectFor ? renderRefs(draft, dialectFor(refIdsKey ? refIdsKey.split(",") : [])).missing : [];
  }, [effectiveProvider, refIdsKey, draft]);
```
and render, above the output editor inside `mode === "result"`:
```tsx
                      {missingRefs.length > 0 && (
                        <p className="flex items-start gap-1.5 text-xs text-destructive">
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
                          <span>{missingRefsMessage(missingRefs)}</span>
                        </p>
                      )}
```
(import `TriangleAlert` from lucide-react and `useCallback` if not already imported).

- [ ] **Step 2: multishot-prompt-focus-view.**
  - `beatDialect = useMemo(() => storedRefDialect(dialectForCapability(cap, refIds), labelOfRef), [cap, refIds, labelOfRef])` with `labelOfRef` as above over `upstream`.
  - Prompt tab: `renderPlan(planDraft, cuts, cap, refIds)`.
  - `uncitedIndices`: `const cited = planCitedRefIds(planDraft, cap, refIds); return promptRefImages.flatMap((r, i) => (cited.has(r.id) ? [] : [i]));` (keep the existing memo deps plus `refIds`).
  - `const missingRefs = planDraft ? planMissingRefs(planDraft, cap, refIds) : [];` and render the same destructive line as Step 1 directly under the D237 mismatch line.
  - Remove the now-unused `refsCitedIn` import.

- [ ] **Step 3: Type-check and run everything touched.**

Run: `npx tsc --noEmit -p .` (ignore `.next/` generated errors) → no source errors.
Run: `npx vitest run src/lib src/app src/components src/prompts` → PASS.

- [ ] **Step 4: ADR D272** — append to the roadmap after D271:

```md
### D272 — Generated prompts store image ids; positions exist only at the edge *(recorded 2026-09-18; refines D245)*

**Decision.** Generated prompt text — single-take Omni/Seedance outputs and multishot beats — stores
citations as `@[Label](nodeId)`. `ref-binding.ts` converts at the two boundaries: writer output →
ids (`toStoredRefs`, over the order the writer was sent), and ids → the model's positions over the
images connected now (`renderRefs`) for the writer, the Video Gen request and every preview. Editors
use `storedRefDialect`, which also reads legacy positions (no migration; converted on next save).
A cited image that is no longer connected is reported, rendered as its plain name, and refused by
`video-generate` before any generation row or reservation.

**Why.** Positions were resolved against whatever was connected at read time, so disconnecting one
image silently re-pointed every later citation at its neighbour in a paid clip (BUG-010). The
Instruction field never drifted because it already stored ids.

**Rejected.** Keeping positions plus a stamped order (every hand edit and newly attached image would
have to rewrite the stamp — the drift moves, it does not go away); silently dropping a missing
citation (the clip comes back without the product); migrating stored prompts (operator: not needed).

**Refines.** D245. **Originated →** BUG-010; `2026-09-18-reference-binding-by-id-design.md`.
```

- [ ] **Step 5: Bug log** — in `docs/qa/bugs.md` set BUG-010's index row to `Fixed` with its commit refs and `D272`, and replace its `Status` line with `Fixed — <commits>, ADR D272` plus a one-line `Fix:` summary.

- [ ] **Step 6: Commit** — `feat(refs): prompt editors bind by id and warn on a disconnected cited image; D272` (the two views + roadmap). `docs/qa/bugs.md` stays uncommitted (the user stages `docs/qa/`).
