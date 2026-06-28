"use client";

import { useEffect, useRef } from "react";
import { FileText, ImageIcon, Paperclip, StickyNote, Sparkles, Pencil, Clapperboard, ClipboardPaste, type LucideIcon } from "lucide-react";

export type AddNodeType = "script" | "file" | "text" | "prompt" | "draw" | "image-gen" | "video-prompt" | "video-gen";

const OPTIONS: { type: AddNodeType; label: string; icon: LucideIcon }[] = [
  { type: "script", label: "Script",  icon: FileText  },
  { type: "file",   label: "File",    icon: Paperclip },
  { type: "text",   label: "Note",    icon: StickyNote },
  { type: "prompt", label: "Prompt",  icon: Sparkles  },
  { type: "draw",         label: "Draw",         icon: Pencil       },
  { type: "image-gen",    label: "Image Gen",    icon: ImageIcon    },
  { type: "video-prompt", label: "Video Prompt", icon: Clapperboard },
  { type: "video-gen",    label: "Video Gen",    icon: Clapperboard },
];

const MENU_W = 176;
const MENU_H = 258;

interface CanvasContextMenuProps {
  screenX: number;
  screenY: number;
  onSelect: (type: AddNodeType) => void;
  onClose: () => void;
  canPasteImage?: boolean;
  onPasteImage?: () => void;
}

export function CanvasContextMenu({ screenX, screenY, onSelect, onClose, canPasteImage, onPasteImage }: CanvasContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  const menuH = canPasteImage ? MENU_H + 44 : MENU_H;
  const x = screenX + MENU_W > window.innerWidth  ? screenX - MENU_W : screenX;
  const y = screenY + menuH > window.innerHeight ? screenY - menuH : screenY;

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className="fixed z-50 w-44 rounded-xl border border-neutral-200 bg-white p-1 shadow-card"
    >
      {canPasteImage && onPasteImage && (
        <>
          <button
            type="button"
            onClick={() => { onPasteImage(); onClose(); }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-primary transition-colors hover:bg-primary/5"
          >
            <ClipboardPaste className="size-4 shrink-0" strokeWidth={1.5} />
            Paste image
          </button>
          <div className="my-1 h-px bg-neutral-200" />
        </>
      )}
      {OPTIONS.map(({ type, label, icon: Icon }) => (
        <button
          key={type}
          type="button"
          onClick={() => { onSelect(type); onClose(); }}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition-colors hover:bg-muted"
        >
          <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          {label}
        </button>
      ))}
    </div>
  );
}
