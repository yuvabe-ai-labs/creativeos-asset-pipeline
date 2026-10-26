// The reel's captions as an ASS subtitle file, burned into the MP4 (D417). Pure. It reads the
// same per-word titles as the Premiere export (D398), so both show the same words at the same
// frames. Sizes are px at the plan's frame, scaled to the output; libass sizes text by the font's
// full line height, so each font's ratio turns the preview's em size into the ASS size.
import { captionFont, type CaptionFontKey } from "./caption-fonts";
import type { TextRun } from "./premiere-title";
import type { PlanTitle, SequencePlan } from "./sequence-plan";

/** The stage's caption box is 88% of the frame wide: 6% each side. */
const SIDE_MARGIN = 0.06;
/** The preview's text shadow: 0.06em down, black at 60%. */
const SHADOW_EM = 0.06;
const SHADOW_ALPHA = 0x66;

/** How libass names each caption font. It matches the family name, not the PostScript name the
 *  Premiere export uses (measured with ffmpeg's libass: "Poppins-Bold" fell back to Arial). The
 *  bundled Poppins and Playfair files are the Bold of their family, so they ask for Bold. */
const ASS_FACE: Record<CaptionFontKey, { family: string; bold: 0 | 1 }> = {
  montserrat: { family: "Montserrat ExtraBold", bold: 0 },
  poppins: { family: "Poppins", bold: 1 },
  "bebas-neue": { family: "Bebas Neue", bold: 0 },
  anton: { family: "Anton", bold: 0 },
  "playfair-display": { family: "Playfair Display", bold: 1 },
};

const byte = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).toUpperCase().padStart(2, "0");
const num = (n: number) => String(Math.round(n * 100) / 100);
const pad2 = (n: number) => String(n).padStart(2, "0");

/** "#rrggbb" as ASS "&HAABBGGRR" (alpha 0 is opaque, 255 transparent). */
export function assColor(hex: string, alpha = 0): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const [r, g, b] = m ? [m[1], m[2], m[3]] : ["FF", "FF", "FF"];
  return `&H${byte(alpha)}${b}${g}${r}`.toUpperCase();
}

/** Seconds as ASS "h:mm:ss.cc". */
export function assTime(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  return `${Math.floor(cs / 360000)}:${pad2(Math.floor(cs / 6000) % 60)}:${pad2(Math.floor(cs / 100) % 60)}.${pad2(cs % 100)}`;
}

/** Text that can't open an override block or a line-break code by accident. */
const escapeText = (s: string) => s.replace(/\\/g, "＼").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, "\\N");

function segments(t: PlanTitle): Array<{ text: string; run?: TextRun }> {
  const out: Array<{ text: string; run?: TextRun }> = [];
  let at = 0;
  for (const run of [...(t.runs ?? [])].sort((a, b) => a.start - b.start)) {
    if (run.start > at) out.push({ text: t.text.slice(at, run.start) });
    out.push({ text: t.text.slice(Math.max(at, run.start), run.end), run });
    at = Math.max(at, run.end);
  }
  if (at < t.text.length) out.push({ text: t.text.slice(at) });
  return out.filter((s) => s.text.length > 0);
}

function override(run: TextRun, look: PlanTitle): string {
  if (run.hidden) {
    // Hide the letters (and their outline or shadow), keep their space and any box behind them.
    return `{\\1a&HFF&${look.stroke ? "\\3a&HFF&" : ""}${!look.stroke && !look.box ? "\\4a&HFF&" : ""}}`;
  }
  if (!run.color) return "";
  return `{\\1c&H${assColor(run.color).slice(4)}&}`; // assColor gives "&H00BBGGRR"; the tag takes "&HBBGGRR&"
}

export function buildAss(plan: SequencePlan, out: { width: number; height: number }): string | null {
  if (plan.titles.length === 0) return null;
  const look = plan.titles[0];
  const scale = out.width / plan.width;
  const font = captionFont(look.fontKey);
  const face = ASS_FACE[font.key];
  const shadow = !look.stroke && !look.box;
  const borderStyle = look.box ? 3 : 1;
  const outline = look.box ? look.box.sizePx * scale : look.stroke ? (look.stroke.widthPx * scale) / 2 : 0;
  const outlineColour = look.box
    ? assColor(look.box.color, 255 * (1 - look.box.opacity / 100))
    : assColor(look.stroke?.color ?? "#000000");
  const margin = Math.round(out.width * SIDE_MARGIN);
  const style = [
    "Caption", face.family, num(look.sizePx * scale * font.assLineHeight),
    assColor(look.color), assColor(look.color), outlineColour, assColor("#000000", SHADOW_ALPHA),
    face.bold, 0, 0, 0, 100, 100, 0, 0, borderStyle, num(outline), num(shadow ? look.sizePx * scale * SHADOW_EM : 0),
    5, margin, margin, 0, 1,
  ].join(",");

  const lines = plan.titles.map((t) => {
    const pos = `{\\pos(${Math.round(t.x * out.width)},${Math.round(t.y * out.height)})}`;
    const body = segments(t)
      .map((s) => {
        const tag = s.run ? override(s.run, t) : "";
        return tag ? `${tag}${escapeText(s.text)}{\\r}` : escapeText(s.text);
      })
      .join("");
    return `Dialogue: ${t.track},${assTime(t.start / plan.fps)},${assTime(t.end / plan.fps)},Caption,,0,0,0,,${pos}${body}`;
  });

  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${out.width}`,
    `PlayResY: ${out.height}`,
    "WrapStyle: 1",
    "ScaledBorderAndShadow: yes",
    "YCbCr Matrix: TV.709",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: ${style}`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...lines,
    "",
  ].join("\n");
}
