"use client";

import { FileText, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const KIND_LABELS = { text: "TXT", image: "IMG", document: "DOC" } as const;

export type FilePreviewProps = {
  fileKind?: "text" | "image" | "document";
  fileUrl?: string;
  rawText?: string;
  filename?: string;
  fileExt?: string;
};

export function FilePreview({
  fileKind,
  fileUrl,
  rawText,
  filename,
  fileExt,
}: FilePreviewProps) {
  const kindLabel = fileKind ? KIND_LABELS[fileKind] : null;

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="shrink-0 flex items-center gap-2 text-sm text-muted-foreground">
        {fileKind === "image" ? (
          <ImageIcon className="size-4 shrink-0" />
        ) : (
          <FileText className="size-4 shrink-0" />
        )}
        <span className="font-medium text-foreground">{filename}</span>
        {kindLabel && (
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-xs font-medium",
              fileKind === "image"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {kindLabel}
          </span>
        )}
        {fileExt && <span className="text-xs">.{fileExt}</span>}
      </div>

      {fileKind === "image" && fileUrl && (
        <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden rounded-xl border bg-muted/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl}
            alt={filename ?? "uploaded image"}
            className="max-h-full w-auto object-contain"
          />
        </div>
      )}

      {fileKind === "text" && (
        <div className="flex-1 min-h-0 rounded-xl border bg-muted/20 overflow-hidden">
          {rawText ? (
            <pre className="h-full overflow-y-auto whitespace-pre-wrap wrap-break-word p-5 text-sm leading-relaxed text-foreground/80">
              {rawText}
            </pre>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">No text content.</p>
          )}
        </div>
      )}

      {fileKind === "document" && (
        <div className="flex items-center gap-3 rounded-xl border bg-muted/20 p-5">
          <FileText className="size-8 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">{filename}</p>
            <p className="text-xs text-muted-foreground">
              Document preview not available — use the LLM toggle above to extract content.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
