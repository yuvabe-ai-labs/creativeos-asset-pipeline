"use client";

import { useEffect, useRef, useState } from "react";
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

type DropdownItem = { id: string; label: string; type: string; fileUrl?: string; fileKind?: string };

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
  if (type === "image-gen") return <ImageIcon className="size-3 shrink-0 text-primary" />;
  if (type === "file") return <Paperclip className="size-3 shrink-0 text-primary" />;
  if (type === "draw") return <Pencil className="size-3 shrink-0 text-primary" />;
  return null;
}

// Detect whether the caret is inside an @-query. Returns the query string
// (text after @, may be empty) or null if not in a mention context.
function getAtQuery(value: string, caretPos: number): string | null {
  const slice = value.slice(Math.max(0, caretPos - 40), caretPos);
  const atIdx = slice.lastIndexOf("@");
  if (atIdx === -1) return null;
  const afterAt = slice.slice(atIdx + 1);
  if (afterAt.includes(" ") || afterAt.includes("\n")) return null;
  return afterAt;
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Viewport-absolute coords for the portal dropdown
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  const eligible: DropdownItem[] = upstream
    .filter((u) => u.type === "image-gen" || u.type === "draw" || u.type === "file")
    .map((u) => ({
      id: u.id,
      // token label keeps type prefix so the stored string is unambiguous
      label: `${nodeTypeLabel(u.type)}: ${u.label}`,
      type: u.type,
      fileUrl: u.fileUrl,
      fileKind: u.fileKind,
    }));

  const filtered =
    query === null
      ? []
      : eligible.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));

  const open = query !== null && filtered.length > 0;

  // Measure caret position using a mirror div, return viewport-absolute coords.
  function measureCaretPos(textarea: HTMLTextAreaElement, caretPos: number): { top: number; left: number } {
    const mirror = document.createElement("div");
    const style = window.getComputedStyle(textarea);
    for (const prop of [
      "fontFamily", "fontSize", "fontWeight", "lineHeight",
      "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
      "boxSizing", "wordWrap",
    ] as const) {
      mirror.style[prop] = style[prop];
    }
    mirror.style.position = "fixed";
    mirror.style.visibility = "hidden";
    mirror.style.pointerEvents = "none";
    // Position the mirror exactly over the textarea in the viewport
    const rect = textarea.getBoundingClientRect();
    mirror.style.top = `${rect.top}px`;
    mirror.style.left = `${rect.left}px`;
    mirror.style.width = `${rect.width}px`;
    mirror.style.height = "auto";
    mirror.style.overflow = "hidden";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordBreak = "break-word";

    const textBefore = textarea.value.slice(0, caretPos);
    mirror.textContent = textBefore;

    const caretSpan = document.createElement("span");
    caretSpan.textContent = "​"; // zero-width space — correct height, no visual offset
    mirror.appendChild(caretSpan);

    document.body.appendChild(mirror);
    const spanRect = caretSpan.getBoundingClientRect();
    document.body.removeChild(mirror);

    return { top: spanRect.top - textarea.scrollTop, left: spanRect.left };
  }

  function updateDropdownPos(textarea: HTMLTextAreaElement, caretPos: number) {
    const pos = measureCaretPos(textarea, caretPos);
    setDropdownPos(pos);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    const caret = e.target.selectionStart ?? val.length;
    onChange(val);
    const q = getAtQuery(val, caret);
    if (q !== null) {
      setQuery(q);
      setActiveIndex(0);
      updateDropdownPos(e.target, caret);
    } else {
      setQuery(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[activeIndex]) insertMention(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      setQuery(null);
    }
  }

  function handleSelect(e: React.SyntheticEvent<HTMLTextAreaElement>) {
    const ta = e.currentTarget;
    const caret = ta.selectionStart ?? ta.value.length;
    const q = getAtQuery(ta.value, caret);
    if (q !== null) {
      setQuery(q);
      setActiveIndex(0);
    } else {
      setQuery(null);
    }
  }

  function insertMention(item: DropdownItem) {
    const ta = textareaRef.current;
    if (!ta) return;
    const caret = ta.selectionStart ?? value.length;
    const slice = value.slice(Math.max(0, caret - 40), caret);
    const atIdx = slice.lastIndexOf("@");
    if (atIdx === -1) return;
    const absoluteAt = Math.max(0, caret - 40) + atIdx;
    const token = `@[${item.label}](${item.id})`;
    const next = value.slice(0, absoluteAt) + token + " " + value.slice(caret);
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      ta.focus();
      const newCaret = absoluteAt + token.length + 1;
      ta.setSelectionRange(newCaret, newCaret);
    });
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setQuery(null);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  return (
    <div className={cn("relative flex-1 min-h-0", className)}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onSelect={handleSelect}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "flex-1 min-h-0 w-full h-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring",
          disabled && "cursor-not-allowed opacity-50",
        )}
      />

      {open && dropdownPos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: dropdownPos.top,
              left: dropdownPos.left,
              transform: "translateY(-100%)",
              zIndex: 9999,
            }}
            className="min-w-50 max-w-xs rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
          >
            {filtered.map((item, i) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(item);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-xs text-left transition-colors",
                  i === activeIndex ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground",
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
                  <span className="size-6 flex items-center justify-center shrink-0">
                    <NodeIcon type={item.type} />
                  </span>
                )}
                <div className="min-w-0">
                  <span className="block truncate font-medium leading-tight">
                    {/* strip "Type: " prefix for display — the stored token keeps it */}
                    {item.label.replace(/^[^:]+:\s*/, "")}
                  </span>
                  <span className="block text-[10px] opacity-50 leading-tight">{nodeTypeLabel(item.type)}</span>
                </div>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
