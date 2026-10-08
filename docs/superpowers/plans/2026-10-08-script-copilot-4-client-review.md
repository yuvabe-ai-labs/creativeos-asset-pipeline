# Script Copilot · Spec 4 (Client Review) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The team moves a final script to In review, shares it with the client as a frozen version on one unchanging link (script only, with avatars, or with avatars and panels), the client comments on whole parts of the reel from a phone, the team replies and resolves beside each part, and the client approves a full share, which moves the script to Approved and into the canvas gallery's Scripts tab.

**Architecture:** Four new tables (migration `0054`) hold the review beside the script and never inside it: one review row per script (its share code), one frozen version per share (script text, avatar images, picked panel per shot), comments keyed by version and part, and an append-only event log. Three plpgsql functions do every write that touches the script's stage (share, approve, team stage moves) in one transaction that locks the script row. Pure modules in `src/lib/script-review/` own parts, diffs, threads, activity and assembly; the public page at `/r/s/<title>-<code>` reuses D309's public prefix, name gate and token parsing, and draws the frozen script with spec 1's one script view, extended by optional slots.

**Tech Stack:** Next.js (App Router, this repo's version: read `node_modules/next/dist/docs/` first), React 19, TypeScript, Supabase (service-role server client, plpgsql RPC), zod 4, TanStack Query, shadcn on Base UI (`src/components/ui/*`), Lucide, sonner, vitest (node environment; `react-dom/server` for one markup test).

**Spec:** [docs/superpowers/specs/2026-10-08-script-copilot-4-client-review-design.md](../specs/2026-10-08-script-copilot-4-client-review-design.md) (binding). Parent: [2026-10-07-script-copilot-design.md](../specs/2026-10-07-script-copilot-design.md) §4a. Answers: [2026-10-08-script-copilot-open-questions.md](../specs/2026-10-08-script-copilot-open-questions.md), section Spec 4. Read all three before Task 1. Reused designs: [2026-09-30-client-review-share-design.md](../specs/2026-09-30-client-review-share-design.md) (D309–D311).

## Global Constraints

- **No AI in this spec.** No model calls are added anywhere.
- **Spec 4 keeps versions, comments and activity separate from the script document**, keyed by script, version and part (context, shot id, cast member id + view, panel). It never writes `client_scripts.doc`. It changes `client_scripts.stage` only Visualise → In review, In review → Visualise, In review → Approved, and (spec 4 §8 reopen) Approved → Visualise.
- **Moves in and out of In review are manual team actions.** Client comments never change the stage.
- **Share appears only in In review.** A script reaches In review only from Visualise, so sharing is always after Mark final (spec 2 §8).
- **Share scope = `script` / `avatars` (script + avatars) / `panels` (script + avatars + panels).** Approve appears only on a `panels` (full) share.
- **A version records the script text, the picked panel take per shot, and the avatar images** it included. The link shows the latest version, frozen; team edits never reach the client until the next share.
- **Panels come only through `src/lib/script-review/bridge.ts`** (merge point MP1, "panels for a script: picked take URL per shot id"), stubbed to return none until spec 3 merges. A full share carries whatever panels exist (spec 4 §0).
- **Shared files are extended additively, never restructured:** `src/lib/scripts/schema.ts` is not touched; `script-view.tsx` and its children only gain optional props and anchor ids. Every such edit is a named merge point (see "Merge points" below).
- **Migration number:** `0054` (specs 2 and 3 take `0052` and `0053`; the merge renumbers if needed).
- **ADR numbers:** `D347`–`D356` (booked in the spec).
- **Wording:** "avatar" means the asset only. Never "presenter" in user-facing text. The reopen action here is labelled **"Reopen to Visualise"** so it never reads as spec 3's "Reopen" (Visualise → Generate).
- **Controls are shadcn primitives from `src/components/ui/*` only** (Base UI, `render` prop, not `asChild`). Never a raw `<button>`, `<input>`, `<textarea>`, `<select>`, `<audio controls>`, checkbox or radio. Anything inside a field (the Copy button beside the link) uses `InputGroup` / `InputGroupInput` / `InputGroupAddon` / `InputGroupButton`.
- **Design system:** colours only through the CSS variables in `globals.css`; Clash Display (`font-display`) headings, Gilroy body; purple `primary` sparingly; resting cards `shadow-card`; `.text-eyebrow` labels; Lucide at `strokeWidth={1.5}`; easing `cubic-bezier(0.22,1,0.36,1)` only. "Add" actions ("Comment", "Add a comment") are dashed-border primary chips (`border-dashed border-primary/40 hover:bg-primary/5`). The client-feedback count uses D310's amber tokens (`bg-client/15`, `text-client-text`).
- **Public routes:** `/r/s/*` and `/api/r/s/*` sit under the prefixes `src/proxy.ts` already exempts (`r/`, `api/r/`); `src/proxy.ts` does not change. Every public script route goes through `withScriptShareToken` in `route-helpers.ts`, uses `withQuietErrors`, and returns no org, client, script, review or version ids as fields. The page has no app chrome (`AppHeader` already hides on `/r/*`).
- **Team routes:** `withClient` for every route under `src/app/api/clients/[id]/`, `apiOk` / `apiError` only, `withTryCatch` around multi-step handlers. Every team route loads the script with `getScript(clientId, scriptId)` first; that is the client check for the script id.
- **Reuse, don't redefine:** `REVIEWER_NAME_MAX`, `COMMENT_BODY_MAX`, `MAX_COMMENTS_PER_REVIEW` from `@/lib/client-review/constants`; `shareCodeFor`, `MAX_CODE_EXTRA`, `toCanonicalShareToken` from `@/lib/client-review/token`; `parseCommentEdit`, `Parsed` from `@/lib/client-review/validate`; the reviewer-name storage and `PREPAINT_SCRIPT` from `@/lib/client-review/reviewer-name`; `NameGate` from `@/components/client-review/name-gate`; `ShareCodeTakenError` from `@/lib/db/client-reviews`; `isUuid` and `errorMessage` from `@/lib/avatars/utils`; `avatarVoiceLabel` is NOT used for the client (it says "Chosen for me", a team phrase).
- **Data fetching in the browser** goes through `src/services/script-review.service.ts` and TanStack Query hooks in `src/hooks/queries/script-review.ts`, whose keys are built in that file only.
- **One component per file, named exports, split at about 200 lines** (`docs/component-structure.md`).

## Review Focus

1. **A client on a stale tab** (the team shared version 3 while the client still reads version 2) presses Approve or posts a comment → refused with "A newer version was shared. Reload to see it.", never an approval of a version they did not see. Tests in Task 11 and Task 12.
2. **The team edits the script after sharing and the client reloads** → the link still shows the shared version's text and images, and an approval binds to that version. Test in Task 10.
3. **A forged or outdated part** in a comment request (a shot id the version lacks, a view with no image, a panel on a partial share) → 400 and nothing stored. Tests in Task 1 and Task 11.
4. **A cast member's avatar is a draft, archived, or another client's** when the team shares → it is left out of the version, so the client never sees an unready or foreign face. Test in Task 6.
5. **Approve tapped twice, or by two people at once** → one approval in the activity; the second request gets a success answer, not an error. Test in Task 12 (status mapping) and the `already` branch of `script_review_approve` (Task 5).

## Merge points (with specs 2 and 3, built in parallel from 356f567f)

| # | Where | What happens at merge |
|---|---|---|
| MP1 | `src/lib/script-review/bridge.ts` `getPickedPanels(clientId, scriptId)` | **Spec 3 interface: "panels for a script: picked take URL per shot id"** → `Record<shotId, { takeId, url }>`. Replace the stub body with spec 3's reader. Merge order is 1 → 3 → 4 → 2, so spec 3's reader exists when spec 4 merges. |
| MP2 | `src/lib/script-review/bridge.ts` `avatarViewUrls(avatar)` | **Spec 3 interface: "four views for an avatar"** → `{ front, left, right, back }` URLs. The stub returns the front image only (today's `Avatar` has `front` and one combined `sheet`). Replace with spec 3's four-view fields. |
| MP3 | `src/components/scripts/script-view.tsx`, `script-cast-list.tsx`, `script-shot-list.tsx`, `script-shot-row.tsx`, `script-context-card.tsx` | Spec 4 adds an optional `slots` prop and anchor ids. Spec 3 adds the avatar maker in the same cast slot and the panel beside each shot. If spec 3 used its own props, keep both; if both fill one slot, render both (fragment) in the page that passes them. |
| MP4 | `src/app/clients/[id]/scripts/[scriptId]/page.tsx` | Spec 4 wraps the view in `ScriptReviewWorkspace`. Spec 3 turns the page into the Visualise view. At merge the workspace wraps spec 3's view; view threads move from the cast slot's labelled list (`CastReviewSlot`, team mode) to beside each of spec 3's four views; panel threads move beside spec 3's panel. |
| MP5 | Stage writes | Spec 2's Mark final and spec 3's Reopen (Visualise → Generate) write `client_scripts.stage` their own way; spec 4's moves go through `script_review_move`. Keep spec 4's label "Reopen to Visualise" distinct from spec 3's "Reopen". |
| MP6 | `src/components/scripts/scripts-library.tsx`, `script-card.tsx` | Spec 2 adds "New script"; spec 4 adds the feedback count. Both additive. |
| MP7 | Migration `0054`, ADRs `D347`–`D356` | Renumber the migration if `0054` is taken at merge; the ADR numbers are booked. |

## Not decided by the spec (built as stated, flagged for the user)

1. Comments stay open while the team has moved the script back to Visualise (not approved); they close only on approval (§8 names only approval).
2. After approval the link is a record: no client comments or edits, and no team replies or resolves either (§8 "a read-only record").
3. Approve with no open threads approves on one tap; a confirm appears only with open threads (§8 asks only for that).
4. From the link, only client comments are editable; team replies are not.
5. "Moved to In review" is recorded but not shown in Activity (§7's list omits it).
6. Success criterion 3 asks for a comment on an avatar view right after a script-only share, but a view exists only on a share with avatars; Task 19 makes that view comment on version 2.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/0054_script_reviews.sql` | Four tables, three locked RPCs |
| `src/lib/script-review/constants.ts` | Scopes, views, event kinds, team stage moves, error texts |
| `src/lib/script-review/types.ts` | Part, snapshots, comments, events, threads, activity lines |
| `src/lib/script-review/parts.ts` | Part keys, labels, order, which parts a version shows, parsing |
| `src/lib/script-review/version.ts` | What changed between two shares, in words |
| `src/lib/script-review/threads.ts` | Threads, placement beside parts, "On a removed shot", approve confirm |
| `src/lib/script-review/activity.ts` | The activity lines |
| `src/lib/script-review/validate.ts` | Request bodies |
| `src/lib/script-review/wire.ts` | Rows to app types |
| `src/lib/script-review/bridge.ts` | MP1 and MP2 (spec 3 interfaces, stubbed) |
| `src/lib/script-review/visuals.ts` | What a share freezes: avatar snapshots and panels |
| `src/lib/script-review/paths.ts` | `/r/s/<title>-<code>` |
| `src/lib/script-review/ensure-review.ts` | One review row per script, with its code |
| `src/lib/script-review/actor.ts` | The team member's name, as the client reads it |
| `src/lib/script-review/assemble.ts` | The team payload and the public payload |
| `src/lib/script-review/load.ts` | Reads everything a payload needs |
| `src/lib/script-review/utils.ts` | Dates, cache helper |
| `src/lib/script-review/anchors.ts` | A part's anchor id on the page |
| `src/lib/scripts/anchors.ts` | The script view's anchor ids |
| `src/lib/db/script-reviews.ts` | All reads and writes of the four tables |
| `src/lib/api/route-helpers.ts` | Adds `withScriptShareToken` |
| `src/app/api/clients/[id]/scripts/[scriptId]/review/**` | Team routes: read, stage, share, reply, resolve |
| `src/app/api/r/s/[token]/**` | Public routes: read, comment, edit, approve |
| `src/app/r/s/[token]/*` | The client's page |
| `src/services/script-review.service.ts`, `src/hooks/queries/script-review.ts` | Browser calls and hooks |
| `src/components/scripts/script-view-slots.ts` + edits to the script view | Optional slots (MP3) |
| `src/components/script-review/*.tsx` | Shared review surface (both pages) and the client page |
| `src/components/script-review/team/*.tsx` | The team's workspace, stage actions, share dialog |
| `src/hooks/use-is-server-or-hydrating.ts` | Extracted from D309's page (second user) |
| `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` | ADRs D347–D356 |

---

### Task 1: Constants, types and parts

**Files:**
- Create: `src/lib/script-review/constants.ts`
- Create: `src/lib/script-review/types.ts`
- Create: `src/lib/script-review/parts.ts`
- Create: `src/lib/script-review/__tests__/fixtures.ts`
- Test: `src/lib/script-review/__tests__/constants.test.ts`
- Test: `src/lib/script-review/__tests__/parts.test.ts`

**Interfaces:**
- Consumes: `ScriptStage`, `SCRIPT_STAGE_LABEL` from `@/lib/scripts/constants`; `ScriptDoc`, `scriptDocSchema` from `@/lib/scripts/schema`; `src/lib/scripts/fixtures/reel-01.json` (shots `s01`–`s14`, cast `meenakshi` (lead) and `husband`).
- Produces (constants): `SHARE_SCOPES`, `ShareScope`, `SHARE_SCOPE_LABEL`, `SHARE_SCOPE_PHRASE`, `isShareScope`, `scopeIncludes(scope, "avatars" | "panels")`, `FULL_SHARE`, `AVATAR_VIEWS`, `AvatarView`, `AVATAR_VIEW_LABEL`, `isAvatarView`, `SCRIPT_REVIEW_EVENT_KINDS`, `ScriptReviewEventKind`, `isScriptReviewEventKind`, `TEAM_STAGE_MOVES`, `TeamStageMove`, `isTeamStageMove`, `teamMovesFrom(stage)`, `APPROVED_RECORD_ERROR`, `STALE_VERSION_ERROR`, `COMMENT_LIMIT_ERROR`, `PART_NOT_IN_VERSION_ERROR`.
- Produces (types): `Part`, `PartKind`, `AvatarSnapshot`, `PanelSnapshot`, `VersionVisuals`, `VersionContent`, `ChangedPart`.
- Produces (parts): `partKey(part): string`, `partShotId(part): string | null`, `partLabel(part, doc): string | null`, `partOrder(part, doc): number`, `versionParts(version: VersionContent): Part[]`, `isPartInVersion(part, version): boolean`, `parsePart(input: unknown): Part | null`, `partToColumns(part)`, `columnsToPart(kind, id, view): Part | null`.
- Produces (test fixtures): `AVATAR_ID`, `reelDoc()`, `avatarSnapshot(views?)`, `content(over?)`.

- [ ] **Step 0: Read the docs this plan depends on**

Read `AGENTS.md`, `CLAUDE.md`, `docs/component-structure.md`, `docs/api-routes.md`, and in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/` the pages `dynamic-routes.md`, `route.md`, `not-found.md`, `error.md` and `proxy.md`. Then read the spec, the parent's §4a, and the Spec 4 section of the questions file.

- [ ] **Step 1: Write the constants**

```ts
// src/lib/script-review/constants.ts
// Script copilot spec 4 — client review of a script (D347–D356). Limits shared with the video
// review links (D309) are imported from @/lib/client-review/constants where used, never redeclared.
import type { ScriptStage } from "@/lib/scripts/constants";

/** What a share includes (spec 4 §3 step 2). */
export const SHARE_SCOPES = ["script", "avatars", "panels"] as const;
export type ShareScope = (typeof SHARE_SCOPES)[number];

export const SHARE_SCOPE_LABEL: Record<ShareScope, string> = {
  script: "Script only",
  avatars: "Script and avatars",
  panels: "Script, avatars and panels",
};

/** The same, as words inside a sentence: "Shared, version 1 · the script". */
export const SHARE_SCOPE_PHRASE: Record<ShareScope, string> = {
  script: "the script",
  avatars: "the script and avatars",
  panels: "the script, avatars and panels",
};

export function isShareScope(value: unknown): value is ShareScope {
  return typeof value === "string" && (SHARE_SCOPES as readonly string[]).includes(value);
}

export function scopeIncludes(scope: ShareScope, what: "avatars" | "panels"): boolean {
  return what === "avatars" ? scope !== "script" : scope === "panels";
}

/** Spec 4 §8: Approve appears only on a full share. */
export const FULL_SHARE: ShareScope = "panels";

/** Spec 3 §5.4 and spec 4 §5: every avatar has four views, and each takes comments. */
export const AVATAR_VIEWS = ["front", "left", "right", "back"] as const;
export type AvatarView = (typeof AVATAR_VIEWS)[number];

export const AVATAR_VIEW_LABEL: Record<AvatarView, string> = {
  front: "Front",
  left: "Left",
  right: "Right",
  back: "Back",
};

export function isAvatarView(value: unknown): value is AvatarView {
  return typeof value === "string" && (AVATAR_VIEWS as readonly string[]).includes(value);
}

export const SCRIPT_REVIEW_EVENT_KINDS = ["moved_to_review", "moved_back", "shared", "approved", "reopened"] as const;
export type ScriptReviewEventKind = (typeof SCRIPT_REVIEW_EVENT_KINDS)[number];

export function isScriptReviewEventKind(value: unknown): value is ScriptReviewEventKind {
  return typeof value === "string" && (SCRIPT_REVIEW_EVENT_KINDS as readonly string[]).includes(value);
}

/** Spec 4 §3 and §8: the stage moves the team makes here. "reopen" is spec 4's Approved → Visualise,
 *  labelled so it never reads as spec 3's Reopen (Visualise → Generate). In review → Approved is the
 *  client's, through the approve route, never a team move. */
export const TEAM_STAGE_MOVES = {
  to_review: { from: "visualise", to: "in_review", event: "moved_to_review", label: "Move to In review" },
  back_to_visualise: { from: "in_review", to: "visualise", event: "moved_back", label: "Move back to Visualise" },
  reopen: { from: "approved", to: "visualise", event: "reopened", label: "Reopen to Visualise" },
} as const satisfies Record<string, { from: ScriptStage; to: ScriptStage; event: ScriptReviewEventKind; label: string }>;

export type TeamStageMove = keyof typeof TEAM_STAGE_MOVES;

export function isTeamStageMove(value: unknown): value is TeamStageMove {
  return typeof value === "string" && (Object.keys(TEAM_STAGE_MOVES) as string[]).includes(value);
}

export function teamMovesFrom(stage: ScriptStage): TeamStageMove[] {
  return (Object.keys(TEAM_STAGE_MOVES) as TeamStageMove[]).filter((m) => TEAM_STAGE_MOVES[m].from === stage);
}

export const APPROVED_RECORD_ERROR = "This reel is approved. The link is now a record and takes no more comments.";
export const STALE_VERSION_ERROR = "A newer version was shared. Reload to see it.";
export const COMMENT_LIMIT_ERROR = "This review has reached its comment limit.";
export const PART_NOT_IN_VERSION_ERROR = "That part is not in this version.";
```

- [ ] **Step 2: Write the types**

```ts
// src/lib/script-review/types.ts
// Pure types shared by the server, the routes and the browser.
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { AvatarView, ShareScope } from "./constants";

/** Spec 4 §5: the whole parts a comment can be on. A comment never points inside an image. */
export type Part =
  | { kind: "context" }
  | { kind: "shot"; shotId: string }
  | { kind: "panel"; shotId: string }
  | { kind: "cast"; castId: string }
  | { kind: "view"; castId: string; view: AvatarView };

export type PartKind = Part["kind"];

/** One cast member's avatar as it was shared: "the avatar images" of spec 4 §3 step 3. */
export type AvatarSnapshot = {
  avatarId: string;
  name: string;
  views: Record<AvatarView, string | null>;
  voice: { name: string | null; sampleUrl: string | null } | null;
};

/** One shot's picked panel take as it was shared (spec 3 §6.6: the client only sees the picked take). */
export type PanelSnapshot = { takeId: string; url: string };

/** What a share froze besides the text. Keyed by cast member id and by shot id. */
export type VersionVisuals = {
  avatars: Record<string, AvatarSnapshot>;
  panels: Record<string, PanelSnapshot>;
};

/** A version's content: what the client sees, and what the next share is compared with. */
export type VersionContent = { scope: ShareScope; doc: ScriptDoc; visuals: VersionVisuals };

/** One line item of "S1, S4, S5 and Meenakshi revised", with the part it links to. */
export type ChangedPart = { part: Part; change: "revised" | "added" | "removed"; label: string };
```

- [ ] **Step 3: Write the test fixtures**

```ts
// src/lib/script-review/__tests__/fixtures.ts
import { scriptDocSchema, type ScriptDoc } from "@/lib/scripts/schema";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import type { AvatarSnapshot, VersionContent } from "../types";

export const AVATAR_ID = "7a2d3c4e-0000-4000-8000-000000000002";

/** A fresh, validated Reel 01 (14 shots s01–s14; cast meenakshi (lead) and husband). */
export function reelDoc(): ScriptDoc {
  return scriptDocSchema.parse(structuredClone(reel01));
}

export function avatarSnapshot(views: Partial<AvatarSnapshot["views"]> = { front: "https://cdn/front.png" }): AvatarSnapshot {
  return {
    avatarId: AVATAR_ID,
    name: "Meenakshi",
    views: { front: null, left: null, right: null, back: null, ...views },
    voice: null,
  };
}

export function content(over: Partial<VersionContent> = {}): VersionContent {
  return { scope: "script", doc: reelDoc(), visuals: { avatars: {}, panels: {} }, ...over };
}
```

- [ ] **Step 4: Write the failing tests**

```ts
// src/lib/script-review/__tests__/constants.test.ts
import { describe, it, expect } from "vitest";
import { isShareScope, isTeamStageMove, scopeIncludes, teamMovesFrom, TEAM_STAGE_MOVES } from "../constants";

describe("share scopes", () => {
  it("knows the three scopes and nothing else", () => {
    expect(["script", "avatars", "panels"].every(isShareScope)).toBe(true);
    expect(isShareScope("full")).toBe(false);
    expect(isShareScope(undefined)).toBe(false);
  });

  it("each scope includes what the spec says", () => {
    expect(scopeIncludes("script", "avatars")).toBe(false);
    expect(scopeIncludes("avatars", "avatars")).toBe(true);
    expect(scopeIncludes("avatars", "panels")).toBe(false);
    expect(scopeIncludes("panels", "avatars")).toBe(true);
    expect(scopeIncludes("panels", "panels")).toBe(true);
  });
});

describe("team stage moves", () => {
  it("only these three moves exist (spec 4 §3, §8)", () => {
    expect(Object.keys(TEAM_STAGE_MOVES).sort()).toEqual(["back_to_visualise", "reopen", "to_review"]);
    expect(isTeamStageMove("approve")).toBe(false);
  });

  it("offers each move only from its stage", () => {
    expect(teamMovesFrom("generate")).toEqual([]);
    expect(teamMovesFrom("visualise")).toEqual(["to_review"]);
    expect(teamMovesFrom("in_review")).toEqual(["back_to_visualise"]);
    expect(teamMovesFrom("approved")).toEqual(["reopen"]);
  });

  it("never labels the reopen as spec 3's Reopen", () => {
    expect(TEAM_STAGE_MOVES.reopen.label).toBe("Reopen to Visualise");
  });
});
```

```ts
// src/lib/script-review/__tests__/parts.test.ts
import { describe, it, expect } from "vitest";
import {
  columnsToPart, isPartInVersion, parsePart, partKey, partLabel, partOrder, partToColumns, versionParts,
} from "../parts";
import type { Part } from "../types";
import { avatarSnapshot, content, reelDoc } from "./fixtures";

describe("partLabel", () => {
  const doc = reelDoc();
  it("names each kind of part as the page shows it", () => {
    expect(partLabel({ kind: "context" }, doc)).toBe("Context");
    expect(partLabel({ kind: "shot", shotId: "s04" }, doc)).toBe("S4");
    expect(partLabel({ kind: "panel", shotId: "s04" }, doc)).toBe("S4 panel");
    expect(partLabel({ kind: "cast", castId: "meenakshi" }, doc)).toBe("Meenakshi");
    expect(partLabel({ kind: "view", castId: "meenakshi", view: "left" }, doc)).toBe("Meenakshi · Left view");
  });
  it("is null for a part the script no longer has", () => {
    expect(partLabel({ kind: "shot", shotId: "gone" }, doc)).toBeNull();
    expect(partLabel({ kind: "cast", castId: "gone" }, doc)).toBeNull();
  });
});

describe("partKey", () => {
  it("is equal for equal parts and different for a shot and its panel", () => {
    expect(partKey({ kind: "shot", shotId: "s01" })).toBe(partKey({ kind: "shot", shotId: "s01" }));
    expect(partKey({ kind: "shot", shotId: "s01" })).not.toBe(partKey({ kind: "panel", shotId: "s01" }));
  });
});

describe("partOrder", () => {
  it("orders parts as the page shows them: context, cast with views, shots with panels", () => {
    const doc = reelDoc();
    const parts: Part[] = [
      { kind: "shot", shotId: "s02" },
      { kind: "panel", shotId: "s01" },
      { kind: "view", castId: "meenakshi", view: "back" },
      { kind: "context" },
      { kind: "shot", shotId: "s01" },
      { kind: "cast", castId: "husband" },
      { kind: "cast", castId: "meenakshi" },
    ];
    const sorted = [...parts].sort((a, b) => partOrder(a, doc) - partOrder(b, doc)).map((p) => partLabel(p, doc));
    expect(sorted).toEqual(["Context", "Meenakshi", "Meenakshi · Back view", "Meenakshi's husband", "S1", "S1 panel", "S2"]);
  });
});

describe("versionParts", () => {
  it("a script-only share offers the context, every shot and every cast member, and nothing else", () => {
    // Forged visuals on a script-only share are ignored: the scope decides.
    const v = content({ visuals: { avatars: { meenakshi: avatarSnapshot() }, panels: { s01: { takeId: "t1", url: "u" } } } });
    const parts = versionParts(v);
    expect(parts).toHaveLength(1 + 14 + 2);
    expect(parts.some((p) => p.kind === "view" || p.kind === "panel")).toBe(false);
  });

  it("a share with avatars adds a view only where the view has an image", () => {
    const v = content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot({ front: "f", left: "l" }) }, panels: {} } });
    const views = versionParts(v).filter((p) => p.kind === "view");
    expect(views).toEqual([
      { kind: "view", castId: "meenakshi", view: "front" },
      { kind: "view", castId: "meenakshi", view: "left" },
    ]);
  });

  it("a full share adds a panel only for shots that have one", () => {
    const v = content({ scope: "panels", visuals: { avatars: {}, panels: { s03: { takeId: "t3", url: "u3" } } } });
    expect(versionParts(v).filter((p) => p.kind === "panel")).toEqual([{ kind: "panel", shotId: "s03" }]);
  });
});

describe("isPartInVersion (Review Focus 3)", () => {
  it("refuses a shot the version lacks, a view with no image, and a panel on a partial share", () => {
    const withFront = content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot() }, panels: { s01: { takeId: "t", url: "u" } } } });
    expect(isPartInVersion({ kind: "shot", shotId: "s99" }, withFront)).toBe(false);
    expect(isPartInVersion({ kind: "view", castId: "meenakshi", view: "left" }, withFront)).toBe(false);
    expect(isPartInVersion({ kind: "panel", shotId: "s01" }, withFront)).toBe(false);
    expect(isPartInVersion({ kind: "view", castId: "meenakshi", view: "front" }, withFront)).toBe(true);
    expect(isPartInVersion({ kind: "cast", castId: "husband" }, withFront)).toBe(true);
  });
});

describe("parsePart", () => {
  it("accepts each well-formed part", () => {
    expect(parsePart({ kind: "context" })).toEqual({ kind: "context" });
    expect(parsePart({ kind: "panel", shotId: "s01" })).toEqual({ kind: "panel", shotId: "s01" });
    expect(parsePart({ kind: "view", castId: "meenakshi", view: "back" })).toEqual({ kind: "view", castId: "meenakshi", view: "back" });
  });
  it("rejects anything else", () => {
    expect(parsePart(null)).toBeNull();
    expect(parsePart("context")).toBeNull();
    expect(parsePart({ kind: "pin", x: 1 })).toBeNull();
    expect(parsePart({ kind: "shot" })).toBeNull();
    expect(parsePart({ kind: "shot", shotId: "" })).toBeNull();
    expect(parsePart({ kind: "shot", shotId: "x".repeat(65) })).toBeNull();
    expect(parsePart({ kind: "view", castId: "meenakshi", view: "top" })).toBeNull();
  });
});

describe("columns", () => {
  it("round-trips every kind through the table's columns", () => {
    const parts: Part[] = [
      { kind: "context" },
      { kind: "shot", shotId: "s01" },
      { kind: "panel", shotId: "s01" },
      { kind: "cast", castId: "husband" },
      { kind: "view", castId: "meenakshi", view: "right" },
    ];
    for (const p of parts) {
      const c = partToColumns(p);
      expect(columnsToPart(c.part_kind, c.part_id, c.part_view)).toEqual(p);
    }
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `npx vitest run src/lib/script-review/__tests__/constants.test.ts src/lib/script-review/__tests__/parts.test.ts`
Expected: constants tests PASS (written in Step 1); parts tests FAIL with "Failed to resolve import ../parts".

- [ ] **Step 6: Write the parts module**

```ts
// src/lib/script-review/parts.ts
import type { ScriptDoc } from "@/lib/scripts/schema";
import { AVATAR_VIEWS, AVATAR_VIEW_LABEL, isAvatarView, scopeIncludes, type AvatarView } from "./constants";
import type { Part, PartKind, VersionContent } from "./types";

// Spec 4 §5: a comment is on one whole part. Parts are keyed by the script's own stable ids (shot
// id, cast member id), never by position, so a comment stays on its shot when shots move.

export const PART_KINDS = ["context", "shot", "panel", "cast", "view"] as const satisfies readonly PartKind[];

/** A string key for maps. JSON, so no id can collide with another part's key. */
export function partKey(part: Part): string {
  switch (part.kind) {
    case "context":
      return JSON.stringify(["context"]);
    case "shot":
    case "panel":
      return JSON.stringify([part.kind, part.shotId]);
    case "cast":
      return JSON.stringify(["cast", part.castId]);
    case "view":
      return JSON.stringify(["view", part.castId, part.view]);
  }
}

/** The shot a part belongs to, for "On a removed shot" (spec 4 §5). */
export function partShotId(part: Part): string | null {
  return part.kind === "shot" || part.kind === "panel" ? part.shotId : null;
}

/** The part's name in this script: "Context", "S4", "S4 panel", "Meenakshi", "Meenakshi · Left view".
 *  Null when the script no longer has it. */
export function partLabel(part: Part, doc: ScriptDoc): string | null {
  switch (part.kind) {
    case "context":
      return "Context";
    case "shot":
    case "panel": {
      const i = doc.shots.findIndex((s) => s.id === part.shotId);
      if (i < 0) return null;
      return part.kind === "shot" ? `S${i + 1}` : `S${i + 1} panel`;
    }
    case "cast":
    case "view": {
      const member = doc.cast.find((c) => c.id === part.castId);
      if (!member) return null;
      return part.kind === "cast" ? member.name : `${member.name} · ${AVATAR_VIEW_LABEL[part.view]} view`;
    }
  }
}

const MISSING = 9_000;

/** Page order: the context card, then each cast member with its views, then each shot with its panel. */
export function partOrder(part: Part, doc: ScriptDoc): number {
  const shot = (id: string) => {
    const i = doc.shots.findIndex((s) => s.id === id);
    return i < 0 ? MISSING : i;
  };
  const cast = (id: string) => {
    const i = doc.cast.findIndex((c) => c.id === id);
    return i < 0 ? MISSING : i;
  };
  switch (part.kind) {
    case "context":
      return 0;
    case "cast":
      return 1 + cast(part.castId) * 10;
    case "view":
      return 1 + cast(part.castId) * 10 + 1 + AVATAR_VIEWS.indexOf(part.view);
    case "shot":
      return 100_000 + shot(part.shotId) * 2;
    case "panel":
      return 100_000 + shot(part.shotId) * 2 + 1;
  }
}

/** Spec 4 §5: the parts this version showed the client, so the only ones that take comments.
 *  The scope decides; visuals a scope does not include are ignored even when present. */
export function versionParts(version: VersionContent): Part[] {
  const parts: Part[] = [{ kind: "context" }];
  for (const shot of version.doc.shots) parts.push({ kind: "shot", shotId: shot.id });
  for (const member of version.doc.cast) {
    parts.push({ kind: "cast", castId: member.id });
    const avatar = scopeIncludes(version.scope, "avatars") ? version.visuals.avatars[member.id] : undefined;
    if (!avatar) continue;
    for (const view of AVATAR_VIEWS) {
      if (avatar.views[view]) parts.push({ kind: "view", castId: member.id, view });
    }
  }
  if (scopeIncludes(version.scope, "panels")) {
    for (const shot of version.doc.shots) {
      if (version.visuals.panels[shot.id]) parts.push({ kind: "panel", shotId: shot.id });
    }
  }
  return parts;
}

export function isPartInVersion(part: Part, version: VersionContent): boolean {
  const key = partKey(part);
  return versionParts(version).some((p) => partKey(p) === key);
}

const isId = (value: unknown): value is string => typeof value === "string" && value.length >= 1 && value.length <= 64;

/** A part from untrusted JSON, or null. Ids follow the script schema's limits (1–64 characters). */
export function parsePart(input: unknown): Part | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const kind = o.kind;
  if (kind === "context") return { kind };
  if (kind === "shot" || kind === "panel") return isId(o.shotId) ? { kind, shotId: o.shotId } : null;
  if (kind === "cast") return isId(o.castId) ? { kind, castId: o.castId } : null;
  if (kind === "view") {
    const view = o.view;
    return isId(o.castId) && isAvatarView(view) ? { kind, castId: o.castId, view } : null;
  }
  return null;
}

export function partToColumns(part: Part): { part_kind: PartKind; part_id: string | null; part_view: AvatarView | null } {
  switch (part.kind) {
    case "context":
      return { part_kind: "context", part_id: null, part_view: null };
    case "shot":
    case "panel":
      return { part_kind: part.kind, part_id: part.shotId, part_view: null };
    case "cast":
      return { part_kind: "cast", part_id: part.castId, part_view: null };
    case "view":
      return { part_kind: "view", part_id: part.castId, part_view: part.view };
  }
}

export function columnsToPart(kind: string, id: string | null, view: string | null): Part | null {
  if (kind === "context") return parsePart({ kind });
  if (kind === "cast") return parsePart({ kind, castId: id });
  if (kind === "view") return parsePart({ kind, castId: id, view });
  return parsePart({ kind, shotId: id });
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/lib/script-review/__tests__/constants.test.ts src/lib/script-review/__tests__/parts.test.ts`
Expected: PASS. (If `partOrder`'s expected list fails on the husband's name, read his `name` in `reel-01.json` and use it verbatim.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/script-review
git commit -m "feat(script-review): parts, scopes and stage moves for client review (spec 4)"
```

---

### Task 2: What changed between two shares

**Files:**
- Create: `src/lib/script-review/version.ts`
- Test: `src/lib/script-review/__tests__/version.test.ts`

**Interfaces:**
- Consumes: `scopeIncludes` (Task 1), `partLabel` (Task 1), `ChangedPart`, `Part`, `VersionContent` (Task 1), test fixtures (Task 1).
- Produces: `diffVersions(prev: VersionContent | null, next: VersionContent): ChangedPart[]`, `describeChanges(changes: ChangedPart[]): string | null`, `joinWithAnd(items: string[]): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/script-review/__tests__/version.test.ts
import { describe, it, expect } from "vitest";
import { describeChanges, diffVersions, joinWithAnd } from "../version";
import type { PanelSnapshot } from "../types";
import { avatarSnapshot, content, reelDoc } from "./fixtures";

const allPanels = (take: string): Record<string, PanelSnapshot> =>
  Object.fromEntries(reelDoc().shots.map((s) => [s.id, { takeId: `${take}-${s.id}`, url: `https://cdn/${take}/${s.id}.png` }]));

describe("diffVersions", () => {
  it("has nothing to say about a first share", () => {
    expect(diffVersions(null, content())).toEqual([]);
  });

  it("finds nothing when the same thing is shared again", () => {
    expect(diffVersions(content(), content())).toEqual([]);
  });

  it("names edited shots in script order", () => {
    const next = content();
    next.doc.shots[3].vo = "A new line";
    next.doc.shots[0].visual = "A new opening";
    const changes = diffVersions(content(), next);
    expect(changes.map((c) => `${c.label} ${c.change}`)).toEqual(["S1 revised", "S4 revised"]);
    expect(changes[0].part).toEqual({ kind: "shot", shotId: "s01" });
    expect(describeChanges(changes)).toBe("S1 and S4 revised");
  });

  it("labels a removed shot by its number in the version it left", () => {
    const next = content();
    next.doc.shots = next.doc.shots.filter((s) => s.id !== "s09");
    const changes = diffVersions(content(), next);
    expect(changes).toEqual([{ part: { kind: "shot", shotId: "s09" }, change: "removed", label: "S9" }]);
  });

  it("on a split, the first half keeps the shot and the new half is added", () => {
    const next = content();
    const s05 = next.doc.shots[4];
    next.doc.shots.splice(4, 1, { ...s05, visual: "First half", lengthSeconds: 2 }, { ...s05, id: "s05b", visual: "Second half", lengthSeconds: 2 });
    const changes = diffVersions(content(), next);
    expect(changes.map((c) => `${c.label} ${c.change}`)).toEqual(["S5 revised", "S6 added"]);
  });

  it("puts the context first when the header or the context card changed", () => {
    const next = content();
    next.doc.context.purpose = "A sharper purpose";
    next.doc.shots[1].vo = "Edited";
    expect(describeChanges(diffVersions(content(), next))).toBe("Context and S2 revised");
  });

  it("does not list fourteen changes when a share only widens to panels (Review Focus)", () => {
    const prev = content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot() }, panels: {} } });
    const next = content({ scope: "panels", visuals: { avatars: { meenakshi: avatarSnapshot() }, panels: allPanels("a") } });
    expect(diffVersions(prev, next)).toEqual([]);
  });

  it("counts a new picked panel as a change to its shot when both shares had panels", () => {
    const prevPanels = allPanels("a");
    const nextPanels = { ...prevPanels, s07: { takeId: "b-s07", url: "https://cdn/b/s07.png" } };
    const prev = content({ scope: "panels", visuals: { avatars: {}, panels: prevPanels } });
    const next = content({ scope: "panels", visuals: { avatars: {}, panels: nextPanels } });
    expect(describeChanges(diffVersions(prev, next))).toBe("S7 revised");
  });

  it("counts new avatar images as a change to that cast member when both shares had avatars", () => {
    const prev = content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot({ front: "f1" }) }, panels: {} } });
    const next = content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot({ front: "f2" }) }, panels: {} } });
    expect(diffVersions(prev, next)).toEqual([{ part: { kind: "cast", castId: "meenakshi" }, change: "revised", label: "Meenakshi" }]);
  });

  it("reads like the board: shots first, then the avatar", () => {
    const prev = content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot({ front: "f1" }) }, panels: {} } });
    const next = content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot({ front: "f2" }) }, panels: {} } });
    for (const i of [0, 3, 4]) next.doc.shots[i].onScreenText = "New card";
    expect(describeChanges(diffVersions(prev, next))).toBe("S1, S4, S5 and Meenakshi revised");
  });
});

describe("describeChanges", () => {
  it("groups by kind of change", () => {
    expect(
      describeChanges([
        { part: { kind: "shot", shotId: "a" }, change: "revised", label: "S1" },
        { part: { kind: "shot", shotId: "b" }, change: "added", label: "S6" },
        { part: { kind: "shot", shotId: "c" }, change: "removed", label: "S9" },
      ]),
    ).toBe("S1 revised · S6 added · S9 removed");
  });
  it("is null when nothing changed", () => {
    expect(describeChanges([])).toBeNull();
  });
});

describe("joinWithAnd", () => {
  it("joins lists the way a sentence does", () => {
    expect(joinWithAnd([])).toBe("");
    expect(joinWithAnd(["S1"])).toBe("S1");
    expect(joinWithAnd(["S1", "S4"])).toBe("S1 and S4");
    expect(joinWithAnd(["S1", "S4", "S5"])).toBe("S1, S4 and S5");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/script-review/__tests__/version.test.ts`
Expected: FAIL with "Failed to resolve import ../version".

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/script-review/version.ts
import type { CastMember, ScriptDoc, Shot } from "@/lib/scripts/schema";
import { scopeIncludes } from "./constants";
import { partLabel } from "./parts";
import type { ChangedPart, Part, VersionContent } from "./types";

const shotText = (s: Shot) => JSON.stringify([s.beat, s.lengthSeconds, s.visual, s.vo, s.onScreenText, s.onScreen]);
const memberText = (c: CastMember) => JSON.stringify([c.name, c.description, c.isLead]);
const contextText = (d: ScriptDoc) => JSON.stringify([d.header, d.context]);

/** Spec 4 §7: which parts changed between two shares, for the activity line "S1, S4, S5 and the
 *  avatar revised". A new picked panel or new avatar images count as a change to that shot or cast
 *  member only when both shares showed them: widening the scope is said by the share line itself,
 *  not as fourteen changes. Order: context, shots (in the new order), removed shots, cast. */
export function diffVersions(prev: VersionContent | null, next: VersionContent): ChangedPart[] {
  if (!prev) return [];
  const out: ChangedPart[] = [];
  const add = (part: Part, change: ChangedPart["change"], doc: ScriptDoc) => {
    const label = partLabel(part, doc);
    if (label) out.push({ part, change, label });
  };

  if (contextText(prev.doc) !== contextText(next.doc)) add({ kind: "context" }, "revised", next.doc);

  const panelsInBoth = scopeIncludes(prev.scope, "panels") && scopeIncludes(next.scope, "panels");
  const prevShots = new Map(prev.doc.shots.map((s) => [s.id, s]));
  for (const shot of next.doc.shots) {
    const part: Part = { kind: "shot", shotId: shot.id };
    const before = prevShots.get(shot.id);
    if (!before) {
      add(part, "added", next.doc);
      continue;
    }
    const panelChanged =
      panelsInBoth && (prev.visuals.panels[shot.id]?.takeId ?? null) !== (next.visuals.panels[shot.id]?.takeId ?? null);
    if (shotText(before) !== shotText(shot) || panelChanged) add(part, "revised", next.doc);
  }
  const nextShotIds = new Set(next.doc.shots.map((s) => s.id));
  for (const shot of prev.doc.shots) {
    if (!nextShotIds.has(shot.id)) add({ kind: "shot", shotId: shot.id }, "removed", prev.doc);
  }

  const avatarsInBoth = scopeIncludes(prev.scope, "avatars") && scopeIncludes(next.scope, "avatars");
  const prevCast = new Map(prev.doc.cast.map((c) => [c.id, c]));
  for (const member of next.doc.cast) {
    const part: Part = { kind: "cast", castId: member.id };
    const before = prevCast.get(member.id);
    if (!before) {
      add(part, "added", next.doc);
      continue;
    }
    const avatarChanged =
      avatarsInBoth &&
      JSON.stringify(prev.visuals.avatars[member.id] ?? null) !== JSON.stringify(next.visuals.avatars[member.id] ?? null);
    if (memberText(before) !== memberText(member) || avatarChanged) add(part, "revised", next.doc);
  }
  const nextCastIds = new Set(next.doc.cast.map((c) => c.id));
  for (const member of prev.doc.cast) {
    if (!nextCastIds.has(member.id)) add({ kind: "cast", castId: member.id }, "removed", prev.doc);
  }
  return out;
}

export function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** "S1, S4, S5 and Meenakshi revised · S6 added · S9 removed", or null when nothing changed. */
export function describeChanges(changes: ChangedPart[]): string | null {
  const groups = (["revised", "added", "removed"] as const)
    .map((change) => ({ change, labels: changes.filter((c) => c.change === change).map((c) => c.label) }))
    .filter((g) => g.labels.length > 0)
    .map((g) => `${joinWithAnd(g.labels)} ${g.change}`);
  return groups.length > 0 ? groups.join(" · ") : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/script-review/__tests__/version.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/script-review/version.ts src/lib/script-review/__tests__/version.test.ts
git commit -m "feat(script-review): name what changed between two shares"
```

---

### Task 3: Threads and activity

**Files:**
- Modify: `src/lib/script-review/types.ts` (append)
- Modify: `src/lib/script-review/__tests__/fixtures.ts` (append)
- Create: `src/lib/script-review/threads.ts`
- Create: `src/lib/script-review/activity.ts`
- Test: `src/lib/script-review/__tests__/threads.test.ts`
- Test: `src/lib/script-review/__tests__/activity.test.ts`

**Interfaces:**
- Consumes: `partKey`, `partShotId` (Task 1); `describeChanges`, `joinWithAnd` (Task 2); `SHARE_SCOPE_PHRASE`, `ScriptReviewEventKind`, `ShareScope` (Task 1).
- Produces (types): `CommentAuthorKind`, `ScriptComment`, `ScriptReviewEvent`, `Thread`, `RemovedShot`, `ActivityLine`.
- Produces (threads): `buildThreads(comments): Thread[]`, `PlacedThreads`, `placeThreads(threads, doc, removed: Record<string, RemovedShot>): PlacedThreads`, `removedShots(versions: { doc: ScriptDoc }[], doc: ScriptDoc): Record<string, RemovedShot>`, `openThreads(threads): Thread[]`, `approveConfirmText(open: Thread[]): string | null`.
- Produces (activity): `buildActivity(events: ScriptReviewEvent[], comments: ScriptComment[]): ActivityLine[]`.
- Produces (fixtures): `comment(over?)`, `event(over?)`.

- [ ] **Step 1: Append the types**

```ts
// append to src/lib/script-review/types.ts
import type { ScriptReviewEventKind } from "./constants";

export type CommentAuthorKind = "client" | "team";

/** A comment as it leaves the server. `versionNumber` is the version it was made on (spec 4 §5).
 *  No user ids: a team reply carries the name the client reads, copied when it was written. */
export type ScriptComment = {
  id: string;
  versionNumber: number;
  part: Part;
  parentId: string | null;
  authorKind: CommentAuthorKind;
  authorName: string;
  body: string;
  editedByName: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

/** One append-only line of the review's history (spec 4 §7). */
export type ScriptReviewEvent = {
  id: string;
  kind: ScriptReviewEventKind;
  versionNumber: number | null;
  actorKind: CommentAuthorKind;
  actorName: string;
  scope: ShareScope | null;
  changes: ChangedPart[];
  createdAt: string;
};

/** A client's comment with the team's replies under it. Only the first comment carries Resolved. */
export type Thread = { root: ScriptComment; replies: ScriptComment[]; resolved: boolean };

/** What "On a removed shot" quotes: the shot's number and visual in the last version that had it. */
export type RemovedShot = { label: string; text: string };

export type ActivityLine = { id: string; at: string; text: string; links: { label: string; part: Part }[] };
```

Move the new `import type { ScriptReviewEventKind } from "./constants";` up into the file's existing import from `./constants` so the file has one import per module: `import type { AvatarView, ScriptReviewEventKind, ShareScope } from "./constants";`.

- [ ] **Step 2: Append the fixtures**

```ts
// append to src/lib/script-review/__tests__/fixtures.ts
import type { ScriptComment, ScriptReviewEvent } from "../types";

export function comment(over: Partial<ScriptComment> = {}): ScriptComment {
  return {
    id: "c1", versionNumber: 1, part: { kind: "context" }, parentId: null,
    authorKind: "client", authorName: "Priya", body: "Looks good",
    editedByName: null, resolvedAt: null, resolvedByName: null,
    createdAt: "2026-10-10T10:00:00.000Z", updatedAt: "2026-10-10T10:00:00.000Z",
    ...over,
  };
}

export function event(over: Partial<ScriptReviewEvent> = {}): ScriptReviewEvent {
  return {
    id: "e1", kind: "shared", versionNumber: 1, actorKind: "team", actorName: "Arun",
    scope: "script", changes: [], createdAt: "2026-10-10T09:00:00.000Z",
    ...over,
  };
}
```

Merge the new type import into the file's existing `import type { AvatarSnapshot, VersionContent } from "../types";`.

- [ ] **Step 3: Write the failing tests**

```ts
// src/lib/script-review/__tests__/threads.test.ts
import { describe, it, expect } from "vitest";
import { approveConfirmText, buildThreads, openThreads, placeThreads, removedShots } from "../threads";
import { partKey } from "../parts";
import { comment, reelDoc } from "./fixtures";

const at = (minute: number) => `2026-10-10T10:${String(minute).padStart(2, "0")}:00.000Z`;

describe("buildThreads", () => {
  it("puts replies under their comment, oldest first, and reads Resolved off the first comment", () => {
    const threads = buildThreads([
      comment({ id: "r2", parentId: "a", authorKind: "team", authorName: "Arun", createdAt: at(5) }),
      comment({ id: "a", createdAt: at(1), resolvedAt: at(9), resolvedByName: "Arun" }),
      comment({ id: "b", createdAt: at(2) }),
      comment({ id: "r1", parentId: "a", authorKind: "team", authorName: "Arun", createdAt: at(3) }),
    ]);
    expect(threads.map((t) => t.root.id)).toEqual(["a", "b"]);
    expect(threads[0].replies.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(threads[0].resolved).toBe(true);
    expect(threads[1].resolved).toBe(false);
  });
});

describe("placeThreads", () => {
  it("puts a thread beside its part", () => {
    const threads = buildThreads([comment({ id: "a", part: { kind: "shot", shotId: "s04" } })]);
    const placed = placeThreads(threads, reelDoc(), {});
    expect(placed.byPart.get(partKey({ kind: "shot", shotId: "s04" }))?.map((t) => t.root.id)).toEqual(["a"]);
    expect(placed.removed).toEqual([]);
  });

  it("keeps a thread on a removed shot, under that shot's last text (spec 4 §5)", () => {
    const doc = reelDoc();
    doc.shots = doc.shots.filter((s) => s.id !== "s09");
    const threads = buildThreads([
      comment({ id: "a", part: { kind: "shot", shotId: "s09" } }),
      comment({ id: "b", part: { kind: "panel", shotId: "s09" }, createdAt: at(4) }),
    ]);
    const placed = placeThreads(threads, doc, { s09: { label: "S9", text: "She smiles at the Golu steps" } });
    expect(placed.byPart.size).toBe(0);
    expect(placed.removed).toHaveLength(1);
    expect(placed.removed[0]).toMatchObject({ shotId: "s09", label: "S9", text: "She smiles at the Golu steps" });
    expect(placed.removed[0].threads.map((t) => t.root.id)).toEqual(["a", "b"]);
  });

  it("leaves a split's first half with its comments, because it keeps the shot's id", () => {
    const doc = reelDoc();
    doc.shots.splice(5, 0, { ...doc.shots[4], id: "s05b" });
    const placed = placeThreads(buildThreads([comment({ part: { kind: "shot", shotId: "s05" } })]), doc, {});
    expect(placed.byPart.has(partKey({ kind: "shot", shotId: "s05" }))).toBe(true);
    expect(placed.removed).toEqual([]);
  });
});

describe("removedShots", () => {
  it("quotes each gone shot's text from the last version that had it", () => {
    const v1 = reelDoc();
    const v2 = reelDoc();
    v2.shots[8].visual = "Revised S9";
    const now = reelDoc();
    now.shots = now.shots.filter((s) => s.id !== "s09");
    expect(removedShots([{ doc: v1 }, { doc: v2 }], now)).toEqual({ s09: { label: "S9", text: "Revised S9" } });
  });
});

describe("approveConfirmText (spec 4 §8)", () => {
  it("is null when every thread is resolved", () => {
    const threads = buildThreads([comment({ resolvedAt: at(5) })]);
    expect(approveConfirmText(openThreads(threads))).toBeNull();
  });

  it("names the one open comment", () => {
    const threads = buildThreads([comment({ body: "Can she wear blue?" })]);
    expect(approveConfirmText(openThreads(threads))).toBe("You have 1 open comment: “Can she wear blue?”. Approve anyway?");
  });

  it("names three and counts the rest", () => {
    const threads = buildThreads([1, 2, 3, 4].map((n) => comment({ id: `c${n}`, body: `Note ${n}`, createdAt: at(n) })));
    expect(approveConfirmText(openThreads(threads))).toBe(
      "You have 4 open comments: “Note 1”, “Note 2”, “Note 3” and 1 more. Approve anyway?",
    );
  });

  it("shortens a long comment", () => {
    const text = approveConfirmText(openThreads(buildThreads([comment({ body: "x".repeat(200) })])));
    expect(text!.length).toBeLessThan(140);
    expect(text).toContain("…");
  });
});
```

```ts
// src/lib/script-review/__tests__/activity.test.ts
import { describe, it, expect } from "vitest";
import { buildActivity } from "../activity";
import { comment, event } from "./fixtures";

describe("buildActivity (spec 4 §7)", () => {
  it("says what a first share included", () => {
    expect(buildActivity([event()], []).map((l) => l.text)).toEqual(["Shared, version 1 · the script"]);
  });

  it("puts what changed before the share that carried it, linking every part still there", () => {
    const lines = buildActivity(
      [
        event(),
        event({
          id: "e2", versionNumber: 2, scope: "panels", createdAt: "2026-10-11T09:00:00.000Z",
          changes: [
            { part: { kind: "shot", shotId: "s01" }, change: "revised", label: "S1" },
            { part: { kind: "shot", shotId: "s09" }, change: "removed", label: "S9" },
          ],
        }),
      ],
      [],
    );
    expect(lines.map((l) => l.text)).toEqual([
      "Shared, version 1 · the script",
      "S1 revised · S9 removed",
      "Shared again, version 2 · the script, avatars and panels",
    ]);
    expect(lines[1].links).toEqual([{ label: "S1", part: { kind: "shot", shotId: "s01" } }]);
  });

  it("counts the client's comments per version, by name, and leaves out team replies", () => {
    const lines = buildActivity(
      [event()],
      [
        comment({ id: "a", authorName: "Priya", createdAt: "2026-10-10T10:00:00.000Z" }),
        comment({ id: "b", authorName: "Ravi", createdAt: "2026-10-10T11:00:00.000Z" }),
        comment({ id: "c", authorName: "Priya", createdAt: "2026-10-10T12:00:00.000Z" }),
        comment({ id: "r", parentId: "a", authorKind: "team", authorName: "Arun", createdAt: "2026-10-10T13:00:00.000Z" }),
      ],
    );
    expect(lines.map((l) => l.text)).toEqual(["Shared, version 1 · the script", "3 comments, by Priya and Ravi"]);
    expect(lines[1].at).toBe("2026-10-10T12:00:00.000Z");
  });

  it("reads Approved › Reopened › Approved, oldest first, and leaves out the move into In review", () => {
    const lines = buildActivity(
      [
        event({ id: "m", kind: "moved_to_review", versionNumber: null, scope: null, createdAt: "2026-10-09T09:00:00.000Z" }),
        event({ id: "s1", scope: "panels" }),
        event({ id: "a1", kind: "approved", actorKind: "client", actorName: "Priya", scope: null, createdAt: "2026-10-10T12:00:00.000Z" }),
        event({ id: "r", kind: "reopened", versionNumber: null, scope: null, createdAt: "2026-10-12T09:00:00.000Z" }),
        event({ id: "s2", versionNumber: 2, scope: "panels", createdAt: "2026-10-12T10:00:00.000Z" }),
        event({ id: "a2", kind: "approved", versionNumber: 2, actorKind: "client", actorName: "Priya", scope: null, createdAt: "2026-10-12T11:00:00.000Z" }),
        event({ id: "b", kind: "moved_back", versionNumber: null, scope: null, createdAt: "2026-10-10T11:00:00.000Z" }),
      ],
      [],
    );
    expect(lines.map((l) => l.text)).toEqual([
      "Shared, version 1 · the script, avatars and panels",
      "Moved back to Visualise by Arun",
      "Approved by Priya",
      "Reopened by Arun",
      "Shared again, version 2 · the script, avatars and panels",
      "Approved by Priya",
    ]);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run src/lib/script-review/__tests__/threads.test.ts src/lib/script-review/__tests__/activity.test.ts`
Expected: FAIL with "Failed to resolve import ../threads" and "../activity".

- [ ] **Step 5: Write the threads module**

```ts
// src/lib/script-review/threads.ts
import type { ScriptDoc } from "@/lib/scripts/schema";
import { partKey, partShotId } from "./parts";
import type { RemovedShot, ScriptComment, Thread } from "./types";

export function buildThreads(comments: ScriptComment[]): Thread[] {
  const byTime = [...comments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return byTime
    .filter((c) => c.parentId === null)
    .map((root) => ({
      root,
      replies: byTime.filter((c) => c.parentId === root.id),
      resolved: root.resolvedAt !== null,
    }));
}

export type PlacedThreads = {
  byPart: Map<string, Thread[]>;
  removed: { shotId: string; label: string; text: string; threads: Thread[] }[];
};

/** Spec 4 §5–§6: threads beside the part they are about, in the script on screen. A thread whose
 *  shot (or that shot's panel) is not in that script any more sits under "On a removed shot" with
 *  the shot's last text. A split's first half keeps the id, so its threads stay where they were. */
export function placeThreads(threads: Thread[], doc: ScriptDoc, removed: Record<string, RemovedShot>): PlacedThreads {
  const shotIds = new Set(doc.shots.map((s) => s.id));
  const byPart = new Map<string, Thread[]>();
  const gone = new Map<string, Thread[]>();
  for (const thread of threads) {
    const shotId = partShotId(thread.root.part);
    if (shotId && !shotIds.has(shotId)) {
      gone.set(shotId, [...(gone.get(shotId) ?? []), thread]);
      continue;
    }
    const key = partKey(thread.root.part);
    byPart.set(key, [...(byPart.get(key) ?? []), thread]);
  }
  return {
    byPart,
    removed: [...gone].map(([shotId, ts]) => ({
      shotId,
      label: removed[shotId]?.label ?? "A removed shot",
      text: removed[shotId]?.text ?? "",
      threads: ts,
    })),
  };
}

/** Every shot the given script lacks, with its number and visual in the last shared version that had
 *  it. `versions` are oldest first. */
export function removedShots(versions: { doc: ScriptDoc }[], doc: ScriptDoc): Record<string, RemovedShot> {
  const last: Record<string, RemovedShot> = {};
  for (const v of versions) {
    v.doc.shots.forEach((s, i) => {
      last[s.id] = { label: `S${i + 1}`, text: s.visual };
    });
  }
  const present = new Set(doc.shots.map((s) => s.id));
  return Object.fromEntries(Object.entries(last).filter(([id]) => !present.has(id)));
}

export function openThreads(threads: Thread[]): Thread[] {
  return threads.filter((t) => !t.resolved);
}

const QUOTE_MAX = 80;
const shorten = (s: string) => (s.length <= QUOTE_MAX ? s : `${s.slice(0, QUOTE_MAX - 1).trimEnd()}…`);
const quote = (t: Thread) => `“${shorten(t.root.body)}”`;

/** Spec 4 §8: "You have 1 open comment: 'Can she wear blue?' Approve anyway?" Null when none are open. */
export function approveConfirmText(open: Thread[]): string | null {
  if (open.length === 0) return null;
  if (open.length === 1) return `You have 1 open comment: ${quote(open[0])}. Approve anyway?`;
  const shown = open.slice(0, 3).map(quote).join(", ");
  const more = open.length > 3 ? ` and ${open.length - 3} more` : "";
  return `You have ${open.length} open comments: ${shown}${more}. Approve anyway?`;
}
```

- [ ] **Step 6: Write the activity module**

```ts
// src/lib/script-review/activity.ts
import { SHARE_SCOPE_PHRASE } from "./constants";
import type { ActivityLine, ScriptComment, ScriptReviewEvent } from "./types";
import { describeChanges, joinWithAnd } from "./version";

const line = (e: ScriptReviewEvent, text: string): ActivityLine => ({ id: e.id, at: e.createdAt, text, links: [] });

/** Spec 4 §7: the review's history, oldest first. Every line comes from rows that are never edited
 *  or removed (events are append-only, comments are never deleted), so history never changes after
 *  the fact. The move into In review is recorded but not shown: §7's list does not include it. */
export function buildActivity(events: ScriptReviewEvent[], comments: ScriptComment[]): ActivityLine[] {
  const lines: ActivityLine[] = [];
  for (const e of events) {
    switch (e.kind) {
      case "moved_to_review":
        break;
      case "moved_back":
        lines.push(line(e, `Moved back to Visualise by ${e.actorName}`));
        break;
      case "reopened":
        lines.push(line(e, `Reopened by ${e.actorName}`));
        break;
      case "approved":
        lines.push(line(e, `Approved by ${e.actorName}`));
        break;
      case "shared": {
        const changed = describeChanges(e.changes);
        if (changed) {
          lines.push({
            id: `${e.id}:changes`,
            at: e.createdAt,
            text: changed,
            links: e.changes.filter((c) => c.change !== "removed").map((c) => ({ label: c.label, part: c.part })),
          });
        }
        const scope = e.scope ? ` · ${SHARE_SCOPE_PHRASE[e.scope]}` : "";
        lines.push(line(e, `${e.versionNumber === 1 ? "Shared" : "Shared again"}, version ${e.versionNumber}${scope}`));
        break;
      }
    }
  }

  // "n comments, by whom": the client's comments on each version, one line, at the last of them.
  const byVersion = new Map<number, ScriptComment[]>();
  for (const c of comments) {
    if (c.authorKind !== "client" || c.parentId !== null) continue;
    byVersion.set(c.versionNumber, [...(byVersion.get(c.versionNumber) ?? []), c]);
  }
  for (const [version, cs] of byVersion) {
    const sorted = [...cs].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const names = [...new Set(sorted.map((c) => c.authorName))];
    lines.push({
      id: `comments:${version}`,
      at: sorted[sorted.length - 1].createdAt,
      text: `${sorted.length} ${sorted.length === 1 ? "comment" : "comments"}, by ${joinWithAnd(names)}`,
      links: [],
    });
  }
  // Stable sort: a share's "what changed" line stays just before its "Shared again" line.
  return lines.sort((a, b) => a.at.localeCompare(b.at));
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/lib/script-review`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/script-review
git commit -m "feat(script-review): threads beside parts, removed shots, and the activity history"
```

---

### Task 4: Request bodies

**Files:**
- Modify: `src/lib/client-review/validate.ts` (export two private helpers)
- Create: `src/lib/script-review/validate.ts`
- Test: `src/lib/script-review/__tests__/validate.test.ts`

**Interfaces:**
- Consumes: `REVIEWER_NAME_MAX`, `COMMENT_BODY_MAX` (D309 constants); `parsePart` (Task 1); `isShareScope`, `isTeamStageMove` (Task 1).
- Produces: `record`, `text` now exported from `@/lib/client-review/validate`; `parseNewScriptComment`, `parseReply`, `parseResolve`, `parseApproval`, `parseShare`, `parseStageMove`, each `(input: unknown) => Parsed<…>`. Client edits use D309's `parseCommentEdit` unchanged (`{ editorName, body }`).

- [ ] **Step 1: Export D309's two helpers**

In `src/lib/client-review/validate.ts`, change `function text(` to `export function text(` and `function record(` to `export function record(`. Nothing else changes. (Second caller, so they are shared rather than copied.)

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/script-review/__tests__/validate.test.ts
import { describe, it, expect } from "vitest";
import {
  parseApproval, parseNewScriptComment, parseReply, parseResolve, parseShare, parseStageMove,
} from "../validate";

describe("parseNewScriptComment", () => {
  const good = { authorName: " Priya ", body: " Can she wear blue? ", part: { kind: "shot", shotId: "s04" }, versionNumber: 2 };

  it("trims the name and the text and keeps the part and version", () => {
    expect(parseNewScriptComment(good)).toEqual({
      ok: true,
      value: { authorName: "Priya", body: "Can she wear blue?", part: { kind: "shot", shotId: "s04" }, versionNumber: 2 },
    });
  });

  it("refuses a blank comment, a missing part, and a missing or odd version", () => {
    expect(parseNewScriptComment({ ...good, body: "   " }).ok).toBe(false);
    expect(parseNewScriptComment({ ...good, part: { kind: "pin" } })).toEqual({ ok: false, error: "Say which part of the reel the comment is about." });
    expect(parseNewScriptComment({ ...good, versionNumber: undefined }).ok).toBe(false);
    expect(parseNewScriptComment({ ...good, versionNumber: 1.5 }).ok).toBe(false);
    expect(parseNewScriptComment({ ...good, versionNumber: 0 }).ok).toBe(false);
    expect(parseNewScriptComment({ ...good, authorName: "x".repeat(61) }).ok).toBe(false);
    expect(parseNewScriptComment(null).ok).toBe(false);
  });
});

describe("team bodies", () => {
  it("parseReply needs text", () => {
    expect(parseReply({ body: " Yes, blue works " })).toEqual({ ok: true, value: { body: "Yes, blue works" } });
    expect(parseReply({ body: "" }).ok).toBe(false);
  });

  it("parseResolve needs a boolean", () => {
    expect(parseResolve({ resolved: true })).toEqual({ ok: true, value: { resolved: true } });
    expect(parseResolve({ resolved: "yes" }).ok).toBe(false);
  });

  it("parseShare knows the three scopes", () => {
    expect(parseShare({ scope: "avatars" })).toEqual({ ok: true, value: { scope: "avatars" } });
    expect(parseShare({ scope: "everything" })).toEqual({ ok: false, error: "Choose what the share includes." });
  });

  it("parseStageMove knows the three team moves, never approve", () => {
    expect(parseStageMove({ move: "to_review" })).toEqual({ ok: true, value: { move: "to_review" } });
    expect(parseStageMove({ move: "approve" }).ok).toBe(false);
  });
});

describe("parseApproval", () => {
  it("needs the typed name and the version on screen", () => {
    expect(parseApproval({ approverName: "Priya", versionNumber: 3 })).toEqual({ ok: true, value: { approverName: "Priya", versionNumber: 3 } });
    expect(parseApproval({ approverName: "", versionNumber: 3 }).ok).toBe(false);
    expect(parseApproval({ approverName: "Priya" }).ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/script-review/__tests__/validate.test.ts`
Expected: FAIL with "Failed to resolve import ../validate".

- [ ] **Step 4: Write the implementation**

```ts
// src/lib/script-review/validate.ts
import { COMMENT_BODY_MAX, REVIEWER_NAME_MAX } from "@/lib/client-review/constants";
import { record, text, type Parsed } from "@/lib/client-review/validate";
import { isShareScope, isTeamStageMove, type ShareScope, type TeamStageMove } from "./constants";
import { parsePart } from "./parts";
import type { Part } from "./types";

const INVALID = { ok: false, error: "Invalid request body." } as const;
const isVersionNumber = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 100_000;

/** The client's new comment: their typed name, the text, the part, and the version on their screen. */
export function parseNewScriptComment(
  input: unknown,
): Parsed<{ authorName: string; body: string; part: Part; versionNumber: number }> {
  const o = record(input);
  if (!o) return INVALID;
  const name = text(o.authorName, "Name", REVIEWER_NAME_MAX);
  if (!name.ok) return name;
  const body = text(o.body, "Comment", COMMENT_BODY_MAX);
  if (!body.ok) return body;
  const part = parsePart(o.part);
  if (!part) return { ok: false, error: "Say which part of the reel the comment is about." };
  const versionNumber = o.versionNumber;
  if (!isVersionNumber(versionNumber)) return { ok: false, error: "A version is required." };
  return { ok: true, value: { authorName: name.value, body: body.value, part, versionNumber } };
}

export function parseReply(input: unknown): Parsed<{ body: string }> {
  const o = record(input);
  if (!o) return INVALID;
  const body = text(o.body, "Reply", COMMENT_BODY_MAX);
  return body.ok ? { ok: true, value: { body: body.value } } : body;
}

export function parseResolve(input: unknown): Parsed<{ resolved: boolean }> {
  const o = record(input);
  if (!o || typeof o.resolved !== "boolean") return INVALID;
  return { ok: true, value: { resolved: o.resolved } };
}

export function parseApproval(input: unknown): Parsed<{ approverName: string; versionNumber: number }> {
  const o = record(input);
  if (!o) return INVALID;
  const name = text(o.approverName, "Name", REVIEWER_NAME_MAX);
  if (!name.ok) return name;
  const versionNumber = o.versionNumber;
  if (!isVersionNumber(versionNumber)) return { ok: false, error: "A version is required." };
  return { ok: true, value: { approverName: name.value, versionNumber } };
}

export function parseShare(input: unknown): Parsed<{ scope: ShareScope }> {
  const scope = record(input)?.scope;
  return isShareScope(scope) ? { ok: true, value: { scope } } : { ok: false, error: "Choose what the share includes." };
}

export function parseStageMove(input: unknown): Parsed<{ move: TeamStageMove }> {
  const move = record(input)?.move;
  return isTeamStageMove(move) ? { ok: true, value: { move } } : { ok: false, error: "Unknown stage move." };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/script-review/__tests__/validate.test.ts src/lib/client-review`
Expected: PASS (D309's own validate tests still pass).

- [ ] **Step 6: Commit**

```bash
git add src/lib/client-review/validate.ts src/lib/script-review/validate.ts src/lib/script-review/__tests__/validate.test.ts
git commit -m "feat(script-review): request body parsing, sharing D309's text helpers"
```

---
### Task 5: The tables, the locked writes, and the data layer

**Files:**
- Create: `supabase/migrations/0054_script_reviews.sql`
- Create: `src/lib/script-review/wire.ts`
- Create: `src/lib/db/script-reviews.ts`
- Test: `src/lib/script-review/__tests__/wire.test.ts`

**Interfaces:**
- Consumes: `scriptDocSchema`, `ScriptDoc` (spec 1); `isScriptStage`, `ScriptStage` (spec 1); `isShareScope`, `isScriptReviewEventKind` (Task 1); `columnsToPart`, `parsePart`, `partToColumns` (Task 1); types from Tasks 1 and 3; `ShareCodeTakenError` from `@/lib/db/client-reviews`.
- Produces (wire): `ScriptReviewRow`, `ScriptVersionRow`, `ScriptCommentRow`, `ScriptEventRow`, `ScriptTokenRow`, `ScriptReviewByToken`, `ScriptVersion` (= `VersionContent & { id; number; sharedAt }`), `rowToVersion`, `rowToComment`, `rowToEvent`, `tokenRowToReview`.
- Produces (db): `ScriptReviewExistsError`; `getScriptReviewForScript(scriptId)`, `getScriptReviewByToken(token)`, `insertScriptReview({ scriptId, clientId, shareToken, createdBy })`, `listVersions(reviewId)`, `getLatestVersion(reviewId)`, `ShareResult`, `shareVersion({ reviewId, expectedLatest, scope, doc, visuals, changes, sharedBy, actorName })`, `ApproveStatus` (`"ok" | "already" | "stale" | "partial" | "not_in_review" | "not_found"`), `approveVersion({ reviewId, versionNumber, actorName })`, `moveScriptStage({ scriptId, clientId, from, to, event, actorName }): Promise<boolean>`, `listScriptComments(reviewId)`, `countScriptComments(reviewId)`, `getCommentForReply(reviewId, commentId)`, `insertScriptComment({ reviewId, versionId, part, parentId, authorKind, authorName, authorUserId, body })`, `updateClientComment({ reviewId, commentId, body, editedByName })`, `setThreadResolved({ reviewId, commentId, resolved, byName })`, `listScriptEvents(scriptId)`, `hasApproval(scriptId, versionNumber)`.

- [ ] **Step 1: Confirm the migration number**

Run: `ls supabase/migrations/ | tail -3` and `git ls-tree --name-only origin/staging supabase/migrations/ | tail -3`.
Expected: the newest is `0051_client_scripts.sql`; `0052` and `0053` are booked by specs 2 and 3. If `0054` already exists anywhere, stop and ask; do not pick another number on your own.

- [ ] **Step 2: Write the migration**

```sql
-- supabase/migrations/0054_script_reviews.sql
-- Script copilot spec 4 (D347–D356): client review of a script. One link per script, a frozen
-- version per share, comments per part, and an append-only activity log. Kept apart from the
-- script document: nothing here alters client_scripts.doc. The only writes to client_scripts are
-- stage / approved_at / updated_at, inside the three functions below.
-- Server code reads and writes with the service-role client. The public page goes through
-- /api/r/s/* (withScriptShareToken), as D309. RLS on, no policies (default-deny).

create table script_reviews (
  id          uuid primary key default gen_random_uuid(),
  script_id   uuid not null unique references client_scripts(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  -- D311's short code: the first 4 hex characters of the script id, longer on a clash.
  share_token text not null unique,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table script_review_versions (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references script_reviews(id) on delete cascade,
  number      int  not null check (number >= 1),
  scope       text not null check (scope in ('script', 'avatars', 'panels')),
  -- The script document exactly as shared (scriptDocSchema), and what the share froze besides it:
  -- { avatars: { <castId>: AvatarSnapshot }, panels: { <shotId>: { takeId, url } } }. Image URLs
  -- are copied, not files: avatar images and panel takes are never deleted (spec 3 §6.6).
  doc         jsonb not null,
  visuals     jsonb not null,
  shared_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (review_id, number)
);

create table script_review_comments (
  id               uuid primary key default gen_random_uuid(),
  review_id        uuid not null references script_reviews(id) on delete cascade,
  -- The version the comment was made on (spec 4 §5). A reply carries its thread's version.
  version_id       uuid not null references script_review_versions(id) on delete cascade,
  part_kind        text not null check (part_kind in ('context', 'shot', 'panel', 'cast', 'view')),
  part_id          text check (part_id is null or char_length(part_id) between 1 and 64),
  part_view        text check (part_view is null or part_view in ('front', 'left', 'right', 'back')),
  parent_id        uuid references script_review_comments(id) on delete cascade,
  author_kind      text not null check (author_kind in ('client', 'team')),
  author_name      text not null check (char_length(author_name) between 1 and 60),
  author_user_id   uuid references auth.users(id) on delete set null,
  body             text not null check (char_length(body) between 1 and 2000),
  edited_by_name   text check (edited_by_name is null or char_length(edited_by_name) between 1 and 60),
  resolved_at      timestamptz,
  resolved_by_name text check (resolved_by_name is null or char_length(resolved_by_name) between 1 and 60),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((part_kind = 'context') = (part_id is null)),
  check ((part_kind = 'view') = (part_view is not null))
);

create index script_review_comments_review_created on script_review_comments (review_id, created_at);

-- Append-only: no code path updates or deletes a row (spec 4 §7, "nothing in the activity is edited
-- or removed later"). Keyed by script, so a stage move before the first share is recorded too.
create table script_review_events (
  id             uuid primary key default gen_random_uuid(),
  script_id      uuid not null references client_scripts(id) on delete cascade,
  kind           text not null check (kind in ('moved_to_review', 'moved_back', 'shared', 'approved', 'reopened')),
  version_number int,
  actor_kind     text not null check (actor_kind in ('client', 'team')),
  actor_name     text not null check (char_length(actor_name) between 1 and 80),
  detail         jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index script_review_events_script_created on script_review_events (script_id, created_at);

-- ── The three locked writes ─────────────────────────────────────────────────────────────────
-- Each is one transaction that locks the script's client_scripts row first, so a share, an
-- approval and a stage move on one script never interleave (the reserve_credits pattern, 0020).
-- SECURITY INVOKER (the default): an anon caller hits default-deny RLS and changes nothing.

-- A team stage move (spec 4 §3, §8): compare-and-set on the stage, plus its activity line.
-- False when the script is not at p_from (someone else moved it) or is archived.
create or replace function script_review_move(
  p_script_id uuid,
  p_client_id uuid,
  p_from text,
  p_to text,
  p_kind text,
  p_actor_name text
) returns boolean
language plpgsql
as $$
begin
  update client_scripts
     set stage = p_to,
         approved_at = case when p_from = 'approved' then null else approved_at end,
         updated_at = now()
   where id = p_script_id
     and client_id = p_client_id
     and stage = p_from
     and archived_at is null;
  if not found then
    return false;
  end if;
  insert into script_review_events (script_id, kind, actor_kind, actor_name)
  values (p_script_id, p_kind, 'team', p_actor_name);
  return true;
end;
$$;

-- One share (spec 4 §3 step 3): the next version number, the frozen version, and its activity
-- line. 'stale' when another share landed after the caller read the latest version (its diff
-- would be against the wrong version); 'not_in_review' when the script is not In review.
create or replace function script_review_share(
  p_review_id uuid,
  p_expected_latest int,
  p_scope text,
  p_doc jsonb,
  p_visuals jsonb,
  p_changes jsonb,
  p_shared_by uuid,
  p_actor_name text
) returns jsonb
language plpgsql
as $$
declare
  v_script_id uuid;
  v_stage text;
  v_latest int;
  v_row script_review_versions;
begin
  select script_id into v_script_id from script_reviews where id = p_review_id;
  if v_script_id is null then
    return jsonb_build_object('status', 'not_in_review');
  end if;
  select stage into v_stage
    from client_scripts
   where id = v_script_id and archived_at is null
     for update;
  if v_stage is distinct from 'in_review' then
    return jsonb_build_object('status', 'not_in_review');
  end if;
  select coalesce(max(number), 0) into v_latest from script_review_versions where review_id = p_review_id;
  if v_latest <> p_expected_latest then
    return jsonb_build_object('status', 'stale');
  end if;
  insert into script_review_versions (review_id, number, scope, doc, visuals, shared_by)
  values (p_review_id, v_latest + 1, p_scope, p_doc, p_visuals, p_shared_by)
  returning * into v_row;
  insert into script_review_events (script_id, kind, version_number, actor_kind, actor_name, detail)
  values (v_script_id, 'shared', v_row.number, 'team', p_actor_name,
          jsonb_build_object('scope', p_scope, 'changes', coalesce(p_changes, '[]'::jsonb)));
  return jsonb_build_object('status', 'ok', 'version', to_jsonb(v_row));
end;
$$;

-- The client's approval (spec 4 §8) of the version on their screen. Checked in this order:
-- 'stale' (a newer version exists), 'already' (a second tap: no second line), 'not_in_review',
-- 'partial' (not a full share). 'ok' moves the script to Approved and records who.
create or replace function script_review_approve(
  p_review_id uuid,
  p_version_number int,
  p_actor_name text
) returns text
language plpgsql
as $$
declare
  v_script_id uuid;
  v_stage text;
  v_latest int;
  v_scope text;
begin
  select script_id into v_script_id from script_reviews where id = p_review_id;
  if v_script_id is null then
    return 'not_found';
  end if;
  select stage into v_stage
    from client_scripts
   where id = v_script_id and archived_at is null
     for update;
  if v_stage is null then
    return 'not_found';
  end if;
  select number, scope into v_latest, v_scope
    from script_review_versions
   where review_id = p_review_id
   order by number desc
   limit 1;
  if v_latest is null or v_latest <> p_version_number then
    return 'stale';
  end if;
  if v_stage = 'approved' then
    return 'already';
  end if;
  if v_stage <> 'in_review' then
    return 'not_in_review';
  end if;
  if v_scope <> 'panels' then
    return 'partial';
  end if;
  update client_scripts
     set stage = 'approved', approved_at = now(), updated_at = now()
   where id = v_script_id;
  insert into script_review_events (script_id, kind, version_number, actor_kind, actor_name)
  values (v_script_id, 'approved', p_version_number, 'client', p_actor_name);
  return 'ok';
end;
$$;

alter table script_reviews enable row level security;
alter table script_review_versions enable row level security;
alter table script_review_comments enable row level security;
alter table script_review_events enable row level security;
```

- [ ] **Step 3: Write the failing wire test**

```ts
// src/lib/script-review/__tests__/wire.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  rowToComment, rowToEvent, rowToVersion, tokenRowToReview,
  type ScriptCommentRow, type ScriptEventRow, type ScriptTokenRow, type ScriptVersionRow,
} from "../wire";
import { avatarSnapshot, reelDoc } from "./fixtures";

const versionRow = (over: Partial<ScriptVersionRow> = {}): ScriptVersionRow => ({
  id: "v1", review_id: "r1", number: 1, scope: "avatars", doc: reelDoc(),
  visuals: { avatars: { meenakshi: avatarSnapshot() }, panels: {} }, created_at: "2026-10-10T09:00:00.000Z",
  ...over,
});

const commentRow = (over: Partial<ScriptCommentRow> = {}): ScriptCommentRow => ({
  id: "c1", review_id: "r1", part_kind: "view", part_id: "meenakshi", part_view: "left", parent_id: null,
  author_kind: "client", author_name: "Priya", body: "Softer light", edited_by_name: null,
  resolved_at: null, resolved_by_name: null, created_at: "t", updated_at: "t", version: [{ number: 2 }],
  ...over,
});

describe("rowToVersion", () => {
  it("maps a valid row", () => {
    const v = rowToVersion(versionRow());
    expect(v).toMatchObject({ id: "v1", number: 1, scope: "avatars", sharedAt: "2026-10-10T09:00:00.000Z" });
    expect(v?.doc.shots).toHaveLength(14);
    expect(v?.visuals.avatars.meenakshi.views.front).toBe("https://cdn/front.png");
  });

  it("skips a row with a broken doc, visuals or scope, with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(rowToVersion(versionRow({ doc: { header: {} } }))).toBeNull();
    expect(rowToVersion(versionRow({ visuals: { avatars: [] } }))).toBeNull();
    expect(rowToVersion(versionRow({ scope: "full" }))).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });
});

describe("rowToComment", () => {
  it("maps the part columns and reads the version number from either embed shape", () => {
    expect(rowToComment(commentRow())).toMatchObject({
      id: "c1", versionNumber: 2, part: { kind: "view", castId: "meenakshi", view: "left" }, authorKind: "client",
    });
    expect(rowToComment(commentRow({ version: { number: 3 } }))?.versionNumber).toBe(3);
  });

  it("drops a row whose part or author kind is not one the app knows", () => {
    expect(rowToComment(commentRow({ part_kind: "pin" }))).toBeNull();
    expect(rowToComment(commentRow({ author_kind: "robot" }))).toBeNull();
    expect(rowToComment(commentRow({ version: null }))).toBeNull();
  });
});

describe("rowToEvent", () => {
  const row = (over: Partial<ScriptEventRow> = {}): ScriptEventRow => ({
    id: "e1", script_id: "s1", kind: "shared", version_number: 2, actor_kind: "team", actor_name: "Arun",
    detail: {
      scope: "panels",
      changes: [
        { part: { kind: "shot", shotId: "s01" }, change: "revised", label: "S1" },
        { part: { kind: "pin" }, change: "revised", label: "x" },
      ],
    },
    created_at: "t",
    ...over,
  });

  it("reads scope and changes from detail, skipping a malformed change", () => {
    expect(rowToEvent(row())).toMatchObject({
      kind: "shared", versionNumber: 2, scope: "panels",
      changes: [{ part: { kind: "shot", shotId: "s01" }, change: "revised", label: "S1" }],
    });
  });

  it("reads an event with no detail", () => {
    expect(rowToEvent(row({ kind: "reopened", version_number: null, detail: {} }))).toMatchObject({ scope: null, changes: [] });
  });

  it("drops an unknown kind", () => {
    expect(rowToEvent(row({ kind: "deleted" }))).toBeNull();
  });
});

describe("tokenRowToReview", () => {
  const row = (over: Partial<ScriptTokenRow> = {}): ScriptTokenRow => ({
    id: "r1", script_id: "s1", client_id: "c1", share_token: "6f1c", created_by: null, created_at: "t",
    client_scripts: { stage: "in_review", archived_at: null },
    clients: [{ name: "Jackfruit365", organizations: { name: "Yuvabe Studios" } }],
    ...over,
  });

  it("carries the stage and the two names the page header shows", () => {
    expect(tokenRowToReview(row())).toMatchObject({ id: "r1", stage: "in_review", clientName: "Jackfruit365", orgName: "Yuvabe Studios" });
  });

  it("closes the link of an archived script (spec 4 §10)", () => {
    expect(tokenRowToReview(row({ client_scripts: { stage: "in_review", archived_at: "2026-10-12T00:00:00.000Z" } }))).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run src/lib/script-review/__tests__/wire.test.ts`
Expected: FAIL with "Failed to resolve import ../wire".

- [ ] **Step 5: Write the wire module**

```ts
// src/lib/script-review/wire.ts
// Database rows to app types. Pure: safe to import anywhere.
import { z } from "zod";
import { isScriptStage, type ScriptStage } from "@/lib/scripts/constants";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { isScriptReviewEventKind, isShareScope } from "./constants";
import { columnsToPart, parsePart } from "./parts";
import type { ChangedPart, ScriptComment, ScriptReviewEvent, VersionContent } from "./types";

type Embed<T> = T | T[] | null;
function one<T>(value: Embed<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export type ScriptReviewRow = {
  id: string;
  script_id: string;
  client_id: string;
  share_token: string;
  created_by: string | null;
  created_at: string;
};

export type ScriptVersionRow = {
  id: string;
  review_id: string;
  number: number;
  scope: string;
  doc: unknown;
  visuals: unknown;
  created_at: string;
};

export type ScriptCommentRow = {
  id: string;
  review_id: string;
  part_kind: string;
  part_id: string | null;
  part_view: string | null;
  parent_id: string | null;
  author_kind: string;
  author_name: string;
  body: string;
  edited_by_name: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
  created_at: string;
  updated_at: string;
  /** PostgREST embed `version:script_review_versions!inner(number)`: an object or a one-item array. */
  version: Embed<{ number: number }>;
};

export type ScriptEventRow = {
  id: string;
  script_id: string;
  kind: string;
  version_number: number | null;
  actor_kind: string;
  actor_name: string;
  detail: unknown;
  created_at: string;
};

export type ScriptTokenRow = ScriptReviewRow & {
  client_scripts: Embed<{ stage: string; archived_at: string | null }>;
  clients: Embed<{ name: string; organizations: Embed<{ name: string }> }>;
};

/** The review behind a share link, with what the page header needs: the studio and the client. */
export type ScriptReviewByToken = ScriptReviewRow & { stage: ScriptStage; clientName: string; orgName: string };

export type ScriptVersion = VersionContent & { id: string; number: number; sharedAt: string };

const viewUrl = z.string().nullable();
const versionVisualsSchema = z.object({
  avatars: z.record(
    z.string(),
    z.object({
      avatarId: z.string(),
      name: z.string(),
      views: z.object({ front: viewUrl, left: viewUrl, right: viewUrl, back: viewUrl }),
      voice: z.object({ name: z.string().nullable(), sampleUrl: z.string().nullable() }).nullable(),
    }),
  ),
  panels: z.record(z.string(), z.object({ takeId: z.string(), url: z.string() })),
});

export function rowToVersion(row: ScriptVersionRow): ScriptVersion | null {
  const doc = scriptDocSchema.safeParse(row.doc);
  const visuals = versionVisualsSchema.safeParse(row.visuals);
  if (!doc.success || !visuals.success || !isShareScope(row.scope)) {
    console.warn(`[script-review] skipping version ${row.id}: doc ${doc.success}, visuals ${visuals.success}, scope "${row.scope}"`);
    return null;
  }
  return { id: row.id, number: row.number, scope: row.scope, doc: doc.data, visuals: visuals.data, sharedAt: row.created_at };
}

export function rowToComment(row: ScriptCommentRow): ScriptComment | null {
  const part = columnsToPart(row.part_kind, row.part_id, row.part_view);
  const version = one(row.version);
  const authorKind = row.author_kind;
  if (!part || !version || (authorKind !== "client" && authorKind !== "team")) return null;
  return {
    id: row.id,
    versionNumber: version.number,
    part,
    parentId: row.parent_id,
    authorKind,
    authorName: row.author_name,
    body: row.body,
    editedByName: row.edited_by_name,
    resolvedAt: row.resolved_at,
    resolvedByName: row.resolved_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseChanges(value: unknown): ChangedPart[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ChangedPart[] => {
    const o = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    const part = o ? parsePart(o.part) : null;
    const change = o?.change;
    const label = o?.label;
    if (!part || typeof label !== "string" || (change !== "revised" && change !== "added" && change !== "removed")) return [];
    return [{ part, change, label }];
  });
}

export function rowToEvent(row: ScriptEventRow): ScriptReviewEvent | null {
  const actorKind = row.actor_kind;
  if (!isScriptReviewEventKind(row.kind) || (actorKind !== "client" && actorKind !== "team")) return null;
  const detail = row.detail && typeof row.detail === "object" ? (row.detail as Record<string, unknown>) : {};
  return {
    id: row.id,
    kind: row.kind,
    versionNumber: row.version_number,
    actorKind,
    actorName: row.actor_name,
    scope: isShareScope(detail.scope) ? detail.scope : null,
    changes: parseChanges(detail.changes),
    createdAt: row.created_at,
  };
}

/** Null for an archived script: spec 4 §10, deleting the script kills the link. */
export function tokenRowToReview(row: ScriptTokenRow): ScriptReviewByToken | null {
  const { client_scripts, clients, ...review } = row;
  const script = one(client_scripts);
  const client = one(clients);
  if (!script || script.archived_at || !isScriptStage(script.stage) || !client) return null;
  return { ...review, stage: script.stage, clientName: client.name, orgName: one(client.organizations)?.name ?? "" };
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/lib/script-review/__tests__/wire.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the data layer**

```ts
// src/lib/db/script-reviews.ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { ShareCodeTakenError } from "@/lib/db/client-reviews";
import type { ScriptStage } from "@/lib/scripts/constants";
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { ScriptReviewEventKind, ShareScope } from "@/lib/script-review/constants";
import { columnsToPart, partToColumns } from "@/lib/script-review/parts";
import type {
  ChangedPart, CommentAuthorKind, Part, ScriptComment, ScriptReviewEvent, VersionVisuals,
} from "@/lib/script-review/types";
import {
  rowToComment, rowToEvent, rowToVersion, tokenRowToReview,
  type ScriptCommentRow, type ScriptEventRow, type ScriptReviewByToken, type ScriptReviewRow,
  type ScriptTokenRow, type ScriptVersion, type ScriptVersionRow,
} from "@/lib/script-review/wire";

// Script copilot spec 4 (D350). Team routes reach these through a script they already loaded with
// getScript(clientId, scriptId) — that is the client check; the public routes start from the share
// token. Every comment write also filters on review_id, so one link never touches another's rows.

const REVIEW_COLUMNS = "id, script_id, client_id, share_token, created_by, created_at";
const VERSION_COLUMNS = "id, review_id, number, scope, doc, visuals, created_at";
const COMMENT_COLUMNS =
  "id, review_id, part_kind, part_id, part_view, parent_id, author_kind, author_name, body, edited_by_name, " +
  "resolved_at, resolved_by_name, created_at, updated_at, version:script_review_versions!inner(number)";
const EVENT_COLUMNS = "id, script_id, kind, version_number, actor_kind, actor_name, detail, created_at";

const nonNull = <T>(v: T | null): v is T => v !== null;

export class ScriptReviewExistsError extends Error {
  constructor() {
    super("This script already has a review link.");
  }
}

export async function getScriptReviewForScript(scriptId: string): Promise<ScriptReviewRow | null> {
  const { data, error } = await createServerSupabase()
    .from("script_reviews")
    .select(REVIEW_COLUMNS)
    .eq("script_id", scriptId)
    .maybeSingle();
  if (error) throw error;
  return (data as ScriptReviewRow | null) ?? null;
}

export async function getScriptReviewByToken(token: string): Promise<ScriptReviewByToken | null> {
  const { data, error } = await createServerSupabase()
    .from("script_reviews")
    .select(`${REVIEW_COLUMNS}, client_scripts!inner(stage, archived_at), clients!inner(name, organizations!inner(name))`)
    .eq("share_token", token)
    .maybeSingle();
  if (error) throw error;
  return data ? tokenRowToReview(data as unknown as ScriptTokenRow) : null;
}

/** Throws ShareCodeTakenError on a code clash (the caller retries one character longer, D311) and
 *  ScriptReviewExistsError when another request made this script's review first. */
export async function insertScriptReview(input: {
  scriptId: string;
  clientId: string;
  shareToken: string;
  createdBy: string;
}): Promise<ScriptReviewRow> {
  const { data, error } = await createServerSupabase()
    .from("script_reviews")
    .insert({ script_id: input.scriptId, client_id: input.clientId, share_token: input.shareToken, created_by: input.createdBy })
    .select(REVIEW_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") {
      const which = `${error.message ?? ""} ${error.details ?? ""}`;
      if (which.includes("share_token")) throw new ShareCodeTakenError();
      throw new ScriptReviewExistsError();
    }
    throw error;
  }
  return data as ScriptReviewRow;
}

export async function listVersions(reviewId: string): Promise<ScriptVersion[]> {
  const { data, error } = await createServerSupabase()
    .from("script_review_versions")
    .select(VERSION_COLUMNS)
    .eq("review_id", reviewId)
    .order("number", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ScriptVersionRow[]).map(rowToVersion).filter(nonNull);
}

export async function getLatestVersion(reviewId: string): Promise<ScriptVersion | null> {
  const { data, error } = await createServerSupabase()
    .from("script_review_versions")
    .select(VERSION_COLUMNS)
    .eq("review_id", reviewId)
    .order("number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToVersion(data as ScriptVersionRow) : null;
}

export type ShareResult = { status: "ok"; version: ScriptVersion } | { status: "stale" | "not_in_review" };

export async function shareVersion(input: {
  reviewId: string;
  expectedLatest: number;
  scope: ShareScope;
  doc: ScriptDoc;
  visuals: VersionVisuals;
  changes: ChangedPart[];
  sharedBy: string;
  actorName: string;
}): Promise<ShareResult> {
  const { data, error } = await createServerSupabase().rpc("script_review_share", {
    p_review_id: input.reviewId,
    p_expected_latest: input.expectedLatest,
    p_scope: input.scope,
    p_doc: input.doc,
    p_visuals: input.visuals,
    p_changes: input.changes,
    p_shared_by: input.sharedBy,
    p_actor_name: input.actorName,
  });
  if (error) throw error;
  const out = data as { status?: string; version?: ScriptVersionRow } | null;
  if (out?.status === "ok" && out.version) {
    const version = rowToVersion(out.version);
    if (!version) throw new Error("The shared version could not be read back.");
    return { status: "ok", version };
  }
  if (out?.status === "stale" || out?.status === "not_in_review") return { status: out.status };
  throw new Error(`Unexpected share result: ${JSON.stringify(out)}`);
}

export type ApproveStatus = "ok" | "already" | "stale" | "partial" | "not_in_review" | "not_found";
const APPROVE_STATUSES: readonly string[] = ["ok", "already", "stale", "partial", "not_in_review", "not_found"];

export async function approveVersion(input: { reviewId: string; versionNumber: number; actorName: string }): Promise<ApproveStatus> {
  const { data, error } = await createServerSupabase().rpc("script_review_approve", {
    p_review_id: input.reviewId,
    p_version_number: input.versionNumber,
    p_actor_name: input.actorName,
  });
  if (error) throw error;
  if (typeof data === "string" && APPROVE_STATUSES.includes(data)) return data as ApproveStatus;
  throw new Error(`Unexpected approval result: ${String(data)}`);
}

export async function moveScriptStage(input: {
  scriptId: string;
  clientId: string;
  from: ScriptStage;
  to: ScriptStage;
  event: ScriptReviewEventKind;
  actorName: string;
}): Promise<boolean> {
  const { data, error } = await createServerSupabase().rpc("script_review_move", {
    p_script_id: input.scriptId,
    p_client_id: input.clientId,
    p_from: input.from,
    p_to: input.to,
    p_kind: input.event,
    p_actor_name: input.actorName,
  });
  if (error) throw error;
  return data === true;
}

export async function listScriptComments(reviewId: string): Promise<ScriptComment[]> {
  const { data, error } = await createServerSupabase()
    .from("script_review_comments")
    .select(COMMENT_COLUMNS)
    .eq("review_id", reviewId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as ScriptCommentRow[]).map(rowToComment).filter(nonNull);
}

/** Head-only count, for MAX_COMMENTS_PER_REVIEW (D309's bound on one link's write volume). */
export async function countScriptComments(reviewId: string): Promise<number> {
  const { count, error } = await createServerSupabase()
    .from("script_review_comments")
    .select("id", { count: "exact", head: true })
    .eq("review_id", reviewId);
  if (error) throw error;
  return count ?? 0;
}

export async function getCommentForReply(
  reviewId: string,
  commentId: string,
): Promise<{ id: string; versionId: string; part: Part; parentId: string | null } | null> {
  const { data, error } = await createServerSupabase()
    .from("script_review_comments")
    .select("id, version_id, parent_id, part_kind, part_id, part_view")
    .eq("id", commentId)
    .eq("review_id", reviewId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as {
    id: string; version_id: string; parent_id: string | null; part_kind: string; part_id: string | null; part_view: string | null;
  };
  const part = columnsToPart(row.part_kind, row.part_id, row.part_view);
  return part ? { id: row.id, versionId: row.version_id, part, parentId: row.parent_id } : null;
}

export async function insertScriptComment(input: {
  reviewId: string;
  versionId: string;
  part: Part;
  parentId: string | null;
  authorKind: CommentAuthorKind;
  authorName: string;
  authorUserId: string | null;
  body: string;
}): Promise<ScriptComment> {
  const { data, error } = await createServerSupabase()
    .from("script_review_comments")
    .insert({
      review_id: input.reviewId,
      version_id: input.versionId,
      ...partToColumns(input.part),
      parent_id: input.parentId,
      author_kind: input.authorKind,
      author_name: input.authorName,
      author_user_id: input.authorUserId,
      body: input.body,
    })
    .select(COMMENT_COLUMNS)
    .single();
  if (error) throw error;
  const comment = rowToComment(data as unknown as ScriptCommentRow);
  if (!comment) throw new Error("The comment could not be read back.");
  return comment;
}

/** Filtering on the review AND author_kind = 'client' is the ownership check: a link edits only its
 *  own review's client comments, never a team reply. Only the text changes. */
export async function updateClientComment(input: {
  reviewId: string;
  commentId: string;
  body: string;
  editedByName: string;
}): Promise<ScriptComment | null> {
  const { data, error } = await createServerSupabase()
    .from("script_review_comments")
    .update({ body: input.body, edited_by_name: input.editedByName, updated_at: new Date().toISOString() })
    .eq("id", input.commentId)
    .eq("review_id", input.reviewId)
    .eq("author_kind", "client")
    .select(COMMENT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToComment(data as unknown as ScriptCommentRow) : null;
}

/** Only a thread's first comment carries the Resolved mark; a reply id matches nothing. */
export async function setThreadResolved(input: {
  reviewId: string;
  commentId: string;
  resolved: boolean;
  byName: string | null;
}): Promise<ScriptComment | null> {
  const { data, error } = await createServerSupabase()
    .from("script_review_comments")
    .update({
      resolved_at: input.resolved ? new Date().toISOString() : null,
      resolved_by_name: input.resolved ? input.byName : null,
    })
    .eq("id", input.commentId)
    .eq("review_id", input.reviewId)
    .is("parent_id", null)
    .select(COMMENT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToComment(data as unknown as ScriptCommentRow) : null;
}

export async function listScriptEvents(scriptId: string): Promise<ScriptReviewEvent[]> {
  const { data, error } = await createServerSupabase()
    .from("script_review_events")
    .select(EVENT_COLUMNS)
    .eq("script_id", scriptId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ScriptEventRow[]).map(rowToEvent).filter(nonNull);
}

export async function hasApproval(scriptId: string, versionNumber: number): Promise<boolean> {
  const { count, error } = await createServerSupabase()
    .from("script_review_events")
    .select("id", { count: "exact", head: true })
    .eq("script_id", scriptId)
    .eq("kind", "approved")
    .eq("version_number", versionNumber);
  if (error) throw error;
  return (count ?? 0) > 0;
}
```

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in the new files. (If `rpc` argument types complain, the project has no generated database types; `src/lib/db/credit-transactions.ts` calls `rpc` the same way, so match its shape.)

- [ ] **Step 9: Apply the migration to the staging database (the user does this)**

Ask the user to run `supabase/migrations/0054_script_reviews.sql` in the staging Supabase SQL editor, the way 0047 and 0051 were applied. Do not apply it yourself. Continue with Task 6 while waiting; Task 19 needs it. It depends only on `client_scripts` (0051), `clients`, `organizations` and `auth.users`, so it applies whether or not 0052/0053 from specs 2 and 3 are in.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0054_script_reviews.sql src/lib/script-review/wire.ts src/lib/script-review/__tests__/wire.test.ts src/lib/db/script-reviews.ts
git commit -m "feat(script-review): tables, locked share/approve/move functions and the data layer (migration 0054)"
```

---

### Task 6: What a share freezes, the link, and the review row

**Files:**
- Create: `src/lib/script-review/bridge.ts`
- Create: `src/lib/script-review/visuals.ts`
- Create: `src/lib/script-review/paths.ts`
- Create: `src/lib/script-review/ensure-review.ts`
- Modify: `src/lib/client-review/paths.ts` (export `linkSlug`, add a fallback word)
- Test: `src/lib/script-review/__tests__/visuals.test.ts`
- Test: `src/lib/script-review/__tests__/paths.test.ts`
- Test: `src/lib/script-review/__tests__/ensure-review.test.ts`

**Interfaces:**
- Consumes: `listAvatars(clientId): Promise<Avatar[]>` (this client's live avatars only) from `@/lib/db/avatars`; `Avatar` from `@/lib/avatars/schema`; `makeAvatar`, `makeImage` from `@/lib/avatars/__tests__/fixtures`; `Script` (spec 1); `scopeIncludes` (Task 1); `getScriptReviewForScript`, `insertScriptReview`, `ScriptReviewExistsError` (Task 5); `shareCodeFor`, `MAX_CODE_EXTRA`, `toCanonicalShareToken` (D311); `ShareCodeTakenError` (D309).
- Produces: **MP1** `getPickedPanels(clientId: string, scriptId: string): Promise<Record<string, PanelSnapshot>>`; **MP2** `avatarViewUrls(avatar: Avatar): Record<AvatarView, string | null>`; `toAvatarSnapshot(avatar: Avatar): AvatarSnapshot`; `collectVisuals(clientId: string, script: Script, scope: ShareScope): Promise<VersionVisuals>`; `scriptSharePathFor(code: string, title: string): string`; `ensureScriptReview({ scriptId, clientId, createdBy }): Promise<ScriptReviewRow>`; `linkSlug(title: string, fallback?: string): string` exported from `@/lib/client-review/paths`.

- [ ] **Step 1: Write the spec 3 bridge (the merge point)**

```ts
// src/lib/script-review/bridge.ts
import "server-only";
import type { Avatar } from "@/lib/avatars/schema";
import type { AvatarView } from "./constants";
import type { PanelSnapshot } from "./types";

// The two things spec 4 needs from spec 3 (Visualise), which is built in parallel. Both are stubs
// until spec 3 merges; replace each body with spec 3's own reader then (plan MP1, MP2). Nothing
// else in spec 4 reads panels or avatar views, so the merge touches only this file.

/** MP1 — "panels for a script: picked take URL per shot id". Spec 3 keeps panels and takes keyed by
 *  script and shot (its §9); the client only ever sees the picked take (its §6.6). Until spec 3
 *  lands there are none, and a full share carries none (spec 4 §0: panel comments attach to
 *  whatever panels exist). */
export async function getPickedPanels(_clientId: string, _scriptId: string): Promise<Record<string, PanelSnapshot>> {
  return {};
}

/** MP2 — "four views for an avatar". Spec 3 makes every sheet Front, Left, Right, Back (its §5.4).
 *  Today an avatar has a front image and one combined sheet, so only Front is a view of its own. */
export function avatarViewUrls(avatar: Avatar): Record<AvatarView, string | null> {
  return { front: avatar.front?.url ?? null, left: null, right: null, back: null };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/script-review/__tests__/visuals.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeAvatar, makeImage } from "@/lib/avatars/__tests__/fixtures";
import type { Script } from "@/lib/scripts/schema";
import { AVATAR_ID, reelDoc } from "./fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/avatars", () => ({ listAvatars: vi.fn() }));
vi.mock("@/lib/script-review/bridge", async (orig) => ({
  ...(await orig<typeof import("../bridge")>()),
  getPickedPanels: vi.fn(),
}));

import { listAvatars } from "@/lib/db/avatars";
import { getPickedPanels } from "@/lib/script-review/bridge";
import { collectVisuals, toAvatarSnapshot } from "../visuals";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const OTHER = "9b9b9b9b-0000-4000-8000-000000000009";

function script(): Script {
  const doc = reelDoc();
  doc.cast = doc.cast.map((c) => ({ ...c, avatarId: c.id === "meenakshi" ? AVATAR_ID : OTHER }));
  return { id: SCRIPT_ID, clientId: "c1", stage: "in_review", doc, approvedAt: null, createdAt: "x", updatedAt: "x" };
}

beforeEach(() => vi.resetAllMocks());

describe("collectVisuals", () => {
  it("freezes nothing besides the text on a script-only share", async () => {
    expect(await collectVisuals("c1", script(), "script")).toEqual({ avatars: {}, panels: {} });
    expect(listAvatars).not.toHaveBeenCalled();
    expect(getPickedPanels).not.toHaveBeenCalled();
  });

  it("freezes a ready avatar of this client's, and leaves out one that is not (Review Focus 4)", async () => {
    // OTHER is not in this client's live list: another client's, or archived.
    vi.mocked(listAvatars).mockResolvedValue([makeAvatar({ id: AVATAR_ID, name: "Meenakshi" })]);
    const visuals = await collectVisuals("c1", script(), "avatars");
    expect(Object.keys(visuals.avatars)).toEqual(["meenakshi"]);
    expect(visuals.avatars.meenakshi).toMatchObject({ avatarId: AVATAR_ID, name: "Meenakshi" });
    expect(listAvatars).toHaveBeenCalledWith("c1");
    expect(getPickedPanels).not.toHaveBeenCalled();

    // A draft is left out too.
    vi.mocked(listAvatars).mockResolvedValue([makeAvatar({ id: AVATAR_ID, status: "draft" })]);
    expect((await collectVisuals("c1", script(), "avatars")).avatars).toEqual({});
  });

  it("freezes the picked panels of this script's shots only", async () => {
    vi.mocked(listAvatars).mockResolvedValue([]);
    vi.mocked(getPickedPanels).mockResolvedValue({ s01: { takeId: "t1", url: "u1" }, ghost: { takeId: "t9", url: "u9" } });
    const visuals = await collectVisuals("c1", script(), "panels");
    expect(visuals.panels).toEqual({ s01: { takeId: "t1", url: "u1" } });
    expect(getPickedPanels).toHaveBeenCalledWith("c1", SCRIPT_ID);
  });
});

describe("toAvatarSnapshot", () => {
  it("keeps the views from the bridge and a named voice with its preview", () => {
    const snap = toAvatarSnapshot(
      makeAvatar({
        id: AVATAR_ID, name: "Meenakshi", front: makeImage(),
        voice: { mode: "named", voiceId: "v1", name: "Kavya", labels: {}, previewUrl: "https://cdn/kavya.mp3" },
      }),
    );
    expect(snap.views).toEqual({ front: makeImage().url, left: null, right: null, back: null });
    expect(snap.voice).toEqual({ name: "Kavya", sampleUrl: "https://cdn/kavya.mp3" });
  });

  it("keeps a native voice's sample with no name, and no voice when there is none", () => {
    const native = toAvatarSnapshot(
      makeAvatar({ voice: { mode: "native" }, voiceSample: { url: "https://cdn/sample.mp3", durationSeconds: 4, sourceKey: "k" } }),
    );
    expect(native.voice).toEqual({ name: null, sampleUrl: "https://cdn/sample.mp3" });
    expect(toAvatarSnapshot(makeAvatar({ voice: null, voiceSample: null })).voice).toBeNull();
  });
});
```

```ts
// src/lib/script-review/__tests__/paths.test.ts
import { describe, it, expect } from "vitest";
import { toCanonicalShareToken } from "@/lib/client-review/token";
import { sharePathFor } from "@/lib/client-review/paths";
import { scriptSharePathFor } from "../paths";

describe("scriptSharePathFor", () => {
  it("is D311's titled link, one segment under /r/s/", () => {
    expect(scriptSharePathFor("6f1c", "Golu starts today")).toBe("/r/s/golu-starts-today-6f1c");
  });

  it("falls back to 'script' for a title with no latin letters", () => {
    expect(scriptSharePathFor("6f1c", "கொலு")).toBe("/r/s/script-6f1c");
  });

  it("parses back to the code, so a renamed script never breaks a link", () => {
    expect(toCanonicalShareToken("golu-starts-today-6f1c")).toBe("6f1c");
    expect(toCanonicalShareToken("a-new-title-6f1c")).toBe("6f1c");
  });

  it("leaves the video review links exactly as they were", () => {
    expect(sharePathFor("b4b4", "")).toBe("/r/cut-b4b4");
  });
});
```

```ts
// src/lib/script-review/__tests__/ensure-review.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client-reviews", () => ({ ShareCodeTakenError: class ShareCodeTakenError extends Error {} }));
vi.mock("@/lib/db/script-reviews", () => ({
  getScriptReviewForScript: vi.fn(),
  insertScriptReview: vi.fn(),
  ScriptReviewExistsError: class ScriptReviewExistsError extends Error {},
}));

import { ShareCodeTakenError } from "@/lib/db/client-reviews";
import { getScriptReviewForScript, insertScriptReview, ScriptReviewExistsError } from "@/lib/db/script-reviews";
import { ensureScriptReview } from "../ensure-review";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const row = (token: string) => ({ id: "r1", script_id: SCRIPT_ID, client_id: "c1", share_token: token, created_by: "u1", created_at: "t" });
const input = { scriptId: SCRIPT_ID, clientId: "c1", createdBy: "u1" };

beforeEach(() => vi.resetAllMocks());

describe("ensureScriptReview", () => {
  it("returns the script's existing review: one link for every version", async () => {
    vi.mocked(getScriptReviewForScript).mockResolvedValue(row("6f1c"));
    expect(await ensureScriptReview(input)).toEqual(row("6f1c"));
    expect(insertScriptReview).not.toHaveBeenCalled();
  });

  it("makes one with the 4-character code, one longer on a clash", async () => {
    vi.mocked(getScriptReviewForScript).mockResolvedValue(null);
    vi.mocked(insertScriptReview).mockRejectedValueOnce(new ShareCodeTakenError()).mockResolvedValueOnce(row("6f1c2"));
    expect((await ensureScriptReview(input)).share_token).toBe("6f1c2");
    expect(vi.mocked(insertScriptReview).mock.calls.map((c) => c[0].shareToken)).toEqual(["6f1c", "6f1c2"]);
  });

  it("returns the row another request made first", async () => {
    vi.mocked(getScriptReviewForScript).mockResolvedValueOnce(null).mockResolvedValueOnce(row("6f1c"));
    vi.mocked(insertScriptReview).mockRejectedValueOnce(new ScriptReviewExistsError());
    expect((await ensureScriptReview(input)).share_token).toBe("6f1c");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/script-review/__tests__/visuals.test.ts src/lib/script-review/__tests__/paths.test.ts src/lib/script-review/__tests__/ensure-review.test.ts`
Expected: FAIL with "Failed to resolve import ../visuals", "../paths", "../ensure-review".

- [ ] **Step 4: Export the link slug from D309's paths**

In `src/lib/client-review/paths.ts`, change the slug helper's signature and its last line, nothing else:

```ts
export function linkSlug(title: string, fallback = "cut"): string {
```

and replace `return slug || "cut";` with `return slug || fallback;`. `sharePathFor` keeps calling `linkSlug(title)`, so video links are unchanged.

- [ ] **Step 5: Write the visuals, paths and ensure modules**

```ts
// src/lib/script-review/visuals.ts
import "server-only";
import { listAvatars } from "@/lib/db/avatars";
import type { Avatar } from "@/lib/avatars/schema";
import type { Script } from "@/lib/scripts/schema";
import { scopeIncludes, type ShareScope } from "./constants";
import { avatarViewUrls, getPickedPanels } from "./bridge";
import type { AvatarSnapshot, VersionVisuals } from "./types";

/** A cast member's avatar as the client will see it in this version: its views and its voice. */
export function toAvatarSnapshot(avatar: Avatar): AvatarSnapshot {
  const named = avatar.voice?.mode === "named" ? avatar.voice : null;
  const sampleUrl = avatar.voiceSample?.url ?? named?.previewUrl ?? null;
  return {
    avatarId: avatar.id,
    name: avatar.name,
    views: avatarViewUrls(avatar),
    voice: named || sampleUrl ? { name: named?.name ?? null, sampleUrl } : null,
  };
}

/** Spec 4 §3 step 3: what a share freezes besides the text, for what its scope includes. Only this
 *  client's live, ready avatars (listAvatars is scoped to the client and skips archived ones), so a
 *  draft or a foreign avatar id in the script never shows the client a face. */
export async function collectVisuals(clientId: string, script: Script, scope: ShareScope): Promise<VersionVisuals> {
  const visuals: VersionVisuals = { avatars: {}, panels: {} };
  if (scopeIncludes(scope, "avatars")) {
    const avatars = new Map((await listAvatars(clientId)).map((a) => [a.id, a]));
    for (const member of script.doc.cast) {
      const avatar = member.avatarId ? avatars.get(member.avatarId) : undefined;
      if (avatar && avatar.status === "ready") visuals.avatars[member.id] = toAvatarSnapshot(avatar);
    }
  }
  if (scopeIncludes(scope, "panels")) {
    const shotIds = new Set(script.doc.shots.map((s) => s.id));
    for (const [shotId, panel] of Object.entries(await getPickedPanels(clientId, script.id))) {
      if (shotIds.has(shotId)) visuals.panels[shotId] = panel;
    }
  }
  return visuals;
}
```

```ts
// src/lib/script-review/paths.ts
import { linkSlug } from "@/lib/client-review/paths";

/** The client's link for a script (D355): D311's titled shape, `/r/s/<title-slug>-<code>`, under the
 *  public prefix D309 opened, one segment deeper so it never meets a video review's link. Only the
 *  code finds the review; the title is for the client to read. */
export function scriptSharePathFor(code: string, title: string): string {
  return `/r/s/${linkSlug(title, "script")}-${code}`;
}
```

```ts
// src/lib/script-review/ensure-review.ts
import "server-only";
import { MAX_CODE_EXTRA, shareCodeFor } from "@/lib/client-review/token";
import { ShareCodeTakenError } from "@/lib/db/client-reviews";
import { getScriptReviewForScript, insertScriptReview, ScriptReviewExistsError } from "@/lib/db/script-reviews";
import type { ScriptReviewRow } from "./wire";

/** The script's one review row, made on its first share (spec 4 §7: one link for every version).
 *  The code is D311's: the first 4 hex characters of the script id, one longer per clash. */
export async function ensureScriptReview(input: { scriptId: string; clientId: string; createdBy: string }): Promise<ScriptReviewRow> {
  const existing = await getScriptReviewForScript(input.scriptId);
  if (existing) return existing;
  for (let extra = 0; extra <= MAX_CODE_EXTRA; extra++) {
    try {
      return await insertScriptReview({ ...input, shareToken: shareCodeFor(input.scriptId, extra) });
    } catch (e) {
      if (e instanceof ShareCodeTakenError) continue;
      if (e instanceof ScriptReviewExistsError) {
        const made = await getScriptReviewForScript(input.scriptId);
        if (made) return made;
      }
      throw e;
    }
  }
  throw new Error("Could not make a link for this script.");
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/script-review src/lib/client-review`
Expected: PASS, D309's `paths.test.ts` included.

- [ ] **Step 7: Commit**

```bash
git add src/lib/script-review src/lib/client-review/paths.ts
git commit -m "feat(script-review): freeze avatars and panels per share (spec 3 bridge stubbed), titled script links"
```

---

### Task 7: What the team and the client see

**Files:**
- Create: `src/lib/script-review/assemble.ts`
- Create: `src/lib/script-review/load.ts`
- Create: `src/lib/script-review/actor.ts`
- Test: `src/lib/script-review/__tests__/assemble.test.ts`

**Interfaces:**
- Consumes: `buildActivity`, `removedShots` (Task 3); `FULL_SHARE` (Task 1); `ScriptVersion`, `ScriptReviewByToken` (Task 5); `listVersions`, `listScriptComments`, `listScriptEvents` (Task 5); `resolveDisplayNames(orgId, userIds)` from `@/lib/db/profiles`; `CallerContext` from `@/lib/dal-logic`.
- Produces: `ReviewState = { versions: ScriptVersion[]; comments: ScriptComment[]; events: ScriptReviewEvent[] }`, `Approval = { byName: string; at: string }`, `approvalOf(events, versionNumber | null)`, `commentsOpen(latest, approval)`, `canApprove(stage, latest, approval)`, `feedbackCount(comments, events)`, `PublicScriptReview`, `TeamScriptReview`, `assemblePublic(state, { stage, fromName, forName }): PublicScriptReview | null`, `assembleTeam(state, { stage, shareToken, liveDoc }): TeamScriptReview`; `loadReviewState(reviewId: string | null, scriptId: string): Promise<ReviewState>`, `buildPublicScriptReview(review: ScriptReviewByToken): Promise<PublicScriptReview | null>`; `teamActorName(caller: CallerContext): Promise<string>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/script-review/__tests__/assemble.test.ts
import { describe, it, expect } from "vitest";
import { approvalOf, assemblePublic, assembleTeam, canApprove, commentsOpen, feedbackCount, type ReviewState } from "../assemble";
import type { ScriptVersion } from "../wire";
import { comment, content, event } from "./fixtures";

const version = (number: number, over: Partial<ScriptVersion> = {}): ScriptVersion => ({
  ...content(), id: `v${number}`, number, sharedAt: `2026-10-1${number}T09:00:00.000Z`, ...over,
});

const state = (over: Partial<ReviewState> = {}): ReviewState => ({ versions: [], comments: [], events: [], ...over });

describe("approval of the version on screen (spec 4 §8)", () => {
  const events = [
    event({ id: "s1", scope: "panels" }),
    event({ id: "a1", kind: "approved", actorKind: "client", actorName: "Priya", scope: null, createdAt: "2026-10-11T12:00:00.000Z" }),
    event({ id: "r", kind: "reopened", versionNumber: null, scope: null }),
    event({ id: "s2", versionNumber: 2, scope: "panels" }),
  ];

  it("binds to the version it was given on", () => {
    expect(approvalOf(events, 1)).toEqual({ byName: "Priya", at: "2026-10-11T12:00:00.000Z" });
  });

  it("is gone for a new share after a reopen, so the link takes comments again", () => {
    expect(approvalOf(events, 2)).toBeNull();
    expect(commentsOpen(version(2), approvalOf(events, 2))).toBe(true);
    expect(commentsOpen(version(1), approvalOf(events, 1))).toBe(false);
  });

  it("offers Approve only on a full share, In review, once", () => {
    const full = version(1, { scope: "panels" });
    expect(canApprove("in_review", full, null)).toBe(true);
    expect(canApprove("in_review", version(1, { scope: "avatars" }), null)).toBe(false);
    expect(canApprove("visualise", full, null)).toBe(false);
    expect(canApprove("in_review", full, { byName: "Priya", at: "t" })).toBe(false);
    expect(canApprove("in_review", null, null)).toBe(false);
  });
});

describe("assemblePublic", () => {
  it("is null until something was shared", () => {
    expect(assemblePublic(state(), { stage: "in_review", fromName: "Yuvabe Studios", forName: "Jackfruit365" })).toBeNull();
  });

  it("shows the latest version, without its row id", () => {
    const v1 = version(1);
    const v2 = version(2);
    v2.doc.shots[0].visual = "Version two's opening";
    const out = assemblePublic(state({ versions: [v1, v2], comments: [comment()] }), {
      stage: "in_review", fromName: "Yuvabe Studios", forName: "Jackfruit365",
    })!;
    expect(out.version.number).toBe(2);
    expect(out.version.doc.shots[0].visual).toBe("Version two's opening");
    expect(out.fromName).toBe("Yuvabe Studios");
    expect(out.version).not.toHaveProperty("id");
  });
});

describe("assembleTeam", () => {
  it("places removed-shot comments against the team's live script", () => {
    const live = content().doc;
    live.shots = live.shots.filter((s) => s.id !== "s09");
    const out = assembleTeam(state({ versions: [version(1)] }), { stage: "visualise", shareToken: "6f1c", liveDoc: live });
    expect(Object.keys(out.removedShots)).toEqual(["s09"]);
    expect(out.latest).toEqual({ number: 1, scope: "script", sharedAt: "2026-10-11T09:00:00.000Z" });
  });

  it("has no link and no version before the first share", () => {
    const out = assembleTeam(state({ events: [event({ kind: "moved_to_review", versionNumber: null, scope: null })] }), {
      stage: "in_review", shareToken: null, liveDoc: content().doc,
    });
    expect(out).toMatchObject({ stage: "in_review", shareToken: null, latest: null, commentsOpen: false, feedbackCount: 0 });
  });
});

describe("feedbackCount (spec 4 §6)", () => {
  it("counts client comments and approvals, never the team's replies", () => {
    const comments = [comment({ id: "a" }), comment({ id: "b" }), comment({ id: "r", parentId: "a", authorKind: "team" })];
    const events = [event(), event({ id: "ap", kind: "approved", actorKind: "client" })];
    expect(feedbackCount(comments, events)).toBe(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/script-review/__tests__/assemble.test.ts`
Expected: FAIL with "Failed to resolve import ../assemble".

- [ ] **Step 3: Write the assembly**

```ts
// src/lib/script-review/assemble.ts
// The two payloads, from one review state. Pure.
import type { ScriptStage } from "@/lib/scripts/constants";
import type { ScriptDoc } from "@/lib/scripts/schema";
import { buildActivity } from "./activity";
import { FULL_SHARE, type ShareScope } from "./constants";
import { removedShots } from "./threads";
import type { ActivityLine, RemovedShot, ScriptComment, ScriptReviewEvent, VersionVisuals } from "./types";
import type { ScriptVersion } from "./wire";

export type ReviewState = { versions: ScriptVersion[]; comments: ScriptComment[]; events: ScriptReviewEvent[] };
export type Approval = { byName: string; at: string };

/** The approval of this version, if it has one. After a reopen the old approval stays in the
 *  activity, but the next share has none until the client approves it (spec 4 §8). */
export function approvalOf(events: ScriptReviewEvent[], versionNumber: number | null): Approval | null {
  if (versionNumber === null) return null;
  const e = [...events].reverse().find((x) => x.kind === "approved" && x.versionNumber === versionNumber);
  return e ? { byName: e.actorName, at: e.createdAt } : null;
}

/** Spec 4 §8: once the version on screen is approved the link is a read-only record. */
export function commentsOpen(latest: ScriptVersion | null, approval: Approval | null): boolean {
  return latest !== null && approval === null;
}

/** Spec 4 §8: Approve on a full share, while the script is In review, once. */
export function canApprove(stage: ScriptStage, latest: ScriptVersion | null, approval: Approval | null): boolean {
  return stage === "in_review" && latest?.scope === FULL_SHARE && approval === null;
}

/** Spec 4 §6: client comments plus approvals, a total with no seen-state (as D310). */
export function feedbackCount(comments: ScriptComment[], events: ScriptReviewEvent[]): number {
  return comments.filter((c) => c.authorKind === "client").length + events.filter((e) => e.kind === "approved").length;
}

/** The client's page. Deliberately no org, client, script, review or version ids (D309 §3). */
export type PublicScriptReview = {
  fromName: string;
  forName: string;
  version: { number: number; scope: ShareScope; sharedAt: string; doc: ScriptDoc; visuals: VersionVisuals };
  comments: ScriptComment[];
  removedShots: Record<string, RemovedShot>;
  activity: ActivityLine[];
  approval: Approval | null;
  commentsOpen: boolean;
  canApprove: boolean;
};

export type TeamScriptReview = {
  stage: ScriptStage;
  /** The share CODE, not a finished link: the link carries the live title (D311; commit 732d3424). */
  shareToken: string | null;
  latest: { number: number; scope: ShareScope; sharedAt: string } | null;
  comments: ScriptComment[];
  removedShots: Record<string, RemovedShot>;
  activity: ActivityLine[];
  approval: Approval | null;
  commentsOpen: boolean;
  feedbackCount: number;
};

export function assemblePublic(
  state: ReviewState,
  ctx: { stage: ScriptStage; fromName: string; forName: string },
): PublicScriptReview | null {
  const latest = state.versions.at(-1) ?? null;
  if (!latest) return null;
  const approval = approvalOf(state.events, latest.number);
  return {
    fromName: ctx.fromName,
    forName: ctx.forName,
    version: { number: latest.number, scope: latest.scope, sharedAt: latest.sharedAt, doc: latest.doc, visuals: latest.visuals },
    comments: state.comments,
    removedShots: removedShots(state.versions, latest.doc),
    activity: buildActivity(state.events, state.comments),
    approval,
    commentsOpen: commentsOpen(latest, approval),
    canApprove: canApprove(ctx.stage, latest, approval),
  };
}

export function assembleTeam(
  state: ReviewState,
  ctx: { stage: ScriptStage; shareToken: string | null; liveDoc: ScriptDoc },
): TeamScriptReview {
  const latest = state.versions.at(-1) ?? null;
  const approval = approvalOf(state.events, latest?.number ?? null);
  return {
    stage: ctx.stage,
    shareToken: ctx.shareToken,
    latest: latest ? { number: latest.number, scope: latest.scope, sharedAt: latest.sharedAt } : null,
    comments: state.comments,
    removedShots: removedShots(state.versions, ctx.liveDoc),
    activity: buildActivity(state.events, state.comments),
    approval,
    commentsOpen: commentsOpen(latest, approval),
    feedbackCount: feedbackCount(state.comments, state.events),
  };
}
```

- [ ] **Step 4: Write the loader and the actor name**

```ts
// src/lib/script-review/load.ts
import "server-only";
import { listScriptComments, listScriptEvents, listVersions } from "@/lib/db/script-reviews";
import { assemblePublic, type PublicScriptReview, type ReviewState } from "./assemble";
import type { ScriptReviewByToken } from "./wire";

/** Everything a payload needs. A script with no review row yet still has its stage-move events. */
export async function loadReviewState(reviewId: string | null, scriptId: string): Promise<ReviewState> {
  const [versions, comments, events] = await Promise.all([
    reviewId ? listVersions(reviewId) : Promise.resolve([]),
    reviewId ? listScriptComments(reviewId) : Promise.resolve([]),
    listScriptEvents(scriptId),
  ]);
  return { versions, comments, events };
}

/** Shared by the public page (first, server-rendered load) and GET /api/r/s/[token]. It never reads
 *  the live script: the client only ever sees what was shared (spec 4 §3 step 3). */
export async function buildPublicScriptReview(review: ScriptReviewByToken): Promise<PublicScriptReview | null> {
  const state = await loadReviewState(review.id, review.script_id);
  return assemblePublic(state, { stage: review.stage, fromName: review.orgName, forName: review.clientName });
}
```

```ts
// src/lib/script-review/actor.ts
import "server-only";
import type { CallerContext } from "@/lib/dal-logic";
import { resolveDisplayNames } from "@/lib/db/profiles";
import { REVIEWER_NAME_MAX } from "@/lib/client-review/constants";

/** The team member's name as the client reads it under a reply and in the activity. Copied onto the
 *  row when written, because the activity is never rewritten (spec 4 §7). */
export async function teamActorName(caller: CallerContext): Promise<string> {
  const names = await resolveDisplayNames(caller.orgId, [caller.userId]);
  const name = names.get(caller.userId)?.trim() || caller.email?.split("@")[0]?.trim() || "The team";
  return name.slice(0, REVIEWER_NAME_MAX);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/script-review`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/script-review
git commit -m "feat(script-review): the team and client payloads from one review state"
```

---

### Task 8: Team routes: read the review, move the stage, share

**Files:**
- Create: `src/app/api/clients/[id]/scripts/[scriptId]/review/route.ts`
- Create: `src/app/api/clients/[id]/scripts/[scriptId]/review/stage/route.ts`
- Create: `src/app/api/clients/[id]/scripts/[scriptId]/review/share/route.ts`
- Test: `src/app/api/clients/[id]/scripts/[scriptId]/review/route.test.ts`
- Test: `src/app/api/clients/[id]/scripts/[scriptId]/review/stage/route.test.ts`
- Test: `src/app/api/clients/[id]/scripts/[scriptId]/review/share/route.test.ts`

**Interfaces:**
- Consumes: `getScript(clientId, scriptId)` (spec 1); `getScriptReviewForScript`, `getLatestVersion`, `shareVersion`, `moveScriptStage` (Task 5); `loadReviewState` (Task 7), `assembleTeam` (Task 7), `teamActorName` (Task 7); `ensureScriptReview`, `collectVisuals` (Task 6); `diffVersions` (Task 2); `parseStageMove`, `parseShare` (Task 4); `TEAM_STAGE_MOVES` (Task 1); `SCRIPT_STAGE_LABEL` (spec 1); `resolveCallerContext` from `@/lib/dal`.
- Produces:
  - `GET /api/clients/:id/scripts/:scriptId/review` → `200 { review: TeamScriptReview }`; 404 for a missing or foreign script.
  - `POST …/review/stage` body `{ move: TeamStageMove }` → `200 { stage: ScriptStage }`; 400 unknown move; 409 wrong stage or lost race.
  - `POST …/review/share` body `{ scope: ShareScope }` → `201 { version: { number, scope, sharedAt }, shareToken: string }`; 409 when not In review or another share landed first.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/api/clients/[id]/scripts/[scriptId]/review/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Script } from "@/lib/scripts/schema";
import { event, reelDoc } from "@/lib/script-review/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({ getScriptReviewForScript: vi.fn() }));
vi.mock("@/lib/script-review/load", () => ({ loadReviewState: vi.fn() }));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { getScriptReviewForScript } from "@/lib/db/script-reviews";
import { loadReviewState } from "@/lib/script-review/load";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const req = () => new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/review`);
const script = (stage: Script["stage"]): Script => ({ id: SCRIPT_ID, clientId: "c1", stage, doc: reelDoc(), approvedAt: null, createdAt: "x", updatedAt: "x" });

describe("GET …/review", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
  });

  it("answers before the first share with the stage and no link", async () => {
    vi.mocked(getScript).mockResolvedValue(script("in_review"));
    vi.mocked(getScriptReviewForScript).mockResolvedValue(null);
    vi.mocked(loadReviewState).mockResolvedValue({ versions: [], comments: [], events: [event({ kind: "moved_to_review", versionNumber: null, scope: null })] });
    const { GET } = await import("./route");
    const res = await GET(req(), { params });
    expect(res.status).toBe(200);
    const { review } = await res.json();
    expect(review).toMatchObject({ stage: "in_review", shareToken: null, latest: null });
    expect(loadReviewState).toHaveBeenCalledWith(null, SCRIPT_ID);
  });

  it("404s another client's script", async () => {
    vi.mocked(getScript).mockResolvedValue(null);
    const { GET } = await import("./route");
    expect((await GET(req(), { params })).status).toBe(404);
    expect(getScript).toHaveBeenCalledWith("c1", SCRIPT_ID);
  });
});
```

```ts
// src/app/api/clients/[id]/scripts/[scriptId]/review/stage/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Script } from "@/lib/scripts/schema";
import { reelDoc } from "@/lib/script-review/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({ moveScriptStage: vi.fn() }));
vi.mock("@/lib/script-review/actor", () => ({ teamActorName: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { moveScriptStage } from "@/lib/db/script-reviews";
import { teamActorName } from "@/lib/script-review/actor";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/review/stage`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const script = (stage: Script["stage"]): Script => ({ id: SCRIPT_ID, clientId: "c1", stage, doc: reelDoc(), approvedAt: null, createdAt: "x", updatedAt: "x" });

describe("POST …/review/stage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
    vi.mocked(teamActorName).mockResolvedValue("Arun");
  });

  it("moves a Visualise script to In review and records who", async () => {
    vi.mocked(getScript).mockResolvedValue(script("visualise"));
    vi.mocked(moveScriptStage).mockResolvedValue(true);
    const { POST } = await import("./route");
    const res = await POST(post({ move: "to_review" }), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stage: "in_review" });
    expect(moveScriptStage).toHaveBeenCalledWith({
      scriptId: SCRIPT_ID, clientId: "c1", from: "visualise", to: "in_review", event: "moved_to_review", actorName: "Arun",
    });
  });

  it("refuses a move from the wrong stage without writing", async () => {
    vi.mocked(getScript).mockResolvedValue(script("generate"));
    const { POST } = await import("./route");
    const res = await POST(post({ move: "to_review" }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Move to In review works from Visualise; this script is at Generate.");
    expect(moveScriptStage).not.toHaveBeenCalled();
  });

  it("400s approve, which is never a team move", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ move: "approve" }), { params })).status).toBe(400);
  });

  it("409s when someone else moved it first", async () => {
    vi.mocked(getScript).mockResolvedValue(script("in_review"));
    vi.mocked(moveScriptStage).mockResolvedValue(false);
    const { POST } = await import("./route");
    expect((await POST(post({ move: "back_to_visualise" }), { params })).status).toBe(409);
  });
});
```

```ts
// src/app/api/clients/[id]/scripts/[scriptId]/review/share/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Script } from "@/lib/scripts/schema";
import { content, reelDoc } from "@/lib/script-review/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({ getLatestVersion: vi.fn(), shareVersion: vi.fn() }));
vi.mock("@/lib/script-review/ensure-review", () => ({ ensureScriptReview: vi.fn() }));
vi.mock("@/lib/script-review/visuals", () => ({ collectVisuals: vi.fn() }));
vi.mock("@/lib/script-review/actor", () => ({ teamActorName: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { getLatestVersion, shareVersion } from "@/lib/db/script-reviews";
import { ensureScriptReview } from "@/lib/script-review/ensure-review";
import { collectVisuals } from "@/lib/script-review/visuals";
import { teamActorName } from "@/lib/script-review/actor";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID });
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/review/share`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const script = (stage: Script["stage"]): Script => ({ id: SCRIPT_ID, clientId: "c1", stage, doc: reelDoc(), approvedAt: null, createdAt: "x", updatedAt: "x" });
const review = { id: "r1", script_id: SCRIPT_ID, client_id: "c1", share_token: "6f1c", created_by: "u1", created_at: "t" };
const NO_VISUALS = { avatars: {}, panels: {} };

describe("POST …/review/share", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
    vi.mocked(teamActorName).mockResolvedValue("Arun");
    vi.mocked(ensureScriptReview).mockResolvedValue(review);
    vi.mocked(collectVisuals).mockResolvedValue(NO_VISUALS);
  });

  it("is only offered In review (spec 4 §3)", async () => {
    vi.mocked(getScript).mockResolvedValue(script("visualise"));
    const { POST } = await import("./route");
    const res = await POST(post({ scope: "script" }), { params });
    expect(res.status).toBe(409);
    expect(ensureScriptReview).not.toHaveBeenCalled();
  });

  it("shares version 1 with no changes, and returns the link's code", async () => {
    vi.mocked(getScript).mockResolvedValue(script("in_review"));
    vi.mocked(getLatestVersion).mockResolvedValue(null);
    vi.mocked(shareVersion).mockResolvedValue({ status: "ok", version: { ...content(), id: "v1", number: 1, sharedAt: "t1" } });
    const { POST } = await import("./route");
    const res = await POST(post({ scope: "script" }), { params });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ version: { number: 1, scope: "script", sharedAt: "t1" }, shareToken: "6f1c" });
    expect(shareVersion).toHaveBeenCalledWith(expect.objectContaining({
      reviewId: "r1", expectedLatest: 0, scope: "script", changes: [], sharedBy: "u1", actorName: "Arun", visuals: NO_VISUALS,
    }));
    expect(collectVisuals).toHaveBeenCalledWith("c1", expect.objectContaining({ id: SCRIPT_ID }), "script");
  });

  it("names what changed against the version before", async () => {
    const live = script("in_review");
    live.doc.shots[0].vo = "Edited after version 1";
    vi.mocked(getScript).mockResolvedValue(live);
    vi.mocked(getLatestVersion).mockResolvedValue({ ...content(), id: "v1", number: 1, sharedAt: "t1" });
    vi.mocked(shareVersion).mockResolvedValue({ status: "ok", version: { ...content(), id: "v2", number: 2, sharedAt: "t2" } });
    const { POST } = await import("./route");
    await POST(post({ scope: "script" }), { params });
    expect(vi.mocked(shareVersion).mock.calls[0][0]).toMatchObject({
      expectedLatest: 1,
      changes: [{ part: { kind: "shot", shotId: "s01" }, change: "revised", label: "S1" }],
    });
  });

  it("409s when another share landed first", async () => {
    vi.mocked(getScript).mockResolvedValue(script("in_review"));
    vi.mocked(getLatestVersion).mockResolvedValue(null);
    vi.mocked(shareVersion).mockResolvedValue({ status: "stale" });
    const { POST } = await import("./route");
    const res = await POST(post({ scope: "panels" }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Someone else shared a version just now. Reload, then share again.");
  });

  it("400s an unknown scope", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ scope: "everything" }), { params })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/api/clients/[id]/scripts/[scriptId]/review"`
Expected: FAIL with "Failed to resolve import ./route" in all three files.

- [ ] **Step 3: Write the three routes**

```ts
// src/app/api/clients/[id]/scripts/[scriptId]/review/route.ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { getScript } from "@/lib/db/scripts";
import { getScriptReviewForScript } from "@/lib/db/script-reviews";
import { loadReviewState } from "@/lib/script-review/load";
import { assembleTeam } from "@/lib/script-review/assemble";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// GET /api/clients/:id/scripts/:scriptId/review — the team's view of the client review: stage, the
// link's code, the latest version, comments, activity, approval and the feedback count (spec 4 §6).
export async function GET(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not load the review.", async () => {
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      const review = await getScriptReviewForScript(script.id);
      const state = await loadReviewState(review?.id ?? null, script.id);
      return apiOk({
        review: assembleTeam(state, { stage: script.stage, shareToken: review?.share_token ?? null, liveDoc: script.doc }),
      });
    }),
  );
}
```

```ts
// src/app/api/clients/[id]/scripts/[scriptId]/review/stage/route.ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getScript } from "@/lib/db/scripts";
import { moveScriptStage } from "@/lib/db/script-reviews";
import { SCRIPT_STAGE_LABEL } from "@/lib/scripts/constants";
import { TEAM_STAGE_MOVES } from "@/lib/script-review/constants";
import { parseStageMove } from "@/lib/script-review/validate";
import { teamActorName } from "@/lib/script-review/actor";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

// POST /api/clients/:id/scripts/:scriptId/review/stage — { move } (spec 4 §3, §8): Visualise → In
// review, In review → Visualise, Approved → Visualise. Approve is the client's, never this route.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not move the script.", async () => {
      const parsed = parseStageMove(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      const rule = TEAM_STAGE_MOVES[parsed.value.move];
      if (script.stage !== rule.from) {
        return apiError(
          `${rule.label} works from ${SCRIPT_STAGE_LABEL[rule.from]}; this script is at ${SCRIPT_STAGE_LABEL[script.stage]}.`,
          409,
        );
      }
      const actorName = await teamActorName(await resolveCallerContext());
      const moved = await moveScriptStage({ scriptId: script.id, clientId, from: rule.from, to: rule.to, event: rule.event, actorName });
      if (!moved) return apiError("Someone else just moved this script. Reload to see where it is.", 409);
      return apiOk({ stage: rule.to });
    }),
  );
}
```

```ts
// src/app/api/clients/[id]/scripts/[scriptId]/review/share/route.ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getScript } from "@/lib/db/scripts";
import { getLatestVersion, shareVersion } from "@/lib/db/script-reviews";
import { ensureScriptReview } from "@/lib/script-review/ensure-review";
import { collectVisuals } from "@/lib/script-review/visuals";
import { diffVersions } from "@/lib/script-review/version";
import { parseShare } from "@/lib/script-review/validate";
import { teamActorName } from "@/lib/script-review/actor";

type Ctx = { params: Promise<{ id: string; scriptId: string }> };

const NOT_IN_REVIEW = "Move the script to In review to share it.";

// POST /api/clients/:id/scripts/:scriptId/review/share — { scope } (spec 4 §3 steps 2–4). Freezes the
// script as it is now, with what the scope includes, as the next version on the script's one link.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not share the script.", async () => {
      const parsed = parseShare(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      // In review is reachable only from Visualise, so this also means "after Mark final" (spec 2 §8).
      if (script.stage !== "in_review") return apiError(NOT_IN_REVIEW, 409);

      const caller = await resolveCallerContext();
      const [review, actorName] = await Promise.all([
        ensureScriptReview({ scriptId: script.id, clientId, createdBy: caller.userId }),
        teamActorName(caller),
      ]);
      const prev = await getLatestVersion(review.id);
      const next = { scope: parsed.value.scope, doc: script.doc, visuals: await collectVisuals(clientId, script, parsed.value.scope) };
      const result = await shareVersion({
        reviewId: review.id,
        expectedLatest: prev?.number ?? 0,
        ...next,
        changes: diffVersions(prev, next),
        sharedBy: caller.userId,
        actorName,
      });
      if (result.status === "stale") return apiError("Someone else shared a version just now. Reload, then share again.", 409);
      if (result.status === "not_in_review") return apiError(NOT_IN_REVIEW, 409);
      const { number, scope, sharedAt } = result.version;
      return apiOk({ version: { number, scope, sharedAt }, shareToken: review.share_token }, 201);
    }),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "src/app/api/clients/[id]/scripts/[scriptId]/review"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/clients/[id]/scripts/[scriptId]/review"
git commit -m "feat(script-review): team routes to read the review, move the stage and share a version"
```

---

### Task 9: Team routes: reply and resolve

**Files:**
- Create: `src/app/api/clients/[id]/scripts/[scriptId]/review/comments/[commentId]/route.ts`
- Create: `src/app/api/clients/[id]/scripts/[scriptId]/review/comments/[commentId]/replies/route.ts`
- Test: `src/app/api/clients/[id]/scripts/[scriptId]/review/comments/[commentId]/route.test.ts`
- Test: `src/app/api/clients/[id]/scripts/[scriptId]/review/comments/[commentId]/replies/route.test.ts`

**Interfaces:**
- Consumes: `getScript` (spec 1); `getScriptReviewForScript`, `getLatestVersion`, `hasApproval`, `getCommentForReply`, `countScriptComments`, `insertScriptComment`, `setThreadResolved` (Task 5); `parseReply`, `parseResolve` (Task 4); `teamActorName` (Task 7); `APPROVED_RECORD_ERROR`, `COMMENT_LIMIT_ERROR` (Task 1); `MAX_COMMENTS_PER_REVIEW` (D309); `isUuid` from `@/lib/avatars/utils`.
- Produces:
  - `POST …/review/comments/:commentId/replies` body `{ body }` → `201 { comment: ScriptComment }` (author kind `team`, the thread's version and part).
  - `PATCH …/review/comments/:commentId` body `{ resolved: boolean }` → `200 { comment: ScriptComment }`.
  - Both: 404 for an unknown comment, a reply's id, or a foreign script; 409 once the version on screen is approved.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/api/clients/[id]/scripts/[scriptId]/review/comments/[commentId]/replies/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Script } from "@/lib/scripts/schema";
import { comment, content, reelDoc } from "@/lib/script-review/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({
  getScriptReviewForScript: vi.fn(), getLatestVersion: vi.fn(), hasApproval: vi.fn(),
  getCommentForReply: vi.fn(), countScriptComments: vi.fn(), insertScriptComment: vi.fn(),
}));
vi.mock("@/lib/script-review/actor", () => ({ teamActorName: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import {
  countScriptComments, getCommentForReply, getLatestVersion, getScriptReviewForScript, hasApproval, insertScriptComment,
} from "@/lib/db/script-reviews";
import { teamActorName } from "@/lib/script-review/actor";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const COMMENT_ID = "8c8c8c8c-0000-4000-8000-000000000008";
const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID, commentId: COMMENT_ID });
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/review/comments/${COMMENT_ID}/replies`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const script: Script = { id: SCRIPT_ID, clientId: "c1", stage: "in_review", doc: reelDoc(), approvedAt: null, createdAt: "x", updatedAt: "x" };
const review = { id: "r1", script_id: SCRIPT_ID, client_id: "c1", share_token: "6f1c", created_by: "u1", created_at: "t" };
const parent = { id: COMMENT_ID, versionId: "v1", part: { kind: "shot" as const, shotId: "s04" }, parentId: null };

describe("POST …/comments/:commentId/replies", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
    vi.mocked(getScript).mockResolvedValue(script);
    vi.mocked(getScriptReviewForScript).mockResolvedValue(review);
    vi.mocked(getLatestVersion).mockResolvedValue({ ...content(), id: "v2", number: 2, sharedAt: "t" });
    vi.mocked(hasApproval).mockResolvedValue(false);
    vi.mocked(countScriptComments).mockResolvedValue(3);
    vi.mocked(teamActorName).mockResolvedValue("Arun");
  });

  it("replies on the thread's own version and part, as the team", async () => {
    vi.mocked(getCommentForReply).mockResolvedValue(parent);
    vi.mocked(insertScriptComment).mockResolvedValue(comment({ id: "r9", parentId: COMMENT_ID, authorKind: "team", authorName: "Arun" }));
    const { POST } = await import("./route");
    const res = await POST(post({ body: "Blue works" }), { params });
    expect(res.status).toBe(201);
    expect(insertScriptComment).toHaveBeenCalledWith({
      reviewId: "r1", versionId: "v1", part: { kind: "shot", shotId: "s04" }, parentId: COMMENT_ID,
      authorKind: "team", authorName: "Arun", authorUserId: "u1", body: "Blue works",
    });
  });

  it("refuses a reply to a reply", async () => {
    vi.mocked(getCommentForReply).mockResolvedValue({ ...parent, parentId: "another" });
    const { POST } = await import("./route");
    expect((await POST(post({ body: "x" }), { params })).status).toBe(400);
    expect(insertScriptComment).not.toHaveBeenCalled();
  });

  it("refuses once the version on screen is approved (the link is a record)", async () => {
    vi.mocked(getCommentForReply).mockResolvedValue(parent);
    vi.mocked(hasApproval).mockResolvedValue(true);
    const { POST } = await import("./route");
    expect((await POST(post({ body: "x" }), { params })).status).toBe(409);
    expect(insertScriptComment).not.toHaveBeenCalled();
  });

  it("404s a comment this script's review does not have", async () => {
    vi.mocked(getCommentForReply).mockResolvedValue(null);
    const { POST } = await import("./route");
    expect((await POST(post({ body: "x" }), { params })).status).toBe(404);
  });
});
```

```ts
// src/app/api/clients/[id]/scripts/[scriptId]/review/comments/[commentId]/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { Script } from "@/lib/scripts/schema";
import { comment, content, reelDoc } from "@/lib/script-review/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({
  getScriptReviewForScript: vi.fn(), getLatestVersion: vi.fn(), hasApproval: vi.fn(), setThreadResolved: vi.fn(),
}));
vi.mock("@/lib/script-review/actor", () => ({ teamActorName: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { getLatestVersion, getScriptReviewForScript, hasApproval, setThreadResolved } from "@/lib/db/script-reviews";
import { teamActorName } from "@/lib/script-review/actor";

const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
const COMMENT_ID = "8c8c8c8c-0000-4000-8000-000000000008";
const params = (commentId = COMMENT_ID) => Promise.resolve({ id: "c1", scriptId: SCRIPT_ID, commentId });
const patch = (body: unknown) =>
  new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/review/comments/${COMMENT_ID}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const script: Script = { id: SCRIPT_ID, clientId: "c1", stage: "in_review", doc: reelDoc(), approvedAt: null, createdAt: "x", updatedAt: "x" };
const review = { id: "r1", script_id: SCRIPT_ID, client_id: "c1", share_token: "6f1c", created_by: "u1", created_at: "t" };

describe("PATCH …/comments/:commentId (resolve)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", orgId: "org-1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
    vi.mocked(getScript).mockResolvedValue(script);
    vi.mocked(getScriptReviewForScript).mockResolvedValue(review);
    vi.mocked(getLatestVersion).mockResolvedValue({ ...content(), id: "v1", number: 1, sharedAt: "t" });
    vi.mocked(hasApproval).mockResolvedValue(false);
    vi.mocked(teamActorName).mockResolvedValue("Arun");
  });

  it("marks a thread Resolved under the team member's name", async () => {
    vi.mocked(setThreadResolved).mockResolvedValue(comment({ id: COMMENT_ID, resolvedAt: "t", resolvedByName: "Arun" }));
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ resolved: true }), { params: params() });
    expect(res.status).toBe(200);
    expect(setThreadResolved).toHaveBeenCalledWith({ reviewId: "r1", commentId: COMMENT_ID, resolved: true, byName: "Arun" });
  });

  it("reopens a thread with no name", async () => {
    vi.mocked(setThreadResolved).mockResolvedValue(comment({ id: COMMENT_ID }));
    const { PATCH } = await import("./route");
    await PATCH(patch({ resolved: false }), { params: params() });
    expect(setThreadResolved).toHaveBeenCalledWith({ reviewId: "r1", commentId: COMMENT_ID, resolved: false, byName: null });
  });

  it("404s a reply's id (only a thread's first comment resolves) and a malformed id", async () => {
    vi.mocked(setThreadResolved).mockResolvedValue(null);
    const { PATCH } = await import("./route");
    expect((await PATCH(patch({ resolved: true }), { params: params() })).status).toBe(404);
    expect((await PATCH(patch({ resolved: true }), { params: params("not-a-uuid") })).status).toBe(404);
  });

  it("409s once the version on screen is approved", async () => {
    vi.mocked(hasApproval).mockResolvedValue(true);
    const { PATCH } = await import("./route");
    expect((await PATCH(patch({ resolved: true }), { params: params() })).status).toBe(409);
    expect(setThreadResolved).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/api/clients/[id]/scripts/[scriptId]/review/comments"`
Expected: FAIL with "Failed to resolve import ./route".

- [ ] **Step 3: Write the two routes**

```ts
// src/app/api/clients/[id]/scripts/[scriptId]/review/comments/[commentId]/replies/route.ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getScript } from "@/lib/db/scripts";
import {
  countScriptComments, getCommentForReply, getLatestVersion, getScriptReviewForScript, hasApproval, insertScriptComment,
} from "@/lib/db/script-reviews";
import { isUuid } from "@/lib/avatars/utils";
import { MAX_COMMENTS_PER_REVIEW } from "@/lib/client-review/constants";
import { APPROVED_RECORD_ERROR, COMMENT_LIMIT_ERROR } from "@/lib/script-review/constants";
import { parseReply } from "@/lib/script-review/validate";
import { teamActorName } from "@/lib/script-review/actor";

type Ctx = { params: Promise<{ id: string; scriptId: string; commentId: string }> };

// POST …/review/comments/:commentId/replies — { body } (spec 4 §5 Threads). The team replies under a
// client's comment; the reply belongs to that thread's version and part.
export async function POST(req: Request, { params }: Ctx) {
  const { scriptId, commentId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not post the reply.", async () => {
      const parsed = parseReply(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      const review = await getScriptReviewForScript(script.id);
      if (!review || !isUuid(commentId)) return apiError("Comment not found.", 404);
      const parent = await getCommentForReply(review.id, commentId);
      if (!parent) return apiError("Comment not found.", 404);
      if (parent.parentId) return apiError("Reply to the thread's first comment.", 400);
      const latest = await getLatestVersion(review.id);
      if (latest && (await hasApproval(script.id, latest.number))) return apiError(APPROVED_RECORD_ERROR, 409);
      if ((await countScriptComments(review.id)) >= MAX_COMMENTS_PER_REVIEW) return apiError(COMMENT_LIMIT_ERROR, 409);
      const caller = await resolveCallerContext();
      const comment = await insertScriptComment({
        reviewId: review.id,
        versionId: parent.versionId,
        part: parent.part,
        parentId: parent.id,
        authorKind: "team",
        authorName: await teamActorName(caller),
        authorUserId: caller.userId,
        body: parsed.value.body,
      });
      return apiOk({ comment }, 201);
    }),
  );
}
```

```ts
// src/app/api/clients/[id]/scripts/[scriptId]/review/comments/[commentId]/route.ts
import { apiError, apiOk, withClient, withTryCatch } from "@/lib/api/route-helpers";
import { resolveCallerContext } from "@/lib/dal";
import { getScript } from "@/lib/db/scripts";
import { getLatestVersion, getScriptReviewForScript, hasApproval, setThreadResolved } from "@/lib/db/script-reviews";
import { isUuid } from "@/lib/avatars/utils";
import { APPROVED_RECORD_ERROR } from "@/lib/script-review/constants";
import { parseResolve } from "@/lib/script-review/validate";
import { teamActorName } from "@/lib/script-review/actor";

type Ctx = { params: Promise<{ id: string; scriptId: string; commentId: string }> };

// PATCH …/review/comments/:commentId — { resolved } (spec 4 §5). The team marks a thread Resolved,
// or reopens it; the client sees the mark.
export async function PATCH(req: Request, { params }: Ctx) {
  const { scriptId, commentId } = await params;
  return withClient(req, params, async (clientId) =>
    withTryCatch("Could not update the thread.", async () => {
      const parsed = parseResolve(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const script = await getScript(clientId, scriptId);
      if (!script) return apiError("Script not found.", 404);
      const review = await getScriptReviewForScript(script.id);
      if (!review || !isUuid(commentId)) return apiError("Comment not found.", 404);
      const latest = await getLatestVersion(review.id);
      if (latest && (await hasApproval(script.id, latest.number))) return apiError(APPROVED_RECORD_ERROR, 409);
      const byName = parsed.value.resolved ? await teamActorName(await resolveCallerContext()) : null;
      const comment = await setThreadResolved({ reviewId: review.id, commentId, resolved: parsed.value.resolved, byName });
      if (!comment) return apiError("Comment not found.", 404);
      return apiOk({ comment });
    }),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "src/app/api/clients/[id]/scripts/[scriptId]/review"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/clients/[id]/scripts/[scriptId]/review/comments"
git commit -m "feat(script-review): team replies and Resolved on client comments"
```

---

### Task 10: The public read: the token helper and the API

**Files:**
- Modify: `src/lib/api/route-helpers.ts` (add `withScriptShareToken` beside `withShareToken`)
- Create: `src/app/api/r/s/[token]/route.ts`
- Test: `src/app/api/r/s/[token]/route.test.ts`

**Interfaces:**
- Consumes: `toCanonicalShareToken` (D311); `getScriptReviewByToken` (Task 5); `buildPublicScriptReview` (Task 7); `ScriptReviewByToken` (Task 5). The page at `src/app/r/s/[token]/` is written in Task 15.
- Produces: `withScriptShareToken(params: Promise<{ token: string }>, handler: (review: ScriptReviewByToken) => Promise<AnyResponse>)`; `GET /api/r/s/:token` → `200 PublicScriptReview`, 404 for a mangled, unknown, archived or never-shared link.

- [ ] **Step 1: Read the dynamic-routes doc**

Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md` and confirm that a static segment (`r/s/[token]`) is matched before the sibling dynamic one (`r/[token]`), so `/r/s/<link>` never reaches the video review page. Note: a video review link is one segment (`/r/<title>-<code>`), so the two never meet.

- [ ] **Step 2: Write the failing test**

```ts
// src/app/api/r/s/[token]/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { comment, content, event } from "@/lib/script-review/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({
  getScriptReviewByToken: vi.fn(), listVersions: vi.fn(), listScriptComments: vi.fn(), listScriptEvents: vi.fn(),
}));

import { getScript } from "@/lib/db/scripts";
import { getScriptReviewByToken, listScriptComments, listScriptEvents, listVersions } from "@/lib/db/script-reviews";

const TOKEN = "golu-starts-today-6f1c";
const params = (token = TOKEN) => Promise.resolve({ token });
const req = () => new NextRequest(`http://localhost/api/r/s/${TOKEN}`);
const review = {
  id: "r-secret", script_id: "s-secret", client_id: "c-secret", share_token: "6f1c", created_by: "u-secret", created_at: "t",
  stage: "in_review" as const, clientName: "Jackfruit365", orgName: "Yuvabe Studios",
};

describe("GET /api/r/s/[token]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("looks the review up by the code at the end of the link", async () => {
    vi.mocked(getScriptReviewByToken).mockResolvedValue(null);
    const { GET } = await import("./route");
    expect((await GET(req(), { params: params() })).status).toBe(404);
    expect(getScriptReviewByToken).toHaveBeenCalledWith("6f1c");
  });

  it("404s a mangled link without touching the database", async () => {
    const { GET } = await import("./route");
    expect((await GET(req(), { params: params("..%2F") })).status).toBe(404);
    expect(getScriptReviewByToken).not.toHaveBeenCalled();
  });

  it("404s a link with nothing shared yet", async () => {
    vi.mocked(getScriptReviewByToken).mockResolvedValue(review);
    vi.mocked(listVersions).mockResolvedValue([]);
    vi.mocked(listScriptComments).mockResolvedValue([]);
    vi.mocked(listScriptEvents).mockResolvedValue([]);
    const { GET } = await import("./route");
    expect((await GET(req(), { params: params() })).status).toBe(404);
  });

  it("shows the shared version, never the team's live edits (Review Focus 2), and no internal ids", async () => {
    const shared = { ...content(), id: "v-secret", number: 1, sharedAt: "2026-10-10T09:00:00.000Z" };
    shared.doc.shots[0].visual = "As shared";
    vi.mocked(getScriptReviewByToken).mockResolvedValue(review);
    vi.mocked(listVersions).mockResolvedValue([shared]);
    vi.mocked(listScriptComments).mockResolvedValue([comment()]);
    vi.mocked(listScriptEvents).mockResolvedValue([event()]);
    const { GET } = await import("./route");
    const res = await GET(req(), { params: params() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version.doc.shots[0].visual).toBe("As shared");
    expect(body.fromName).toBe("Yuvabe Studios");
    expect(getScript).not.toHaveBeenCalled();
    const text = JSON.stringify(body);
    for (const secret of ["r-secret", "s-secret", "c-secret", "u-secret", "v-secret"]) expect(text).not.toContain(secret);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run "src/app/api/r/s"`
Expected: FAIL with "Failed to resolve import ./route".

- [ ] **Step 4: Add the token helper**

In `src/lib/api/route-helpers.ts`, add to the imports:

```ts
import { getScriptReviewByToken } from "@/lib/db/script-reviews";
import type { ScriptReviewByToken } from "@/lib/script-review/wire";
```

and directly after `withShareToken`:

```ts
// D355: the second named token resolver, for /api/r/s/[token]/* (script reviews). Same rules as
// withShareToken — under the same proxy exemption, no session, no org check, no impersonation
// gate — and the same link parsing (D311): only the code at the end finds the review.
export async function withScriptShareToken(
  params: Promise<{ token: string }>,
  handler: (review: ScriptReviewByToken) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { token: raw } = await params;
  const token = toCanonicalShareToken(raw);
  if (!token) return apiError("Review not found.", 404);
  const review = await getScriptReviewByToken(token);
  if (!review) return apiError("Review not found.", 404);
  return handler(review);
}
```

- [ ] **Step 5: Write the public read route**

```ts
// src/app/api/r/s/[token]/route.ts
import { apiError, apiOk, withQuietErrors, withScriptShareToken } from "@/lib/api/route-helpers";
import { buildPublicScriptReview } from "@/lib/script-review/load";

// GET /api/r/s/:token — public (D355). Refreshes the page after the client's own post, edit or
// approval; the first load is server-rendered by src/app/r/s/[token]/page.tsx.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  return withQuietErrors("Could not load the review.", () =>
    withScriptShareToken(params, async (review) => {
      const body = await buildPublicScriptReview(review);
      if (!body) return apiError("Review not found.", 404);
      return apiOk(body);
    }),
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run "src/app/api/r" src/lib/api`
Expected: PASS, D309's `/api/r/[token]` tests included.

- [ ] **Step 7: Commit**

```bash
git add src/lib/api/route-helpers.ts "src/app/api/r/s"
git commit -m "feat(script-review): public read of the shared version, behind withScriptShareToken"
```

(The page at `src/app/r/s/[token]/` is written in Task 15, beside the component it renders, so every task in between still type-checks.)

---

### Task 11: The client's comments and edits

**Files:**
- Create: `src/app/api/r/s/[token]/comments/route.ts`
- Create: `src/app/api/r/s/[token]/comments/[commentId]/route.ts`
- Test: `src/app/api/r/s/[token]/comments/route.test.ts`
- Test: `src/app/api/r/s/[token]/comments/[commentId]/route.test.ts`

**Interfaces:**
- Consumes: `withScriptShareToken`, `withQuietErrors` (Task 10); `getLatestVersion`, `hasApproval`, `countScriptComments`, `insertScriptComment`, `updateClientComment` (Task 5); `isPartInVersion` (Task 1); `parseNewScriptComment` (Task 4); D309's `parseCommentEdit`; error texts (Task 1); `MAX_COMMENTS_PER_REVIEW`; `isUuid`.
- Produces:
  - `POST /api/r/s/:token/comments` body `{ authorName, body, part, versionNumber }` → `201 { comment }`; 400 bad body or a part not in the version; 409 approved, stale version, or limit reached.
  - `PATCH /api/r/s/:token/comments/:commentId` body `{ editorName, body }` → `200 { comment }`; 404 unknown id or a team reply; 409 approved.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/api/r/s/[token]/comments/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { avatarSnapshot, comment, content } from "@/lib/script-review/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({
  getScriptReviewByToken: vi.fn(), getLatestVersion: vi.fn(), hasApproval: vi.fn(),
  countScriptComments: vi.fn(), insertScriptComment: vi.fn(),
}));

import {
  countScriptComments, getLatestVersion, getScriptReviewByToken, hasApproval, insertScriptComment,
} from "@/lib/db/script-reviews";

const TOKEN = "golu-starts-today-6f1c";
const params = Promise.resolve({ token: TOKEN });
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/r/s/${TOKEN}/comments`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const review = {
  id: "r1", script_id: "s1", client_id: "c1", share_token: "6f1c", created_by: null, created_at: "t",
  stage: "in_review" as const, clientName: "Jackfruit365", orgName: "Yuvabe Studios",
};
const latest = { ...content({ scope: "avatars", visuals: { avatars: { meenakshi: avatarSnapshot() }, panels: {} } }), id: "v2", number: 2, sharedAt: "t" };
const good = { authorName: "Priya", body: "Can she wear blue?", part: { kind: "view", castId: "meenakshi", view: "front" }, versionNumber: 2 };

describe("POST /api/r/s/[token]/comments", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getScriptReviewByToken).mockResolvedValue(review);
    vi.mocked(getLatestVersion).mockResolvedValue(latest);
    vi.mocked(hasApproval).mockResolvedValue(false);
    vi.mocked(countScriptComments).mockResolvedValue(0);
  });

  it("stores the comment on the version on screen, as the client", async () => {
    vi.mocked(insertScriptComment).mockResolvedValue(comment({ part: good.part as never }));
    const { POST } = await import("./route");
    const res = await POST(post(good), { params });
    expect(res.status).toBe(201);
    expect(insertScriptComment).toHaveBeenCalledWith({
      reviewId: "r1", versionId: "v2", part: { kind: "view", castId: "meenakshi", view: "front" }, parentId: null,
      authorKind: "client", authorName: "Priya", authorUserId: null, body: "Can she wear blue?",
    });
  });

  it("refuses a stale tab (Review Focus 1)", async () => {
    const { POST } = await import("./route");
    const res = await POST(post({ ...good, versionNumber: 1 }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("A newer version was shared. Reload to see it.");
    expect(insertScriptComment).not.toHaveBeenCalled();
  });

  it("refuses a part the version does not show (Review Focus 3)", async () => {
    const { POST } = await import("./route");
    for (const part of [
      { kind: "shot", shotId: "s99" },
      { kind: "view", castId: "meenakshi", view: "left" },
      { kind: "panel", shotId: "s01" },
    ]) {
      const res = await POST(post({ ...good, part }), { params });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("That part is not in this version.");
    }
    expect(insertScriptComment).not.toHaveBeenCalled();
  });

  it("takes no comments once the version is approved", async () => {
    vi.mocked(hasApproval).mockResolvedValue(true);
    const { POST } = await import("./route");
    const res = await POST(post(good), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("This reel is approved. The link is now a record and takes no more comments.");
  });

  it("409s at the comment limit", async () => {
    vi.mocked(countScriptComments).mockResolvedValue(500);
    const { POST } = await import("./route");
    expect((await POST(post(good), { params })).status).toBe(409);
  });

  it("500s a database failure without leaking its message", async () => {
    vi.mocked(insertScriptComment).mockRejectedValue(new Error("duplicate key value violates constraint"));
    const { POST } = await import("./route");
    const res = await POST(post(good), { params });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Could not post the comment.");
  });
});
```

```ts
// src/app/api/r/s/[token]/comments/[commentId]/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { comment, content } from "@/lib/script-review/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({
  getScriptReviewByToken: vi.fn(), getLatestVersion: vi.fn(), hasApproval: vi.fn(), updateClientComment: vi.fn(),
}));

import { getLatestVersion, getScriptReviewByToken, hasApproval, updateClientComment } from "@/lib/db/script-reviews";

const TOKEN = "golu-starts-today-6f1c";
const COMMENT_ID = "8c8c8c8c-0000-4000-8000-000000000008";
const params = (commentId = COMMENT_ID) => Promise.resolve({ token: TOKEN, commentId });
const patch = (body: unknown) =>
  new NextRequest(`http://localhost/api/r/s/${TOKEN}/comments/${COMMENT_ID}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const review = {
  id: "r1", script_id: "s1", client_id: "c1", share_token: "6f1c", created_by: null, created_at: "t",
  stage: "in_review" as const, clientName: "Jackfruit365", orgName: "Yuvabe Studios",
};

describe("PATCH /api/r/s/[token]/comments/[commentId]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getScriptReviewByToken).mockResolvedValue(review);
    vi.mocked(getLatestVersion).mockResolvedValue({ ...content(), id: "v1", number: 1, sharedAt: "t" });
    vi.mocked(hasApproval).mockResolvedValue(false);
  });

  it("edits a client comment's text and records who", async () => {
    vi.mocked(updateClientComment).mockResolvedValue(comment({ id: COMMENT_ID, body: "Blue, please", editedByName: "Ravi" }));
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ editorName: "Ravi", body: "Blue, please" }), { params: params() });
    expect(res.status).toBe(200);
    expect(updateClientComment).toHaveBeenCalledWith({ reviewId: "r1", commentId: COMMENT_ID, body: "Blue, please", editedByName: "Ravi" });
  });

  it("404s a team reply's id (not editable from the link) and a malformed id", async () => {
    vi.mocked(updateClientComment).mockResolvedValue(null);
    const { PATCH } = await import("./route");
    expect((await PATCH(patch({ editorName: "Ravi", body: "x" }), { params: params() })).status).toBe(404);
    expect((await PATCH(patch({ editorName: "Ravi", body: "x" }), { params: params("nope") })).status).toBe(404);
  });

  it("409s once the version is approved", async () => {
    vi.mocked(hasApproval).mockResolvedValue(true);
    const { PATCH } = await import("./route");
    expect((await PATCH(patch({ editorName: "Ravi", body: "x" }), { params: params() })).status).toBe(409);
    expect(updateClientComment).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run "src/app/api/r/s/[token]/comments"`
Expected: FAIL with "Failed to resolve import ./route".

- [ ] **Step 3: Write the two routes**

```ts
// src/app/api/r/s/[token]/comments/route.ts
import { apiError, apiOk, withQuietErrors, withScriptShareToken } from "@/lib/api/route-helpers";
import { countScriptComments, getLatestVersion, hasApproval, insertScriptComment } from "@/lib/db/script-reviews";
import { MAX_COMMENTS_PER_REVIEW } from "@/lib/client-review/constants";
import {
  APPROVED_RECORD_ERROR, COMMENT_LIMIT_ERROR, PART_NOT_IN_VERSION_ERROR, STALE_VERSION_ERROR,
} from "@/lib/script-review/constants";
import { isPartInVersion } from "@/lib/script-review/parts";
import { parseNewScriptComment } from "@/lib/script-review/validate";

// POST /api/r/s/:token/comments — public (D355). One comment on one whole part of the version on
// the client's screen (spec 4 §5). The checks run in the app, not under the script lock: a comment
// that lands in the same instant as an approval is the one race left open, and it changes no stage.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  return withQuietErrors("Could not post the comment.", () =>
    withScriptShareToken(params, async (review) => {
      const parsed = parseNewScriptComment(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const latest = await getLatestVersion(review.id);
      if (!latest) return apiError("Review not found.", 404);
      if (await hasApproval(review.script_id, latest.number)) return apiError(APPROVED_RECORD_ERROR, 409);
      if (parsed.value.versionNumber !== latest.number) return apiError(STALE_VERSION_ERROR, 409);
      if (!isPartInVersion(parsed.value.part, latest)) return apiError(PART_NOT_IN_VERSION_ERROR, 400);
      if ((await countScriptComments(review.id)) >= MAX_COMMENTS_PER_REVIEW) return apiError(COMMENT_LIMIT_ERROR, 409);
      const comment = await insertScriptComment({
        reviewId: review.id,
        versionId: latest.id,
        part: parsed.value.part,
        parentId: null,
        authorKind: "client",
        authorName: parsed.value.authorName,
        authorUserId: null,
        body: parsed.value.body,
      });
      return apiOk({ comment }, 201);
    }),
  );
}
```

```ts
// src/app/api/r/s/[token]/comments/[commentId]/route.ts
import { apiError, apiOk, withQuietErrors, withScriptShareToken } from "@/lib/api/route-helpers";
import { getLatestVersion, hasApproval, updateClientComment } from "@/lib/db/script-reviews";
import { isUuid } from "@/lib/avatars/utils";
import { parseCommentEdit } from "@/lib/client-review/validate";
import { APPROVED_RECORD_ERROR } from "@/lib/script-review/constants";

// PATCH /api/r/s/:token/comments/:commentId — public (D355). Anyone with the link edits any client
// comment's TEXT (D309's rule, spec 4 §5); the part, the version and the author never change, and
// a team reply is not editable from the link.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ token: string; commentId: string }> },
) {
  const { commentId } = await params;
  if (!isUuid(commentId)) return apiError("Comment not found.", 404);
  return withQuietErrors("Could not save the edit.", () =>
    withScriptShareToken(params, async (review) => {
      const parsed = parseCommentEdit(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const latest = await getLatestVersion(review.id);
      if (latest && (await hasApproval(review.script_id, latest.number))) return apiError(APPROVED_RECORD_ERROR, 409);
      const comment = await updateClientComment({
        reviewId: review.id,
        commentId,
        body: parsed.value.body,
        editedByName: parsed.value.editorName,
      });
      if (!comment) return apiError("Comment not found.", 404);
      return apiOk({ comment });
    }),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run "src/app/api/r"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/r/s/[token]/comments"
git commit -m "feat(script-review): the client comments on whole parts of the shared version and edits them"
```

---

### Task 12: Approve

**Files:**
- Create: `src/app/api/r/s/[token]/approve/route.ts`
- Test: `src/app/api/r/s/[token]/approve/route.test.ts`

**Interfaces:**
- Consumes: `withScriptShareToken`, `withQuietErrors` (Task 10); `approveVersion`, `ApproveStatus` (Task 5); `parseApproval` (Task 4); `STALE_VERSION_ERROR` (Task 1).
- Produces: `POST /api/r/s/:token/approve` body `{ approverName, versionNumber }` → `200 { approved: true }` for `ok` and `already`; 409 for `stale`, `partial`, `not_in_review`; 404 for `not_found`.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/r/s/[token]/approve/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({ getScriptReviewByToken: vi.fn(), approveVersion: vi.fn() }));

import { approveVersion, getScriptReviewByToken } from "@/lib/db/script-reviews";

const TOKEN = "golu-starts-today-6f1c";
const params = Promise.resolve({ token: TOKEN });
const post = (body: unknown) =>
  new NextRequest(`http://localhost/api/r/s/${TOKEN}/approve`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
const review = {
  id: "r1", script_id: "s1", client_id: "c1", share_token: "6f1c", created_by: null, created_at: "t",
  stage: "in_review" as const, clientName: "Jackfruit365", orgName: "Yuvabe Studios",
};

describe("POST /api/r/s/[token]/approve", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getScriptReviewByToken).mockResolvedValue(review);
  });

  it("approves the version on screen under the typed name", async () => {
    vi.mocked(approveVersion).mockResolvedValue("ok");
    const { POST } = await import("./route");
    const res = await POST(post({ approverName: " Priya ", versionNumber: 3 }), { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ approved: true });
    expect(approveVersion).toHaveBeenCalledWith({ reviewId: "r1", versionNumber: 3, actorName: "Priya" });
  });

  it("answers a second tap with success, not an error (Review Focus 5)", async () => {
    vi.mocked(approveVersion).mockResolvedValue("already");
    const { POST } = await import("./route");
    expect((await POST(post({ approverName: "Priya", versionNumber: 3 }), { params })).status).toBe(200);
  });

  it("refuses a version the client is not looking at any more (Review Focus 1)", async () => {
    vi.mocked(approveVersion).mockResolvedValue("stale");
    const { POST } = await import("./route");
    const res = await POST(post({ approverName: "Priya", versionNumber: 2 }), { params });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("A newer version was shared. Reload to see it.");
  });

  it("refuses a partial share and a script not In review", async () => {
    const { POST } = await import("./route");
    vi.mocked(approveVersion).mockResolvedValue("partial");
    expect((await POST(post({ approverName: "Priya", versionNumber: 1 }), { params })).status).toBe(409);
    vi.mocked(approveVersion).mockResolvedValue("not_in_review");
    expect((await POST(post({ approverName: "Priya", versionNumber: 1 }), { params })).status).toBe(409);
  });

  it("400s a missing name", async () => {
    const { POST } = await import("./route");
    expect((await POST(post({ approverName: "", versionNumber: 1 }), { params })).status).toBe(400);
    expect(approveVersion).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run "src/app/api/r/s/[token]/approve"`
Expected: FAIL with "Failed to resolve import ./route".

- [ ] **Step 3: Write the route**

```ts
// src/app/api/r/s/[token]/approve/route.ts
import { apiError, apiOk, withQuietErrors, withScriptShareToken } from "@/lib/api/route-helpers";
import { approveVersion } from "@/lib/db/script-reviews";
import { STALE_VERSION_ERROR } from "@/lib/script-review/constants";
import { parseApproval } from "@/lib/script-review/validate";

// POST /api/r/s/:token/approve — public (D353). Approves the version number the client's screen
// shows, under their typed name; script_review_approve checks and writes under the script lock.
// Approval moves the script to Approved, which is what puts it in the canvas gallery's Scripts tab.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  return withQuietErrors("Could not approve the reel.", () =>
    withScriptShareToken(params, async (review) => {
      const parsed = parseApproval(await req.json().catch(() => null));
      if (!parsed.ok) return apiError(parsed.error, 400);
      const status = await approveVersion({
        reviewId: review.id,
        versionNumber: parsed.value.versionNumber,
        actorName: parsed.value.approverName,
      });
      switch (status) {
        case "ok":
        case "already":
          return apiOk({ approved: true });
        case "stale":
          return apiError(STALE_VERSION_ERROR, 409);
        case "partial":
          return apiError("This share is for comments. You approve the full reel: script, avatars and panels.", 409);
        case "not_in_review":
          return apiError("This reel is not waiting for your approval right now.", 409);
        case "not_found":
          return apiError("Review not found.", 404);
      }
    }),
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run "src/app/api/r"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/r/s/[token]/approve"
git commit -m "feat(script-review): the client approves the version on screen"
```

---

### Task 13: Browser service, query hooks, and two small helpers

**Files:**
- Create: `src/lib/script-review/utils.ts`
- Create: `src/services/script-review.service.ts`
- Create: `src/hooks/queries/script-review.ts`
- Test: `src/lib/script-review/__tests__/utils.test.ts`
- Test: `src/services/script-review.service.test.ts`

**Interfaces:**
- Consumes: `readJson` from `src/services/read-json.ts`; `PublicScriptReview`, `TeamScriptReview` (Task 7); `Part`, `ScriptComment` (Tasks 1, 3); `ShareScope`, `TeamStageMove` (Task 1); `ScriptStage` (spec 1); `scriptKeys` from `@/hooks/queries/scripts`.
- Produces (utils): `formatShortDay(iso): string` ("10 Oct"), `formatDayTime(iso): string` ("10 Oct, 14:05"), `upsertComment(comments, comment): ScriptComment[]`.
- Produces (service): `scriptReviewService.getTeam(clientId, scriptId)`, `.moveStage(clientId, scriptId, move): Promise<ScriptStage>`, `.share(clientId, scriptId, scope): Promise<{ version: { number; scope; sharedAt }; shareToken: string }>`, `.reply(clientId, scriptId, commentId, body): Promise<ScriptComment>`, `.setResolved(clientId, scriptId, commentId, resolved): Promise<ScriptComment>`, `.getPublic(token)`, `.postComment(token, { authorName, body, part, versionNumber })`, `.editComment(token, commentId, { editorName, body })`, `.approve(token, { approverName, versionNumber }): Promise<void>`.
- Produces (hooks): `scriptReviewKeys.team(clientId, scriptId)`, `scriptReviewKeys.public(token)`, `useTeamScriptReview`, `useMoveScriptStage`, `useShareScript`, `useReplyToThread`, `useResolveThread` (all `(clientId, scriptId)`), `usePublicScriptReview(token, initial)`, `usePostScriptComment(token)`, `useEditScriptComment(token)`, `useApproveScript(token)`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/script-review/__tests__/utils.test.ts
import { describe, it, expect } from "vitest";
import { formatDayTime, formatShortDay, upsertComment } from "../utils";
import { comment } from "./fixtures";

describe("dates", () => {
  it("reads the day in India, so the server's HTML and the browser agree", () => {
    expect(formatShortDay("2026-10-10T09:00:00.000Z")).toBe("10 Oct");
    // 20:00 UTC is 01:30 the next morning in India.
    expect(formatShortDay("2026-10-10T20:00:00.000Z")).toBe("11 Oct");
  });

  it("adds the time for activity lines", () => {
    expect(formatDayTime("2026-10-10T08:35:00.000Z")).toMatch(/^10 Oct,? 14:05$/);
  });
});

describe("upsertComment", () => {
  it("adds a new comment and replaces an edited one", () => {
    const a = comment({ id: "a", body: "one" });
    expect(upsertComment([a], comment({ id: "b" })).map((c) => c.id)).toEqual(["a", "b"]);
    expect(upsertComment([a], comment({ id: "a", body: "two" }))[0].body).toBe("two");
  });
});
```

```ts
// src/services/script-review.service.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { scriptReviewService } from "./script-review.service";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

describe("scriptReviewService", () => {
  it("reads the team review from the script's review route", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ review: { stage: "in_review" } }));
    expect(await scriptReviewService.getTeam("c1", "s1")).toEqual({ stage: "in_review" });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/clients/c1/scripts/s1/review");
  });

  it("posts a client comment on the token's link", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ comment: { id: "c9" } }, 201));
    const out = await scriptReviewService.postComment("golu-6f1c", {
      authorName: "Priya", body: "Blue?", part: { kind: "context" }, versionNumber: 1,
    });
    expect(out).toEqual({ id: "c9" });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/r/s/golu-6f1c/comments");
  });

  it("throws the server's words when an approval is refused", async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: "A newer version was shared. Reload to see it." }, 409));
    await expect(scriptReviewService.approve("golu-6f1c", { approverName: "Priya", versionNumber: 1 }))
      .rejects.toThrow("A newer version was shared. Reload to see it.");
  });

  it("throws when a post answers ok without a comment", async () => {
    vi.mocked(fetch).mockResolvedValue(json({}, 201));
    await expect(scriptReviewService.reply("c1", "s1", "x", "hi")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/script-review/__tests__/utils.test.ts src/services/script-review.service.test.ts`
Expected: FAIL with "Failed to resolve import ../utils" and "./script-review.service".

- [ ] **Step 3: Write the helpers**

```ts
// src/lib/script-review/utils.ts
import type { ScriptComment } from "./types";

// The team and its clients are in India; a fixed zone makes the server-rendered HTML and the
// browser agree on the day, whatever zone the server runs in.
const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const DAY_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata",
});

/** "10 Oct", as the board's "Version 2 · shared 10 Oct". */
export const formatShortDay = (iso: string) => DAY.format(new Date(iso));
/** "10 Oct, 14:05", for comments and activity lines. */
export const formatDayTime = (iso: string) => DAY_TIME.format(new Date(iso));

/** A comment the server returned, in the list at once: added, or replacing its older copy. */
export function upsertComment(comments: ScriptComment[], comment: ScriptComment): ScriptComment[] {
  return comments.some((c) => c.id === comment.id)
    ? comments.map((c) => (c.id === comment.id ? comment : c))
    : [...comments, comment];
}
```

- [ ] **Step 4: Write the service**

```ts
// src/services/script-review.service.ts
import type { PublicScriptReview, TeamScriptReview } from "@/lib/script-review/assemble";
import type { ShareScope, TeamStageMove } from "@/lib/script-review/constants";
import type { Part, ScriptComment } from "@/lib/script-review/types";
import type { ScriptStage } from "@/lib/scripts/constants";
import { readJson } from "./read-json";

const send = (url: string, method: "POST" | "PATCH", body: unknown) =>
  fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function readComment(res: Response, fallback: string): Promise<ScriptComment> {
  const { comment } = await readJson<{ comment?: ScriptComment }>(res, fallback);
  if (!comment) throw new Error(fallback);
  return comment;
}

// Script copilot spec 4. Team calls go through the session (/api/clients/:id/scripts/:id/review/…);
// public calls are scoped by the link alone (/api/r/s/:token/…), as D309.
class ScriptReviewService {
  private base(clientId: string, scriptId: string) {
    return `/api/clients/${clientId}/scripts/${scriptId}/review`;
  }

  async getTeam(clientId: string, scriptId: string): Promise<TeamScriptReview> {
    const res = await fetch(this.base(clientId, scriptId), { cache: "no-store" });
    return (await readJson<{ review: TeamScriptReview }>(res, "Could not load the review.")).review;
  }

  async moveStage(clientId: string, scriptId: string, move: TeamStageMove): Promise<ScriptStage> {
    const res = await send(`${this.base(clientId, scriptId)}/stage`, "POST", { move });
    return (await readJson<{ stage: ScriptStage }>(res, "Could not move the script.")).stage;
  }

  async share(
    clientId: string,
    scriptId: string,
    scope: ShareScope,
  ): Promise<{ version: { number: number; scope: ShareScope; sharedAt: string }; shareToken: string }> {
    const res = await send(`${this.base(clientId, scriptId)}/share`, "POST", { scope });
    return readJson<{ version: { number: number; scope: ShareScope; sharedAt: string }; shareToken: string }>(
      res,
      "Could not share the script.",
    );
  }

  async reply(clientId: string, scriptId: string, commentId: string, body: string): Promise<ScriptComment> {
    const res = await send(`${this.base(clientId, scriptId)}/comments/${commentId}/replies`, "POST", { body });
    return readComment(res, "Could not post the reply.");
  }

  async setResolved(clientId: string, scriptId: string, commentId: string, resolved: boolean): Promise<ScriptComment> {
    const res = await send(`${this.base(clientId, scriptId)}/comments/${commentId}`, "PATCH", { resolved });
    return readComment(res, "Could not update the thread.");
  }

  async getPublic(token: string): Promise<PublicScriptReview> {
    const res = await fetch(`/api/r/s/${token}`, { cache: "no-store" });
    return readJson<PublicScriptReview>(res, "Could not load the review.");
  }

  async postComment(
    token: string,
    input: { authorName: string; body: string; part: Part; versionNumber: number },
  ): Promise<ScriptComment> {
    return readComment(await send(`/api/r/s/${token}/comments`, "POST", input), "Could not post the comment.");
  }

  async editComment(token: string, commentId: string, input: { editorName: string; body: string }): Promise<ScriptComment> {
    return readComment(await send(`/api/r/s/${token}/comments/${commentId}`, "PATCH", input), "Could not save the edit.");
  }

  async approve(token: string, input: { approverName: string; versionNumber: number }): Promise<void> {
    await readJson(await send(`/api/r/s/${token}/approve`, "POST", input), "Could not approve the reel.");
  }
}

export const scriptReviewService = new ScriptReviewService();
```

- [ ] **Step 5: Write the hooks**

```ts
// src/hooks/queries/script-review.ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { scriptReviewService } from "@/services/script-review.service";
import { scriptKeys } from "@/hooks/queries/scripts";
import { upsertComment } from "@/lib/script-review/utils";
import type { PublicScriptReview } from "@/lib/script-review/assemble";
import type { ShareScope, TeamStageMove } from "@/lib/script-review/constants";
import type { Part, ScriptComment } from "@/lib/script-review/types";

// Script copilot spec 4, through TanStack Query (CLAUDE.md, "Data fetching"). Keys are built here
// only. App defaults otherwise (staleTime 30 s, no polling): the client page refreshes after the
// client's own writes, the team view after the team's own writes and on load.
export const scriptReviewKeys = {
  team: (clientId: string, scriptId: string) => ["script-review", "team", clientId, scriptId] as const,
  public: (token: string) => ["script-review", "public", token] as const,
};

export function useTeamScriptReview(clientId: string, scriptId: string) {
  return useQuery({
    queryKey: scriptReviewKeys.team(clientId, scriptId),
    queryFn: () => scriptReviewService.getTeam(clientId, scriptId),
    enabled: Boolean(clientId && scriptId),
  });
}

export function useMoveScriptStage(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (move: TeamStageMove) => scriptReviewService.moveStage(clientId, scriptId, move),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: scriptReviewKeys.team(clientId, scriptId) });
      // The library's stage filter and the gallery's Scripts tab (approved scripts) read these.
      void queryClient.invalidateQueries({ queryKey: scriptKeys.all(clientId) });
    },
  });
}

export function useShareScript(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scope: ShareScope) => scriptReviewService.share(clientId, scriptId, scope),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: scriptReviewKeys.team(clientId, scriptId) }),
  });
}

export function useReplyToThread(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      scriptReviewService.reply(clientId, scriptId, commentId, body),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: scriptReviewKeys.team(clientId, scriptId) }),
  });
}

export function useResolveThread(clientId: string, scriptId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, resolved }: { commentId: string; resolved: boolean }) =>
      scriptReviewService.setResolved(clientId, scriptId, commentId, resolved),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: scriptReviewKeys.team(clientId, scriptId) }),
  });
}

/** Seeded with what the page rendered on the server, so the first paint never refetches. */
export function usePublicScriptReview(token: string, initial: PublicScriptReview) {
  return useQuery({
    queryKey: scriptReviewKeys.public(token),
    queryFn: () => scriptReviewService.getPublic(token),
    initialData: initial,
  });
}

function usePublicWrite<TInput>(token: string, write: (input: TInput) => Promise<ScriptComment | void>) {
  const queryClient = useQueryClient();
  const key = scriptReviewKeys.public(token);
  return useMutation({
    mutationFn: write,
    onSuccess: (comment) => {
      if (comment) {
        queryClient.setQueryData<PublicScriptReview>(key, (r) => (r ? { ...r, comments: upsertComment(r.comments, comment) } : r));
      }
    },
    // After success the list is already right; after a refusal (a newer version, an approval) the
    // page is behind. Either way, refresh in the background.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function usePostScriptComment(token: string) {
  return usePublicWrite(token, (input: { authorName: string; body: string; part: Part; versionNumber: number }) =>
    scriptReviewService.postComment(token, input),
  );
}

export function useEditScriptComment(token: string) {
  return usePublicWrite(token, ({ commentId, ...input }: { commentId: string; editorName: string; body: string }) =>
    scriptReviewService.editComment(token, commentId, input),
  );
}

export function useApproveScript(token: string) {
  return usePublicWrite(token, (input: { approverName: string; versionNumber: number }) => scriptReviewService.approve(token, input));
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/script-review src/services/script-review.service.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/script-review/utils.ts src/lib/script-review/__tests__/utils.test.ts src/services/script-review.service.ts src/services/script-review.service.test.ts src/hooks/queries/script-review.ts
git commit -m "feat(script-review): browser service and query hooks for the team and the client"
```

---

### Task 14: Room in the one script view (MP3)

**Files:**
- Create: `src/lib/scripts/anchors.ts`
- Create: `src/lib/script-review/anchors.ts`
- Create: `src/components/scripts/script-view-slots.ts`
- Modify: `src/components/scripts/script-view.tsx`
- Modify: `src/components/scripts/script-context-card.tsx` (one attribute)
- Modify: `src/components/scripts/script-cast-list.tsx`
- Modify: `src/components/scripts/script-shot-list.tsx`
- Modify: `src/components/scripts/script-shot-row.tsx`
- Test: `src/components/scripts/__tests__/script-view.test.tsx`

**Interfaces:**
- Consumes: `CastMember`, `Shot`, `Script` (spec 1); `Part` (Task 1).
- Produces: `SCRIPT_CONTEXT_ANCHOR`, `castAnchor(castId)`, `shotAnchor(shotId)` (`src/lib/scripts/anchors.ts`); `partAnchor(part): string` (`src/lib/script-review/anchors.ts`); `ScriptViewSlots = { context?: ReactNode; castMember?: (m: CastMember) => ReactNode; shot?: (s: Shot) => ReactNode }`; `ScriptView({ script: Pick<Script, "doc" | "stage">, avatarFaces, slots? })`; `ScriptCastList` gains `renderExtra?`; `ScriptShotList` gains `renderAfter?`; `ScriptShotRow` gains `after?`.

Every edit here is additive (Global Constraints). With no slots, the view renders as spec 1 built it, plus anchor ids.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/scripts/__tests__/script-view.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScriptView } from "../script-view";
import { reelDoc } from "@/lib/script-review/__tests__/fixtures";

describe("ScriptView slots (MP3)", () => {
  it("renders spec 1's view with anchors and nothing else when no slots are given", () => {
    const html = renderToStaticMarkup(<ScriptView script={{ doc: reelDoc(), stage: "visualise" }} avatarFaces={{}} />);
    expect(html).toContain('id="script-context"');
    expect(html).toContain('id="cast-meenakshi"');
    expect(html).toContain('id="shot-s04"');
    expect(html).not.toContain("data-slot-test");
  });

  it("puts each slot beside its own part", () => {
    const html = renderToStaticMarkup(
      <ScriptView
        script={{ doc: reelDoc(), stage: "visualise" }}
        avatarFaces={{}}
        slots={{
          context: <span data-slot-test="context" />,
          castMember: (m) => <span data-slot-test={`cast-${m.id}`} />,
          shot: (s) => <span data-slot-test={`shot-${s.id}`} />,
        }}
      />,
    );
    expect(html).toContain('data-slot-test="context"');
    expect(html.match(/data-slot-test="shot-/g)).toHaveLength(14);
    const husband = html.slice(html.indexOf('id="cast-husband"'));
    expect(husband).toContain('data-slot-test="cast-husband"');
    const s04 = html.slice(html.indexOf('id="shot-s04"'), html.indexOf('id="shot-s05"'));
    expect(s04).toContain('data-slot-test="shot-s04"');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/scripts/__tests__/script-view.test.tsx`
Expected: FAIL: no `id="script-context"` in the markup (and a type error on `slots`). If vitest cannot transform the JSX at all, stop and report it rather than adding config; the repo's `tsconfig.json` sets `"jsx": "react-jsx"`, which vitest's esbuild reads.

- [ ] **Step 3: Write the anchors and the slot type**

```ts
// src/lib/scripts/anchors.ts
// Ids the script view puts on its parts, so a link can jump to one ("S1 revised" jumps to S1,
// spec 4 §7). One place builds them.
const safe = (id: string) => id.replace(/\s+/g, "-");
export const SCRIPT_CONTEXT_ANCHOR = "script-context";
export const castAnchor = (castId: string) => `cast-${safe(castId)}`;
export const shotAnchor = (shotId: string) => `shot-${safe(shotId)}`;
```

```ts
// src/lib/script-review/anchors.ts
import { SCRIPT_CONTEXT_ANCHOR, castAnchor, shotAnchor } from "@/lib/scripts/anchors";
import type { Part } from "./types";

/** Where on the page a part sits: a view sits in its cast member's slot, a panel in its shot's row. */
export function partAnchor(part: Part): string {
  switch (part.kind) {
    case "context":
      return SCRIPT_CONTEXT_ANCHOR;
    case "shot":
    case "panel":
      return shotAnchor(part.shotId);
    case "cast":
    case "view":
      return castAnchor(part.castId);
  }
}
```

```ts
// src/components/scripts/script-view-slots.ts
import type { ReactNode } from "react";
import type { CastMember, Shot } from "@/lib/scripts/schema";

/** Room beside each part of spec 1's one script view for the later specs' work (parent spec
 *  §4a.1). Every slot is optional; with none, the view is spec 1's.
 *  MERGE POINT (MP3, spec 3): Visualise puts the avatar maker in the cast slot and the panel beside
 *  each shot. If both specs fill one slot, the page renders both in a fragment. */
export type ScriptViewSlots = {
  /** Under the context card. */
  context?: ReactNode;
  /** In each cast member's slot, full width under the person. */
  castMember?: (member: CastMember) => ReactNode;
  /** In each shot's row, full width under its columns. */
  shot?: (shot: Shot) => ReactNode;
};
```

- [ ] **Step 4: Extend the view and its parts**

Replace `src/components/scripts/script-view.tsx` with:

```tsx
import type { Script } from "@/lib/scripts/schema";
import { ScriptContextCard } from "./script-context-card";
import { ScriptCastList } from "./script-cast-list";
import { ScriptShotList } from "./script-shot-list";
import type { ScriptViewSlots } from "./script-view-slots";

/** Spec 1 §4 — the one script view. Read-only here; Generate, Visualise and Client review
 *  (specs 2 to 4) put their work around it rather than drawing the script their own way. It reads
 *  only the doc and the stage, so the client's page can pass a frozen version (spec 4). */
export function ScriptView({
  script,
  avatarFaces,
  slots,
}: {
  script: Pick<Script, "doc" | "stage">;
  avatarFaces: Record<string, string | null>;
  slots?: ScriptViewSlots;
}) {
  const card = <ScriptContextCard doc={script.doc} stage={script.stage} />;
  return (
    <div className="flex flex-col gap-8">
      {slots?.context ? (
        <div className="flex flex-col gap-3">
          {card}
          {slots.context}
        </div>
      ) : (
        card
      )}
      <ScriptCastList cast={script.doc.cast} avatarFaces={avatarFaces} renderExtra={slots?.castMember} />
      <ScriptShotList shots={script.doc.shots} cast={script.doc.cast} renderAfter={slots?.shot} />
    </div>
  );
}
```

In `src/components/scripts/script-context-card.tsx`, add `import { SCRIPT_CONTEXT_ANCHOR } from "@/lib/scripts/anchors";` and put `id={SCRIPT_CONTEXT_ANCHOR}` on the `<section aria-label="Context" …>` element. Nothing else changes.

Replace `src/components/scripts/script-cast-list.tsx` with (the changes: the `renderExtra` prop, the `id`, `flex-wrap` on the slot, `flex-1` on the text column so it stays beside the face, and the extra row):

```tsx
import type { ReactNode } from "react";
import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { castAnchor } from "@/lib/scripts/anchors";
import type { CastMember } from "@/lib/scripts/schema";

export function ScriptCastList({
  cast,
  avatarFaces,
  renderExtra,
}: {
  cast: CastMember[];
  avatarFaces: Record<string, string | null>;
  renderExtra?: (member: CastMember) => ReactNode;
}) {
  return (
    <section aria-label="Cast" className="flex flex-col gap-3">
      <h2 className="text-eyebrow">Cast</h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {cast.map((c) => {
          const face = c.avatarId ? avatarFaces[c.avatarId] ?? null : null;
          const extra = renderExtra?.(c);
          return (
            <li key={c.id} id={castAnchor(c.id)} className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-3">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                {face ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={face} alt={`${c.name}, avatar`} className="size-full object-cover" />
                ) : (
                  <UserRound className="absolute inset-0 m-auto size-6 text-muted-foreground/50" strokeWidth={1.5} aria-hidden />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  {c.isLead && <Badge variant="outline">Lead</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{c.description}</p>
                {!c.avatarId && <span className="text-xs text-muted-foreground">No avatar yet</span>}
              </div>
              {extra ? <div className="basis-full">{extra}</div> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

In `src/components/scripts/script-shot-list.tsx`: add `import type { ReactNode } from "react";`, change the signature to

```tsx
export function ScriptShotList({
  shots,
  cast,
  renderAfter,
}: {
  shots: Shot[];
  cast: CastMember[];
  renderAfter?: (shot: Shot) => ReactNode;
}) {
```

and in both places that render a row, pass the slot:

```tsx
<ScriptShotRow key={t.shot.id} timed={t} cast={cast} after={renderAfter?.(t.shot)} />
```

Replace `src/components/scripts/script-shot-row.tsx` with:

```tsx
import type { ReactNode } from "react";
import { shotAnchor } from "@/lib/scripts/anchors";
import type { CastMember } from "@/lib/scripts/schema";
import { formatRange, type TimedShot } from "@/lib/scripts/timeline";

/** Shared with the column header in ScriptShotList so the two always line up. */
export const SHOT_GRID = "md:grid-cols-[4.5rem_minmax(0,2.2fr)_minmax(0,1.8fr)_minmax(0,1.2fr)_8rem]";

export function ScriptShotRow({ timed, cast, after }: { timed: TimedShot; cast: CastMember[]; after?: ReactNode }) {
  const { shot } = timed;
  const names = shot.onScreen.map((id) => cast.find((c) => c.id === id)?.name).filter(Boolean);
  return (
    <li id={shotAnchor(shot.id)} className={`grid gap-3 border-b border-border px-4 py-3 last:border-b-0 ${SHOT_GRID}`}>
      <span className="flex flex-col text-sm tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground">S{timed.index + 1}</span>
        {formatRange(timed.start, timed.end)}
      </span>
      <span className="text-sm">{shot.visual}</span>
      <span className="text-sm text-muted-foreground">{shot.vo}</span>
      <span className="text-sm font-medium">{shot.onScreenText}</span>
      <span className="text-xs text-muted-foreground">{names.length > 0 ? names.join(", ") : "Nobody (B-roll)"}</span>
      {after ? <div className="md:col-span-5">{after}</div> : null}
    </li>
  );
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run src/components/scripts src/lib/scripts && npx tsc --noEmit`
Expected: PASS; no type errors (the script page and gallery tab still pass a full `Script`, which fits `Pick<Script, "doc" | "stage">`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/scripts/anchors.ts src/lib/script-review/anchors.ts src/components/scripts
git commit -m "feat(scripts): optional slots and anchors on the one script view (spec 4 merge point MP3)"
```

---

### Task 15: The client's page

**Files:**
- Create: `src/hooks/use-is-server-or-hydrating.ts`
- Modify: `src/components/client-review/client-review-page.tsx` (import the extracted hook)
- Modify: `src/components/client-review/name-gate.tsx` (optional `blurb`)
- Create in `src/components/script-review/`: `review-surface-context.tsx`, `part-composer.tsx`, `thread-comment.tsx`, `comment-thread.tsx`, `part-comments.tsx`, `part-link.tsx`, `voice-sample-button.tsx`, `avatar-views.tsx`, `cast-review-slot.tsx`, `shot-review-slot.tsx`, `add-comment.tsx`, `comments-column.tsx`, `activity-list.tsx`, `approve-reel.tsx`, `scope-note.tsx`, `script-review-header.tsx`, `script-review-page.tsx`
- Create: `src/app/r/s/[token]/page.tsx`, and `not-found.tsx`, `loading.tsx`, `error.tsx` there (re-exports of D309's)

**Interfaces:**
- Consumes: `ScriptView`, `ScriptViewSlots` (Task 14); `partAnchor` (Task 14); hooks (Task 13); `buildThreads`, `placeThreads`, `openThreads`, `approveConfirmText`, `PlacedThreads` (Task 3); `partKey`, `partLabel`, `partOrder`, `versionParts` (Task 1); `scopeIncludes`, `AVATAR_VIEWS`, `AVATAR_VIEW_LABEL` (Task 1); `formatShortDay`, `formatDayTime` (Task 13); D309's `NameGate`, `PREPAINT_SCRIPT`, `browserStore`, `readReviewerName`, `saveReviewerName`, `clearReviewerName`; `COMMENT_BODY_MAX`; `errorMessage` from `@/lib/avatars/utils`; `toast` from `sonner` (the root layout mounts `<Toaster />` on every route, `/r/*` included); for the route page, `toCanonicalShareToken` (D311), `getScriptReviewByToken` (Task 5), `buildPublicScriptReview` (Task 7).
- Produces: `ReviewSurface`, `ReviewSurfaceProvider`, `useReviewSurface()`; `PartComments({ part, label? })`, `CastReviewSlot({ member, avatar? })`, `ShotReviewSlot({ shot, panel? })`, `CommentsColumn()`, `ActivityList({ lines })`, `PartLink({ part, label })`, `ScriptReviewPage({ token, initial })` (rendered by `src/app/r/s/[token]/page.tsx`); `useIsServerOrHydrating()`.

There is no component-test setup beyond Task 14's markup test, so this task is verified in the running app (Step 7).

- [ ] **Step 1: Extract the hydration hook (second user) and widen the name gate**

```ts
// src/hooks/use-is-server-or-hydrating.ts
import { useSyncExternalStore } from "react";

// True while the HTML is made on the server and while React hydrates it; false for every render
// React does purely in the browser. The review pages use it to emit their pre-paint name script
// only in the server HTML (D309).
const noSubscribe = () => () => {};

export function useIsServerOrHydrating(): boolean {
  return useSyncExternalStore(noSubscribe, () => false, () => true);
}
```

In `src/components/client-review/client-review-page.tsx`, delete the local `noSubscribe` and `useIsServerOrHydrating` (and `useSyncExternalStore` from the React import), and add `import { useIsServerOrHydrating } from "@/hooks/use-is-server-or-hydrating";`. Behaviour is unchanged.

In `src/components/client-review/name-gate.tsx`, add an optional prop and use it for the paragraph; the video page keeps its words:

```tsx
export function NameGate({
  title,
  onSubmit,
  blurb = "Watch the cut and leave comments for the team.",
}: {
  title: string;
  onSubmit: (name: string) => void;
  blurb?: string;
}) {
```

and replace the paragraph's text with `{blurb}`.

- [ ] **Step 2: Write the shared surface (context, composer, threads, part comments)**

```tsx
// src/components/script-review/review-surface-context.tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { PlacedThreads } from "@/lib/script-review/threads";
import type { Part } from "@/lib/script-review/types";

// What every comment control on a review page needs, given once (docs/component-structure.md: no
// prop drilling). The client's page and the team's view fill it differently.
export type ReviewSurface = {
  mode: "client" | "team";
  /** The script on screen: the frozen version for the client, the live script for the team. */
  doc: ScriptDoc;
  placed: PlacedThreads;
  /** Parts the client may comment on now, by part key. Empty for the team, and after approval. */
  commentable: ReadonlyMap<string, Part>;
  onPost?: (part: Part, body: string) => Promise<void>;
  onEdit?: (commentId: string, body: string) => Promise<void>;
  onReply?: (commentId: string, body: string) => Promise<void>;
  onResolve?: (commentId: string, resolved: boolean) => Promise<void>;
};

const SurfaceContext = createContext<ReviewSurface | null>(null);

export function ReviewSurfaceProvider({ value, children }: { value: ReviewSurface; children: ReactNode }) {
  return <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>;
}

export function useReviewSurface(): ReviewSurface {
  const value = useContext(SurfaceContext);
  if (!value) throw new Error("useReviewSurface must be used inside ReviewSurfaceProvider.");
  return value;
}
```

```tsx
// src/components/script-review/part-composer.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { COMMENT_BODY_MAX } from "@/lib/client-review/constants";
import { errorMessage } from "@/lib/avatars/utils";

/** One text box for a new comment, a reply or an edit. One post per tap; the error stays beside it. */
export function PartComposer({
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  initial = "",
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
  initial?: string;
}) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body);
      setBody("");
    } catch (e) {
      setError(errorMessage(e, "Could not post."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={COMMENT_BODY_MAX}
        placeholder={placeholder}
        autoFocus
        className="min-h-16 text-base md:text-sm"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button size="sm" onClick={submit} disabled={busy || !body.trim()}>
          {busy ? "Saving…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
```

```tsx
// src/components/script-review/thread-comment.tsx
"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDayTime } from "@/lib/script-review/utils";
import type { ScriptComment } from "@/lib/script-review/types";
import { useReviewSurface } from "./review-surface-context";
import { PartComposer } from "./part-composer";

/** One comment or reply. From the link, only client comments are editable; never deleted (D352). */
export function ThreadComment({ comment }: { comment: ScriptComment }) {
  const { mode, onEdit } = useReviewSurface();
  const [editing, setEditing] = useState(false);
  const canEdit = mode === "client" && comment.authorKind === "client" && Boolean(onEdit);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{comment.authorName}</span>
        {comment.authorKind === "team" && <Badge variant="secondary">Team</Badge>}
        <span className="text-xs text-muted-foreground">{formatDayTime(comment.createdAt)}</span>
        {canEdit && !editing && (
          <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
      {editing && onEdit ? (
        <PartComposer
          initial={comment.body}
          placeholder="Your comment"
          submitLabel="Save"
          onSubmit={async (body) => {
            await onEdit(comment.id, body);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm">{comment.body}</p>
      )}
      {comment.editedByName && !editing && <p className="text-xs text-muted-foreground">edited by {comment.editedByName}</p>}
    </div>
  );
}
```

```tsx
// src/components/script-review/comment-thread.tsx
"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { errorMessage } from "@/lib/avatars/utils";
import type { Thread } from "@/lib/script-review/types";
import { useReviewSurface } from "./review-surface-context";
import { PartComposer } from "./part-composer";
import { ThreadComment } from "./thread-comment";

/** A client's comment, the team's replies under it, and the Resolved mark (spec 4 §5). */
export function CommentThread({ thread }: { thread: Thread }) {
  const { onReply, onResolve } = useReviewSurface();
  const [replying, setReplying] = useState(false);
  const [busy, setBusy] = useState(false);

  async function toggleResolved() {
    if (!onResolve || busy) return;
    setBusy(true);
    try {
      await onResolve(thread.root.id, !thread.resolved);
    } catch (e) {
      toast.error(errorMessage(e, "Could not update the thread."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={cn("flex flex-col gap-3 rounded-lg border border-border bg-card p-3", thread.resolved && "bg-muted/40")}>
      <ThreadComment comment={thread.root} />
      {thread.replies.length > 0 && (
        <ul className="flex flex-col gap-3 border-l-2 border-border pl-3">
          {thread.replies.map((r) => (
            <li key={r.id}>
              <ThreadComment comment={r} />
            </li>
          ))}
        </ul>
      )}
      {(thread.resolved || onReply || onResolve) && (
        <div className="flex flex-wrap items-center gap-2">
          {thread.resolved && (
            <Badge variant="outline">
              <Check strokeWidth={1.5} />
              Resolved{thread.root.resolvedByName ? ` by ${thread.root.resolvedByName}` : ""}
            </Badge>
          )}
          {onReply && !replying && (
            <Button variant="ghost" size="xs" onClick={() => setReplying(true)}>
              Reply
            </Button>
          )}
          {onResolve && (
            <Button variant="ghost" size="xs" onClick={toggleResolved} disabled={busy}>
              {thread.resolved ? "Reopen thread" : "Resolve"}
            </Button>
          )}
        </div>
      )}
      {replying && onReply && (
        <PartComposer
          placeholder="Reply to the client"
          submitLabel="Reply"
          onSubmit={async (body) => {
            await onReply(thread.root.id, body);
            setReplying(false);
          }}
          onCancel={() => setReplying(false)}
        />
      )}
    </li>
  );
}
```

```tsx
// src/components/script-review/part-comments.tsx
"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { partKey } from "@/lib/script-review/parts";
import type { Part } from "@/lib/script-review/types";
import { useReviewSurface } from "./review-surface-context";
import { CommentThread } from "./comment-thread";
import { PartComposer } from "./part-composer";

/** Spec 4 §4–§6: one part's comment action, its marker (the count), and its threads beside it.
 *  Renders nothing for a part with no threads that cannot take a comment now. */
export function PartComments({ part, label }: { part: Part; label?: string }) {
  const { placed, commentable, onPost } = useReviewSurface();
  const [writing, setWriting] = useState(false);
  const key = partKey(part);
  const threads = placed.byPart.get(key) ?? [];
  const canComment = Boolean(onPost) && commentable.has(key);
  if (threads.length === 0 && !canComment) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {label && <span className="text-eyebrow">{label}</span>}
        {threads.length > 0 && (
          <span className="text-xs font-medium tabular-nums text-muted-foreground">
            {threads.length} {threads.length === 1 ? "comment" : "comments"}
          </span>
        )}
        {canComment && !writing && (
          <Button
            variant="outline"
            size="xs"
            className="ml-auto border-dashed border-primary/40 text-primary hover:bg-primary/5"
            onClick={() => setWriting(true)}
          >
            <MessageSquarePlus strokeWidth={1.5} />
            Comment
          </Button>
        )}
      </div>
      {threads.length > 0 && (
        <ul className="flex flex-col gap-2">
          {threads.map((t) => (
            <CommentThread key={t.root.id} thread={t} />
          ))}
        </ul>
      )}
      {writing && onPost && (
        <PartComposer
          placeholder="Your comment"
          submitLabel="Post"
          onSubmit={async (body) => {
            await onPost(part, body);
            setWriting(false);
          }}
          onCancel={() => setWriting(false)}
        />
      )}
    </div>
  );
}
```

```tsx
// src/components/script-review/part-link.tsx
"use client";

import { Button } from "@/components/ui/button";
import { partAnchor } from "@/lib/script-review/anchors";
import type { Part } from "@/lib/script-review/types";

/** A part's name that jumps to it on the page ("S1 revised" jumps to S1, spec 4 §7). */
export function PartLink({ part, label }: { part: Part; label: string }) {
  return (
    <Button
      variant="link"
      className="h-auto self-start p-0 text-sm font-medium"
      onClick={() => document.getElementById(partAnchor(part))?.scrollIntoView({ behavior: "smooth", block: "center" })}
    >
      {label}
    </Button>
  );
}
```

- [ ] **Step 3: Write the cast and shot slots**

```tsx
// src/components/script-review/voice-sample-button.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Plays a voice sample without a native audio control (CLAUDE.md: shadcn controls only). */
export function VoiceSampleButton({ url }: { url: string }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const ref = audio;
    return () => ref.current?.pause();
  }, []);

  function toggle() {
    if (!audio.current) {
      audio.current = new Audio(url);
      audio.current.addEventListener("ended", () => setPlaying(false));
    }
    if (playing) {
      audio.current.pause();
      setPlaying(false);
      return;
    }
    audio.current.play().then(() => setPlaying(true), () => setPlaying(false));
  }

  return (
    <Button variant="outline" size="xs" onClick={toggle}>
      {playing ? <Pause strokeWidth={1.5} /> : <Play strokeWidth={1.5} />}
      {playing ? "Pause" : "Play sample"}
    </Button>
  );
}
```

```tsx
// src/components/script-review/avatar-views.tsx
"use client";

import { AVATAR_VIEWS, AVATAR_VIEW_LABEL } from "@/lib/script-review/constants";
import type { AvatarSnapshot } from "@/lib/script-review/types";
import { PartComments } from "./part-comments";
import { VoiceSampleButton } from "./voice-sample-button";

/** Spec 4 §4–§5: the avatar's views as shared, each with its own comments, and its voice. */
export function AvatarViews({ castId, avatar }: { castId: string; avatar: AvatarSnapshot }) {
  const views = AVATAR_VIEWS.filter((v) => avatar.views[v]);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {views.map((view) => (
          <figure key={view} className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatar.views[view] ?? ""}
              alt={`${avatar.name}, ${AVATAR_VIEW_LABEL[view].toLowerCase()} view`}
              className="aspect-[3/4] w-full rounded-lg border border-border bg-muted object-cover"
            />
            <figcaption className="text-xs text-muted-foreground">{AVATAR_VIEW_LABEL[view]}</figcaption>
            <PartComments part={{ kind: "view", castId, view }} />
          </figure>
        ))}
      </div>
      {avatar.voice && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-eyebrow">Voice</span>
          {avatar.voice.name && <span>{avatar.voice.name}</span>}
          {avatar.voice.sampleUrl && <VoiceSampleButton url={avatar.voice.sampleUrl} />}
        </div>
      )}
    </div>
  );
}
```

```tsx
// src/components/script-review/cast-review-slot.tsx
"use client";

import { AVATAR_VIEWS, AVATAR_VIEW_LABEL } from "@/lib/script-review/constants";
import type { CastMember } from "@/lib/scripts/schema";
import type { AvatarSnapshot } from "@/lib/script-review/types";
import { useReviewSurface } from "./review-surface-context";
import { AvatarViews } from "./avatar-views";
import { PartComments } from "./part-comments";

/** What review puts in a cast member's slot: the shared avatar (client, on a share with avatars) and
 *  the comments on the person and on each view. */
export function CastReviewSlot({ member, avatar }: { member: CastMember; avatar?: AvatarSnapshot }) {
  const { mode } = useReviewSurface();
  return (
    <div className="flex flex-col gap-3 pt-1">
      {avatar && <AvatarViews castId={member.id} avatar={avatar} />}
      <PartComments part={{ kind: "cast", castId: member.id }} label={avatar ? "Avatar" : undefined} />
      {/* MERGE POINT (MP4, spec 3): until Visualise draws the four views in the team's view, a
          view's threads sit here, labelled. At merge, move them beside spec 3's views. */}
      {mode === "team" &&
        AVATAR_VIEWS.map((view) => (
          <PartComments key={view} part={{ kind: "view", castId: member.id, view }} label={`${AVATAR_VIEW_LABEL[view]} view`} />
        ))}
    </div>
  );
}
```

```tsx
// src/components/script-review/shot-review-slot.tsx
"use client";

import type { Shot } from "@/lib/scripts/schema";
import type { PanelSnapshot } from "@/lib/script-review/types";
import { useReviewSurface } from "./review-surface-context";
import { PartComments } from "./part-comments";

/** What review puts in a shot's row: its frozen panel (client, on a full share) with the panel's
 *  comments, and the shot's own comments. On a phone the panel stacks above them (spec 4 §4). */
export function ShotReviewSlot({ shot, panel }: { shot: Shot; panel?: PanelSnapshot }) {
  const { mode } = useReviewSurface();
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start">
      {panel ? (
        <figure className="flex w-full max-w-48 flex-col gap-2 md:w-40 md:shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={panel.url} alt="Storyboard panel" className="aspect-[9/16] w-full rounded-lg border border-border bg-muted object-cover" />
          <PartComments part={{ kind: "panel", shotId: shot.id }} label="Panel" />
        </figure>
      ) : mode === "team" ? (
        // MERGE POINT (MP4, spec 3): the team's panel is spec 3's; until then panel threads sit here.
        <PartComments part={{ kind: "panel", shotId: shot.id }} label="Panel" />
      ) : null}
      <div className="min-w-0 flex-1">
        <PartComments part={{ kind: "shot", shotId: shot.id }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write the Comments column and the Activity list**

```tsx
// src/components/script-review/add-comment.tsx
"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { partKey, partLabel, partOrder } from "@/lib/script-review/parts";
import { useReviewSurface } from "./review-surface-context";
import { PartComposer } from "./part-composer";

/** The Comments column's "Add a comment": the same whole-part comment, choosing the part from a list. */
export function AddComment() {
  const { doc, commentable, onPost } = useReviewSurface();
  const parts = [...commentable.values()].sort((a, b) => partOrder(a, doc) - partOrder(b, doc));
  const items = parts.map((p) => ({ value: partKey(p), label: partLabel(p, doc) ?? "" }));
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(items[0]?.value ?? "");
  if (!onPost || parts.length === 0) return null;
  const part = commentable.get(selected) ?? parts[0];

  if (!open) {
    return (
      <Button
        variant="outline"
        className="self-start border-dashed border-primary/40 text-primary hover:bg-primary/5"
        onClick={() => setOpen(true)}
      >
        <Plus strokeWidth={1.5} />
        Add a comment
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      {/* `items` makes SelectValue show the part's name, not its key (Base UI Select). */}
      <Select items={items} value={selected} onValueChange={(v) => v && setSelected(v)}>
        <SelectTrigger className="w-full" aria-label="Which part">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <PartComposer
        placeholder="Your comment"
        submitLabel="Post"
        onSubmit={async (body) => {
          await onPost(part, body);
          setOpen(false);
        }}
        onCancel={() => setOpen(false)}
      />
    </div>
  );
}
```

```tsx
// src/components/script-review/comments-column.tsx
"use client";

import { partLabel, partOrder } from "@/lib/script-review/parts";
import { useReviewSurface } from "./review-surface-context";
import { AddComment } from "./add-comment";
import { CommentThread } from "./comment-thread";
import { PartLink } from "./part-link";

/** Spec 4 §4, §6: every thread, labelled with its part in page order, then "On a removed shot". */
export function CommentsColumn() {
  const { placed, doc, mode } = useReviewSurface();
  const groups = [...placed.byPart.values()]
    .map((threads) => ({ part: threads[0].root.part, threads }))
    .sort((a, b) => partOrder(a.part, doc) - partOrder(b.part, doc));
  const total = groups.reduce((n, g) => n + g.threads.length, 0) + placed.removed.reduce((n, r) => n + r.threads.length, 0);

  return (
    <section aria-label="Comments" className="flex flex-col gap-4">
      <h2 className="text-eyebrow">Comments{total > 0 ? ` · ${total}` : ""}</h2>
      {total === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
      {groups.map((g) => {
        const label = partLabel(g.part, doc);
        return (
          <div key={g.threads[0].root.id} className="flex flex-col gap-2">
            {label ? <PartLink part={g.part} label={label} /> : <span className="text-sm font-medium">Not in this version</span>}
            <ul className="flex flex-col gap-2">
              {g.threads.map((t) => (
                <CommentThread key={t.root.id} thread={t} />
              ))}
            </ul>
          </div>
        );
      })}
      {placed.removed.length > 0 && (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <span className="text-eyebrow">On a removed shot</span>
          {placed.removed.map((r) => (
            <div key={r.shotId} className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{r.label}</span>
                {r.text ? ` · ${r.text}` : ""}
              </p>
              <ul className="flex flex-col gap-2">
                {r.threads.map((t) => (
                  <CommentThread key={t.root.id} thread={t} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {mode === "client" && <AddComment />}
    </section>
  );
}
```

```tsx
// src/components/script-review/activity-list.tsx
"use client";

import { formatDayTime } from "@/lib/script-review/utils";
import type { ActivityLine } from "@/lib/script-review/types";
import { PartLink } from "./part-link";

/** Spec 4 §7: the review's history, oldest first; a "revised" line links to each part. */
export function ActivityList({ lines }: { lines: ActivityLine[] }) {
  return (
    <section aria-label="Activity" className="flex flex-col gap-3">
      <h2 className="text-eyebrow">Activity</h2>
      {lines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {lines.map((l) => (
            <li key={l.id} className="flex flex-col gap-0.5 text-sm">
              <span>{l.text}</span>
              {l.links.length > 0 && (
                <span className="flex flex-wrap gap-x-3">
                  {l.links.map((link) => (
                    <PartLink key={`${l.id}:${link.label}`} part={link.part} label={link.label} />
                  ))}
                </span>
              )}
              <span className="text-xs text-muted-foreground">{formatDayTime(l.at)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Write the header, scope note and Approve**

```tsx
// src/components/script-review/scope-note.tsx
import type { ShareScope } from "@/lib/script-review/constants";

// Spec 4 §12: a partial share must not read as the whole.
const NOTE: Record<ShareScope, string | null> = {
  script:
    "This share is the script, for your comments. The avatars and the storyboard come next; you approve the reel once you have seen them.",
  avatars: "This share is the script and the avatars, for your comments. The storyboard comes next; you approve the reel once you have seen it.",
  panels: null,
};

export function ScopeNote({ scope }: { scope: ShareScope }) {
  const text = NOTE[scope];
  if (!text) return null;
  return <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">{text}</p>;
}
```

```tsx
// src/components/script-review/approve-reel.tsx
"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { errorMessage } from "@/lib/avatars/utils";
import { approveConfirmText } from "@/lib/script-review/threads";
import type { Thread } from "@/lib/script-review/types";

/** Spec 4 §8: Approve reel. With open threads, a confirm names them first; the client decides. */
export function ApproveReel({ openThreads, onApprove }: { openThreads: Thread[]; onApprove: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirmText = approveConfirmText(openThreads);

  async function approve() {
    if (busy) return;
    setBusy(true);
    try {
      await onApprove();
      setConfirming(false);
    } catch (e) {
      toast.error(errorMessage(e, "Could not approve the reel."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={() => (confirmText ? setConfirming(true) : void approve())} disabled={busy}>
        <Check strokeWidth={1.5} />
        {busy ? "Approving…" : "Approve reel"}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve with open comments?</AlertDialogTitle>
            <AlertDialogDescription>{confirmText}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={approve} disabled={busy}>
              Approve anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

```tsx
// src/components/script-review/script-review-header.tsx
"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { PublicScriptReview } from "@/lib/script-review/assemble";
import { formatShortDay } from "@/lib/script-review/utils";

/** The board's header: "Yuvabe Studios × Jackfruit365 · for your review", the title, and
 *  "Version 2 · shared 10 Oct · read-only" — or, once approved, the record line. */
export function ScriptReviewHeader({
  review,
  name,
  onChangeName,
  action,
}: {
  review: PublicScriptReview;
  name: string | null;
  onChangeName: () => void;
  action?: ReactNode;
}) {
  const { version, approval } = review;
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-eyebrow text-muted-foreground">
          {review.fromName} × {review.forName} · for your review
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{version.doc.header.title}</h1>
        <p className="text-sm text-muted-foreground">
          Version {version.number} · shared {formatShortDay(version.sharedAt)} · read-only
        </p>
        {approval && (
          <p className="text-sm font-medium text-foreground">
            Approved on {formatShortDay(approval.at)} by {approval.byName}. This page is now a record of what was approved.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {name && <>{name} · </>}
          <Button variant="link" className="h-auto p-0 text-sm" onClick={onChangeName}>
            change
          </Button>
        </p>
        {action}
      </div>
    </header>
  );
}
```

- [ ] **Step 6: Write the page component**

```tsx
// src/components/script-review/script-review-page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { NameGate } from "@/components/client-review/name-gate";
import { ScriptView } from "@/components/scripts/script-view";
import type { ScriptViewSlots } from "@/components/scripts/script-view-slots";
import { useIsServerOrHydrating } from "@/hooks/use-is-server-or-hydrating";
import { useApproveScript, useEditScriptComment, usePostScriptComment, usePublicScriptReview } from "@/hooks/queries/script-review";
import {
  PREPAINT_SCRIPT, browserStore, clearReviewerName, readReviewerName, saveReviewerName,
} from "@/lib/client-review/reviewer-name";
import type { PublicScriptReview } from "@/lib/script-review/assemble";
import { scopeIncludes } from "@/lib/script-review/constants";
import { partKey, versionParts } from "@/lib/script-review/parts";
import { buildThreads, openThreads, placeThreads } from "@/lib/script-review/threads";
import { ActivityList } from "./activity-list";
import { ApproveReel } from "./approve-reel";
import { CastReviewSlot } from "./cast-review-slot";
import { CommentsColumn } from "./comments-column";
import { PartComments } from "./part-comments";
import { ReviewSurfaceProvider, type ReviewSurface } from "./review-surface-context";
import { ScopeNote } from "./scope-note";
import { ScriptReviewHeader } from "./script-review-header";
import { ShotReviewSlot } from "./shot-review-slot";

// D355: the client's page. Mobile-first like D309's: the name is asked once (the same stored name as
// the video review), then the shared version, read-only, with comments beside every part.
export function ScriptReviewPage({ token, initial }: { token: string; initial: PublicScriptReview }) {
  const { data: review } = usePublicScriptReview(token, initial);
  const post = usePostScriptComment(token);
  const edit = useEditScriptComment(token);
  const approve = useApproveScript(token);
  const [name, setName] = useState<string | null>(null);
  const serverPass = useIsServerOrHydrating();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration sync from localStorage, as D309's page
    setName(readReviewerName(browserStore()));
  }, []);

  const { version } = review;
  const threads = useMemo(() => buildThreads(review.comments), [review.comments]);
  const placed = useMemo(() => placeThreads(threads, version.doc, review.removedShots), [threads, version.doc, review.removedShots]);
  const commentable = useMemo(
    () => new Map(review.commentsOpen ? versionParts(version).map((p) => [partKey(p), p] as const) : []),
    [review.commentsOpen, version],
  );

  function typedName(): string {
    if (!name) throw new Error("Enter your name first.");
    return name;
  }

  const surface: ReviewSurface = {
    mode: "client",
    doc: version.doc,
    placed,
    commentable,
    onPost: review.commentsOpen
      ? async (part, body) => {
          await post.mutateAsync({ authorName: typedName(), body, part, versionNumber: version.number });
        }
      : undefined,
    onEdit: review.commentsOpen
      ? async (commentId, body) => {
          await edit.mutateAsync({ commentId, editorName: typedName(), body });
        }
      : undefined,
  };

  const showAvatars = scopeIncludes(version.scope, "avatars");
  const showPanels = scopeIncludes(version.scope, "panels");
  const avatarFaces = Object.fromEntries(
    showAvatars ? Object.values(version.visuals.avatars).map((a) => [a.avatarId, a.views.front]) : [],
  );
  const slots: ScriptViewSlots = {
    context: <PartComments part={{ kind: "context" }} />,
    castMember: (m) => <CastReviewSlot member={m} avatar={showAvatars ? version.visuals.avatars[m.id] : undefined} />,
    shot: (s) => <ShotReviewSlot shot={s} panel={showPanels ? version.visuals.panels[s.id] : undefined} />,
  };
  const approveAction = review.canApprove ? (
    <ApproveReel
      openThreads={openThreads(threads)}
      onApprove={async () => {
        await approve.mutateAsync({ approverName: typedName(), versionNumber: version.number });
      }}
    />
  ) : null;

  return (
    <div data-reviewer={name ? "known" : "unknown"} suppressHydrationWarning className="group/review flex min-h-dvh flex-col">
      {serverPass && <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />}

      <div className="group-data-[reviewer=known]/review:hidden">
        <NameGate
          title={version.doc.header.title}
          blurb="Read the reel and leave comments for the team."
          onSubmit={(n) => setName(saveReviewerName(browserStore(), n))}
        />
      </div>

      <div className="hidden flex-1 flex-col gap-6 px-4 py-6 group-data-[reviewer=known]/review:flex lg:mx-auto lg:w-full lg:max-w-6xl lg:px-6">
        <ScriptReviewHeader
          review={review}
          name={name}
          onChangeName={() => {
            clearReviewerName(browserStore());
            setName(null);
          }}
          action={approveAction}
        />
        <ScopeNote scope={version.scope} />
        <ReviewSurfaceProvider value={surface}>
          <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
            <ScriptView
              script={{ doc: version.doc, stage: review.approval ? "approved" : "in_review" }}
              avatarFaces={avatarFaces}
              slots={slots}
            />
            <aside className="flex flex-col gap-8 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto">
              <CommentsColumn />
              <ActivityList lines={review.activity} />
            </aside>
          </div>
        </ReviewSurfaceProvider>
      </div>
    </div>
  );
}
```

- [ ] **Step 6b: Write the route page and its segment files**

Moved here from Task 10 so the page and the component it renders land together.


```tsx
// src/app/r/s/[token]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { toCanonicalShareToken } from "@/lib/client-review/token";
import { getScriptReviewByToken } from "@/lib/db/script-reviews";
import { buildPublicScriptReview } from "@/lib/script-review/load";
import { ScriptReviewPage } from "@/components/script-review/script-review-page";

// D355: the client's page for a script. Server-rendered with the version already loaded, so the
// first paint has the reel and its comments. No app chrome: AppHeader hides on /r/*.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Review — Yuvabe Studios",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const code = toCanonicalShareToken(token);
  const review = code ? await getScriptReviewByToken(code) : null;
  const initial = review ? await buildPublicScriptReview(review) : null;
  if (!initial) notFound();
  return <ScriptReviewPage token={token} initial={initial} />;
}
```

```tsx
// src/app/r/s/[token]/not-found.tsx
// The same closed door as a video review link (D309).
export { default } from "../../[token]/not-found";
```

```tsx
// src/app/r/s/[token]/loading.tsx
export { default } from "../../[token]/loading";
```

```tsx
// src/app/r/s/[token]/error.tsx
"use client"; // Error boundaries must be Client Components

export { default } from "../../[token]/error";
```


- [ ] **Step 7: Type-check, lint, and verify in the app**

Run: `npx tsc --noEmit && npx eslint src/components/script-review src/components/client-review src/hooks "src/app/r"`
Expected: no errors (Task 10's page now compiles). Also re-run D309's tests: `npx vitest run src/lib/client-review "src/app/api/r"`, PASS.

The in-app check needs a shared version, and the buttons that share arrive in Task 16; do this check right after Task 16 Step 4. With Task 5's migration applied and Reel 01 seeded at `visualise` (`node scripts/seed-script.mjs <jackfruit-slug> --stage visualise`), move it to In review, share "Script only", and open the link in a private window at phone width (390px):
- the name screen reads "Read the reel and leave comments for the team."; after the name, the header reads "Yuvabe Studios × Jackfruit365 · for your review", the title, and "Version 1 · shared <day> · read-only";
- the scope note explains a script-only share; there is no Approve reel;
- every shot, the context card and both cast members show a dashed "Comment" chip; posting one shows it beside the part and in the Comments column, labelled ("S4"), and "1 comment, by <name>" appears in Activity;
- Edit changes the text and shows "edited by <name>"; reload keeps the name (no name screen);
- no app header, no horizontal scroll, dark theme readable.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/use-is-server-or-hydrating.ts src/components/client-review src/components/script-review "src/app/r/s"
git commit -m "feat(script-review): the client's page — the frozen reel, comments per part, activity and Approve"
```

---

### Task 16: The team's workspace on the script page

**Files:**
- Create in `src/components/script-review/team/`: `script-review-workspace.tsx`, `stage-actions.tsx`, `share-dialog.tsx`, `scope-options.tsx`, `share-link-field.tsx`, `copy-link-button.tsx`, `copy-link.ts`
- Create: `src/components/script-review/client-feedback-count.tsx`
- Modify: `src/app/clients/[id]/scripts/[scriptId]/page.tsx` (MP4)

**Interfaces:**
- Consumes: the shared surface from Task 15 (`ReviewSurfaceProvider`, `PartComments`, `CastReviewSlot`, `ShotReviewSlot`, `CommentsColumn`, `ActivityList`); team hooks (Task 13); `TeamScriptReview` (Task 7); `TEAM_STAGE_MOVES`, `teamMovesFrom`, `SHARE_SCOPES`, `SHARE_SCOPE_LABEL`, `SHARE_SCOPE_PHRASE`, `ShareScope`, `TeamStageMove` (Task 1); `scriptSharePathFor` (Task 6); `formatShortDay` (Task 13); `Dialog*`, `InputGroup*`, `Button` primitives.
- Produces: `ScriptReviewWorkspace({ clientId, script, avatarFaces })`; `ClientFeedbackCount({ count })` (reused by Task 17).

- [ ] **Step 1: Write the small pieces**

```tsx
// src/components/script-review/client-feedback-count.tsx
import { MessageSquareText } from "lucide-react";

/** Spec 4 §6 and D356: the total of client comments and approvals, in D310's amber, no seen-state. */
export function ClientFeedbackCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      title={`${count} client ${count === 1 ? "comment or approval" : "comments and approvals"}, in total`}
      className="inline-flex items-center gap-1 rounded-full bg-client/15 px-2 py-0.5 text-xs font-medium tabular-nums text-client-text"
    >
      <MessageSquareText className="size-3.5" strokeWidth={1.5} aria-hidden />
      Client feedback {count}
    </span>
  );
}
```

```ts
// src/components/script-review/team/copy-link.ts
import { toast } from "sonner";

/** The full link for a path, in the browser (the client gets an absolute URL). */
export function absoluteLink(path: string): string {
  return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
}

export async function copyLink(path: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(absoluteLink(path));
    toast.success("Link copied");
  } catch {
    toast.error("Could not copy. Select the link and copy it.");
  }
}
```

```tsx
// src/components/script-review/team/share-link-field.tsx
"use client";

import { Copy } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { absoluteLink, copyLink } from "./copy-link";

/** The link, readable and copyable. The Copy button sits inside the field (CLAUDE.md: InputGroup). */
export function ShareLinkField({ path }: { path: string }) {
  return (
    <InputGroup>
      <InputGroupInput readOnly value={absoluteLink(path)} aria-label="Client link" onFocus={(e) => e.currentTarget.select()} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton aria-label="Copy link" onClick={() => void copyLink(path)}>
          <Copy className="size-3.5" strokeWidth={1.5} />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
```

```tsx
// src/components/script-review/team/copy-link-button.tsx
"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyLink } from "./copy-link";

export function CopyLinkButton({ path }: { path: string }) {
  return (
    <Button variant="outline" size="sm" onClick={() => void copyLink(path)}>
      <Copy strokeWidth={1.5} />
      Copy link
    </Button>
  );
}
```

```tsx
// src/components/script-review/team/scope-options.tsx
"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SHARE_SCOPES, SHARE_SCOPE_LABEL, type ShareScope } from "@/lib/script-review/constants";

const HINT: Record<ShareScope, string> = {
  script: "For comments on the words.",
  avatars: "For comments. Adds each cast member's avatar and voice.",
  panels: "The full reel, with each shot's picked panel. The client can approve it.",
};

/** Spec 4 §3 step 2: what the share includes. Pressed buttons, as the library's stage filter. */
export function ScopeOptions({ value, onChange }: { value: ShareScope; onChange: (scope: ShareScope) => void }) {
  return (
    <div role="group" aria-label="What the share includes" className="flex flex-col gap-2">
      {SHARE_SCOPES.map((scope) => (
        <Button
          key={scope}
          variant="outline"
          aria-pressed={value === scope}
          onClick={() => onChange(scope)}
          className={cn(
            "h-auto flex-col items-start gap-0.5 whitespace-normal px-3 py-2.5 text-left",
            value === scope && "border-primary bg-primary/5",
          )}
        >
          <span className="font-medium">{SHARE_SCOPE_LABEL[scope]}</span>
          <span className="text-xs font-normal text-muted-foreground">{HINT[scope]}</span>
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write the share dialog and the stage actions**

```tsx
// src/components/script-review/team/share-dialog.tsx
"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useShareScript } from "@/hooks/queries/script-review";
import { errorMessage } from "@/lib/avatars/utils";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import type { ShareScope } from "@/lib/script-review/constants";
import { scriptSharePathFor } from "@/lib/script-review/paths";
import type { Script } from "@/lib/scripts/schema";
import { ScopeOptions } from "./scope-options";
import { ShareLinkField } from "./share-link-field";

/** Spec 4 §3 steps 2–4: choose what the share includes, share it as the next version, get the link. */
export function ShareDialog({ clientId, script, latest }: { clientId: string; script: Script; latest: TeamScriptReview["latest"] }) {
  const share = useShareScript(clientId, script.id);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ShareScope>(latest?.scope ?? "script");
  const [done, setDone] = useState<{ number: number; path: string } | null>(null);
  const next = (latest?.number ?? 0) + 1;

  async function submit() {
    try {
      const out = await share.mutateAsync(scope);
      setDone({ number: out.version.number, path: scriptSharePathFor(out.shareToken, script.doc.header.title) });
    } catch (e) {
      toast.error(errorMessage(e, "Could not share the script."));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setDone(null);
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <Send strokeWidth={1.5} />
        {latest ? "Share again" : "Share"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{done ? `Version ${done.number} is shared` : `Share version ${next}`}</DialogTitle>
          <DialogDescription>
            {done
              ? "The link stays the same for every version. Send it however you usually reach the client."
              : "The client sees this version, frozen, until you share again. Edits after this stay with the team until the next share."}
          </DialogDescription>
        </DialogHeader>
        {done ? <ShareLinkField path={done.path} /> : <ScopeOptions value={scope} onChange={setScope} />}
        <DialogFooter>
          {done ? (
            <DialogClose render={<Button variant="outline" />}>Done</DialogClose>
          ) : (
            <Button onClick={submit} disabled={share.isPending}>
              {share.isPending ? "Sharing…" : `Share version ${next}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

```tsx
// src/components/script-review/team/stage-actions.tsx
"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useMoveScriptStage } from "@/hooks/queries/script-review";
import { errorMessage } from "@/lib/avatars/utils";
import type { TeamScriptReview } from "@/lib/script-review/assemble";
import { SHARE_SCOPE_PHRASE, TEAM_STAGE_MOVES, teamMovesFrom, type TeamStageMove } from "@/lib/script-review/constants";
import { scriptSharePathFor } from "@/lib/script-review/paths";
import { formatShortDay } from "@/lib/script-review/utils";
import type { ScriptStage } from "@/lib/scripts/constants";
import type { Script } from "@/lib/scripts/schema";
import { ClientFeedbackCount } from "../client-feedback-count";
import { CopyLinkButton } from "./copy-link-button";
import { ShareDialog } from "./share-dialog";

const HINT: Record<ScriptStage, string> = {
  generate: "Mark the script final, then move it to In review to share it with the client.",
  visualise: "Move the script to In review when it is ready for the client.",
  in_review: "Share it with the client. Each share is a new version on the same link.",
  approved: "Approved.",
};

/** Spec 4 §6: Move to In review, Share / Share again, Copy link, Move back to Visualise, and
 *  Reopen to Visualise after an approval. Share appears only In review. */
export function StageActions({ clientId, script, review }: { clientId: string; script: Script; review: TeamScriptReview | undefined }) {
  const stage = review?.stage ?? script.stage;
  const latest = review?.latest ?? null;
  const move = useMoveScriptStage(clientId, script.id);
  const path = review?.shareToken && latest ? scriptSharePathFor(review.shareToken, script.doc.header.title) : null;

  async function run(m: TeamStageMove) {
    try {
      await move.mutateAsync(m);
    } catch (e) {
      toast.error(errorMessage(e, "Could not move the script."));
    }
  }

  return (
    <section aria-label="Client review" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-eyebrow">Client review</h2>
        <ClientFeedbackCount count={review?.feedbackCount ?? 0} />
      </div>
      <p className="text-sm text-muted-foreground">
        {latest
          ? `Version ${latest.number} · shared ${formatShortDay(latest.sharedAt)} · ${SHARE_SCOPE_PHRASE[latest.scope]}`
          : HINT[stage]}
      </p>
      {review?.approval && (
        <p className="text-sm font-medium">
          Approved by {review.approval.byName} on {formatShortDay(review.approval.at)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {stage === "in_review" && <ShareDialog clientId={clientId} script={script} latest={latest} />}
        {path && <CopyLinkButton path={path} />}
        {teamMovesFrom(stage).map((m) => (
          <Button key={m} variant={m === "to_review" ? "default" : "outline"} size="sm" disabled={move.isPending} onClick={() => void run(m)}>
            {TEAM_STAGE_MOVES[m].label}
          </Button>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Write the workspace and put it on the script page**

```tsx
// src/components/script-review/team/script-review-workspace.tsx
"use client";

import { useMemo } from "react";
import { ScriptView } from "@/components/scripts/script-view";
import type { ScriptViewSlots } from "@/components/scripts/script-view-slots";
import { useReplyToThread, useResolveThread, useTeamScriptReview } from "@/hooks/queries/script-review";
import { buildThreads, placeThreads } from "@/lib/script-review/threads";
import type { Part } from "@/lib/script-review/types";
import type { Script } from "@/lib/scripts/schema";
import { ActivityList } from "../activity-list";
import { CastReviewSlot } from "../cast-review-slot";
import { CommentsColumn } from "../comments-column";
import { PartComments } from "../part-comments";
import { ReviewSurfaceProvider, type ReviewSurface } from "../review-surface-context";
import { ShotReviewSlot } from "../shot-review-slot";
import { StageActions } from "./stage-actions";

const NOTHING: ReadonlyMap<string, Part> = new Map();

/** Spec 4 §6: the team's view — the live script with each client comment beside its part, Reply and
 *  Resolve, the same Comments and Activity lists the client sees, and the stage actions.
 *  MERGE POINT (MP4, spec 3): spec 3 turns this page into the Visualise view; this wraps it. */
export function ScriptReviewWorkspace({
  clientId,
  script,
  avatarFaces,
}: {
  clientId: string;
  script: Script;
  avatarFaces: Record<string, string | null>;
}) {
  const { data: review } = useTeamScriptReview(clientId, script.id);
  const reply = useReplyToThread(clientId, script.id);
  const resolve = useResolveThread(clientId, script.id);
  const threads = useMemo(() => buildThreads(review?.comments ?? []), [review?.comments]);
  const placed = useMemo(() => placeThreads(threads, script.doc, review?.removedShots ?? {}), [threads, script.doc, review?.removedShots]);
  const open = review?.commentsOpen ?? false;

  const surface: ReviewSurface = {
    mode: "team",
    doc: script.doc,
    placed,
    commentable: NOTHING,
    onReply: open
      ? async (commentId, body) => {
          await reply.mutateAsync({ commentId, body });
        }
      : undefined,
    onResolve: open
      ? async (commentId, resolved) => {
          await resolve.mutateAsync({ commentId, resolved });
        }
      : undefined,
  };
  const slots: ScriptViewSlots = {
    context: <PartComments part={{ kind: "context" }} />,
    castMember: (m) => <CastReviewSlot member={m} />,
    shot: (s) => <ShotReviewSlot shot={s} />,
  };

  return (
    <ReviewSurfaceProvider value={surface}>
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_340px]">
        <ScriptView script={{ doc: script.doc, stage: review?.stage ?? script.stage }} avatarFaces={avatarFaces} slots={slots} />
        <aside className="flex flex-col gap-8 lg:sticky lg:top-6 lg:self-start">
          <StageActions clientId={clientId} script={script} review={review} />
          <CommentsColumn />
          <ActivityList lines={review?.activity ?? []} />
        </aside>
      </div>
    </ReviewSurfaceProvider>
  );
}
```

In `src/app/clients/[id]/scripts/[scriptId]/page.tsx`, replace `import { ScriptView } from "@/components/scripts/script-view";` with `import { ScriptReviewWorkspace } from "@/components/script-review/team/script-review-workspace";` and replace `<ScriptView script={script} avatarFaces={avatarFaces} />` with:

```tsx
<ScriptReviewWorkspace clientId={client.id} script={script} avatarFaces={avatarFaces} />
```

- [ ] **Step 4: Type-check, lint, and verify in the app**

Run: `npx tsc --noEmit && npx eslint src/components/script-review "src/app/clients/[id]/scripts"`
Expected: no errors.

In the app, open Jackfruit365 › Scripts › Reel 01 (seeded at `visualise`):
- the side panel reads "Client review", "Move the script to In review when it is ready for the client." and one button, **Move to In review**; pressing it shows the In review chip on the context card and **Share** plus **Move back to Visualise**;
- **Share** opens the dialog with the three scopes; "Share version 1" shows "Version 1 is shared" and the link in a field with a Copy button inside it; the link reads `/r/s/golu-starts-today-<code>`;
- after a client comment (Task 15's check), the comment sits under that shot in the team's view with **Reply** and **Resolve**, appears in the Comments column, and the side panel shows "Client feedback 1" in amber;
- a reply shows on the client's page with a "Team" badge after a reload; Resolve shows "Resolved by <name>" on both;
- at a narrow width the side panel stacks under the script; dark theme readable.

- [ ] **Step 5: Commit**

```bash
git add src/components/script-review "src/app/clients/[id]/scripts/[scriptId]/page.tsx"
git commit -m "feat(script-review): the team's review workspace — stage moves, share, link, replies and Resolve"
```

---

### Task 17: The client-feedback count on the library card

**Files:**
- Modify: `src/lib/script-review/assemble.ts` (add `tallyFeedback`)
- Modify: `src/lib/db/script-reviews.ts` (add `listFeedbackCounts`)
- Modify: `src/app/clients/[id]/scripts/page.tsx`
- Modify: `src/components/scripts/scripts-library.tsx` (MP6)
- Modify: `src/components/scripts/script-card.tsx` (MP6)
- Test: `src/lib/script-review/__tests__/assemble.test.ts` (append)

**Interfaces:**
- Consumes: `ClientFeedbackCount` (Task 16).
- Produces: `tallyFeedback(commentScriptIds: string[], approvalScriptIds: string[]): Record<string, number>`; `listFeedbackCounts(clientId: string): Promise<Record<string, number>>`; `ScriptsLibrary` gains `feedback?: Record<string, number>`; `ScriptCard` gains `feedbackCount?: number`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/script-review/__tests__/assemble.test.ts` (and add `tallyFeedback` to its import from `../assemble`):

```ts
describe("tallyFeedback", () => {
  it("adds a script's client comments and approvals, per script", () => {
    expect(tallyFeedback(["s1", "s1", "s2"], ["s1"])).toEqual({ s1: 3, s2: 1 });
    expect(tallyFeedback([], [])).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/script-review/__tests__/assemble.test.ts`
Expected: FAIL with "tallyFeedback is not a function" (or not exported).

- [ ] **Step 3: Write the tally and the read**

Append to `src/lib/script-review/assemble.ts`:

```ts
/** The library card's count (spec 4 §6), the same rule as feedbackCount, for every script at once. */
export function tallyFeedback(commentScriptIds: string[], approvalScriptIds: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const id of [...commentScriptIds, ...approvalScriptIds]) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}
```

Append to `src/lib/db/script-reviews.ts` (and add `import { tallyFeedback } from "@/lib/script-review/assemble";`):

```ts
/** Client comments and approvals per script, for one client's library (spec 4 §6). */
export async function listFeedbackCounts(clientId: string): Promise<Record<string, number>> {
  const supabase = createServerSupabase();
  const [comments, approvals] = await Promise.all([
    supabase
      .from("script_review_comments")
      .select("script_reviews!inner(script_id, client_id)")
      .eq("author_kind", "client")
      .eq("script_reviews.client_id", clientId),
    supabase
      .from("script_review_events")
      .select("script_id, client_scripts!inner(client_id)")
      .eq("kind", "approved")
      .eq("client_scripts.client_id", clientId),
  ]);
  if (comments.error) throw comments.error;
  if (approvals.error) throw approvals.error;
  type ReviewEmbed = { script_id: string } | { script_id: string }[] | null;
  const commentScriptIds = ((comments.data ?? []) as unknown as { script_reviews: ReviewEmbed }[]).flatMap((r) => {
    const review = Array.isArray(r.script_reviews) ? r.script_reviews[0] : r.script_reviews;
    return review ? [review.script_id] : [];
  });
  const approvalScriptIds = ((approvals.data ?? []) as { script_id: string }[]).map((r) => r.script_id);
  return tallyFeedback(commentScriptIds, approvalScriptIds);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/script-review`
Expected: PASS.

- [ ] **Step 5: Show it on the card**

In `src/app/clients/[id]/scripts/page.tsx`: import `listFeedbackCounts` from `@/lib/db/script-reviews`, replace `const scripts = await listScripts(client.id);` with

```tsx
const [scripts, feedback] = await Promise.all([listScripts(client.id), listFeedbackCounts(client.id)]);
```

and pass `feedback={feedback}` to `<ScriptsLibrary … />`.

In `src/components/scripts/scripts-library.tsx`: add `feedback?: Record<string, number>` to the props (destructure `feedback`), and pass `feedbackCount={feedback?.[s.id] ?? 0}` to each `<ScriptCard … />`.

In `src/components/scripts/script-card.tsx`: add `import { ClientFeedbackCount } from "@/components/script-review/client-feedback-count";`, change the signature to `export function ScriptCard({ script, href, feedbackCount = 0 }: { script: Script; href: string; feedbackCount?: number })`, and replace the last line (the shot summary `<span>`) with:

```tsx
<div className="flex items-center justify-between gap-2 border-t border-border pt-3">
  <span className="text-sm text-muted-foreground">{shotSummary(script.doc)}</span>
  <ClientFeedbackCount count={feedbackCount} />
</div>
```

- [ ] **Step 6: Type-check, lint, and verify in the app**

Run: `npx tsc --noEmit && npx eslint src/components/scripts "src/app/clients/[id]/scripts"`
Expected: no errors. In the app, the Reel 01 card shows "Client feedback 1" after Task 15's comment, and no chip on scripts with no feedback.

- [ ] **Step 7: Commit**

```bash
git add src/lib/script-review/assemble.ts src/lib/script-review/__tests__/assemble.test.ts src/lib/db/script-reviews.ts "src/app/clients/[id]/scripts/page.tsx" src/components/scripts
git commit -m "feat(script-review): client-feedback count on the library card"
```

---

### Task 18: ADR entries D347–D356

**Files:**
- Modify: `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7, appended after the last entry)

- [ ] **Step 1: Confirm the numbers are still booked for this spec**

Run: `grep -o '^### D3[45][0-9]' docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` and the same against `git show origin/staging:docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md`.
Expected: no D347–D356 headings yet (spec 4's header books them). If any is taken, stop and ask; do not renumber on your own.

- [ ] **Step 2: Append the entries**

Append, in the log's format (Decision / Why / Rejected / Refines / Originated):

```markdown
### D347 — Client review of a script: one link, a frozen version per share *(recorded 2026-10-08)*

**Decision.** Each share of a script records a version — the script text, plus the avatar images and the picked panel take per shot when the share includes them — on one link per script that never changes. The link shows the latest version, frozen; the team keeps editing between shares. The client cannot open an earlier version; the activity names what changed, each change linking to its part.

**Why.** Approval must bind to exactly what the client saw. Clients keep one link (the D309 habit). "S1, S4, S5 revised" tells the client where to look without a diff view.

**Rejected.** A live link showing work in progress. Locking the script while In review. Opening earlier versions, or a highlighted diff (later; nothing is lost).

**Refines →** D309. **Originated →** `2026-10-08-script-copilot-4-client-review-design.md` §3, §7; questions 4.1, 4.2.

### D348 — The team moves a script into and out of In review by hand *(recorded 2026-10-08)*

**Decision.** Visualise → In review, In review → Visualise, and (after an approval) Approved → Visualise ("Reopen to Visualise") are team actions. Share appears only In review. Client comments never change the stage; editing stays allowed In review. Every move is a compare-and-set on the stage with its activity line, in one transaction (`script_review_move`).

**Why.** A comment can be a question. D309 comments never change state. Spec 1's "In review" filter should list exactly the scripts with the client.

**Rejected.** Any client comment moving the script back. A client "Request changes" action. Sharing moving the stage by itself (the parent spec's first answer).

**Originated →** spec 4 §3; question 4.3.

### D349 — Three share scopes; Approve only on a full share *(recorded 2026-10-08)*

**Decision.** A share is the script only, the script and avatars, or the script, avatars and panels, and only from In review, so always after Mark final. Approve appears only on the full share; a partial share tells the client what it holds and what comes next. Panels reach spec 4 through one interface from spec 3 (the picked take per shot id); a full share carries whatever panels exist.

**Why.** The client signs off on the visual reel (parent spec §0), while an early round of comments on the words is still worth having.

**Rejected.** Requiring every avatar and panel before any share. Senior-only sharing. Approving a partial share.

**Originated →** spec 4 §3, §8; question 4.4.

### D350 — Versions, comments and activity live beside the script, keyed by script, version and part *(recorded 2026-10-08)*

**Decision.** Four tables (`script_reviews`, `script_review_versions`, `script_review_comments`, `script_review_events`; migration 0054) hold the review. Spec 4 never writes `client_scripts.doc`; it changes only `stage` / `approved_at`, inside three plpgsql functions that lock the script row so a share, an approval and a stage move never interleave. The activity is derived from append-only rows.

**Why.** Spec 2 is the only writer of the script's text (parent spec §4a.4). Specs 2, 3 and 4 are built in parallel. Numbering versions and approving "the latest" both need one lock.

**Rejected.** Comments inside the script document. Version numbers computed in the app without a lock.

**Originated →** spec 4 §9.

### D351 — Comments are on whole parts and belong to their version *(recorded 2026-10-08)*

**Decision.** A comment is on the context card, a shot, a cast member's avatar, one of its views (Front, Left, Right, Back), or a panel, and only on parts the version on screen shows. No pins, no painting. A comment keeps the version it was made on; when a later version drops its shot, it is shown under "On a removed shot" with the shot's last text. A split's first half keeps the shot's id, and so its comments.

**Why.** D309 rejected painting for clients on phones; the post approval design called anchored pins a V2; D244 keeps annotations with the output they were made on.

**Rejected.** Spot pins. Painted regions. Moving orphaned comments to the context card. Dropping them.

**Refines →** D244, D309. **Originated →** spec 4 §5; questions 4.11, 4.12.

### D352 — The team replies and resolves; comments are edited, never deleted *(recorded 2026-10-08)*

**Decision.** The team replies under a client's comment and marks the thread Resolved (and can reopen it); the client sees both. Anyone with the link edits any client comment's text, shown as "edited by"; team replies are not editable from the link. Nothing is deleted.

**Why.** It is how the client sees a comment was acted on (the mockup's Comments column), and D309's edit-never-delete rule carries over.

**Rejected.** A read-only team (D309, D244). Resolve without replies.

**Known limit.** With no client login, anyone with the link can edit any client comment, until the password lands.

**Originated →** spec 4 §5; question 4.10.

### D353 — Approval: anyone with the link, under a typed name, of the version on screen *(recorded 2026-10-08)*

**Decision.** Approve reel records the typed name and the time and moves the script to Approved, the only way a script reaches the canvas gallery's Scripts tab. The request carries the version number on the client's screen; if a newer version was shared, it is refused. With open threads, a confirm names them first. A second tap answers success and records nothing more.

**Why.** D309's trust model, with its limit stated. Whole-package approval (parent spec §10).

**Rejected.** Only a contact named by the team can approve. A team-recorded offline approval (later, if clients approve by phone). Refusing approval while threads are open.

**Known limit.** A typed name proves nothing, and a forwarded link can approve.

**Originated →** spec 4 §8; questions 4.5, 4.13.

### D354 — No withdrawal; reopen and share again; the approved link is a record *(recorded 2026-10-08)*

**Decision.** The client cannot withdraw an approval. The team reopens an approved script to Visualise and shares again on the same link for a new approval (Approved › Reopened › Approved). While the version on screen is approved, the link is a read-only record: no comments, edits, replies or resolves.

**Why.** Comments after sign-off are the late changes this feature exists to stop (parent spec §0). Spec 1 §5.4 already keeps canvas copies stable when a script is re-approved.

**Rejected.** Withdrawal until the first canvas drop. Approval final forever. Comments after approval.

**Originated →** spec 4 §8; questions 4.6, 4.7.

### D355 — Script links reuse the video review link: /r/s/<title>-<code>, no password yet *(recorded 2026-10-08)*

**Decision.** A script's link is `/r/s/<title-slug>-<code>`, the code D311's (the first 4 hex characters of the script id, longer on a clash), under the public prefixes `src/proxy.ts` already exempts. Every public script route goes through `withScriptShareToken` in `route-helpers.ts`, the second named token resolver beside `withShareToken`. The client's typed name is the same stored entry as on a video review. No password or accounts yet; the password comes with the video links' (one scheme for both).

**Why.** One auditable unauthenticated surface (D309). The link shape the operator already chose (D311). The client is not asked their name twice on one device.

**Rejected.** A new public prefix and proxy exemption. Unguessable tokens (D311 chose readable). Client accounts.

**Known limit.** The code is guessable, and the link carries real faces and unreleased claims; the password is the first follow-up.

**Refines →** D309, D311. **Originated →** spec 4 §4, §10; question 4.8.

### D356 — An in-app count of client comments and approvals *(recorded 2026-10-08)*

**Decision.** The library card and the script's review panel show "Client feedback n": client comments plus approvals, a total with no seen-state, in D310's amber. No email or push.

**Why.** D310's chip set the pattern; a seen-state needs a per-user table.

**Rejected.** "New since you last looked". Email.

**Refines →** D310. **Originated →** spec 4 §6; question 4.9.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(adr): D347–D356 for script copilot spec 4 (client review)"
```

---

### Task 19: Check spec 4's success criteria end to end

**Files:** none changed unless a check fails.

Needs: migration 0054 applied to the staging database (Task 5 Step 9), and the dev server running against it. Use two browsers: the team signed in, and a private window at phone width (390px) for the client.

- [ ] **Step 1: Full test run, type check and lint**

Run: `npm test && npx tsc --noEmit && npx eslint src`
Expected: all new tests pass. Known pre-existing failures (memory: registry test, trigger.dev, Kling 5 s timeout flake when vitest runs beside tsc) may appear; re-run once on its own before investigating, and report any that are not in that list.

- [ ] **Step 2: Seed Reel 01 at Visualise**

Run: `node scripts/seed-script.mjs <jackfruit-slug> --stage visualise --lead-avatar <a ready Jackfruit365 avatar uuid>`
Expected: "Updated … stage visualise" (or Inserted). The lead avatar gives criterion 3 a view to comment on.

- [ ] **Step 3: Criterion 1 — In review and the Share action**

On Reel 01: **Move to In review**. The library's "In review" filter lists Reel 01; **Share** appears and offers Script only, Script and avatars, and Script, avatars and panels.

- [ ] **Step 4: Criterion 2 — a script-only share on a phone**

Share **Script only** (version 1); copy the link. In the private window at 390px: the name screen, then the context card, both cast members and all 14 shots, read-only, the scope note, and no Approve reel.

- [ ] **Step 5: Criterion 3 — comments on each kind of part**

As the client, comment on the context card, on S4, and on Meenakshi (the cast member). Each appears in the team's view beside that part and in the Comments column; the team replies to one and resolves one; the client sees the reply ("Team") and "Resolved by …" after a reload. The view comment needs a share with avatars (spec gap, see "Not decided by the spec" 6): it is made in Step 6 on version 2.

- [ ] **Step 6: Criterion 4 — edits stay with the team until the next share**

Edit S1's text in the database (spec 2's editor does not exist on this branch): in the Supabase SQL editor, `update client_scripts set doc = jsonb_set(doc, '{shots,0,visual}', '"S1 edited for the check"') where id = '<reel 01 id>';`. Reload the client's link: S1 is unchanged and the header still says Version 1. Now **Share again** with **Script, avatars and panels**: the same link shows Version 2, the activity reads "S1 revised" (linking to S1) then "Shared again, version 2 · the script, avatars and panels", and the S4 comment is still beside S4. The lead's Front view now shows; comment on it as the client (criterion 3's view comment). Panels: none until spec 3 merges (MP1); note this in the report.

- [ ] **Step 7: Criterion 5 — the library count**

The Reel 01 card shows "Client feedback n", where n is the number of client comments so far.

- [ ] **Step 8: Criterion 6 — Approve with a thread open**

Leave one thread unresolved. As the client press **Approve reel**: the confirm names the open comment ("You have 1 open comment: “…”. Approve anyway?"). Confirm. The client's page shows "Approved on <day> by <name>" and no Comment chips; the team's view shows **Approved** and "Approved by …"; the canvas gallery's Scripts tab on a Jackfruit365 canvas lists Reel 01; the activity ends with "Approved by <name>". A comment POST now answers 409 (try it from the browser console on the client page: `await fetch(location.pathname.replace('/r/s/', '/api/r/s/') + '/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorName: 'x', body: 'x', part: { kind: 'context' }, versionNumber: 2 }) })`).

- [ ] **Step 9: Criterion 7 — reopen and approve again**

Team: **Reopen to Visualise**, then **Move to In review**, then **Share again** with the full scope: the same link shows Version 3 and takes comments again; the client approves version 3; the activity reads "Approved by … · Reopened by … · Shared again, version 3 · … · Approved by …".

- [ ] **Step 10: The two Review Focus checks that need a live database**

- Stale tab: open the client link in two tabs on version 3, reopen and share version 4 from the team, then press Approve in the older tab: refused with "A newer version was shared. Reload to see it.", and the activity has no new approval.
- Double tap: on a fresh full share, press Approve twice quickly (or send the approve request twice from the console): one "Approved by" line.

- [ ] **Step 11: Report**

Summarise for the user: what passed, anything that failed with its output, the migration state on staging, the merge points still open (MP1 panels and MP2 four views are stubs until spec 3 merges), and the "Not decided by the spec" list for their decision. Do not push or merge; the user decides.

---

## Self-review (done while writing; kept for the executor)

- **Spec coverage.** §3 flow: Tasks 8 (moves, share), 11 (comments), 12 (approve), 16 (buttons). §4 page: Task 15 (header, read-only view, comment action and marker per part, Comments column with replies and Resolved, Add a comment, Activity, Approve on a full share only, phone layout). §5 comments: Tasks 1 (whole parts, views, panels), 3 (threads, removed shots, split), 9 (replies, resolve), 11 (edit, never delete; no comments after approval). §6 team view: Tasks 16, 17 (count on card and script). §7 versions and activity: Tasks 2, 3, 5, 6 (one link). §8 approval: Tasks 3 (confirm text), 5 (RPC), 12, 15. §9 constraint: Global Constraints, Task 5. §10 not in scope: nothing built for password, accounts, earlier versions, pins, expiry. §11: Task 19.
- **Placeholders.** None; every code step has its code. The only stubs are the two named merge points in `bridge.ts`, which are the agreed interface.
- **Type consistency.** `Part`, `ScriptComment`, `ScriptReviewEvent`, `ScriptVersion`, `PublicScriptReview`, `TeamScriptReview`, `ReviewSurface` are defined once and imported by name everywhere; `withScriptShareToken` hands `ScriptReviewByToken`; routes use `review.script_id` for events and `review.id` for versions and comments.
- **Review Focus.** Each of the five lines has its test named in its owning task (Tasks 1, 6, 10, 11, 12).
