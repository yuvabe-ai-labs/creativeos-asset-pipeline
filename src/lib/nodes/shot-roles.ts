// Curated shot-role catalog (D28). Roles come from the deep-research taxonomy; per-role
// `slots` (what must be present) and `avoid` (per-role compliance) steer the composer.
// A pre-rendered constant — "learned later" = refine these lists from eval results
// (a data change here, no architecture change). Mirrors the shot-controls.ts catalog style.

export type ShotRole = {
  key: string;
  label: string;
  slots: string[]; // what the idea must make concrete for this role
  avoid: string[]; // per-role compliance/avoid (on top of the global avoid-list)
};

export const SHOT_ROLES: ShotRole[] = [
  {
    key: "hook",
    label: "Hook / intro",
    slots: ["subject", "tension", "surface or backdrop", "lighting", "motion cue", "text-safe zone"],
    avoid: ["crowded frame", "generic beauty still", "slow reveal with no tension"],
  },
  {
    key: "hero",
    label: "Product hero",
    slots: ["SKU", "label visibility", "surface", "restrained props", "framing", "final hold"],
    avoid: ["obscured label", "too many props", "focus on the wrong plane"],
  },
  {
    key: "texture",
    label: "Texture / detail",
    slots: ["material behaviour", "macro level", "tool or contact point", "residue rule", "light catch"],
    avoid: ["fake texture", "over-retouched gloss", "impossible viscosity"],
  },
  {
    key: "application",
    label: "Application",
    slots: ["body area", "hand type", "amount", "motion", "absorption / finish", "realism"],
    avoid: [
      "medical theater",
      "exaggerated transformation",
      "unreal skin",
      "wide environmental scene",
      "product or skin too small to read",
    ],
  },
  {
    key: "ingredient",
    label: "Ingredient",
    slots: ["ingredient form", "vessel or surface", "freshness", "relation to the product"],
    avoid: ["grocery clutter", "lab clichés", "too many ingredients in one frame"],
  },
  {
    key: "tutorial",
    label: "Tutorial / process",
    slots: ["step order", "hand action", "tool", "pace", "cleanliness", "legibility"],
    avoid: ["rushed montage", "messy surfaces", "unclear sequencing"],
  },
  {
    key: "lifestyle",
    label: "Lifestyle / ritual",
    slots: [
      "environment / setting (the subject of the frame)",
      "time of day",
      "props that build the world",
      "ambient human presence (optional — not applying the product)",
      "mood / ambience",
      "product placed in-scene (present, not being used)",
    ],
    avoid: [
      "the hand or body-contact as the subject",
      "macro application close-up",
      "scooping / smoothing / massaging the product onto skin",
      "generic stock-home look",
      "product too small to read",
    ],
  },
  {
    key: "social-proof",
    label: "Social proof",
    slots: ["review or result cue", "realistic use", "calm believable benefit cue"],
    avoid: ["before/after split", "overclaim copy", "dermatologist theater unless true"],
  },
  {
    key: "bundle",
    label: "Bundle / range",
    slots: ["assortment", "hierarchy", "grouping logic", "surface", "campaign prop"],
    avoid: ["clutter", "equal emphasis on everything", "missing hero product"],
  },
  {
    key: "closure",
    label: "Closure",
    slots: ["final arrangement", "readable label", "CTA-safe area", "hold time"],
    avoid: ["weak end card", "ambiguous product", "no resting frame"],
  },
];

export const DEFAULT_SHOT_ROLE = "hero";

export function getShotRole(key: string): ShotRole {
  return (
    SHOT_ROLES.find((r) => r.key === key) ??
    SHOT_ROLES.find((r) => r.key === DEFAULT_SHOT_ROLE)!
  );
}
