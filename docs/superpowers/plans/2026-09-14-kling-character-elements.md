# Kling Character Elements — Implementation Plan (2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Kling 3.0 Omni, a Character is sent as a pre-registered **element** (its faces, with its voice bound) instead of as loose `refer_image`s, so the same face and the same voice come out of every clip.

**Architecture:** Registration is lazy and idempotent: before a Kling 3.0 Omni generate, `ensureKlingElement` looks up `character_provider_registrations` for the node; if the stored `element_source_key` matches the character's current faces+voice it reuses the `element_id`, otherwise it creates a custom voice (if the voice changed) and an element via Kling's async task APIs, polls to `succeed`, stores the ids, and best-effort deletes the superseded ones. The provider then emits `{type:"element", element_id, id:"element_N"}` in `contents`, forces `settings.audio = "native"`, and the prompt cites `@element_N`. On the client, Kling's token dialect learns `@element_N` so a character mention in a beat renders as the element handle rather than an image handle.

**Depends on:** plan 1 (`2026-09-14-character-node-and-seedance-voice.md`) — `CharacterRef`, `VideoGenInput.characters`, `voiceInput`, `collectUpstreamImages`, `faceRefId`/`isFrontalFaceId`.

**Tech Stack:** as plan 1, plus one Supabase migration (`supabase/migrations/0039_*.sql`, documented in `docs/auth-production-migration.md` the same session it ships).

**Spec:** `docs/superpowers/specs/2026-09-14-character-node-voice-reference-design.md` §4.2, D266 (as amended by plan 1 Task 13). Vendor contract: `ref/kling-docs/Kling 3.0 Voice Management.md`, `ref/kling-docs/Kling 3.0 Element Management.md`.

## Global Constraints

- Everything in plan 1's Global Constraints.
- **Kling element:** `element_name` ≤ 20 chars; `element_description` ≤ 100 chars and **required**; `reference_type: "image_refer"`; `element_image_list: { frontal_image, refer_images: [{image_url}] }` with 1 frontal + 1–3 refers; `element_voice_id` binds only to character/humanoid image elements; `tag_list: [{ tag_id: "o_102" }]` (Character).
- **Kling voice:** `voice_name` ≤ 20 chars; `voice_url` wav/mp3/mp4/mov, 5–30 s, one clean speaker. Creation is an **async task**: `POST /v1/general/custom-voices` → `data.task_id`; poll `GET /v1/general/custom-voices/{task_id}` until `task_status` is `succeed` (→ `task_result.voices[0].voice_id`) or `failed` (→ `task_status_msg`).
- **Kling element task:** `POST /v1/general/advanced-custom-elements` → `data.task_id`; poll `GET /v1/general/advanced-custom-elements/{task_id}` → `task_result.elements[0].element_id`.
- **Delete:** `POST /v1/general/delete-voices { voice_id }`, `POST /v1/general/delete-advanced-elements { element_id }` — best-effort, never surfaced.
- **Generate:** the Omni endpoint has **no `voice_ids`**; the element is the only voice path. Prompt cites an element as `@<id>` where `id` is the `contents[].id` we set (`element_N`, mirroring `image_N`). Without a reference video, `refer_image` count + element count ≤ 7. A bound voice is inaudible unless `settings.audio` is `"native"`.
- **Element for every character with a frontal face**, voice bound when present (amended D266). A character with a voice but no face gets no element and the voice is not sent.
- Registration ids are **never** written to `nodes.data` — they live in `character_provider_registrations` (autosave would clobber them).

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0039_character_provider_registrations.sql` | The table. |
| `docs/auth-production-migration.md` | Its production entry. |
| `src/lib/db/character-registrations.ts` (+ test) | `getRegistration`, `saveRegistration` (service-role Supabase). |
| `src/lib/video-gen/providers/kling-elements.ts` (+ test) | `elementSourceKey`, `ensureKlingElement` — the voice → element lifecycle over Kling's task APIs; fetch/poll/delete helpers. |
| `src/lib/video-gen/providers/kling.ts` | `buildKlingContents` takes `elements`; `generateWithKling` strips character faces from `refer_image`, calls `ensureKlingElement`, forces `audio: native`, enforces the 7-slot rule. `kling30Omni.voiceInput = "element"`. |
| `src/lib/video-gen/client-models.ts` | Kling 3.0 Omni `voiceInput: "element"`. |
| `src/app/api/nodes/[id]/video-generate/route.ts` | On an `element` model, character faces leave `referenceUrls` before capping/rules; refs + elements ≤ 7 guard. |
| `src/lib/nodes/prompt-token-dialect.ts` (+ test) | `klingImageDialect(orderedIds, elementIds)` — `@element_N`. `dialectForCapability` gains `elementIds`. |
| `src/lib/nodes/multishot-plan.ts` (+ test) | `elementsCitedIn(text)`. |
| `src/components/nodes/multishot-prompt-focus-view.tsx` | Kling: `refIds` exclude character faces; `elementIds` = frontal ids; uncited check counts element citations. |
| `src/lib/video-gen/collect-upstream-images.ts` | unchanged — faces still collected; the route decides per model. |

---

### Task 1: The registrations table

**Files:**
- Create: `supabase/migrations/0039_character_provider_registrations.sql`
- Modify: `docs/auth-production-migration.md` (append a section)
- Create: `src/lib/db/character-registrations.ts`
- Test: `src/lib/db/character-registrations.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type CharacterRegistration = {
    nodeId: string; provider: "kling";
    voiceId: string | null; voiceSourceUrl: string | null;
    elementId: string | null; elementSourceKey: string | null;
  };
  export async function getRegistration(nodeId: string, provider: "kling"): Promise<CharacterRegistration | null>;
  export async function saveRegistration(reg: CharacterRegistration): Promise<void>;
  ```

- [ ] **Step 1: The migration**

```sql
-- supabase/migrations/0039_character_provider_registrations.sql
-- D266 — where a Character node's provider-side registrations live. Kling's custom voice and
-- element are paid, persistent library resources; this row is how a generation finds the ones
-- already built for a character instead of building them again.
--
-- Deliberately NOT on nodes.data: saveCanvasNodes upserts each node's whole data blob from the
-- client store, so anything the server wrote there would be overwritten by the next autosave.
-- The client never writes this table.
--
-- *_source_url / *_source_key record what each id was built FROM (the voice url; the sorted face
-- urls + voice url). A changed face or voice changes the key, which is how a stale registration
-- is detected without an explicit invalidate.
create table character_provider_registrations (
  node_id            uuid not null references nodes(id) on delete cascade,
  provider           text not null check (provider in ('kling')),
  voice_id           text,
  voice_source_url   text,
  element_id         text,
  element_source_key text,
  updated_at         timestamptz not null default now(),
  primary key (node_id, provider)
);
```

Append to `docs/auth-production-migration.md`:

```markdown
## Migration 0039 — `character_provider_registrations` (2026-09-14)

`supabase/migrations/0039_character_provider_registrations.sql`. Paste into the Supabase SQL editor → Run.

One table, keyed by `(node_id, provider)`, holding a Character node's Kling voice and element ids
plus the source urls/key they were built from (D266). Written only by the server inside the
video-generate Trigger task; the client never touches it. Cascades on node delete.

**Deploy ordering:** apply BEFORE the app code that ships plan 2 of the Character work. Without
it every Kling 3.0 Omni generation that references a Character fails at registration lookup.

**Verify after running:**

```sql
select count(*) from character_provider_registrations; -- 0 on a fresh apply
```
```

- [ ] **Step 2: Write the failing test**

Look at `src/lib/db/decisions.test.ts` (or another db test) for how `createServerSupabase` is mocked, and mirror it:

```ts
// src/lib/db/character-registrations.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();
const upsert = vi.fn(async () => ({ error: null }));
const eq2 = vi.fn(() => ({ maybeSingle }));
const eq1 = vi.fn(() => ({ eq: eq2 }));
const select = vi.fn(() => ({ eq: eq1 }));
const from = vi.fn(() => ({ select, upsert }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: () => ({ from }) }));

beforeEach(() => vi.clearAllMocks());

describe("character registrations", () => {
  it("reads a row into camelCase", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { node_id: "n", provider: "kling", voice_id: "v", voice_source_url: "vu", element_id: "e", element_source_key: "k" }, error: null });
    const { getRegistration } = await import("./character-registrations");
    expect(await getRegistration("n", "kling")).toEqual({ nodeId: "n", provider: "kling", voiceId: "v", voiceSourceUrl: "vu", elementId: "e", elementSourceKey: "k" });
    expect(from).toHaveBeenCalledWith("character_provider_registrations");
  });
  it("returns null when there is no row", async () => {
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const { getRegistration } = await import("./character-registrations");
    expect(await getRegistration("n", "kling")).toBeNull();
  });
  it("upserts on (node_id, provider)", async () => {
    const { saveRegistration } = await import("./character-registrations");
    await saveRegistration({ nodeId: "n", provider: "kling", voiceId: "v", voiceSourceUrl: "vu", elementId: "e", elementSourceKey: "k" });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ node_id: "n", provider: "kling", voice_id: "v", element_id: "e", element_source_key: "k" }),
      { onConflict: "node_id,provider" },
    );
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/lib/db/character-registrations.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 4: Write the module**

```ts
// src/lib/db/character-registrations.ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export type CharacterRegistration = {
  nodeId: string;
  provider: "kling";
  voiceId: string | null;
  voiceSourceUrl: string | null;
  elementId: string | null;
  elementSourceKey: string | null;
};

type Row = {
  node_id: string;
  provider: "kling";
  voice_id: string | null;
  voice_source_url: string | null;
  element_id: string | null;
  element_source_key: string | null;
};

export async function getRegistration(
  nodeId: string,
  provider: "kling",
): Promise<CharacterRegistration | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("character_provider_registrations")
    .select("node_id, provider, voice_id, voice_source_url, element_id, element_source_key")
    .eq("node_id", nodeId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Row;
  return {
    nodeId: r.node_id,
    provider: r.provider,
    voiceId: r.voice_id,
    voiceSourceUrl: r.voice_source_url,
    elementId: r.element_id,
    elementSourceKey: r.element_source_key,
  };
}

export async function saveRegistration(reg: CharacterRegistration): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("character_provider_registrations").upsert(
    {
      node_id: reg.nodeId,
      provider: reg.provider,
      voice_id: reg.voiceId,
      voice_source_url: reg.voiceSourceUrl,
      element_id: reg.elementId,
      element_source_key: reg.elementSourceKey,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "node_id,provider" },
  );
  if (error) throw error;
}
```

- [ ] **Step 5: Run, apply locally, commit**

Run: `npx vitest run src/lib/db/character-registrations.test.ts` → PASS. Apply the migration to the staging Supabase project via the SQL editor (or `supabase db push` if that is how this repo applies them — check the top of `docs/auth-production-migration.md`).

```bash
git add supabase/migrations/0039_character_provider_registrations.sql docs/auth-production-migration.md src/lib/db/character-registrations.ts src/lib/db/character-registrations.test.ts
git commit -m "feat(db): character_provider_registrations for Kling voice/element ids (D266)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `ensureKlingElement` — the voice → element lifecycle

**Files:**
- Create: `src/lib/video-gen/providers/kling-elements.ts`
- Test: `src/lib/video-gen/providers/__tests__/kling-elements.test.ts`

**Interfaces:**
- Consumes: `CharacterRef` (plan 1); `getRegistration`, `saveRegistration` (Task 1); `KLING_API_BASE`, `getApiKey`, `POLL_INTERVAL_MS`, `isRetryableStatus` — **export these from `kling.ts`** (they are module-private today) rather than re-declaring them.
- Produces:
  ```ts
  export function elementSourceKey(c: Pick<CharacterRef, "faceUrls" | "voice">): string;
  export async function ensureKlingElement(c: CharacterRef): Promise<{ elementId: string }>;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/video-gen/providers/__tests__/kling-elements.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
vi.mock("@trigger.dev/sdk/v3", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const getRegistration = vi.fn();
const saveRegistration = vi.fn(async () => {});
vi.mock("@/lib/db/character-registrations", () => ({ getRegistration, saveRegistration }));

const json = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

const riya = {
  characterId: "n1", name: "Riya Venkataraman-Subramaniam", notes: "late 20s, warm",
  faceUrls: ["https://x/f0.jpg", "https://x/f1.jpg"],
  voice: { url: "https://x/v.mp3", durationSeconds: 12 },
  faceRefIndexes: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KLING_API_KEY = "k";
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => { fn(); return 0; }) as never);
});

describe("elementSourceKey", () => {
  it("is order-independent over faces and includes the voice", async () => {
    const { elementSourceKey } = await import("../kling-elements");
    expect(elementSourceKey({ faceUrls: ["b", "a"], voice: { url: "v", durationSeconds: 1 } }))
      .toBe(elementSourceKey({ faceUrls: ["a", "b"], voice: { url: "v", durationSeconds: 1 } }));
    expect(elementSourceKey({ faceUrls: ["a"], voice: undefined }))
      .not.toBe(elementSourceKey({ faceUrls: ["a"], voice: { url: "v", durationSeconds: 1 } }));
  });
});

describe("ensureKlingElement", () => {
  it("reuses a registration whose key matches, without calling Kling", async () => {
    const { elementSourceKey, ensureKlingElement } = await import("../kling-elements");
    getRegistration.mockResolvedValueOnce({ nodeId: "n1", provider: "kling", voiceId: "v9", voiceSourceUrl: riya.voice.url, elementId: "e9", elementSourceKey: elementSourceKey(riya) });
    expect(await ensureKlingElement(riya)).toEqual({ elementId: "e9" });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(saveRegistration).not.toHaveBeenCalled();
  });

  it("creates voice then element on first use, polling each to succeed, and stores both", async () => {
    const { ensureKlingElement } = await import("../kling-elements");
    getRegistration.mockResolvedValueOnce(null);
    mockFetch
      .mockResolvedValueOnce(json({ code: 0, data: { task_id: "vt" } }))                                   // create voice
      .mockResolvedValueOnce(json({ code: 0, data: { task_status: "processing" } }))                      // poll
      .mockResolvedValueOnce(json({ code: 0, data: { task_status: "succeed", task_result: { voices: [{ voice_id: "v1" }] } } }))
      .mockResolvedValueOnce(json({ code: 0, data: { task_id: "et" } }))                                   // create element
      .mockResolvedValueOnce(json({ code: 0, data: { task_status: "succeed", task_result: { elements: [{ element_id: 42 }] } } }));

    expect(await ensureKlingElement(riya)).toEqual({ elementId: "42" });

    const [voiceCall, , , elementCall] = mockFetch.mock.calls;
    expect(voiceCall[0]).toBe("https://api-singapore.klingai.com/v1/general/custom-voices");
    expect(JSON.parse(voiceCall[1].body)).toEqual({ voice_name: "Riya Venkataraman-Su", voice_url: "https://x/v.mp3" });
    expect(elementCall[0]).toBe("https://api-singapore.klingai.com/v1/general/advanced-custom-elements");
    expect(JSON.parse(elementCall[1].body)).toEqual({
      element_name: "Riya Venkataraman-Su",
      element_description: "late 20s, warm",
      reference_type: "image_refer",
      element_image_list: { frontal_image: "https://x/f0.jpg", refer_images: [{ image_url: "https://x/f1.jpg" }] },
      element_voice_id: "v1",
      tag_list: [{ tag_id: "o_102" }],
    });
    expect(saveRegistration).toHaveBeenLastCalledWith(expect.objectContaining({ nodeId: "n1", voiceId: "v1", elementId: "42" }));
  });

  it("re-registers only the element when faces changed and the voice did not, and deletes the old element", async () => {
    const { ensureKlingElement } = await import("../kling-elements");
    getRegistration.mockResolvedValueOnce({ nodeId: "n1", provider: "kling", voiceId: "v1", voiceSourceUrl: riya.voice.url, elementId: "old", elementSourceKey: "stale" });
    mockFetch
      .mockResolvedValueOnce(json({ code: 0, data: { task_id: "et" } }))
      .mockResolvedValueOnce(json({ code: 0, data: { task_status: "succeed", task_result: { elements: [{ element_id: 43 }] } } }))
      .mockResolvedValueOnce(json({ code: 0, data: {} })); // delete old element
    expect(await ensureKlingElement(riya)).toEqual({ elementId: "43" });
    expect(mockFetch.mock.calls.some(([url]) => String(url).endsWith("/custom-voices"))).toBe(false);
    const del = mockFetch.mock.calls.find(([url]) => String(url).endsWith("/delete-advanced-elements"));
    expect(JSON.parse(del![1].body)).toEqual({ element_id: "old" });
  });

  it("omits element_voice_id and uses the name as description for a voiceless, note-less character", async () => {
    const { ensureKlingElement } = await import("../kling-elements");
    getRegistration.mockResolvedValueOnce(null);
    mockFetch
      .mockResolvedValueOnce(json({ code: 0, data: { task_id: "et" } }))
      .mockResolvedValueOnce(json({ code: 0, data: { task_status: "succeed", task_result: { elements: [{ element_id: 7 }] } } }));
    await ensureKlingElement({ ...riya, name: "Sam", notes: undefined, voice: undefined, faceUrls: ["https://x/s0.jpg"] });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.element_voice_id).toBeUndefined();
    expect(body.element_description).toBe("Sam");
    expect(body.element_image_list).toEqual({ frontal_image: "https://x/s0.jpg", refer_images: [] });
  });

  it("fails with the vendor's reason and stores nothing when a task fails", async () => {
    const { ensureKlingElement } = await import("../kling-elements");
    getRegistration.mockResolvedValueOnce(null);
    mockFetch
      .mockResolvedValueOnce(json({ code: 0, data: { task_id: "vt" } }))
      .mockResolvedValueOnce(json({ code: 0, data: { task_status: "failed", task_status_msg: "voice has background music" } }));
    await expect(ensureKlingElement(riya)).rejects.toThrow("Kling voice registration for Riya Venkataraman-Subramaniam failed: voice has background music");
    expect(saveRegistration).not.toHaveBeenCalled();
  });

  it("refuses a character with no frontal face", async () => {
    const { ensureKlingElement } = await import("../kling-elements");
    await expect(ensureKlingElement({ ...riya, faceUrls: [] })).rejects.toThrow("needs a frontal face");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/video-gen/providers/__tests__/kling-elements.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Export the shared bits from `kling.ts`**

In `providers/kling.ts` change `const KLING_API_BASE`, `function getApiKey`, `const POLL_INTERVAL_MS`, `function isRetryableStatus` to `export`ed. Nothing else changes yet.

- [ ] **Step 4: Write `kling-elements.ts`**

```ts
// src/lib/video-gen/providers/kling-elements.ts
import "server-only";
import { logger } from "@trigger.dev/sdk/v3";
import type { CharacterRef } from "../types";
import { getRegistration, saveRegistration } from "@/lib/db/character-registrations";
import { KLING_API_BASE, getApiKey, POLL_INTERVAL_MS, isRetryableStatus } from "./kling";

// D266 — a Character's Kling element: the faces as a multi-image element with the voice bound.
//
// Kling's Omni endpoint takes no voice of its own (verified against the 3.0 Omni video-omni docs;
// there is no `voice_ids` there). The element IS the voice path, and it is a paid, persistent
// library resource — so it is built once per (faces, voice) and reused, not once per clip.
//
// Contract: ref/kling-docs/Kling 3.0 Voice Management.md and Kling 3.0 Element Management.md.
// Both creations are async tasks polled to `succeed`.

const NAME_MAX = 20;
const DESCRIPTION_MAX = 100;
/** Kling's own tag for a character element (Element Management, tag_list). */
const CHARACTER_TAG = "o_102";
/** Registration tasks are short (seconds to a couple of minutes); bound them anyway. */
const REGISTRATION_DEADLINE_MS = 10 * 60_000;

/** What an element was built from. A changed face or voice changes this, which invalidates it. */
export function elementSourceKey(c: Pick<CharacterRef, "faceUrls" | "voice">): string {
  return [...c.faceUrls].sort().join("|") + "||" + (c.voice?.url ?? "");
}

type KlingTaskEnvelope<TResult> = {
  code: number;
  message?: string;
  data?: {
    task_id?: string;
    task_status?: "submitted" | "processing" | "succeed" | "failed";
    task_status_msg?: string;
    task_result?: TResult;
  };
};

async function klingPost<T>(path: string, body: Record<string, unknown>): Promise<KlingTaskEnvelope<T>> {
  const res = await fetch(`${KLING_API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getApiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Kling ${path} failed (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as KlingTaskEnvelope<T>;
  if (json.code !== 0) throw new Error(`Kling ${path} rejected: ${json.message ?? "unknown"}`);
  return json;
}

/** Poll a registration task until it succeeds; throws the vendor's own reason on failure. */
async function pollKlingRegistration<T>(path: string, taskId: string, what: string): Promise<T> {
  const deadline = Date.now() + REGISTRATION_DEADLINE_MS;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (Date.now() > deadline) throw new Error(`${what} did not finish within 10 minutes.`);

    const res = await fetch(`${KLING_API_BASE}${path}/${taskId}`, {
      headers: { Authorization: `Bearer ${getApiKey()}` },
    });
    if (!res.ok) {
      if (isRetryableStatus(res.status)) {
        logger.warn("Kling registration poll failed, retrying", { path, taskId, status: res.status });
        continue;
      }
      throw new Error(`${what} poll failed (${res.status})`);
    }
    const json = (await res.json()) as KlingTaskEnvelope<T>;
    const status = json.data?.task_status;
    logger.info("Kling registration status", { path, taskId, status });
    if (status === "succeed") {
      if (!json.data?.task_result) throw new Error(`${what} succeeded but returned no result`);
      return json.data.task_result;
    }
    if (status === "failed") {
      throw new Error(`${what} failed: ${json.data?.task_status_msg ?? "no reason given"}`);
    }
  }
}

async function bestEffortDelete(path: string, body: Record<string, unknown>): Promise<void> {
  try {
    await klingPost(path, body);
  } catch (e) {
    // A leaked library resource costs quota, not correctness. Say so and move on.
    logger.warn("Kling delete failed (ignored)", { path, body, error: e instanceof Error ? e.message : String(e) });
  }
}

async function createVoice(c: CharacterRef): Promise<string> {
  if (!c.voice) throw new Error("createVoice called without a voice");
  const created = await klingPost<never>("/v1/general/custom-voices", {
    voice_name: c.name.slice(0, NAME_MAX),
    voice_url: c.voice.url,
  });
  const taskId = created.data?.task_id;
  if (!taskId) throw new Error(`Kling voice registration for ${c.name} returned no task id`);
  const result = await pollKlingRegistration<{ voices?: Array<{ voice_id: string }> }>(
    "/v1/general/custom-voices", taskId, `Kling voice registration for ${c.name}`,
  );
  const voiceId = result.voices?.[0]?.voice_id;
  if (!voiceId) throw new Error(`Kling voice registration for ${c.name} returned no voice_id`);
  return voiceId;
}

async function createElement(c: CharacterRef, voiceId: string | null): Promise<string> {
  const [frontal, ...others] = c.faceUrls;
  const created = await klingPost<never>("/v1/general/advanced-custom-elements", {
    element_name: c.name.slice(0, NAME_MAX),
    // Required by Kling. The note is what the operator wrote for writers; the name is the fallback.
    element_description: (c.notes?.trim() || c.name).slice(0, DESCRIPTION_MAX),
    reference_type: "image_refer",
    element_image_list: { frontal_image: frontal, refer_images: others.map((image_url) => ({ image_url })) },
    ...(voiceId ? { element_voice_id: voiceId } : {}),
    tag_list: [{ tag_id: CHARACTER_TAG }],
  });
  const taskId = created.data?.task_id;
  if (!taskId) throw new Error(`Kling element registration for ${c.name} returned no task id`);
  const result = await pollKlingRegistration<{ elements?: Array<{ element_id: number | string }> }>(
    "/v1/general/advanced-custom-elements", taskId, `Kling element registration for ${c.name}`,
  );
  const elementId = result.elements?.[0]?.element_id;
  if (elementId === undefined || elementId === null) {
    throw new Error(`Kling element registration for ${c.name} returned no element_id`);
  }
  // Stored as text; the query returns a number. Stringify here, and `klingElementIdValue`
  // below restores the wire type when the id is sent back.
  return String(elementId);
}

/**
 * The element id in the type Kling returned it. The element query shows `element_id: 0` (a
 * number) while every delete/request example types it as a string; sending digits back as a
 * number is the safer reading of the vendor's own response. Non-numeric ids pass through.
 */
export function klingElementIdValue(elementId: string): number | string {
  return /^\d+$/.test(elementId) ? Number(elementId) : elementId;
}

/**
 * Reuse the character's element if nothing it was built from has changed; otherwise (re)build
 * it. Stores ids ONLY on success, so a failed task leaves no half-registration behind and the
 * next generate retries from scratch. Superseded ids are deleted best-effort.
 */
export async function ensureKlingElement(c: CharacterRef): Promise<{ elementId: string }> {
  if (c.faceUrls.length === 0) {
    throw new Error(`${c.name} needs a frontal face before Kling can build its element.`);
  }

  const key = elementSourceKey(c);
  const existing = await getRegistration(c.characterId, "kling");
  if (existing?.elementId && existing.elementSourceKey === key) {
    return { elementId: existing.elementId };
  }

  // Voice: reuse when the same sample was already registered, else register (or none).
  let voiceId: string | null = null;
  const voiceChanged = (existing?.voiceSourceUrl ?? null) !== (c.voice?.url ?? null);
  if (c.voice) {
    voiceId = voiceChanged || !existing?.voiceId ? await createVoice(c) : existing.voiceId;
  }

  const elementId = await createElement(c, voiceId);

  await saveRegistration({
    nodeId: c.characterId,
    provider: "kling",
    voiceId,
    voiceSourceUrl: c.voice?.url ?? null,
    elementId,
    elementSourceKey: key,
  });

  if (existing?.elementId && existing.elementId !== elementId) {
    await bestEffortDelete("/v1/general/delete-advanced-elements", { element_id: existing.elementId });
  }
  if (existing?.voiceId && voiceId !== existing.voiceId) {
    await bestEffortDelete("/v1/general/delete-voices", { voice_id: existing.voiceId });
  }

  return { elementId };
}
```

- [ ] **Step 5: Run, type-check, commit**

Run: `npx vitest run src/lib/video-gen/providers/__tests__/kling-elements.test.ts src/lib/video-gen/__tests__/kling-provider.test.ts && npx tsc --noEmit`
Expected: PASS (7 tests; the provider tests still pass after the exports).

```bash
git add src/lib/video-gen/providers/kling-elements.ts src/lib/video-gen/providers/__tests__/kling-elements.test.ts src/lib/video-gen/providers/kling.ts
git commit -m "feat(kling): ensureKlingElement — lazy voice + element registration, cached by source key

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Kling 3.0 Omni sends elements

**Files:**
- Modify: `src/lib/video-gen/providers/kling.ts` (`buildKlingContents`, `generateWithKling`, `kling30Omni`)
- Modify: `src/lib/video-gen/client-models.ts` (Kling 3.0 Omni `voiceInput: "element"`)
- Modify: `src/app/api/nodes/[id]/video-generate/route.ts`
- Test: `src/lib/video-gen/__tests__/kling-provider.test.ts` (extend)

**Interfaces:**
- Consumes: `ensureKlingElement`, `klingElementIdValue` (Task 2); `CharacterRef` (plan 1).
- Produces: `buildKlingContents({ …, elements?: Array<{ elementId: string; id: string }> })` emits `{ type: "element", element_id, id }` after `refer_image`s; `generateWithKling` on an `element` model strips character faces from `refer_image`, registers each character with faces, forces `audio: "native"` when any element is present, and throws when `refer_image` + elements > 7.

- [ ] **Step 1: Write the failing tests**

Add to `kling-provider.test.ts`:

```ts
describe("elements", () => {
  it("emits element entries after refer_images with element_N ids", async () => {
    const { buildKlingContents } = await import("../providers/kling");
    const contents = buildKlingContents({
      prompt: "p",
      referenceUrls: ["https://x/r1.png"],
      elements: [{ elementId: "42", id: "element_1" }, { elementId: "abc", id: "element_2" }],
    });
    expect(contents).toEqual([
      { type: "prompt", text: "p" },
      { type: "refer_image", url: "https://x/r1.png", id: "image_1" },
      { type: "element", element_id: 42, id: "element_1" },
      { type: "element", element_id: "abc", id: "element_2" },
    ]);
  });
});

describe("kling30Omni with characters", () => {
  const riya = { characterId: "n1", name: "Riya", faceUrls: ["https://x/f0.jpg", "https://x/f1.jpg"], voice: { url: "https://x/v.mp3", durationSeconds: 12 }, faceRefIndexes: [] };

  it("registers the character, drops its faces from refer_image, forces native audio", async () => {
    vi.doMock("../providers/kling-elements", () => ({
      ensureKlingElement: vi.fn(async () => ({ elementId: "42" })),
      klingElementIdValue: (id: string) => (/^\d+$/.test(id) ? Number(id) : id),
    }));
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 0, data: { id: "t1", status: "submitted" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ code: 0, data: [{ id: "t1", status: "succeeded", outputs: [{ type: "video", url: "https://x/out.mp4", duration: "5" }] }] }) });
    const { kling30Omni } = await import("../providers/kling");
    await kling30Omni.generate({
      prompt: "@element_1 walks",
      referenceUrls: ["https://x/product.png"],
      params: { audio: "off", duration: 5 },
      characters: [riya],
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents).toEqual([
      { type: "prompt", text: "@element_1 walks" },
      { type: "refer_image", url: "https://x/product.png", id: "image_1" },
      { type: "element", element_id: 42, id: "element_1" },
    ]);
    expect(body.settings.audio).toBe("native");
    vi.doUnmock("../providers/kling-elements");
  });

  it("refuses more than 7 refer_images + elements", async () => {
    vi.doMock("../providers/kling-elements", () => ({
      ensureKlingElement: vi.fn(async () => ({ elementId: "1" })),
      klingElementIdValue: (id: string) => id,
    }));
    const { kling30Omni } = await import("../providers/kling");
    const refs = Array.from({ length: 7 }, (_, i) => `https://x/r${i}.png`);
    await expect(kling30Omni.generate({ prompt: "p", referenceUrls: refs, params: {}, characters: [riya] }))
      .rejects.toThrow("Kling takes at most 7 reference images and elements together");
    vi.doUnmock("../providers/kling-elements");
  });
});
```

(If this test file resets modules between tests with `vi.resetModules()`, keep that; the `vi.doMock` calls above rely on a fresh import.)

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/video-gen/__tests__/kling-provider.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement in `kling.ts`**

`KlingContentInput` gains `elements?: Array<{ elementId: string; id: string }>`. In `buildKlingContents`, after the `refer_image` loop:

```ts
  // D266 — a Character on 3.0 Omni is an element, addressed in the prompt as @element_N exactly
  // as an image is @image_N. Emitted after the images so both handle families count from 1.
  (input.elements ?? []).forEach(({ elementId, id }) => {
    contents.push({ type: "element", element_id: klingElementIdValue(elementId), id });
  });
```

`KlingEndpointConfig` gains `supportsElements: boolean` (true only for `kling30Omni`). In `generateWithKling`, after `referenceUrls` is computed:

```ts
  // D264/D266 — on an element-capable endpoint a Character's faces are NOT loose references:
  // they were removed from `referenceUrls` by the route and travel inside the element instead.
  // Registration happens here, inside the Trigger task, because it is a paid multi-minute poll.
  const elements: Array<{ elementId: string; id: string }> = [];
  if (config.supportsElements) {
    const withFaces = (input.characters ?? []).filter((c) => c.faceUrls.length > 0);
    for (const [i, c] of withFaces.entries()) {
      logger.info("Registering character on Kling", { name: c.name, hasVoice: Boolean(c.voice) });
      const { elementId } = await ensureKlingElement(c);
      elements.push({ elementId, id: `element_${i + 1}` });
    }
    // Element Management: "the sum of the number of reference pictures and multi-image element
    // shall not exceed 7" without a reference video. Same rule the route checks; this is the
    // backstop for callers that bypass it.
    if (referenceUrls.length + elements.length > KLING_MAX_REFS_AND_ELEMENTS) {
      throw new Error(
        `Kling takes at most ${KLING_MAX_REFS_AND_ELEMENTS} reference images and elements together; ` +
          `this request has ${referenceUrls.length} references and ${elements.length} characters.`,
      );
    }
  }
```

(import `KLING_MAX_REFS_AND_ELEMENTS` from `@/lib/character/constants`; add it there if plan 1 didn't: `export const KLING_MAX_REFS_AND_ELEMENTS = 7;`). Relax the "needs a start frame or at least one reference" guard to also accept `elements.length > 0`. Pass `elements` into `buildKlingContents`. After `buildSettings(...)`:

```ts
  // A bound voice is inaudible with audio off — an operator who attached a voice has chosen
  // sound. Only elements can carry a voice, so this is exactly the element case.
  if (elements.length > 0) settings.audio = "native";
```

Set `voiceInput: "element"` on `kling30Omni` (and `supportsElements: true` in its endpoint config; `false` on `kling30` and `klingO1`). Mirror `voiceInput: "element"` on the Kling 3.0 Omni entry in `client-models.ts`.

- [ ] **Step 4: The route strips faces on element models**

In `video-generate/route.ts`, immediately after `collectUpstreamImages(...)` and before `orderImagesForPromptTokens`:

```ts
    // D266 — on a model that takes a Character as an element, its faces are not references: they
    // go inside the element, and counting them here would both eat the reference cap and shift
    // every `@image_N` the prompt was numbered with. The client dialect excludes them the same way.
    const imagesForRoles =
      config.voiceInput === "element"
        ? upstreamImages.filter((img) => img.type !== "character")
        : upstreamImages;
```

and use `imagesForRoles` in place of `upstreamImages` from there on. After `characters` is built (plan 1 Task 9 block), add:

```ts
    if (config.voiceInput === "element") {
      const elementCount = characters.filter((c) => c.faceUrls.length > 0).length;
      if (referenceUrls.length + elementCount > KLING_MAX_REFS_AND_ELEMENTS) {
        return apiError(
          `Kling takes at most ${KLING_MAX_REFS_AND_ELEMENTS} reference images and elements together; ` +
            `this request has ${referenceUrls.length} references and ${elementCount} characters.`,
          400,
        );
      }
    }
```

- [ ] **Step 5: Run, type-check, commit**

Run: `npx vitest run src/lib/video-gen/__tests__/kling-provider.test.ts src/lib/video-gen/__tests__/kling-3-0-omni-registration.test.ts "src/app/api/nodes/[id]/video-generate" && npx tsc --noEmit`
Expected: PASS.

```bash
git add src/lib/video-gen/providers/kling.ts src/lib/video-gen/client-models.ts src/lib/character/constants.ts "src/app/api/nodes/[id]/video-generate/route.ts" src/lib/video-gen/__tests__/kling-provider.test.ts
git commit -m "feat(kling): 3.0 Omni sends a Character as an element with native audio

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The Kling dialect cites a character as `@element_N`

**Files:**
- Modify: `src/lib/nodes/prompt-token-dialect.ts` (`klingImageDialect`, `dialectForCapability`)
- Modify: `src/lib/nodes/multishot-plan.ts` (add `elementsCitedIn`)
- Modify: `src/components/nodes/multishot-prompt-focus-view.tsx:185-225`
- Test: `src/lib/nodes/__tests__/prompt-token-dialect.test.ts`, `src/lib/nodes/__tests__/multishot-plan.test.ts` (extend)

**Interfaces:**
- Consumes: `isFrontalFaceId`, `parseFaceRefId` (plan 1).
- Produces: `klingImageDialect(orderedIds: string[], elementIds: string[] = [])`; `dialectForCapability(cap, orderedIds, elementIds = [])`; `elementsCitedIn(text: string): number[]` (0-based element indexes).

- [ ] **Step 1: Write the failing tests**

Add to `prompt-token-dialect.test.ts`:

```ts
describe("klingImageDialect with elements", () => {
  const d = klingImageDialect(["img-a", "img-b"], ["c1#0", "c2#0"]);
  it("emits @element_N for a character's frontal id and @image_N for images", () => {
    expect(d.tokenForId("c2#0", "Riya")).toBe("@element_2");
    expect(d.tokenForId("img-b", "b")).toBe("@image_2");
  });
  it("parses @element_N back to the character's frontal id", () => {
    expect(d.parse("x @element_1 y @image_2")).toEqual([
      { kind: "text", text: "x " },
      { kind: "mention", label: "@element_1", id: "c1#0" },
      { kind: "text", text: " y " },
      { kind: "mention", label: "@image_2", id: "img-b" },
    ]);
  });
  it("round-trips through tokenOf", () => {
    expect(serializeSegments(d.parse("@element_2 and @image_1"), d)).toBe("@element_2 and @image_1");
  });
  it("marks an element index past the end as missing", () => {
    expect(d.parse("@element_9")[0]).toEqual({ kind: "mention", label: "@element_9", id: "__missing_element_8" });
  });
});
```

Add to `multishot-plan.test.ts`:

```ts
describe("elementsCitedIn", () => {
  it("returns 0-based element indexes, deduplicated", () => {
    expect(elementsCitedIn("@element_1 talks to @element_2; @element_1 nods")).toEqual([0, 1]);
    expect(elementsCitedIn("@image_1 only")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/nodes/__tests__/prompt-token-dialect.test.ts src/lib/nodes/__tests__/multishot-plan.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend the dialect**

In `prompt-token-dialect.ts`, replace `KLING_IMAGE_RE` and `klingImageDialect` with:

```ts
// One regex for both handle families so a single left-to-right pass keeps segments in order.
// Group 1 = image index, group 2 = element index; exactly one is set per match.
const KLING_HANDLE_RE = /@image_(\d+)|@element_(\d+)/g;

/**
 * `@image_N` — Kling's own handle syntax, ONE-based over the attached references — and, on 3.0
 * Omni, `@element_N` for a Character (D266), one-based over `elementIds` in the order the route
 * sends elements (characters with a frontal face, in upstream order).
 *
 * `elementIds` are the characters' FRONTAL face ids (`<characterId>#0`): that is the entry the `@`
 * menu offers and the id a beat stores, so the same stored mention renders as `@image_N` on a
 * model that takes faces as references and as `@element_N` on one that takes an element.
 *
 * Mirrors `imageRefDialect` line for line otherwise — same `orderedIds` contract, same unknown-id
 * behaviour (echo the original text rather than rewriting it), same chip label.
 */
export function klingImageDialect(orderedIds: string[], elementIds: string[] = []): TokenDialect {
  const imageIndex = new Map(orderedIds.map((id, i) => [id, i]));
  const elementIndex = new Map(elementIds.map((id, i) => [id, i]));
  return {
    parse(value) {
      if (!value) return [];
      const segments: Segment[] = [];
      let last = 0;
      for (const m of value.matchAll(KLING_HANDLE_RE)) {
        const at = m.index ?? 0;
        if (at > last) segments.push({ kind: "text", text: value.slice(last, at) });
        if (m[1] !== undefined) {
          const i = Number(m[1]) - 1;
          segments.push({ kind: "mention", label: m[0], id: orderedIds[i] ?? `__missing_${i}` });
        } else {
          const i = Number(m[2]) - 1;
          segments.push({ kind: "mention", label: m[0], id: elementIds[i] ?? `__missing_element_${i}` });
        }
        last = at + m[0].length;
      }
      if (last < value.length) segments.push({ kind: "text", text: value.slice(last) });
      return segments;
    },
    tokenOf(segment) {
      const e = elementIndex.get(segment.id);
      if (e !== undefined) return `@element_${e + 1}`;
      const i = imageIndex.get(segment.id);
      return i === undefined ? segment.label : `@image_${i + 1}`;
    },
    tokenForId(id) {
      const e = elementIndex.get(id);
      if (e !== undefined) return `@element_${e + 1}`;
      const i = imageIndex.get(id);
      return i === undefined ? null : `@image_${i + 1}`;
    },
    chipLabel: (segment, upstreamLabel) => upstreamLabel ?? segment.label,
  };
}
```

`dialectForCapability(cap, orderedIds, elementIds: string[] = [])` passes `elementIds` to `klingImageDialect` only; the other two branches ignore it.

In `multishot-plan.ts` add next to `refsCitedIn`:

```ts
const KLING_ELEMENT_REF = /@element_(\d+)/g;

/** Element citations in a Kling beat, as 0-based indexes into the request's element list. */
export function elementsCitedIn(text: string): number[] {
  const seen = new Set<number>();
  for (const match of text.matchAll(KLING_ELEMENT_REF)) seen.add(Number(match[1]) - 1);
  return [...seen];
}
```

- [ ] **Step 4: The multishot focus view**

In `multishot-prompt-focus-view.tsx`, where `promptRefImages` / `refIds` / `beatDialect` / `uncitedIndices` are built (lines ~185–225):

```ts
  // D266 — on an element model a Character's faces are NOT reference images: they travel inside
  // the element, so they leave the `@image_N` numbering and the character is cited as
  // `@element_N` via its frontal id. Same partition the route makes with `voiceInput`.
  const isElementModel = videoGenClientModelMap[cap.id]?.voiceInput === "element";
  const refIdsKey = promptRefImages
    .filter((r) => !(isElementModel && parseFaceRefId(r.id)))
    .map((r) => r.id)
    .join(",");
  const elementIdsKey = isElementModel
    ? promptRefImages.filter((r) => isFrontalFaceId(r.id)).map((r) => r.id).join(",")
    : "";
  const refIds = useMemo(() => (refIdsKey ? refIdsKey.split(",") : []), [refIdsKey]);
  const elementIds = useMemo(() => (elementIdsKey ? elementIdsKey.split(",") : []), [elementIdsKey]);
  const beatDialect = useMemo(() => dialectForCapability(cap, refIds, elementIds), [cap, refIds, elementIds]);
```

and in `uncitedIndices`, after collecting `cited` from `refsCitedIn`, for the element model also mark every face of a cited character:

```ts
    if (isElementModel) {
      const citedElements = new Set(planDraft.beats.flatMap((b) => elementsCitedIn(b.text)));
      promptRefImages.forEach((r, i) => {
        const face = parseFaceRefId(r.id);
        if (!face) return;
        const elementIdx = elementIds.indexOf(faceRefId(face.characterId, 0));
        if (elementIdx !== -1 && citedElements.has(elementIdx)) cited.add(i);
      });
    }
```

(`refsCitedIn` indexes into the image roster; on the element model that roster is `refIds`, not `promptRefImages`, so map its indexes through `refIds[i]` → `promptRefImages.findIndex(r => r.id === …)` when building `cited`. Import `parseFaceRefId`, `isFrontalFaceId`, `faceRefId` from `@/lib/character/refs`, `elementsCitedIn` from `@/lib/nodes/multishot-plan`, and `videoGenClientModelMap` from `@/lib/video-gen/client-models`.)

- [ ] **Step 5: Run, type-check, try it**

Run: `npx vitest run src/lib/nodes/__tests__/prompt-token-dialect.test.ts src/lib/nodes/__tests__/multishot-plan.test.ts && npx tsc --noEmit`
Expected: PASS.

Dev: Multishot node targeting Kling 3.0 Omni, Character connected; `@`-mention the character in a beat → the chip renders the frontal face and the rendered prompt reads `@element_1`; a product image beside it reads `@image_1`. Switch the Multishot node to Seedance and regenerate → the same mention renders as `@Image N` for the frontal face.

- [ ] **Step 6: Commit**

```bash
git add src/lib/nodes/prompt-token-dialect.ts src/lib/nodes/multishot-plan.ts src/components/nodes/multishot-prompt-focus-view.tsx src/lib/nodes/__tests__/prompt-token-dialect.test.ts src/lib/nodes/__tests__/multishot-plan.test.ts
git commit -m "feat(multishot): Kling dialect cites a character as @element_N

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: End-to-end on Kling and wrap-up

- [ ] **Step 1: Run the touched suites**

Run: `npx vitest run src/lib/video-gen src/lib/nodes src/lib/db/character-registrations.test.ts "src/app/api/nodes/[id]/video-generate" && npx tsc --noEmit && npm run lint`
Expected: all PASS.

- [ ] **Step 2: A real Kling generation**

Multishot lane on Kling 3.0 Omni with a Character (frontal + one angle, 12 s voice). Generate. In the Trigger.dev run log confirm: "Registering character on Kling", the voice task and element task both reach `succeed`, `contents` carries `{type:"element", element_id, id:"element_1"}` and no `refer_image` for the faces, `settings.audio` is `"native"`. Confirm a row exists in `character_provider_registrations`. Generate again → no registration calls (reused). Replace the voice on the Character and generate → a new voice task, a new element task, and the old element/voice deleted (two `delete-*` calls in the log).

- [ ] **Step 3: Confirm the docs already say this**

Plan 1 Task 13 amended the spec §4.2 and D266 for the table and element-for-every-face. Re-read both; if plan 1 shipped without that task, do it now.

- [ ] **Step 4: Final commit if anything moved**

```bash
git status
# commit any stragglers with a conventional message
```

---

## Self-review notes

- **Spec coverage.** §4.2 steps 1–4 → Task 2; the generate call, `audio: native`, the 7-slot rule → Task 3; `@element_N` → Task 4; "Registering Riya on Kling…" status → the Trigger log line in Task 3 (a node-visible status would need the generation-status channel — deliberately out; the run log is where a multi-minute registration is watched today). §5 registration failure row → Task 2's failure test; credits refund → already the failed-generate path in `trigger/video-generate.ts`. §6.3–6.5 corrections → Tasks 2–3 encode them.
- **Deviations from the spec:** registrations in a table (why: autosave clobbers `nodes.data`); an element for every character with a frontal face, voiced or not (why: one rule for the dialect and the route; Kling elements are the consistency mechanism regardless of voice). Both recorded by plan 1 Task 13.
- **Type consistency.** `CharacterRef` (plan 1 Task 9) is what `ensureKlingElement` and `generateWithKling` read; `elementSourceKey` is computed from the same `faceUrls`/`voice`; element handle `element_N` is emitted by `buildKlingContents` and parsed by `klingImageDialect` with the same 1-based rule; `elementIds` on the client are frontal ids (`isFrontalFaceId`) in the same upstream order the route uses for `characters`.
