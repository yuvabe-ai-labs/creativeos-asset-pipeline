"use client";

import { AvatarPreviewPanel } from "./avatar-preview-panel";
import { AvatarViewsRow } from "./avatar-views-row";

// Right side of both avatar editors: a 9:16 talking preview with the right/left/back views
// stacked beside it. Empty until generation is wired up.
export function AvatarOutputPanel() {
  return (
    <div className="grid grid-cols-[minmax(0,20rem)_7.5rem] justify-center gap-5 lg:justify-end">
      <AvatarPreviewPanel videoUrl={null} generating={false} />
      <AvatarViewsRow views={{}} generating={false} />
    </div>
  );
}
