/* eslint-disable @next/next/no-img-element -- a tiny thumbnail of a file the person just uploaded, from storage */
import { FileText, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** One attached file, by name, with a thumbnail for an image. In the composer it can be removed
 *  and shows its upload; in a sent message it is plain. A refused file says why. */
export function ThreadAttachmentChip({ name, url, state = "ready", error = null, onRemove }: {
  name: string;
  /** An image's thumbnail; null for a document or while it uploads. */
  url: string | null;
  state?: "uploading" | "ready" | "failed";
  error?: string | null;
  onRemove?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex max-w-full items-center gap-2 rounded-lg border border-border bg-card py-1 pl-1.5 pr-2 text-xs",
        state === "failed" && "border-destructive/40",
      )}
    >
      {state === "uploading" ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none" strokeWidth={1.5} aria-label="Uploading" />
      ) : url ? (
        <img src={url} alt="" className="size-6 shrink-0 rounded object-cover" />
      ) : (
        <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      )}
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{name}</span>
        {error && <span className="text-destructive-text">{error}</span>}
      </span>
      {onRemove && (
        <Button variant="ghost" size="icon-xs" aria-label={`Remove ${name}`} onClick={onRemove} className="-mr-1 shrink-0 text-muted-foreground">
          <X strokeWidth={1.5} />
        </Button>
      )}
    </div>
  );
}
