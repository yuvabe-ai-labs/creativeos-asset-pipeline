// Shared shape of a parsed reel SCRIPT (the output of the Script node's parse).
// Mirrors the reelSchema in src/prompts/script-parse.ts. All fields optional
// because a parse may legitimately leave a field empty.

export type ReelShot = { description?: string; duration?: string };

export type ReelScript = {
  title?: string;
  type?: string;
  duration?: string;
  schedule?: {
    date?: string;
    post_time?: string;
    category?: string;
    theme?: string;
  };
  strategic_objective?: string;
  ai_production_type?: string;
  visual_script?: { shots?: ReelShot[]; execution_refinement?: string };
  on_screen_text?: { intro?: string; body?: string[]; outro?: string };
  voiceover?: string;
  music_sound?: string;
  caption?: string;
  cta?: string;
  thumbnail_hook?: string;
  qc_notes?: string[];
  product_links?: string[];
};

// True when the object looks like a parsed reel script (vs an older/odd parse).
// Used to decide between the structured renderer and a raw-JSON fallback.
export function looksLikeReelScript(data: Record<string, unknown>): boolean {
  const r = data as ReelScript;
  return (
    r.strategic_objective !== undefined ||
    r.visual_script !== undefined ||
    r.on_screen_text !== undefined
  );
}
