"use client";

import { useRef, useState } from "react";
import {
  Plus, Type, Square, ImageIcon, Smile, Phone, MapPin, Mail, Check, ArrowRight, Star, Share2,
  ShoppingCart, CreditCard, Tag, Truck, Gift, ShoppingBag, Package, Percent, Award, Target,
  MessageCircle, Bell, Users, User,
  ArrowUpRight, ArrowDown, ArrowLeft, Navigation,
  Calendar, Clock, Globe, Wifi, Zap, TrendingUp, Home, Play, Pause, Volume2, Camera, Video,
  Music, Heart, ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";
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

type LucideEntry = { name: string; label: string; Icon: typeof Phone };
type LucideGroup = { group: string; items: LucideEntry[] };

// Curated preset — generic Lucide pictograms plus the social marks a contact strip
// needs (Simple Icons, since Lucide 1.0 removed all brand marks — §7.2). Not a full
// searchable icon library: the PRD's scope rule rules that out for V1. Grouped so the
// picker grid reads as sections instead of one undifferentiated wall of glyphs.
const LUCIDE_PRESET: LucideGroup[] = [
  {
    group: "Communication",
    items: [
      { name: "phone", label: "Phone", Icon: Phone },
      { name: "mail", label: "Email", Icon: Mail },
      { name: "map-pin", label: "Location", Icon: MapPin },
      { name: "message-circle", label: "Message", Icon: MessageCircle },
      { name: "bell", label: "Notify", Icon: Bell },
      { name: "share-2", label: "Share", Icon: Share2 },
      { name: "users", label: "Team", Icon: Users },
      { name: "user", label: "Person", Icon: User },
    ],
  },
  {
    group: "Commerce",
    items: [
      { name: "shopping-cart", label: "Cart", Icon: ShoppingCart },
      { name: "shopping-bag", label: "Bag", Icon: ShoppingBag },
      { name: "credit-card", label: "Payment", Icon: CreditCard },
      { name: "tag", label: "Tag", Icon: Tag },
      { name: "percent", label: "Discount", Icon: Percent },
      { name: "truck", label: "Delivery", Icon: Truck },
      { name: "package", label: "Package", Icon: Package },
      { name: "gift", label: "Gift", Icon: Gift },
      { name: "award", label: "Award", Icon: Award },
      { name: "target", label: "Target", Icon: Target },
    ],
  },
  {
    group: "Arrows & UI",
    items: [
      { name: "check", label: "Check", Icon: Check },
      { name: "arrow-right", label: "Arrow", Icon: ArrowRight },
      { name: "arrow-up-right", label: "Arrow Up", Icon: ArrowUpRight },
      { name: "arrow-down", label: "Arrow Down", Icon: ArrowDown },
      { name: "arrow-left", label: "Arrow Left", Icon: ArrowLeft },
      { name: "navigation", label: "Navigate", Icon: Navigation },
      { name: "star", label: "Star", Icon: Star },
    ],
  },
  {
    group: "Misc",
    items: [
      { name: "calendar", label: "Calendar", Icon: Calendar },
      { name: "clock", label: "Clock", Icon: Clock },
      { name: "globe", label: "Globe", Icon: Globe },
      { name: "wifi", label: "Wifi", Icon: Wifi },
      { name: "zap", label: "Zap", Icon: Zap },
      { name: "trending-up", label: "Trending", Icon: TrendingUp },
      { name: "home", label: "Home", Icon: Home },
      { name: "heart", label: "Heart", Icon: Heart },
      { name: "thumbs-up", label: "Like", Icon: ThumbsUp },
      { name: "play", label: "Play", Icon: Play },
      { name: "pause", label: "Pause", Icon: Pause },
      { name: "volume-2", label: "Volume", Icon: Volume2 },
      { name: "camera", label: "Camera", Icon: Camera },
      { name: "image", label: "Image", Icon: ImageIcon },
      { name: "video", label: "Video", Icon: Video },
      { name: "music", label: "Music", Icon: Music },
    ],
  },
];
const SIMPLE_PRESET: { name: string; label: string }[] = [
  { name: "instagram", label: "Instagram" },
  { name: "facebook", label: "Facebook" },
  { name: "whatsapp", label: "WhatsApp" },
  { name: "linkedin", label: "LinkedIn" },
  { name: "x", label: "X" },
  { name: "youtube", label: "YouTube" },
  { name: "tiktok", label: "TikTok" },
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
      // keepExisting: this is a LAYER asset parked under the post node, not the post's
      // own output. Without it, /file/finalize deletes `data.fileUrl` — which for a Post
      // node is the flattened render written by exportRender — and the canvas thumbnail
      // plus getNodeOutput are left pointing at a deleted object.
      const result = await fileNodeService.upload(nodeId, file, { keepExisting: true });
      if (result.fileUrl) onAddImageUrl(result.fileUrl);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
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
          <div className="max-h-80 overflow-y-auto pr-1">
            {LUCIDE_PRESET.map(({ group, items }) => (
              <div key={group} className="mb-2">
                <p className="text-eyebrow px-1 pb-1 text-[0.6rem]!">{group}</p>
                <div className="grid grid-cols-4 gap-1">
                  {items.map(({ name, label, Icon }) => (
                    <Button
                      key={name} variant="ghost" size="icon" title={label}
                      onClick={() => { onAddIcon({ kind: "lucide", name }); setOpen(false); }}
                    >
                      <Icon className="size-4" />
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <p className="text-eyebrow px-1 pb-1 text-[0.6rem]!">Brands</p>
              <div className="grid grid-cols-4 gap-1">
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
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
