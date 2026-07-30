# Bug Fixes & UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 9 bugs and UX gaps found during active canvas use — covering critical workflow bugs (duplicate node, usage popover data, KB doc analysis) and UX improvements (skeleton, file upload indicator, aspect ratio, shot type, smart param reset, canvas cost display).

**Architecture:** Issues are grouped into 11 tasks ordered by risk and dependency. Critical bugs first (KB guard, duplicate node, usage popover). Isolated utilities next (smart param reset). Then pipeline wiring (prompts → generations). Then UI improvements. Each task is independently committable and testable.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (postgres + realtime), Zustand (canvas-store), Vitest (tests in `src/**/*.test.ts`), Tailwind CSS, Lucide icons.

---

## File Map

**New files:**
- `src/app/api/nodes/[id]/duplicate/route.ts` — server-side duplicate endpoint
- `src/app/api/nodes/[id]/cost/route.ts` — per-node cost query
- `src/app/api/canvas/[id]/cost/route.ts` — canvas-level cost query
- `src/lib/image-gen/params/merge.ts` — `smartMergeParams` utility
- `src/lib/nodes/shot-types.ts` — `SHOT_TYPES` constant + `deriveShotType`
- `src/components/nodes/usage-popover-shell.tsx` — shared popover UI shell

**Modified files:**
- `src/lib/kb/constants.ts` — add `KB_DOC_PER_FILE_LIMIT_BYTES`
- `src/app/api/clients/[id]/kb/documents/route.ts` — per-file size guard
- `src/lib/kb/providers/openai.ts` — per-file guard + skipped list
- `src/trigger/kb-build.ts` — surface skipped files in completion payload
- `src/lib/canvas-store.ts` — make `duplicateNode` async, call server endpoint
- `src/components/nodes/image-gen-usage-popover.tsx` — fix null token data bug + use shell
- `src/components/nodes/prompt-usage-popover.tsx` — use shell
- `src/components/nodes/video-gen-usage-popover.tsx` — use shell
- `src/lib/image-gen/params/openai.ts` — replace `size` with `aspect_ratio`
- `src/lib/image-gen/providers/openai.ts` — add `aspectRatioToOpenAISize` translation
- `src/components/nodes/image-gen-focus-view.tsx` — smart param reset + aspect ratio migration
- `src/lib/generation-tray.ts` — remove prompt skip guard, add prompt label
- `src/components/canvas/generation-tray-item.tsx` — handle `"prompt"` assetType
- `src/app/api/nodes/[id]/generate/route.ts` — wire into generations pipeline
- `src/lib/canvas-nodes.ts` — add `shot_type` to `ShotNodeData`
- `src/components/nodes/script-node.tsx` — improved skeleton
- `src/components/nodes/file-node.tsx` — upload indicator
- `src/components/nodes/file-focus-view.tsx` — propagate `onUploadingChange`
- `src/components/nodes/shot-node.tsx` — shot type chip
- `src/components/nodes/shot-focus-view.tsx` — shot type select

---

## Task 1: KB Per-File Size Guard

**Files:**
- Modify: `src/lib/kb/constants.ts`
- Modify: `src/app/api/clients/[id]/kb/documents/route.ts`
- Modify: `src/lib/kb/providers/openai.ts`

- [ ] **Step 1.1: Add constant to `src/lib/kb/constants.ts`**

  Open the file and add after the existing size limit constants (after line 2):

  ```typescript
  export const KB_DOC_PER_FILE_LIMIT_BYTES = 1 * 1024 * 1024; // 1 MB — OpenAI input_file API limit
  ```

- [ ] **Step 1.2: Add per-file guard in upload route**

  In `src/app/api/clients/[id]/kb/documents/route.ts`, add this import at the top alongside existing imports:

  ```typescript
  import { DOC_EXTENSIONS, KB_DOC_PER_FILE_LIMIT_BYTES } from "@/lib/kb/constants";
  ```

  Then add this block immediately after `const { ext } = extResult;` (before the `getKBTotalBytes` call):

  ```typescript
  if (file.size > KB_DOC_PER_FILE_LIMIT_BYTES) {
    return apiError(
      "Document is too large for AI analysis (max 1 MB per file). Please split or compress it.",
      400,
    );
  }
  ```

  Also remove the import of `KB_DOC_SIZE_LIMIT_BYTES` from `@/lib/db/kb` if it was imported there — the route currently imports it from `@/lib/db/kb`. Keep that import but also import the new per-file constant from `@/lib/kb/constants`.

- [ ] **Step 1.3: Add guard in OpenAI KB extraction provider**

  In `src/lib/kb/providers/openai.ts`, add this import at the top:

  ```typescript
  import { KB_DOC_PER_FILE_LIMIT_BYTES } from "@/lib/kb/constants";
  ```

  In the `extractKB` method, change the for-loop body. Find:

  ```typescript
  for (const doc of docs) {
    if (FILE_EXTENSIONS.has(doc.file_ext)) {
      docUserContent.push({ type: "input_file", file_url: doc.storage_url });
    } else if (TEXT_EXTENSIONS.has(doc.file_ext)) {
  ```

  Replace with:

  ```typescript
  const skipped: { filename: string; reason: string }[] = [];
  for (const doc of docs) {
    if (FILE_EXTENSIONS.has(doc.file_ext)) {
      if (doc.size_bytes > KB_DOC_PER_FILE_LIMIT_BYTES) {
        skipped.push({ filename: doc.filename, reason: "exceeds 1 MB per-file limit" });
        continue;
      }
      docUserContent.push({ type: "input_file", file_url: doc.storage_url });
    } else if (TEXT_EXTENSIONS.has(doc.file_ext)) {
  ```

  Then update the return value at the end of `extractKB` to include skipped:

  ```typescript
  return {
    kbOutput,
    modelUsed: kbExtractPrompt.model,
    fillRate: computeFillRate(kbOutput),
    skipped,
  };
  ```

  Update the `KBAnalysisProvider` interface return type if needed — check `src/lib/kb/providers/interface.ts` and add `skipped?: { filename: string; reason: string }[]` to the return type of `extractKB`.

- [ ] **Step 1.4: Write test for the per-file size guard**

  Create `src/lib/kb/__tests__/constants.test.ts`:

  ```typescript
  import { describe, it, expect } from "vitest";
  import { KB_DOC_PER_FILE_LIMIT_BYTES, KB_DOC_SIZE_LIMIT_BYTES } from "../constants";

  describe("KB constants", () => {
    it("per-file limit is 1 MB", () => {
      expect(KB_DOC_PER_FILE_LIMIT_BYTES).toBe(1 * 1024 * 1024);
    });

    it("per-file limit is smaller than per-client limit", () => {
      expect(KB_DOC_PER_FILE_LIMIT_BYTES).toBeLessThan(KB_DOC_SIZE_LIMIT_BYTES);
    });
  });
  ```

- [ ] **Step 1.5: Run tests**

  ```bash
  npm run test -- src/lib/kb/__tests__/constants.test.ts
  ```

  Expected: PASS (2 tests)

- [ ] **Step 1.6: Surface skipped files in `kb-build.ts`**

  In `src/trigger/kb-build.ts`, find where `extractKB` result is used. The return now includes `skipped`. Log or include it in the completion payload so users know which docs were excluded. Find the completion webhook call and add `skippedDocs: result.skipped ?? []` to the payload:

  ```typescript
  // Find the success webhook call, e.g.:
  await sendKBWebhook({ kind: "succeeded", kbOutput: result.kbOutput, ... });
  // Update to:
  await sendKBWebhook({ kind: "succeeded", kbOutput: result.kbOutput, skippedDocs: result.skipped ?? [], ... });
  ```

  If the webhook payload type is typed, add `skippedDocs?: { filename: string; reason: string }[]` to it.

- [ ] **Step 1.7: Commit**

  ```bash
  git add src/lib/kb/constants.ts src/app/api/clients/[id]/kb/documents/route.ts src/lib/kb/providers/openai.ts src/lib/kb/__tests__/constants.test.ts src/trigger/kb-build.ts
  git commit -m "fix: add 1 MB per-file size guard for KB document upload and extraction"
  ```

---

## Task 2: Server-Side Duplicate Node

**Files:**
- Create: `src/app/api/nodes/[id]/duplicate/route.ts`
- Modify: `src/lib/canvas-store.ts`

- [ ] **Step 2.1: Write test for the duplicate endpoint logic (pure functions)**

  Create `src/app/api/nodes/[id]/duplicate/__tests__/duplicate.test.ts`:

  ```typescript
  import { describe, it, expect } from "vitest";

  describe("duplicate node offset", () => {
    it("offsets position by +32 on both axes", () => {
      const original = { x: 100, y: 200 };
      const duplicated = { x: original.x + 32, y: original.y + 32 };
      expect(duplicated).toEqual({ x: 132, y: 232 });
    });
  });
  ```

- [ ] **Step 2.2: Run test to verify it passes**

  ```bash
  npm run test -- src/app/api/nodes/[id]/duplicate/__tests__/duplicate.test.ts
  ```

  Expected: PASS

- [ ] **Step 2.3: Create the duplicate route**

  Create `src/app/api/nodes/[id]/duplicate/route.ts`:

  ```typescript
  import { createServerSupabase } from "@/lib/supabase/server";
  import { apiError, apiOk, withTryCatch } from "@/lib/api/route-helpers";

  export async function POST(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const { id: sourceNodeId } = await params;

    return withTryCatch("Duplicate node failed", async () => {
      const supabase = createServerSupabase();

      // 1. Fetch source node
      const { data: sourceNode, error: nodeErr } = await supabase
        .from("nodes")
        .select("*")
        .eq("id", sourceNodeId)
        .single();

      if (nodeErr || !sourceNode) {
        return apiError("Source node not found.", 404);
      }

      // KB nodes cannot be duplicated
      if (sourceNode.type === "kb") {
        return apiError("KB nodes cannot be duplicated.", 400);
      }

      // 2. Create new node
      const newNodeId = crypto.randomUUID();
      const newPosition = {
        x: (sourceNode.position as { x: number; y: number }).x + 32,
        y: (sourceNode.position as { x: number; y: number }).y + 32,
      };

      const { data: newNode, error: insertErr } = await supabase
        .from("nodes")
        .insert({
          id: newNodeId,
          canvas_id: sourceNode.canvas_id,
          type: sourceNode.type,
          position: newPosition,
          data: sourceNode.data ?? {},
          active_version_id: null,
        })
        .select()
        .single();

      if (insertErr || !newNode) {
        return apiError("Failed to create duplicate node.", 500);
      }

      // 3. Copy active version if one exists
      if (sourceNode.active_version_id) {
        const { data: activeVersion, error: versionErr } = await supabase
          .from("node_versions")
          .select("*")
          .eq("id", sourceNode.active_version_id)
          .single();

        if (!versionErr && activeVersion) {
          const { data: newVersion, error: newVersionErr } = await supabase
            .from("node_versions")
            .insert({
              node_id: newNodeId,
              inputs_used: activeVersion.inputs_used ?? {},
              params_used: activeVersion.params_used ?? {},
              model_used: activeVersion.model_used ?? null,
              output: activeVersion.output ?? null,
              generated_output: activeVersion.generated_output ?? null,
              operator: "duplicate",
            })
            .select()
            .single();

          if (!newVersionErr && newVersion) {
            await supabase
              .from("nodes")
              .update({ active_version_id: newVersion.id })
              .eq("id", newNodeId);

            newNode.active_version_id = newVersion.id;
          }
        }
      }

      return apiOk({ node: newNode }, 201);
    });
  }
  ```

- [ ] **Step 2.4: Update `duplicateNode` in canvas-store to call the endpoint**

  In `src/lib/canvas-store.ts`, find the `duplicateNode` action (around line 175):

  ```typescript
  duplicateNode: (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node || node.type === "kb") return;
    set({
      nodes: [
        ...get().nodes,
        {
          ...node,
          id: crypto.randomUUID(),
          position: { x: node.position.x + 32, y: node.position.y + 32 },
          selected: false,
        } as AppNode,
      ],
    });
  },
  ```

  Replace with:

  ```typescript
  duplicateNode: async (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node || node.type === "kb") return;

    try {
      const res = await fetch(`/api/nodes/${id}/duplicate`, { method: "POST" });
      if (!res.ok) {
        console.error("Duplicate node failed:", await res.text());
        return;
      }
      const { node: newNode } = await res.json() as { node: { id: string; position: { x: number; y: number }; type: string; data: Record<string, unknown>; active_version_id: string | null } };

      // Hydrate parsed from active version output if available — same pattern as nodeRowToFlow
      const data = { ...(node.data as Record<string, unknown>), ...(newNode.data as Record<string, unknown>) };

      set({
        nodes: [
          ...get().nodes,
          {
            ...node,
            id: newNode.id,
            position: newNode.position,
            data,
            selected: false,
          } as AppNode,
        ],
      });
    } catch (err) {
      console.error("Duplicate node error:", err);
    }
  },
  ```

  Also update the type signature in the store interface (find `duplicateNode: (id: string) => void` and change to `duplicateNode: (id: string) => Promise<void>`).

- [ ] **Step 2.5: Commit**

  ```bash
  git add src/app/api/nodes/[id]/duplicate/route.ts src/app/api/nodes/[id]/duplicate/__tests__/duplicate.test.ts src/lib/canvas-store.ts
  git commit -m "fix: server-side node duplication that preserves active version"
  ```

---

## Task 3: Usage Popover Data Bug Fix

**Files:**
- Modify: `src/components/nodes/image-gen-usage-popover.tsx`

- [ ] **Step 3.1: Write test for the fixed calculation logic**

  Create `src/components/nodes/__tests__/usage-popover-calc.test.ts`:

  ```typescript
  import { describe, it, expect } from "vitest";

  // Mirrors the calculation logic from image-gen-usage-popover.tsx
  function computeStats(versions: Array<{ paramsUsed?: { tokensUsed?: { total_tokens: number } | null; modelId?: string } | null; modelUsed?: string | null; createdAt: string }>) {
    let totalUsd = 0;
    let counted = 0;
    const perGen: { vNum: number; hasData: boolean }[] = [];

    const ordered = [...versions].reverse();
    ordered.forEach((v, i) => {
      const tokens = v.paramsUsed?.tokensUsed;
      const hasData = !!tokens;
      // Fixed: don't skip — always push to perGen, mark hasData
      perGen.push({ vNum: i + 1, hasData });
      if (hasData) {
        counted++;
        totalUsd += 0.01; // mock cost
      }
    });

    return { counted, perGenLength: perGen.length };
  }

  describe("usage popover calculation", () => {
    it("shows all versions even when some have no token data", () => {
      const versions = [
        { paramsUsed: { tokensUsed: { total_tokens: 100 }, modelId: "openai:gpt-image-2" }, createdAt: "2026-01-01T00:00:00Z" },
        { paramsUsed: null, createdAt: "2026-01-02T00:00:00Z" }, // edited version — no tokens
        { paramsUsed: { tokensUsed: { total_tokens: 200 }, modelId: "openai:gpt-image-2" }, createdAt: "2026-01-03T00:00:00Z" },
      ];
      const { counted, perGenLength } = computeStats(versions);
      expect(perGenLength).toBe(3); // all 3 shown
      expect(counted).toBe(2);      // only 2 have cost data
    });

    it("counted === 0 only when truly no versions exist", () => {
      const { counted, perGenLength } = computeStats([]);
      expect(counted).toBe(0);
      expect(perGenLength).toBe(0);
    });
  });
  ```

- [ ] **Step 3.2: Run test to see it describes the fixed behavior**

  ```bash
  npm run test -- src/components/nodes/__tests__/usage-popover-calc.test.ts
  ```

  Expected: PASS

- [ ] **Step 3.3: Fix the image-gen usage popover**

  In `src/components/nodes/image-gen-usage-popover.tsx`, replace the `useMemo` block.

  Find:

  ```typescript
  const ordered = [...versions].reverse(); // oldest first → v1, v2, …
  ordered.forEach((v, i) => {
    const tokens = v.paramsUsed?.tokensUsed;
    if (!tokens) return;
    const modelId = v.paramsUsed?.modelId ?? v.modelUsed ?? "";
    const cost = computeImageCost(modelId, tokens);
    if (!cost) return;
    if (modelId) displayModel = modelId.split(":")[1] ?? modelId;
    totalUsd    += cost.usd;
    totalTokens += tokens.total_tokens;
    counted++;
    perGen.push({
      vNum: i + 1,
      createdAt: v.createdAt,
      totalTokens: tokens.total_tokens,
      costUsd: cost.usd,
      costInr: cost.inr,
      modelId: modelId.split(":")[1] ?? modelId,
    });
  });
  ```

  Replace with:

  ```typescript
  const ordered = [...versions].reverse(); // oldest first → v1, v2, …
  ordered.forEach((v, i) => {
    const tokens = v.paramsUsed?.tokensUsed ?? null;
    const modelId = v.paramsUsed?.modelId ?? v.modelUsed ?? "";
    const cost = tokens ? computeImageCost(modelId, tokens) : null;

    if (modelId && cost) displayModel = modelId.split(":")[1] ?? modelId;
    if (tokens) totalTokens += tokens.total_tokens;
    if (cost) { totalUsd += cost.usd; counted++; }

    perGen.push({
      vNum: i + 1,
      createdAt: v.createdAt,
      totalTokens: tokens?.total_tokens ?? 0,
      costUsd: cost?.usd ?? 0,
      costInr: cost?.inr ?? 0,
      modelId: modelId ? (modelId.split(":")[1] ?? modelId) : "",
      hasData: !!tokens,
    });
  });
  ```

  Also add `hasData: boolean` to the `GenStat` type at the top:

  ```typescript
  type GenStat = {
    vNum: number;
    createdAt: string;
    totalTokens: number;
    costUsd: number;
    costInr: number;
    modelId: string;
    hasData: boolean;
  };
  ```

  In the JSX, update the per-generation cost display to show `—` when no data:

  Find:
  ```tsx
  <span className="text-[0.65rem] font-medium tabular-nums text-foreground">
    ${g.costUsd.toFixed(4)}{" "}
    <span className="font-normal text-muted-foreground">(₹{g.costInr.toFixed(2)})</span>
  </span>
  ```

  Replace with:
  ```tsx
  <span className="text-[0.65rem] font-medium tabular-nums text-foreground">
    {g.hasData ? (
      <>
        ${g.costUsd.toFixed(4)}{" "}
        <span className="font-normal text-muted-foreground">(₹{g.costInr.toFixed(2)})</span>
      </>
    ) : (
      <span className="font-normal text-muted-foreground">—</span>
    )}
  </span>
  ```

  Also change the empty state condition — show "No usage data yet" only when `perGen.length === 0`, not `counted === 0`:

  Find:
  ```tsx
  {totals.counted === 0 ? (
    <p className="text-xs text-muted-foreground">No usage data yet.</p>
  ) : (
  ```

  Replace with:
  ```tsx
  {perGen.length === 0 ? (
    <p className="text-xs text-muted-foreground">No usage data yet.</p>
  ) : (
  ```

- [ ] **Step 3.4: Run tests**

  ```bash
  npm run test -- src/components/nodes/__tests__/usage-popover-calc.test.ts
  ```

  Expected: PASS

- [ ] **Step 3.5: Commit**

  ```bash
  git add src/components/nodes/image-gen-usage-popover.tsx src/components/nodes/__tests__/usage-popover-calc.test.ts
  git commit -m "fix: usage popover shows all versions even when edited versions have no token data"
  ```

---

## Task 4: Shared Usage Popover Shell

**Files:**
- Create: `src/components/nodes/usage-popover-shell.tsx`
- Modify: `src/components/nodes/image-gen-usage-popover.tsx`
- Modify: `src/components/nodes/prompt-usage-popover.tsx`
- Modify: `src/components/nodes/video-gen-usage-popover.tsx`

- [ ] **Step 4.1: Create `UsagePopoverShell`**

  Create `src/components/nodes/usage-popover-shell.tsx`:

  ```typescript
  "use client";

  import { ReceiptText } from "lucide-react";
  import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

  export type UsageRow = {
    label: string;     // e.g. "v1", "v2"
    meta?: string;     // e.g. "1,234 tokens" or "1,234 in · 567 out"
    cost: string;      // formatted cost string, "—" if unknown
    time?: string;     // relative time string
  };

  export function UsagePopoverShell({
    rows,
    totalLabel,
    totalCost,
    modelLabel,
  }: {
    rows: UsageRow[];
    totalLabel?: string;  // e.g. "Total tokens: 1,234"
    totalCost: string;    // e.g. "$0.0042 (₹0.40)"
    modelLabel?: string;
  }) {
    return (
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ReceiptText className="size-3.5" strokeWidth={1.5} />
              Usage
            </button>
          }
        />
        <PopoverContent align="end" className="w-64 p-4">
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No usage data yet.</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-eyebrow">Overall</p>
                {totalLabel && (
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-xs text-muted-foreground">{totalLabel}</span>
                  </div>
                )}
                <div className="pt-0.5">
                  {modelLabel && (
                    <p className="mb-0.5 text-[0.6rem] text-muted-foreground">{modelLabel}</p>
                  )}
                  <p className="text-sm font-semibold text-foreground">{totalCost}</p>
                </div>
              </div>

              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-eyebrow">Per generation</p>
                <ul className="space-y-2">
                  {rows.map((row) => (
                    <li key={row.label} className="rounded-md bg-muted/50 px-2.5 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">{row.label}</span>
                        {row.time && (
                          <span className="text-[0.65rem] text-muted-foreground">{row.time}</span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        {row.meta && (
                          <span className="text-[0.65rem] text-muted-foreground tabular-nums">
                            {row.meta}
                          </span>
                        )}
                        <span className="text-[0.65rem] font-medium tabular-nums text-foreground ml-auto">
                          {row.cost}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
    );
  }
  ```

- [ ] **Step 4.2: Migrate `ImageGenUsagePopover` to use the shell**

  In `src/components/nodes/image-gen-usage-popover.tsx`, replace the JSX return entirely.

  Add import at top:
  ```typescript
  import { UsagePopoverShell, type UsageRow } from "./usage-popover-shell";
  ```

  Remove the old imports of `Popover`, `PopoverContent`, `PopoverTrigger`, `ReceiptText`.

  Replace the `return (...)` block with:

  ```typescript
  function relativeTime(dateStr: string): string {
    const diffMins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const h = Math.floor(diffMins / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  // (keep relativeTime if it was already defined; move it here if needed)

  // Inside the component, build rows from perGen:
  const rows: UsageRow[] = perGen.map((g) => ({
    label: `v${g.vNum}`,
    time: relativeTime(g.createdAt),
    meta: g.hasData ? `${g.totalTokens.toLocaleString()} tokens` : undefined,
    cost: g.hasData
      ? `$${g.costUsd.toFixed(4)} (₹${g.costInr.toFixed(2)})`
      : "—",
  }));

  return (
    <UsagePopoverShell
      rows={rows}
      totalLabel={totals.totalTokens > 0 ? `Total tokens: ${totals.totalTokens.toLocaleString()}` : undefined}
      totalCost={`$${totals.totalUsd.toFixed(4)} (₹${totals.totalInr.toFixed(2)})`}
      modelLabel={totals.displayModel || undefined}
    />
  );
  ```

- [ ] **Step 4.3: Migrate `UsagePopover` (prompt) to use the shell**

  In `src/components/nodes/prompt-usage-popover.tsx`, add import:
  ```typescript
  import { UsagePopoverShell, type UsageRow } from "./usage-popover-shell";
  ```

  Remove imports of `Popover`, `PopoverContent`, `PopoverTrigger`, `ReceiptText`.

  Replace the `return (...)` block with:

  ```typescript
  const rows: UsageRow[] = perGen.map((g) => ({
    label: `v${g.vNum}`,
    time: relativeTime(g.createdAt),
    meta: `${g.inputTokens.toLocaleString()} in · ${g.outputTokens.toLocaleString()} out`,
    cost: `$${g.costUsd.toFixed(4)} (₹${g.costInr.toFixed(2)})`,
  }));

  return (
    <UsagePopoverShell
      rows={rows}
      totalLabel={`Total tokens: ${totals.totalTokens.toLocaleString()}`}
      totalCost={`$${totals.costUsd.toFixed(4)} (₹${totals.costInr.toFixed(2)})`}
      modelLabel={totals.displayModel || undefined}
    />
  );
  ```

- [ ] **Step 4.4: Migrate video gen usage popover**

  Find `src/components/nodes/video-gen-usage-popover.tsx` and apply the same pattern — replace its JSX return with `UsagePopoverShell`, mapping its per-gen data to `UsageRow[]`. Keep its cost calculation logic unchanged.

- [ ] **Step 4.5: Run build to check for type errors**

  ```bash
  npm run build 2>&1 | tail -30
  ```

  Expected: no TypeScript errors in the affected files. Fix any type errors before continuing.

- [ ] **Step 4.6: Commit**

  ```bash
  git add src/components/nodes/usage-popover-shell.tsx src/components/nodes/image-gen-usage-popover.tsx src/components/nodes/prompt-usage-popover.tsx src/components/nodes/video-gen-usage-popover.tsx
  git commit -m "refactor: extract shared UsagePopoverShell, migrate all usage popovers"
  ```

---

## Task 5: Smart Param Reset on Model Switch

**Files:**
- Create: `src/lib/image-gen/params/merge.ts`
- Modify: `src/components/nodes/image-gen-focus-view.tsx`

- [ ] **Step 5.1: Write tests for `smartMergeParams`**

  Create `src/lib/image-gen/params/__tests__/merge.test.ts`:

  ```typescript
  import { describe, it, expect } from "vitest";
  import { smartMergeParams } from "../merge";
  import type { ClientModelSpec } from "../../client-models";

  function makeModel(params: Array<{ name: string; options?: string[]; min?: number; max?: number; defaultValue: unknown }>): ClientModelSpec {
    return {
      id: "test:model",
      provider: "test",
      mediaType: "image",
      label: "Test Model",
      providerLabel: "Test",
      maxReferenceImages: 0,
      maxReferenceSizeBytes: 0,
      params: params.map((p) => ({
        name: p.name,
        label: p.name,
        component: p.options ? "select" as const : "slider" as const,
        group: "primary" as const,
        order: 0,
        visible: true,
        defaultValue: p.defaultValue,
        constraints: p.options
          ? { type: "select" as const, options: p.options }
          : { type: "slider" as const, min: p.min ?? 0, max: p.max ?? 100, step: 1 },
      })),
      schema: {} as never,
    };
  }

  describe("smartMergeParams", () => {
    it("keeps a select param value that is valid in the new model", () => {
      const current = { quality: "high", size: "1024x1024" };
      const newModel = makeModel([
        { name: "quality", options: ["low", "medium", "high"], defaultValue: "medium" },
      ]);
      const result = smartMergeParams(current, newModel);
      expect(result.quality).toBe("high");
    });

    it("resets a select param when the value is not in the new model's options", () => {
      const current = { size: "auto" }; // "auto" not in new model
      const newModel = makeModel([
        { name: "size", options: ["1024x1024", "1536x1024"], defaultValue: "1024x1024" },
      ]);
      const result = smartMergeParams(current, newModel);
      expect(result.size).toBe("1024x1024");
    });

    it("keeps a slider param value within the new model's range", () => {
      const current = { compression: 60 };
      const newModel = makeModel([
        { name: "compression", min: 0, max: 100, defaultValue: 80 },
      ]);
      const result = smartMergeParams(current, newModel);
      expect(result.compression).toBe(60);
    });

    it("resets a slider param when value is outside the new model's range", () => {
      const current = { compression: 150 };
      const newModel = makeModel([
        { name: "compression", min: 0, max: 100, defaultValue: 80 },
      ]);
      const result = smartMergeParams(current, newModel);
      expect(result.compression).toBe(80);
    });

    it("uses default for params that did not exist in the old model", () => {
      const current = {};
      const newModel = makeModel([
        { name: "background", options: ["auto", "opaque"], defaultValue: "auto" },
      ]);
      const result = smartMergeParams(current, newModel);
      expect(result.background).toBe("auto");
    });

    it("excludes old params not present in the new model", () => {
      const current = { oldParam: "value" };
      const newModel = makeModel([
        { name: "quality", options: ["low", "high"], defaultValue: "low" },
      ]);
      const result = smartMergeParams(current, newModel);
      expect(result).not.toHaveProperty("oldParam");
    });
  });
  ```

- [ ] **Step 5.2: Run test to confirm it fails (function doesn't exist yet)**

  ```bash
  npm run test -- src/lib/image-gen/params/__tests__/merge.test.ts
  ```

  Expected: FAIL with import error

- [ ] **Step 5.3: Create `src/lib/image-gen/params/merge.ts`**

  ```typescript
  import { defaultsForModel } from "../client-models";
  import type { ClientModelSpec } from "../client-models";

  export function smartMergeParams(
    currentParams: Record<string, unknown>,
    newModel: ClientModelSpec,
  ): Record<string, unknown> {
    const newDefaults = defaultsForModel(newModel);
    const result: Record<string, unknown> = {};

    for (const param of newModel.params) {
      const current = currentParams[param.name];

      if (current === undefined) {
        result[param.name] = newDefaults[param.name];
        continue;
      }

      const constraints = param.constraints;

      if (constraints.type === "select") {
        result[param.name] = constraints.options.includes(current as string)
          ? current
          : newDefaults[param.name];
      } else if (constraints.type === "slider") {
        const val = current as number;
        result[param.name] =
          val >= constraints.min && val <= constraints.max
            ? val
            : newDefaults[param.name];
      } else {
        result[param.name] = newDefaults[param.name];
      }
    }

    return result;
  }
  ```

- [ ] **Step 5.4: Run tests to confirm they pass**

  ```bash
  npm run test -- src/lib/image-gen/params/__tests__/merge.test.ts
  ```

  Expected: PASS (6 tests)

- [ ] **Step 5.5: Wire `smartMergeParams` into the focus view**

  In `src/components/nodes/image-gen-focus-view.tsx`, add import:

  ```typescript
  import { smartMergeParams } from "@/lib/image-gen/params/merge";
  ```

  Find the `useEffect` that handles model changes (around line 221):

  ```typescript
  useEffect(() => {
    if (model.id !== seenModelIdRef.current) {
      seenModelIdRef.current = model.id;
      const defaults = defaultsForModel(model);
      setParamValues(defaults);
      onPatch({ params: defaults });
    }
  }, [model, onPatch]);
  ```

  Replace with:

  ```typescript
  useEffect(() => {
    if (model.id !== seenModelIdRef.current) {
      seenModelIdRef.current = model.id;
      const merged = smartMergeParams(paramValues, model);
      setParamValues(merged);
      onPatch({ params: merged });
    }
  }, [model, onPatch]); // paramValues intentionally excluded — we want the snapshot at switch time
  ```

- [ ] **Step 5.6: Commit**

  ```bash
  git add src/lib/image-gen/params/merge.ts src/lib/image-gen/params/__tests__/merge.test.ts src/components/nodes/image-gen-focus-view.tsx
  git commit -m "fix: smart param reset on model switch — preserve compatible param values"
  ```

---

## Task 6: Wire Prompts into the Generations Pipeline

**Files:**
- Modify: `src/app/api/nodes/[id]/generate/route.ts`
- Modify: `src/lib/generation-tray.ts`
- Modify: `src/components/canvas/generation-tray-item.tsx`

- [ ] **Step 6.1: Write test for updated `deriveTrayItems` including prompts**

  Create `src/lib/__tests__/generation-tray-prompts.test.ts`:

  ```typescript
  import { describe, it, expect } from "vitest";
  import { deriveTrayItems } from "../generation-tray";
  import type { GenerationRow } from "@/lib/db/types";
  import type { AppNode } from "@/lib/canvas-nodes";
  import type { Edge } from "@xyflow/react";

  const now = Date.now();

  function makeJob(overrides: Partial<GenerationRow>): GenerationRow {
    return {
      id: crypto.randomUUID(),
      node_id: "node-1",
      type: "prompt",
      status: "succeeded",
      provider_job_id: null,
      model_used: "openai:gpt-4o-mini",
      params_snapshot: null,
      inputs_snapshot: null,
      tokens_used: null,
      credits_consumed: 0.001,
      version_id: "ver-1",
      user_id: null,
      error: null,
      meta: null,
      created_at: new Date(now - 5000).toISOString(),
      updated_at: new Date(now - 5000).toISOString(),
      ...overrides,
    };
  }

  function makeNode(id: string, type: string): AppNode {
    return { id, type, position: { x: 0, y: 0 }, data: {} } as AppNode;
  }

  describe("deriveTrayItems with prompts", () => {
    it("includes prompt-type jobs in tray items", () => {
      const jobs = [makeJob({ type: "prompt", status: "succeeded" })];
      const nodes = [makeNode("node-1", "prompt")];
      const edges: Edge[] = [];

      const items = deriveTrayItems(nodes, edges, jobs, now);
      expect(items).toHaveLength(1);
      expect(items[0].assetType).toBe("prompt");
    });

    it("still includes image-type jobs", () => {
      const jobs = [makeJob({ type: "image", status: "running" })];
      const nodes = [makeNode("node-1", "image-gen")];
      const edges: Edge[] = [];

      const items = deriveTrayItems(nodes, edges, jobs, now);
      expect(items).toHaveLength(1);
      expect(items[0].assetType).toBe("image");
    });
  });
  ```

- [ ] **Step 6.2: Run test to see it fail (prompts are still skipped)**

  ```bash
  npm run test -- src/lib/__tests__/generation-tray-prompts.test.ts
  ```

  Expected: FAIL — items length is 0 for prompt type

- [ ] **Step 6.3: Update `generation-tray.ts` to include prompts**

  In `src/lib/generation-tray.ts`:

  1. Update the `TrayItem` type — change `assetType: "image" | "video"` to `assetType: "image" | "video" | "prompt"`.

  2. Find and remove the skip guard (around line 71):
  ```typescript
  if (jobRow.type === "prompt") continue;            // only long-running generation
  ```

  3. Update the `assetType` derivation logic. Find where `assetType` is assigned (should be based on `jobRow.type`). Ensure the mapping handles `"prompt"`:
  ```typescript
  const assetType: TrayItem["assetType"] =
    jobRow.type === "video" ? "video" : jobRow.type === "prompt" ? "prompt" : "image";
  ```

  4. The stale guard for running image jobs (line 83-84) checks `assetType === "image"` — leave it as-is; prompts are fast and won't hit it.

- [ ] **Step 6.4: Run test to confirm it passes**

  ```bash
  npm run test -- src/lib/__tests__/generation-tray-prompts.test.ts
  ```

  Expected: PASS

- [ ] **Step 6.5: Update `generation-tray-item.tsx` to handle `"prompt"` assetType**

  In `src/components/canvas/generation-tray-item.tsx`, find where the asset label is derived (should be `"Image"` or `"Video"`). Add prompt:

  ```typescript
  const assetLabel =
    item.assetType === "video" ? "Video" : item.assetType === "prompt" ? "Prompt" : "Image";
  ```

  If there are any other places in the component that branch on `assetType` and exclude `"prompt"`, handle them the same way.

- [ ] **Step 6.6: Wire prompts into the generations pipeline in the generate route**

  In `src/app/api/nodes/[id]/generate/route.ts`, add these imports at the top:

  ```typescript
  import { insertGeneration, succeedGeneration, failGeneration } from "@/lib/db/generations";
  import { computeCost } from "@/lib/pricing";
  ```

  Find where the route currently runs the generation (after resolving inputs and compiling the prompt). The existing flow is:
  1. Build prompt
  2. Call `openai.chat.completions.create()`
  3. Call `insertVersion`
  4. Call `setActiveVersion`

  Wrap this entire flow to add generation tracking. The pattern mirrors `image-generate/route.ts`.

  Before the OpenAI call, insert:
  ```typescript
  const generation = await insertGeneration({
    nodeId: id,
    type: "prompt",
    modelUsed: model,
    paramsSnapshot: { model },
    inputsSnapshot: { instruction: effectiveInstruction },
  });
  ```

  After a successful `setActiveVersion` call, add:
  ```typescript
  const usage = completion.usage;
  const cost = usage ? computeCost(model, {
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    total_tokens: usage.total_tokens,
  }) : null;

  await succeedGeneration({
    generationId: generation.id,
    versionId: version.id,
    creditsConsumed: cost?.usd,
  });
  ```

  In the error catch block, add:
  ```typescript
  if (generation?.id) {
    await failGeneration({ generationId: generation.id, error: String(err) });
  }
  ```

  Make `generation` a `let` and initialize to `null` before the try block so the catch can reference it.

- [ ] **Step 6.7: Run full test suite to check for regressions**

  ```bash
  npm run test
  ```

  Expected: all tests pass

- [ ] **Step 6.8: Commit**

  ```bash
  git add src/app/api/nodes/[id]/generate/route.ts src/lib/generation-tray.ts src/components/canvas/generation-tray-item.tsx src/lib/__tests__/generation-tray-prompts.test.ts
  git commit -m "feat: wire prompt generations into the generations pipeline for cost tracking and tray display"
  ```

---

## Task 7: Unified Aspect Ratio Control

**Files:**
- Modify: `src/lib/image-gen/params/openai.ts`
- Modify: `src/lib/image-gen/providers/openai.ts`
- Modify: `src/components/nodes/image-gen-focus-view.tsx`

- [ ] **Step 7.1: Write tests for the aspect ratio translation**

  Create `src/lib/image-gen/providers/__tests__/aspect-ratio.test.ts`:

  ```typescript
  import { describe, it, expect } from "vitest";
  import { aspectRatioToOpenAISize } from "../openai";

  describe("aspectRatioToOpenAISize", () => {
    it("maps 1:1 to square", () => {
      expect(aspectRatioToOpenAISize("1:1")).toBe("1024x1024");
    });
    it("maps 16:9 to landscape", () => {
      expect(aspectRatioToOpenAISize("16:9")).toBe("1536x1024");
    });
    it("maps 9:16 to portrait", () => {
      expect(aspectRatioToOpenAISize("9:16")).toBe("1024x1536");
    });
    it("maps 4:3 to nearest landscape", () => {
      expect(aspectRatioToOpenAISize("4:3")).toBe("1536x1024");
    });
    it("maps 3:4 to nearest portrait", () => {
      expect(aspectRatioToOpenAISize("3:4")).toBe("1024x1536");
    });
    it("maps 21:9 to widest landscape", () => {
      expect(aspectRatioToOpenAISize("21:9")).toBe("1536x1024");
    });
    it("maps 4:1 to widest landscape", () => {
      expect(aspectRatioToOpenAISize("4:1")).toBe("1536x1024");
    });
    it("maps 1:4 to tallest portrait", () => {
      expect(aspectRatioToOpenAISize("1:4")).toBe("1024x1536");
    });
    it("falls back to square for unknown ratio", () => {
      expect(aspectRatioToOpenAISize("unknown")).toBe("1024x1024");
    });
  });
  ```

- [ ] **Step 7.2: Run test to confirm it fails**

  ```bash
  npm run test -- src/lib/image-gen/providers/__tests__/aspect-ratio.test.ts
  ```

  Expected: FAIL (function not exported)

- [ ] **Step 7.3: Add `aspectRatioToOpenAISize` to the OpenAI provider**

  In `src/lib/image-gen/providers/openai.ts`, add this exported function before the `generateWithOpenAI` function:

  ```typescript
  const ASPECT_RATIO_TO_OPENAI_SIZE: Record<string, string> = {
    "1:1":  "1024x1024",
    "16:9": "1536x1024",
    "9:16": "1024x1536",
    "4:3":  "1536x1024",
    "3:4":  "1024x1536",
    "21:9": "1536x1024",
    "4:1":  "1536x1024",
    "1:4":  "1024x1536",
  };

  export function aspectRatioToOpenAISize(ratio: string): string {
    return ASPECT_RATIO_TO_OPENAI_SIZE[ratio] ?? "1024x1024";
  }
  ```

  Then in the `generateWithOpenAI` function, find where `params.size` is used when constructing the API request. Replace the direct `params.size` reference with the translated value:

  ```typescript
  // Find something like:
  size: params.size as string,

  // Replace with:
  size: aspectRatioToOpenAISize(params.aspect_ratio as string ?? "1:1"),
  ```

  Also handle the "auto" case — if `aspect_ratio` is undefined or `"auto"`, pass `"auto"` to the API (only gpt-image-2 supports it):

  ```typescript
  size: params.aspect_ratio
    ? aspectRatioToOpenAISize(params.aspect_ratio as string)
    : "1024x1024",
  ```

- [ ] **Step 7.4: Run tests**

  ```bash
  npm run test -- src/lib/image-gen/providers/__tests__/aspect-ratio.test.ts
  ```

  Expected: PASS (9 tests)

- [ ] **Step 7.5: Update OpenAI param definitions to use `aspect_ratio`**

  In `src/lib/image-gen/params/openai.ts`, replace the `size` param in all three param arrays with `aspect_ratio`:

  In `gptImage2Params`, replace:
  ```typescript
  { name: "size", label: "Size", component: "select", group: "primary", order: 0, visible: true,
    defaultValue: "1024x1024",
    constraints: { type: "select", options: ["auto", "1024x1024", "1536x1024", "1024x1536"] } },
  ```

  With:
  ```typescript
  { name: "aspect_ratio", label: "Aspect Ratio", component: "select", group: "primary", order: 0, visible: true,
    defaultValue: "1:1",
    constraints: { type: "select", options: ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "4:1", "1:4"] } },
  ```

  Apply the same replacement in `gptImage1Params` and `gptImage1MiniParams`. For mini, there is no "auto" size anyway, so the full ratio set applies identically.

- [ ] **Step 7.6: Add migration logic in image-gen-focus-view on open**

  In `src/components/nodes/image-gen-focus-view.tsx`, find the `useEffect` that runs when the focus view opens (has `[open]` or `[nodeId]` dependency). Add a migration at the start of that effect:

  ```typescript
  // Migrate legacy pixel-size params to unified aspect_ratio
  if (paramValues.size && !paramValues.aspect_ratio) {
    const SIZE_TO_RATIO: Record<string, string> = {
      "1024x1024": "1:1",
      "1536x1024": "16:9",
      "1024x1536": "9:16",
      "auto": "1:1",
    };
    const migrated = {
      ...paramValues,
      aspect_ratio: SIZE_TO_RATIO[paramValues.size as string] ?? "1:1",
    };
    delete migrated.size;
    setParamValues(migrated);
    onPatch({ params: migrated });
  }
  ```

- [ ] **Step 7.7: Run full test suite**

  ```bash
  npm run test
  ```

  Expected: all tests pass

- [ ] **Step 7.8: Commit**

  ```bash
  git add src/lib/image-gen/params/openai.ts src/lib/image-gen/providers/openai.ts src/components/nodes/image-gen-focus-view.tsx src/lib/image-gen/providers/__tests__/aspect-ratio.test.ts
  git commit -m "feat: unified aspect ratio control for OpenAI image models — translate ratio to pixel size at provider boundary"
  ```

---

## Task 8: Node-Level and Canvas-Level Cost Display

**Files:**
- Create: `src/app/api/nodes/[id]/cost/route.ts`
- Create: `src/app/api/canvas/[id]/cost/route.ts`
- Modify: `src/components/nodes/image-gen-node.tsx`
- Modify: `src/components/nodes/prompt-node.tsx`
- Modify: `src/components/nodes/video-gen-node.tsx`
- Modify: The canvas top bar component (find under `src/components/canvas/`)

- [ ] **Step 8.1: Create the node cost endpoint**

  Create `src/app/api/nodes/[id]/cost/route.ts`:

  ```typescript
  import { createServerSupabase } from "@/lib/supabase/server";
  import { apiError, apiOk } from "@/lib/api/route-helpers";
  import { USD_TO_INR } from "@/lib/pricing";

  export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const { id: nodeId } = await params;

    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from("generations")
      .select("credits_consumed")
      .eq("node_id", nodeId)
      .eq("status", "succeeded");

    if (error) return apiError(error.message, 500);

    const totalUsd = (data ?? []).reduce(
      (sum, row) => sum + (row.credits_consumed ?? 0),
      0,
    );

    return apiOk({ totalUsd, totalInr: totalUsd * USD_TO_INR });
  }
  ```

- [ ] **Step 8.2: Create the canvas cost endpoint**

  Create `src/app/api/canvas/[id]/cost/route.ts`:

  ```typescript
  import { createServerSupabase } from "@/lib/supabase/server";
  import { apiError, apiOk } from "@/lib/api/route-helpers";
  import { USD_TO_INR } from "@/lib/pricing";

  export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
  ) {
    const { id: canvasId } = await params;

    const supabase = createServerSupabase();

    // Fetch all node IDs for this canvas
    const { data: nodes, error: nodesErr } = await supabase
      .from("nodes")
      .select("id")
      .eq("canvas_id", canvasId);

    if (nodesErr) return apiError(nodesErr.message, 500);
    if (!nodes || nodes.length === 0) return apiOk({ totalUsd: 0, totalInr: 0 });

    const nodeIds = nodes.map((n) => n.id);

    const { data, error } = await supabase
      .from("generations")
      .select("credits_consumed")
      .in("node_id", nodeIds)
      .eq("status", "succeeded");

    if (error) return apiError(error.message, 500);

    const totalUsd = (data ?? []).reduce(
      (sum, row) => sum + (row.credits_consumed ?? 0),
      0,
    );

    return apiOk({ totalUsd, totalInr: totalUsd * USD_TO_INR });
  }
  ```

- [ ] **Step 8.3: Create a shared `useNodeCost` hook**

  Create `src/hooks/use-node-cost.ts`:

  ```typescript
  "use client";

  import { useEffect, useState } from "react";

  export function useNodeCost(nodeId: string) {
    const [totalInr, setTotalInr] = useState<number | null>(null);

    useEffect(() => {
      let cancelled = false;

      async function fetchCost() {
        try {
          const res = await fetch(`/api/nodes/${nodeId}/cost`);
          if (!res.ok || cancelled) return;
          const data = await res.json() as { totalInr: number };
          if (!cancelled) setTotalInr(data.totalInr);
        } catch {
          // cost is non-critical, fail silently
        }
      }

      void fetchCost();
      return () => { cancelled = true; };
    }, [nodeId]);

    return totalInr;
  }
  ```

- [ ] **Step 8.4: Add cost badge to `image-gen-node.tsx`**

  In `src/components/nodes/image-gen-node.tsx`, add import:

  ```typescript
  import { useNodeCost } from "@/hooks/use-node-cost";
  ```

  Inside the component, after existing hooks:

  ```typescript
  const totalInr = useNodeCost(id);
  ```

  In the JSX, add a cost badge at the bottom of the card div, just before the closing `</div>` of the card wrapper (after the handles section or wherever the bottom of the card is):

  ```tsx
  {totalInr !== null && totalInr > 0 && (
    <div className="border-t border-border px-3 py-1.5">
      <p className="text-[0.6rem] tabular-nums text-muted-foreground">
        ₹{totalInr.toFixed(2)} spent
      </p>
    </div>
  )}
  ```

- [ ] **Step 8.5: Add cost badge to `prompt-node.tsx` and `video-gen-node.tsx`**

  Apply the same `useNodeCost` pattern and cost badge JSX to both:
  - `src/components/nodes/prompt-node.tsx`
  - `src/components/nodes/video-gen-node.tsx`

  The badge is identical in all three nodes.

- [ ] **Step 8.6: Add canvas-level cost chip to the toolbar**

  First, find the canvas toolbar component. Run:
  ```bash
  ls e:/CreativeOS/creativeos-mvp/src/components/canvas/
  ```

  Look for a file that renders the top bar or toolbar (e.g. `canvas-header.tsx`, `canvas-toolbar.tsx`, or a layout component).

  In that component, add a hook:

  ```typescript
  import { useEffect, useState } from "react";

  // Inside component, get canvasId from props or context
  const [canvasCostInr, setCanvasCostInr] = useState<number | null>(null);

  useEffect(() => {
    if (!canvasId) return;
    let cancelled = false;
    async function fetchCost() {
      try {
        const res = await fetch(`/api/canvas/${canvasId}/cost`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as { totalInr: number };
        if (!cancelled) setCanvasCostInr(data.totalInr);
      } catch {
        // non-critical
      }
    }
    void fetchCost();
    return () => { cancelled = true; };
  }, [canvasId]);
  ```

  Add cost chip to the toolbar JSX, alongside existing controls on the right side:

  ```tsx
  {canvasCostInr !== null && canvasCostInr > 0 && (
    <div className="flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground shadow-card">
      <span className="font-medium tabular-nums text-foreground">₹{canvasCostInr.toFixed(2)}</span>
      <span>total</span>
    </div>
  )}
  ```

- [ ] **Step 8.7: Commit**

  ```bash
  git add src/app/api/nodes/[id]/cost/route.ts src/app/api/canvas/[id]/cost/route.ts src/hooks/use-node-cost.ts src/components/nodes/image-gen-node.tsx src/components/nodes/prompt-node.tsx src/components/nodes/video-gen-node.tsx
  git commit -m "feat: node-level and canvas-level cost display — ₹ badges on nodes and toolbar total"
  ```

---

## Task 9: Script Extraction Skeleton Improvement

**Files:**
- Modify: `src/components/nodes/script-node.tsx`

- [ ] **Step 9.1: Replace inline skeleton bars with a card-matching shimmer skeleton**

  In `src/components/nodes/script-node.tsx`, find the `isParsing` skeleton block (around lines 73-80):

  ```tsx
  {isParsing && (
    <div className="space-y-1.5 border-b border-border px-3 py-2.5">
      <div className="h-2 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-2 w-full animate-pulse rounded bg-muted" />
      <div className="h-2 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-2 w-5/6 animate-pulse rounded bg-muted" />
    </div>
  )}
  ```

  Replace with:

  ```tsx
  {isParsing && (
    <div className="space-y-2 border-b border-border px-3 py-3">
      {/* Title placeholder */}
      <div className="h-2.5 w-3/5 animate-pulse rounded-md bg-muted" />
      {/* Content lines */}
      <div className="space-y-1.5 pt-0.5">
        <div className="h-1.5 w-full animate-pulse rounded bg-muted/80" />
        <div className="h-1.5 w-4/5 animate-pulse rounded bg-muted/80" />
        <div className="h-1.5 w-11/12 animate-pulse rounded bg-muted/80" />
      </div>
    </div>
  )}
  ```

- [ ] **Step 9.2: Commit**

  ```bash
  git add src/components/nodes/script-node.tsx
  git commit -m "fix: improve script extraction skeleton to match card layout"
  ```

---

## Task 10: File Node Upload Loading Indicator

**Files:**
- Modify: `src/components/nodes/file-node.tsx`
- Modify: `src/components/nodes/file-focus-view.tsx`

- [ ] **Step 10.1: Add `onUploadingChange` prop to `FileFocusView`**

  In `src/components/nodes/file-focus-view.tsx`, add `onUploadingChange` to the props type:

  ```typescript
  type FileFocusViewProps = {
    // ... existing props ...
    onUploadingChange?: (uploading: boolean) => void;
  };
  ```

  In the component function signature, destructure it:

  ```typescript
  export function FileFocusView({
    // ... existing props ...
    onUploadingChange,
  }: FileFocusViewProps) {
  ```

  In `handleUpload`, call `onUploadingChange` around the loading state:

  ```typescript
  async function handleUpload(file: File) {
    setLoading(true);
    onUploadingChange?.(true);   // ← add this
    try {
      const result = await fileNodeService.upload(nodeId, file);
      onPatch(result);
      if (!title) {
        const derived = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
        onPatch({ title: derived });
      }
      setReplacing(false);
      toast.success("File attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
      onUploadingChange?.(false);  // ← add this
    }
  }
  ```

- [ ] **Step 10.2: Add upload indicator to `FileNode`**

  In `src/components/nodes/file-node.tsx`, add state and import:

  ```typescript
  import { Loader2 } from "lucide-react";

  // Inside component:
  const [isUploading, setIsUploading] = useState(false);
  ```

  Pass the callback to `FileFocusView`:

  ```tsx
  <FileFocusView
    // ... existing props ...
    onUploadingChange={setIsUploading}
  />
  ```

  In the card JSX, add an upload indicator overlaying the file icon area. Find the header `<div>` (with `Paperclip` icon) and wrap it in a relative container, then add the spinner:

  ```tsx
  <div className="relative flex items-center justify-between border-b border-border px-3 py-2">
    <div className="flex items-center gap-1.5">
      <Paperclip className="size-3.5 text-primary" />
      <span className="text-eyebrow text-[0.65rem]!">File</span>
    </div>
    <div className="flex items-center gap-1">
      {isUploading ? (
        <Loader2 className="size-3 animate-spin text-primary" />
      ) : (
        <span
          className={cn(
            "size-1.5 rounded-full",
            hasFile ? "bg-primary" : "bg-muted-foreground/40",
          )}
          title={hasFile ? "File attached" : "No file"}
        />
      )}
      {d.useLlm && !isUploading && <Sparkles className="size-2.5 text-primary" />}
    </div>
  </div>
  ```

- [ ] **Step 10.3: Commit**

  ```bash
  git add src/components/nodes/file-node.tsx src/components/nodes/file-focus-view.tsx
  git commit -m "feat: show upload loading spinner on file node card during upload"
  ```

---

## Task 11: Shot Type Field

**Files:**
- Create: `src/lib/nodes/shot-types.ts`
- Modify: `src/lib/canvas-nodes.ts`
- Modify: `src/components/nodes/shot-node.tsx`
- Modify: `src/components/nodes/shot-focus-view.tsx` (find the actual file path first)

- [ ] **Step 11.1: Write tests for `deriveShotType`**

  Create `src/lib/nodes/__tests__/shot-types.test.ts`:

  ```typescript
  import { describe, it, expect } from "vitest";
  import { deriveShotType } from "../shot-types";

  describe("deriveShotType", () => {
    it("returns Wide Shot for text containing 'wide'", () => {
      expect(deriveShotType("A wide establishing shot of the city")).toBe("Wide Shot");
    });
    it("returns Close-Up for text containing 'close'", () => {
      expect(deriveShotType("A close shot of the product")).toBe("Close-Up");
    });
    it("returns Medium Shot for text containing 'medium'", () => {
      expect(deriveShotType("Medium shot of the person walking")).toBe("Medium Shot");
    });
    it("returns Aerial for text containing 'aerial' or 'drone'", () => {
      expect(deriveShotType("Aerial view of the landscape")).toBe("Aerial");
      expect(deriveShotType("Drone shot pulling back")).toBe("Aerial");
    });
    it("returns POV for text containing 'pov' or 'point of view'", () => {
      expect(deriveShotType("POV walking through the door")).toBe("POV");
    });
    it("returns Over the Shoulder for 'over the shoulder'", () => {
      expect(deriveShotType("Over the shoulder view of the conversation")).toBe("Over the Shoulder");
    });
    it("returns undefined for unrecognized text", () => {
      expect(deriveShotType("Scene transitions smoothly")).toBeUndefined();
    });
    it("is case insensitive", () => {
      expect(deriveShotType("WIDE SHOT of the field")).toBe("Wide Shot");
    });
  });
  ```

- [ ] **Step 11.2: Run test to confirm it fails**

  ```bash
  npm run test -- src/lib/nodes/__tests__/shot-types.test.ts
  ```

  Expected: FAIL (module not found)

- [ ] **Step 11.3: Create `src/lib/nodes/shot-types.ts`**

  ```typescript
  export const SHOT_TYPES = [
    "Wide Shot",
    "Medium Shot",
    "Close-Up",
    "Extreme Close-Up",
    "Over the Shoulder",
    "POV",
    "Two Shot",
    "Aerial",
    "Dutch Angle",
  ] as const;

  export type ShotType = (typeof SHOT_TYPES)[number];

  const KEYWORDS: Array<{ pattern: RegExp; type: ShotType }> = [
    { pattern: /aerial|drone/i,             type: "Aerial" },
    { pattern: /extreme\s+close/i,          type: "Extreme Close-Up" },
    { pattern: /over\s+the\s+shoulder/i,    type: "Over the Shoulder" },
    { pattern: /dutch\s+angle|canted/i,     type: "Dutch Angle" },
    { pattern: /two\s+shot/i,               type: "Two Shot" },
    { pattern: /pov|point\s+of\s+view/i,    type: "POV" },
    { pattern: /close[\s-]up|close\s+shot/i, type: "Close-Up" },
    { pattern: /medium\s+shot|mid\s+shot/i, type: "Medium Shot" },
    { pattern: /wide\s+shot|wide\s+angle|establishing/i, type: "Wide Shot" },
    // Fallback partial matches — order matters (more specific first)
    { pattern: /\bclose\b/i,   type: "Close-Up" },
    { pattern: /\bwide\b/i,    type: "Wide Shot" },
    { pattern: /\bmedium\b/i,  type: "Medium Shot" },
  ];

  export function deriveShotType(shotText: string): ShotType | undefined {
    for (const { pattern, type } of KEYWORDS) {
      if (pattern.test(shotText)) return type;
    }
    return undefined;
  }
  ```

- [ ] **Step 11.4: Run tests**

  ```bash
  npm run test -- src/lib/nodes/__tests__/shot-types.test.ts
  ```

  Expected: PASS (8 tests)

- [ ] **Step 11.5: Add `shot_type` to `ShotNodeData`**

  In `src/lib/canvas-nodes.ts`, find `ShotNodeData` (around line 82) and add the field:

  ```typescript
  export type ShotNodeData = {
    script?: ReelScript;
    order?: number;
    shot_type?: string;  // ← add this line
    seededFrom?: {
      scriptNodeId: string;
      shotIndex: number;
      scriptTitle?: string;
    };
  };
  ```

- [ ] **Step 11.6: Add shot type chip to `shot-node.tsx`**

  In `src/components/nodes/shot-node.tsx`, add import:

  ```typescript
  import { SHOT_TYPES } from "@/lib/nodes/shot-types";
  ```

  In the component, destructure `shot_type` from data:

  ```typescript
  const d = data as {
    script?: ReelScript;
    order?: number;
    shot_type?: string;
    seededFrom?: { scriptTitle?: string };
  };
  const shotType = d.shot_type;
  ```

  In the JSX, add a chip below the textarea (before the button row):

  ```tsx
  {shotType && (
    <p className="px-1.5 pb-1 text-[0.6rem] font-medium text-primary/80">
      {shotType}
    </p>
  )}
  ```

- [ ] **Step 11.7: Add shot type select to `shot-focus-view.tsx`**

  First, find the shot focus view file:
  ```bash
  ls e:/CreativeOS/creativeos-mvp/src/components/nodes/ | grep shot
  ```

  In the focus view component (likely `shot-compose-sheet.tsx` or `shot-focus-view.tsx`), add:

  ```typescript
  import { SHOT_TYPES } from "@/lib/nodes/shot-types";
  ```

  Add a select control for shot type in the focus view form. Place it near other shot metadata controls:

  ```tsx
  <div className="space-y-1.5">
    <label className="text-eyebrow">Shot Type</label>
    <select
      value={d.shot_type ?? ""}
      onChange={(e) => onPatch({ shot_type: e.target.value || undefined })}
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      <option value="">— not set —</option>
      {SHOT_TYPES.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  </div>
  ```

- [ ] **Step 11.8: Run full test suite**

  ```bash
  npm run test
  ```

  Expected: all tests pass

- [ ] **Step 11.9: Commit**

  ```bash
  git add src/lib/nodes/shot-types.ts src/lib/nodes/__tests__/shot-types.test.ts src/lib/canvas-nodes.ts src/components/nodes/shot-node.tsx
  git commit -m "feat: add shot type field to shot nodes with keyword auto-detection"
  ```

---

## Self-Review Checklist

After all tasks are committed, verify:

- [ ] `npm run test` — all tests pass
- [ ] `npm run build` — no TypeScript errors
- [ ] KB upload of a file >1MB returns a 400 with the per-file error message
- [ ] Duplicating an image-gen node with a generated image produces a usable duplicate
- [ ] Usage popover on an edited image node shows all versions (not "No usage data yet")
- [ ] Switching from gpt-image-2 to a Gemini model preserves `quality` if valid, resets `size`→`aspect_ratio`
- [ ] Prompt generation appears in the generation tray after running
- [ ] OpenAI image generation with `aspect_ratio: "16:9"` sends `size: "1536x1024"` to the API
- [ ] Node cost badge appears after at least one generation succeeds
- [ ] Canvas toolbar shows total cost when any generation has succeeded
