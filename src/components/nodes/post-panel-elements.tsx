"use client";

import { useRef, useState } from "react";
import {
  Square, ImageIcon, Phone, MapPin, Mail, Check, ArrowRight, Star, Share2,
  ShoppingCart, CreditCard, Tag, Truck, Gift, ShoppingBag, Package, Percent, Award, Target,
  MessageCircle, Bell, Users, User,
  ArrowUpRight, ArrowDown, ArrowLeft, Navigation,
  Calendar, Clock, Globe, Wifi, Zap, TrendingUp, Home, Play, Pause, Volume2, Camera, Video,
  Music, Heart, ThumbsUp,
  Circle, Triangle, Diamond, Minus, MoveRight,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fileNodeService } from "@/services/file-node.service";
import { resolveIconSource } from "@/lib/post/icons";
import { ELEMENT_DRAG_TYPE, serializeElementDrag, type ElementDragPayload } from "@/lib/post/element-drag";
import type { IconSource, ShapeKind } from "@/lib/post/types";

/** Every tile in this panel adds on click AND on drop, so they all carry the same two props. */
function dragProps(payload: ElementDragPayload) {
  return {
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(ELEMENT_DRAG_TYPE, serializeElementDrag(payload));
      e.dataTransfer.effectAllowed = "copy" as const;
    },
    className: "cursor-grab active:cursor-grabbing",
  };
}

type Props = {
  nodeId: string;
  onAddShape: (shape: ShapeKind) => void;
  onAddIcon: (src: IconSource) => void;
  onAddImageUrl: (url: string) => void;
};

/** The primitives offered in the Shapes row. Icon names verified against lucide-react. */
const SHAPE_PRESET: { shape: ShapeKind; label: string; Icon: typeof Phone }[] = [
  { shape: "rect", label: "Rectangle", Icon: Square },
  { shape: "ellipse", label: "Circle", Icon: Circle },
  { shape: "triangle", label: "Triangle", Icon: Triangle },
  { shape: "diamond", label: "Diamond", Icon: Diamond },
  { shape: "star", label: "Star", Icon: Star },
  { shape: "line", label: "Line", Icon: Minus },
  { shape: "arrow", label: "Arrow", Icon: MoveRight },
];

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
// No LinkedIn: Simple Icons dropped the mark at LinkedIn's own request, so `siLinkedin` does
// not exist in v16 and `resolveIconSource` falls back to an empty path — the tile placed a
// genuinely invisible icon on the canvas. Vendoring a copy would re-take the trademark risk
// upstream removed it to avoid. Upload the mark instead if your brand guidelines allow it.
//
// The filter below is the guard for the general case: a brand pulled in a future
// simple-icons bump disappears from the picker rather than silently placing nothing.
const SIMPLE_PRESET: { name: string; label: string }[] = [
  { name: "instagram", label: "Instagram" },
  { name: "facebook", label: "Facebook" },
  { name: "whatsapp", label: "WhatsApp" },
  { name: "x", label: "X" },
  { name: "youtube", label: "YouTube" },
  { name: "tiktok", label: "TikTok" },
].filter(({ name }) => {
  const r = resolveIconSource({ kind: "simple", name });
  return r.kind === "simple" && r.value.path !== "";
});

/**
 * The real Simple Icons mark, drawn from the same `resolveIconSource` the canvas uses — so
 * the tile IS the glyph you get. It previously rendered one shared placeholder for every
 * brand, which made seven identical buttons distinguishable only by tooltip.
 *
 * Drawn in `currentColor`, not the brand hex: the row sits directly under four rows of
 * neutral Lucide glyphs, and seven saturated brand colours would shout next to them. These
 * seven marks are unmistakable by silhouette alone.
 */
function BrandGlyph({ name }: { name: string }) {
  const resolved = resolveIconSource({ kind: "simple", name });
  // SIMPLE_PRESET is filtered to resolvable marks, so `path` is always non-empty here.
  const path = resolved.kind === "simple" ? resolved.value.path : "";
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

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
        <p className="mb-1 text-[0.6rem] text-muted-foreground">Click to add, or drag onto the canvas.</p>
        <div className="grid grid-cols-4 gap-1">
          {SHAPE_PRESET.map(({ shape, label, Icon }) => (
            <Button
              key={shape}
              variant="outline"
              size="icon"
              title={label}
              aria-label={label}
              onClick={() => onAddShape(shape)}
              {...dragProps({ kind: "shape", shape })}
            >
              <Icon className="size-4" strokeWidth={1.5} />
            </Button>
          ))}
        </div>
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
                  {...dragProps({ kind: "icon", src: { kind: "lucide", name } })}
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
              aria-label={label}
              onClick={() => onAddIcon({ kind: "simple", name })}
              {...dragProps({ kind: "icon", src: { kind: "simple", name } })}
            >
              <BrandGlyph name={name} />
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
