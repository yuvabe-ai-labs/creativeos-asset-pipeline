// The edit turned into a frame-exact plan for the Premiere and OTIO writers (D388). This is the
// ONLY place frames are computed: the edit keeps seconds (D390). Everything is in sequence frames
// at the first piece's picture rate, read from the file (CreativeOS clips are 24 fps, never an
// assumed 25). A piece never asks for frames past the end of the file it shows.
import { captionFont, type CaptionFontKey } from "./caption-fonts";
import { captionTimes } from "./captions";
import type { TitleSpec } from "./premiere-title";
import type { EditDoc, MediaFacts, MediaFile, ReelShape, SourceView } from "./types";

export const SEQUENCE_NAME = "CreativeOS Rough Cut";
export const STANDARD_FRAME: Record<ReelShape, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "16:9": { width: 1920, height: 1080 },
};
const FALLBACK_SAMPLE_RATE = 48000;
const EMPTY_REEL = "Add a clip to the timeline first.";

export type MediaRole = "take" | "lip-synced" | "dub-audio";

export type PlanMedia = {
  id: number;
  url: string;
  fileName: string;
  kind: "video" | "audio";
  role: MediaRole;
  facts: MediaFacts;
  sourceHandle: string;
};

export type PlanClip = {
  label: string;
  start: number;
  end: number;
  picture: { media: number; in: number };
  sound: { media: number; in: number; channels: number } | null;
  dub: { media: number; in: number; out: number; channels: number } | null;
  /** Basic Motion scale in percent, so a clip of another size fits the frame; null = native. */
  scale: number | null;
};

export type PlanTitle = TitleSpec & { start: number; end: number; fontKey: CaptionFontKey };

export type SequencePlan = {
  name: string;
  shape: ReelShape;
  fps: number;
  width: number;
  height: number;
  sampleRate: number;
  media: PlanMedia[];
  clips: PlanClip[];
  titles: PlanTitle[];
};

export type PlanResult = { ok: true; plan: SequencePlan } | { ok: false; reason: string };

const ROLE_LABEL: Record<MediaRole, string> = { take: "clip", "lip-synced": "lip-synced video", "dub-audio": "dub" };

class Unreadable extends Error {}

const safe = (s: string) => s.replace(/[^A-Za-z0-9_.-]/g, "_");
const extOf = (url: string) => {
  const m = new URL(url).pathname.match(/(\.[A-Za-z0-9]{2,4})$/);
  return m ? m[1].toLowerCase() : ".mp4";
};
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Whole frames of a file at the sequence rate, never rounded up past its last real frame. */
export const framesWithin = (seconds: number, fps: number) => Math.floor(seconds * fps + 1e-6);

export function planSequence(doc: EditDoc, sources: SourceView[]): PlanResult {
  const byId = new Map(sources.map((s) => [s.nodeId, s]));
  const pieces = doc.pieces.filter((p) => byId.has(p.sourceNodeId));
  if (pieces.length === 0) return { ok: false, reason: EMPTY_REEL };

  const media: PlanMedia[] = [];
  const mediaFor = (f: MediaFile, role: MediaRole, source: SourceView): PlanMedia => {
    if (!f.facts) throw new Unreadable(`Couldn't read ${source.handle}'s ${ROLE_LABEL[role]}, so the reel can't be exported. Reopen the editor to try again.`);
    const existing = media.find((m) => m.url === f.url);
    if (existing) return existing;
    const id = media.length + 1;
    const m: PlanMedia = {
      id,
      url: f.url,
      fileName: `${String(id).padStart(3, "0")}_${safe(source.handle)}_${role}${extOf(f.url)}`,
      kind: f.facts.video ? "video" : "audio",
      role,
      facts: f.facts,
      sourceHandle: source.handle,
    };
    media.push(m);
    return m;
  };

  try {
    const pictureOf = (sourceId: string, lip: boolean) => {
      const s = byId.get(sourceId)!;
      return lip && s.files.lipSynced
        ? mediaFor(s.files.lipSynced, "lip-synced", s)
        : mediaFor(s.files.original, "take", s);
    };

    const first = pictureOf(pieces[0].sourceNodeId, pieces[0].picture === "lipSynced").facts.video!;
    const fps = first.fps;
    const firstShape: ReelShape = first.width > first.height ? "16:9" : "9:16";
    const frame = firstShape === doc.shape ? { width: first.width, height: first.height } : STANDARD_FRAME[doc.shape];

    const clips: PlanClip[] = [];
    let cursor = 0;
    for (const p of pieces) {
      const source = byId.get(p.sourceNodeId)!;
      const picture = pictureOf(p.sourceNodeId, p.picture === "lipSynced");
      const video = picture.facts.video!;
      const inF = Math.round(p.in * fps);
      const fileEnd = framesWithin(video.frames / video.fps, fps);
      const len = Math.max(1, Math.min(Math.round(p.out * fps) - inF, fileEnd - inF));

      const original = mediaFor(source.files.original, "take", source);
      const sound = original.facts.audio ? { media: original.id, in: inF, channels: original.facts.audio.channels } : null;

      let dub: PlanClip["dub"] = null;
      if (p.sound === "dubbed" && source.files.dubAudio) {
        const d = mediaFor(source.files.dubAudio, "dub-audio", source);
        const out = Math.min(inF + len, framesWithin(d.facts.durationSeconds, fps));
        dub = { media: d.id, in: Math.min(inF, Math.max(0, out - 1)), out, channels: d.facts.audio?.channels ?? 2 };
      }

      const fits = video.width === frame.width && video.height === frame.height;
      clips.push({
        label: source.handle,
        start: cursor,
        end: cursor + len,
        picture: { media: picture.id, in: inF },
        sound,
        dub,
        scale: fits ? null : round2(Math.min(frame.width / video.width, frame.height / video.height) * 100),
      });
      cursor += len;
    }

    const titles: PlanTitle[] = [];
    const reel = { ...doc, pieces };
    for (const c of doc.captions) {
      const t = captionTimes(reel, c);
      if (!t) continue;
      const start = Math.round(t.start * fps);
      const end = Math.min(cursor, Math.round(t.end * fps));
      if (end <= start) continue;
      titles.push({
        start,
        end,
        text: c.text,
        fontKey: c.font,
        fontPostScript: captionFont(c.font).postScript,
        sizePx: Math.round((c.size * Math.min(frame.width, frame.height)) / 1080),
        color: c.color,
        x: c.x,
        y: c.y,
      });
    }

    const sampleRate = media.find((m) => m.facts.audio)?.facts.audio?.sampleRate ?? FALLBACK_SAMPLE_RATE;
    return { ok: true, plan: { name: SEQUENCE_NAME, shape: doc.shape, fps, ...frame, sampleRate, media, clips, titles } };
  } catch (err) {
    if (err instanceof Unreadable) return { ok: false, reason: err.message };
    throw err;
  }
}
