"use client";

import { FileTextIcon, ImageIcon, UploadIcon, XIcon, Undo2Icon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { ClientKBDocumentRow, ClientBrandImageRow } from "@/lib/db/types";
import type { StagedChanges } from "@/lib/kb/types";
import { formatBytes } from "@/lib/kb/utils";

type Props = {
  documents: ClientKBDocumentRow[];
  images: ClientBrandImageRow[];
  staged: StagedChanges;
  uploadingDocs: boolean;
  uploadingImgs: boolean;
  onMarkDocForRemoval: (id: string) => void;
  onUndoDocRemoval: (id: string) => void;
  onMarkImageForRemoval: (id: string) => void;
  onUndoImageRemoval: (id: string) => void;
  onDocFiles: (files: File[]) => void;
  onImgFiles: (files: File[]) => void;
  onCancelChanges: () => void;
  onSaveChanges: () => void;
  cancelingChanges: boolean;
  savingChanges: boolean;
};

// The source-files manager, rendered as the body of a side drawer. Documents and
// images are split into two tabs; a pending-changes footer pins to the bottom.
export function KBSourcePanel({
  documents,
  images,
  staged,
  uploadingDocs,
  uploadingImgs,
  onMarkDocForRemoval,
  onUndoDocRemoval,
  onMarkImageForRemoval,
  onUndoImageRemoval,
  onDocFiles,
  onImgFiles,
  onCancelChanges,
  onSaveChanges,
  cancelingChanges,
  savingChanges,
}: Props) {
  const { pendingDocRemovals, pendingImageRemovals, newlyAddedDocIds, newlyAddedImageIds } = staged;

  const hasPendingChanges =
    pendingDocRemovals.size > 0 ||
    pendingImageRemovals.size > 0 ||
    newlyAddedDocIds.size > 0 ||
    newlyAddedImageIds.size > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs defaultValue="documents" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList
          variant="line"
          className="h-auto w-full shrink-0 justify-start gap-2 rounded-none border-b border-border bg-transparent px-5 pt-1 group-data-horizontal/tabs:h-auto"
        >
          <TabsTrigger
            value="documents"
            className="h-auto flex-none rounded-none px-1 py-2.5 after:bg-primary group-data-horizontal/tabs:after:bottom-0"
          >
            <FileTextIcon className="size-3.5" />
            Documents
            <span className="rounded-full bg-muted px-1.5 text-[0.65rem] text-muted-foreground">
              {documents.length}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="images"
            className="h-auto flex-none rounded-none px-1 py-2.5 after:bg-primary group-data-horizontal/tabs:after:bottom-0"
          >
            <ImageIcon className="size-3.5" />
            Images
            <span className="rounded-full bg-muted px-1.5 text-[0.65rem] text-muted-foreground">
              {images.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* Documents tab */}
        <TabsContent value="documents" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          <p className="text-xs text-muted-foreground">PDF · DOCX · PPTX · MD · TXT</p>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-primary/40 px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5 hover:border-primary/60">
            {uploadingDocs ? (
              <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <UploadIcon className="size-4" />
            )}
            {uploadingDocs ? "Uploading…" : "Add documents"}
            <input
              type="file"
              accept=".pdf,.docx,.pptx,.md,.txt"
              multiple
              className="hidden"
              disabled={uploadingDocs}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) onDocFiles(files);
              }}
            />
          </label>
          {documents.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">No documents</p>
          ) : (
            <ul className="space-y-1">
              {documents.map((doc) => {
                const isPending = pendingDocRemovals.has(doc.id);
                const isNew = newlyAddedDocIds.has(doc.id);
                return (
                  <li
                    key={doc.id}
                    className={cn(
                      "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                      isPending
                        ? "opacity-50"
                        : isNew
                          ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                          : "hover:bg-muted/40",
                    )}
                  >
                    <FileTextIcon
                      className={cn(
                        "size-3.5 shrink-0",
                        isPending ? "text-destructive/60" : "text-muted-foreground",
                      )}
                    />
                    <span className={cn("min-w-0 flex-1 truncate", isPending && "line-through")}>
                      {doc.filename}
                    </span>
                    {isNew && !isPending && (
                      <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        New
                      </span>
                    )}
                    {doc.size_bytes && !isNew && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatBytes(doc.size_bytes)}
                      </span>
                    )}
                    <button
                      type="button"
                      title={isPending ? "Undo removal" : "Remove"}
                      onClick={() =>
                        isPending ? onUndoDocRemoval(doc.id) : onMarkDocForRemoval(doc.id)
                      }
                      className={cn(
                        "shrink-0 transition-opacity",
                        isPending
                          ? "text-muted-foreground opacity-100 hover:text-foreground"
                          : "text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100",
                      )}
                    >
                      {isPending ? <Undo2Icon className="size-3.5" /> : <XIcon className="size-3.5" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>

        {/* Images tab */}
        <TabsContent value="images" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          <p className="text-xs text-muted-foreground">JPG · PNG · WebP</p>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-primary/40 px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/5 hover:border-primary/60">
            {uploadingImgs ? (
              <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <UploadIcon className="size-4" />
            )}
            {uploadingImgs ? "Uploading…" : "Add images"}
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              multiple
              className="hidden"
              disabled={uploadingImgs}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) onImgFiles(files);
              }}
            />
          </label>
          {images.length === 0 ? (
            <p className="py-1 text-xs text-muted-foreground">No images</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {images.map((img) => {
                const isPending = pendingImageRemovals.has(img.id);
                const isNew = newlyAddedImageIds.has(img.id);
                return (
                  <div
                    key={img.id}
                    className={cn(
                      "group relative size-20 shrink-0 overflow-hidden rounded-md border border-border",
                      isPending && "opacity-40",
                      isNew && "ring-2 ring-emerald-500/60",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.storage_url}
                      alt={img.filename}
                      title={img.filename}
                      className="size-full object-cover"
                    />
                    {isNew && !isPending && (
                      <span className="absolute bottom-0 left-0 right-0 bg-emerald-600/80 px-1 py-px text-center text-[0.55rem] font-semibold text-white">
                        New
                      </span>
                    )}
                    <button
                      type="button"
                      title={isPending ? "Undo removal" : "Remove"}
                      onClick={() =>
                        isPending ? onUndoImageRemoval(img.id) : onMarkImageForRemoval(img.id)
                      }
                      className={cn(
                        "absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/60 text-white transition-opacity",
                        isPending ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                      )}
                    >
                      {isPending ? <Undo2Icon className="size-3" /> : <XIcon className="size-3" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Pending changes footer */}
      {hasPendingChanges && (
        <div className="shrink-0 space-y-2 border-t border-border p-4">
          <p className="text-xs text-muted-foreground">
            {[
              pendingDocRemovals.size > 0 && `${pendingDocRemovals.size} to remove`,
              newlyAddedDocIds.size > 0 && `${newlyAddedDocIds.size} new doc${newlyAddedDocIds.size !== 1 ? "s" : ""}`,
              newlyAddedImageIds.size > 0 && `${newlyAddedImageIds.size} new image${newlyAddedImageIds.size !== 1 ? "s" : ""}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onCancelChanges}
              disabled={cancelingChanges || savingChanges}
            >
              {cancelingChanges ? "Reverting…" : "Cancel"}
            </Button>
            <Button
              size="sm"
              onClick={onSaveChanges}
              disabled={cancelingChanges || savingChanges}
            >
              Save & re-analyze
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
