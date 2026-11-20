"use client";

import type { ReactNode } from "react";
import { ArrowUp } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { MAX_PASTE_CHARS } from "@/lib/scripts/copilot/constants";
import { isLongText } from "@/lib/scripts/copilot/message-text";

/** The message box. Its text is held by the chat, so a suggestion can fill it. */
export function CopilotComposer({ busy, text, onTextChange, onSend, attach, above, sendEmpty = false }: {
  busy: boolean;
  text: string;
  onTextChange: (text: string) => void;
  onSend: (text: string) => void;
  /** Piece 5.1 — at Visualise, the Attach a picture button, beside the hint. */
  attach?: ReactNode;
  /** Piece 5.1 — the picture waiting to be sent, or the question of what it is for. */
  above?: ReactNode;
  /** A message may go with no words (a picture on its own). */
  sendEmpty?: boolean;
}) {
  // No maxLength: the browser would trim a long paste without a word. Over the limit it says so instead.
  const tooLong = text.length > MAX_PASTE_CHARS;
  const empty = !text.trim() && !sendEmpty;
  const send = () => {
    const t = text.trim();
    if (empty || busy || tooLong) return;
    onSend(t);
    onTextChange("");
  };
  return (
    <div className="border-t border-border p-3">
      {above && <div className="mb-2">{above}</div>}
      <InputGroup>
        <InputGroupTextarea
          rows={2}
          value={text}
          placeholder="Tell the copilot about the reel, ask for a change, or paste a script…"
          // A pasted script shows its first lines, fading out; the box never grows past them.
          className={cn("max-h-36 overflow-y-auto", isLongText(text) && "[mask-image:linear-gradient(to_bottom,#000_55%,transparent)]")}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <InputGroupAddon align="block-end">
          {attach}
          <span className="text-xs text-muted-foreground">
            {tooLong ? `Over ${MAX_PASTE_CHARS.toLocaleString("en")} characters: too long for one message.` : "Enter to send · Shift+Enter for a new line"}
          </span>
          <InputGroupButton size="icon-xs" className="ml-auto" aria-label="Send" disabled={busy || tooLong || empty} onClick={send}>
            <ArrowUp strokeWidth={1.5} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
