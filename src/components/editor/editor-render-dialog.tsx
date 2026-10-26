"use client";
// The MP4 export (D417): two options (quality; burn in captions, only when there are captions),
// then progress, then the download. Closing doesn't stop a render: reopening shows its progress.
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useRenderStatus, useStartRender } from "@/hooks/queries/editor";
import { SaveFailure } from "@/lib/editor/autosave";
import type { RenderQuality } from "@/lib/editor/render-plan";
import { formatTime } from "@/lib/editor/timeline";
import { formatBytes } from "@/lib/kb/utils";
import { ApiError } from "@/services/read-json";
import { EditorChoiceToggle } from "./editor-choice-toggle";
import { useEditorStore } from "./editor-store-provider";

const QUALITY_HINT: Record<RenderQuality, string> = {
  full: "The reel's full size. Best for posting.",
  quick: "720p. Faster and smaller, for sending or a quick check.",
};

export function EditorRenderDialog({ canvasId, nodeId, open, onClose, flush }: {
  canvasId: string;
  nodeId: string;
  open: boolean;
  onClose(): void;
  flush(): Promise<void>;
}) {
  const start = useStartRender(canvasId);
  const [jobId, setJobId] = useState<string | null>(null);
  const [quality, setQuality] = useState<RenderQuality>("full");
  const [captions, setCaptions] = useState(true);
  const hasCaptions = useEditorStore((s) => s.doc.captions.length > 0);
  const { data } = useRenderStatus(canvasId, jobId);
  const result = data?.status === "succeeded" ? data.result : null;
  const failed = data?.status === "failed";
  const choosing = jobId === null;

  const begin = async () => {
    try {
      await flush();
      const { jobId: id } = await start.mutateAsync({ nodeId, quality, captions: hasCaptions && captions });
      setJobId(id);
    } catch (err) {
      if (err instanceof SaveFailure) toast.error(`Your latest changes aren't saved, so the video didn't start. ${err.message}`);
      else toast.error(err instanceof ApiError || err instanceof Error ? err.message : "Couldn't start the video.");
    }
  };
  const close = () => {
    onClose();
    if (result || failed) setJobId(null);
  };

  const title = choosing ? "Export an MP4" : result ? "Your video is ready" : failed ? "The video didn't finish" : "Rendering your video";
  const description = choosing
    ? "A finished video with everything in the reel: trims, dubs and lip sync."
    : result
      ? `${formatTime(result.durationSeconds)} · ${result.width}×${result.height} · ${formatBytes(result.bytes)}`
      : failed
        ? data?.error
        : (data?.phase ?? "Starting…");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="flex w-[460px] max-w-[calc(100%-2rem)] flex-col gap-5 rounded-[18px] p-6 sm:max-w-[460px]">
        <div className="flex flex-col gap-1.5">
          <DialogTitle className="font-display text-xl font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-sm tabular-nums text-muted-foreground">{description}</DialogDescription>
        </div>

        {choosing && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold">Quality</span>
              <EditorChoiceToggle<RenderQuality>
                label="Quality"
                value={quality}
                options={[
                  { value: "full", label: "Full", available: true },
                  { value: "quick", label: "Quick", available: true },
                ]}
                onChange={setQuality}
              />
              <span className="text-xs text-muted-foreground">{QUALITY_HINT[quality]}</span>
            </div>
            {hasCaptions && (
              <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
                <Label htmlFor="render-captions" className="flex flex-col items-start gap-0.5">
                  <span className="text-[13px] font-semibold">Burn in captions</span>
                  <span className="text-xs font-normal text-muted-foreground">Off if you&apos;ll add the platform&apos;s own captions.</span>
                </Label>
                <Switch id="render-captions" checked={captions} onCheckedChange={(v) => setCaptions(Boolean(v))} />
              </div>
            )}
          </div>
        )}

        {!choosing && !result && !failed && (
          <div className="flex items-center gap-2.5 text-sm">
            <Loader2 className="size-4 animate-spin text-primary" strokeWidth={1.5} />
            You can close this. The video keeps rendering.
          </div>
        )}

        <div className="flex justify-end gap-2.5 border-t border-border pt-4">
          <Button variant="outline" onClick={close}>Close</Button>
          {choosing && (
            <Button onClick={() => void begin()} disabled={start.isPending} className="gap-2 font-semibold">
              {start.isPending && <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />}
              Export
            </Button>
          )}
          {failed && <Button onClick={() => void begin()}>Try again</Button>}
          {result && (
            <Button nativeButton={false} render={<a href={result.url} download={result.fileName} />} className="min-w-0 gap-2 font-semibold">
              <Download className="size-4 flex-none" strokeWidth={1.5} />
              <span className="truncate">Download {result.fileName}</span>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
