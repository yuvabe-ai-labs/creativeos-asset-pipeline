"use client";

import { DownloadCloudIcon, ImagesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ImportSource } from "@/lib/asset-import/constants";
import { isImportLive, useAssetImports, useStartAssetImport } from "@/hooks/queries/asset-imports";
import { AssetImportStatusList } from "./asset-import-status-list";

/** The source drawer's summary of imported brand assets (D302): status per source and a way to
 *  the Brand assets tab, where the assets themselves are browsed a page at a time. They are not
 *  KB sources — the KB never analyses them (D303) — so this stays a pointer, not a second grid. */
export function ImportedAssetsSection({ clientId, onOpenAssets }: { clientId: string; onOpenAssets?: () => void }) {
  const { data } = useAssetImports(clientId);
  const start = useStartAssetImport(clientId);
  const imports = data?.imports ?? [];
  const total = data?.counts.total ?? 0;
  const anyLive = imports.some(isImportLive);

  function refresh(source?: ImportSource) {
    start.mutate(source ? [source] : undefined, {
      onSuccess: (started) => {
        if (started.length === 0) toast.info("Add a website, Instagram or Facebook first.");
      },
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <p className="text-eyebrow text-muted-foreground">Imported from web & social</p>
      <AssetImportStatusList imports={imports} onRefresh={refresh} refreshDisabled={start.isPending || anyLive} />
      <div className="flex flex-wrap gap-2">
        {total > 0 && onOpenAssets && (
          <Button type="button" variant="outline" size="xs" onClick={onOpenAssets}>
            <ImagesIcon strokeWidth={1.5} />
            View {total} brand assets
          </Button>
        )}
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
    </section>
  );
}
