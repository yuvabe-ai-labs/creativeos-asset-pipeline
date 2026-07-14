"use client";

import { useEffect, useRef } from "react";
import {
  FileText,
  Paperclip,
  StickyNote,
  Sparkles,
  Pencil,
  ImageIcon,
  Clapperboard,
  ClipboardPaste,
  Images,
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

// Icon per type. Record<AddNodeType, …> forces TS to flag any type missing an
// icon, so this can never silently drift from ADD_NODE_OPTIONS.
const ICONS: Record<AddNodeType, LucideIcon> = {
  script: FileText,
  file: Paperclip,
  text: StickyNote,
  prompt: Sparkles,
  draw: Pencil,
  "image-gen": ImageIcon,
  "video-prompt": Clapperboard,
  "video-gen": Clapperboard,
};

const MENU_W = 240;
// Tall enough to show the input + all 8 node rows (+ the optional paste row)
// without the list scrolling. Kept in sync with CommandList's max-h below.
const MENU_H = 420;

interface QuickAddMenuProps {
  screenX: number;
  screenY: number;
  onSelect: (type: AddNodeType) => void;
  onClose: () => void;
  canPasteImage?: boolean;
  onPasteImage?: () => void;
  onAddReferenceImage?: () => void;
}

export function QuickAddMenu({
  screenX,
  screenY,
  onSelect,
  onClose,
  canPasteImage,
  onPasteImage,
  onAddReferenceImage,
}: QuickAddMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Flip left/up when the panel would overflow the viewport.
  // When "Paste image" row is present the panel is taller by 44px — account for it.
  const menuH = canPasteImage ? MENU_H + 44 : MENU_H;
  const x = screenX + MENU_W > window.innerWidth ? screenX - MENU_W : screenX;
  const y = screenY + menuH > window.innerHeight ? screenY - menuH : screenY;

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
      style={{ left: x, top: y }}
      className="fixed z-50 w-60 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-card"
    >
      <Command
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
        {/* Override shadcn's default max-h-72 (288px) so all 8 node types fit
            without the list scrolling; still caps height on short viewports. */}
        <CommandList className="max-h-[420px]">
          <CommandEmpty>No node type found.</CommandEmpty>
          {(canPasteImage && onPasteImage || onAddReferenceImage) && (
            <CommandGroup>
              {canPasteImage && onPasteImage && (
                <CommandItem
                  value="paste image"
                  onSelect={() => {
                    onPasteImage();
                    onClose();
                  }}
                  className="text-primary"
                >
                  <ClipboardPaste className="size-4 shrink-0" strokeWidth={1.5} />
                  Paste image
                </CommandItem>
              )}
              {onAddReferenceImage && (
                <CommandItem
                  value="add reference image"
                  onSelect={() => {
                    onAddReferenceImage();
                    onClose();
                  }}
                  className="text-primary"
                >
                  <Images className="size-4 shrink-0" strokeWidth={1.5} />
                  Add reference image
                </CommandItem>
              )}
            </CommandGroup>
          )}
          <CommandGroup heading="Add node">
            {ADD_NODE_OPTIONS.map(({ type, label, mnemonic }) => {
              const Icon = ICONS[type];
              return (
                <CommandItem
                  key={type}
                  value={label}
                  onSelect={() => {
                    onSelect(type);
                    onClose();
                  }}
                >
                  <Icon
                    className="size-4 shrink-0 text-muted-foreground"
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
