"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useReactFlow } from "@xyflow/react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";
import { useDriveImages } from "@/hooks/use-drive-images";
import { useCanvasGenerations } from "@/hooks/use-canvas-generations";
import { useGalleryDrawer as useGalleryCommit } from "@/hooks/use-gallery-drawer";
import { useGalleryDrawer as useDrawerCtx } from "../gallery-drawer-context";
import { GalleryHeader } from "./gallery-header";
import { GalleryTabs } from "./gallery-tabs";
import { GalleryToolbar } from "./gallery-toolbar";
import { GalleryContent } from "./gallery-content";
import { GalleryFooter } from "./gallery-footer";
import type {
  Filters,
  GalleryImage,
  GalleryTab,
  ViewMode,
} from "./types";

const MAX_SELECTION = 10;
export const GALLERY_DRAG_MIME = "application/x-creativeos-gallery-image";

type Props = {
  canvasId: string;
};

export function GalleryDrawer({ canvasId }: Props) {
  const { open, options, closeDrawer } = useDrawerCtx();
  const { handleAdd } = useGalleryCommit();
  const reactFlow = useReactFlow();

  const [tab, setTab] = useState<GalleryTab>("references");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({
    sharedOnly: false,
    folderIds: new Set(),
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [imageMap, setImageMap] = useState<Map<string, GalleryImage>>(new Map());
  const [previewId, setPreviewId] = useState<string | null>(null);

  const drive = useDriveImages();
  const generations = useCanvasGenerations(canvasId);

  // Reset transient state on drawer close.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setSelectedIds(new Set());
      setImageMap(new Map());
      setSearchQuery("");
      setFilters({ sharedOnly: false, folderIds: new Set() });
      setPreviewId(null);
    }
  }

  const references: GalleryImage[] = useMemo(
    () =>
      drive.pages.flat().map((item) => ({
        id: item.id,
        imageUrl: item.thumbnailUrl,
        previewUrl: item.previewUrl,
        filename: item.name,
        subtitle: new Date(item.modifiedTime).toLocaleDateString(),
        source: "drive" as const,
        drive: item,
      })),
    [drive.pages],
  );

  const assets: GalleryImage[] = useMemo(
    () =>
      generations.items.map((item) => ({
        id: item.id,
        imageUrl: item.imageUrl,
        previewUrl: item.imageUrl,
        filename: item.nodeName ?? "Image Gen",
        subtitle: `${item.modelUsed ?? "unknown"} · ${new Date(item.createdAt).toLocaleDateString()}`,
        source: "generated" as const,
        generationId: item.id,
      })),
    [generations.items],
  );

  const activeImages = tab === "references" ? references : assets;
  const activeLoading = tab === "references" ? drive.loading : generations.loading;
  const activeError = tab === "references" ? drive.loadError : generations.loadError;

  const filtered = useMemo(() => {
    return activeImages.filter((img) => {
      if (tab === "references" && img.drive) {
        if (filters.sharedOnly && !img.drive.isShared) return false;
        if (
          filters.folderIds.size > 0 &&
          (!img.drive.parentFolder ||
            !filters.folderIds.has(img.drive.parentFolder.id))
        )
          return false;
      }
      if (searchQuery) {
        if (!img.filename.toLowerCase().includes(searchQuery.toLowerCase()))
          return false;
      }
      return true;
    });
  }, [activeImages, filters, searchQuery, tab]);

  function toggleSelect(id: string) {
    const image = activeImages.find((i) => i.id === id);
    if (!image) return;
    setSelectedIds((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        return next;
      }
      if (prev.size >= MAX_SELECTION) {
        toast.error(`You can select up to ${MAX_SELECTION} images at a time.`);
        return prev;
      }
      const next = new Set(prev);
      next.add(id);
      setImageMap((m) => new Map(m).set(id, image));
      return next;
    });
  }

  function handleSentinelInView() {
    if (tab === "references") void drive.loadMore();
  }

  function handleRefresh() {
    if (tab === "references") void drive.refresh();
    else void generations.refresh();
  }

  function computeDefaultPosition() {
    if (options?.position) return options.position;
    const el = document.querySelector<HTMLDivElement>(".react-flow");
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return reactFlow.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
  }

  function handleCommit() {
    const images = Array.from(selectedIds)
      .map((id) => imageMap.get(id))
      .filter((v): v is GalleryImage => v != null);
    if (images.length === 0) return;
    handleAdd(images, {
      position: computeDefaultPosition(),
      connectToNodeId: options?.connectToNodeId,
    });
    closeDrawer();
  }

  function handleDragStartImage(image: GalleryImage, e: React.DragEvent) {
    const payload =
      selectedIds.has(image.id) && selectedIds.size > 0
        ? Array.from(selectedIds)
            .map((id) => imageMap.get(id))
            .filter((v): v is GalleryImage => v != null)
        : [image];
    e.dataTransfer.setData(GALLERY_DRAG_MIME, JSON.stringify({ images: payload }));
    e.dataTransfer.effectAllowed = "copy";
  }

  const previewImage = previewId
    ? [...references, ...assets].find((i) => i.id === previewId)
    : null;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) closeDrawer(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-180"
      >
        <SheetTitle className="sr-only">Gallery</SheetTitle>
        <GalleryHeader
          onRefresh={handleRefresh}
          onClose={closeDrawer}
          refreshing={tab === "references" ? drive.loading : generations.loading}
        />
        <GalleryTabs value={tab} onChange={setTab} />
        <GalleryToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filters={filters}
          onFiltersChange={setFilters}
          availableFolders={drive.availableFolders}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          showFilters={tab === "references"}
        />

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <GalleryContent
            loading={activeLoading}
            loadError={activeError}
            onRetry={handleRefresh}
            images={filtered}
            emptyMessage={
              searchQuery || filters.sharedOnly || filters.folderIds.size > 0
                ? "No images match your filters."
                : tab === "references"
                  ? "No images found in your Drive."
                  : "No generated images yet on this canvas."
            }
            viewMode={viewMode}
            selectedIds={selectedIds}
            onToggle={toggleSelect}
            onPreview={setPreviewId}
            onDragStartImage={handleDragStartImage}
            onSentinelInView={handleSentinelInView}
            hasMore={tab === "references" ? drive.nextPageToken !== null : false}
            loadingMore={tab === "references" ? drive.loadingMore : false}
          />
        </div>

        <GalleryFooter
          selectedCount={selectedIds.size}
          maxSelection={MAX_SELECTION}
          onAdd={handleCommit}
          onCancel={closeDrawer}
        />

        {previewImage && (
          <FullScreenImageZoom
            imageUrl={previewImage.previewUrl ?? previewImage.imageUrl}
            title={previewImage.filename}
            onClose={() => setPreviewId(null)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
