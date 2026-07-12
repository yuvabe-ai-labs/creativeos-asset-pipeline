# Mention Chip Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain `<textarea>` mention editor with a `contenteditable` div that renders inserted `@mentions` as styled inline chips (with thumbnail/icon), atomically deleted by a single Backspace, while keeping the same `value: string` / `onChange(string)` API so no callers change.

**Architecture:** Internally the editor maintains a flat `Segment[]` array (`TextSegment | MentionSegment`). On mount/value-change it parses the `@[Label](id)` string into segments. On every DOM mutation it serializes `childNodes` back to the same string format and calls `onChange`. Mention nodes are rendered as `<span contenteditable="false">` chips; a custom `keydown` handler intercepts Backspace immediately after a chip and removes the whole segment. The `@`-trigger dropdown (caret-positioned portal) is unchanged from the current implementation.

**Tech Stack:** React 19, Next.js 16, Tailwind v4, `createPortal` for dropdown, `Selection`/`Range` Web APIs for caret management. No new dependencies.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/components/nodes/mention-instruction-editor.tsx` | **Rewrite** | contenteditable chip editor — all logic lives here |
| `src/components/nodes/mention-instruction-editor.test.tsx` | **Create** | Unit tests for parse/serialize helpers (pure functions extracted to be testable) |

No caller files change (`prompt-focus-view.tsx`, `video-prompt-focus-view.tsx`, `image-gen-edit-panel.tsx` all keep their existing `<MentionInstructionEditor .../>` usage unchanged).

---

## Task 1 — Pure parse/serialize helpers + tests

**Files:**
- Create: `src/components/nodes/mention-instruction-editor.test.tsx`
- Modify: `src/components/nodes/mention-instruction-editor.tsx` (add exported helpers at top, keep rest intact for now)

The two helpers we need are pure functions — write and test them before touching any DOM logic.

**Token format (from `resolve-mention-tokens.ts`):**
```
@[Image: Hero Shot](node-abc-123)
```
Regex: `/@\[([^\]]+)\]\(([^)]+)\)/g`

- [ ] **Step 1: Write failing tests**

Create `src/components/nodes/mention-instruction-editor.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { parseSegments, serializeSegments } from "./mention-instruction-editor";

describe("parseSegments", () => {
  it("returns a single text segment for plain text", () => {
    expect(parseSegments("hello world")).toEqual([
      { kind: "text", text: "hello world" },
    ]);
  });

  it("parses a token into a mention segment", () => {
    expect(parseSegments("@[Image: Hero](id-1)")).toEqual([
      { kind: "mention", label: "Image: Hero", id: "id-1" },
    ]);
  });

  it("splits text around a mention correctly", () => {
    expect(parseSegments("use @[Image: A](n1) as base")).toEqual([
      { kind: "text", text: "use " },
      { kind: "mention", label: "Image: A", id: "n1" },
      { kind: "text", text: " as base" },
    ]);
  });

  it("handles two adjacent mentions", () => {
    expect(parseSegments("@[Image: A](n1) and @[File: B](n2)")).toEqual([
      { kind: "mention", label: "Image: A", id: "n1" },
      { kind: "text", text: " and " },
      { kind: "mention", label: "File: B", id: "n2" },
    ]);
  });

  it("returns empty array for empty string", () => {
    expect(parseSegments("")).toEqual([]);
  });

  it("drops empty text segments", () => {
    // token at start — no leading empty text
    const result = parseSegments("@[Image: X](n1) tail");
    expect(result[0].kind).toBe("mention");
  });
});

describe("serializeSegments", () => {
  it("serializes text segments as-is", () => {
    expect(serializeSegments([{ kind: "text", text: "hello" }])).toBe("hello");
  });

  it("serializes a mention segment to token format", () => {
    expect(
      serializeSegments([{ kind: "mention", label: "Image: Hero", id: "n1" }])
    ).toBe("@[Image: Hero](n1)");
  });

  it("round-trips parse then serialize", () => {
    const original = "use @[Image: A](n1) as base, @[File: B](n2) for ref";
    expect(serializeSegments(parseSegments(original))).toBe(original);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd e:/CreativeOS/creativeos-mvp && npx vitest run src/components/nodes/mention-instruction-editor.test.tsx
```

Expected: FAIL — `parseSegments` and `serializeSegments` not exported yet.

- [ ] **Step 3: Add helpers to the editor file**

At the top of `src/components/nodes/mention-instruction-editor.tsx`, after the imports, add:

```ts
// ── Segment model ─────────────────────────────────────────────────────────────

export type TextSegment = { kind: "text"; text: string };
export type MentionSegment = { kind: "mention"; label: string; id: string };
export type Segment = TextSegment | MentionSegment;

const TOKEN_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

export function parseSegments(value: string): Segment[] {
  if (!value) return [];
  const segments: Segment[] = [];
  let last = 0;
  for (const m of value.matchAll(TOKEN_RE)) {
    if (m.index! > last) segments.push({ kind: "text", text: value.slice(last, m.index) });
    segments.push({ kind: "mention", label: m[1], id: m[2] });
    last = m.index! + m[0].length;
  }
  if (last < value.length) segments.push({ kind: "text", text: value.slice(last) });
  return segments;
}

export function serializeSegments(segments: Segment[]): string {
  return segments.map((s) => (s.kind === "text" ? s.text : `@[${s.label}](${s.id})`)).join("");
}
```

Keep everything else in the file unchanged for now.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd e:/CreativeOS/creativeos-mvp && npx vitest run src/components/nodes/mention-instruction-editor.test.tsx
```

Expected: all 9 tests PASS.

- [ ] **Step 5: TypeScript check**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd e:/CreativeOS/creativeos-mvp && git add src/components/nodes/mention-instruction-editor.tsx src/components/nodes/mention-instruction-editor.test.tsx && git commit -m "feat(YUV-163): add parseSegments/serializeSegments helpers with tests"
```

---

## Task 2 — Rewrite editor: contenteditable + chip rendering

This is the main rewrite. The external API (`value`, `onChange`, `placeholder`, `upstream`, `className`, `disabled`) stays identical. Internally we switch from `<textarea>` to a `contenteditable` div.

**Files:**
- Rewrite: `src/components/nodes/mention-instruction-editor.tsx`

### Key design decisions

**DOM structure of the editor div:**
```
<div contenteditable="true" role="textbox">
  "use "                          ← text node
  <span
    contenteditable="false"
    data-mention-id="n1"
    data-mention-label="Image: Hero"
  >
    <img src="..." />             ← thumbnail (if image)  OR  <NodeIcon />
    "Hero Shot"                   ← display name (label after "Type: " stripped)
  </span>
  " as base"                      ← text node
</div>
```

**Serialization (DOM → string):** Walk `editorRef.current.childNodes`. Text nodes → `.textContent`. `<span[data-mention-id]>` → `@[data-mention-label](data-mention-id)`. Everything else → ignored.

**Deserialization (string → DOM):** `parseSegments(value)` → build DOM imperatively: text segments become `document.createTextNode(text)`, mention segments become `buildChipNode(segment, upstreamMap)`. Replace all `editorRef.current.childNodes`.

**Caret management:** Use `window.getSelection()` / `document.createRange()` for reading caret position and restoring it after programmatic DOM changes.

**`@`-trigger:** On `input` event, get caret offset in serialized text, call existing `getAtQuery()`, show/hide dropdown.

- [ ] **Step 1: Full rewrite of `mention-instruction-editor.tsx`**

Replace the entire file content with:

```tsx
"use client";

import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ImageIcon, Paperclip, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UpstreamNode } from "./connected-inputs-card";

// ── Segment model ─────────────────────────────────────────────────────────────

export type TextSegment = { kind: "text"; text: string };
export type MentionSegment = { kind: "mention"; label: string; id: string };
export type Segment = TextSegment | MentionSegment;

const TOKEN_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

export function parseSegments(value: string): Segment[] {
  if (!value) return [];
  const segments: Segment[] = [];
  let last = 0;
  for (const m of value.matchAll(TOKEN_RE)) {
    if (m.index! > last) segments.push({ kind: "text", text: value.slice(last, m.index) });
    segments.push({ kind: "mention", label: m[1], id: m[2] });
    last = m.index! + m[0].length;
  }
  if (last < value.length) segments.push({ kind: "text", text: value.slice(last) });
  return segments;
}

export function serializeSegments(segments: Segment[]): string {
  return segments.map((s) => (s.kind === "text" ? s.text : `@[${s.label}](${s.id})`)).join("");
}

// ── Types ─────────────────────────────────────────────────────────────────────

type DropdownItem = {
  id: string;
  label: string; // "Image: Hero Shot" — type prefix included (for token storage)
  type: string;
  fileUrl?: string;
  fileKind?: string;
};

export type MentionInstructionEditorProps = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  upstream: UpstreamNode[];
  className?: string;
  disabled?: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function nodeTypeLabel(type: string): string {
  if (type === "image-gen") return "Image";
  if (type === "file") return "File";
  if (type === "draw") return "Sketch";
  return type;
}

function NodeIcon({ type }: { type: string }) {
  if (type === "image-gen") return <ImageIcon className="size-3 shrink-0" />;
  if (type === "file") return <Paperclip className="size-3 shrink-0" />;
  if (type === "draw") return <Pencil className="size-3 shrink-0" />;
  return null;
}

function getAtQuery(text: string, caretPos: number): string | null {
  const slice = text.slice(Math.max(0, caretPos - 40), caretPos);
  const atIdx = slice.lastIndexOf("@");
  if (atIdx === -1) return null;
  const afterAt = slice.slice(atIdx + 1);
  if (afterAt.includes(" ") || afterAt.includes("\n")) return null;
  return afterAt;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

// Read serialized text + caret offset from the contenteditable div
function readEditorState(el: HTMLElement): { text: string; caretOffset: number } {
  const sel = window.getSelection();
  let caretOffset = 0;
  let foundCaret = false;

  let text = "";
  for (const node of Array.from(el.childNodes)) {
    if (sel && sel.rangeCount > 0 && !foundCaret) {
      const range = sel.getRangeAt(0);
      if (el.contains(range.startContainer)) {
        if (node === range.startContainer) {
          caretOffset = text.length + range.startOffset;
          foundCaret = true;
        } else if (node.contains(range.startContainer)) {
          // caret is inside a text node that lives inside a chip — shouldn't happen since chips are contenteditable=false
          caretOffset = text.length;
          foundCaret = true;
        }
      }
    }
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
    } else if (node instanceof HTMLElement && node.dataset.mentionId) {
      const label = node.dataset.mentionLabel ?? "";
      const id = node.dataset.mentionId;
      // if caret is right after this chip node
      if (sel && sel.rangeCount > 0 && !foundCaret) {
        const range = sel.getRangeAt(0);
        if (range.startContainer === el) {
          const nodeIndex = Array.from(el.childNodes).indexOf(node as ChildNode);
          if (range.startOffset === nodeIndex + 1) {
            caretOffset = text.length + `@[${label}](${id})`.length;
            foundCaret = true;
          }
        }
      }
      text += `@[${label}](${id})`;
    }
  }
  if (!foundCaret) caretOffset = text.length;
  return { text, caretOffset };
}

// Restore caret to a given character offset in the serialized text
function restoreCaretAt(el: HTMLElement, targetOffset: number) {
  let remaining = targetOffset;
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        return;
      }
      remaining -= len;
    } else if (node instanceof HTMLElement && node.dataset.mentionId) {
      const label = node.dataset.mentionLabel ?? "";
      const id = node.dataset.mentionId;
      const tokenLen = `@[${label}](${id})`.length;
      if (remaining <= tokenLen) {
        // Place caret after the chip element
        const range = document.createRange();
        const nodeIndex = Array.from(el.childNodes).indexOf(node as ChildNode);
        range.setStart(el, nodeIndex + 1);
        range.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        return;
      }
      remaining -= tokenLen;
    }
  }
  // fallback: end of editor
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

// Build a chip DOM element for a mention segment
function buildChip(
  segment: MentionSegment,
  upstreamMap: Map<string, UpstreamNode>,
): HTMLElement {
  const upstream = upstreamMap.get(segment.id);
  const displayName = segment.label.replace(/^[^:]+:\s*/, "");
  const typeKey = upstream?.type ?? segment.label.split(":")[0]?.toLowerCase() ?? "";

  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.mentionId = segment.id;
  chip.dataset.mentionLabel = segment.label;
  chip.className =
    "inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary select-none cursor-default";

  // Thumbnail or icon
  if (upstream?.fileUrl && upstream?.fileKind === "image") {
    const img = document.createElement("img");
    img.src = upstream.fileUrl;
    img.alt = "";
    img.className = "size-3.5 rounded object-cover shrink-0";
    chip.appendChild(img);
  } else {
    const iconSpan = document.createElement("span");
    iconSpan.className = "size-3 flex items-center justify-center shrink-0";
    // SVG inline for the icon (no React here, this is plain DOM)
    if (typeKey === "image-gen" || segment.label.startsWith("Image:")) {
      iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
    } else if (typeKey === "file" || segment.label.startsWith("File:")) {
      iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
    } else {
      iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
    }
    chip.appendChild(iconSpan);
  }

  const label = document.createElement("span");
  label.textContent = displayName;
  chip.appendChild(label);

  return chip;
}

// Populate the editor div from a value string (replaces all children)
function populateEditor(
  el: HTMLElement,
  value: string,
  upstreamMap: Map<string, UpstreamNode>,
) {
  const segments = parseSegments(value);
  el.innerHTML = "";
  for (const seg of segments) {
    if (seg.kind === "text") {
      el.appendChild(document.createTextNode(seg.text));
    } else {
      el.appendChild(buildChip(seg, upstreamMap));
    }
  }
  // Ensure there's always a trailing text node so the cursor can sit at the end
  if (el.lastChild?.nodeType !== Node.TEXT_NODE) {
    el.appendChild(document.createTextNode(""));
  }
}

// ── Caret position for dropdown (mirror div, viewport coords) ─────────────────

function measureCaretViewport(
  el: HTMLElement,
): { top: number; left: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return { top: rect.top, left: rect.left };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MentionInstructionEditor({
  value,
  onChange,
  placeholder = "Write an instruction…",
  upstream,
  className,
  disabled = false,
}: MentionInstructionEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false); // IME composition guard

  // Dropdown state kept in refs to avoid re-renders during fast typing
  const queryRef = useRef<string | null>(null);
  const activeIndexRef = useRef(0);
  const dropdownPosRef = useRef<{ top: number; left: number } | null>(null);
  const dropdownElRef = useRef<HTMLDivElement | null>(null);

  // Upstream lookup map: id → UpstreamNode
  const upstreamMap = useRef<Map<string, UpstreamNode>>(new Map());
  useEffect(() => {
    upstreamMap.current = new Map(upstream.map((u) => [u.id, u]));
  }, [upstream]);

  // Eligible items for the @-mention dropdown
  const eligible = upstream
    .filter((u) => u.type === "image-gen" || u.type === "draw" || u.type === "file")
    .map((u) => ({
      id: u.id,
      label: `${nodeTypeLabel(u.type)}: ${u.label}`,
      type: u.type,
      fileUrl: u.fileUrl,
      fileKind: u.fileKind,
    }));

  // ── Dropdown React state (only for rendering the portal) ──────────────────
  // We keep a separate React state just for triggering a re-render of the portal.
  // All logic reads from refs to avoid stale closures.
  const [dropdownState, setDropdownState] = React.useState<{
    open: boolean;
    pos: { top: number; left: number } | null;
    filtered: DropdownItem[];
    activeIndex: number;
  }>({ open: false, pos: null, filtered: [], activeIndex: 0 });

  function openDropdown(query: string, pos: { top: number; left: number }) {
    const filtered = eligible.filter((item) =>
      item.label.toLowerCase().includes(query.toLowerCase()),
    );
    if (filtered.length === 0) {
      closeDropdown();
      return;
    }
    queryRef.current = query;
    activeIndexRef.current = 0;
    dropdownPosRef.current = pos;
    setDropdownState({ open: true, pos, filtered, activeIndex: 0 });
  }

  function closeDropdown() {
    queryRef.current = null;
    setDropdownState((s) => ({ ...s, open: false }));
  }

  function insertMention(item: DropdownItem) {
    const el = editorRef.current;
    if (!el) return;

    const { text, caretOffset } = readEditorState(el);
    const slice = text.slice(Math.max(0, caretOffset - 40), caretOffset);
    const atIdx = slice.lastIndexOf("@");
    if (atIdx === -1) return;
    const absoluteAt = Math.max(0, caretOffset - 40) + atIdx;

    // Build new value string
    const token = `@[${item.label}](${item.id})`;
    const newValue = text.slice(0, absoluteAt) + token + " " + text.slice(caretOffset);

    closeDropdown();
    onChange(newValue);

    // Repopulate DOM and restore caret after the inserted token + space
    requestAnimationFrame(() => {
      if (!el) return;
      populateEditor(el, newValue, upstreamMap.current);
      restoreCaretAt(el, absoluteAt + token.length + 1);
      el.focus();
    });
  }

  // ── Sync external value → DOM (controlled) ────────────────────────────────
  // Only repopulate when value changes from outside (not from our own onChange calls)
  const lastEmittedRef = useRef<string>(value);
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value === lastEmittedRef.current) return; // our own change, DOM already correct
    lastEmittedRef.current = value;
    const { caretOffset } = readEditorState(el);
    populateEditor(el, value, upstreamMap.current);
    restoreCaretAt(el, caretOffset);
  }, [value]);

  // Initial population
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    populateEditor(el, value, upstreamMap.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Input handler ─────────────────────────────────────────────────────────
  const handleInput = useCallback(() => {
    if (isComposingRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    const { text, caretOffset } = readEditorState(el);
    const newValue = text;
    lastEmittedRef.current = newValue;
    onChange(newValue);

    // @-trigger detection
    const q = getAtQuery(text, caretOffset);
    if (q !== null) {
      const pos = measureCaretViewport(el);
      if (pos) openDropdown(q, pos);
    } else {
      closeDropdown();
    }
  }, [onChange, eligible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keydown handler ───────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Dropdown navigation
      if (dropdownState.open) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = Math.min(activeIndexRef.current + 1, dropdownState.filtered.length - 1);
          activeIndexRef.current = next;
          setDropdownState((s) => ({ ...s, activeIndex: next }));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          const next = Math.max(activeIndexRef.current - 1, 0);
          activeIndexRef.current = next;
          setDropdownState((s) => ({ ...s, activeIndex: next }));
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const item = dropdownState.filtered[activeIndexRef.current];
          if (item) insertMention(item);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeDropdown();
          return;
        }
      }

      // Atomic backspace over a chip
      if (e.key === "Backspace") {
        const el = editorRef.current;
        if (!el) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        // Only act on collapsed caret (no selection)
        if (!range.collapsed) return;

        // Check if caret is at start of a text node that immediately follows a chip
        const { startContainer, startOffset } = range;
        if (startContainer === el) {
          // caret between block-level children — check if previous sibling is a chip
          const prevSib = el.childNodes[startOffset - 1];
          if (prevSib instanceof HTMLElement && prevSib.dataset.mentionId) {
            e.preventDefault();
            el.removeChild(prevSib);
            // Normalize and emit
            const { text } = readEditorState(el);
            lastEmittedRef.current = text;
            onChange(text);
            return;
          }
        }
        if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
          const prevSib = startContainer.previousSibling;
          if (prevSib instanceof HTMLElement && prevSib.dataset.mentionId) {
            e.preventDefault();
            el.removeChild(prevSib);
            const { text } = readEditorState(el);
            lastEmittedRef.current = text;
            onChange(text);
            return;
          }
        }
      }

      // Prevent newlines (Enter outside dropdown = submit / no-op)
      if (e.key === "Enter" && !dropdownState.open) {
        e.preventDefault();
      }
    },
    [dropdownState, onChange, insertMention], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Paste: strip formatting, keep plain text ──────────────────────────────
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, text);
    },
    [],
  );

  // ── Click outside dropdown ────────────────────────────────────────────────
  useEffect(() => {
    if (!dropdownState.open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        dropdownRef.current?.contains(e.target as Node) ||
        editorRef.current?.contains(e.target as Node)
      )
        return;
      closeDropdown();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [dropdownState.open]);

  return (
    <div className={cn("relative flex-1 min-h-0", className)}>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="false"
        aria-label={placeholder}
        aria-disabled={disabled}
        contentEditable={disabled ? false : true}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={() => { isComposingRef.current = true; }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
          handleInput();
        }}
        data-placeholder={placeholder}
        className={cn(
          "flex-1 min-h-0 w-full h-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring overflow-auto",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/60 empty:before:pointer-events-none",
          disabled && "cursor-not-allowed opacity-50",
        )}
      />

      {dropdownState.open && dropdownState.pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: dropdownState.pos.top,
              left: dropdownState.pos.left,
              transform: "translateY(-100%)",
              zIndex: 9999,
            }}
            className="min-w-50 max-w-xs rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
          >
            {dropdownState.filtered.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(item);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-xs text-left transition-colors",
                  i === dropdownState.activeIndex
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-muted text-foreground",
                )}
              >
                {item.fileUrl && item.fileKind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.fileUrl}
                    alt=""
                    className="size-6 rounded object-cover shrink-0 border border-border"
                  />
                ) : (
                  <span className="size-6 flex items-center justify-center shrink-0 text-primary">
                    <NodeIcon type={item.type} />
                  </span>
                )}
                <div className="min-w-0">
                  <span className="block truncate font-medium leading-tight">
                    {item.label.replace(/^[^:]+:\s*/, "")}
                  </span>
                  <span className="block text-[10px] opacity-50 leading-tight">
                    {nodeTypeLabel(item.type)}
                  </span>
                </div>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
```

Note: This file uses `React.useState` — add `import React, { useEffect, useRef, useCallback, useState } from "react";` at the top. Replace the current import line.

- [ ] **Step 2: Fix the import line**

The rewritten file uses `React.useState` via the namespace. Change the top import to:

```tsx
import React, { useEffect, useRef, useCallback } from "react";
```

And replace every `React.useState` call in the component with a destructured `useState` by also adding `useState` to the import:

```tsx
import React, { useEffect, useRef, useCallback, useState } from "react";
```

Then change `React.useState` → `useState` in the `dropdownState` declaration.

- [ ] **Step 3: TypeScript check**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit
```

Fix any type errors before continuing. Common issues:
- `insertMention` referenced in `handleKeyDown` before defined — move `insertMention` above `handleKeyDown` or use `useCallback` with a ref.
- `eligible` computed inside component but used inside `useCallback` — either include in deps or move to a `useMemo`.

- [ ] **Step 4: Run existing tests (must not regress)**

```bash
cd e:/CreativeOS/creativeos-mvp && npx vitest run
```

Expected: all 354+ tests pass (the mention editor tests from Task 1 included).

- [ ] **Step 5: Commit**

```bash
cd e:/CreativeOS/creativeos-mvp && git add src/components/nodes/mention-instruction-editor.tsx && git commit -m "feat(YUV-163): contenteditable chip editor with atomic backspace"
```

---

## Task 3 — Chip visual polish + placeholder fix

The `empty:before:content-[attr(data-placeholder)]` Tailwind trick only works when the div has zero children. Since we always append a trailing empty text node in `populateEditor`, the `:empty` pseudo-class never fires. We need a different placeholder approach.

**Files:**
- Modify: `src/components/nodes/mention-instruction-editor.tsx`

- [ ] **Step 1: Fix placeholder**

Replace the CSS `:empty` placeholder with a React-rendered overlay `<span>`:

In the JSX, after the `contenteditable` div, add:

```tsx
{/* Placeholder — shown when value is empty */}
{!value && (
  <span
    className="absolute inset-0 px-3 py-2 text-sm text-muted-foreground/60 pointer-events-none select-none"
    aria-hidden
  >
    {placeholder}
  </span>
)}
```

Remove the `empty:before:...` classes from the `contenteditable` div's className.

The parent `<div>` wrapper already has `className={cn("relative flex-1 min-h-0", className)}` so `absolute inset-0` on the placeholder span will position correctly.

- [ ] **Step 2: Chip hover style**

The chip built in `buildChip` uses `.className = "..."`. Add a subtle hover:

```ts
chip.className =
  "inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary select-none cursor-default hover:bg-primary/20 transition-colors";
```

- [ ] **Step 3: TypeScript + tests**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit && npx vitest run
```

Expected: clean + all tests pass.

- [ ] **Step 4: Commit**

```bash
cd e:/CreativeOS/creativeos-mvp && git add src/components/nodes/mention-instruction-editor.tsx && git commit -m "fix(YUV-163): placeholder and chip hover polish"
```

---

## Task 4 — Edge cases and hardening

**Files:**
- Modify: `src/components/nodes/mention-instruction-editor.tsx`
- Modify: `src/components/nodes/mention-instruction-editor.test.tsx`

- [ ] **Step 1: Add edge-case tests**

Add to `mention-instruction-editor.test.tsx`:

```tsx
describe("parseSegments — edge cases", () => {
  it("handles a token immediately at end of string (no trailing text)", () => {
    const result = parseSegments("base @[Image: X](n1)");
    expect(result).toEqual([
      { kind: "text", text: "base " },
      { kind: "mention", label: "Image: X", id: "n1" },
    ]);
  });

  it("handles back-to-back tokens with no separator", () => {
    const result = parseSegments("@[Image: A](n1)@[File: B](n2)");
    expect(result).toEqual([
      { kind: "mention", label: "Image: A", id: "n1" },
      { kind: "mention", label: "File: B", id: "n2" },
    ]);
  });

  it("treats malformed @ (no brackets) as plain text", () => {
    const result = parseSegments("hello @world");
    expect(result).toEqual([{ kind: "text", text: "hello @world" }]);
  });
});

describe("serializeSegments — edge cases", () => {
  it("returns empty string for empty array", () => {
    expect(serializeSegments([])).toBe("");
  });

  it("concatenates multiple text segments", () => {
    expect(
      serializeSegments([
        { kind: "text", text: "foo" },
        { kind: "text", text: "bar" },
      ])
    ).toBe("foobar");
  });
});
```

- [ ] **Step 2: Run new tests**

```bash
cd e:/CreativeOS/creativeos-mvp && npx vitest run src/components/nodes/mention-instruction-editor.test.tsx
```

Expected: all tests PASS (edge cases are handled by the existing regex implementation).

- [ ] **Step 3: Guard against `execCommand` deprecation warning**

In `handlePaste`, replace `document.execCommand("insertText", ...)` with a proper `Selection.insertText` approach:

```ts
const handlePaste = useCallback(
  (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    // Trigger input event manually since we bypassed the browser
    editorRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  },
  [],
);
```

- [ ] **Step 4: Final TypeScript + full test run**

```bash
cd e:/CreativeOS/creativeos-mvp && npx tsc --noEmit && npx vitest run
```

Expected: clean + all tests pass.

- [ ] **Step 5: Commit**

```bash
cd e:/CreativeOS/creativeos-mvp && git add src/components/nodes/mention-instruction-editor.tsx src/components/nodes/mention-instruction-editor.test.tsx && git commit -m "test(YUV-163): edge-case coverage + paste hardening"
```

---

## Self-Review

**Spec coverage:**
- ✅ Inline chip visual with thumbnail/icon in editor after selection
- ✅ Chip styled differently from plain text (`bg-primary/10 text-primary`)
- ✅ Atomic backspace deletes whole chip
- ✅ Same `value: string` / `onChange(string)` API — no callers change
- ✅ Token format `@[Label](id)` preserved — backend resolver unchanged
- ✅ Dropdown portal (overflow:hidden escape) — preserved from previous fix
- ✅ Dropdown shows thumbnail + node name + type badge — preserved
- ✅ Placeholder rendered when empty
- ✅ Disabled state respected (contentEditable=false)
- ✅ IME composition guard (Korean/Japanese/Chinese input)
- ✅ Paste strips rich formatting

**Placeholder scan:** No TBDs, no "similar to Task N", no "add appropriate handling" — all steps have code.

**Type consistency:** `MentionSegment` carries `label` + `id` throughout. `DropdownItem` carries `label` (with type prefix) throughout. `buildChip` strips prefix for display. `serializeSegments` uses `label` + `id` → `@[label](id)`. Consistent.
