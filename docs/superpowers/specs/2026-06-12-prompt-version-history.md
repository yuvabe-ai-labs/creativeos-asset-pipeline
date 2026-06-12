# Prompt version history — listing, active state, and restore

**Date:** 2026-06-12
**Status:** Implemented
**Area:** Canvas → Prompt node → Focus view (left panel)

## Problem

Every Prompt node generation was already written to `node_versions` and tracked via
`active_version_id`, but the UI exposed none of it. Operators had no way to see past
generations, know which one was active, or switch back to a previous one without
re-generating. `listVersions()` and `setActiveVersion()` existed and went unused.

## Goals

- Show all past generations in a compact list in the Prompt focus view's left panel,
  above the Brand KB section.
- Clearly mark which version is currently active.
- One-click restore: clicking a past version row moves the active pointer and updates
  the output panel immediately.
- Failed generations appear in the list (red dot, non-interactive) so the log is complete.
- Section is hidden until the first generation exists; no empty state to manage.
- Both the version list and the connected-inputs list scroll internally; the left panel
  itself never scrolls.

## Non-goals

- No version diff or side-by-side compare.
- No per-version note or annotation UI (the field exists in the DB; not surfaced here).
- No version deletion or pruning.
- No version history in any other node type — this is Prompt-node-only for now.

## Design

### A. Layout position

`PromptVersionHistory` renders as the first child of the left panel, above the Brand KB
`LeftSection`. It only mounts when `versions.length > 0`. The left panel is
`overflow-hidden`; the version list and connected-inputs list each carry their own
`overflow-y-auto` scroll container so neither pushes the panel past its bounds.

### B. Version row anatomy

```
● v3  ·  2h ago                    Active
  v2  ·  5h ago       [Restore →]
  v1  ·  Jun 11       [Restore →]
  ✕  v0  ·  Jun 10         Error
```

| Element | Detail |
|---|---|
| Status dot | `size-1.5 rounded-full` — purple = active, gray = past, red = error |
| Label | `v{N}` where N = total count − index (newest = highest number) |
| Timestamp | Relative: `Xm ago` / `Xh ago` / `Xd ago` / `Jun 11` |
| "Active" badge | Small uppercase label; replaces "Restore" for the current version |
| "Restore" | Appears on hover only (`opacity-0 group-hover:opacity-100`); absent for active/error rows |
| Instruction preview | Single `line-clamp-1` line below the label when `paramsUsed.instruction` is non-empty |

Active row: `border-primary bg-primary/8 cursor-default`. Past row: `border-border hover:bg-muted cursor-pointer`.

### C. Component

`src/components/nodes/prompt-version-history.tsx` — exports `PromptVersionHistory` and
`VersionSummary` type. Contains `formatRelativeTime(dateStr)` (pure, no dependency).
The `<ul>` is wrapped in `max-h-52 overflow-y-auto pb-2` so it scrolls before spilling.

### D. API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/nodes/:id/versions` | GET | Returns `{ activeVersionId, versions[] }` — queries node's `active_version_id` + calls `listVersions(nodeId)` |
| `/api/nodes/:id/restore-version` | POST `{ versionId }` | Verifies version belongs to node, calls `setActiveVersion`, returns `{ output }` |

Both follow the same pattern as `compile-preview/route.ts` — `apiOk`/`apiError`, no
`withClient`. The restore route uses `withTryCatch` (two DB steps).

### E. State in `prompt-focus-view.tsx`

Three new state values: `versions: VersionSummary[]`, `activeVersionId: string | null`,
`restoring: boolean`.

- **On open:** an async IIFE inside the existing `useEffect` fetches versions immediately
  (no debounce); the compile-preview fetch keeps its 300 ms debounce unchanged.
- **After generate:** `setActiveVersionId(json.versionId)` for instant feedback, then
  `fetchVersions()` to sync the full list (catches error-version rows too).
- **On restore:** POST → `onPatch({ parsed: output })` syncs the canvas store → the seed
  mechanism in the focus view resets `draft` to the restored text automatically. Then
  `setActiveVersionId(versionId)` + `fetchVersions()`.

### F. Connected-inputs scroll

`ConnectedInputsCard` is wrapped in `max-h-64 overflow-y-auto pb-2` inside its
`LeftSection`. The left panel div changes from `overflow-y-auto` to `overflow-hidden`.
Both scroll containers are the same visual weight — no scrollbar hierarchy mismatch.

## Testing

- `npx tsc --noEmit` — clean.
- Open a Prompt node with no generations → history section absent.
- Generate once → `v1 · just now · Active` appears above Brand KB.
- Generate again → `v2` is active at top, `v1` shows "Restore" on hover.
- Click `v1` → output panel updates to v1 text; active badge moves to `v1` row.
- Force a failed generation → red dot row appears, non-clickable.
- Connect 5+ nodes → connected list scrolls internally; left panel stays fixed.
- Add 6+ generations → version list scrolls internally.

## Design-system notes

History row uses the same `border-primary bg-primary/10 text-primary` chip-active
pattern as `SliceToggles`. "Restore" reveal on hover uses `opacity-0 → opacity-100` at
200 ms — the system's standard `transition-colors` duration, no spring.
