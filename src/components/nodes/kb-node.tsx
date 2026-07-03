"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { BookOpenIcon, ArrowUpRightIcon } from "lucide-react";
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
import { useNodeConnectionState } from "./use-node-connection-state";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";
import { formatDate } from "@/lib/kb/utils";

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

type ImageMeta = {
  id: string;
  filename: string;
  storageUrl: string;
};

type FetchState = {
  loading: boolean;
  version: VersionMeta | null;
  documents: DocMeta[];
  images: ImageMeta[];
};

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-muted", className)} />;
}

function SheetSkeleton() {
  return (
    <div className="grid gap-4 p-5">
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-24" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex-1 grid gap-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="size-16 rounded-md" />
        ))}
      </div>
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

// ── Ready sheet ───────────────────────────────────────────────────────────────

function KBReadySheetContent({
  clientSlug,
  loading,
  version,
  documents,
  images,
}: {
  clientSlug: string;
  loading: boolean;
  version: VersionMeta | null;
  documents: DocMeta[];
  images: ImageMeta[];
}) {
  return (
    <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
      <SheetHeader className="border-b p-5 pr-12">
        <SheetTitle className="font-display text-xl">Brand KB</SheetTitle>
        <SheetDescription>
          Source documents used to build the brand knowledge base.
        </SheetDescription>
        <Link
          href={`/clients/${clientSlug}/kb`}
          className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Edit KB <ArrowUpRightIcon className="size-3" />
        </Link>
      </SheetHeader>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <SheetSkeleton />
        ) : (
          <div className="grid gap-0">
            {version && (
              <div className="flex items-center gap-2 border-b px-5 py-3 text-xs text-muted-foreground">
                {version.fillRate != null && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                    {Math.round(version.fillRate * 100)}% fields filled
                  </span>
                )}
                <span>Extracted {formatDate(version.createdAt)}</span>
                <span className="ml-auto font-mono">{version.modelUsed}</span>
              </div>
            )}
            {documents.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">No documents found.</p>
            ) : (
              <ul className="divide-y divide-border">
                {documents.map((doc) => {
                  const usedInVersion = version?.docIdsUsed.includes(doc.id);
                  return (
                    <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted font-mono text-[0.6rem] font-bold text-muted-foreground">
                        {EXT_ICON[doc.fileExt] ?? doc.fileExt.toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{doc.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {[formatBytes(doc.sizeBytes), formatDate(doc.createdAt)].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {usedInVersion && (
                        <span className="size-1.5 rounded-full bg-primary" title="Used in active extraction" />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {images.length > 0 && (
              <div className="border-t px-5 py-4">
                <p className="mb-3 text-eyebrow text-xs text-muted-foreground">Brand Images</p>
                <div className="flex flex-wrap gap-2">
                  {images.map((img) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={img.id}
                      src={img.storageUrl}
                      alt={img.filename}
                      title={img.filename}
                      className="size-16 rounded-md object-cover border border-border"
                    />
                  ))}
                </div>
              </div>
            )}
            {!version && (
              <p className="px-5 py-4 text-xs text-muted-foreground">
                KB not yet extracted — upload documents and click Extract KB on the client page.
              </p>
            )}
          </div>
        )}
      </div>
    </SheetContent>
  );
}

// ── Info panel sheet (none / building / in_review) ────────────────────────────

function KBInfoSheetContent({
  clientSlug,
  title,
  description,
  ctaLabel,
}: {
  clientSlug: string;
  title: string;
  description: string;
  ctaLabel: string;
}) {
  return (
    <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
      <SheetHeader className="border-b p-5 pr-12">
        <SheetTitle className="font-display text-xl">Brand KB</SheetTitle>
        <SheetDescription>{title}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <p className="text-sm text-muted-foreground">{description}</p>
        <Link
          href={`/clients/${clientSlug}/kb`}
          className="inline-flex w-fit items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {ctaLabel} <ArrowUpRightIcon className="size-3" />
        </Link>
      </div>
    </SheetContent>
  );
}

// ── Node ─────────────────────────────────────────────────────────────────────

export function KBNode({ id, data, selected }: NodeProps) {
  const d = data as KBNodeData;
  const [open, setOpen] = useState(false);
  const connState = useNodeConnectionState(id, "kb");
  const kbStatus = useCanvasStore((s) => s.kbStatus);
  const kbJustReady = useCanvasStore((s) => s.kbJustReady);

  const [fetchState, setFetchState] = useState<FetchState>({
    loading: true,
    version: null,
    documents: [],
    images: [],
  });
  const fetchedRef = useRef(false);

  function prefetch() {
    if (kbStatus !== "ready") return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch(`/api/clients/${d.clientId}/kb/active`)
      .then((r) => r.json())
      .then((json) =>
        setFetchState({
          loading: false,
          version: json.version ?? null,
          documents: json.documents ?? [],
          images: json.images ?? [],
        }),
      )
      .catch(() => setFetchState((s) => ({ ...s, loading: false })));
  }

  const fillPct = d.fillRate != null ? Math.round(d.fillRate * 100) : null;

  const isNone = kbStatus === "none";
  const isBuilding = kbStatus === "building";
  const isInReview = kbStatus === "in_review";
  const isReady = kbStatus === "ready";

  const borderClass = isNone
    ? "border-dashed border-border"
    : isInReview
    ? "border-amber-200"
    : "border-border";

  const headerLabel = isNone
    ? "Set up Brand KB"
    : isBuilding
    ? "Building KB…"
    : isInReview
    ? "Needs review"
    : (d.brandName ?? "Brand KB");

  const subtitle = isNone
    ? "No brand context"
    : isBuilding
    ? "Analyzing documents…"
    : isInReview
    ? "Approve fields to activate"
    : d.extractedAt
    ? formatDate(d.extractedAt)
    : null;

  return (
    <div
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (isReady) prefetch();
        setOpen(true);
      }}
      className={cn(
        "w-44 rounded-lg border bg-card shadow-card",
        borderClass,
        "transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
        selected && "ring-2 ring-primary ring-offset-1 ring-offset-background",
        connState === "invalid" && "opacity-60 pointer-events-none",
        kbJustReady && "ring-2 ring-green-400 ring-offset-1 ring-offset-background",
      )}
      onMouseEnter={() => { if (isReady) prefetch(); }}
    >
      <div className={cn(
        "flex items-center justify-between border-b px-2 py-1.5",
        isInReview ? "border-amber-200" : "border-border",
      )}>
        <div className="flex items-center gap-1.5">
          {isBuilding ? (
            <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" />
          ) : (
            <BookOpenIcon className={cn(
              "size-3",
              isNone ? "text-muted-foreground" : isInReview ? "text-amber-500" : "text-primary",
            )} />
          )}
          <span className="text-eyebrow text-[0.6rem]!">Brand KB</span>
        </div>
        {isReady && fillPct != null && (
          <span className="rounded-full bg-primary/10 px-1.5 py-px text-[0.55rem] font-semibold text-primary">
            {fillPct}%
          </span>
        )}
        {isInReview && (
          <span className="size-2 rounded-full bg-amber-400" />
        )}
      </div>

      <div className="px-2 py-2">
        <p className={cn(
          "truncate font-display text-xs font-medium",
          (isNone || isBuilding) && "text-muted-foreground",
        )}>
          {headerLabel}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-[0.6rem] text-muted-foreground">{subtitle}</p>
        )}

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <button className="nodrag mt-1.5 text-[0.65rem] font-medium text-primary hover:underline">
                {isReady ? "Open ↗" : "Details ↗"}
              </button>
            }
          />
          {open && isReady && (
            <KBReadySheetContent
              clientSlug={d.clientSlug}
              loading={fetchState.loading}
              version={fetchState.version}
              documents={fetchState.documents}
              images={fetchState.images}
            />
          )}
          {open && isNone && (
            <KBInfoSheetContent
              clientSlug={d.clientSlug}
              title="No KB set up yet"
              description="Upload documents and images to extract your brand knowledge base. Nodes will use brand context once it's ready."
              ctaLabel="Set up KB"
            />
          )}
          {open && isBuilding && (
            <KBInfoSheetContent
              clientSlug={d.clientSlug}
              title="Brand KB is building"
              description="Your Brand KB is building in the background. You can keep working — nodes will use KB context once it's ready."
              ctaLabel="View KB"
            />
          )}
          {open && isInReview && (
            <KBInfoSheetContent
              clientSlug={d.clientSlug}
              title="Needs review"
              description="KB extracted but not yet approved. Review and approve all fields to activate brand context."
              ctaLabel="Review KB"
            />
          )}
        </Sheet>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="size-4! border-2! border-card! bg-primary!"
      />
    </div>
  );
}
