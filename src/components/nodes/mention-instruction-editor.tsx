"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Paperclip, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UpstreamNode } from "./connected-inputs-card";

// ── Types ─────────────────────────────────────────────────────────────────────

type DropdownItem = { id: string; label: string; type: string };

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
  // Walk backwards from caret to find an unresolved @ within 40 chars
  const slice = value.slice(Math.max(0, caretPos - 40), caretPos);
  const atIdx = slice.lastIndexOf("@");
  if (atIdx === -1) return null;
  const afterAt = slice.slice(atIdx + 1);
  // If there's a space after @ the user moved on — not a mention trigger
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
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null);

  // Eligible mention targets: image-gen, file, draw nodes only
  const eligible: DropdownItem[] = upstream
    .filter((u) => u.type === "image-gen" || u.type === "draw" || u.type === "file")
    .map((u) => ({
      id: u.id,
      label: `${nodeTypeLabel(u.type)}: ${u.label}`,
      type: u.type,
    }));

  const filtered =
    query === null
      ? []
      : eligible.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));

  const open = query !== null && filtered.length > 0;

  // Position the dropdown near the caret using a mirror div technique
  function updateDropdownPos(textarea: HTMLTextAreaElement, caretPos: number) {
    // Create a temporary mirror to measure caret coordinates
    const mirror = document.createElement("div");
    const style = window.getComputedStyle(textarea);
    for (const prop of [
      "fontFamily", "fontSize", "fontWeight", "lineHeight",
      "letterSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
      "boxSizing", "wordWrap", "whiteSpace",
    ] as const) {
      // @ts-expect-error — style props are valid
      mirror.style[prop] = style[prop];
    }
    mirror.style.position = "absolute";
    mirror.style.visibility = "hidden";
    mirror.style.top = "0";
    mirror.style.left = "0";
    mirror.style.width = `${textarea.clientWidth}px`;
    mirror.style.height = "auto";
    mirror.style.overflow = "hidden";
    mirror.style.whiteSpace = "pre-wrap";

    const textBefore = textarea.value.slice(0, caretPos);
    mirror.textContent = textBefore;

    const caretSpan = document.createElement("span");
    caretSpan.textContent = "|";
    mirror.appendChild(caretSpan);

    document.body.appendChild(mirror);
    const mirrorRect = mirror.getBoundingClientRect();
    const spanRect = caretSpan.getBoundingClientRect();
    document.body.removeChild(mirror);

    const textareaRect = textarea.getBoundingClientRect();
    setDropdownPos({
      top: spanRect.top - textareaRect.top - textarea.scrollTop,
      left: spanRect.left - textareaRect.left,
    });
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
    // Restore focus and move caret after the inserted token
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

      {open && dropdownPos && (
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: dropdownPos.top,
            left: dropdownPos.left,
            transform: "translateY(-100%)",
            zIndex: 50,
          }}
          className="min-w-50 max-w-xs rounded-lg border border-border bg-popover shadow-lg overflow-hidden"
        >
          {filtered.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // don't blur the textarea
                insertMention(item);
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-xs text-left transition-colors",
                i === activeIndex ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground",
              )}
            >
              <NodeIcon type={item.type} />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
