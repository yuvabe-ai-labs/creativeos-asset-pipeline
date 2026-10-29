"use client";

import { useEffect, useRef } from "react";
import {
  FileText,
  Paperclip,
  StickyNote,
  Sparkles,
  Pencil,
  Combine,
  ImageIcon,
  Clapperboard,
  Scissors,
  Layers,
  ClipboardPaste,
  Images,
  LayoutTemplate,
  MessageSquareText,
  Languages,
  type LucideIcon,
} from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import {
  ADD_NODE_OPTIONS,
  type AddNodeType,
} from "@/lib/canvas-node-options";
import { useGalleryDrawer } from "./gallery-drawer-context";

// Icon per type. Record<AddNodeType, …> forces TS to flag any type missing an
// icon, so this can never silently drift from ADD_NODE_OPTIONS.
const ICONS: Record<AddNodeType, LucideIcon> = {
  script: FileText,
  file: Paperclip,
  text: StickyNote,
  prompt: Sparkles,
  draw: Pencil,
  "image-gen": ImageIcon,
  composite: Combine,
  "video-prompt": Clapperboard,
  // Layers, matching the Multishot node's own icon — the two share a lane.
  "multishot-prompt": Layers,
  "video-gen": Clapperboard,
  post: LayoutTemplate,
  "client-review": MessageSquareText,
  dubbing: Languages,
  editor: Scissors,
};

// A compact palette (smaller rows, text and icons, w-56): at the default size its 14 rows made a
// 640px menu that covered most of a laptop screen. Tall enough for the input, the reference row and
// every node type without scrolling; raise it when a node type is added.
const MENU_W = 224;
const MENU_H = 500;
/** The compact row every option uses. */
const ROW = "gap-1.5 py-1 text-[0.8rem]";

const VIEWPORT_MARGIN = 8;

/**
 * YUV-391 — where the palette opens: at the pointer, flipped left / up when it would overflow, then
 * held inside the window. Flipping up alone put a 640px menu opened near the top of the window at a
 * negative `top`, cutting off half of it. On a window shorter than the menu it takes the window's
 * height and its list scrolls.
 */
export function placeQuickAddMenu(
  pointer: { x: number; y: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number; maxHeight: number } {
  const maxHeight = Math.min(size.height, viewport.height - 2 * VIEWPORT_MARGIN);
  const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(v, high));
  const left = pointer.x + size.width > viewport.width ? pointer.x - size.width : pointer.x;
  const top = pointer.y + maxHeight > viewport.height ? pointer.y - maxHeight : pointer.y;
  return {
    left: clamp(left, VIEWPORT_MARGIN, viewport.width - VIEWPORT_MARGIN - size.width),
    top: clamp(top, VIEWPORT_MARGIN, viewport.height - VIEWPORT_MARGIN - maxHeight),
    maxHeight,
  };
}

interface QuickAddMenuProps {
  screenX: number;
  screenY: number;
  flowPos: { x: number; y: number };
  onSelect: (type: AddNodeType) => void;
  onClose: () => void;
  canPasteImage?: boolean;
  onPasteImage?: () => void;
}

export function QuickAddMenu({
  screenX,
  screenY,
  flowPos,
  onSelect,
  onClose,
  canPasteImage,
  onPasteImage,
}: QuickAddMenuProps) {
  const gallery = useGalleryDrawer();
  const ref = useRef<HTMLDivElement>(null);

  // When "Paste image" row is present the panel is taller by 44px — account for it.
  const menuH = canPasteImage ? MENU_H + 44 : MENU_H;
  const place = placeQuickAddMenu(
    { x: screenX, y: screenY },
    { width: MENU_W, height: menuH },
    { width: window.innerWidth, height: window.innerHeight },
  );

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ left: place.left, top: place.top, maxHeight: place.maxHeight }}
      className="fixed z-50 flex w-56 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card"
    >
      <Command
        className="min-h-0"
        // cmdk's own keyboard handling drives arrow-nav + Enter; Esc closes.
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
      >
        {/*
          CommandInput spreads all props through to the underlying cmdk Input,
          which accepts standard InputHTMLAttributes — autoFocus is valid.
        */}
        <CommandInput autoFocus placeholder="Add node…" />
        {/* No max-h of its own (shadcn's is 288px): the panel's maxHeight caps it on a short
            window, and the list scrolls inside. */}
        <CommandList className="max-h-none min-h-0 flex-1">
          <CommandEmpty>No node type found.</CommandEmpty>
          <CommandGroup>
            {canPasteImage && onPasteImage && (
              <CommandItem
                value="paste image"
                onSelect={() => {
                  onPasteImage();
                  onClose();
                }}
                className={`${ROW} text-primary`}
              >
                <ClipboardPaste className="size-3.5 shrink-0" strokeWidth={1.5} />
                Paste image
              </CommandItem>
            )}
            <CommandItem
              value="add reference image"
              onSelect={() => {
                gallery.openDrawer({ position: flowPos });
                onClose();
              }}
              className={`${ROW} text-primary`}
            >
              <Images className="size-3.5 shrink-0" strokeWidth={1.5} />
              Add reference image
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Add node">
            {ADD_NODE_OPTIONS.map(({ type, label, mnemonic }) => {
              const Icon = ICONS[type];
              return (
                <CommandItem
                  key={type}
                  value={label}
                  className={ROW}
                  onSelect={() => {
                    onSelect(type);
                    onClose();
                  }}
                >
                  <Icon
                    className="size-3.5 shrink-0 text-muted-foreground"
                    strokeWidth={1.5}
                  />
                  <span className="flex-1">{label}</span>
                  {/*
                    Use CommandShortcut (the repo's shadcn component) rather
                    than a raw <kbd> — it carries the correct slot attribute
                    that suppresses the CheckIcon in CommandItem.
                  */}
                  <CommandShortcut>{mnemonic}</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}
