# KB Status Awareness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every canvas a KB node from day one, make the KB node reflect live KB status (4 states), and show a KB banner on the client home page when KB isn't ready.

**Architecture:** Expand the `kbStatus` Zustand store field to include `'in_review'`, thread a new `clientKbStatus` prop from the canvas page down to `CanvasKBStatus` so it can derive `'in_review'` without polling, always seed KB+Script+edge on canvas creation regardless of KB state, rewrite `KBNode` to read `kbStatus` from the store rather than its own data, and add a `KBStatusBanner` server component to the client home page.

**Tech Stack:** Next.js App Router (server components + server actions), Zustand vanilla store, React Flow (`@xyflow/react`), TypeScript, Tailwind CSS (semantic tokens only), Lucide icons, shadcn/ui

---

## File Map

| Action | File |
|---|---|
| Modify | `src/lib/canvas-store.ts` |
| Modify | `src/components/canvas/canvas-kb-status.tsx` |
| Modify | `src/components/canvas/canvas.tsx` |
| Modify | `src/app/clients/[id]/canvases/[cid]/page.tsx` |
| Modify | `src/lib/actions/canvases.ts` |
| Modify | `src/components/nodes/kb-node.tsx` |
| Create | `src/components/clients/kb-status-banner.tsx` |
| Modify | `src/app/clients/[id]/page.tsx` |

---

## Task 1: Expand `kbStatus` store to include `'in_review'`

**Files:**
- Modify: `src/lib/canvas-store.ts` (lines 41–44, 251–254)

- [ ] **Step 1: Update the `kbStatus` union type and setter**

In `src/lib/canvas-store.ts`, change every occurrence of `'none' | 'building' | 'ready'` to `'none' | 'building' | 'in_review' | 'ready'`:

```typescript
// Line 41 — in CanvasState type:
kbStatus: 'none' | 'building' | 'in_review' | 'ready';
setKbStatus: (status: 'none' | 'building' | 'in_review' | 'ready') => void;
```

The initial value at line 251 stays `'none'` — no change needed there.

- [ ] **Step 2: Verify TypeScript compiles**

```
cd e:\CreativeOS\creativeos-mvp
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing unrelated errors — none touching `kbStatus`).

- [ ] **Step 3: Commit**

```
git add src/lib/canvas-store.ts
git commit -m "feat: expand kbStatus union to include in_review"
```

---

## Task 2: Thread `clientKbStatus` through canvas page → Canvas → CanvasKBStatus

**Files:**
- Modify: `src/app/clients/[id]/canvases/[cid]/page.tsx`
- Modify: `src/components/canvas/canvas.tsx`
- Modify: `src/components/canvas/canvas-kb-status.tsx`

The canvas page already fetches `client` (which has `kb_status`). We pass it down as `clientKbStatus` so `CanvasKBStatus` can derive `'in_review'` without an extra fetch.

- [ ] **Step 1: Add `clientKbStatus` prop to `CanvasKBStatus` and update derivation**

Replace the entire `src/components/canvas/canvas-kb-status.tsx` with:

```typescript
"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import { useKBJobStatus } from "@/components/kb/use-kb-job-status";
import { useCanvasStore } from "./canvas-store-provider";
import type { ClientKBJobRow } from "@/lib/db/types";

const NON_TERMINAL = new Set(["queued", "researching", "extracting", "finalizing"]);

type Props = {
  clientId: string;
  initialJob: ClientKBJobRow | null;
  hasActiveKB: boolean;
  clientKbStatus: "pending" | "in_review" | "ready";
};

export function CanvasKBStatus({ clientId, initialJob, hasActiveKB, clientKbStatus }: Props) {
  const job = useKBJobStatus(clientId, initialJob);
  const setKbStatus = useCanvasStore((s) => s.setKbStatus);
  const setKbJustReady = useCanvasStore((s) => s.setKbJustReady);
  const prevStatus = useRef<string | null>(initialJob?.status ?? null);

  useEffect(() => {
    if (job && NON_TERMINAL.has(job.status)) {
      setKbStatus("building");
    } else if (hasActiveKB && clientKbStatus === "ready") {
      setKbStatus("ready");
    } else if (hasActiveKB && clientKbStatus === "in_review") {
      setKbStatus("in_review");
    } else {
      setKbStatus("none");
    }
  }, [job, hasActiveKB, clientKbStatus, setKbStatus]);

  useEffect(() => {
    if (!job) return;
    if (prevStatus.current !== "succeeded" && job.status === "succeeded") {
      toast.success("Brand KB is ready! Your brand context is now active.", {
        icon: <CheckCircle2 className="size-4 text-green-500" />,
        duration: 4000,
      });
      setKbStatus("ready");
      setKbJustReady(true);
      const timer = setTimeout(() => setKbJustReady(false), 2500);
      prevStatus.current = job.status;
      return () => clearTimeout(timer);
    }
    prevStatus.current = job.status;
  }, [job?.status, setKbStatus, setKbJustReady]);

  return null;
}

export function CanvasKBBadge() {
  const kbStatus = useCanvasStore((s) => s.kbStatus);
  if (kbStatus !== "building") return null;
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
      <span className="size-2 animate-spin rounded-full border border-current border-t-transparent" />
      KB building…
    </div>
  );
}
```

- [ ] **Step 2: Add `clientKbStatus` prop to `Canvas` component**

In `src/components/canvas/canvas.tsx`, update the props interface and forward the prop to `CanvasKBStatus`:

```typescript
// Change the props destructuring (around line 53):
export function Canvas({
  canvasId,
  clientId,
  initialKBJob,
  hasActiveKB,
  clientKbStatus,
}: {
  canvasId: string;
  clientId: string;
  initialKBJob: ClientKBJobRow | null;
  hasActiveKB: boolean;
  clientKbStatus: "pending" | "in_review" | "ready";
}) {
```

Then in the JSX where `CanvasKBStatus` is rendered (around line 294), add the new prop:

```tsx
<CanvasKBStatus
  clientId={clientId}
  initialJob={initialKBJob}
  hasActiveKB={hasActiveKB}
  clientKbStatus={clientKbStatus}
/>
```

- [ ] **Step 3: Pass `clientKbStatus` from the canvas page**

In `src/app/clients/[id]/canvases/[cid]/page.tsx`, `client` is already fetched and has `kb_status`. Pass it to `<Canvas>`:

```tsx
<Canvas
  canvasId={canvas.id}
  clientId={client.id}
  initialKBJob={latestKBJob}
  hasActiveKB={activeKBVersion !== null}
  clientKbStatus={client.kb_status}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

```
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors touching `clientKbStatus`.

- [ ] **Step 5: Commit**

```
git add src/components/canvas/canvas-kb-status.tsx src/components/canvas/canvas.tsx src/app/clients/[id]/canvases/[cid]/page.tsx
git commit -m "feat: thread clientKbStatus into CanvasKBStatus for in_review derivation"
```

---

## Task 3: Always seed KB + Script + edge on canvas creation

**Files:**
- Modify: `src/lib/actions/canvases.ts`

Currently `createCanvasAction` only seeds nodes when `activeKB` exists. Change it to always seed both nodes and the edge, with null KB data when there's no active KB.

- [ ] **Step 1: Rewrite `createCanvasAction` seeding logic**

Replace the entire `src/lib/actions/canvases.ts` with:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { createCanvas } from "@/lib/db/canvases";
import { getActiveKBVersion } from "@/lib/db/kb";
import { saveCanvasNodes } from "@/lib/db/nodes";
import { saveCanvasEdges } from "@/lib/db/edges";
import type { TraceableBrandKB } from "@/lib/kb/schema";

export async function createCanvasAction(input: {
  clientId: string;
  clientSlug: string;
  name: string;
}) {
  const name = input.name?.trim();
  if (!name) throw new Error("Canvas needs a name");

  const canvas = await createCanvas({ clientId: input.clientId, name });

  const activeKB = await getActiveKBVersion(input.clientId);
  const kbNodeId = crypto.randomUUID();
  const scriptNodeId = crypto.randomUUID();

  const kbNodeData = activeKB
    ? (() => {
        const kb = activeKB.output as TraceableBrandKB;
        return {
          clientId: input.clientId,
          clientSlug: input.clientSlug,
          kbVersionId: activeKB.id,
          brandName: kb.brand?.value ?? kb.brand_profile?.brand_name?.value ?? null,
          fillRate: activeKB.fill_rate,
          extractedAt: activeKB.created_at,
        };
      })()
    : {
        clientId: input.clientId,
        clientSlug: input.clientSlug,
        kbVersionId: null,
        brandName: null,
        fillRate: null,
        extractedAt: null,
      };

  await saveCanvasNodes(canvas.id, [
    {
      id: kbNodeId,
      type: "kb",
      position: { x: 80, y: 120 },
      data: kbNodeData,
    },
    {
      id: scriptNodeId,
      type: "script",
      position: { x: 360, y: 120 },
      data: { title: "" },
    },
  ]);

  await saveCanvasEdges(canvas.id, [
    {
      id: crypto.randomUUID(),
      source: kbNodeId,
      target: scriptNodeId,
    },
  ]);

  revalidatePath(`/clients/${input.clientSlug}`);
  return canvas;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
git add src/lib/actions/canvases.ts
git commit -m "feat: always seed KB + Script + edge on canvas creation"
```

---

## Task 4: Rewrite KBNode with 4 visual states

**Files:**
- Modify: `src/components/nodes/kb-node.tsx`

`KBNode` currently infers state from its own `data.kbVersionId`. Instead it must read `kbStatus` from the Zustand store and render 4 distinct visual states. The `'ready'` state keeps the existing sheet. The other three states show read-only info panels.

- [ ] **Step 1: Replace `KBNode` and related helpers**

Replace the entire `src/components/nodes/kb-node.tsx` with:

```typescript
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

// ── Ready sheet (current full content) ───────────────────────────────────────

function KBReadySheetContent({
  clientId,
  clientSlug,
  loading,
  version,
  documents,
  images,
}: {
  clientId: string;
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
  phaseMessage,
}: {
  clientSlug: string;
  title: string;
  description: string;
  ctaLabel: string;
  phaseMessage?: string | null;
}) {
  return (
    <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
      <SheetHeader className="border-b p-5 pr-12">
        <SheetTitle className="font-display text-xl">Brand KB</SheetTitle>
        <SheetDescription>{title}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <p className="text-sm text-muted-foreground">{description}</p>
        {phaseMessage && (
          <p className="text-xs text-muted-foreground">{phaseMessage}</p>
        )}
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
  const phaseMessage = useCanvasStore((s) =>
    s.nodes.find((n) => n.id === id) ? null : null
  );

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

  // ── Visual state derivation ──────────────────────────────────────────────

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
    : d.brandName ?? "Brand KB";

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
        kbJustReady && "ring-2 ring-green-400 ring-offset-1 ring-offset-background animate-pulse",
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
            <BookOpenIcon className={cn("size-3", isNone ? "text-muted-foreground" : isInReview ? "text-amber-500" : "text-primary")} />
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
              clientId={d.clientId}
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
              phaseMessage={phaseMessage}
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
```

Note: The `phaseMessage` derivation above uses a placeholder pattern — we don't store phase message per-node. Replace those three lines with a direct store selector:

```typescript
// Replace the phaseMessage line with:
const kbPhaseMessage = useCanvasStore((s) =>
  s.nodes
    .find((n) => n.type === "kb")
    ?.data as { phaseMessage?: string } | undefined
)?.phaseMessage ?? null;
```

Actually, looking at the store, `phaseMessage` is on the job row from `useKBJobStatus`, not the store. For the `KBInfoSheetContent` building panel, pass `null` for `phaseMessage` — the phase message is shown in the `CanvasKBBadge` in the toolbar, not the node sheet. Remove the `phaseMessage` store selector entirely and pass `phaseMessage={null}` to the building sheet:

```typescript
// In KBNode, remove the phaseMessage selector entirely.
// In the JSX, change:
{open && isBuilding && (
  <KBInfoSheetContent
    clientSlug={d.clientSlug}
    title="Brand KB is building"
    description="Your Brand KB is building in the background. You can keep working — nodes will use KB context once it's ready."
    ctaLabel="View KB"
    phaseMessage={null}
  />
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
git add src/components/nodes/kb-node.tsx
git commit -m "feat: kb-node 4 visual states reading from Zustand kbStatus"
```

---

## Task 5: Create `KBStatusBanner` component

**Files:**
- Create: `src/components/clients/kb-status-banner.tsx`

This is a server-renderable component (no `"use client"` — it's pure JSX, receives props from the server page).

- [ ] **Step 1: Create the file**

Create `src/components/clients/kb-status-banner.tsx`:

```typescript
import Link from "next/link";

type Props = {
  kbStatus: "pending" | "in_review" | "ready";
  clientSlug: string;
};

export function KBStatusBanner({ kbStatus, clientSlug }: Props) {
  if (kbStatus === "ready") return null;

  const isPending = kbStatus === "pending";

  return (
    <div
      className={`mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
        isPending
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-blue-200 bg-blue-50 text-blue-800"
      }`}
    >
      <span className="mt-0.5 shrink-0 text-base leading-none">
        {isPending ? "⚠" : "ℹ"}
      </span>
      <div className="flex-1">
        <p className="font-medium">
          {isPending
            ? "Your Brand KB isn't set up yet."
            : "Your Brand KB needs review."}
        </p>
        <p className="mt-0.5 text-xs opacity-80">
          {isPending
            ? "Set it up for best results when generating content."
            : "Approve all fields to activate brand context across your canvases."}
        </p>
      </div>
      <Link
        href={`/clients/${clientSlug}/kb`}
        className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
          isPending
            ? "bg-amber-700 text-white hover:bg-amber-800"
            : "bg-blue-700 text-white hover:bg-blue-800"
        }`}
      >
        {isPending ? "Set up KB" : "Review KB"}
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
git add src/components/clients/kb-status-banner.tsx
git commit -m "feat: add KBStatusBanner component"
```

---

## Task 6: Render `KBStatusBanner` on the client home page

**Files:**
- Modify: `src/app/clients/[id]/page.tsx`

- [ ] **Step 1: Import and render `KBStatusBanner` between header and canvases**

In `src/app/clients/[id]/page.tsx`:

1. Add the import at the top:

```typescript
import { KBStatusBanner } from "@/components/clients/kb-status-banner";
```

2. In the JSX, add the banner between the `</header>` closing tag and the canvases section. The section currently looks like (around line 115):

```tsx
      </header>

      {canvases.length === 0 ? (
```

Change it to:

```tsx
      </header>

      <KBStatusBanner kbStatus={client.kb_status} clientSlug={client.slug} />

      {canvases.length === 0 ? (
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

1. Navigate to a client whose `kb_status === 'pending'` — confirm amber warning banner appears above the canvases section.
2. Navigate to a client whose `kb_status === 'in_review'` — confirm blue info banner appears.
3. Navigate to a client whose `kb_status === 'ready'` — confirm no banner appears.

- [ ] **Step 4: Commit**

```
git add src/app/clients/[id]/page.tsx
git commit -m "feat: render KBStatusBanner on client home page"
```

---

## Self-Review Checklist

Before submitting, verify:

- [ ] `kbStatus` union is `'none' | 'building' | 'in_review' | 'ready'` in store (Task 1)
- [ ] `CanvasKBStatus` derivation: job in NON_TERMINAL → `'building'`; `hasActiveKB && clientKbStatus === 'ready'` → `'ready'`; `hasActiveKB && clientKbStatus === 'in_review'` → `'in_review'`; else → `'none'` (Task 2)
- [ ] `clientKbStatus` flows: canvas page → `<Canvas>` → `<CanvasKBStatus>` (Task 2)
- [ ] New canvases always get KB + Script + edge, KB node data is null-safe when no active KB (Task 3)
- [ ] KB node reads `kbStatus` from store, not from `data.kbVersionId` (Task 4)
- [ ] All 4 KB node states have distinct visuals per spec (Task 4)
- [ ] `kbJustReady` pulse ring still fires on `'ready'` transition (Task 4 — the `animate-pulse` ring class is applied when `kbJustReady` is true)
- [ ] `KBStatusBanner` hidden when `kb_status === 'ready'` (Task 5)
- [ ] Banner uses amber for `'pending'`, blue for `'in_review'` (Task 5)
- [ ] Banner placed between `<header>` and canvases section (Task 6)
