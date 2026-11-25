"use client";

import { useState } from "react";
import { toast } from "sonner";
import { updateAiModelAction } from "@/lib/actions/ai-models";
import { EditableField } from "@/components/nodes/editable-field";

const SAVE_ERROR = "Could not save. Try again.";

/** The model page's title. Click to rename; Enter or leaving the field saves, Esc puts it back. */
export function ModelName({ id, label }: { id: string; label: string }) {
  const [name, setName] = useState(label);

  async function rename(typed: string) {
    const next = typed.trim();
    if (next === name) return;
    const before = name;
    setName(next);
    let error: string | undefined;
    try {
      error = (await updateAiModelAction(id, { label: next })).error;
    } catch {
      error = SAVE_ERROR;
    }
    if (error) {
      setName(before);
      toast.error(error);
      return;
    }
    toast.success(`Renamed ${before} to ${next}.`);
  }

  return (
    <h1 className="min-w-0 font-display text-2xl font-semibold tracking-tight md:text-[1.75rem]">
      <EditableField
        value={name}
        onCommit={(v) => void rename(v)}
        ariaLabel="Model name"
        singleLine={false}
        placeholder="Name"
        className="-mx-1.5 w-auto px-1.5 py-0.5"
        editClassName="h-auto py-0.5 font-display text-2xl font-semibold tracking-tight md:text-[1.75rem]"
      />
    </h1>
  );
}
