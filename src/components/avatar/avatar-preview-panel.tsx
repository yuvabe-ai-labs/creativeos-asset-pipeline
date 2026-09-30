"use client";

import { useState } from "react";
import { Share2, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { AvatarSilhouette } from "./avatar-silhouette";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// The system share sheet where there is one; otherwise copy the video link.
async function sharePreview(url: string) {
  try {
    if (navigator.share) return await navigator.share({ title: "Avatar preview", url });
    await navigator.clipboard.writeText(url);
    toast.success("Preview link copied.");
  } catch {
    // Share sheet dismissed, or clipboard blocked — nothing to report.
  }
}

type Props = {
  /** The generated example video, once generation is wired up. */
  videoUrl: string | null;
  generating: boolean;
};

// The example-output video of the character speaking, in a 9:16 phone frame, with Share
// (top-right) and mute (bottom-right). Until there is a video, a silhouette stands in.
export function AvatarPreviewPanel({ videoUrl, generating }: Props) {
  const [muted, setMuted] = useState(true);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-2.5 py-1 backdrop-blur">
        <span className="size-1.5 rounded-full bg-primary" />
        <span className="text-eyebrow">Preview</span>
      </div>

      <div className="relative aspect-[9/16] w-full bg-muted/40">
        {generating ? (
          <Skeleton className="absolute inset-0 rounded-none" />
        ) : videoUrl ? (
          <video src={videoUrl} className="size-full object-cover" autoPlay loop playsInline muted={muted} />
        ) : (
          <AvatarSilhouette className="absolute inset-0 size-full px-10 pt-16" />
        )}

        {generating && (
          <span className="absolute inset-x-0 bottom-4 text-center text-sm text-muted-foreground">Generating…</span>
        )}

        <Button
          variant="outline"
          size="icon"
          className="absolute right-3 top-3 z-10 rounded-full bg-card/90 backdrop-blur"
          disabled={!videoUrl}
          aria-label="Share preview"
          onClick={() => videoUrl && sharePreview(videoUrl)}
        >
          <Share2 className="size-4" strokeWidth={1.5} />
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-3 right-3 rounded-full bg-card/90 backdrop-blur"
          disabled={!videoUrl}
          aria-label={muted ? "Unmute preview" : "Mute preview"}
          onClick={() => setMuted((m) => !m)}
        >
          {muted ? <VolumeX className="size-4" strokeWidth={1.5} /> : <Volume2 className="size-4" strokeWidth={1.5} />}
        </Button>
      </div>
    </div>
  );
}
