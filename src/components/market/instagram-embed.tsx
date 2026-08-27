"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

const EMBED_SCRIPT = "https://www.instagram.com/embed.js";

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

/**
 * Instagram's OFFICIAL embed: a `.instagram-media` blockquote that embed.js swaps for
 * a real iframe carrying the post — including the video player for reels.
 *
 * Why not the bare `instagram.com/p/<id>/embed` iframe: that endpoint renders a
 * "View this post on Instagram" card rather than a player, and the tokenless oEmbed
 * API returns only this same blockquote (no thumbnail_url, no media URL — verified
 * 2026-08-27). The blockquote route is the only supported way to get playback.
 *
 * The script is loaded once per page and reused; `process()` is what converts any
 * blockquote currently in the DOM, so it must run AFTER this one mounts.
 */
export function InstagramEmbed({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function process() {
      if (cancelled) return;
      window.instgrm?.Embeds.process();
      // embed.js swaps the node asynchronously; give it a beat before hiding the
      // spinner so we don't flash the unstyled blockquote.
      setTimeout(() => !cancelled && setReady(true), 600);
    }

    if (window.instgrm) {
      process();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${EMBED_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", process);
      return () => {
        cancelled = true;
        existing.removeEventListener("load", process);
      };
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = EMBED_SCRIPT;
    script.addEventListener("load", process);
    document.body.appendChild(script);
    return () => {
      cancelled = true;
      script.removeEventListener("load", process);
    };
  }, [url]);

  return (
    <div className="relative max-h-[78vh] w-full overflow-y-auto rounded-lg bg-white">
      {!ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
          <Loader2 className="size-5 animate-spin text-muted-foreground" strokeWidth={1.5} />
        </div>
      )}
      <div ref={containerRef}>
        <blockquote
          className="instagram-media"
          data-instgrm-permalink={url}
          data-instgrm-version="14"
          style={{ margin: 0, width: "100%" }}
        />
      </div>
    </div>
  );
}
