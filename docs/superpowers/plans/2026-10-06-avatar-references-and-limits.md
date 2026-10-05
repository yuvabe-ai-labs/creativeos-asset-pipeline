# Avatar References and Limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The avatar sends its profile sheet too; references over a video model's cap are chosen by one shared rule, shown in Video Gen and sent exactly; clicking an image's role again turns it off.

**Architecture:** A pure `selectReferences` (new) is the single decision used by the Video Gen focus view and the video-generate route. The avatar's sheet is a second virtual row (`{avatarNodeId}:sheet`) wherever the avatar joins a prompt node's inputs. The route re-renders the prompt over the references it actually sends.

**Tech Stack:** Next.js route handlers, React 19, vitest.

**Spec:** `docs/superpowers/specs/2026-10-06-avatar-references-and-limits-design.md` (D308).

## Global Constraints

- Priority, verbatim: 1) the avatar's front, 2) images the prompt cites, 3) the avatar's sheet, 4) everything else in canvas order.
- Seedance never gets the sheet (reason "Seedance can't use the profile sheet").
- Left-out reason when full: "No room: {model} takes {cap}". Over-cap refusal: "{model} takes {cap} references; {n} are selected. Turn some off in Video Gen."
- Server rejects, never corrects (D97): no `splice`.
- Plain copy; shadcn primitives only; commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: `selectReferences` and the `off` role

**Files:** Create `src/lib/video-gen/select-references.ts`, test `src/lib/video-gen/__tests__/select-references.test.ts`. Modify `src/lib/video-gen/assign-image-roles.ts` (`ImageRole` gains `"off"`; `autoAssignImageRoles` skips `off`; `assignImageRoles` ignores it), `src/lib/video-gen/constraints.ts` and `src/components/nodes/video-gen-focus-view.tsx` (their local `ImageRole` types import the shared one).

**Produces:**
```ts
export type SelectReferencesInput = {
  images: { id: string }[];                 // in prompt order
  roles: Record<string, ImageRole>;
  cap: number;
  modelLabel: string;
  citedIds?: ReadonlySet<string>;
  avatarFrontId?: string | null;
  avatarSheetId?: string | null;
  unusable?: ReadonlyMap<string, string>;   // id → reason
};
export type LeftOut = { id: string; reason: string };
export function selectReferences(input: SelectReferencesInput): { sent: string[]; leftOut: LeftOut[]; overCap: number };
export const avatarSheetId: (avatarNodeId: string) => string; // `${id}:sheet`
```
Rules: frames are skipped (not references); `off` → left out "Turned off"; unusable → its reason; explicit `reference` first in order, up to cap (beyond the cap counts toward `overCap`, left out "No room: …"); unassigned fill free slots by priority (front, cited, sheet, rest in order); the rest left out "No room: {model} takes {cap}". `cap === 0` → every non-frame image left out "{model} takes no reference images".

- [ ] Tests for each rule, run (fail), implement, run (pass), commit `feat(video-gen): one rule chooses the references a request sends (D308)`.

### Task 2: The avatar's sheet as a second virtual input

**Files:** `src/lib/avatars/presenter.ts` (`presenterUpstreamRows(avatarNodeId, avatar): UpstreamOutput[]` — front, plus sheet when present and not stale, id `avatarSheetId(...)`, `data.presenter: "sheet"`, writer text per spec §2), `src/lib/avatars/presenter-server.ts` (`withPresenterRow` appends all rows), `src/lib/nodes/resolve-inputs.ts` (`labelOf`: "Avatar sheet" for the sheet row), `src/hooks/use-mention-upstream.ts` (adds the sheet item, type `avatar`). Tests in `presenter.test.ts`, `presenter-server.test.ts`.

- [ ] Tests (rows with/without sheet, stale sheet skipped, server appends both), implement, run, commit `feat(avatars): the profile sheet goes in after the front (D308)`.

### Task 3: The route sends exactly what was chosen

**Files:** `src/app/api/nodes/[id]/video-generate/route.ts`, `src/lib/video-gen/resolve-prompt.ts` (export `renderResolvedPrompt(resolved, refOrder)`), route test.

- Build `citedIds` (multishot: `planCitedRefIds`; motion prompt: `citedRefIds`), `unusable` (sheet on Seedance), call `selectReferences`; `overCap > 0` → 400 with the spec message; reference URLs = `sent` in order (frames unchanged); the prompt re-rendered over `sent` (left-out citations become names); `checkPlanLimits` measured over `sent`.
- [ ] Route tests: sends `sent`; refuses over cap; Seedance never gets the sheet; prompt numbered over `sent`. Commit `fix(video-gen): send exactly the chosen references, numbered as sent (D308)`.

### Task 4: Video Gen shows the choice; roles toggle off

**Files:** `src/components/nodes/video-gen-focus-view.tsx` (+ a small `video-gen-left-out.tsx` if the file needs splitting).

- Clicking the active role sets `off` (stored). Clicking a role on an `off` image sets it.
- `selectReferences` runs on the same inputs as the route (cited ids from the plan/prompt, the avatar ids from `useShotPresenter`, the Seedance sheet rule); left-out images show dimmed in the rail and the image panel with their reason; the Reference chip reads "Off" state clearly.
- [ ] `tsc`, eslint, commit `feat(video-gen): see which references go, and turn a role off by clicking it again (D308)`.

### Task 5: Record it

- [ ] As-built notes here and in the spec; commit.
