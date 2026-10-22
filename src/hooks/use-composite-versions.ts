"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import type { ImageGenVersionSummary } from "@/components/nodes/image-gen-version-history";
import { useNodeVersionUpdates } from "@/hooks/use-node-version-updates";
import {
  useNodeVersions,
  useRefreshNodeVersions,
  useSetActiveNodeVersion,
} from "@/hooks/queries/node-versions";
import { useGenerationStatus } from "@/hooks/use-generation-status";
import { imageGenClientModelMap } from "@/lib/image-gen/client-models";
import { paramsForRestore } from "@/lib/generations/version-params";
import {
  useStartCompositeGeneration,
  useRestoreNodeVersion,
  startErrorMessage,
} from "@/hooks/queries/node-generation";

type Patch = (patch: Record<string, unknown>) => void;

/** D312/D366 — a composite's versions, Generate and Restore. Generate starts a background job and resolves once it is accepted; the result lands through the node's generation status. */
export function useCompositeVersions(nodeId: string, open: boolean, onPatch: Patch) {
  // Read through the shared versions cache: reopening shows the list at once and re-checks behind it.
  const { data, isPending } = useNodeVersions<ImageGenVersionSummary>(nodeId, open);
  const refreshVersions = useRefreshNodeVersions<ImageGenVersionSummary>(nodeId);
  const setActiveVersionId = useSetActiveNodeVersion(nodeId);
  const versions = data?.versions ?? [];
  const activeVersionId = data?.activeVersionId ?? null;
  const loading = open && isPending;
  // D366 — a composite runs in the background; the node's shared status says whether one is
  // running, across reloads and returns to the canvas. The start mutation covers the request.
  const status = useGenerationStatus(nodeId);
  const startGeneration = useStartCompositeGeneration(nodeId);
  const restoreVersion = useRestoreNodeVersion(nodeId);
  // `starting` turns true synchronously at the top of generate, before any await, so a second
  // click while the caller is still converting its mask cannot start a second run. The ref covers
  // two clicks inside one render, before the state has committed.
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const generating = starting || startGeneration.isPending || status.isGenerating;
  const restoring = restoreVersion.isPending;
  const [requestError, setLastError] = useState<string | null>(null);
  const lastError = requestError ?? status.lastError;

  // Best-effort, like the read it replaces: a failed refresh leaves the cached list on screen.
  const fetchVersions = useCallback(async () => {
    await refreshVersions().catch(() => undefined);
  }, [refreshVersions]);

  useNodeVersionUpdates(nodeId, open, () => void fetchVersions());

  async function generate(body: {
    instruction: string;
    modelId: string;
    params: Record<string, unknown>;
    /** D312 — Edit: the version to edit and what to change. Absent = a fresh composite. */
    edit?: {
      baseVersionId: string;
      intent: string;
      extraIds: string[];
      prompt?: string;
      maskBase64?: string;
      maskMime?: string;
    };
  }): Promise<boolean> {
    if (generating || startingRef.current) return false; // a run in flight never starts another; the server refuses too (409)
    startingRef.current = true;
    setStarting(true);
    setLastError(null);
    try {
      // Accepted: the mutation marks the node as generating; the status hook lands the result.
      await startGeneration.mutateAsync(body);
      return true;
    } catch (e) {
      const message = startErrorMessage(e, "Generation failed");
      setLastError(message);
      toast.error(message, { duration: 6000 });
      await fetchVersions();
      return false;
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  // YUV-295 — restoring puts back the model and settings that version ran with, not only its
  // image, so the next Generate does not silently use whatever was set afterwards.
  async function restore(versionId: string) {
    const toastId = toast.loading("Restoring version…");
    try {
      const json = await restoreVersion.mutateAsync(versionId);
      const restoredModelId =
        (typeof json.paramsUsed?.modelId === "string" ? json.paramsUsed.modelId : null) ??
        json.modelUsed ??
        null;
      const restoredParams = restoredModelId
        ? paramsForRestore(imageGenClientModelMap[restoredModelId]?.params, json.paramsUsed ?? {})
        : null;
      onPatch({
        ...(json.output ? { parsed: json.output } : {}),
        ...(restoredModelId && restoredParams ? { modelId: restoredModelId, params: restoredParams } : {}),
      });
      setActiveVersionId(versionId);
      toast.success(
        restoredParams ? "Version restored with its model and settings" : "Image restored. Its settings are no longer available.",
        { id: toastId },
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed", { id: toastId });
    }
  }

  return { versions, activeVersionId, loading, generating, restoring, lastError, generate, restore };
}
