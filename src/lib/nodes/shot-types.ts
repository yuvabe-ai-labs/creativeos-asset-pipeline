export const SHOT_TYPES = [
  "Wide Shot",
  "Medium Shot",
  "Close-Up",
  "Extreme Close-Up",
  "Over the Shoulder",
  "POV",
  "Two Shot",
  "Aerial",
  "Dutch Angle",
] as const;

export type ShotType = (typeof SHOT_TYPES)[number];

const KEYWORDS: Array<{ pattern: RegExp; type: ShotType }> = [
  { pattern: /aerial|drone/i,                           type: "Aerial" },
  { pattern: /extreme\s+close/i,                        type: "Extreme Close-Up" },
  { pattern: /over\s+the\s+shoulder/i,                  type: "Over the Shoulder" },
  { pattern: /dutch\s+angle|canted/i,                   type: "Dutch Angle" },
  { pattern: /two\s+shot/i,                             type: "Two Shot" },
  { pattern: /pov|point\s+of\s+view/i,                  type: "POV" },
  { pattern: /close[\s-]up|close\s+shot/i,              type: "Close-Up" },
  { pattern: /medium\s+shot|mid\s+shot/i,               type: "Medium Shot" },
  { pattern: /wide\s+shot|wide\s+angle|establishing/i,  type: "Wide Shot" },
  { pattern: /\bclose\b/i,                              type: "Close-Up" },
  { pattern: /\bwide\b/i,                               type: "Wide Shot" },
  { pattern: /\bmedium\b/i,                             type: "Medium Shot" },
];

export function deriveShotType(shotText: string): ShotType | undefined {
  for (const { pattern, type } of KEYWORDS) {
    if (pattern.test(shotText)) return type;
  }
  return undefined;
}
