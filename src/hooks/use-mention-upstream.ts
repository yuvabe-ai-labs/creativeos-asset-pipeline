"use client";

import { useMemo } from "react";
import { useShotPresenter } from "@/hooks/use-shot-presenter";
import type { UpstreamNode } from "@/components/nodes/connected-inputs-card";

/**
 * A prompt node's connected inputs as the @-mention box offers them: the wired inputs, plus the
 * script's avatar while it is in this shot. The avatar is wired to the script, not to the prompt
 * node, so it is never in the node's own upstream — but on the server it IS one of the prompt
 * node's images (getPromptUpstream adds it under the Avatar node's id), so a mention of it
 * resolves to that image for the writer. The rail's connected list keeps using the plain upstream.
 */
export function useMentionUpstream(promptNodeId: string, upstream: UpstreamNode[]): UpstreamNode[] {
  const presenter = useShotPresenter(promptNodeId);
  const avatarNodeId = presenter?.inShot ? presenter.avatarNodeId : null;
  const name = presenter?.avatar.name.trim() || "Avatar";
  const frontUrl = presenter?.avatar.front?.url;

  return useMemo(() => {
    if (!avatarNodeId || !frontUrl || upstream.some((u) => u.id === avatarNodeId)) return upstream;
    return [...upstream, { id: avatarNodeId, label: name, type: "avatar", fileUrl: frontUrl, fileKind: "image" }];
  }, [upstream, avatarNodeId, name, frontUrl]);
}
