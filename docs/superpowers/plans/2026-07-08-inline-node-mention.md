# Inline @-Node Mention in Instruction Fields — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators type `@` in any instruction field to mention a specific connected image or file node inline; at generation time, tokens are resolved to positional image references (`the first image`, `the second image`) or inline extracted text, matching the convention OpenAI/Gemini use for multipart vision messages.

**Architecture:** A new pure function `resolveMentionTokens()` runs inside each compile function (`compilePrompt`, `compileVideoPrompt`, `buildEditPrompt`) before the instruction block is built. On the frontend, a new `MentionInstructionEditor` component (Lexical-based) replaces the plain `<textarea>` in all three focus views; it surfaces a floating `Command` dropdown on `@` and serialises tokens as `@[Label](nodeId)` plain strings — the same format the backend parses.

**Tech Stack:** `lexical` + `@lexical/react` (mention editor), `vitest` (unit tests), shadcn `Command` + `Popover` (dropdown UI, already in project).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/nodes/resolve-mention-tokens.ts` | Create | Pure token parser + resolver — maps `@[Label](nodeId)` → positional string or inline text |
| `src/lib/nodes/resolve-mention-tokens.test.ts` | Create | Unit tests for the resolver |
| `src/components/nodes/mention-instruction-editor.tsx` | Create | Lexical editor with MentionNode + floating dropdown |
| `src/lib/nodes/prompt.ts` | Modify | Call `resolveMentionTokens()` before instruction block |
| `src/lib/nodes/prompt.test.ts` | Modify | Add tests for token resolution in `compilePrompt` |
| `src/lib/nodes/video-prompt.ts` | Modify | Call `resolveMentionTokens()` before instruction block |
| `src/lib/image-gen/edit-prompt.ts` | Modify | Accept + resolve upstream tokens in `buildEditPrompt` |
| `src/components/nodes/prompt-focus-view.tsx` | Modify | Swap `<textarea>` → `<MentionInstructionEditor>` |
| `src/components/nodes/video-prompt-focus-view.tsx` | Modify | Swap `<textarea>` → `<MentionInstructionEditor>` |
| `src/components/nodes/image-gen-focus-view.tsx` | Modify | Swap edit instruction `<Textarea>` → `<MentionInstructionEditor>` |
| `src/components/nodes/image-gen-edit-panel.tsx` | Modify | Accept `MentionInstructionEditor` as children or swap `<Textarea>` prop |

---

## Task 1: Install Lexical

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
cd e:/CreativeOS/creativeos-mvp
npm install lexical @lexical/react
```

Expected: both packages appear in `package.json` dependencies, no peer-dep errors.

- [ ] **Step 2: Verify install**

```bash
node -e "require('lexical'); console.log('ok')"
```

Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install lexical + @lexical/react for mention editor"
```

---

## Task 2: `resolveMentionTokens` — pure resolver function

**Files:**
- Create: `src/lib/nodes/resolve-mention-tokens.ts`
- Create: `src/lib/nodes/resolve-mention-tokens.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/nodes/resolve-mention-tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveMentionTokens } from "./resolve-mention-tokens";
import type { MentionUpstream } from "./resolve-mention-tokens";

function img(nodeId: string, fileKind: "image" = "image"): MentionUpstream {
  return {
    nodeId,
    type: "file",
    text: "",
    fileUrl: `https://cdn.example.com/${nodeId}.jpg`,
    fileKind,
  };
}

function imgGen(nodeId: string): MentionUpstream {
  return {
    nodeId,
    type: "image-gen",
    text: "",
    fileUrl: `https://cdn.example.com/${nodeId}.jpg`,
    fileKind: "image",
  };
}

function draw(nodeId: string): MentionUpstream {
  return {
    nodeId,
    type: "draw",
    text: "",
    fileUrl: `https://cdn.example.com/${nodeId}.jpg`,
    fileKind: "image",
  };
}

function fileText(nodeId: string, text: string): MentionUpstream {
  return { nodeId, type: "file", text, fileUrl: undefined, fileKind: "document" };
}

function nonVision(nodeId: string): MentionUpstream {
  return { nodeId, type: "shot", text: "a wide shot", fileUrl: undefined };
}

describe("resolveMentionTokens", () => {
  it("returns instruction unchanged when no tokens present", () => {
    const upstream = [img("a"), img("b")];
    expect(resolveMentionTokens("use the main image", upstream)).toBe("use the main image");
  });

  it("resolves an image-gen token to 'the first image'", () => {
    const upstream = [imgGen("hero")];
    const result = resolveMentionTokens("use @[Image: Hero](hero) as start frame", upstream);
    expect(result).toBe("use the first image as start frame");
  });

  it("resolves a file image token to positional ordinal", () => {
    const upstream = [img("ref1")];
    const result = resolveMentionTokens("take composition from @[Image: Ref](ref1)", upstream);
    expect(result).toBe("take composition from the first image");
  });

  it("resolves a draw token to positional ordinal", () => {
    const upstream = [draw("sketch1")];
    const result = resolveMentionTokens("match @[Sketch: Draft](sketch1) style", upstream);
    expect(result).toBe("match the first image style");
  });

  it("assigns correct ordinals when multiple vision nodes", () => {
    const upstream = [img("a"), img("b"), img("c")];
    const result = resolveMentionTokens(
      "@[Image: A](a) start, @[Image: B](b) mid, @[Image: C](c) end",
      upstream,
    );
    expect(result).toBe("the first image start, the second image mid, the third image end");
  });

  it("uses 'image N' for ordinal 4+", () => {
    const upstream = [img("a"), img("b"), img("c"), img("d")];
    const result = resolveMentionTokens("@[Image: D](d) last", upstream);
    expect(result).toBe("image 4 last");
  });

  it("resolves a file text node by inlining its extracted text", () => {
    const upstream = [fileText("brief", "Tone: warm and inviting")];
    const result = resolveMentionTokens("follow @[File: Brief](brief) guidelines", upstream);
    expect(result).toBe("follow Tone: warm and inviting guidelines");
  });

  it("ignores non-vision non-text nodes in vision ordinal count", () => {
    // shot node is not a vision attachment — should not affect ordinals
    const upstream = [nonVision("shot1"), img("ref1")];
    const result = resolveMentionTokens("use @[Image: Ref](ref1)", upstream);
    expect(result).toBe("use the first image");
  });

  it("falls back to display label when nodeId is not in upstream", () => {
    const upstream = [img("a")];
    const result = resolveMentionTokens("use @[Image: Missing](missing-id)", upstream);
    expect(result).toBe("use Image: Missing");
  });

  it("handles multiple tokens of mixed types", () => {
    const upstream = [img("hero"), fileText("brief", "brand voice: bold")];
    const result = resolveMentionTokens(
      "use @[Image: Hero](hero) as base; apply @[File: Brief](brief)",
      upstream,
    );
    expect(result).toBe("use the first image as base; apply brand voice: bold");
  });

  it("is a no-op on empty instruction", () => {
    expect(resolveMentionTokens("", [img("a")])).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd e:/CreativeOS/creativeos-mvp
npx vitest run src/lib/nodes/resolve-mention-tokens.test.ts
```

Expected: all tests FAIL with "Cannot find module './resolve-mention-tokens'".

- [ ] **Step 3: Implement `resolve-mention-tokens.ts`**

Create `src/lib/nodes/resolve-mention-tokens.ts`:

```ts
// Pure function: resolves @[Label](nodeId) mention tokens in an instruction string.
// Image/draw node tokens → positional "the first image" / "the second image" etc.
// (matches the positional convention OpenAI and Gemini use for multipart image messages).
// File-with-text node tokens → extracted text inline.
// Unknown nodeId → display label as plain text fallback.

export type MentionUpstream = {
  nodeId: string;
  type: string;
  text: string;
  fileUrl?: string;
  fileKind?: string;
  useLlm?: boolean;
};

// Same predicate as isVisionAttachment() in compose-message.ts — must stay in sync.
function isVisionNode(u: MentionUpstream): boolean {
  const hasUrl = typeof u.fileUrl === "string" && u.fileUrl.length > 0;
  if ((u.type === "file" || u.type === "draw") && u.fileKind === "image" && hasUrl && !u.useLlm) {
    return true;
  }
  if (u.type === "image-gen" && hasUrl) return true;
  return false;
}

function ordinalToEnglish(n: number): string {
  const words = ["first", "second", "third"];
  if (n <= words.length) return `the ${words[n - 1]} image`;
  return `image ${n}`;
}

const TOKEN_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

export function resolveMentionTokens(
  instruction: string,
  upstream: MentionUpstream[],
): string {
  if (!instruction.includes("@[")) return instruction;

  // Build vision position map: nodeId → 1-based ordinal
  const visionOrder = new Map<string, number>();
  let ordinal = 0;
  for (const u of upstream) {
    if (isVisionNode(u)) {
      ordinal += 1;
      visionOrder.set(u.nodeId, ordinal);
    }
  }

  // Build nodeId → upstream lookup for text nodes
  const byId = new Map<string, MentionUpstream>(upstream.map((u) => [u.nodeId, u]));

  return instruction.replace(TOKEN_RE, (_match, label: string, nodeId: string) => {
    // Vision attachment → positional reference
    const pos = visionOrder.get(nodeId);
    if (pos !== undefined) return ordinalToEnglish(pos);

    // File with extracted text → inline
    const node = byId.get(nodeId);
    if (node && node.text.trim()) return node.text.trim();

    // Fallback: display label
    return label;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd e:/CreativeOS/creativeos-mvp
npx vitest run src/lib/nodes/resolve-mention-tokens.test.ts
```

Expected: all 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/resolve-mention-tokens.ts src/lib/nodes/resolve-mention-tokens.test.ts
git commit -m "feat: resolveMentionTokens — pure @[Label](nodeId) token resolver"
```

---

## Task 3: Wire resolver into `compilePrompt`

**Files:**
- Modify: `src/lib/nodes/prompt.ts`
- Modify: `src/lib/nodes/prompt.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/lib/nodes/prompt.test.ts` (append inside the `describe` block):

```ts
  it("resolves @[Label](nodeId) image tokens to positional references in instruction", () => {
    const { user } = compilePrompt({
      clientContext: "",
      upstream: [
        {
          nodeId: "img-1",
          label: "Image",
          type: "image-gen",
          text: "",
          fileUrl: "https://cdn.example.com/hero.jpg",
          fileKind: "image",
        },
        {
          nodeId: "img-2",
          label: "Image",
          type: "file",
          text: "",
          fileUrl: "https://cdn.example.com/ref.jpg",
          fileKind: "image",
        },
      ],
      instruction: "use @[Image: Hero](img-1) as base, composition from @[Image: Ref](img-2)",
    });
    expect(user).toContain("Instruction:\nuse the first image as base, composition from the second image");
  });
```

Note: `compilePrompt`'s `upstream` param type is `{ label: string; text: string; type?: string }[]`. We need to widen it to accept `nodeId`, `fileUrl`, `fileKind`, `useLlm` — that happens in the implementation step below.

- [ ] **Step 2: Run test to verify it fails**

```bash
cd e:/CreativeOS/creativeos-mvp
npx vitest run src/lib/nodes/prompt.test.ts
```

Expected: the new test FAILS (tokens not resolved, instruction passes through raw).

- [ ] **Step 3: Update `prompt.ts`**

Replace the contents of `src/lib/nodes/prompt.ts`:

```ts
import { promptGeneratePrompt } from "@/prompts/prompt-generate";
import { renderShotControls, type ShotControls } from "./shot-controls";
import { resolveMentionTokens, type MentionUpstream } from "./resolve-mention-tokens";

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

  blocks.push(`Instruction:\n${effectiveInstruction}`);

  return { system: promptGeneratePrompt.system, user: blocks.join("\n\n"), effectiveInstruction };
}
```

- [ ] **Step 4: Run all prompt tests**

```bash
cd e:/CreativeOS/creativeos-mvp
npx vitest run src/lib/nodes/prompt.test.ts
```

Expected: all tests PASS (existing tests still pass because no tokens → no-op).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nodes/prompt.ts src/lib/nodes/prompt.test.ts
git commit -m "feat: resolve @-mention tokens in compilePrompt instruction"
```

---

## Task 4: Wire resolver into `compileVideoPrompt`

**Files:**
- Modify: `src/lib/nodes/video-prompt.ts`

- [ ] **Step 1: Update `video-prompt.ts`**

Replace the contents of `src/lib/nodes/video-prompt.ts`:

```ts
import { videoPromptGeneratePrompt } from "@/prompts/video-prompt-generate";
import { renderVideoControls, type VideoControls } from "./video-controls";
import { resolveMentionTokens, type MentionUpstream } from "./resolve-mention-tokens";

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

  blocks.push(`Instruction:\n${instruction}`);

  return { system: videoPromptGeneratePrompt.system, user: blocks.join("\n\n") };
}
```

- [ ] **Step 2: Run all tests to check no regressions**

```bash
cd e:/CreativeOS/creativeos-mvp
npx vitest run
```

Expected: all existing tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/nodes/video-prompt.ts
git commit -m "feat: resolve @-mention tokens in compileVideoPrompt instruction"
```

---

## Task 5: Wire resolver into `buildEditPrompt`

**Files:**
- Modify: `src/lib/image-gen/edit-prompt.ts`

- [ ] **Step 1: Update `buildEditPrompt`**

Replace the contents of `src/lib/image-gen/edit-prompt.ts`:

```ts
import { resolveMentionTokens, type MentionUpstream } from "@/lib/nodes/resolve-mention-tokens";

export type EditIntent = "remove" | "replace" | "add" | "modify" | "freeform";

const MASK_CLAUSE =
  " Apply the change only within the selected (masked) region and blend it seamlessly; " +
  "keep everything outside the region unchanged.";

export function buildEditPrompt(input: {
  instruction: string;
  intent?: EditIntent;
  hasExtraReference?: boolean;
  masked?: boolean;
  upstream?: MentionUpstream[];
}): string {
  // Resolve @[Label](nodeId) tokens before building the template.
  const instruction = input.upstream
    ? resolveMentionTokens(input.instruction.trim(), input.upstream)
    : input.instruction.trim();

  const intent = input.intent ?? (input.hasExtraReference ? "add" : "freeform");

  let base: string;
  switch (intent) {
    case "remove":
      base =
        `Using the provided image, remove ${instruction}. Keep everything else exactly the ` +
        `same — preserve the original subject, style, lighting, composition, and all remaining ` +
        `elements, and fill the vacated area so the edit is seamless.`;
      break;
    case "replace":
      base =
        `Using the provided image as the base scene, replace ${instruction} with the product ` +
        `shown in the additional reference image(s). Match the original placement, scale, ` +
        `perspective, lighting, and shadows. Keep everything else in the scene exactly the same.`;
      break;
    case "add":
      base =
        `Using the provided image as the base scene, add ${instruction} using the product shown ` +
        `in the additional reference image(s). Integrate it naturally with realistic scale, ` +
        `perspective, lighting, and shadows, and keep everything else in the scene exactly the same.`;
      break;
    case "modify":
    case "freeform":
    default:
      base =
        `Using the provided image, change only ${instruction}. Keep everything else exactly the ` +
        `same — preserve the original style, lighting, composition, and all other elements.`;
      break;
  }

  return input.masked ? base + MASK_CLAUSE : base;
}

export function assembleEditReferences(input: {
  baseImageUrl: string;
  extraUrls: string[];
  max: number;
}): string[] {
  const extras = input.extraUrls.filter((u) => u !== input.baseImageUrl);
  return [input.baseImageUrl, ...extras].slice(0, Math.max(1, input.max));
}

export function selectEditReferenceUrls(input: {
  connected: Array<{ id: string; url: string }>;
  selectedIds: string[];
  baseUrl?: string;
}): string[] {
  const nonBase = input.connected.filter((c) => !!c.url && c.url !== input.baseUrl);
  const chosen =
    input.selectedIds.length > 0
      ? nonBase.filter((c) => input.selectedIds.includes(c.id))
      : nonBase;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of chosen) {
    if (!seen.has(c.url)) {
      seen.add(c.url);
      out.push(c.url);
    }
  }
  return out;
}
```

- [ ] **Step 2: Run all tests**

```bash
cd e:/CreativeOS/creativeos-mvp
npx vitest run
```

Expected: all tests PASS. (`buildEditPrompt` callers that omit `upstream` get the no-op path.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/image-gen/edit-prompt.ts
git commit -m "feat: resolve @-mention tokens in buildEditPrompt"
```

---

## Task 6: `MentionInstructionEditor` component

**Files:**
- Create: `src/components/nodes/mention-instruction-editor.tsx`

This is the Lexical-powered textarea replacement. It renders identically to the existing `<textarea>` visually but adds `@`-trigger mention support.

- [ ] **Step 1: Create the component**

Create `src/components/nodes/mention-instruction-editor.tsx`:

```tsx
"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  LexicalComposer,
  type InitialConfigType,
} from "@lexical/react/LexicalComposer";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $createTextNode,
  $createParagraphNode,
  DecoratorNode,
  type NodeKey,
  type LexicalNode,
  type SerializedLexicalNode,
  type EditorConfig,
  type LexicalEditor,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_NORMAL,
  KEY_ESCAPE_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  $insertNodes,
} from "lexical";
import type { EditorState } from "lexical";
import { ImageIcon, Paperclip, Pencil, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UpstreamNode } from "./connected-inputs-card";

// ── MentionNode ───────────────────────────────────────────────────────────────

type SerializedMentionNode = SerializedLexicalNode & {
  label: string;
  nodeId: string;
};

export class MentionNode extends DecoratorNode<null> {
  __label: string;
  __nodeId: string;

  static getType(): string {
    return "mention";
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__label, node.__nodeId, node.__key);
  }

  constructor(label: string, nodeId: string, key?: NodeKey) {
    super(key);
    this.__label = label;
    this.__nodeId = nodeId;
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span");
    span.className =
      "inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary mx-0.5 select-none";
    span.contentEditable = "false";
    span.dataset.mentionId = this.__nodeId;
    span.dataset.mentionLabel = this.__label;
    return span;
  }

  updateDOM(): boolean {
    return false;
  }

  decorate(): null {
    return null;
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  exportJSON(): SerializedMentionNode {
    return {
      ...super.exportJSON(),
      type: "mention",
      label: this.__label,
      nodeId: this.__nodeId,
      version: 1,
    };
  }

  static importJSON(json: SerializedMentionNode): MentionNode {
    return new MentionNode(json.label, json.nodeId);
  }

  // Serialises to @[Label](nodeId) for storage and backend resolution.
  exportText(): string {
    return `@[${this.__label}](${this.__nodeId})`;
  }
}

// ── Serialization helpers ─────────────────────────────────────────────────────

const TOKEN_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

function serializeEditorState(state: EditorState): string {
  let text = "";
  state.read(() => {
    const root = $getRoot();
    const children = root.getChildren();
    const parts: string[] = [];
    for (const child of children) {
      const childText = child.getTextContent();
      parts.push(childText);
    }
    text = parts.join("\n");

    // Replace mention node placeholders with @[Label](nodeId) tokens.
    // Lexical's getTextContent() on a MentionNode calls exportText() when the
    // node implements it, but we walk explicitly for safety.
    text = root
      .getChildren()
      .flatMap((para) => para.getChildren())
      .map((node) => {
        if (node instanceof MentionNode) return node.exportText();
        return (node as LexicalNode).getTextContent();
      })
      .join("");
  });
  return text;
}

function parseInitialValue(value: string, editor: LexicalEditor): void {
  editor.update(() => {
    const root = $getRoot();
    root.clear();
    const para = $createParagraphNode();

    let lastIndex = 0;
    let match: RegExpExecArray | null;
    TOKEN_RE.lastIndex = 0;

    while ((match = TOKEN_RE.exec(value)) !== null) {
      const [full, label, nodeId] = match;
      const before = value.slice(lastIndex, match.index);
      if (before) para.append($createTextNode(before));
      para.append(new MentionNode(label, nodeId));
      lastIndex = match.index + full.length;
    }

    const tail = value.slice(lastIndex);
    if (tail) para.append($createTextNode(tail));
    root.append(para);
  });
}

// ── MentionsPlugin ────────────────────────────────────────────────────────────

type DropdownItem = { id: string; label: string; type: string };

function nodeTypeIcon(type: string) {
  if (type === "image-gen") return <ImageIcon className="size-3 shrink-0 text-primary" />;
  if (type === "file") return <Paperclip className="size-3 shrink-0 text-primary" />;
  if (type === "draw") return <Pencil className="size-3 shrink-0 text-primary" />;
  return <Sparkles className="size-3 shrink-0 text-primary" />;
}

function nodeTypeLabel(type: string): string {
  if (type === "image-gen") return "Image";
  if (type === "file") return "File";
  if (type === "draw") return "Sketch";
  return type;
}

function MentionsPlugin({
  upstream,
  dropdownRef,
}: {
  upstream: UpstreamNode[];
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const eligible: DropdownItem[] = upstream
    .filter(
      (u) =>
        u.type === "image-gen" ||
        u.type === "draw" ||
        u.type === "file",
    )
    .map((u) => ({
      id: u.id,
      label: `${nodeTypeLabel(u.type)}: ${u.label}`,
      type: u.type,
    }));

  const filtered =
    query === null
      ? []
      : eligible.filter((item) =>
          item.label.toLowerCase().includes(query.toLowerCase()),
        );

  const open = query !== null && filtered.length > 0;

  const insertMention = useCallback(
    (item: DropdownItem) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        // Delete the "@query" text the user typed
        const anchor = selection.anchor;
        const node = anchor.getNode();
        const textContent = node.getTextContent();
        const offset = anchor.offset;
        // Find the @ that started this query
        const atIndex = textContent.lastIndexOf("@", offset - 1);
        if (atIndex !== -1) {
          node.spliceText(atIndex, offset - atIndex, "");
        }

        const mention = new MentionNode(item.label, item.id);
        $insertNodes([mention, $createTextNode(" ")]);
      });
      setQuery(null);
      setAnchorRect(null);
    },
    [editor],
  );

  // Track @ trigger
  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          setQuery(null);
          return;
        }
        const anchor = selection.anchor;
        const node = anchor.getNode();
        const text = node.getTextContent();
        const offset = anchor.offset;
        const atIndex = text.lastIndexOf("@", offset - 1);
        if (atIndex === -1 || atIndex < offset - 30) {
          setQuery(null);
          return;
        }
        const q = text.slice(atIndex + 1, offset);
        setQuery(q);

        // Position dropdown near the caret
        const domSelection = window.getSelection();
        if (domSelection && domSelection.rangeCount > 0) {
          const range = domSelection.getRangeAt(0);
          setAnchorRect(range.getBoundingClientRect());
        }
      });
    });
  }, [editor]);

  // Keyboard navigation when dropdown is open
  useEffect(() => {
    if (!open) return;
    const removeDown = editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      () => {
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );
    const removeUp = editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      () => {
        setActiveIndex((i) => Math.max(i - 1, 0));
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );
    const removeEnter = editor.registerCommand(
      KEY_ENTER_COMMAND,
      () => {
        if (filtered[activeIndex]) {
          insertMention(filtered[activeIndex]);
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_NORMAL,
    );
    const removeEsc = editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      () => {
        setQuery(null);
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );
    return () => {
      removeDown();
      removeUp();
      removeEnter();
      removeEsc();
    };
  }, [open, activeIndex, filtered, editor, insertMention]);

  // Reset active index when filtered list changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open || !anchorRect) return null;

  // Render dropdown via portal so it floats above everything
  return (
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        top: anchorRect.top - 4,
        left: anchorRect.left,
        transform: "translateY(-100%)",
        zIndex: 9999,
      }}
      className="min-w-[200px] max-w-xs rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
    >
      {filtered.map((item, i) => (
        <button
          key={item.id}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault(); // don't blur the editor
            insertMention(item);
          }}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-xs text-left transition-colors",
            i === activeIndex
              ? "bg-primary/10 text-primary"
              : "hover:bg-muted text-foreground",
          )}
        >
          {nodeTypeIcon(item.type)}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── InitialValuePlugin ────────────────────────────────────────────────────────

function InitialValuePlugin({ value }: { value: string }) {
  const [editor] = useLexicalComposerContext();
  const prevValue = useRef<string | null>(null);

  useEffect(() => {
    if (prevValue.current === value) return;
    prevValue.current = value;
    parseInitialValue(value, editor);
  }, [value, editor]);

  return null;
}

// ── Public component ──────────────────────────────────────────────────────────

export type MentionInstructionEditorProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  upstream: UpstreamNode[];
  className?: string;
  disabled?: boolean;
};

export function MentionInstructionEditor({
  value,
  onChange,
  placeholder = "Write an instruction…",
  upstream,
  className,
  disabled = false,
}: MentionInstructionEditorProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  const initialConfig: InitialConfigType = {
    namespace: "MentionEditor",
    nodes: [MentionNode],
    onError: (err) => console.error("[MentionEditor]", err),
    editable: !disabled,
  };

  function handleChange(state: EditorState) {
    const serialized = serializeEditorState(state);
    onChange(serialized);
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className={cn("relative flex-1 min-h-0", className)}>
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              className={cn(
                "flex-1 min-h-0 w-full h-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring",
                disabled && "cursor-not-allowed opacity-50",
              )}
              aria-placeholder={placeholder}
            />
          }
          placeholder={
            <div className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
              {placeholder}
            </div>
          }
          ErrorBoundary={({ children }) => <>{children}</>}
        />
        <OnChangePlugin onChange={handleChange} />
        <HistoryPlugin />
        <InitialValuePlugin value={value} />
        <MentionsPlugin upstream={upstream} dropdownRef={dropdownRef} />
      </div>
    </LexicalComposer>
  );
}
```

- [ ] **Step 2: Run `npx tsc --noEmit` to check for type errors**

```bash
cd e:/CreativeOS/creativeos-mvp
npx tsc --noEmit
```

Fix any type errors before continuing. Common issues:
- Lexical's `DecoratorNode` generic — `DecoratorNode<null>` returns `null` from `decorate()` (correct for a chip we render via `createDOM`).
- `LexicalNode` vs specific node types — import from `"lexical"` directly.

- [ ] **Step 3: Commit**

```bash
git add src/components/nodes/mention-instruction-editor.tsx
git commit -m "feat: MentionInstructionEditor — Lexical @-mention textarea component"
```

---

## Task 7: Swap textarea in `prompt-focus-view.tsx`

**Files:**
- Modify: `src/components/nodes/prompt-focus-view.tsx`

- [ ] **Step 1: Add import**

At the top of `src/components/nodes/prompt-focus-view.tsx`, add after the existing imports:

```ts
import { MentionInstructionEditor } from "./mention-instruction-editor";
```

- [ ] **Step 2: Replace the instruction `<textarea>`**

Find this block (around line 540):

```tsx
<textarea
  value={instructionDraft}
  onChange={(e) => {
    setInstructionDraft(e.target.value);
    onPatch({ instruction: e.target.value });
  }}
  placeholder={instructionPlaceholder}
  className="flex-1 min-h-0 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
/>
```

Replace with:

```tsx
<MentionInstructionEditor
  value={instructionDraft}
  onChange={(v) => {
    setInstructionDraft(v);
    onPatch({ instruction: v });
  }}
  placeholder={instructionPlaceholder}
  upstream={upstream}
  disabled={!editable}
/>
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd e:/CreativeOS/creativeos-mvp
npx tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/prompt-focus-view.tsx
git commit -m "feat: use MentionInstructionEditor in prompt focus view"
```

---

## Task 8: Swap textarea in `video-prompt-focus-view.tsx`

**Files:**
- Modify: `src/components/nodes/video-prompt-focus-view.tsx`

- [ ] **Step 1: Add import**

```ts
import { MentionInstructionEditor } from "./mention-instruction-editor";
```

- [ ] **Step 2: Replace the instruction `<textarea>`**

Find (around line 504):

```tsx
<textarea
  value={instructionDraft}
  onChange={(e) => {
    setInstructionDraft(e.target.value);
    onPatch({ instruction: e.target.value });
  }}
  placeholder={DEFAULT_MOTION_INSTRUCTION}
  className="flex-1 min-h-0 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
/>
```

Replace with:

```tsx
<MentionInstructionEditor
  value={instructionDraft}
  onChange={(v) => {
    setInstructionDraft(v);
    onPatch({ instruction: v });
  }}
  placeholder={DEFAULT_MOTION_INSTRUCTION}
  upstream={upstream}
  disabled={!editable}
/>
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd e:/CreativeOS/creativeos-mvp
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/nodes/video-prompt-focus-view.tsx
git commit -m "feat: use MentionInstructionEditor in video prompt focus view"
```

---

## Task 9: Swap edit instruction textarea in `image-gen-focus-view.tsx`

The image-gen focus view passes `editInstr` and `handleInstructionChange` into `ImageGenEditPanel`. The `<Textarea>` lives inside `ImageGenEditPanel` — we need to thread `upstream` down and swap there.

**Files:**
- Modify: `src/components/nodes/image-gen-edit-panel.tsx`
- Modify: `src/components/nodes/image-gen-focus-view.tsx`

- [ ] **Step 1: Update `ImageGenEditPanel` props and textarea**

In `src/components/nodes/image-gen-edit-panel.tsx`, add the import and update the props:

```tsx
import { MentionInstructionEditor } from "./mention-instruction-editor";
import type { UpstreamNode } from "./connected-inputs-card";
```

Add `upstream` to `ImageGenEditPanelProps`:

```ts
export type ImageGenEditPanelProps = {
  intent: EditIntent;
  instruction: string;
  finalPrompt: string;
  editing: boolean;
  canEdit: boolean;
  referenceWarning: boolean;
  suggestGemini: boolean;
  upstream: UpstreamNode[];                   // ← add this
  onPickChip: (intent: EditIntent, starter: string) => void;
  onInstructionChange: (v: string) => void;
  onInstructionBlur: () => void;
  onFinalPromptChange: (v: string) => void;
  onEdit: () => void;
};
```

Replace the `<Textarea>` for the instruction (the first textarea, around line 72):

```tsx
// Before:
<Textarea
  value={instruction}
  onChange={(e) => onInstructionChange(e.target.value)}
  onBlur={onInstructionBlur}
  rows={2}
  placeholder="remove the cup… · replace the bottle with the product reference… · add the product…"
  className="nodrag resize-none text-sm"
/>

// After:
<MentionInstructionEditor
  value={instruction}
  onChange={onInstructionChange}
  placeholder="remove the cup… · replace the bottle with the product reference… · add the product…"
  upstream={upstream}
  className="nodrag min-h-[4rem]"
/>
```

Also remove the `onInstructionBlur` from `ImageGenEditPanelProps` if it was only needed by the `<Textarea>` — check if it's used elsewhere first. If it is (e.g. for `onPatch` write-through on blur), keep the prop but the `MentionInstructionEditor` calls `onChange` on every keystroke so the blur is redundant.

- [ ] **Step 2: Pass `upstream` from `image-gen-focus-view.tsx`**

In `src/components/nodes/image-gen-focus-view.tsx`, find where `<ImageGenEditPanel>` is rendered (around line 787) and add the `upstream` prop:

```tsx
<ImageGenEditPanel
  intent={editIntent}
  instruction={editInstr}
  finalPrompt={finalPrompt}
  editing={editing}
  canEdit={canEdit}
  referenceWarning={referenceWarning}
  suggestGemini={suggestGemini}
  upstream={upstreamForCard}          // ← add this (already computed above)
  onPickChip={handlePickChip}
  onInstructionChange={handleInstructionChange}
  onInstructionBlur={() => onPatch({ editInstruction: editInstr })}
  onFinalPromptChange={setPromptOverride}
  onEdit={handleEdit}
/>
```

- [ ] **Step 3: Pass `upstream` when calling `buildEditPrompt` in `image-gen-focus-view.tsx`**

Find the `composedPrompt` computation (around line 396):

```tsx
const composedPrompt = editInstr.trim()
  ? buildEditPrompt({
      instruction: editInstr,
      intent: editIntent,
      hasExtraReference: hasExtraRef,
      masked: hasMask,
    })
  : "";
```

Add the upstream so tokens resolve in the preview too:

```tsx
const mentionUpstreamForEdit: MentionUpstream[] = upstream.map((u) => ({
  nodeId: u.id,
  type: u.type,
  text: "",
  fileUrl: u.fileUrl,
  fileKind: u.fileKind,
}));

const composedPrompt = editInstr.trim()
  ? buildEditPrompt({
      instruction: editInstr,
      intent: editIntent,
      hasExtraReference: hasExtraRef,
      masked: hasMask,
      upstream: mentionUpstreamForEdit,
    })
  : "";
```

Add the import at the top:

```ts
import type { MentionUpstream } from "@/lib/nodes/resolve-mention-tokens";
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd e:/CreativeOS/creativeos-mvp
npx tsc --noEmit
```

Fix any remaining type errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/nodes/image-gen-edit-panel.tsx src/components/nodes/image-gen-focus-view.tsx
git commit -m "feat: use MentionInstructionEditor in image-gen edit panel"
```

---

## Task 10: Full test run and TypeScript clean build

- [ ] **Step 1: Run all tests**

```bash
cd e:/CreativeOS/creativeos-mvp
npx vitest run
```

Expected: all tests PASS. Fix any failures before continuing.

- [ ] **Step 2: Full TypeScript check**

```bash
cd e:/CreativeOS/creativeos-mvp
npx tsc --noEmit
```

Expected: 0 errors. Fix any before continuing.

- [ ] **Step 3: Start dev server and manually verify**

```bash
cd e:/CreativeOS/creativeos-mvp
npm run dev
```

Open a canvas with a Prompt node that has an image-gen or file node connected. Open the Prompt focus view. In the instruction field:
1. Type `@` — dropdown should appear listing connected image/file nodes
2. Type part of a node name — list should filter
3. Press ↓ to highlight an item, Enter to insert — chip should appear inline
4. Click Generate — check the network tab, the compiled instruction in the request body should contain `the first image` (not the raw token)
5. Backspace on a chip — whole chip should delete atomically

Repeat for Video Prompt focus view and Image Gen edit panel.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: inline @-node mention in instruction fields (YUV-163)"
```

---

## Self-Review

**Spec coverage:**
- ✓ Token format `@[Label](nodeId)` — Task 2
- ✓ Vision positional resolution (`the first image`) — Task 2 `resolveMentionTokens`
- ✓ File text inline resolution — Task 2
- ✓ Fallback for disconnected node — Task 2 (returns display label)
- ✓ `compilePrompt` integration — Task 3
- ✓ `compileVideoPrompt` integration — Task 4
- ✓ `buildEditPrompt` integration — Task 5
- ✓ Lexical `MentionInstructionEditor` component — Task 6
- ✓ Floating dropdown on `@` — Task 6 `MentionsPlugin`
- ✓ Eligible nodes: image-gen, file, draw only — Task 6
- ✓ Prompt focus view swap — Task 7
- ✓ Video prompt focus view swap — Task 8
- ✓ Image gen edit panel swap — Task 9
- ✓ `buildEditPrompt` preview also resolves tokens (composedPrompt) — Task 9 Step 3
- ✓ Backward compatible (no-op on plain strings) — Task 2 early-exit guard

**No placeholders found.**

**Type consistency:** `MentionUpstream` defined in Task 2, imported in Tasks 3, 4, 5, 9. `UpstreamNode` from `connected-inputs-card.tsx` used as the `upstream` prop type throughout — consistent with what the focus views already have.
