"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Send, X, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCanvasStore } from "./canvas-store-provider";
import { nodeLabel } from "@/lib/nodes/describe-node";
import { expandSelected } from "@/lib/copilot/actions";
import { cn } from "@/lib/utils";
import type { Attachment } from "./use-copilot-chat";

// The composer footer: the textarea, the @-mention picker it drives, the script-attachment
// affordance, and Send. Owns its own input/attachment/mention state; on submit it hands the
// finished turn to the parent via onSend and clears itself.
export function CopilotComposer({
  onSend,
  thinking,
}: {
  onSend: (text: string, attachment: Attachment | null) => void;
  thinking: boolean;
}) {
  const [input, setInput] = useState("");
  // The last message the human sent — recalled by ArrowUp on an empty composer (shell-style).
  const [lastSent, setLastSent] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nodes = useCanvasStore((s) => s.nodes);
  // @-mention picker state: non-null while the composer is mid-@reference.
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  // The composer mounts when the panel opens — focus it so launching the copilot
  // (✨ button or Ctrl+Space) lands the cursor ready to type.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // @-mention: candidate node references for the current @query. Human-directed
  // grounding — YOU pick which nodes matter; the copilot never volunteers them. Matches
  // on the handle AND the (title-derived) name, so a titled node is found by its title
  // and an untitled/agent-made one by its handle. Capped so the list stays scannable.
  const mentionOptions =
    mention !== null
      ? nodes
          .map((n) => ({ id: n.id, type: n.type as string, ...nodeLabel(n) }))
          .filter((o) => {
            const q = mention.query.toLowerCase();
            return o.handle.toLowerCase().includes(q) || o.name.toLowerCase().includes(q);
          })
          .slice(0, 8)
      : [];

  // "@selected" sugar row — offered when there is a selection and the query matches.
  const selectedCount = nodes.filter((n) => n.selected).length;
  const showSelectedRow =
    mention !== null &&
    selectedCount > 0 &&
    "selected".startsWith(mention.query.toLowerCase());
  // The picker is ONE keyboard-navigable list: when shown, the SELECTED row occupies
  // index 0 and the node options shift down by one, so ↑/↓/Enter reach every row.
  const rowOffset = showSelectedRow ? 1 : 0;
  const totalRows = rowOffset + mentionOptions.length;

  // On each keystroke, detect an "@word" at the caret → open/refresh the picker.
  function onComposerChange(value: string, caret: number) {
    setInput(value);
    const m = value.slice(0, caret).match(/@([\w-]*)$/);
    if (m) {
      setMention({ query: m[1], start: caret - m[0].length });
      setMentionIndex(0);
    } else {
      setMention(null);
    }
  }

  // Shared insertion logic: replace the "@query" at mention.start with the given text,
  // focus the textarea, and position the caret after the inserted text. Called by both
  // insertMention and insertSelected.
  function insertAtMention(text: string) {
    if (mention === null) return;
    const el = inputRef.current;
    const caret = el?.selectionStart ?? input.length;
    const before = input.slice(0, mention.start);
    const after = input.slice(caret);
    setInput(before + text + after);
    setMention(null);
    const pos = (before + text).length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  // Replace the "@query" at the caret with the chosen node's handle token AND its
  // friendly name (e.g. "@FILE-469A Product image "). The handle stays the machine
  // anchor — `resolveMentions` matches `/@[\w-]+/`, which stops at the space, so it
  // still resolves the id from the handle alone; the name that follows is legible
  // context for the human's chat history and inline grounding for the model.
  function insertMention(o: { handle: string; name: string }) {
    if (mention === null) return;
    insertAtMention(`@${o.handle} ${o.name} `);
  }

  // Replace the "@query" with the expanded selection tokens (insert-time expansion).
  function insertSelected() {
    if (mention === null) return;
    const tokens = expandSelected(nodes);
    if (!tokens) return;
    insertAtMention(tokens);
  }

  // Read an uploaded .md/.txt script into a pending attachment (its text becomes the
  // Script node source on send). Clear the input value so the same file can be re-picked.
  function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAttachment({ name: file.name, text: String(reader.result ?? "") });
    reader.readAsText(file);
  }

  function submit() {
    const text = input.trim();
    if ((!text && !attachment) || thinking) return;
    if (text) setLastSent(text); // remember it for ArrowUp recall
    onSend(text, attachment);
    setInput("");
    setAttachment(null);
    setMention(null);
  }

  return (
    <div className="border-t border-border/70 p-3">
      {attachment && (
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary">
          <Paperclip className="size-3" />
          <span className="max-w-[200px] truncate">{attachment.name}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            onClick={() => setAttachment(null)}
            aria-label="Remove attachment"
            className="size-4 text-primary/60 hover:bg-transparent hover:text-primary"
          >
            <X className="size-3" />
          </Button>
        </div>
      )}
      <div className="relative">
        {/* @-mention picker: appears above the composer when you type "@". YOU drive
            it — the list is the canvas nodes, shown by title/type + stable handle. */}
        {mention !== null && totalRows > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-border bg-background shadow-lg">
            <div className="text-eyebrow px-3 py-1.5 text-[10px] text-muted-foreground">
              Reference a node
            </div>
            <ul className="max-h-56 overflow-y-auto pb-1">
              {showSelectedRow && (
                <li>
                  <Button
                    variant="ghost"
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertSelected();
                    }}
                    onMouseEnter={() => setMentionIndex(0)}
                    className={cn(
                      "h-auto w-full justify-start gap-2 rounded-none px-3 py-1.5 text-left text-sm font-normal",
                      mentionIndex === 0 ? "bg-primary/10 hover:bg-primary/10" : "hover:bg-muted",
                    )}
                  >
                    <span className="text-eyebrow text-[9px] text-primary">SELECTED</span>
                    <span className="truncate text-muted-foreground">
                      {selectedCount} node{selectedCount === 1 ? "" : "s"} on canvas
                    </span>
                  </Button>
                </li>
              )}
              {mentionOptions.map((o, i) => (
                <li key={o.id}>
                  <Button
                    variant="ghost"
                    type="button"
                    // onMouseDown (not onClick) + preventDefault keeps the textarea
                    // focused so the caret survives the insertion.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMention(o);
                    }}
                    onMouseEnter={() => setMentionIndex(i + rowOffset)}
                    className={cn(
                      "h-auto w-full justify-start gap-2 rounded-none px-3 py-1.5 text-left text-sm font-normal",
                      i + rowOffset === mentionIndex ? "bg-primary/10 hover:bg-primary/10" : "hover:bg-muted",
                    )}
                  >
                    <span className="text-eyebrow text-[9px] text-muted-foreground">{o.handle}</span>
                    <span className="truncate">{o.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(e) =>
            onComposerChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
          }
          onKeyDown={(e) => {
            // While the picker is open, the arrow/enter/esc keys drive it — not the
            // composer. One list: index 0 is the SELECTED row (when shown), node
            // options follow at +rowOffset.
            if (mention !== null && totalRows > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIndex((i) => (i + 1) % totalRows);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIndex((i) => (i - 1 + totalRows) % totalRows);
                return;
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (showSelectedRow && mentionIndex === 0) {
                  insertSelected();
                } else {
                  const option = mentionOptions[mentionIndex - rowOffset];
                  if (option) insertMention(option);
                }
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setMention(null);
                return;
              }
            }
            // Shell-style history: ArrowUp on an empty composer recalls the last sent
            // message. Guarded to empty input so it never fights caret movement mid-draft.
            if (e.key === "ArrowUp" && input.length === 0 && lastSent) {
              e.preventDefault();
              setInput(lastSent);
              requestAnimationFrame(() => {
                const el = inputRef.current;
                el?.focus();
                el?.setSelectionRange(lastSent.length, lastSent.length);
              });
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask the copilot…  (type @ to reference a node)"
          rows={2}
          className="resize-none"
        />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.txt"
          onChange={onPickFile}
          className="hidden"
        />
        <Button
          variant="ghost"
          size="xs"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          title="Attach a .md / .txt script"
          className="gap-1.5 font-normal text-muted-foreground"
        >
          <Paperclip className="size-3.5" /> Attach script
        </Button>
        <Button
          onClick={() => submit()}
          disabled={thinking || (input.trim().length === 0 && !attachment)}
          className="gap-1.5"
        >
          <Send className="size-3.5" /> Send
        </Button>
      </div>
    </div>
  );
}
