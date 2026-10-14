"use client";

import { useState, type Ref } from "react";
import { cn } from "@/lib/utils";

export function ReviewVideo({
  src,
  ref,
  className,
}: {
  src: string;
  ref?: Ref<HTMLVideoElement>;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className={cn("flex aspect-video items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground", className)}>
        The video couldn&apos;t be loaded. Comments are still below.
      </div>
    );
  }
  // playsInline keeps iOS (and the WhatsApp webview) from forcing fullscreen,
  // which would hide the comment box the client is writing in.
  return (
    <video
      ref={ref}
      src={src}
      controls
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      className={cn("max-h-[50dvh] w-full rounded-xl bg-black object-contain lg:max-h-[80dvh]", className)}
    />
  );
}
