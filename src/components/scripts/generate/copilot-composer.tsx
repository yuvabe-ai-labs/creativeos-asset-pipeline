"use client";

import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import { MAX_MESSAGE_CHARS } from "@/lib/scripts/copilot/constants";

export function CopilotComposer({ busy, onSend }: { busy: boolean; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    onSend(t);
    setText("");
  };
  return (
    <div className="border-t border-border p-3">
      <InputGroup>
        <InputGroupTextarea
          rows={2}
          value={text}
          maxLength={MAX_MESSAGE_CHARS}
          placeholder="Tell the copilot about the reel, or ask for a change…"
          onChange={(e) => setText(e.target.value)}
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
