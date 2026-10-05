"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { IMPORT_SOURCE_LABELS, type ImportSource } from "@/lib/asset-import/constants";
import { importTargetEditValue } from "@/lib/asset-import/utils";
import { useSetImportSource } from "@/hooks/queries/asset-imports";

const PREFIX: Record<ImportSource, string> = {
  website: "https://",
  instagram: "instagram.com/",
  facebook: "facebook.com/",
};

const PLACEHOLDER: Record<ImportSource, string> = {
  website: "yourbrand.com",
  instagram: "yourbrand",
  facebook: "yourbrand",
};

type Props = {
  clientId: string;
  source: ImportSource;
  /** The saved target URL, or null when the source is not connected. */
  target: string | null;
  onDone?: () => void;
  onCancel?: () => void;
};

/** Where one source imports from — edited in place; saving imports it (D302). Accepts whatever
 *  people paste ("@handle", a profile link); the server reads it and says if it can't. */
export function SourceHandleForm({ clientId, source, target, onDone, onCancel }: Props) {
  const [value, setValue] = useState(importTargetEditValue(source, target));
  const save = useSetImportSource(clientId);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    save.mutate(
      { source, value },
      {
        onSuccess: () => {
          toast.success(
            source === "website"
              ? "Saved. Bringing in the website's images and videos now."
              : `Saved. Bringing in ${IMPORT_SOURCE_LABELS[source]} posts now.`,
          );
          onDone?.();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-lg flex-wrap items-center gap-2">
      <InputGroup className="min-w-56 flex-1">
        <InputGroupAddon>
          <InputGroupText>{PREFIX[source]}</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          aria-label={`${IMPORT_SOURCE_LABELS[source]} ${source === "website" ? "address" : "handle"}`}
          placeholder={PLACEHOLDER[source]}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={save.isPending}
          autoComplete="off"
          autoFocus
        />
      </InputGroup>
      <Button type="submit" size="sm" disabled={save.isPending || !value.trim()}>
        {save.isPending ? "Saving…" : "Save & import"}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={save.isPending}>
          Cancel
        </Button>
      )}
    </form>
  );
}
