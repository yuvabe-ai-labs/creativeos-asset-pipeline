"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { DriveFolderNav, type FolderCrumb } from "./drive-folder-nav";
import { ReferenceImageGrid, type GridImage } from "../reference-image-grid";
import type { DriveFilesResponse } from "@/app/api/drive/files/route";

type DriveGridImage = GridImage & { driveFileId: string; driveMimeType: string };

export type DriveSelectedImage = {
  source: "drive";
  imageUrl: string;
  filename: string;
  driveFileId: string;
  driveMimeType: string;
};

type Props = {
  open: boolean;
  selectedIds: Set<string>;
  onToggle: (id: string, image: DriveSelectedImage) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
};

const ROOT_CRUMB: FolderCrumb = { id: "root", name: "My Drive" };

export function DriveImageBrowser({
  open,
  selectedIds,
  onToggle,
  searchQuery,
  onSearchChange,
}: Props) {
  const [crumbs, setCrumbs] = useState<FolderCrumb[]>([ROOT_CRUMB]);
  const [driveImages, setDriveImages] = useState<DriveGridImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const currentFolderId = crumbs[crumbs.length - 1].id;

  const fetchFiles = useCallback(async (folderId: string, pageToken?: string) => {
    const params = new URLSearchParams({ folderId });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`/api/drive/files?${params}`);
    return (await res.json()) as DriveFilesResponse;
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setDriveImages([]);
    setNextPageToken(null);
    fetchFiles(currentFolderId)
      .then((data) => {
        setDriveImages(
          data.files.map((f) => ({
            id: f.id,
            imageUrl: f.thumbnailUrl ?? "",
            filename: f.name,
            subtitle: new Date(f.modifiedTime).toLocaleDateString(),
            driveFileId: f.id,
            driveMimeType: f.mimeType,
          }))
        );
        setNextPageToken(data.nextPageToken);
      })
      .finally(() => setLoading(false));
  }, [open, currentFolderId, fetchFiles]);

  function handleNavigate(_folderId: string, crumbIndex: number) {
    setCrumbs((prev) => prev.slice(0, crumbIndex + 1));
  }

  async function handleLoadMore() {
    if (!nextPageToken) return;
    setLoadingMore(true);
    try {
      const data = await fetchFiles(currentFolderId, nextPageToken);
      setDriveImages((prev) => [
        ...prev,
        ...data.files.map((f) => ({
          id: f.id,
          imageUrl: f.thumbnailUrl ?? "",
          filename: f.name,
          subtitle: new Date(f.modifiedTime).toLocaleDateString(),
          driveFileId: f.id,
          driveMimeType: f.mimeType,
        })),
      ]);
      setNextPageToken(data.nextPageToken);
    } finally {
      setLoadingMore(false);
    }
  }

  const gridImages: GridImage[] = driveImages;

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-hidden">
      <DriveFolderNav crumbs={crumbs} onNavigate={handleNavigate} />
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
        searchPlaceholder="Search by filename…"
        emptyMessage="No images found in this folder."
      />
      {nextPageToken && !loading && (
        <div className="flex justify-center pt-1">
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
