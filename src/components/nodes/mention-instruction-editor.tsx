"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { ImageIcon, Paperclip, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  label: string;
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

function readEditorState(el: HTMLElement): { text: string; caretOffset: number } {
  const sel = window.getSelection();
  let caretOffset = 0;
  let foundCaret = false;
  let text = "";

  const childNodes = Array.from(el.childNodes);
  for (const node of childNodes) {
    // Check caret position before processing this node
    if (sel && sel.rangeCount > 0 && !foundCaret) {
      const range = sel.getRangeAt(0);
      if (node === range.startContainer) {
        caretOffset = text.length + range.startOffset;
        foundCaret = true;
      } else if (node.contains && node.contains(range.startContainer)) {
        caretOffset = text.length;
        foundCaret = true;
      }
    }

    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? "";
    } else if (node instanceof HTMLElement && node.dataset.mentionId) {
      const label = node.dataset.mentionLabel ?? "";
      const id = node.dataset.mentionId;
      // Check if caret is positioned after this chip (startOffset = nodeIndex + 1 in parent)
      if (sel && sel.rangeCount > 0 && !foundCaret) {
        const range = sel.getRangeAt(0);
        if (range.startContainer === el) {
          const nodeIndex = childNodes.indexOf(node as ChildNode);
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
      if (remaining < tokenLen) {
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
  // Fallback: end of editor
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
}

function buildChip(segment: MentionSegment, upstreamMap: Map<string, UpstreamNode>): HTMLElement {
  const upstream = upstreamMap.get(segment.id);
  const displayName = segment.label.replace(/^[^:]+:\s*/, "");
  const typeKey = upstream?.type ?? "";

  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.mentionId = segment.id;
  chip.dataset.mentionLabel = segment.label;
  chip.className =
    "inline-flex items-center gap-1 align-middle mx-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary select-none cursor-default hover:bg-primary/20 transition-colors";

  if (upstream?.fileUrl && upstream?.fileKind === "image") {
    const img = document.createElement("img");
    img.src = upstream.fileUrl;
    img.alt = "";
    img.className = "size-3.5 rounded object-cover shrink-0";
    chip.appendChild(img);
  } else {
    const iconSpan = document.createElement("span");
    iconSpan.className = "size-3 flex items-center justify-center shrink-0";
    if (typeKey === "image-gen" || segment.label.startsWith("Image:")) {
      iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
    } else if (typeKey === "file" || segment.label.startsWith("File:")) {
      iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
    } else {
      iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
    }
    chip.appendChild(iconSpan);
  }

  const labelSpan = document.createElement("span");
  labelSpan.textContent = displayName;
  chip.appendChild(labelSpan);

  return chip;
}

function populateEditor(el: HTMLElement, value: string, upstreamMap: Map<string, UpstreamNode>) {
  const segments = parseSegments(value);
  el.innerHTML = "";
  for (const seg of segments) {
    if (seg.kind === "text") {
      el.appendChild(document.createTextNode(seg.text));
    } else {
      el.appendChild(buildChip(seg, upstreamMap));
    }
  }
  // Always ensure trailing text node so caret can sit at end
  if (el.lastChild?.nodeType !== Node.TEXT_NODE) {
    el.appendChild(document.createTextNode(""));
  }
}

function measureCaretViewport(): { top: number; left: number } | null {
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
  const isComposingRef = useRef(false);
  const lastEmittedRef = useRef<string>(value);
  const activeIndexRef = useRef(0);
  const upstreamMapRef = useRef<Map<string, UpstreamNode>>(new Map());

  const [dropdownState, setDropdownState] = useState<{
    open: boolean;
    pos: { top: number; left: number } | null;
    filtered: DropdownItem[];
    activeIndex: number;
  }>({ open: false, pos: null, filtered: [], activeIndex: 0 });

  // Keep upstream map in sync
  useEffect(() => {
    upstreamMapRef.current = new Map(upstream.map((u) => [u.id, u]));
  }, [upstream]);

  const eligible = upstream
    .filter((u) => u.type === "image-gen" || u.type === "draw" || u.type === "file")
    .map((u) => ({
      id: u.id,
      label: `${nodeTypeLabel(u.type)}: ${u.label}`,
      type: u.type,
      fileUrl: u.fileUrl,
      fileKind: u.fileKind,
    }));

  // Initial population
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    populateEditor(el, value, upstreamMapRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (not triggered by our own onChange)
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    const { caretOffset } = readEditorState(el);
    populateEditor(el, value, upstreamMapRef.current);
    restoreCaretAt(el, caretOffset);
  }, [value]);

  function closeDropdown() {
    setDropdownState((s) => ({ ...s, open: false }));
  }

  function openDropdown(query: string, pos: { top: number; left: number }) {
    const filtered = eligible.filter((item) =>
      item.label.toLowerCase().includes(query.toLowerCase()),
    );
    if (filtered.length === 0) { closeDropdown(); return; }
    activeIndexRef.current = 0;
    setDropdownState({ open: true, pos, filtered, activeIndex: 0 });
  }

  function insertMention(item: DropdownItem) {
    const el = editorRef.current;
    if (!el) return;
    const { text, caretOffset } = readEditorState(el);
    const slice = text.slice(Math.max(0, caretOffset - 40), caretOffset);
    const atIdx = slice.lastIndexOf("@");
    if (atIdx === -1) return;
    const absoluteAt = Math.max(0, caretOffset - 40) + atIdx;
    const token = `@[${item.label}](${item.id})`;
    const newValue = text.slice(0, absoluteAt) + token + " " + text.slice(caretOffset);
    closeDropdown();
    lastEmittedRef.current = newValue;
    onChange(newValue);
    requestAnimationFrame(() => {
      const rafEl = editorRef.current;
      if (!rafEl) return;
      populateEditor(rafEl, newValue, upstreamMapRef.current);
      restoreCaretAt(rafEl, absoluteAt + token.length + 1);
      rafEl.focus();
    });
  }

  const handleInput = useCallback(() => {
    if (isComposingRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    const { text, caretOffset } = readEditorState(el);
    lastEmittedRef.current = text;
    onChange(text);
    const q = getAtQuery(text, caretOffset);
    if (q !== null) {
      const pos = measureCaretViewport();
      if (pos) openDropdown(q, pos);
    } else {
      closeDropdown();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
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
        if (!range.collapsed) return;
        const { startContainer, startOffset } = range;

        let chipToRemove: HTMLElement | null = null;

        if (startContainer === el) {
          const prevSib = el.childNodes[startOffset - 1];
          if (prevSib instanceof HTMLElement && prevSib.dataset.mentionId) {
            chipToRemove = prevSib;
          }
        } else if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
          const prevSib = startContainer.previousSibling;
          if (prevSib instanceof HTMLElement && prevSib.dataset.mentionId) {
            chipToRemove = prevSib;
          }
        }

        if (chipToRemove) {
          e.preventDefault();
          el.removeChild(chipToRemove);
          const { text } = readEditorState(el);
          lastEmittedRef.current = text;
          onChange(text);
          return;
        }
      }

      if (e.key === "Enter" && !dropdownState.open) {
        e.preventDefault();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dropdownState, onChange],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
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
    handleInput();
  }, []);

  useEffect(() => {
    if (!dropdownState.open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        dropdownRef.current?.contains(e.target as Node) ||
        editorRef.current?.contains(e.target as Node)
      ) return;
      closeDropdown();
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [dropdownState.open]);

  return (
    // Flex column so a `min-h-*` passed via className stretches the bordered
    // editable box itself — not just this wrapper — keeping the absolutely
    // positioned placeholder inside the border.
    <div className={cn("relative flex min-h-0 flex-1 flex-col", className)}>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        aria-disabled={disabled}
        contentEditable={disabled ? false : true}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={() => { isComposingRef.current = true; }}
        onCompositionEnd={() => { isComposingRef.current = false; handleInput(); }}
        className={cn(
          "flex-1 min-h-0 w-full h-full rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring overflow-auto",
          disabled && "cursor-not-allowed opacity-50",
        )}
      />

      {!value && (
        <span
          className="absolute inset-0 px-3 py-2 text-sm text-muted-foreground/60 pointer-events-none select-none"
          aria-hidden
        >
          {placeholder}
        </span>
      )}

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
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                onMouseDown={(e) => { e.preventDefault(); insertMention(item); }}
                className={cn(
                  "flex h-auto w-full items-center justify-start gap-2 rounded-none border-0 px-3 py-2 text-xs font-normal whitespace-normal text-left transition-colors hover:bg-transparent dark:hover:bg-transparent",
                  i === dropdownState.activeIndex
                    ? "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/10"
                    : "hover:bg-muted hover:text-foreground text-foreground dark:hover:bg-muted",
                )}
              >
                {item.fileUrl && item.fileKind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.fileUrl} alt="" className="size-6 rounded object-cover shrink-0 border border-border" />
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
              </Button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
