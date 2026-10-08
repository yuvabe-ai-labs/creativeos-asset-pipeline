"use client";

import { useState, type ChangeEvent } from "react";
import { ImagePlusIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format/initials";
import { LOGO_EXTENSIONS } from "@/lib/clients/constants";
import { EditableField } from "@/components/nodes/editable-field";
import { useRenameClient, useUploadClientLogo } from "@/hooks/queries/clients";

const LOGO_ACCEPT = [...LOGO_EXTENSIONS].map((e) => `.${e}`).join(",");

type Props = {
  clientId: string;
  name: string;
  logoUrl: string | null;
  /** `lg` for the client page header, `md` for setup pages. */
  size?: "md" | "lg";
};

/**
 * The client's logo and name, both editable where they are shown — so a logo skipped in the New
 * client dialog, or a name typed wrong, is fixed in place rather than hunted for. Click the logo
 * to upload or replace it; click the name to rename (the slug, and so the URL, never changes).
 */
export function ClientIdentity({ clientId, name, logoUrl, size = "lg" }: Props) {
  // Shown at once; the route refresh after each write brings the server's copy in.
  const [shownName, setShownName] = useState(name);
  const [shownLogo, setShownLogo] = useState(logoUrl);
  const rename = useRenameClient(clientId);
  const uploadLogo = useUploadClientLogo(clientId);

  function commitName(next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === shownName) return;
    const previous = shownName;
    setShownName(trimmed);
    rename.mutate(trimmed, {
      onError: (e) => {
        setShownName(previous);
        toast.error(e.message);
      },
    });
  }

  function pickLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!LOGO_EXTENSIONS.has(ext)) {
      toast.error(`A logo must be ${[...LOGO_EXTENSIONS].join(", ")}.`);
      return;
    }
    const previous = shownLogo;
    const preview = URL.createObjectURL(file);
    setShownLogo(preview);
    uploadLogo.mutate(file, {
      onSuccess: (url) => setShownLogo(url),
      onError: (err) => {
        setShownLogo(previous);
        toast.error(err.message);
      },
      onSettled: () => URL.revokeObjectURL(preview),
    });
  }

  const tile = size === "lg" ? "size-14 rounded-lg" : "size-11 rounded-lg";
  const uploading = uploadLogo.isPending;
  const Heading = size === "lg" ? "h1" : "h2";

  return (
    <div className="flex min-w-0 items-center gap-4">
      <label
        title={shownLogo ? "Replace logo" : "Add a logo"}
        className={cn(
          "group relative flex shrink-0 cursor-pointer items-center justify-center overflow-hidden bg-card transition-colors",
          tile,
          shownLogo ? "border" : "border border-dashed border-primary/40 text-primary hover:bg-primary/5",
        )}
      >
        {shownLogo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shownLogo} alt={`${shownName} logo`} className="size-full object-contain p-1.5" />
            <span className="absolute inset-0 flex items-center justify-center bg-foreground/40 text-background opacity-0 transition-opacity group-hover:opacity-100">
              <ImagePlusIcon className="size-4" strokeWidth={1.5} />
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-0.5">
            <ImagePlusIcon className="size-4" strokeWidth={1.5} />
            {size === "lg" && <span className="text-[0.6rem] font-medium">{initials(shownName)}</span>}
          </span>
        )}
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" />
          </span>
        )}
        <input type="file" accept={LOGO_ACCEPT} className="hidden" onChange={pickLogo} disabled={uploading} />
      </label>

      {/* Still the page's heading — the client page's h1, the KB page's h2 under its eyebrow. */}
      <Heading className="min-w-0 flex-1">
        <EditableField
          value={shownName}
          onCommit={commitName}
          singleLine
          placeholder="Client name"
          className={cn(
            "min-w-0 font-display font-semibold",
            size === "lg" ? "text-4xl tracking-[-0.02em]" : "text-3xl tracking-tight",
          )}
          editClassName={size === "lg" ? "h-14 text-4xl" : "h-11 text-3xl"}
        />
      </Heading>
    </div>
  );
}
