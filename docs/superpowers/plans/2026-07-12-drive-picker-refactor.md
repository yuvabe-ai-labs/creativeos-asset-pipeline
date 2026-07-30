# Drive Picker Fix & Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the duplicate "Shared drives" tab in the Google Picker and decompose the Drive integration into clean, single-responsibility units.

**Architecture:** Extract the `gapi` script loader into a plain util (`src/lib/drive/picker-loader.ts`), extract the Google Drive SVG icon into a shared component (`src/components/ui/drive-icon.tsx`), then update the hook to import the loader and use the correct two-view picker config. Finally replace three inline SVG copy-pastes with `<DriveIcon />`.

**Tech Stack:** TypeScript, React (hooks), Google Picker API (`gapi`), Vitest (existing test suite), Tailwind CSS.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/drive/picker-loader.ts` | **Create** | Lazy-loads the Google `gapi` script; deduplicates concurrent calls |
| `src/components/ui/drive-icon.tsx` | **Create** | Google Drive triangle SVG component |
| `src/hooks/use-google-picker.ts` | **Modify** | Import loader; fix duplicate-tab view config |
| `src/components/nodes/file-empty-state.tsx` | **Modify** | Replace inline SVG with `<DriveIcon />` |
| `src/components/nodes/file-focus-view.tsx` | **Modify** | Replace two inline SVGs with `<DriveIcon />` |

---

### Task 1: Extract `loadPickerScript` to `src/lib/drive/picker-loader.ts`

The current hook inlines a `loadPickerScript` function. Extract it to a pure util so the hook only owns picker logic.

**Files:**
- Create: `src/lib/drive/picker-loader.ts`

- [ ] **Step 1: Create the file**

```typescript
// src/lib/drive/picker-loader.ts

let pendingLoad: Promise<void> | null = null;

export function loadPickerScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Not in browser"));
  }
  if ((window as any).google?.picker) {
    return Promise.resolve();
  }
  if (pendingLoad) return pendingLoad;

  pendingLoad = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("gapi-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.id = "gapi-script";
    script.src = "https://apis.google.com/js/api.js";
    script.onload = () => resolve();
    script.onerror = () => {
      pendingLoad = null;
      reject(new Error("Failed to load Google API script"));
    };
    document.head.appendChild(script);
  });

  return pendingLoad;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd creativeos-mvp && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/drive/picker-loader.ts
git commit -m "refactor: extract loadPickerScript to lib/drive/picker-loader"
```

---

### Task 2: Create `DriveIcon` component

The Google Drive triangle SVG is copy-pasted in three places. Extract it once.

**Files:**
- Create: `src/components/ui/drive-icon.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/ui/drive-icon.tsx

type DriveIconProps = {
  size?: number;
};

export function DriveIcon({ size = 18 }: DriveIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 87.3 78"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
        fill="#0066da"
      />
      <path
        d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"
        fill="#00ac47"
      />
      <path
        d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
        fill="#ea4335"
      />
      <path
        d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
        fill="#00832d"
      />
      <path
        d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
        fill="#2684fc"
      />
      <path
        d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
        fill="#ffba00"
      />
    </svg>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/drive-icon.tsx
git commit -m "feat: add DriveIcon shared component"
```

---

### Task 3: Update `useGooglePicker` — import loader, fix view config

Two changes in one file: (1) import `loadPickerScript` instead of inlining it, (2) fix the view config so the picker shows "Google Drive" and "Shared with me" as two distinct tabs (no duplicates).

**Files:**
- Modify: `src/hooks/use-google-picker.ts`

**Context on the bug:** The current hook has three `DocsView` instances. The second (`sharedView`) and third (`sharedDrivesView`) both have `.setEnableDrives(true)` — Google renders both as "Shared drives" tabs. Fix: use `.setOwnedByMe(false)` on the second view (no `setEnableDrives`) to get "Shared with me", and drop the third view. The builder-level `enableFeature(SUPPORT_DRIVES, true)` flag already enables Shared Drives navigation inside My Drive.

- [ ] **Step 1: Replace the full file content**

```typescript
// src/hooks/use-google-picker.ts
"use client";

import { useCallback, useRef } from "react";
import { loadPickerScript } from "@/lib/drive/picker-loader";

export type DrivePickedFile = {
  driveFileId: string;
  driveFileName: string;
  driveMimeType: string;
};

const ALLOWED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
].join(",");

export function useGooglePicker(onPick: (file: DrivePickedFile) => void) {
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const openPicker = useCallback(async () => {
    await loadPickerScript();

    await new Promise<void>((resolve) => {
      (window as any).gapi.load("picker", { callback: resolve });
    });

    const tokenRes = await fetch("/api/drive/picker-token");
    if (!tokenRes.ok) throw new Error("Could not connect to Google Drive");
    const { accessToken, clientId } = await tokenRes.json();

    const google = (window as any).google;

    // My Drive — full folder tree with Shared Drives support via SUPPORT_DRIVES flag
    const myDriveView = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMimeTypes(ALLOWED_MIME_TYPES);

    // Shared with me — files the team account doesn't own
    const sharedWithMeView = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setOwnedByMe(false)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMimeTypes(ALLOWED_MIME_TYPES);

    const picker = new google.picker.PickerBuilder()
      .setTitle("Select a file")
      .addView(myDriveView)
      .addView(sharedWithMeView)
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED, false)
      .enableFeature(google.picker.Feature.SUPPORT_DRIVES, true)
      .setOAuthToken(accessToken)
      .setAppId(clientId)
      .setSelectableMimeTypes(ALLOWED_MIME_TYPES)
      .setCallback((data: any) => {
        if (data.action === google.picker.Action.PICKED) {
          const doc = data.docs[0];
          onPickRef.current({
            driveFileId: doc.id,
            driveFileName: doc.name,
            driveMimeType: doc.mimeType,
          });
        }
      })
      .build();

    picker.setVisible(true);
  }, []);

  return { openPicker };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run tests**

```bash
npm run test
```

Expected: all tests pass (the hook is not unit-tested; verify no regressions elsewhere).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-google-picker.ts
git commit -m "fix: picker duplicate tab — use sharedWithMe view, import loader"
```

---

### Task 4: Replace inline SVGs in `file-empty-state.tsx`

**Files:**
- Modify: `src/components/nodes/file-empty-state.tsx`

- [ ] **Step 1: Add `DriveIcon` import and replace SVG**

The current file has this button in it (around line 83–98):

```tsx
{onPickFromDrive && (
  <button
    type="button"
    onClick={onPickFromDrive}
    className="nodrag flex w-full items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 hover:shadow active:scale-[0.99]"
  >
    <svg width="18" height="18" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
      <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
      <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
      <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
      <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
      <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
    Pick from Google Drive
  </button>
)}
```

Replace the entire file with:

```tsx
// src/components/nodes/file-empty-state.tsx
"use client";

import { type ChangeEvent, type DragEvent, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { DriveIcon } from "@/components/ui/drive-icon";

type FileEmptyStateProps = {
  onUpload: (file: File) => void;
  onPickFromDrive?: () => void;
};

const ACCEPTED = ".txt,.png,.jpg,.jpeg,.webp,.pdf,.docx";
const ACCEPTED_MIME = new Set([
  "text/plain",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export function FileEmptyState({ onUpload, onPickFromDrive }: FileEmptyStateProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(file: File | undefined) {
    if (!file) return;
    if (!ACCEPTED_MIME.has(file.type) && !file.name.match(/\.(txt|png|jpe?g|webp|pdf|docx)$/i)) {
      return;
    }
    onUpload(file);
  }

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    submit(e.target.files?.[0]);
    e.target.value = "";
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    submit(e.dataTransfer.files?.[0]);
  }

  return (
    <div className="grid gap-8">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "nodrag flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-16 text-center transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-muted/40",
        )}
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UploadCloud className="size-6" />
        </span>
        <span className="font-display text-lg font-medium">Attach a file</span>
        <span className="text-sm text-muted-foreground">
          Drop a file here, or click to browse
        </span>
        <span className="text-xs text-muted-foreground/60">
          Images: .png .jpg .webp up to 10 MB · Text: .txt up to 100 KB · Docs: .pdf .docx up to 10 MB
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={handleInput}
        />
      </label>

      {onPickFromDrive && (
        <button
          type="button"
          onClick={onPickFromDrive}
          className="nodrag flex w-full items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 hover:shadow active:scale-[0.99]"
        >
          <DriveIcon size={18} />
          Pick from Google Drive
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/file-empty-state.tsx
git commit -m "refactor: replace inline Drive SVG with DriveIcon in file-empty-state"
```

---

### Task 5: Replace inline SVGs in `file-focus-view.tsx`

The focus view has two inline SVG copies — one for "Replace from Drive" button in the header, one passed via `onPickFromDrive` (already handled by Task 4, but the header button is separate). There is only **one** SVG copy in `file-focus-view.tsx` itself (the "Replace from Drive" button in the `mode === "ready"` header block, around lines 254–262).

**Files:**
- Modify: `src/components/nodes/file-focus-view.tsx`

- [ ] **Step 1: Add `DriveIcon` import**

Add `DriveIcon` to the imports at the top of the file. The current imports block starts:

```tsx
"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowLeft, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FileNodeData } from "@/lib/canvas-nodes";
import { fileNodeService } from "@/services/file-node.service";
import { useGooglePicker } from "@/hooks/use-google-picker";
import { FileEmptyState } from "./file-empty-state";
import { EditableField } from "./editable-field";
import { FilePreview } from "./file-preview";
import { LlmPromptPanel } from "./file-llm-prompt-panel";
import { Textarea } from "../ui/textarea";
```

Add one line after the `useGooglePicker` import:

```tsx
import { DriveIcon } from "@/components/ui/drive-icon";
```

- [ ] **Step 2: Replace the inline SVG in the "Replace from Drive" button**

Find this block in `file-focus-view.tsx` (the "Replace from Drive" button, inside the `mode === "ready"` header section):

```tsx
<button
  type="button"
  onClick={handleOpenPicker}
  disabled={replacing || loading}
  className="inline-flex h-11 items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 hover:shadow disabled:pointer-events-none disabled:opacity-50 active:scale-[0.99]"
>
  <svg width="16" height="16" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
    <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
    <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
    <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
    <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
    <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
    <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
  </svg>
  Replace from Drive
</button>
```

Replace it with:

```tsx
<button
  type="button"
  onClick={handleOpenPicker}
  disabled={replacing || loading}
  className="inline-flex h-11 items-center gap-2.5 rounded-lg border border-neutral-200 bg-white px-4 text-sm font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 hover:shadow disabled:pointer-events-none disabled:opacity-50 active:scale-[0.99]"
>
  <DriveIcon size={16} />
  Replace from Drive
</button>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run full test suite**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/file-focus-view.tsx
git commit -m "refactor: replace inline Drive SVG with DriveIcon in file-focus-view"
```

---

### Task 6: Final verification

- [ ] **Step 1: TypeScript + lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: no errors, no warnings.

- [ ] **Step 2: Full test suite**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 3: Manual acceptance**

1. Open a File node → click "Open" → click "Pick from Google Drive"
2. Verify the picker shows exactly **two tabs**: "Google Drive" and "Shared with me" — no duplicate "Shared drives" tab
3. Navigate into a folder on My Drive — folder contents are visible (not a flat list)
4. Pick a file from a shared folder — file imports and appears in the node
5. With a file already attached, click "Replace from Drive" — same picker opens, replacement works
6. Verify no visual difference in the Drive button appearance (icon still correct)
