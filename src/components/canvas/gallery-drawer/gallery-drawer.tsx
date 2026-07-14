"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FolderOpen, Settings2 } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FullScreenImageZoom } from "@/components/shared/full-screen-image-zoom";
import { useDriveBrowser } from "@/hooks/use-drive-browser";
import { useCanvasGenerations } from "@/hooks/use-canvas-generations";
import { useGalleryDrawer as useGalleryCommit } from "@/hooks/use-gallery-drawer";
import { useGalleryDrawer as useDrawerCtx } from "../gallery-drawer-context";
import { GalleryHeader } from "./gallery-header";
import { GalleryTabs } from "./gallery-tabs";
import { GalleryToolbar } from "./gallery-toolbar";
import { GalleryContent } from "./gallery-content";
import { GalleryFooter } from "./gallery-footer";
import { GalleryBreadcrumb } from "./gallery-breadcrumb";
import { GalleryFolderTile } from "./gallery-folder-tile";
import { DriveFolderPicker } from "./drive-folder-picker";
import type { GalleryImage, GalleryTab, ViewMode } from "./types";
import type { DriveBrowseItem } from "@/hooks/use-drive-browser";

const MAX_SELECTION = 10;
export const GALLERY_DRAG_MIME = "application/x-creativeos-gallery-image";

const GHOST_THUMB = 84;
const GHOST_STACK_OFFSET = 5;
const GHOST_MAX_THUMBS = 3;

function buildMultiDragGhost(images: GalleryImage[]): HTMLElement {
  const count = images.length;
  const visible = images.slice(0, GHOST_MAX_THUMBS);
  // Container is just big enough for the front tile + the furthest back offset
  const extra = (visible.length - 1) * GHOST_STACK_OFFSET;
  const size = GHOST_THUMB + extra;

  const wrap = document.createElement("div");
  wrap.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${size}px;height:${size}px;pointer-events:none;`;

  // Render back-to-front so front tile is on top
  [...visible].reverse().forEach((img, revI) => {
    const i = visible.length - 1 - revI; // 0 = front tile
    const offset = i * GHOST_STACK_OFFSET;
    const tile = document.createElement("div");
    tile.style.cssText = [
      `position:absolute`,
      `top:${offset}px`,
      `left:${offset}px`,
      `width:${GHOST_THUMB}px`,
      `height:${GHOST_THUMB}px`,
      `border-radius:10px`,
      `overflow:hidden`,
      `border:2px solid white`,
      `box-shadow:0 2px 8px rgba(0,0,0,0.20)`,
      `background:#e5e7eb`,
      `z-index:${visible.length - i}`,
    ].join(";");

    if (img.imageUrl) {
      const el = document.createElement("img");
      el.src = img.imageUrl;
      el.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
      tile.appendChild(el);
    }
    wrap.appendChild(tile);
  });

  // Badge pinned to bottom-right corner of the front tile
  const badge = document.createElement("div");
  badge.textContent = String(count);
  const badgeSize = 20;
  badge.style.cssText = [
    `position:absolute`,
    `bottom:${extra - 6}px`,
    `right:${extra - 6}px`,
    `min-width:${badgeSize}px`,
    `height:${badgeSize}px`,
    `padding:0 5px`,
    `border-radius:10px`,
    `background:#5829c7`,
    `color:white`,
    `font-size:11px`,
    `font-weight:700`,
    `line-height:${badgeSize}px`,
    `text-align:center`,
    `z-index:20`,
    `box-shadow:0 1px 4px rgba(0,0,0,0.30)`,
    `box-sizing:border-box`,
  ].join(";");
  wrap.appendChild(badge);

  return wrap;
}

type Props = {
  canvasId: string;
  clientId: string;
  initialDriveRootFolder: { id: string; name: string } | null;
};

export function GalleryDrawer({ canvasId, clientId, initialDriveRootFolder }: Props) {
  const { open, options, closeDrawer } = useDrawerCtx();
  const { handleAdd } = useGalleryCommit();
  const reactFlow = useReactFlow();

  const [tab, setTab] = useState<GalleryTab>("references");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [imageMap, setImageMap] = useState<Map<string, GalleryImage>>(new Map());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [folderPopoverOpen, setFolderPopoverOpen] = useState(false);
  const [rootFolder, setRootFolder] = useState(initialDriveRootFolder);

  const browser = useDriveBrowser(rootFolder);
  const generations = useCanvasGenerations(canvasId);

  // Reset transient state on drawer close.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setSelectedIds(new Set());
      setImageMap(new Map());
      setPreviewId(null);
    }
  }

  // Auto-clear stale folder ID from DB when Drive says it's gone.
  useEffect(() => {
    if (browser.loadError !== "folder_not_found" || !rootFolder) return;
    fetch(`/api/clients/${clientId}/drive-folder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveRootFolderId: null }),
    }).finally(() => {
      setRootFolder(null);
    });
  }, [browser.loadError, rootFolder, clientId]);

  const references: GalleryImage[] = useMemo(() => {
    return browser.items
      .filter((item: DriveBrowseItem) => !item.mimeType.includes("folder"))
      .map((item: DriveBrowseItem) => ({
        id: item.id,
        imageUrl: item.thumbnailUrl ?? "",
        previewUrl: item.previewUrl ?? undefined,
        filename: item.name,
        subtitle: new Date(item.modifiedTime).toLocaleDateString(),
        source: "drive" as const,
        driveMimeType: item.mimeType,
      }));
  }, [browser.items]);

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

  const activeLoading = tab === "references" ? browser.loading : generations.loading;
  const activeError =
    tab === "references"
      ? browser.loadError && browser.loadError !== "folder_not_found"
        ? new Error(browser.loadError)
        : null
      : generations.loadError;

  // Assets tab: client-side search filter.
  const filteredAssets = useMemo(() => {
    if (!browser.search) return assets;
    const q = browser.search.toLowerCase();
    return assets.filter((img) => img.filename.toLowerCase().includes(q));
  }, [assets, browser.search]);

  const activeImages = tab === "references" ? references : filteredAssets;

  function toggleSelect(id: string) {
    const allImages = [...references, ...assets];
    const image = allImages.find((i) => i.id === id);
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

  function handleUnlinkFolder() {
    fetch(`/api/clients/${clientId}/drive-folder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveRootFolderId: null }),
    }).catch(() => {});
    setRootFolder(null);
    setFolderPopoverOpen(false);
  }

  function handleSentinelInView() {
    if (tab === "references") browser.loadMore();
  }

  function handleRefresh() {
    if (tab === "references") browser.refresh();
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
    const isMulti = selectedIds.has(image.id) && selectedIds.size > 1;
    const payload = isMulti
      ? Array.from(selectedIds)
          .map((id) => imageMap.get(id))
          .filter((v): v is GalleryImage => v != null)
      : [image];
    e.dataTransfer.setData(GALLERY_DRAG_MIME, JSON.stringify({ images: payload }));
    e.dataTransfer.effectAllowed = "copy";

    if (isMulti) {
      const ghost = buildMultiDragGhost(payload);
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 28, 28);
      requestAnimationFrame(() => document.body.removeChild(ghost));
    }
  }

  const previewImage = previewId
    ? [...references, ...assets].find((i) => i.id === previewId)
    : null;

  const folderItems = browser.items.filter(
    (item: DriveBrowseItem) => item.mimeType === "application/vnd.google-apps.folder",
  );

  const searchPlaceholder = browser.currentFolder
    ? `Search in ${browser.currentFolder.name}…`
    : "Search…";

  const noFolderLinked = tab === "references" && !rootFolder;

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(v) => {
          if (!v) closeDrawer();
        }}
        modal={false}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          noOverlay
          className="flex w-full flex-col gap-0 p-0 shadow-lg data-[side=right]:sm:max-w-xl"
        >
          <SheetTitle className="sr-only">Gallery</SheetTitle>
          <GalleryHeader
            onRefresh={handleRefresh}
            onClose={closeDrawer}
            refreshing={tab === "references" ? browser.loading : generations.loading}
          />
          <GalleryTabs value={tab} onChange={setTab} />

          {!noFolderLinked && (
            <GalleryToolbar
              searchQuery={browser.search}
              onSearchChange={browser.setSearch}
              searchPlaceholder={searchPlaceholder}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              folderActions={
                tab === "references" && rootFolder ? (
                  <Popover
                    open={folderPopoverOpen}
                    onOpenChange={setFolderPopoverOpen}
                  >
                    <PopoverTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 shrink-0"
                          aria-label="Folder settings"
                        >
                          <Settings2 className="size-3.5" strokeWidth={1.5} />
                        </Button>
                      }
                    />
                    <PopoverContent className="w-44 p-1" side="bottom" align="end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-sm"
                        onClick={() => {
                          setFolderPopoverOpen(false);
                          setPickerOpen(true);
                        }}
                      >
                        Change folder
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-sm text-destructive hover:text-destructive"
                        onClick={handleUnlinkFolder}
                      >
                        Unlink folder
                      </Button>
                    </PopoverContent>
                  </Popover>
                ) : null
              }
            />
          )}

          {tab === "references" && (
            <GalleryBreadcrumb stack={browser.stack} onNavigateTo={browser.navigateTo} />
          )}

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {noFolderLinked ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <FolderOpen className="size-10 text-muted-foreground/40" strokeWidth={1.5} />
                <div className="space-y-1">
                  <p className="text-sm font-medium">No Drive folder linked</p>
                  <p className="text-xs text-muted-foreground">
                    Link a folder to browse this client&apos;s assets
                  </p>
                </div>
                <Button size="sm" onClick={() => setPickerOpen(true)}>
                  Link Drive Folder
                </Button>
              </div>
            ) : (
              <>
                {tab === "references" && folderItems.length > 0 && (
                  <div className="mb-2 flex flex-col gap-1">
                    {folderItems.map((f: DriveBrowseItem) => (
                      <GalleryFolderTile
                        key={f.id}
                        folder={{ id: f.id, name: f.name }}
                        onClick={() => browser.navigateInto({ id: f.id, name: f.name })}
                      />
                    ))}
                  </div>
                )}
                <GalleryContent
                  loading={activeLoading}
                  loadError={activeError}
                  onRetry={handleRefresh}
                  images={activeImages}
                  emptyMessage={
                    browser.search
                      ? `No results in ${browser.currentFolder?.name ?? "this folder"}.`
                      : tab === "references"
                        ? "This folder is empty."
                        : "No generated images yet on this canvas."
                  }
                  viewMode={viewMode}
                  selectedIds={selectedIds}
                  onToggle={toggleSelect}
                  onPreview={setPreviewId}
                  onDragStartImage={handleDragStartImage}
                  onSentinelInView={handleSentinelInView}
                  hasMore={tab === "references" ? browser.nextPageToken !== null : false}
                  loadingMore={tab === "references" ? browser.loadingMore : false}
                />
              </>
            )}
          </div>

          <GalleryFooter
            selectedCount={selectedIds.size}
            maxSelection={MAX_SELECTION}
            onAdd={handleCommit}
            onCancel={closeDrawer}
          />
        </SheetContent>
      </Sheet>

      {previewImage && (
        <FullScreenImageZoom
          imageUrl={previewImage.previewUrl ?? previewImage.imageUrl}
          title={previewImage.filename}
          onClose={() => setPreviewId(null)}
        />
      )}

      <DriveFolderPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        clientId={clientId}
        onLinked={(folder) => setRootFolder(folder)}
      />
    </>
  );
}
