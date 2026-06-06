"use client";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  FileTextIcon,
  ImageIcon,
  UploadIcon,
  XIcon,
  Undo2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ClientKBDocumentRow, ClientBrandImageRow } from "@/lib/db/types";
import type { StagedChanges } from "@/lib/kb/types";
import { formatBytes } from "@/lib/kb/utils";

type Props = {
  clientId: string;
  documents: ClientKBDocumentRow[];
  images: ClientBrandImageRow[];
  staged: StagedChanges;
  docPanelOpen: boolean;
  uploadingDocs: boolean;
  uploadingImgs: boolean;
  showChangeIndicator: boolean;
  onTogglePanel: () => void;
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

export function KBSourcePanel({
  documents,
  images,
  staged,
  docPanelOpen,
  uploadingDocs,
  uploadingImgs,
  showChangeIndicator,
  onTogglePanel,
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
    <div className="mb-4 overflow-hidden rounded-lg border border-border">
      {/* Header */}
      <button
        type="button"
        onClick={onTogglePanel}
        className="flex w-full items-center justify-between bg-muted/30 px-4 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex min-w-0 items-center gap-2">
          {showChangeIndicator && (
            <span className="size-2 shrink-0 rounded-full bg-amber-500" />
          )}
          <span className="text-sm font-medium">Source Documents & Images</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {documents.length} doc{documents.length !== 1 ? "s" : ""} · {images.length} image{images.length !== 1 ? "s" : ""}
          </span>
          {hasPendingChanges && (
            <span className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-400">
              Unsaved changes
            </span>
          )}
        </div>
        {docPanelOpen ? (
          <ChevronUpIcon className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Body */}
      {docPanelOpen && (
        <div className="space-y-4 border-t border-border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {/* Documents column */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <FileTextIcon className="size-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Brand Documents</span>
                </div>
                <span className="text-xs text-muted-foreground">PDF · DOCX · PPTX · MD · TXT</span>
              </div>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
                {uploadingDocs ? (
                  <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <UploadIcon className="size-3.5" />
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
                          "group flex items-center gap-2 rounded-md px-2 py-1 text-xs",
                          isPending
                            ? "opacity-50"
                            : isNew
                              ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                              : "hover:bg-muted/40",
                        )}
                      >
                        <FileTextIcon
                          className={cn(
                            "size-3 shrink-0",
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
                          <span className="shrink-0 text-muted-foreground">
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
                          {isPending ? <Undo2Icon className="size-3" /> : <XIcon className="size-3" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Images column */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ImageIcon className="size-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium">Brand Images</span>
                </div>
                <span className="text-xs text-muted-foreground">JPG · PNG · WebP</span>
              </div>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground">
                {uploadingImgs ? (
                  <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <UploadIcon className="size-3.5" />
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
                <ul className="space-y-1">
                  {images.map((img) => {
                    const isPending = pendingImageRemovals.has(img.id);
                    const isNew = newlyAddedImageIds.has(img.id);
                    return (
                      <li
                        key={img.id}
                        className={cn(
                          "group flex items-center gap-2 rounded-md px-2 py-1 text-xs",
                          isPending
                            ? "opacity-50"
                            : isNew
                              ? "bg-emerald-50/50 dark:bg-emerald-950/20"
                              : "hover:bg-muted/40",
                        )}
                      >
                        <ImageIcon
                          className={cn(
                            "size-3 shrink-0",
                            isPending ? "text-destructive/60" : "text-muted-foreground",
                          )}
                        />
                        <span className={cn("min-w-0 flex-1 truncate", isPending && "line-through")}>
                          {img.filename}
                        </span>
                        {isNew && !isPending && (
                          <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            New
                          </span>
                        )}
                        {img.size_bytes && !isNew && (
                          <span className="shrink-0 text-muted-foreground">
                            {formatBytes(img.size_bytes)}
                          </span>
                        )}
                        <button
                          type="button"
                          title={isPending ? "Undo removal" : "Remove"}
                          onClick={() =>
                            isPending ? onUndoImageRemoval(img.id) : onMarkImageForRemoval(img.id)
                          }
                          className={cn(
                            "shrink-0 transition-opacity",
                            isPending
                              ? "text-muted-foreground opacity-100 hover:text-foreground"
                              : "text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100",
                          )}
                        >
                          {isPending ? <Undo2Icon className="size-3" /> : <XIcon className="size-3" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Pending changes footer */}
          {hasPendingChanges && (
            <div className="flex items-center gap-2 border-t border-border pt-3">
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
                Save changes
              </Button>
              <p className="text-xs text-muted-foreground">
                {[
                  pendingDocRemovals.size > 0 && `${pendingDocRemovals.size} to remove`,
                  newlyAddedDocIds.size > 0 && `${newlyAddedDocIds.size} new doc${newlyAddedDocIds.size !== 1 ? "s" : ""}`,
                  newlyAddedImageIds.size > 0 && `${newlyAddedImageIds.size} new image${newlyAddedImageIds.size !== 1 ? "s" : ""}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
