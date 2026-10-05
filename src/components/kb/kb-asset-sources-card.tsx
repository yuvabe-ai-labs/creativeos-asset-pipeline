"use client";

import { useState } from "react";
import { DownloadCloudIcon, LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { brandKitService } from "@/services/brand-kit.service";
import { isImportLive, useAssetImports, useStartAssetImport } from "@/hooks/queries/asset-imports";
import { KBSocialHandleFields } from "./kb-social-handle-fields";
import { AssetImportStatusList } from "./asset-import-status-list";

type Props = {
  clientId: string;
  websiteUrl: string | null;
  initialInstagram: string | null;
  initialFacebook: string | null;
};

/** Where the brand assets come from (D302): the website (edited with the source files), the
 *  Instagram and Facebook handles, and each source's latest import with Refresh / Retry. */
export function KBAssetSourcesCard({ clientId, websiteUrl, initialInstagram, initialFacebook }: Props) {
  const [instagram, setInstagram] = useState(initialInstagram ?? "");
  const [facebook, setFacebook] = useState(initialFacebook ?? "");
  const [saved, setSaved] = useState({ instagram: initialInstagram ?? "", facebook: initialFacebook ?? "" });
  const [saving, setSaving] = useState(false);
  const { data } = useAssetImports(clientId);
  const start = useStartAssetImport(clientId);

  const imports = data?.imports ?? [];
  const anyLive = imports.some(isImportLive);
  const dirty = instagram.trim() !== saved.instagram || facebook.trim() !== saved.facebook;
  const busy = saving || start.isPending || anyLive;

  async function importAll() {
    setSaving(true);
    try {
      if (dirty) {
        const next = { instagram: instagram.trim(), facebook: facebook.trim() };
        await brandKitService.patchDetails(clientId, next);
        setSaved(next);
      }
      const started = await start.mutateAsync(undefined);
      if (started.length === 0) toast.info("Add a website, Instagram or Facebook first.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the import.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-2 text-sm">
        <LinkIcon className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
        <span className="font-medium">Website</span>
        <span className="min-w-0 truncate text-muted-foreground">
          {websiteUrl ?? "Not set — add it under Source files"}
        </span>
      </div>

      <KBSocialHandleFields
        instagram={instagram}
        facebook={facebook}
        onInstagramChange={setInstagram}
        onFacebookChange={setFacebook}
        disabled={busy}
      />

      <AssetImportStatusList
        imports={imports}
        onRefresh={(source) =>
          start.mutate([source], { onError: (e) => toast.error(e.message) })
        }
        refreshDisabled={busy}
      />

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={importAll} disabled={busy}>
          <DownloadCloudIcon className="size-4" strokeWidth={1.5} />
          {anyLive ? "Importing…" : dirty ? "Save & import" : imports.length > 0 ? "Refresh all" : "Import"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Last 50 posts from the past 3 months, plus the website&apos;s images and videos. Runs in the background.
        </p>
      </div>
    </Card>
  );
}
