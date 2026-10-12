"use client";

import { ArrowUp } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { MAX_PASTE_CHARS } from "@/lib/scripts/copilot/constants";
import { isLongText } from "@/lib/scripts/copilot/message-text";

/** The message box. Its text is held by the chat, so a suggestion can fill it. */
export function CopilotComposer({ busy, text, onTextChange, onSend }: {
  busy: boolean;
  text: string;
  onTextChange: (text: string) => void;
  onSend: (text: string) => void;
}) {
  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    onSend(t);
    onTextChange("");
  };
  return (
    <div className="border-t border-border p-3">
      <InputGroup>
        <InputGroupTextarea
          rows={2}
          value={text}
          maxLength={MAX_PASTE_CHARS}
          placeholder="Tell the copilot about the reel, ask for a change, or paste a script…"
          // A pasted script shows its first lines, fading out; the box never grows past them.
          className={cn("max-h-36 overflow-y-auto", isLongText(text) && "[mask-image:linear-gradient(to_bottom,#000_55%,transparent)]")}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        <InputGroupAddon align="block-end">
          <span className="text-xs text-muted-foreground">Enter to send · Shift+Enter for a new line</span>
          <InputGroupButton size="icon-xs" className="ml-auto" aria-label="Send" disabled={busy || !text.trim()} onClick={send}>
            <ArrowUp strokeWidth={1.5} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
