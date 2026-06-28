# Shot Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a capture-only "Compose variations" action on the Shot node that turns one thin shot seed into 4 role-aware, divergent, production-ready ideas the designer picks from (or promotes into sibling Shots).

**Architecture:** A new `POST /api/nodes/:id/compose` route mirrors the Video Prompt route — it resolves the Shot's own trimmed seed (`renderShotForImage`) + KB slices + an optional vision-read reference image, calls the LLM for structured JSON (4 ideas), and captures the run via `insertVersion` **without** making it the active version (so the Shot keeps rendering its own description — D19/D20 intact). Picking an idea rewrites the description (edit-at-source) and folds the selection into the captured row's `output` (the eval signal). Multi-select promotes ideas into sibling Shot nodes.

**Tech Stack:** Next.js (App Router, this repo's vendored build), TypeScript, React Flow (`@xyflow/react`), Zustand (`zustand/vanilla` store), Supabase, OpenAI SDK, vitest, Tailwind v4 + shadcn (Base UI registry), Lucide icons.

## Global Constraints

- **Decision record:** this feature is **D28** — append to the single ADR log at `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` §7 (AGENTS.md: keep one ADR log).
- **Spec:** `docs/superpowers/specs/2026-06-28-shot-composer-design.md` governs; this plan implements it.
- **Capture rule:** a compose run writes a `node_versions` row (D22 freezes `generated_output`) but is **NEVER** made active — do not call `setActiveVersion` for compose. The Shot has no active version; its output stays `data.script` (D19/D20).
- **Seed/grounding rule (D21 preservation):** the composer seed comes from the Shot's **own** `data.script` via `renderShotForImage` — never an upstream walk; grounding images come **only** from image-typed upstreams, so the dashed Script→Shot lineage edge is never traversed.
- **LLM model:** `gpt-5.4-mini` (match the other text nodes), structured output via `response_format: { type: "json_schema", strict: true }` (as the `parse` route does).
- **No native controls:** use `src/components/ui/*` (Base UI) — never native `<select>`/`<input>`. Base UI uses the `render` prop, not `asChild`.
- **Aesthetics (AGENTS.md):** "Add" actions are dashed-border primary chips (`border border-dashed border-primary/40 hover:bg-primary/5`); purple `#5829c7` used sparingly; Lucide icons 1.5 stroke; motion easing `cubic-bezier(0.22,1,0.36,1)`.
- **Test runner:** `npx vitest run <file>`; types `npx tsc --noEmit`; lint `npm run lint`. Pure/logic units are unit-tested test-first; DB helpers, the route, and React components are verified by integration/manual e2e (repo convention — no brittle Supabase/OpenAI mocks).

---

### Task 1: Role catalog (`shot-roles.ts`)

**Files:**
- Create: `src/lib/nodes/shot-roles.ts`
- Test: `src/lib/nodes/shot-roles.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type ShotRole = { key: string; label: string; slots: string[]; avoid: string[] }`; `SHOT_ROLES: ShotRole[]`; `DEFAULT_SHOT_ROLE = "hero"`; `getShotRole(key: string): ShotRole` (falls back to the default).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/nodes/shot-roles.test.ts
import { describe, it, expect } from "vitest";
import { SHOT_ROLES, DEFAULT_SHOT_ROLE, getShotRole } from "@/lib/nodes/shot-roles";

describe("shot-roles catalog", () => {
  it("has the 10 report roles, each with non-empty slots and avoid", () => {
    const keys = SHOT_ROLES.map((r) => r.key);
    expect(keys).toEqual([
      "hook", "hero", "texture", "application", "ingredient",
      "tutorial", "lifestyle", "social-proof", "bundle", "closure",
    ]);
    for (const r of SHOT_ROLES) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.slots.length).toBeGreaterThan(0);
      expect(r.avoid.length).toBeGreaterThan(0);
    }
  });

  it("keys are unique", () => {
    const keys = SHOT_ROLES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("getShotRole returns the role, or the default for an unknown key", () => {
    expect(getShotRole("texture").key).toBe("texture");
    expect(getShotRole("nonsense").key).toBe(DEFAULT_SHOT_ROLE);
    expect(SHOT_ROLES.some((r) => r.key === DEFAULT_SHOT_ROLE)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/shot-roles.test.ts`
Expected: FAIL — cannot find module `@/lib/nodes/shot-roles`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/nodes/shot-roles.ts
// Curated shot-role catalog (D28). Roles come from the deep-research taxonomy; per-role
// `slots` (what must be present) and `avoid` (per-role compliance) steer the composer.
// A pre-rendered constant — "learned later" = refine these lists from eval results
// (a data change here, no architecture change). Mirrors the shot-controls.ts catalog style.

export type ShotRole = {
  key: string;
  label: string;
  slots: string[]; // what the idea must make concrete for this role
  avoid: string[]; // per-role compliance/avoid (on top of the global avoid-list)
};

export const SHOT_ROLES: ShotRole[] = [
  {
    key: "hook",
    label: "Hook / intro",
    slots: ["subject", "tension", "surface or backdrop", "lighting", "motion cue", "text-safe zone"],
    avoid: ["crowded frame", "generic beauty still", "slow reveal with no tension"],
  },
  {
    key: "hero",
    label: "Product hero",
    slots: ["SKU", "label visibility", "surface", "restrained props", "framing", "final hold"],
    avoid: ["obscured label", "too many props", "focus on the wrong plane"],
  },
  {
    key: "texture",
    label: "Texture / detail",
    slots: ["material behaviour", "macro level", "tool or contact point", "residue rule", "light catch"],
    avoid: ["fake texture", "over-retouched gloss", "impossible viscosity"],
  },
  {
    key: "application",
    label: "Application",
    slots: ["body area", "hand type", "amount", "motion", "absorption / finish", "realism"],
    avoid: ["medical theater", "exaggerated transformation", "unreal skin"],
  },
  {
    key: "ingredient",
    label: "Ingredient",
    slots: ["ingredient form", "vessel or surface", "freshness", "relation to the product"],
    avoid: ["grocery clutter", "lab clichés", "too many ingredients in one frame"],
  },
  {
    key: "tutorial",
    label: "Tutorial / process",
    slots: ["step order", "hand action", "tool", "pace", "cleanliness", "legibility"],
    avoid: ["rushed montage", "messy surfaces", "unclear sequencing"],
  },
  {
    key: "lifestyle",
    label: "Lifestyle / ritual",
    slots: ["environment", "time of day", "props", "human presence", "ambience"],
    avoid: ["generic stock-home look", "irrelevant decor", "product too small"],
  },
  {
    key: "social-proof",
    label: "Social proof",
    slots: ["review or result cue", "realistic use", "calm believable benefit cue"],
    avoid: ["before/after split", "overclaim copy", "dermatologist theater unless true"],
  },
  {
    key: "bundle",
    label: "Bundle / range",
    slots: ["assortment", "hierarchy", "grouping logic", "surface", "campaign prop"],
    avoid: ["clutter", "equal emphasis on everything", "missing hero product"],
  },
  {
    key: "closure",
    label: "Closure",
    slots: ["final arrangement", "readable label", "CTA-safe area", "hold time"],
    avoid: ["weak end card", "ambiguous product", "no resting frame"],
  },
];

export const DEFAULT_SHOT_ROLE = "hero";

export function getShotRole(key: string): ShotRole {
  return SHOT_ROLES.find((r) => r.key === key) ?? SHOT_ROLES.find((r) => r.key === DEFAULT_SHOT_ROLE)!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/shot-roles.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/shot-roles.ts src/lib/nodes/shot-roles.test.ts
git commit -m "feat(shot-composer): role catalog (slots + per-role avoid)"
```

---

### Task 2: Compose pure logic (`shot-compose.ts`)

**Files:**
- Create: `src/lib/nodes/shot-compose.ts`
- Test: `src/lib/nodes/shot-compose.test.ts`

**Interfaces:**
- Consumes: `ShotRole` (Task 1); `UpstreamPreview` (type-only, from `@/lib/nodes/resolve-inputs`).
- Produces:
  - `type ShotComposeIdea = { title: string; bestFor?: string; description: string }`
  - `type ComposeUpstream = { nodeId: string; type: string; data: Record<string, unknown>; activeOutput: unknown; versionId: string | null }`
  - `renderComposeContext(args: { seedText: string; role: ShotRole; clientContext: string }): string`
  - `selectImageUpstreams(ups: ComposeUpstream[]): UpstreamPreview[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/nodes/shot-compose.test.ts
import { describe, it, expect } from "vitest";
import { renderComposeContext, selectImageUpstreams } from "@/lib/nodes/shot-compose";
import { getShotRole } from "@/lib/nodes/shot-roles";

describe("renderComposeContext", () => {
  const role = getShotRole("application");

  it("includes the seed, role label, every slot and avoid, and KB context", () => {
    const out = renderComposeContext({
      seedText: "Fingertip traces a line of cream on forearm.\nMedium: AI macro",
      role,
      clientContext: "Avoid words: cure, heal\nTone of voice: calm",
    });
    expect(out).toContain("Fingertip traces a line of cream on forearm.");
    expect(out).toContain("Medium: AI macro");
    expect(out).toContain("Application");
    for (const s of role.slots) expect(out).toContain(s);
    for (const a of role.avoid) expect(out).toContain(a);
    expect(out).toContain("Avoid words: cure, heal");
  });

  it("omits the Brand context block when KB context is empty", () => {
    const out = renderComposeContext({ seedText: "x", role, clientContext: "  " });
    expect(out).not.toContain("Brand context");
  });
});

describe("selectImageUpstreams", () => {
  it("picks image-gen + file/draw images and IGNORES the script lineage edge", () => {
    const out = selectImageUpstreams([
      // the dashed Script->Shot lineage edge — must be ignored
      { nodeId: "s1", type: "script", data: {}, activeOutput: { title: "reel" }, versionId: "v0" },
      { nodeId: "g1", type: "image-gen", data: {}, activeOutput: "https://x/img.png", versionId: "v1" },
      { nodeId: "f1", type: "file", data: { fileKind: "image", fileUrl: "https://x/f.png", useLlm: false }, activeOutput: null, versionId: null },
      { nodeId: "d1", type: "draw", data: { fileKind: "image", fileUrl: "https://x/d.png" }, activeOutput: null, versionId: null },
    ]);
    expect(out.map((u) => u.nodeId)).toEqual(["g1", "f1", "d1"]);
    expect(out.every((u) => typeof u.fileUrl === "string")).toBe(true);
  });

  it("excludes a file in extraction-only mode (useLlm) and non-image files", () => {
    const out = selectImageUpstreams([
      { nodeId: "f2", type: "file", data: { fileKind: "image", fileUrl: "https://x/f.png", useLlm: true }, activeOutput: null, versionId: null },
      { nodeId: "f3", type: "file", data: { fileKind: "text", rawText: "hi" }, activeOutput: null, versionId: null },
      { nodeId: "g2", type: "image-gen", data: {}, activeOutput: null, versionId: "v9" },
    ]);
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/shot-compose.test.ts`
Expected: FAIL — cannot find module `@/lib/nodes/shot-compose`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/nodes/shot-compose.ts
// Pure logic for the Shot Composer (D28). No server-only imports — unit-testable.
import type { ShotRole } from "@/lib/nodes/shot-roles";
import type { UpstreamPreview } from "@/lib/nodes/resolve-inputs"; // type-only (erased) — safe

// One composed candidate. The Shot's output is still a description string; an idea is a
// labelled candidate description the designer can pick (-> setDescription) or promote.
export type ShotComposeIdea = {
  title: string;
  bestFor?: string;
  description: string;
};

// The shape getUpstreamOutputs returns (mirrored here to avoid a server-only import).
export type ComposeUpstream = {
  nodeId: string;
  type: string;
  data: Record<string, unknown>;
  activeOutput: unknown;
  versionId: string | null;
};

// Build the composer's user-turn text: trimmed seed + the role's slots/avoid + KB context.
// Reuses the D23 trim upstream (the caller passes renderShotForImage(script) as seedText), so
// ideation sees exactly what the image prompt later sees.
export function renderComposeContext(args: {
  seedText: string;
  role: ShotRole;
  clientContext: string;
}): string {
  const { seedText, role, clientContext } = args;
  const blocks: string[] = [];
  blocks.push(`Shot seed:\n${seedText.trim() || "(none provided)"}`);
  blocks.push(
    `Role: ${role.label}\n` +
      `This role must include: ${role.slots.join(", ")}\n` +
      `Avoid for this role: ${role.avoid.join(", ")}`,
  );
  if (clientContext.trim()) blocks.push(`Brand context:\n${clientContext.trim()}`);
  return blocks.join("\n\n");
}

// Pick the upstreams that should ground ideation as VISION images, mapped to the
// UpstreamPreview shape buildUserContent expects. Critically: a `script` upstream (the dashed
// Script->Shot lineage edge, D21) is NOT an image type, so it is ignored — resolution never
// re-imports the whole reel. Mirrors the image-attachment rules in compose-message.ts.
export function selectImageUpstreams(ups: ComposeUpstream[]): UpstreamPreview[] {
  const out: UpstreamPreview[] = [];
  for (const u of ups) {
    if (u.type === "image-gen") {
      const url = typeof u.activeOutput === "string" ? u.activeOutput : undefined;
      if (url) {
        out.push({ nodeId: u.nodeId, versionId: u.versionId, label: "Image", type: "image-gen", text: "", fileUrl: url, fileKind: "image" });
      }
      continue;
    }
    if (u.type === "file" || u.type === "draw") {
      const fileUrl = typeof u.data.fileUrl === "string" ? u.data.fileUrl : undefined;
      const fileKind = typeof u.data.fileKind === "string" ? u.data.fileKind : undefined;
      const useLlm = u.data.useLlm === true;
      if (fileUrl && fileKind === "image" && !useLlm) {
        out.push({
          nodeId: u.nodeId, versionId: u.versionId,
          label: u.type === "draw" ? "Sketch" : "File", type: u.type,
          text: "", fileUrl, fileKind, useLlm,
        });
      }
    }
    // script / text / prompt / video-* → not image grounding; ignored.
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/nodes/shot-compose.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/shot-compose.ts src/lib/nodes/shot-compose.test.ts
git commit -m "feat(shot-composer): compose context renderer + image-upstream selector"
```

---

### Task 3: Connection rules — image sources may connect to a Shot

**Files:**
- Modify: `src/lib/canvas-nodes.ts:112-123` (`VALID_CONNECTIONS`)
- Test: `src/lib/__tests__/shot-composer-connections.test.ts`

**Interfaces:**
- Consumes: `VALID_CONNECTIONS` (existing).
- Produces: `file`, `draw`, `image-gen` may target `shot` (for the Shot's image-grounding handle).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/shot-composer-connections.test.ts
import { describe, it, expect } from "vitest";
import { VALID_CONNECTIONS } from "@/lib/canvas-nodes";

describe("shot composer connections (image grounding)", () => {
  it("file, draw, image-gen may connect to a Shot", () => {
    expect(VALID_CONNECTIONS["file"]).toContain("shot");
    expect(VALID_CONNECTIONS["draw"]).toContain("shot");
    expect(VALID_CONNECTIONS["image-gen"]).toContain("shot");
  });

  it("non-image sources may NOT connect to a Shot", () => {
    expect(VALID_CONNECTIONS["text"]).not.toContain("shot");
    expect(VALID_CONNECTIONS["script"]).not.toContain("shot");
    expect(VALID_CONNECTIONS["prompt"]).not.toContain("shot");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/shot-composer-connections.test.ts`
Expected: FAIL — `VALID_CONNECTIONS["file"]` does not contain `"shot"`.

- [ ] **Step 3: Edit `VALID_CONNECTIONS`**

In `src/lib/canvas-nodes.ts`, update three lines (add `"shot"`):

```ts
  shot:           ["prompt", "video-prompt"],
  file:           ["prompt", "image-gen", "video-prompt", "video-gen", "shot"],
  draw:           ["prompt", "image-gen", "video-prompt", "video-gen", "shot"],
  text:           ["prompt", "video-prompt"],
  prompt:         ["prompt", "image-gen", "video-gen"],
  "image-gen":    ["prompt", "video-gen", "video-prompt", "shot"],
```

(Leave `kb`, `script`, `video-prompt`, `video-gen` unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/shot-composer-connections.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/__tests__/shot-composer-connections.test.ts
git commit -m "feat(shot-composer): allow image sources to connect to a Shot (grounding)"
```

---

### Task 4: `promoteIdeasToShots` store action

**Files:**
- Modify: `src/lib/canvas-store.ts` (add action to the store type ~line 33 and the implementation near `fanOutShots` ~line 184)
- Test: `src/lib/canvas-store.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `ShotComposeIdea` (Task 2); the existing store (`get`/`set`, `AppNode`, `ReelScript`).
- Produces: `promoteIdeasToShots: (shotNodeId: string, ideas: ShotComposeIdea[]) => void` — creates one sibling Shot node per idea (each carrying a copy of the source Shot's narrowed `script` with the idea's description), **no edges**.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/canvas-store.test.ts — add this describe block (keep existing imports; add ShotComposeIdea if needed)
import { describe, it, expect } from "vitest";
import { createCanvasStore } from "@/lib/canvas-store"; // use the store factory this file already imports
import type { ShotComposeIdea } from "@/lib/nodes/shot-compose";

describe("promoteIdeasToShots", () => {
  it("creates one sibling Shot per idea (descriptions set, no edges) and leaves the source intact", () => {
    // createCanvasStore(initialNodes, initialEdges) — the factory signature this test file uses.
    const store = createCanvasStore(
      [
        {
          id: "shot-1",
          type: "shot",
          position: { x: 100, y: 100 },
          data: {
            script: { title: "Reel", visual_script: { shots: [{ description: "seed", duration: "6s" }] } },
            order: 2,
            seededFrom: { scriptTitle: "Reel" },
          },
        } as never,
      ],
      [],
    );

    const ideas: ShotComposeIdea[] = [
      { title: "A", description: "Forearm glide variant" },
      { title: "B", description: "Post-shower variant" },
    ];
    store.getState().promoteIdeasToShots("shot-1", ideas);

    const nodes = store.getState().nodes;
    const shots = nodes.filter((n) => n.type === "shot");
    expect(shots).toHaveLength(3); // source + 2 siblings
    const siblings = shots.filter((n) => n.id !== "shot-1");
    const descs = siblings.map(
      (n) => (n.data as { script?: { visual_script?: { shots?: { description?: string }[] } } }).script?.visual_script?.shots?.[0]?.description,
    );
    expect(descs.sort()).toEqual(["Forearm glide variant", "Post-shower variant"]);
    expect(store.getState().edges).toHaveLength(0); // NO edges
  });

  it("is a no-op when the source node is missing or ideas is empty", () => {
    const store = createCanvasStore([], []);
    store.getState().promoteIdeasToShots("nope", [{ title: "A", description: "x" }]);
    expect(store.getState().nodes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/canvas-store.test.ts -t promoteIdeasToShots`
Expected: FAIL — `promoteIdeasToShots is not a function`.

- [ ] **Step 3: Add the action to the store type**

In `src/lib/canvas-store.ts`, add to the store interface (next to `fanOutShots`, ~line 33):

```ts
  promoteIdeasToShots: (shotNodeId: string, ideas: ShotComposeIdea[]) => void;
```

Add the import near the top (with the other `@/lib/nodes/*` / type imports):

```ts
import type { ShotComposeIdea } from "@/lib/nodes/shot-compose";
```

- [ ] **Step 4: Implement the action**

In `src/lib/canvas-store.ts`, immediately after the `fanOutShots` implementation (after ~line 184), add:

```ts
    // Promote chosen compose ideas (D28) into sibling Shot nodes — the §15 "duplicate to
    // compare" move, one node per idea. Each sibling copies the SOURCE shot's narrowed
    // script with the idea's description swapped in. No edges (human wires each Shot ->
    // Prompt -> Image — D11). Capture of the compose run already happened server-side.
    promoteIdeasToShots: (shotNodeId, ideas) => {
      const src = get().nodes.find((n) => n.id === shotNodeId);
      if (!src || ideas.length === 0) return;
      const d = src.data as {
        script?: ReelScript;
        order?: number;
        seededFrom?: { scriptNodeId?: string; shotIndex?: number; scriptTitle?: string };
      };
      const baseScript = d.script ?? {};
      const vs = baseScript.visual_script ?? {};
      const firstShot = vs.shots?.[0] ?? {};
      const base = src.position;

      const created = ideas.map((idea, i) => ({
        id: crypto.randomUUID(),
        type: "shot",
        position: { x: base.x + 280, y: base.y + (i + 1) * 180 },
        data: {
          script: {
            ...baseScript,
            visual_script: { ...vs, shots: [{ ...firstShot, description: idea.description }] },
          },
          order: d.order,
          seededFrom: d.seededFrom,
        },
      })) as AppNode[];

      set({ nodes: [...get().nodes, ...created] }); // NO edges
    },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/canvas-store.test.ts -t promoteIdeasToShots`
Expected: PASS (2 tests). Also run the whole file to confirm nothing broke: `npx vitest run src/lib/canvas-store.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/canvas-store.ts src/lib/canvas-store.test.ts
git commit -m "feat(shot-composer): promoteIdeasToShots store action (sibling Shots, no edges)"
```

---

### Task 5: DB helpers — `updateVersionOutput` + `getNodeData`

**Files:**
- Modify: `src/lib/db/versions.ts` (add `updateVersionOutput`)
- Modify: `src/lib/db/nodes.ts` (add `getNodeData`)

**Interfaces:**
- Consumes: `createServerSupabase` (existing in both files).
- Produces:
  - `updateVersionOutput(versionId: string, output: unknown): Promise<void>` — updates ONLY `output` on the given row (never `generated_output`, never the active pointer).
  - `getNodeData(nodeId: string): Promise<Record<string, unknown> | null>` — reads `nodes.data` for the seed.

> These wrap Supabase; per repo convention they are verified by the route e2e (Task 6) + a direct DB read, not a unit test (no brittle Supabase mock).

- [ ] **Step 1: Add `updateVersionOutput` to `src/lib/db/versions.ts`**

After `updateActiveVersionOutput` (~line 78), add:

```ts
// D28: fold a selection into a SPECIFIC (non-active) version row's output. The compose
// row is never the node's active version, so updateActiveVersionOutput can't reach it.
// Updates ONLY `output` — `generated_output` stays frozen (D22), preserving the
// proposed-ideas -> shipped-description diff for the eval flywheel.
export async function updateVersionOutput(versionId: string, output: unknown): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("node_versions")
    .update({ output })
    .eq("id", versionId);
  if (error) throw error;
}
```

- [ ] **Step 2: Add `getNodeData` to `src/lib/db/nodes.ts`**

After `getNodeActiveKB` (~line 50), add:

```ts
// Read a node's own persisted data (jsonb). Used by the composer to take its seed from the
// Shot's OWN data.script (D28) rather than walking upstream (which would hit the dashed
// Script->Shot lineage edge and re-import the whole reel — breaking seed-and-fork, D21).
export async function getNodeData(
  nodeId: string,
): Promise<Record<string, unknown> | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("nodes")
    .select("data")
    .eq("id", nodeId)
    .maybeSingle();
  if (error) throw error;
  return (data as { data: Record<string, unknown> | null } | null)?.data ?? null;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/versions.ts src/lib/db/nodes.ts
git commit -m "feat(shot-composer): updateVersionOutput + getNodeData db helpers"
```

---

### Task 6: Composer server surface (prompt + resolve + routes)

**Files:**
- Create: `src/prompts/shot-compose.ts`
- Modify: `src/lib/nodes/resolve-inputs.ts` (add `resolveShotComposeInputs`)
- Create: `src/app/api/nodes/[id]/compose/route.ts`
- Create: `src/app/api/nodes/[id]/compose/select/route.ts`

**Interfaces:**
- Consumes: `renderComposeContext`, `selectImageUpstreams`, `ShotComposeIdea` (Task 2); `getShotRole` (Task 1); `updateVersionOutput`, `getNodeData` (Task 5); `getNodeActiveKB`, `getUpstreamOutputs` (existing); `renderShotForImage` (existing, `node-output.ts`); `normalizeSlices`, `buildParseContext` (existing); `buildUserContent` (existing); `insertVersion`, `getVersionById` (existing); `createOpenAI` (existing); `apiOk`, `apiError` (existing).
- Produces:
  - `resolveShotComposeInputs(nodeId, slicesInput): Promise<{ seedText: string; clientContext: string; kbVersionId: string | null; slices: KBSliceKey[]; imageUpstream: UpstreamPreview[] } | null>`
  - `POST /api/nodes/:id/compose` → `{ ideas: ShotComposeIdea[], versionId }`
  - `POST /api/nodes/:id/compose/select` → `{ ok: true }`

- [ ] **Step 1: Create the prompt template `src/prompts/shot-compose.ts`**

```ts
// shot-compose — a single, evaluable, versioned record (mirrors prompt-generate.ts /
// video-prompt-generate.ts). v1: a "shot composer" that turns one thin shot seed into 4
// DISTINCT, role-aware, production-ready ideas. Structured JSON output (like script-parse).
export const shotComposePrompt = {
  id: "shot-compose",
  version: 1,
  model: "gpt-5.4-mini",
  system: `You are a shot composer for premium, slow, tactile D2C beauty reels.
Given a thin shot seed, a target role (with its required slots and avoid-list), brand context,
and optionally a reference image, produce production-ready shot ideas a designer can shoot.

OUTPUT
Return EXACTLY 4 ideas as strict JSON: { "ideas": [ { "title", "bestFor", "description" } ] }.
- title: a short handle (2-4 words).
- bestFor: one phrase naming when this direction wins.
- description: 2-4 sentences, concrete about surface, light, hand/body action, and finish.

RULES
- All 4 ideas are for the SAME role. Make them genuinely DISTINCT — vary composition, motion,
  prop logic, and framing. Do NOT return four rewordings of one idea.
- Fill the role's required slots. Honor the role's avoid-list.
- GLOBAL avoid: medical-style visuals, baked-in on-screen text in the frame, impossible material
  behaviour, generic luxury filler ("cinematic", "stunning", "8K"), and before/after transformations.
- If a reference image is provided, use it ONLY for palette, surface, vessel, prop system, framing,
  depth-of-field, and mood — never copy its whole concept or restate it literally.`,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["ideas"],
    properties: {
      ideas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "bestFor", "description"],
          properties: {
            title: { type: "string" },
            bestFor: { type: "string" },
            description: { type: "string" },
          },
        },
      },
    },
  },
} as const;
```

- [ ] **Step 2: Add `resolveShotComposeInputs` to `src/lib/nodes/resolve-inputs.ts`**

Add imports at the top of the file (alongside the existing ones):

```ts
import { getNodeData } from "@/lib/db/nodes";
import { renderShotForImage } from "@/lib/nodes/node-output";
import { selectImageUpstreams } from "@/lib/nodes/shot-compose";
```

(`getNodeActiveKB`, `getUpstreamOutputs`, `normalizeSlices`, `buildParseContext`, `KBSliceKey` are already imported in this file.)

Append at the end of the file:

```ts
// resolveInputs for the Shot Composer (D28). The seed comes from the Shot's OWN data.script
// (renderShotForImage = the D23 trim) — NOT an upstream walk, so the dashed Script->Shot
// lineage edge is never followed (seed-and-fork, D21). Grounding images come only from
// image-typed upstreams. Returns null when the node is missing (lets the route 404).
export async function resolveShotComposeInputs(
  nodeId: string,
  slicesInput: unknown,
): Promise<{
  seedText: string;
  clientContext: string;
  kbVersionId: string | null;
  slices: KBSliceKey[];
  imageUpstream: UpstreamPreview[];
} | null> {
  const kbCtx = await getNodeActiveKB(nodeId);
  if (!kbCtx) return null;

  const data = await getNodeData(nodeId);
  const script = (data?.script ?? null) as ReelScript | null;
  const seedText = renderShotForImage(script);

  const slices = normalizeSlices(slicesInput);
  const clientContext = kbCtx.kb ? buildParseContext(kbCtx.kb, slices) : "";

  const ups = await getUpstreamOutputs(nodeId);
  const imageUpstream = selectImageUpstreams(
    ups.map((u) => ({
      nodeId: u.nodeId, type: u.type, data: u.data, activeOutput: u.activeOutput, versionId: u.versionId,
    })),
  );

  return { seedText, clientContext, kbVersionId: kbCtx.kbVersionId, slices, imageUpstream };
}
```

(`ReelScript` is already imported in this file; `UpstreamPreview` is defined in this file.)

- [ ] **Step 3: Create `src/app/api/nodes/[id]/compose/route.ts`**

```ts
import { createOpenAI } from "@/lib/openai/server";
import { resolveShotComposeInputs } from "@/lib/nodes/resolve-inputs";
import { renderComposeContext, type ShotComposeIdea } from "@/lib/nodes/shot-compose";
import { getShotRole } from "@/lib/nodes/shot-roles";
import { buildUserContent } from "@/lib/nodes/compose-message";
import { shotComposePrompt } from "@/prompts/shot-compose";
import { insertVersion } from "@/lib/db/versions";
import { apiError, apiOk } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/compose — the Shot Composer's runAction (D28). Resolve the Shot's own
// trimmed seed + KB + optional vision image, call the LLM for 4 structured ideas, and CAPTURE
// the run via insertVersion. CRITICAL: do NOT setActiveVersion — the Shot keeps rendering its
// own data.script (D19/D20); this row is frozen provenance for the eval flywheel (D22).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  const body = (await req.json().catch(() => null)) as
    | { role?: unknown; slices?: unknown }
    | null;
  const role = getShotRole(typeof body?.role === "string" ? body.role : "");

  const resolved = await resolveShotComposeInputs(nodeId, body?.slices);
  if (!resolved) return apiError("Node not found.", 404);

  const user = renderComposeContext({
    seedText: resolved.seedText,
    role,
    clientContext: resolved.clientContext,
  });
  const userContent = buildUserContent(user, resolved.imageUpstream);

  try {
    const openai = createOpenAI();
    const completion = await openai.chat.completions.create({
      model: shotComposePrompt.model,
      response_format: {
        type: "json_schema",
        json_schema: { name: "shot_ideas", schema: shotComposePrompt.schema, strict: true },
      },
      messages: [
        { role: "system", content: shotComposePrompt.system },
        { role: "user", content: userContent },
      ],
    });
    const content = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { ideas?: ShotComposeIdea[] };
    const ideas = (Array.isArray(parsed.ideas) ? parsed.ideas : []).slice(0, 4);

    const version = await insertVersion({
      nodeId,
      inputsUsed: {
        role: role.key,
        kbSlices: resolved.slices,
        kbVersionId: resolved.kbVersionId,
        imageRef: resolved.imageUpstream.map((u) => u.fileUrl).filter(Boolean),
      },
      paramsUsed: {
        role: role.key,
        promptId: shotComposePrompt.id,
        promptVersion: shotComposePrompt.version,
        tokensUsed: completion.usage ?? null,
      },
      modelUsed: `openai:${shotComposePrompt.model}`,
      output: { ideas }, // generated_output frozen = { ideas } (D22)
    });
    // NB: intentionally NO setActiveVersion — capture-only (D28).

    return apiOk({ ideas, versionId: version.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Compose failed";
    await insertVersion({
      nodeId,
      paramsUsed: { role: role.key, promptId: shotComposePrompt.id, promptVersion: shotComposePrompt.version },
      modelUsed: `openai:${shotComposePrompt.model}`,
      error: message,
    });
    return apiError(message, 500);
  }
}
```

- [ ] **Step 4: Create `src/app/api/nodes/[id]/compose/select/route.ts`**

```ts
import { getVersionById, updateVersionOutput } from "@/lib/db/versions";
import { apiError, apiOk } from "@/lib/api/route-helpers";

// POST /api/nodes/:id/compose/select — capture the designer's pick (D28). Folds
// { selectedIndex, finalDescription } into the compose row's `output`, leaving
// generated_output frozen (D22). The eval flywheel reads: proposed 4 -> chose #i -> shipped Y.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: nodeId } = await params;
  const body = (await req.json().catch(() => null)) as
    | { versionId?: unknown; selectedIndex?: unknown; finalDescription?: unknown }
    | null;
  const versionId = typeof body?.versionId === "string" ? body.versionId : "";
  const selectedIndex = typeof body?.selectedIndex === "number" ? body.selectedIndex : -1;
  const finalDescription = typeof body?.finalDescription === "string" ? body.finalDescription : "";
  if (!versionId) return apiError("versionId is required.", 400);

  const version = await getVersionById(versionId);
  if (!version || version.node_id !== nodeId) return apiError("Version not found for this node.", 404);

  const gen = (version.generated_output ?? {}) as { ideas?: unknown };
  await updateVersionOutput(versionId, {
    ideas: gen.ideas ?? [],
    selectedIndex,
    finalDescription,
  });

  return apiOk({ ok: true });
}
```

> Field names confirmed in `src/lib/db/types.ts`: `NodeVersionRow.node_id` and `NodeVersionRow.generated_output` both exist (the latter added by the raw-generation-capture spec / D22).

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean on the new/modified files.

- [ ] **Step 6: Manual e2e + capture verification**

1. `npm run dev`; open a canvas with a parsed Script; **Fan out shots**.
2. In a browser devtools console (or `curl`), POST to compose for a Shot node id:
   ```js
   await fetch("/api/nodes/<SHOT_ID>/compose", {
     method: "POST", headers: { "content-type": "application/json" },
     body: JSON.stringify({ role: "application", slices: ["compliance","tone_of_voice","personality"] }),
   }).then((r) => r.json());
   ```
   Expected: `{ ideas: [4 items], versionId }`.
3. **DB check (capture-only):** in the `node_versions` row for `versionId`, `generated_output = { ideas:[…] }`; and the `nodes` row for `<SHOT_ID>` still has `active_version_id = NULL` (never activated).
4. POST select:
   ```js
   await fetch("/api/nodes/<SHOT_ID>/compose/select", {
     method: "POST", headers: { "content-type": "application/json" },
     body: JSON.stringify({ versionId: "<versionId>", selectedIndex: 1, finalDescription: "edited prose" }),
   }).then((r) => r.json());
   ```
   Expected: `{ ok: true }`; the row's `output = { ideas, selectedIndex: 1, finalDescription: "edited prose" }`, while `generated_output` is unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/prompts/shot-compose.ts src/lib/nodes/resolve-inputs.ts "src/app/api/nodes/[id]/compose/route.ts" "src/app/api/nodes/[id]/compose/select/route.ts"
git commit -m "feat(shot-composer): compose + select routes, prompt template, resolve inputs"
```

---

### Task 7: Shot node UI — Compose chip, image handle, and the Compose sheet

**Files:**
- Modify: `src/components/nodes/shot-node.tsx` (add image target handle + Compose chip + sheet mount)
- Create: `src/components/nodes/shot-compose-sheet.tsx`

**Interfaces:**
- Consumes: `POST /api/nodes/:id/compose` + `/select` (Task 6); `promoteIdeasToShots`, `updateNodeData` (store); `SHOT_ROLES`, `DEFAULT_SHOT_ROLE` (Task 1); `ShotComposeIdea` (Task 2); `DEFAULT_PARSE_SLICES`, `KB_PARSE_SLICES` (`@/lib/kb/parse-context`); `ui/{sheet,select,button,skeleton}`.
- Produces: a working Compose flow on the Shot card.

- [ ] **Step 1: Create the Compose sheet `src/components/nodes/shot-compose-sheet.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Sparkles, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { SHOT_ROLES, DEFAULT_SHOT_ROLE } from "@/lib/nodes/shot-roles";
import type { ShotComposeIdea } from "@/lib/nodes/shot-compose";
import type { ReelScript } from "@/lib/nodes/reel-script";
import { DEFAULT_PARSE_SLICES, type KBSliceKey } from "@/lib/kb/parse-context";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
  nodeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// The Shot Composer sheet (D28). Pick a role -> Compose -> 4 idea cards -> "Use this" rewrites
// the shot description (edit-at-source) + captures the pick; multi-select promotes to siblings.
export function ShotComposeSheet({ nodeId, open, onOpenChange }: Props) {
  const updateNodeData = useCanvasStore((s) => s.updateNodeData);
  const promoteIdeasToShots = useCanvasStore((s) => s.promoteIdeasToShots);

  // Reactive read of THIS shot's current script (to preserve other fields when we set the desc).
  const currentScript = useCanvasStore(
    (s) => (s.nodes.find((n) => n.id === nodeId)?.data as { script?: ReelScript } | undefined)?.script,
  );

  const [role, setRole] = useState<string>(DEFAULT_SHOT_ROLE);
  const [slices] = useState<KBSliceKey[]>(DEFAULT_PARSE_SLICES);
  const [ideas, setIdeas] = useState<ShotComposeIdea[]>([]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set()); // indices marked for promote

  async function compose() {
    setLoading(true);
    setError(null);
    setIdeas([]);
    setPicked(new Set());
    try {
      const res = await fetch(`/api/nodes/${nodeId}/compose`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, slices }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Compose failed");
      setIdeas(json.ideas ?? []);
      setVersionId(json.versionId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compose failed");
    } finally {
      setLoading(false);
    }
  }

  // Write the chosen idea into this Shot's description (edit-at-source) + capture the pick.
  function useIdea(idea: ShotComposeIdea, index: number) {
    const base = (currentScript ?? {}) as ReelScript;
    const vs = base.visual_script ?? {};
    const first = vs.shots?.[0] ?? {};
    updateNodeData(nodeId, {
      script: { ...base, visual_script: { ...vs, shots: [{ ...first, description: idea.description }] } },
    });
    // best-effort capture of the selection (eval flywheel) — don't block the UI on it
    if (versionId) {
      void fetch(`/api/nodes/${nodeId}/compose/select`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ versionId, selectedIndex: index, finalDescription: idea.description }),
      });
    }
    onOpenChange(false);
  }

  function togglePick(i: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  function promote() {
    const chosen = [...picked].sort((a, b) => a - b).map((i) => ideas[i]).filter(Boolean);
    if (chosen.length === 0) return;
    promoteIdeasToShots(nodeId, chosen);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[440px] sm:max-w-[440px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Compose variations
          </SheetTitle>
          <SheetDescription>
            4 role-aware directions for this shot. Use one, or promote several to compare.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2 px-4">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              {SHOT_ROLES.map((r) => (
                <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={compose} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Compose
          </Button>
        </div>

        <div className="grid gap-3 overflow-y-auto px-4 py-3">
          {loading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border p-3">
                <Skeleton className="mb-2 h-4 w-1/3" />
                <Skeleton className="mb-1 h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}

          {error && <p className="text-sm text-destructive">{error}</p>}

          {!loading &&
            ideas.map((idea, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg border border-border bg-card p-3 shadow-card transition-all",
                  picked.has(i) && "ring-2 ring-primary",
                )}
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium">{idea.title}</span>
                  <button
                    onClick={() => togglePick(i)}
                    aria-label={picked.has(i) ? "Unmark for promote" : "Mark for promote"}
                    className={cn(
                      "flex size-5 items-center justify-center rounded border",
                      picked.has(i) ? "border-primary bg-primary text-primary-foreground" : "border-border",
                    )}
                  >
                    {picked.has(i) && <Check className="size-3.5" />}
                  </button>
                </div>
                {idea.bestFor && <p className="text-eyebrow mb-1 text-[0.6rem]!">best for · {idea.bestFor}</p>}
                <p className="text-sm text-muted-foreground">{idea.description}</p>
                <div className="mt-2 flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => useIdea(idea, i)}>Use this shot</Button>
                </div>
              </div>
            ))}
        </div>

        {picked.size >= 2 && (
          <div className="border-t border-border px-4 py-3">
            <Button className="w-full" onClick={promote}>
              Promote {picked.size} to sibling shots
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

> Mirror the exact `Select` / `Sheet` component prop API already used in `src/components/nodes/*-focus-view.tsx` (Base UI registry — `render` prop, not `asChild`); the names above (`SelectTrigger`, `SelectValue`, etc.) are the conventional shadcn exports — adjust to the repo's actual exports if they differ.

- [ ] **Step 2: Wire the Compose chip + image handle into `src/components/nodes/shot-node.tsx`**

Add imports at the top:

```tsx
import { useState } from "react";
import { Clapperboard, Sparkles } from "lucide-react";
import { ShotComposeSheet } from "./shot-compose-sheet";
```

Inside `ShotNode`, add local open state (after the store hooks):

```tsx
  const [composeOpen, setComposeOpen] = useState(false);
```

Add the Compose chip inside the `p-2` body, right after the description `<textarea>`'s sibling `<p>`:

```tsx
          <button
            onClick={() => setComposeOpen(true)}
            className="nodrag mt-1 flex items-center gap-1 rounded-md border border-dashed border-primary/40 px-2 py-1 text-[0.65rem] text-primary transition-colors hover:bg-primary/5"
          >
            <Sparkles className="size-3" /> Compose
          </button>
```

Add a dedicated **image** target handle (distinct id from the lineage target) just before the existing source handle:

```tsx
        <Handle
          id="image"
          type="target"
          position={Position.Bottom}
          className="size-4! border-2! border-card! bg-muted-foreground!"
        />
```

Mount the sheet just before the closing `</NodeContextMenu>`:

```tsx
        <ShotComposeSheet nodeId={id} open={composeOpen} onOpenChange={setComposeOpen} />
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean on the touched files.

- [ ] **Step 4: Manual e2e**

1. `npm run dev`; parse Reel #4 (Rose Body Butter) → **Fan out shots**.
2. On SHOT 3, click **Compose** → sheet opens; Role defaults to **Product hero**; switch to **Application** → **Compose**.
3. 4 skeletons → 4 distinct idea cards (title · best-for · prose).
4. **Use this shot** on one → the Shot's description is rewritten; reload the canvas → it persists.
5. Re-open Compose → mark 2 cards (ring + check) → **Promote 2 to sibling shots** → 2 new Shot nodes appear below-right, no edges; each carries its idea's description.
6. Drag a **File (image)** node's output onto the Shot's bottom (image) handle → Compose again → ideas reflect the image's palette/surface (spot-check).

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/shot-node.tsx src/components/nodes/shot-compose-sheet.tsx
git commit -m "feat(shot-composer): Shot node Compose chip, image handle, and Compose sheet"
```

---

### Task 8: Documentation — ADR D28 + PRD updates

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7 — append D28)
- Modify: `CreativeOS MVP PRD.md` (§7.1 Shot node, §10 connections, §14 flow)

**Interfaces:** none (docs only).

- [ ] **Step 1: Append D28 to the ADR log §7**

Add a new decision entry at the end of §7 (match the existing D-entry format: Decision / Why / How / Rejected / Refines / Originated). Use the D28 text from the spec's §10 (`docs/superpowers/specs/2026-06-28-shot-composer-design.md`).

- [ ] **Step 2: Update PRD §7.1 (Shot node row)**

In the Shot node row/notes, add: the Shot gains a **"Compose variations"** action (D28) producing 4 role-aware ideas (capture-only — never the active version) and a dedicated **image-grounding target handle**; picking an idea rewrites the description, multi-select promotes to sibling Shots.

- [ ] **Step 3: Update PRD §10 (valid connections)**

Add rows: `File node: image | Shot node | image-ground the composer`; `Draw node | Shot node | image-ground the composer`; `Image Gen output | Shot node | image-ground the composer (D28)`.

- [ ] **Step 4: Update PRD §14 (default flow)**

Add an optional step after "Fan out shots": *"(optional) Compose variations on a shot → pick one / promote siblings (D28)."*

- [ ] **Step 5: Commit**

```bash
git add "docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md" "CreativeOS MVP PRD.md"
git commit -m "docs(shot-composer): record D28 + PRD §7.1/§10/§14 updates"
```

---

## Final verification

- [ ] Run the full unit suite: `npx vitest run` — all green (new: shot-roles, shot-compose, connections, promoteIdeasToShots).
- [ ] `npx tsc --noEmit` clean; `npm run lint` clean.
- [ ] Manual e2e (Task 6 §6 + Task 7 §4) passes end-to-end.
- [ ] Capture invariant confirmed by DB read: a compose row exists with `generated_output = { ideas }`; the Shot's `active_version_id` stays `NULL`; after "Use this" the row's `output` carries `selectedIndex` + `finalDescription` and `generated_output` is unchanged.

## Self-review notes (done while writing)

- **Spec coverage:** role catalog (T1) ✓; divergent ideas + trimmed seed reuse of `renderShotForImage` (T2/T6) ✓; capture-without-activation via D22 (T6) ✓; selection signal (T6 select route) ✓; image grounding via image-only upstreams + new handle + connection rule (T2/T3/T6/T7) ✓; pick-one (T7 `useIdea`) + multi-select promote (T4/T7) ✓; docs D28/PRD (T8) ✓.
- **Deviation from spec's optimistic test list:** the spec listed unit tests for `resolveShotComposeInputs` and `updateVersionOutput`; these wrap Supabase, so per repo convention they are verified by the route e2e + a direct DB read instead of brittle mocks. The subtle correctness rule (ignore the script lineage edge, pick image upstreams) is unit-tested as the **pure** `selectImageUpstreams` (T2) — the part that actually carries the risk.
- **Type consistency:** `ShotComposeIdea` (T2) is the single idea type used by the store action (T4), routes (T6), and sheet (T7); `getShotRole`/`SHOT_ROLES` (T1) used by route + sheet; `selectImageUpstreams` (T2) consumed by `resolveShotComposeInputs` (T6).
