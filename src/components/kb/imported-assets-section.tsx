"use client";

import { DownloadCloudIcon, PlayIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IMPORT_SOURCES, IMPORT_SOURCE_LABELS, type ImportSource } from "@/lib/asset-import/constants";
import type { ClientBrandImageRow } from "@/lib/db/types";
import {
  isImportLive,
  useAssetImports,
  useRemoveImportedAsset,
  useStartAssetImport,
} from "@/hooks/queries/asset-imports";
import { AssetImportStatusList } from "./asset-import-status-list";

/** Brand images and videos imported from the website, Instagram and Facebook (D302). They are
 *  kept apart from uploads because the KB never analyses them (D303), so removing one is
 *  immediate rather than staged for a re-analysis. */
export function ImportedAssetsSection({ clientId }: { clientId: string }) {
  const { data } = useAssetImports(clientId);
  const start = useStartAssetImport(clientId);
  const remove = useRemoveImportedAsset(clientId);
  const imports = data?.imports ?? [];
  const assets = data?.assets ?? [];
  const anyLive = imports.some(isImportLive);

  function refresh(source?: ImportSource) {
    start.mutate(source ? [source] : undefined, {
      onSuccess: (started) => {
        if (started.length === 0) toast.info("Add a website, Instagram or Facebook first.");
      },
      onError: (e) => toast.error(e.message),
    });
  }

  function removeAsset(id: string) {
    remove.mutate(id, { onError: (e) => toast.error(e.message) });
  }

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-eyebrow text-muted-foreground">Imported from web & social</p>
        {imports.length === 0 && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => refresh()}
            disabled={start.isPending}
            className="border border-dashed border-primary/40 text-primary hover:bg-primary/5"
          >
            <DownloadCloudIcon strokeWidth={1.5} />
            Import now
          </Button>
        )}
      </div>

      <AssetImportStatusList imports={imports} onRefresh={refresh} refreshDisabled={start.isPending || anyLive} />

      {IMPORT_SOURCES.map((source) => {
        const items = assets.filter((a) => a.source === source);
        if (items.length === 0) return null;
        return (
          <div key={source} className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {IMPORT_SOURCE_LABELS[source]} · {items.length}
            </p>
            <div className="flex flex-wrap gap-2">
              {items.map((asset) => (
                <ImportedTile key={asset.id} asset={asset} onRemove={() => removeAsset(asset.id)} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function ImportedTile({ asset, onRemove }: { asset: ClientBrandImageRow; onRemove: () => void }) {
  const isVideo = asset.media_type === "video";
  const still = isVideo ? asset.thumbnail_url : asset.storage_url;
  return (
    <div className="group relative size-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
      <a href={asset.storage_url} target="_blank" rel="noreferrer" title={asset.filename} className="block size-full">
        {still ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={still} alt={asset.filename} loading="lazy" className="size-full object-cover" />
        ) : (
          <video src={asset.storage_url} preload="metadata" muted className="size-full object-cover" />
        )}
        {isVideo && (
          <span className="absolute bottom-1 left-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white">
            <PlayIcon className="size-2.5" strokeWidth={1.5} />
          </span>
        )}
      </a>
      <Button
        type="button"
        variant="ghost"
        title="Remove"
        onClick={onRemove}
        className="absolute right-0.5 top-0.5 size-5 rounded-full bg-black/60 p-0 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/60 hover:text-white dark:hover:bg-black/60"
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
}
