"use client";

import { Button } from "@/components/ui/button";
import { AvatarDeleteButton } from "./avatar-delete-button";

type Props = {
  /** The avatar being edited; absent when creating. */
  editingName?: string;
  canSave: boolean;
  onSave: () => void;
  onDelete: () => void;
};

// Title block of both avatar editors, with the purple Save (and Delete, when editing) top-right.
export function AvatarEditorHeader({ editingName, canSave, onSave, onDelete }: Props) {
  const editing = editingName !== undefined;
  return (
    <header className="animate-rise mb-8 mt-4 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{editing ? "Edit avatar" : "Avatars"}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">For UGC videos</p>
      </div>
      <div className="flex items-center gap-2">
        {editing && <AvatarDeleteButton name={editingName} onConfirm={onDelete} />}
        <Button className="px-6" disabled={!canSave} onClick={onSave}>
          Save
        </Button>
      </div>
    </header>
  );
}
