# Review Annotations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seniors paint region + note pairs on reviewed images (and paused video frames) as part of "Request changes"; the pairs persist on the decision record and the maker reads them in place.

**Architecture:** One new table (`node_version_annotations`, child of `node_version_decisions`) + one private storage bucket. The existing edit-mode annotation canvas is extracted to a shared component; `setVersionApprovalAction` grows an optional `annotations` payload (upload-before-write, atomic); the versions route returns annotations with signed URLs; both focus views mount compose/read layers on their existing media panes.

**Tech Stack:** Next.js server actions, Supabase (Postgres + Storage, service-role writes), React 19, vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-03-review-annotations-design.md` (ADRs D209–D214 in the roadmap §7 log). Read it before starting.

## Global Constraints

- Every interactive control is a shadcn primitive from `src/components/ui/*` (Base UI — compose via `render` prop, never `asChild`). **Never** a native `<button>`, `<textarea>`, `<input>`, `<select>`. Non-interactive `div`/`span`/`p` are fine.
- Icons: Lucide only, `strokeWidth={1.5}`, no fills.
- Motion: CSS/`motion` easing `cubic-bezier(0.22,1,0.36,1)` only; durations 200/320/500ms; no springs.
- Import, don't redefine: constants live in `src/lib/review-annotations/constants.ts`; nothing is re-declared locally.
- Caps (verbatim from spec §5.3): mask ≤ 1 MB, frame ≤ 2 MB each, ≤ 20 annotations per decision, total action payload ≤ 8 MB.
- Annotations attach **only** to `changes_requested` (D212). Uploads happen **before** any DB write; any upload failure fails the whole action (D214).
- Roles: annotate affordances follow `canSetApproval(orgRole)` (owner/senior); enforcement is server-side (D166). UI hiding is a courtesy, never the mechanism.
- Repo test convention: lib-level vitest with a mocked `createServerSupabase` (see `src/lib/db/decisions.test.ts`). There is no React component test infra — UI tasks end with typecheck + full suite + a manual verification checklist instead.
- Run tests with `npx vitest run <file>`; full suite `npm test`; typecheck `npx tsc --noEmit`. The Kling provider test can flake with a 5s cold-cache timeout — re-run once before investigating.

## File Structure

```
supabase/migrations/0035_review_annotations.sql          table + RLS + bucket
src/lib/review-annotations/
  constants.ts        caps, bucket name, kinds
  payload.ts          AnnotationPayload type, base64Bytes, validateAnnotations
  draft.ts            pure draft-list helpers (commit/remove renumbering)
  group.ts            pure timecode grouping for the video list
  storage.ts          server-only: asset paths, upload, signed URLs
  __tests__/          payload.test.ts, draft.test.ts, group.test.ts, storage.test.ts
src/lib/db/annotations.ts (+ annotations.test.ts)        insertAnnotations, getAnnotationsByDecisionIds
src/lib/db/decisions.ts                                  insertDecision gains optional `id`
src/lib/actions/approval.ts                              annotations payload, upload-before-write
src/app/api/nodes/[id]/versions/route.ts                 decisions[].annotations with signed URLs
src/components/review-annotations/
  review-annotation-canvas.tsx    extraction of ImageGenAnnotationCanvas (+ overlay export, stroke bounds)
  annotation-pin.tsx              numbered pin marker
  annotation-note-popover.tsx     anchored composer / read-only note card
  annotation-list.tsx             Review-column list (flat / timecode-grouped)
  annotation-overlay.tsx          read-only regions + pins over media
  use-annotation-drafts.ts        client draft state (wraps draft.ts)
  use-frame-capture.ts            captureFrame(videoEl)
src/components/nodes/image-gen-annotation-canvas.tsx     becomes a thin re-export (edit mode untouched)
src/components/nodes/inline-approval-bar.tsx             annotate entry point + draft count
src/components/nodes/image-gen-focus-view.tsx            compose + read wiring (image)
src/components/nodes/video-gen-focus-view.tsx            compose + read wiring (video)
src/components/nodes/version-decision-history.tsx        "n annotations" per decision row
```

---

### Task 1: Migration, bucket, and spec refinement

**Files:**
- Create: `supabase/migrations/0035_review_annotations.sql`
- Modify: `docs/superpowers/plans/MIGRATIONS-PENDING.md` (append an entry, matching the file's existing format)
- Modify: `docs/superpowers/specs/2026-09-03-review-annotations-design.md` (§5.2 wording)

**Interfaces:**
- Produces: table `node_version_annotations`, storage bucket `review-annotations`. Later tasks rely on the exact column names below.

- [x] **Step 1: Confirm 0035 is free**

Run: `ls supabase/migrations | sort | tail -3`
Expected: `0034_node_versions_updated_at.sql` is the highest. If a 0035 now exists (staging moved), renumber this file to the next free number everywhere it appears.

- [x] **Step 2: Write the migration**

```sql
-- D209–D214: region + note feedback attached to a changes_requested decision.
-- Child of node_version_decisions (0033); one row per painted region ("pin").
--
-- mask_path stores the PAINTED OVERLAY png (alpha > 0 = the region), NOT the
-- OpenAI edit mask. The overlay renders directly as the read-only region layer,
-- and overlayToMaskRGBA (src/lib/image-gen/mask.ts) converts it to the OpenAI
-- alpha convention at replay time — one stored asset serves display now and
-- AI replay later (D209).

create table node_version_annotations (
  id           uuid primary key default gen_random_uuid(),
  decision_id  uuid not null references node_version_decisions(id) on delete cascade,
  org_id       uuid not null references organizations(id),
  seq          int  not null,
  kind         text not null check (kind in ('image', 'video-frame')),
  timecode_ms  int,
  frame_path   text,
  mask_path    text not null,
  note         text not null,
  created_at   timestamptz not null default now(),
  unique (decision_id, seq),
  -- video-frame rows always carry a timecode and a captured still; image rows never do.
  check (
    (kind = 'image' and timecode_ms is null and frame_path is null)
    or (kind = 'video-frame' and timecode_ms is not null and frame_path is not null)
  )
);

-- Every read asks "all annotations for these decision ids, in pin order".
create index node_version_annotations_decision_idx
  on node_version_annotations (decision_id, seq);

-- Same posture as 0033: org-isolation SELECT, writes via service role only.
alter table node_version_annotations enable row level security;

create policy "org isolation" on node_version_annotations for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );

-- Private bucket for overlay + frame PNGs; assets are served via signed URLs.
insert into storage.buckets (id, name, public)
values ('review-annotations', 'review-annotations', false)
on conflict (id) do nothing;
```

- [x] **Step 3: Append to MIGRATIONS-PENDING.md**

Open `docs/superpowers/plans/MIGRATIONS-PENDING.md`, copy the format of the newest entry, and add `0035_review_annotations.sql` — table + RLS + `review-annotations` bucket, feature: review annotations (D209–D214).

- [x] **Step 4: Update spec §5.2 wording**

In the spec, replace the sentence "The mask PNG uses the existing `EDIT_ALPHA`/`KEEP_ALPHA` convention from `mask.ts` so V2 replay needs no translation." with:

> `mask_path` stores the painted overlay PNG (alpha > 0 = region) — it renders directly as the read-only region layer, and `overlayToMaskRGBA` converts it to the OpenAI `EDIT_ALPHA`/`KEEP_ALPHA` convention at replay time, so one stored asset serves display now and replay later.

Also add the two check constraints to the spec's SQL block so spec and migration agree.

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/0035_review_annotations.sql docs/superpowers/plans/MIGRATIONS-PENDING.md docs/superpowers/specs/2026-09-03-review-annotations-design.md
git commit -m "feat(db): node_version_annotations table + review-annotations bucket (D209-D214)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Payload types, caps, validation, draft helpers, timecode grouping

**Files:**
- Create: `src/lib/review-annotations/constants.ts`
- Create: `src/lib/review-annotations/payload.ts`
- Create: `src/lib/review-annotations/draft.ts`
- Create: `src/lib/review-annotations/group.ts`
- Test: `src/lib/review-annotations/__tests__/payload.test.ts`, `draft.test.ts`, `group.test.ts`

**Interfaces:**
- Produces (used by Tasks 3–10):
  - `AnnotationKind = "image" | "video-frame"`
  - `AnnotationPayload = { seq: number; kind: AnnotationKind; timecodeMs: number | null; overlayBase64: string; frameBase64: string | null; note: string }`
  - `validateAnnotations(anns: AnnotationPayload[]): string | null` (error message or null)
  - `base64Bytes(b64: string): number`
  - `RegionBounds = { x: number; y: number; w: number; h: number }` (fractions of natural size, 0–1)
  - `AnnotationDraft = AnnotationPayload & { bounds: RegionBounds | null }`
  - `commitDraft(list, draft)` / `removeDraft(list, seq)` — pure, renumber `seq` 1..n
  - `groupByTimecode(items: { timecodeMs: number | null }[] & T[]): { timecodeMs: number | null; items: T[] }[]`
  - Constants: `MAX_ANNOTATIONS_PER_DECISION = 20`, `MAX_MASK_BYTES = 1_048_576`, `MAX_FRAME_BYTES = 2_097_152`, `MAX_TOTAL_BYTES = 8_388_608`, `ANNOTATION_BUCKET = "review-annotations"`

- [x] **Step 1: Write the failing tests**

`src/lib/review-annotations/__tests__/payload.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { base64Bytes, validateAnnotations } from "../payload";
import type { AnnotationPayload } from "../payload";
import {
  MAX_ANNOTATIONS_PER_DECISION,
  MAX_MASK_BYTES,
} from "../constants";

function ann(over: Partial<AnnotationPayload> = {}): AnnotationPayload {
  return {
    seq: 1,
    kind: "image",
    timecodeMs: null,
    overlayBase64: "aGVsbG8=", // "hello"
    frameBase64: null,
    note: "logo too small",
    ...over,
  };
}

describe("base64Bytes", () => {
  it("computes decoded size from base64 length and padding", () => {
    expect(base64Bytes("aGVsbG8=")).toBe(5); // "hello"
    expect(base64Bytes("aGVsbG8h")).toBe(6); // "hello!"
    expect(base64Bytes("")).toBe(0);
  });
});

describe("validateAnnotations", () => {
  it("accepts a well-formed image annotation", () => {
    expect(validateAnnotations([ann()])).toBeNull();
  });

  it("accepts a well-formed video-frame annotation", () => {
    expect(
      validateAnnotations([
        ann({ kind: "video-frame", timecodeMs: 4000, frameBase64: "aGVsbG8=" }),
      ]),
    ).toBeNull();
  });

  it("rejects an empty note", () => {
    expect(validateAnnotations([ann({ note: "  " })])).toMatch(/note/i);
  });

  it("rejects image annotations carrying video fields", () => {
    expect(validateAnnotations([ann({ timecodeMs: 1000 })])).toMatch(/image/i);
    expect(validateAnnotations([ann({ frameBase64: "aGVsbG8=" })])).toMatch(/image/i);
  });

  it("rejects video-frame annotations missing timecode or frame", () => {
    expect(
      validateAnnotations([ann({ kind: "video-frame", frameBase64: "aGVsbG8=" })]),
    ).toMatch(/timecode/i);
    expect(
      validateAnnotations([ann({ kind: "video-frame", timecodeMs: 4000 })]),
    ).toMatch(/frame/i);
  });

  it("rejects non-contiguous or duplicate seq", () => {
    expect(validateAnnotations([ann({ seq: 2 })])).toMatch(/seq/i);
    expect(
      validateAnnotations([ann({ seq: 1 }), ann({ seq: 1, note: "other" })]),
    ).toMatch(/seq/i);
  });

  it("rejects more than the per-decision cap", () => {
    const many = Array.from({ length: MAX_ANNOTATIONS_PER_DECISION + 1 }, (_, i) =>
      ann({ seq: i + 1 }),
    );
    expect(validateAnnotations(many)).toMatch(/20/);
  });

  it("rejects an oversized mask", () => {
    // 4 base64 chars ≈ 3 bytes → this string decodes to just over MAX_MASK_BYTES.
    const big = "A".repeat(Math.ceil((MAX_MASK_BYTES + 3) / 3) * 4);
    expect(validateAnnotations([ann({ overlayBase64: big })])).toMatch(/mask/i);
  });
});
```

`src/lib/review-annotations/__tests__/draft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { commitDraft, removeDraft } from "../draft";
import type { AnnotationDraft } from "../draft";

function draft(over: Partial<AnnotationDraft> = {}): AnnotationDraft {
  return {
    seq: 0,
    kind: "image",
    timecodeMs: null,
    overlayBase64: "aGVsbG8=",
    frameBase64: null,
    note: "n",
    bounds: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    ...over,
  };
}

describe("commitDraft", () => {
  it("appends with the next continuous seq", () => {
    const one = commitDraft([], draft());
    const two = commitDraft(one, draft({ note: "second" }));
    expect(two.map((d) => d.seq)).toEqual([1, 2]);
    expect(two[1].note).toBe("second");
  });
});

describe("removeDraft", () => {
  it("removes by seq and renumbers the remainder continuously", () => {
    let list = commitDraft([], draft({ note: "a" }));
    list = commitDraft(list, draft({ note: "b" }));
    list = commitDraft(list, draft({ note: "c" }));
    const out = removeDraft(list, 2);
    expect(out.map((d) => [d.seq, d.note])).toEqual([
      [1, "a"],
      [2, "c"],
    ]);
  });
});
```

`src/lib/review-annotations/__tests__/group.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupByTimecode } from "../group";

describe("groupByTimecode", () => {
  it("groups items under their timecode, ascending, preserving item order", () => {
    const out = groupByTimecode([
      { timecodeMs: 4000, note: "b" },
      { timecodeMs: 1000, note: "a" },
      { timecodeMs: 4000, note: "c" },
    ]);
    expect(out.map((g) => g.timecodeMs)).toEqual([1000, 4000]);
    expect(out[1].items.map((i) => i.note)).toEqual(["b", "c"]);
  });

  it("puts null timecodes (images) into a single leading group", () => {
    const out = groupByTimecode([
      { timecodeMs: 2000, note: "b" },
      { timecodeMs: null, note: "a" },
    ]);
    expect(out.map((g) => g.timecodeMs)).toEqual([null, 2000]);
  });

  it("returns empty for empty input", () => {
    expect(groupByTimecode([])).toEqual([]);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/review-annotations`
Expected: FAIL — modules not found.

- [x] **Step 3: Implement**

`src/lib/review-annotations/constants.ts`:

```ts
// Spec §5.3 caps — guardrails, not targets (brush overlays compress to tens of KB).
export const MAX_ANNOTATIONS_PER_DECISION = 20;
export const MAX_MASK_BYTES = 1_048_576; // 1 MB per painted overlay
export const MAX_FRAME_BYTES = 2_097_152; // 2 MB per captured video still
export const MAX_TOTAL_BYTES = 8_388_608; // 8 MB whole action payload
export const ANNOTATION_BUCKET = "review-annotations";
export const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h, refetched on 403
```

`src/lib/review-annotations/payload.ts`:

```ts
import {
  MAX_ANNOTATIONS_PER_DECISION,
  MAX_FRAME_BYTES,
  MAX_MASK_BYTES,
  MAX_TOTAL_BYTES,
} from "./constants";

export type AnnotationKind = "image" | "video-frame";

// The wire shape a senior's client sends with "Request changes" (D211/D213).
// overlayBase64 is the PAINTED OVERLAY png (alpha > 0 = region) — display-ready,
// and convertible to the OpenAI mask by overlayToMaskRGBA at replay time (D209).
export type AnnotationPayload = {
  seq: number;
  kind: AnnotationKind;
  timecodeMs: number | null;
  overlayBase64: string;
  frameBase64: string | null;
  note: string;
};

export function base64Bytes(b64: string): number {
  if (!b64) return 0;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return (b64.length * 3) / 4 - padding;
}

// Returns a human-readable error, or null when the batch is acceptable. Shared by
// the client (pre-submit) and the server action (enforcement) — one implementation,
// never two drifting copies.
export function validateAnnotations(anns: AnnotationPayload[]): string | null {
  if (anns.length > MAX_ANNOTATIONS_PER_DECISION) {
    return `At most ${MAX_ANNOTATIONS_PER_DECISION} annotations per decision.`;
  }
  let total = 0;
  const seen = new Set<number>();
  for (const [i, a] of anns.entries()) {
    if (a.seq !== i + 1 || seen.has(a.seq)) {
      return "Annotation seq numbers must be continuous from 1.";
    }
    seen.add(a.seq);
    if (!a.note.trim()) return `Annotation ${a.seq} has an empty note.`;
    if (a.kind === "image" && (a.timecodeMs !== null || a.frameBase64 !== null)) {
      return `Annotation ${a.seq}: image annotations carry no timecode or frame.`;
    }
    if (a.kind === "video-frame") {
      if (a.timecodeMs === null) return `Annotation ${a.seq} is missing its timecode.`;
      if (a.frameBase64 === null) return `Annotation ${a.seq} is missing its captured frame.`;
    }
    const maskBytes = base64Bytes(a.overlayBase64);
    const frameBytes = base64Bytes(a.frameBase64 ?? "");
    if (maskBytes === 0) return `Annotation ${a.seq} has an empty mask.`;
    if (maskBytes > MAX_MASK_BYTES) return `Annotation ${a.seq}: mask exceeds 1 MB.`;
    if (frameBytes > MAX_FRAME_BYTES) return `Annotation ${a.seq}: frame exceeds 2 MB.`;
    total += maskBytes + frameBytes;
  }
  if (total > MAX_TOTAL_BYTES) return "Annotations exceed the 8 MB payload limit.";
  return null;
}
```

`src/lib/review-annotations/draft.ts`:

```ts
import type { AnnotationPayload } from "./payload";

// Bounding box of the painted stroke in FRACTIONS of the media's natural size —
// resolution-independent, so the pin renders correctly at any display scale.
export type RegionBounds = { x: number; y: number; w: number; h: number };

export type AnnotationDraft = AnnotationPayload & { bounds: RegionBounds | null };

const renumber = (list: AnnotationDraft[]): AnnotationDraft[] =>
  list.map((d, i) => ({ ...d, seq: i + 1 }));

export function commitDraft(
  list: AnnotationDraft[],
  draft: AnnotationDraft,
): AnnotationDraft[] {
  return renumber([...list, draft]);
}

export function removeDraft(list: AnnotationDraft[], seq: number): AnnotationDraft[] {
  return renumber(list.filter((d) => d.seq !== seq));
}
```

`src/lib/review-annotations/group.ts`:

```ts
// Group any timecoded items (drafts while composing, rows while reading) for the
// Review-column list: null (image) first, then ascending timecodes; item order
// within a group is preserved (pin order).
export function groupByTimecode<T extends { timecodeMs: number | null }>(
  items: T[],
): { timecodeMs: number | null; items: T[] }[] {
  const groups = new Map<number | null, T[]>();
  for (const item of items) {
    const key = item.timecodeMs;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? -1 : b === null ? 1 : a - b))
    .map(([timecodeMs, grouped]) => ({ timecodeMs, items: grouped }));
}
```

- [x] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/review-annotations`
Expected: PASS (all three files).

- [x] **Step 5: Commit**

```bash
git add src/lib/review-annotations
git commit -m "feat(review-annotations): payload validation, draft helpers, timecode grouping

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: DAL — insertAnnotations / getAnnotationsByDecisionIds

**Files:**
- Create: `src/lib/db/annotations.ts`
- Test: `src/lib/db/annotations.test.ts` (colocated, mirroring `decisions.test.ts`)

**Interfaces:**
- Consumes: table from Task 1.
- Produces (used by Tasks 5–6):
  - `AnnotationRow = { id: string; decision_id: string; org_id: string; seq: number; kind: "image" | "video-frame"; timecode_ms: number | null; frame_path: string | null; mask_path: string; note: string; created_at: string }`
  - `insertAnnotations(rows: Omit<AnnotationRow, "id" | "created_at">[]): Promise<void>` — one batched insert, throws on error, no-op on empty
  - `getAnnotationsByDecisionIds(decisionIds: string[]): Promise<Map<string, AnnotationRow[]>>` — batched, ordered by `(decision_id, seq)`

- [x] **Step 1: Write the failing test**

`src/lib/db/annotations.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom }),
}));

import {
  insertAnnotations,
  getAnnotationsByDecisionIds,
  type AnnotationRow,
} from "./annotations";

function row(over: Partial<AnnotationRow>): AnnotationRow {
  return {
    id: "a1",
    decision_id: "d1",
    org_id: "org-1",
    seq: 1,
    kind: "image",
    timecode_ms: null,
    frame_path: null,
    mask_path: "org-1/d1/1-mask.png",
    note: "logo too small",
    created_at: "2026-09-03T10:00:00Z",
    ...over,
  };
}

beforeEach(() => mockFrom.mockReset());

describe("insertAnnotations", () => {
  it("does not query at all for an empty batch", async () => {
    await insertAnnotations([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("inserts the whole batch in one call and throws on error", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    mockFrom.mockImplementation(() => ({ insert }));
    const { id: _i, created_at: _c, ...one } = row({});
    await insertAnnotations([one]);
    expect(mockFrom).toHaveBeenCalledWith("node_version_annotations");
    expect(insert).toHaveBeenCalledWith([one]);

    mockFrom.mockImplementation(() => ({
      insert: async () => ({ error: new Error("db down") }),
    }));
    await expect(insertAnnotations([one])).rejects.toThrow(/db down/);
  });
});

describe("getAnnotationsByDecisionIds", () => {
  it("returns an empty map for no ids, without querying", async () => {
    const out = await getAnnotationsByDecisionIds([]);
    expect(out.size).toBe(0);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("groups rows under their decision id in pin order", async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        in: () => ({
          order: () => ({
            order: async () => ({
              data: [
                row({ id: "a1", decision_id: "d1", seq: 1 }),
                row({ id: "a2", decision_id: "d1", seq: 2, note: "second" }),
                row({ id: "a3", decision_id: "d2", seq: 1 }),
              ],
              error: null,
            }),
          }),
        }),
      }),
    }));
    const out = await getAnnotationsByDecisionIds(["d1", "d2"]);
    expect(out.get("d1")?.map((a) => a.seq)).toEqual([1, 2]);
    expect(out.get("d2")?.map((a) => a.id)).toEqual(["a3"]);
    expect(out.has("d3")).toBe(false);
  });

  it("throws when the query fails", async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        in: () => ({
          order: () => ({
            order: async () => ({ data: null, error: new Error("db down") }),
          }),
        }),
      }),
    }));
    await expect(getAnnotationsByDecisionIds(["d1"])).rejects.toThrow(/db down/);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/db/annotations.test.ts`
Expected: FAIL — `./annotations` not found.

- [x] **Step 3: Implement**

`src/lib/db/annotations.ts`:

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";

export type AnnotationRow = {
  id: string;
  decision_id: string;
  org_id: string;
  seq: number;
  kind: "image" | "video-frame";
  timecode_ms: number | null;
  frame_path: string | null;
  mask_path: string;
  note: string;
  created_at: string;
};

// STRICT, unlike insertDecision's best-effort posture: annotations ARE the feedback,
// not observability, so the caller (setVersionApprovalAction) lets this throw (D214).
export async function insertAnnotations(
  rows: Omit<AnnotationRow, "id" | "created_at">[],
): Promise<void> {
  if (rows.length === 0) return;
  const supabase = createServerSupabase();
  const { error } = await supabase.from("node_version_annotations").insert(rows);
  if (error) throw error;
}

// Batched over every decision on a node in one query — the sibling of
// getDecisionsByVersionIds, grouped the same way.
export async function getAnnotationsByDecisionIds(
  decisionIds: string[],
): Promise<Map<string, AnnotationRow[]>> {
  if (decisionIds.length === 0) return new Map();
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("node_version_annotations")
    .select(
      "id, decision_id, org_id, seq, kind, timecode_ms, frame_path, mask_path, note, created_at",
    )
    .in("decision_id", decisionIds)
    .order("decision_id", { ascending: true })
    .order("seq", { ascending: true });
  if (error) throw error;
  const byDecision = new Map<string, AnnotationRow[]>();
  for (const r of (data ?? []) as AnnotationRow[]) {
    const list = byDecision.get(r.decision_id) ?? [];
    list.push(r);
    byDecision.set(r.decision_id, list);
  }
  return byDecision;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/db/annotations.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/db/annotations.ts src/lib/db/annotations.test.ts
git commit -m "feat(db): annotations DAL - strict batch insert, batched read by decision

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Storage helpers — paths, upload, signed URLs

**Files:**
- Create: `src/lib/review-annotations/storage.ts`
- Test: `src/lib/review-annotations/__tests__/storage.test.ts`

**Interfaces:**
- Consumes: `AnnotationPayload` (Task 2), `AnnotationRow` (Task 3), `ANNOTATION_BUCKET` / `SIGNED_URL_TTL_SECONDS` (Task 2).
- Produces (used by Tasks 5–6):
  - `annotationAssetPaths(orgId: string, decisionId: string, seq: number): { maskPath: string; framePath: string }`
  - `uploadAnnotationAssets(storage: SupabaseStorage, orgId: string, decisionId: string, anns: AnnotationPayload[]): Promise<{ seq: number; maskPath: string; framePath: string | null }[]>` — throws on the FIRST failure (nothing DB-side has happened yet, D214)
  - `signAnnotationAssets(storage: SupabaseStorage, rows: AnnotationRow[]): Promise<Map<string, { maskUrl: string | null; frameUrl: string | null }>>` — keyed by row id
  - `type SupabaseStorage = { from(bucket: string): { upload(path: string, body: Buffer | Blob, opts?: object): Promise<{ error: { message: string } | null }>; createSignedUrl(path: string, ttl: number): Promise<{ data: { signedUrl: string } | null; error: object | null }> } }` — structural type so tests stub it without the real client

- [x] **Step 1: Write the failing test**

`src/lib/review-annotations/__tests__/storage.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  annotationAssetPaths,
  uploadAnnotationAssets,
  signAnnotationAssets,
} from "../storage";
import type { AnnotationPayload } from "../payload";
import type { AnnotationRow } from "@/lib/db/annotations";

function ann(over: Partial<AnnotationPayload> = {}): AnnotationPayload {
  return {
    seq: 1,
    kind: "image",
    timecodeMs: null,
    overlayBase64: "aGVsbG8=",
    frameBase64: null,
    note: "n",
    ...over,
  };
}

function stubStorage(overrides: {
  upload?: ReturnType<typeof vi.fn>;
  createSignedUrl?: ReturnType<typeof vi.fn>;
} = {}) {
  const upload = overrides.upload ?? vi.fn(async () => ({ error: null }));
  const createSignedUrl =
    overrides.createSignedUrl ??
    vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null }));
  return { storage: { from: () => ({ upload, createSignedUrl }) }, upload, createSignedUrl };
}

describe("annotationAssetPaths", () => {
  it("builds spec §5.2 paths", () => {
    expect(annotationAssetPaths("org-1", "d1", 2)).toEqual({
      maskPath: "org-1/d1/2-mask.png",
      framePath: "org-1/d1/2-frame.png",
    });
  });
});

describe("uploadAnnotationAssets", () => {
  it("uploads mask (and frame when present) and returns stored paths", async () => {
    const { storage, upload } = stubStorage();
    const out = await uploadAnnotationAssets(storage, "org-1", "d1", [
      ann({ seq: 1 }),
      ann({ seq: 2, kind: "video-frame", timecodeMs: 4000, frameBase64: "aGVsbG8=" }),
    ]);
    expect(out).toEqual([
      { seq: 1, maskPath: "org-1/d1/1-mask.png", framePath: null },
      { seq: 2, maskPath: "org-1/d1/2-mask.png", framePath: "org-1/d1/2-frame.png" },
    ]);
    expect(upload).toHaveBeenCalledTimes(3); // 2 masks + 1 frame
  });

  it("throws on the first upload failure", async () => {
    const upload = vi.fn(async () => ({ error: { message: "quota" } }));
    const { storage } = stubStorage({ upload });
    await expect(
      uploadAnnotationAssets(storage, "org-1", "d1", [ann()]),
    ).rejects.toThrow(/quota/);
  });
});

describe("signAnnotationAssets", () => {
  it("signs mask and frame per row, keyed by row id", async () => {
    const { storage } = stubStorage();
    const rows = [
      {
        id: "a1", decision_id: "d1", org_id: "org-1", seq: 1, kind: "image",
        timecode_ms: null, frame_path: null, mask_path: "org-1/d1/1-mask.png",
        note: "n", created_at: "t",
      } as AnnotationRow,
    ];
    const out = await signAnnotationAssets(storage, rows);
    expect(out.get("a1")).toEqual({
      maskUrl: "https://signed/org-1/d1/1-mask.png",
      frameUrl: null,
    });
  });

  it("yields null for a URL that fails to sign rather than throwing", async () => {
    const createSignedUrl = vi.fn(async () => ({ data: null, error: { message: "gone" } }));
    const { storage } = stubStorage({ createSignedUrl });
    const rows = [
      {
        id: "a1", decision_id: "d1", org_id: "org-1", seq: 1, kind: "image",
        timecode_ms: null, frame_path: null, mask_path: "p",
        note: "n", created_at: "t",
      } as AnnotationRow,
    ];
    const out = await signAnnotationAssets(storage, rows);
    expect(out.get("a1")).toEqual({ maskUrl: null, frameUrl: null });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/review-annotations/__tests__/storage.test.ts`
Expected: FAIL — `../storage` not found.

- [x] **Step 3: Implement**

`src/lib/review-annotations/storage.ts`:

```ts
import "server-only";
import { ANNOTATION_BUCKET, SIGNED_URL_TTL_SECONDS } from "./constants";
import type { AnnotationPayload } from "./payload";
import type { AnnotationRow } from "@/lib/db/annotations";

// Structural slice of the Supabase storage client — lets unit tests stub it and keeps
// this module honest about which storage calls it actually makes.
export type SupabaseStorage = {
  from(bucket: string): {
    upload(
      path: string,
      body: Buffer,
      opts?: { contentType?: string; upsert?: boolean },
    ): Promise<{ error: { message: string } | null }>;
    createSignedUrl(
      path: string,
      ttlSeconds: number,
    ): Promise<{ data: { signedUrl: string } | null; error: object | null }>;
  };
};

// Spec §5.2: {org_id}/{decision_id}/{seq}-mask.png / …-frame.png
export function annotationAssetPaths(orgId: string, decisionId: string, seq: number) {
  return {
    maskPath: `${orgId}/${decisionId}/${seq}-mask.png`,
    framePath: `${orgId}/${decisionId}/${seq}-frame.png`,
  };
}

// Upload BEFORE any DB write; the first failure throws and the whole action aborts —
// the senior's drafts are still client-side, so retry is lossless (D214).
export async function uploadAnnotationAssets(
  storage: SupabaseStorage,
  orgId: string,
  decisionId: string,
  anns: AnnotationPayload[],
): Promise<{ seq: number; maskPath: string; framePath: string | null }[]> {
  const bucket = storage.from(ANNOTATION_BUCKET);
  const out: { seq: number; maskPath: string; framePath: string | null }[] = [];
  for (const a of anns) {
    const { maskPath, framePath } = annotationAssetPaths(orgId, decisionId, a.seq);
    const maskRes = await bucket.upload(maskPath, Buffer.from(a.overlayBase64, "base64"), {
      contentType: "image/png",
    });
    if (maskRes.error) throw new Error(`Annotation upload failed: ${maskRes.error.message}`);
    let storedFramePath: string | null = null;
    if (a.frameBase64) {
      const frameRes = await bucket.upload(framePath, Buffer.from(a.frameBase64, "base64"), {
        contentType: "image/png",
      });
      if (frameRes.error) throw new Error(`Annotation upload failed: ${frameRes.error.message}`);
      storedFramePath = framePath;
    }
    out.push({ seq: a.seq, maskPath, framePath: storedFramePath });
  }
  return out;
}

// Read-side: short-lived signed URLs (private bucket). A signing failure degrades that
// one asset to null — the note still renders; the client refetches on 403/expiry.
export async function signAnnotationAssets(
  storage: SupabaseStorage,
  rows: AnnotationRow[],
): Promise<Map<string, { maskUrl: string | null; frameUrl: string | null }>> {
  const bucket = storage.from(ANNOTATION_BUCKET);
  const sign = async (path: string | null): Promise<string | null> => {
    if (!path) return null;
    const { data, error } = await bucket.createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return error || !data ? null : data.signedUrl;
  };
  const out = new Map<string, { maskUrl: string | null; frameUrl: string | null }>();
  for (const row of rows) {
    out.set(row.id, {
      maskUrl: await sign(row.mask_path),
      frameUrl: await sign(row.frame_path),
    });
  }
  return out;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/review-annotations/__tests__/storage.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/lib/review-annotations/storage.ts src/lib/review-annotations/__tests__/storage.test.ts
git commit -m "feat(review-annotations): storage paths, strict upload, signed-URL reads

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Action — annotations ride setVersionApprovalAction

**Files:**
- Modify: `src/lib/db/decisions.ts` (insertDecision gains optional `id`)
- Modify: `src/lib/actions/approval.ts`
- Test: `src/lib/actions/approval.test.ts` (new, colocated)

**Interfaces:**
- Consumes: `validateAnnotations`, `AnnotationPayload` (Task 2); `uploadAnnotationAssets` (Task 4); `insertAnnotations` (Task 3).
- Produces: `setVersionApprovalAction(versionId, { status, note, annotations? })` — the only new client-facing surface. `insertDecision` accepts `id?: string`.

- [x] **Step 1: Extend insertDecision with an optional pre-generated id**

In `src/lib/db/decisions.ts`, change `insertDecision`'s input type to add `id?: string` and spread it into the insert:

```ts
export async function insertDecision(input: {
  id?: string; // pre-generated when annotations must reference the decision before it exists (D214)
  versionId: string;
  orgId: string;
  status: "approved" | "changes_requested";
  note: string | null;
  decidedByUserId: string;
  decidedAt: string;
}): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("node_version_decisions").insert({
    ...(input.id ? { id: input.id } : {}),
    version_id: input.versionId,
    org_id: input.orgId,
    status: input.status,
    note: input.note,
    decided_by_user_id: input.decidedByUserId,
    decided_at: input.decidedAt,
  });
  if (error) throw error;
}
```

Run: `npx vitest run src/lib/db/decisions.test.ts` — Expected: PASS (existing tests unaffected).

- [x] **Step 2: Write the failing action test**

`src/lib/actions/approval.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockStorageFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({ from: mockFrom, storage: { from: mockStorageFrom } }),
}));
const mockCaller = vi.fn();
vi.mock("@/lib/dal", () => ({ resolveCallerContext: () => mockCaller() }));
vi.mock("@/lib/actions/with-action", () => ({
  withAction: (_name: string, fn: () => unknown) => fn(),
}));
const mockInsertDecision = vi.fn(async () => {});
vi.mock("@/lib/db/decisions", () => ({
  insertDecision: (input: unknown) => mockInsertDecision(input),
}));
const mockInsertAnnotations = vi.fn(async () => {});
vi.mock("@/lib/db/annotations", () => ({
  insertAnnotations: (rows: unknown) => mockInsertAnnotations(rows),
}));

import { setVersionApprovalAction } from "./approval";
import type { AnnotationPayload } from "@/lib/review-annotations/payload";

function ann(over: Partial<AnnotationPayload> = {}): AnnotationPayload {
  return {
    seq: 1,
    kind: "image",
    timecodeMs: null,
    overlayBase64: "aGVsbG8=",
    frameBase64: null,
    note: "logo too small",
    ...over,
  };
}

const versionRead = { data: { id: "v1", org_id: "org-1" }, error: null };
let updateSpy: ReturnType<typeof vi.fn>;

function stubDb({ uploadError = null as null | { message: string } } = {}) {
  updateSpy = vi.fn(() => ({ eq: async () => ({ error: null }) }));
  mockFrom.mockImplementation(() => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => versionRead }) }),
    update: updateSpy,
  }));
  mockStorageFrom.mockImplementation(() => ({
    upload: async () => ({ error: uploadError }),
  }));
}

beforeEach(() => {
  mockFrom.mockReset();
  mockStorageFrom.mockReset();
  mockInsertDecision.mockClear();
  mockInsertAnnotations.mockClear();
  mockCaller.mockResolvedValue({ userId: "u1", orgId: "org-1", orgRole: "senior" });
});

describe("setVersionApprovalAction with annotations", () => {
  it("rejects annotations on any status except changes_requested", async () => {
    stubDb();
    await expect(
      setVersionApprovalAction("v1", { status: "approved", annotations: [ann()] }),
    ).rejects.toThrow(/request changes/i);
  });

  it("rejects an invalid batch before touching storage or the DB", async () => {
    stubDb();
    await expect(
      setVersionApprovalAction("v1", {
        status: "changes_requested",
        note: "fix it",
        annotations: [ann({ note: " " })],
      }),
    ).rejects.toThrow(/note/i);
    expect(mockStorageFrom).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("aborts the whole action when an upload fails — no status update, no decision", async () => {
    stubDb({ uploadError: { message: "quota" } });
    await expect(
      setVersionApprovalAction("v1", {
        status: "changes_requested",
        note: "fix it",
        annotations: [ann()],
      }),
    ).rejects.toThrow(/quota/);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(mockInsertDecision).not.toHaveBeenCalled();
    expect(mockInsertAnnotations).not.toHaveBeenCalled();
  });

  it("uploads, updates status, then writes decision + annotation rows sharing one decision id", async () => {
    stubDb();
    await setVersionApprovalAction("v1", {
      status: "changes_requested",
      note: "fix it",
      annotations: [ann()],
    });
    expect(updateSpy).toHaveBeenCalled();
    const decision = mockInsertDecision.mock.calls[0][0] as { id?: string };
    const rows = mockInsertAnnotations.mock.calls[0][0] as { decision_id: string }[];
    expect(decision.id).toBeTruthy();
    expect(rows[0].decision_id).toBe(decision.id);
    expect(rows[0]).toMatchObject({
      org_id: "org-1",
      seq: 1,
      kind: "image",
      mask_path: "org-1/" + decision.id + "/1-mask.png",
      note: "logo too small",
    });
  });

  it("a decision-log failure is best-effort WITHOUT annotations but strict WITH them", async () => {
    stubDb();
    mockInsertDecision.mockRejectedValueOnce(new Error("log down"));
    // Without annotations: swallowed (existing D175 behavior).
    await expect(
      setVersionApprovalAction("v1", { status: "changes_requested", note: "fix it" }),
    ).resolves.toBeUndefined();

    mockInsertDecision.mockRejectedValueOnce(new Error("log down"));
    // With annotations: the decision row is load-bearing (annotations reference it) — strict.
    await expect(
      setVersionApprovalAction("v1", {
        status: "changes_requested",
        note: "fix it",
        annotations: [ann()],
      }),
    ).rejects.toThrow(/log down/);
  });

  it("still enforces the role gate", async () => {
    stubDb();
    mockCaller.mockResolvedValue({ userId: "u2", orgId: "org-1", orgRole: "designer" });
    await expect(
      setVersionApprovalAction("v1", { status: "approved" }),
    ).rejects.toThrow(/not permitted/i);
  });
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/actions/approval.test.ts`
Expected: FAIL — annotations parameter not accepted / behaviors missing.

- [x] **Step 4: Implement in `src/lib/actions/approval.ts`**

Add imports:

```ts
import { randomUUID } from "crypto";
import { validateAnnotations, type AnnotationPayload } from "@/lib/review-annotations/payload";
import { uploadAnnotationAssets } from "@/lib/review-annotations/storage";
import { insertAnnotations } from "@/lib/db/annotations";
```

Change the signature:

```ts
export async function setVersionApprovalAction(
  versionId: string,
  input: {
    status: ApprovalStatus;
    note?: string | null;
    // D211/D212: region+note pairs, only with changes_requested. Validated and
    // uploaded BEFORE any DB write — a failure aborts the whole action (D214).
    annotations?: AnnotationPayload[];
  },
)
```

Inside the handler, after the existing note check and before `createServerSupabase()`:

```ts
    const annotations = input.annotations ?? [];
    if (annotations.length > 0 && input.status !== "changes_requested") {
      throw new Error("Annotations can only be attached when you request changes.");
    }
    if (annotations.length > 0) {
      const invalid = validateAnnotations(annotations);
      if (invalid) throw new Error(invalid);
    }
```

After the tenancy check and before the `node_versions` update, add the upload phase (the decision id is pre-generated so asset paths can reference it, D214):

```ts
    const decisionId = randomUUID();
    let uploaded: { seq: number; maskPath: string; framePath: string | null }[] = [];
    if (annotations.length > 0) {
      uploaded = await uploadAnnotationAssets(
        supabase.storage,
        caller.orgId,
        decisionId,
        annotations,
      );
    }
```

Replace the existing best-effort decision block with:

```ts
    if (input.status === "approved" || input.status === "changes_requested") {
      const writeDecision = () =>
        insertDecision({
          id: decisionId,
          versionId,
          orgId: caller.orgId,
          status: input.status as "approved" | "changes_requested",
          note,
          decidedByUserId: caller.userId,
          decidedAt: at,
        });
      if (annotations.length > 0) {
        // Strict: the annotation rows reference this decision id — losing the decision
        // row would orphan the feedback the senior just wrote (D214).
        await writeDecision();
        await insertAnnotations(
          annotations.map((a) => {
            const stored = uploaded.find((u) => u.seq === a.seq);
            if (!stored) throw new Error(`No uploaded asset for annotation ${a.seq}.`);
            return {
              decision_id: decisionId,
              org_id: caller.orgId,
              seq: a.seq,
              kind: a.kind,
              timecode_ms: a.timecodeMs,
              frame_path: stored.framePath,
              mask_path: stored.maskPath,
              note: a.note.trim(),
            };
          }),
        );
      } else {
        // D173/D175: history logging stays best-effort when it is pure observability.
        try {
          await writeDecision();
        } catch (e) {
          console.error("Failed to log approval decision history", e);
        }
      }
    }
```

- [x] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/actions/approval.test.ts src/lib/db/decisions.test.ts`
Expected: PASS (both files).

- [x] **Step 6: Commit**

```bash
git add src/lib/actions/approval.ts src/lib/actions/approval.test.ts src/lib/db/decisions.ts
git commit -m "feat(approval): annotations ride setVersionApprovalAction, upload-before-write

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Versions route returns annotations with signed URLs

**Files:**
- Modify: `src/app/api/nodes/[id]/versions/route.ts`

**Interfaces:**
- Consumes: `getAnnotationsByDecisionIds` (Task 3), `signAnnotationAssets` (Task 4).
- Produces: each entry in `decisions[]` gains `annotations: { id: string; seq: number; kind: "image" | "video-frame"; timecodeMs: number | null; note: string; maskUrl: string | null; frameUrl: string | null }[]`. Client tasks (7–10) consume exactly this shape.

- [x] **Step 1: Implement**

In the route's handler, after `getDecisionsByVersionIds`:

```ts
    const allDecisionIds = [...decisionsByVersion.values()].flat().map((d) => d.id);
    const annotationsByDecision = await getAnnotationsByDecisionIds(allDecisionIds);
    const allAnnotationRows = [...annotationsByDecision.values()].flat();
    const signedByAnnotation = await signAnnotationAssets(
      createServerSupabase().storage,
      allAnnotationRows,
    );
```

(Imports: `getAnnotationsByDecisionIds` from `@/lib/db/annotations`, `signAnnotationAssets` from `@/lib/review-annotations/storage`, `createServerSupabase` from `@/lib/supabase/server` — check whether `withNode` already exposes a supabase client in scope and reuse it if so, instead of creating a second one.)

Extend the `decisions:` mapping:

```ts
        decisions: (decisionsByVersion.get(v.id) ?? []).map((d) => ({
          id: d.id,
          status: d.status,
          note: d.note,
          reviewerName: (d.decided_by_user_id && names.get(d.decided_by_user_id)) || null,
          decidedAt: d.decided_at,
          // D213/D214: region+note pairs with short-lived signed asset URLs.
          annotations: (annotationsByDecision.get(d.id) ?? []).map((a) => ({
            id: a.id,
            seq: a.seq,
            kind: a.kind,
            timecodeMs: a.timecode_ms,
            note: a.note,
            maskUrl: signedByAnnotation.get(a.id)?.maskUrl ?? null,
            frameUrl: signedByAnnotation.get(a.id)?.frameUrl ?? null,
          })),
        })),
```

- [x] **Step 2: Typecheck and run the suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean typecheck; suite green (re-run the Kling file once if it hits its known cold-cache flake).

- [x] **Step 3: Commit**

```bash
git add "src/app/api/nodes/[id]/versions/route.ts"
git commit -m "feat(api): versions route returns decision annotations with signed URLs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Extract ReviewAnnotationCanvas (edit mode untouched)

**Files:**
- Create: `src/components/review-annotations/review-annotation-canvas.tsx` (moved content of `image-gen-annotation-canvas.tsx` + two additions)
- Modify: `src/components/nodes/image-gen-annotation-canvas.tsx` → thin re-export
- Test: none new (no component test infra) — existing suite + typecheck guard the move; `src/lib/image-gen/__tests__/mask.test.ts` continues to cover the mask math.

**Interfaces:**
- Produces:
  - `ReviewAnnotationCanvas` — same props as today's `ImageGenAnnotationCanvas` (`{ baseUrl, alt?, onMarksChange? }`) plus `onStrokeEnd?: (bounds: RegionBounds | null) => void` and `hintText?: string` (default stays "Paint over the area you want to change.")
  - `AnnotationHandle` gains `toOverlayBase64(): string | null` and `getStrokeBounds(): RegionBounds | null`
  - `image-gen-annotation-canvas.tsx` re-exports `{ ReviewAnnotationCanvas as ImageGenAnnotationCanvas, type AnnotationHandle }` so the edit-mode consumer (`image-gen-focus-view.tsx`) is untouched by this task.

- [x] **Step 1: Move the component**

Copy the full content of `src/components/nodes/image-gen-annotation-canvas.tsx` to `src/components/review-annotations/review-annotation-canvas.tsx`. Rename the exported component to `ReviewAnnotationCanvas`. Fix the one relative import: `./use-drawing-canvas` becomes `@/components/nodes/use-drawing-canvas` (the brush engine stays where the Draw node also uses it).

- [x] **Step 2: Add stroke-bounds tracking + overlay export**

Inside the component add a bounds ref and extend the pointer handlers (natural-pixel coords → fractions):

```ts
    const strokeBoundsRef = useRef<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);

    const trackBounds = useCallback(
      (e: React.PointerEvent<HTMLCanvasElement>) => {
        const el = canvasRef.current;
        if (!el || !dims) return;
        const rect = el.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * dims.w;
        const y = ((e.clientY - rect.top) / rect.height) * dims.h;
        const b = strokeBoundsRef.current ?? { minX: x, minY: y, maxX: x, maxY: y };
        strokeBoundsRef.current = {
          minX: Math.min(b.minX, x),
          minY: Math.min(b.minY, y),
          maxX: Math.max(b.maxX, x),
          maxY: Math.max(b.maxY, y),
        };
      },
      [dims],
    );

    const boundsAsFractions = useCallback((): RegionBounds | null => {
      const b = strokeBoundsRef.current;
      if (!b || !dims) return null;
      // Pad by half the brush so the box hugs the painted edge, then clamp to [0,1].
      const pad = brushSize / 2;
      return {
        x: Math.max(0, (b.minX - pad) / dims.w),
        y: Math.max(0, (b.minY - pad) / dims.h),
        w: Math.min(1, (b.maxX - b.minX + brushSize) / dims.w),
        h: Math.min(1, (b.maxY - b.minY + brushSize) / dims.h),
      };
    }, [dims, brushSize]);
```

Wire `trackBounds` into `handlePointerDown` and into a new `handlePointerMove` that calls `trackBounds(e)` (only while `e.buttons > 0`) then `onPointerMove(e)`. In a new `handlePointerUp`, call `onPointerUp(e)` then `onStrokeEnd?.(boundsAsFractions())`. Reset `strokeBoundsRef.current = null` inside `resetMarks`.

Add to the imperative handle:

```ts
        // The painted overlay itself (purple strokes on transparency) — what gets stored
        // as mask_path. overlayToMaskRGBA converts it to the OpenAI mask at replay (D209).
        toOverlayBase64: () => {
          const overlay = canvasRef.current;
          if (!overlay || !dirtyRef.current) return null;
          return overlay.toDataURL("image/png").split(",")[1] ?? null;
        },
        getStrokeBounds: boundsAsFractions,
```

Add the `hintText` prop with the current string as default, and `RegionBounds` import from `@/lib/review-annotations/draft`.

- [x] **Step 3: Make the old path a re-export**

Replace the entire content of `src/components/nodes/image-gen-annotation-canvas.tsx` with:

```ts
// Extraction (D213): the annotation canvas now serves review annotations too, so it
// lives in src/components/review-annotations/. Edit mode keeps its import path.
export {
  ReviewAnnotationCanvas as ImageGenAnnotationCanvas,
  type AnnotationHandle,
} from "@/components/review-annotations/review-annotation-canvas";
```

- [x] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: clean; no behavioral change anywhere (edit mode renders the same component).

- [x] **Step 5: Commit**

```bash
git add src/components/review-annotations/review-annotation-canvas.tsx src/components/nodes/image-gen-annotation-canvas.tsx
git commit -m "refactor(review-annotations): extract annotation canvas, add overlay export + stroke bounds

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Compose UI — pins, popover composer, list, approval-bar entry, image wiring

**Files:**
- Create: `src/components/review-annotations/annotation-pin.tsx`
- Create: `src/components/review-annotations/annotation-note-popover.tsx`
- Create: `src/components/review-annotations/annotation-list.tsx`
- Create: `src/components/review-annotations/use-annotation-drafts.ts`
- Modify: `src/components/nodes/inline-approval-bar.tsx`
- Modify: `src/components/nodes/image-gen-focus-view.tsx`

**Interfaces:**
- Consumes: `ReviewAnnotationCanvas` + `AnnotationHandle` (Task 7), `commitDraft`/`removeDraft`/`AnnotationDraft`/`RegionBounds` (Task 2), `groupByTimecode` (Task 2), `setVersionApprovalAction` annotations input (Task 5).
- Produces:
  - `AnnotationPin({ seq, x, y, active?, onClick? })` — `x`/`y` are fractions; renders `absolute` positioned; sized `size-5`, `bg-primary`, white number.
  - `AnnotationNotePopover` — two modes: `mode: "compose"` (Textarea + "Add note" Button + Cancel) and `mode: "read"` (note + author + time); positioned `absolute` just below the region bounds, clamped inside the container.
  - `useAnnotationDrafts()` → `{ drafts, commit(bounds, overlayBase64, note, extra?), remove(seq), clear() }` where `extra` is `{ kind: "video-frame"; timecodeMs: number; frameBase64: string }` for video (defaults to image kind).
  - `AnnotationList({ groups, onSeek?, onRemove?, readOnly })` — Review-column list; `groups` from `groupByTimecode`.
  - `InlineApprovalBar` new optional props: `annotationCount?: number`, `annotating?: boolean`, `onToggleAnnotate?: () => void`, `onConfirmDiscardDrafts?: () => Promise<boolean>`.

- [x] **Step 1: Build the shared pieces**

`src/components/review-annotations/annotation-pin.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";

// A numbered pin at a fractional position over media. Non-interactive by default;
// pass onClick (read mode) to open its note. The wrapper <span> is not a control —
// when clickable it renders a Base-UI Button via the render prop instead.
import { Button } from "@/components/ui/button";

export function AnnotationPin({
  seq,
  x,
  y,
  active = false,
  onClick,
}: {
  seq: number;
  x: number; // fraction of container width
  y: number; // fraction of container height
  active?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "absolute z-10 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center",
    "rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-md",
    "transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
    active && "scale-125 ring-2 ring-primary/40",
  );
  const style = { left: `${x * 100}%`, top: `${y * 100}%` };
  if (!onClick) {
    return (
      <span className={className} style={style} aria-hidden>
        {seq}
      </span>
    );
  }
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(className, "h-5 min-w-0 p-0 hover:bg-primary")}
      style={style}
      aria-label={`Annotation ${seq}`}
    >
      {seq}
    </Button>
  );
}
```

`src/components/review-annotations/annotation-note-popover.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RegionBounds } from "@/lib/review-annotations/draft";

// Anchored note card (D213). Positioned just below the region's bounding box and
// clamped so it never leaves the media container. This is a positioned card, not a
// Popover primitive — it anchors to painted pixels, not to a trigger element.
export function AnnotationNotePopover({
  bounds,
  mode,
  seq,
  note = "",
  authorLine = null,
  onCommit,
  onCancel,
}: {
  bounds: RegionBounds;
  mode: "compose" | "read";
  seq: number;
  note?: string;
  authorLine?: string | null; // e.g. "Asha · 2h ago"
  onCommit?: (note: string) => void;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState(note);
  // Below the region; clamp: never past 78% left (card is ~22% wide min) or 82% top.
  const left = Math.min(bounds.x, 0.62);
  const top = Math.min(bounds.y + bounds.h + 0.02, 0.8);
  return (
    <div
      className="absolute z-20 w-56 rounded-lg border border-border bg-background p-2.5 shadow-lg"
      style={{ left: `${left * 100}%`, top: `${top * 100}%` }}
    >
      <p className="text-eyebrow mb-1.5">Annotation {seq}</p>
      {mode === "compose" ? (
        <>
          <Textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What needs to change here?"
            rows={2}
            className="resize-none text-xs leading-relaxed"
          />
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
              <X className="size-3" strokeWidth={1.5} />
              Cancel
            </Button>
            <Button
              type="button"
              size="xs"
              disabled={!draft.trim()}
              onClick={() => onCommit?.(draft.trim())}
            >
              <Check className="size-3" strokeWidth={1.5} />
              Add note
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-foreground">{note}</p>
          {authorLine && (
            <p className="mt-1 text-[10px] text-muted-foreground">{authorLine}</p>
          )}
        </>
      )}
    </div>
  );
}
```

`src/components/review-annotations/use-annotation-drafts.ts`:

```ts
"use client";

import { useCallback, useState } from "react";
import {
  commitDraft,
  removeDraft,
  type AnnotationDraft,
  type RegionBounds,
} from "@/lib/review-annotations/draft";

export function useAnnotationDrafts() {
  const [drafts, setDrafts] = useState<AnnotationDraft[]>([]);

  const commit = useCallback(
    (
      bounds: RegionBounds | null,
      overlayBase64: string,
      note: string,
      extra?: { kind: "video-frame"; timecodeMs: number; frameBase64: string },
    ) => {
      setDrafts((prev) =>
        commitDraft(prev, {
          seq: 0, // renumbered by commitDraft
          kind: extra?.kind ?? "image",
          timecodeMs: extra?.timecodeMs ?? null,
          overlayBase64,
          frameBase64: extra?.frameBase64 ?? null,
          note,
          bounds,
        }),
      );
    },
    [],
  );

  const remove = useCallback((seq: number) => {
    setDrafts((prev) => removeDraft(prev, seq));
  }, []);

  const clear = useCallback(() => setDrafts([]), []);

  return { drafts, commit, remove, clear };
}
```

`src/components/review-annotations/annotation-list.tsx`:

```tsx
"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type AnnotationListItem = {
  seq: number;
  note: string;
  timecodeMs: number | null;
};

export function formatTimecode(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// The Review-column index of a decision's annotations (D213): flat for images,
// timecode-grouped for video. Compose mode shows a remove control per row.
export function AnnotationList({
  groups,
  readOnly,
  onSeek,
  onRemove,
}: {
  groups: { timecodeMs: number | null; items: AnnotationListItem[] }[];
  readOnly: boolean;
  onSeek?: (timecodeMs: number) => void;
  onRemove?: (seq: number) => void;
}) {
  if (groups.length === 0) return null;
  return (
    <div className="mt-3 min-w-0">
      <span className="text-eyebrow">Annotations</span>
      {groups.map((g) => (
        <div key={g.timecodeMs ?? "image"} className="mt-2 flex gap-2.5">
          {g.timecodeMs !== null && (
            <div className="shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onSeek?.(g.timecodeMs!)}
                className="rounded-full bg-primary/10 px-2 font-semibold text-primary hover:bg-primary/15"
              >
                {formatTimecode(g.timecodeMs)}
              </Button>
            </div>
          )}
          <div className="min-w-0 flex-1">
            {g.items.map((item) => (
              <div key={item.seq} className="mt-1 flex items-start gap-1.5 first:mt-0">
                <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                  {item.seq}
                </span>
                <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">
                  {item.note}
                </p>
                {!readOnly && onRemove && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => onRemove(item.seq)}
                    className="size-5 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove annotation ${item.seq}`}
                  >
                    <Trash2 className="size-3" strokeWidth={1.5} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [x] **Step 2: Extend InlineApprovalBar**

In `src/components/nodes/inline-approval-bar.tsx`, add the four optional props from the Interfaces block to the component signature. Inside the `composing` block, after the `Textarea` and before the Cancel/Send-back row, add:

```tsx
          {onToggleAnnotate && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={saving}
              onClick={onToggleAnnotate}
              className={cn(
                "mt-2 border-dashed border-primary/40 text-primary hover:bg-primary/5",
                annotating && "bg-primary/10",
              )}
            >
              <Paintbrush className="size-3" strokeWidth={1.5} />
              {annotating
                ? "Done annotating"
                : annotationCount
                  ? `Annotate · ${annotationCount}`
                  : "Annotate the image"}
            </Button>
          )}
```

(Import `Paintbrush` from `lucide-react`. The dashed-primary chip styling is the design system's "add action" affordance.)

In the Approve `onClick`, guard with the discard confirm:

```tsx
              onClick={() =>
                act("approve", async () => {
                  if (annotationCount && onConfirmDiscardDrafts) {
                    const ok = await onConfirmDiscardDrafts();
                    if (!ok) { setPending(null); return; }
                  }
                  onSet("approved", null);
                })
              }
```

Also guard Cancel in the composer: if `annotationCount` is set, call `onConfirmDiscardDrafts` the same way before closing.

- [x] **Step 3: Wire the image focus view**

In `src/components/nodes/image-gen-focus-view.tsx` (search for `InlineApprovalBar` to find the Review `LeftSection`, and for the `mode === "result" && imageUrl` block for the media pane):

1. State: `const [reviewAnnotating, setReviewAnnotating] = useState(false);` + `const reviewDrafts = useAnnotationDrafts();` + `const reviewCanvasRef = useRef<AnnotationHandle>(null);` + `const [pendingBounds, setPendingBounds] = useState<RegionBounds | null>(null);` + a `Dialog`-based discard confirm (state `confirmDiscardOpen`, promise resolver ref).
2. Pass to `InlineApprovalBar`: `annotationCount={reviewDrafts.drafts.length}`, `annotating={reviewAnnotating}`, `onToggleAnnotate={() => setReviewAnnotating(v => !v)}`, `onConfirmDiscardDrafts` (opens the Dialog; resolves true → `reviewDrafts.clear()`).
3. In the media pane, when `reviewAnnotating && mode === "result" && imageUrl`, render `ReviewAnnotationCanvas` (ref `reviewCanvasRef`, `baseUrl={imageUrl}`, `hintText="Paint a region, then write its note."`, `onStrokeEnd={(b) => setPendingBounds(b)}`) inside the same relative wrapper the result image uses, with committed draft pins (`AnnotationPin` at each draft's `bounds` center: `x: b.x + b.w / 2`, `y: b.y + b.h / 2`) layered above.
4. When `pendingBounds` is set, render `AnnotationNotePopover mode="compose" seq={reviewDrafts.drafts.length + 1} bounds={pendingBounds}`:
   - `onCommit`: `const overlay = reviewCanvasRef.current?.toOverlayBase64(); if (overlay) { reviewDrafts.commit(pendingBounds, overlay, note); reviewCanvasRef.current?.clear(); } setPendingBounds(null);`
   - `onCancel`: `reviewCanvasRef.current?.clear(); setPendingBounds(null);`
5. In the Review column under the bar, render `AnnotationList readOnly={false} groups={groupByTimecode(reviewDrafts.drafts)} onRemove={reviewDrafts.remove}`.
6. In the handler that calls `setVersionApprovalAction` (search for it in the file), pass `annotations: reviewDrafts.drafts.map(({ bounds: _b, ...payload }) => payload)` when status is `changes_requested` and drafts exist; on success, `reviewDrafts.clear(); setReviewAnnotating(false);`.
7. Confirm dialog: use `Dialog`/`DialogContent` from `src/components/ui/dialog.tsx` — body "Discard N annotations?", buttons "Keep annotating" (ghost) / "Discard" (destructive). If the file doesn't exist, add the shadcn dialog primitive to `src/components/ui/` first (Global Constraints).

- [x] **Step 4: Verify** — automated only; the manual checklist below is still owed

Run: `npx tsc --noEmit && npm test`
Expected: clean. Then manual check (`npm run dev`, or the `run` skill):
- As a senior on a pending image version: Request changes → Annotate → paint → popover appears by the region → Add note → pin + list row appear, brush cleared.
- Paint a second region → pin ② → Send back succeeds; drafts clear.
- Paint a draft then press Approve → discard dialog appears; Cancel keeps drafts.
- As a designer: no Annotate button anywhere.
- Edit mode (Edit switch) still paints and submits masked edits exactly as before.

- [x] **Step 5: Commit**

```bash
git add src/components/review-annotations src/components/nodes/inline-approval-bar.tsx src/components/nodes/image-gen-focus-view.tsx
git commit -m "feat(review-annotations): compose UI - pins, anchored popover, list, approval-bar entry (image)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Read-only layer + decision-thread counts (maker view, image)

**Files:**
- Create: `src/components/review-annotations/annotation-overlay.tsx`
- Modify: `src/components/nodes/image-gen-focus-view.tsx`
- Modify: `src/components/nodes/version-decision-history.tsx`

**Interfaces:**
- Consumes: the versions-route `decisions[].annotations` shape (Task 6), `AnnotationPin` / `AnnotationNotePopover` (Task 8).
- Produces: `AnnotationOverlay({ annotations, showToggle?: boolean })` where `annotations: { id: string; seq: number; note: string; maskUrl: string | null; authorLine: string | null }[]` — mask images rendered at 40% opacity over the media, pins clickable to open read popovers, an "Annotations ✓" toggle chip top-right.

- [x] **Step 1: Build the overlay**

`src/components/review-annotations/annotation-overlay.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AnnotationPin } from "./annotation-pin";
import { AnnotationNotePopover } from "./annotation-note-popover";

export type OverlayAnnotation = {
  id: string;
  seq: number;
  note: string;
  maskUrl: string | null;
  authorLine: string | null;
};

// Read-only annotation layer (D214): the stored painted overlays render directly
// (they ARE the purple strokes), pins open note popovers, one toggle hides it all.
// Pins have no stored bounds — they anchor to the mask image's visual weight is
// unknowable client-side without pixel reads, so pins stack along the top-left
// edge, offset per seq; the region itself is the locator, the pin is the index.
export function AnnotationOverlay({
  annotations,
}: {
  annotations: OverlayAnnotation[];
}) {
  const [visible, setVisible] = useState(true);
  const [openSeq, setOpenSeq] = useState<number | null>(null);
  if (annotations.length === 0) return null;
  const open = annotations.find((a) => a.seq === openSeq) ?? null;
  return (
    <>
      <div className="absolute right-2 top-2 z-20">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => setVisible((v) => !v)}
          className="bg-background/80 backdrop-blur-sm"
        >
          Annotations {visible ? "✓" : "·"} {annotations.length}
        </Button>
      </div>
      {visible && (
        <>
          {annotations.map((a) =>
            a.maskUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={a.id}
                src={a.maskUrl}
                alt=""
                className="pointer-events-none absolute inset-0 size-full object-contain opacity-40"
              />
            ) : null,
          )}
          {annotations.map((a, i) => (
            <AnnotationPin
              key={a.id}
              seq={a.seq}
              x={0.04}
              y={0.06 + i * 0.08}
              active={openSeq === a.seq}
              onClick={() => setOpenSeq(openSeq === a.seq ? null : a.seq)}
            />
          ))}
          {open && (
            <AnnotationNotePopover
              mode="read"
              seq={open.seq}
              note={open.note}
              authorLine={open.authorLine}
              bounds={{ x: 0.08, y: 0.06 + (open.seq - 1) * 0.08, w: 0, h: 0 }}
            />
          )}
        </>
      )}
    </>
  );
}
```

**Note on pin placement:** stored rows carry no bounds — the mask image *is* the region locator. If during manual verification the top-left pin stack reads poorly, extend Task 1's schema with a `bounds jsonb` column, thread `bounds` through payload → action → row → route (Tasks 2/5/6 all touch one field each), and position pins at the draft bounds like compose mode does. Prefer shipping the simple version first and deciding on real screens.

- [x] **Step 2: Wire the image focus view (read path)**

In `image-gen-focus-view.tsx`, the versions data (route from Task 6) is already fetched for the history/decision panels — locate where `decisions` for the ACTIVE version are available (search `approvalStatus` / `decisions`). Derive:

```ts
    const latestChangeRequest = activeVersionDecisions.find((d) => d.status === "changes_requested");
    const reviewAnnotations = latestChangeRequest?.annotations ?? [];
```

When `approvalStatus === "changes_requested" && reviewAnnotations.length > 0 && !reviewAnnotating`, render inside the result image's relative wrapper:

```tsx
    <AnnotationOverlay
      annotations={reviewAnnotations.map((a) => ({
        id: a.id,
        seq: a.seq,
        note: a.note,
        maskUrl: a.maskUrl,
        authorLine: latestChangeRequest
          ? `${latestChangeRequest.reviewerName ?? "Reviewer"} · ${formatRelativeTime(latestChangeRequest.decidedAt)}`
          : null,
      }))}
    />
```

And render the read-only `AnnotationList` (`readOnly groups={groupByTimecode(reviewAnnotations.map(a => ({ seq: a.seq, note: a.note, timecodeMs: a.timecodeMs })))}`) in the Review column, below the approval bar / readout — both roles see it.

- [x] **Step 3: Thread counts**

In `src/components/nodes/version-decision-history.tsx` (`VersionDecisionThread`), where each decision row renders its note, add after it:

```tsx
        {decision.annotations?.length > 0 && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {decision.annotations.length} annotation{decision.annotations.length === 1 ? "" : "s"}
          </p>
        )}
```

(Extend the component's decision prop type with `annotations?: { id: string }[]` — match the actual prop shape used in the file.)

- [x] **Step 4: Verify**

Run: `npx tsc --noEmit && npm test`. Then manual:
- Send back an image with 2 annotations as senior; open the node as the maker (designer): regions render purple at 40%, pins open notes with author line, toggle hides the layer, list shows in the Review column, thread row says "2 annotations".
- Regenerate: the new pending version shows NO overlay (annotations stay in history).

- [x] **Step 5: Commit**

```bash
git add src/components/review-annotations/annotation-overlay.tsx src/components/nodes/image-gen-focus-view.tsx src/components/nodes/version-decision-history.tsx
git commit -m "feat(review-annotations): read-only overlay + thread counts (maker view)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Video — frame capture, annotate-frame flow, timecode list, marker strip

**Files:**
- Create: `src/components/review-annotations/use-frame-capture.ts`
- Modify: `src/components/nodes/video-gen-focus-view.tsx`

**Interfaces:**
- Consumes: everything from Tasks 7–9; `groupByTimecode`, `formatTimecode`.
- Produces: `captureFrame(video: HTMLVideoElement): { base64: string; timecodeMs: number }` — throws `FrameCaptureError` on CORS/decoder failure.

- [x] **Step 1: Implement the capture hook**

`src/components/review-annotations/use-frame-capture.ts`:

```ts
"use client";

export class FrameCaptureError extends Error {}

// Freeze the paused frame at the video's intrinsic size (spec §4.2). Throws
// FrameCaptureError when the canvas is tainted (CORS) or the frame can't decode —
// the caller toasts and the senior falls back to the overall note (no partial rows).
export function captureFrame(video: HTMLVideoElement): {
  base64: string;
  timecodeMs: number;
} {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width === 0) {
    throw new FrameCaptureError("This frame can't be captured.");
  }
  try {
    ctx.drawImage(video, 0, 0);
    const base64 = canvas.toDataURL("image/png").split(",")[1] ?? "";
    if (!base64) throw new FrameCaptureError("This frame can't be captured.");
    return { base64, timecodeMs: Math.round(video.currentTime * 1000) };
  } catch {
    throw new FrameCaptureError(
      "This video can't be annotated in the browser (cross-origin frame).",
    );
  }
}
```

- [x] **Step 2: Wire the video focus view**

In `src/components/nodes/video-gen-focus-view.tsx` (search `InlineApprovalBar` and the `mode === "result" && videoUrl` block):

1. Give the `<video>` element `crossOrigin="anonymous"` and a ref (`videoRef`). Track paused state (`onPause`/`onPlay` → `setVideoPaused`).
2. Same compose state as Task 8 (`useAnnotationDrafts`, `reviewAnnotating`, `pendingBounds`, canvas ref, discard dialog). Pass the same props to `InlineApprovalBar` (label the toggle "Annotate this frame" — pass a `annotateLabel` string prop, or reuse the existing button text; keep one prop, don't fork the component).
3. **Annotate-frame flow:** when composing && `videoPaused` && `canApprove`, show a `Button` overlay top-right of the video ("✎ Annotate frame", `size="xs"`, primary): on click, `try { const f = captureFrame(videoRef.current!); setCapturedFrame(f); } catch (e) { toast(e.message) }`. While `capturedFrame` is set, swap the `<video>` for `ReviewAnnotationCanvas baseUrl={"data:image/png;base64," + capturedFrame.base64}` with a "Back to video" ghost Button; commit passes `extra: { kind: "video-frame", timecodeMs: capturedFrame.timecodeMs, frameBase64: capturedFrame.base64 }`; on commit or cancel, clear `capturedFrame` to return to the player. (Use the toast mechanism this file already uses for generation errors — search `toast`.)
4. **List:** `AnnotationList groups={groupByTimecode(reviewDrafts.drafts)} onSeek={(ms) => { const v = videoRef.current; if (v) { v.currentTime = ms / 1000; v.pause(); } }}` in the Review column (same for the read-only path with stored annotations).
5. **Marker strip:** directly above the `<video>`, a thin non-interactive strip mirroring annotated timecodes (deterministic, unlike overlaying native controls):

```tsx
    {markerTimecodes.length > 0 && videoDurationMs > 0 && (
      <div className="relative mb-1 h-2 w-full rounded-full bg-muted">
        {markerTimecodes.map((ms, i) => (
          <span
            key={ms}
            className="absolute top-1/2 flex size-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground"
            style={{ left: `${Math.min(99, (ms / videoDurationMs) * 100)}%` }}
          >
            {i + 1}
          </span>
        ))}
      </div>
    )}
```

   where `markerTimecodes` is the sorted unique timecodes of drafts (compose) or stored annotations (read), and `videoDurationMs` comes from the video's `onLoadedMetadata` (`duration * 1000`).
6. **Read path:** as Task 9, but the overlay renders on the CAPTURED FRAME context: clicking a timecode chip or marker seeks + pauses the video, and renders that group's `frameUrl` still + mask overlays + pins in place of nothing (an `absolute inset-0` layer over the paused video showing the stored `frameUrl` image with its masks at 40%). Clicking anywhere outside or pressing play dismisses the layer.

- [x] **Step 3: Verify**

Run: `npx tsc --noEmit && npm test`. Then manual, on a video node **on the remote/staging environment if local video-gen has no completed versions** (local video generation never completes — known constraint; a previously generated version with a playable URL is enough locally):
- Pause at ~2s → Annotate frame → paint + note → pair lands under `0:02` with the frame thumb behavior; player returns.
- Two pairs on one frame → one timecode group, pins ②③.
- Send back; as maker: chips seek the video, marker strip shows dots, stored frame + regions render on chip click.
- A cross-origin test video (if any) fails capture with the toast, not a crash.

- [x] **Step 4: Commit**

```bash
git add src/components/review-annotations/use-frame-capture.ts src/components/nodes/video-gen-focus-view.tsx
git commit -m "feat(review-annotations): video frame capture, timecode groups, marker strip

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Full verification + wrap-up

**Files:**
- Modify: none expected (fixes only if verification finds them)

- [x] **Step 1: Full suite, typecheck, lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: green (Kling flake: re-run once; pre-existing lint failures unrelated to this feature are out of scope — compare against a stash-free `git stash`-less baseline by checking they exist on the base commit too).

- [ ] **Step 2: End-to-end manual pass** — NOT RUN (needs two logged-in browsers, senior + maker)

The full senior→maker loop on one image node and one video node, per the checklists in Tasks 8–10. Verify the org Realtime path: with two browsers (senior + maker), the maker's badge flips to "Sent back" without a reload when the annotated decision lands.

- [x] **Step 3: Confirm docs are true**

- Spec §5.2 matches the shipped migration (Task 1's wording change).
- `MIGRATIONS-PENDING.md` lists 0035.
- ADRs D209–D214 need no correction from implementation discoveries; if the bounds-column contingency in Task 9 was taken, append that refinement to D213's entry.

- [x] **Step 4: Final commit (if anything changed)**

```bash
git add -A
git commit -m "chore(review-annotations): verification fixes and doc truing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Execution notes (2026-09-04)

Tasks 1-11 are implemented and committed. Automated verification is green on every task:
`npm test` 1498/1498, `npx tsc --noEmit` clean, and `npx eslint` over every file this
branch touches reports **0 errors** (9 warnings, all intentional `_`-prefixed unused vars
plus one pre-existing `<img>` notice). The repo-wide lint has 28 errors, none of them in a
file this branch touched.

**Still owed: the manual passes in Tasks 8, 9, 10 and 11 Step 2.** They need two logged-in
browsers (senior + maker) against a canvas with a generated image and a playable video, so
they could not be run here. Nothing below has been observed on a real screen.

Three deviations from the plan as written, each committed with its reasoning:

1. **Pins render through an `overlay` slot inside the canvas's aspect-ratio box** (Task 8),
   not layered in an outer wrapper. The outer wrapper also contains the 64px tool rail, so
   every fractional position would land right of the region it marks.
2. **The discard confirm is `AlertDialog`, extracted as `DiscardAnnotationsDialog` +
   `useDiscardAnnotationsConfirm`** (Task 8), not an inline `Dialog`. AlertDialog is what
   every other destructive confirm in the repo uses; the promise/resolver shape mirrors
   `useDeleteConfirmation`; video was a real second consumer.
3. **Annotate mode reads the video through `/api/image-proxy`** (Task 10) instead of setting
   `crossOrigin="anonymous"` on the player unconditionally. GCS objects send no CORS
   headers, so the plan's version would have failed the media load outright and broken
   playback for everyone. Recorded as **D215**.

Task 9's bounds-column contingency was **not** taken — pins stack down the left edge and the
mask image is the locator. Recorded as **D216** so it is a decision, not an omission.

One pre-existing defect was fixed on the way through: Task 4's `storage.test.ts` typed its
stub overrides as `ReturnType<typeof vi.fn>`, which is `Mock<Procedure | Constructable>` and
not assignable to a concrete signature — it failed `tsc --noEmit` while vitest stayed green.

## Self-review notes (already applied)

- **Spec coverage:** §4.1→Task 8, §4.2→Task 10, §4.3→Tasks 9–10, §4.4→Tasks 5/8, §5.1→Tasks 7–10, §5.2→Tasks 1/3/4, §5.3→Tasks 2/5, §5.4→no work (verified in Task 11), §6→Tasks 4/5/10, §7→each task's tests, §8 milestones→task order.
- **Deviation from spec, deliberate:** `mask_path` stores the painted overlay (display-ready), not the pre-converted OpenAI mask — Task 1 Step 4 trues up the spec. Replay stays one pure function away (`overlayToMaskRGBA`).
- **Known open UI risk:** read-mode pin placement without stored bounds (Task 9 note) — resolved on real screens, with a scoped contingency.
