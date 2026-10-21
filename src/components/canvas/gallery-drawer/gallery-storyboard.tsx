"use client";

import { GalleryContent } from "./gallery-content";
import type { StoryboardGroup } from "./storyboard-images";
import type { GalleryImage, ViewMode } from "./types";

type Props = {
  groups: StoryboardGroup[];
  viewMode: ViewMode;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onPreview: (id: string) => void;
  onDragStartImage: (image: GalleryImage, e: React.DragEvent) => void;
};

const noop = () => {};

/** D383 — the approved storyboard of every copilot script on this canvas, above the Drive folder.
 *  Its panels select, preview and drag like any reference. */
export function GalleryStoryboard({ groups, viewMode, selectedIds, onToggle, onPreview, onDragStartImage }: Props) {
  if (groups.length === 0) return null;
  return (
    <div className="mb-4 flex flex-col gap-4 border-b border-border pb-4">
      {groups.map((group) => (
        <section key={group.scriptNodeId} className="flex flex-col gap-2">
          <p className="text-eyebrow text-muted-foreground">Storyboard · {group.title}</p>
          <GalleryContent
            loading={false}
            loadError={null}
            onRetry={noop}
            images={group.images}
            emptyMessage=""
            viewMode={viewMode}
            selectedIds={selectedIds}
            onToggle={onToggle}
            onPreview={onPreview}
            onDragStartImage={onDragStartImage}
            onSentinelInView={noop}
            hasMore={false}
            loadingMore={false}
          />
        </section>
      ))}
    </div>
  );
}
