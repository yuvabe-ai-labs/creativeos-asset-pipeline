"use client";

import { useState } from "react";
import { AlertCircleIcon, ImagesIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { ImageAnalysisResult } from "@/lib/image-analysis/types";
import { isAnalysisLive, useImageAnalysisStatus, useStartImageAnalysis } from "@/hooks/queries/image-analysis";

const SOURCE_NAMES: [keyof ImageAnalysisResult["bySource"], string, string][] = [
  ["upload", "upload", "uploads"],
  ["website", "from the website", "from the website"],
  ["instagram", "from Instagram", "from Instagram"],
  ["facebook", "from Facebook", "from Facebook"],
];

/** "40 uploads, 62 from the website, 84 from Instagram". */
function basis(bySource: ImageAnalysisResult["bySource"]): string {
  return SOURCE_NAMES.filter(([k]) => bySource[k] > 0)
    .map(([k, one, many]) => (k === "upload" ? `${bySource[k]} ${bySource[k] === 1 ? one : many}` : `${bySource[k]} ${many}`))
    .join(", ");
}

/**
 * The top of the Image Analysis tab (D312): what the section was built from and when, a run in
 * progress, or what to do when there is nothing to build from yet.
 */
export function KBImageAnalysisStatus({ clientId }: { clientId: string }) {
  const { data } = useImageAnalysisStatus(clientId);
  const start = useStartImageAnalysis(clientId);
  const [confirming, setConfirming] = useState(false);

  if (!data) return null;
  const live = isAnalysisLive(data);
  const job = data.job;
  const unread = Math.max(0, data.images - data.carded);

  const run = () => {
    setConfirming(false);
    start.mutate(undefined, { onError: (e) => toast.error(e.message) });
  };

  let body: React.ReactNode;
  if (live) {
    body = (
      <>
        <span className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent text-muted-foreground" />
        <span className="min-w-0 flex-1">
          {job?.phaseMessage ?? "Reading the images…"}
          <span className="text-muted-foreground"> {data.carded} of {data.images} read</span>
        </span>
      </>
    );
  } else if (data.images === 0) {
    body = (
      <>
        <ImagesIcon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        <span className="min-w-0 flex-1 text-muted-foreground">
          No brand images yet. Upload images in Source files, or bring them in from the website and
          social accounts in Brand assets. This tab fills in from them.
        </span>
      </>
    );
  } else if (job?.status === "failed") {
    body = (
      <>
        <AlertCircleIcon className="size-4 shrink-0 text-destructive-text" strokeWidth={1.5} />
        <span className="min-w-0 flex-1">{job.error ?? "The image analysis didn't finish."}</span>
        <Button size="sm" variant="outline" onClick={run} disabled={start.isPending}>
          <RefreshCwIcon className="size-3.5" strokeWidth={1.5} />
          Try again
        </Button>
      </>
    );
  } else if (job?.status === "succeeded" && job.result?.written) {
    body = (
      <>
        <ImagesIcon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        <span className="min-w-0 flex-1">
          Built from {job.result.counted} {job.result.counted === 1 ? "image" : "images"}
          <span className="text-muted-foreground">
            {basis(job.result.bySource) ? ` · ${basis(job.result.bySource)}` : ""} · updated {formatRelativeTime(job.finishedAt)}
          </span>
          {unread > 0 && <span className="text-muted-foreground"> · {unread} new not read yet</span>}
        </span>
        <Button size="sm" variant="outline" onClick={() => setConfirming(true)} disabled={start.isPending}>
          <RefreshCwIcon className="size-3.5" strokeWidth={1.5} />
          Refresh analysis
        </Button>
      </>
    );
  } else {
    body = (
      <>
        <ImagesIcon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        <span className="min-w-0 flex-1">
          {unread > 0
            ? `${unread} brand ${unread === 1 ? "image is" : "images are"} ready to analyse.`
            : "The image analysis will appear here once the brand knowledge base is built."}
        </span>
        {unread > 0 && (
          <Button size="sm" onClick={run} disabled={start.isPending}>
            Analyse images
          </Button>
        )}
      </>
    );
  }

  return (
    <>
      <div className="flex min-h-12 flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm shadow-card">
        {body}
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refresh the image analysis?</AlertDialogTitle>
            <AlertDialogDescription>
              New images are read, and every field in this tab is written again from all the brand&apos;s
              images. The fields go back to needing review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={run}>Refresh</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
