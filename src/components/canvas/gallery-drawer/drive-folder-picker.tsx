"use client";

import { useEffect, useState } from "react";
import { Folder, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DriveFoldersResponse } from "@/app/api/drive/folders/route";

type FolderItem = DriveFoldersResponse["items"][number];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onLinked: (folder: { id: string; name: string }) => void;
};

export function DriveFolderPicker({ open, onOpenChange, clientId, onLinked }: Props) {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selected, setSelected] = useState<FolderItem | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setLoadError(false);
    setLoading(true);
    fetch("/api/drive/folders")
      .then((r) => r.json())
      .then((data: DriveFoldersResponse) => {
        setFolders(data.items ?? []);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, [open]);

  async function handleLink() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/drive-folder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveRootFolderId: selected.id }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onLinked({ id: selected.id, name: selected.name });
      onOpenChange(false);
    } catch {
      // leave modal open, user can retry
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Link a Drive folder</DialogTitle>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto">
          {loading && (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" strokeWidth={1.5} />
            </div>
          )}
          {loadError && (
            <div className="flex h-24 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm text-muted-foreground">Couldn&apos;t load folders.</p>
              <Button variant="link" size="sm" onClick={() => { setLoadError(false); setLoading(true); }}>
                Retry
              </Button>
            </div>
          )}
          {!loading && !loadError && folders.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">No folders found in your Drive.</p>
          )}
          {!loading && !loadError && folders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelected(f)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-50 ${
                selected?.id === f.id ? "bg-primary/5 ring-1 ring-primary/30" : ""
              }`}
            >
              <Folder className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
              <span className="flex-1 truncate text-sm">{f.name}</span>
              {f.isShared && (
                <Badge variant="secondary" className="text-xs">Shared</Badge>
              )}
            </button>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleLink} disabled={!selected || saving}>
            {saving ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} /> : "Link folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
