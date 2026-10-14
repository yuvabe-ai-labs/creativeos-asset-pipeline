"use client";

import { useMemo } from "react";
import { useShotPresenter } from "@/hooks/use-shot-presenter";
import { avatarSheetId } from "@/lib/video-gen/select-references";
import type { UpstreamNode } from "@/components/nodes/connected-inputs-card";

/**
 * A prompt node's connected inputs as the @-mention box and the reference list show them: the
 * wired inputs, plus the script's avatar while it is in this shot — its front, then its profile
 * sheet (D308). The avatar is wired to the script, not to the prompt node, so it is never in the
 * node's own upstream; on the server it IS one of the prompt node's images (getPromptUpstream adds
 * the same rows in the same order), so a mention resolves to that image and numbering agrees. The
 * rail's connected list keeps using the plain upstream.
 */
export function useMentionUpstream(promptNodeId: string, upstream: UpstreamNode[]): UpstreamNode[] {
  const presenter = useShotPresenter(promptNodeId);
  const avatarNodeId = presenter?.inShot ? presenter.avatarNodeId : null;
  const name = presenter?.avatar.name.trim() || "Avatar";
  const frontUrl = presenter?.avatar.front?.url;
  const sheetUrl = presenter?.avatar.sheet && !presenter.avatar.sheetStale ? presenter.avatar.sheet.url : undefined;

  return useMemo(() => {
    if (!avatarNodeId || !frontUrl || upstream.some((u) => u.id === avatarNodeId)) return upstream;
    const rows: UpstreamNode[] = [{ id: avatarNodeId, label: name, type: "avatar", fileUrl: frontUrl, fileKind: "image" }];
    if (sheetUrl) {
      rows.push({ id: avatarSheetId(avatarNodeId), label: `${name} sheet`, type: "avatar", fileUrl: sheetUrl, fileKind: "image" });
    }
    return [...upstream, ...rows];
  }, [upstream, avatarNodeId, name, frontUrl, sheetUrl]);
}
