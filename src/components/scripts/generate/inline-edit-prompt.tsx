"use client";

import { useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import type { ScriptSelection } from "@/hooks/use-script-selection";

/** The small prompt beside selected text (spec 2 §9 "Inline AI edit"). Keyed by the selection at the
 *  call site, so a new selection starts with an empty instruction. */
export function InlineEditPrompt({ selection, pending, onSubmit, onClose }: {
  selection: ScriptSelection;
  pending: boolean;
  onSubmit: (instruction: string) => void;
  onClose: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const submit = () => { if (instruction.trim() && !pending) onSubmit(instruction.trim()); };
  return (
    <div
      role="dialog"
      aria-label="Change the selected text"
      className="animate-rise absolute z-20 w-80 rounded-xl border border-border bg-card p-2 shadow-lg"
      style={{ top: selection.top, left: selection.left }}
    >
      <InputGroup>
        <InputGroupTextarea
          autoFocus
          rows={2}
          value={instruction}
          disabled={pending}
          placeholder="Shorter, warmer, add the claim line…"
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); onClose(); }
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
        />
        <InputGroupAddon align="block-end">
          <span className="truncate text-xs text-muted-foreground">“{selection.text.length > 48 ? `${selection.text.slice(0, 48)}…` : selection.text}”</span>
          <InputGroupButton size="icon-xs" className="ml-auto" aria-label="Apply the change" disabled={pending || !instruction.trim()} onClick={submit}>
            {pending ? <Loader2 className="animate-spin" strokeWidth={1.5} /> : <ArrowUp strokeWidth={1.5} />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
