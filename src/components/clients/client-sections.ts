import type { ClientScopedKey } from "@/lib/permissions/catalogue";
import { BookOpen, FileText, Globe, Images, UserRound, type LucideIcon } from "lucide-react";

export type ClientSection = {
  href: (slug: string) => string;
  icon: LucideIcon;
  label: string;
  hint: string;
  /** Pinned sections get a labelled action on the home tile; the rest live in its ⋯ menu. */
  pinned?: boolean;
  /** The view a person needs to see this section's link (D499: no view → not shown). */
  need: ClientScopedKey;
};

/**
 * The client's surfaces beside its canvases, in display order. One list feeds the Settings
 * menu on the client page and, split by `pinned`, the home tile's actions and its ⋯ menu —
 * so no entry point can disagree about what a client has.
 */
export const CLIENT_SECTIONS: ClientSection[] = [
  {
    href: (slug) => `/clients/${slug}/scripts`,
    icon: FileText,
    label: "Scripts",
    need: "scripts.view",
    hint: "Reel scripts, draft to sign-off",
    pinned: true,
  },
  {
    href: (slug) => `/clients/${slug}/kb`,
    icon: BookOpen,
    label: "Brand KB",
    need: "brand_knowledge.view",
    hint: "Positioning, products, audience",
  },
  {
    href: (slug) => `/clients/${slug}/brand-assets`,
    icon: Images,
    label: "Brand assets",
    need: "brand_assets.view",
    hint: "Imported from website and socials",
  },
  {
    href: (slug) => `/clients/${slug}/market`,
    icon: Globe,
    label: "Market",
    need: "market.view",
    hint: "Direct, Adjacent and Signals",
  },
  {
    href: (slug) => `/clients/${slug}/avatars`,
    icon: UserRound,
    label: "Avatars",
    need: "avatars.view",
    hint: "Reusable characters and voices",
    pinned: true,
  },
];
