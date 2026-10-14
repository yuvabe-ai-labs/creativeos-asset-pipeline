# Client Avatars — Foundation (Plan 1 of 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client gets an Avatars library page and an Avatar Studio in which an operator can build an avatar from uploaded images (front image, profile sheet, person-type declaration, name, story), save it as ready, and archive it.

**Architecture:** One new table, `client_avatars`, holds the avatar; each image is a JSON value that records its source. Pure rules in `src/lib/avatars/` (readiness, what a front-image change resets, what an update may do) are shared by the routes and the Studio. Routes under `/api/clients/[id]/avatars` are thin: parse, call a pure planner, write through the DAL. Images go browser → GCS through the existing sign / PUT / finalize flow.

**Tech Stack:** Next.js 16 route handlers and server pages, Supabase (service-role client), GCS signed uploads, zod, vitest (node env — no component rendering), shadcn/Base UI primitives, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-09-29-client-avatars-design.md` · **ADR:** D287, D288 (D289–D293 are plans 2 and 3)

**Amended after execution (2026-09-30):** the person-type declaration in Tasks 1, 5 and 9 was removed. Person type now follows the front image's source (upload → specific, generated → generic); there is no question, tick or confirmer record, and no `declaration` readiness gap. The code is the reference for those parts; the task text below is as originally executed. See spec §3.3 and D289.

**Plans in this series:** 1 Foundation (this file) · 2 Generation and credits (Describe batches, sheet generation, ledger, Seedance badge) · 3 Voices (`client_voices`, shared picker, Clone, voice sample).

## Global Constraints

- Branch: `feat/client-avatars` (exists; holds the spec). Work in a git worktree — the main checkout is in use on another branch.
- This is NOT the Next.js in your training data. Before writing a page or route, read the matching guide in `node_modules/next/dist/docs/01-app/`. `params` is a `Promise` and must be awaited.
- API routes: `withClient` on every route, `apiOk` / `apiError` only (never `NextResponse.json`), `withTryCatch` around multi-step handlers. In API routes `[id]` is the client **UUID**; in pages `[id]` is the client **slug**.
- An avatar id from the URL is never trusted alone: every read and write also filters on `client_id`. A foreign or missing avatar is a 404.
- Controls are shadcn primitives from `src/components/ui/*` only — never a raw `<button>`, `<input>`, `<textarea>`. Base UI composes with the `render` prop, not `asChild`.
- Design system: colours only through the shadcn CSS variables (no hex, no `black`/`white`); `font-display` for headings; `.text-eyebrow` for small labels; `shadow-card` for resting cards; Lucide icons at `strokeWidth={1.5}`; "Add" actions are dashed-border primary chips (`border border-dashed border-primary/40 hover:bg-primary/5`).
- Components: one per file, named export, under ~200 lines, in `src/components/avatars/`. Types, constants and helpers live in `src/lib/avatars/`, never in the components folder.
- Import, don't redefine: `formatDate` (`@/lib/kb/utils`), `uploadViaSignedUrl` / `readImageSize` (`@/lib/uploads/client`), `useDebouncedCallback` (`@/hooks/use-debounced-callback`), `publicUrlFor` / `removeObject` (`@/lib/storage`).
- Readiness: an avatar is `ready` only with a name, a front image, a profile sheet that is not stale and, for an uploaded front image, a person declaration. Replacing the front image marks the sheet stale and clears the declaration.
- Deleting an avatar archives it (`archived_at`); nothing is removed from storage on archive.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. One commit per task.
- Run tests per file or directory (`npx vitest run <path>`); the full run has ~11 known timeout flakes in API route tests.
- The migration is applied by hand in the Supabase SQL editor. Do not apply it yourself; Task 10 stops and asks the operator.
- Migrations are split by plan, not one file as spec §3 words it: `0041_client_avatars` here, the `generations` change in plan 2, `client_voices` in plan 3. The `voice` and `voice_sample` columns are created here so plan 3 needs no alter on this table.
- Not in this plan: Describe and generation, credits, the Seedance badge (plan 2); voices (plan 3); library search by name (spec §5 defers it until a client has more than one screen of avatars).

## File Map

| File | Responsibility |
|---|---|
| `src/lib/avatars/schema.ts` | Types: `Avatar`, `AvatarImage`, `AvatarImageSource`, `PersonType`, `AvatarStatus`, `AvatarImageSlot` |
| `src/lib/avatars/constants.ts` | Extension set, size limit, text limits, labels |
| `src/lib/avatars/utils.ts` | Pure rules: readiness, front/sheet change patches, `planAvatarUpdate`, `validateAvatarImageFile` |
| `src/lib/avatars/rows.ts` | `AvatarRow`, `rowToAvatar`, `patchToRow` |
| `src/lib/avatars/__tests__/fixtures.ts` | `makeAvatar`, `makeImage` for tests |
| `supabase/migrations/0041_client_avatars.sql` | The table, index, RLS |
| `src/lib/storage/paths.ts`, `src/lib/storage/index.ts` | `pathForAvatarImage`, `signAvatarImageUpload` |
| `src/lib/db/avatars.ts` | DAL: list, get, create draft, update, archive |
| `src/app/api/clients/[id]/avatars/route.ts` | GET list, POST create draft |
| `src/app/api/clients/[id]/avatars/[avatarId]/route.ts` | GET, PATCH, DELETE (archive) |
| `src/app/api/clients/[id]/avatars/[avatarId]/images/sign/route.ts` | Sign an image upload |
| `src/app/api/clients/[id]/avatars/[avatarId]/images/route.ts` | Finalize an image upload |
| `src/services/avatars.service.ts` | Browser calls to the routes |
| `src/hooks/use-avatar-studio.ts` | Studio state and actions |
| `src/components/avatars/*.tsx` | Library, tile, Studio and its parts |
| `src/app/clients/[id]/avatars/page.tsx`, `new/page.tsx`, `[avatarId]/page.tsx` | Pages |
| `src/components/clients/client-settings-menu.tsx` | Adds the Avatars link |
| `docs/auth-production-migration.md` | Migration 0041 section |

---

### Task 1: Domain types and pure rules

**Files:**
- Create: `src/lib/avatars/schema.ts`, `src/lib/avatars/constants.ts`, `src/lib/avatars/utils.ts`, `src/lib/avatars/__tests__/fixtures.ts`
- Test: `src/lib/avatars/__tests__/utils.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: every type in `schema.ts`; from `utils.ts`: `ReadinessGap`, `ReadinessInput`, `AvatarPatch`, `AvatarUpdateInput`, `needsLikenessDeclaration(a)`, `avatarReadinessGaps(a): ReadinessGap[]`, `isAvatarReady(a): boolean`, `frontChangePatch(current, image): AvatarPatch`, `sheetChangePatch(image): AvatarPatch`, `withStatus(current, patch): AvatarPatch`, `planAvatarUpdate(current, input, ctx): { ok: true; patch } | { ok: false; error }`, `validateAvatarImageFile(file): string | null`; from fixtures: `makeAvatar(overrides?)`, `makeImage(source?)`.

- [ ] **Step 1: Write the types**

`src/lib/avatars/schema.ts`:

```ts
// D287/D288 — a client-level avatar. Pure types: imported by routes, the DAL and the browser.

export type PersonType = "generic" | "specific";
export type AvatarStatus = "draft" | "ready";
export type AvatarImageSlot = "front" | "sheet";

// D288 — how an image came to exist. Seedance eligibility (D290, plan 2) is computed from the
// `generated` fields and never stored, so they are recorded from day one.
export type AvatarImageSource =
  | { kind: "upload"; filename: string; uploadedBy: string; uploadedAt: string }
  | {
      kind: "generated";
      modelId: string;
      mode: "text" | "edit";
      prompt: string;
      generatedAt: string;
      generationId: string;
      untouched: boolean;
    };

export type AvatarImage = {
  url: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  source: AvatarImageSource;
};

export type AvatarVoice = {
  voiceId: string;
  name: string;
  labels: Record<string, string>;
  previewUrl: string | null;
};

export type AvatarVoiceSample = { url: string; durationSeconds: number; sourceKey: string };

export type Avatar = {
  id: string;
  clientId: string;
  name: string;
  story: string;
  // null until decided: set automatically for a generated front, declared for an upload.
  personType: PersonType | null;
  likenessConfirmedBy: string | null;
  likenessConfirmedAt: string | null;
  front: AvatarImage | null;
  sheet: AvatarImage | null;
  sheetStale: boolean;
  voice: AvatarVoice | null;
  voiceSample: AvatarVoiceSample | null;
  status: AvatarStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 2: Write the constants**

`src/lib/avatars/constants.ts`:

```ts
import type { PersonType } from "./schema";

// Deliberately narrower than LOGO_EXTENSIONS: a face reference is a photo, never svg or gif.
export const AVATAR_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
export const AVATAR_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
export const AVATAR_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const AVATAR_IMAGE_MAX_LABEL = "15 MB";

export const AVATAR_NAME_MAX = 60;
export const AVATAR_STORY_MAX = 1000;

export const PERSON_TYPE_LABELS: Record<PersonType, string> = {
  generic: "Generic",
  specific: "Real person",
};

// The tick the operator confirms, per answer to "Is this a real person?" (D288).
export const LIKENESS_STATEMENTS: Record<PersonType, string> = {
  specific: "I have this person's permission to use their likeness",
  generic: "This is not a real person",
};

// Completes the sentence "Still needed: …".
export const READINESS_GAP_LABELS = {
  name: "a name",
  front: "a front image",
  sheet: "a profile sheet",
  "sheet-stale": "a profile sheet that matches the new front image",
  declaration: "the real-person declaration",
} as const;
```

- [ ] **Step 3: Write the test fixtures**

`src/lib/avatars/__tests__/fixtures.ts`:

```ts
import type { Avatar, AvatarImage, AvatarImageSource } from "../schema";

const UPLOAD: AvatarImageSource = {
  kind: "upload", filename: "face.png", uploadedBy: "user-1", uploadedAt: "2026-09-30T10:00:00.000Z",
};

export function makeImage(source: AvatarImageSource = UPLOAD): AvatarImage {
  return { url: "https://storage.googleapis.com/b/clients/c1/avatars/a1/front/face.png", width: 900, height: 1200, sizeBytes: 1000, source };
}

export const GENERATED: AvatarImageSource = {
  kind: "generated", modelId: "seedream:seedream-5-0-lite", mode: "text", prompt: "p",
  generatedAt: "2026-09-30T10:00:00.000Z", generationId: "gen-1", untouched: true,
};

/** A complete, ready avatar with an uploaded, declared front image. Override to break it. */
export function makeAvatar(overrides: Partial<Avatar> = {}): Avatar {
  return {
    id: "a1", clientId: "c1", name: "Riya", story: "",
    personType: "specific", likenessConfirmedBy: "user-1", likenessConfirmedAt: "2026-09-30T10:05:00.000Z",
    front: makeImage(), sheet: makeImage(), sheetStale: false,
    voice: null, voiceSample: null, status: "ready", archivedAt: null,
    createdAt: "2026-09-30T10:00:00.000Z", updatedAt: "2026-09-30T10:05:00.000Z",
    ...overrides,
  };
}
```

- [ ] **Step 4: Write the failing tests**

`src/lib/avatars/__tests__/utils.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  avatarReadinessGaps, isAvatarReady, needsLikenessDeclaration, frontChangePatch,
  sheetChangePatch, withStatus, planAvatarUpdate, validateAvatarImageFile,
} from "../utils";
import { AVATAR_IMAGE_MAX_BYTES, AVATAR_NAME_MAX } from "../constants";
import { GENERATED, makeAvatar, makeImage } from "./fixtures";

const ctx = { userId: "user-9", now: "2026-10-01T00:00:00.000Z" };

describe("avatarReadinessGaps", () => {
  it("is empty for a complete avatar", () => {
    expect(avatarReadinessGaps(makeAvatar())).toEqual([]);
    expect(isAvatarReady(makeAvatar())).toBe(true);
  });

  it("lists every missing part of an empty draft", () => {
    const gaps = avatarReadinessGaps(makeAvatar({ name: "  ", front: null, sheet: null }));
    expect(gaps).toEqual(["name", "front", "sheet"]);
  });

  it("reports a stale sheet separately from a missing one", () => {
    expect(avatarReadinessGaps(makeAvatar({ sheetStale: true }))).toEqual(["sheet-stale"]);
  });

  it("requires a declaration for an uploaded front, but not a generated one", () => {
    const undeclared = { personType: null, likenessConfirmedAt: null, likenessConfirmedBy: null };
    expect(avatarReadinessGaps(makeAvatar(undeclared))).toEqual(["declaration"]);
    expect(needsLikenessDeclaration(makeAvatar({ ...undeclared, front: makeImage(GENERATED) }))).toBe(false);
  });
});

describe("frontChangePatch", () => {
  it("an uploaded front clears the declaration and marks an existing sheet stale", () => {
    const patch = frontChangePatch(makeAvatar(), makeImage());
    expect(patch).toMatchObject({
      sheetStale: true, personType: null, likenessConfirmedBy: null, likenessConfirmedAt: null,
    });
  });

  it("a generated front is generic, with no declaration to ask for", () => {
    expect(frontChangePatch(makeAvatar(), makeImage(GENERATED)).personType).toBe("generic");
  });

  it("does not mark the sheet stale when there is no sheet yet", () => {
    expect(frontChangePatch(makeAvatar({ sheet: null }), makeImage()).sheetStale).toBe(false);
  });
});

describe("sheetChangePatch", () => {
  it("a new sheet is never stale", () => {
    expect(sheetChangePatch(makeImage())).toMatchObject({ sheetStale: false });
  });
});

describe("withStatus", () => {
  it("drops a ready avatar back to draft when the patch leaves a gap", () => {
    const current = makeAvatar();
    expect(withStatus(current, frontChangePatch(current, makeImage())).status).toBe("draft");
  });

  it("leaves status alone when the avatar stays complete", () => {
    expect(withStatus(makeAvatar(), { story: "new" }).status).toBeUndefined();
  });
});

describe("planAvatarUpdate", () => {
  it("trims the name and rejects one that is too long", () => {
    const ok = planAvatarUpdate(makeAvatar(), { name: "  Meera " }, ctx);
    expect(ok).toEqual({ ok: true, patch: { name: "Meera" } });
    const long = planAvatarUpdate(makeAvatar(), { name: "x".repeat(AVATAR_NAME_MAX + 1) }, ctx);
    expect(long.ok).toBe(false);
  });

  it("records who declared the person type and when", () => {
    const current = makeAvatar({ personType: null, likenessConfirmedBy: null, likenessConfirmedAt: null, status: "draft" });
    const result = planAvatarUpdate(current, { declaration: { personType: "generic" } }, ctx);
    expect(result).toEqual({
      ok: true,
      patch: { personType: "generic", likenessConfirmedBy: "user-9", likenessConfirmedAt: ctx.now },
    });
  });

  it("refuses a declaration when the front image was generated", () => {
    const current = makeAvatar({ front: makeImage(GENERATED) });
    expect(planAvatarUpdate(current, { declaration: { personType: "specific" } }, ctx).ok).toBe(false);
  });

  it("refuses ready while something is missing, and names it", () => {
    const result = planAvatarUpdate(makeAvatar({ status: "draft", sheet: null }), { status: "ready" }, ctx);
    expect(result).toEqual({ ok: false, error: "Still needed: a profile sheet." });
  });

  it("allows ready when the same request supplies the missing name", () => {
    const current = makeAvatar({ status: "draft", name: "" });
    const result = planAvatarUpdate(current, { name: "Riya", status: "ready" }, ctx);
    expect(result).toEqual({ ok: true, patch: { name: "Riya", status: "ready" } });
  });

  it("clearing the name of a ready avatar returns it to draft", () => {
    const result = planAvatarUpdate(makeAvatar(), { name: "" }, ctx);
    expect(result).toEqual({ ok: true, patch: { name: "", status: "draft" } });
  });
});

describe("validateAvatarImageFile", () => {
  it("accepts a png within the limit", () => {
    expect(validateAvatarImageFile({ name: "face.PNG", size: 1000 })).toBeNull();
  });
  it("rejects other types and oversize files with the rule stated", () => {
    expect(validateAvatarImageFile({ name: "face.gif", size: 1000 })).toMatch(/png, jpg, jpeg, webp/);
    expect(validateAvatarImageFile({ name: "face.png", size: AVATAR_IMAGE_MAX_BYTES + 1 })).toMatch(/15 MB/);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run src/lib/avatars`
Expected: FAIL — cannot resolve `../utils`.

- [ ] **Step 6: Write the rules**

`src/lib/avatars/utils.ts`:

```ts
import {
  AVATAR_IMAGE_EXTENSIONS, AVATAR_IMAGE_MAX_BYTES, AVATAR_IMAGE_MAX_LABEL,
  AVATAR_NAME_MAX, AVATAR_STORY_MAX, READINESS_GAP_LABELS,
} from "./constants";
import type { Avatar, AvatarImage, PersonType } from "./schema";

export type ReadinessGap = keyof typeof READINESS_GAP_LABELS;

// The fields readiness depends on — a Pick, so the Studio can ask before an avatar row exists.
export type ReadinessInput = Pick<
  Avatar, "name" | "front" | "sheet" | "sheetStale" | "personType" | "likenessConfirmedAt"
>;

export type AvatarPatch = Partial<Pick<
  Avatar,
  "name" | "story" | "personType" | "likenessConfirmedBy" | "likenessConfirmedAt"
  | "front" | "sheet" | "sheetStale" | "status"
>>;

export type AvatarUpdateInput = {
  name?: string;
  story?: string;
  declaration?: { personType: PersonType };
  status?: "ready";
};

/** D288 — an uploaded front may be a real person, so it needs the operator's declaration. */
export function needsLikenessDeclaration(avatar: ReadinessInput): boolean {
  if (avatar.front?.source.kind !== "upload") return false;
  return !avatar.personType || !avatar.likenessConfirmedAt;
}

export function avatarReadinessGaps(avatar: ReadinessInput): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];
  if (!avatar.name.trim()) gaps.push("name");
  if (!avatar.front) gaps.push("front");
  if (!avatar.sheet) gaps.push("sheet");
  else if (avatar.sheetStale) gaps.push("sheet-stale");
  if (needsLikenessDeclaration(avatar)) gaps.push("declaration");
  return gaps;
}

export function isAvatarReady(avatar: ReadinessInput): boolean {
  return avatarReadinessGaps(avatar).length === 0;
}

/** A new front is a new face: any sheet made from the old one is stale, and a declaration
 *  made about the old photo no longer covers this one. */
export function frontChangePatch(current: Avatar, image: AvatarImage): AvatarPatch {
  return {
    front: image,
    sheetStale: current.sheet !== null,
    personType: image.source.kind === "generated" ? "generic" : null,
    likenessConfirmedBy: null,
    likenessConfirmedAt: null,
  };
}

export function sheetChangePatch(image: AvatarImage): AvatarPatch {
  return { sheet: image, sheetStale: false };
}

/** A ready avatar that no longer meets the bar goes back to draft. */
export function withStatus(current: Avatar, patch: AvatarPatch): AvatarPatch {
  const merged = { ...current, ...patch };
  if (merged.status === "ready" && !isAvatarReady(merged)) return { ...patch, status: "draft" };
  return patch;
}

export function planAvatarUpdate(
  current: Avatar,
  input: AvatarUpdateInput,
  ctx: { userId: string; now: string },
): { ok: true; patch: AvatarPatch } | { ok: false; error: string } {
  const patch: AvatarPatch = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length > AVATAR_NAME_MAX) {
      return { ok: false, error: `The name can be at most ${AVATAR_NAME_MAX} characters.` };
    }
    patch.name = name;
  }
  if (input.story !== undefined) {
    const story = input.story.trim();
    if (story.length > AVATAR_STORY_MAX) {
      return { ok: false, error: `The story can be at most ${AVATAR_STORY_MAX} characters.` };
    }
    patch.story = story;
  }
  if (input.declaration) {
    if (current.front?.source.kind !== "upload") {
      return { ok: false, error: "Only an uploaded front image needs a declaration." };
    }
    patch.personType = input.declaration.personType;
    patch.likenessConfirmedBy = ctx.userId;
    patch.likenessConfirmedAt = ctx.now;
  }
  if (input.status === "ready") {
    const gaps = avatarReadinessGaps({ ...current, ...patch });
    if (gaps.length > 0) {
      const needed = gaps.map((g) => READINESS_GAP_LABELS[g]).join(", ");
      return { ok: false, error: `Still needed: ${needed}.` };
    }
    patch.status = "ready";
  }
  return { ok: true, patch: withStatus(current, patch) };
}

/** Browser and server share this, so the message is the same before and after the upload. */
export function validateAvatarImageFile(file: { name: string; size: number }): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!AVATAR_IMAGE_EXTENSIONS.has(ext)) {
    return `Unsupported file type '.${ext}'. Allowed: ${[...AVATAR_IMAGE_EXTENSIONS].join(", ")}.`;
  }
  if (file.size > AVATAR_IMAGE_MAX_BYTES) {
    return `This image is larger than the ${AVATAR_IMAGE_MAX_LABEL} limit.`;
  }
  return null;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/lib/avatars`
Expected: PASS, 18 tests.

- [ ] **Step 8: Commit**

```bash
git add src/lib/avatars
git commit -m "feat(avatars): avatar types and readiness rules (D287, D288)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Table, row mapping and migration doc

**Files:**
- Create: `supabase/migrations/0041_client_avatars.sql`, `src/lib/avatars/rows.ts`
- Modify: `docs/auth-production-migration.md` (append at the end)
- Test: `src/lib/avatars/__tests__/rows.test.ts`

**Interfaces:**
- Consumes: `Avatar` (Task 1 `schema.ts`), `AvatarPatch` (Task 1 `utils.ts`), `makeAvatar` (fixtures).
- Produces: `AvatarRow`, `rowToAvatar(row: AvatarRow): Avatar`, `patchToRow(patch: AvatarPatch): Record<string, unknown>`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0041_client_avatars.sql`:

```sql
-- Client avatars (D287, D288). See docs/superpowers/specs/2026-09-29-client-avatars-design.md.
-- Purely additive: one new table, nothing existing is altered.

create table client_avatars (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null default '',
  story       text not null default '',
  -- Null until decided: set for a generated front, declared by the operator for an upload.
  person_type text check (person_type in ('generic', 'specific')),
  likeness_confirmed_by uuid references auth.users(id) on delete set null,
  likeness_confirmed_at timestamptz,
  -- AvatarImage JSON: { url, width, height, sizeBytes, source }. JSONB rather than columns
  -- because `source` is a tagged union read whole; nothing filters on its fields in SQL.
  front       jsonb,
  sheet       jsonb,
  sheet_stale boolean not null default false,
  -- Written by plan 3 (voices). Present now so that plan needs no alter on this table.
  voice        jsonb,
  voice_sample jsonb,
  status      text not null default 'draft' check (status in ('draft', 'ready')),
  archived_at timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The library always reads one client's live avatars.
create index client_avatars_client_idx on client_avatars (client_id, archived_at);

-- Default-deny RLS with zero policies, as 0027_brand_kit.sql: the app reads and writes through
-- the service-role client; this only closes the direct-REST path the anon key would open.
alter table client_avatars enable row level security;
```

- [ ] **Step 2: Write the failing test**

`src/lib/avatars/__tests__/rows.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { patchToRow, rowToAvatar, type AvatarRow } from "../rows";
import { makeAvatar, makeImage } from "./fixtures";

const row: AvatarRow = {
  id: "a1", client_id: "c1", name: "Riya", story: "",
  person_type: "specific", likeness_confirmed_by: "user-1",
  likeness_confirmed_at: "2026-09-30T10:05:00.000Z",
  front: makeImage(), sheet: makeImage(), sheet_stale: false,
  voice: null, voice_sample: null, status: "ready", archived_at: null,
  created_at: "2026-09-30T10:00:00.000Z", updated_at: "2026-09-30T10:05:00.000Z",
};

describe("rowToAvatar", () => {
  it("maps snake_case columns to the domain shape", () => {
    expect(rowToAvatar(row)).toEqual(makeAvatar());
  });
});

describe("patchToRow", () => {
  it("writes only the keys the patch carries, under their column names", () => {
    expect(patchToRow({ name: "Meera", sheetStale: true })).toEqual({ name: "Meera", sheet_stale: true });
  });

  it("keeps an explicit null, so a cleared declaration is actually cleared", () => {
    const out = patchToRow({ personType: null, likenessConfirmedBy: null, likenessConfirmedAt: null });
    expect(out).toEqual({ person_type: null, likeness_confirmed_by: null, likeness_confirmed_at: null });
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/lib/avatars/__tests__/rows.test.ts`
Expected: FAIL — cannot resolve `../rows`.

- [ ] **Step 4: Write the mapping**

`src/lib/avatars/rows.ts`:

```ts
import type {
  Avatar, AvatarImage, AvatarStatus, AvatarVoice, AvatarVoiceSample, PersonType,
} from "./schema";
import type { AvatarPatch } from "./utils";

export type AvatarRow = {
  id: string;
  client_id: string;
  name: string;
  story: string;
  person_type: PersonType | null;
  likeness_confirmed_by: string | null;
  likeness_confirmed_at: string | null;
  front: AvatarImage | null;
  sheet: AvatarImage | null;
  sheet_stale: boolean;
  voice: AvatarVoice | null;
  voice_sample: AvatarVoiceSample | null;
  status: AvatarStatus;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export function rowToAvatar(row: AvatarRow): Avatar {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    story: row.story,
    personType: row.person_type,
    likenessConfirmedBy: row.likeness_confirmed_by,
    likenessConfirmedAt: row.likeness_confirmed_at,
    front: row.front,
    sheet: row.sheet,
    sheetStale: row.sheet_stale,
    voice: row.voice,
    voiceSample: row.voice_sample,
    status: row.status,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMN: Record<keyof AvatarPatch, string> = {
  name: "name",
  story: "story",
  personType: "person_type",
  likenessConfirmedBy: "likeness_confirmed_by",
  likenessConfirmedAt: "likeness_confirmed_at",
  front: "front",
  sheet: "sheet",
  sheetStale: "sheet_stale",
  status: "status",
};

/** Only keys present in the patch are written; `undefined` is skipped, `null` is kept. */
export function patchToRow(patch: AvatarPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(patch) as (keyof AvatarPatch)[]) {
    if (patch[key] !== undefined) out[COLUMN[key]] = patch[key];
  }
  return out;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/lib/avatars`
Expected: PASS, 21 tests.

- [ ] **Step 6: Document the migration**

Append to the end of `docs/auth-production-migration.md`:

````markdown

## Migration 0041 — `client_avatars` (2026-09-30)

`supabase/migrations/0041_client_avatars.sql`. Paste into the Supabase SQL editor → Run.
Same manual dashboard process as every other migration in this doc.

Creates `client_avatars` (D287, D288): one row per avatar, owned by a client, with its front
image and profile sheet as JSON that records each image's source. RLS is enabled with zero
policies (default-deny, as `0027`); the app reads and writes through the service role.

**Purely additive** — one new table, no existing table altered, no backfill.

**Not safe to re-run:** `create table` fails if the table exists. That failure is harmless.

**Ordering:** apply before deploying the app code. The Avatars page fails with
`relation "client_avatars" does not exist` until it lands.

**Verify after running:**

```sql
-- expect 1 row, rowsecurity = true
select relname, relrowsecurity from pg_class where relname = 'client_avatars';

-- expect 0 rows (no policies by design)
select policyname from pg_policies where tablename = 'client_avatars';
```
````

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0041_client_avatars.sql src/lib/avatars docs/auth-production-migration.md
git commit -m "feat(avatars): client_avatars table and row mapping (D287)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Storage path and signed upload

**Files:**
- Modify: `src/lib/storage/paths.ts` (add after `pathForBrandAsset`), `src/lib/storage/index.ts` (import + add after `signClientBrandAssetUpload`)
- Test: `src/lib/storage/paths.test.ts` (append)

**Interfaces:**
- Consumes: `AvatarImageSlot` (Task 1), existing `buildStoredName`, `_sign`.
- Produces: `pathForAvatarImage({ clientId, avatarId, slot, filename }): string` → `clients/<clientId>/avatars/<avatarId>/<slot>/<stored name>`; `signAvatarImageUpload({ clientId, avatarId, slot, filename, contentType }): Promise<SignedUploadResult>`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/storage/paths.test.ts`, and add `pathForAvatarImage` to the existing import from `./paths`:

```ts
describe("pathForAvatarImage", () => {
  const args = { clientId: "c1", avatarId: "a1", filename: "My Face.PNG" };

  it("nests under the client, the avatar and the slot", () => {
    const path = pathForAvatarImage({ ...args, slot: "front" });
    expect(path.startsWith("clients/c1/avatars/a1/front/")).toBe(true);
    expect(path.endsWith(".png")).toBe(true);
  });

  it("keeps the two slots apart", () => {
    expect(pathForAvatarImage({ ...args, slot: "sheet" })).toContain("/avatars/a1/sheet/");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/storage/paths.test.ts`
Expected: FAIL — `pathForAvatarImage` is not exported.

- [ ] **Step 3: Add the path builder**

In `src/lib/storage/paths.ts`, add to the imports at the top:

```ts
import type { AvatarImageSlot } from "@/lib/avatars/schema";
```

and add after `pathForBrandAsset`:

```ts
/**
 * Where an avatar's uploaded image lives (D287). The slot is part of the path so the finalize
 * route can check that a path signed for the sheet is not recorded as the front.
 */
export function pathForAvatarImage(args: {
  clientId: string;
  avatarId: string;
  slot: AvatarImageSlot;
  filename: string;
}): string {
  const name = buildStoredName(args.filename);
  return `clients/${args.clientId}/avatars/${args.avatarId}/${args.slot}/${name}`;
}
```

- [ ] **Step 4: Add the signer**

In `src/lib/storage/index.ts`, add `pathForAvatarImage` to the import from `./paths`, add `import type { AvatarImageSlot } from "@/lib/avatars/schema";`, and add after `signClientBrandAssetUpload`:

```ts
export async function signAvatarImageUpload(args: {
  clientId: string;
  avatarId: string;
  slot: AvatarImageSlot;
  filename: string;
  contentType: string;
}): Promise<SignedUploadResult> {
  const path = pathForAvatarImage({
    clientId: args.clientId,
    avatarId: args.avatarId,
    slot: args.slot,
    filename: args.filename,
  });
  return _sign(path, args.contentType);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/storage`
Expected: PASS (the two new tests plus the existing ones).

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage
git commit -m "feat(avatars): storage path and signed upload for avatar images

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Data access

**Files:**
- Create: `src/lib/db/avatars.ts`

**Interfaces:**
- Consumes: `AvatarRow`, `rowToAvatar`, `patchToRow` (Task 2); `AvatarPatch` (Task 1); `createServerSupabase` from `@/lib/supabase/server`.
- Produces:
  - `listAvatars(clientId: string): Promise<Avatar[]>` — live avatars, newest edit first
  - `getAvatar(clientId: string, avatarId: string): Promise<Avatar | null>` — includes archived; null for a missing or foreign id
  - `createDraftAvatar(args: { clientId: string; userId: string; name?: string; story?: string }): Promise<Avatar>`
  - `updateAvatar(clientId: string, avatarId: string, patch: AvatarPatch): Promise<Avatar | null>`
  - `archiveAvatar(clientId: string, avatarId: string): Promise<boolean>`

This file is a thin query layer over logic already tested in Tasks 1–2; like `src/lib/db/brand-kit.ts` it has no unit test of its own and is exercised by the route tests (mocked) and Task 10 (real).

- [ ] **Step 1: Write the DAL**

`src/lib/db/avatars.ts`:

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { patchToRow, rowToAvatar, type AvatarRow } from "@/lib/avatars/rows";
import type { Avatar } from "@/lib/avatars/schema";
import type { AvatarPatch } from "@/lib/avatars/utils";

// Every query filters on client_id as well as the avatar id. withClient authorises the CLIENT
// in the URL, not the avatar id beside it — without this one client could read or change
// another's avatar by guessing an id (the same reasoning as deleteBrandAsset).

export async function listAvatars(clientId: string): Promise<Avatar[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_avatars")
    .select("*")
    .eq("client_id", clientId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as AvatarRow[]).map(rowToAvatar);
}

export async function getAvatar(clientId: string, avatarId: string): Promise<Avatar | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_avatars")
    .select("*")
    .eq("id", avatarId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToAvatar(data as AvatarRow) : null;
}

export async function createDraftAvatar(args: {
  clientId: string;
  userId: string;
  name?: string;
  story?: string;
}): Promise<Avatar> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_avatars")
    .insert({
      client_id: args.clientId,
      created_by: args.userId,
      name: args.name ?? "",
      story: args.story ?? "",
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToAvatar(data as AvatarRow);
}

export async function updateAvatar(
  clientId: string,
  avatarId: string,
  patch: AvatarPatch,
): Promise<Avatar | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_avatars")
    .update({ ...patchToRow(patch), updated_at: new Date().toISOString() })
    .eq("id", avatarId)
    .eq("client_id", clientId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? rowToAvatar(data as AvatarRow) : null;
}

/** Archive, never delete (D287): a canvas that already uses the avatar keeps working.
 *  False when the avatar does not exist, belongs to another client, or is already archived. */
export async function archiveAvatar(clientId: string, avatarId: string): Promise<boolean> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_avatars")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", avatarId)
    .eq("client_id", clientId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/avatars.ts
git commit -m "feat(avatars): avatar data access, scoped to the client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Avatar routes — list, create, read, update, archive

**Files:**
- Create: `src/app/api/clients/[id]/avatars/route.ts`, `src/app/api/clients/[id]/avatars/[avatarId]/route.ts`
- Test: `src/app/api/clients/[id]/avatars/route.test.ts`, `src/app/api/clients/[id]/avatars/[avatarId]/route.test.ts`

**Interfaces:**
- Consumes: Task 4 DAL; `planAvatarUpdate` (Task 1); `withClient`, `withTryCatch`, `apiOk`, `apiError`; `resolveCallerContext` from `@/lib/dal`.
- Produces:
  - `GET /api/clients/:id/avatars` → `200 { avatars: Avatar[] }`
  - `POST /api/clients/:id/avatars` body `{ name?, story? }` → `201 { avatar }`
  - `GET /api/clients/:id/avatars/:avatarId` → `200 { avatar }` | `404`
  - `PATCH …/:avatarId` body `AvatarUpdateInput` → `200 { avatar }` | `400 { error }` | `404`
  - `DELETE …/:avatarId` → `200 { ok: true }` | `404`

- [ ] **Step 1: Write the failing collection test**

`src/app/api/clients/[id]/avatars/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({
  resolveCallerContext: vi.fn(),
  resolveOrgId: vi.fn(),
}));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ listAvatars: vi.fn(), createDraftAvatar: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { listAvatars, createDraftAvatar } from "@/lib/db/avatars";

const params = Promise.resolve({ id: "c1" });
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/clients/c1/avatars", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

describe("/api/clients/[id]/avatars", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-1", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  });

  it("GET lists the client's avatars", async () => {
    vi.mocked(listAvatars).mockResolvedValue([makeAvatar()]);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/clients/c1/avatars"), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).avatars).toHaveLength(1);
    expect(listAvatars).toHaveBeenCalledWith("c1");
  });

  it("GET is a 404 for a client in another org", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-2" } as never);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/clients/c1/avatars"), { params });
    expect(res.status).toBe(404);
    expect(listAvatars).not.toHaveBeenCalled();
  });

  it("POST creates a draft owned by the caller", async () => {
    vi.mocked(createDraftAvatar).mockResolvedValue(makeAvatar({ status: "draft" }));
    const { POST } = await import("./route");
    const res = await POST(post({ name: " Riya " }), { params });
    expect(res.status).toBe(201);
    expect(createDraftAvatar).toHaveBeenCalledWith({ clientId: "c1", userId: "user-1", name: "Riya" });
  });

  it("POST rejects a name over the limit", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ name: "x".repeat(61) }), { params });
    expect(res.status).toBe(400);
    expect(createDraftAvatar).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "src/app/api/clients/[id]/avatars/route.test.ts"`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Write the collection route**

`src/app/api/clients/[id]/avatars/route.ts`:

```ts
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { createDraftAvatar, listAvatars } from "@/lib/db/avatars";
import { AVATAR_NAME_MAX, AVATAR_STORY_MAX } from "@/lib/avatars/constants";

const CreateSchema = z.object({
  name: z.string().trim().max(AVATAR_NAME_MAX).optional(),
  story: z.string().trim().max(AVATAR_STORY_MAX).optional(),
});

// GET /api/clients/:id/avatars — the client's live avatars, drafts included.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the avatars.", async () =>
      apiOk({ avatars: await listAvatars(clientId) }),
    ),
  );
}

// POST /api/clients/:id/avatars — start a draft. Called by the Studio at the first upload,
// carrying whatever name and story were typed before it (D287).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not create the avatar.", async () => {
      const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) return apiError("Invalid request body.", 400);
      const caller = await resolveCallerContext();
      const avatar = await createDraftAvatar({ clientId, userId: caller.userId, ...parsed.data });
      return apiOk({ avatar }, 201);
    }),
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run "src/app/api/clients/[id]/avatars/route.test.ts"`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing item test**

`src/app/api/clients/[id]/avatars/[avatarId]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GENERATED, makeAvatar, makeImage } from "@/lib/avatars/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({
  getAvatar: vi.fn(), updateAvatar: vi.fn(), archiveAvatar: vi.fn(),
}));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar, updateAvatar, archiveAvatar } from "@/lib/db/avatars";

const params = Promise.resolve({ id: "c1", avatarId: "a1" });
const url = "http://localhost/api/clients/c1/avatars/a1";
const patch = (body: unknown) =>
  new NextRequest(url, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

describe("/api/clients/[id]/avatars/[avatarId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-9", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
    vi.mocked(updateAvatar).mockImplementation(async (_c, _a, p) => makeAvatar(p));
  });

  it("GET is a 404 for an avatar the client does not own", async () => {
    vi.mocked(getAvatar).mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(url), { params });
    expect(res.status).toBe(404);
    expect(getAvatar).toHaveBeenCalledWith("c1", "a1");
  });

  it("PATCH is a 404 for an archived avatar", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ archivedAt: "2026-10-01T00:00:00.000Z" }));
    const { PATCH } = await import("./route");
    expect((await PATCH(patch({ name: "x" }), { params })).status).toBe(404);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("PATCH records the declaration against the caller", async () => {
    vi.mocked(getAvatar).mockResolvedValue(
      makeAvatar({ status: "draft", personType: null, likenessConfirmedBy: null, likenessConfirmedAt: null }),
    );
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ declaration: { personType: "specific" } }), { params });
    expect(res.status).toBe(200);
    const written = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(written).toMatchObject({ personType: "specific", likenessConfirmedBy: "user-9" });
    expect(written.likenessConfirmedAt).toEqual(expect.any(String));
  });

  it("PATCH refuses a declaration on a generated front", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ front: makeImage(GENERATED) }));
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ declaration: { personType: "specific" } }), { params });
    expect(res.status).toBe(400);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("PATCH refuses ready while a part is missing, and says which", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ status: "draft", sheet: null }));
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ status: "ready" }), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Still needed: a profile sheet.");
  });

  it("PATCH rejects an unknown person type", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar());
    const { PATCH } = await import("./route");
    expect((await PATCH(patch({ declaration: { personType: "robot" } }), { params })).status).toBe(400);
  });

  it("DELETE archives, and is a 404 when there was nothing to archive", async () => {
    const { DELETE } = await import("./route");
    vi.mocked(archiveAvatar).mockResolvedValue(true);
    expect((await DELETE(new NextRequest(url, { method: "DELETE" }), { params })).status).toBe(200);
    expect(archiveAvatar).toHaveBeenCalledWith("c1", "a1");
    vi.mocked(archiveAvatar).mockResolvedValue(false);
    expect((await DELETE(new NextRequest(url, { method: "DELETE" }), { params })).status).toBe(404);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run "src/app/api/clients/[id]/avatars/[avatarId]/route.test.ts"`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 7: Write the item route**

`src/app/api/clients/[id]/avatars/[avatarId]/route.ts`:

```ts
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { archiveAvatar, getAvatar, updateAvatar } from "@/lib/db/avatars";
import { planAvatarUpdate } from "@/lib/avatars/utils";

type Ctx = { params: Promise<{ id: string; avatarId: string }> };

const NOT_FOUND = "Avatar not found.";

// Lengths are checked by planAvatarUpdate, which words the message for the operator.
const PatchSchema = z.object({
  name: z.string().optional(),
  story: z.string().optional(),
  declaration: z.object({ personType: z.enum(["generic", "specific"]) }).optional(),
  status: z.literal("ready").optional(),
});

// GET /api/clients/:id/avatars/:avatarId
export async function GET(req: Request, { params }: Ctx) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the avatar.", async () => {
      const avatar = await getAvatar(clientId, avatarId);
      // Missing or another client's: a 404 either way, never confirming a foreign id exists.
      if (!avatar) return apiError(NOT_FOUND, 404);
      return apiOk({ avatar });
    }),
  );
}

// PATCH /api/clients/:id/avatars/:avatarId — text fields, the person declaration, and ready.
// Images are changed by the images routes, never here.
export async function PATCH(req: Request, { params }: Ctx) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not save the avatar.", async () => {
      const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Invalid request body.", 400);

      const current = await getAvatar(clientId, avatarId);
      if (!current || current.archivedAt) return apiError(NOT_FOUND, 404);

      const caller = await resolveCallerContext();
      const plan = planAvatarUpdate(current, parsed.data, {
        userId: caller.userId,
        now: new Date().toISOString(),
      });
      if (!plan.ok) return apiError(plan.error, 400);

      const avatar = await updateAvatar(clientId, avatarId, plan.patch);
      if (!avatar) return apiError(NOT_FOUND, 404);
      return apiOk({ avatar });
    }),
  );
}

// DELETE /api/clients/:id/avatars/:avatarId — archives (D287).
export async function DELETE(req: Request, { params }: Ctx) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not archive the avatar.", async () => {
      const archived = await archiveAvatar(clientId, avatarId);
      if (!archived) return apiError(NOT_FOUND, 404);
      return apiOk({ ok: true as const });
    }),
  );
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run "src/app/api/clients/[id]/avatars"`
Expected: PASS, 11 tests.

- [ ] **Step 9: Commit**

```bash
git add "src/app/api/clients/[id]/avatars"
git commit -m "feat(avatars): avatar routes — list, create, read, update, archive (D287, D288)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Image upload routes

**Files:**
- Create: `src/app/api/clients/[id]/avatars/[avatarId]/images/sign/route.ts`, `src/app/api/clients/[id]/avatars/[avatarId]/images/route.ts`
- Test: `src/app/api/clients/[id]/avatars/[avatarId]/images/route.test.ts`

**Interfaces:**
- Consumes: `signAvatarImageUpload`, `publicUrlFor`, `removeObject` (`@/lib/storage`); Task 4 DAL; `validateAvatarImageFile`, `frontChangePatch`, `sheetChangePatch`, `withStatus` (Task 1).
- Produces:
  - `POST …/images/sign` body `{ filename, contentType, size, slot }` → `200 { signedUrl, path, url }` | `400` | `404`
  - `POST …/images` body `{ path, filename, size, slot, imageWidth?, imageHeight? }` → `200 { avatar }` | `400` | `404`. This is the body `uploadViaSignedUrl` sends, plus `slot` and the dimensions from `finalizeBody`.

- [ ] **Step 1: Write the failing test**

`src/app/api/clients/[id]/avatars/[avatarId]/images/route.test.ts` (covers both routes):

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GENERATED, makeAvatar, makeImage } from "@/lib/avatars/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn(), updateAvatar: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  signAvatarImageUpload: vi.fn(),
  removeObject: vi.fn(),
  publicUrlFor: (path: string) => `https://storage.googleapis.com/b/${path}`,
}));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { signAvatarImageUpload, removeObject } from "@/lib/storage";

const params = Promise.resolve({ id: "c1", avatarId: "a1" });
const req = (path: string, body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/avatars/a1/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const FRONT_PATH = "clients/c1/avatars/a1/front/new__t.png";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-9", orgId: "org-1" } as never);
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar());
  vi.mocked(updateAvatar).mockImplementation(async (_c, _a, p) => makeAvatar(p));
});

describe("POST images/sign", () => {
  it("signs a valid image for the avatar's slot", async () => {
    vi.mocked(signAvatarImageUpload).mockResolvedValue({ signedUrl: "s", path: FRONT_PATH, url: "u" });
    const { POST } = await import("./sign/route");
    const res = await POST(
      req("images/sign", { filename: "new.png", contentType: "image/png", size: 100, slot: "front" }),
      { params },
    );
    expect(res.status).toBe(200);
    expect(signAvatarImageUpload).toHaveBeenCalledWith({
      clientId: "c1", avatarId: "a1", slot: "front", filename: "new.png", contentType: "image/png",
    });
  });

  it("rejects an unsupported type before signing", async () => {
    const { POST } = await import("./sign/route");
    const res = await POST(
      req("images/sign", { filename: "new.gif", contentType: "image/gif", size: 100, slot: "front" }),
      { params },
    );
    expect(res.status).toBe(400);
    expect(signAvatarImageUpload).not.toHaveBeenCalled();
  });

  it("is a 404 for an avatar the client does not own", async () => {
    vi.mocked(getAvatar).mockResolvedValue(null);
    const { POST } = await import("./sign/route");
    const res = await POST(
      req("images/sign", { filename: "new.png", contentType: "image/png", size: 100, slot: "front" }),
      { params },
    );
    expect(res.status).toBe(404);
  });
});

describe("POST images (finalize)", () => {
  const body = { path: FRONT_PATH, filename: "new.png", size: 100, slot: "front", imageWidth: 900, imageHeight: 1200 };

  it("refuses a path outside this avatar's slot folder", async () => {
    const { POST } = await import("./route");
    const foreign = { ...body, path: "clients/c2/avatars/a9/front/x.png" };
    expect((await POST(req("images", foreign), { params })).status).toBe(400);
    const wrongSlot = { ...body, path: "clients/c1/avatars/a1/sheet/x.png" };
    expect((await POST(req("images", wrongSlot), { params })).status).toBe(400);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("a new front records its source, clears the declaration, stales the sheet and returns to draft", async () => {
    const { POST } = await import("./route");
    const res = await POST(req("images", body), { params });
    expect(res.status).toBe(200);
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.front).toMatchObject({
      url: `https://storage.googleapis.com/b/${FRONT_PATH}`, width: 900, height: 1200, sizeBytes: 100,
      source: { kind: "upload", filename: "new.png", uploadedBy: "user-9" },
    });
    expect(patch).toMatchObject({
      sheetStale: true, personType: null, likenessConfirmedAt: null, status: "draft",
    });
  });

  it("removes the uploaded image it replaces, but never a generated one", async () => {
    const { POST } = await import("./route");
    await POST(req("images", body), { params });
    expect(removeObject).toHaveBeenCalledTimes(1);

    vi.mocked(removeObject).mockClear();
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ front: makeImage(GENERATED) }));
    await POST(req("images", body), { params });
    expect(removeObject).not.toHaveBeenCalled();
  });

  it("a new sheet is current", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ sheetStale: true, status: "draft" }));
    const { POST } = await import("./route");
    await POST(req("images", { ...body, slot: "sheet", path: "clients/c1/avatars/a1/sheet/s.png" }), { params });
    expect(vi.mocked(updateAvatar).mock.calls[0][2]).toMatchObject({ sheetStale: false });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run "src/app/api/clients/[id]/avatars/[avatarId]/images"`
Expected: FAIL — cannot resolve `./sign/route`.

- [ ] **Step 3: Write the sign route**

`src/app/api/clients/[id]/avatars/[avatarId]/images/sign/route.ts`:

```ts
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getAvatar } from "@/lib/db/avatars";
import { signAvatarImageUpload } from "@/lib/storage";
import { validateAvatarImageFile } from "@/lib/avatars/utils";

const SignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().optional(),
  size: z.number().nonnegative(),
  slot: z.enum(["front", "sheet"]),
});

// POST /api/clients/:id/avatars/:avatarId/images/sign — validate, then hand back a signed URL
// for a direct browser -> GCS upload. Bytes never pass through the app.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not authorize the upload.", async () => {
      const parsed = SignSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Invalid request body.", 400);
      const { filename, contentType, size, slot } = parsed.data;

      const invalid = validateAvatarImageFile({ name: filename, size });
      if (invalid) return apiError(invalid, 400);

      const avatar = await getAvatar(clientId, avatarId);
      if (!avatar || avatar.archivedAt) return apiError("Avatar not found.", 404);

      const signed = await signAvatarImageUpload({
        clientId, avatarId, slot, filename,
        contentType: contentType || "application/octet-stream",
      });
      return apiOk(signed);
    }),
  );
}
```

- [ ] **Step 4: Write the finalize route**

`src/app/api/clients/[id]/avatars/[avatarId]/images/route.ts`:

```ts
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { publicUrlFor, removeObject } from "@/lib/storage";
import { frontChangePatch, sheetChangePatch, withStatus } from "@/lib/avatars/utils";
import type { AvatarImage } from "@/lib/avatars/schema";

const FinalizeSchema = z.object({
  path: z.string().min(1),
  filename: z.string().min(1),
  size: z.number().nonnegative(),
  slot: z.enum(["front", "sheet"]),
  imageWidth: z.number().positive().optional(),
  imageHeight: z.number().positive().optional(),
});

// POST /api/clients/:id/avatars/:avatarId/images — record an image the browser has already
// uploaded. Takes the storage PATH, never a URL, and checks it sits in this avatar's own slot
// folder: a caller-supplied URL would let one client record, and later delete, another
// client's object (the same guard as brand-kit/assets).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not save the image.", async () => {
      const parsed = FinalizeSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Invalid request body.", 400);
      const { path, filename, size, slot, imageWidth, imageHeight } = parsed.data;

      if (!path.startsWith(`clients/${clientId}/avatars/${avatarId}/${slot}/`)) {
        return apiError("Upload path does not belong to this avatar.", 400);
      }

      const current = await getAvatar(clientId, avatarId);
      if (!current || current.archivedAt) return apiError("Avatar not found.", 404);

      const caller = await resolveCallerContext();
      const image: AvatarImage = {
        url: publicUrlFor(path),
        width: imageWidth ?? null,
        height: imageHeight ?? null,
        sizeBytes: size,
        source: {
          kind: "upload",
          filename,
          uploadedBy: caller.userId,
          uploadedAt: new Date().toISOString(),
        },
      };

      const change = slot === "front" ? frontChangePatch(current, image) : sheetChangePatch(image);
      const avatar = await updateAvatar(clientId, avatarId, withStatus(current, change));
      if (!avatar) return apiError("Avatar not found.", 404);

      // Only an UPLOAD is removed when replaced. A generated image (plan 2) still belongs to
      // the batch it came from, which keeps showing it.
      const replaced = current[slot];
      if (replaced?.source.kind === "upload") {
        try {
          await removeObject(replaced.url);
        } catch {
          // Best-effort, as deleteBrandAsset: an orphaned blob beats a failed save.
        }
      }
      return apiOk({ avatar });
    }),
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run "src/app/api/clients/[id]/avatars"`
Expected: PASS, 18 tests.

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/clients/[id]/avatars"
git commit -m "feat(avatars): signed image upload for the front image and profile sheet (D288)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Browser service and Studio hook

**Files:**
- Create: `src/services/avatars.service.ts`, `src/hooks/use-avatar-studio.ts`

**Interfaces:**
- Consumes: Task 5 and 6 routes; `uploadViaSignedUrl`, `readImageSize`; `useDebouncedCallback`; `avatarReadinessGaps`, `validateAvatarImageFile`, `AvatarUpdateInput`, `ReadinessGap` (Task 1).
- Produces:
  - `avatarsService.list(clientId)`, `.create(clientId, fields)`, `.update(clientId, avatarId, input)`, `.archive(clientId, avatarId)`, `.uploadImage(clientId, avatarId, slot, file)` — each resolves to `Avatar` (or `Avatar[]` / `void`) and throws an `Error` whose message is user-facing.
  - `useAvatarStudio({ clientId, clientSlug, initialAvatar })` → `{ avatar, name, story, gaps, uploading, saving, setName, setStory, uploadImage, declare, markReady, archive }` where `uploading: AvatarImageSlot | null`, `gaps: ReadinessGap[]`, `uploadImage(slot, file)`, `declare(personType)`.

There is no DOM test environment (vitest runs in node), so this task is checked by typecheck and lint here and by Task 10 in the browser.

- [ ] **Step 1: Write the service**

`src/services/avatars.service.ts`:

```ts
import { readImageSize, uploadViaSignedUrl } from "@/lib/uploads/client";
import type { Avatar, AvatarImageSlot } from "@/lib/avatars/schema";
import type { AvatarUpdateInput } from "@/lib/avatars/utils";

async function readJson<T>(res: Response, fallback: string): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? fallback);
  return json as T;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

class AvatarsService {
  async list(clientId: string): Promise<Avatar[]> {
    const res = await fetch(`/api/clients/${clientId}/avatars`);
    return (await readJson<{ avatars: Avatar[] }>(res, "Could not load the avatars.")).avatars;
  }

  async create(clientId: string, fields: { name?: string; story?: string }): Promise<Avatar> {
    const res = await fetch(`/api/clients/${clientId}/avatars`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify(fields),
    });
    return (await readJson<{ avatar: Avatar }>(res, "Could not create the avatar.")).avatar;
  }

  async update(clientId: string, avatarId: string, input: AvatarUpdateInput): Promise<Avatar> {
    const res = await fetch(`/api/clients/${clientId}/avatars/${avatarId}`, {
      method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(input),
    });
    return (await readJson<{ avatar: Avatar }>(res, "Could not save the avatar.")).avatar;
  }

  async archive(clientId: string, avatarId: string): Promise<void> {
    const res = await fetch(`/api/clients/${clientId}/avatars/${avatarId}`, { method: "DELETE" });
    await readJson(res, "Could not archive the avatar.");
  }

  /** Signs, PUTs straight to GCS, then records the image — the flow Brand Kit uses. */
  async uploadImage(
    clientId: string,
    avatarId: string,
    slot: AvatarImageSlot,
    file: File,
  ): Promise<Avatar> {
    const base = `/api/clients/${clientId}/avatars/${avatarId}/images`;
    const { avatar } = await uploadViaSignedUrl<{ avatar: Avatar }>(file, {
      signEndpoint: `${base}/sign`,
      finalizeEndpoint: base,
      signBody: { slot },
      finalizeBody: { slot, ...(await readImageSize(file)) },
    });
    return avatar;
  }
}

export const avatarsService = new AvatarsService();
```

- [ ] **Step 2: Write the hook**

`src/hooks/use-avatar-studio.ts`:

```ts
"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { avatarsService } from "@/services/avatars.service";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { avatarReadinessGaps, validateAvatarImageFile } from "@/lib/avatars/utils";
import type { Avatar, AvatarImageSlot, PersonType } from "@/lib/avatars/schema";

const SAVE_DELAY_MS = 600;
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

// D287 — the Avatar Studio's state. `initialAvatar` is null on /avatars/new: no row exists until
// the first upload, which creates the draft (carrying the name and story typed so far) and then
// moves the URL to /avatars/<id> so a reload resumes the same draft.
export function useAvatarStudio({
  clientId, clientSlug, initialAvatar,
}: { clientId: string; clientSlug: string; initialAvatar: Avatar | null }) {
  const router = useRouter();
  const [avatar, setAvatar] = useState<Avatar | null>(initialAvatar);
  const [name, setNameState] = useState(initialAvatar?.name ?? "");
  const [story, setStoryState] = useState(initialAvatar?.story ?? "");
  const [uploading, setUploading] = useState<AvatarImageSlot | null>(null);
  const [saving, setSaving] = useState(false);
  const createdHere = useRef(false);
  const libraryHref = `/clients/${clientSlug}/avatars`;

  // Typing alone never creates a draft; it is saved once the avatar exists.
  const saveFields = useDebouncedCallback((fields: { name: string; story: string }) => {
    if (!avatar) return;
    avatarsService.update(clientId, avatar.id, fields).then(setAvatar).catch((e) => {
      toast.error(message(e, "Could not save"));
    });
  }, SAVE_DELAY_MS);

  const setName = useCallback((next: string) => {
    setNameState(next);
    saveFields({ name: next, story });
  }, [saveFields, story]);

  const setStory = useCallback((next: string) => {
    setStoryState(next);
    saveFields({ name, story: next });
  }, [saveFields, name]);

  const uploadImage = useCallback(async (slot: AvatarImageSlot, file: File) => {
    const invalid = validateAvatarImageFile(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(slot);
    try {
      let target = avatar;
      if (!target) {
        target = await avatarsService.create(clientId, { name, story });
        createdHere.current = true;
        setAvatar(target);
      }
      setAvatar(await avatarsService.uploadImage(clientId, target.id, slot, file));
      if (createdHere.current) {
        createdHere.current = false;
        router.replace(`${libraryHref}/${target.id}`);
      }
    } catch (e) {
      toast.error(message(e, "Upload failed"));
    } finally {
      setUploading(null);
    }
  }, [avatar, clientId, name, story, router, libraryHref]);

  const declare = useCallback(async (personType: PersonType) => {
    if (!avatar) return;
    try {
      setAvatar(await avatarsService.update(clientId, avatar.id, { declaration: { personType } }));
    } catch (e) {
      toast.error(message(e, "Could not save the declaration"));
    }
  }, [avatar, clientId]);

  const markReady = useCallback(async () => {
    if (!avatar) return;
    setSaving(true);
    try {
      await avatarsService.update(clientId, avatar.id, { name, story, status: "ready" });
      toast.success("Avatar saved");
      router.push(libraryHref);
    } catch (e) {
      toast.error(message(e, "Could not save the avatar"));
    } finally {
      setSaving(false);
    }
  }, [avatar, clientId, name, story, router, libraryHref]);

  const archive = useCallback(async () => {
    if (!avatar) return;
    try {
      await avatarsService.archive(clientId, avatar.id);
      router.push(libraryHref);
    } catch (e) {
      toast.error(message(e, "Could not archive the avatar"));
    }
  }, [avatar, clientId, router, libraryHref]);

  // `name` comes from local state so the list updates as the operator types.
  const gaps = avatarReadinessGaps({
    name,
    front: avatar?.front ?? null,
    sheet: avatar?.sheet ?? null,
    sheetStale: avatar?.sheetStale ?? false,
    personType: avatar?.personType ?? null,
    likenessConfirmedAt: avatar?.likenessConfirmedAt ?? null,
  });

  return {
    avatar, name, story, gaps, uploading, saving,
    setName, setStory, uploadImage, declare, markReady, archive,
  };
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/services/avatars.service.ts src/hooks/use-avatar-studio.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/avatars.service.ts src/hooks/use-avatar-studio.ts
git commit -m "feat(avatars): browser service and Studio state hook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Library page and navigation

**Files:**
- Create: `src/components/avatars/avatar-tile.tsx`, `src/components/avatars/avatars-library.tsx`, `src/app/clients/[id]/avatars/page.tsx`
- Modify: `src/components/clients/client-settings-menu.tsx`

**Interfaces:**
- Consumes: `listAvatars` (Task 4), `Avatar`, `PERSON_TYPE_LABELS`.
- Produces: `<AvatarTile avatar clientSlug />`, `<AvatarsLibrary clientName clientSlug avatars />`, the page at `/clients/<slug>/avatars`.

- [ ] **Step 1: Read the Next.js page guide**

Read `node_modules/next/dist/docs/01-app/` for server pages, `params` and `redirect`, then re-read `src/app/clients/[id]/market/page.tsx` — the new page follows it exactly (slug lookup, org guard, breadcrumb).

- [ ] **Step 2: Write the tile**

`src/components/avatars/avatar-tile.tsx`:

```tsx
import Link from "next/link";
import { AudioLines, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PERSON_TYPE_LABELS } from "@/lib/avatars/constants";
import type { Avatar } from "@/lib/avatars/schema";

// D287 — one square library tile: the face, with the name and voice on a soft gradient over it.
// A plain Link, like the rows of canvases-table.tsx; the whole tile is the target.
export function AvatarTile({ avatar, clientSlug }: { avatar: Avatar; clientSlug: string }) {
  return (
    <Link
      href={`/clients/${clientSlug}/avatars/${avatar.id}`}
      aria-label={`Open ${avatar.name || "untitled avatar"}`}
      className="group relative block aspect-square overflow-hidden rounded-xl border bg-muted shadow-card outline-none transition-transform duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {avatar.front ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar.front.url}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full items-center justify-center">
          <UserRound className="size-8 text-muted-foreground/50" strokeWidth={1.5} />
        </span>
      )}

      <span className="absolute left-1.5 top-1.5 flex flex-col items-start gap-1">
        {avatar.status === "draft" && <Badge className="bg-card">Draft</Badge>}
        {avatar.personType === "specific" && (
          <Badge className="bg-card">{PERSON_TYPE_LABELS.specific}</Badge>
        )}
      </span>

      <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-foreground/75 to-transparent px-2 pb-1.5 pt-6 text-background">
        <span className="truncate text-xs font-semibold">{avatar.name || "Untitled"}</span>
        <span className="flex items-center gap-1 truncate text-[0.65rem] opacity-85">
          {avatar.voice ? (
            <>
              <AudioLines className="size-3 shrink-0" strokeWidth={1.5} />
              <span className="truncate">{avatar.voice.name}</span>
            </>
          ) : (
            "No voice"
          )}
        </span>
      </span>
    </Link>
  );
}
```

- [ ] **Step 3: Write the library**

`src/components/avatars/avatars-library.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { PERSON_TYPE_LABELS } from "@/lib/avatars/constants";
import type { Avatar, PersonType } from "@/lib/avatars/schema";
import { AvatarTile } from "./avatar-tile";

type Filter = "all" | PersonType;

// D287 — the client's avatar library: an 8-across grid led by a dashed "New" tile.
export function AvatarsLibrary({
  clientName, clientSlug, avatars,
}: { clientName: string; clientSlug: string; avatars: Avatar[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const newHref = `/clients/${clientSlug}/avatars/new`;
  const shown = filter === "all" ? avatars : avatars.filter((a) => a.personType === filter);

  return (
    <section className="animate-rise mt-4">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <p className="text-eyebrow text-muted-foreground">{clientName}</p>
          <h1 className="font-display text-4xl font-semibold tracking-[-0.02em]">Avatars</h1>
        </div>
        <Button nativeButton={false} render={<Link href={newHref} />}>
          <Plus className="size-4" strokeWidth={1.5} />
          New avatar
        </Button>
      </header>

      {avatars.length === 0 ? (
        <EmptyState
          title="No avatars yet"
          body="An avatar is a reusable character for this client: a front image, a profile sheet and a voice, made once and used across videos."
          action={
            <Button nativeButton={false} render={<Link href={newHref} />}>
              + New avatar
            </Button>
          }
        />
      ) : (
        <>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mb-4">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="generic">{PERSON_TYPE_LABELS.generic}</TabsTrigger>
              <TabsTrigger value="specific">{PERSON_TYPE_LABELS.specific}</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={newHref} />}
              className="aspect-square h-auto flex-col gap-1 rounded-xl border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
            >
              <Plus className="size-5" strokeWidth={1.5} />
              <span className="text-xs font-semibold">New</span>
            </Button>
            {shown.map((avatar) => (
              <AvatarTile key={avatar.id} avatar={avatar} clientSlug={clientSlug} />
            ))}
          </div>

          {shown.length === 0 && (
            <p className="mt-6 text-sm text-muted-foreground">No avatars of this type yet.</p>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Write the page**

`src/app/clients/[id]/avatars/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { listAvatars } from "@/lib/db/avatars";
import { resolveOrgId } from "@/lib/dal";
import { AvatarsLibrary } from "@/components/avatars/avatars-library";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";

export default async function AvatarsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // `id` is the client slug
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();

  // Org isolation: a client outside the caller's org redirects the same as a nonexistent
  // one — mirrors the Market page's guard.
  if (!client || client.org_id !== effectiveOrgId) redirect("/");

  const avatars = await listAvatars(client.id);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <Breadcrumb className="animate-rise shrink-0">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/">Clients</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/clients/${client.slug}`}>{client.name}</Link>} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Avatars</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <AvatarsLibrary clientName={client.name} clientSlug={client.slug} avatars={avatars} />
    </main>
  );
}
```

- [ ] **Step 5: Add the navigation link**

In `src/components/clients/client-settings-menu.tsx`:

Change the icon import to:

```tsx
import { BookOpen, Globe, Settings, UserRound } from "lucide-react";
```

Replace the doc comment above `ClientSettingsMenu` with:

```tsx
/**
 * Entry point to the client's setup surfaces: its knowledge (Brand KB, Market) and its
 * avatars. They are separate pages, not views of one page, so they are reached from here
 * rather than from a tab strip — tabs would promise in-place switching that a route change
 * doesn't deliver.
 */
```

Add a third entry to `items`, after the Market entry:

```tsx
    {
      href: `/clients/${slug}/avatars`,
      icon: UserRound,
      label: "Avatars",
      hint: "Reusable characters and voices",
    },
```

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/avatars "src/app/clients/[id]/avatars" src/components/clients/client-settings-menu.tsx`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/avatars "src/app/clients/[id]/avatars" src/components/clients/client-settings-menu.tsx
git commit -m "feat(avatars): Avatars library page and Settings link (D287)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Avatar Studio

**Files:**
- Create: `src/components/avatars/avatar-image-dropzone.tsx`, `src/components/avatars/avatar-likeness-declaration.tsx`, `src/components/avatars/avatar-studio-card.tsx`, `src/components/avatars/avatar-archive-button.tsx`, `src/components/avatars/avatar-studio.tsx`, `src/app/clients/[id]/avatars/new/page.tsx`, `src/app/clients/[id]/avatars/[avatarId]/page.tsx`

**Interfaces:**
- Consumes: `useAvatarStudio` (Task 7); `getAvatar` (Task 4); constants and types (Task 1); `formatDate` from `@/lib/kb/utils`.
- Produces: `<AvatarStudio clientId clientSlug clientName initialAvatar />` and the two Studio pages. Plan 2 adds a Describe tab inside the Look panel and a Generate control beside the sheet dropzone; plan 3 adds the Voice step. The step list here is `look | sheet`.

- [ ] **Step 1: Write the dropzone**

`src/components/avatars/avatar-image-dropzone.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AVATAR_IMAGE_ACCEPT, AVATAR_IMAGE_MAX_LABEL } from "@/lib/avatars/constants";
import type { AvatarImage } from "@/lib/avatars/schema";

type Props = {
  /** "Add a front image" — also the accessible name of the empty control. */
  label: string;
  hint: string;
  /** CSS aspect-ratio of the box. Empty, loading and filled states all use it, so nothing
   *  moves between the placeholder and the finished image. */
  aspect: string;
  image: AvatarImage | null;
  uploading: boolean;
  onFile: (file: File) => void;
};

// One image slot of the Studio: a dashed primary "add" area, a same-size loading placeholder,
// then the image with a Replace action. Click, or drop a file on it.
export function AvatarImageDropzone({ label, hint, aspect, image, uploading, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = () => inputRef.current?.click();

  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-xl", over && "ring-3 ring-ring/50")}
      style={{ aspectRatio: aspect }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      {uploading ? (
        <Skeleton className="size-full rounded-xl" />
      ) : image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={label} className="size-full rounded-xl border object-cover" />
          <Button variant="outline" size="sm" className="absolute bottom-2 right-2 bg-card" onClick={pick}>
            Replace
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          aria-label={label}
          onClick={pick}
          className="size-full flex-col gap-1.5 whitespace-normal rounded-xl border-dashed border-primary/40 text-primary hover:bg-primary/5 hover:text-primary"
        >
          <ImagePlus className="size-5" strokeWidth={1.5} />
          <span className="text-sm font-semibold">{label}</span>
          <span className="text-xs font-normal text-muted-foreground">{hint}</span>
          <span className="text-xs font-normal text-muted-foreground">
            png, jpg or webp · up to {AVATAR_IMAGE_MAX_LABEL}
          </span>
        </Button>
      )}

      <Input
        ref={inputRef}
        type="file"
        accept={AVATAR_IMAGE_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Write the declaration**

`src/components/avatars/avatar-likeness-declaration.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/kb/utils";
import { LIKENESS_STATEMENTS, PERSON_TYPE_LABELS } from "@/lib/avatars/constants";
import type { Avatar, PersonType } from "@/lib/avatars/schema";

const ANSWERS: { value: PersonType; label: string }[] = [
  { value: "specific", label: "Yes, a real person" },
  { value: "generic", label: "No, a fictional character" },
];

// D288 — shown for an uploaded front image. The operator says whether it is a real person and
// ticks the matching statement; the server records who confirmed it and when.
export function AvatarLikenessDeclaration({
  avatar, onDeclare,
}: { avatar: Avatar; onDeclare: (personType: PersonType) => void }) {
  const confirmed = Boolean(avatar.personType && avatar.likenessConfirmedAt);
  const [editing, setEditing] = useState(!confirmed);
  const [answer, setAnswer] = useState<PersonType | null>(avatar.personType);
  const [ticked, setTicked] = useState(false);

  if (confirmed && !editing && avatar.personType && avatar.likenessConfirmedAt) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <Check className="size-4 text-primary" strokeWidth={1.5} />
          {PERSON_TYPE_LABELS[avatar.personType]} · confirmed {formatDate(avatar.likenessConfirmedAt)}
        </span>
        <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setEditing(true)}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <p className="text-sm font-medium">Is this a real person?</p>
      <div className="flex flex-wrap gap-2">
        {ANSWERS.map((a) => (
          <Button
            key={a.value}
            variant="outline"
            size="sm"
            aria-pressed={answer === a.value}
            onClick={() => {
              setAnswer(a.value);
              setTicked(false);
            }}
            className={cn(
              answer === a.value &&
                "border-primary/50 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary",
            )}
          >
            {a.label}
          </Button>
        ))}
      </div>
      {answer && (
        <>
          <div className="flex items-start gap-2">
            <Checkbox
              id="avatar-likeness-tick"
              checked={ticked}
              onCheckedChange={(v) => setTicked(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="avatar-likeness-tick" className="text-sm font-normal leading-snug">
              {LIKENESS_STATEMENTS[answer]}
            </Label>
          </div>
          <Button
            size="sm"
            className="self-start"
            disabled={!ticked}
            onClick={() => {
              onDeclare(answer);
              setEditing(false);
              setTicked(false);
            }}
          >
            Confirm
          </Button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write the archive button**

`src/components/avatars/avatar-archive-button.tsx`:

```tsx
"use client";

import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// D287 — deleting an avatar archives it. The dialog says what that means, because "gone from
// the library" and "still works where it is already used" are both true.
export function AvatarArchiveButton({ name, onArchive }: { name: string; onArchive: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <Archive className="size-3.5" strokeWidth={1.5} />
            Archive avatar
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {name || "this avatar"}?</AlertDialogTitle>
          <AlertDialogDescription>
            It leaves the library and can no longer be picked. Anything that already uses it keeps
            working.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onArchive}>Archive</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 4: Write the avatar card**

`src/components/avatars/avatar-studio-card.tsx`:

```tsx
"use client";

import { Check, Circle, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AVATAR_NAME_MAX, AVATAR_STORY_MAX, READINESS_GAP_LABELS } from "@/lib/avatars/constants";
import type { Avatar } from "@/lib/avatars/schema";
import type { ReadinessGap } from "@/lib/avatars/utils";
import { AvatarArchiveButton } from "./avatar-archive-button";

type Props = {
  avatar: Avatar | null;
  name: string;
  story: string;
  gaps: ReadinessGap[];
  saving: boolean;
  onName: (value: string) => void;
  onStory: (value: string) => void;
  onSave: () => void;
  onArchive: () => void;
};

function Row({ done, label, detail }: { done: boolean; label: string; detail: string }) {
  const Icon = done ? Check : Circle;
  return (
    <li className="flex items-center gap-2.5 border-b py-2 text-sm last:border-b-0">
      <Icon
        className={done ? "size-4 text-primary" : "size-4 text-muted-foreground/50"}
        strokeWidth={1.5}
      />
      <span className="flex-1">{label}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </li>
  );
}

// The Studio's right-hand card: what the avatar is so far, its name and story, and Save. It
// fills in as the steps are completed, so the operator always sees what they are saving.
export function AvatarStudioCard({
  avatar, name, story, gaps, saving, onName, onStory, onSave, onArchive,
}: Props) {
  const has = (gap: ReadinessGap) => !gaps.includes(gap);
  const uploadedFront = avatar?.front?.source.kind === "upload";

  return (
    <Card className="sticky top-6 flex flex-col gap-3 self-start p-4 shadow-card">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {avatar?.front ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar.front.url} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center">
            <UserRound className="size-10 text-muted-foreground/40" strokeWidth={1.5} />
          </span>
        )}
        {avatar?.status === "ready" && (
          <Badge className="absolute left-2 top-2 bg-card">Ready</Badge>
        )}
      </div>

      <ul>
        <Row done={has("front")} label="Front image" detail={has("front") ? "Added" : "Needed"} />
        <Row
          done={has("sheet") && has("sheet-stale")}
          label="Profile sheet"
          detail={!has("sheet") ? "Needed" : !has("sheet-stale") ? "Out of date" : "Added"}
        />
        {uploadedFront && (
          <Row
            done={has("declaration")}
            label="Person declaration"
            detail={has("declaration") ? "Confirmed" : "Needed"}
          />
        )}
      </ul>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="avatar-name">Name</Label>
        <Input
          id="avatar-name"
          value={name}
          maxLength={AVATAR_NAME_MAX}
          placeholder="e.g. Riya"
          onChange={(e) => onName(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="avatar-story">Background story (optional)</Label>
        <Textarea
          id="avatar-story"
          value={story}
          maxLength={AVATAR_STORY_MAX}
          rows={4}
          placeholder="Who they are, how they speak, what they care about"
          onChange={(e) => onStory(e.target.value)}
        />
      </div>

      <Button disabled={gaps.length > 0 || saving} onClick={onSave}>
        {saving ? "Saving…" : "Save avatar"}
      </Button>
      {gaps.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Still needed: {gaps.map((g) => READINESS_GAP_LABELS[g]).join(", ")}.
        </p>
      )}

      {avatar && <AvatarArchiveButton name={name} onArchive={onArchive} />}
    </Card>
  );
}
```

- [ ] **Step 5: Write the Studio**

`src/components/avatars/avatar-studio.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAvatarStudio } from "@/hooks/use-avatar-studio";
import type { Avatar } from "@/lib/avatars/schema";
import { AvatarImageDropzone } from "./avatar-image-dropzone";
import { AvatarLikenessDeclaration } from "./avatar-likeness-declaration";
import { AvatarStudioCard } from "./avatar-studio-card";

type Step = "look" | "sheet";

type Props = {
  clientId: string;
  clientSlug: string;
  clientName: string;
  initialAvatar: Avatar | null;
};

// D287 — the Avatar Studio: a full page. The steps are on the left, the avatar card on the
// right. Plan 2 adds Describe to the Look step and generation to the sheet step; plan 3 adds
// the Voice step.
export function AvatarStudio({ clientId, clientSlug, clientName, initialAvatar }: Props) {
  const s = useAvatarStudio({ clientId, clientSlug, initialAvatar });
  // Open on the step that still needs work.
  const [step, setStep] = useState<Step>(
    initialAvatar?.front && (!initialAvatar.sheet || initialAvatar.sheetStale) ? "sheet" : "look",
  );
  const front = s.avatar?.front ?? null;

  return (
    <section className="animate-rise mt-4">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href={`/clients/${clientSlug}/avatars`} />}
        >
          <ChevronLeft className="size-4" strokeWidth={1.5} />
          Avatars
        </Button>
        <div>
          <p className="text-eyebrow text-muted-foreground">{clientName}</p>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.01em]">
            {s.name.trim() || (initialAvatar ? "Untitled avatar" : "New avatar")}
          </h1>
        </div>
        <Tabs value={step} onValueChange={(v) => setStep(v as Step)} className="ml-auto">
          <TabsList>
            <TabsTrigger value="look">1 · Look</TabsTrigger>
            <TabsTrigger value="sheet" disabled={!front}>2 · Profile sheet</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card className="flex flex-col gap-4 p-5 shadow-card">
          {step === "look" ? (
            <>
              <div>
                <p className="text-eyebrow text-muted-foreground">Front image</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Facing the camera, waist-up, even light, plain background.
                </p>
              </div>
              <div className="w-full max-w-xs">
                <AvatarImageDropzone
                  label="Add a front image"
                  hint="Click, or drop a photo here"
                  aspect="3 / 4"
                  image={front}
                  uploading={s.uploading === "front"}
                  onFile={(file) => s.uploadImage("front", file)}
                />
              </div>
              {s.avatar && front?.source.kind === "upload" && (
                // Keyed on the image: a replaced photo starts the question again.
                <AvatarLikenessDeclaration key={front.url} avatar={s.avatar} onDeclare={s.declare} />
              )}
              {front && (
                <Button variant="outline" className="self-start" onClick={() => setStep("sheet")}>
                  Continue to profile sheet
                </Button>
              )}
            </>
          ) : (
            <>
              <div>
                <p className="text-eyebrow text-muted-foreground">Profile sheet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Front, three-quarter, side and back views of the same person, in one image.
                </p>
              </div>
              {s.avatar?.sheetStale && (
                <p className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                  The front image changed. Replace the sheet so it shows the same person.
                </p>
              )}
              <AvatarImageDropzone
                label="Add a profile sheet"
                hint="Click, or drop the sheet here"
                aspect="16 / 9"
                image={s.avatar?.sheet ?? null}
                uploading={s.uploading === "sheet"}
                onFile={(file) => s.uploadImage("sheet", file)}
              />
            </>
          )}
        </Card>

        <AvatarStudioCard
          avatar={s.avatar}
          name={s.name}
          story={s.story}
          gaps={s.gaps}
          saving={s.saving}
          onName={s.setName}
          onStory={s.setStory}
          onSave={s.markReady}
          onArchive={s.archive}
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Write the "new" page**

`src/app/clients/[id]/avatars/new/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { resolveOrgId } from "@/lib/dal";
import { AvatarStudio } from "@/components/avatars/avatar-studio";

export const dynamic = "force-dynamic";

// No avatar row exists yet: the Studio creates the draft at the first upload (D287).
export default async function NewAvatarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // `id` is the client slug
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();
  if (!client || client.org_id !== effectiveOrgId) redirect("/");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <AvatarStudio
        clientId={client.id}
        clientSlug={client.slug}
        clientName={client.name}
        initialAvatar={null}
      />
    </main>
  );
}
```

- [ ] **Step 7: Write the edit page**

`src/app/clients/[id]/avatars/[avatarId]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getClientBySlug } from "@/lib/db/clients";
import { getAvatar } from "@/lib/db/avatars";
import { resolveOrgId } from "@/lib/dal";
import { AvatarStudio } from "@/components/avatars/avatar-studio";

export const dynamic = "force-dynamic";

export default async function AvatarPage({
  params,
}: {
  params: Promise<{ id: string; avatarId: string }>;
}) {
  const { id, avatarId } = await params; // `id` is the client slug
  const client = await getClientBySlug(id);
  const effectiveOrgId = await resolveOrgId();
  if (!client || client.org_id !== effectiveOrgId) redirect("/");

  // Missing, another client's, or archived: back to the library, never confirming it exists.
  const avatar = await getAvatar(client.id, avatarId);
  if (!avatar || avatar.archivedAt) redirect(`/clients/${client.slug}/avatars`);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      {/* Keyed on the id so moving between avatars remounts the Studio's state cleanly. */}
      <AvatarStudio
        key={avatar.id}
        clientId={client.id}
        clientSlug={client.slug}
        clientName={client.name}
        initialAvatar={avatar}
      />
    </main>
  );
}
```

- [ ] **Step 8: Typecheck, lint and run the avatar tests**

Run: `npx tsc --noEmit && npx eslint src/components/avatars "src/app/clients/[id]/avatars" && npx vitest run src/lib/avatars "src/app/api/clients/[id]/avatars"`
Expected: no type or lint errors; PASS, 39 tests.

- [ ] **Step 9: Commit**

```bash
git add src/components/avatars "src/app/clients/[id]/avatars"
git commit -m "feat(avatars): Avatar Studio — upload, person declaration, save and archive (D287, D288)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Verify in the running app

**Files:** none changed unless a defect is found.

**Interfaces:**
- Consumes: everything above, plus migration 0041 applied to the database.

- [ ] **Step 1: Ask the operator to apply the migration**

Stop and ask the operator to paste `supabase/migrations/0041_client_avatars.sql` into the Supabase SQL editor and run it, then run the two verify queries from `docs/auth-production-migration.md` § "Migration 0041". Do not continue until they confirm. Without it every step below fails with `relation "client_avatars" does not exist`.

- [ ] **Step 2: Start the app**

Run: `npm run dev:next`
Expected: the dev server starts with no compile errors.

- [ ] **Step 3: Walk the upload flow**

In the browser, signed in, for a client whose KB is ready:

1. Client page → **Settings** → **Avatars**. Expected: the empty state "No avatars yet".
2. **+ New avatar**. Type the name `Riya`. Expected: the URL stays `/avatars/new`; Save is disabled; "Still needed: a front image, a profile sheet."
3. Drop a `.gif`. Expected: a toast naming the allowed types; nothing uploads.
4. Add a `.png` front image. Expected: a same-size placeholder, then the image; the URL becomes `/avatars/<id>`; the name is still `Riya`; "Is this a real person?" appears.
5. Choose **Yes, a real person**, tick the statement, **Confirm**. Expected: "Real person · confirmed <today>".
6. **Continue to profile sheet**, add an image. Expected: Save becomes enabled.
7. **Save avatar**. Expected: toast "Avatar saved"; the library shows the tile with the name, "No voice" and a "Real person" badge, and no "Draft" badge.
8. Open the tile, replace the front image. Expected: the declaration question returns; the sheet step shows "The front image changed…"; the tile shows "Draft" again after going back.
9. **Archive avatar** → **Archive**. Expected: back in the library; the tile is gone.

- [ ] **Step 4: Check isolation**

Copy an avatar id from client A. While viewing client B, open `/clients/<B slug>/avatars/<A's avatar id>`. Expected: a redirect to client B's library.

- [ ] **Step 5: Report**

Report each step's result as seen, including any that failed. Fix defects in the task that owns the file, re-run that task's tests, and commit the fix on its own.
