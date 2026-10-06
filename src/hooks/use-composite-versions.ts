"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { ImageGenVersionSummary } from "@/components/nodes/image-gen-version-history";
import { useNodeVersionUpdates } from "@/hooks/use-node-version-updates";
import { revalidateCanvasGenerations } from "@/hooks/use-canvas-generations";
import { CREDIT_LIMIT_TOAST_MESSAGE } from "@/lib/credits/units";

type Patch = (patch: Record<string, unknown>) => void;

/** D312 — a composite's versions, Generate and Restore. The same endpoints Image Gen uses for
 *  versions and restore; generation goes to composite-generate with the instruction in the body
 *  (the canvas autosaves on a delay, so the stored copy can lag). */
export function useCompositeVersions(nodeId: string, open: boolean, onPatch: Patch) {
  const [versions, setVersions] = useState<ImageGenVersionSummary[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(open);
  const [generating, setGenerating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const fetchVersions = useCallback(async () => {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/versions`);
      if (!res.ok) return;
      const json = (await res.json()) as { activeVersionId: string | null; versions: ImageGenVersionSummary[] };
      setVersions(json.versions ?? []);
      setActiveVersionId(json.activeVersionId ?? null);
    } finally {
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    if (open) void fetchVersions();
  }, [open, fetchVersions]);
  useNodeVersionUpdates(nodeId, open, () => void fetchVersions());

  async function generate(body: { instruction: string; modelId: string; params: Record<string, unknown> }) {
    if (generating) return; // a run in flight never starts another — next to the request it guards
    setGenerating(true);
    setLastError(null);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/composite-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { imageUrl?: string; versionId?: string; error?: string };
      if (!res.ok || !json.imageUrl) {
        throw new Error(res.status === 402 ? CREDIT_LIMIT_TOAST_MESSAGE : json.error ?? "Generation failed");
      }
      onPatch({ parsed: json.imageUrl });
      setActiveVersionId(json.versionId ?? null);
      void revalidateCanvasGenerations();
      toast.success("Composite generated");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Generation failed";
      setLastError(message);
      toast.error(message, { duration: 6000 });
    } finally {
      setGenerating(false);
      await fetchVersions();
    }
  }

  async function restore(versionId: string) {
    setRestoring(true);
    const toastId = toast.loading("Restoring version…");
    try {
      const res = await fetch(`/api/nodes/${nodeId}/restore-version`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionId }),
      });
      const json = (await res.json()) as { output?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Restore failed");
      if (json.output) onPatch({ parsed: json.output });
      setActiveVersionId(versionId);
      toast.success("Version restored", { id: toastId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed", { id: toastId });
    } finally {
      setRestoring(false);
    }
  }

  return { versions, activeVersionId, loading, generating, restoring, lastError, generate, restore };
}
