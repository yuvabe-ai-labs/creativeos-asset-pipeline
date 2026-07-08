"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  $isTextNode,
  $isElementNode,
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
import React from "react";

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
    span.textContent = `@${this.__label}`;
    return span;
  }

  updateDOM(): boolean {
    return false;
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): null {
    return null;
  }

  isInline(): boolean {
    return true;
  }

  isKeyboardSelectable(): boolean {
    return true;
  }

  getTextContent(): string {
    return this.exportText();
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

  exportText(): string {
    return `@[${this.__label}](${this.__nodeId})`;
  }
}

// ── Serialization helpers ─────────────────────────────────────────────────────

const TOKEN_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

function serializeEditorState(state: EditorState): string {
  let result = "";
  state.read(() => {
    const root = $getRoot();
    const paragraphs = root.getChildren();
    const parts: string[] = [];
    for (const para of paragraphs) {
      if (!$isElementNode(para)) {
        parts.push(para.getTextContent());
        continue;
      }
      const paraChildren = para.getChildren();
      const paraParts = paraChildren.map((node: LexicalNode) => {
        if (node instanceof MentionNode) return node.exportText();
        return node.getTextContent();
      });
      parts.push(paraParts.join(""));
    }
    result = parts.join("\n");
  });
  return result;
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
}: {
  upstream: UpstreamNode[];
}) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const eligible: DropdownItem[] = useMemo(
    () =>
      upstream
        .filter((u) => u.type === "image-gen" || u.type === "draw" || u.type === "file")
        .map((u) => ({
          id: u.id,
          label: `${nodeTypeLabel(u.type)}: ${u.label}`,
          type: u.type,
        })),
    [upstream],
  );

  const filtered: DropdownItem[] = useMemo(
    () =>
      query === null
        ? []
        : eligible.filter((item) =>
            item.label.toLowerCase().includes(query.toLowerCase()),
          ),
    [query, eligible],
  );

  const open = query !== null && filtered.length > 0;

  const insertMention = useCallback(
    (item: DropdownItem) => {
      editor.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;

        const anchor = selection.anchor;
        const node = anchor.getNode();
        const offset = anchor.offset;

        if ($isTextNode(node)) {
          const textContent = node.getTextContent();
          const atIndex = textContent.lastIndexOf("@", offset - 1);
          if (atIndex !== -1) {
            node.spliceText(atIndex, offset - atIndex, "");
          }
        }

        $insertNodes([new MentionNode(item.label, item.id), $createTextNode(" ")]);
      });
      setQuery(null);
      setAnchorRect(null);
    },
    [editor],
  );

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          setQuery(null);
          setActiveIndex(0);
          return;
        }
        const anchor = selection.anchor;
        const node = anchor.getNode();
        const text = node.getTextContent();
        const offset = anchor.offset;
        const atIndex = text.lastIndexOf("@", offset - 1);
        if (atIndex === -1 || atIndex < offset - 30) {
          setQuery(null);
          setActiveIndex(0);
          return;
        }
        const q = text.slice(atIndex + 1, offset);
        setQuery((prev) => {
          if (prev !== q) setActiveIndex(0);
          return q;
        });

        const domSelection = window.getSelection();
        if (domSelection && domSelection.rangeCount > 0) {
          const range = domSelection.getRangeAt(0);
          setAnchorRect(range.getBoundingClientRect());
        }
      });
    });
  }, [editor]);

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
      (_payload: KeyboardEvent | null) => {
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
      (_payload: KeyboardEvent) => {
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

  if (!open || !anchorRect) return null;

  return (
    <div
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
            e.preventDefault();
            insertMention(item);
          }}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 text-xs text-left transition-colors",
            i === activeIndex ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground",
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

// lastEmitted tracks the most-recently serialized value so InitialValuePlugin
// can skip re-parsing values that the editor itself just emitted (avoids the
// type → onChange → value prop → re-parse → type loop).
function InitialValuePlugin({
  value,
  lastEmitted,
}: {
  value: string;
  lastEmitted: React.RefObject<string>;
}) {
  const [editor] = useLexicalComposerContext();
  const prevValue = useRef<string | null>(null);

  useEffect(() => {
    // Skip if value hasn't changed OR if we just emitted this value ourselves.
    if (prevValue.current === value) return;
    if (lastEmitted.current === value) {
      prevValue.current = value;
      return;
    }
    prevValue.current = value;
    parseInitialValue(value, editor);
  }, [value, editor, lastEmitted]);

  return null;
}

// ── Minimal error boundary for PlainTextPlugin ────────────────────────────────

class MentionEditorErrorBoundary extends React.Component<
  { children: React.ReactElement; onError: (error: Error) => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactElement; onError: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
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
  const initialConfig: InitialConfigType = {
    namespace: "MentionEditor",
    nodes: [MentionNode],
    onError: (err) => console.error("[MentionEditor]", err),
    editable: !disabled,
  };

  const rafRef = useRef<number | null>(null);
  const lastEmitted = useRef<string>("");

  function handleChange(state: EditorState) {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const serialized = serializeEditorState(state);
      lastEmitted.current = serialized;
      onChange(serialized);
    });
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
              placeholder={
                <div className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
                  {placeholder}
                </div>
              }
            />
          }
          placeholder={null}
          ErrorBoundary={MentionEditorErrorBoundary}
        />
        <OnChangePlugin onChange={handleChange} ignoreSelectionChange ignoreHistoryMergeTagChange />
        <HistoryPlugin />
        <InitialValuePlugin value={value} lastEmitted={lastEmitted} />
        <MentionsPlugin upstream={upstream} />
      </div>
    </LexicalComposer>
  );
}
