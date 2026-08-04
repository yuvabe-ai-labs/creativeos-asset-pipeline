"use client";

import type { PostLayer } from "@/lib/post/types";
import { PostInspectorText } from "./post-inspector-text";
import { PostInspectorShape } from "./post-inspector-shape";
import { PostInspectorImage } from "./post-inspector-image";
import { PostInspectorIcon } from "./post-inspector-icon";

type Props = {
  layer: PostLayer | null;
  onChange: (patch: Partial<PostLayer>) => void;
};

export function PostInspector({ layer, onChange }: Props) {
  if (!layer) {
    return <p className="p-3 text-sm text-muted-foreground">Select a layer to edit its properties.</p>;
  }
  if (layer.kind === "text") return <PostInspectorText layer={layer} onChange={onChange} />;
  if (layer.kind === "shape") return <PostInspectorShape layer={layer} onChange={onChange} />;
  if (layer.kind === "image") return <PostInspectorImage layer={layer} onChange={onChange} />;
  return <PostInspectorIcon layer={layer} onChange={onChange} />;
}
