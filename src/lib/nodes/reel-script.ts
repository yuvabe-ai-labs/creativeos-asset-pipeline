// Shared shape of a parsed reel SCRIPT (the output of the Script node's parse).
// Mirrors the reelSchema in src/prompts/script-parse.ts. All fields optional
// because a parse may legitimately leave a field empty.

/**
 * ONE CAMERA SETUP — not one timecoded block (D198).
 *
 * A script's timecoded block ("0-3 SEC — THE HOOK") is a BEAT, and a beat usually holds several
 * shots. The 20s CHUPPS script has 5 blocks and 18 shots.
 */
export type ReelShot = {
  description?: string;
  /** The parent BEAT's timing exactly as written — "0-3 sec". Display only. */
  duration?: string;
  /**
   * THIS shot's own length in whole seconds — not the end of its timecode range, and not the
   * beat's length. Grouping needs arithmetic and `duration` is free text ("0-3 sec", "3 sec",
   * "22-26 seconds"), so the model returns the number rather than the fan-out guessing at prose
   * it did not anticipate.
   *
   * The shots of one beat may sum to MORE than the beat's scripted length — four 1s shots in a 3s
   * hook is 4s, generated long and trimmed in the edit on a shot carrying no voiceover. Forcing
   * the sum to match would push shots under the 1s floor.
   */
  duration_seconds?: number;
  /**
   * 0-based index of the timecoded block this shot came from. Consecutive shots of one block
   * share it, and grouping never splits a beat that fits the cap (D199).
   *
   * Absent on scripts parsed before v3 — such a shot is treated as its own beat, so those scripts
   * group exactly as they did before. Re-extract upgrades them.
   */
  beat_index?: number;
  /** That block's heading as written — "0-3 SEC — THE HOOK". Display only. */
  beat_label?: string;
};

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
