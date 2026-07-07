// Alpha polarity for OpenAI's images.edit mask. Per the docs the mask carries an alpha channel;
// which side is edited is NOT stated explicitly, so these are VERIFIED EMPIRICALLY (plan Task 9).
// Assumption until verified: painted region → transparent → editable.
export const EDIT_ALPHA = 0; // painted region  → transparent → model may edit here
export const KEEP_ALPHA = 255; // untouched pixel → opaque      → preserved

export type RGBA = { data: Uint8ClampedArray; width: number; height: number };

// Turn a transparent drawing overlay (painted pixels have alpha > 0) into an OpenAI edit mask:
// painted → EDIT_ALPHA, everything else → KEEP_ALPHA. RGB is normalized to black throughout
// (only the alpha channel is meaningful to the API).
export function overlayToMaskRGBA(overlay: RGBA): RGBA {
  const { data, width, height } = overlay;
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const painted = data[i + 3] > 0;
    out[i] = 0;
    out[i + 1] = 0;
    out[i + 2] = 0;
    out[i + 3] = painted ? EDIT_ALPHA : KEEP_ALPHA;
  }
  return { data: out, width, height };
}
