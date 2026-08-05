"use client";

import { useRef, useState } from "react";
import {
  Square, ImageIcon, Phone, MapPin, Mail, Check, ArrowRight, Star, Share2,
  ShoppingCart, CreditCard, Tag, Truck, Gift, ShoppingBag, Package, Percent, Award, Target,
  MessageCircle, Bell, Users, User,
  ArrowUpRight, ArrowDown, ArrowLeft, Navigation,
  Calendar, Clock, Globe, Wifi, Zap, TrendingUp, Home, Play, Pause, Volume2, Camera, Video,
  Music, Heart, ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fileNodeService } from "@/services/file-node.service";
import type { IconSource } from "@/lib/post/types";

type Props = {
  nodeId: string;
  onAddShape: () => void;
  onAddIcon: (src: IconSource) => void;
  onAddImageUrl: (url: string) => void;
};

type LucideEntry = { name: string; label: string; Icon: typeof Phone };
type LucideGroup = { group: string; items: LucideEntry[] };

// Curated preset — generic Lucide pictograms plus the social marks a contact strip
// needs (Simple Icons, since Lucide 1.0 removed all brand marks — §7.2). Not a full
// searchable icon library: the PRD's scope rule rules that out for V1. Grouped so the
// picker grid reads as sections instead of one undifferentiated wall of glyphs.
// Moved verbatim from post-add-menu.tsx — do not re-derive or re-verify these names.
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

export function PostPanelElements({ nodeId, onAddShape, onAddIcon, onAddImageUrl }: Props) {
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-[0.6rem] font-semibold text-muted-foreground">Shapes</p>
        <Button variant="outline" size="sm" onClick={onAddShape} className="w-full justify-start gap-2">
          <Square className="size-3.5" strokeWidth={1.5} /> Rectangle
        </Button>
      </div>

      <div>
        <p className="mb-1 text-[0.6rem] font-semibold text-muted-foreground">Upload</p>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <ImageIcon className="size-3.5" strokeWidth={1.5} /> {uploading ? "Uploading…" : "Image"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      <div>
        <p className="mb-1 text-[0.6rem] font-semibold text-muted-foreground">Icons</p>
        {LUCIDE_PRESET.map(({ group, items }) => (
          <div key={group} className="mb-2">
            <p className="text-eyebrow px-1 pb-1 text-[0.6rem]!">{group}</p>
            <div className="grid grid-cols-4 gap-1">
              {items.map(({ name, label, Icon }) => (
                <Button
                  key={name} variant="ghost" size="icon" title={label}
                  onClick={() => onAddIcon({ kind: "lucide", name })}
                >
                  <Icon className="size-4" />
                </Button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div>
        <p className="text-eyebrow px-1 pb-1 text-[0.6rem]!">Brands</p>
        <div className="grid grid-cols-4 gap-1">
          {SIMPLE_PRESET.map(({ name, label }) => (
            <Button
              key={name} variant="ghost" size="icon" title={label}
              onClick={() => onAddIcon({ kind: "simple", name })}
            >
              {/* A generic placeholder glyph in the picker row — the actual brand mark
                  renders correctly once placed, via PostIconLayer's Simple Icons path. */}
              <Share2 className="size-4 opacity-40" />
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
