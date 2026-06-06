"use client";

import { useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BookOpenIcon, FileTextIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { KBNodeData } from "@/lib/canvas-nodes";

// ── Types ────────────────────────────────────────────────────────────────────

type DocMeta = {
  id: string;
  filename: string;
  fileExt: string;
  sizeBytes: number | null;
  createdAt: string;
};

type VersionMeta = {
  id: string;
  fillRate: number | null;
  createdAt: string;
  modelUsed: string;
  docIdsUsed: string[];
};

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded bg-muted", className)}
    />
  );
}

function SheetSkeleton() {
  return (
    <div className="grid gap-4 p-5">
      {/* version meta bar */}
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-24" />
      </div>
      {/* document rows */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex-1 grid gap-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Format helpers ────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const EXT_ICON: Record<string, string> = {
  pdf: "PDF",
  docx: "DOC",
  pptx: "PPT",
  md: "MD",
  txt: "TXT",
};

// ── Sheet content ─────────────────────────────────────────────────────────────

function KBSheetContent({ clientId }: { clientId: string }) {
  const [version, setVersion] = useState<VersionMeta | null>(null);
  const [documents, setDocuments] = useState<DocMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (loaded || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/kb/active`);
      const json = await res.json();
      setVersion(json.version ?? null);
      setDocuments(json.documents ?? []);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  return (
    <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
      <SheetHeader className="border-b p-5">
        <SheetTitle className="font-display text-xl">Brand KB</SheetTitle>
        <SheetDescription>
          Source documents used to build the brand knowledge base.
        </SheetDescription>
      </SheetHeader>

      <div
        className="flex-1 overflow-y-auto"
        onFocus={load}
        onMouseEnter={load}
      >
        {loading && <SheetSkeleton />}

        {loaded && (
          <div className="grid gap-0">
            {/* Version meta */}
            {version && (
              <div className="flex items-center gap-2 border-b px-5 py-3 text-xs text-muted-foreground">
                {version.fillRate != null && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                    {Math.round(version.fillRate * 100)}% fields filled
                  </span>
                )}
                <span>
                  Extracted {new Date(version.createdAt).toLocaleDateString()}
                </span>
                <span className="ml-auto font-mono">{version.modelUsed}</span>
              </div>
            )}

            {/* Document list */}
            {documents.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                No documents found.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {documents.map((doc) => {
                  const usedInVersion = version?.docIdsUsed.includes(doc.id);
                  return (
                    <li
                      key={doc.id}
                      className="flex items-center gap-3 px-5 py-3"
                    >
                      {/* File type badge */}
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted font-mono text-[0.6rem] font-bold text-muted-foreground">
                        {EXT_ICON[doc.fileExt] ?? doc.fileExt.toUpperCase()}
                      </div>

                      {/* Name + meta */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {doc.filename}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            formatBytes(doc.sizeBytes),
                            new Date(doc.createdAt).toLocaleDateString(),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>

                      {/* Used-in-extraction indicator */}
                      {usedInVersion && (
                        <span
                          className="size-1.5 rounded-full bg-primary"
                          title="Used in active extraction"
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {!version && loaded && (
              <p className="px-5 py-4 text-xs text-muted-foreground">
                KB not yet extracted — upload documents and click Extract KB on
                the client page.
              </p>
            )}
          </div>
        )}
      </div>
    </SheetContent>
  );
}

// ── Node ─────────────────────────────────────────────────────────────────────

export function KBNode({ data, selected }: NodeProps) {
  const d = data as KBNodeData;
  const [open, setOpen] = useState(false);
  const fillPct = d.fillRate != null ? Math.round(d.fillRate * 100) : null;

  return (
    <div
      className={cn(
        "w-44 rounded-lg border border-border bg-card shadow-card",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <BookOpenIcon className="size-3 text-primary" />
          <span className="text-eyebrow !text-[0.6rem]">Brand KB</span>
        </div>
        {fillPct != null && (
          <span className="rounded-full bg-primary/10 px-1.5 py-px text-[0.55rem] font-semibold text-primary">
            {fillPct}%
          </span>
        )}
      </div>

      <div className="px-2 py-2">
        <p className="truncate font-display text-xs font-medium">
          {d.brandName ?? (
            <span className="text-muted-foreground">Unknown brand</span>
          )}
        </p>
        {d.extractedAt && (
          <p className="mt-0.5 text-[0.6rem] text-muted-foreground">
            {new Date(d.extractedAt).toLocaleDateString()}
          </p>
        )}

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <button className="nodrag mt-1.5 text-[0.65rem] font-medium text-primary hover:underline">
                Open ↗
              </button>
            }
          />
          {open && <KBSheetContent clientId={d.clientId} />}
        </Sheet>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!size-2 !border-2 !border-card !bg-primary"
      />
    </div>
  );
}
