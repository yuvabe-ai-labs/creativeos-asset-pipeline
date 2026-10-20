// The Premiere package's contents (D388, spec §9): the sequence, OTIO, SRT, manifest, README,
// caption fonts and exactly the media the reel uses. Pure: the export task supplies the bytes.
import { strToU8, type Zippable } from "fflate";
import type { CaptionFontKey } from "./caption-fonts";
import { buildOtio } from "./otio";
import { buildPremiereXml } from "./premiere-xml";
import type { SequencePlan } from "./sequence-plan";
import { toSrt } from "./srt";
import { formatTime } from "./timeline";

export const PACKAGE_DIR = "creativeos-reel";
export const PACKAGE_ZIP_NAME = "creativeos-reel.zip";
export const PREMIERE_XML_NAME = "creativeos-premiere.xml";

export function fontsUsed(plan: SequencePlan): CaptionFontKey[] {
  return [...new Set(plan.titles.map((t) => t.fontKey))];
}

/** Premiere's Import screen ignores sequence XML: the README says where to drag it (D388). */
export function packageReadme(plan: SequencePlan): string {
  const dubbed = plan.clips.some((c) => c.dub);
  const titled = plan.titles.length > 0;
  const lastTitleTrack = 2 + Math.max(0, ...plan.titles.map((t) => t.track));
  const captionTracks = lastTitleTrack > 2 ? `V2–V${lastTitleTrack}` : "V2";
  return [
    "CreativeOS rough cut: Premiere Pro package",
    "",
    "How to open it",
    "1. Unzip this folder somewhere permanent, not a temp folder.",
    `2. Drag ${PREMIERE_XML_NAME} into Premiere's Project panel.`,
    "   Premiere's Import screen doesn't read it.",
    `3. Open the "${plan.name}" sequence. If clips show offline, link one`,
    "   clip to the media folder and Premiere finds the rest.",
    "",
    "What's in the sequence",
    "- V1: the clips in order, with their trims.",
    "- A1/A2: each clip's own sound, linked to its picture.",
    ...(dubbed
      ? [
          "- A3/A4: the dubbed sound, linked to its picture. The original sound is still",
          "  on A1/A2, switched off, so it can be brought back.",
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
    captions: plan.titles.map((t) => ({ text: t.text, start: t.start, end: t.end, font: t.fontPostScript, size: t.sizePx, color: t.color, x: t.x, y: t.y })),
  };
}

export function packageEntries(
  plan: SequencePlan,
  bytes: { media: Map<number, Uint8Array>; fonts: Array<{ name: string; bytes: Uint8Array }> },
  createdAt: Date,
): Zippable {
  const media: Zippable = {};
  for (const m of plan.media) {
    const b = bytes.media.get(m.id);
    if (!b) throw new Error(`No bytes for ${m.fileName}`);
    media[m.fileName] = [b, { level: 0 }]; // already compressed: store, don't deflate
  }
  const dir: Zippable = {
    [PREMIERE_XML_NAME]: strToU8(buildPremiereXml(plan)),
    "timeline.otio": strToU8(buildOtio(plan)),
    "manifest.json": strToU8(JSON.stringify(packageManifest(plan, createdAt), null, 2)),
    "README.txt": strToU8(packageReadme(plan)),
    media,
  };
  if (plan.titles.length > 0) {
    dir["captions.srt"] = strToU8(toSrt(plan.titles.map((t) => ({ start: t.start / plan.fps, end: t.end / plan.fps, text: t.text }))));
    dir.fonts = Object.fromEntries(bytes.fonts.map((f) => [f.name, f.bytes]));
  }
  return { [PACKAGE_DIR]: dir };
}
