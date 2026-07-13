# Google Drive Picker — Fix & Refactor

**Date:** 2026-07-12
**Status:** Approved
**Area:** Canvas → File node → Drive integration

## Problem

The Google Picker, shipped in YUV-184, has two issues:

1. **Duplicate "Shared drives" tab.** The picker renders three `DocsView` instances, two of which both render as "Shared drives" tabs — one was intended to be "Shared with me". Google's Picker API uses view configuration, not tab labels, to distinguish them; using `setEnableDrives(true)` on two separate views creates two indistinguishable tabs.

2. **Poor decomposition.** `use-google-picker.ts` does four unrelated things in one callback (script loading, `gapi.load`, token fetch, picker construction). The Google Drive SVG icon is copy-pasted verbatim in three separate files.

## Goals

- Fix the duplicate tab: picker shows **Google Drive** | **Shared with me** — two tabs, no duplicates.
- Extract the `gapi` script loader into `src/lib/drive/picker-loader.ts` (pure side-effect util, no React dependency).
- Extract the Drive triangle SVG into `src/components/ui/drive-icon.tsx` — single source, imported wherever needed.
- `useGooglePicker` becomes responsible for token fetch + picker construction only.

## Non-goals

- No visual changes to the trigger button or empty state — both already match the design system.
- No changes to the native Picker dialog appearance (Google's iframe, not customisable).
- No changes to the server routes, service, or data model.
- Not migrating to `@googleworkspace/drive-picker-react` (adds a dependency for no UI improvement — the picker modal is the same).
- Not building a custom Drive file browser (out of scope).

## Design

### A. Picker view fix

**Root cause:** Two `DocsView` instances with `.setEnableDrives(true)` both render as "Shared drives" in the picker tab bar. Google uses the *view class* to determine the tab label, not any explicit string.

**Fix:** Replace the two-view approach with a two-view approach that uses the correct distinction:

| Tab | View config |
|-----|-------------|
| Google Drive | `DocsView(ViewId.DOCS)` · `.setIncludeFolders(true)` · `.setSelectFolderEnabled(false)` · `.setMimeTypes(…)` |
| Shared with me | `DocsView(ViewId.DOCS)` · `.setOwnedByMe(false)` · `.setIncludeFolders(true)` · `.setSelectFolderEnabled(false)` · `.setMimeTypes(…)` |

Drop the third view entirely. The `enableFeature(SUPPORT_DRIVES, true)` builder flag covers workspace Shared Drives navigation from within the My Drive tab.

### B. Code decomposition

| Unit | File | Responsibility |
|------|------|----------------|
| `loadPickerScript` | `src/lib/drive/picker-loader.ts` | Lazily inserts `<script src="https://apis.google.com/js/api.js">`, deduplicates concurrent calls via a stored `Promise<void>`. No React. |
| `DriveIcon` | `src/components/ui/drive-icon.tsx` | Renders the six-path Google Drive triangle SVG. Props: `size?: number` (default 18). |
| `useGooglePicker` | `src/hooks/use-google-picker.ts` | Imports `loadPickerScript`. Calls `gapi.load`, fetches token, constructs picker with the fixed two-view config. |
| Three call sites | `file-empty-state.tsx`, `file-focus-view.tsx` | Replace inline SVG with `<DriveIcon />`. |

### C. File map

| File | Change |
|------|--------|
| `src/lib/drive/picker-loader.ts` | **Create** — extracted `loadPickerScript` |
| `src/components/ui/drive-icon.tsx` | **Create** — `DriveIcon` component |
| `src/hooks/use-google-picker.ts` | **Modify** — import loader, fix view config |
| `src/components/nodes/file-empty-state.tsx` | **Modify** — replace inline SVG with `<DriveIcon />` |
| `src/components/nodes/file-focus-view.tsx` | **Modify** — replace inline SVG with `<DriveIcon />` |

No route, service, or test files change (the picker behaviour is not tested at unit level; the hook is UI/browser-only).

## Testing

```bash
npx tsc --noEmit
npm run lint
npm run test
```

Manual: Open a File node → Pick from Google Drive → picker shows exactly two tabs ("Google Drive", "Shared with me") with no duplicates. Navigate into a folder on My Drive — folder contents visible. Pick a file from a shared folder — file imports correctly.
