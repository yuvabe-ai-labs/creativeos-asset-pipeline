"use client";

import { useEffect, useState, useCallback } from "react";
import { Folder, HardDrive, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DriveFolderNav, type FolderCrumb } from "./drive-folder-nav";
import { ReferenceImageGrid, type GridImage } from "../reference-image-grid";
import type { DriveFilesResponse, DriveFileItem } from "@/app/api/drive/files/route";

type DriveGridImage = GridImage & { driveFileId: string; driveMimeType: string };

export type DriveSelectedImage = {
  source: "drive";
  imageUrl: string;
  filename: string;
  driveFileId: string;
  driveMimeType: string;
};

type DriveRoot = "my-drive" | "shared";

type Props = {
  open: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string, image: DriveSelectedImage) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
};

const MY_DRIVE_CRUMB: FolderCrumb = { id: "root", name: "My Drive" };
const SHARED_CRUMB: FolderCrumb = { id: "shared-with-me", name: "Shared with me" };

const ROOT_TABS: { id: DriveRoot; label: string; icon: React.ReactNode; crumb: FolderCrumb }[] = [
  {
    id: "my-drive",
    label: "My Drive",
    icon: <HardDrive className="size-4" strokeWidth={1.5} />,
    crumb: MY_DRIVE_CRUMB,
  },
  {
    id: "shared",
    label: "Shared with me",
    icon: <Users className="size-4" strokeWidth={1.5} />,
    crumb: SHARED_CRUMB,
  },
];

export function DriveImageBrowser({
  open,
  selectedIds,
  onToggle,
  searchQuery,
  onSearchChange,
}: Props) {
  const [crumbs, setCrumbs] = useState<FolderCrumb[]>([MY_DRIVE_CRUMB]);
  const [folders, setFolders] = useState<DriveFileItem[]>([]);
  const [driveImages, setDriveImages] = useState<DriveGridImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const currentFolderId = crumbs[crumbs.length - 1].id;
  const activeRoot: DriveRoot = crumbs[0].id === "shared-with-me" ? "shared" : "my-drive";

  const fetchFiles = useCallback(
    async (folderId: string, pageToken?: string): Promise<DriveFilesResponse> => {
      const params = new URLSearchParams({ folderId });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(`/api/drive/files?${params}`);
      return (await res.json()) as DriveFilesResponse;
    },
    [],
  );

  const toGridImage = (f: DriveFileItem): DriveGridImage => ({
    id: f.id,
    imageUrl: f.thumbnailUrl,
    previewUrl: `/api/drive/file/${f.id}`,
    filename: f.name,
    subtitle: new Date(f.modifiedTime).toLocaleDateString(),
    driveFileId: f.id,
    driveMimeType: f.mimeType,
  });

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setFolders([]);
    setDriveImages([]);
    setNextPageToken(null);
    fetchFiles(currentFolderId)
      .then((data) => {
        setFolders(data.files.filter((f) => f.isFolder));
        setDriveImages(
          data.files.filter((f) => !f.isFolder).map(toGridImage),
        );
        setNextPageToken(data.nextPageToken);
      })
      .finally(() => setLoading(false));
  }, [open, currentFolderId, fetchFiles]);

  function handleNavigate(_folderId: string, crumbIndex: number) {
    setCrumbs((prev) => prev.slice(0, crumbIndex + 1));
  }

  function handleEnterFolder(folder: DriveFileItem) {
    setCrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  }

  function handleSwitchRoot(root: DriveRoot) {
    const tab = ROOT_TABS.find((t) => t.id === root);
    if (tab) setCrumbs([tab.crumb]);
  }

  async function handleLoadMore() {
    if (!nextPageToken) return;
    setLoadingMore(true);
    try {
      const data = await fetchFiles(currentFolderId, nextPageToken);
      setDriveImages((prev) => [
        ...prev,
        ...data.files.filter((f) => !f.isFolder).map(toGridImage),
      ]);
      setNextPageToken(data.nextPageToken);
    } finally {
      setLoadingMore(false);
    }
  }

  const gridImages: GridImage[] = driveImages;
  const showBreadcrumbs = crumbs.length > 1;

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      {/* Prominent root tabs */}
      <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {ROOT_TABS.map((tab) => (
          <Button
            key={tab.id}
            variant="ghost"
            size="sm"
            onClick={() => handleSwitchRoot(tab.id)}
            className={cn(
              "h-8 flex-1 justify-center gap-2 rounded-md text-xs font-medium transition-all",
              activeRoot === tab.id
                ? "bg-background text-foreground shadow-sm hover:bg-background"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            {tab.icon}
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Breadcrumbs (only when navigated into a subfolder) */}
      {showBreadcrumbs && (
        <div className="shrink-0">
          <DriveFolderNav crumbs={crumbs} onNavigate={handleNavigate} />
        </div>
      )}

      {/* Folders — dominant, larger tiles */}
      {!loading && folders.length > 0 && (
        <div className="shrink-0">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Folder className="size-3.5 text-muted-foreground" strokeWidth={1.5} />
            <p className="text-eyebrow text-[0.65rem]!">
              Folders · {folders.length}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {folders.map((folder) => (
              <Button
                key={folder.id}
                variant="ghost"
                onClick={() => handleEnterFolder(folder)}
                className="group h-auto justify-start gap-2.5 rounded-xl border border-border bg-card px-3 py-3 text-left text-sm font-medium text-foreground shadow-card transition-all hover:-translate-y-0.5 hover:bg-muted/60"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                  <Folder className="size-4" strokeWidth={1.5} />
                </div>
                <span className="truncate">{folder.name}</span>
              </Button>
            ))}
          </div>
          {driveImages.length > 0 && (
            <div className="mt-3 flex items-center gap-1.5">
              <p className="text-eyebrow text-[0.65rem]!">
                Images · {driveImages.length}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Image gallery */}
      <ReferenceImageGrid
        images={gridImages}
        selectedIds={selectedIds}
        onToggle={(id) => {
          const img = driveImages.find((f) => f.id === id);
          if (!img) return;
          onToggle(id, {
            source: "drive",
            imageUrl: img.imageUrl,
            filename: img.filename,
            driveFileId: img.driveFileId,
            driveMimeType: img.driveMimeType,
          });
        }}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        searchPlaceholder="Search images by filename…"
        emptyMessage={
          folders.length > 0
            ? "No images in this folder — open a subfolder to browse."
            : "No images found in this folder."
        }
      />

      {nextPageToken && !loading && (
        <div className="flex shrink-0 justify-center pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="text-xs text-muted-foreground"
          >
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
