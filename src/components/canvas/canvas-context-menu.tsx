"use client";

import { useEffect, useRef } from "react";
import { FileText, Paperclip, StickyNote, Sparkles, type LucideIcon } from "lucide-react";

export type AddNodeType = "script" | "file" | "text" | "prompt";

const OPTIONS: { type: AddNodeType; label: string; icon: LucideIcon }[] = [
  { type: "script", label: "Script",  icon: FileText  },
  { type: "file",   label: "File",    icon: Paperclip },
  { type: "text",   label: "Note",    icon: StickyNote },
  { type: "prompt", label: "Prompt",  icon: Sparkles  },
];

const MENU_W = 176;
const MENU_H = 152;

interface CanvasContextMenuProps {
  screenX: number;
  screenY: number;
  onSelect: (type: AddNodeType) => void;
  onClose: () => void;
}

export function CanvasContextMenu({ screenX, screenY, onSelect, onClose }: CanvasContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  const x = screenX + MENU_W > window.innerWidth  ? screenX - MENU_W : screenX;
  const y = screenY + MENU_H > window.innerHeight ? screenY - MENU_H : screenY;

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
