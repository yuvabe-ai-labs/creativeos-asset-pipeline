"use client";

import { useState } from "react";
import { ArrowUpIcon, ImagesIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { InfiniteScrollSentinel } from "@/components/shared/infinite-scroll-sentinel";
import { IMPORT_SOURCES, IMPORT_SOURCE_LABELS, type ImportSource } from "@/lib/asset-import/constants";
import type { ImportedAssetFilters } from "@/services/asset-imports.service";
import {
  isImportLive,
  useAssetImports,
  useImportedAssets,
  useRefreshImportedAssets,
  useRemoveImportedAsset,
} from "@/hooks/queries/asset-imports";
import { KBAssetSourcesCard } from "./kb-asset-sources-card";
import { ImportedAssetTile } from "./imported-asset-tile";

const GRID = "grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6";

type Props = {
  clientId: string;
  websiteUrl: string | null;
  initialInstagram: string | null;
  initialFacebook: string | null;
};

/**
 * The Brand KB's "Brand assets" tab (D302): what was imported from the website and socials, and
 * the controls to import more. Not a KB module — nothing here is reviewed, and it never gates
 * Mark KB Ready, because imported assets are not analysed (D303).
 *
 * The grid is paged from the server (keyset cursor) and loads the next page as the sentinel
 * nears the bottom of the scroll area; filters are applied in the query, not to loaded rows.
 */
export function KBBrandAssetsTab(props: Props) {
  const { clientId } = props;
  const [filters, setFilters] = useState<ImportedAssetFilters>({ source: null, media: null });
  const status = useAssetImports(clientId);
  const pages = useImportedAssets(clientId, filters);
  const refreshAssets = useRefreshImportedAssets(clientId);
  const remove = useRemoveImportedAsset(clientId);

  const counts = status.data?.counts;
  const anyLive = (status.data?.imports ?? []).some(isImportLive);
  const items = pages.data?.pages.flatMap((p) => p.items) ?? [];
  const pageCount = pages.data?.pages.length ?? 0;
  // While an import runs its assets land in the database page by page; rather than re-reading
  // every loaded page on each poll, offer them (the pages refetch on their own when it settles).
  const unfiltered = !filters.source && !filters.media;
  const newSinceLoad =
    unfiltered && anyLive && counts && pages.isSuccess && !pages.hasNextPage ? counts.total - items.length : 0;

  const setSource = (source: ImportSource | null) => setFilters((f) => ({ ...f, source }));
  const setMedia = (media: "image" | "video" | null) => setFilters((f) => ({ ...f, media }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Brand assets</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Imported from the brand&apos;s website and socials. Kept as assets — the KB doesn&apos;t analyse them.
          </p>
        </div>
        {counts && <span className="shrink-0 text-xs text-muted-foreground">{counts.total} assets</span>}
      </div>

      <KBAssetSourcesCard
        clientId={clientId}
        websiteUrl={props.websiteUrl}
        initialInstagram={props.initialInstagram}
        initialFacebook={props.initialFacebook}
      />

      {counts && counts.total > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={!filters.source} onClick={() => setSource(null)}>
            All · {counts.total}
          </FilterChip>
          {IMPORT_SOURCES.filter((s) => counts.bySource[s] > 0).map((s) => (
            <FilterChip key={s} active={filters.source === s} onClick={() => setSource(s)}>
              {IMPORT_SOURCE_LABELS[s]} · {counts.bySource[s]}
            </FilterChip>
          ))}
          <span className="mx-1.5 h-4 w-px bg-border" />
          <FilterChip active={!filters.media} onClick={() => setMedia(null)}>
            Images & videos
          </FilterChip>
          <FilterChip active={filters.media === "image"} onClick={() => setMedia("image")}>
            Images · {counts.byMedia.image}
          </FilterChip>
          <FilterChip active={filters.media === "video"} onClick={() => setMedia("video")}>
            Videos · {counts.byMedia.video}
          </FilterChip>
        </div>
      )}

      {newSinceLoad > 0 && (
        <div className="flex justify-center">
          <Button type="button" size="xs" variant="outline" className="rounded-full shadow-card" onClick={() => void refreshAssets()}>
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
                size="fill"
                asset={asset}
                onRemove={() => remove.mutate(asset.id, { onError: (e) => toast.error(e.message) })}
              />
            ))}
          </div>
          {pages.hasNextPage && (
            // Keyed by page count so each new page re-observes: a page too short to scroll would
            // otherwise leave the sentinel visible with no further intersection change.
            <InfiniteScrollSentinel
              key={pageCount}
              scrollRoot="nearest"
              loading={pages.isFetchingNextPage}
              onVisible={() => {
                if (!pages.isFetchingNextPage) void pages.fetchNextPage();
              }}
            />
          )}
        </>
      ) : pages.isPending || (anyLive && unfiltered) ? (
        <div className={GRID}>
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-md" />
          ))}
        </div>
      ) : pages.isError ? (
        <EmptyNote>
          Couldn&apos;t load the brand assets.{" "}
          <Button type="button" variant="link" size="xs" onClick={() => void pages.refetch()}>
            Try again
          </Button>
        </EmptyNote>
      ) : (
        <EmptyNote>{counts && counts.total > 0 ? "Nothing matches these filters." : "No brand assets imported yet."}</EmptyNote>
      )}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
      <ImagesIcon className="size-7 text-muted-foreground/50" strokeWidth={1.5} />
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      size="xs"
      variant={active ? "secondary" : "ghost"}
      aria-pressed={active}
      onClick={onClick}
      className={cn("rounded-full", !active && "text-muted-foreground")}
    >
      {children}
    </Button>
  );
}
