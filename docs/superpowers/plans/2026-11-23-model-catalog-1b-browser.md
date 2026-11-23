# Model catalog 1b-ii — the browser reads image and video models from the catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every browser screen that lists, labels, configures or defaults an image or video model (pickers, focus views, version history, the canvas store, the avatar Studio, Visualise) reads the model from the session's one cached catalog, and the helpers the browser and the server share take the model list as an argument, so a status or label set in the database is what every screen shows.

**Architecture:** One pure module, `src/lib/ai-models/model-lists.ts`, turns an `AiCatalog` into two lists (`ImageModels`, `VideoModels`): every non-draft model in sort order, lookup by id, status and replacement, the offered models grouped for a picker, and the default. The lists are cached per catalog object, so a per-card lookup is O(1). In the browser, a `ModelCatalogGate` in a new `src/app/clients/[id]/layout.tsx` seeds the TanStack cache with the catalog the server read, and the hooks `useImageModels()` / `useVideoModels()` return the lists below it. The server builds the same lists from `getAiCatalog()` and hands them to the shared helpers (D542). A node on a retired model opens on its replacement with a notice (D544). Defaults stay code preferences, used only while live (D543).

**Tech Stack:** Next.js 16 App Router (Server Component layout, client gate), TanStack Query v5, Zustand canvas store, Zod 4, Vitest 4 + Testing Library.

**Follows:** `docs/superpowers/plans/2026-11-23-model-catalog-1b-server.md` (1b-i: `runnableModel`, `imageRun`, `videoRun`, `to-spec.ts`, `test-catalog.ts`). Spec: `docs/superpowers/specs/2026-11-21-model-catalog-design.md` ("Loading the catalog", statuses, "Edge cases").

## Global Constraints

- Decisions **D542–D544** (Task 9 writes them into the ADR log, §7 of `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`). No migration in this plan.
- Status meaning in the browser, exactly: `live` is offered in pickers; `hidden` is offered only on the node, avatar or panel whose stored model it already is; `retired` is never offered, and a node on it opens on its `replacedBy` (if that is live) or the default; `draft` never reaches the browser (the route filters it).
- Copy, exactly: the retired notice reads `"This model was retired. Pick another."` (import `MODEL_RETIRED_MESSAGE` from `src/lib/ai-models/runnable.ts`, never retype it). The gate's failure reads `"Could not load the models."` with a `Try again` button. Never show a model id, vendor or raw error in the UI.
- **Performance (AGENTS.md rules 1–2):** the catalog is one request per session (`useAiCatalog`), never one per node. A per-node or per-card hook does no work that grows with the catalog: `imageModelsFrom` / `videoModelsFrom` are cached by catalog object (`WeakMap`), and `get` / `status` are map lookups.
- Shared helpers (used by a route or task and by the browser) take the list as their **first** argument: `images: ImageModels` or `videos: VideoModels`. The server builds it with `imageModelsFrom(await getAiCatalog())` once per request, in the `Promise.all` it already has.
- Controls are shadcn primitives from `src/components/ui/*` only (Base UI, `render` prop). Icons Lucide, 1.5 stroke. Colors through the CSS variables. The notice reuses `Alert` from `src/components/ui/alert.tsx` if it exists; otherwise a `div` with `border-border bg-muted/40 text-sm` (check first, do not add a new primitive for this).
- `src/lib/image-gen/client-models.ts` and `src/lib/video-gen/client-models.ts` keep the maps and the id constants that `src/lib/ai-models/seed.ts`, `adapter-sync.ts`, the provider files and tests still read (Plan 1b-iii deletes them). After Task 8 no file under `src/components/`, `src/hooks/`, `src/app/` (except `api/` tests) or `src/lib/canvas-store.ts` imports a runtime value from either file; a guard test enforces it.
- Model-specific behaviour keyed by an id stays in code: `MULTISHOT_MODELS`, `VOICE_PREVIEW_ENGINE`, `VIDEO_EDIT_MODEL_IDS`, `SEEDANCE_FACE_MODEL_ID`, the prompt templates in `src/prompts/multishot-prompt-for.ts`.
- Tests: a component test that mounts something calling `useImageModels` / `useVideoModels` mocks `@/hooks/queries/ai-models` with the seeded lists (`imageModelsFrom(seededModelCatalog())`); see the snippet in Task 2. Never let a test hit `/api/ai-models`.
- Files keep their line endings: check with `file <path>` before editing; a CRLF file stays CRLF. Comments are UTF-8 (no cp1252 bytes): run `grep -nP '[\x80-\x9f]' <files>` before committing and expect nothing.
- No AI attribution in commits (no `Co-Authored-By`, no "Generated with" line). Stage files by explicit path, never `git add -A` or `git add .`.
- No database connections by the implementer.
- `npx tsc --noEmit -p tsconfig.json`: the only known errors are under `.next/` from the showcase pages. Any other error is new and must be fixed.
- Known flakes: a full `npx vitest run` has about 11 API route timeouts that pass alone. Verify per directory; re-run a failing route file alone before treating it as broken.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/ai-models/default-models.ts` | the code-preferred default ids (D543) |
| `src/lib/ai-models/model-lists.ts` | `ImageModels` / `VideoModels` from a catalog, cached; `paramDefaults`; `modelPickerLabel`; `withoutRetiredModel` (D542, D544) |
| `src/lib/ai-models/browser-catalog.ts` | `browserCatalog(catalog)`: drops draft models and their prices (shared by the route and the layout) |
| `src/hooks/queries/ai-models.ts` | `useAiCatalog(initialData?)`, `useImageModels()`, `useVideoModels()` |
| `src/components/models/model-catalog-gate.tsx` | renders children once the catalog is cached; loading and failure states |
| `src/components/models/retired-model-notice.tsx` | the retired notice, shared by the three focus views |
| `src/app/clients/[id]/layout.tsx` | reads the catalog on the server and wraps every client page in the gate |
| `src/lib/avatars/generation.ts`, `src/lib/composite/model.ts`, `src/lib/scripts/visualise/{constants,panel-inputs,maker}.ts`, `src/lib/image-gen/params/merge.ts` | image helpers take `images` |
| `src/lib/avatars/presenter.ts`, `src/lib/video-edit/record.ts`, `src/lib/video-edit/describe.ts`, `src/lib/video-gen/params/merge.ts` | video helpers take `videos` |
| `src/lib/canvas-store.ts`, `src/components/canvas/canvas-store-provider.tsx`, `src/lib/canvas-nodes.ts` | defaults and the retired switch from the lists; `retiredModelId` on node data |
| image and video components listed in Tasks 6–7 | read the hooks |

---

### Task 1: The model lists

**Files:**
- Create: `src/lib/ai-models/default-models.ts`
- Create: `src/lib/ai-models/model-lists.ts`
- Create: `src/lib/ai-models/browser-catalog.ts`
- Modify: `src/app/api/ai-models/route.ts`
- Test: `src/lib/ai-models/__tests__/model-lists.test.ts`, `src/lib/ai-models/__tests__/browser-catalog.test.ts`

**Interfaces:**
- Consumes: `AiCatalog`, `AiModel`, `AiModelStatus` (`src/lib/ai-models/types.ts`); `toImageClientSpec`, `toVideoClientSpec` (`to-spec.ts`); `ClientModelSpec` (`src/lib/image-gen/types.ts`); `VideoGenClientModelSpec` (`src/lib/video-gen/types.ts`); `ParamSpec`; test helpers `seededModelCatalog`, `withModel` (`src/lib/ai-models/test-catalog.ts`).
- Produces (later tasks use these names exactly):
  - `DEFAULT_IMAGE_MODEL_ID`, `DEFAULT_VIDEO_MODEL_ID` (default-models.ts)
  - `type ModelGroup<S> = { provider: string; label: string; models: S[] }`
  - `type ModelList<S>` with `all`, `get(id)`, `specOrDefault(id)`, `status(id)`, `replacedBy(id)`, `isOffered(id, ownModelId?)`, `groups(ownModelId?)`, `defaultId`, `liveOr(preferredId)`
  - `type ImageModels = ModelList<ClientModelSpec>`, `type VideoModels = ModelList<VideoGenClientModelSpec>`
  - `imageModelsFrom(catalog): ImageModels`, `videoModelsFrom(catalog): VideoModels`
  - `paramDefaults(params: ParamSpec[]): Record<string, unknown>`
  - `modelPickerLabel(spec: { label: string; providerLabel: string; pickerLabel?: string }): string`
  - `withoutRetiredModel<T extends { modelId?: string; params?: Record<string, unknown>; retiredModelId?: string }>(list: ModelList<…>, data: T): T`
  - `browserCatalog(catalog: AiCatalog): AiCatalog`

- [ ] **Step 1: Write the failing tests**

`src/lib/ai-models/__tests__/model-lists.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import {
  imageModelsFrom, videoModelsFrom, paramDefaults, modelPickerLabel, withoutRetiredModel,
} from "@/lib/ai-models/model-lists";
import { DEFAULT_IMAGE_MODEL_ID, DEFAULT_VIDEO_MODEL_ID } from "@/lib/ai-models/default-models";

const NANO_PRO = "gemini:gemini-3-pro-image";
const SUNBURST = "openai:gpt-image-2.5-sunburst";
const GPT1 = "openai:gpt-image-1"; // retired in the seed, replaced by Sunburst
const OMNI12 = "gemini:gemini-omni-1.2-flash";
const OMNI11 = "gemini:gemini-omni-1.1-flash";

describe("imageModelsFrom", () => {
  it("lists every non-draft image model in sort order, and only image models", () => {
    const images = imageModelsFrom(seededModelCatalog());
    const sorted = seededModelCatalog().models
      .filter((m) => m.kind === "image" && m.status !== "draft")
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => m.id);
    expect(images.all.map((m) => m.id)).toEqual(sorted);
    expect(images.get(NANO_PRO)?.label).toBe("Nano Banana Pro");
    expect(images.get(OMNI12)).toBeUndefined();
  });

  it("is the same object for the same catalog, and a new one for a new catalog", () => {
    const catalog = seededModelCatalog();
    expect(imageModelsFrom(catalog)).toBe(imageModelsFrom(catalog));
    expect(imageModelsFrom(withModel(catalog, NANO_PRO, { label: "X" }))).not.toBe(imageModelsFrom(catalog));
  });

  it("reports status and replacement", () => {
    const images = imageModelsFrom(seededModelCatalog());
    expect(images.status(GPT1)).toBe("retired");
    expect(images.replacedBy(GPT1)).toBe(SUNBURST);
    expect(images.status("nope:nope")).toBeNull();
    expect(images.replacedBy(NANO_PRO)).toBeNull();
  });

  it("offers live models, and a hidden model only to its own node", () => {
    const images = imageModelsFrom(withModel(seededModelCatalog(), NANO_PRO, { status: "hidden" }));
    expect(images.isOffered(SUNBURST)).toBe(true);
    expect(images.isOffered(NANO_PRO)).toBe(false);
    expect(images.isOffered(NANO_PRO, NANO_PRO)).toBe(true);
    expect(images.isOffered(GPT1, GPT1)).toBe(false);
    expect(images.isOffered("nope:nope")).toBe(false);
  });

  it("groups the offered models by provider label, in sort order", () => {
    const catalog = withModel(seededModelCatalog(), NANO_PRO, { status: "hidden" });
    const images = imageModelsFrom(catalog);
    const ids = (g: ReturnType<typeof images.groups>) => g.flatMap((x) => x.models.map((m) => m.id));
    expect(ids(images.groups())).not.toContain(NANO_PRO);
    expect(ids(images.groups())).not.toContain(GPT1);
    expect(ids(images.groups(NANO_PRO))).toContain(NANO_PRO);
    expect(images.groups().map((g) => g.label)).toEqual(["OpenAI", "Gemini", "Seedream"]);
    expect(images.groups()[0].provider).toBe("openai");
  });

  it("defaults to the code's preference while it is live, else the first live model", () => {
    expect(imageModelsFrom(seededModelCatalog()).defaultId).toBe(DEFAULT_IMAGE_MODEL_ID);
    const hidden = imageModelsFrom(withModel(seededModelCatalog(), DEFAULT_IMAGE_MODEL_ID, { status: "hidden" }));
    expect(hidden.defaultId).toBe(hidden.groups()[0].models[0].id);
    expect(hidden.liveOr(DEFAULT_IMAGE_MODEL_ID)).toBe(hidden.defaultId);
    expect(hidden.liveOr(SUNBURST)).toBe(SUNBURST);
  });

  it("specOrDefault falls back to the default's spec for an unknown id", () => {
    const images = imageModelsFrom(seededModelCatalog());
    expect(images.specOrDefault("nope:nope").id).toBe(DEFAULT_IMAGE_MODEL_ID);
    expect(images.specOrDefault(undefined).id).toBe(DEFAULT_IMAGE_MODEL_ID);
    expect(images.specOrDefault(SUNBURST).id).toBe(SUNBURST);
  });
});

describe("videoModelsFrom", () => {
  it("lists video models, defaults to Omni 1.2, and labels chips without the provider", () => {
    const videos = videoModelsFrom(seededModelCatalog());
    expect(videos.defaultId).toBe(DEFAULT_VIDEO_MODEL_ID);
    expect(videos.get(OMNI11)?.imageInputs.maxReferenceImages).toBe(12);
    expect(modelPickerLabel(videos.get(OMNI12)!)).toBe("Omni 1.2");
    expect(modelPickerLabel({ label: "Veo 3.1 Fast", providerLabel: "Veo" })).toBe("3.1 Fast");
    expect(modelPickerLabel({ label: "Other", providerLabel: "Veo" })).toBe("Other");
  });
});

describe("paramDefaults", () => {
  it("keeps every param with a default, and none without", () => {
    expect(paramDefaults([
      { name: "a", defaultValue: "x" }, { name: "b", defaultValue: 0 }, { name: "c", defaultValue: null },
    ] as never)).toEqual({ a: "x", b: 0 });
  });
});

describe("withoutRetiredModel", () => {
  const images = imageModelsFrom(seededModelCatalog());

  it("moves a retired model to its live replacement, with its defaults, and remembers the old id", () => {
    const out = withoutRetiredModel(images, { title: "t", modelId: GPT1, params: { quality: "high" } });
    expect(out).toEqual({
      title: "t", modelId: SUNBURST, params: paramDefaults(images.get(SUNBURST)!.params), retiredModelId: GPT1,
    });
  });

  it("uses the default when the replacement is not live", () => {
    const catalog = withModel(seededModelCatalog(), SUNBURST, { status: "hidden" });
    const out = withoutRetiredModel(imageModelsFrom(catalog), { modelId: GPT1 });
    expect(out.modelId).toBe(DEFAULT_IMAGE_MODEL_ID);
  });

  it("returns the same object for a live, hidden, unknown or missing model", () => {
    const hidden = imageModelsFrom(withModel(seededModelCatalog(), NANO_PRO, { status: "hidden" }));
    for (const data of [{ modelId: SUNBURST }, { modelId: "nope:nope" }, {}]) {
      expect(withoutRetiredModel(images, data)).toBe(data);
    }
    const onHidden = { modelId: NANO_PRO };
    expect(withoutRetiredModel(hidden, onHidden)).toBe(onHidden);
  });
});
```

`src/lib/ai-models/__tests__/browser-catalog.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { browserCatalog } from "@/lib/ai-models/browser-catalog";

describe("browserCatalog", () => {
  it("drops draft models and their prices, and keeps the rest as they are", () => {
    const id = "gemini:gemini-3-pro-image";
    const catalog = withModel(seededModelCatalog(), id, { status: "draft" });
    const out = browserCatalog(catalog);
    expect(out.models.some((m) => m.id === id)).toBe(false);
    expect(out.prices.some((p) => p.modelId === id)).toBe(false);
    expect(out.models.length).toBe(catalog.models.length - 1);
    expect(out.prices.length).toBe(catalog.prices.filter((p) => p.modelId !== id).length);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/ai-models/__tests__/model-lists.test.ts src/lib/ai-models/__tests__/browser-catalog.test.ts`
Expected: FAIL, "Failed to resolve import" for the new modules.

- [ ] **Step 3: Write the implementation**

`src/lib/ai-models/default-models.ts`:

```ts
// D543 — the models the app starts new work on. A preference, not a rule: the lists use it only
// while the catalog has it live, and otherwise start on the first live model in sort order.
// Client-safe.
export const DEFAULT_IMAGE_MODEL_ID = "gemini:gemini-3-pro-image";
export const DEFAULT_VIDEO_MODEL_ID = "gemini:gemini-omni-1.2-flash";
```

`src/lib/ai-models/model-lists.ts`:

```ts
// D542 — the image and video models as every screen reads them, built from the catalog. Pure and
// client-safe: the browser builds them from the session's one catalog query, the server from
// getAiCatalog(). Cached per catalog object, so a card asking for its model costs a map lookup.
import type { ClientModelSpec, ParamSpec } from "@/lib/image-gen/types";
import type { VideoGenClientModelSpec } from "@/lib/video-gen/types";
import { DEFAULT_IMAGE_MODEL_ID, DEFAULT_VIDEO_MODEL_ID } from "./default-models";
import { toImageClientSpec, toVideoClientSpec } from "./to-spec";
import type { AiCatalog, AiModel, AiModelStatus } from "./types";

type Spec = { id: string; provider: string; providerLabel: string; params: ParamSpec[] };

export type ModelGroup<S> = { provider: string; label: string; models: S[] };

export type ModelList<S extends Spec> = {
  /** Every model of this kind the catalog holds, draft excluded, in sort order. */
  all: readonly S[];
  get: (id: string | null | undefined) => S | undefined;
  /** For rendering only: the model, or the default's when the id is unknown or missing. */
  specOrDefault: (id: string | null | undefined) => S;
  status: (id: string | null | undefined) => AiModelStatus | null;
  replacedBy: (id: string | null | undefined) => string | null;
  /** Live, or hidden and already the model of the thing asking (`ownModelId`). */
  isOffered: (id: string | null | undefined, ownModelId?: string | null) => boolean;
  /** The offered models grouped by provider label, groups and models in sort order. */
  groups: (ownModelId?: string | null) => ModelGroup<S>[];
  /** D543 — the code's preferred default while it is live, else the first live model. */
  defaultId: string;
  /** `preferredId` while it is live, else `defaultId`. */
  liveOr: (preferredId: string) => string;
};

export type ImageModels = ModelList<ClientModelSpec>;
export type VideoModels = ModelList<VideoGenClientModelSpec>;

function buildList<S extends Spec>(
  catalog: AiCatalog,
  kind: "image" | "video",
  toSpec: (m: AiModel) => S,
  preferredDefault: string,
): ModelList<S> {
  const rows = catalog.models
    .filter((m) => m.kind === kind && m.status !== "draft")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const rowById = new Map(rows.map((m) => [m.id, m]));
  const all = rows.map(toSpec);
  const specById = new Map(all.map((s) => [s.id, s]));
  const status = (id: string | null | undefined) => (id ? rowById.get(id)?.status ?? null : null);
  const isLive = (id: string) => status(id) === "live";
  const firstLive = rows.find((m) => m.status === "live")?.id;
  const defaultId = isLive(preferredDefault)
    ? preferredDefault
    : firstLive ?? (rowById.has(preferredDefault) ? preferredDefault : rows[0]?.id ?? preferredDefault);
  const isOffered = (id: string | null | undefined, ownModelId?: string | null) => {
    const s = status(id);
    return s === "live" || (s === "hidden" && id === ownModelId);
  };
  return {
    all,
    get: (id) => (id ? specById.get(id) : undefined),
    // The gate (ModelCatalogGate) only renders when the default exists, so this never misses.
    specOrDefault: (id) => (id && specById.get(id)) || specById.get(defaultId)!,
    status,
    replacedBy: (id) => (id ? rowById.get(id)?.replacedBy ?? null : null),
    isOffered,
    groups: (ownModelId) => {
      const offered = all.filter((s) => isOffered(s.id, ownModelId));
      const labels: string[] = [];
      for (const s of offered) if (!labels.includes(s.providerLabel)) labels.push(s.providerLabel);
      return labels.map((label) => {
        const models = offered.filter((s) => s.providerLabel === label);
        return { provider: models[0].provider, label, models };
      });
    },
    defaultId,
    liveOr: (preferredId) => (isLive(preferredId) ? preferredId : defaultId),
  };
}

const imageCache = new WeakMap<AiCatalog, ImageModels>();
const videoCache = new WeakMap<AiCatalog, VideoModels>();

export function imageModelsFrom(catalog: AiCatalog): ImageModels {
  let list = imageCache.get(catalog);
  if (!list) {
    list = buildList(catalog, "image", toImageClientSpec, DEFAULT_IMAGE_MODEL_ID);
    imageCache.set(catalog, list);
  }
  return list;
}

export function videoModelsFrom(catalog: AiCatalog): VideoModels {
  let list = videoCache.get(catalog);
  if (!list) {
    list = buildList(catalog, "video", toVideoClientSpec, DEFAULT_VIDEO_MODEL_ID);
    videoCache.set(catalog, list);
  }
  return list;
}

/** A model's params with a default value, as `{ name: default }`. */
export function paramDefaults(params: readonly ParamSpec[]): Record<string, unknown> {
  return Object.fromEntries(
    params
      .filter((p) => p.defaultValue !== null && p.defaultValue !== undefined)
      .map((p) => [p.name, p.defaultValue]),
  );
}

/**
 * Label for a picker chip under its provider's heading: "Veo 3.1 Fast" under "Veo" reads "3.1
 * Fast". The catalog's picker_label overrides it.
 */
export function modelPickerLabel(spec: { label: string; providerLabel: string; pickerLabel?: string }): string {
  if (spec.pickerLabel) return spec.pickerLabel;
  const prefix = `${spec.providerLabel} `;
  return spec.label.startsWith(prefix) ? spec.label.slice(prefix.length) : spec.label;
}

/**
 * D544 — a node saved on a retired model opens on its replacement (when that is live) or the
 * default, with that model's defaults, and keeps the old id in `retiredModelId` so its focus view
 * can say so. Any other data comes back as the same object, so nothing re-renders or saves.
 */
export function withoutRetiredModel<
  S extends Spec,
  T extends { modelId?: string; params?: Record<string, unknown>; retiredModelId?: string },
>(list: ModelList<S>, data: T): T {
  if (!data.modelId || list.status(data.modelId) !== "retired") return data;
  const replacement = list.replacedBy(data.modelId);
  const next = replacement && list.status(replacement) === "live" ? replacement : list.defaultId;
  return {
    ...data,
    modelId: next,
    params: paramDefaults(list.specOrDefault(next).params),
    retiredModelId: data.modelId,
  };
}
```

`src/lib/ai-models/browser-catalog.ts`:

```ts
// D529 — the catalog the browser gets: every model but drafts (the super admin's alone), with
// their prices. Shared by GET /api/ai-models and the client layout that seeds the browser cache.
// Pure and client-safe.
import type { AiCatalog } from "./types";

export function browserCatalog(catalog: AiCatalog): AiCatalog {
  const models = catalog.models.filter((m) => m.status !== "draft");
  const ids = new Set(models.map((m) => m.id));
  return { models, prices: catalog.prices.filter((p) => ids.has(p.modelId)) };
}
```

In `src/app/api/ai-models/route.ts`, replace the three filtering lines with `browserCatalog`:

```ts
import { apiError, apiOk } from "@/lib/api/route-helpers";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { getAiCatalog } from "@/lib/ai-models/catalog";
import { browserCatalog } from "@/lib/ai-models/browser-catalog";

export const dynamic = "force-dynamic";

// D529 — the catalog for the browser (browserCatalog). One request per session (useAiCatalog),
// never one per node.
export async function GET() {
  try {
    const caller = await resolveCallerContextOrNull();
    if (!caller) return apiError("Unauthorized.", 401);
    return apiOk({ catalog: browserCatalog(await getAiCatalog()) });
  } catch (e) {
    console.error("[GET /api/ai-models] catalog read failed", e);
    return apiError("Could not load the models.", 500);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/ai-models src/app/api/ai-models`
Expected: PASS. If the seed's image group order is not `["OpenAI", "Gemini", "Seedream"]`, read the seed's `sort_order` and fix the test's expectation to the seed's real order, not the code.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-models/default-models.ts src/lib/ai-models/model-lists.ts src/lib/ai-models/browser-catalog.ts src/app/api/ai-models/route.ts src/lib/ai-models/__tests__/model-lists.test.ts src/lib/ai-models/__tests__/browser-catalog.test.ts
git commit -m "feat(models): image and video model lists built from the catalog (D542)"
```

---

### Task 2: The hooks, the gate and the client layout

**Files:**
- Modify: `src/hooks/queries/ai-models.ts`
- Create: `src/components/models/model-catalog-gate.tsx`
- Create: `src/app/clients/[id]/layout.tsx`
- Test: `src/hooks/queries/__tests__/ai-models.test.tsx`, `src/components/models/__tests__/model-catalog-gate.test.tsx`

**Interfaces:**
- Consumes: `imageModelsFrom`, `videoModelsFrom`, `browserCatalog` (Task 1); `getAiCatalog` (`src/lib/ai-models/catalog.ts`, server-only); `resolveCallerContextOrNull` (`src/lib/dal`).
- Produces: `useAiCatalog(initialData?: AiCatalog)`, `useImageModels(): ImageModels`, `useVideoModels(): VideoModels`, `<ModelCatalogGate initialCatalog?>`. Every later task's component calls `useImageModels()` / `useVideoModels()` and may assume the gate is above it.

- [ ] **Step 1: Write the failing tests**

`src/hooks/queries/__tests__/ai-models.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom, videoModelsFrom } from "@/lib/ai-models/model-lists";

const catalogFn = vi.fn();
vi.mock("@/services/ai-models.service", () => ({ aiModelsService: { catalog: () => catalogFn() } }));

import { useAiCatalog, useImageModels, useVideoModels } from "../ai-models";

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useAiCatalog", () => {
  it("uses the catalog it is given without a request", () => {
    const catalog = seededModelCatalog();
    const { result } = renderHook(() => useAiCatalog(catalog), { wrapper: wrapper() });
    expect(result.current.data).toBe(catalog);
    expect(catalogFn).not.toHaveBeenCalled();
  });
});

describe("useImageModels / useVideoModels", () => {
  it("return the cached lists for the session's catalog", async () => {
    const catalog = seededModelCatalog();
    catalogFn.mockResolvedValue(catalog);
    const w = wrapper();
    const gate = renderHook(() => useAiCatalog(), { wrapper: w });
    await waitFor(() => expect(gate.result.current.data).toBe(catalog));
    const { result } = renderHook(() => ({ images: useImageModels(), videos: useVideoModels() }), { wrapper: w });
    expect(result.current.images).toBe(imageModelsFrom(catalog));
    expect(result.current.videos).toBe(videoModelsFrom(catalog));
  });

  it("throw outside the gate, when nothing is cached", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    catalogFn.mockReturnValue(new Promise(() => {}));
    expect(() => renderHook(() => useImageModels(), { wrapper: wrapper() })).toThrow("ModelCatalogGate");
  });
});
```

Note: the two `renderHook` calls in the second test share one `QueryClient` because they share the wrapper `w`, which is created once.

`src/components/models/__tests__/model-catalog-gate.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";

const catalogFn = vi.fn();
vi.mock("@/services/ai-models.service", () => ({ aiModelsService: { catalog: () => catalogFn() } }));

import { ModelCatalogGate } from "../model-catalog-gate";

const mount = (ui: React.ReactNode) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

describe("ModelCatalogGate", () => {
  it("renders its children at once with a catalog from the server", () => {
    mount(<ModelCatalogGate initialCatalog={seededModelCatalog()}><p>inside</p></ModelCatalogGate>);
    expect(screen.getByText("inside")).toBeInTheDocument();
    expect(catalogFn).not.toHaveBeenCalled();
  });

  it("waits for the catalog, then renders its children", async () => {
    catalogFn.mockResolvedValue(seededModelCatalog());
    mount(<ModelCatalogGate><p>inside</p></ModelCatalogGate>);
    expect(screen.queryByText("inside")).toBeNull();
    await waitFor(() => expect(screen.getByText("inside")).toBeInTheDocument());
  });

  it("says plainly when the models can't load, and tries again", async () => {
    catalogFn.mockRejectedValueOnce(new Error("HTTP 500 raw")).mockResolvedValue(seededModelCatalog());
    mount(<ModelCatalogGate><p>inside</p></ModelCatalogGate>);
    await waitFor(() => expect(screen.getByText("Could not load the models.")).toBeInTheDocument());
    expect(screen.queryByText(/raw/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("inside")).toBeInTheDocument());
  });

  it("treats a catalog with no image or no video model as a failure", async () => {
    const c = seededModelCatalog();
    catalogFn.mockResolvedValue({ ...c, models: c.models.filter((m) => m.kind !== "video") });
    mount(<ModelCatalogGate><p>inside</p></ModelCatalogGate>);
    await waitFor(() => expect(screen.getByText("Could not load the models.")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/hooks/queries/__tests__/ai-models.test.tsx src/components/models`
Expected: FAIL (no `useImageModels` export; no gate module).

- [ ] **Step 3: Write the implementation**

`src/hooks/queries/ai-models.ts`, whole file:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { aiModelsService } from "@/services/ai-models.service";
import { currentPrice } from "@/lib/ai-models/pricing";
import { imageModelsFrom, videoModelsFrom, type ImageModels, type VideoModels } from "@/lib/ai-models/model-lists";
import type { AiCatalog, AiModelPrice } from "@/lib/ai-models/types";

// D529 — the model catalog, through TanStack Query. One request per session: pickers and focus
// views select from this cache, never fetch per node (performance rule 1).
export const aiModelKeys = {
  all: ["ai-models"] as const,
  catalog: () => [...aiModelKeys.all, "catalog"] as const,
};

const CATALOG_STALE_MS = 5 * 60_000;

/** `initialData` is the catalog the server already read (the client layout's gate). */
export function useAiCatalog(initialData?: AiCatalog) {
  return useQuery({
    queryKey: aiModelKeys.catalog(),
    queryFn: () => aiModelsService.catalog(),
    staleTime: CATALOG_STALE_MS,
    initialData,
  });
}

function useCachedCatalog(): AiCatalog {
  const { data } = useAiCatalog();
  if (!data) throw new Error("useImageModels / useVideoModels need <ModelCatalogGate> above them");
  return data;
}

/** D542 — the image models, below <ModelCatalogGate>. The same object for the same catalog. */
export function useImageModels(): ImageModels {
  return imageModelsFrom(useCachedCatalog());
}

/** D542 — the video models, below <ModelCatalogGate>. */
export function useVideoModels(): VideoModels {
  return videoModelsFrom(useCachedCatalog());
}

/** D534 — a model's price row valid now, selected from the session's one catalog query. `error`
 *  is a failed read with nothing cached, so a paid button can say so rather than "no price". */
export function useModelPrice(modelId: string): { price: AiModelPrice | null; loading: boolean; error: boolean } {
  const catalog = useAiCatalog();
  return {
    price: catalog.data ? currentPrice(catalog.data, modelId, new Date()) : null,
    loading: catalog.isPending,
    error: catalog.isError && !catalog.data,
  };
}
```

`src/components/models/model-catalog-gate.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAiCatalog } from "@/hooks/queries/ai-models";
import { imageModelsFrom, videoModelsFrom } from "@/lib/ai-models/model-lists";
import type { AiCatalog } from "@/lib/ai-models/types";

// D542 — every client page renders below this, so a picker or focus view can read the model
// lists (useImageModels / useVideoModels) without a loading state of its own. With the catalog
// the server read, the children render at once and no request is made.
function usable(catalog: AiCatalog | undefined): boolean {
  if (!catalog) return false;
  const images = imageModelsFrom(catalog);
  const videos = videoModelsFrom(catalog);
  return Boolean(images.get(images.defaultId) && videos.get(videos.defaultId));
}

export function ModelCatalogGate({ initialCatalog, children }: { initialCatalog?: AiCatalog; children: ReactNode }) {
  const catalog = useAiCatalog(initialCatalog);
  if (usable(catalog.data)) return <>{children}</>;
  if (catalog.isPending || catalog.isFetching) {
    return <div className="flex flex-1 items-center justify-center p-12 text-sm text-muted-foreground">Loading…</div>;
  }
  if (catalog.data) console.error("[models] the catalog has no live image or video model");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-sm text-muted-foreground">
      <p>Could not load the models.</p>
      <Button variant="outline" size="sm" onClick={() => void catalog.refetch()}>Try again</Button>
    </div>
  );
}
```

`src/app/clients/[id]/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import { getAiCatalog } from "@/lib/ai-models/catalog";
import { browserCatalog } from "@/lib/ai-models/browser-catalog";
import { resolveCallerContextOrNull } from "@/lib/dal";
import { ModelCatalogGate } from "@/components/models/model-catalog-gate";

// D542 — every client page (canvas, avatars, scripts) shows models, so the catalog is read here
// once (cached 60 s on the server) and seeds the browser's cache: no page waits on its own
// request. Signed out, the pages handle the redirect themselves, so nothing is read.
export default async function ClientLayout({ children }: { children: ReactNode }) {
  const caller = await resolveCallerContextOrNull();
  if (!caller) return <>{children}</>;
  const catalog = await getAiCatalog().then(browserCatalog).catch((e) => {
    console.error("[clients layout] catalog read failed", e);
    return undefined;
  });
  return <ModelCatalogGate initialCatalog={catalog}>{children}</ModelCatalogGate>;
}
```

Check `src/app/loading-boundaries.test.ts` still passes (a layout is not a loading file, so it should).

Test mock for later tasks (copy into any component test that mounts a reader of the hooks):

```ts
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom, videoModelsFrom } from "@/lib/ai-models/model-lists";
vi.mock("@/hooks/queries/ai-models", async (orig) => ({
  ...(await orig<typeof import("@/hooks/queries/ai-models")>()),
  useImageModels: () => imageModelsFrom(seededModelCatalog()),
  useVideoModels: () => videoModelsFrom(seededModelCatalog()),
}));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/hooks/queries src/components/models src/app/loading-boundaries.test.ts src/components/avatars/__tests__/avatar-credit-cost.test.tsx`
Expected: PASS.
Run: `npx tsc --noEmit -p tsconfig.json` — only the known `.next/` errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/queries/ai-models.ts src/components/models/model-catalog-gate.tsx "src/app/clients/[id]/layout.tsx" src/hooks/queries/__tests__/ai-models.test.tsx src/components/models/__tests__/model-catalog-gate.test.tsx
git commit -m "feat(models): client pages read the model lists below one catalog gate (D542)"
```

---

### Task 3: Image helpers take the image list

**Files:**
- Modify: `src/lib/avatars/generation.ts` (`avatarImageParams`, `estimateAvatarImageCostUsd`, `estimateAvatarImageCredits`, `estimateSheetCredits`, `seedanceFaceModelLabel`)
- Modify: `src/lib/composite/model.ts` (`compositePickerModelId`)
- Modify: `src/lib/scripts/visualise/constants.ts` (`PANEL_MODEL_IDS` → `panelModelIds`, `isPanelModel`)
- Modify: `src/lib/scripts/visualise/panel-inputs.ts` (`panelReferenceCap`, `estimatePanelCredits`)
- Modify: `src/lib/scripts/visualise/maker.ts` (`estimateMakeCredits` and any helper that calls the estimators)
- Modify: `src/lib/image-gen/params/merge.ts` (use `paramDefaults`)
- Modify every caller: `src/lib/image-gen/billed-run.ts`, `src/app/api/clients/[id]/scripts/[scriptId]/panels/[shotId]/route.ts`, `src/hooks/use-visualise-model.ts`, `src/components/avatars/avatar-describe-panel.tsx`, `src/components/avatars/avatar-sheet-generate.tsx`, `src/components/visualise/cast-slot-ai-maker.tsx`, `src/components/visualise/cast-slot-photo-maker.tsx`, `src/components/visualise/visualise-view.tsx`, `src/components/nodes/composite-focus-view.tsx` (only the `compositePickerModelId` call)
- Test: `src/lib/avatars/__tests__/generation.test.ts` (create if absent), `src/lib/composite/__tests__/model.test.ts`, `src/lib/scripts/visualise/__tests__/panel-inputs.test.ts`, `src/lib/scripts/visualise/__tests__/maker.test.ts`, and the panels and plate route tests

**Interfaces:**
- Consumes: `ImageModels`, `imageModelsFrom`, `paramDefaults` (Task 1); `useImageModels` (Task 2).
- Produces (new signatures; `images` first):
  - `avatarImageParams(images: ImageModels, modelId: string, aspect: string): Record<string, unknown> | null`
  - `estimateAvatarImageCostUsd(images, price, input)` / `estimateAvatarImageCredits(images, price, input)` — `input` unchanged
  - `estimateSheetCredits(images, price, modelId)`
  - `seedanceFaceModelLabel(images: ImageModels): string`
  - `compositePickerModelId(images: ImageModels, stored: string | undefined): string`
  - `panelModelIds(images: ImageModels, ownModelId?: string | null): string[]` (replaces `PANEL_MODEL_IDS`)
  - `isPanelModel(images: ImageModels, modelId: string, ownModelId?: string | null): boolean`
  - `panelReferenceCap(images: ImageModels, modelId?: string): number`
  - `estimatePanelCredits(images, price, referenceCount, aspect, modelId?)`
  - `estimateMakeCredits(images, …)` (the existing arguments after `images`)
  - `smartMergeParams(currentParams, newModel)` — signature unchanged

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/avatars/__tests__/generation.test.ts` (create with this content if absent; keep any existing tests and change their calls to the new signatures):

```ts
import { describe, it, expect } from "vitest";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom, paramDefaults } from "@/lib/ai-models/model-lists";
import { avatarImageParams, seedanceFaceModelLabel } from "@/lib/avatars/generation";
import { SEEDANCE_FACE_MODEL_ID } from "@/lib/avatars/constants";

describe("avatar image helpers read the catalog's list", () => {
  const images = imageModelsFrom(seededModelCatalog());

  it("avatarImageParams: the model's catalog defaults with the aspect forced; null when unknown", () => {
    const id = "gemini:gemini-3-pro-image";
    expect(avatarImageParams(images, id, "16:9")).toEqual({ ...paramDefaults(images.get(id)!.params), aspect_ratio: "16:9" });
    expect(avatarImageParams(images, "nope:nope", "16:9")).toBeNull();
  });

  it("seedanceFaceModelLabel: the catalog's label", () => {
    const renamed = imageModelsFrom(withModel(seededModelCatalog(), SEEDANCE_FACE_MODEL_ID, { label: "Renamed" }));
    expect(seedanceFaceModelLabel(renamed)).toBe("Renamed");
  });
});
```

Add to `src/lib/scripts/visualise/__tests__/panel-inputs.test.ts`:

```ts
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom } from "@/lib/ai-models/model-lists";
import { panelModelIds, isPanelModel } from "@/lib/scripts/visualise/constants";

describe("panel models from the catalog", () => {
  it("panelReferenceCap reads the catalog's maxReferenceImages, less the style slot", () => {
    const c = seededModelCatalog();
    const id = "gemini:gemini-nano-banana-2.1";
    const row = c.models.find((m) => m.id === id)!;
    const images = imageModelsFrom(withModel(c, id, { capabilities: { ...row.capabilities, maxReferenceImages: 5 } }));
    expect(panelReferenceCap(images, id)).toBe(4);
    expect(panelReferenceCap(images, "nope:nope")).toBe(0);
  });

  it("offers live OpenAI and Gemini models, and a hidden one only to its own panel", () => {
    const id = "gemini:gemini-nano-banana-2.1";
    const images = imageModelsFrom(withModel(seededModelCatalog(), id, { status: "hidden" }));
    expect(panelModelIds(images)).not.toContain(id);
    expect(panelModelIds(images, id)).toContain(id);
    expect(panelModelIds(images).every((m) => /^(openai|gemini):/.test(m))).toBe(true);
    expect(panelModelIds(images)).not.toContain("openai:gpt-image-1");
    expect(isPanelModel(images, id)).toBe(false);
    expect(isPanelModel(images, id, id)).toBe(true);
    expect(isPanelModel(images, "seedream:seedream-5-0-lite")).toBe(false);
  });
});
```

Add to `src/lib/composite/__tests__/model.test.ts` (replace any existing `compositePickerModelId` test):

```ts
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom } from "@/lib/ai-models/model-lists";

describe("compositePickerModelId", () => {
  const images = imageModelsFrom(seededModelCatalog());
  it("keeps a stored model the composite may use, else the default", () => {
    expect(compositePickerModelId(images, "gemini:gemini-3-pro-image")).toBe("gemini:gemini-3-pro-image");
    expect(compositePickerModelId(images, "nope:nope")).toBe(COMPOSITE_DEFAULT_MODEL_ID);
    expect(compositePickerModelId(images, undefined)).toBe(COMPOSITE_DEFAULT_MODEL_ID);
    expect(compositePickerModelId(images, "openai:gpt-image-1")).toBe(COMPOSITE_DEFAULT_MODEL_ID);
  });
  it("keeps its own hidden model, and moves off a default that isn't live", () => {
    const hidden = imageModelsFrom(withModel(seededModelCatalog(), COMPOSITE_DEFAULT_MODEL_ID, { status: "hidden" }));
    expect(compositePickerModelId(hidden, COMPOSITE_DEFAULT_MODEL_ID)).toBe(COMPOSITE_DEFAULT_MODEL_ID);
    expect(compositePickerModelId(hidden, undefined)).toBe(hidden.defaultId);
  });
});
```

In the panels route test (`src/app/api/clients/[id]/scripts/[scriptId]/panels/[shotId]/route.test.ts`) add one case: a body whose `modelId` is a live Seedream model returns 400 with `"This model isn't available. Pick another."` and reserves nothing. Follow the file's existing request and mock pattern.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/avatars src/lib/composite src/lib/scripts/visualise`
Expected: FAIL (old signatures; `panelModelIds` missing).

- [ ] **Step 3: Write the implementation**

`src/lib/avatars/generation.ts`: replace the client-models import with
`import { paramDefaults, type ImageModels } from "@/lib/ai-models/model-lists";` and change:

```ts
export function estimateSheetCredits(images: ImageModels, price: AiModelPrice | null, modelId: string): number | null {
  return estimateAvatarImageCredits(images, price, { modelId, aspect: AVATAR_SHEET_ASPECT, referenceCount: 1 });
}

/** The model's own defaults with the aspect ratio forced. Null for a model the catalog lacks. */
export function avatarImageParams(images: ImageModels, modelId: string, aspect: string): Record<string, unknown> | null {
  const model = images.get(modelId);
  if (!model) return null;
  return { ...paramDefaults(model.params), aspect_ratio: aspect };
}

export function estimateAvatarImageCostUsd(
  images: ImageModels,
  price: AiModelPrice | null,
  input: { modelId: string; aspect: string; referenceCount: number },
): number | null {
  const params = avatarImageParams(images, input.modelId, input.aspect);
  // …rest of the body unchanged
}

export function estimateAvatarImageCredits(
  images: ImageModels,
  price: AiModelPrice | null,
  input: { modelId: string; aspect: string; referenceCount: number },
): number | null {
  const usd = estimateAvatarImageCostUsd(images, price, input);
  return usd === null ? null : usdToFinalCredits(usd);
}

/** The display name of the one model Seedance accepts — from the catalog, so it is named once. */
export function seedanceFaceModelLabel(images: ImageModels): string {
  return images.get(SEEDANCE_FACE_MODEL_ID)?.label ?? "Seedream 5.0 Lite";
}
```

(The fallback string is shown only if the catalog lost the row; it must never be an id.)

`src/lib/composite/model.ts`: drop the client-models import, import `type ImageModels`, and:

```ts
/** What the picker shows as selected: the stored model while the composite may use it (live, or
 *  hidden and already this node's), else the default while live, else the catalog's default. */
export function compositePickerModelId(images: ImageModels, stored: string | undefined): string {
  return stored && images.isOffered(stored, stored) ? stored : images.liveOr(COMPOSITE_DEFAULT_MODEL_ID);
}
```

`src/lib/scripts/visualise/constants.ts`: drop the client-models import and replace `PANEL_MODEL_IDS` / `isPanelModel` with:

```ts
import type { ImageModels } from "@/lib/ai-models/model-lists";

/** The panel models on offer (D424): OpenAI and Gemini, live, plus a hidden one a panel already uses. */
export function panelModelIds(images: ImageModels, ownModelId?: string | null): string[] {
  return images.all
    .filter((m) => (m.provider === "openai" || m.provider === "gemini") && images.isOffered(m.id, ownModelId))
    .map((m) => m.id);
}
export function isPanelModel(images: ImageModels, modelId: string, ownModelId?: string | null): boolean {
  return panelModelIds(images, ownModelId).includes(modelId);
}
```

`src/lib/scripts/visualise/panel-inputs.ts`: drop the client-models import, import `type ImageModels`, and:

```ts
export function panelReferenceCap(images: ImageModels, modelId: string = PANEL_MODEL_ID): number {
  return Math.max(0, (images.get(modelId)?.maxReferenceImages ?? 0) - 1);
}

export function estimatePanelCredits(
  images: ImageModels,
  price: AiModelPrice | null,
  referenceCount: number,
  aspect: string,
  modelId: string = PANEL_MODEL_ID,
): number | null {
  return estimateAvatarImageCredits(images, price, { modelId, aspect, referenceCount: referenceCount + 1 });
}
```

Grep for other `panelReferenceCap(` calls inside `panel-inputs.ts` itself (e.g. in `panelInputs`); if `panelInputs` calls it, add `images` to `panelInputs`'s input object (`images: ImageModels`) and pass it through. Update `PanelInputs` callers accordingly (the panels route and `use-visualise-model.ts`).

`src/lib/scripts/visualise/maker.ts`: add `images: ImageModels` as the first argument of `estimateMakeCredits` and pass it to `estimateAvatarImageCredits` / `estimateSheetCredits`.

`src/lib/image-gen/params/merge.ts`: replace `import { defaultsForModel } from "../client-models";` with `import { paramDefaults } from "@/lib/ai-models/model-lists";` and `const newDefaults = defaultsForModel(newModel);` with `const newDefaults = paramDefaults(newModel.params);`.

Callers:
- `src/lib/image-gen/billed-run.ts`: it already has the catalog for `imageRun(catalog, …)`. Build `const images = imageModelsFrom(catalog);` once and pass it to `avatarImageParams` and `estimateAvatarImageCostUsd`.
- Panels route: build `images` from the catalog it loads (add `getAiCatalog()` to its existing `Promise.all` if it doesn't load one). Remove the `isPanelModel` Zod `.refine` from the module-level schema; after parsing, refuse with `apiError(MODEL_UNAVAILABLE_MESSAGE, 400)` (from `@/lib/ai-models/runnable`) when `!isPanelModel(images, modelId, storedPanelModelId)`, where `storedPanelModelId` is the shot's current panel model if the route already reads it, else `null`. The refusal must come before any reservation or take insert. Pass `images` to `panelReferenceCap` / `panelInputs`.
- Components and `use-visualise-model.ts`: `const images = useImageModels();` at the top of the component/hook body, passed to each changed call. Put `images` in any `useMemo` dependency list that now reads it.
- `visualise-view.tsx`: replace `PANEL_MODEL_IDS` with `panelModelIds(images, currentPanelModelId)`, where `currentPanelModelId` is the model the view currently has selected (the same value it passes as `value` to `AvatarModelSelect`).
- `composite-focus-view.tsx`: `compositePickerModelId(images, stored)` with `const images = useImageModels();`. Leave the file's other `imageGenClientModelMap` reads for Task 6.

Update any other existing test that calls a changed helper to pass `imageModelsFrom(seededModelCatalog())` first. Find them with:
`grep -rln "avatarImageParams\|estimateAvatarImage\|estimateSheetCredits\|seedanceFaceModelLabel\|compositePickerModelId\|PANEL_MODEL_IDS\|isPanelModel\|panelReferenceCap\|estimatePanelCredits\|estimateMakeCredits" src trigger`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/avatars src/lib/composite src/lib/scripts src/lib/image-gen src/components/avatars src/components/visualise src/hooks "src/app/api/clients"`
Expected: PASS (re-run a timed-out route file alone).
Run: `npx tsc --noEmit -p tsconfig.json` — only the known `.next/` errors.

- [ ] **Step 5: Commit** (stage every file you changed, by path)

```bash
git add src/lib/avatars/generation.ts src/lib/composite/model.ts src/lib/scripts/visualise/constants.ts src/lib/scripts/visualise/panel-inputs.ts src/lib/scripts/visualise/maker.ts src/lib/image-gen/params/merge.ts src/lib/image-gen/billed-run.ts "src/app/api/clients/[id]/scripts/[scriptId]/panels/[shotId]/route.ts" src/hooks/use-visualise-model.ts src/components/avatars/avatar-describe-panel.tsx src/components/avatars/avatar-sheet-generate.tsx src/components/visualise/cast-slot-ai-maker.tsx src/components/visualise/cast-slot-photo-maker.tsx src/components/visualise/visualise-view.tsx src/components/nodes/composite-focus-view.tsx <each test file you changed>
git commit -m "refactor(models): image helpers take the catalog's image list (D542)"
```

---

### Task 4: Video helpers take the video list

**Files:**
- Modify: `src/lib/avatars/presenter.ts` (`unavailableModelsFor`)
- Modify: `src/lib/video-edit/record.ts` (`videoEditLimitsFor`, `videoEditTooLongMessage`, `videoEditTooManyReferencesMessage`, `videoEditGate`; `VIDEO_EDIT_DEFAULT_MODEL_ID` stays)
- Modify: `src/lib/video-edit/describe.ts`
- Modify: `src/lib/video-gen/params/merge.ts` (`smartMergeVideoParams`)
- Modify: `src/components/nodes/video-gen-params-panel.tsx` (only `hasParamsInGroup`)
- Modify every caller: `src/app/api/nodes/[id]/video-edit/route.ts`, `src/components/nodes/video-gen-edit-video.tsx`, `src/components/nodes/video-gen-focus-view.tsx` (only the calls of these helpers and `migrateVideoModelState`'s merge), and any other caller grep finds
- Test: `src/lib/avatars/__tests__/presenter.test.ts`, `src/lib/video-edit/__tests__/record.test.ts`, `src/lib/video-gen/__tests__/merge.test.ts`, `src/components/nodes/__tests__/video-gen-params-panel.test.tsx`, `src/app/api/nodes/[id]/video-edit/route.test.ts`

**Interfaces:**
- Consumes: `VideoModels`, `videoModelsFrom`, `paramDefaults`, `modelPickerLabel` (Task 1); `useVideoModels` (Task 2).
- Produces:
  - `unavailableModelsFor(videos: VideoModels, avatar): Record<string, string>`
  - `videoEditLimitsFor(videos: VideoModels, modelId: VideoEditModelId): { label; maxSeconds; maxReferences }`
  - `videoEditTooLongMessage(videos, modelId)`, `videoEditTooManyReferencesMessage(videos, modelId)`
  - `videoEditGate(videos, a)` — `a` unchanged
  - `smartMergeVideoParams(currentParams, newModel, previousModel?: VideoGenClientModelSpec)` — the third argument is now the previous model's spec, not its id
  - `hasParamsInGroup(model: VideoGenClientModelSpec | undefined, group)`

- [ ] **Step 1: Write the failing tests**

`src/lib/avatars/__tests__/presenter.test.ts`, replace the existing `unavailableModelsFor` tests' calls with `unavailableModelsFor(videos, avatar)` (`const videos = videoModelsFrom(seededModelCatalog())`) and add:

```ts
it("rules out models from the catalog's list, including one only the catalog has", () => {
  const c = seededModelCatalog();
  const seedance = c.models.find((m) => m.id === "seedance:seedance-2-5")!;
  const extra = { ...seedance, id: "seedance:seedance-9", label: "Seedance 9", sortOrder: 999 };
  const videos = videoModelsFrom({ ...c, models: [...c.models, extra] });
  // Use an avatar fixture from this file whose face Seedance refuses.
  expect(Object.keys(unavailableModelsFor(videos, realPersonAvatar))).toContain("seedance:seedance-9");
});
```

(`realPersonAvatar` stands for the fixture this test file already uses for a face Seedance refuses; use its real name.)

`src/lib/video-edit/__tests__/record.test.ts`, change existing calls to pass `videos` first, and add:

```ts
it("reads the edit limits from the catalog", () => {
  const c = seededModelCatalog();
  const id = "gemini:gemini-omni-1.2-flash";
  const row = c.models.find((m) => m.id === id)!;
  const caps = row.capabilities as { maxDurationSeconds: number; imageInputs: Record<string, unknown> };
  const videos = videoModelsFrom(withModel(c, id, {
    pickerLabel: "Omni X",
    capabilities: { ...caps, maxDurationSeconds: 12, imageInputs: { ...caps.imageInputs, maxReferenceImages: 7 } },
  }));
  expect(videoEditLimitsFor(videos, id)).toEqual({ label: "Omni X", maxSeconds: 12, maxReferences: 7 });
  expect(videoEditTooLongMessage(videos, id)).toBe("Omni X edits takes up to 12 seconds.");
});
```

`src/lib/video-gen/__tests__/merge.test.ts`: change calls that pass a previous model id to pass `videos.get(previousId)`; add:

```ts
it("keeps free text across a same-provider switch when given the previous model's spec", () => {
  const videos = videoModelsFrom(seededModelCatalog());
  const omni12 = videos.get("gemini:gemini-omni-1.2-flash")!;
  const omni11 = videos.get("gemini:gemini-omni-1.1-flash")!;
  const out = smartMergeVideoParams({ negative_prompt: "mine" }, omni12, omni11);
  expect(out.negative_prompt).toBe("mine");
  const veo = videos.get("veo:veo-3.1-fast");
  const fromVeo = smartMergeVideoParams({ negative_prompt: "mine" }, omni12, veo);
  expect(fromVeo.negative_prompt).toBe(paramDefaults(omni12.params).negative_prompt);
});
```

(If `veo:veo-3.1-fast` is retired and so absent from `videos.get`, it is still in `videos.all` because only drafts are dropped; `get` returns it. Keep the assertion.)

`src/components/nodes/__tests__/video-gen-params-panel.test.tsx`: change `hasParamsInGroup("<id>", group)` calls to `hasParamsInGroup(videos.get("<id>"), group)`, and add `expect(hasParamsInGroup(undefined, "advanced")).toBe(false)`. Add the hook mock from Task 2 if the file mounts `VideoGenParamsPanel`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/avatars/__tests__/presenter.test.ts src/lib/video-edit src/lib/video-gen/__tests__/merge.test.ts src/components/nodes/__tests__/video-gen-params-panel.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`src/lib/avatars/presenter.ts`: drop the client-models import, import `type VideoModels`, and:

```ts
/** The video models the presenter's face rules out, by model id, each with its reason (D299). */
export function unavailableModelsFor(videos: VideoModels, avatar: Pick<Avatar, "front">): Record<string, string> {
  const works = avatarWorksWith(avatar);
  const out: Record<string, string> = {};
  for (const spec of videos.all) {
    const family = FAMILY_BY_PROVIDER[spec.provider];
    if (family && !works.includes(family)) out[spec.id] = unavailableReason(family, avatar);
  }
  return out;
}
```

`src/lib/video-edit/record.ts`: import `modelPickerLabel` and `type VideoModels` from `@/lib/ai-models/model-lists`; keep the id-constant imports from client-models (ids stay in code); remove `modelPickerLabel` and `videoGenClientModelMap` from the client-models import. Then:

```ts
/**
 * What a model allows for an edit, read off its catalog row so it can't drift from generation:
 * the longest take and the most references. Edits were tested on 3–6 s takes on 1.1.
 */
export function videoEditLimitsFor(videos: VideoModels, modelId: VideoEditModelId): { label: string; maxSeconds: number; maxReferences: number } {
  const spec = videos.specOrDefault(modelId);
  return {
    label: modelPickerLabel(spec),
    maxSeconds: spec.maxDurationSeconds,
    maxReferences: spec.imageInputs.maxReferenceImages,
  };
}

export function videoEditTooLongMessage(videos: VideoModels, modelId: VideoEditModelId): string {
  const { label, maxSeconds } = videoEditLimitsFor(videos, modelId);
  return `${label} edits takes up to ${maxSeconds} seconds.`;
}
```

Do the same for `videoEditTooManyReferencesMessage` (add `videos` first) and `videoEditGate(videos, a)`, whose body calls the three with `videos`. Update `src/lib/video-edit/describe.ts` to take and pass `videos` the same way (add it as the first argument of whichever exported function calls `videoEditLimitsFor`).

`src/lib/video-gen/params/merge.ts`: replace the import with `import { paramDefaults } from "@/lib/ai-models/model-lists";` and:

```ts
export function smartMergeVideoParams(
  currentParams: Record<string, unknown>,
  newModel: VideoGenClientModelSpec,
  previousModel?: VideoGenClientModelSpec,
): Record<string, unknown> {
  const newDefaults = paramDefaults(newModel.params);
  const sameProvider = previousModel !== undefined && previousModel.provider === newModel.provider;
  // …rest unchanged
```

Update its doc comment's mention of `previousModelId` to `previousModel`.

`src/components/nodes/video-gen-params-panel.tsx`:

```ts
/** Whether a model has any visible params in a group — drives showing the Advanced section. */
export function hasParamsInGroup(model: VideoGenClientModelSpec | undefined, group: ParamGroup): boolean {
  return (model?.params ?? []).some((p: ParamSpec) => p.visible && p.group === group);
}
```

Leave the component body's own map read for Task 7.

Callers:
- `src/app/api/nodes/[id]/video-edit/route.ts`: it already loads the catalog; build `const videos = videoModelsFrom(catalog);` once and pass it to each record helper.
- `src/components/nodes/video-gen-edit-video.tsx`: `const videos = useVideoModels();` and pass it.
- `src/components/nodes/video-gen-focus-view.tsx`: `const videos = useVideoModels();` in the component; `unavailableModelsFor(videos, avatar)`; `hasParamsInGroup(videos.get(selectedModelId), "advanced")` (use the variable the call site already passes as the id). `migrateVideoModelState` is a plain function: add `videos: VideoModels` to its argument object, pass `videos` from both of its call sites, and inside it replace the map read and merge with:

```ts
  const nextModel = videos.get(nextModelId);
  const defaults = nextModel
    ? smartMergeVideoParams(currentParams, nextModel, videos.get(previousModelId))
    : {};
```

Find every other caller with `grep -rn "unavailableModelsFor\|videoEditLimitsFor\|videoEditTooLongMessage\|videoEditTooManyReferencesMessage\|videoEditGate\|smartMergeVideoParams\|hasParamsInGroup" src trigger` and update it (a component calls `useVideoModels()`; a server file builds the list from the catalog it already has, or adds `getAiCatalog()` to its existing `Promise.all`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/avatars src/lib/video-edit src/lib/video-gen src/components/nodes "src/app/api/nodes/[id]/video-edit"`
Expected: PASS.
Run: `npx tsc --noEmit -p tsconfig.json` — only the known `.next/` errors.

- [ ] **Step 5: Commit** (stage every changed file by path)

```bash
git add src/lib/avatars/presenter.ts src/lib/video-edit/record.ts src/lib/video-edit/describe.ts src/lib/video-gen/params/merge.ts src/components/nodes/video-gen-params-panel.tsx "src/app/api/nodes/[id]/video-edit/route.ts" src/components/nodes/video-gen-edit-video.tsx src/components/nodes/video-gen-focus-view.tsx <each test file you changed>
git commit -m "refactor(models): video helpers take the catalog's video list (D542)"
```

---

### Task 5: The canvas store opens nodes on catalog models

**Files:**
- Modify: `src/lib/canvas-nodes.ts` (`retiredModelId?: string` on `ImageGenNodeData`, `CompositeNodeData`, `VideoGenNodeData`)
- Modify: `src/lib/canvas-store.ts` (`createCanvasStore`, `defaultData`)
- Modify: `src/components/canvas/canvas-store-provider.tsx`
- Test: `src/lib/canvas-store.test.ts`

**Interfaces:**
- Consumes: `ImageModels`, `VideoModels`, `withoutRetiredModel` (Task 1); `useImageModels`, `useVideoModels` (Task 2); `COMPOSITE_DEFAULT_MODEL_ID` (`src/lib/composite/model.ts`).
- Produces:
  - `type CanvasModels = { images: ImageModels; videos: VideoModels }` exported from `src/lib/canvas-store.ts`
  - `createCanvasStore(initialNodes?, initialEdges?, initialCanvasName?, models?: CanvasModels)` — without `models` (tests), nodes load as saved and new nodes use the code-preferred ids
  - node data field `retiredModelId?: string` (Task 6/7 read and clear it)

- [ ] **Step 1: Write the failing tests**

Replace the existing D461/D467 deprecated-fallback tests in `src/lib/canvas-store.test.ts` (find them with `grep -n "deprecated\|D461\|D467" src/lib/canvas-store.test.ts`) with:

```ts
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom, videoModelsFrom, paramDefaults } from "@/lib/ai-models/model-lists";

describe("D544 — nodes on a retired model", () => {
  const catalog = seededModelCatalog();
  const models = { images: imageModelsFrom(catalog), videos: videoModelsFrom(catalog) };
  const node = (type: string, data: Record<string, unknown>) =>
    ({ id: `${type}-1`, type, position: { x: 0, y: 0 }, data }) as AppNode;

  it("opens an Image Gen node on the retired model's replacement, with its defaults", () => {
    const store = createCanvasStore([node("image-gen", { title: "", modelId: "openai:gpt-image-1", params: { quality: "high" } })], [], "", models);
    const data = store.getState().nodes[0].data as Record<string, unknown>;
    expect(data.modelId).toBe("openai:gpt-image-2.5-sunburst");
    expect(data.params).toEqual(paramDefaults(models.images.get("openai:gpt-image-2.5-sunburst")!.params));
    expect(data.retiredModelId).toBe("openai:gpt-image-1");
  });

  it("opens a Video Gen node on a retired model's replacement", () => {
    const retired = videoModelsFrom(withModel(catalog, "gemini:gemini-omni-1.1-flash", { status: "retired", replacedBy: "gemini:gemini-omni-1.2-flash" }));
    const store = createCanvasStore([node("video-gen", { title: "", modelId: "gemini:gemini-omni-1.1-flash" })], [], "", { ...models, videos: retired });
    const data = store.getState().nodes[0].data as Record<string, unknown>;
    expect(data.modelId).toBe("gemini:gemini-omni-1.2-flash");
    expect(data.retiredModelId).toBe("gemini:gemini-omni-1.1-flash");
  });

  it("keeps a node on a hidden or live model as the same object", () => {
    const hidden = imageModelsFrom(withModel(catalog, "gemini:gemini-3-pro-image", { status: "hidden" }));
    const n = node("image-gen", { title: "", modelId: "gemini:gemini-3-pro-image" });
    const store = createCanvasStore([n], [], "", { ...models, images: hidden });
    expect(store.getState().nodes[0]).toBe(n);
  });

  it("starts new nodes on the catalog's defaults", () => {
    const hidden = imageModelsFrom(withModel(catalog, "gemini:gemini-3-pro-image", { status: "hidden" }));
    const store = createCanvasStore([], [], "", { ...models, images: hidden });
    store.getState().addNode("image-gen", { x: 0, y: 0 });
    const data = store.getState().nodes[0].data as Record<string, unknown>;
    expect(data.modelId).toBe(hidden.defaultId);
    expect(data.modelId).not.toBe("gemini:gemini-3-pro-image");
  });
});
```

Use the store's real add-node action name and argument order (check `addNode` in `canvas-store.ts`, around line 360). Replace the test file's imports of `defaultsForModel` / `imageGenClientModelMap` / `defaultsForVideoModel` from client-models with `paramDefaults(models.images.get(id)!.params)` style lookups.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/canvas-store.test.ts`
Expected: FAIL (`createCanvasStore` ignores the fourth argument).

- [ ] **Step 3: Write the implementation**

`src/lib/canvas-nodes.ts`: add to each of `ImageGenNodeData`, `CompositeNodeData` and `VideoGenNodeData`, beside `modelId`:

```ts
  /** D544 — the retired model this node was moved off when it opened; cleared once a model is picked. */
  retiredModelId?: string;
```

`src/lib/canvas-store.ts`:
- Replace the two client-models imports with:

```ts
import { DEFAULT_IMAGE_MODEL_ID, DEFAULT_VIDEO_MODEL_ID } from "@/lib/ai-models/default-models";
import { withoutRetiredModel, type ImageModels, type VideoModels } from "@/lib/ai-models/model-lists";

export type CanvasModels = { images: ImageModels; videos: VideoModels };
```

- `defaultData(type)` becomes `defaultData(type: string, models?: CanvasModels)`, with:

```ts
    case "image-gen":
      return { title: "", modelId: models?.images.defaultId ?? DEFAULT_IMAGE_MODEL_ID };
    case "composite":
      return { title: "", modelId: models?.images.liveOr(COMPOSITE_DEFAULT_MODEL_ID) ?? COMPOSITE_DEFAULT_MODEL_ID };
    case "video-gen":
      return { title: "", modelId: models?.videos.defaultId ?? DEFAULT_VIDEO_MODEL_ID };
```

- `createCanvasStore(initialNodes = [], initialEdges = [], initialCanvasName = "", models?: CanvasModels)`. Replace the `startingNodes` block with:

```ts
  // D544 — a node saved on a retired model opens on its replacement, here so that its card, its
  // prompt node and its focus view all agree. Saved with the canvas's next change, not on load.
  const startingNodes = initialNodes.map((n) => {
    if (!models) return n;
    const next =
      n.type === "video-gen"
        ? withoutRetiredModel(models.videos, n.data)
        : n.type === "image-gen" || n.type === "composite"
          ? withoutRetiredModel(models.images, n.data)
          : n.data;
    return next === n.data ? n : ({ ...n, data: next } as AppNode);
  });
```

- Pass `models` to both `defaultData(...)` call sites (around lines 366 and 1047).

`src/components/canvas/canvas-store-provider.tsx`: inside `CanvasStoreProvider`, before the ref check:

```tsx
  const images = useImageModels();
  const videos = useVideoModels();
  const storeRef = useRef<CanvasStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createCanvasStore(initialNodes, initialEdges, canvasName, { images, videos });
  }
```

with `import { useImageModels, useVideoModels } from "@/hooks/queries/ai-models";`. Add one line to the file's top comment: the store is created with the model lists of the catalog at mount (D544); a later catalog refresh does not move nodes already open.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/canvas-store.test.ts src/components/canvas`
Expected: PASS. A canvas component test that mounts `CanvasStoreProvider` needs the hook mock from Task 2.
Run: `npx tsc --noEmit -p tsconfig.json` — only the known `.next/` errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas-nodes.ts src/lib/canvas-store.ts src/components/canvas/canvas-store-provider.tsx src/lib/canvas-store.test.ts <any canvas test you changed>
git commit -m "feat(models): the canvas opens retired nodes on their replacement (D544)"
```

---

### Task 6: Image screens read the image list

**Files:**
- Create: `src/components/models/retired-model-notice.tsx`
- Modify: `src/components/nodes/image-gen-focus-view.tsx`, `src/components/nodes/image-gen-output-settings.tsx`, `src/components/nodes/image-gen-version-history.tsx`, `src/components/nodes/composite-focus-view.tsx`, `src/hooks/use-composite-versions.ts`, `src/components/avatars/avatar-model-select.tsx`, `src/components/avatars/avatar-candidate-grid.tsx`
- Test: `src/components/models/__tests__/retired-model-notice.test.tsx`, `src/components/avatars/__tests__/avatar-model-select.test.tsx` (create), `src/components/nodes/__tests__/image-gen-output-settings.test.tsx` (create if absent)

**Interfaces:**
- Consumes: `useImageModels` (Task 2); `ImageModels`, `paramDefaults` (Task 1); `retiredModelId` (Task 5); `MODEL_RETIRED_MESSAGE` (`src/lib/ai-models/runnable.ts`).
- Produces: `<RetiredModelNotice retiredModelId={string | undefined} onDismiss={() => void} />` (Task 7 uses it in the video focus view). `AvatarModelSelect` gains no new props; its `modelIds` keeps filtering.

- [ ] **Step 1: Write the failing tests**

`src/components/models/__tests__/retired-model-notice.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RetiredModelNotice } from "../retired-model-notice";

describe("RetiredModelNotice", () => {
  it("says the model was retired, without naming it, and can be dismissed", () => {
    const onDismiss = vi.fn();
    render(<RetiredModelNotice retiredModelId="openai:gpt-image-1" onDismiss={onDismiss} />);
    expect(screen.getByText("This model was retired. Pick another.")).toBeInTheDocument();
    expect(screen.queryByText(/gpt-image-1/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders nothing without a retired model", () => {
    const { container } = render(<RetiredModelNotice retiredModelId={undefined} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

`src/components/avatars/__tests__/avatar-model-select.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom } from "@/lib/ai-models/model-lists";

let images = imageModelsFrom(seededModelCatalog());
vi.mock("@/hooks/queries/ai-models", () => ({ useImageModels: () => images }));

import { AvatarModelSelect } from "../avatar-model-select";

describe("AvatarModelSelect", () => {
  it("offers live models only, plus the selected model when it is hidden", () => {
    images = imageModelsFrom(withModel(seededModelCatalog(), "gemini:gemini-3-pro-image", { status: "hidden", label: "Pro Hidden" }));
    render(<AvatarModelSelect id="m" value="openai:gpt-image-2" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.queryByText("Pro Hidden")).toBeNull();
    expect(screen.queryByText("GPT Image 1")).toBeNull();
  });

  it("keeps the selected hidden model in the list", () => {
    images = imageModelsFrom(withModel(seededModelCatalog(), "gemini:gemini-3-pro-image", { status: "hidden", label: "Pro Hidden" }));
    render(<AvatarModelSelect id="m" value="gemini:gemini-3-pro-image" onChange={() => {}} />);
    expect(screen.getAllByText("Pro Hidden").length).toBeGreaterThan(0);
  });
});
```

(If Base UI's `Select` renders its trigger with another role in jsdom, open it the way the nearest existing `Select` test in `src/components` does.)

For `image-gen-output-settings.tsx`, add a test in the same style: with a hidden model, the chip row omits it unless it is the selected `model.id`; a retired model never appears. Mount the component the way its parent `image-gen-output-settings-body.tsx` does, with the minimum props.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/models src/components/avatars/__tests__/avatar-model-select.test.tsx src/components/nodes/__tests__/image-gen-output-settings.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

`src/components/models/retired-model-notice.tsx` (check `src/components/ui/alert.tsx` first; if it exists, use `Alert` + `AlertDescription` in place of the outer `div`, keeping the text and the button):

```tsx
"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MODEL_RETIRED_MESSAGE } from "@/lib/ai-models/runnable";

/** D544 — shown in a focus view whose node was moved off a retired model when the canvas opened. */
export function RetiredModelNotice({ retiredModelId, onDismiss }: { retiredModelId: string | undefined; onDismiss: () => void }) {
  if (!retiredModelId) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
      <p className="flex-1">{MODEL_RETIRED_MESSAGE}</p>
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onDismiss}>
        <X strokeWidth={1.5} />
      </Button>
    </div>
  );
}
```

(Use the `size` value the vendored `Button` actually has for a small icon button; check `src/components/ui/button.tsx`.)

Each component below: add `const images = useImageModels();` at the top of the body and replace the client-models reads.

- `image-gen-focus-view.tsx`:
  - `const model = images.specOrDefault(modelId);` replaces the `selectedModelId` / map lookup pair (keep `selectedModelId` only if other code reads it; then `const selectedModelId = modelId ?? images.defaultId;`).
  - `defaultsForModel(model)` → `paramDefaults(model.params)` everywhere in the file.
  - Restore (around line 893): `const restoredParams = restoredModelId && images.isOffered(restoredModelId, modelId) ? paramsForRestore(..., images.get(restoredModelId)!.params ...) : ...` — keep the existing call shape, swapping `!isImageModelDeprecated(id)` for `images.isOffered(id, modelId)` and the map read for `images.get(id)`.
  - Render `<RetiredModelNotice retiredModelId={data.retiredModelId} onDismiss={() => updateNodeData(id, { retiredModelId: undefined })} />` directly above the model settings, using the file's existing node-data update function and node id variable.
  - Wherever the file applies a model change from the picker, also clear `retiredModelId` in the same update (`{ modelId: next, params: …, retiredModelId: undefined }`).
- `image-gen-output-settings.tsx`: `images.groups(model.id)` replaces `imageGenClientModelGroups`.
- `image-gen-version-history.tsx`: `images.get(version.modelUsed)` (or the file's own variable) replaces the map read; an unknown id keeps the current "no specs" behaviour.
- `composite-focus-view.tsx`: `images.get(pickerId)` / `images.specOrDefault(pickerId)` replace the map read; `paramDefaults(model.params)` replaces `defaultsForModel(model)`; render the notice and clear `retiredModelId` on a model change, as in Image Gen.
- `use-composite-versions.ts`: `const images = useImageModels();` in the hook; swap `isImageModelDeprecated` / map reads exactly as in Image Gen's restore, with the composite's own current model id as `ownModelId`.
- `avatar-model-select.tsx`:

```tsx
  const images = useImageModels();
  const groups = images.groups(value)
    .map((g) => ({ ...g, models: modelIds ? g.models.filter((m) => modelIds.includes(m.id)) : g.models }))
    .filter((g) => g.models.length > 0);
  // …
        <SelectValue>{images.get(value)?.label ?? "Choose a model"}</SelectValue>
```

- `avatar-candidate-grid.tsx`: `images.get(batch.modelId)?.label` (use the file's variable) replaces the map read; keep its existing fallback text, and if that fallback is the raw id, change it to `"Image model"` (plain copy: never show an id).

Update each existing component test that mounts one of these files to add the hook mock from Task 2.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/models src/components/avatars src/components/nodes src/hooks src/components/visualise`
Expected: PASS.
Run: `npx tsc --noEmit -p tsconfig.json` — only the known `.next/` errors.
Run: `grep -n "image-gen/client-models" src/components/nodes/image-gen-focus-view.tsx src/components/nodes/image-gen-output-settings.tsx src/components/nodes/image-gen-version-history.tsx src/components/nodes/composite-focus-view.tsx src/hooks/use-composite-versions.ts src/components/avatars/avatar-model-select.tsx src/components/avatars/avatar-candidate-grid.tsx`
Expected: only `import type` lines, if any.

- [ ] **Step 5: Commit** (stage every changed file by path)

```bash
git add src/components/models/retired-model-notice.tsx src/components/models/__tests__/retired-model-notice.test.tsx src/components/nodes/image-gen-focus-view.tsx src/components/nodes/image-gen-output-settings.tsx src/components/nodes/image-gen-version-history.tsx src/components/nodes/composite-focus-view.tsx src/hooks/use-composite-versions.ts src/components/avatars/avatar-model-select.tsx src/components/avatars/avatar-candidate-grid.tsx <each test file you added or changed>
git commit -m "feat(models): image pickers and focus views read the catalog (D542, D544)"
```

---

### Task 7: Video screens read the video list

**Files:**
- Modify: `src/components/nodes/video-gen-focus-view.tsx`, `src/components/nodes/video-gen-model-picker.tsx`, `src/components/nodes/video-gen-params-panel.tsx` (component body), `src/components/nodes/video-gen-request-panel.tsx`, `src/components/nodes/video-gen-version-history.tsx`, `src/components/nodes/video-prompt-focus-view.tsx`
- Test: `src/components/nodes/__tests__/video-gen-model-picker.test.tsx` (create if absent), plus the existing tests of these files

**Interfaces:**
- Consumes: `useVideoModels` (Task 2); `modelPickerLabel`, `paramDefaults` (Task 1); `RetiredModelNotice` (Task 6); `retiredModelId` (Task 5).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test**

`src/components/nodes/__tests__/video-gen-model-picker.test.tsx` (merge into the existing file if there is one):

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import { videoModelsFrom } from "@/lib/ai-models/model-lists";

let videos = videoModelsFrom(seededModelCatalog());
vi.mock("@/hooks/queries/ai-models", () => ({ useVideoModels: () => videos }));

import { VideoGenModelPicker } from "../video-gen-model-picker";

describe("VideoGenModelPicker", () => {
  it("offers live models with the catalog's picker labels, and no retired model", () => {
    videos = videoModelsFrom(withModel(seededModelCatalog(), "gemini:gemini-omni-1.2-flash", { pickerLabel: "Omni Next" }));
    render(<VideoGenModelPicker {...minimalProps} modelId="gemini:gemini-omni-1.2-flash" />);
    expect(screen.getByText("Omni Next")).toBeInTheDocument();
    expect(screen.queryByText("3.1 Fast")).toBeNull(); // Veo is retired in the seed
  });

  it("shows a hidden model only on the node that uses it", () => {
    videos = videoModelsFrom(withModel(seededModelCatalog(), "kling:kling-3-0-omni", { status: "hidden" }));
    const { unmount } = render(<VideoGenModelPicker {...minimalProps} modelId="gemini:gemini-omni-1.2-flash" />);
    expect(screen.queryByText("3.0 Omni")).toBeNull();
    unmount();
    render(<VideoGenModelPicker {...minimalProps} modelId="kling:kling-3-0-omni" />);
    expect(screen.getByText("3.0 Omni")).toBeInTheDocument();
  });
});
```

`minimalProps` is the smallest prop object the picker needs; build it from the picker's `Props` type (and wrap in whatever context it reads, e.g. the canvas-editable provider, the way its other tests or its parent do). If the seed's Veo rows are not retired, drop that one assertion.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/nodes/__tests__/video-gen-model-picker.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write the implementation**

Each component: `const videos = useVideoModels();` at the top of the body.

- `video-gen-model-picker.tsx`: `videos.groups(modelId)` replaces `videoGenClientModelGroups` in both branches of `shownGroups`; `modelPickerLabel` from `@/lib/ai-models/model-lists`; `videos.get(id)` replaces the map read (the avatar-ruled-out label).
- `video-gen-params-panel.tsx` (body): `const model = videos.specOrDefault(modelId);` replaces `videoGenClientModelMap[resolveVideoModelId(modelId)]`.
- `video-gen-request-panel.tsx`: `version.modelUsed ? videos.specOrDefault(version.modelUsed) : …` replaces the map + resolve pair; keep the existing null branch.
- `video-gen-version-history.tsx`: `videos.get(id)` replaces the map read.
- `video-prompt-focus-view.tsx`: `videos.get(targetModelId)` and `videos.defaultId` replace the map read and `DEFAULT_VIDEO_CLIENT_MODEL_ID`.
- `video-gen-focus-view.tsx`:
  - initial model (around line 552): `modelId ?? videos.defaultId`; initial params: `paramDefaults(videos.specOrDefault(id).params)`.
  - restore (around line 1271): `!edited && modelUsed && videos.isOffered(modelUsed, modelId)` replaces `!isVideoModelDeprecated(modelUsed)`, and `videos.get(modelUsed)` the map read.
  - `videos.get(selectedModelId)?.imageInputs` (around line 1303) and the current model (around line 1366) from `videos.specOrDefault(...)`.
  - render `<RetiredModelNotice retiredModelId={data.retiredModelId} onDismiss={() => updateNodeData(id, { retiredModelId: undefined })} />` above the model picker, and clear `retiredModelId` in the update that applies a picked model, as in Task 6.
  - remove the client-models runtime import from the file.

Update the existing tests of these files to add the hook mock from Task 2.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/nodes src/hooks`
Expected: PASS.
Run: `npx tsc --noEmit -p tsconfig.json` — only the known `.next/` errors.
Run: `grep -n "video-gen/client-models" src/components/nodes/*.tsx`
Expected: nothing, or `import type` / id-constant imports only (`GEMINI_OMNI_*`, `KLING_OMNI_MODEL_ID`, `SEEDANCE_MODEL_ID`).

- [ ] **Step 5: Commit** (stage every changed file by path)

```bash
git add src/components/nodes/video-gen-focus-view.tsx src/components/nodes/video-gen-model-picker.tsx src/components/nodes/video-gen-params-panel.tsx src/components/nodes/video-gen-request-panel.tsx src/components/nodes/video-gen-version-history.tsx src/components/nodes/video-prompt-focus-view.tsx <each test file you added or changed>
git commit -m "feat(models): video pickers and focus views read the catalog (D542, D544)"
```

---

### Task 8: Server defaults, the voice preview check, and the import guard

**Files:**
- Modify: `src/app/api/nodes/[id]/image-generate/route.ts`, `src/app/api/nodes/[id]/video-generate/route.ts`, `src/app/api/nodes/[id]/upstream-images/route.ts`, `src/app/api/nodes/[id]/composite-generate/route.ts`
- Modify: `src/app/api/clients/[id]/avatars/[avatarId]/voice-preview/route.ts`
- Modify: `src/lib/image-gen/client-models.ts`, `src/lib/video-gen/client-models.ts` (delete browser-only helpers)
- Create: `src/lib/ai-models/__tests__/no-client-registry-imports.test.ts`
- Test: the route tests of the five routes above

**Interfaces:**
- Consumes: `imageModelsFrom`, `videoModelsFrom` (Task 1); `videoRun`, `MODEL_UNAVAILABLE_MESSAGE` (1b-i); `getAiCatalog`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the failing tests**

`src/lib/ai-models/__tests__/no-client-registry-imports.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// D542 — browser code reads image and video models from the catalog. Only type imports and the
// id constants that name model-specific behaviour may still come from the code registries.
const ROOTS = ["src/components", "src/hooks", "src/lib/canvas-store.ts"];
const ALLOWED = new Set([
  "GEMINI_OMNI_11_MODEL_ID", "GEMINI_OMNI_12_MODEL_ID", "GEMINI_OMNI_MODEL_ID",
  "KLING_OMNI_MODEL_ID", "SEEDANCE_MODEL_ID",
]);

function files(p: string): string[] {
  const abs = join(process.cwd(), p);
  try {
    return readdirSync(abs, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? files(join(p, e.name)) : /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [join(p, e.name)] : [],
    );
  } catch {
    return [p];
  }
}

describe("browser code does not read the code model registries", () => {
  it("imports only types and id constants from client-models", () => {
    const offenders: string[] = [];
    const re = /import\s+(type\s+)?\{([^}]*)\}\s+from\s+["'][^"']*(image-gen|video-gen)\/client-models["']/g;
    for (const f of ROOTS.flatMap(files)) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      for (const m of src.matchAll(re)) {
        if (m[1]) continue;
        const names = m[2].split(",").map((s) => s.trim()).filter(Boolean).filter((s) => !s.startsWith("type "));
        const bad = names.filter((n) => !ALLOWED.has(n));
        if (bad.length) offenders.push(`${relative(process.cwd(), f)}: ${bad.join(", ")}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

Voice preview route test: add a case where the engine's model (`VOICE_PREVIEW_ENGINE.omni.modelId`) is `hidden` in the mocked catalog (use `withModel`): the route returns 400 `"Voice previews can't run right now. Try again later."`, inserts no generation and reserves nothing. Add the same for `retired`. Follow the file's existing catalog mock (it already mocks `getAiCatalog` or `priceForNewRun`; if it mocks only `priceForNewRun`, add a `getAiCatalog` mock returning `seededModelCatalog()`).

Image-generate and composite-generate route tests: add a case where `getAiCatalog` rejects: the route returns 500 with `"Could not load the models. Try again."` and no raw message. Image-generate and video-generate: a body with no `modelId` uses the catalog's default (with the default made hidden in the catalog, the run starts on `images.defaultId` / `videos.defaultId`, the first live model).

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/ai-models/__tests__/no-client-registry-imports.test.ts "src/app/api/clients/[id]/avatars" "src/app/api/nodes/[id]/image-generate" "src/app/api/nodes/[id]/video-generate" "src/app/api/nodes/[id]/composite-generate"`
Expected: FAIL. If the guard already passes because Tasks 3–7 removed every import, it still guards; continue.

- [ ] **Step 3: Write the implementation**

- image-generate route: replace `DEFAULT_CLIENT_MODEL_ID` with `imageModelsFrom(catalog).defaultId` (it already loads `catalog`). Wrap its catalog read so a failure returns `apiError("Could not load the models. Try again.", 500)` with the error in `console.error`, not a raw throw. Do the same catalog-failure wrap in composite-generate.
- video-generate route: `videoModelsFrom(catalog).defaultId` replaces `DEFAULT_VIDEO_CLIENT_MODEL_ID`.
- upstream-images route: `fallbackId: videoModelsFrom(catalog).defaultId`.
- voice-preview route: load the catalog with the route's existing reads (`Promise.all`), then before `insertGeneration`:

```ts
      const run = videoRun(catalog, VOICE_PREVIEW_ENGINE[engine].modelId);
      if (!run.ok) {
        console.error("[voice-preview] engine model can't run", VOICE_PREVIEW_ENGINE[engine].modelId, run.reason);
        return apiError(VOICE_PREVIEW_UNAVAILABLE_MESSAGE, 400);
      }
```

with `const VOICE_PREVIEW_UNAVAILABLE_MESSAGE = "Voice previews can't run right now. Try again later.";` declared in `src/lib/avatars/voice-preview.ts` and exported (no existing-node exception: a preview belongs to no node, so a hidden engine model refuses).

- `src/lib/image-gen/client-models.ts`: delete `imageGenClientModelGroups`, `isImageModelDeprecated`, `withoutDeprecatedImageModel`, `defaultsForSchema` and `DEFAULT_CLIENT_MODEL_ID`, unless grep finds a non-test reader left (`seed.ts` and `adapter-sync.ts` may read `imageGenClientModels`, `defaultsForModel` and `DEPRECATED_IMAGE_MODEL_FALLBACK_ID`; keep those). Add at the top: `// Plan 1b-iii deletes this file. Browser and server code read models from the catalog (D542).`
- `src/lib/video-gen/client-models.ts`: delete `videoGenClientModelGroups`, `modelPickerLabel`, `isVideoModelDeprecated`, `resolveVideoModelId`, `usableVideoModelId`, `withoutDeprecatedVideoModel`, keeping what `seed.ts`, `adapter-sync.ts`, `registry.ts`, the providers and tests still read (`videoGenClientModelMap`, `defaultsForVideoModel`, `DEFAULT_VIDEO_CLIENT_MODEL_ID`, the id constants). Same header line.
- Fix every test that imported a deleted helper: swap in the model-lists equivalent (`paramDefaults`, `modelPickerLabel`, `videoModelsFrom(seededModelCatalog())`).

Check with: `grep -rn "imageGenClientModelGroups\|isImageModelDeprecated\|withoutDeprecatedImageModel\|defaultsForSchema\|DEFAULT_CLIENT_MODEL_ID\|videoGenClientModelGroups\|isVideoModelDeprecated\|resolveVideoModelId\|usableVideoModelId\|withoutDeprecatedVideoModel" src trigger` → nothing.

- [ ] **Step 4: Run the tests to verify they pass**

Run, directory by directory: `npx vitest run src/lib/ai-models src/lib/image-gen src/lib/video-gen src/lib/avatars src/lib/composite src/lib/scripts src/lib/video-edit src/lib/canvas-store.test.ts src/components src/hooks "src/app/api/nodes" "src/app/api/clients" "src/app/api/ai-models"`
Expected: PASS (re-run a timed-out route file alone).
Run: `npx tsc --noEmit -p tsconfig.json` — only the known `.next/` errors.

- [ ] **Step 5: Commit** (stage every changed file by path)

```bash
git add "src/app/api/nodes/[id]/image-generate/route.ts" "src/app/api/nodes/[id]/video-generate/route.ts" "src/app/api/nodes/[id]/upstream-images/route.ts" "src/app/api/nodes/[id]/composite-generate/route.ts" "src/app/api/clients/[id]/avatars/[avatarId]/voice-preview/route.ts" src/lib/avatars/voice-preview.ts src/lib/image-gen/client-models.ts src/lib/video-gen/client-models.ts src/lib/ai-models/__tests__/no-client-registry-imports.test.ts <each test file you changed>
git commit -m "fix(models): server defaults and the voice preview engine come from the catalog"
```

---

### Task 9: ADR entries D542–D544

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, after D541; keep the file's line endings)

**Interfaces:** none.

- [ ] **Step 1: Append the three entries after D541, in the log's format**

```markdown
### D542 — The browser reads image and video models from the catalog *(recorded 2026-11-23; follows D529, D538)*

**Decision.** Every screen that lists, labels, configures or defaults an image or video model reads it from the session's one catalog query, through two lists built from it (`imageModelsFrom`, `videoModelsFrom` in `src/lib/ai-models/model-lists.ts`): every non-draft model in sort order, lookup by id, status and replacement, the offered models grouped by provider for a picker, and the default. A picker offers live models, plus a hidden model on the node, avatar or panel that already uses it; a retired model is never offered. The lists are cached per catalog object, so a card's lookup is a map read. `src/app/clients/[id]/layout.tsx` reads the catalog on the server and seeds the browser cache through `ModelCatalogGate`, so no client page waits on its own request; below the gate, `useImageModels()` and `useVideoModels()` always have data. The helpers the server and the browser share (avatar params and estimates, panel caps, composite picker, edit limits, presenter rules, param merges) take the list as their first argument; the server builds it from `getAiCatalog()` once per request. Model-specific behaviour keyed by id (`MULTISHOT_MODELS`, `VOICE_PREVIEW_ENGINE`, `VIDEO_EDIT_MODEL_IDS`, the prompt templates) stays in code.

**Why.** A status or label the super admin sets has to show on every screen, and the server already refuses by the catalog (D540): a picker that offered from code could offer what the server refuses.

**Rejected.** A loading state in each picker and focus view: dozens of call sites, each able to get it wrong. A context that loads the list: TanStack Query already owns the catalog. Moving the multishot capabilities into `capabilities`: they describe how our prompts are written for a model, not the model.

**Originated →** [2026-11-23-model-catalog-1b-browser.md](../plans/2026-11-23-model-catalog-1b-browser.md).

### D543 — Defaults are code preferences used while live *(recorded 2026-11-23; refines D542)*

**Decision.** The models new work starts on (`DEFAULT_IMAGE_MODEL_ID`, `DEFAULT_VIDEO_MODEL_ID` in `src/lib/ai-models/default-models.ts`, and the composite, panel and Visualise avatar defaults) stay in code. Each is used only while the catalog has it live; otherwise the first live model in sort order is used. The routes' fallback for a request with no model uses the same rule.

**Why.** Hiding or retiring a default must not leave new nodes on a model the server refuses, and a default column would be one more thing to keep in step for a choice that rarely changes.

**Rejected.** A `default` flag on `ai_models` (a table change for one bit per kind; the sort order already lets the super admin choose the fallback).

**Originated →** [2026-11-23-model-catalog-1b-browser.md](../plans/2026-11-23-model-catalog-1b-browser.md).

### D544 — A node on a retired model opens on its replacement, with a notice *(recorded 2026-11-23; replaces D461/D467's browser fallback)*

**Decision.** When the canvas opens, an Image Gen, Composite or Video Gen node saved on a retired model is moved to the model's `replaced_by` when that is live, else to the default, with that model's default settings, and its old model id is kept in `retiredModelId`. Its focus view shows "This model was retired. Pick another." until a model is picked or the notice is dismissed. The move is saved with the canvas's next change, not on load. A hidden model is left as it is: it still runs on that node (D540). The store is built with the catalog of the moment the canvas mounts; a later catalog refresh does not move nodes already open.

**Why.** The spec's edge case: the node keeps its history and is offered the replacement the catalog names, instead of a fixed fallback in code.

**Rejected.** Leaving the node on the retired model until the user acts: its card, prompt node and focus view would each have to treat the retired model specially, and Generate would be refused.

**Originated →** [2026-11-23-model-catalog-1b-browser.md](../plans/2026-11-23-model-catalog-1b-browser.md).
```

- [ ] **Step 2: Check encoding and line endings**

Run: `file docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (unchanged from before) and `grep -nP '[\x80-\x9f]' docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` → nothing new.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs: D542-D544 the browser reads image and video models from the catalog"
```

---

## Not in this plan

- **Deleting the registries and freezing 0084 (1b-iii).** `imageGenClientModels`, `videoGenClientModelMap`, `defaultsForModel`, `defaultsForVideoModel`, the id constants' home, `seed.ts`, `adapter-sync.ts`'s registry input, `isFinalAttempt` + `ModelUnavailableError`, the klingEndpoint second source.
- **Multishot target models.** `MULTISHOT_MODELS` and `bestFitMultishotModel` stay in code and may pick a model the catalog has hidden for a new Multishot node; the Video Gen node it feeds then refuses with plain copy. Revisit with the admin screens (Plan 4).
- **Text and service models.** Their callers keep their constants.
- **Admin screens (Plan 4).**

## After the plan

Start `npm run dev` (port 3000), then on dev:

1. Open a canvas: no extra `/api/ai-models` request in the network tab on first load (the layout seeded it). Image Gen, Composite and Video Gen pickers list the same models as before.
2. In the Supabase SQL editor on dev, set `status = 'hidden'` on `kling:kling-3-0-omni`. Wait one minute (server cache) and reload: a node already on Kling 3.0 Omni still shows it and generates; a new Video Gen node's picker does not list it. Set it back to `live`.
3. Set `status = 'retired', replaced_by = 'gemini:gemini-omni-1.2-flash'` on `gemini:gemini-omni-1.1-flash`, reload a canvas with a node on Omni 1.1: it opens on Omni 1.2 with the notice. Set it back to `live`, `replaced_by = null`.
4. Avatar Studio and Visualise: the model selects list live models only; costs show as before.
