"use client";

import { PostLayerList } from "./post-layer-list";

type Props = React.ComponentProps<typeof PostLayerList>;

/**
 * The layer list becomes a rail item rendered in the shared flyout (D120). This wrapper
 * exists so the panel switch in post-focus-view stays uniform — one component per tool —
 * rather than special-casing layers.
 */
export function PostPanelLayers(props: Props) {
  return <PostLayerList {...props} />;
}
