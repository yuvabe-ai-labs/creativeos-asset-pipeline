"use client";

import { useRef, useState } from "react";
import {
  Plus, Type, Square, ImageIcon, Smile, Phone, MapPin, Mail, Check, ArrowRight, Star, Share2,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { fileNodeService } from "@/services/file-node.service";
import type { IconSource } from "@/lib/post/types";

type Props = {
  nodeId: string;
  onAddText: () => void;
  onAddShape: () => void;
  onAddImageUrl: (url: string) => void;
  onAddIcon: (src: IconSource) => void;
};

// Curated preset — generic Lucide pictograms plus the social marks a contact strip
// needs (Simple Icons, since Lucide 1.0 removed all brand marks — §7.2). Not a full
// searchable icon library: the PRD's scope rule rules that out for V1.
const LUCIDE_PRESET: { name: string; label: string; Icon: typeof Phone }[] = [
  { name: "phone", label: "Phone", Icon: Phone },
  { name: "map-pin", label: "Location", Icon: MapPin },
  { name: "mail", label: "Email", Icon: Mail },
  { name: "check", label: "Check", Icon: Check },
  { name: "arrow-right", label: "Arrow", Icon: ArrowRight },
  { name: "star", label: "Star", Icon: Star },
];
const SIMPLE_PRESET: { name: string; label: string }[] = [
  { name: "instagram", label: "Instagram" },
  { name: "facebook", label: "Facebook" },
  { name: "whatsapp", label: "WhatsApp" },
  { name: "linkedin", label: "LinkedIn" },
];

export function PostAddMenu({ nodeId, onAddText, onAddShape, onAddImageUrl, onAddIcon }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"root" | "icon">("root");
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const result = await fileNodeService.upload(nodeId, file);
      if (result.fileUrl) onAddImageUrl(result.fileUrl);
      setOpen(false);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setTab("root"); }}>
      <PopoverTrigger
        render={<Button variant="outline" size="icon" aria-label="Add layer"><Plus className="size-4" /></Button>}
      />
      <PopoverContent side="right" align="start" className="w-56 p-1.5">
        {tab === "root" ? (
          <div className="flex flex-col">
            <Button
              variant="ghost" className="justify-start gap-2"
              onClick={() => { onAddText(); setOpen(false); }}
            >
              <Type className="size-4" /> Text
            </Button>
            <Button
              variant="ghost" className="justify-start gap-2"
              onClick={() => { onAddShape(); setOpen(false); }}
            >
              <Square className="size-4" /> Shape
            </Button>
            <Button
              variant="ghost" className="justify-start gap-2"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <ImageIcon className="size-4" /> {uploading ? "Uploading…" : "Image"}
            </Button>
            <Button
              variant="ghost" className="justify-start gap-2"
              onClick={() => setTab("icon")}
            >
              <Smile className="size-4" /> Icon
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1">
            {LUCIDE_PRESET.map(({ name, label, Icon }) => (
              <Button
                key={name} variant="ghost" size="icon" title={label}
                onClick={() => { onAddIcon({ kind: "lucide", name }); setOpen(false); }}
              >
                <Icon className="size-4" />
              </Button>
            ))}
            {SIMPLE_PRESET.map(({ name, label }) => (
              <Button
                key={name} variant="ghost" size="icon" title={label}
                onClick={() => { onAddIcon({ kind: "simple", name }); setOpen(false); }}
              >
                {/* A generic placeholder glyph in the picker row — the actual brand mark
                    renders correctly once placed, via PostIconLayer's Simple Icons path. */}
                <Share2 className="size-4 opacity-40" />
              </Button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
