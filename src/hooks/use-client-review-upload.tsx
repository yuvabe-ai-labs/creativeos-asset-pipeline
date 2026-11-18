"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useFlushAutosave } from "@/components/canvas/autosave-flush-context";
import { useCanvasStoreApi } from "@/components/canvas/canvas-store-provider";
import { clientReviewKeys } from "@/hooks/queries/client-reviews";
import { titleFromFilename } from "@/lib/nodes/title";
import { CUT_CONTENT_TYPES, CUT_EXTENSIONS, CUT_MAX_BYTES } from "@/lib/client-review/constants";
import { cutExtension } from "@/lib/client-review/validate";
import { uploadViaSignedUrl } from "@/lib/uploads/client";
import type { NodeClientReview } from "@/lib/client-review/wire";

const ACCEPT = [...CUT_EXTENSIONS].map((e) => `.${e}`).join(",");

export type ClientReviewUpload = {
  /** Opens the file picker; the chosen cut uploads at once as the next version. */
  choose: () => void;
  uploading: boolean;
  /** The hidden file input. Render it once, outside the node card. */
  input: React.ReactNode;
};

// D495/D497 — upload a cut as the node's next version straight from the file picker, with no
// dialog between. A new version starts with download off; the focus view's switch turns it on. Shared by
// the node's right-click menu and the focus view's Upload button, so both show "Uploading…" while
// it runs; the caller opens the new version once it is saved.
export function useClientReviewUpload(
  nodeId: string,
  {
    onUploaded,
  }: {
    /** The new version is saved and in the query cache. */
    onUploaded?: (versionNo: number) => void;
  } = {},
): ClientReviewUpload {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const flushAutosave = useFlushAutosave();
  const store = useCanvasStoreApi();
  const queryClient = useQueryClient();

  async function upload(file: File) {
    if (file.size > CUT_MAX_BYTES) {
      toast.error("The cut is over 500 MB. Export a smaller file.");
      return;
    }
    const ext = cutExtension(file.name);
    if (!ext) {
      toast.error(`Upload a video: ${ACCEPT.replaceAll(",", ", ")}.`);
      return;
    }
    // Some browsers report an empty type for .mov; the sign route needs a video/* type.
    const contentType = file.type || CUT_CONTENT_TYPES[ext];
    setUploading(true);
    try {
      // The node row must exist before /api/nodes/:id/* can find it (600ms autosave lag).
      await flushAutosave();
      const next = await uploadViaSignedUrl<NodeClientReview>(file, {
        signEndpoint: `/api/nodes/${nodeId}/client-review/sign`,
        finalizeEndpoint: `/api/nodes/${nodeId}/client-review`,
        finalizeBody: { allowDownload: false },
        contentType,
      });
      // Each version is named after its file; the node card shows the newest version, so the
      // node takes the name too. Saved before the header's feedback list refetches (it reads
      // saved titles); a failed save must not report the upload as failed — autosave retries.
      const title = titleFromFilename(file.name);
      if (title) store.getState().updateNodeData(nodeId, { title });
      await flushAutosave().catch(() => {});
      queryClient.setQueryData(clientReviewKeys.node(nodeId), next);
      void queryClient.invalidateQueries({ queryKey: ["client-review", "canvas"] });
      const versionNo = next.review?.versions[0]?.versionNo;
      if (versionNo) {
        toast.success(`v${versionNo} uploaded`);
        onUploaded?.(versionNo);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const input = (
    <Input
      ref={inputRef}
      type="file"
      accept={ACCEPT}
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (f) void upload(f);
      }}
    />
  );

  return {
    choose: () => {
      if (!uploading) inputRef.current?.click();
    },
    uploading,
    input,
  };
}

