"use client";

import { useState } from "react";
import { AlertCircleIcon, ArrowUpIcon, DownloadCloudIcon, ImagesIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InfiniteScrollSentinel } from "@/components/shared/infinite-scroll-sentinel";
import { IMPORT_SOURCES, IMPORT_SOURCE_LABELS, type ImportSource } from "@/lib/asset-import/constants";
import type { ImportedAssetFilters } from "@/services/asset-imports.service";
import {
  isImportLive,
  useAssetImports,
  useImportedAssets,
  useRefreshImportedAssets,
  useRemoveImportedAsset,
  useStartAssetImport,
} from "@/hooks/queries/asset-imports";
import { AssetImportRefreshMenu } from "./asset-import-refresh-menu";
import { ImportedAssetTile } from "./imported-asset-tile";

const GRID = "grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6";

/**
 * The Brand assets page body (D302) — a media library: title and one Refresh menu, a notice only
 * while something is importing or has failed, one filter row, then the grid. Its own page rather
 * than a Brand KB tab: nothing here is reviewed and it never gates Mark KB Ready (D303).
 *
 * The grid is paged from the server (keyset cursor), filtered in the query, and loads the next
 * page as the sentinel nears the bottom of the page.
 */
export function BrandAssetsLibrary({ clientId }: { clientId: string }) {
  const [filters, setFilters] = useState<ImportedAssetFilters>({ source: null, media: null });
  const status = useAssetImports(clientId);
  const pages = useImportedAssets(clientId, filters);
  const refreshAssets = useRefreshImportedAssets(clientId);
  const remove = useRemoveImportedAsset(clientId);
  const start = useStartAssetImport(clientId);

  const imports = status.data?.imports ?? [];
  const counts = status.data?.counts;
  const total = counts?.total ?? 0;
  const live = imports.filter(isImportLive);
  const failed = imports.filter((i) => i.status === "failed");
  const items = pages.data?.pages.flatMap((p) => p.items) ?? [];
  const unfiltered = !filters.source && !filters.media;
  // Assets an import has added since the grid loaded — offered, not forced into view.
  const newSinceLoad =
    unfiltered && live.length > 0 && counts && pages.isSuccess && !pages.hasNextPage ? total - items.length : 0;

  const retry = (source: ImportSource) =>
    start.mutate([source], { onError: (e) => toast.error(e.message) });

  // Nothing imported and nothing running: one clear call to action instead of an empty toolbar.
  if (status.isSuccess && imports.length === 0 && total === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-16 text-center">
        <ImagesIcon className="size-8 text-muted-foreground/50" strokeWidth={1.5} />
        <div>
          <p className="font-medium">No brand assets yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Import images and videos from the brand&apos;s website, Instagram and Facebook.
          </p>
        </div>
        <Button
          size="sm"
          disabled={start.isPending}
          onClick={() =>
            start.mutate(undefined, {
              onSuccess: (s) => s.length === 0 && toast.info("Add a website, Instagram or Facebook first."),
              onError: (e) => toast.error(e.message),
            })
          }
        >
          <DownloadCloudIcon className="size-4" strokeWidth={1.5} />
          Import assets
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Brand assets
            {total > 0 && <span className="ml-2.5 text-base font-normal text-muted-foreground tabular-nums">{total}</span>}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            From the brand&apos;s website and socials — kept as assets, not analysed by the KB.
          </p>
        </div>
        <AssetImportRefreshMenu clientId={clientId} imports={imports} />
      </header>

      {(live.length > 0 || failed.length > 0) && (
        <ul className="space-y-1.5">
          {live.map((imp) => (
            <li key={imp.id} className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
              {imp.phaseMessage ?? `Importing from ${IMPORT_SOURCE_LABELS[imp.source]}…`}
            </li>
          ))}
          {failed.map((imp) => (
            <li key={imp.id} className="flex items-center gap-2 text-sm">
              <AlertCircleIcon className="size-3.5 shrink-0 text-destructive-text" strokeWidth={1.5} />
              <span className="font-medium">{IMPORT_SOURCE_LABELS[imp.source]}</span>
              <span className="min-w-0 truncate text-muted-foreground">{imp.error ?? "Import failed"}</span>
              <Button variant="link" size="xs" className="h-auto px-0" disabled={start.isPending} onClick={() => retry(imp.source)}>
                Retry
              </Button>
            </li>
          ))}
        </ul>
      )}

      {counts && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1">
            <FilterChip active={!filters.source} onClick={() => setFilters((f) => ({ ...f, source: null }))}>
              All <Count n={total} />
            </FilterChip>
            {IMPORT_SOURCES.filter((s) => counts.bySource[s] > 0).map((s) => (
              <FilterChip key={s} active={filters.source === s} onClick={() => setFilters((f) => ({ ...f, source: s }))}>
                {IMPORT_SOURCE_LABELS[s]} <Count n={counts.bySource[s]} />
              </FilterChip>
            ))}
          </div>
          <Tabs
            value={filters.media ?? "all"}
            onValueChange={(v) => setFilters((f) => ({ ...f, media: v === "all" ? null : (v as "image" | "video") }))}
          >
            <TabsList>
              <TabsTrigger value="all" className="px-2.5 text-xs">All</TabsTrigger>
              <TabsTrigger value="image" className="px-2.5 text-xs">Images</TabsTrigger>
              <TabsTrigger value="video" className="px-2.5 text-xs">Videos</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}

      {newSinceLoad > 0 && (
        <div className="flex justify-center">
          <Button size="xs" variant="outline" className="rounded-full shadow-card" onClick={() => void refreshAssets()}>
            <ArrowUpIcon strokeWidth={1.5} />
            {newSinceLoad} new {newSinceLoad === 1 ? "asset" : "assets"}
          </Button>
        </div>
      )}

      {items.length > 0 ? (
        <>
          <div className={GRID}>
            {items.map((asset) => (
              <ImportedAssetTile
                key={asset.id}
                asset={asset}
                onRemove={() => remove.mutate(asset.id, { onError: (e) => toast.error(e.message) })}
              />
            ))}
          </div>
          {pages.hasNextPage && (
            // Keyed by page count so each new page re-observes: a page too short to scroll would
            // otherwise leave the sentinel visible with no further intersection change.
            <InfiniteScrollSentinel
              key={pages.data?.pages.length ?? 0}
              loading={pages.isFetchingNextPage}
              onVisible={() => {
                if (!pages.isFetchingNextPage) void pages.fetchNextPage();
              }}
            />
          )}
        </>
      ) : pages.isPending || (live.length > 0 && unfiltered) ? (
        <div className={GRID}>
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-md" />
          ))}
        </div>
      ) : pages.isError ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Couldn&apos;t load the brand assets.{" "}
          <Button variant="link" size="xs" className="h-auto px-0" onClick={() => void pages.refetch()}>
            Try again
          </Button>
        </p>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">Nothing matches these filters.</p>
      )}
    </div>
  );
}

function Count({ n }: { n: number }) {
  return <span className="tabular-nums text-muted-foreground">{n}</span>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "secondary" : "ghost"}
      aria-pressed={active}
      onClick={onClick}
      className={cn("gap-1.5 rounded-full px-2.5", !active && "text-muted-foreground")}
    >
      {children}
    </Button>
  );
}
