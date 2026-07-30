# Multi-Image Composition Prompts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an operator uses `@[Image: Hero](id)` tokens to reference multiple upstream images in an instruction, ensure (a) the token resolves to the correct positional English (`the first image`, `the second image`…), (b) the image ordering in the multipart message exactly matches those ordinals, (c) the LLM that writes the image-gen prompt receives composition-specific framing explaining what "the first image" means, and (d) the same resolution runs in the image-gen edit path and video-prompt path.

**Architecture:** Three independent call paths all converge on `resolveMentionTokens()` for token→ordinal substitution, and on `buildUserContent()` for building the multipart vision array. The ordering invariant (same array, same walk order) already holds structurally — this plan adds tests that prove it, extends `ordinalToEnglish` to 10 named ordinals (Gemini supports 14 images), injects a composition context block into `compilePrompt`/`compileVideoPrompt` when ≥2 vision nodes + `@[` tokens are present, and wires `upstream` into the image-gen route's `buildEditPrompt` call (currently called without it).

**Tech Stack:** TypeScript, Vitest (pure unit tests — no network, no DB), Next.js API routes. No new dependencies.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/nodes/resolve-mention-tokens.ts` | **Modify** | Extend `ordinalToEnglish` from 3 to 10 named ordinals |
| `src/lib/nodes/resolve-mention-tokens.test.ts` | **Modify** | Add tests for ordinals 4-10 + ordering-invariant test |
| `src/lib/nodes/compose-message.ts` | **Modify** | Export `isVisionAttachment` predicate (currently private) so `compilePrompt` can count vision nodes |
| `src/lib/nodes/prompt.ts` | **Modify** | Inject composition context block when ≥2 vision nodes + `@[` tokens in instruction |
| `src/lib/nodes/prompt.test.ts` | **Modify** | Add test: composition block injected; ordering invariant with `buildUserContent` |
| `src/lib/nodes/video-prompt.ts` | **Modify** | Same composition block injection |
| `src/lib/nodes/video-prompt.test.ts` | **Create** | Mirror of prompt.test.ts for the video path |
| `src/app/api/nodes/[id]/image-generate/route.ts` | **Modify** | Pass `upstream` (as `MentionUpstream[]`) to `buildEditPrompt` in the edit path |
| `src/prompts/prompt-generate.ts` | **Modify** | Add `MULTI-IMAGE COMPOSITION` section to system prompt (bump to v5) |
| `src/prompts/video-prompt-generate.ts` | **Modify** | Add `MULTI-IMAGE REFERENCES` clause (bump to v2) |

---

## Task 1 — Extend `ordinalToEnglish` to 10 named ordinals + tests

**Files:**
- Modify: `src/lib/nodes/resolve-mention-tokens.ts`
- Modify: `src/lib/nodes/resolve-mention-tokens.test.ts`

Gemini supports up to 14 reference images. Currently `ordinalToEnglish` only names 1–3 ("first/second/third"), then falls back to `"image N"`. Extend to 10 named ordinals so prompts read naturally.

Current code in `resolve-mention-tokens.ts`:
```ts
function ordinalToEnglish(n: number): string {
  const words = ["first", "second", "third"];
  if (n <= words.length) return `the ${words[n - 1]} image`;
  return `image ${n}`;
}
```

- [ ] **Step 1: Write failing tests**

Add to the bottom of `src/lib/nodes/resolve-mention-tokens.test.ts` (inside the existing `describe` block):

```ts
  it("names ordinals 4-10 correctly", () => {
    const upstream = [
      img("a"), img("b"), img("c"), img("d"), img("e"),
      img("f"), img("g"), img("h"), img("i"), img("j"),
    ];
    const result = resolveMentionTokens(
      "@[Image: D](d) @[Image: E](e) @[Image: F](f) @[Image: G](g) @[Image: H](h) @[Image: I](i) @[Image: J](j)",
      upstream,
    );
    expect(result).toBe(
      "the fourth image the fifth image the sixth image the seventh image the eighth image the ninth image the tenth image",
    );
  });

  it("falls back to 'image N' for ordinals beyond 10", () => {
    const upstream = Array.from({ length: 11 }, (_, i) => img(`n${i}`));
    const result = resolveMentionTokens("@[Image: K](n10)", upstream);
    expect(result).toBe("image 11");
  });
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /e/CreativeOS/creativeos-mvp && npx vitest run src/lib/nodes/resolve-mention-tokens.test.ts 2>&1 | tail -15
```

Expected: "the fourth image" test fails — currently returns "image 4".

- [ ] **Step 3: Extend `ordinalToEnglish`**

In `src/lib/nodes/resolve-mention-tokens.ts`, replace:

```ts
function ordinalToEnglish(n: number): string {
  const words = ["first", "second", "third"];
  if (n <= words.length) return `the ${words[n - 1]} image`;
  return `image ${n}`;
}
```

With:

```ts
function ordinalToEnglish(n: number): string {
  const words = [
    "first", "second", "third", "fourth", "fifth",
    "sixth", "seventh", "eighth", "ninth", "tenth",
  ];
  if (n <= words.length) return `the ${words[n - 1]} image`;
  return `image ${n}`;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /e/CreativeOS/creativeos-mvp && npx vitest run src/lib/nodes/resolve-mention-tokens.test.ts 2>&1 | tail -10
```

Expected: all tests pass (original 11 + 2 new = 13 total).

- [ ] **Step 5: TypeScript check**

```bash
cd /e/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /e/CreativeOS/creativeos-mvp && git add src/lib/nodes/resolve-mention-tokens.ts src/lib/nodes/resolve-mention-tokens.test.ts && git commit -m "feat: extend ordinalToEnglish to 10 named ordinals for multi-image prompts"
```

---

## Task 2 — Export `isVisionAttachment` from compose-message + ordering invariant test

**Files:**
- Modify: `src/lib/nodes/compose-message.ts`
- Modify: `src/lib/nodes/compose-message.test.ts`

`compilePrompt` needs to count vision nodes to decide whether to inject the composition block. Currently `isVisionAttachment` is private in `compose-message.ts`. Export it so `prompt.ts` can import it without duplicating the predicate.

Current `compose-message.ts` line 27:
```ts
function isVisionAttachment(u: UpstreamPreview): boolean {
```

- [ ] **Step 1: Add an ordering-invariant test**

Read `src/lib/nodes/compose-message.test.ts` first to understand the existing structure, then add at the bottom:

```ts
describe("ordering invariant — resolveMentionTokens and buildUserContent agree", () => {
  it("vision ordinals match the image_url part order in buildUserContent", () => {
    // Three upstream nodes: script (text-only), two image files.
    // resolveMentionTokens assigns ordinals by walking upstream order.
    // buildUserContent appends image parts in the same upstream order.
    // The ordinals the token resolver assigns must match the part positions.
    const upstream: UpstreamPreview[] = [
      { nodeId: "s1", versionId: null, label: "Script", type: "script", text: "reel script" },
      { nodeId: "img1", versionId: null, label: "Image", type: "file", text: "", fileUrl: "https://cdn.example.com/img1.jpg", fileKind: "image" },
      { nodeId: "img2", versionId: null, label: "Image", type: "file", text: "", fileUrl: "https://cdn.example.com/img2.jpg", fileKind: "image" },
    ];

    // Token resolver assigns img1→"the first image", img2→"the second image"
    const { resolveMentionTokens } = await import("@/lib/nodes/resolve-mention-tokens");
    const mentionUpstream = upstream.map((u) => ({
      nodeId: u.nodeId,
      type: u.type,
      text: u.text,
      fileUrl: u.fileUrl,
      fileKind: u.fileKind,
      useLlm: u.useLlm,
    }));
    const resolved = resolveMentionTokens(
      "use @[Image: A](img1) as base, overlay @[Image: B](img2)",
      mentionUpstream,
    );
    expect(resolved).toBe("use the first image as base, overlay the second image");

    // buildUserContent puts img1 first, img2 second in the parts array
    const content = buildUserContent("use the first image as base, overlay the second image", upstream);
    expect(Array.isArray(content)).toBe(true);
    const parts = content as ContentPart[];
    expect(parts[1]).toEqual({ type: "image_url", image_url: { url: "https://cdn.example.com/img1.jpg", detail: "auto" } });
    expect(parts[2]).toEqual({ type: "image_url", image_url: { url: "https://cdn.example.com/img2.jpg", detail: "auto" } });
  });
});
```

Note: this test imports `ContentPart` from compose-message. Add it to the existing imports at the top: `import { buildUserContent, type ContentPart } from "./compose-message";`

- [ ] **Step 2: Run tests — expect FAIL** (because `resolveMentionTokens` dynamic import needs adjustment)

```bash
cd /e/CreativeOS/creativeos-mvp && npx vitest run src/lib/nodes/compose-message.test.ts 2>&1 | tail -15
```

If the dynamic import fails, use a static import instead — add `import { resolveMentionTokens } from "@/lib/nodes/resolve-mention-tokens";` at the top of the test file and remove the `await import(...)`. Re-run until it fails on assertion, not import.

- [ ] **Step 3: Export `isVisionAttachment` from compose-message.ts**

In `src/lib/nodes/compose-message.ts`, change line 27 from:

```ts
function isVisionAttachment(u: UpstreamPreview): boolean {
```

To:

```ts
export function isVisionAttachment(u: UpstreamPreview): boolean {
```

This export is needed by `prompt.ts` in Task 3.

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /e/CreativeOS/creativeos-mvp && npx vitest run src/lib/nodes/compose-message.test.ts 2>&1 | tail -10
```

Expected: all tests pass including the new ordering-invariant test.

- [ ] **Step 5: TypeScript check**

```bash
cd /e/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /e/CreativeOS/creativeos-mvp && git add src/lib/nodes/compose-message.ts src/lib/nodes/compose-message.test.ts && git commit -m "feat: export isVisionAttachment + add ordering-invariant test"
```

---

## Task 3 — Inject composition context block in `compilePrompt`

**Files:**
- Modify: `src/lib/nodes/prompt.ts`
- Modify: `src/lib/nodes/prompt.test.ts`

When an operator writes `use @[Image: Hero](id) as start frame, overlay @[File: Product](id2)`, the LLM that *generates the image prompt* needs to understand:
- What "the first image" / "the second image" refers to
- That it should write a composition instruction describing how elements from each image combine

This is the **Prompt node path** — the LLM writes a text prompt, not an image. The composition block goes in the user message, between upstream text blocks and the instruction block.

**What to inject** (only when `instruction.includes("@[")` AND ≥2 vision nodes in upstream):

```
Reference images (attached in order):
1. the first image — {label of 1st vision node}
2. the second image — {label of 2nd vision node}
...

Write a composition prompt that references these images by their positional names above.
Describe how elements from each image should combine — placement, blending, lighting match, and scale.
```

**Implementation in `prompt.ts`:**

- [ ] **Step 1: Write failing test**

Add to `src/lib/nodes/prompt.test.ts`:

```ts
  it("injects a composition context block when ≥2 vision nodes and @[ token present", () => {
    const { user } = compilePrompt({
      clientContext: "",
      upstream: [
        {
          nodeId: "img1",
          label: "Image",
          type: "image-gen",
          text: "",
          fileUrl: "https://cdn.example.com/hero.jpg",
          fileKind: "image",
        },
        {
          nodeId: "img2",
          label: "File",
          type: "file",
          text: "",
          fileUrl: "https://cdn.example.com/product.jpg",
          fileKind: "image",
        },
      ],
      instruction: "use @[Image: Hero](img1) as base, overlay @[File: Product](img2)",
    });
    expect(user).toContain("Reference images (attached in order):");
    expect(user).toContain("1. the first image");
    expect(user).toContain("2. the second image");
    // composition block comes before the instruction block
    expect(user.indexOf("Reference images")).toBeLessThan(user.indexOf("Instruction:"));
  });

  it("does NOT inject composition block when only 1 vision node", () => {
    const { user } = compilePrompt({
      clientContext: "",
      upstream: [
        {
          nodeId: "img1",
          label: "Image",
          type: "image-gen",
          text: "",
          fileUrl: "https://cdn.example.com/hero.jpg",
          fileKind: "image",
        },
      ],
      instruction: "use @[Image: Hero](img1) as base",
    });
    expect(user).not.toContain("Reference images (attached in order):");
  });

  it("does NOT inject composition block when no @[ token in instruction", () => {
    const { user } = compilePrompt({
      clientContext: "",
      upstream: [
        {
          nodeId: "img1",
          label: "Image",
          type: "image-gen",
          text: "",
          fileUrl: "https://cdn.example.com/hero.jpg",
          fileKind: "image",
        },
        {
          nodeId: "img2",
          label: "File",
          type: "file",
          text: "",
          fileUrl: "https://cdn.example.com/product.jpg",
          fileKind: "image",
        },
      ],
      instruction: "make it cinematic",
    });
    expect(user).not.toContain("Reference images (attached in order):");
  });
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /e/CreativeOS/creativeos-mvp && npx vitest run src/lib/nodes/prompt.test.ts 2>&1 | tail -15
```

Expected: "injects a composition context block" test fails.

- [ ] **Step 3: Implement the composition block in `prompt.ts`**

Replace the entire `src/lib/nodes/prompt.ts` with:

```ts
import { promptGeneratePrompt } from "@/prompts/prompt-generate";
import { renderShotControls, type ShotControls } from "./shot-controls";
import { resolveMentionTokens, type MentionUpstream } from "./resolve-mention-tokens";
import { isVisionAttachment } from "./compose-message";
import type { UpstreamPreview } from "./resolve-inputs";

export const DEFAULT_INSTRUCTION =
  "Write a detailed image prompt — subject, setting, lighting, and visual style — from the context above.";

export type CompilePromptUpstream = {
  nodeId?: string;
  label: string;
  text: string;
  type?: string;
  fileUrl?: string;
  fileKind?: string;
  useLlm?: boolean;
};

export type CompilePromptInput = {
  clientContext: string;
  upstream: CompilePromptUpstream[];
  instruction: string;
  controls?: ShotControls;
};

// Build the "Reference images" block when the operator mentioned ≥2 vision nodes.
// This tells the LLM what "the first image" / "the second image" refers to before
// it reads the instruction.
function buildCompositionBlock(upstream: CompilePromptUpstream[]): string | null {
  const visionNodes = upstream.filter((u) =>
    isVisionAttachment({
      nodeId: u.nodeId ?? "",
      versionId: null,
      label: u.label,
      type: u.type ?? "",
      text: u.text,
      fileUrl: u.fileUrl,
      fileKind: u.fileKind,
      useLlm: u.useLlm,
    } as UpstreamPreview),
  );
  if (visionNodes.length < 2) return null;

  const lines = visionNodes.map((u, i) => {
    const words = [
      "first", "second", "third", "fourth", "fifth",
      "sixth", "seventh", "eighth", "ninth", "tenth",
    ];
    const ordinal = i < words.length ? `the ${words[i]} image` : `image ${i + 1}`;
    return `${i + 1}. ${ordinal} — ${u.label}`;
  });

  return [
    "Reference images (attached in order):",
    ...lines,
    "",
    "Write a composition prompt that references these images by their positional names above.",
    "Describe how elements from each image combine — placement, blending, lighting match, and scale.",
  ].join("\n");
}

export function compilePrompt(input: CompilePromptInput): {
  system: string;
  user: string;
  effectiveInstruction: string;
} {
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

  const rawInstruction = input.instruction.trim() || DEFAULT_INSTRUCTION;

  // Resolve @[Label](nodeId) mention tokens before building the instruction block.
  const mentionUpstream: MentionUpstream[] = input.upstream.map((u) => ({
    nodeId: u.nodeId ?? "",
    type: u.type ?? "",
    text: u.text,
    fileUrl: u.fileUrl,
    fileKind: u.fileKind,
    useLlm: u.useLlm,
  }));
  const effectiveInstruction = resolveMentionTokens(rawInstruction, mentionUpstream);

  // Inject composition context when operator referenced ≥2 vision images inline.
  if (rawInstruction.includes("@[")) {
    const compositionBlock = buildCompositionBlock(input.upstream);
    if (compositionBlock) blocks.push(compositionBlock);
  }

  blocks.push(`Instruction:\n${effectiveInstruction}`);

  return { system: promptGeneratePrompt.system, user: blocks.join("\n\n"), effectiveInstruction };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /e/CreativeOS/creativeos-mvp && npx vitest run src/lib/nodes/prompt.test.ts 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: TypeScript check**

```bash
cd /e/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1
```

Expected: no errors. If `UpstreamPreview` import causes a circular dependency (since `resolve-inputs.ts` is server-only), cast the object inline instead — remove the `UpstreamPreview` import and just cast the mapped object as `Parameters<typeof isVisionAttachment>[0]`.

- [ ] **Step 6: Commit**

```bash
cd /e/CreativeOS/creativeos-mvp && git add src/lib/nodes/prompt.ts src/lib/nodes/prompt.test.ts && git commit -m "feat: inject composition context block in compilePrompt for multi-image instructions"
```

---

## Task 4 — Same composition block in `compileVideoPrompt` + tests

**Files:**
- Modify: `src/lib/nodes/video-prompt.ts`
- Create: `src/lib/nodes/video-prompt.test.ts`

The video-prompt path is image-to-video. "The first image" is the start frame, "the second image" would be a style or composition reference. Same treatment — inject the block when ≥2 vision nodes + `@[` in instruction.

- [ ] **Step 1: Create test file**

Create `src/lib/nodes/video-prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { compileVideoPrompt } from "./video-prompt";

describe("compileVideoPrompt — composition block", () => {
  it("injects composition block when ≥2 vision nodes and @[ token present", () => {
    const { user } = compileVideoPrompt({
      clientContext: "",
      upstream: [
        {
          nodeId: "img1",
          label: "Image",
          type: "image-gen",
          text: "",
          fileUrl: "https://cdn.example.com/still.jpg",
          fileKind: "image",
        },
        {
          nodeId: "img2",
          label: "File",
          type: "file",
          text: "",
          fileUrl: "https://cdn.example.com/ref.jpg",
          fileKind: "image",
        },
      ],
      instruction: "push in on @[Image: Still](img1), match motion from @[File: Ref](img2)",
    });
    expect(user).toContain("Reference images (attached in order):");
    expect(user).toContain("1. the first image");
    expect(user).toContain("2. the second image");
    expect(user.indexOf("Reference images")).toBeLessThan(user.indexOf("Instruction:"));
  });

  it("does NOT inject composition block for single vision node", () => {
    const { user } = compileVideoPrompt({
      clientContext: "",
      upstream: [
        {
          nodeId: "img1",
          label: "Image",
          type: "image-gen",
          text: "",
          fileUrl: "https://cdn.example.com/still.jpg",
          fileKind: "image",
        },
      ],
      instruction: "push in on @[Image: Still](img1)",
    });
    expect(user).not.toContain("Reference images (attached in order):");
  });

  it("resolves tokens even without composition block (single vision)", () => {
    const { user } = compileVideoPrompt({
      clientContext: "",
      upstream: [
        {
          nodeId: "img1",
          label: "Image",
          type: "image-gen",
          text: "",
          fileUrl: "https://cdn.example.com/still.jpg",
          fileKind: "image",
        },
      ],
      instruction: "push in on @[Image: Still](img1)",
    });
    expect(user).toContain("push in on the first image");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd /e/CreativeOS/creativeos-mvp && npx vitest run src/lib/nodes/video-prompt.test.ts 2>&1 | tail -15
```

Expected: "injects composition block" test fails.

- [ ] **Step 3: Implement in `video-prompt.ts`**

Replace the entire `src/lib/nodes/video-prompt.ts` with:

```ts
import { videoPromptGeneratePrompt } from "@/prompts/video-prompt-generate";
import { renderVideoControls, type VideoControls } from "./video-controls";
import { resolveMentionTokens, type MentionUpstream } from "./resolve-mention-tokens";
import { isVisionAttachment } from "./compose-message";
import type { UpstreamPreview } from "./resolve-inputs";

export const DEFAULT_MOTION_INSTRUCTION =
  "Describe how the still should move over ~8 seconds — camera movement first, then the secondary motion already implied by the frame.";

export type CompileVideoPromptUpstream = {
  nodeId?: string;
  label: string;
  text: string;
  type?: string;
  fileUrl?: string;
  fileKind?: string;
  useLlm?: boolean;
};

export type CompileVideoPromptInput = {
  clientContext: string;
  upstream: CompileVideoPromptUpstream[];
  instruction: string;
  controls?: VideoControls;
};

function buildCompositionBlock(upstream: CompileVideoPromptUpstream[]): string | null {
  const visionNodes = upstream.filter((u) =>
    isVisionAttachment({
      nodeId: u.nodeId ?? "",
      versionId: null,
      label: u.label,
      type: u.type ?? "",
      text: u.text,
      fileUrl: u.fileUrl,
      fileKind: u.fileKind,
      useLlm: u.useLlm,
    } as UpstreamPreview),
  );
  if (visionNodes.length < 2) return null;

  const words = [
    "first", "second", "third", "fourth", "fifth",
    "sixth", "seventh", "eighth", "ninth", "tenth",
  ];
  const lines = visionNodes.map((u, i) => {
    const ordinal = i < words.length ? `the ${words[i]} image` : `image ${i + 1}`;
    return `${i + 1}. ${ordinal} — ${u.label}`;
  });

  return [
    "Reference images (attached in order):",
    ...lines,
    "",
    "Write a motion prompt that references these images by their positional names above.",
    "Describe camera movement and secondary motion for each referenced image.",
  ].join("\n");
}

export function compileVideoPrompt(input: CompileVideoPromptInput): {
  system: string;
  user: string;
} {
  const blocks: string[] = [];

  if (input.clientContext.trim()) {
    blocks.push(`Brand context:\n${input.clientContext.trim()}`);
  }
  for (const u of input.upstream) {
    if (!u.text.trim()) continue;
    if (u.type === "shot") {
      blocks.push(`Motion context for this shot:\n${u.text.trim()}`);
    } else {
      blocks.push(`${u.label}:\n${u.text.trim()}`);
    }
  }

  const controlsBlock = input.controls ? renderVideoControls(input.controls) : "";
  if (controlsBlock) blocks.push(controlsBlock);

  const rawInstruction = input.instruction.trim() || DEFAULT_MOTION_INSTRUCTION;

  const mentionUpstream: MentionUpstream[] = input.upstream.map((u) => ({
    nodeId: u.nodeId ?? "",
    type: u.type ?? "",
    text: u.text,
    fileUrl: u.fileUrl,
    fileKind: u.fileKind,
    useLlm: u.useLlm,
  }));
  const instruction = resolveMentionTokens(rawInstruction, mentionUpstream);

  if (rawInstruction.includes("@[")) {
    const compositionBlock = buildCompositionBlock(input.upstream);
    if (compositionBlock) blocks.push(compositionBlock);
  }

  blocks.push(`Instruction:\n${instruction}`);

  return { system: videoPromptGeneratePrompt.system, user: blocks.join("\n\n") };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd /e/CreativeOS/creativeos-mvp && npx vitest run src/lib/nodes/video-prompt.test.ts 2>&1 | tail -10
```

Expected: all 3 tests pass.

- [ ] **Step 5: TypeScript check**

```bash
cd /e/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1
```

- [ ] **Step 6: Commit**

```bash
cd /e/CreativeOS/creativeos-mvp && git add src/lib/nodes/video-prompt.ts src/lib/nodes/video-prompt.test.ts && git commit -m "feat: inject composition context block in compileVideoPrompt for multi-image motion instructions"
```

---

## Task 5 — Wire `upstream` into `buildEditPrompt` in the image-gen route

**Files:**
- Modify: `src/app/api/nodes/[id]/image-generate/route.ts`

`buildEditPrompt` already accepts `upstream?: MentionUpstream[]` and calls `resolveMentionTokens` when it's provided. But the route currently calls it without `upstream` (line ~143), so `@[Image: Hero](id)` tokens in the edit instruction are never resolved — they reach the image model as raw `@[...]` text.

The route already has `upstream` from `getUpstreamOutputs(nodeId)` at line 61. We just need to map it to `MentionUpstream[]` and pass it in.

- [ ] **Step 1: Add `MentionUpstream` import to the route**

In `src/app/api/nodes/[id]/image-generate/route.ts`, add to imports:

```ts
import type { MentionUpstream } from "@/lib/nodes/resolve-mention-tokens";
```

- [ ] **Step 2: Build `mentionUpstream` from the already-fetched `upstream`**

After line 86 (`const isEdit = instruction.length > 0;`), add:

```ts
  // Map upstream nodes to MentionUpstream for @[token] resolution in edit instructions.
  const mentionUpstream: MentionUpstream[] = upstream.map((u) => ({
    nodeId: u.nodeId,
    type: u.type,
    text: typeof u.activeOutput === "string" ? u.activeOutput : "",
    fileUrl:
      u.type === "image-gen"
        ? (typeof u.activeOutput === "string" ? u.activeOutput : undefined)
        : (u.data.fileUrl as string | undefined),
    fileKind:
      u.type === "image-gen"
        ? "image"
        : (u.data.fileKind as string | undefined),
    useLlm: u.type === "file" ? (u.data.useLlm as boolean | undefined) : undefined,
  }));
```

- [ ] **Step 3: Pass `mentionUpstream` to `buildEditPrompt`**

Find the `buildEditPrompt` call (around line 143):

```ts
      buildEditPrompt({
        instruction,
        intent,
        hasExtraReference: extraReferenceUrls.length > 0,
        masked,
      });
```

Change to:

```ts
      buildEditPrompt({
        instruction,
        intent,
        hasExtraReference: extraReferenceUrls.length > 0,
        masked,
        upstream: mentionUpstream,
      });
```

- [ ] **Step 4: TypeScript check**

```bash
cd /e/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
cd /e/CreativeOS/creativeos-mvp && npx vitest run 2>&1 | tail -10
```

Expected: all tests pass (no regressions).

- [ ] **Step 6: Commit**

```bash
cd /e/CreativeOS/creativeos-mvp && git add src/app/api/nodes/\[id\]/image-generate/route.ts && git commit -m "fix: pass upstream to buildEditPrompt so @mention tokens resolve in image-gen edit path"
```

---

## Task 6 — Update system prompts with multi-image composition guidance

**Files:**
- Modify: `src/prompts/prompt-generate.ts` (bump version to v5)
- Modify: `src/prompts/video-prompt-generate.ts` (bump version to v2)

The LLMs need to know how to write composition prompts. Without this, they'll receive "use the first image as base, overlay the second image" in the instruction but have no guidance on *how* to describe a composition in image-prompt terms.

- [ ] **Step 1: Update `prompt-generate.ts`**

In `src/prompts/prompt-generate.ts`, change `version: 4` to `version: 5` and add a `MULTI-IMAGE COMPOSITION` section to the system prompt string. Insert it **after** the `SHOT CONTROLS` section and **before** `BRAND RULES`:

```
MULTI-IMAGE COMPOSITION
When the instruction references "the first image", "the second image" etc., you are compositing multiple input images. Write the prompt to describe:
- Which element comes from which image (by positional reference, e.g. "the subject from the first image")
- How they are spatially combined (placement, overlap, scale relationship)
- How lighting, shadows, and colour grade are unified across the combined elements
- The final composed scene as a single cohesive image description
Do not repeat "the first image / the second image" literally in the output — translate them into concrete visual descriptions of what is in each image, drawn from context.
```

Full updated version block to change:
```ts
export const promptGeneratePrompt = {
  id: "prompt-generate",
  version: 5,
  model: "gpt-5.4-mini",
  system: `You are a creative director writing image-generation prompts for Nano Banana (Google Gemini 3 Image).
These prompts create visual assets for short-form social-media reel campaigns.

OUTPUT FORMAT
One prose paragraph — no headers, no bullet points, no preamble, no explanation.
80–150 words. Put the primary subject and action first.

REQUIRED ELEMENTS — weave all into a single flowing paragraph
1. Subject & action — precise physical description, pose or movement
2. Setting — location, time of day, environment, atmosphere
3. Composition & camera — shot type (close-up / medium / wide), angle, and a lens spec (focal length, aperture, depth of field) drawn from the Shot controls when given, otherwise matched to the shot type
4. Lighting — specific and physical: "three-point softbox", "golden hour backlighting", "Chiaroscuro with deep shadow contrast", "soft diffused window light from camera left"
5. Style & medium — photography genre or artistic direction: "medium-format analog film with pronounced grain", "cinematic color grading with muted teal tones", "warm Kodak Portra palette"
6. Color & materiality — name exact materials and surfaces; include hex codes when the brand provides them: "warm cream linen #F5EDD6", "aged terracotta", "brushed brass"

VOCABULARY TO USE
Lighting: "Rembrandt lighting", "rim light", "golden hour", "volumetric rays", "diffused illumination", "dramatic shadow"
Camera: "shallow depth of field", "deep focus", "center-framed", "worm's-eye view", "aerial view", "macro detail"
Style: "editorial", "analog film", "Fujifilm palette", "high saturation", "film noir", "muted teal tones"

WORDS TO AVOID
Do not use: "highly detailed", "ultra realistic", "beautiful", "stunning", "amazing", "8K", "masterpiece"
These are junk tokens that degrade Nano Banana output quality.

SHOT CONTROLS
If a "Shot controls" block is provided, use those EXACT lens, composition, and lighting values — do not substitute or invent alternatives. The Shot controls block OVERRIDES any lens, composition, or lighting wording elsewhere in these instructions, including the vocabulary examples above. Choose lens, composition, and lighting yourself only for a control that is not given.

MULTI-IMAGE COMPOSITION
When the instruction references "the first image", "the second image" etc., you are compositing multiple input images. Write the prompt to describe:
- Which element comes from which image (by positional reference, e.g. "the subject from the first image")
- How they are spatially combined (placement, overlap, scale relationship)
- How lighting, shadows, and colour grade are unified across the combined elements
- The final composed scene as a single cohesive image description
Do not repeat "the first image / the second image" literally in the output — translate them into concrete visual descriptions of what is in each image, drawn from context.

BRAND RULES
- Apply brand colours by name and hex exactly as given in the Brand context
- Use the casting descriptor verbatim (age range, skin tone, styling cues)
- Never include any word from the compliance never-use list — not even as part of a compound word
- The image must be visually arresting for a social-media reel: clear subject hierarchy, one strong focal point`,
} as const;
```

- [ ] **Step 2: Update `video-prompt-generate.ts`**

In `src/prompts/video-prompt-generate.ts`, change `version: 1` to `version: 2` and add a `MULTI-IMAGE REFERENCES` clause. Insert it after the `WORDS TO AVOID` section:

```
MULTI-IMAGE REFERENCES
When the instruction references "the first image", "the second image" etc., each refers to a distinct visual input. Describe camera movement and secondary motion that serves the composition of all referenced frames — for instance, a transition between the two, a parallax effect that reveals one over the other, or motion that draws the eye across a composited frame. Do not re-describe the visual content of the images.
```

Full updated version:
```ts
export const videoPromptGeneratePrompt = {
  id: "video-prompt-generate",
  version: 2,
  model: "gpt-5.4-mini",
  system: `You are a motion director writing image-to-video prompts for Veo 3.1.
A still image (the first frame) is provided. Your job is to describe how that frame should
come to life over roughly 8 seconds.

OUTPUT FORMAT
One short prose paragraph — no headers, no bullet points, no preamble, no explanation.
40–90 words. Lead with the camera movement as its own clause, then the action.

STRUCTURE (image-to-video)
1. Camera movement — a single, explicit camera move as a standalone clause ("Slow push-in.",
   "Static locked-off frame.", "Gentle orbit."). Veo parses camera direction best when it is
   separated from the subject action.
2. Action — what physically moves in the scene (secondary motion: steam drifts, fabric sways,
   light shifts, liquid pours). Keep it grounded in what is already visible in the frame.

DO NOT re-describe the scene. The first frame already carries the subject, setting, lighting,
palette, and style — repeating them fights the image. Never restate subject appearance, wardrobe,
location, or color. Never invent new objects or people not in the frame.

WORDS TO AVOID
Do not use: "cinematic masterpiece", "ultra realistic", "8K", "stunning", "beautiful".

MULTI-IMAGE REFERENCES
When the instruction references "the first image", "the second image" etc., each refers to a distinct visual input. Describe camera movement and secondary motion that serves the composition of all referenced frames — for instance, a transition between the two, a parallax effect that reveals one over the other, or motion that draws the eye across a composited frame. Do not re-describe the visual content of the images.

If motion controls are provided, honor them exactly.`,
} as const;
```

- [ ] **Step 3: TypeScript check + full test run**

```bash
cd /e/CreativeOS/creativeos-mvp && npx tsc --noEmit 2>&1 && npx vitest run 2>&1 | tail -10
```

Expected: clean build, all tests pass.

- [ ] **Step 4: Commit**

```bash
cd /e/CreativeOS/creativeos-mvp && git add src/prompts/prompt-generate.ts src/prompts/video-prompt-generate.ts && git commit -m "feat: add multi-image composition guidance to system prompts (prompt-generate v5, video-prompt-generate v2)"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|-------------|------|
| Extend ordinals to 10 named (Gemini supports 14) | Task 1 ✅ |
| Prove ordering invariant: token ordinals == image_url part order | Task 2 ✅ |
| Export `isVisionAttachment` so compile functions can count vision nodes | Task 2 ✅ |
| Inject composition context block in `compilePrompt` (Prompt node path) | Task 3 ✅ |
| Inject composition context block in `compileVideoPrompt` (Video Prompt path) | Task 4 ✅ |
| Wire `upstream` into `buildEditPrompt` in image-gen route (edit path) | Task 5 ✅ |
| Update system prompts with composition framing | Task 6 ✅ |

**Placeholder scan:** No TBDs. All code blocks are complete and runnable.

**Type consistency:** `MentionUpstream` imported from `resolve-mention-tokens` in Tasks 3, 4, 5. `isVisionAttachment` exported from `compose-message` in Task 2, imported in Tasks 3 and 4. `CompilePromptUpstream` / `CompileVideoPromptUpstream` used consistently across Tasks 3 and 4. `UpstreamPreview` cast needed for `isVisionAttachment` — noted in Task 3 Step 5 with fallback instruction.

**One potential issue in Tasks 3 & 4:** `isVisionAttachment` takes `UpstreamPreview` (from `resolve-inputs.ts` which is `server-only`). If importing `UpstreamPreview` in `prompt.ts` triggers a `server-only` error in tests, remove the import and just inline the cast: `as { nodeId: string; versionId: null; label: string; type: string; text: string; fileUrl?: string; fileKind?: string; useLlm?: boolean }`. The function signature only cares about those fields.
