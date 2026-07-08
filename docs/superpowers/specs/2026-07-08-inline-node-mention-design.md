# Inline @-Node Mention in Instruction Fields

**Feature:** YUV-163 — Can't reference specific connected nodes inline while writing a prompt
**Date:** 2026-07-08
**Scope:** Prompt node, Video Prompt node, Image Gen edit panel

---

## Problem

When writing an instruction, operators have no way to reference a specific connected node inline. Every upstream node is injected as an ambient context block — there is no mechanism to say "use *this* image as the start frame" or "take visual composition from *that* image." The instruction is free text with no connection to individual upstream nodes.

---

## Solution

Add Lexical-powered `@`-mention support to every instruction textarea. Typing `@` opens a floating dropdown listing eligible upstream nodes (image-gen and file nodes). Selecting one inserts an inline token `@[Image: Hero Shot](nodeId)`. At generation time the backend resolves each token to its positional reference (`the first image`, `the second image`) for vision attachments, or inlines extracted text for file nodes — matching the positional convention Gemini and OpenAI use for multipart image messages.

---

## Token Format

Tokens are stored as plain strings embedded in the instruction value:

```
@[Display Label](nodeId)
```

Example instruction stored in DB:
```
use @[Image: Hero Shot](abc-123) as start frame, take visual composition from @[Image: Wide Angle](def-456)
```

This format is:
- Human-readable if inspected directly
- Backward-compatible — instructions with no tokens pass through unchanged
- Carries the `nodeId` so resolution is an exact lookup, not fuzzy label matching
- Stored as-is in `paramsUsed.instruction` for version provenance

---

## Eligible Mention Targets

Only nodes that carry citable reference content are surfaced in the dropdown:

| Node type | Condition | Resolves to |
|-----------|-----------|-------------|
| `image-gen` | has a generated output URL | `the first image` / `the second image` (vision position) |
| `file` | `fileKind === "image"` | vision position ordinal |
| `file` | `fileKind === "document"` or `"text"`, has extracted text | extracted text inline |
| `draw` | has saved sketch URL | vision position ordinal |

Excluded: `script`, `shot`, `text`, `prompt`, `video-prompt` nodes — they are ambient context blocks, not point references.

---

## Backend: Token Resolution

### New file: `src/lib/nodes/resolve-mention-tokens.ts`

A pure function with no side effects. Called inside each compile function before the instruction block is built.

```ts
export type MentionUpstream = {
  nodeId: string;
  type: string;
  text: string;        // extracted text (file nodes)
  fileUrl?: string;
  fileKind?: string;
  useLlm?: boolean;
};

export function resolveMentionTokens(
  instruction: string,
  upstream: MentionUpstream[],
): string
```

**Algorithm:**

1. **Build vision order map** — walk `upstream` in array order, counting nodes that will become vision attachments (same predicate as `isVisionAttachment()` in `compose-message.ts`). Assign each a 1-based ordinal. Store as `Map<nodeId, number>`.

2. **Ordinal → English** — `1 → "the first image"`, `2 → "the second image"`, `3 → "the third image"`, `4+ → "image N"`.

3. **Regex scan** — find all `@\[([^\]]+)\]\(([^)]+)\)` tokens. For each:
   - Look up `nodeId` in vision order map → replace with ordinal string
   - Else look up `nodeId` in upstream, find file node with non-empty `.text` → replace with extracted text inline
   - Else (node disconnected or no content) → replace with the display label as plain text (graceful fallback, never breaks generation)

4. Return the resolved instruction string.

### Integration points

**`src/lib/nodes/prompt.ts` — `compilePrompt()`**

The `upstream` parameter already carries `{ nodeId, type, text, fileUrl, fileKind, useLlm }` (matching `MentionUpstream`). Call `resolveMentionTokens(effectiveInstruction, upstream)` before building the instruction block.

**`src/lib/nodes/video-prompt.ts` — `compileVideoPrompt()`**

Same pattern. The upstream type here already includes `fileUrl` / `fileKind` via `mapUpstreamForVideo()`.

**`src/lib/image-gen/edit-prompt.ts` — `buildEditPrompt()`**

The `instruction` param is the operator's free-text edit command (the `finalPrompt` field). Accept an optional `upstream?: MentionUpstream[]` param and resolve tokens before template construction. Callers that don't pass upstream get the no-op path.

No changes to `buildUserContent()` or `resolvePromptInputs()` — vision ordering is unchanged.

---

## Frontend: `MentionInstructionEditor` Component

### New file: `src/components/nodes/mention-instruction-editor.tsx`

Wraps a Lexical editor configured with a custom `MentionNode` and a `MentionsPlugin`.

```ts
type MentionInstructionEditorProps = {
  value: string;              // @[Label](nodeId) serialized string
  onChange: (v: string) => void;
  placeholder: string;
  upstream: UpstreamNode[];   // the already-available upstream list from the focus view
  className?: string;
  disabled?: boolean;
};
```

**Lexical setup:**
- `LexicalComposer` with a minimal theme (matches existing textarea visual style)
- `PlainTextPlugin` as base (not rich text — operators don't need bold/italic)
- Custom `MentionNode extends DecoratorNode` — renders as an inline purple chip with a `ImageIcon` or `Paperclip` prefix (Lucide, matching existing node icons)
- `MentionsPlugin` — triggers on `@`, shows a floating `Command` dropdown (shadcn `Command` + `Popover`, already in project) filtered by typed text
- `OnChangePlugin` — on every editor state change, serializes the Lexical state to the `@[Label](nodeId)` string and calls `onChange`
- `InitialValuePlugin` — seeds the editor from the `value` prop on mount / when `value` changes externally (mirrors the existing `instructionDraft` seed logic)

**Dropdown items** — filtered from `upstream` to only eligible nodes (image-gen, file, draw). Each item shows `NodeIcon` + `Type: Label`. Keyboard navigable (↑↓ Enter Escape).

**Token chip visual** — inline `<span>` with `bg-primary/10 text-primary rounded px-1.5 text-xs` — consistent with existing role/LLM badge style in `connected-inputs-card.tsx`. Atomic deletion (backspace removes whole token).

**Serialization format:** `exportText()` on `MentionNode` returns `@[Label](nodeId)`. `importJSON()` parses the stored string back into `MentionNode` instances on mount.

### Swap locations

| File | Current | Replacement |
|------|---------|-------------|
| `prompt-focus-view.tsx` | `<textarea value={instructionDraft} …>` | `<MentionInstructionEditor value={instructionDraft} upstream={upstream} …>` |
| `video-prompt-focus-view.tsx` | `<textarea value={instructionDraft} …>` | `<MentionInstructionEditor value={instructionDraft} upstream={upstream} …>` |
| `image-gen-focus-view.tsx` | `<Textarea value={instruction} …>` in edit panel | `<MentionInstructionEditor value={instruction} upstream={upstream} …>` where `upstream` is the connected image nodes already available in the focus view |

The `onChange` handler in each case is unchanged — it still calls `onPatch({ instruction: v })` or `onInstructionChange(v)` as before.

---

## New Dependencies

```
lexical
@lexical/react
```

No other new dependencies. The dropdown UI reuses shadcn `Command` + `Popover` already in the project.

---

## Backward Compatibility

- Instructions with no `@` tokens → `resolveMentionTokens()` is a no-op, returns the string unchanged
- Old `<textarea>` value strings stored in DB → valid input to the Lexical editor (parsed as plain text, no tokens)
- `compilePrompt()` / `compileVideoPrompt()` signatures unchanged — callers unaffected

---

## Files Summary

| File | Status |
|------|--------|
| `src/components/nodes/mention-instruction-editor.tsx` | New |
| `src/lib/nodes/resolve-mention-tokens.ts` | New |
| `src/lib/nodes/prompt.ts` | Modified — add `resolveMentionTokens()` call |
| `src/lib/nodes/video-prompt.ts` | Modified — add `resolveMentionTokens()` call |
| `src/lib/image-gen/edit-prompt.ts` | Modified — accept + resolve upstream tokens |
| `src/components/nodes/prompt-focus-view.tsx` | Modified — swap textarea |
| `src/components/nodes/video-prompt-focus-view.tsx` | Modified — swap textarea |
| `src/components/nodes/image-gen-focus-view.tsx` | Modified — swap textarea in edit panel |
| `package.json` | Modified — add lexical + @lexical/react |

---

## Out of Scope

- Script, Shot, Text node context is not mentionable (ambient blocks only)
- No @-mention support in the KB instruction fields or system prompts
- No mention support in the node title / editable-field
