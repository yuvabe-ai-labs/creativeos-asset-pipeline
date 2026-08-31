"use client";

import type { SignalWithItems } from "@/lib/db/signals";
import { GalleryBreadcrumb } from "./gallery-breadcrumb";
import { GalleryContent } from "./gallery-content";
import { GallerySignalTile } from "./gallery-signal-tile";
import type { GalleryImage, ViewMode } from "./types";

type Props = {
  signals: SignalWithItems[];
  loading: boolean;
  selectedSignalId: string | null;
  onSelectSignal: (id: string | null) => void;
  /** The selected signal's items, pre-mapped to the drawer's tile shape. */
  images: GalleryImage[];
  viewMode: ViewMode;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onPreview: (id: string) => void;
  onDragStartImage: (image: GalleryImage, e: React.DragEvent) => void;
  onRetry: () => void;
};

/** Signals tab: a drill-in list of the client's signals (mirrors the Moodboards
 *  tab); inside one, the signal's description leads and its references render in
 *  the shared grid, draggable onto the canvas like any moodboard item. */
export function GallerySignalsTab({
  signals,
  loading,
  selectedSignalId,
  onSelectSignal,
  images,
  viewMode,
  selectedIds,
  onToggle,
  onPreview,
  onDragStartImage,
  onRetry,
}: Props) {
  const selected = signals.find((s) => s.id === selectedSignalId) ?? null;

  if (!selected) {
    if (!loading && signals.length === 0) {
      return (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No signals yet — group references into a signal on the Market page.
        </p>
      );
    }
    return (
      <div className="flex flex-col gap-1">
        {signals.map((s) => (
          <GallerySignalTile key={s.id} signal={s} onClick={() => onSelectSignal(s.id)} />
        ))}
      </div>
    );
  }

  return (
    <>
      <GalleryBreadcrumb
        stack={[
          { id: "__root__", name: "Signals" },
          { id: selected.id, name: selected.name },
        ]}
        onNavigateTo={(i) => {
          if (i === 0) onSelectSignal(null);
        }}
      />
      {selected.description && (
        <p className="mb-2 px-1 text-xs leading-relaxed text-muted-foreground">
          {selected.description}
        </p>
      )}
      <GalleryContent
        loading={loading}
        loadError={null}
        onRetry={onRetry}
        images={images}
        emptyMessage="This signal has no references."
        viewMode={viewMode}
        selectedIds={selectedIds}
        onToggle={onToggle}
        onPreview={onPreview}
        onDragStartImage={onDragStartImage}
        onSentinelInView={() => {}}
        hasMore={false}
        loadingMore={false}
      />
    </>
  );
}
