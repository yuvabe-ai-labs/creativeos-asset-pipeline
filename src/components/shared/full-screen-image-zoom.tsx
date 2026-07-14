"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, Maximize2, X, ZoomIn, ZoomOut } from "lucide-react";
import {
  TransformComponent,
  TransformWrapper,
  useControls,
} from "react-zoom-pan-pinch";
import { Button } from "@/components/ui/button";

type Props = {
  imageUrl: string;
  title?: string;
  onClose: () => void;
  onDownload?: () => void;
};

/** Portal-rendered full-screen image viewer with pan / zoom / reset controls.
 *  Reused by the image-gen focus view and the reference-image picker. */
export function FullScreenImageZoom({
  imageUrl,
  title,
  onClose,
  onDownload,
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title || "Image preview"}
      className="fixed inset-0 z-[100] flex flex-col bg-black/97 text-white animate-in fade-in-0 duration-200"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 z-10 size-9 rounded-full text-white/60 hover:bg-white/10 hover:text-white"
      >
        <X className="size-5" strokeWidth={1.5} />
      </Button>
      <TransformWrapper
        doubleClick={{ mode: "reset" }}
        minScale={0.5}
        maxScale={8}
        centerOnInit
        wheel={{ step: 0.03 }}
      >
        <TransformComponent
          wrapperClass="!w-screen !h-screen"
          contentClass="!w-full !h-full flex items-center justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={title || "Image"}
            className="max-h-screen max-w-full object-contain"
            draggable={false}
          />
        </TransformComponent>
        <ZoomControls onDownload={onDownload} />
      </TransformWrapper>
    </div>,
    document.body,
  );
}

function ZoomControls({ onDownload }: { onDownload?: () => void }) {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-2">
      <p className="select-none text-[0.6rem] uppercase tracking-widest text-white/30">
        scroll to zoom · drag to pan · double-click to reset
      </p>
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => zoomOut()}
          aria-label="Zoom out"
          className="size-7 rounded-full text-white/60 hover:bg-transparent hover:text-white"
        >
          <ZoomOut className="size-3.5" strokeWidth={1.5} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => resetTransform()}
          aria-label="Fit to screen"
          className="size-7 rounded-full text-white/60 hover:bg-transparent hover:text-white"
        >
          <Maximize2 className="size-3.5" strokeWidth={1.5} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => zoomIn()}
          aria-label="Zoom in"
          className="size-7 rounded-full text-white/60 hover:bg-transparent hover:text-white"
        >
          <ZoomIn className="size-3.5" strokeWidth={1.5} />
        </Button>
        {onDownload && (
          <>
            <div className="mx-1.5 h-3.5 w-px bg-white/20" />
            <Button
              variant="ghost"
              size="icon"
              onClick={onDownload}
              aria-label="Download image"
              className="size-7 rounded-full text-white/60 hover:bg-transparent hover:text-white"
            >
              <Download className="size-3.5" strokeWidth={1.5} />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
