# Script Copilot · Spec 3 (Visualise) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A script at Visualise gets an avatar for every person in its cast, made or picked inline beside the script, each with a four-view sheet and a voice; and every shot gets a storyboard panel drawn by Nano Banana 2 from the shot, the setting, the regional kit and the on-screen people's avatars, with takes, a prompt box, out-of-date marking and Generate all.

**Architecture:** Visualise keeps its own data beside the script: two new tables (`script_panel_takes`, `script_panel_picks`) keyed by script and shot id, and generations that may now be owned by a script. The only write into the script document is a cast member's `avatarId`, done on the raw stored JSON so no other key is touched. The Avatars feature changes in two places: the sheet becomes four separate 3:4 views (Front, Left, Right, Back) for every avatar, with the old single `sheet` image kept as those four views composed side by side so video references (D308) keep working; and an avatar used by a live script cannot be archived. Everything that decides what a panel is drawn from, whether it is out of date, and what Generate all will cost is a pure function in `src/lib/scripts/visualise/`, run identically in the browser (to show state and cost) and on the server (to draw).

**Tech Stack:** Next.js (App Router, this repo's version: read `node_modules/next/dist/docs/` before writing route or page code), React 19, TypeScript, Supabase (service-role server client), zod 4, TanStack Query v5, sharp, shadcn on Base UI (`src/components/ui/*`), Lucide, sonner, vitest (node environment).

**Spec:** [docs/superpowers/specs/2026-10-08-script-copilot-3-visualise-design.md](../specs/2026-10-08-script-copilot-3-visualise-design.md) (binding). Also read: the parent map [2026-10-07-script-copilot-design.md](../specs/2026-10-07-script-copilot-design.md) §4a and §11.1 (the dry run), and [2026-10-08-script-copilot-open-questions.md](../specs/2026-10-08-script-copilot-open-questions.md) sections "Spec 3" and "Spec 4". The Avatars feature this changes: [2026-09-29-client-avatars-design.md](../specs/2026-09-29-client-avatars-design.md) and ADRs D287–D301, D308 in the roadmap's §7.

## Global Constraints

- **Visualise data stays out of the script.** "Spec 3 keeps its data (panels, takes, prompts, generations) separate from the script document, keyed by script and shot, and only writes the cast members' avatar links into the script." The cast link is written into the raw stored `doc` JSON (`cast[i].avatarId` only), never by re-serialising a parsed doc.
- **One stage move:** "Its only stage change is Reopen (Visualise → Generate)." Visualise work (cast links, panels, picks) is allowed while the script is at `visualise` or `in_review` (spec 4: "Editing stays allowed while In review"); Reopen only from `visualise`.
- **Four views for every avatar:** "The sheet is four views: Front, Left, Right, Back. This holds for every avatar in the product, the Avatar Studio included." "Avatars made earlier keep three views until their sheet is regenerated." Left and Right are made "with that stated" (the direction the person faces).
- **No sheet uploads (user's answer, 8 Oct 2026, handoff §2a):** every sheet is four generated views. The Studio's "add your own profile sheet" upload is removed, and the image routes refuse `slot: "sheet"`. An avatar that already has an uploaded sheet keeps it until its four views are generated, the same as an older three-view sheet. A face photo (the front) is still uploaded for a Specific person.
- **Archive refusal:** "An avatar used in any script cannot be archived. The Avatars library's archive action refuses while a script uses it."
- **Panels:** Nano Banana 2 (`gemini:gemini-3.1-flash-image`) for every panel, no model picker. "Generate all draws every shot that has no current panel: missing or out of date. It shows its total first." "Each panel keeps its earlier takes." "The client only ever sees the picked take." The prompt box is "hidden by default, showing the exact prompt sent to draw that frame". Out-of-date panels are "never redrawn on their own".
- **What a panel never shows:** "On-screen text is never drawn into a panel, and neither is the AI-generated label"; no generated text, brand names or labelled packs; card and pack areas are drawn blank.
- **No new ways to make a script.** Build against the seeded Reel 01 at Visualise, without spec 2: `node scripts/seed-script.mjs <client-slug> --stage visualise`.
- **Controls are shadcn primitives from `src/components/ui/*` only** (Base UI, `render` prop, not `asChild`). Never a raw `<button>`, `<input>`, `<select>`, `<textarea>`, checkbox, radio or switch. Anything inside a field is composed with `InputGroup`.
- **Design system:** colours only through the shadcn CSS variables; `font-display` headings; `primary` used sparingly; resting cards `shadow-card`; `.text-eyebrow` labels; Lucide icons at `strokeWidth={1.5}`; easing `cubic-bezier(0.22,1,0.36,1)` only; "Add"-type actions as dashed primary chips.
- **Wording:** "avatar" means the asset only. Never "presenter" in user-facing text (code identifiers stay).
- **API routes:** `withClient` for every route under `src/app/api/clients/[id]/`; `apiOk` / `apiError` only; `withTryCatch` for multi-step handlers; every query filters on `client_id` as well as the row id.
- **Browser data:** a service in `src/services/` plus a TanStack Query hook file in `src/hooks/queries/` that alone builds its keys (D300).
- **Reuse, don't redefine:** `isUuid`, `errorMessage`, `validateAvatarImageFile` from `@/lib/avatars/utils`; `estimateAvatarImageCredits`, `listSentence` from `@/lib/avatars/generation`; `reelLabel` from `@/lib/scripts/utils`; `formatDate` from `@/lib/kb/utils`; `AvatarCreditCost`, `AvatarImageDropzone`, `AvatarLikenessConsent` from `src/components/avatars/`.
- **Numbers:** migration **`0053`** (spec 2 takes 0052; the merge renumbers if needed). ADRs **D337–D346**.
- **One component per file, named exports, split at about 200 lines** (`docs/component-structure.md`).
- **Git:** work and commit only in this worktree (`.claude/worktrees/sc-visualise`, branch `worktree-sc-visualise`). Never `git stash`. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A cast member's avatar is refined while one of their panels is still drawing** → the new take must record the face it was drawn from (captured before the model call), so it shows Out of date as soon as it lands rather than passing as current. Test in Task 10.
2. **The same avatar is picked for two people in one script** → refused, naming who already has it; two cast members must never share one face. Test in Task 5.
3. **One of the four views fails while the other three succeed** (a blocked prompt, a timeout) → the three are kept and charged, the failed one is refunded, the response names the view, and that person's panels keep waiting until the missing view is made. Test in Task 2.
4. **Generate all reaches the monthly credit cap part way through** → no further draws start, the ones already running finish, one message is shown, and the remaining shots stay Not yet. Test in Task 9.
5. **The script comes back from Reopen with shots edited, split, added and removed** → the edited shot and the split's first half are Out of date (and redraw from a fresh prompt), the split's second half and the new shot are empty, and the removed shot's takes are neither shown nor counted. Test in Task 9.

---

## Merge points with specs 2 and 4

Specs 2 and 4 are built at the same time from the same base. Spec 3 only *adds* to shared files; these are the places a merge must look at:

| Shared thing | What spec 3 does | What the other spec must keep |
|---|---|---|
| `src/components/scripts/script-view.tsx`, `script-shot-list.tsx`, `script-shot-row.tsx` | Adds optional props only: `top`, `cast`, `shotAside` on `ScriptView`; `aside` on the list and row. Defaults render exactly as before. | Spec 4's comment markers go through the same slots, or through `CastSlot`'s and `PanelAside`'s `marker` props (Tasks 12, 13). |
| `src/app/clients/[id]/scripts/[scriptId]/page.tsx` | Renders `VisualiseView` when the stage is `visualise` or `in_review`; otherwise the read-only `ScriptView` as now. | Spec 2 adds the `generate` branch; spec 4 decides whether `in_review` shows anything more. |
| `src/lib/scripts/schema.ts` | Untouched. | Spec 2 keeps a shot's `id` when it edits the shot, gives a split's first half the original id and the second half a new one (spec 4 Q11 answer), and gives new shots new ids. Panels key on these ids. |
| `src/lib/db/scripts.ts`, `src/hooks/queries/scripts.ts`, `src/services/scripts.service.ts` | Untouched. Spec 3's reads and writes live in new files (`script-visualise.ts`, `script-panels.ts`, `visualise.ts`). | Stage moves: spec 3's `reopenScript`, spec 2's Mark final and spec 4's moves can be consolidated into one `moveScriptStage` at merge. |
| Brand KB house rules | `loadKbText` (Task 7) reads every string in the active KB and finds the "Regional kits" table in it. | Spec 2 owns where the house rules live; when it adds a reader, `loadKbText` is replaced by it. |
| Avatars feature | Four views (Tasks 1–3), archive refusal (Task 4). Exports `AVATAR_VIEWS` / `AvatarViewId`. | Spec 2 links only saved (ready) avatars. Spec 4's per-view comments key on `AvatarViewId` (`"front" \| "left" \| "right" \| "back"`). |
| What spec 4 freezes | `listPanelPicks(scriptId)` and `listPanelTakes(scriptId)` (Task 10) give the picked take per shot. | Spec 4's frozen version records the picked take ids. |
| `generations_owner_check` | Migration 0053 adds `script_id` to the owner check. | If another migration rewrites the check, merge the clauses. |
| Roadmap §7 ADR log | Appends D337–D346 at the end. | Spec 2 (D327–D336) and spec 4 also append; reorder by number at merge. |

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0053_script_visualise.sql` | `client_avatars.sheet_views`; `generations.script_id` + owner check; `script_panel_takes`; `script_panel_picks` |
| `src/lib/avatars/schema.ts` | `AvatarViewId`, `AvatarSheetViews`, `Avatar.sheetViews` |
| `src/lib/avatars/constants.ts` | `AVATAR_VIEWS`, `AVATAR_VIEW_LABELS`, `AVATAR_VIEW_ASPECT`, `AVATAR_VIEW_DIRECTIONS` |
| `src/lib/avatars/rows.ts` | `sheet_views` mapping |
| `src/lib/avatars/utils.ts` | `hasFourViews`, `sheetKind`, `missingViews`, `viewsToMake`, `sheetViewsPatch`; `sheetChangePatch` deleted (no sheet uploads) |
| `src/lib/avatars/generation.ts` | `buildAvatarViewPrompt` (replaces `buildAvatarSheetPrompt`), `estimateSheetCredits` |
| `src/lib/avatars/sheet-layout.ts` | Pure strip layout for the composed sheet |
| `src/lib/avatars/sheet-compose.ts` | Composes the four views into the `sheet` strip (server) |
| `src/lib/avatars/generate.ts` | Delegates to the shared billed run; passes the view name to storage |
| `src/lib/avatars/studio.ts` | Sheet step copy and `sheetStatusLabel` |
| `src/app/api/clients/[id]/avatars/[avatarId]/sheet/route.ts` | Generates the four views (or the missing ones), composes the strip |
| `src/app/api/clients/[id]/avatars/[avatarId]/route.ts` | DELETE refuses while a script uses the avatar |
| `src/app/api/clients/[id]/avatars/[avatarId]/images/route.ts`, `images/sign/route.ts` | Take the front only; sheets are no longer uploaded |
| `src/components/avatars/avatar-sheet-views.tsx` | Four view tiles, shared by the Studio and Visualise |
| `src/components/avatars/avatar-studio-sheet-step.tsx`, `avatar-sheet-generate.tsx`, `avatar-studio-summary.tsx`, `avatar-likeness-consent.tsx` | Studio shows four views; consent takes an id |
| `src/components/nodes/avatar-focus-view.tsx` | Shows the composed strip at its own aspect |
| `src/hooks/use-avatar-generation.ts`, `src/services/avatars.service.ts` | `generateSheet(modelId, views?)`, `generatingViews` |
| `src/lib/image-gen/billed-run.ts` | The reserve, run, store, settle sequence shared by avatars and panels |
| `src/lib/db/generations.ts`, `src/lib/db/types.ts` | A generation may be owned by a script |
| `src/lib/storage/paths.ts`, `src/lib/storage/index.ts` | View-named avatar uploads; panel uploads |
| `src/lib/scripts/visualise/constants.ts` | Panel model, aspects, limits, timeouts |
| `src/lib/scripts/visualise/schema.ts` | `PanelTake`, `PanelFaces`, `DrawBody`, `VisualiseBoard` |
| `src/lib/scripts/visualise/rows.ts` | Take row to `PanelTake` |
| `src/lib/scripts/visualise/cast.ts` | Stage rule, raw cast-link write, archive refusal wording |
| `src/lib/scripts/visualise/kits.ts` | Parse the KB's regional kits; pick a kit per shot |
| `src/lib/scripts/visualise/keys.ts` | Fingerprints of a shot's text and an avatar's face |
| `src/lib/scripts/visualise/panel-prompt.ts` | The panel prompt and its clauses |
| `src/lib/scripts/visualise/panel-inputs.ts` | Who is on screen, references, waiting list, the prompt, cost |
| `src/lib/scripts/visualise/state.ts` | Panel state, readiness, Generate all plan, the prompt a redraw uses |
| `src/lib/scripts/visualise/queue.ts` | Bounded queue for Generate all |
| `src/lib/scripts/visualise/maker.ts` | The inline avatar maker's sequence |
| `src/lib/scripts/visualise/kb-text.ts` | Reads the active KB's text (server) |
| `src/lib/scripts/visualise/board-server.ts` | Loads avatars, takes, picks and kits for a script (server) |
| `src/lib/scripts/visualise/run-panel.ts` | One billed panel generation (server) |
| `src/lib/db/script-visualise.ts` | `setCastAvatar`, `reopenScript`, `listScriptsUsingAvatar` |
| `src/lib/db/script-panels.ts` | Takes and picks |
| `src/app/api/clients/[id]/scripts/[scriptId]/visualise/route.ts` | GET the board |
| `src/app/api/clients/[id]/scripts/[scriptId]/cast/[castId]/route.ts` | PUT a cast member's avatar link |
| `src/app/api/clients/[id]/scripts/[scriptId]/reopen/route.ts` | POST Reopen |
| `src/app/api/clients/[id]/scripts/[scriptId]/panels/[shotId]/route.ts` | POST draw a panel |
| `src/app/api/clients/[id]/scripts/[scriptId]/panels/[shotId]/pick/route.ts` | PUT pick a take |
| `src/services/visualise.service.ts` | Browser calls |
| `src/hooks/queries/visualise.ts` | Board query, link, pick, reopen mutations |
| `src/hooks/queries/client-voices.ts` | The client's voices for the voice picker |
| `src/hooks/use-panel-draws.ts` | Per-shot draws and Generate all |
| `src/hooks/use-visualise-model.ts` | Derives inputs, states, cost and readiness for the view |
| `src/hooks/use-cast-avatar-maker.ts` | Runs the maker for one cast slot |
| `src/components/scripts/script-view.tsx`, `script-shot-list.tsx`, `script-shot-row.tsx` | Optional slots (additive) |
| `src/app/clients/[id]/scripts/[scriptId]/page.tsx` | Visualise branch |
| `src/components/visualise/*.tsx` | The Visualise view, readiness line, dialogs, panels, cast slots |
| `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` | D337–D346 |

---

### Task 1: Migration 0053 and the four-view avatar shape

**Files:**
- Create: `supabase/migrations/0053_script_visualise.sql`
- Modify: `src/lib/avatars/schema.ts`, `src/lib/avatars/constants.ts`, `src/lib/avatars/rows.ts`, `src/lib/avatars/utils.ts`
- Modify (tests): `src/lib/avatars/__tests__/fixtures.ts`, `src/lib/avatars/__tests__/rows.test.ts`, `src/lib/avatars/__tests__/utils.test.ts`, `src/lib/db/avatars.test.ts`

**Interfaces:**
- Produces: type `AvatarViewId = "front" | "left" | "right" | "back"`; type `AvatarSheetViews = Record<AvatarViewId, AvatarImage | null>`; `Avatar.sheetViews: AvatarSheetViews | null`; `AvatarPatch` accepts `sheetViews`; constants `AVATAR_VIEWS` (that order), `AVATAR_VIEW_LABELS`, `AVATAR_VIEW_ASPECT = "3:4"`; `hasFourViews(a: Pick<Avatar,"sheetViews"|"sheetStale">): boolean`; `sheetKind(a: Pick<Avatar,"sheet"|"sheetViews">): "none" | "three-view" | "uploaded" | "four-view"`; `missingViews(a: Pick<Avatar,"sheetViews"|"sheetStale">): AvatarViewId[]`; test fixture `makeViews(prefix = "v"): AvatarSheetViews`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0053_script_visualise.sql`:

```sql
-- Script copilot spec 3 (Visualise). See
-- docs/superpowers/specs/2026-10-08-script-copilot-3-visualise-design.md and ADRs D337–D346.
-- Additive: one column on client_avatars, one owner column on generations, two new tables.
-- Nothing existing is rewritten.

-- D339 — an avatar's sheet is four views, each its own 3:4 image made from the front:
-- { front, left, right, back }, each an AvatarImage JSON or null (not made yet, or failed).
-- Null for an avatar whose sheet is the older single three-view image, or that has none.
alter table client_avatars add column if not exists sheet_views jsonb;

-- D337 — a storyboard panel's generation belongs to its script: a third kind of owner beside
-- the canvas node and the avatar (0042). Cascade, as the other two owners do.
alter table generations
  add column if not exists script_id uuid references client_scripts(id) on delete cascade;
create index if not exists generations_script_id_idx on generations (script_id);

alter table generations drop constraint if exists generations_owner_check;
alter table generations
  add constraint generations_owner_check
  check (node_id is not null or avatar_id is not null or script_id is not null);

-- D337, D343 — every drawing of a shot's storyboard panel, kept as a take. Keyed by script and
-- shot id; the script document itself is never touched.
create table script_panel_takes (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  script_id     uuid not null references client_scripts(id) on delete cascade,
  shot_id       text not null,
  generation_id uuid references generations(id) on delete set null,
  status        text not null default 'running'
                  check (status in ('running', 'succeeded', 'failed')),
  url           text,
  width         integer,
  height        integer,
  -- D344 — the exact prompt sent, and whether a person wrote it rather than the script.
  prompt        text not null,
  prompt_edited boolean not null default false,
  -- D343 — what the panel was drawn from: a fingerprint of the shot's text, and for each cast
  -- member on screen { avatarId, faceKey }. A mismatch with today's values means out of date.
  shot_key      text not null,
  faces         jsonb not null default '{}'::jsonb,
  error         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index script_panel_takes_script_idx
  on script_panel_takes (script_id, shot_id, created_at desc);

-- D343 — the take the client sees: one per shot.
create table script_panel_picks (
  script_id uuid not null references client_scripts(id) on delete cascade,
  shot_id   text not null,
  take_id   uuid not null references script_panel_takes(id) on delete cascade,
  picked_at timestamptz not null default now(),
  primary key (script_id, shot_id)
);

-- Default-deny RLS with zero policies, as 0041 and 0051: the app reads and writes through the
-- service-role client; this only closes the direct-REST path the anon key opens.
alter table script_panel_takes enable row level security;
alter table script_panel_picks enable row level security;
```

Before committing, check the number is still free: `git ls-tree --name-only origin/staging supabase/migrations/ | tail -3`. If `0053` is taken, use the next free number and say so in the commit message.

- [ ] **Step 2: Write the failing tests**

In `src/lib/avatars/__tests__/fixtures.ts`, add `sheetViews: null` to `makeAvatar`'s defaults (after `sheetStale: false`), and add below `GENERATED`:

```ts
import type { Avatar, AvatarImage, AvatarImageSource, AvatarSheetViews } from "../schema";

/** A full four-view sheet (D339), each view a distinct generated image. */
export function makeViews(prefix = "v"): AvatarSheetViews {
  const view = (v: string): AvatarImage => {
    const source: AvatarImageSource = {
      kind: "generated", modelId: "gemini:gemini-3.1-flash-image", mode: "edit", prompt: "view",
      generatedAt: "2026-10-08T10:00:00.000Z", generationId: `${prefix}-${v}`, untouched: true,
    };
    return { url: `https://storage.googleapis.com/b/${prefix}-${v}.png`, width: 768, height: 1024, sizeBytes: 10, source };
  };
  return { front: view("front"), left: view("left"), right: view("right"), back: view("back") };
}
```

(Replace the file's existing `import type { Avatar, AvatarImage, AvatarImageSource } from "../schema";` with the line above.)

In `src/lib/avatars/__tests__/rows.test.ts`, add `sheet_views: null,` to the `row` literal after `sheet_stale: false,`, and add:

```ts
describe("sheet views (D339)", () => {
  it("maps sheet_views both ways", () => {
    const views = makeViews();
    expect(rowToAvatar({ ...row, sheet_views: views }).sheetViews).toEqual(views);
    expect(patchToRow({ sheetViews: null })).toEqual({ sheet_views: null });
  });

  it("reads a row from before the column existed as no views", () => {
    const older: Partial<AvatarRow> = { ...row };
    delete older.sheet_views;
    expect(rowToAvatar(older as AvatarRow).sheetViews).toBeNull();
  });
});
```

(and import `makeViews` from `./fixtures`).

In `src/lib/db/avatars.test.ts`, add `sheet_views: null,` to `ROW` after `sheet_stale: false,`.

In `src/lib/avatars/__tests__/utils.test.ts`, add these three blocks (import `hasFourViews`, `missingViews`, `sheetKind` from `../utils`, and `makeViews` from `./fixtures`). Leave the `sheetChangePatch` block alone; Task 3 deletes it along with the sheet upload:

```ts
describe("hasFourViews (D339)", () => {
  it("needs every view, made from the front the avatar has now", () => {
    expect(hasFourViews(makeAvatar({ sheetViews: makeViews() }))).toBe(true);
    expect(hasFourViews(makeAvatar({ sheetViews: { ...makeViews(), left: null } }))).toBe(false);
    expect(hasFourViews(makeAvatar({ sheetViews: makeViews(), sheetStale: true }))).toBe(false);
    expect(hasFourViews(makeAvatar({ sheetViews: null }))).toBe(false);
  });
});

describe("sheetKind (D339)", () => {
  it("tells the four views from an older three-view sheet and an older upload", () => {
    expect(sheetKind(makeAvatar({ sheetViews: makeViews() }))).toBe("four-view");
    expect(sheetKind(makeAvatar({ sheet: makeImage(GENERATED), sheetViews: null }))).toBe("three-view");
    expect(sheetKind(makeAvatar({ sheet: makeImage(), sheetViews: null }))).toBe("uploaded");
    expect(sheetKind(makeAvatar({ sheet: null, sheetViews: null }))).toBe("none");
  });
});

describe("missingViews (D339)", () => {
  it("lists only the gaps in a current sheet", () => {
    expect(missingViews(makeAvatar({ sheetViews: { ...makeViews(), back: null } }))).toEqual(["back"]);
    expect(missingViews(makeAvatar({ sheetViews: makeViews() }))).toEqual([]);
  });

  it("asks for all four when there are none, or they show an older front", () => {
    const all = ["front", "left", "right", "back"];
    expect(missingViews(makeAvatar({ sheetViews: null }))).toEqual(all);
    expect(missingViews(makeAvatar({ sheetViews: { ...makeViews(), back: null }, sheetStale: true }))).toEqual(all);
  });
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/lib/avatars/__tests__/utils.test.ts src/lib/avatars/__tests__/rows.test.ts`
Expected: FAIL — `hasFourViews` / `makeViews` not exported, `sheetViews` missing from the type.

- [ ] **Step 4: Add the types and constants**

In `src/lib/avatars/schema.ts`, after `export type AvatarImageSlot = "front" | "sheet";` add:

```ts
// D339 — the sheet is four views for every avatar (supersedes D288's single three-view image).
export type AvatarViewId = "front" | "left" | "right" | "back";
/** Each view is its own 3:4 image made from the front image. Null while a view has not been
 *  made yet, or its generation failed. */
export type AvatarSheetViews = Record<AvatarViewId, AvatarImage | null>;
```

and in `Avatar`, after `sheet: AvatarImage | null;`:

```ts
  /** D339 — the four views. Null for an avatar whose sheet is the older three-view image or an
   *  upload from before D339 (both kept until the views are generated), or that has none. When all four exist, `sheet`
   *  holds them composed side by side, so everything that sends the sheet (D308) is unchanged. */
  sheetViews: AvatarSheetViews | null;
```

In `src/lib/avatars/constants.ts`, change the first import to `import type { AvatarViewId, PersonType } from "./schema";` and add after `AVATAR_SHEET_ASPECT`:

```ts
// D339 — the four views, in the order they are shown, sent as references and commented on
// (spec 4). Each is a 3:4 portrait-shaped image, head to toe.
export const AVATAR_VIEWS = ["front", "left", "right", "back"] as const satisfies readonly AvatarViewId[];
export const AVATAR_VIEW_LABELS: Record<AvatarViewId, string> = {
  front: "Front", left: "Left", right: "Right", back: "Back",
};
export const AVATAR_VIEW_ASPECT = "3:4";
```

- [ ] **Step 5: Map the column**

In `src/lib/avatars/rows.ts`: import `AvatarSheetViews` with the other schema types; add `sheet_views: AvatarSheetViews | null;` to `AvatarRow` after `sheet_stale`; in `rowToAvatar` add `sheetViews: row.sheet_views ?? null,` after `sheetStale`; in `COLUMN` add `sheetViews: "sheet_views",` after `sheetStale`.

- [ ] **Step 6: Add the helpers**

In `src/lib/avatars/utils.ts`:
- import `AVATAR_VIEWS` from `./constants` (add to the existing import) and `AvatarViewId` from `./schema`;
- add `| "sheetViews"` to the `AvatarPatch` Pick list;
- add the helpers below `sheetChangePatch` (leave it as it is; Task 3 deletes it with the sheet upload):

```ts
/** D339 — a current four-view sheet: every view made, from the front image the avatar has now. */
export function hasFourViews(avatar: Pick<Avatar, "sheetViews" | "sheetStale">): boolean {
  const views = avatar.sheetViews;
  return !avatar.sheetStale && views !== null && AVATAR_VIEWS.every((v) => views[v] !== null);
}

export type SheetKind = "none" | "three-view" | "uploaded" | "four-view";

/** Which kind of sheet an avatar has. A generated single image is the older three-view sheet
 *  (D288); an uploaded one predates D339, which ended sheet uploads. Both are kept until the
 *  four views are generated. */
export function sheetKind(avatar: Pick<Avatar, "sheet" | "sheetViews">): SheetKind {
  if (avatar.sheetViews) return "four-view";
  if (!avatar.sheet) return "none";
  return avatar.sheet.source.kind === "upload" ? "uploaded" : "three-view";
}

/** The views a Generate would make: only the gaps in a current sheet, otherwise all four. */
export function missingViews(avatar: Pick<Avatar, "sheetViews" | "sheetStale">): AvatarViewId[] {
  const views = avatar.sheetViews;
  if (!views || avatar.sheetStale) return [...AVATAR_VIEWS];
  return AVATAR_VIEWS.filter((v) => views[v] === null);
}
```

- [ ] **Step 7: Run the tests, then the type check**

Run: `npx vitest run src/lib/avatars src/lib/db/avatars.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: errors only where a test builds an `Avatar` or `AvatarRow` literal by hand without the new field. For each, add `sheetViews: null` (or `sheet_views: null`). Do not change any production behaviour to satisfy it. Re-run until clean.

- [ ] **Step 8: Apply the migration to the staging database (the user does this)**

Ask the user to run `supabase/migrations/0053_script_visualise.sql` in the staging Supabase SQL editor, the way 0051 was applied. Do not apply it yourself. Tasks 2 to 9 need only the tests; Task 3's look in the app, Task 10's real draw and Tasks 11 to 14 need the migration applied.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0053_script_visualise.sql src/lib/avatars src/lib/db/avatars.test.ts
git commit -m "feat(avatars): four-view sheet shape and migration 0053 (D339)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Generate the four views, and compose them into the sheet

**Files:**
- Modify: `src/lib/avatars/constants.ts`, `src/lib/avatars/generation.ts`, `src/lib/avatars/utils.ts`, `src/lib/avatars/generate.ts`
- Modify: `src/lib/storage/paths.ts`, `src/lib/storage/index.ts`
- Create: `src/lib/avatars/sheet-layout.ts`, `src/lib/avatars/sheet-compose.ts`
- Modify: `src/app/api/clients/[id]/avatars/[avatarId]/sheet/route.ts`
- Test: `src/lib/avatars/__tests__/generation.test.ts`, `src/lib/avatars/__tests__/utils.test.ts`, `src/lib/avatars/__tests__/sheet-layout.test.ts`, `src/lib/storage/paths.test.ts`, `src/app/api/clients/[id]/avatars/[avatarId]/sheet/route.test.ts`

**Interfaces:**
- Consumes: Task 1's `AVATAR_VIEWS`, `AVATAR_VIEW_ASPECT`, `AvatarViewId`, `AvatarSheetViews`, `hasFourViews`, `missingViews`.
- Produces: `AVATAR_VIEW_DIRECTIONS`; `buildAvatarViewPrompt(view: AvatarViewId): string`; `estimateSheetCredits(modelId: string, count: number): number | null`; `viewsToMake(current, requested?: AvatarViewId[]): AvatarViewId[]`; `sheetViewsPatch(current: Avatar, made: Partial<Record<AvatarViewId, AvatarImage>>): { patch: AvatarPatch; complete: Record<AvatarViewId, AvatarImage> | null }`; `stripLayout(sizes, height, gap)`; `composeSheetStrip({ clientId, avatarId, views }): Promise<AvatarImage>`; `runAvatarGeneration` accepts `view?: AvatarViewId`; `pathForAvatarGenerated` / `uploadAvatarGenerated` accept `name?: string`. `POST …/avatars/:avatarId/sheet` takes `{ modelId, views? }` and answers `{ avatar, creditsCharged, spentCredits, failed: { view, label, error }[] }`.

- [ ] **Step 1: Write the failing pure tests**

In `src/lib/avatars/__tests__/generation.test.ts`, replace the whole `describe("buildAvatarSheetPrompt", …)` block (and its import) with:

```ts
describe("buildAvatarViewPrompt (D339)", () => {
  it("states which edge of the frame each profile faces, so the two never face the same way", () => {
    expect(buildAvatarViewPrompt("left")).toContain("nose points to the LEFT edge");
    expect(buildAvatarViewPrompt("right")).toContain("nose points to the RIGHT edge");
    expect(buildAvatarViewPrompt("back")).toContain("facing directly away");
    expect(buildAvatarViewPrompt("front")).toContain("facing the camera");
  });

  it("asks for the same person, head to toe, on a plain backdrop, with no text", () => {
    for (const view of ["front", "left", "right", "back"] as const) {
      const prompt = buildAvatarViewPrompt(view);
      expect(prompt).toContain("same person as the reference image");
      expect(prompt).toContain("head to toe");
      expect(prompt).toContain("identity markers");
      expect(prompt).toContain("No text");
    }
  });
});

describe("estimateSheetCredits", () => {
  it("is one view's estimate times the number of views", () => {
    const one = estimateSheetCredits("gemini:gemini-3.1-flash-image", 1);
    expect(one).toBeGreaterThan(0);
    expect(estimateSheetCredits("gemini:gemini-3.1-flash-image", 4)).toBe(one! * 4);
    expect(estimateSheetCredits("nope:none", 4)).toBeNull();
  });
});
```

(Import `buildAvatarViewPrompt`, `estimateSheetCredits` from `../generation` in place of `buildAvatarSheetPrompt`.)

Append to `src/lib/avatars/__tests__/utils.test.ts` (import `viewsToMake`, `sheetViewsPatch`):

```ts
describe("viewsToMake (D339)", () => {
  it("makes only the views asked for when the sheet is current", () => {
    expect(viewsToMake(makeAvatar({ sheetViews: makeViews() }), ["left"])).toEqual(["left"]);
  });

  it("makes all four when there are none, or they show an older front, whatever was asked", () => {
    const all = ["front", "left", "right", "back"];
    expect(viewsToMake(makeAvatar({ sheetViews: null }), ["left"])).toEqual(all);
    expect(viewsToMake(makeAvatar({ sheetViews: makeViews(), sheetStale: true }), ["left"])).toEqual(all);
    expect(viewsToMake(makeAvatar({ sheetViews: makeViews() }))).toEqual(all);
  });
});

describe("sheetViewsPatch (D339)", () => {
  it("lays new views over a current sheet and reports the full set", () => {
    const fresh = makeViews("new");
    const { patch, complete } = sheetViewsPatch(makeAvatar({ sheetViews: makeViews() }), { left: fresh.left! });
    expect(patch.sheetViews?.left).toEqual(fresh.left);
    expect(patch.sheetViews?.front).toEqual(makeViews().front);
    expect(patch.sheetStale).toBe(false);
    expect(complete?.left).toEqual(fresh.left);
  });

  it("starts from nothing when the old views show an older front, so a gap stays a gap", () => {
    const fresh = makeViews("new");
    const { patch, complete } = sheetViewsPatch(
      makeAvatar({ sheetViews: makeViews(), sheetStale: true }),
      { front: fresh.front!, left: fresh.left!, right: fresh.right! },
    );
    expect(patch.sheetViews?.back).toBeNull();
    expect(complete).toBeNull();
  });

  it("clears the composed strip until the caller composes a new one", () => {
    expect(sheetViewsPatch(makeAvatar({ sheetViews: makeViews() }), {}).patch.sheet).toBeNull();
  });
});
```

Create `src/lib/avatars/__tests__/sheet-layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { stripLayout } from "../sheet-layout";

describe("stripLayout", () => {
  it("scales every view to one height and lays them left to right with a gap", () => {
    const four = Array.from({ length: 4 }, () => ({ width: 768, height: 1024 }));
    expect(stripLayout(four, 1024, 24)).toEqual({
      widths: [768, 768, 768, 768], lefts: [0, 792, 1584, 2376], width: 3048, height: 1024,
    });
  });

  it("keeps each view's own shape when the model returned a different size", () => {
    const layout = stripLayout([{ width: 896, height: 1200 }, { width: 768, height: 1024 }], 1024, 0);
    expect(layout.widths).toEqual([765, 768]);
    expect(layout.width).toBe(1533);
  });
});
```

In `src/lib/storage/paths.test.ts`, extend the `pathForAvatarGenerated` describe:

```ts
  it("names a view's file after the view, so four parallel uploads never share a name", () => {
    const path = pathForAvatarGenerated({ clientId: "c1", avatarId: "a1", slot: "sheet", ext: "png", name: "view-left" });
    expect(path).toMatch(/\/generated\/sheet\/view-left__.+\.png$/);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/avatars/__tests__ src/lib/storage/paths.test.ts`
Expected: FAIL — missing exports.

- [ ] **Step 3: Implement the prompts, estimate and layout**

In `src/lib/avatars/constants.ts`, after `AVATAR_VIEW_ASPECT` add:

```ts
// D339 — the dry run (parent spec §11.1): asked for a left and a right profile together, the
// model returned two views facing the same way. Naming the edge of the frame the nose points
// to fixed it, so every view states its direction.
export const AVATAR_VIEW_DIRECTIONS: Record<AvatarViewId, string> = {
  front: "Front view: facing the camera straight on.",
  left: "Left profile: turned 90 degrees so the nose points to the LEFT edge of the image; only one side of the face is visible.",
  right: "Right profile: turned 90 degrees so the nose points to the RIGHT edge of the image; only one side of the face is visible.",
  back: "Back view: facing directly away from the camera; the face is not visible.",
};
```

In `src/lib/avatars/generation.ts`, delete `buildAvatarSheetPrompt` and add (importing `AVATAR_VIEW_ASPECT`, `AVATAR_VIEW_DIRECTIONS` from `./constants` and `AvatarViewId` from `./schema`):

```ts
/** D339 — one view of the sheet, made from the front image. "Character reference sheet" is
 *  said because a figure on a plain backdrop has been read as a location before (D281); the
 *  front is waist-up, so the whole body is asked for outright, or models copy its crop. */
export function buildAvatarViewPrompt(view: AvatarViewId): string {
  return [
    "One view from a character reference sheet of the same person as the reference image.",
    AVATAR_VIEW_DIRECTIONS[view],
    "Full body, head to toe, standing upright, with the feet visible and a little space above the " +
      "head and below the feet. The reference image may be cropped at the waist: continue the same " +
      "outfit down to the feet with matching clothes and shoes.",
    "Same person, same face, same hair, same skin tone, same build, same outfit, and the same " +
      "accessories and identity markers in the same colours.",
    "Arms relaxed at the sides, neutral expression, even soft light, plain light-grey seamless " +
      "background. One person only. No text, no labels, no borders.",
  ].join(" ");
}

/** What making `count` views costs: each view is one image with the front as its reference. */
export function estimateSheetCredits(modelId: string, count: number): number | null {
  const one = estimateAvatarImageCredits({ modelId, aspect: AVATAR_VIEW_ASPECT, referenceCount: 1 });
  return one === null ? null : one * count;
}
```

Create `src/lib/avatars/sheet-layout.ts`:

```ts
// D339 — where each view sits in the composed sheet strip. Pure, so it is tested without sharp.

export type StripLayout = { widths: number[]; lefts: number[]; width: number; height: number };

/** Every view scaled to `height`, keeping its own shape, laid left to right with `gap` between. */
export function stripLayout(sizes: { width: number; height: number }[], height: number, gap: number): StripLayout {
  const widths = sizes.map((s) => Math.round((s.width / s.height) * height));
  const lefts: number[] = [];
  let x = 0;
  for (const w of widths) {
    lefts.push(x);
    x += w + gap;
  }
  return { widths, lefts, width: Math.max(0, x - gap), height };
}
```

- [ ] **Step 4: Implement the view helpers**

In `src/lib/avatars/utils.ts` add (import `AvatarSheetViews` from `./schema`):

```ts
/** D339 — the views a sheet request makes. Only the ones asked for when the sheet is current;
 *  all four when there are none or they show an older front, so views of two faces never mix. */
export function viewsToMake(
  current: Pick<Avatar, "sheetViews" | "sheetStale">,
  requested?: readonly AvatarViewId[],
): AvatarViewId[] {
  if (!requested || !current.sheetViews || current.sheetStale) return [...AVATAR_VIEWS];
  return AVATAR_VIEWS.filter((v) => requested.includes(v));
}

const NO_VIEWS: AvatarSheetViews = { front: null, left: null, right: null, back: null };

/** New views laid over the ones already made from this front (none, when they are out of date).
 *  `complete` is the full set once all four exist. `sheet` is cleared here: the caller composes
 *  the strip from `complete`, so video never gets an older strip beside newer views. */
export function sheetViewsPatch(
  current: Pick<Avatar, "sheetViews" | "sheetStale">,
  made: Partial<Record<AvatarViewId, AvatarImage>>,
): { patch: AvatarPatch; complete: Record<AvatarViewId, AvatarImage> | null } {
  const base = current.sheetViews && !current.sheetStale ? current.sheetViews : NO_VIEWS;
  const views: AvatarSheetViews = { ...base, ...made };
  const complete = AVATAR_VIEWS.every((v) => views[v] !== null)
    ? (views as Record<AvatarViewId, AvatarImage>)
    : null;
  return { patch: { sheetViews: views, sheetStale: false, sheet: null }, complete };
}
```

- [ ] **Step 5: Let a generated upload carry a name**

In `src/lib/storage/paths.ts`, change `pathForAvatarGenerated` to take an optional name:

```ts
export function pathForAvatarGenerated(args: {
  clientId: string;
  avatarId: string;
  slot: AvatarImageSlot;
  ext: string;
  /** D339 — "view-left", "strip": four views upload at once, so each gets its own name. */
  name?: string;
}): string {
  const name = buildStoredName(undefined, { slug: args.name ?? "output", ext: args.ext });
  return `clients/${args.clientId}/avatars/${args.avatarId}/generated/${args.slot}/${name}`;
}
```

In `src/lib/storage/index.ts`, give `uploadAvatarGenerated` the same optional `name?: string` and pass it through to `pathForAvatarGenerated`.

In `src/lib/avatars/generate.ts`, add `view?: AvatarViewId;` to `AvatarGenerationArgs` (import the type), record it in the snapshot only when present, and pass the name:

```ts
  const inputsSnapshot = {
    slot: args.slot,
    ...(args.view ? { view: args.view } : {}),
    prompt: args.prompt,
    batchId: args.batchId,
    referenceUrls: args.referenceUrls,
  };
```

and in the `uploadAvatarGenerated({...})` call add `name: args.view ? \`view-${args.view}\` : undefined,`.

(Task 6 moves the body of this function into the shared billed run; this step only threads the view through.)

- [ ] **Step 6: Compose the strip**

Create `src/lib/avatars/sheet-compose.ts`:

```ts
import "server-only";
import sharp from "sharp";
import { uploadAvatarGenerated } from "@/lib/storage";
import { AVATAR_VIEWS } from "./constants";
import { stripLayout } from "./sheet-layout";
import type { AvatarImage, AvatarViewId } from "./schema";

const STRIP_HEIGHT = 1024;
const GAP = 24;
// The views' own light-grey backdrop, so the gaps read as part of one sheet.
const BACKGROUND = { r: 238, g: 238, b: 238, alpha: 1 };

/**
 * D339 — the four views side by side as one image, stored as the avatar's `sheet`. Everything
 * that already sends the sheet as one reference (D308: video, Composite, mentions) keeps
 * working, now with four views in it. The views themselves stay untouched; this strip is a
 * derived image, so its source says `untouched: false`.
 */
export async function composeSheetStrip(args: {
  clientId: string;
  avatarId: string;
  views: Record<AvatarViewId, AvatarImage>;
}): Promise<AvatarImage> {
  const buffers = await Promise.all(
    AVATAR_VIEWS.map(async (view) => {
      const res = await fetch(args.views[view].url);
      if (!res.ok) throw new Error(`Could not read the ${view} view (${res.status}).`);
      return Buffer.from(await res.arrayBuffer());
    }),
  );
  const sizes = await Promise.all(
    buffers.map(async (b) => {
      const meta = await sharp(b).metadata();
      return { width: meta.width ?? 768, height: meta.height ?? 1024 };
    }),
  );
  const layout = stripLayout(sizes, STRIP_HEIGHT, GAP);
  const tiles = await Promise.all(
    buffers.map((b, i) =>
      sharp(b).resize({ width: layout.widths[i], height: STRIP_HEIGHT, fit: "fill" }).png().toBuffer(),
    ),
  );
  const body = await sharp({
    create: { width: layout.width, height: layout.height, channels: 4, background: BACKGROUND },
  })
    .composite(tiles.map((input, i) => ({ input, left: layout.lefts[i], top: 0 })))
    .png()
    .toBuffer();

  const { url } = await uploadAvatarGenerated({
    clientId: args.clientId, avatarId: args.avatarId, slot: "sheet", name: "strip",
    ext: "png", body, contentType: "image/png",
  });
  const front = args.views.front.source;
  return {
    url,
    width: layout.width,
    height: layout.height,
    sizeBytes: body.length,
    source: {
      kind: "generated",
      modelId: front.kind === "generated" ? front.modelId : "",
      mode: "edit",
      prompt: "The four views (front, left, right, back) side by side.",
      generatedAt: new Date().toISOString(),
      generationId: front.kind === "generated" ? front.generationId : "",
      untouched: false,
    },
  };
}
```

- [ ] **Step 7: Run the pure tests**

Run: `npx vitest run src/lib/avatars/__tests__ src/lib/storage/paths.test.ts`
Expected: PASS.

- [ ] **Step 8: Rewrite the sheet route's tests**

Replace `src/app/api/clients/[id]/avatars/[avatarId]/sheet/route.test.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar, makeImage, makeViews } from "@/lib/avatars/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn(), updateAvatar: vi.fn() }));
vi.mock("@/lib/db/generations", () => ({ sumAvatarCredits: vi.fn() }));
vi.mock("@/lib/db/credit-transactions", () => {
  class CreditLimitError extends Error {}
  return { CreditLimitError };
});
vi.mock("@/lib/avatars/generate", () => ({ runAvatarGeneration: vi.fn() }));
vi.mock("@/lib/avatars/sheet-compose", () => ({ composeSheetStrip: vi.fn() }));
vi.mock("@/lib/storage", () => ({ removeObject: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { sumAvatarCredits } from "@/lib/db/generations";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { runAvatarGeneration } from "@/lib/avatars/generate";
import { composeSheetStrip } from "@/lib/avatars/sheet-compose";
import { removeObject } from "@/lib/storage";
import type { AvatarViewId } from "@/lib/avatars/schema";

const NB2 = "gemini:gemini-3.1-flash-image";
const params = Promise.resolve({ id: "c1", avatarId: "a1" });
const post = (body: unknown) =>
  new NextRequest("http://localhost/api/clients/c1/avatars/a1/sheet", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const rowFor = (view: AvatarViewId) => ({
  id: `g-${view}`, status: "succeeded", model_used: NB2,
  inputs_snapshot: { slot: "sheet", view, prompt: "p", batchId: null, referenceUrls: ["front-url"] },
  output_snapshot: `https://storage.googleapis.com/b/${view}.png`,
  meta: { width: 768, height: 1024, sizeBytes: 3 }, created_at: "2026-10-08T10:00:00.000Z",
});
const STRIP = { ...makeImage(), url: "https://storage.googleapis.com/b/strip.png" };
const generatedViews = () => vi.mocked(runAvatarGeneration).mock.calls.map((c) => c[0].view);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-9", email: "op@x.com", orgId: "org-1" } as never);
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Acme", org_id: "org-1" } as never);
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ sheetStale: true, status: "draft" }));
  vi.mocked(runAvatarGeneration).mockImplementation(async (args) => ({
    generation: rowFor(args.view!) as never, creditsCharged: 10,
  }));
  vi.mocked(composeSheetStrip).mockResolvedValue(STRIP);
  vi.mocked(updateAvatar).mockImplementation(async (_c, _a, p) => makeAvatar(p));
  vi.mocked(sumAvatarCredits).mockResolvedValue(40);
});

describe("POST sheet — four views (D339)", () => {
  it("makes all four views from the front, each 3:4 with its direction stated, and composes the strip", async () => {
    const front = makeAvatar().front!;
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: NB2 }), { params });
    expect(res.status).toBe(200);
    expect(generatedViews()).toEqual(["front", "left", "right", "back"]);
    for (const [args] of vi.mocked(runAvatarGeneration).mock.calls) {
      expect(args).toMatchObject({ slot: "sheet", aspect: "3:4", modelId: NB2, referenceUrls: [front.url], batchId: null });
    }
    expect(vi.mocked(runAvatarGeneration).mock.calls[1][0].prompt).toContain("LEFT edge");
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.sheetViews?.left?.url).toBe("https://storage.googleapis.com/b/left.png");
    expect(patch.sheet).toEqual(STRIP);
    expect(patch.sheetStale).toBe(false);
    const json = await res.json();
    expect(json).toMatchObject({ creditsCharged: 40, spentCredits: 40, failed: [] });
  });

  it("remakes only the view asked for when the sheet is current, and recomposes the strip", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ sheetViews: makeViews() }));
    const { POST } = await import("./route");
    await POST(post({ modelId: NB2, views: ["left"] }), { params });
    expect(generatedViews()).toEqual(["left"]);
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.sheetViews?.front).toEqual(makeViews().front);
    expect(patch.sheetViews?.left?.url).toBe("https://storage.googleapis.com/b/left.png");
    expect(composeSheetStrip).toHaveBeenCalledTimes(1);
  });

  it("makes all four when the views show an older front, even if one was asked for", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ sheetViews: makeViews(), sheetStale: true }));
    const { POST } = await import("./route");
    await POST(post({ modelId: NB2, views: ["left"] }), { params });
    expect(generatedViews()).toEqual(["front", "left", "right", "back"]);
  });

  it("keeps the views that succeeded when one fails, names it, and composes nothing", async () => {
    vi.mocked(runAvatarGeneration).mockImplementation(async (args) => {
      if (args.view === "back") throw new Error("Content blocked");
      return { generation: rowFor(args.view!) as never, creditsCharged: 10 };
    });
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: NB2 }), { params });
    expect(res.status).toBe(200);
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.sheetViews?.front).not.toBeNull();
    expect(patch.sheetViews?.back).toBeNull();
    expect(patch.sheet).toBeNull();
    expect(composeSheetStrip).not.toHaveBeenCalled();
    const json = await res.json();
    expect(json.creditsCharged).toBe(30);
    expect(json.failed).toEqual([{ view: "back", label: "Back", error: "Content blocked" }]);
  });

  it("answers 402 when every view hits the credit cap, and leaves the avatar alone", async () => {
    vi.mocked(runAvatarGeneration).mockRejectedValue(new CreditLimitError("Monthly credit limit reached"));
    const { POST } = await import("./route");
    expect((await POST(post({ modelId: NB2 }), { params })).status).toBe(402);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("still saves the views when composing the strip fails", async () => {
    vi.mocked(composeSheetStrip).mockRejectedValue(new Error("fetch failed"));
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: NB2 }), { params });
    expect(res.status).toBe(200);
    const patch = vi.mocked(updateAvatar).mock.calls[0][2];
    expect(patch.sheetViews?.back).not.toBeNull();
    expect(patch.sheet).toBeNull();
  });

  it("is a 400 for a model that is not in the registry, before touching the avatar", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: "nope:none" }), { params });
    expect(res.status).toBe(400);
    expect(getAvatar).not.toHaveBeenCalled();
  });

  it("is a 400 for an unknown view", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ modelId: NB2, views: ["top"] }), { params })).status).toBe(400);
  });

  it("needs a front image first", async () => {
    vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ front: null, sheet: null, status: "draft" }));
    const { POST } = await import("./route");
    expect((await POST(post({ modelId: NB2 }), { params })).status).toBe(400);
    expect(runAvatarGeneration).not.toHaveBeenCalled();
  });

  it("refuses when the front changed while the views were generating", async () => {
    const before = makeAvatar({ sheetStale: true, status: "draft" });
    const after = makeAvatar({ status: "draft", front: { ...before.front!, url: "https://storage.googleapis.com/b/other.png" } });
    vi.mocked(getAvatar).mockResolvedValueOnce(before).mockResolvedValueOnce(after);
    const { POST } = await import("./route");
    expect((await POST(post({ modelId: NB2 }), { params })).status).toBe(409);
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("writes on the front it generated from, and is a 409 when that precondition catches a race", async () => {
    vi.mocked(updateAvatar).mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(post({ modelId: NB2 }), { params });
    expect(vi.mocked(updateAvatar).mock.calls[0][3]).toEqual({ ifFrontUrl: makeAvatar().front!.url });
    expect(res.status).toBe(409);
  });

  it("removes an older uploaded sheet the new views replace", async () => {
    const { POST } = await import("./route");
    await POST(post({ modelId: NB2 }), { params });
    expect(removeObject).toHaveBeenCalledWith(makeAvatar().sheet!.url);
  });

  it("still answers with the avatar when the spend total cannot be read", async () => {
    vi.mocked(sumAvatarCredits).mockRejectedValue(new Error("db down"));
    const { POST } = await import("./route");
    const json = await (await POST(post({ modelId: NB2 }), { params })).json();
    expect(json.avatar).toBeTruthy();
    expect(json.spentCredits).toBeNull();
  });
});
```

- [ ] **Step 9: Run them to see them fail**

Run: `npx vitest run "src/app/api/clients/[id]/avatars/[avatarId]/sheet"`
Expected: FAIL (the route still makes one image).

- [ ] **Step 10: Rewrite the route**

Replace `src/app/api/clients/[id]/avatars/[avatarId]/sheet/route.ts` with:

```ts
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getAvatar, updateAvatar } from "@/lib/db/avatars";
import { sumAvatarCredits } from "@/lib/db/generations";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { removeObject } from "@/lib/storage";
import { runAvatarGeneration } from "@/lib/avatars/generate";
import { buildAvatarViewPrompt } from "@/lib/avatars/generation";
import { generationToImage } from "@/lib/avatars/rows";
import { composeSheetStrip } from "@/lib/avatars/sheet-compose";
import { sheetViewsPatch, viewsToMake, withStatus } from "@/lib/avatars/utils";
import { AVATAR_VIEWS, AVATAR_VIEW_ASPECT, AVATAR_VIEW_LABELS } from "@/lib/avatars/constants";
import type { AvatarImage, AvatarViewId } from "@/lib/avatars/schema";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { preconditionFailed } from "@/lib/avatars/route-responses";

// Four images in parallel; one can take over a minute on some models.
export const maxDuration = 300;

const SheetSchema = z.object({
  modelId: z.string().min(1),
  views: z.array(z.enum(AVATAR_VIEWS)).min(1).optional(),
});

const FRONT_CHANGED = "The front image changed while the sheet was generating. Generate it again.";

const failureMessage = (reason: unknown) =>
  reason instanceof CreditLimitError ? CREDIT_LIMIT_TOAST_MESSAGE
    : reason instanceof Error ? reason.message
    : "Image generation failed";

// POST …/sheet — D339: make the sheet's views FROM the front image, one image per view, and
// compose them into the `sheet` strip once all four exist. `views` remakes only those views,
// and only when the sheet is current (viewsToMake). Each view is billed on its own: a view that
// fails is refunded by runAvatarGeneration, the others are kept, and `failed` names the gaps.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; avatarId: string }> },
) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId, client) =>
    withTryCatch("Could not generate the profile sheet.", async () => {
      const raw = await req.json().catch(() => null);
      const parsed = SheetSchema.safeParse(raw);
      if (!parsed.success) {
        return apiError(raw && typeof raw === "object" && "views" in raw ? "Unknown view." : "Choose a model.", 400);
      }
      if (!imageGenClientModelMap[parsed.data.modelId]) return apiError("Unknown model.", 400);

      const current = await getAvatar(clientId, avatarId);
      if (!current || current.archivedAt) return apiError("Avatar not found.", 404);
      if (!current.front) return apiError("Add a front image before generating the profile sheet.", 400);
      const frontUrl = current.front.url;
      const views = viewsToMake(current, parsed.data.views);

      const caller = await resolveCallerContext();
      const results = await Promise.allSettled(
        views.map((view) =>
          runAvatarGeneration({
            clientId, avatarId, orgId: client.org_id, userId: caller.userId, userEmail: caller.email,
            slot: "sheet", view, modelId: parsed.data.modelId, aspect: AVATAR_VIEW_ASPECT,
            prompt: buildAvatarViewPrompt(view), referenceUrls: [frontUrl], batchId: null,
          }),
        ),
      );

      const made: Partial<Record<AvatarViewId, AvatarImage>> = {};
      const failed: { view: AvatarViewId; label: string; error: string }[] = [];
      let creditsCharged = 0;
      results.forEach((result, i) => {
        const view = views[i];
        if (result.status === "fulfilled") creditsCharged += result.value.creditsCharged;
        const image = result.status === "fulfilled" ? generationToImage(result.value.generation) : null;
        if (image) made[view] = image;
        else {
          const error = result.status === "rejected"
            ? failureMessage(result.reason)
            : "The view was generated but could not be read back.";
          failed.push({ view, label: AVATAR_VIEW_LABELS[view], error });
        }
      });
      if (Object.keys(made).length === 0) {
        const capped = results.some((r) => r.status === "rejected" && r.reason instanceof CreditLimitError);
        return apiError(capped ? CREDIT_LIMIT_TOAST_MESSAGE : failed[0].error, capped ? 402 : 500);
      }

      // Generation takes a while. Views of a front that was replaced meanwhile show the wrong
      // person: do not attach them. (The credits are spent; the images stay in storage.)
      const latest = await getAvatar(clientId, avatarId);
      if (!latest || latest.archivedAt) return apiError("Avatar not found.", 404);
      if (latest.front?.url !== frontUrl) return apiError(FRONT_CHANGED, 409);

      const { patch, complete } = sheetViewsPatch(latest, made);
      let sheet: AvatarImage | null = null;
      if (complete) {
        try {
          sheet = await composeSheetStrip({ clientId, avatarId, views: complete });
        } catch (e) {
          // The views are made and paid for; without the strip, video sends the front alone
          // until the sheet is next regenerated. Not worth failing the request over.
          console.warn(`[avatars] could not compose the sheet strip for ${avatarId}:`, e);
        }
      }

      // Conditioned on the front the views were made from (as before D339).
      const avatar = await updateAvatar(
        clientId, avatarId, withStatus(latest, { ...patch, sheet }), { ifFrontUrl: frontUrl },
      );
      if (!avatar) return preconditionFailed(clientId, avatarId, FRONT_CHANGED);

      const replaced = latest.sheet;
      if (replaced?.source.kind === "upload") {
        try {
          await removeObject(replaced.url);
        } catch {
          // Best-effort, as the upload finalize route.
        }
      }
      const spentCredits = await sumAvatarCredits(avatarId).catch(() => null);
      return apiOk({ avatar, creditsCharged, spentCredits, failed });
    }),
  );
}
```

- [ ] **Step 11: Run the route tests and the avatars suite**

Run: `npx vitest run "src/app/api/clients/[id]/avatars" src/lib/avatars`
Expected: PASS. `generate.test.ts` still passes (the snapshot only gains `view` when one is given).

- [ ] **Step 12: Commit**

```bash
git add src/lib/avatars src/lib/storage "src/app/api/clients/[id]/avatars/[avatarId]/sheet"
git commit -m "feat(avatars): the sheet is four views, composed into the strip video sends (D339)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The Avatar Studio shows the four views

**Files:**
- Create: `src/components/avatars/avatar-sheet-views.tsx`
- Modify: `src/components/avatars/avatar-studio-sheet-step.tsx`, `src/components/avatars/avatar-sheet-generate.tsx`, `src/components/avatars/avatar-studio-summary.tsx`, `src/components/avatars/avatar-likeness-consent.tsx`, `src/components/nodes/avatar-focus-view.tsx`
- Modify: `src/hooks/use-avatar-generation.ts`, `src/services/avatars.service.ts`, `src/lib/avatars/studio.ts`
- Modify (sheet uploads end): `src/app/api/clients/[id]/avatars/[avatarId]/images/route.ts`, `src/app/api/clients/[id]/avatars/[avatarId]/images/sign/route.ts`, `src/hooks/use-avatar-studio.ts`, `src/lib/avatars/utils.ts`
- Test: `src/lib/avatars/__tests__/studio.test.ts`, `src/app/api/clients/[id]/avatars/[avatarId]/images/route.test.ts`, `src/lib/avatars/__tests__/utils.test.ts`

**Interfaces:**
- Consumes: `hasFourViews`, `sheetKind`, `missingViews` (Task 1); `estimateSheetCredits` (Task 2); the sheet route's `{ avatar, creditsCharged, spentCredits, failed }`.
- Produces: `AvatarSheetViews` component `({ name, views, generating, stale?, marker? })` where `marker?: (view: AvatarViewId) => ReactNode` (spec 4 merge point); `sheetStatusLabel(avatar, optional: string): string` in `studio.ts`; `avatarsService.generateSheet(clientId, avatarId, modelId, views?) → { avatar, creditsCharged, spentCredits, failed: { view, label, error }[] }`; `useAvatarGeneration` returns `generatingViews: AvatarViewId[]` (replacing `generatingSheet`, which stays as a derived boolean) and `generateSheet(modelId, views?)`; `AvatarLikenessConsent` accepts `id?: string`.
- Removes (user's answer, handoff §2a: no sheet uploads): the Studio's sheet dropzone; `slot: "sheet"` on `POST …/images/sign` and `POST …/images` (now 400); `sheetChangePatch`. `avatarsService.uploadImage` and `useAvatarStudio().uploadImage` take `slot: "front"` only. `AvatarImageSlot` keeps `"sheet"`, which is still the storage folder generated views are written to.

- [ ] **Step 1: Write the failing test**

In `src/lib/avatars/__tests__/studio.test.ts`, add to the "the sheet line follows its state" block (import `makeImage`, `GENERATED`, `makeViews` from `./fixtures`):

```ts
    expect(stepStatusLine("sheet", snap({ avatar: makeAvatar({ sheet: makeImage(GENERATED), sheetViews: null }) }))).toBe("Three views");
    expect(stepStatusLine("sheet", snap({ avatar: makeAvatar({ sheetViews: makeViews() }) }))).toBe("Four views");
    expect(stepStatusLine("sheet", snap({ avatar: makeAvatar({ sheet: null, sheetViews: { ...makeViews(), left: null } }) }))).toBe("Missing a view");
    expect(stepStatusLine("sheet", snap({ avatar: makeAvatar({ sheet: makeImage(), sheetViews: null }) }))).toBe("Older sheet");
```

and a new case:

```ts
  it("the sheet step asks for four views", () => {
    const sheet = STUDIO_STEPS.find((s) => s.id === "sheet")!;
    expect(sheet.lede).toContain("Front, left, right and back");
  });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/avatars/__tests__/studio.test.ts`
Expected: FAIL — "Added" returned for each.

(The suite's own fixture: `makeImage()` with no argument is an upload, `makeImage(GENERATED)` a generated image, as Task 1's `sheetKind` test relies on.)

- [ ] **Step 3: Update `studio.ts`**

- Change the sheet step's `lede` to: `"Front, left, right and back, head to toe, each made from the front image. It keeps the face the same in every storyboard panel."`
- Add `"sheetViews"` to the `StudioAvatar` Pick list.
- Add, importing `hasFourViews`, `sheetKind` from `./utils`:

```ts
/** D339 — the sheet's state in one word, for the stepper and the summary card. */
export function sheetStatusLabel(
  avatar: Pick<Avatar, "sheet" | "sheetViews" | "sheetStale"> | null,
  optional: string,
): string {
  if (!avatar) return optional;
  const kind = sheetKind(avatar);
  if (kind === "none") return optional;
  if (avatar.sheetStale) return "Out of date";
  if (kind === "four-view") return hasFourViews(avatar) ? "Four views" : "Missing a view";
  if (kind === "three-view") return "Three views";
  return "Older sheet"; // an upload from before D339 ended sheet uploads
}
```

- In `stepStatusLine`, replace the `case "sheet":` body with:

```ts
    case "sheet":
      if (snap.sheetGenerating) return "Generating…";
      return sheetStatusLabel(a, optional);
```

In `src/components/avatars/avatar-studio-summary.tsx`, delete the local `sheetLabel` function and use `sheetStatusLabel(avatar, "Optional")` from `@/lib/avatars/studio` where it was called.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/avatars/__tests__/studio.test.ts`
Expected: PASS.

- [ ] **Step 5: The service and the hook**

In `src/services/avatars.service.ts`, replace `generateSheet` (import `AvatarViewId`):

```ts
  /** D339 — makes the sheet's views (all four, or only `views` when the sheet is current).
   *  `failed` names any view that did not come back; the others are kept. */
  async generateSheet(
    clientId: string,
    avatarId: string,
    modelId: string,
    views?: AvatarViewId[],
  ): Promise<{
    avatar: Avatar;
    creditsCharged: number;
    spentCredits: number | null;
    failed: { view: AvatarViewId; label: string; error: string }[];
  }> {
    const res = await fetch(`/api/clients/${clientId}/avatars/${avatarId}/sheet`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify(views ? { modelId, views } : { modelId }),
    });
    return readJson(res, "Could not generate the profile sheet.");
  }
```

In `src/hooks/use-avatar-generation.ts`:
- replace `const [generatingSheet, setGeneratingSheet] = useState(false);` with `const [generatingViews, setGeneratingViews] = useState<AvatarViewId[]>([]);` and add `const generatingSheet = generatingViews.length > 0;` right after it (so `pickFront`'s guard and every consumer of `generatingSheet` keep working);
- replace `generateSheet` with:

```ts
  const generateSheet = useCallback(async (modelId: string, views?: AvatarViewId[]) => {
    if (!avatarId || generatingSheet) return;
    setGeneratingViews(views ?? [...AVATAR_VIEWS]);
    try {
      const { avatar, spentCredits: total, failed } = await avatarsService.generateSheet(clientId, avatarId, modelId, views);
      onAvatar(avatar);
      for (const f of failed) toast.error(`The ${f.label} view failed: ${f.error}`);
      if (total === null) void refreshSpentCredits(avatarId);
      else applySpent(total);
    } catch (e) {
      toast.error(errorMessage(e, "Could not generate the profile sheet"));
      // A 409 (the front changed mid-generation) has already charged for what the server made.
      await refreshSpentCredits(avatarId);
    } finally {
      setGeneratingViews([]);
    }
  }, [clientId, avatarId, generatingSheet, onAvatar, refreshSpentCredits, applySpent]);
```

- import `AVATAR_VIEWS` from `@/lib/avatars/constants` and `AvatarViewId` from `@/lib/avatars/schema`;
- add `generatingViews` to the returned object (keep `generatingSheet`).

- [ ] **Step 6: The four tiles**

Create `src/components/avatars/avatar-sheet-views.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";
import { cn } from "@/lib/utils";
import { AVATAR_VIEWS, AVATAR_VIEW_LABELS } from "@/lib/avatars/constants";
import type { AvatarSheetViews as Views, AvatarViewId } from "@/lib/avatars/schema";

type Props = {
  /** The person's name, for alt text and the zoom title. */
  name: string;
  views: Views | null;
  /** Views being made right now: each shows a same-size placeholder. */
  generating: readonly AvatarViewId[];
  /** The views show an older front image: dimmed until they are remade. */
  stale?: boolean;
  /** Spec 4 merge point: a comment marker beside each view. */
  marker?: (view: AvatarViewId) => ReactNode;
};

// D339 — the sheet's four views as four tiles, Front, Left, Right, Back. Shared by the Avatar
// Studio's sheet step and Visualise's cast slot, so there is one way a sheet looks.
export function AvatarSheetViews({ name, views, generating, stale = false, marker }: Props) {
  const [zoomed, setZoomed] = useState<AvatarViewId | null>(null);
  const zoomedImage = zoomed ? views?.[zoomed] ?? null : null;

  return (
    <>
      <ul aria-label={`${name}: four views`} className="grid grid-cols-4 gap-2.5">
        {AVATAR_VIEWS.map((view) => {
          const image = views?.[view] ?? null;
          const busy = generating.includes(view);
          const label = AVATAR_VIEW_LABELS[view];
          return (
            <li key={view} className="relative flex min-w-0 flex-col gap-1">
              <div className="relative aspect-[3/4] overflow-hidden rounded-lg border border-border bg-muted">
                {busy ? (
                  <Skeleton aria-label={`Making the ${label} view`} className="absolute inset-0 rounded-none" />
                ) : image ? (
                  <Button
                    variant="ghost"
                    aria-label={`Open ${name}, ${label} view`}
                    onClick={() => setZoomed(view)}
                    className="absolute inset-0 h-full w-full cursor-zoom-in rounded-none p-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt="" className={cn("size-full object-cover", stale && "opacity-50")} />
                  </Button>
                ) : (
                  <ImageOff className="absolute inset-0 m-auto size-5 text-muted-foreground/50" strokeWidth={1.5} aria-hidden />
                )}
              </div>
              <span className="text-center text-xs text-muted-foreground">{label}</span>
              {marker?.(view)}
            </li>
          );
        })}
      </ul>
      {zoomed && zoomedImage && (
        <FullScreenImageZoom
          imageUrl={zoomedImage.url}
          title={`${name} · ${AVATAR_VIEW_LABELS[zoomed]}`}
          onClose={() => setZoomed(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 7: The Studio's sheet step**

Replace `src/components/avatars/avatar-sheet-generate.tsx` with:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { estimateSheetCredits } from "@/lib/avatars/generation";
import { AvatarCreditCost } from "./avatar-credit-cost";
import { AvatarAdvancedSettings } from "./avatar-advanced-settings";
import { AvatarModelSelect } from "./avatar-model-select";

// D339 — makes the four views from the front image: all four, or only the missing ones when the
// sheet is current. The model defaults to Nano Banana 2 and sits under Advanced; the choice lives
// in useAvatarGeneration so it survives leaving the step.
export function AvatarSheetGenerate({
  label, count, generating, disabled, modelId, onModelChange, onGenerate,
}: {
  /** "Generate the four views", "Regenerate the four views", "Make the missing view". */
  label: string;
  /** How many views the click makes, for its cost. */
  count: number;
  generating: boolean;
  disabled: boolean;
  modelId: string;
  onModelChange: (modelId: string) => void;
  onGenerate: (modelId: string) => void;
}) {
  const credits = estimateSheetCredits(modelId, count);
  return (
    <div className="flex flex-col items-start gap-1">
      <Button disabled={disabled || generating || credits === null} onClick={() => onGenerate(modelId)}>
        {generating ? "Generating…" : label}
        <AvatarCreditCost credits={credits} />
      </Button>
      <AvatarAdvancedSettings className="w-full max-w-sm">
        <Label htmlFor="avatar-sheet-model" className="text-xs text-muted-foreground">Image model</Label>
        <AvatarModelSelect id="avatar-sheet-model" value={modelId} onChange={onModelChange} />
      </AvatarAdvancedSettings>
    </div>
  );
}
```

Replace `src/components/avatars/avatar-studio-sheet-step.tsx` with:

```tsx
"use client";

import { useState } from "react";
import type { useAvatarGeneration } from "@/hooks/use-avatar-generation";
import type { useAvatarStudio } from "@/hooks/use-avatar-studio";
import { Button } from "@/components/ui/button";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";
import { AVATAR_VIEW_LABELS } from "@/lib/avatars/constants";
import { missingViews, sheetKind } from "@/lib/avatars/utils";
import { AvatarSheetGenerate } from "./avatar-sheet-generate";
import { AvatarSheetViews } from "./avatar-sheet-views";

type Props = {
  studio: ReturnType<typeof useAvatarStudio>;
  generation: ReturnType<typeof useAvatarGeneration>;
};

const NOTICE = "rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-sm";

// The Profile sheet step (D288, optional since D295, four views since D339): made from the front
// image, view by view. Sheets are no longer uploaded (D339). An avatar that still has an older
// single-image sheet, three-view or uploaded, can open it until its four views replace it.
export function AvatarStudioSheetStep({ studio: s, generation: g }: Props) {
  const [showOlder, setShowOlder] = useState(false);
  const avatar = s.avatar;
  const kind = avatar ? sheetKind(avatar) : "none";
  const older = kind === "three-view" || kind === "uploaded" ? avatar?.sheet ?? null : null;
  const missing = avatar ? missingViews(avatar) : [];
  const partial = kind === "four-view" && !avatar?.sheetStale && missing.length > 0;
  const working = s.uploading !== null || g.generatingSheet || g.picking !== null;
  const label = partial
    ? `Make the missing ${missing.length === 1 ? `${AVATAR_VIEW_LABELS[missing[0]]} view` : "views"}`
    : kind === "four-view" ? "Regenerate the four views" : "Generate the four views";

  return (
    <>
      {avatar?.sheetStale && kind !== "none" && (
        <p className={NOTICE}>The front image changed. Regenerate the four views so they show the same person.</p>
      )}
      {older && !avatar?.sheetStale && (
        <p className={NOTICE}>
          This avatar has an older single-image sheet. Generate the four views to replace it; storyboard
          panels need them.{" "}
          <Button variant="link" size="xs" className="h-auto p-0" onClick={() => setShowOlder(true)}>
            View it
          </Button>
        </p>
      )}
      <AvatarSheetViews
        name={s.name.trim() || "This avatar"}
        views={avatar?.sheetViews ?? null}
        generating={g.generatingViews}
        stale={avatar?.sheetStale ?? false}
      />
      <AvatarSheetGenerate
        label={label}
        count={partial ? missing.length : 4}
        generating={g.generatingSheet}
        disabled={working || !avatar?.front}
        modelId={g.sheetModelId}
        onModelChange={g.setSheetModelId}
        onGenerate={(modelId) => g.generateSheet(modelId, partial ? missing : undefined)}
      />
      {showOlder && older && (
        <FullScreenImageZoom imageUrl={older.url} title="Older profile sheet" onClose={() => setShowOlder(false)} />
      )}
    </>
  );
}
```

- [ ] **Step 7b: End sheet uploads (user's answer, handoff §2a)**

Every sheet is four generated views, so nothing may upload one any more. In `src/app/api/clients/[id]/avatars/[avatarId]/images/route.test.ts`, replace the `"a new sheet is current"` test with:

```ts
  it("refuses a sheet upload: sheets are four generated views (D339)", async () => {
    const { POST } = await import("./route");
    const res = await POST(req("images", { ...body, slot: "sheet", path: "clients/c1/avatars/a1/sheet/s.png" }), { params });
    expect(res.status).toBe(400);
    expect(updateAvatar).not.toHaveBeenCalled();
  });
```

and add to the `"POST images/sign"` block:

```ts
  it("will not sign a sheet upload (D339)", async () => {
    const { POST } = await import("./sign/route");
    const res = await POST(
      req("images/sign", { filename: "s.png", contentType: "image/png", size: 100, slot: "sheet" }),
      { params },
    );
    expect(res.status).toBe(400);
    expect(signAvatarImageUpload).not.toHaveBeenCalled();
  });
```

Run: `npx vitest run "src/app/api/clients/[id]/avatars/[avatarId]/images"`
Expected: FAIL on both (each route still accepts `"sheet"`).

Then:
- In both `images/sign/route.ts` and `images/route.ts`, change `slot: z.enum(["front", "sheet"])` to `slot: z.enum(["front"])`.
- In `images/route.ts`, drop `sheetChangePatch` from the import, use `frontChangePatch(current, image)` directly as the change, read `current.front` as `replaced`, and update the precondition comment to name the front upload only.
- Delete `sheetChangePatch` from `src/lib/avatars/utils.ts` and its `describe` block (and import) from `src/lib/avatars/__tests__/utils.test.ts`. Nothing else calls it once Task 2's route is in.
- In `src/services/avatars.service.ts`, `uploadImage`'s `slot` parameter becomes `slot: "front"`. In `src/hooks/use-avatar-studio.ts`, `uploadImage`'s `slot` parameter becomes `slot: "front"` and the "a front and a sheet drop together" comment loses the sheet. The `uploading` state keeps its `AvatarImageSlot | null` type.

Run: `npx vitest run "src/app/api/clients/[id]/avatars" src/lib/avatars`
Expected: PASS.

- [ ] **Step 8: Consent ids and the canvas focus view**

In `src/components/avatars/avatar-likeness-consent.tsx`, add `id?: string` to `Props`, default it to `"likeness-consent"` in the destructuring, and use it for the `Checkbox` `id` and the `Label` `htmlFor` (two Specific people on one Visualise page must not share an id).

In `src/components/nodes/avatar-focus-view.tsx`, give the profile sheet `Reference` its own shape, since the composed strip of four views is far wider than 16:9:

```tsx
                  <Reference label="Profile sheet" image={avatar.sheet}
                    aspect={avatar.sheet.width && avatar.sheet.height ? `${avatar.sheet.width} / ${avatar.sheet.height}` : "16 / 9"}
                    onZoom={() => setZoomed({ url: avatar.sheet!.url, title: "Profile sheet" })} />
```

and change the `<img>` inside `Reference` from `object-cover` to `object-contain`.

- [ ] **Step 9: Type check, lint, and look at it**

Run: `npx tsc --noEmit && npx eslint src/components/avatars src/hooks/use-avatar-generation.ts src/hooks/use-avatar-studio.ts src/services/avatars.service.ts src/lib/avatars "src/app/api/clients/[id]/avatars/[avatarId]/images"`
Expected: clean.

Run the app (`npm run dev`), open an avatar in the Avatar Studio, go to Profile sheet, click Generate the four views. Expected: four placeholders, then four tiles labelled Front, Left, Right, Back with the two profiles facing opposite edges; the stepper reads "Four views". There is no "add your own profile sheet" area. On an avatar with an older sheet (three-view or uploaded) the notice reads "This avatar has an older single-image sheet…" and **View it** opens that sheet full screen. The Look step's front upload still works. (This needs migration 0053 applied: Task 1 Step 8.)

- [ ] **Step 10: Commit**

```bash
git add src/components/avatars src/components/nodes/avatar-focus-view.tsx src/hooks/use-avatar-generation.ts src/hooks/use-avatar-studio.ts src/services/avatars.service.ts src/lib/avatars "src/app/api/clients/[id]/avatars/[avatarId]/images"
git commit -m "feat(avatars): the Studio's sheet step shows and makes four views; sheets are no longer uploaded (D339)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: An avatar a script uses cannot be archived

**Files:**
- Create: `src/lib/scripts/visualise/cast.ts`
- Create: `src/lib/db/script-visualise.ts`
- Modify: `src/app/api/clients/[id]/avatars/[avatarId]/route.ts`
- Test: `src/lib/scripts/visualise/__tests__/cast.test.ts`, `src/app/api/clients/[id]/avatars/[avatarId]/route.test.ts`

**Interfaces:**
- Produces: `VISUALISE_STAGES` (`["visualise", "in_review"]`), `isVisualiseStage(stage: ScriptStage): boolean`, `archiveRefusal(usedIn: string[]): string | null` in `cast.ts`; `listScriptsUsingAvatar(clientId: string, avatarId: string): Promise<string[]>` (labels such as `"Reel 01 · Golu starts today"`) in `src/lib/db/script-visualise.ts`. `DELETE …/avatars/:avatarId` answers 409 with `archiveRefusal`'s text while any live script's cast uses the avatar.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/scripts/visualise/__tests__/cast.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { archiveRefusal, isVisualiseStage } from "../cast";

describe("isVisualiseStage", () => {
  it("allows Visualise work in Visualise and In review, nowhere else", () => {
    expect(isVisualiseStage("visualise")).toBe(true);
    expect(isVisualiseStage("in_review")).toBe(true);
    expect(isVisualiseStage("generate")).toBe(false);
    expect(isVisualiseStage("approved")).toBe(false);
  });
});

describe("archiveRefusal (D346)", () => {
  it("says nothing for an avatar no script uses", () => {
    expect(archiveRefusal([])).toBeNull();
  });

  it("names the one script that uses it", () => {
    expect(archiveRefusal(["Reel 01 · Golu starts today"])).toBe(
      "This avatar is in Reel 01 · Golu starts today, so it can't be archived. Change it in that script first.",
    );
  });

  it("names every script when several use it", () => {
    expect(archiveRefusal(["Reel 01 · Golu starts today", "Reel 16 · Harvest week"])).toBe(
      "This avatar is in 2 scripts (Reel 01 · Golu starts today, Reel 16 · Harvest week), so it can't be archived. Change it in those scripts first.",
    );
  });
});
```

In `src/app/api/clients/[id]/avatars/[avatarId]/route.test.ts`, add beside the other mocks:

```ts
vi.mock("@/lib/db/script-visualise", () => ({ listScriptsUsingAvatar: vi.fn() }));
```

import it (`import { listScriptsUsingAvatar } from "@/lib/db/script-visualise";`), add `vi.mocked(listScriptsUsingAvatar).mockResolvedValue([]);` to `beforeEach`, and add:

```ts
  it("DELETE refuses while a script uses the avatar, and archives nothing (D346)", async () => {
    vi.mocked(listScriptsUsingAvatar).mockResolvedValue(["Reel 01 · Golu starts today"]);
    const { DELETE } = await import("./route");
    const res = await DELETE(new NextRequest(url, { method: "DELETE" }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Reel 01 · Golu starts today");
    expect(archiveAvatar).not.toHaveBeenCalled();
  });

  it("DELETE archives an avatar no script uses", async () => {
    vi.mocked(archiveAvatar).mockResolvedValue(true);
    const { DELETE } = await import("./route");
    const res = await DELETE(new NextRequest(url, { method: "DELETE" }), { params });
    expect(res.status).toBe(200);
    expect(listScriptsUsingAvatar).toHaveBeenCalledWith("c1", "a1");
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/scripts/visualise "src/app/api/clients/[id]/avatars/[avatarId]/route.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/scripts/visualise/cast.ts`:

```ts
import type { ScriptStage } from "@/lib/scripts/constants";

// Spec 3 — the rules for what Visualise may change, in one place.

/** D346 — cast links, panels and picks change while the script is at Visualise, and while it
 *  is In review (spec 4: editing stays allowed; each share is a frozen copy). */
export const VISUALISE_STAGES = ["visualise", "in_review"] as const satisfies readonly ScriptStage[];

export function isVisualiseStage(stage: ScriptStage): boolean {
  return (VISUALISE_STAGES as readonly ScriptStage[]).includes(stage);
}

/** D346 — why an avatar cannot be archived, or null when no live script uses it. */
export function archiveRefusal(usedIn: string[]): string | null {
  if (usedIn.length === 0) return null;
  if (usedIn.length === 1) {
    return `This avatar is in ${usedIn[0]}, so it can't be archived. Change it in that script first.`;
  }
  return `This avatar is in ${usedIn.length} scripts (${usedIn.join(", ")}), so it can't be archived. Change it in those scripts first.`;
}
```

Create `src/lib/db/script-visualise.ts`:

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/avatars/utils";
import { reelLabel } from "@/lib/scripts/utils";

// Spec 3's reads and writes on client_scripts. Kept apart from src/lib/db/scripts.ts so specs 2
// and 4, built at the same time, do not edit the same file (plan: merge points). Every query
// filters on client_id as well as the id, as src/lib/db/scripts.ts does.

type StoredHeader = { header?: { reelNumber?: number | null; title?: string } };

/** D346 — the live scripts whose cast uses this avatar, as "Reel 01 · Golu starts today". */
export async function listScriptsUsingAvatar(clientId: string, avatarId: string): Promise<string[]> {
  if (!isUuid(avatarId)) return [];
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_scripts")
    .select("doc")
    .eq("client_id", clientId)
    .is("archived_at", null)
    // jsonb containment: some cast member has this avatarId.
    .contains("doc", { cast: [{ avatarId }] });
  if (error) throw error;
  return ((data ?? []) as { doc: StoredHeader }[]).map(({ doc }) =>
    [reelLabel(doc.header?.reelNumber ?? null), doc.header?.title].filter(Boolean).join(" · ") || "an untitled script",
  );
}
```

In `src/app/api/clients/[id]/avatars/[avatarId]/route.ts`, import `listScriptsUsingAvatar` and `archiveRefusal`, and make DELETE check first:

```ts
// DELETE /api/clients/:id/avatars/:avatarId — archives (D287), unless a live script's cast uses
// the avatar (D346): archiving would leave that script's people without a face.
export async function DELETE(req: Request, { params }: Ctx) {
  const { avatarId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not archive the avatar.", async () => {
      const refusal = archiveRefusal(await listScriptsUsingAvatar(clientId, avatarId));
      if (refusal) return apiError(refusal, 409);
      const archived = await archiveAvatar(clientId, avatarId);
      if (!archived) return apiError(NOT_FOUND, 404);
      return apiOk({ ok: true as const });
    }),
  );
}
```

The Studio's Archive and Discard draft already show the server's message in their error toast (`use-avatar-studio.ts`, `archive`), so no UI change is needed. The check and the archive are two statements; a script linking the avatar between them is accepted as a narrow race (the spec 1 handoff keeps its archived-avatar safeguard).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/scripts/visualise "src/app/api/clients/[id]/avatars/[avatarId]/route.test.ts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scripts/visualise src/lib/db/script-visualise.ts "src/app/api/clients/[id]/avatars/[avatarId]/route.ts" "src/app/api/clients/[id]/avatars/[avatarId]/route.test.ts"
git commit -m "feat(avatars): an avatar a script uses cannot be archived (D346)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Link a cast member to an avatar, and Reopen

**Files:**
- Create: `src/lib/scripts/visualise/schema.ts`, `src/lib/scripts/visualise/__tests__/fixtures.ts`
- Modify: `src/lib/scripts/visualise/cast.ts`, `src/lib/db/script-visualise.ts`
- Create: `src/app/api/clients/[id]/scripts/[scriptId]/cast/[castId]/route.ts`
- Create: `src/app/api/clients/[id]/scripts/[scriptId]/reopen/route.ts`
- Test: `src/lib/scripts/visualise/__tests__/cast.test.ts`, `src/app/api/clients/[id]/scripts/[scriptId]/cast/[castId]/route.test.ts`, `src/app/api/clients/[id]/scripts/[scriptId]/reopen/route.test.ts`

**Interfaces:**
- Consumes: `isVisualiseStage` (Task 4); `rowToScript`, `ScriptRow` from `src/lib/scripts/rows.ts`; `getScript` from `src/lib/db/scripts.ts`; `getAvatar` from `src/lib/db/avatars.ts`.
- Produces: `withCastAvatar(rawDoc: unknown, castId: string, avatarId: string | null): CastLinkResult` where `CastLinkResult = { ok: true; doc: Record<string, unknown> } | { ok: false; error: string; status: 404 | 409 | 422 }`; `setCastAvatar(clientId, scriptId, castId, avatarId): Promise<{ ok: true; script: Script } | { ok: false; error: string; status: number }>`; `reopenScript(clientId, scriptId): Promise<Script | null>`; types `PanelFaces`, `PanelTake` in `src/lib/scripts/visualise/schema.ts`; test fixtures `SCRIPT_ID`, `MEENAKSHI_AVATAR`, `HUSBAND_AVATAR`, `reel01Doc()`, `linkedDoc()`, `makeScript(doc?, stage?)`, `readyAvatar(id, prefix, over?)`, `avatarMap(...avatars)`, `makeTake(over?)`. Routes: `PUT /api/clients/:id/scripts/:scriptId/cast/:castId` body `{ avatarId: uuid | null }` → `{ script }`; `POST /api/clients/:id/scripts/:scriptId/reopen` → `{ script }`.

- [ ] **Step 1: The take type and the shared test fixtures**

Create `src/lib/scripts/visualise/schema.ts` (Task 9 adds to it):

```ts
// Spec 3 — Visualise's own records, kept beside the script (D337). Pure types.

/** For each cast member on screen when a panel was drawn: whose avatar, and its face then. */
export type PanelFaces = Record<string, { avatarId: string; faceKey: string }>;

export type PanelTake = {
  id: string;
  scriptId: string;
  shotId: string;
  status: "running" | "succeeded" | "failed";
  url: string | null;
  width: number | null;
  height: number | null;
  /** D344 — the exact prompt sent. */
  prompt: string;
  /** A person wrote this prompt in the prompt box, rather than the script building it. */
  promptEdited: boolean;
  /** D343 — what the panel was drawn from; a mismatch with today's means Out of date. */
  shotKey: string;
  faces: PanelFaces;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Create `src/lib/scripts/visualise/__tests__/fixtures.ts`:

```ts
import { scriptDocSchema, type Script, type ScriptDoc } from "@/lib/scripts/schema";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { makeAvatar, makeViews } from "@/lib/avatars/__tests__/fixtures";
import type { Avatar } from "@/lib/avatars/schema";
import type { PanelTake } from "../schema";

export const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
export const MEENAKSHI_AVATAR = "7a2d3c4e-0000-4000-8000-000000000002";
export const HUSBAND_AVATAR = "7a2d3c4e-0000-4000-8000-000000000003";

/** The seeded Reel 01, as the app reads it: Meenakshi (lead) and her husband, 14 shots. */
export function reel01Doc(): ScriptDoc {
  return scriptDocSchema.parse(structuredClone(reel01));
}

/** Reel 01 with both people linked to an avatar. */
export function linkedDoc(): ScriptDoc {
  const doc = reel01Doc();
  doc.cast = doc.cast.map((c) => ({ ...c, avatarId: c.id === "meenakshi" ? MEENAKSHI_AVATAR : HUSBAND_AVATAR }));
  return doc;
}

export function makeScript(doc: ScriptDoc = linkedDoc(), stage: Script["stage"] = "visualise"): Script {
  return {
    id: SCRIPT_ID, clientId: "c1", stage, doc, approvedAt: null,
    createdAt: "2026-10-08T09:00:00.000Z", updatedAt: "2026-10-08T09:00:00.000Z",
  };
}

/** A saved avatar with a current four-view sheet; `prefix` makes its image urls its own. */
export function readyAvatar(id: string, prefix: string, over: Partial<Avatar> = {}): Avatar {
  return makeAvatar({
    id, name: prefix, status: "ready", sheetViews: makeViews(prefix),
    front: { ...makeAvatar().front!, url: `https://storage.googleapis.com/b/${prefix}-portrait.png` },
    ...over,
  });
}

export function avatarMap(...avatars: Avatar[]): Map<string, Avatar> {
  return new Map(avatars.map((a) => [a.id, a]));
}

export function makeTake(over: Partial<PanelTake> = {}): PanelTake {
  return {
    id: "t1", scriptId: SCRIPT_ID, shotId: "s01", status: "succeeded",
    url: "https://storage.googleapis.com/b/t1.png", width: 768, height: 1365,
    prompt: "p", promptEdited: false, shotKey: "k", faces: {}, error: null,
    createdAt: "2026-10-08T10:00:00.000Z", updatedAt: "2026-10-08T10:00:00.000Z",
    ...over,
  };
}
```

- [ ] **Step 2: Write the failing pure tests**

Append to `src/lib/scripts/visualise/__tests__/cast.test.ts` (add `withCastAvatar` to the import from `../cast`, and `import reel01 from "@/lib/scripts/fixtures/reel-01.json";`):

```ts
const A = "7a2d3c4e-0000-4000-8000-000000000002";
const B = "7a2d3c4e-0000-4000-8000-000000000003";
type RawDoc = Record<string, unknown> & { cast: Record<string, unknown>[] };
const raw = () => structuredClone(reel01) as unknown as RawDoc;

describe("withCastAvatar", () => {
  it("writes only the one cast member's avatarId and leaves every other key as stored", () => {
    const doc: RawDoc = { ...raw(), notes: "kept by spec 2" };
    doc.cast[1] = { ...doc.cast[1], extra: "kept" };
    const result = withCastAvatar(doc, "meenakshi", A);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cast = result.doc.cast as Record<string, unknown>[];
    expect(cast[0].avatarId).toBe(A);
    expect(cast[1]).toEqual(doc.cast[1]);
    expect(result.doc.notes).toBe("kept by spec 2");
    expect(result.doc.shots).toEqual(doc.shots);
  });

  it("unlinks with null", () => {
    const doc = raw();
    doc.cast[0] = { ...doc.cast[0], avatarId: A };
    const result = withCastAvatar(doc, "meenakshi", null);
    expect(result.ok && (result.doc.cast as Record<string, unknown>[])[0].avatarId).toBeNull();
  });

  it("refuses an avatar another person in this script already has, and says who", () => {
    const doc = raw();
    doc.cast[0] = { ...doc.cast[0], avatarId: A };
    expect(withCastAvatar(doc, "husband", A)).toEqual({
      ok: false, status: 409, error: "Meenakshi already has this avatar in this script.",
    });
    expect(withCastAvatar(doc, "husband", B).ok).toBe(true);
  });

  it("is a 404 for a person the script does not have, and a 422 for a doc with no cast", () => {
    expect(withCastAvatar(raw(), "nobody", A)).toMatchObject({ ok: false, status: 404 });
    expect(withCastAvatar({ header: {} }, "meenakshi", A)).toMatchObject({ ok: false, status: 422 });
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/lib/scripts/visualise/__tests__/cast.test.ts`
Expected: FAIL — `withCastAvatar` is not exported.

- [ ] **Step 4: Implement `withCastAvatar`**

Append to `src/lib/scripts/visualise/cast.ts` (import `scriptDocSchema` from `@/lib/scripts/schema`):

```ts
export type CastLinkResult =
  | { ok: true; doc: Record<string, unknown> }
  | { ok: false; error: string; status: 404 | 409 | 422 };

/** D337 — the one write Visualise makes into a script: a cast member's avatar link, applied to
 *  the document AS STORED, so any key this code does not know (spec 2's, spec 4's) survives.
 *  Two people in one script never share an avatar: each needs their own face. */
export function withCastAvatar(rawDoc: unknown, castId: string, avatarId: string | null): CastLinkResult {
  const doc = rawDoc as { cast?: unknown } | null;
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.cast)) {
    return { ok: false, error: "This script has no cast.", status: 422 };
  }
  const cast = doc.cast as Record<string, unknown>[];
  const index = cast.findIndex((c) => c?.id === castId);
  if (index < 0) return { ok: false, error: "No such person in this script.", status: 404 };
  if (avatarId) {
    const other = cast.find((c, i) => i !== index && c?.avatarId === avatarId);
    if (other) {
      return { ok: false, error: `${String(other.name ?? "Someone else")} already has this avatar in this script.`, status: 409 };
    }
  }
  const next = { ...(doc as Record<string, unknown>), cast: cast.map((c, i) => (i === index ? { ...c, avatarId } : c)) };
  if (!scriptDocSchema.safeParse(next).success) {
    return { ok: false, error: "The script could not be saved with that change.", status: 422 };
  }
  return { ok: true, doc: next };
}
```

- [ ] **Step 5: Run the pure tests**

Run: `npx vitest run src/lib/scripts/visualise/__tests__/cast.test.ts`
Expected: PASS.

- [ ] **Step 6: The database writes**

Append to `src/lib/db/script-visualise.ts` (imports: `rowToScript`, `type ScriptRow` from `@/lib/scripts/rows`; `type Script` from `@/lib/scripts/schema`; `isScriptStage` from `@/lib/scripts/constants`; `isVisualiseStage`, `withCastAvatar` from `@/lib/scripts/visualise/cast`):

```ts
type Failure = { ok: false; error: string; status: number };

/** D337 — set or clear one cast member's avatar. Optimistic on `updated_at`: if the script was
 *  written between the read and the write, the write matches nothing and is tried once more on
 *  the fresh row, so a concurrent change is never overwritten. */
export async function setCastAvatar(
  clientId: string,
  scriptId: string,
  castId: string,
  avatarId: string | null,
): Promise<{ ok: true; script: Script } | Failure> {
  if (!isUuid(scriptId)) return { ok: false, error: "Script not found.", status: 404 };
  const supabase = createServerSupabase();
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: row, error: readError } = await supabase
      .from("client_scripts").select("*")
      .eq("id", scriptId).eq("client_id", clientId).is("archived_at", null)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) return { ok: false, error: "Script not found.", status: 404 };
    const stored = row as ScriptRow;
    if (!isScriptStage(stored.stage) || !isVisualiseStage(stored.stage)) {
      return { ok: false, error: "Avatars can be changed only while the script is in Visualise or In review.", status: 409 };
    }
    const next = withCastAvatar(stored.doc, castId, avatarId);
    if (!next.ok) return next;
    const { data, error } = await supabase
      .from("client_scripts")
      .update({ doc: next.doc, updated_at: new Date().toISOString() })
      .eq("id", scriptId).eq("client_id", clientId).eq("updated_at", stored.updated_at)
      .select("*").maybeSingle();
    if (error) throw error;
    if (data) {
      const script = rowToScript(data as ScriptRow);
      return script ? { ok: true, script } : { ok: false, error: "The script could not be read back.", status: 500 };
    }
  }
  return { ok: false, error: "The script changed at the same time. Try again.", status: 409 };
}

/** D346 — Reopen: Visualise → Generate, the only stage move spec 3 makes. Conditioned on the
 *  stage, so a script someone already moved is not moved twice. Null when it was not at Visualise. */
export async function reopenScript(clientId: string, scriptId: string): Promise<Script | null> {
  if (!isUuid(scriptId)) return null;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("client_scripts")
    .update({ stage: "generate", updated_at: new Date().toISOString() })
    .eq("id", scriptId).eq("client_id", clientId).eq("stage", "visualise").is("archived_at", null)
    .select("*").maybeSingle();
  if (error) throw error;
  return data ? rowToScript(data as ScriptRow) : null;
}
```

- [ ] **Step 7: Write the route tests**

Create `src/app/api/clients/[id]/scripts/[scriptId]/cast/[castId]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";
import { makeScript, SCRIPT_ID, MEENAKSHI_AVATAR } from "@/lib/scripts/visualise/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/avatars", () => ({ getAvatar: vi.fn() }));
vi.mock("@/lib/db/script-visualise", () => ({ setCastAvatar: vi.fn() }));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getAvatar } from "@/lib/db/avatars";
import { setCastAvatar } from "@/lib/db/script-visualise";

const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID, castId: "meenakshi" });
const put = (body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/cast/meenakshi`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
  vi.mocked(getAvatar).mockResolvedValue(makeAvatar({ id: MEENAKSHI_AVATAR }));
  vi.mocked(setCastAvatar).mockResolvedValue({ ok: true, script: makeScript() });
});

describe("PUT …/scripts/:scriptId/cast/:castId", () => {
  it("links this client's avatar to the cast member", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(put({ avatarId: MEENAKSHI_AVATAR }), { params });
    expect(res.status).toBe(200);
    expect(getAvatar).toHaveBeenCalledWith("c1", MEENAKSHI_AVATAR);
    expect(setCastAvatar).toHaveBeenCalledWith("c1", SCRIPT_ID, "meenakshi", MEENAKSHI_AVATAR);
  });

  it("unlinks with null without looking up an avatar", async () => {
    const { PUT } = await import("./route");
    expect((await PUT(put({ avatarId: null }), { params })).status).toBe(200);
    expect(getAvatar).not.toHaveBeenCalled();
  });

  it("is a 404 for another client's avatar or an archived one", async () => {
    vi.mocked(getAvatar).mockResolvedValueOnce(null);
    const { PUT } = await import("./route");
    expect((await PUT(put({ avatarId: MEENAKSHI_AVATAR }), { params })).status).toBe(404);
    vi.mocked(getAvatar).mockResolvedValueOnce(makeAvatar({ archivedAt: "2026-10-08T00:00:00.000Z" }));
    expect((await PUT(put({ avatarId: MEENAKSHI_AVATAR }), { params })).status).toBe(404);
    expect(setCastAvatar).not.toHaveBeenCalled();
  });

  it("passes the write's refusal through with its status", async () => {
    vi.mocked(setCastAvatar).mockResolvedValue({ ok: false, error: "Meenakshi already has this avatar in this script.", status: 409 });
    const { PUT } = await import("./route");
    const res = await PUT(put({ avatarId: MEENAKSHI_AVATAR }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Meenakshi already has this avatar in this script.");
  });

  it("is a 400 for a body that is not an avatar id", async () => {
    const { PUT } = await import("./route");
    expect((await PUT(put({ avatarId: "not-a-uuid" }), { params })).status).toBe(400);
  });
});
```

Create `src/app/api/clients/[id]/scripts/[scriptId]/reopen/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeScript, SCRIPT_ID } from "@/lib/scripts/visualise/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-visualise", () => ({ reopenScript: vi.fn() }));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { reopenScript } from "@/lib/db/script-visualise";

const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const post = () => new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/reopen`, { method: "POST" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
});

describe("POST …/scripts/:scriptId/reopen", () => {
  it("sends a Visualise script back to Generate", async () => {
    vi.mocked(getScript).mockResolvedValue(makeScript());
    vi.mocked(reopenScript).mockResolvedValue(makeScript(undefined, "generate"));
    const { POST } = await import("./route");
    const res = await POST(post(), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).script.stage).toBe("generate");
  });

  it("refuses from any other stage", async () => {
    vi.mocked(getScript).mockResolvedValue(makeScript(undefined, "in_review"));
    const { POST } = await import("./route");
    expect((await POST(post(), { params })).status).toBe(409);
    expect(reopenScript).not.toHaveBeenCalled();
  });

  it("is a 409 when someone moved it in the meantime, and a 404 for a script that is not there", async () => {
    vi.mocked(getScript).mockResolvedValueOnce(makeScript());
    vi.mocked(reopenScript).mockResolvedValue(null);
    const { POST } = await import("./route");
    expect((await POST(post(), { params })).status).toBe(409);
    vi.mocked(getScript).mockResolvedValueOnce(null);
    expect((await POST(post(), { params })).status).toBe(404);
  });
});
```

- [ ] **Step 8: Run them to see them fail**

Run: `npx vitest run "src/app/api/clients/[id]/scripts/[scriptId]/cast" "src/app/api/clients/[id]/scripts/[scriptId]/reopen"`
Expected: FAIL — route modules not found.

- [ ] **Step 9: The routes**

Create `src/app/api/clients/[id]/scripts/[scriptId]/cast/[castId]/route.ts`:

```ts
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getAvatar } from "@/lib/db/avatars";
import { setCastAvatar } from "@/lib/db/script-visualise";

type Ctx = { params: Promise<{ id: string; scriptId: string; castId: string }> };

const Body = z.object({ avatarId: z.uuid().nullable() });

// PUT /api/clients/:id/scripts/:scriptId/cast/:castId — D337: the one write Visualise makes into
// a script, a cast member's avatar link. The avatar must be this client's and not archived;
// drafts are allowed, because the inline maker links its draft as soon as it exists.
export async function PUT(req: Request, { params }: Ctx) {
  const { scriptId, castId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not change the avatar.", async () => {
      const parsed = Body.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Invalid request body.", 400);
      const { avatarId } = parsed.data;
      if (avatarId) {
        const avatar = await getAvatar(clientId, avatarId);
        if (!avatar || avatar.archivedAt) return apiError("Avatar not found.", 404);
      }
      const result = await setCastAvatar(clientId, scriptId, castId, avatarId);
      if (!result.ok) return apiError(result.error, result.status);
      return apiOk({ script: result.script });
    }),
  );
}
```

Create `src/app/api/clients/[id]/scripts/[scriptId]/reopen/route.ts`:

```ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getScript } from "@/lib/db/scripts";
import { reopenScript } from "@/lib/db/script-visualise";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

const ONLY_VISUALISE = "Only a script in Visualise can be reopened.";

// POST /api/clients/:id/scripts/:scriptId/reopen — D346: Visualise → Generate, so the script's
// text can change (spec 2 owns editing). Avatars, panels and takes are kept; the panels of
// shots that change are marked out of date when the script comes back (D343).
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not reopen the script.", async () => {
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      if (script.stage !== "visualise") return apiError(ONLY_VISUALISE, 409);
      const reopened = await reopenScript(clientId, scriptId);
      if (!reopened) return apiError(ONLY_VISUALISE, 409);
      return apiOk({ script: reopened });
    }),
  );
}
```

- [ ] **Step 10: Run the tests**

Run: `npx vitest run src/lib/scripts/visualise "src/app/api/clients/[id]/scripts"`
Expected: PASS (spec 1's script route tests still pass).

- [ ] **Step 11: Commit**

```bash
git add src/lib/scripts/visualise src/lib/db/script-visualise.ts "src/app/api/clients/[id]/scripts/[scriptId]/cast" "src/app/api/clients/[id]/scripts/[scriptId]/reopen"
git commit -m "feat(scripts): link a cast member to an avatar, and Reopen (D337, D346)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: One billed image run for avatars and panels

**Files:**
- Create: `src/lib/image-gen/billed-run.ts`
- Modify: `src/lib/avatars/generate.ts`
- Modify: `src/lib/db/generations.ts`, `src/lib/db/types.ts`
- Modify: `src/lib/storage/paths.ts`, `src/lib/storage/index.ts`
- Create: `src/lib/scripts/visualise/constants.ts`, `src/lib/scripts/visualise/run-panel.ts`
- Test: `src/lib/image-gen/__tests__/billed-run.test.ts`, `src/lib/db/generations.test.ts`, `src/lib/storage/paths.test.ts`, `src/lib/scripts/visualise/__tests__/run-panel.test.ts`; `src/lib/avatars/__tests__/generate.test.ts` must still pass unchanged.

**Interfaces:**
- Produces: `runBilledImageGeneration(args: BilledImageArgs): Promise<{ generation: GenerationRow; creditsCharged: number }>` with `BilledImageArgs = { owner: { avatarId: string } | { scriptId: string }; orgId; clientId; userId; userEmail: string | null; modelId; aspect; prompt; referenceUrls: string[]; inputsSnapshot: Record<string, unknown>; store: (bytes: Buffer, mimeType: string) => Promise<{ url: string }> }`; `insertGeneration` accepts `scriptId?`; `GenerationRow.script_id?: string | null`; `pathForScriptPanel({ clientId, scriptId, shotId, ext })`; `uploadScriptPanel({ clientId, scriptId, shotId, ext, body, contentType })`; constants `PANEL_MODEL_ID`, `PANEL_ASPECTS`, `PANEL_DEFAULT_ASPECT`, `PANEL_PROMPT_MAX`, `PANEL_RUNNING_TIMEOUT_MS`, `PANEL_TIMED_OUT`, `GENERATE_ALL_CONCURRENCY`; `runPanelGeneration({ clientId, scriptId, shotId, orgId, userId, userEmail, aspect, prompt, referenceUrls })`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/image-gen/__tests__/billed-run.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const generate = vi.fn();
vi.mock("@/lib/image-gen/registry", () => ({
  imageGenRegistry: {
    "gemini:gemini-3.1-flash-image": {
      schema: { safeParse: (p: unknown) => ({ success: true, data: p }) },
      generate: (...a: unknown[]) => generate(...a),
    },
  },
}));
vi.mock("@/lib/db/generations", () => ({ insertGeneration: vi.fn(), succeedGeneration: vi.fn(), failGeneration: vi.fn() }));
vi.mock("@/lib/db/credit-transactions", () => {
  class CreditLimitError extends Error {}
  return { reserveCredits: vi.fn(), settleGeneration: vi.fn(), refundReservation: vi.fn(), CreditLimitError };
});
vi.mock("sharp", () => ({ default: () => ({ metadata: async () => ({ width: 768, height: 1365 }) }) }));

import { runBilledImageGeneration } from "../billed-run";
import { insertGeneration, failGeneration } from "@/lib/db/generations";
import { reserveCredits, refundReservation } from "@/lib/db/credit-transactions";

const BYTES = Buffer.from("png");
const store = vi.fn();
const args = () => ({
  owner: { scriptId: "s1" }, orgId: "org-1", clientId: "c1", userId: "u1", userEmail: null,
  modelId: "gemini:gemini-3.1-flash-image", aspect: "9:16", prompt: "A panel.",
  referenceUrls: ["https://x/front.png"], inputsSnapshot: { slot: "panel", shotId: "s01" }, store,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(failGeneration).mockResolvedValue(undefined);
  vi.mocked(refundReservation).mockResolvedValue(undefined);
  vi.mocked(insertGeneration).mockResolvedValue({ id: "g1", created_at: "x", status: "running" } as never);
  vi.mocked(reserveCredits).mockResolvedValue({ ok: true });
  store.mockResolvedValue({ url: "https://storage.googleapis.com/b/panel.png" });
  generate.mockResolvedValue({ imageBase64: BYTES.toString("base64"), mimeType: "image/png", tokensUsed: { total_tokens: 0 }, costUsd: 0.067 });
});

describe("runBilledImageGeneration", () => {
  it("records a script-owned generation and hands the provider's bytes to the owner's store", async () => {
    const out = await runBilledImageGeneration(args());
    expect(insertGeneration).toHaveBeenCalledWith(expect.objectContaining({
      scriptId: "s1", orgId: "org-1", type: "image", inputsSnapshot: { slot: "panel", shotId: "s01" },
    }));
    expect(Buffer.compare(store.mock.calls[0][0], BYTES)).toBe(0);
    expect(store.mock.calls[0][1]).toBe("image/png");
    expect(out.generation).toMatchObject({ status: "succeeded", output_snapshot: "https://storage.googleapis.com/b/panel.png" });
    expect(out.generation.meta).toMatchObject({ width: 768, height: 1365 });
  });

  it("fails and refunds when the store throws", async () => {
    store.mockRejectedValue(new Error("bucket down"));
    await expect(runBilledImageGeneration(args())).rejects.toThrow("bucket down");
    expect(refundReservation).toHaveBeenCalledWith({ orgId: "org-1", generationId: "g1" });
  });
});
```

In `src/lib/db/generations.test.ts`, inside `describe("insertGeneration")` add:

```ts
  it("writes a script-owned row for a storyboard panel (D337)", async () => {
    await insertGeneration({ scriptId: "s1", orgId: "org-1", type: "image" });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ node_id: null, avatar_id: null, script_id: "s1" }));
  });
```

In `src/lib/storage/paths.test.ts` (import `pathForScriptPanel`):

```ts
describe("pathForScriptPanel", () => {
  it("keeps a script's panels under the script, one folder per shot", () => {
    const path = pathForScriptPanel({ clientId: "c1", scriptId: "s1", shotId: "s01", ext: "png" });
    expect(path).toMatch(/^clients\/c1\/scripts\/s1\/panels\/s01\/panel__.+\.png$/);
  });

  it("never lets a shot id leave its folder", () => {
    expect(pathForScriptPanel({ clientId: "c1", scriptId: "s1", shotId: "../x", ext: "png" })).toContain("/panels/x/");
  });
});
```

Create `src/lib/scripts/visualise/__tests__/run-panel.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/image-gen/billed-run", () => ({ runBilledImageGeneration: vi.fn() }));
vi.mock("@/lib/storage", () => ({ uploadScriptPanel: vi.fn() }));

import { runBilledImageGeneration } from "@/lib/image-gen/billed-run";
import { uploadScriptPanel } from "@/lib/storage";
import { runPanelGeneration } from "../run-panel";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runBilledImageGeneration).mockResolvedValue({ generation: { id: "g1" } as never, creditsCharged: 7 });
});

describe("runPanelGeneration", () => {
  it("draws with Nano Banana 2 for the script, and stores the panel under its shot", async () => {
    await runPanelGeneration({
      clientId: "c1", scriptId: "s1", shotId: "s06", orgId: "org-1", userId: "u1", userEmail: null,
      aspect: "9:16", prompt: "A panel.", referenceUrls: ["a", "b"],
    });
    const call = vi.mocked(runBilledImageGeneration).mock.calls[0][0];
    expect(call).toMatchObject({
      owner: { scriptId: "s1" }, modelId: "gemini:gemini-3.1-flash-image", aspect: "9:16",
      inputsSnapshot: { slot: "panel", shotId: "s06", prompt: "A panel.", referenceUrls: ["a", "b"] },
    });
    await call.store(Buffer.from("x"), "image/png");
    expect(uploadScriptPanel).toHaveBeenCalledWith(expect.objectContaining({ clientId: "c1", scriptId: "s1", shotId: "s06", ext: "png" }));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/image-gen/__tests__/billed-run.test.ts src/lib/db/generations.test.ts src/lib/storage/paths.test.ts src/lib/scripts/visualise/__tests__/run-panel.test.ts`
Expected: FAIL — missing modules and exports.

- [ ] **Step 3: A script can own a generation**

In `src/lib/db/types.ts`, in `GenerationRow` after `avatar_id`, add:

```ts
  // D337 — set for a storyboard panel (migration 0053). Optional so older literals still type.
  script_id?: string | null;
```

In `src/lib/db/generations.ts`, `insertGeneration`: add `scriptId?: string;` to the input (comment: "or a script, for a storyboard panel (D337)"), change the guard to

```ts
  if (!input.nodeId && !input.avatarId && !input.scriptId) {
    throw new Error("A generation must belong to a node or an avatar, or a script.");
  }
```

(the existing test matches `/node or an avatar/`, which this still contains) and add `script_id: input.scriptId ?? null,` after `avatar_id` in the insert.

- [ ] **Step 4: Extract the billed run**

Create `src/lib/image-gen/billed-run.ts` by moving the body of `runAvatarGeneration` into it, generalised over the owner and the store:

```ts
import "server-only";
import sharp from "sharp";
import { imageGenRegistry } from "@/lib/image-gen/registry";
import { computeImageCost } from "@/lib/image-gen/cost";
import { usdToFinalCredits } from "@/lib/credits/units";
import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
import {
  reserveCredits, settleGeneration, refundReservation, CreditLimitError,
} from "@/lib/db/credit-transactions";
import type { GenerationRow } from "@/lib/db/types";
import { avatarImageParams, estimateAvatarImageCostUsd } from "@/lib/avatars/generation";

/** D291, D337 — who a generation belongs to: an avatar (Studio images) or a script (panels). */
export type GenerationOwner = { avatarId: string } | { scriptId: string };

export type BilledImageArgs = {
  owner: GenerationOwner;
  orgId: string;
  clientId: string;
  userId: string;
  userEmail: string | null;
  modelId: string;
  aspect: string;
  prompt: string;
  referenceUrls: string[];
  inputsSnapshot: Record<string, unknown>;
  /** Stores the provider's bytes, as they arrived, wherever the owner keeps its images. */
  store: (bytes: Buffer, mimeType: string) => Promise<{ url: string }>;
};

// D291 — one image, billed through the same ledger as every canvas generation: reserve the
// estimate, run the provider, store its bytes untouched, then settle the real cost — or fail
// the generation and refund on any error. Fail-closed: no estimate, no generation. Shared by
// the Avatar Studio and Visualise's panels, so both bill exactly the same way (D345).
export async function runBilledImageGeneration(
  args: BilledImageArgs,
): Promise<{ generation: GenerationRow; creditsCharged: number }> {
  const config = imageGenRegistry[args.modelId];
  const params = avatarImageParams(args.modelId, args.aspect);
  if (!config || !params) throw new Error(`Unknown model: ${args.modelId}`);
  const parsed = config.schema.safeParse(params);
  if (!parsed.success) throw new Error(`Invalid params for ${args.modelId}.`);
  const validatedParams = parsed.data as Record<string, unknown>;

  const generation = await insertGeneration({
    ...args.owner,
    orgId: args.orgId,
    clientId: args.clientId,
    userId: args.userId,
    userEmail: args.userEmail,
    type: "image",
    modelUsed: args.modelId,
    paramsSnapshot: validatedParams,
    inputsSnapshot: args.inputsSnapshot,
  });

  try {
    const estimateUsd = estimateAvatarImageCostUsd({
      modelId: args.modelId, aspect: args.aspect, referenceCount: args.referenceUrls.length,
    });
    if (estimateUsd === null) throw new Error(`No cost estimate available for ${args.modelId}.`);
    const reservation = await reserveCredits(args.orgId, generation.id, usdToFinalCredits(estimateUsd));
    if (!reservation.ok) throw new CreditLimitError("Monthly credit limit reached");

    const result = await config.generate({
      prompt: args.prompt, referenceUrls: args.referenceUrls, params: validatedParams,
    });

    // The provider's bytes, as they arrived: no resize, no re-encode.
    const bytes = Buffer.from(result.imageBase64, "base64");
    const { url } = await args.store(bytes, result.mimeType);

    let width: number | null = null;
    let height: number | null = null;
    try {
      const meta = await sharp(bytes).metadata();
      width = meta.width ?? null;
      height = meta.height ?? null;
    } catch {
      // best-effort — dimensions are display-only
    }

    const cost =
      result.costUsd !== undefined
        ? { usd: result.costUsd }
        : result.tokensUsed
          ? computeImageCost(args.modelId, result.tokensUsed)
          : null;
    const creditsCharged = cost ? usdToFinalCredits(cost.usd) : 0;
    const meta = { ...(args.userEmail ? { email: args.userEmail } : {}), width, height, sizeBytes: bytes.length };

    await settleGeneration({ orgId: args.orgId, generationId: generation.id, actualAmount: creditsCharged });
    await succeedGeneration({
      generationId: generation.id,
      costUsd: cost?.usd,
      creditsCharged,
      tokensUsed: { ...result.tokensUsed },
      outputSnapshot: url,
      meta,
    });

    return {
      creditsCharged,
      generation: {
        ...generation,
        status: "succeeded",
        inputs_snapshot: args.inputsSnapshot,
        output_snapshot: url,
        cost_usd: cost?.usd ?? null,
        credits_charged: creditsCharged,
        meta,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Image generation failed";
    await failGeneration({ generationId: generation.id, error: message }).catch(() => null);
    await refundReservation({ orgId: args.orgId, generationId: generation.id }).catch(() => null);
    throw e;
  }
}
```

Replace the body of `src/lib/avatars/generate.ts` below `AvatarGenerationArgs` with a wrapper (drop the imports it no longer uses; keep `uploadAvatarGenerated`, `extForContentType`, `GenerationRow`, add `runBilledImageGeneration`):

```ts
// D291 — one avatar image, through the shared billed run.
export async function runAvatarGeneration(
  args: AvatarGenerationArgs,
): Promise<{ generation: GenerationRow; creditsCharged: number }> {
  return runBilledImageGeneration({
    owner: { avatarId: args.avatarId },
    orgId: args.orgId,
    clientId: args.clientId,
    userId: args.userId,
    userEmail: args.userEmail,
    modelId: args.modelId,
    aspect: args.aspect,
    prompt: args.prompt,
    referenceUrls: args.referenceUrls,
    inputsSnapshot: {
      slot: args.slot,
      ...(args.view ? { view: args.view } : {}),
      prompt: args.prompt,
      batchId: args.batchId,
      referenceUrls: args.referenceUrls,
    },
    store: (body, mimeType) =>
      uploadAvatarGenerated({
        clientId: args.clientId,
        avatarId: args.avatarId,
        slot: args.slot,
        name: args.view ? `view-${args.view}` : undefined,
        ext: extForContentType(mimeType),
        body,
        contentType: mimeType,
      }),
  });
}
```

- [ ] **Step 5: Panel storage**

In `src/lib/storage/paths.ts`:

```ts
/** D337 — a storyboard panel take, under its script, one folder per shot. A shot id is the
 *  script's own text, so it is slugged before it becomes a folder. */
export function pathForScriptPanel(args: { clientId: string; scriptId: string; shotId: string; ext: string }): string {
  const shot = sanitizeSlug(args.shotId).replace(/^[.-]+/, "") || "shot";
  const name = buildStoredName(undefined, { slug: "panel", ext: args.ext });
  return `clients/${args.clientId}/scripts/${args.scriptId}/panels/${shot}/${name}`;
}
```

In `src/lib/storage/index.ts`, import `pathForScriptPanel` and add:

```ts
// D337 — one storyboard panel's bytes, stored as the provider returned them.
export async function uploadScriptPanel(args: {
  clientId: string;
  scriptId: string;
  shotId: string;
  ext: string;
  body: Buffer | ArrayBuffer | Uint8Array;
  contentType: string;
}): Promise<UploadResult> {
  const path = pathForScriptPanel({ clientId: args.clientId, scriptId: args.scriptId, shotId: args.shotId, ext: args.ext });
  return _upload(path, args.body, args.contentType);
}
```

- [ ] **Step 6: Visualise constants and the panel run**

Create `src/lib/scripts/visualise/constants.ts`:

```ts
import { AVATAR_DEFAULT_SHEET_MODEL_ID } from "@/lib/avatars/constants";

// D345 — every panel is drawn by Nano Banana 2, the Studio's default sheet model and the one
// the dry run used (parent spec §11.1). No picker: one model, named once.
export const PANEL_MODEL_ID = AVATAR_DEFAULT_SHEET_MODEL_ID;

/** The script's aspect when the model takes it; every Jackfruit365 reel is 9:16. */
export const PANEL_ASPECTS = ["9:16", "16:9", "1:1", "4:3", "3:4"] as const;
export const PANEL_DEFAULT_ASPECT = "9:16";

/** D344 — the longest prompt the prompt box accepts. */
export const PANEL_PROMPT_MAX = 8000;

/** Longer than a draw can run (the route's maxDuration is 300 s). A take still "running" past
 *  this lost its request (a closed tab, a killed function) and is shown as failed. */
export const PANEL_RUNNING_TIMEOUT_MS = 10 * 60 * 1000;
export const PANEL_TIMED_OUT = "The panel did not finish. Generate it again.";

/** D345 — Generate all draws this many panels at once from the browser. */
export const GENERATE_ALL_CONCURRENCY = 3;
```

Create `src/lib/scripts/visualise/run-panel.ts`:

```ts
import "server-only";
import { runBilledImageGeneration } from "@/lib/image-gen/billed-run";
import { uploadScriptPanel } from "@/lib/storage";
import { extForContentType } from "@/lib/storage/paths";
import { PANEL_MODEL_ID } from "./constants";

// D337, D345 — one storyboard panel, owned by its script and billed like any image.
export async function runPanelGeneration(args: {
  clientId: string;
  scriptId: string;
  shotId: string;
  orgId: string;
  userId: string;
  userEmail: string | null;
  aspect: string;
  prompt: string;
  referenceUrls: string[];
}) {
  return runBilledImageGeneration({
    owner: { scriptId: args.scriptId },
    orgId: args.orgId,
    clientId: args.clientId,
    userId: args.userId,
    userEmail: args.userEmail,
    modelId: PANEL_MODEL_ID,
    aspect: args.aspect,
    prompt: args.prompt,
    referenceUrls: args.referenceUrls,
    inputsSnapshot: { slot: "panel", shotId: args.shotId, prompt: args.prompt, referenceUrls: args.referenceUrls },
    store: (body, mimeType) =>
      uploadScriptPanel({
        clientId: args.clientId, scriptId: args.scriptId, shotId: args.shotId,
        ext: extForContentType(mimeType), body, contentType: mimeType,
      }),
  });
}
```

- [ ] **Step 7: Run the tests, including the avatar generation suite unchanged**

Run: `npx vitest run src/lib/image-gen src/lib/db/generations.test.ts src/lib/storage src/lib/scripts/visualise src/lib/avatars "src/app/api/clients/[id]/avatars"`
Expected: PASS, with `src/lib/avatars/__tests__/generate.test.ts` untouched and green.

- [ ] **Step 8: Commit**

```bash
git add src/lib/image-gen src/lib/avatars/generate.ts src/lib/db/generations.ts src/lib/db/generations.test.ts src/lib/db/types.ts src/lib/storage src/lib/scripts/visualise
git commit -m "refactor(image-gen): one billed image run, owned by an avatar or a script (D337)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Regional kits from the brand KB

**Files:**
- Create: `src/lib/scripts/visualise/kits.ts`, `src/lib/scripts/visualise/kb-text.ts`
- Test: `src/lib/scripts/visualise/__tests__/kits.test.ts`

**Interfaces:**
- Consumes: `ScriptDoc`, `Shot`; `getActiveKBVersion` from `src/lib/db/kb.ts`.
- Produces: `type RegionalKit = { region: string; table: string; kitchen: string; wardrobe: string }`; `parseRegionalKits(text: string): RegionalKit[]`; `collectStrings(value: unknown): string[]`; `KIT_PLACE_HINTS`; `pickKit(kits: RegionalKit[], doc: ScriptDoc, shot: Shot): RegionalKit | null`; `loadKbText(clientId: string): Promise<string>` (server).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/scripts/visualise/__tests__/kits.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { collectStrings, parseRegionalKits, pickKit } from "../kits";
import { reel01Doc } from "./fixtures";

// The house rules' kits table as it reads in the Jackfruit365 outlines document.
const MARKDOWN = `Some rule about dress.

**Regional kits**

| Region | At the table | Kitchen and home | Wardrobe |
| :---- | :---- | :---- | :---- |
| **Kerala** | Rice, sambar, thoran | Nilavilakku, steel tumblers, appachatti | Mundu, set-mundu, kasavu border |
| **Tamil Nadu** | Rice, sambar, rasam; idli and dosa at breakfast | Kuthuvilakku, kolam, iron tawa, Golu steps in Navratri, steel dabba | Cotton saree; silk and zari for festive hosting; veshti |
| **Gujarat** | Rotli, dal, bhaat, shaak | Velan, tavdi, steel dabba, terrace with kites | Light cotton, saree with front pallu, kurta |

**Locked claim and proof lines (use verbatim)**

| Beat | Visual | VO | On-screen |
| HOOK | x | y | z |`;

// The same table pasted from the .docx, which arrives tab-separated.
const TABBED = "Regional kits\nRegion\tAt the table\tKitchen and home\tWardrobe\nTamil Nadu\tRice\tIron tawa, kolam\tCotton saree\n\nNext section";

describe("parseRegionalKits (D342)", () => {
  it("reads the kits table and nothing after it", () => {
    const kits = parseRegionalKits(MARKDOWN);
    expect(kits.map((k) => k.region)).toEqual(["Kerala", "Tamil Nadu", "Gujarat"]);
    expect(kits[1]).toEqual({
      region: "Tamil Nadu",
      table: "Rice, sambar, rasam; idli and dosa at breakfast",
      kitchen: "Kuthuvilakku, kolam, iron tawa, Golu steps in Navratri, steel dabba",
      wardrobe: "Cotton saree; silk and zari for festive hosting; veshti",
    });
  });

  it("reads a tab-separated paste too", () => {
    expect(parseRegionalKits(TABBED)).toEqual([
      { region: "Tamil Nadu", table: "Rice", kitchen: "Iron tawa, kolam", wardrobe: "Cotton saree" },
    ]);
  });

  it("finds nothing when the KB holds no kits table", () => {
    expect(parseRegionalKits("Brand voice: warm.")).toEqual([]);
    expect(parseRegionalKits("")).toEqual([]);
  });
});

describe("collectStrings", () => {
  it("gathers every string in a KB, wherever the house rules were pasted", () => {
    expect(collectStrings({ a: { value: "one", n: 3 }, b: [{ value: "two" }, null], c: "  " })).toEqual(["one", "two"]);
  });
});

describe("pickKit (D342)", () => {
  const kits = parseRegionalKits(MARKDOWN);

  it("picks Tamil Nadu for Reel 01 from 'Chennai' and 'Tamil', which the script says, not the state", () => {
    const doc = reel01Doc();
    const broll = doc.shots.find((s) => s.id === "s03")!;
    expect(pickKit(kits, doc, broll)?.region).toBe("Tamil Nadu");
  });

  it("prefers what the shot itself names, for a reel that crosses regions", () => {
    const doc = reel01Doc();
    const shot = { ...doc.shots[0], visual: "A sunny terrace in Ahmedabad with kites.", onScreen: [] };
    expect(pickKit(kits, doc, shot)?.region).toBe("Gujarat");
  });

  it("is null with no kits, or when nothing points to one", () => {
    const doc = reel01Doc();
    expect(pickKit([], doc, doc.shots[0])).toBeNull();
    const plain = { ...doc, header: { ...doc.header, region: "" }, context: { ...doc.context, settingAndCamera: "" },
      cast: doc.cast.map((c) => ({ ...c, description: "A person." })) };
    expect(pickKit(kits, plain, { ...doc.shots[2], visual: "A kitchen." })).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/scripts/visualise/__tests__/kits.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/scripts/visualise/kits.ts`:

```ts
import type { ScriptDoc, Shot } from "@/lib/scripts/schema";

// D342 — the regional kit a panel is drawn with. The dry run's "South Indian kitchen" came out
// European until the kit was named (parent spec §11.1). The house rules live in the brand KB as
// pasted text for the demo (spec 2 §4.1), so the kits are read from that text until the KB has
// fields for them; matching is by the place and language names a script actually uses.

export type RegionalKit = { region: string; table: string; kitchen: string; wardrobe: string };

const clean = (cell: string) => cell.replace(/\*\*/g, "").replace(/\\/g, "").trim();

function cells(line: string): string[] | null {
  const t = line.trim();
  if (t.startsWith("|")) return t.replace(/^\|/, "").replace(/\|$/, "").split("|").map(clean);
  if (t.includes("\t")) return t.split("\t").map(clean);
  return null;
}

/** The rows of the table under the first "Regional kits" heading, as a markdown table or as
 *  tab-separated rows copied from the document. Everything else in the text is ignored. */
export function parseRegionalKits(text: string): RegionalKit[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /regional kits/i.test(l));
  if (start < 0) return [];
  const kits: RegionalKit[] = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    const row = cells(line);
    if (!row || row.length < 4) {
      if (inTable) break; // the table has ended
      continue; // blank lines or a sentence between the heading and the table
    }
    inTable = true;
    const [region, table, kitchen, wardrobe] = row;
    if (/^:?-+:?$/.test(region)) continue; // the markdown separator row
    if (region.toLowerCase() === "region") continue; // the header row
    if (region) kits.push({ region, table, kitchen, wardrobe });
  }
  return kits;
}

/** Every non-empty string in a value, depth first: the KB's text, wherever it was pasted. */
export function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.trim()) out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
  return out;
}

// Names that point to a kit's region when the script does not name the region itself (Reel 01
// says "Chennai" and "Tamil lilt", never "Tamil Nadu"). Keyed by the kit table's region names.
export const KIT_PLACE_HINTS: Record<string, string[]> = {
  "Tamil Nadu": ["Chennai", "Madurai", "Coimbatore", "Tamil"],
  Kerala: ["Kochi", "Thiruvananthapuram", "Kozhikode", "Malayalam", "Malayali"],
  "Karnataka and Telangana": ["Bengaluru", "Bangalore", "Mysuru", "Hyderabad", "Kannada", "Telugu"],
  "Delhi and Lucknow": ["Delhi", "Lucknow"],
  Punjab: ["Chandigarh", "Amritsar", "Ludhiana", "Punjabi"],
  Maharashtra: ["Mumbai", "Pune", "Nagpur", "Marathi"],
  Gujarat: ["Ahmedabad", "Surat", "Vadodara", "Gujarati"],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function namesFor(kit: RegionalKit): string[] {
  const parts = kit.region.split(/\s+and\s+|\s*[,/]\s*/i).map((s) => s.trim()).filter(Boolean);
  return [...new Set([kit.region, ...parts, ...(KIT_PLACE_HINTS[kit.region] ?? [])])];
}

function best(kits: RegionalKit[], text: string): RegionalKit | null {
  let top: RegionalKit | null = null;
  let topScore = 0;
  for (const kit of kits) {
    const score = namesFor(kit).filter((n) => new RegExp(`\\b${escape(n)}\\b`, "i").test(text)).length;
    if (score > topScore) {
      top = kit;
      topScore = score;
    }
  }
  return top;
}

/** The kit for one shot: what the shot and its on-screen people name first (a reel can cross
 *  regions), then the script as a whole. Null when nothing points to a kit. */
export function pickKit(kits: RegionalKit[], doc: ScriptDoc, shot: Shot): RegionalKit | null {
  if (kits.length === 0) return null;
  const onScreen = doc.cast.filter((c) => shot.onScreen.includes(c.id));
  const shotText = [shot.visual, ...onScreen.map((c) => c.description)].join("\n");
  const scriptText = [doc.header.region, doc.context.settingAndCamera, ...doc.cast.map((c) => c.description)].join("\n");
  return best(kits, shotText) ?? best(kits, scriptText);
}
```

Create `src/lib/scripts/visualise/kb-text.ts`:

```ts
import "server-only";
import { getActiveKBVersion } from "@/lib/db/kb";
import { collectStrings } from "./kits";

/** D342 — the active brand KB's text, so the kits table is found wherever the house rules were
 *  pasted (spec 2 §4.1). Merge point: when spec 2 adds its house-rules reader, use that here. */
export async function loadKbText(clientId: string): Promise<string> {
  const version = await getActiveKBVersion(clientId);
  return version ? collectStrings(version.output).join("\n\n") : "";
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/scripts/visualise/__tests__/kits.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scripts/visualise
git commit -m "feat(scripts): read the regional kits from the brand KB and pick one per shot (D342)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: What a panel is drawn from

**Files:**
- Create: `src/lib/scripts/visualise/keys.ts`, `src/lib/scripts/visualise/panel-prompt.ts`, `src/lib/scripts/visualise/panel-inputs.ts`
- Test: `src/lib/scripts/visualise/__tests__/keys.test.ts`, `src/lib/scripts/visualise/__tests__/panel-inputs.test.ts`

**Interfaces:**
- Consumes: `hasFourViews`, `AVATAR_VIEWS`, `AVATAR_VIEW_LABELS` (Task 1); `estimateAvatarImageCredits`; `PANEL_MODEL_ID`, `PANEL_ASPECTS`, `PANEL_DEFAULT_ASPECT` (Task 6); `RegionalKit`, `pickKit` (Task 7); `PanelFaces` (Task 5).
- Produces: `fingerprint(text): string`; `shotKey(doc, shot): string`; `faceKey(avatar: Pick<Avatar,"front"|"sheetViews">): string`; types `PanelPerson = { castId; name; description; views: { view: AvatarViewId; url: string }[] }`, `PanelReference = { url; castId; view: AvatarViewId }`; `blankAreas(shot): BlankArea[]`; `panelAspect(doc): string`; `buildPanelPrompt({ doc, shot, kit, people, references }): string`; `castReadyForPanels(avatar): avatar is Avatar`; `panelReferenceCap(): number`; `selectPanelReferences(people, cap): PanelReference[]`; type `PanelInputs = { people; references; kit; prompt; waitingFor: string[]; faces: PanelFaces; shotKey: string }`; `panelInputs({ doc, shot, avatars: ReadonlyMap<string, Avatar>, kits, cap }): PanelInputs`; `estimatePanelCredits(referenceCount: number, aspect: string): number | null`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/scripts/visualise/__tests__/keys.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeViews } from "@/lib/avatars/__tests__/fixtures";
import { faceKey, fingerprint, shotKey } from "../keys";
import { readyAvatar, reel01Doc, MEENAKSHI_AVATAR } from "./fixtures";

describe("fingerprint", () => {
  it("is stable, short, and changes with the text", () => {
    expect(fingerprint("abc")).toBe(fingerprint("abc"));
    expect(fingerprint("abc")).toMatch(/^[0-9a-f]{8}$/);
    expect(fingerprint("abc")).not.toBe(fingerprint("abd"));
  });
});

describe("shotKey (D343)", () => {
  const doc = reel01Doc();
  const s06 = doc.shots.find((s) => s.id === "s06")!;

  it("changes when what is drawn changes: the visual, who is on screen, how they are described", () => {
    const base = shotKey(doc, s06);
    expect(shotKey(doc, { ...s06, visual: "She sets the bowl down." })).not.toBe(base);
    expect(shotKey(doc, { ...s06, onScreen: ["meenakshi"] })).not.toBe(base);
    const redescribed = { ...doc, cast: doc.cast.map((c) => (c.id === "husband" ? { ...c, description: "Her husband, 60." } : c)) };
    expect(shotKey(redescribed, s06)).not.toBe(base);
  });

  it("does not change for what is never drawn: the VO and the length", () => {
    const base = shotKey(doc, s06);
    expect(shotKey(doc, { ...s06, vo: "Something else.", lengthSeconds: 5 })).toBe(base);
  });

  it("ignores a change to someone who is not in the shot", () => {
    const s01 = doc.shots.find((s) => s.id === "s01")!;
    const redescribed = { ...doc, cast: doc.cast.map((c) => (c.id === "husband" ? { ...c, description: "Her husband, 60." } : c)) };
    expect(shotKey(redescribed, s01)).toBe(shotKey(doc, s01));
  });
});

describe("faceKey (D343)", () => {
  it("changes when the front or any view changes, and only then", () => {
    const a = readyAvatar(MEENAKSHI_AVATAR, "meenakshi");
    expect(faceKey({ ...a, name: "Renamed", voice: null })).toBe(faceKey(a));
    expect(faceKey({ ...a, sheetViews: { ...a.sheetViews!, left: makeViews("new").left } })).not.toBe(faceKey(a));
    expect(faceKey({ ...a, front: { ...a.front!, url: "https://x/new.png" } })).not.toBe(faceKey(a));
  });
});
```

Create `src/lib/scripts/visualise/__tests__/panel-inputs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { makeAvatar } from "@/lib/avatars/__tests__/fixtures";
import { parseRegionalKits } from "../kits";
import { blankAreas, panelAspect } from "../panel-prompt";
import { castReadyForPanels, estimatePanelCredits, panelInputs, panelReferenceCap } from "../panel-inputs";
import {
  avatarMap, HUSBAND_AVATAR, linkedDoc, MEENAKSHI_AVATAR, readyAvatar, reel01Doc,
} from "./fixtures";

const KITS = parseRegionalKits(
  "Regional kits\n| Region | At the table | Kitchen and home | Wardrobe |\n| **Tamil Nadu** | Idli and dosa | Iron tawa, kolam, steel dabba | Cotton saree; veshti |",
);
const doc = linkedDoc();
const shot = (id: string) => doc.shots.find((s) => s.id === id)!;
const avatars = avatarMap(readyAvatar(MEENAKSHI_AVATAR, "meenakshi"), readyAvatar(HUSBAND_AVATAR, "husband"));
const inputs = (id: string, cap = panelReferenceCap(), map = avatars, d = doc) =>
  panelInputs({ doc: d, shot: d.shots.find((s) => s.id === id)!, avatars: map, kits: KITS, cap });

describe("castReadyForPanels (D340)", () => {
  it("needs a saved, live avatar with a current four-view sheet", () => {
    expect(castReadyForPanels(readyAvatar(MEENAKSHI_AVATAR, "m"))).toBe(true);
    expect(castReadyForPanels(readyAvatar(MEENAKSHI_AVATAR, "m", { status: "draft" }))).toBe(false);
    expect(castReadyForPanels(readyAvatar(MEENAKSHI_AVATAR, "m", { sheetStale: true }))).toBe(false);
    expect(castReadyForPanels(readyAvatar(MEENAKSHI_AVATAR, "m", { archivedAt: "2026-10-08T00:00:00.000Z" }))).toBe(false);
    expect(castReadyForPanels(makeAvatar({ sheetViews: null }))).toBe(false);
    expect(castReadyForPanels(undefined)).toBe(false);
  });
});

describe("panelInputs on Reel 01 (D341)", () => {
  it("sends both people's four views for a two-person shot, fronts first, and numbers them in the prompt", () => {
    const s06 = inputs("s06");
    expect(s06.references.map((r) => `${r.castId}:${r.view}`)).toEqual([
      "meenakshi:front", "husband:front",
      "meenakshi:left", "meenakshi:right", "meenakshi:back",
      "husband:left", "husband:right", "husband:back",
    ]);
    expect(s06.prompt).toContain("Reference images 1 (front), 3 (left), 4 (right), 5 (back) show this person.");
    expect(s06.prompt).toContain("Reference images 2 (front), 6 (left), 7 (right), 8 (back) show this person.");
    expect(s06.prompt).toContain("Meenakshi, 54, Chennai.");
    expect(s06.prompt).toContain("Her husband, 58, in a veshti.");
    expect(s06.waitingFor).toEqual([]);
  });

  it("keeps every front when the model's reference cap is short, dropping other views first", () => {
    const s06 = inputs("s06", 5);
    expect(s06.references.map((r) => `${r.castId}:${r.view}`)).toEqual([
      "meenakshi:front", "husband:front", "meenakshi:left", "meenakshi:right", "meenakshi:back",
    ]);
    expect(s06.prompt).toContain("Reference images 2 (front) show this person.");
  });

  it("draws the setting, the kit, the sketch style, and never any text or brand", () => {
    const p = inputs("s03").prompt;
    expect(p).toContain("marker-and-wash sketch");
    expect(p).toContain("Regional kit (Tamil Nadu)");
    expect(p).toContain("Iron tawa, kolam");
    expect(p).toContain("Chennai flat with a Golu");
    expect(p).toContain("Never draw any text, letters, numbers, logos, brand names");
  });

  it("never carries the shot's VO or on-screen text into the prompt", () => {
    const p = inputs("s01").prompt;
    expect(p).not.toContain("Golu starts today.");
  });

  it("draws nobody on a B-roll shot, with no references", () => {
    const s09 = inputs("s09");
    expect(s09.references).toEqual([]);
    expect(s09.prompt).toContain("Nobody is on screen");
    expect(s09.prompt).not.toContain("reference images show");
  });

  it("leaves the review card, the claim card and the pack blank (spec §6.3)", () => {
    expect(blankAreas(shot("s08"))).toEqual(["review card"]);
    expect(blankAreas(shot("s13"))).toEqual(["claim card", "pack"]);
    expect(blankAreas(shot("s14"))).toEqual(["pack"]);
    expect(blankAreas(shot("s03"))).toEqual([]);
    expect(inputs("s08").prompt).toContain("plain blank rectangle where the review card");
    expect(inputs("s14").prompt).toContain("plain blank pouch with no printing");
  });

  it("waits for each on-screen person who has no avatar ready, but not on B-roll", () => {
    const unlinked = reel01Doc();
    expect(inputs("s06", undefined, new Map(), unlinked).waitingFor).toEqual(["Meenakshi", "Meenakshi's husband"]);
    expect(inputs("s03", undefined, new Map(), unlinked).waitingFor).toEqual([]);
    const noViews = avatarMap(readyAvatar(MEENAKSHI_AVATAR, "meenakshi", { sheetViews: null }), readyAvatar(HUSBAND_AVATAR, "husband"));
    expect(inputs("s06", undefined, noViews).waitingFor).toEqual(["Meenakshi"]);
  });

  it("records each on-screen person's avatar and face, for out-of-date checks", () => {
    const faces = inputs("s06").faces;
    expect(Object.keys(faces)).toEqual(["meenakshi", "husband"]);
    expect(faces.meenakshi.avatarId).toBe(MEENAKSHI_AVATAR);
  });

  it("uses the script's aspect when the model takes it, else 9:16", () => {
    expect(panelAspect(doc)).toBe("9:16");
    expect(panelAspect({ ...doc, header: { ...doc.header, aspect: "4:5" } })).toBe("9:16");
    expect(panelAspect({ ...doc, header: { ...doc.header, aspect: "16:9" } })).toBe("16:9");
  });

  it("prices a panel like any Nano Banana 2 image, by its reference count", () => {
    expect(estimatePanelCredits(8, "9:16")).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/scripts/visualise/__tests__/keys.test.ts src/lib/scripts/visualise/__tests__/panel-inputs.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Fingerprints**

Create `src/lib/scripts/visualise/keys.ts`:

```ts
import { AVATAR_VIEWS } from "@/lib/avatars/constants";
import type { Avatar } from "@/lib/avatars/schema";
import type { ScriptDoc, Shot } from "@/lib/scripts/schema";

// D343 — what a panel was drawn from, as short fingerprints stored on each take. Today's values
// differing from a take's means the take is out of date. Run identically in the browser and on
// the server.

/** FNV-1a, 32-bit, as 8 hex characters. Stable and dependency-free; not for security. */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Everything in the script a panel is drawn from: the shot's visual and on-screen text (its
 *  blank areas), who is on screen and how they are described, the setting, aspect and region.
 *  Never the VO or the length, which are not drawn. */
export function shotKey(doc: ScriptDoc, shot: Shot): string {
  const people = shot.onScreen.map((id) => {
    const c = doc.cast.find((m) => m.id === id);
    return c ? [c.id, c.name, c.description] : [id];
  });
  return fingerprint(JSON.stringify({
    visual: shot.visual, text: shot.onScreenText, onScreen: shot.onScreen, people,
    setting: doc.context.settingAndCamera, aspect: doc.header.aspect, region: doc.header.region,
  }));
}

/** An avatar's face as panels see it: the front image and the four views. A rename or a voice
 *  change does not change it. */
export function faceKey(avatar: Pick<Avatar, "front" | "sheetViews">): string {
  return fingerprint([avatar.front?.url ?? "", ...AVATAR_VIEWS.map((v) => avatar.sheetViews?.[v]?.url ?? "")].join("|"));
}
```

- [ ] **Step 4: The prompt**

Create `src/lib/scripts/visualise/panel-prompt.ts`:

```ts
import { AVATAR_VIEW_LABELS } from "@/lib/avatars/constants";
import type { AvatarViewId } from "@/lib/avatars/schema";
import type { ScriptDoc, Shot } from "@/lib/scripts/schema";
import { PANEL_ASPECTS, PANEL_DEFAULT_ASPECT } from "./constants";
import type { RegionalKit } from "./kits";

// D341 — the panel prompt, built from the shot, the setting, the regional kit and each on-screen
// person in words AND their four views. Every clause answers a finding of the dry run (parent
// spec §11.1) or a house rule (no generated text, brands or labelled packs).

export type PanelPerson = {
  castId: string;
  name: string;
  description: string;
  /** The four views, or none while the person's avatar is not ready. */
  views: { view: AvatarViewId; url: string }[];
};
export type PanelReference = { url: string; castId: string; view: AvatarViewId };

export const PANEL_STYLE_CLAUSE =
  "A storyboard panel drawn as a loose marker-and-wash sketch: confident black marker lines, flat " +
  "grey and muted colour washes, white paper showing through, no photographic detail. It reads as " +
  "a plan to approve, not a finished film.";
export const PANEL_NOBODY_CLAUSE = "Nobody is on screen: draw no people. Hands may appear only if the action needs them.";
export const PANEL_REFERENCE_CLAUSE =
  "The reference images show the people's identity only: never copy their plain grey background, lighting or layout.";
export const PANEL_NO_TEXT_CLAUSE =
  "Never draw any text, letters, numbers, logos, brand names, labels, price tags or captions anywhere " +
  "in the frame. Every container, jar, packet and box is plain and unlabelled.";

// Spec §6.3 — the card and the pack go in during the edit; the panel keeps their place blank.
const BLANK_AREAS = [
  { id: "review card", test: /\breview card\b/i, clause: "Leave a plain blank rectangle where the review card appears; it is added in the edit." },
  { id: "claim card", test: /\bclaim (card|line)\b/i, clause: "Leave a plain blank rectangle where the claim card sits; it is added in the edit." },
  { id: "pack", test: /\bpack\b/i, clause: "Draw the product pack as a plain blank pouch with no printing at all; the real pack is added in the edit." },
] as const;
export type BlankArea = (typeof BLANK_AREAS)[number]["id"];

export function blankAreas(shot: Pick<Shot, "visual" | "onScreenText">): BlankArea[] {
  const text = `${shot.visual} ${shot.onScreenText}`;
  return BLANK_AREAS.filter((a) => a.test.test(text)).map((a) => a.id);
}

/** The script's aspect when the model accepts it; otherwise 9:16, the reels' own. */
export function panelAspect(doc: ScriptDoc): string {
  const aspect = doc.header.aspect.trim();
  return (PANEL_ASPECTS as readonly string[]).includes(aspect) ? aspect : PANEL_DEFAULT_ASPECT;
}

const sentence = (s: string) => s.trim().replace(/\.?\s*$/, ".");

function referenceNumbers(references: PanelReference[], castId: string): string {
  return references
    .map((r, i) => (r.castId === castId ? `${i + 1} (${AVATAR_VIEW_LABELS[r.view].toLowerCase()})` : null))
    .filter(Boolean)
    .join(", ");
}

function peopleClause(people: PanelPerson[], references: PanelReference[]): string {
  const lines = people.map((p) => {
    const refs = referenceNumbers(references, p.castId);
    const seen = refs ? ` Reference images ${refs} show this person.` : "";
    return `- ${p.name}: ${sentence(p.description || p.name)}${seen} Keep their face, hair, build, ` +
      "clothing and every identity marker named here exactly the same, in the same colours.";
  });
  return ["People on screen (exactly these, nobody else):", ...lines].join("\n");
}

export function buildPanelPrompt(input: {
  doc: ScriptDoc;
  shot: Shot;
  kit: RegionalKit | null;
  people: PanelPerson[];
  references: PanelReference[];
}): string {
  const { doc, shot, kit, people, references } = input;
  const blanks = blankAreas(shot).map((id) => BLANK_AREAS.find((a) => a.id === id)!.clause);
  return [
    PANEL_STYLE_CLAUSE,
    `Frame: ${panelAspect(doc)}.`,
    `This shot: ${sentence(shot.visual)}`,
    doc.context.settingAndCamera ? `Setting and camera for the whole reel: ${sentence(doc.context.settingAndCamera)}` : "",
    kit
      ? `Regional kit (${kit.region}). Kitchen and home: ${kit.kitchen}. At the table: ${kit.table}. ` +
        `Wardrobe: ${kit.wardrobe}. Use what fits this shot. The home is Indian, never European or Western.`
      : "",
    people.length === 0 ? PANEL_NOBODY_CLAUSE : peopleClause(people, references),
    ...blanks,
    references.length > 0 ? PANEL_REFERENCE_CLAUSE : "",
    PANEL_NO_TEXT_CLAUSE,
  ].filter(Boolean).join("\n\n");
}
```

- [ ] **Step 5: The inputs**

Create `src/lib/scripts/visualise/panel-inputs.ts`:

```ts
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { AVATAR_VIEWS } from "@/lib/avatars/constants";
import { estimateAvatarImageCredits } from "@/lib/avatars/generation";
import { hasFourViews } from "@/lib/avatars/utils";
import type { Avatar } from "@/lib/avatars/schema";
import type { CastMember, ScriptDoc, Shot } from "@/lib/scripts/schema";
import { PANEL_MODEL_ID } from "./constants";
import { faceKey, shotKey } from "./keys";
import { pickKit, type RegionalKit } from "./kits";
import { buildPanelPrompt, type PanelPerson, type PanelReference } from "./panel-prompt";
import type { PanelFaces } from "./schema";

// D340, D341 — everything one panel is drawn from, in one pure function. The browser runs it to
// show state, prompt and cost; the draw route runs the same function to draw.

/** D340 — a cast member can be drawn once their avatar is saved, live and has its four views. */
export function castReadyForPanels(avatar: Avatar | null | undefined): avatar is Avatar {
  return Boolean(avatar && !avatar.archivedAt && avatar.status === "ready" && hasFourViews(avatar));
}

export function panelReferenceCap(): number {
  return imageGenClientModelMap[PANEL_MODEL_ID]?.maxReferenceImages ?? 0;
}

/** Every person's Front first, then the other views person by person, cut at the model's cap:
 *  if four views per person are too many, the fronts are what is kept (spec §13 risk 4). */
export function selectPanelReferences(people: PanelPerson[], cap: number): PanelReference[] {
  const refs = (p: PanelPerson, front: boolean) =>
    p.views.filter((v) => (v.view === "front") === front).map((v) => ({ url: v.url, castId: p.castId, view: v.view }));
  return [...people.flatMap((p) => refs(p, true)), ...people.flatMap((p) => refs(p, false))].slice(0, Math.max(0, cap));
}

export type PanelInputs = {
  people: PanelPerson[];
  references: PanelReference[];
  kit: RegionalKit | null;
  /** The prompt built from the script — what a reset goes back to. */
  prompt: string;
  /** Names of on-screen people whose avatar is not ready yet. */
  waitingFor: string[];
  faces: PanelFaces;
  shotKey: string;
};

export function panelInputs(input: {
  doc: ScriptDoc;
  shot: Shot;
  avatars: ReadonlyMap<string, Avatar>;
  kits: RegionalKit[];
  cap: number;
}): PanelInputs {
  const { doc, shot, avatars, kits, cap } = input;
  const members = shot.onScreen
    .map((id) => doc.cast.find((c) => c.id === id))
    .filter((c): c is CastMember => Boolean(c));
  const avatarOf = (m: CastMember) => (m.avatarId ? avatars.get(m.avatarId) : undefined);

  const people: PanelPerson[] = members.map((m) => {
    const avatar = avatarOf(m);
    const views = castReadyForPanels(avatar)
      ? AVATAR_VIEWS.map((view) => ({ view, url: avatar.sheetViews![view]!.url }))
      : [];
    return { castId: m.id, name: m.name, description: m.description, views };
  });
  const faces: PanelFaces = {};
  for (const m of members) {
    const avatar = avatarOf(m);
    if (avatar) faces[m.id] = { avatarId: avatar.id, faceKey: faceKey(avatar) };
  }
  const references = selectPanelReferences(people, cap);
  const kit = pickKit(kits, doc, shot);
  return {
    people,
    references,
    kit,
    waitingFor: members.filter((m) => !castReadyForPanels(avatarOf(m))).map((m) => m.name),
    faces,
    shotKey: shotKey(doc, shot),
    prompt: buildPanelPrompt({ doc, shot, kit, people, references }),
  };
}

/** D345 — a panel bills like any image: the same estimate the draw reserves. */
export function estimatePanelCredits(referenceCount: number, aspect: string): number | null {
  return estimateAvatarImageCredits({ modelId: PANEL_MODEL_ID, aspect, referenceCount });
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib/scripts/visualise`
Expected: PASS. If the "never carries … Golu starts today." case fails, the shot's visual has started quoting its card: check the fixture, do not weaken the test.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scripts/visualise
git commit -m "feat(scripts): what a storyboard panel is drawn from, and its prompt (D341)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Panel state, readiness, and Generate all

**Files:**
- Modify: `src/lib/scripts/visualise/schema.ts`
- Create: `src/lib/scripts/visualise/rows.ts`, `src/lib/scripts/visualise/state.ts`, `src/lib/scripts/visualise/queue.ts`
- Test: `src/lib/scripts/visualise/__tests__/rows.test.ts`, `src/lib/scripts/visualise/__tests__/state.test.ts`, `src/lib/scripts/visualise/__tests__/queue.test.ts`

**Interfaces:**
- Consumes: `PanelTake`, `PanelFaces` (Task 5); `PanelInputs`, `panelInputs`, `castReadyForPanels`, `panelReferenceCap` (Task 8); `PANEL_PROMPT_MAX`, `PANEL_RUNNING_TIMEOUT_MS`, `PANEL_TIMED_OUT` (Task 6); `listSentence` from `@/lib/avatars/generation`.
- Produces: in `schema.ts`, `DrawBody = { kind: "draw" } | { kind: "edited"; prompt: string } | { kind: "reset" }` and `VisualiseBoard = { avatars: Avatar[]; takes: PanelTake[]; picks: Record<string, string>; kits: RegionalKit[] }`; in `rows.ts`, `PanelTakeRow`, `rowToPanelTake(row): PanelTake`; in `state.ts`, `PanelStatus`, `StaleReason`, `PanelView = { status; pick: PanelTake | null; takes: PanelTake[] /* succeeded, oldest first */; failure: string | null; staleBecause: StaleReason[]; waitingFor: string[]; canGenerate: boolean }`, `staleReasons(take, inputs)`, `panelView({ inputs, takes, pickId, drawing, now })`, `promptForDraw(body, current, inputs) → { ok: true; prompt; edited } | { ok: false; error }`, `waitingMessage(names)`, `Readiness`, `visualiseReadiness(doc, avatars, views)`, `GenerateAllPlan = { shotIds; credits: number | null; redraw: boolean; waiting: number }`, `generateAllPlan(doc, views, creditsFor)`, `generateAllLabel(plan)`; in `queue.ts`, `runQueue(items, limit, work, stop?) → Promise<{ started: T[] }>`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/scripts/visualise/__tests__/rows.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rowToPanelTake, type PanelTakeRow } from "../rows";

const row: PanelTakeRow = {
  id: "t1", client_id: "c1", script_id: "s1", shot_id: "s06", generation_id: "g1",
  status: "succeeded", url: "https://x/p.png", width: 768, height: 1365,
  prompt: "p", prompt_edited: true, shot_key: "abcd1234",
  faces: { meenakshi: { avatarId: "a1", faceKey: "k1" } }, error: null, created_by: "u1",
  created_at: "2026-10-08T10:00:00.000Z", updated_at: "2026-10-08T10:01:00.000Z",
};

describe("rowToPanelTake", () => {
  it("maps the columns to the take", () => {
    expect(rowToPanelTake(row)).toEqual({
      id: "t1", scriptId: "s1", shotId: "s06", status: "succeeded", url: "https://x/p.png",
      width: 768, height: 1365, prompt: "p", promptEdited: true, shotKey: "abcd1234",
      faces: { meenakshi: { avatarId: "a1", faceKey: "k1" } }, error: null,
      createdAt: "2026-10-08T10:00:00.000Z", updatedAt: "2026-10-08T10:01:00.000Z",
    });
  });

  it("reads an unknown status as failed and malformed faces as none", () => {
    const take = rowToPanelTake({ ...row, status: "weird", faces: "nope" });
    expect(take.status).toBe("failed");
    expect(take.faces).toEqual({});
  });
});
```

Create `src/lib/scripts/visualise/__tests__/queue.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runQueue } from "../queue";

const tick = () => new Promise((r) => setTimeout(r, 1));

describe("runQueue (D345)", () => {
  it("runs every item, never more than the limit at once, in order", async () => {
    let running = 0;
    let peak = 0;
    const seen: number[] = [];
    await runQueue([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      seen.push(n);
      await tick();
      running--;
    });
    expect(peak).toBe(3);
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("starts nothing new once told to stop, and lets the running ones finish (the credit cap)", async () => {
    let capped = false;
    const finished: number[] = [];
    const { started } = await runQueue([1, 2, 3, 4, 5, 6], 2, async (n) => {
      await tick();
      if (n === 2) capped = true;
      finished.push(n);
    }, () => capped);
    expect(started).toEqual([1, 2, 3]);
    expect(finished.sort()).toEqual([1, 2, 3]);
  });

  it("keeps going past a failed item", async () => {
    const { started } = await runQueue([1, 2, 3], 1, async (n) => {
      if (n === 2) throw new Error("boom");
    });
    expect(started).toEqual([1, 2, 3]);
  });
});
```

Create `src/lib/scripts/visualise/__tests__/state.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Avatar } from "@/lib/avatars/schema";
import { makeViews } from "@/lib/avatars/__tests__/fixtures";
import type { ScriptDoc } from "@/lib/scripts/schema";
import { panelInputs, panelReferenceCap, type PanelInputs } from "../panel-inputs";
import {
  generateAllLabel, generateAllPlan, panelView, promptForDraw, visualiseReadiness, waitingMessage,
  type PanelView,
} from "../state";
import type { PanelTake } from "../schema";
import { PANEL_TIMED_OUT } from "../constants";
import {
  avatarMap, HUSBAND_AVATAR, linkedDoc, makeTake, MEENAKSHI_AVATAR, readyAvatar, reel01Doc,
} from "./fixtures";

const NOW = Date.parse("2026-10-08T12:00:00.000Z");
const meenakshi = readyAvatar(MEENAKSHI_AVATAR, "meenakshi");
const husband = readyAvatar(HUSBAND_AVATAR, "husband");

function inputsFor(doc: ScriptDoc, avatars: Map<string, Avatar>): Map<string, PanelInputs> {
  return new Map(doc.shots.map((shot) => [shot.id, panelInputs({ doc, shot, avatars, kits: [], cap: panelReferenceCap() })]));
}

/** A drawn, picked take for every shot of `doc`, as the draw route would have stored it. */
function drawEverything(doc: ScriptDoc, avatars: Map<string, Avatar>) {
  const takes: PanelTake[] = [];
  const picks: Record<string, string> = {};
  for (const [shotId, inputs] of inputsFor(doc, avatars)) {
    const take = makeTake({ id: `t-${shotId}`, shotId, shotKey: inputs.shotKey, faces: inputs.faces, prompt: inputs.prompt });
    takes.push(take);
    picks[shotId] = take.id;
  }
  return { takes, picks };
}

function viewsFor(doc: ScriptDoc, avatars: Map<string, Avatar>, takes: PanelTake[], picks: Record<string, string>) {
  const inputs = inputsFor(doc, avatars);
  return new Map<string, PanelView>(doc.shots.map((s) => [s.id, panelView({
    inputs: inputs.get(s.id)!, takes: takes.filter((t) => t.shotId === s.id), pickId: picks[s.id], drawing: false, now: NOW,
  })]));
}

describe("panelView (spec §6.4)", () => {
  const doc = linkedDoc();
  const avatars = avatarMap(meenakshi, husband);
  const inputs = inputsFor(doc, avatars);
  const view = (shotId: string, takes: PanelTake[], pickId?: string, drawing = false) =>
    panelView({ inputs: inputs.get(shotId)!, takes, pickId, drawing, now: NOW });

  it("is Not yet with no takes, and Waiting when someone on screen has no avatar", () => {
    expect(view("s01", []).status).toBe("not_yet");
    const unlinked = reel01Doc();
    const waiting = panelView({ inputs: inputsFor(unlinked, new Map()).get("s06")!, takes: [], pickId: undefined, drawing: false, now: NOW });
    expect(waiting).toMatchObject({ status: "waiting", canGenerate: false, waitingFor: ["Meenakshi", "Meenakshi's husband"] });
  });

  it("is Generating while this browser waits on a draw, or a take is still running", () => {
    expect(view("s01", [], undefined, true).status).toBe("generating");
    expect(view("s01", [makeTake({ status: "running", createdAt: "2026-10-08T11:59:00.000Z" })]).status).toBe("generating");
  });

  it("shows a take still running after ten minutes as failed, so it can be drawn again", () => {
    const stuck = makeTake({ status: "running", createdAt: "2026-10-08T11:40:00.000Z" });
    expect(view("s01", [stuck])).toMatchObject({ status: "failed", failure: PANEL_TIMED_OUT });
  });

  it("is Ready on a current pick, and keeps the earlier takes oldest first", () => {
    const i = inputs.get("s01")!;
    const older = makeTake({ id: "a", shotKey: i.shotKey, faces: i.faces, createdAt: "2026-10-08T10:00:00.000Z" });
    const newer = makeTake({ id: "b", shotKey: i.shotKey, faces: i.faces, createdAt: "2026-10-08T11:00:00.000Z" });
    const v = view("s01", [newer, older], "a");
    expect(v.status).toBe("ready");
    expect(v.pick?.id).toBe("a");
    expect(v.takes.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("is Failed with the provider's message when nothing was ever drawn, and keeps the pick when a redraw fails", () => {
    expect(view("s01", [makeTake({ status: "failed", url: null, error: "Content blocked" })])).toMatchObject({
      status: "failed", failure: "Content blocked",
    });
    const i = inputs.get("s01")!;
    const good = makeTake({ id: "a", shotKey: i.shotKey, faces: i.faces, createdAt: "2026-10-08T10:00:00.000Z" });
    const bad = makeTake({ id: "b", status: "failed", url: null, error: "Content blocked", createdAt: "2026-10-08T11:00:00.000Z" });
    expect(view("s01", [good, bad], "a")).toMatchObject({ status: "ready", failure: "Content blocked" });
  });
});

describe("out of date (D343, spec §3.6)", () => {
  it("refining Meenakshi's avatar marks exactly her nine panels, and Generate all redraws only those", () => {
    const doc = linkedDoc();
    const before = avatarMap(meenakshi, husband);
    const { takes, picks } = drawEverything(doc, before);
    const refined = avatarMap({ ...meenakshi, sheetViews: makeViews("meenakshi-2") }, husband);
    const views = viewsFor(doc, refined, takes, picks);

    const stale = doc.shots.filter((s) => views.get(s.id)!.status === "out_of_date").map((s) => s.id);
    expect(stale).toEqual(["s01", "s02", "s05", "s06", "s07", "s08", "s10", "s11", "s12"]);
    expect(views.get("s06")!.staleBecause).toEqual(["avatar"]);

    const plan = generateAllPlan(doc, views, () => 10);
    expect(plan.shotIds).toEqual(stale);
    expect(generateAllLabel(plan)).toBe("Redraw 9 panels · about 90 credits");
  });

  it("a script back from Reopen: edited and split-first-half out of date, split-second-half and new empty, removed gone", () => {
    const before = linkedDoc();
    const avatars = avatarMap(meenakshi, husband);
    const { takes, picks } = drawEverything(before, avatars);

    const after = linkedDoc();
    const s03 = after.shots.findIndex((s) => s.id === "s03");
    after.shots[s03] = { ...after.shots[s03], visual: "The same morning, in the kitchen. Only the tawa." };
    const s07 = after.shots.findIndex((s) => s.id === "s07");
    after.shots.splice(s07, 1,
      { ...after.shots[s07], lengthSeconds: 3, visual: "Top-down on the bowl. She levels one tablespoon." },
      { ...after.shots[s07], id: "s07b", lengthSeconds: 3, visual: "She levels the second and stirs." });
    after.shots = after.shots.filter((s) => s.id !== "s14");
    after.shots.push({ id: "s15", beat: "OUTRO", lengthSeconds: 4, visual: "The brass lamp, lit.", vo: "", onScreenText: "", onScreen: [] });

    const views = viewsFor(after, avatars, takes, picks);
    expect(views.get("s03")).toMatchObject({ status: "out_of_date", staleBecause: ["shot"] });
    expect(views.get("s07")!.status).toBe("out_of_date");
    expect(views.get("s07b")!.status).toBe("not_yet");
    expect(views.get("s15")!.status).toBe("not_yet");
    expect(views.has("s14")).toBe(false);
    expect(views.get("s01")!.status).toBe("ready");

    const readiness = visualiseReadiness(after, avatars, views);
    expect(readiness).toEqual({ castReady: 2, castTotal: 2, panelsCurrent: 11, shotsTotal: 15 });
    expect(generateAllPlan(after, views, () => 10).shotIds).toEqual(["s03", "s07", "s07b", "s15"]);
  });

  it("an edited shot redraws from a fresh prompt; its hand-edited prompt stays with the old take", () => {
    const doc = linkedDoc();
    const avatars = avatarMap(meenakshi, husband);
    const i = inputsFor(doc, avatars).get("s03")!;
    const edited = makeTake({ shotId: "s03", shotKey: i.shotKey, prompt: "closer on the tawa", promptEdited: true });
    expect(promptForDraw({ kind: "draw" }, edited, i)).toEqual({ ok: true, prompt: "closer on the tawa", edited: true });
    const changed = { ...i, shotKey: "different", prompt: "fresh from the new text" };
    expect(promptForDraw({ kind: "draw" }, edited, changed)).toEqual({ ok: true, prompt: "fresh from the new text", edited: false });
  });
});

describe("promptForDraw (D344)", () => {
  const i = { prompt: "built", shotKey: "k" };

  it("uses the edited prompt, or resets to the built one", () => {
    expect(promptForDraw({ kind: "edited", prompt: "  closer on her hands  " }, null, i)).toEqual({ ok: true, prompt: "closer on her hands", edited: true });
    expect(promptForDraw({ kind: "edited", prompt: "built" }, null, i)).toEqual({ ok: true, prompt: "built", edited: false });
    expect(promptForDraw({ kind: "reset" }, makeTake({ promptEdited: true, shotKey: "k" }), i)).toEqual({ ok: true, prompt: "built", edited: false });
  });

  it("refuses an empty or overlong prompt", () => {
    expect(promptForDraw({ kind: "edited", prompt: "   " }, null, i)).toEqual({ ok: false, error: "The prompt is empty." });
    expect(promptForDraw({ kind: "edited", prompt: "x".repeat(8001) }, null, i).ok).toBe(false);
  });
});

describe("readiness and Generate all (spec §6.5, §7)", () => {
  it("counts cast with an avatar and shots with a current panel, and leaves waiting shots out of Generate all", () => {
    const doc = reel01Doc();
    const views = viewsFor(doc, new Map(), [], {});
    expect(visualiseReadiness(doc, new Map(), views)).toEqual({ castReady: 0, castTotal: 2, panelsCurrent: 0, shotsTotal: 14 });
    const plan = generateAllPlan(doc, views, () => 7);
    expect(plan.shotIds).toEqual(["s03", "s04", "s09", "s13", "s14"]);
    expect(plan.waiting).toBe(9);
    expect(generateAllLabel(plan)).toBe("Generate 5 panels · about 35 credits");
  });

  it("has no total when a shot has no price", () => {
    const doc = reel01Doc();
    const views = viewsFor(doc, new Map(), [], {});
    expect(generateAllPlan(doc, views, () => null).credits).toBeNull();
  });

  it("words the wait for avatars", () => {
    expect(waitingMessage(["Meenakshi"])).toBe("Meenakshi needs an avatar with its four views first.");
    expect(waitingMessage(["Meenakshi", "Meenakshi's husband"])).toBe("Meenakshi and Meenakshi's husband need an avatar with its four views first.");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/scripts/visualise`
Expected: FAIL — modules not found.

- [ ] **Step 3: Types and rows**

Append to `src/lib/scripts/visualise/schema.ts`:

```ts
import type { Avatar } from "@/lib/avatars/schema";
import type { RegionalKit } from "./kits";

/** D344 — how a draw chooses its prompt: as the panel last was ("draw"), as the operator wrote
 *  it ("edited"), or rebuilt from the script ("reset"). */
export type DrawBody = { kind: "draw" } | { kind: "edited"; prompt: string } | { kind: "reset" };

/** Everything the Visualise view needs beside the script. */
export type VisualiseBoard = {
  /** The avatars the cast links to, archived ones included, so a stale link still explains itself. */
  avatars: Avatar[];
  takes: PanelTake[];
  /** shot id → picked take id */
  picks: Record<string, string>;
  kits: RegionalKit[];
};
```

(Move the two `import type` lines to the top of the file.)

Create `src/lib/scripts/visualise/rows.ts`:

```ts
import type { PanelFaces, PanelTake } from "./schema";

export type PanelTakeRow = {
  id: string;
  client_id: string;
  script_id: string;
  shot_id: string;
  generation_id: string | null;
  status: string;
  url: string | null;
  width: number | null;
  height: number | null;
  prompt: string;
  prompt_edited: boolean;
  shot_key: string;
  faces: unknown;
  error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const STATUSES = new Set(["running", "succeeded", "failed"]);

function isFaces(value: unknown): value is PanelFaces {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function rowToPanelTake(row: PanelTakeRow): PanelTake {
  return {
    id: row.id,
    scriptId: row.script_id,
    shotId: row.shot_id,
    status: STATUSES.has(row.status) ? (row.status as PanelTake["status"]) : "failed",
    url: row.url,
    width: row.width,
    height: row.height,
    prompt: row.prompt,
    promptEdited: row.prompt_edited,
    shotKey: row.shot_key,
    faces: isFaces(row.faces) ? row.faces : {},
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

- [ ] **Step 4: The queue**

Create `src/lib/scripts/visualise/queue.ts`:

```ts
/**
 * D345 — Generate all's queue: runs `work` over `items` in order, at most `limit` at a time.
 * Once `stop()` says so (the credit cap was hit) nothing new starts; items already running
 * finish. A failing item does not stop the others: `work` reports its own errors.
 */
export async function runQueue<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
  stop: () => boolean = () => false,
): Promise<{ started: T[] }> {
  const started: T[] = [];
  let next = 0;
  async function lane() {
    while (next < items.length && !stop()) {
      const item = items[next++];
      started.push(item);
      await work(item).catch(() => undefined);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  return { started };
}
```

- [ ] **Step 5: The state**

Create `src/lib/scripts/visualise/state.ts`:

```ts
import type { Avatar } from "@/lib/avatars/schema";
import { listSentence } from "@/lib/avatars/generation";
import type { ScriptDoc } from "@/lib/scripts/schema";
import { PANEL_PROMPT_MAX, PANEL_RUNNING_TIMEOUT_MS, PANEL_TIMED_OUT } from "./constants";
import { castReadyForPanels, type PanelInputs } from "./panel-inputs";
import type { DrawBody, PanelTake } from "./schema";

// Spec §6.4–§6.7, §7, §8.1 — the state of every panel, what the readiness line counts and what
// Generate all draws, as pure functions over the takes and today's inputs.

export type PanelStatus = "not_yet" | "waiting" | "generating" | "ready" | "out_of_date" | "failed";
export type StaleReason = "shot" | "avatar";

export type PanelView = {
  status: PanelStatus;
  /** The take the client sees. Kept when out of date: a panel is never redrawn on its own. */
  pick: PanelTake | null;
  /** Every drawn take, oldest first (Take 1, Take 2…). */
  takes: PanelTake[];
  /** The latest attempt's message when it failed after the pick (or with no pick at all). */
  failure: string | null;
  staleBecause: StaleReason[];
  waitingFor: string[];
  canGenerate: boolean;
};

/** D343 — why a take no longer matches the script and the avatars as they are now. */
export function staleReasons(take: PanelTake, inputs: Pick<PanelInputs, "shotKey" | "faces">): StaleReason[] {
  const reasons: StaleReason[] = [];
  if (take.shotKey !== inputs.shotKey) reasons.push("shot");
  const castIds = new Set([...Object.keys(inputs.faces), ...Object.keys(take.faces)]);
  for (const id of castIds) {
    const then = take.faces[id];
    const now = inputs.faces[id];
    if (!then || !now || then.avatarId !== now.avatarId || then.faceKey !== now.faceKey) {
      reasons.push("avatar");
      break;
    }
  }
  return reasons;
}

const byCreated = (a: PanelTake, b: PanelTake) => a.createdAt.localeCompare(b.createdAt);

export function panelView(input: {
  inputs: Pick<PanelInputs, "shotKey" | "faces" | "waitingFor">;
  /** This shot's takes, in any order. */
  takes: PanelTake[];
  pickId: string | undefined;
  /** A draw this browser started and is still waiting on. */
  drawing: boolean;
  now: number;
}): PanelView {
  const settled = [...input.takes].sort(byCreated).map((t) =>
    t.status === "running" && input.now - Date.parse(t.createdAt) > PANEL_RUNNING_TIMEOUT_MS
      ? { ...t, status: "failed" as const, error: PANEL_TIMED_OUT }
      : t,
  );
  const takes = settled.filter((t) => t.status === "succeeded");
  const pick = takes.find((t) => t.id === input.pickId) ?? null;
  const latest = settled[settled.length - 1] ?? null;
  const failure = latest?.status === "failed" && (!pick || latest.createdAt > pick.createdAt)
    ? latest.error ?? "The panel could not be drawn."
    : null;
  const staleBecause = pick ? staleReasons(pick, input.inputs) : [];
  const canGenerate = input.inputs.waitingFor.length === 0;

  let status: PanelStatus;
  if (input.drawing || latest?.status === "running") status = "generating";
  else if (pick) status = staleBecause.length > 0 ? "out_of_date" : "ready";
  else if (!canGenerate) status = "waiting";
  else if (failure) status = "failed";
  else status = "not_yet";

  return { status, pick, takes, failure, staleBecause, waitingFor: input.inputs.waitingFor, canGenerate };
}

/** D344 — the prompt a draw sends. A plain redraw keeps a hand-edited prompt while the shot is
 *  unchanged; once the shot's text changed it starts fresh from the new text (spec §8.1), and the
 *  edited prompt stays with its take. */
export function promptForDraw(
  body: DrawBody,
  current: PanelTake | null,
  inputs: Pick<PanelInputs, "prompt" | "shotKey">,
): { ok: true; prompt: string; edited: boolean } | { ok: false; error: string } {
  if (body.kind === "reset") return { ok: true, prompt: inputs.prompt, edited: false };
  if (body.kind === "edited") {
    const prompt = body.prompt.trim();
    if (!prompt) return { ok: false, error: "The prompt is empty." };
    if (prompt.length > PANEL_PROMPT_MAX) return { ok: false, error: `The prompt can be at most ${PANEL_PROMPT_MAX} characters.` };
    return { ok: true, prompt, edited: prompt !== inputs.prompt };
  }
  if (current?.promptEdited && current.shotKey === inputs.shotKey) {
    return { ok: true, prompt: current.prompt, edited: true };
  }
  return { ok: true, prompt: inputs.prompt, edited: false };
}

export function waitingMessage(names: string[]): string {
  return `${listSentence(names)} need${names.length === 1 ? "s" : ""} an avatar with its four views first.`;
}

export type Readiness = { castReady: number; castTotal: number; panelsCurrent: number; shotsTotal: number };

/** Spec §7 — the two counts the readiness line shows (and spec 4 reads). */
export function visualiseReadiness(
  doc: ScriptDoc,
  avatars: ReadonlyMap<string, Avatar>,
  views: ReadonlyMap<string, PanelView>,
): Readiness {
  return {
    castReady: doc.cast.filter((c) => castReadyForPanels(c.avatarId ? avatars.get(c.avatarId) : undefined)).length,
    castTotal: doc.cast.length,
    panelsCurrent: doc.shots.filter((s) => views.get(s.id)?.status === "ready").length,
    shotsTotal: doc.shots.length,
  };
}

export type GenerateAllPlan = {
  /** In script order: every shot with no current panel that can be drawn now. */
  shotIds: string[];
  /** The total, or null when any shot has no price. */
  credits: number | null;
  /** Every one of them was drawn before: "Redraw", not "Generate". */
  redraw: boolean;
  /** Shots left out because someone on screen has no avatar yet. */
  waiting: number;
};

const NEEDS_DRAWING: PanelStatus[] = ["not_yet", "out_of_date", "failed"];

export function generateAllPlan(
  doc: ScriptDoc,
  views: ReadonlyMap<string, PanelView>,
  creditsFor: (shotId: string) => number | null,
): GenerateAllPlan {
  const shotIds = doc.shots
    .filter((s) => {
      const v = views.get(s.id);
      return v !== undefined && v.canGenerate && NEEDS_DRAWING.includes(v.status);
    })
    .map((s) => s.id);
  const prices = shotIds.map(creditsFor);
  return {
    shotIds,
    credits: prices.some((p) => p === null) ? null : prices.reduce<number>((sum, p) => sum + (p ?? 0), 0),
    redraw: shotIds.length > 0 && shotIds.every((id) => (views.get(id)?.takes.length ?? 0) > 0),
    waiting: doc.shots.filter((s) => views.get(s.id)?.canGenerate === false).length,
  };
}

/** "Redraw 9 panels · about 603 credits" (spec §6.5). */
export function generateAllLabel(plan: GenerateAllPlan): string {
  const n = plan.shotIds.length;
  const verb = plan.redraw ? "Redraw" : "Generate";
  const cost = plan.credits === null ? "" : ` · about ${plan.credits.toLocaleString()} credits`;
  return `${verb} ${n} panel${n === 1 ? "" : "s"}${cost}`;
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/lib/scripts/visualise`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scripts/visualise
git commit -m "feat(scripts): panel state, takes, out of date, readiness and Generate all (D343-D345)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Takes in the database, and the panel routes

**Files:**
- Create: `src/lib/db/script-panels.ts`, `src/lib/scripts/visualise/board-server.ts`
- Create: `src/app/api/clients/[id]/scripts/[scriptId]/visualise/route.ts`
- Create: `src/app/api/clients/[id]/scripts/[scriptId]/panels/[shotId]/route.ts`
- Create: `src/app/api/clients/[id]/scripts/[scriptId]/panels/[shotId]/pick/route.ts`
- Test: one `route.test.ts` beside each route

**Interfaces:**
- Consumes: `rowToPanelTake`, `PanelTakeRow` (Task 9); `panelInputs`, `panelReferenceCap` (Task 8); `panelAspect` (Task 8); `promptForDraw`, `waitingMessage` (Task 9); `isVisualiseStage` (Task 4); `runPanelGeneration` (Task 6); `parseRegionalKits` (Task 7); `loadKbText` (Task 7).
- Produces: `listPanelTakes(scriptId): Promise<PanelTake[]>`, `listPanelPicks(scriptId): Promise<Record<string, string>>`, `getPanelTake(scriptId, takeId): Promise<PanelTake | null>`, `insertPanelTake(input): Promise<PanelTake>`, `succeedPanelTake(takeId, { url, width, height, generationId }): Promise<PanelTake>`, `failPanelTake(takeId, error): Promise<void>`, `setPanelPick(scriptId, shotId, takeId): Promise<void>`; `loadVisualiseBoard(clientId, script): Promise<VisualiseBoard>`. Routes: `GET …/scripts/:scriptId/visualise → { script, board }`; `POST …/panels/:shotId` body `DrawBody` → `{ take, pickId }` (402 at the cap, 409 waiting or wrong stage, 502 provider failure); `PUT …/panels/:shotId/pick` body `{ takeId }` → `{ pickId }`. Spec 4's frozen version reads `listPanelPicks` + `listPanelTakes`.

- [ ] **Step 1: The database layer**

Create `src/lib/db/script-panels.ts`:

```ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/avatars/utils";
import { rowToPanelTake, type PanelTakeRow } from "@/lib/scripts/visualise/rows";
import type { PanelFaces, PanelTake } from "@/lib/scripts/visualise/schema";

// D337, D343 — storyboard panel takes and picks, keyed by script and shot. Callers have already
// loaded the script under its client (getScript filters on client_id), so these key on the
// script id. Spec 4 reads listPanelPicks + listPanelTakes to freeze what the client sees.

export async function listPanelTakes(scriptId: string): Promise<PanelTake[]> {
  if (!isUuid(scriptId)) return [];
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("script_panel_takes").select("*").eq("script_id", scriptId).order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as PanelTakeRow[]).map(rowToPanelTake);
}

export async function listPanelPicks(scriptId: string): Promise<Record<string, string>> {
  if (!isUuid(scriptId)) return {};
  const supabase = createServerSupabase();
  const { data, error } = await supabase.from("script_panel_picks").select("shot_id, take_id").eq("script_id", scriptId);
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as { shot_id: string; take_id: string }[]).map((r) => [r.shot_id, r.take_id]));
}

export async function getPanelTake(scriptId: string, takeId: string): Promise<PanelTake | null> {
  if (!isUuid(scriptId) || !isUuid(takeId)) return null;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("script_panel_takes").select("*").eq("id", takeId).eq("script_id", scriptId).maybeSingle();
  if (error) throw error;
  return data ? rowToPanelTake(data as PanelTakeRow) : null;
}

/** A take starts "running" before the model is called, holding what it is drawn from. */
export async function insertPanelTake(input: {
  clientId: string;
  scriptId: string;
  shotId: string;
  prompt: string;
  promptEdited: boolean;
  shotKey: string;
  faces: PanelFaces;
  userId: string;
}): Promise<PanelTake> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("script_panel_takes")
    .insert({
      client_id: input.clientId, script_id: input.scriptId, shot_id: input.shotId,
      prompt: input.prompt, prompt_edited: input.promptEdited, shot_key: input.shotKey,
      faces: input.faces, created_by: input.userId, status: "running",
    })
    .select("*").single();
  if (error) throw error;
  return rowToPanelTake(data as PanelTakeRow);
}

export async function succeedPanelTake(
  takeId: string,
  result: { url: string; width: number | null; height: number | null; generationId: string },
): Promise<PanelTake> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("script_panel_takes")
    .update({
      status: "succeeded", url: result.url, width: result.width, height: result.height,
      generation_id: result.generationId, error: null, updated_at: new Date().toISOString(),
    })
    .eq("id", takeId).select("*").single();
  if (error) throw error;
  return rowToPanelTake(data as PanelTakeRow);
}

export async function failPanelTake(takeId: string, message: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("script_panel_takes")
    .update({ status: "failed", error: message, updated_at: new Date().toISOString() })
    .eq("id", takeId);
  if (error) throw error;
}

export async function setPanelPick(scriptId: string, shotId: string, takeId: string): Promise<void> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("script_panel_picks")
    .upsert({ script_id: scriptId, shot_id: shotId, take_id: takeId, picked_at: new Date().toISOString() },
      { onConflict: "script_id,shot_id" });
  if (error) throw error;
}
```

Create `src/lib/scripts/visualise/board-server.ts`:

```ts
import "server-only";
import { getAvatar } from "@/lib/db/avatars";
import { listPanelPicks, listPanelTakes } from "@/lib/db/script-panels";
import type { Avatar } from "@/lib/avatars/schema";
import type { Script } from "@/lib/scripts/schema";
import { loadKbText } from "./kb-text";
import { parseRegionalKits } from "./kits";
import type { VisualiseBoard } from "./schema";

/** Everything Visualise needs beside the script, read once for the page, the board route and
 *  the draw route alike. Linked avatars are read by id (this client's only, archived included). */
export async function loadVisualiseBoard(clientId: string, script: Script): Promise<VisualiseBoard> {
  const ids = [...new Set(script.doc.cast.map((c) => c.avatarId).filter((id): id is string => Boolean(id)))];
  const [avatars, takes, picks, kbText] = await Promise.all([
    Promise.all(ids.map((id) => getAvatar(clientId, id))).then((list) => list.filter((a): a is Avatar => a !== null)),
    listPanelTakes(script.id),
    listPanelPicks(script.id),
    loadKbText(clientId),
  ]);
  return { avatars, takes, picks, kits: parseRegionalKits(kbText) };
}
```

- [ ] **Step 2: Write the failing route tests**

Create `src/app/api/clients/[id]/scripts/[scriptId]/panels/[shotId]/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { faceKey } from "@/lib/scripts/visualise/keys";
import {
  HUSBAND_AVATAR, makeScript, makeTake, MEENAKSHI_AVATAR, readyAvatar, reel01Doc, SCRIPT_ID,
} from "@/lib/scripts/visualise/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/scripts/visualise/board-server", () => ({ loadVisualiseBoard: vi.fn() }));
vi.mock("@/lib/scripts/visualise/run-panel", () => ({ runPanelGeneration: vi.fn() }));
vi.mock("@/lib/db/script-panels", () => ({
  insertPanelTake: vi.fn(), succeedPanelTake: vi.fn(), failPanelTake: vi.fn(), setPanelPick: vi.fn(),
}));
vi.mock("@/lib/db/credit-transactions", () => {
  class CreditLimitError extends Error {}
  return { CreditLimitError };
});

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { loadVisualiseBoard } from "@/lib/scripts/visualise/board-server";
import { runPanelGeneration } from "@/lib/scripts/visualise/run-panel";
import { failPanelTake, insertPanelTake, setPanelPick, succeedPanelTake } from "@/lib/db/script-panels";
import { CreditLimitError } from "@/lib/db/credit-transactions";

const meenakshi = readyAvatar(MEENAKSHI_AVATAR, "meenakshi");
const husband = readyAvatar(HUSBAND_AVATAR, "husband");
const ctx = (shotId: string) => ({ params: Promise.resolve({ id: "c1", scriptId: SCRIPT_ID, shotId }) });
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/panels/s06`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", email: "op@x.com", orgId: "org-1" } as never);
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
  vi.mocked(getScript).mockResolvedValue(makeScript());
  vi.mocked(loadVisualiseBoard).mockResolvedValue({ avatars: [meenakshi, husband], takes: [], picks: {}, kits: [] });
  vi.mocked(insertPanelTake).mockImplementation(async (i) => makeTake({ id: "t-new", status: "running", url: null, ...i }));
  vi.mocked(runPanelGeneration).mockResolvedValue({
    generation: { id: "g1", output_snapshot: "https://x/p.png", meta: { width: 768, height: 1365 } } as never, creditsCharged: 9,
  });
  vi.mocked(succeedPanelTake).mockImplementation(async (id, r) => makeTake({ id, url: r.url }));
  vi.mocked(failPanelTake).mockResolvedValue(undefined);
  vi.mocked(setPanelPick).mockResolvedValue(undefined);
});

describe("POST …/panels/:shotId", () => {
  it("draws the panel from both people's views, stores the take and picks it", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ kind: "draw" }), ctx("s06"));
    expect(res.status).toBe(200);
    const take = vi.mocked(insertPanelTake).mock.calls[0][0];
    expect(take).toMatchObject({ clientId: "c1", scriptId: SCRIPT_ID, shotId: "s06", promptEdited: false, userId: "u1" });
    expect(take.prompt).toContain("marker-and-wash sketch");
    const run = vi.mocked(runPanelGeneration).mock.calls[0][0];
    expect(run).toMatchObject({ scriptId: SCRIPT_ID, shotId: "s06", aspect: "9:16", orgId: "org-1", prompt: take.prompt });
    expect(run.referenceUrls).toHaveLength(8);
    expect(succeedPanelTake).toHaveBeenCalledWith("t-new", { url: "https://x/p.png", width: 768, height: 1365, generationId: "g1" });
    expect(setPanelPick).toHaveBeenCalledWith(SCRIPT_ID, "s06", "t-new");
    expect((await res.json()).pickId).toBe("t-new");
  });

  it("records the faces it drew from BEFORE the model call, so a refine during the draw marks it out of date", async () => {
    const { POST } = await import("./route");
    await POST(post({ kind: "draw" }), ctx("s06"));
    const take = vi.mocked(insertPanelTake).mock.calls[0][0];
    expect(take.faces.meenakshi).toEqual({ avatarId: MEENAKSHI_AVATAR, faceKey: faceKey(meenakshi) });
    expect(vi.mocked(insertPanelTake).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(runPanelGeneration).mock.invocationCallOrder[0]);
  });

  it("refuses while someone on screen has no avatar with four views, and names them", async () => {
    vi.mocked(loadVisualiseBoard).mockResolvedValue({ avatars: [husband], takes: [], picks: {}, kits: [] });
    const { POST } = await import("./route");
    const res = await POST(post({ kind: "draw" }), ctx("s06"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Meenakshi needs an avatar with its four views first.");
    expect(insertPanelTake).not.toHaveBeenCalled();
  });

  it("draws a B-roll shot with no avatars at all", async () => {
    vi.mocked(getScript).mockResolvedValue(makeScript(reel01Doc()));
    vi.mocked(loadVisualiseBoard).mockResolvedValue({ avatars: [], takes: [], picks: {}, kits: [] });
    const { POST } = await import("./route");
    expect((await POST(post({ kind: "draw" }), ctx("s03"))).status).toBe(200);
    expect(vi.mocked(runPanelGeneration).mock.calls[0][0].referenceUrls).toEqual([]);
  });

  it("sends an edited prompt as written, and keeps it on a plain redraw while the shot is unchanged", async () => {
    const { POST } = await import("./route");
    await POST(post({ kind: "edited", prompt: "Closer on her hands." }), ctx("s06"));
    expect(vi.mocked(insertPanelTake).mock.calls[0][0]).toMatchObject({ prompt: "Closer on her hands.", promptEdited: true });

    const first = vi.mocked(insertPanelTake).mock.calls[0][0];
    const picked = makeTake({ id: "t-old", shotId: "s06", prompt: "Closer on her hands.", promptEdited: true, shotKey: first.shotKey });
    vi.mocked(loadVisualiseBoard).mockResolvedValue({ avatars: [meenakshi, husband], takes: [picked], picks: { s06: "t-old" }, kits: [] });
    await POST(post({ kind: "draw" }), ctx("s06"));
    expect(vi.mocked(insertPanelTake).mock.calls[1][0]).toMatchObject({ prompt: "Closer on her hands.", promptEdited: true });
  });

  it("is a 400 for an empty edited prompt or an unknown body", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ kind: "edited", prompt: "  " }), ctx("s06"))).status).toBe(400);
    expect((await POST(post({ kind: "paint" }), ctx("s06"))).status).toBe(400);
  });

  it("fails the take with the cap message and answers 402", async () => {
    vi.mocked(runPanelGeneration).mockRejectedValue(new CreditLimitError("Monthly credit limit reached"));
    const { POST } = await import("./route");
    const res = await POST(post({ kind: "draw" }), ctx("s06"));
    expect(res.status).toBe(402);
    expect(failPanelTake).toHaveBeenCalledWith("t-new", expect.stringContaining("Monthly credit limit"));
    expect(setPanelPick).not.toHaveBeenCalled();
  });

  it("fails the take with the provider's message and answers 502", async () => {
    vi.mocked(runPanelGeneration).mockRejectedValue(new Error("Content blocked"));
    const { POST } = await import("./route");
    const res = await POST(post({ kind: "draw" }), ctx("s06"));
    expect(res.status).toBe(502);
    expect(failPanelTake).toHaveBeenCalledWith("t-new", "Content blocked");
  });

  it("refuses outside Visualise and In review, and is a 404 for a shot the script does not have", async () => {
    vi.mocked(getScript).mockResolvedValueOnce(makeScript(undefined, "approved"));
    const { POST } = await import("./route");
    expect((await POST(post({ kind: "draw" }), ctx("s06"))).status).toBe(409);
    expect((await POST(post({ kind: "draw" }), ctx("s99"))).status).toBe(404);
  });
});
```

Create `src/app/api/clients/[id]/scripts/[scriptId]/panels/[shotId]/pick/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeScript, makeTake, SCRIPT_ID } from "@/lib/scripts/visualise/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-panels", () => ({ getPanelTake: vi.fn(), setPanelPick: vi.fn() }));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { getPanelTake, setPanelPick } from "@/lib/db/script-panels";

const TAKE = "9b1c2b1e-0000-4000-8000-000000000009";
const ctx = { params: Promise.resolve({ id: "c1", scriptId: SCRIPT_ID, shotId: "s06" }) };
const put = (body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/panels/s06/pick`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
  vi.mocked(getScript).mockResolvedValue(makeScript());
  vi.mocked(getPanelTake).mockResolvedValue(makeTake({ id: TAKE, shotId: "s06" }));
});

describe("PUT …/panels/:shotId/pick", () => {
  it("makes an earlier take the one the client sees (D343)", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(put({ takeId: TAKE }), ctx);
    expect(res.status).toBe(200);
    expect(setPanelPick).toHaveBeenCalledWith(SCRIPT_ID, "s06", TAKE);
  });

  it("refuses another shot's take, a failed take, or one still drawing", async () => {
    const { PUT } = await import("./route");
    for (const take of [makeTake({ id: TAKE, shotId: "s07" }), makeTake({ id: TAKE, shotId: "s06", status: "failed" }), makeTake({ id: TAKE, shotId: "s06", status: "running" })]) {
      vi.mocked(getPanelTake).mockResolvedValueOnce(take);
      expect((await PUT(put({ takeId: TAKE }), ctx)).status).toBe(404);
    }
    expect(setPanelPick).not.toHaveBeenCalled();
  });

  it("refuses outside Visualise and In review", async () => {
    vi.mocked(getScript).mockResolvedValue(makeScript(undefined, "generate"));
    const { PUT } = await import("./route");
    expect((await PUT(put({ takeId: TAKE }), ctx)).status).toBe(409);
  });
});
```

Create `src/app/api/clients/[id]/scripts/[scriptId]/visualise/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeScript, SCRIPT_ID } from "@/lib/scripts/visualise/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/scripts/visualise/board-server", () => ({ loadVisualiseBoard: vi.fn() }));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { loadVisualiseBoard } from "@/lib/scripts/visualise/board-server";

const ctx = { params: Promise.resolve({ id: "c1", scriptId: SCRIPT_ID }) };
const get = () => new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/visualise`);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
});

describe("GET …/scripts/:scriptId/visualise", () => {
  it("returns the script and its board", async () => {
    vi.mocked(getScript).mockResolvedValue(makeScript());
    vi.mocked(loadVisualiseBoard).mockResolvedValue({ avatars: [], takes: [], picks: {}, kits: [] });
    const { GET } = await import("./route");
    const res = await GET(get(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ script: { id: SCRIPT_ID }, board: { picks: {} } });
  });

  it("is a 404 for a script this client does not have", async () => {
    vi.mocked(getScript).mockResolvedValue(null);
    const { GET } = await import("./route");
    expect((await GET(get(), ctx)).status).toBe(404);
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run "src/app/api/clients/[id]/scripts/[scriptId]/panels" "src/app/api/clients/[id]/scripts/[scriptId]/visualise"`
Expected: FAIL — route modules not found.

- [ ] **Step 4: The routes**

Create `src/app/api/clients/[id]/scripts/[scriptId]/visualise/route.ts`:

```ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getScript } from "@/lib/db/scripts";
import { loadVisualiseBoard } from "@/lib/scripts/visualise/board-server";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// GET /api/clients/:id/scripts/:scriptId/visualise — the script plus everything Visualise keeps
// beside it: the linked avatars, every take, the picks and the regional kits.
export async function GET(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the storyboard.", async () => {
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      return apiOk({ script, board: await loadVisualiseBoard(clientId, script) });
    }),
  );
}
```

Create `src/app/api/clients/[id]/scripts/[scriptId]/panels/[shotId]/route.ts`:

```ts
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getScript } from "@/lib/db/scripts";
import { failPanelTake, insertPanelTake, setPanelPick, succeedPanelTake } from "@/lib/db/script-panels";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";
import { loadVisualiseBoard } from "@/lib/scripts/visualise/board-server";
import { isVisualiseStage } from "@/lib/scripts/visualise/cast";
import { panelInputs, panelReferenceCap } from "@/lib/scripts/visualise/panel-inputs";
import { panelAspect } from "@/lib/scripts/visualise/panel-prompt";
import { promptForDraw, waitingMessage } from "@/lib/scripts/visualise/state";
import { runPanelGeneration } from "@/lib/scripts/visualise/run-panel";

// One Nano Banana 2 image with up to 14 references.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string; scriptId: string; shotId: string }> };

const DrawSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("draw") }),
  z.object({ kind: z.literal("edited"), prompt: z.string() }),
  z.object({ kind: z.literal("reset") }),
]);

// POST /api/clients/:id/scripts/:scriptId/panels/:shotId — D341–D345: draw one shot's panel.
// The take is stored "running" with what it is drawn from (prompt, shot fingerprint, faces)
// BEFORE the model is called, so an avatar refined mid-draw shows the result out of date at
// once. A drawn take becomes the pick; the operator can pick an earlier one back.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId, shotId } = await params;
  return withClient(req, params, async (clientId, client) =>
    withTryCatch("Could not draw the panel.", async () => {
      const body = DrawSchema.safeParse(await req.json().catch(() => null));
      if (!body.success) return apiError("Invalid request body.", 400);

      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      if (!isVisualiseStage(script.stage)) {
        return apiError("Panels can be drawn only while the script is in Visualise or In review.", 409);
      }
      const shot = script.doc.shots.find((s) => s.id === shotId);
      if (!shot) return apiError("No such shot in this script.", 404);

      const board = await loadVisualiseBoard(clientId, script);
      const inputs = panelInputs({
        doc: script.doc, shot, avatars: new Map(board.avatars.map((a) => [a.id, a])),
        kits: board.kits, cap: panelReferenceCap(),
      });
      if (inputs.waitingFor.length > 0) return apiError(waitingMessage(inputs.waitingFor), 409);

      const pickId = board.picks[shot.id];
      const current = board.takes.find((t) => t.id === pickId) ?? null;
      const chosen = promptForDraw(body.data, current, inputs);
      if (!chosen.ok) return apiError(chosen.error, 400);

      const caller = await resolveCallerContext();
      const take = await insertPanelTake({
        clientId, scriptId: script.id, shotId: shot.id, prompt: chosen.prompt, promptEdited: chosen.edited,
        shotKey: inputs.shotKey, faces: inputs.faces, userId: caller.userId,
      });
      try {
        const { generation } = await runPanelGeneration({
          clientId, scriptId: script.id, shotId: shot.id, orgId: client.org_id,
          userId: caller.userId, userEmail: caller.email ?? null,
          aspect: panelAspect(script.doc), prompt: chosen.prompt,
          referenceUrls: inputs.references.map((r) => r.url),
        });
        const meta = (generation.meta ?? {}) as { width?: number | null; height?: number | null };
        const done = await succeedPanelTake(take.id, {
          url: generation.output_snapshot ?? "", width: meta.width ?? null, height: meta.height ?? null,
          generationId: generation.id,
        });
        await setPanelPick(script.id, shot.id, done.id);
        return apiOk({ take: done, pickId: done.id });
      } catch (e) {
        // Nothing was charged: the billed run refunded the reservation (D291).
        const capped = e instanceof CreditLimitError;
        const message = capped ? CREDIT_LIMIT_TOAST_MESSAGE : e instanceof Error ? e.message : "The panel could not be drawn.";
        await failPanelTake(take.id, message).catch(() => null);
        return apiError(message, capped ? 402 : 502);
      }
    }),
  );
}
```

Create `src/app/api/clients/[id]/scripts/[scriptId]/panels/[shotId]/pick/route.ts`:

```ts
import { z } from "zod";
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getScript } from "@/lib/db/scripts";
import { getPanelTake, setPanelPick } from "@/lib/db/script-panels";
import { isVisualiseStage } from "@/lib/scripts/visualise/cast";

type Ctx = { params: Promise<{ id: string; scriptId: string; shotId: string }> };

const Body = z.object({ takeId: z.uuid() });

// PUT /api/clients/:id/scripts/:scriptId/panels/:shotId/pick — D343: choose which drawn take of
// this shot is current. The client only ever sees the pick.
export async function PUT(req: Request, { params }: Ctx) {
  const { scriptId, shotId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not pick the take.", async () => {
      const body = Body.safeParse(await req.json().catch(() => null));
      if (!body.success) return apiError("Invalid request body.", 400);
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      if (!isVisualiseStage(script.stage)) {
        return apiError("Takes can be picked only while the script is in Visualise or In review.", 409);
      }
      const take = await getPanelTake(script.id, body.data.takeId);
      if (!take || take.shotId !== shotId || take.status !== "succeeded") {
        return apiError("No such take for this shot.", 404);
      }
      await setPanelPick(script.id, shotId, take.id);
      return apiOk({ pickId: take.id });
    }),
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run "src/app/api/clients/[id]/scripts" src/lib/scripts`
Expected: PASS.

- [ ] **Step 6: Try one draw for real**

With migration 0053 applied (Task 1 Step 8), seed Reel 01 at Visualise (`node scripts/seed-script.mjs <slug> --stage visualise`), run `npm run dev`, sign in, and from the browser console on any app page run:

```js
await fetch("/api/clients/<client-uuid>/scripts/<script-uuid>/panels/s03", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "draw" }) }).then((r) => r.json())
```

Expected: a `take` with a `url` that opens as a 9:16 marker sketch of a kitchen, with no text; a second call adds a second take. S06 answers 409 "Meenakshi and Meenakshi's husband need an avatar with its four views first."

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/script-panels.ts src/lib/scripts/visualise "src/app/api/clients/[id]/scripts/[scriptId]/visualise" "src/app/api/clients/[id]/scripts/[scriptId]/panels"
git commit -m "feat(scripts): draw a storyboard panel, keep its takes, pick one (D341-D345)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The Visualise view: browser layer, page, readiness line, Generate all, Reopen

**Files:**
- Create: `src/services/visualise.service.ts`, `src/hooks/queries/visualise.ts`, `src/hooks/use-panel-draws.ts`, `src/hooks/use-visualise-model.ts`
- Modify (additive): `src/components/scripts/script-view.tsx`, `src/components/scripts/script-shot-list.tsx`, `src/components/scripts/script-shot-row.tsx`
- Modify: `src/app/clients/[id]/scripts/[scriptId]/page.tsx`
- Create: `src/components/visualise/visualise-view.tsx`, `src/components/visualise/visualise-readiness.tsx`, `src/components/visualise/generate-all-dialog.tsx`, `src/components/visualise/reopen-dialog.tsx`

**Interfaces:**
- Consumes: the routes of Tasks 5 and 10; `runQueue`, `panelView`, `visualiseReadiness`, `generateAllPlan`, `generateAllLabel` (Task 9); `panelInputs`, `panelReferenceCap`, `estimatePanelCredits` (Task 8); `panelAspect` (Task 8); `loadVisualiseBoard` (Task 10); `isVisualiseStage` (Task 4).
- Produces: `visualiseService.{ board, linkCast, reopen, draw, pick }`; `visualiseKeys.board(clientId, scriptId)`; `type BoardData = { script: Script; board: VisualiseBoard }`; `useVisualiseBoard(clientId, scriptId, initial)`, `useLinkCast(clientId, scriptId)` (mutation `{ castId, avatarId }`), `usePickTake(clientId, scriptId)` (mutation `{ shotId, takeId }`), `useReopenScript(clientId, scriptId)`; `usePanelDraws(clientId, scriptId) → { drawing: ReadonlySet<string>; drawingAll: boolean; draw(shotId, body?): Promise<void>; drawAll(shotIds): Promise<void> }`; `useVisualiseModel(script, board, drawing, now) → { avatars, aspect, inputs, views, credits, readiness, plan, avatarFaces }`; `ScriptView` optional props `top?: ReactNode`, `cast?: ReactNode`, `shotAside?: (t: TimedShot) => ReactNode`; `VisualiseView({ clientId, initial })`.

This task and the next two are UI. There is no DOM test environment in this repo (vitest runs in `node`), so each ends with a type check, lint, and a look in the running app; the logic they show is already tested in Tasks 8 and 9.

- [ ] **Step 1: The service**

Create `src/services/visualise.service.ts`:

```ts
import type { Script } from "@/lib/scripts/schema";
import type { DrawBody, PanelTake, VisualiseBoard } from "@/lib/scripts/visualise/schema";
import { readJson } from "./read-json";

const JSON_HEADERS = { "Content-Type": "application/json" };
const base = (clientId: string, scriptId: string) => `/api/clients/${clientId}/scripts/${scriptId}`;

// Spec 3 — browser calls to Visualise's routes (D300 layer 1).
class VisualiseService {
  async board(clientId: string, scriptId: string): Promise<{ script: Script; board: VisualiseBoard }> {
    const res = await fetch(`${base(clientId, scriptId)}/visualise`);
    return readJson(res, "Could not load the storyboard.");
  }

  async linkCast(clientId: string, scriptId: string, castId: string, avatarId: string | null): Promise<Script> {
    const res = await fetch(`${base(clientId, scriptId)}/cast/${encodeURIComponent(castId)}`, {
      method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ avatarId }),
    });
    return (await readJson<{ script: Script }>(res, "Could not change the avatar.")).script;
  }

  async reopen(clientId: string, scriptId: string): Promise<Script> {
    const res = await fetch(`${base(clientId, scriptId)}/reopen`, { method: "POST" });
    return (await readJson<{ script: Script }>(res, "Could not reopen the script.")).script;
  }

  async draw(clientId: string, scriptId: string, shotId: string, body: DrawBody): Promise<{ take: PanelTake; pickId: string }> {
    const res = await fetch(`${base(clientId, scriptId)}/panels/${encodeURIComponent(shotId)}`, {
      method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body),
    });
    return readJson(res, "Could not draw the panel.");
  }

  async pick(clientId: string, scriptId: string, shotId: string, takeId: string): Promise<{ pickId: string }> {
    const res = await fetch(`${base(clientId, scriptId)}/panels/${encodeURIComponent(shotId)}/pick`, {
      method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ takeId }),
    });
    return readJson(res, "Could not pick the take.");
  }
}

export const visualiseService = new VisualiseService();
```

- [ ] **Step 2: The query hooks**

Create `src/hooks/queries/visualise.ts`:

```ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { visualiseService } from "@/services/visualise.service";
import type { Script } from "@/lib/scripts/schema";
import type { VisualiseBoard } from "@/lib/scripts/visualise/schema";
import { avatarKeys } from "./avatars";

// Spec 3 — the Visualise board through TanStack Query (D300). Keys are built here only.
export type BoardData = { script: Script; board: VisualiseBoard };

export const visualiseKeys = {
  board: (clientId: string, scriptId: string) => ["visualise", clientId, scriptId] as const,
};

const POLL_MS = 4000;

/** The script and its board, seeded from the page. While any take is still drawing (another
 *  tab's Generate all, a reload mid-draw) it is polled; once all settle, polling stops. */
export function useVisualiseBoard(clientId: string, scriptId: string, initial: BoardData) {
  return useQuery({
    queryKey: visualiseKeys.board(clientId, scriptId),
    queryFn: () => visualiseService.board(clientId, scriptId),
    initialData: initial,
    refetchInterval: (query) => (query.state.data?.board.takes.some((t) => t.status === "running") ? POLL_MS : false),
  });
}

export function useLinkCast(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  const key = visualiseKeys.board(clientId, scriptId);
  return useMutation({
    mutationFn: ({ castId, avatarId }: { castId: string; avatarId: string | null }) =>
      visualiseService.linkCast(clientId, scriptId, castId, avatarId),
    onSuccess: (script) => queryClient.setQueryData<BoardData>(key, (prev) => (prev ? { ...prev, script } : prev)),
    onSettled: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({ queryKey: avatarKeys.list(clientId) }),
    ]),
  });
}

export function usePickTake(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  const key = visualiseKeys.board(clientId, scriptId);
  return useMutation({
    mutationFn: ({ shotId, takeId }: { shotId: string; takeId: string }) =>
      visualiseService.pick(clientId, scriptId, shotId, takeId),
    onMutate: ({ shotId, takeId }) =>
      queryClient.setQueryData<BoardData>(key, (prev) =>
        prev ? { ...prev, board: { ...prev.board, picks: { ...prev.board.picks, [shotId]: takeId } } } : prev),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useReopenScript(clientId: string, scriptId: string) {
  return useMutation({ mutationFn: () => visualiseService.reopen(clientId, scriptId) });
}
```

- [ ] **Step 3: Draws and the derived model**

Create `src/hooks/use-panel-draws.ts`:

```ts
"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { visualiseService } from "@/services/visualise.service";
import { ApiError } from "@/services/read-json";
import { errorMessage } from "@/lib/avatars/utils";
import { GENERATE_ALL_CONCURRENCY } from "@/lib/scripts/visualise/constants";
import { runQueue } from "@/lib/scripts/visualise/queue";
import type { DrawBody } from "@/lib/scripts/visualise/schema";
import { visualiseKeys } from "@/hooks/queries/visualise";

type DrawResult = { ok: true } | { ok: false; message: string; capped: boolean };

// D345 — drawing panels from the browser: one shot, or Generate all as a bounded queue that
// stops starting new draws at the credit cap. `drawing` lets a panel show its placeholder the
// moment the click lands, before the server's running take is read back.
export function usePanelDraws(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  const [drawing, setDrawing] = useState<ReadonlySet<string>>(() => new Set());
  const [drawingAll, setDrawingAll] = useState(false);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: visualiseKeys.board(clientId, scriptId) }),
    [queryClient, clientId, scriptId],
  );

  const drawQuietly = useCallback(async (shotId: string, body: DrawBody): Promise<DrawResult> => {
    setDrawing((prev) => new Set(prev).add(shotId));
    try {
      await visualiseService.draw(clientId, scriptId, shotId, body);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: errorMessage(e, "Could not draw the panel"), capped: e instanceof ApiError && e.status === 402 };
    } finally {
      setDrawing((prev) => {
        const next = new Set(prev);
        next.delete(shotId);
        return next;
      });
      void refresh();
    }
  }, [clientId, scriptId, refresh]);

  const draw = useCallback(async (shotId: string, body: DrawBody = { kind: "draw" }) => {
    const result = await drawQuietly(shotId, body);
    if (!result.ok) toast.error(result.message);
  }, [drawQuietly]);

  const drawAll = useCallback(async (shotIds: string[]) => {
    setDrawingAll(true);
    let capped = false;
    const errors = new Set<string>();
    try {
      await runQueue(shotIds, GENERATE_ALL_CONCURRENCY, async (shotId) => {
        const result = await drawQuietly(shotId, { kind: "draw" });
        if (!result.ok) {
          errors.add(result.message);
          if (result.capped) capped = true;
        }
      }, () => capped);
    } finally {
      setDrawingAll(false);
    }
    // The same failure (the cap, a blocked prompt) usually hits several panels: say each once.
    for (const message of errors) toast.error(message);
  }, [drawQuietly]);

  return { drawing, drawingAll, draw, drawAll };
}
```

Create `src/hooks/use-visualise-model.ts`:

```ts
"use client";

import { useMemo } from "react";
import type { Script } from "@/lib/scripts/schema";
import { estimatePanelCredits, panelInputs, panelReferenceCap, type PanelInputs } from "@/lib/scripts/visualise/panel-inputs";
import { panelAspect } from "@/lib/scripts/visualise/panel-prompt";
import { generateAllPlan, panelView, visualiseReadiness, type PanelView } from "@/lib/scripts/visualise/state";
import type { VisualiseBoard } from "@/lib/scripts/visualise/schema";

/** Everything the Visualise view shows, derived from the script and its board with the same
 *  pure functions the draw route uses. `now` is when the board was read, for the take timeout. */
export function useVisualiseModel(script: Script, board: VisualiseBoard, drawing: ReadonlySet<string>, now: number) {
  return useMemo(() => {
    const avatars = new Map(board.avatars.map((a) => [a.id, a]));
    const cap = panelReferenceCap();
    const aspect = panelAspect(script.doc);
    const inputs = new Map<string, PanelInputs>();
    const views = new Map<string, PanelView>();
    const credits = new Map<string, number | null>();
    for (const shot of script.doc.shots) {
      const i = panelInputs({ doc: script.doc, shot, avatars, kits: board.kits, cap });
      inputs.set(shot.id, i);
      views.set(shot.id, panelView({
        inputs: i, takes: board.takes.filter((t) => t.shotId === shot.id),
        pickId: board.picks[shot.id], drawing: drawing.has(shot.id), now,
      }));
      credits.set(shot.id, estimatePanelCredits(i.references.length, aspect));
    }
    return {
      avatars, aspect, inputs, views, credits,
      readiness: visualiseReadiness(script.doc, avatars, views),
      plan: generateAllPlan(script.doc, views, (id) => credits.get(id) ?? null),
      avatarFaces: Object.fromEntries(board.avatars.map((a) => [a.id, a.front?.url ?? null])),
    };
  }, [script, board, drawing, now]);
}
```

- [ ] **Step 4: Slots on the script view (additive; merge point)**

In `src/components/scripts/script-view.tsx`:

```tsx
import type { ReactNode } from "react";
import type { Script } from "@/lib/scripts/schema";
import type { TimedShot } from "@/lib/scripts/timeline";
import { ScriptContextCard } from "./script-context-card";
import { ScriptCastList } from "./script-cast-list";
import { ScriptShotList } from "./script-shot-list";

/** Spec 1 §4 — the one script view. Read-only here; Generate, Visualise and Client review
 *  (specs 2 to 4) put their work around it rather than drawing the script their own way.
 *  The three optional slots are how they do it; left out, the view is exactly spec 1's. */
export function ScriptView({ script, avatarFaces, top, cast, shotAside }: {
  script: Script;
  avatarFaces: Record<string, string | null>;
  /** Shown above the context card (Visualise: the readiness line). */
  top?: ReactNode;
  /** Replaces the read-only cast list (Visualise: the cast slots). */
  cast?: ReactNode;
  /** Drawn beside each shot (Visualise: its storyboard panel). */
  shotAside?: (timed: TimedShot) => ReactNode;
}) {
  return (
    <div className="flex flex-col gap-8">
      {top}
      <ScriptContextCard doc={script.doc} stage={script.stage} />
      {cast ?? <ScriptCastList cast={script.doc.cast} avatarFaces={avatarFaces} />}
      <ScriptShotList shots={script.doc.shots} cast={script.doc.cast} aside={shotAside} />
    </div>
  );
}
```

In `src/components/scripts/script-shot-list.tsx`: add `aside?: (t: TimedShot) => ReactNode` to the props (import `ReactNode` and `TimedShot`), pass `aside={aside ? aside(t) : undefined}` to both `ScriptShotRow` call sites, and replace the column header with:

```tsx
        {aside ? (
          <div className="hidden gap-4 border-b border-border bg-muted/50 px-4 py-2 md:flex">
            <div className={`grid flex-1 gap-3 ${SHOT_GRID}`}>
              {COLUMNS.map((c) => <span key={c} className="text-eyebrow">{c}</span>)}
            </div>
            <span className="text-eyebrow w-40 shrink-0">Panel</span>
          </div>
        ) : (
          <div className={`hidden gap-3 border-b border-border bg-muted/50 px-4 py-2 md:grid ${SHOT_GRID}`}>
            {COLUMNS.map((c) => <span key={c} className="text-eyebrow">{c}</span>)}
          </div>
        )}
```

In `src/components/scripts/script-shot-row.tsx`, accept `aside?: ReactNode` and render it beside the grid only when given:

```tsx
export function ScriptShotRow({ timed, cast, aside }: { timed: TimedShot; cast: CastMember[]; aside?: ReactNode }) {
  const { shot } = timed;
  const names = shot.onScreen.map((id) => cast.find((c) => c.id === id)?.name).filter(Boolean);
  const cells = (
    <>
      <span className="flex flex-col text-sm tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">S{timed.index + 1}</span>
        {formatRange(timed.start, timed.end)}
      </span>
      <span className="text-sm">{shot.visual}</span>
      <span className="text-sm text-muted-foreground">{shot.vo}</span>
      <span className="text-sm font-medium">{shot.onScreenText}</span>
      <span className="text-xs text-muted-foreground">{names.length > 0 ? names.join(", ") : "Nobody (B-roll)"}</span>
    </>
  );
  if (aside === undefined) {
    return <li className={`grid gap-3 border-b border-border px-4 py-3 last:border-b-0 ${SHOT_GRID}`}>{cells}</li>;
  }
  return (
    <li className="flex flex-col gap-4 border-b border-border px-4 py-3 last:border-b-0 md:flex-row md:items-start">
      <div className={`grid min-w-0 flex-1 gap-3 ${SHOT_GRID}`}>{cells}</div>
      <div className="md:w-40 md:shrink-0">{aside}</div>
    </li>
  );
}
```

- [ ] **Step 5: The readiness line and its two dialogs**

Create `src/components/visualise/generate-all-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { generateAllLabel, type GenerateAllPlan } from "@/lib/scripts/visualise/state";

// D345 — Generate all shows its total first ("Redraw 9 panels · about N credits"), then runs.
export function GenerateAllDialog({ plan, busy, onConfirm }: { plan: GenerateAllPlan; busy: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const none = plan.shotIds.length === 0;
  return (
    <>
      <Button disabled={none || busy} onClick={() => setOpen(true)}>
        <Sparkles className="size-4" strokeWidth={1.5} />
        {busy ? "Drawing…" : "Generate all"}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{generateAllLabel(plan)}</AlertDialogTitle>
            <AlertDialogDescription>
              Every shot without a current panel is drawn, three at a time. Each panel is billed like any image.
              {plan.waiting > 0 && ` ${plan.waiting} shot${plan.waiting === 1 ? " waits" : "s wait"} for an avatar and ${plan.waiting === 1 ? "is" : "are"} left out.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setOpen(false); onConfirm(); }}>
              {plan.redraw ? "Redraw" : "Generate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

Create `src/components/visualise/reopen-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// D346 — Reopen sends the script back to Generate, where its text is edited (spec 2).
export function ReopenDialog({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" disabled={busy} onClick={() => setOpen(true)}>
        <Undo2 className="size-4" strokeWidth={1.5} />
        Reopen
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reopen in Generate?</AlertDialogTitle>
            <AlertDialogDescription>
              The script goes back to Generate so its text can change. Avatars and panels are kept; the panels of
              shots that change are marked out of date when it comes back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setOpen(false); onConfirm(); }}>Reopen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

Create `src/components/visualise/visualise-readiness.tsx`:

```tsx
"use client";

import type { ScriptStage } from "@/lib/scripts/constants";
import type { GenerateAllPlan, Readiness } from "@/lib/scripts/visualise/state";
import { GenerateAllDialog } from "./generate-all-dialog";
import { ReopenDialog } from "./reopen-dialog";

type Props = {
  stage: ScriptStage;
  readiness: Readiness;
  plan: GenerateAllPlan;
  kitsFound: boolean;
  drawingAll: boolean;
  reopening: boolean;
  onGenerateAll: () => void;
  onReopen: () => void;
};

// Spec §4, §7 — the readiness line at the top: the two counts spec 4 reads, Generate all, and
// Reopen (only from Visualise).
export function VisualiseReadiness({ stage, readiness: r, plan, kitsFound, drawingAll, reopening, onGenerateAll, onReopen }: Props) {
  return (
    <section aria-label="Visualise" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-4 shadow-card">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-eyebrow">Visualise</span>
        <span className="text-sm tabular-nums">
          {r.castReady} of {r.castTotal} cast with an avatar · {r.panelsCurrent} of {r.shotsTotal} shots with a current panel
        </span>
        {!kitsFound && (
          <span className="text-xs text-muted-foreground">
            No regional kits found in the brand KB, so panels are drawn without one.
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {stage === "visualise" && <ReopenDialog busy={reopening} onConfirm={onReopen} />}
        <GenerateAllDialog plan={plan} busy={drawingAll} onConfirm={onGenerateAll} />
      </div>
    </section>
  );
}
```

- [ ] **Step 6: The view and the page**

Create `src/components/visualise/visualise-view.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScriptView } from "@/components/scripts/script-view";
import { useReopenScript, useVisualiseBoard, type BoardData } from "@/hooks/queries/visualise";
import { usePanelDraws } from "@/hooks/use-panel-draws";
import { useVisualiseModel } from "@/hooks/use-visualise-model";
import { errorMessage } from "@/lib/avatars/utils";
import { VisualiseReadiness } from "./visualise-readiness";

// Spec 3 §4 — spec 1's read-only script view with Visualise's work put beside it: the readiness
// line on top, a cast slot per person (Task 13), a panel beside every shot (Task 12).
export function VisualiseView({ clientId, initial }: { clientId: string; initial: BoardData }) {
  const router = useRouter();
  const query = useVisualiseBoard(clientId, initial.script.id, initial);
  const { script, board } = query.data;
  const draws = usePanelDraws(clientId, script.id);
  const model = useVisualiseModel(script, board, draws.drawing, query.dataUpdatedAt);
  const reopen = useReopenScript(clientId, script.id);

  const onReopen = async () => {
    try {
      await reopen.mutateAsync();
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e, "Could not reopen the script"));
    }
  };

  return (
    <ScriptView
      script={script}
      avatarFaces={model.avatarFaces}
      top={
        <VisualiseReadiness
          stage={script.stage}
          readiness={model.readiness}
          plan={model.plan}
          kitsFound={board.kits.length > 0}
          drawingAll={draws.drawingAll}
          reopening={reopen.isPending}
          onGenerateAll={() => void draws.drawAll(model.plan.shotIds)}
          onReopen={() => void onReopen()}
        />
      }
    />
  );
}
```

In `src/app/clients/[id]/scripts/[scriptId]/page.tsx`, after `if (!script) notFound();` replace the avatar-faces block and the final `<ScriptView …/>` so Visualise and In review get the Visualise view (merge point: spec 2 adds its `generate` branch here):

```tsx
  // Spec 3 — Visualise and In review show the Visualise view; other stages the read-only view.
  const board = isVisualiseStage(script.stage) ? await loadVisualiseBoard(client.id, script) : null;
  // Faces for the read-only cast: only this client's live avatars, so another client's id shows no face.
  const avatarFaces = board
    ? {}
    : Object.fromEntries((await listAvatars(client.id)).map((a) => [a.id, a.front?.url ?? null]));
```

and

```tsx
      {board
        ? <VisualiseView clientId={client.id} initial={{ script, board }} />
        : <ScriptView script={script} avatarFaces={avatarFaces} />}
```

with the imports `import { VisualiseView } from "@/components/visualise/visualise-view";`, `import { loadVisualiseBoard } from "@/lib/scripts/visualise/board-server";`, `import { isVisualiseStage } from "@/lib/scripts/visualise/cast";`.

- [ ] **Step 7: Check it**

Run: `npx tsc --noEmit && npx eslint src/components/scripts src/components/visualise src/hooks src/services/visualise.service.ts "src/app/clients/[id]/scripts"`
Expected: clean.

Run: `npx vitest run src/lib/scripts "src/app/api/clients/[id]/scripts"`
Expected: PASS (spec 1's view is unchanged when no slot is passed).

With Reel 01 seeded at Visualise, open it. Expected: the readiness line reads "0 of 2 cast with an avatar · 0 of 14 shots with a current panel" (plus the kits note if the KB has no table); Generate all opens "Generate 5 panels · about N credits" and draws the five B-roll shots (refresh to see them in the database until Task 12 shows them); Reopen moves the script to Generate and the page then shows the read-only view. Re-seed with `--stage visualise` afterwards. An approved script still shows spec 1's view.

- [ ] **Step 8: Commit**

```bash
git add src/services/visualise.service.ts src/hooks src/components/scripts src/components/visualise "src/app/clients/[id]/scripts/[scriptId]/page.tsx"
git commit -m "feat(scripts): the Visualise view, its readiness line, Generate all and Reopen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: A storyboard panel beside every shot

**Files:**
- Create: `src/components/visualise/panel-aside.tsx`, `src/components/visualise/panel-frame.tsx`, `src/components/visualise/panel-dialog.tsx`, `src/components/visualise/panel-takes.tsx`, `src/components/visualise/panel-prompt-box.tsx`
- Modify: `src/components/visualise/visualise-view.tsx`

**Interfaces:**
- Consumes: `PanelView` (Task 9); `PanelInputs` (Task 8); `usePanelDraws`, `usePickTake`, `useVisualiseModel` (Task 11); `AvatarCreditCost`; `listSentence`.
- Produces: `PanelAside({ label, view, aspect, credits, onDraw, onOpen, marker? })` (`marker` is spec 4's merge point); `PanelFrame({ view, aspect, label, onOpen })`; `PanelDialog({ open, onOpenChange, label, view, inputs, aspect, credits, picking, onPick, onDraw })`; `PanelTakes({ takes, pickId, disabled, onPick })`; `PanelPromptBox({ prompt, builtPrompt, credits, busy, onRegenerate, onReset })`.

- [ ] **Step 1: The frame**

Create `src/components/visualise/panel-frame.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PanelView } from "@/lib/scripts/visualise/state";

// Spec §6.4 — one frame, the same size in every state, so nothing moves when a panel lands.
export function PanelFrame({ view, aspect, label, onOpen }: { view: PanelView; aspect: string; label: string; onOpen: () => void }) {
  const style = { aspectRatio: aspect.replace(":", " / ") };
  const box = "relative w-full overflow-hidden rounded-lg";

  if (view.status === "generating") {
    return (
      <div className={cn(box, "border border-border bg-muted")} style={style} aria-label={`${label}: drawing`}>
        <Skeleton className="absolute inset-0 rounded-none" />
        <span className="absolute inset-x-0 bottom-2 text-center text-xs text-muted-foreground">Drawing…</span>
      </div>
    );
  }
  if (view.pick?.url) {
    return (
      <Button
        variant="ghost"
        aria-label={`Open the ${label} panel`}
        onClick={onOpen}
        className={cn(box, "h-auto cursor-zoom-in border border-border p-0")}
        style={style}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={view.pick.url} alt="" className={cn("size-full object-cover", view.status === "out_of_date" && "opacity-60")} />
      </Button>
    );
  }
  return (
    <div
      className={cn(box, "bg-card", view.canGenerate ? "border border-dashed border-primary/40" : "border border-border")}
      style={style}
      aria-label={`${label}: no panel yet`}
    />
  );
}
```

- [ ] **Step 2: The aside**

Create `src/components/visualise/panel-aside.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";
import { listSentence } from "@/lib/avatars/generation";
import type { PanelView } from "@/lib/scripts/visualise/state";
import { PanelFrame } from "./panel-frame";

type Props = {
  /** "S6" */
  label: string;
  view: PanelView;
  aspect: string;
  credits: number | null;
  onDraw: () => void;
  onOpen: () => void;
  /** Spec 4 merge point: a comment marker on the panel. */
  marker?: ReactNode;
};

const STALE_COPY = { shot: "The shot changed", avatar: "An avatar changed" } as const;

// Spec §6.4 — the panel beside its shot, with Generate or Regenerate and its cost. An out-of-date
// panel stays visible with its badge and is never redrawn on its own.
export function PanelAside({ label, view, aspect, credits, onDraw, onOpen, marker }: Props) {
  const busy = view.status === "generating";
  const action = busy ? "Drawing…" : view.pick ? "Regenerate" : view.failure ? "Generate again" : "Generate";
  return (
    <div className="relative flex flex-col gap-2">
      <PanelFrame view={view} aspect={aspect} label={label} onOpen={onOpen} />
      {view.status === "out_of_date" && (
        <div className="flex flex-col gap-0.5">
          <Badge variant="outline" className="self-start border-primary/30 bg-primary/5 text-primary">Out of date</Badge>
          <span className="text-xs text-muted-foreground">{view.staleBecause.map((r) => STALE_COPY[r]).join(" · ")}</span>
        </div>
      )}
      {!view.canGenerate && (
        <span className="text-xs text-muted-foreground">Waiting for {listSentence(view.waitingFor)}&apos;s avatar</span>
      )}
      {view.failure && <span className="text-xs text-destructive-text">{view.failure} Nothing was charged.</span>}
      <Button size="sm" variant={view.pick ? "outline" : "default"} disabled={!view.canGenerate || busy || credits === null} onClick={onDraw}>
        {action}
        <AvatarCreditCost credits={credits} />
      </Button>
      {marker}
    </div>
  );
}
```

- [ ] **Step 3: Takes and the prompt box**

Create `src/components/visualise/panel-takes.tsx`:

```tsx
"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PanelTake } from "@/lib/scripts/visualise/schema";

// D343 — every drawn take, oldest first; the picked one is what the client sees.
export function PanelTakes({ takes, pickId, disabled, onPick }: {
  takes: PanelTake[];
  pickId: string | null;
  disabled: boolean;
  onPick: (takeId: string) => void;
}) {
  if (takes.length < 2) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-eyebrow">Takes</span>
      <div role="group" aria-label="Takes" className="flex flex-wrap gap-2">
        {takes.map((take, i) => {
          const picked = take.id === pickId;
          return (
            <Button
              key={take.id}
              variant="outline"
              aria-pressed={picked}
              aria-label={`Take ${i + 1}${picked ? ", picked" : ""}`}
              disabled={disabled || picked}
              onClick={() => onPick(take.id)}
              className={cn("relative h-auto w-14 p-0", picked && "ring-2 ring-primary ring-offset-1")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={take.url ?? ""} alt="" className="aspect-[9/16] w-full rounded-md object-cover" />
              <span className="absolute bottom-0.5 left-1 text-[0.65rem] font-medium text-background drop-shadow">{i + 1}</span>
              {picked && <Check className="absolute right-0.5 top-0.5 size-3.5 text-primary" strokeWidth={1.5} />}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
```

Create `src/components/visualise/panel-prompt-box.tsx`:

```tsx
"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";
import { PANEL_PROMPT_MAX } from "@/lib/scripts/visualise/constants";

type Props = {
  /** The exact prompt the picked take was drawn with, or the built one before any take. */
  prompt: string;
  /** The prompt the script builds today: what Reset goes back to. */
  builtPrompt: string;
  credits: number | null;
  busy: boolean;
  onRegenerate: (prompt: string) => void;
  onReset: () => void;
};

// D344 — hidden by default. For how the frame is drawn ("closer on her hands"); a change to what
// happens belongs in the shot's visual line, through Reopen.
export function PanelPromptBox({ prompt, builtPrompt, credits, busy, onRegenerate, onReset }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(prompt);
  const id = useId();
  useEffect(() => setDraft(prompt), [prompt]);
  const empty = draft.trim().length === 0;

  return (
    <div className="flex flex-col gap-2">
      <Button variant="ghost" size="sm" className="self-start" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronDown className={open ? "size-4 rotate-180" : "size-4"} strokeWidth={1.5} />
        {open ? "Hide the prompt" : "Show the prompt"}
      </Button>
      {open && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={id} className="text-xs text-muted-foreground">The exact prompt sent to draw this frame</Label>
          <Textarea id={id} value={draft} maxLength={PANEL_PROMPT_MAX} rows={10} onChange={(e) => setDraft(e.target.value)} className="font-sans text-xs" />
          <p className="text-xs text-muted-foreground">
            For how the frame is drawn. A change to what happens belongs in the shot, through Reopen.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || empty} onClick={() => onRegenerate(draft)}>
              Regenerate with this prompt <AvatarCreditCost credits={credits} />
            </Button>
            {(draft.trim() !== builtPrompt || prompt !== builtPrompt) && (
              <Button size="sm" variant="outline" disabled={busy} onClick={onReset}>
                Reset to the script&apos;s prompt <AvatarCreditCost credits={credits} />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: The larger view**

Create `src/components/visualise/panel-dialog.tsx`:

```tsx
"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PanelInputs } from "@/lib/scripts/visualise/panel-inputs";
import type { DrawBody } from "@/lib/scripts/visualise/schema";
import type { PanelView } from "@/lib/scripts/visualise/state";
import { PanelPromptBox } from "./panel-prompt-box";
import { PanelTakes } from "./panel-takes";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  view: PanelView;
  inputs: PanelInputs;
  aspect: string;
  credits: number | null;
  picking: boolean;
  onPick: (takeId: string) => void;
  onDraw: (body: DrawBody) => void;
};

// Spec §6.4 "opens larger on click", §6.6 takes, §6.7 the prompt box.
export function PanelDialog({ open, onOpenChange, label, view, inputs, aspect, credits, picking, onPick, onDraw }: Props) {
  const busy = view.status === "generating";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {view.status === "out_of_date"
              ? "Out of date: drawn before the shot or an avatar changed. It stays until you redraw it."
              : "The picked take is the one the client sees."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid items-start gap-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          {view.pick?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={view.pick.url} alt={`${label} panel`} className="w-full rounded-lg border border-border object-cover" style={{ aspectRatio: aspect.replace(":", " / ") }} />
          ) : (
            <div className="w-full rounded-lg border border-dashed border-border" style={{ aspectRatio: aspect.replace(":", " / ") }} />
          )}
          <div className="flex min-w-0 flex-col gap-4">
            <PanelTakes takes={view.takes} pickId={view.pick?.id ?? null} disabled={picking || busy} onPick={onPick} />
            <PanelPromptBox
              prompt={view.pick?.prompt ?? inputs.prompt}
              builtPrompt={inputs.prompt}
              credits={credits}
              busy={busy || !view.canGenerate}
              onRegenerate={(prompt) => onDraw({ kind: "edited", prompt })}
              onReset={() => onDraw({ kind: "reset" })}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Put the panels beside the shots**

In `src/components/visualise/visualise-view.tsx`: import `useState`, `usePickTake`, `PanelAside`, `PanelDialog`; add

```tsx
  const pick = usePickTake(clientId, script.id);
  const [openShot, setOpenShot] = useState<string | null>(null);
  const shotLabel = (shotId: string) => `S${script.doc.shots.findIndex((s) => s.id === shotId) + 1}`;
```

pass this to `ScriptView`:

```tsx
      shotAside={(t) => (
        <PanelAside
          label={`S${t.index + 1}`}
          view={model.views.get(t.shot.id)!}
          aspect={model.aspect}
          credits={model.credits.get(t.shot.id) ?? null}
          onDraw={() => void draws.draw(t.shot.id)}
          onOpen={() => setOpenShot(t.shot.id)}
        />
      )}
```

and render the dialog after `ScriptView` (wrap both in a fragment):

```tsx
      {openShot && model.views.get(openShot) && (
        <PanelDialog
          open
          onOpenChange={(o) => { if (!o) setOpenShot(null); }}
          label={shotLabel(openShot)}
          view={model.views.get(openShot)!}
          inputs={model.inputs.get(openShot)!}
          aspect={model.aspect}
          credits={model.credits.get(openShot) ?? null}
          picking={pick.isPending}
          onPick={(takeId) => pick.mutate({ shotId: openShot, takeId })}
          onDraw={(body) => void draws.draw(openShot, body)}
        />
      )}
```

- [ ] **Step 6: Check it**

Run: `npx tsc --noEmit && npx eslint src/components/visualise`
Expected: clean.

In the app, on Reel 01 at Visualise: every shot has a 9:16 frame on its right. B-roll shots (S3, S4, S9, S13, S14) offer Generate with a cost; shots with people say "Waiting for Meenakshi's avatar". Generate on S3 shows the placeholder at the panel's exact size, then the sketch. Regenerate adds a take; open the panel: the takes row shows 1 and 2, picking 1 makes it current. Show the prompt: the exact prompt is there; edit "closer on the tawa" and regenerate: only S3 changes; Reset to the script's prompt redraws from the built prompt. S13 and S14 show their claim card and pack area blank.

- [ ] **Step 7: Commit**

```bash
git add src/components/visualise
git commit -m "feat(scripts): a storyboard panel beside every shot, with takes and the prompt box (D343, D344)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: An avatar for every person in the cast, made inline

**Files:**
- Create: `src/lib/scripts/visualise/maker.ts`
- Create: `src/hooks/use-cast-avatar-maker.ts`, `src/hooks/queries/client-voices.ts`
- Create: `src/components/visualise/cast-slots.tsx`, `src/components/visualise/cast-slot.tsx`, `src/components/visualise/cast-slot-ai-maker.tsx`, `src/components/visualise/cast-slot-photo-maker.tsx`, `src/components/visualise/cast-slot-voice.tsx`, `src/components/visualise/cast-library-picker.tsx`
- Modify: `src/components/visualise/visualise-view.tsx`
- Test: `src/lib/scripts/visualise/__tests__/maker.test.ts`

**Interfaces:**
- Consumes: `avatarsService` (`create`, `generateFront`, `pickFront`, `generateSheet`, `update`, `uploadImage`); `useLinkCast` (Task 11); `useAvatarVoice`; `useLibraryAvatars`; `hasFourViews`, `missingViews`, `needsLikenessConsent`, `validateAvatarImageFile` (Task 1 and existing); `estimateSheetCredits` (Task 2); `AvatarSheetViews` (Task 3); `AvatarImageDropzone`, `AvatarLikenessConsent` (with `id`, Task 3), `AvatarCreditCost`.
- Produces: in `maker.ts`, `MakerStep = "face" | "views" | "save"`, `MakerDeps`, `avatarDescriptionFor(member, instructions)`, `avatarFieldsFor(member)`, `reusableFor(mode: "ai" | "photo", avatar)`, `nextMakerStep(avatar)`, `makeGeneratedAvatar(deps, { member, avatar, instructions, fresh })`, `finishAvatar(deps, avatar)`, `castSlotLine(avatar): string`, `estimateMakeCredits(): number | null`; `useCastAvatarMaker({ clientId, scriptId, member, avatar }) → { step, busy, refresh(), make(instructions, fresh), finish(), uploadPhoto(file), confirmConsent(), pick(avatarId), change() }`; `useClientVoices(clientId)`; `CastSlots({ clientId, scriptId, doc, avatars })`; `CastSlot({ …, marker? })` (spec 4 merge point).

- [ ] **Step 1: Write the failing test**

Create `src/lib/scripts/visualise/__tests__/maker.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { GENERATED, makeAvatar, makeImage, makeViews } from "@/lib/avatars/__tests__/fixtures";
import type { Avatar } from "@/lib/avatars/schema";
import {
  avatarDescriptionFor, castSlotLine, finishAvatar, makeGeneratedAvatar, nextMakerStep, reusableFor, type MakerDeps,
} from "../maker";
import { reel01Doc } from "./fixtures";

const meenakshi = reel01Doc().cast[0];
const draft = (over: Partial<Avatar> = {}) =>
  makeAvatar({ id: "new", status: "draft", front: null, sheet: null, sheetViews: null, likenessConsentAt: null, ...over });

function deps(calls: string[]): MakerDeps {
  const generatedFront = { ...makeImage(GENERATED), url: "https://x/face.png" };
  return {
    createAndLink: vi.fn(async (fields: { name: string; story: string }) => { calls.push(`create:${fields.name}`); return draft(); }),
    generateFront: vi.fn(async (_id: string, description: string) => { calls.push(`face:${description}`); return { generationId: "g1" }; }),
    pickFront: vi.fn(async () => { calls.push("pick"); return draft({ front: generatedFront, sheetStale: true }); }),
    generateViews: vi.fn(async () => { calls.push("views"); return draft({ front: generatedFront, sheetViews: makeViews() }); }),
    markReady: vi.fn(async () => { calls.push("save"); return draft({ front: generatedFront, sheetViews: makeViews(), status: "ready" }); }),
    onStep: vi.fn(),
  };
}

describe("makeGeneratedAvatar (D338)", () => {
  it("makes and links a new avatar, then the face, the four views, and saves it to Avatars", async () => {
    const calls: string[] = [];
    const avatar = await makeGeneratedAvatar(deps(calls), { member: meenakshi, avatar: null, instructions: "", fresh: false });
    expect(calls).toEqual(["create:Meenakshi", `face:${meenakshi.description}`, "pick", "views", "save"]);
    expect(avatar.status).toBe("ready");
  });

  it("resumes a linked draft from the first step not done, so a failed view is retried without a new face", async () => {
    const calls: string[] = [];
    await makeGeneratedAvatar(deps(calls), {
      member: meenakshi, avatar: draft({ front: makeImage(GENERATED) }), instructions: "", fresh: false,
    });
    expect(calls).toEqual(["views", "save"]);
  });

  it("Regenerate avatar always makes a new face, from the description and the instructions", async () => {
    const calls: string[] = [];
    const ready = makeAvatar({ front: makeImage(GENERATED), sheetViews: makeViews(), status: "ready" });
    await makeGeneratedAvatar(deps(calls), { member: meenakshi, avatar: ready, instructions: "Greyer at the temples", fresh: true });
    expect(calls[0]).toBe(`face:${meenakshi.description} Greyer at the temples`);
  });

  it("makes a new avatar rather than turning a real person's photo into a generated face", async () => {
    const calls: string[] = [];
    await makeGeneratedAvatar(deps(calls), { member: meenakshi, avatar: makeAvatar(), instructions: "", fresh: true });
    expect(calls[0]).toBe("create:Meenakshi");
  });
});

describe("finishAvatar", () => {
  it("waits for permission on a real person's photo before making views", async () => {
    const calls: string[] = [];
    await expect(finishAvatar(deps(calls), draft({ front: makeImage() }))).rejects.toThrow(/permission/);
    expect(calls).toEqual([]);
  });

  it("is a no-op for an avatar that is already saved with its four views", async () => {
    const calls: string[] = [];
    const done = makeAvatar({ sheetViews: makeViews() });
    expect(await finishAvatar(deps(calls), done)).toBe(done);
    expect(calls).toEqual([]);
  });
});

describe("the slot's rules", () => {
  it("nextMakerStep follows the avatar", () => {
    expect(nextMakerStep(null)).toBe("face");
    expect(nextMakerStep(draft({ front: makeImage() }))).toBeNull(); // a real person waits for permission
    expect(nextMakerStep(draft({ front: makeImage(GENERATED) }))).toBe("views");
    expect(nextMakerStep(draft({ front: makeImage(GENERATED), sheetViews: makeViews() }))).toBe("save");
    expect(nextMakerStep(makeAvatar({ sheetViews: makeViews() }))).toBeNull();
  });

  it("reusableFor keeps a face's kind: a photo is never regenerated, a generated face never replaced by a photo", () => {
    expect(reusableFor("ai", makeAvatar({ front: makeImage(GENERATED) }))?.id).toBe("a1");
    expect(reusableFor("ai", makeAvatar())).toBeNull();
    expect(reusableFor("photo", makeAvatar())?.id).toBe("a1");
    expect(reusableFor("photo", makeAvatar({ front: makeImage(GENERATED) }))).toBeNull();
    expect(reusableFor("photo", draft())?.id).toBe("new");
    expect(reusableFor("ai", makeAvatar({ archivedAt: "2026-10-08T00:00:00.000Z" }))).toBeNull();
  });

  it("avatarDescriptionFor adds the instructions and stays within what the front route takes", () => {
    expect(avatarDescriptionFor({ ...meenakshi, description: "x".repeat(1490) }, "Greyer at the temples")).toHaveLength(1500);
  });

  it("castSlotLine says where the avatar stands", () => {
    expect(castSlotLine(null)).toBe("No avatar yet");
    expect(castSlotLine(makeAvatar({ sheetViews: makeViews(), createdAt: "2026-10-09T10:00:00.000Z" }))).toMatch(/^Made .+ · saved to Avatars$/);
    expect(castSlotLine(makeAvatar({ sheetViews: null }))).toMatch(/needs its four views$/);
    expect(castSlotLine(draft())).toBe("Draft · saved to Avatars once its four views are made");
    expect(castSlotLine(makeAvatar({ archivedAt: "2026-10-08T00:00:00.000Z" }))).toBe("This avatar was archived. Change it to go on.");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/scripts/visualise/__tests__/maker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: The maker's sequence**

Create `src/lib/scripts/visualise/maker.ts`:

```ts
import {
  AVATAR_DEFAULT_FRONT_MODEL_ID, AVATAR_DEFAULT_SHEET_MODEL_ID, AVATAR_DESCRIPTION_MAX,
  AVATAR_FRONT_ASPECT, AVATAR_NAME_MAX, AVATAR_STORY_MAX,
} from "@/lib/avatars/constants";
import { estimateAvatarImageCredits, estimateSheetCredits } from "@/lib/avatars/generation";
import { hasFourViews, needsLikenessConsent } from "@/lib/avatars/utils";
import type { Avatar } from "@/lib/avatars/schema";
import { formatDate } from "@/lib/kb/utils";
import type { CastMember } from "@/lib/scripts/schema";

// D338 — the inline avatar maker's sequence, as plain functions over injected calls (the same
// shape as add-to-canvas.ts), so every path is tested without React. useCastAvatarMaker supplies
// the calls. It makes a client Avatar like the Studio does, through the Studio's own routes.

export type MakerStep = "face" | "views" | "save";

export type MakerDeps = {
  /** Creates a draft avatar and links it to the cast member. */
  createAndLink: (fields: { name: string; story: string }) => Promise<Avatar>;
  generateFront: (avatarId: string, description: string) => Promise<{ generationId: string }>;
  pickFront: (avatarId: string, generationId: string) => Promise<Avatar>;
  /** Makes the missing views (all four for a new face). */
  generateViews: (avatarId: string) => Promise<Avatar>;
  markReady: (avatarId: string) => Promise<Avatar>;
  onStep: (step: MakerStep) => void;
};

/** The words a generated face is made from: the person as the script describes them, then the
 *  operator's instructions ("Greyer at the temples"), cut to what the front route accepts. */
export function avatarDescriptionFor(member: CastMember, instructions: string): string {
  return [member.description.trim() || member.name, instructions.trim()].filter(Boolean).join(" ").slice(0, AVATAR_DESCRIPTION_MAX);
}

export function avatarFieldsFor(member: CastMember): { name: string; story: string } {
  return { name: member.name.slice(0, AVATAR_NAME_MAX), story: member.description.slice(0, AVATAR_STORY_MAX) };
}

/** The linked avatar, if it can be worked on in this mode. A face keeps its kind: AI-generated
 *  never overwrites a real person's photo, and a photo never replaces a generated face; either
 *  makes a new avatar instead, and the old one stays in the library. */
export function reusableFor(mode: "ai" | "photo", avatar: Avatar | null): Avatar | null {
  if (!avatar || avatar.archivedAt) return null;
  const kind = avatar.front?.source.kind;
  if (!kind) return avatar;
  return (mode === "ai") === (kind === "generated") ? avatar : null;
}

/** What the slot does next: the face, the four views, or saving. Null when done, or when a
 *  real person's photo still waits for permission. */
export function nextMakerStep(avatar: Avatar | null): MakerStep | null {
  if (!avatar?.front) return "face";
  if (needsLikenessConsent(avatar)) return null;
  if (!hasFourViews(avatar)) return "views";
  if (avatar.status !== "ready") return "save";
  return null;
}

/** The end of both flows: the four views, then saved to Avatars. */
export async function finishAvatar(d: MakerDeps, avatar: Avatar): Promise<Avatar> {
  if (needsLikenessConsent(avatar)) throw new Error("Confirm the permission to use this person's likeness first.");
  let current = avatar;
  if (!hasFourViews(current)) {
    d.onStep("views");
    current = await d.generateViews(current.id);
    if (!hasFourViews(current)) throw new Error("A view is still missing. Make the four views again.");
  }
  if (current.status !== "ready") {
    d.onStep("save");
    current = await d.markReady(current.id);
  }
  return current;
}

/** AI-generated: one face from the description and instructions, its four views, then saved.
 *  `fresh` (Regenerate avatar) always makes a new face; otherwise the run resumes from the
 *  first step not done. */
export async function makeGeneratedAvatar(
  d: MakerDeps,
  input: { member: CastMember; avatar: Avatar | null; instructions: string; fresh: boolean },
): Promise<Avatar> {
  let avatar = reusableFor("ai", input.avatar) ?? (await d.createAndLink(avatarFieldsFor(input.member)));
  if (input.fresh || !avatar.front) {
    d.onStep("face");
    const { generationId } = await d.generateFront(avatar.id, avatarDescriptionFor(input.member, input.instructions));
    avatar = await d.pickFront(avatar.id, generationId);
  }
  return finishAvatar(d, avatar);
}

/** The slot's one-line status (spec §5.2: "Made 9 Oct · saved to Avatars"). */
export function castSlotLine(avatar: Avatar | null): string {
  if (!avatar) return "No avatar yet";
  if (avatar.archivedAt) return "This avatar was archived. Change it to go on.";
  if (avatar.status !== "ready") return "Draft · saved to Avatars once its four views are made";
  const made = `Made ${formatDate(avatar.createdAt)} · saved to Avatars`;
  return hasFourViews(avatar) ? made : `${made} · needs its four views`;
}

/** What Make avatar costs: one face, then four views. */
export function estimateMakeCredits(): number | null {
  const face = estimateAvatarImageCredits({ modelId: AVATAR_DEFAULT_FRONT_MODEL_ID, aspect: AVATAR_FRONT_ASPECT, referenceCount: 0 });
  const views = estimateSheetCredits(AVATAR_DEFAULT_SHEET_MODEL_ID, 4);
  return face === null || views === null ? null : face + views;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/scripts/visualise/__tests__/maker.test.ts`
Expected: PASS.

- [ ] **Step 5: The hooks**

Create `src/hooks/queries/client-voices.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { elevenLabsApi } from "@/lib/elevenlabs/api";

// The client's own voices (D292), for Visualise's voice picker. Keys are built here only.
export const clientVoiceKeys = {
  list: (clientId: string) => ["client-voices", clientId] as const,
};

export function useClientVoices(clientId: string) {
  return useQuery({
    queryKey: clientVoiceKeys.list(clientId),
    queryFn: () => elevenLabsApi.listClientVoices(clientId).then((r) => r.voices),
    enabled: Boolean(clientId),
  });
}
```

Create `src/hooks/use-cast-avatar-maker.ts`:

```ts
"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { avatarsService } from "@/services/avatars.service";
import { useLinkCast, visualiseKeys } from "@/hooks/queries/visualise";
import { avatarKeys } from "@/hooks/queries/avatars";
import { AVATAR_DEFAULT_FRONT_MODEL_ID, AVATAR_DEFAULT_SHEET_MODEL_ID, AVATAR_STYLES } from "@/lib/avatars/constants";
import { errorMessage, validateAvatarImageFile } from "@/lib/avatars/utils";
import type { Avatar } from "@/lib/avatars/schema";
import type { CastMember } from "@/lib/scripts/schema";
import {
  avatarFieldsFor, finishAvatar, makeGeneratedAvatar, reusableFor, type MakerDeps, type MakerStep,
} from "@/lib/scripts/visualise/maker";

export type SlotStep = MakerStep | "upload" | "consent" | "link";

// D338 — one cast slot's avatar maker. Every call goes through the Avatar Studio's own routes,
// so what Visualise makes is the same client Avatar the Studio makes (spec §5.1).
export function useCastAvatarMaker({ clientId, scriptId, member, avatar }: {
  clientId: string;
  scriptId: string;
  member: CastMember;
  avatar: Avatar | null;
}) {
  const queryClient = useQueryClient();
  const linkCast = useLinkCast(clientId, scriptId);
  const [step, setStep] = useState<SlotStep | null>(null);

  const refresh = useCallback(() => Promise.all([
    queryClient.invalidateQueries({ queryKey: visualiseKeys.board(clientId, scriptId) }),
    queryClient.invalidateQueries({ queryKey: avatarKeys.list(clientId) }),
  ]), [queryClient, clientId, scriptId]);

  const deps: MakerDeps = useMemo(() => ({
    createAndLink: async (fields) => {
      const created = await avatarsService.create(clientId, fields);
      await linkCast.mutateAsync({ castId: member.id, avatarId: created.id });
      return created;
    },
    generateFront: async (avatarId, description) => {
      const { candidate } = await avatarsService.generateFront(clientId, avatarId, {
        description, attributes: {}, styleId: AVATAR_STYLES[0].id,
        modelId: AVATAR_DEFAULT_FRONT_MODEL_ID, batchId: crypto.randomUUID(),
      });
      return { generationId: candidate.generationId };
    },
    pickFront: (avatarId, generationId) => avatarsService.pickFront(clientId, avatarId, generationId),
    generateViews: async (avatarId) => {
      const { avatar: updated, failed } = await avatarsService.generateSheet(clientId, avatarId, AVATAR_DEFAULT_SHEET_MODEL_ID);
      for (const f of failed) toast.error(`The ${f.label} view failed: ${f.error}`);
      return updated;
    },
    markReady: (avatarId) => avatarsService.update(clientId, avatarId, { status: "ready" }),
    onStep: setStep,
  }), [clientId, member.id, linkCast]);

  const run = useCallback(async (work: () => Promise<unknown>, fallback: string) => {
    try {
      await work();
    } catch (e) {
      toast.error(errorMessage(e, fallback));
    } finally {
      setStep(null);
      await refresh();
    }
  }, [refresh]);

  return {
    step,
    busy: step !== null,
    /** Re-reads the board and the avatar list, e.g. after a voice change. */
    refresh,
    make: (instructions: string, fresh: boolean) =>
      run(() => makeGeneratedAvatar(deps, { member, avatar, instructions, fresh }), "Could not make the avatar"),
    finish: () => (avatar ? run(() => finishAvatar(deps, avatar), "Could not finish the avatar") : Promise.resolve()),
    uploadPhoto: (file: File) =>
      run(async () => {
        const invalid = validateAvatarImageFile(file);
        if (invalid) throw new Error(invalid);
        setStep("upload");
        const target = reusableFor("photo", avatar) ?? (await deps.createAndLink(avatarFieldsFor(member)));
        await avatarsService.uploadImage(clientId, target.id, "front", file);
      }, "Could not upload the photo"),
    confirmConsent: () =>
      avatar?.front
        ? run(async () => {
            setStep("consent");
            await avatarsService.update(clientId, avatar.id, { consent: { frontUrl: avatar.front!.url } });
          }, "Could not confirm the permission")
        : Promise.resolve(),
    pick: (avatarId: string) =>
      run(async () => {
        setStep("link");
        await linkCast.mutateAsync({ castId: member.id, avatarId });
      }, "Could not use that avatar"),
    change: () =>
      run(async () => {
        setStep("link");
        await linkCast.mutateAsync({ castId: member.id, avatarId: null });
      }, "Could not change the avatar"),
  };
}
```

- [ ] **Step 6: The slot's parts**

Create `src/components/visualise/cast-slot-voice.tsx`:

```tsx
"use client";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAvatarVoice } from "@/hooks/use-avatar-voice";
import { useClientVoices } from "@/hooks/queries/client-voices";
import { avatarVoiceLabel } from "@/lib/avatars/voice";
import type { Avatar } from "@/lib/avatars/schema";

const NONE = "none";
const NATIVE = "native";

// Spec §5.5 — each person's voice, chosen here from the Avatars feature's own voices: none, the
// engine's own ("Choose a voice for me"), or one of this client's voices. The storyboard does not
// use it; the package and the lead's avatar on the canvas do.
export function CastSlotVoice({ clientId, castId, avatar, onChanged }: {
  clientId: string;
  castId: string;
  avatar: Avatar | null;
  onChanged: () => void;
}) {
  const voices = useClientVoices(clientId);
  const voice = useAvatarVoice({ clientId, avatarId: avatar?.id ?? null, onAvatar: onChanged });
  const list = voices.data ?? [];
  const declared = avatar?.voice ?? null;
  const named = declared?.mode === "named" ? declared : null;
  const value = named ? named.voiceId : declared?.mode === "native" ? NATIVE : NONE;
  const id = `voice-${castId}`;

  const onChange = (next: string) => {
    if (next === NONE) void voice.clear();
    else if (next === NATIVE) void voice.chooseNative();
    else {
      const picked = list.find((v) => v.voiceId === next);
      if (picked) void voice.chooseNamed(picked);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">Voice</Label>
      <Select value={value} onValueChange={(v) => { if (typeof v === "string") onChange(v); }} disabled={!avatar || voice.saving}>
        <SelectTrigger id={id} size="sm" className="w-full">
          <SelectValue>{avatarVoiceLabel(declared) ?? "No voice"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No voice</SelectItem>
          <SelectItem value={NATIVE}>Choose a voice for me</SelectItem>
          {named && !list.some((v) => v.voiceId === named.voiceId) && (
            <SelectItem value={named.voiceId}>{named.name}</SelectItem>
          )}
          {list.map((v) => <SelectItem key={v.voiceId} value={v.voiceId}>{v.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
```

Create `src/components/visualise/cast-library-picker.tsx`:

```tsx
"use client";

import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLibraryAvatars } from "@/hooks/queries/avatars";
import { hasFourViews } from "@/lib/avatars/utils";

// Spec §5.2 — pick an existing avatar from the library (saved ones only: drafts are not offered).
// Avatars another person in this script already has are left out (one face per person).
export function CastLibraryPicker({ clientId, excludeIds, disabled, onPick }: {
  clientId: string;
  excludeIds: string[];
  disabled: boolean;
  onPick: (avatarId: string) => void;
}) {
  const library = useLibraryAvatars(clientId);
  const options = (library.data ?? []).filter((a) => !excludeIds.includes(a.id));
  return (
    <Select value="" onValueChange={(v) => { if (typeof v === "string" && v) onPick(v); }} disabled={disabled || options.length === 0}>
      <SelectTrigger size="sm" className="min-w-44" aria-label="Pick from library">
        <SelectValue>Pick from library</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            <span className="flex items-center gap-2">
              {a.front ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.front.url} alt="" className="size-6 rounded object-cover" />
              ) : (
                <UserRound className="size-4 text-muted-foreground" strokeWidth={1.5} />
              )}
              {a.name}
              {!hasFourViews(a) && <Badge variant="outline">Needs four views</Badge>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

Create `src/components/visualise/cast-slot-ai-maker.tsx`:

```tsx
"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";
import { AVATAR_DEFAULT_SHEET_MODEL_ID } from "@/lib/avatars/constants";
import { estimateSheetCredits } from "@/lib/avatars/generation";
import { missingViews } from "@/lib/avatars/utils";
import type { Avatar } from "@/lib/avatars/schema";
import { estimateMakeCredits, nextMakerStep } from "@/lib/scripts/visualise/maker";

// Spec §5.2 — AI-generated: made from the person's description, with avatar instructions and
// Regenerate avatar. A generated face that belongs to the library changes in every script.
export function CastSlotAiMaker({ avatar, busy, onMake }: {
  /** The linked avatar when its face is generated (or it has none yet); otherwise null. */
  avatar: Avatar | null;
  busy: boolean;
  onMake: (instructions: string, fresh: boolean) => void;
}) {
  const [instructions, setInstructions] = useState("");
  const id = useId();
  const next = nextMakerStep(avatar);
  const hasFace = Boolean(avatar?.front);
  const viewCount = avatar ? missingViews(avatar).length : 4;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">Avatar instructions</Label>
      <InputGroup>
        <InputGroupInput
          id={id}
          value={instructions}
          maxLength={300}
          disabled={busy}
          placeholder="Greyer at the temples, glasses on a chain"
          onChange={(e) => setInstructions(e.target.value)}
        />
      </InputGroup>
      <div className="flex flex-wrap items-center gap-2">
        {!hasFace ? (
          <Button disabled={busy} onClick={() => onMake(instructions, false)}>
            Make avatar <AvatarCreditCost credits={estimateMakeCredits()} />
          </Button>
        ) : (
          <>
            {next === "views" && (
              <Button disabled={busy} onClick={() => onMake("", false)}>
                Make the four views <AvatarCreditCost credits={estimateSheetCredits(AVATAR_DEFAULT_SHEET_MODEL_ID, viewCount)} />
              </Button>
            )}
            {next === "save" && <Button disabled={busy} onClick={() => onMake("", false)}>Save to Avatars</Button>}
            <Button variant="outline" disabled={busy} onClick={() => onMake(instructions, true)}>
              Regenerate avatar <AvatarCreditCost credits={estimateMakeCredits()} />
            </Button>
          </>
        )}
      </div>
      {hasFace && avatar?.status === "ready" && (
        <p className="text-xs text-muted-foreground">Regenerating changes this avatar in every script that uses it.</p>
      )}
    </div>
  );
}
```

Create `src/components/visualise/cast-slot-photo-maker.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { AvatarCreditCost } from "@/components/avatars/avatar-credit-cost";
import { AvatarImageDropzone } from "@/components/avatars/avatar-image-dropzone";
import { AvatarLikenessConsent } from "@/components/avatars/avatar-likeness-consent";
import { AVATAR_DEFAULT_SHEET_MODEL_ID } from "@/lib/avatars/constants";
import { estimateSheetCredits } from "@/lib/avatars/generation";
import { missingViews } from "@/lib/avatars/utils";
import type { Avatar } from "@/lib/avatars/schema";
import { nextMakerStep } from "@/lib/scripts/visualise/maker";

// Spec §5.2 — Specific person: an uploaded photo of a real person, the Avatars feature's likeness
// consent (required, unchanged), then the four views made from the photo.
export function CastSlotPhotoMaker({ name, castId, avatar, uploading, confirming, busy, onUpload, onConfirm, onFinish }: {
  name: string;
  castId: string;
  /** The linked avatar when its face is an upload (or it has none yet); otherwise null. */
  avatar: Avatar | null;
  uploading: boolean;
  confirming: boolean;
  busy: boolean;
  onUpload: (file: File) => void;
  onConfirm: () => void;
  onFinish: () => void;
}) {
  const photo = avatar?.front?.source.kind === "upload" ? avatar.front : null;
  const next = avatar && photo ? nextMakerStep(avatar) : null;
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="w-full max-w-[9rem]">
        <AvatarImageDropzone
          label="Upload a photo of the real person"
          hint="Click, or drop a photo here"
          aspect="3 / 4"
          image={photo}
          uploading={uploading}
          disabled={busy}
          zoomTitle={`${name}, photo`}
          onFile={onUpload}
        />
      </div>
      <div className="flex min-w-0 flex-1 basis-60 flex-col gap-3">
        <p className="text-sm text-muted-foreground">For a founder or a real customer. The four views are made from this photo.</p>
        {avatar && photo && (
          <AvatarLikenessConsent id={`likeness-consent-${castId}`} avatar={avatar} confirming={confirming} onConfirm={onConfirm} />
        )}
        {next && (
          <Button className="self-start" disabled={busy} onClick={onFinish}>
            {next === "save" ? "Save to Avatars" : "Make the four views"}
            {next === "views" && <AvatarCreditCost credits={estimateSheetCredits(AVATAR_DEFAULT_SHEET_MODEL_ID, missingViews(avatar!).length)} />}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: The slot and the slots**

Create `src/components/visualise/cast-slot.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AvatarSheetViews } from "@/components/avatars/avatar-sheet-views";
import { useCastAvatarMaker } from "@/hooks/use-cast-avatar-maker";
import { AVATAR_VIEWS } from "@/lib/avatars/constants";
import { missingViews } from "@/lib/avatars/utils";
import type { Avatar } from "@/lib/avatars/schema";
import type { CastMember } from "@/lib/scripts/schema";
import { castSlotLine, reusableFor } from "@/lib/scripts/visualise/maker";
import { CastLibraryPicker } from "./cast-library-picker";
import { CastSlotAiMaker } from "./cast-slot-ai-maker";
import { CastSlotPhotoMaker } from "./cast-slot-photo-maker";
import { CastSlotVoice } from "./cast-slot-voice";

type Mode = "ai" | "photo";

const STEP_COPY = {
  face: "Making the face…", views: "Making the four views…", save: "Saving to Avatars…",
  upload: "Uploading…", consent: "Confirming…", link: "Saving…",
} as const;

// Spec §5.2 — one person in the cast: a full avatar maker, inline, as on the Visualise board.
export function CastSlot({ clientId, scriptId, member, avatar, takenIds, marker }: {
  clientId: string;
  scriptId: string;
  member: CastMember;
  /** The avatar this person links to, if any (archived ones included, to explain themselves). */
  avatar: Avatar | null;
  /** Avatars other people in this script already have. */
  takenIds: string[];
  /** Spec 4 merge point: comment markers per view, given the view id. */
  marker?: (view: (typeof AVATAR_VIEWS)[number]) => ReactNode;
}) {
  const maker = useCastAvatarMaker({ clientId, scriptId, member, avatar });
  const [mode, setMode] = useState<Mode>(avatar?.front?.source.kind === "upload" ? "photo" : "ai");
  const generating = maker.step === "views" ? (avatar ? missingViews(avatar) : [...AVATAR_VIEWS])
    : maker.step === "face" ? [...AVATAR_VIEWS] : [];

  return (
    <Card className="flex flex-col gap-4 p-5 shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-lg font-medium">{member.name}</h3>
            {member.isLead && <Badge variant="outline">Lead</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{member.description}</p>
        </div>
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="ai" disabled={maker.busy}>AI-generated</TabsTrigger>
            <TabsTrigger value="photo" disabled={maker.busy}>Specific person</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <AvatarSheetViews name={member.name} views={avatar?.sheetViews ?? null} generating={generating} stale={avatar?.sheetStale ?? false} marker={marker} />

      {mode === "ai" ? (
        <CastSlotAiMaker avatar={reusableFor("ai", avatar)} busy={maker.busy} onMake={(i, fresh) => void maker.make(i, fresh)} />
      ) : (
        <CastSlotPhotoMaker
          name={member.name}
          castId={member.id}
          avatar={reusableFor("photo", avatar)}
          uploading={maker.step === "upload"}
          confirming={maker.step === "consent"}
          busy={maker.busy}
          onUpload={(file) => void maker.uploadPhoto(file)}
          onConfirm={() => void maker.confirmConsent()}
          onFinish={() => void maker.finish()}
        />
      )}

      <div className="grid items-end gap-3 border-t border-border pt-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <CastSlotVoice clientId={clientId} castId={member.id} avatar={avatar && !avatar.archivedAt ? avatar : null} onChanged={() => void maker.refresh()} />
        <div className="flex flex-wrap items-center gap-2">
          <CastLibraryPicker clientId={clientId} excludeIds={[...takenIds, ...(avatar ? [avatar.id] : [])]} disabled={maker.busy} onPick={(id) => void maker.pick(id)} />
          {avatar && <Button variant="ghost" size="sm" disabled={maker.busy} onClick={() => void maker.change()}>Change</Button>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {maker.step ? STEP_COPY[maker.step] : castSlotLine(avatar)}
      </p>
    </Card>
  );
}
```


Create `src/components/visualise/cast-slots.tsx`:

```tsx
"use client";

import type { Avatar } from "@/lib/avatars/schema";
import type { ScriptDoc } from "@/lib/scripts/schema";
import { CastSlot } from "./cast-slot";

// Spec §5 — one slot per person in the cast, the lead first as the script lists them.
export function CastSlots({ clientId, scriptId, doc, avatars }: {
  clientId: string;
  scriptId: string;
  doc: ScriptDoc;
  avatars: ReadonlyMap<string, Avatar>;
}) {
  return (
    <section aria-label="Cast" className="flex flex-col gap-3">
      <h2 className="text-eyebrow">Cast</h2>
      <div className="grid gap-4">
        {doc.cast.map((member) => (
          <CastSlot
            key={member.id}
            clientId={clientId}
            scriptId={scriptId}
            member={member}
            avatar={member.avatarId ? avatars.get(member.avatarId) ?? null : null}
            takenIds={doc.cast.filter((c) => c.id !== member.id && c.avatarId).map((c) => c.avatarId!)}
          />
        ))}
      </div>
    </section>
  );
}
```

In `src/components/visualise/visualise-view.tsx`, import `CastSlots` and pass `cast={<CastSlots clientId={clientId} scriptId={script.id} doc={script.doc} avatars={model.avatars} />}` to `ScriptView`.

- [ ] **Step 8: Check it**

Run: `npx tsc --noEmit && npx eslint src/components/visualise src/hooks src/lib/scripts/visualise && npx vitest run src/lib/scripts/visualise`
Expected: clean and PASS. Any file over about 200 lines is split before committing.

In the app, Reel 01 at Visualise: Meenakshi's slot shows her name, Lead, her description, the AI-generated / Specific person switch, four empty view tiles, the instructions box, Make avatar with its cost, the voice picker (disabled until there is an avatar), Pick from library, and "No avatar yet". Make avatar: "Making the face…", then the four tiles fill ("Making the four views…"), then "Made 9 Oct · saved to Avatars"; the readiness line reads "1 of 2 cast"; her shots' panels can now be generated, two-person shots still wait for her husband. In the Avatars library she appears saved with four views. Specific person: drop a photo, confirm the permission, Make the four views. Try archiving Meenakshi from the Studio: refused, naming Reel 01.

- [ ] **Step 9: Commit**

```bash
git add src/lib/scripts/visualise src/hooks src/components/visualise
git commit -m "feat(scripts): an avatar for every person in the cast, made inline in Visualise (D338, D340)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: ADRs, and spec 3's success criteria end to end

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (append to §7; mark D288)
- Modify: `docs/superpowers/specs/2026-10-08-script-copilot-3-visualise-design.md` (header line)

- [ ] **Step 1: Check the ADR numbers are still free**

Run: `grep -n "^### D33[7-9]\|^### D34[0-6]" docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`
Expected: nothing. If any are taken, take the next free run and change every `D337`–`D346` in this plan's committed code comments to match.

- [ ] **Step 2: Append the ADRs**

Append to the end of `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`:

```markdown
### D337 — Visualise keeps its own records beside the script; the script holds only the cast's avatar links *(recorded 2026-10-08)*

**Decision.** Storyboard panels live in `script_panel_takes` (every drawing) and `script_panel_picks` (one picked take per shot), keyed by script and shot id. A panel's generation is owned by its script (`generations.script_id`, a third owner beside node and avatar). The only write Visualise makes into `client_scripts.doc` is a cast member's `avatarId`, applied to the document as stored so keys this code does not know survive.

**Why.** Spec 2 is the only writer of a script's text and is built at the same time; panels re-keyed by shot survive edits, splits and removals without touching the document.

**Rejected.** Panels inside the script document (two writers of one JSON column). A generation owned by the avatar (a panel shows several people).

**Originated →** `2026-10-08-script-copilot-3-visualise-design.md` §9.

### D338 — The inline avatar maker makes one face, then its four views, and saves it to Avatars *(recorded 2026-10-08)*

**Decision.** Each cast slot is a full avatar maker using the Studio's own routes: AI-generated makes one front from the person's description plus the avatar instructions (Seedream, the Studio's default face model), then the four views, then marks the avatar ready; Specific person uploads a photo, takes the existing likeness consent, then the four views. Regenerate avatar always makes a new face; a failed step resumes without one. A face keeps its kind: switching between AI-generated and Specific makes a new avatar rather than overwriting the linked one.

**Why.** Spec 3 Q1 chose a slimmed maker inside Visualise that keeps everything the Visualise board shows; the board shows no candidate grid, and one click to a saved avatar is the demo's path.

**Rejected.** The Studio's candidate batch inside the slot. A trip to the Studio and back. Turning a real person's photo into a generated face in place.

**Originated →** spec 3 §5.2, §14 (3.1).

### D339 — Every avatar's sheet is four views, Front, Left, Right, Back *(recorded 2026-10-08; supersedes D288's three-view sheet)*

**Decision.** The sheet is four separate 3:4 images made from the front image (`client_avatars.sheet_views`), each prompt stating which edge of the frame the person faces. Once all four exist they are also composed side by side into `sheet`, so everything that sends the sheet (D308) is unchanged. A view that fails is refunded and named; the others are kept and the missing one can be made alone. Sheets are no longer uploaded: the Studio's sheet upload is removed and the image routes take only the front. Avatars made before keep their three-view or uploaded `sheet` until their four views are generated. A Specific person's face photo is still an upload.

**Why.** Spec 3 Q3: one kind of sheet for every avatar, Studio included. The dry run's two profiles faced the same way until the direction was stated. Separate views are what panels send as references and what spec 4's client comments on. An uploaded single image cannot stand in for the four views, so it would leave an avatar that looks finished in the Studio but cannot be drawn into a panel (user's answer, 8 Oct 2026).

**Rejected.** Three views with the direction stated (Q3 a). Four views only for Visualise avatars (two kinds of sheet). One generated four-up image (cannot send or comment on a view alone). Keeping the sheet upload as a replacement for the views (the avatar could not be drawn into panels). An upload per view (more work, and nobody has asked for it).

**Originated →** spec 3 §5.4, §14 (3.3).

### D340 — A person on screen can be drawn once their avatar is saved with its four views *(recorded 2026-10-08)*

**Decision.** A shot's panel can be drawn when every cast member on screen links to a live, saved avatar with a current four-view sheet; B-roll can be drawn at any time. The readiness line counts such cast members and the shots whose picked take is current.

**Why.** Spec 3 Q2: avatars come first so faces hold.

**Rejected.** The front image alone (Q2 a). Requiring it for the lead only.

**Originated →** spec 3 §5.3, §7.

### D341 — What a panel is drawn from *(recorded 2026-10-08)*

**Decision.** One prompt, built by a pure function shared by browser and server: the marker-and-wash style; the shot's visual; the setting and camera; the regional kit; each on-screen person in words with their four views as references (every person's Front first, other views dropped first over the model's cap, references numbered in the prompt); card and pack areas drawn blank; never any text, brand or labelled pack. The shot's VO and on-screen text are never in the prompt.

**Why.** Each clause answers a dry-run finding (details drift without words; the kitchen goes European without the kit; text and brands creep in; sketches read as a plan) or a house rule.

**Rejected.** References alone. Drawing the cards and relying on the no-text rule (Q5 c).

**Originated →** spec 3 §6.1–§6.3; parent §11.1.

### D342 — Regional kits are read from the brand KB's text and matched per shot *(recorded 2026-10-08)*

**Decision.** Until the KB has fields for them, the kits are parsed from the "Regional kits" table wherever the house rules were pasted into the active KB, and matched to each shot by region, place and language names (the shot and its people first, then the whole script). With no table, panels are drawn without a kit and the readiness line says so.

**Why.** Spec 2 keeps the house rules as pasted text for the demo; Reel 01 names "Chennai" and "Tamil", never "Tamil Nadu".

**Rejected.** A kit picker in Visualise (no such control in the spec). A per-client kit setting (a KB change that spec 2 owns).

**Originated →** spec 3 §6.2; spec 2 §4.1.

### D343 — Panels keep takes; out of date is decided by fingerprints and never redraws on its own *(recorded 2026-10-08)*

**Decision.** Every draw is a take, recorded before the model call with a fingerprint of the shot's drawn text and each on-screen person's avatar and face. A new take becomes the pick; the operator can pick an earlier one; the client sees only the pick. A pick whose fingerprints differ from today's is Out of date and stays visible until redrawn. Reopen's effects follow from stable shot ids: an edited shot and a split's first half go out of date, a split's second half and a new shot start empty, a removed shot's takes are not shown.

**Why.** Spec 3 Q6, Q10, Q11. Recording before the call means an avatar refined mid-draw shows the result out of date at once.

**Rejected.** Redrawing automatically (Q6 b). Replacing the panel on redraw (Q10 a).

**Originated →** spec 3 §6.4, §6.6, §8.1.

### D344 — The prompt box shows the exact prompt; an edit carries until the shot changes *(recorded 2026-10-08)*

**Decision.** Each panel has a hidden prompt box showing the prompt its picked take was drawn with. Edit and regenerate sends it as written; reset regenerates from the prompt built from the script. A plain redraw keeps a hand-edited prompt while the shot's text is unchanged and starts fresh once it changed.

**Why.** Spec 3 Q9; Q11 says a hand-edited prompt does not carry over to a changed shot.

**Rejected.** A separate instruction box per panel (Q9 a).

**Originated →** spec 3 §6.7, §8.1.

### D345 — Nano Banana 2 draws every panel; Generate all shows its total and runs three at a time *(recorded 2026-10-08)*

**Decision.** Panels use `gemini:gemini-3.1-flash-image`, no picker, billed through the same reserve-and-settle run as the Avatar Studio (`runBilledImageGeneration`). Generate all draws every shot without a current panel that can be drawn, after a dialog naming the count and total; the browser runs the per-shot draw three at a time and stops starting new ones at the credit cap.

**Why.** Spec 3 Q7, Q8, Q13.

**Rejected.** A model picker or a probe first (Q13 b, c). A background task for Generate all (the per-shot draw already takes under a minute, and the page shows each panel as it lands).

**Originated →** spec 3 §6.1, §6.5.

### D346 — Reopen is Visualise's only stage move; an avatar a script uses cannot be archived *(recorded 2026-10-08)*

**Decision.** Reopen moves a script from Visualise to Generate, conditioned on its stage; avatars and panels are kept. Visualise work is allowed at Visualise and In review. The Avatars library's archive (and Discard draft) refuses while any live script's cast uses the avatar, naming the scripts.

**Why.** Spec 3 §3, §8; Q12. Spec 4: editing stays allowed while In review.

**Rejected.** Clearing or keeping a link to an archived avatar (Q12 a, b).

**Originated →** spec 3 §8.1, §8.2.
```

Then edit D288's heading to add `; **sheet SUPERSEDED by D339** (four views)` inside its italic parenthesis.

- [ ] **Step 3: Point the spec at its ADRs**

In the spec's header, change `ADRs: D337–D346 (booked; moved up one on 8 Oct, D319 was taken).` to `ADRs: D337–D346 (recorded 8 Oct with the plan).`

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md docs/superpowers/specs/2026-10-08-script-copilot-3-visualise-design.md
git commit -m "docs(adr): D337-D346 for script copilot spec 3, Visualise

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Full test run and type check**

Run: `npm test && npx tsc --noEmit && npx eslint src`
Expected: all new tests pass. Known pre-existing failures (the registry test, trigger.dev, the Kling timeout flake) may appear; re-run once before investigating, and report any that are not in that list.

- [ ] **Step 6: Success criteria 1 and 2 — the cast**

With migration 0053 applied and Reel 01 seeded at Visualise: make Meenakshi and her husband AI-generated inline, each with four views and a voice; both appear saved in the Avatars library. Seed Reel 06 or a copy of Reel 01 under another reel number at Visualise (a scratch copy via `--file`, never committed) and pick Meenakshi from the library without making her again.

- [ ] **Step 7: Success criteria 3 to 7 — the storyboard (checked by eye, on two runs)**

Before the avatars exist, shots with people say they are waiting and Generate all offers only the five B-roll shots. Once both exist, Generate all shows "Generate 9 panels · about N credits" (the five B-roll panels already drawn), then draws them. Look at all 14 panels: Meenakshi is the same woman in every panel she is in, her red pottu, saree and bangles the same colour and kind; her husband the same in S6, S10, S12; every kitchen shows the Tamil Nadu kit and the hall the Golu steps; no readable text or brand; S8's review card, S13's claim card and pack, S14's pack area blank; every panel a marker-and-wash sketch. Do it twice (redraw all) and note anything that drifts. Record the two runs' findings for the report: these are the spec's watched risks (two faces in one panel, a Specific photo as reference, the reference limit).

- [ ] **Step 8: Success criteria 8 to 10 — change and stability**

Regenerate Meenakshi's avatar with "Greyer at the temples": her nine panels show Out of date, B-roll does not; Generate all reads "Redraw 9 panels · about N credits" and redraws only those; each panel keeps its earlier takes and the pick is the newest. Edit S3's prompt and regenerate: only S3 changes; reset restores the built prompt. Compare the stored `doc` of Reel 01 before and after Visualise (`node scripts/db-inspect.mjs` or the Supabase table view): only `cast[].avatarId` differs.

- [ ] **Step 9: Report**

Summarise for the user: what passed, the two storyboard runs' findings against criteria 4–7, anything that failed with its output, the migration state (0053 applied where), and the merge points this branch leaves for specs 2 and 4. Do not push or merge; the user decides.
