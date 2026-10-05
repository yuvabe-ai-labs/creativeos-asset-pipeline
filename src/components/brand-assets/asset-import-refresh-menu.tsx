"use client";

import { ChevronDownIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IMPORT_SOURCE_LABELS, type ImportSource } from "@/lib/asset-import/constants";
import type { AssetImport } from "@/lib/asset-import/types";
import { isImportLive, useStartAssetImport } from "@/hooks/queries/asset-imports";

/** One control for re-importing (D302): every source at once, or one — each item says how that
 *  source's last import went, so the menu doubles as the status summary. */
export function AssetImportRefreshMenu({ clientId, imports }: { clientId: string; imports: AssetImport[] }) {
  const start = useStartAssetImport(clientId);
  const live = imports.some(isImportLive);

  function run(sources?: ImportSource[]) {
    start.mutate(sources, {
      onSuccess: (started) => {
        if (started.length === 0) toast.info("Add a website, Instagram or Facebook first.");
      },
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={live || start.isPending} />}>
        <RefreshCwIcon className={live ? "size-3.5 animate-spin" : "size-3.5"} strokeWidth={1.5} />
        {live ? "Importing…" : "Refresh"}
        <ChevronDownIcon className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuItem onClick={() => run()}>Refresh all sources</DropdownMenuItem>
        {imports.length > 0 && <DropdownMenuSeparator />}
        {imports.map((imp) => (
          <DropdownMenuItem key={imp.id} onClick={() => run([imp.source])} className="items-start">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span>{IMPORT_SOURCE_LABELS[imp.source]}</span>
              <span className={imp.status === "failed" ? "truncate text-xs text-destructive-text" : "truncate text-xs text-muted-foreground"}>
                {imp.status === "failed" ? (imp.error ?? "Import failed") : `${imp.assetCount} new last time`}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
