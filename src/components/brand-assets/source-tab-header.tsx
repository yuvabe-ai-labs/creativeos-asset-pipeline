"use client";

import { useState } from "react";
import { AlertCircleIcon, LinkIcon, PencilIcon, PlugIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { IMPORT_SOURCE_LABELS, type ImportSource } from "@/lib/asset-import/constants";
import { importTargetLabel } from "@/lib/asset-import/utils";
import type { AssetImport } from "@/lib/asset-import/types";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { isImportLive, useStartAssetImport } from "@/hooks/queries/asset-imports";
import { SourceHandleForm } from "./source-handle-form";

type Props = {
  clientId: string;
  source: ImportSource;
  target: string | null;
  lastImport: AssetImport | undefined;
  /** Assets this source already has. */
  count: number;
};

/**
 * The top of one source's tab (D302): where it imports from — editable in place — and how the
 * last import went, with Refresh. A source with nothing to show gets a centred panel instead:
 * connect it, or read why it failed and fix the handle or retry.
 */
export function SourceTabHeader({ clientId, source, target, lastImport, count }: Props) {
  const [editing, setEditing] = useState(false);
  const start = useStartAssetImport(clientId);
  const label = IMPORT_SOURCE_LABELS[source];
  const live = lastImport ? isImportLive(lastImport) : false;
  const failed = lastImport?.status === "failed";

  const refresh = () =>
    start.mutate([source], { onError: (e) => toast.error(e.message) });

  // Not connected, nothing imported: connect it.
  if (!target && count === 0) {
    return (
      <Panel icon={<PlugIcon className="size-6" strokeWidth={1.5} />} title={`Connect ${label}`}>
        <p>
          {source === "website"
            ? "Add the brand's website to import its images and videos."
            : `Add the brand's ${label} to import its last 3 months of posts.`}
        </p>
        <div className="mt-4 flex justify-center">
          <SourceHandleForm clientId={clientId} source={source} target={null} />
        </div>
      </Panel>
    );
  }

  // Failed with nothing to show: say why, offer the fix.
  if (failed && count === 0 && !editing) {
    return (
      <Panel icon={<AlertCircleIcon className="size-6 text-destructive-text" strokeWidth={1.5} />} title={lastImport?.error ?? "The import failed"}>
        {target && <p>We looked at {importTargetLabel(target)}.</p>}
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <PencilIcon className="size-3.5" strokeWidth={1.5} />
            Change {source === "website" ? "address" : "handle"}
          </Button>
          <Button size="sm" onClick={refresh} disabled={start.isPending}>
            <RefreshCwIcon className="size-3.5" strokeWidth={1.5} />
            Try again
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-card">
      {editing ? (
        <SourceHandleForm
          clientId={clientId}
          source={source}
          target={target}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            {target ? (
              <a href={target} target="_blank" rel="noreferrer" className="truncate font-medium hover:underline hover:underline-offset-4">
                {importTargetLabel(target)}
              </a>
            ) : (
              <span className="text-muted-foreground">Not connected</span>
            )}
            <Button variant="ghost" size="icon-xs" title={target ? "Change" : "Connect"} aria-label={target ? `Change ${label}` : `Connect ${label}`} onClick={() => setEditing(true)}>
              <PencilIcon strokeWidth={1.5} />
            </Button>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Status lastImport={lastImport} count={count} />
            {target && (
              <Button variant="outline" size="sm" onClick={refresh} disabled={live || start.isPending}>
                <RefreshCwIcon className={live ? "size-3.5 animate-spin" : "size-3.5"} strokeWidth={1.5} />
                {live ? "Importing" : "Refresh"}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Status({ lastImport, count }: { lastImport: AssetImport | undefined; count: number }) {
  if (!lastImport) return <span>{count} assets</span>;
  if (isImportLive(lastImport)) return <span>{lastImport.phaseMessage ?? "Importing…"}</span>;
  if (lastImport.status === "failed") {
    return (
      <span className="flex items-center gap-1.5 text-destructive-text">
        <AlertCircleIcon className="size-3.5" strokeWidth={1.5} />
        {lastImport.error ?? "The last import failed"}
      </span>
    );
  }
  return (
    <span>
      {count} assets · updated {formatRelativeTime(lastImport.finishedAt ?? lastImport.createdAt)}
    </span>
  );
}

function Panel({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border px-6 py-14 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <p className="mt-3 font-medium">{title}</p>
      <div className="mt-1 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}
