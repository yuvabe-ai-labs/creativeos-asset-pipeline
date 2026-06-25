# Video Gen Focus View UX Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the left panel of `VideoGenFocusView` — collapsible sections with per-section defaults, and a single "Connected" section that merges the current "Motion prompt" + "Image inputs" panels.

**Architecture:** Two focused changes — (1) a new `VideoGenConnectedSection` component for the merged connected panel with image overlay role buttons, (2) an update to `video-gen-focus-view.tsx` to add chevron toggles to `LeftSection` and wire up collapse state for all three left-panel sections.

**Tech Stack:** React, Next.js, Tailwind v4, Lucide icons, shadcn CSS variables

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/nodes/video-gen-connected-section.tsx` | **Create** | Renders prompt node card + image grid with overlay role buttons |
| `src/components/nodes/video-gen-focus-view.tsx` | **Modify** | Update `LeftSection` with chevron toggle; add per-section collapse state; rewrite left panel |

`VideoGenVersionHistory`, `VideoGenParamsPanel`, `VideoGenImageRoles` are not modified. `VideoGenImageRoles` is no longer imported in the focus view after this change (the new connected section handles image+role rendering inline).

---

## Task 1: Create `VideoGenConnectedSection`

**Files:**
- Create: `src/components/nodes/video-gen-connected-section.tsx`

- [ ] **Step 1: Create the component file**

```tsx
// src/components/nodes/video-gen-connected-section.tsx
"use client";

import { cn } from "@/lib/utils";
import type { UpstreamImage, UpstreamPromptNode } from "@/lib/video-gen/api";

type ImageRole = "start_frame" | "end_frame" | "reference";

type ImageInputs = {
  startFrame: boolean;
  endFrame: boolean;
  maxReferenceImages: number;
};

type Props = {
  promptNode: UpstreamPromptNode | null;
  images: UpstreamImage[];
  imageRoles: Record<string, ImageRole>;
  imageInputs: ImageInputs;
  onRoleChange: (imageId: string, role: ImageRole) => void;
};

export function VideoGenConnectedSection({
  promptNode,
  images,
  imageRoles,
  imageInputs,
  onRoleChange,
}: Props) {
  const hasContent = promptNode !== null || images.length > 0;

  if (!hasContent) {
    return (
      <p className="text-xs italic text-muted-foreground/60">
        Connect a video-prompt node or image nodes.
      </p>
    );
  }

  const referenceCount = Object.values(imageRoles).filter((r) => r === "reference").length;

  function isRoleDisabled(imageId: string, role: ImageRole): boolean {
    if (role === "start_frame") return !imageInputs.startFrame;
    if (role === "end_frame") return !imageInputs.endFrame;
    if (role === "reference") {
      if (imageInputs.maxReferenceImages === 0) return true;
      if (
        referenceCount >= imageInputs.maxReferenceImages &&
        imageRoles[imageId] !== "reference"
      )
        return true;
    }
    return false;
  }

  return (
    <div className="flex flex-col gap-3">
      {promptNode && (
        <div className="rounded-lg border border-border p-3">
          {promptNode.text ? (
            <p className="line-clamp-4 text-xs leading-relaxed text-foreground">
              {promptNode.text}
            </p>
          ) : (
            <p className="text-xs italic text-muted-foreground/60">
              No motion prompt generated yet — generate from the video-prompt node first.
            </p>
          )}
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {images.map((image) => {
            const activeRole = imageRoles[image.id] ?? "reference";
            return (
              <div
                key={image.id}
                className="relative overflow-hidden rounded-lg border border-border"
              >
                <div className="aspect-video">
                  <img
                    src={image.imageUrl}
                    alt={`Image input (${image.type})`}
                    className="size-full object-cover"
                  />
                </div>
                <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-1 bg-black/60 p-1.5 backdrop-blur-sm">
                  {(["start_frame", "end_frame", "reference"] as const).map((role) => {
                    const label =
                      role === "start_frame" ? "S" : role === "end_frame" ? "E" : "R";
                    const disabled = isRoleDisabled(image.id, role);
                    const active = activeRole === role;
                    return (
                      <button
                        key={role}
                        type="button"
                        disabled={disabled}
                        onClick={() => onRoleChange(image.id, role)}
                        className={cn(
                          "rounded px-2 py-0.5 text-[0.65rem] font-semibold transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-white/20 text-white/80 hover:bg-white/30",
                          disabled && "cursor-not-allowed opacity-30",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
cd e:\CreativeOS\creativeos-mvp
npx tsc --noEmit 2>&1 | Select-String "video-gen-connected"
```

Expected: no output (no errors in the new file).

- [ ] **Step 3: Commit**

```powershell
git add src/components/nodes/video-gen-connected-section.tsx
git commit -m "feat: add VideoGenConnectedSection with image overlay role buttons"
```

---

## Task 2: Update `video-gen-focus-view.tsx` — collapsible LeftSection + rewire left panel

**Files:**
- Modify: `src/components/nodes/video-gen-focus-view.tsx`

- [ ] **Step 1: Update imports at the top of the file**

Replace the existing lucide-react import block (lines 7–12):

```tsx
import {
  ArrowLeft,
  ChevronDown,
  Clapperboard,
  History,
  Link2,
  Settings2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
```

Add the new component import after the existing local imports (after the `VideoGenImageRoles` import line — remove that line and add the new one instead):

```tsx
import { VideoGenConnectedSection } from "./video-gen-connected-section";
```

Remove the `VideoGenImageRoles` import (it is no longer used).

- [ ] **Step 2: Replace the `LeftSection` component definition**

Find and replace the existing `LeftSection` function (lines 52–75):

```tsx
function LeftSection({
  icon: Icon,
  label,
  badge,
  open,
  onToggle,
  children,
}: {
  icon: LucideIcon;
  label: string;
  badge?: string;
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div
        className={cn(
          "mb-2 flex items-center justify-between",
          onToggle && "cursor-pointer select-none",
        )}
        onClick={onToggle}
      >
        <div className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className="text-xs text-muted-foreground">{badge}</span>
          )}
          {onToggle !== undefined && (
            <ChevronDown
              className={cn(
                "size-3.5 text-muted-foreground transition-transform duration-200",
                open && "rotate-180",
              )}
              strokeWidth={1.5}
            />
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
```

Note: `LeftSection` always renders children — the caller controls what content to show based on the `open` state passed in. The chevron is a visual indicator only.

- [ ] **Step 3: Add `ActiveVersionRow` helper before the main component**

Insert this function directly before the `export function VideoGenFocusView` line:

```tsx
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function ActiveVersionRow({
  versions,
  activeVersionId,
}: {
  versions: VideoGenVersionSummary[];
  activeVersionId: string | null;
}) {
  const row = activeVersionId
    ? (versions.find((v) => v.id === activeVersionId) ?? versions[0])
    : versions[0];
  if (!row) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border p-2">
      {row.output && (
        <video
          src={row.output}
          className="size-7 shrink-0 rounded object-cover"
          muted
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-foreground">
          {row.modelUsed ?? "Unknown model"}
        </p>
        <p className="text-[0.65rem] text-muted-foreground">
          {relativeTime(row.createdAt)}
        </p>
      </div>
      {row.id === activeVersionId && (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-semibold text-primary">
          Active
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add per-section collapse state inside `VideoGenFocusView`**

Inside the `VideoGenFocusView` function body, after the existing `useState` declarations, add:

```tsx
const [historyOpen, setHistoryOpen] = useState(false);
const [settingsOpen, setSettingsOpen] = useState(true);
const [connectedOpen, setConnectedOpen] = useState(true);
```

- [ ] **Step 5: Rewrite the left panel JSX**

Find the entire left panel `<div>` block (currently starts with `{/* Left panel */}` at line 332) and replace it with:

```tsx
{/* Left panel */}
<div className="w-[40%] border-r border-border overflow-y-auto px-6 py-6 flex flex-col gap-6">
  {versions.length > 0 && (
    <LeftSection
      icon={History}
      label="History"
      badge={`${versions.length} version${versions.length === 1 ? "" : "s"}`}
      open={historyOpen}
      onToggle={() => setHistoryOpen((p) => !p)}
    >
      {historyOpen ? (
        <VideoGenVersionHistory
          versions={versions}
          activeVersionId={activeVersionId}
          onRestore={handleRestoreVersion}
          restoring={restoring}
        />
      ) : (
        <ActiveVersionRow versions={versions} activeVersionId={activeVersionId} />
      )}
    </LeftSection>
  )}

  <LeftSection
    icon={Settings2}
    label="Output settings"
    open={settingsOpen}
    onToggle={() => setSettingsOpen((p) => !p)}
  >
    {settingsOpen && (
      <VideoGenParamsPanel
        modelId={modelId}
        params={params}
        onModelChange={handleModelChange}
        onParamChange={handleParamChange}
      />
    )}
  </LeftSection>

  <LeftSection
    icon={Link2}
    label="Connected"
    badge={`${(promptNode ? 1 : 0) + upstreamImages.length} input${(promptNode ? 1 : 0) + upstreamImages.length === 1 ? "" : "s"}`}
    open={connectedOpen}
    onToggle={() => setConnectedOpen((p) => !p)}
  >
    {connectedOpen && (
      <VideoGenConnectedSection
        promptNode={promptNode}
        images={upstreamImages}
        imageRoles={imageRolesProp}
        imageInputs={imageInputs}
        onRoleChange={handleRoleChange}
      />
    )}
  </LeftSection>
</div>
```

- [ ] **Step 6: Verify TypeScript compiles clean**

```powershell
cd e:\CreativeOS\creativeos-mvp
npx tsc --noEmit 2>&1 | Select-String "video-gen-focus"
```

Expected: no output.

- [ ] **Step 7: Verify no unused import warnings**

```powershell
npx tsc --noEmit 2>&1
```

Expected: exit 0, no errors. If `VideoGenImageRoles` is flagged as unused, confirm its import line has been removed.

- [ ] **Step 8: Visual verification**

Run the dev server and open a canvas with a video-gen node. Open the focus view and verify:

1. Left panel shows: History (collapsed, active version row visible) → Output settings (open) → Connected (open, merged prompt + images)
2. Clicking any section header chevron toggles that section
3. History expands to show full version list; collapses back to single active row
4. Image thumbnails render with S / E / R overlay buttons at the bottom
5. Clicking S/E/R changes the active role (button turns purple)
6. Unsupported roles for the current model appear dimmed
7. If no prompt node and no images are connected, Connected section shows the empty state message

- [ ] **Step 9: Commit**

```powershell
git add src/components/nodes/video-gen-focus-view.tsx
git commit -m "feat: rework video-gen focus view left panel with collapsible sections and unified connected panel"
```
