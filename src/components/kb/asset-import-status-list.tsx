"use client";

import { AlertCircleIcon, CheckIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IMPORT_SOURCE_LABELS, type ImportSource } from "@/lib/asset-import/constants";
import type { AssetImport } from "@/lib/asset-import/types";
import { isImportLive } from "@/hooks/queries/asset-imports";

type Props = {
  imports: AssetImport[];
  /** Omit to show status only (no Refresh / Retry). */
  onRefresh?: (source: ImportSource) => void;
  refreshDisabled?: boolean;
};

/** One line per source: importing, done (with Refresh), or failed (with Retry). */
export function AssetImportStatusList({ imports, onRefresh, refreshDisabled }: Props) {
  if (imports.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {imports.map((imp) => (
        <li key={imp.id} className="flex items-center gap-2 text-xs">
          <StatusIcon imp={imp} />
          <span className="font-medium text-foreground">{IMPORT_SOURCE_LABELS[imp.source]}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground" title={imp.error ?? undefined}>
            {describe(imp)}
          </span>
          {onRefresh && !isImportLive(imp) && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
              disabled={refreshDisabled}
              onClick={() => onRefresh(imp.source)}
            >
              <RefreshCwIcon className="size-3" strokeWidth={1.5} />
              {imp.status === "failed" ? "Retry" : "Refresh"}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

function StatusIcon({ imp }: { imp: AssetImport }) {
  if (isImportLive(imp)) {
    return <span className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent text-muted-foreground" />;
  }
  if (imp.status === "failed") {
    return <AlertCircleIcon className="size-3.5 shrink-0 text-destructive" strokeWidth={1.5} />;
  }
  return <CheckIcon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />;
}

function describe(imp: AssetImport): string {
  if (isImportLive(imp)) return imp.phaseMessage ?? "Importing…";
  if (imp.status === "failed") return imp.error ?? "Import failed";
  return imp.phaseMessage ?? `${imp.assetCount} new`;
}
