# Model Request Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the *exact request sent to the model* on every Prompt-node generation (system prompt, compiled user text, image attachments, effective instruction) and surface it as a read-only "Sent to model" panel in the focus view — so each version's provenance shows the actual inputs, and the later version-progression diff has something to diff.

**Architecture:** Purely additive to the D4 version envelope — the request record rides in the existing `node_versions.inputs_used` JSONB under a new `request` key, so **no migration** is needed (D4/D19). A pure `describeModelRequest()` builder assembles the record (TDD-friendly, mirroring the D3 pure-`compile` pattern); the generate route persists it on both success and failure; the versions route exposes it; a small `ModelRequestPanel` renders it. The record is written once at generation and never edited — it is frozen provenance, exactly like `generated_output` (D22), **not** a display cache (D19).

**Tech Stack:** Next.js App Router route handlers, TypeScript, Supabase JS, vitest, React client components, Tailwind v4 + shadcn (Base UI), Lucide icons.

## Global Constraints

- **No new migration.** The request record is stored in the existing `inputs_used` JSONB (D4 uniform envelope; D19 "type-specific data via JSONB").
- **Frozen provenance, not a cache.** The request is written once in `insertVersion` and never mutated — same rule as `generated_output` (D22). It is *not* rendered as the node's current value, so it does not re-introduce the D19 display-cache class of bug.
- **Reuse the D3 pure-compile pattern.** All request-assembly logic lives in pure, unit-tested functions; the route only wires them.
- **Design system (Yuvabe):** neutral-led; `.text-eyebrow` for the section label; Lucide icons at 1.5 stroke; `shadow-card`/borders per system; **no third font, no mono** — preformatted text uses `whitespace-pre-wrap` in the default Gilroy face. One component per file, named export, ≤~200 lines.
- **Read-only sessions (D33):** the panel is display-only and safe regardless of `useCanvasEditable()`.
- **Tests:** `npx vitest run <file>` for units; `npx tsc --noEmit` must stay clean.

---

## File Structure

- **Modify** `src/lib/nodes/prompt.ts` — `compilePrompt` also returns `effectiveInstruction`.
- **Modify** `src/lib/nodes/compose-message.ts` — add exported pure `visionAttachmentUrls(upstream)`.
- **Create** `src/lib/nodes/model-request.ts` — `ModelRequestRecord` type + pure `describeModelRequest()`.
- **Create** `src/lib/nodes/__tests__/model-request.test.ts` — unit tests for the builder.
- **Modify** `src/app/api/nodes/[id]/generate/route.ts` — persist the record in `inputs_used.request` on success and failure.
- **Modify** `src/app/api/nodes/[id]/versions/route.ts` — expose `inputsUsed.request`.
- **Modify** `src/components/nodes/prompt-version-history.tsx` — extend `VersionSummary` with `inputsUsed.request`.
- **Create** `src/components/nodes/model-request-panel.tsx` — the collapsible "Sent to model" panel.
- **Modify** `src/components/nodes/prompt-focus-view.tsx` — render `ModelRequestPanel` for the active version.

---

## Task 1: `compilePrompt` returns the effective instruction

**Files:**
- Modify: `src/lib/nodes/prompt.ts`
- Test: `src/lib/nodes/prompt.test.ts` (existing)

**Interfaces:**
- Produces: `compilePrompt(input): { system: string; user: string; effectiveInstruction: string }` — the third field is the instruction actually sent (the `DEFAULT_INSTRUCTION` when the box is blank).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/nodes/prompt.test.ts`:

```ts
import { compilePrompt, DEFAULT_INSTRUCTION } from "@/lib/nodes/prompt";

test("compilePrompt reports the effective instruction (blank falls back to default)", () => {
  const base = { clientContext: "", upstream: [], controls: undefined };
  expect(compilePrompt({ ...base, instruction: "" }).effectiveInstruction).toBe(DEFAULT_INSTRUCTION);
  expect(compilePrompt({ ...base, instruction: "  make it airy " }).effectiveInstruction).toBe("make it airy");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/prompt.test.ts`
Expected: FAIL — `effectiveInstruction` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/nodes/prompt.ts`, change the return type and body of `compilePrompt`:

```ts
export function compilePrompt(input: CompilePromptInput): { system: string; user: string; effectiveInstruction: string } {
  const blocks: string[] = [];

  if (input.clientContext.trim()) {
    blocks.push(`Brand context:\n${input.clientContext.trim()}`);
  }
  for (const u of input.upstream) {
    if (!u.text.trim()) continue;
    if (u.type === "shot") {
      blocks.push(`Creating an image prompt for this specific shot:\n${u.text.trim()}`);
    } else {
      blocks.push(`${u.label}:\n${u.text.trim()}`);
    }
  }

  const controlsBlock = input.controls ? renderShotControls(input.controls) : "";
  if (controlsBlock) blocks.push(controlsBlock);

  const effectiveInstruction = input.instruction.trim() || DEFAULT_INSTRUCTION;
  blocks.push(`Instruction:\n${effectiveInstruction}`);

  return { system: promptGeneratePrompt.system, user: blocks.join("\n\n"), effectiveInstruction };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/nodes/prompt.test.ts`
Expected: PASS (new test + all existing `compilePrompt` tests still green — the new field is additive).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Existing callers destructure `{ system, user }`; the extra field is ignored.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/nodes/prompt.ts src/lib/nodes/prompt.test.ts
git commit -m "feat(prompt): compilePrompt returns the effective instruction"
```

---

## Task 2: The request-record builder (`describeModelRequest`)

**Files:**
- Modify: `src/lib/nodes/compose-message.ts`
- Create: `src/lib/nodes/model-request.ts`
- Test: `src/lib/nodes/__tests__/model-request.test.ts`

**Interfaces:**
- Consumes: `UpstreamPreview` (from `@/lib/nodes/resolve-inputs`); `visionAttachmentUrls` (new, below).
- Produces:
  - `visionAttachmentUrls(upstream: UpstreamPreview[]): string[]` (in `compose-message.ts`) — the image URLs that were sent to the vision API.
  - `type ModelRequestRecord = { systemPrompt: string; compiledUser: string; attachments: string[]; effectiveInstruction: string }`
  - `describeModelRequest(input: { system: string; compiledUser: string; effectiveInstruction: string; upstream: UpstreamPreview[] }): ModelRequestRecord`

- [ ] **Step 1: Add the exported attachment-URL helper**

In `src/lib/nodes/compose-message.ts`, add below `buildUserContent` (reuses the existing private `isVisionAttachment`):

```ts
// The image URLs that were actually sent to the vision API for this request —
// the same set buildUserContent turns into image_url parts. Pure; used to record
// which attachments a generation consumed (model-request.ts).
export function visionAttachmentUrls(upstream: UpstreamPreview[]): string[] {
  return upstream.filter(isVisionAttachment).map((u) => u.fileUrl!);
}
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/nodes/__tests__/model-request.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { describeModelRequest } from "@/lib/nodes/model-request";
import type { UpstreamPreview } from "@/lib/nodes/resolve-inputs";

// Minimal upstream fixtures — only the fields visionAttachmentUrls reads.
const imageFile = {
  nodeId: "n1", versionId: "v1", type: "file", label: "ref.png",
  text: "", fileKind: "image", fileUrl: "https://cdn/ref.png", useLlm: false,
} as unknown as UpstreamPreview;

const docFile = {
  nodeId: "n2", versionId: "v2", type: "file", label: "brief.pdf",
  text: "brief text", fileKind: "document", fileUrl: "https://cdn/brief.pdf", useLlm: true,
} as unknown as UpstreamPreview;

describe("describeModelRequest", () => {
  it("captures the system prompt, compiled user text, and effective instruction verbatim", () => {
    const rec = describeModelRequest({
      system: "SYS", compiledUser: "USER BLOCK", effectiveInstruction: "make it airy", upstream: [],
    });
    expect(rec.systemPrompt).toBe("SYS");
    expect(rec.compiledUser).toBe("USER BLOCK");
    expect(rec.effectiveInstruction).toBe("make it airy");
    expect(rec.attachments).toEqual([]);
  });

  it("records only the image URLs that were sent as vision parts", () => {
    const rec = describeModelRequest({
      system: "SYS", compiledUser: "U", effectiveInstruction: "i", upstream: [imageFile, docFile],
    });
    expect(rec.attachments).toEqual(["https://cdn/ref.png"]); // the doc is text, not a vision part
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/nodes/__tests__/model-request.test.ts`
Expected: FAIL — `@/lib/nodes/model-request` does not exist.

- [ ] **Step 4: Write minimal implementation**

Create `src/lib/nodes/model-request.ts`:

```ts
import type { UpstreamPreview } from "@/lib/nodes/resolve-inputs";
import { visionAttachmentUrls } from "@/lib/nodes/compose-message";

// The exact request a generation sent to the model — frozen provenance stored in
// node_versions.inputs_used.request (D4 envelope; D22 "written once, never edited").
export type ModelRequestRecord = {
  systemPrompt: string;         // the system message sent
  compiledUser: string;         // the assembled user text (compilePrompt.user)
  attachments: string[];        // image URLs sent as vision parts ([] if none)
  effectiveInstruction: string; // the instruction actually used (default when blank)
};

export function describeModelRequest(input: {
  system: string;
  compiledUser: string;
  effectiveInstruction: string;
  upstream: UpstreamPreview[];
}): ModelRequestRecord {
  return {
    systemPrompt: input.system,
    compiledUser: input.compiledUser,
    effectiveInstruction: input.effectiveInstruction,
    attachments: visionAttachmentUrls(input.upstream),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/nodes/__tests__/model-request.test.ts`
Expected: PASS (both cases).

- [ ] **Step 6: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.

```bash
git add src/lib/nodes/compose-message.ts src/lib/nodes/model-request.ts src/lib/nodes/__tests__/model-request.test.ts
git commit -m "feat(nodes): describeModelRequest builder + visionAttachmentUrls"
```

---

## Task 3: Persist the request in the generate route

**Files:**
- Modify: `src/app/api/nodes/[id]/generate/route.ts`

**Interfaces:**
- Consumes: `compilePrompt` (now returns `effectiveInstruction`, Task 1), `describeModelRequest` + `ModelRequestRecord` (Task 2).
- Produces: every `node_versions` row written by this route now carries `inputs_used.request: ModelRequestRecord` (on success **and** failure).

- [ ] **Step 1: Add imports**

In `src/app/api/nodes/[id]/generate/route.ts`, add to the imports:

```ts
import { describeModelRequest } from "@/lib/nodes/model-request";
```

- [ ] **Step 2: Capture the effective instruction and build the record**

Change the `compilePrompt` destructure (currently `const { system, user } = compilePrompt({...})`) to also take `effectiveInstruction`, and build the record right after `userContent`:

```ts
  const { system, user, effectiveInstruction } = compilePrompt({
    clientContext: resolved.clientContext,
    upstream: resolved.upstream,
    instruction,
    controls,
  });

  const userContent = buildUserContent(user, resolved.upstream);

  const request = describeModelRequest({
    system,
    compiledUser: user,
    effectiveInstruction,
    upstream: resolved.upstream,
  });
```

- [ ] **Step 3: Store the record on the success path**

In the success `insertVersion` call, add `request` to `inputsUsed`:

```ts
    const version = await insertVersion({
      nodeId,
      inputsUsed: {
        upstream: resolved.upstream.map((u) => ({ nodeId: u.nodeId, versionId: u.versionId })),
        kbVersionId: resolved.kbVersionId,
        kbSlices: resolved.slices,
        request, // the exact request sent to the model (frozen provenance)
      },
      paramsUsed: {
        instruction,
        controls,
        promptId: promptGeneratePrompt.id,
        promptVersion: promptGeneratePrompt.version,
        tokensUsed: completion.usage ?? null,
      },
      modelUsed: `openai:${promptGeneratePrompt.model}`,
      output,
    });
```

- [ ] **Step 4: Store the record on the failure path**

In the `catch` block's `insertVersion` call, add `inputsUsed` with the request (the log learns from failures too — and a failed attempt still shows what was attempted):

```ts
    await insertVersion({
      nodeId,
      inputsUsed: { request },
      paramsUsed: {
        instruction,
        promptId: promptGeneratePrompt.id,
        promptVersion: promptGeneratePrompt.version,
      },
      modelUsed: `openai:${promptGeneratePrompt.model}`,
      error: message,
    });
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Manual smoke test**

Run: `npm run dev`, open a Prompt node's focus view, click Generate (or Re-generate). Then inspect the newest row:

Run: `node scripts/peek.mjs` (or query `node_versions` for this node)
Expected: the newest version's `inputs_used.request` contains `systemPrompt`, `compiledUser`, `attachments`, `effectiveInstruction`. A blank instruction box yields `effectiveInstruction` = the default sentence (not `""`).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/nodes/[id]/generate/route.ts
git commit -m "feat(generate): persist the exact model request per version"
```

---

## Task 4: Expose the request via the versions route

**Files:**
- Modify: `src/app/api/nodes/[id]/versions/route.ts`
- Modify: `src/components/nodes/prompt-version-history.tsx` (the `VersionSummary` type)

**Interfaces:**
- Consumes: `ModelRequestRecord` (Task 2).
- Produces: each version in the `GET /api/nodes/:id/versions` response includes `inputsUsed.request?: ModelRequestRecord`; `VersionSummary.inputsUsed.request` is typed for the focus view.

- [ ] **Step 1: Type the request on the versions response**

In `src/app/api/nodes/[id]/versions/route.ts`, add the import and widen the `inputsUsed` cast:

```ts
import type { ModelRequestRecord } from "@/lib/nodes/model-request";
```

```ts
      inputsUsed: (v.inputs_used ?? {}) as {
        baseVersionId?: string | null;
        instruction?: string;
        intent?: string;
        request?: ModelRequestRecord;
      },
```

- [ ] **Step 2: Extend the `VersionSummary` type**

In `src/components/nodes/prompt-version-history.tsx`, import the type and add `inputsUsed` to `VersionSummary`:

```ts
import type { ModelRequestRecord } from "@/lib/nodes/model-request";
```

```ts
export type VersionSummary = {
  id: string;
  output: string | null;
  error: string | null;
  modelUsed?: string | null;
  paramsUsed: {
    instruction?: string;
    tokensUsed?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  };
  createdAt: string;
  decision: "pass" | "fail" | null;
  note: string | null;
  // D29 approval flag (distinct from decision).
  approvalStatus?: "pending" | "approved" | "changes_requested";
  approvedBy?: string | null;
  approvedAt?: string | null;
  // The exact request this version sent to the model (frozen provenance).
  inputsUsed?: { request?: ModelRequestRecord };
};
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (The versions route already returns `inputsUsed`; this only *types* the `request` field the focus view will read.)

- [ ] **Step 4: Commit**

```bash
git add src/app/api/nodes/[id]/versions/route.ts src/components/nodes/prompt-version-history.tsx
git commit -m "feat(versions): expose the model request record to the client"
```

---

## Task 5: The `ModelRequestPanel` component

**Files:**
- Create: `src/components/nodes/model-request-panel.tsx`

**Interfaces:**
- Consumes: `ModelRequestRecord` (Task 2).
- Produces: `<ModelRequestPanel request={ModelRequestRecord} />` — a collapsible, read-only "Sent to model" disclosure.

- [ ] **Step 1: Write the component**

Create `src/components/nodes/model-request-panel.tsx`:

```tsx
"use client";

import { useState } from "react";
import { FileInput, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModelRequestRecord } from "@/lib/nodes/model-request";

// Read-only disclosure of the exact request a version sent to the model
// (system + compiled user text + image attachments). Frozen provenance — never
// editable. Safe in read-only sessions (D33).
export function ModelRequestPanel({ request }: { request: ModelRequestRecord }) {
  const [open, setOpen] = useState(false);
  const attachmentCount = request.attachments.length;

  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5">
          <FileInput className="size-3.5 text-primary" strokeWidth={1.5} />
          <span className="text-eyebrow">Sent to model</span>
        </span>
        <span className="flex items-center gap-2">
          {attachmentCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {attachmentCount} image{attachmentCount === 1 ? "" : "s"}
            </span>
          )}
          <ChevronRight
            className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")}
            strokeWidth={1.5}
          />
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <Field label="System prompt" text={request.systemPrompt} />
          <Field label="Compiled input" text={request.compiledUser} />
          {attachmentCount > 0 && (
            <div>
              <p className="text-eyebrow mb-1">Attachments</p>
              <ul className="space-y-1">
                {request.attachments.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary underline decoration-dotted underline-offset-2 break-all"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="text-eyebrow mb-1">{label}</p>
      <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-xs leading-relaxed text-foreground">
        {text || "—"}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/model-request-panel.tsx
git commit -m "feat(nodes): ModelRequestPanel — read-only 'Sent to model' disclosure"
```

---

## Task 6: Render the panel in the Prompt focus view

**Files:**
- Modify: `src/components/nodes/prompt-focus-view.tsx`

**Interfaces:**
- Consumes: `ModelRequestPanel` (Task 5); the active version's `inputsUsed.request` from `versions` state (Task 4).

- [ ] **Step 1: Import the panel**

In `src/components/nodes/prompt-focus-view.tsx`, add:

```ts
import { ModelRequestPanel } from "./model-request-panel";
```

- [ ] **Step 2: Derive the active version's request**

Just after `activeVersionId` is available in the render body (e.g. right before the `return (`), compute:

```ts
  const activeRequest =
    versions.find((v) => v.id === activeVersionId)?.inputsUsed?.request ?? null;
```

- [ ] **Step 3: Render the panel in the output zone**

In the output zone, immediately after the `InlineApprovalBar` block (the `{mode === "result" && !!activeVersionId && ( <InlineApprovalBar … /> )}` block) and before the `{mode === "skeleton" && …}` block, add:

```tsx
                {mode === "result" && activeRequest && (
                  <ModelRequestPanel request={activeRequest} />
                )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Open a Prompt node that has at least one generation. In the output zone, a **"Sent to model"** disclosure appears below the approval bar. Expand it:
- **System prompt** shows the `prompt-generate` system text.
- **Compiled input** shows the assembled brand-context + upstream + controls + instruction block.
- If the node has a connected image (File/Draw/Image-Gen), **Attachments** lists the image URL(s).
- Generate again with a **blank** instruction → re-open → the compiled input's `Instruction:` line shows the default sentence (confirming `effectiveInstruction` capture).

- [ ] **Step 6: Full check + commit**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; all tests pass.

```bash
git add src/components/nodes/prompt-focus-view.tsx
git commit -m "feat(prompt-focus): show the exact request sent to the model"
```

---

## Self-Review

**Spec coverage** (against the conversation's requirements):
- "See the actual inputs that went to the model" → Tasks 3 (capture) + 5–6 (surface): system prompt, compiled user text, image attachments, effective instruction. ✓
- The blank-instruction gap (v1 showed nothing) → Task 1 (`effectiveInstruction`) + Task 3 (persisted) + Task 6 (visible). ✓
- The compiled-prompt gap (returned but not persisted) → Task 3. ✓
- Foundation for the version-progression diff → the record is now on every version; the progression view (input-delta + output-diff across model re-runs) is the **next plan**, built on this data. ✓ (explicitly out of scope here)

**Placeholder scan:** none — every code step contains complete code.

**Type consistency:** `ModelRequestRecord` is defined once in `model-request.ts` (Task 2) and imported by the versions route (Task 4), `VersionSummary` (Task 4), and `ModelRequestPanel` (Task 5). `compilePrompt`'s new `effectiveInstruction` (Task 1) is consumed in the generate route (Task 3). `describeModelRequest`'s signature matches its call site in Task 3.

## Out of scope (follow-on plans)

- **Progression view** — render the per-version **input-delta** (request diff: instruction/controls/KB/upstream/prompt-version changes) beside the **output-diff** across model re-runs. This is "Slice 2" and depends on this plan's captured `request`.
- **Other node types** — the same capture pattern extends to `image-generate`, `video-prompt`, and `parse` routes. Do the Prompt node first (this plan); generalize once the shape is proven.
- **Production/cross-canvas trace source** — pointing the eval `ReviewScreen` at real client canvases (rationale §10 TBD), a separate build.
