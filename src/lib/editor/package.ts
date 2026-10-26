// The Premiere package's contents (D389, spec §9): the sequence, OTIO, SRT, manifest, README,
// caption fonts and exactly the media the reel uses. Pure: the export task supplies the bytes.
import { strToU8, type Zippable } from "fflate";
import { slugify } from "@/lib/slug";
import type { CaptionFontKey } from "./caption-fonts";
import { buildOtio } from "./otio";
import { buildPremiereXml } from "./premiere-xml";
import type { SequencePlan } from "./sequence-plan";
import { toSrt } from "./srt";
import { formatTime } from "./timeline";

const FALLBACK_REEL_NAME = "CreativeOS reel";
const FALLBACK_SLUG = "creativeos-reel";

/** The sequence's name, from the saved client and canvas names (D416): "Jackfruit 365 · Reel 2". */
export function reelName(clientName: string | null | undefined, canvasName: string | null | undefined): string {
  const parts = [clientName, canvasName].map((s) => s?.trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : FALLBACK_REEL_NAME;
}

export type PackageNames = { dir: string; zip: string; xml: string };

/** Each export's own names (D416): the zip and its folder carry the reel and the day, so two
 *  reels, or two days' exports, never share a name; the XML carries the reel, and Premiere names
 *  the bin it imports into after it. Plain ASCII, safe in a path and a download header. */
export function packageNames(sequenceName: string, at: Date): PackageNames {
  const slug = slugify(sequenceName) || FALLBACK_SLUG;
  const stamp = `${slug}-${at.toISOString().slice(0, 10)}`;
  return { dir: stamp, zip: `${stamp}.zip`, xml: `${slug}.xml` };
}

export function fontsUsed(plan: SequencePlan): CaptionFontKey[] {
  return [...new Set(plan.titles.map((t) => t.fontKey))];
}

/** Premiere's Import screen ignores sequence XML: the README says where to drag it (D389). */
export function packageReadme(plan: SequencePlan, names: PackageNames): string {
  const dubbed = plan.clips.some((c) => c.dub);
  const titled = plan.lines.length > 0;
  const lastTitleTrack = 2 + Math.max(0, ...plan.titles.map((t) => t.track));
  const captionTracks = lastTitleTrack > 2 ? `V2–V${lastTitleTrack}` : "V2";
  const altTrack = titled ? lastTitleTrack + 1 : 2;
  const alternates = plan.clips.some((c) => c.altPicture);
  return [
    `${plan.name}: Premiere Pro package from CreativeOS`,
    "",
    "How to open it",
    "1. Unzip this folder somewhere permanent, not a temp folder.",
    `2. Drag ${names.xml} into Premiere's Project panel.`,
    "   Premiere's Import screen doesn't read it.",
    `3. Open the "${plan.name}" sequence. If clips show offline, link one`,
    "   clip to the media folder and Premiere finds the rest.",
    "",
    "What's in the sequence",
    "- V1: the clips in order, with their trims.",
    "- A1/A2: each clip's own sound, linked to its picture.",
    ...(dubbed
      ? [
          "- A3/A4: the dubbed sound, linked to its picture. Whichever a clip doesn't play,",
          "  dub or original, is still there, switched off: turn it on to swap.",
        ]
      : []),
    ...(titled
      ? [
          `- ${captionTracks}: the captions as editable Premiere text.`,
          "- captions.srt: the same captions as plain text (File > Import gives a plain",
          "  caption track instead).",
          "- fonts/: the caption fonts. Install them if Premiere doesn't have them.",
        ]
      : []),
    ...(alternates
      ? [`- V${altTrack}: the other picture of lip-synced clips (original or lip-synced), switched off.`]
      : []),
    ...(plan.markers.length
      ? ["- Markers: each dubbed or lip-synced clip, and each pause in speech of 0.6 s or more."]
      : []),
    "- media/: exactly the files this reel uses.",
    "",
  ].join("\n");
}

export function packageManifest(plan: SequencePlan, createdAt: Date): Record<string, unknown> {
  const frames = plan.clips.length ? plan.clips[plan.clips.length - 1].end : 0;
  return {
    generator: "creativeos-rough-cut-editor",
    createdAt: createdAt.toISOString(),
    sequence: { name: plan.name, shape: plan.shape, fps: plan.fps, width: plan.width, height: plan.height, frames, duration: formatTime(frames / plan.fps) },
    media: plan.media.map((m) => ({ fileName: m.fileName, role: m.role, source: m.sourceHandle, facts: m.facts })),
    clips: plan.clips.map((c, i) => ({ order: i + 1, source: c.label, start: c.start, end: c.end, picture: c.picture, sound: c.sound, dub: c.dub, scale: c.scale })),
    captions: plan.lines.map((l) => ({ text: l.text, start: l.start, end: l.end })),
    captionStyle: plan.titles[0] ? { font: plan.titles[0].fontPostScript, size: plan.titles[0].sizePx, color: plan.titles[0].color, x: plan.titles[0].x, y: plan.titles[0].y } : null,
  };
}

export function packageEntries(
  plan: SequencePlan,
  bytes: { media: Map<number, Uint8Array>; fonts: Array<{ name: string; bytes: Uint8Array }> },
  createdAt: Date,
  names: PackageNames,
): Zippable {
  const media: Zippable = {};
  for (const m of plan.media) {
    const b = bytes.media.get(m.id);
    if (!b) throw new Error(`No bytes for ${m.fileName}`);
    media[m.fileName] = [b, { level: 0 }]; // already compressed: store, don't deflate
  }
  const dir: Zippable = {
    [names.xml]: strToU8(buildPremiereXml(plan)),
    "timeline.otio": strToU8(buildOtio(plan)),
    "manifest.json": strToU8(JSON.stringify(packageManifest(plan, createdAt), null, 2)),
    "README.txt": strToU8(packageReadme(plan, names)),
    media,
  };
  if (plan.lines.length > 0) {
    dir["captions.srt"] = strToU8(toSrt(plan.lines.map((l) => ({ start: l.start / plan.fps, end: l.end / plan.fps, text: l.text }))));
    dir.fonts = Object.fromEntries(bytes.fonts.map((f) => [f.name, f.bytes]));
  }
  return { [names.dir]: dir };
}
