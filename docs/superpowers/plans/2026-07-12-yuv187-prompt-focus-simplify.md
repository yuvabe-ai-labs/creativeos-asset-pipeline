# YUV-187 Prompt Focus Simplify — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the Prompt focus view into a **Compose** tab (instruction + shot controls → generate → labelled, dominant output, with a `v1 v2…` version-chip strip) and a **`Details · N connected`** tab (Brand KB, connected inputs, eval, approval, model request), keeping cost in the header — folding in YUV-165's output-prominence.

**Architecture:** Pure UI reorganization of one component (`prompt-focus-view.tsx`), plus one new presentational component (`prompt-version-chips.tsx`) and one new pure-logic module (`lib/nodes/prompt-focus.ts`). **No backend, route, action, data-fetch, or generation-logic change** — every existing handler/effect is relocated, not modified. All existing sub-components (`ShotControlsRow`, `SliceToggles`, `ConnectedInputsCard`, `InlineEvalBar`, `InlineApprovalBar`, `ModelRequestPanel`, `UsagePopover`) are reused verbatim.

**Tech Stack:** Next.js (this repo's vendored fork), React, TypeScript, Base UI shadcn primitives (`Tabs`, `Tooltip`), Tailwind v4, Vitest (node environment).

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-12-yuv187-prompt-focus-simplify-design.md` (ADR **D40**).
- **No logic change.** Do not touch `runGenerate`, `fetchVersions`, `handleEvalDecision`, `handleEvalNoteBlur`, `saveApproval`, `handleRestoreVersion`, `handleSave`, `toggleSlice`, the compile-preview effect, or the shot-control seeding effect. Move JSX only.
- **shadcn/Base UI only** — never native `select`/`input`/`textarea` for new controls; Base UI uses the **`render` prop, not `asChild`**.
- **Design system** — `text-eyebrow` for section labels, shadcn CSS-variable tokens only (no hardcoded colors), Lucide icons at 1.5 stroke, purple used sparingly. Cards/borders per `globals.css`.
- **Reuse, don't redefine** — import existing components/types; do not duplicate `VersionSummary`, `ApprovalStatus`, etc.
- **Tests are node-env `.test.ts` only.** The repo has `environment: "node"` and `include: ["src/**/*.test.ts"]` in `vitest.config.ts`, no jsdom/testing-library. **Do not add a DOM test stack.** TDD the extracted pure logic as `.test.ts`; verify the JSX wiring with typecheck + lint + a manual run (Task 3).
- **Branch:** `cyril/yuv-187-simplify-prompt-focus-view-around-prompt-editing-and` (already created; the spec + D40 are already committed on it).

---

### Task 1: Pure view-logic helpers (`lib/nodes/prompt-focus.ts`)

Extract the three genuinely-new decisions — the header status-pill mapping, the Details tab label, and the version-chip model — as pure functions so they can be unit-tested in the node environment. The JSX in later tasks is thin wiring over these.

**Files:**
- Create: `src/lib/nodes/prompt-focus.ts`
- Test: `src/lib/nodes/prompt-focus.test.ts`

**Interfaces:**
- Consumes: `ApprovalStatus` from `@/lib/approval` (`"pending" | "approved" | "changes_requested"`).
- Produces:
  - `describeApprovalPill(status: ApprovalStatus): { label: string; tone: "neutral" | "positive" | "warning" }`
  - `detailsTabLabel(connectedCount: number): string`
  - `buildVersionChips(versions: { id: string; error: string | null }[], activeVersionId: string | null, restoring: boolean): VersionChip[]` where `VersionChip = { id: string; label: string; isActive: boolean; isError: boolean; disabled: boolean }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/nodes/prompt-focus.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  describeApprovalPill,
  detailsTabLabel,
  buildVersionChips,
} from "./prompt-focus";

describe("describeApprovalPill", () => {
  it("maps approved to a positive 'Approved' pill", () => {
    expect(describeApprovalPill("approved")).toEqual({ label: "Approved", tone: "positive" });
  });
  it("maps changes_requested to a warning 'Needs changes' pill", () => {
    expect(describeApprovalPill("changes_requested")).toEqual({ label: "Needs changes", tone: "warning" });
  });
  it("maps pending to a neutral 'Pending review' pill", () => {
    expect(describeApprovalPill("pending")).toEqual({ label: "Pending review", tone: "neutral" });
  });
});

describe("detailsTabLabel", () => {
  it("omits the count when nothing is connected", () => {
    expect(detailsTabLabel(0)).toBe("Details");
  });
  it("shows the connected count when > 0", () => {
    expect(detailsTabLabel(1)).toBe("Details · 1 connected");
    expect(detailsTabLabel(3)).toBe("Details · 3 connected");
  });
});

describe("buildVersionChips", () => {
  const versions = [
    { id: "c", error: null }, // newest first (index 0) -> highest v number
    { id: "b", error: "boom" },
    { id: "a", error: null },
  ];

  it("numbers newest-first as v{total - index} and marks the active chip", () => {
    const chips = buildVersionChips(versions, "a", false);
    expect(chips.map((c) => c.label)).toEqual(["v3", "v2", "v1"]);
    expect(chips.find((c) => c.id === "a")?.isActive).toBe(true);
    expect(chips.find((c) => c.id === "c")?.isActive).toBe(false);
  });

  it("disables the active chip, error chips, and (while restoring) all chips", () => {
    const chips = buildVersionChips(versions, "a", false);
    expect(chips.find((c) => c.id === "a")?.disabled).toBe(true); // active
    expect(chips.find((c) => c.id === "b")?.disabled).toBe(true); // error
    expect(chips.find((c) => c.id === "b")?.isError).toBe(true);
    expect(chips.find((c) => c.id === "c")?.disabled).toBe(false); // clickable

    const restoring = buildVersionChips(versions, "a", true);
    expect(restoring.every((c) => c.disabled)).toBe(true);
  });

  it("returns an empty array for no versions", () => {
    expect(buildVersionChips([], null, false)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/nodes/prompt-focus.test.ts`
Expected: FAIL — `Failed to resolve import "./prompt-focus"` / functions not defined.

- [ ] **Step 3: Write the implementation**

Create `src/lib/nodes/prompt-focus.ts`:

```ts
import type { ApprovalStatus } from "@/lib/approval";

export type ApprovalPillTone = "neutral" | "positive" | "warning";
export type ApprovalPill = { label: string; tone: ApprovalPillTone };

// Header status pill (read-only): reflects the active version's approval flag (D29).
export function describeApprovalPill(status: ApprovalStatus): ApprovalPill {
  switch (status) {
    case "approved":
      return { label: "Approved", tone: "positive" };
    case "changes_requested":
      return { label: "Needs changes", tone: "warning" };
    case "pending":
    default:
      return { label: "Pending review", tone: "neutral" };
  }
}

// Second-tab label surfaces the connected-input count; drop the suffix when nothing's connected.
export function detailsTabLabel(connectedCount: number): string {
  return connectedCount > 0 ? `Details · ${connectedCount} connected` : "Details";
}

export type VersionChip = {
  id: string;
  label: string; // "v3"
  isActive: boolean;
  isError: boolean;
  disabled: boolean; // active OR error OR restoring
};

// Compact chip model, newest-first (index 0 = highest generation number), mirroring the
// numbering PromptVersionHistory uses (genNumber = total - index). Structural input type keeps
// this lib module free of a component dependency; VersionSummary[] satisfies it.
export function buildVersionChips(
  versions: { id: string; error: string | null }[],
  activeVersionId: string | null,
  restoring: boolean,
): VersionChip[] {
  const total = versions.length;
  return versions.map((v, i) => {
    const isActive = v.id === activeVersionId;
    const isError = !!v.error;
    return {
      id: v.id,
      label: `v${total - i}`,
      isActive,
      isError,
      disabled: isActive || isError || restoring,
    };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/nodes/prompt-focus.test.ts`
Expected: PASS (10 assertions across 3 describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/prompt-focus.ts src/lib/nodes/prompt-focus.test.ts
git commit -m "feat(prompt-focus): pure helpers for status pill, tab label, version chips (YUV-187)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014kbDJcS4nerqmVBkQfkqbG"
```

---

### Task 2: `PromptVersionChips` component

The inline `v1 v2 v3…` strip for the Compose tab's "Generated prompt" header. Click a chip → switch (the existing restore); hover/focus → a Tooltip with that version's details. Uses `buildVersionChips` from Task 1. Presentational; no DOM test (harness can't) — its logic is already covered by Task 1, and it's exercised in Task 3's manual run.

**Files:**
- Create: `src/components/nodes/prompt-version-chips.tsx`

**Interfaces:**
- Consumes: `buildVersionChips` from `@/lib/nodes/prompt-focus`; `VersionSummary` type from `./prompt-version-history`; `Tooltip*` from `@/components/ui/tooltip`.
- Produces: `PromptVersionChips({ versions, activeVersionId, restoring, onSwitch })` where `onSwitch: (versionId: string) => void`. Renders `null` when `versions` is empty.

- [ ] **Step 1: Write the component**

Create `src/components/nodes/prompt-version-chips.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";
import { buildVersionChips } from "@/lib/nodes/prompt-focus";
import type { VersionSummary } from "./prompt-version-history";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function formatWhen(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PromptVersionChips({
  versions,
  activeVersionId,
  restoring,
  onSwitch,
}: {
  versions: VersionSummary[];
  activeVersionId: string | null;
  restoring: boolean;
  onSwitch: (versionId: string) => void;
}) {
  if (versions.length === 0) return null;
  const chips = buildVersionChips(versions, activeVersionId, restoring);

  return (
    <TooltipProvider delay={200}>
      <div className="flex flex-wrap items-center gap-1">
        {chips.map((chip, i) => {
          const v = versions[i];
          return (
            <Tooltip key={chip.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    disabled={chip.disabled}
                    onClick={() => !chip.disabled && onSwitch(chip.id)}
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-xs font-medium tabular-nums transition-colors",
                      chip.isActive
                        ? "cursor-default border-primary bg-primary/10 text-primary"
                        : chip.isError
                          ? "cursor-not-allowed border-border text-red-500 opacity-70"
                          : "cursor-pointer border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  />
                }
              >
                {chip.label}
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-0.5">
                  <p className="font-medium">
                    {chip.label}
                    {chip.isActive ? " · active" : ""}
                    {chip.isError ? " · error" : ""}
                  </p>
                  {v.modelUsed && <p className="opacity-80">{v.modelUsed}</p>}
                  <p className="opacity-80">{formatWhen(v.createdAt)}</p>
                  {v.decision && <p className="opacity-80">eval: {v.decision}</p>}
                  {!chip.isActive && !chip.isError && (
                    <p className="opacity-60">Click to switch</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
```

- [ ] **Step 2: Typecheck the new file**

Run: `npx tsc --noEmit`
Expected: no errors referencing `prompt-version-chips.tsx`. (Tooltip uses Base UI's `render` prop; `VersionSummary` provides `modelUsed`, `createdAt`, `decision`, `error`.)

- [ ] **Step 3: Lint the new file**

Run: `npx eslint src/components/nodes/prompt-version-chips.tsx`
Expected: clean (no unused imports, no `any`).

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/prompt-version-chips.tsx
git commit -m "feat(prompt-focus): PromptVersionChips strip (hover details, click to switch) (YUV-187)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014kbDJcS4nerqmVBkQfkqbG"
```

---

### Task 3: Restructure `prompt-focus-view.tsx` into Compose / Details tabs

Wrap the header + body in `Tabs`, split the body into a **Compose** panel (instruction + `ShotControlsRow` + Generate + "Generated prompt" eyebrow with `PromptVersionChips` + output) and a **Details** panel (Brand KB, connected inputs, eval, approval, model request). Add the header status pill and keep `UsagePopover` in the header. **State and handlers are unchanged** — only JSX moves, plus one new `tab` state and the pill.

**Files:**
- Modify: `src/components/nodes/prompt-focus-view.tsx`

**Interfaces:**
- Consumes: `describeApprovalPill`, `detailsTabLabel` from `@/lib/nodes/prompt-focus`; `PromptVersionChips` from `./prompt-version-chips`; `Tabs, TabsList, TabsTrigger, TabsContent` from `@/components/ui/tabs`.
- Produces: no exported-signature change — `PromptFocusView` keeps the same props.

- [ ] **Step 1: Add imports and the tab state**

In `src/components/nodes/prompt-focus-view.tsx`, add to the import block (near the other `@/components/ui` imports):

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PromptVersionChips } from "./prompt-version-chips";
import { describeApprovalPill, detailsTabLabel } from "@/lib/nodes/prompt-focus";
```

Add the tab state next to the other `useState` calls (e.g. after `const [restoring, setRestoring] = useState(false);`):

```tsx
const [tab, setTab] = useState<"compose" | "details">("compose");
```

- [ ] **Step 2: Replace the `return (...)` body with the tabbed layout**

Replace the entire `return (` … `);` at the end of the component (currently the `<Sheet>…</Sheet>` block, ~lines 388–633) with this. It reuses the existing header controls, instruction/output zones, and left-panel sections verbatim — only their placement changes.

```tsx
  const pill = describeApprovalPill(approvalStatus);
  const pillTone =
    pill.tone === "positive"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-400"
      : pill.tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-400"
        : "border-border bg-muted text-muted-foreground";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        {/* Drag handle */}
        <div className="flex shrink-0 justify-center pt-3">
          <div className="h-1.5 w-12 rounded-full bg-border" />
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "compose" | "details")}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          {/* Header */}
          <div className="shrink-0 border-b">
            <div className="mx-auto w-full max-w-5xl px-6 pb-5 pt-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-4" /> Back to canvas
              </button>

              <header className="mt-4 flex items-start justify-between gap-4">
                <div>
                  <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">
                    <EditableField
                      value={title || ""}
                      onCommit={(t) => onPatch({ title: normalizeTitle(t) })}
                      placeholder="Image prompt"
                      className="font-display text-3xl font-semibold tracking-tight"
                    />
                  </SheetTitle>
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    Compose context into a generated image prompt.
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <TabsList>
                    <TabsTrigger value="compose">Compose</TabsTrigger>
                    <TabsTrigger value="details">
                      {detailsTabLabel(upstream.length)}
                    </TabsTrigger>
                  </TabsList>

                  {mode === "result" && (
                    <button
                      type="button"
                      onClick={() => setTab("details")}
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold",
                        pillTone,
                      )}
                    >
                      {pill.label}
                    </button>
                  )}

                  {versions.length > 0 && <UsagePopover versions={versions} />}
                  {mode === "result" && dirty && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[0.65rem] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                      Unsaved changes
                    </span>
                  )}
                  {mode === "result" && (
                    <Button size="lg" onClick={handleSave} disabled={!dirty}>
                      Save
                    </Button>
                  )}
                  <GuidedNextButton
                    sourceId={nodeId}
                    variant="button"
                    onNavigate={() => onOpenChange(false)}
                  />
                </div>
              </header>
            </div>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 flex justify-center overflow-hidden">
            {/* COMPOSE */}
            <TabsContent
              value="compose"
              className="w-full max-w-3xl min-h-0 flex flex-col overflow-hidden"
            >
              {/* Instruction zone */}
              <div
                className="flex flex-col gap-3 px-6 py-5 border-b border-border overflow-hidden"
                style={{ flex: "3 3 0%" }}
              >
                <div className="flex items-center gap-1.5">
                  <PencilLine className="size-3.5 text-primary" />
                  <span className="text-eyebrow">Instruction</span>
                </div>
                <textarea
                  value={instructionDraft}
                  onChange={(e) => {
                    setInstructionDraft(e.target.value);
                    onPatch({ instruction: e.target.value });
                  }}
                  placeholder={instructionPlaceholder}
                  className="flex-1 min-h-0 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <ShotControlsRow
                  controls={controls ?? DEFAULT_SHOT_CONTROLS}
                  onChange={(next) => onPatch({ controls: next })}
                />
                <Button
                  className="w-full"
                  size="default"
                  onClick={runGenerate}
                  disabled={generating || !editable}
                >
                  <Sparkles className="size-4" />
                  {generating ? "Generating…" : output ? "Re-generate" : "Generate prompt"}
                </Button>
              </div>

              {/* Output zone */}
              <div
                className="flex flex-col gap-3 px-6 py-5 min-h-0 overflow-hidden"
                style={{ flex: "7 7 0%" }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-primary" />
                    <span className="text-eyebrow">Generated prompt</span>
                  </div>
                  <PromptVersionChips
                    versions={versions}
                    activeVersionId={activeVersionId}
                    restoring={restoring}
                    onSwitch={handleRestoreVersion}
                  />
                </div>

                {mode === "skeleton" && (
                  <div className="flex-1 space-y-2.5 pt-1">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-4 animate-pulse rounded bg-muted-foreground/20"
                        style={{ width: `${70 + (i % 4) * 7}%` }}
                      />
                    ))}
                  </div>
                )}

                {mode === "empty" && (
                  <div className="flex-1 flex items-center justify-center rounded-xl border border-dashed border-border">
                    <div className="text-center px-8">
                      <Sparkles className="size-8 mx-auto text-muted-foreground/40 mb-3" />
                      <p className="text-sm font-medium text-muted-foreground">
                        Not generated yet
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        Set an instruction and click Generate.
                      </p>
                    </div>
                  </div>
                )}

                {mode === "result" && (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="flex-1 w-full resize-none rounded-xl border border-border bg-background p-4 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                )}
              </div>
            </TabsContent>

            {/* DETAILS */}
            <TabsContent
              value="details"
              className="w-full max-w-3xl min-h-0 overflow-y-auto px-6 py-6"
            >
              {detailNode ? (
                <ConnectedDetailView node={detailNode} onBack={() => setDetailNodeId(null)} />
              ) : (
                <div className="flex flex-col gap-6">
                  <LeftSection
                    icon={Palette}
                    label="Brand KB"
                    action={
                      params?.id ? (
                        <Link
                          href={`/clients/${params.id}/kb`}
                          title="Edit Brand KB"
                          className="inline-flex items-center text-muted-foreground transition-colors hover:text-primary"
                        >
                          <ExternalLink className="size-3.5" />
                        </Link>
                      ) : undefined
                    }
                  >
                    <SliceToggles selected={slices} onToggle={toggleSlice} />
                  </LeftSection>

                  <LeftSection
                    icon={Link2}
                    label="Connected"
                    badge={`${upstream.length} input${upstream.length === 1 ? "" : "s"}`}
                  >
                    <div className="max-h-72 overflow-y-auto pb-2">
                      {loadingPreview ? (
                        <div className="space-y-2">
                          {Array.from({ length: Math.max(upstream.length, 2) }).map((_, i) => (
                            <div key={i} className="space-y-1.5 rounded-lg border border-border p-3">
                              <div className="h-3 w-1/3 animate-pulse rounded bg-muted-foreground/20" />
                              <div className="h-3 w-full animate-pulse rounded bg-muted-foreground/20" />
                              <div className="h-3 w-4/5 animate-pulse rounded bg-muted-foreground/20" />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <ConnectedInputsCard
                          upstream={upstream}
                          preview={preview.connected}
                          onOpenDetail={setDetailNodeId}
                        />
                      )}
                    </div>
                  </LeftSection>

                  {mode === "result" && !!activeVersionId && (
                    <div className="flex flex-col gap-3">
                      <InlineEvalBar
                        decision={evalDecision}
                        note={evalNote}
                        saving={evalSaving}
                        visible={mode === "result" && !!activeVersionId}
                        onDecision={handleEvalDecision}
                        onNote={setEvalNote}
                        onNoteBlur={handleEvalNoteBlur}
                      />
                      <InlineApprovalBar
                        status={approvalStatus}
                        note={approvalNote}
                        saving={approvalSaving}
                        canApprove={editable && identity?.role === "senior"}
                        onSet={saveApproval}
                      />
                      {activeRequest && <ModelRequestPanel request={activeRequest} />}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
```

- [ ] **Step 3: Remove now-dead code**

The `Aperture` import and `LeftSection`'s `Shot controls`/`PromptVersionHistory` usages are gone from the body. Delete:
- The `import { … Aperture … }` entry from `lucide-react` (no longer used).
- The `PromptVersionHistory` import (line ~37-40) **and** the `import { … } from "./prompt-version-history"` — but **keep** the `type VersionSummary` import if still referenced; re-import the type explicitly: `import type { VersionSummary } from "./prompt-version-history";` (it is still used by `useState<VersionSummary[]>`).

Then run: `npx tsc --noEmit`
Expected: no errors. Fix any "declared but never used" by removing the specific dead import (e.g. `Aperture`, `PromptVersionHistory`).

- [ ] **Step 4: Lint**

Run: `npx eslint src/components/nodes/prompt-focus-view.tsx`
Expected: clean. Resolve any unused-import warnings surfaced by the relocation.

- [ ] **Step 5: Manual verification run (no DOM tests in this harness)**

Run the app and drive the Prompt focus view (use the `/run` skill or `npm run dev`). Confirm the checklist — this is the acceptance evidence for a pure-UI change:

1. Focus view opens on **Compose**; instruction textarea, shot-controls row, and Generate button are visible.
2. After Generate (result mode): a **"Generated prompt"** eyebrow shows above a large output textarea that dominates the zone. No eval/approval/model-request on Compose.
3. **Version chips** `v1 v2…` appear beside the eyebrow; hovering shows details; clicking a non-active chip switches the version (output updates); the active chip is highlighted and non-clickable.
4. The second tab reads **`Details · N connected`** (N = connected inputs). Opening it shows Brand KB toggles, connected inputs, and (in result mode) eval + approval + model request. Opening a connected input shows the detail view inside the tab.
5. **Cost popover** stays in the header on both tabs (when versions exist).
6. The **status pill** appears in the header in result mode, reflects approval state, and clicking it jumps to Details.
7. Read-only session (D33): Generate and approval controls are disabled.

- [ ] **Step 6: Run the full test suite (guard against regressions)**

Run: `npx vitest run`
Expected: PASS — including `src/lib/nodes/prompt-focus.test.ts`. (No existing test asserts the old layout.)

- [ ] **Step 7: Commit**

```bash
git add src/components/nodes/prompt-focus-view.tsx
git commit -m "feat(prompt-focus): split into Compose/Details tabs, output-first (YUV-187, YUV-165)

Compose tab: instruction + shot controls -> generate -> labelled dominant
output + version chips. Details tab (Details · N connected): Brand KB,
connected inputs, eval, approval, model request. Cost stays in header;
read-only approval status pill added. Delivers YUV-165 output prominence.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014kbDJcS4nerqmVBkQfkqbG"
```

---

## Notes / follow-ups (not in this plan)

- **YUV-165 Video Prompt view** — `video-prompt-focus-view.tsx` gets the same "Generated (motion) prompt" eyebrow + output prominence (and optionally the tab split) as a separate branch. Track it; do **not** bundle it here.
- **Optional cleanup** — if `prompt-focus-view.tsx` feels too large after this, extract `prompt-compose-tab.tsx` / `prompt-details-tab.tsx` (spec §5). Deferred: the container is already large and this change nets removes the dual-panel layout; extraction is a taste call for a follow-up, not required for the feature.

## Self-review

- **Spec coverage:** Compose column (§4.2) → Task 3 Step 2; shot controls in instruction zone (§4.2) → Step 2; "Generated prompt" eyebrow + prominence / YUV-165 (§4.2, §8) → Step 2; version chips hover+switch (§4.2.1) → Tasks 1+2, wired in Step 2; Details tab contents (§4.3) → Step 2; tab label `Details · N connected` (§4.1) → Task 1 `detailsTabLabel`, used Step 2; cost stays in header (§4.4) → Step 2 keeps `UsagePopover`; status pill (§4.4) → Task 1 `describeApprovalPill`, rendered Step 2; read-only D33 (§4.5) → unchanged guards, verified Step 5.7; testing (§7) → node-env pure tests (Task 1) + manual checklist (Task 3 Step 5), matching the harness.
- **Placeholder scan:** none — all steps show full code or exact commands.
- **Type consistency:** `describeApprovalPill`/`detailsTabLabel`/`buildVersionChips` signatures match between Task 1 definition, the Task 1 tests, the Task 2 consumer, and Task 3 usage. `PromptVersionChips` props (`versions`, `activeVersionId`, `restoring`, `onSwitch`) match Task 2 definition and Task 3 call site. `handleRestoreVersion`, `activeVersionId`, `restoring`, `versions`, `approvalStatus`, `activeRequest`, `upstream` are all existing container state used unchanged.
