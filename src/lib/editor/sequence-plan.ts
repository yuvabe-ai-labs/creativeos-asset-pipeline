// The edit turned into a frame-exact plan for the Premiere and OTIO writers (D389). This is the
// ONLY place frames are computed: the edit keeps seconds (D391). Everything is in sequence frames
// at the first piece's picture rate, read from the file (CreativeOS clips are 24 fps, never an
// assumed 25). A piece never asks for frames past the end of the file it shows.
import { captionFont, type CaptionFontKey } from "./caption-fonts";
import { BOX_OPACITY, boxPadPx, dimColor, displayText, sizePx, strokePx } from "./caption-style";
import { wordFrames } from "./caption-words";
import { captionTimes } from "./captions";
import { pieceSoundFile } from "./playback";
import { dubLanguageLabel } from "@/lib/dubbing/types";
import type { TextRun, TitleSpec } from "./premiere-title";
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
  /** The source's dub whenever it has one (D409); `dubOn` says whether the clip plays it. */
  dub: { media: number; in: number; out: number; channels: number } | null;
  dubOn: boolean;
  /** The picture not chosen (original or lip-synced), kept on its own track, switched off (D409). */
  altPicture: { media: number; in: number; len: number } | null;
  /** Basic Motion scale in percent, so a clip of another size fits the frame; null = native. */
  scale: number | null;
};

/** track: which caption track (V2 + track) it sits on, so overlapping captions never share one. */
export type PlanTitle = TitleSpec & { start: number; end: number; fontKey: CaptionFontKey; track: number };

/** A sequence marker (D409): a clip's dub and lip sync, or a pause. end null: a point marker. */
export type PlanMarker = { start: number; end: number | null; name: string };

/** One caption as a line, in sequence frames: what the SRT and the manifest carry. */
export type PlanLine = { start: number; end: number; text: string };

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
  lines: PlanLine[];
  markers: PlanMarker[];
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

/** Greedy interval assignment: each title takes the first track free at its start. One FCP7
 *  track can't hold overlapping clipitems, and Premiere would drop or cut one of them. */
function assignTitleTracks(titles: PlanTitle[]): void {
  const trackEnds: number[] = [];
  for (const t of [...titles].sort((a, b) => a.start - b.start)) {
    const free = trackEnds.findIndex((end) => end <= t.start);
    t.track = free < 0 ? trackEnds.length : free;
    trackEnds[t.track] = t.end;
  }
}

/** pauses: per sound file URL, pauses in that file's seconds (from its transcript, D409). */
export function planSequence(doc: EditDoc, sources: SourceView[], opts: { pauses?: ReadonlyMap<string, Array<[number, number]>> } = {}): PlanResult {
  const byId = new Map(sources.map((s) => [s.nodeId, s]));
  const pieces = doc.pieces;
  if (pieces.length === 0) return { ok: false, reason: EMPTY_REEL };
  // Never drop a piece silently: the package would differ from the reel on screen.
  if (pieces.some((p) => !byId.has(p.sourceNodeId))) {
    return { ok: false, reason: "A clip in the reel has no finished take now, so the reel can't be exported. Remove its pieces or give it a take on the canvas." };
  }

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
    const markers: PlanMarker[] = [];
    let cursor = 0;
    for (const [n, p] of pieces.entries()) {
      const source = byId.get(p.sourceNodeId)!;
      const picture = pictureOf(p.sourceNodeId, p.picture === "lipSynced");
      const video = picture.facts.video!;
      const inF = Math.round(p.in * fps);
      const fileEnd = framesWithin(video.frames / video.fps, fps);
      const len = Math.max(1, Math.min(Math.round(p.out * fps) - inF, fileEnd - inF));

      const original = mediaFor(source.files.original, "take", source);
      const sound = original.facts.audio ? { media: original.id, in: inF, channels: original.facts.audio.channels } : null;

      let dub: PlanClip["dub"] = null;
      const dubOn = p.sound === "dubbed" && Boolean(source.files.dubAudio);
      if (source.files.dubAudio) {
        const d = mediaFor(source.files.dubAudio, "dub-audio", source);
        const out = Math.min(inF + len, framesWithin(d.facts.durationSeconds, fps));
        dub = { media: d.id, in: Math.min(inF, Math.max(0, out - 1)), out, channels: d.facts.audio?.channels ?? 2 };
      }

      // The other picture, when the source has both, for the editor to switch to in Premiere.
      let altPicture: PlanClip["altPicture"] = null;
      if (source.files.lipSynced) {
        const alt = pictureOf(p.sourceNodeId, p.picture !== "lipSynced");
        const altVideo = alt.facts.video;
        if (alt.id !== picture.id && altVideo) altPicture = { media: alt.id, in: inF, len: Math.max(1, Math.min(len, framesWithin(altVideo.frames / altVideo.fps, fps) - inF)) };
      }

      const fits = video.width === frame.width && video.height === frame.height;
      clips.push({
        label: source.handle,
        start: cursor,
        end: cursor + len,
        picture: { media: picture.id, in: inF },
        sound,
        dub,
        dubOn,
        altPicture,
        scale: fits ? null : round2(Math.min(frame.width / video.width, frame.height / video.height) * 100),
      });

      const lang = source.language ? dubLanguageLabel(source.language) : "the";
      const notes = [
        dub && (dubOn ? `dubbed (${lang})` : `${lang} dub on A3/A4, off`),
        source.files.lipSynced && (p.picture === "lipSynced" ? "lip-synced" : "lip-synced picture on its own track, off"),
      ].filter(Boolean);
      if (notes.length) markers.push({ start: cursor, end: null, name: `${n + 1}. ${source.handle}: ${notes.join(", ")}` });
      const soundUrl = pieceSoundFile(p, source).url;
      for (const [a, b] of opts.pauses?.get(soundUrl) ?? []) {
        if (b <= p.in || a >= p.out) continue;
        const s = cursor + Math.round((Math.max(a, p.in) - p.in) * fps);
        const e = cursor + Math.round((Math.min(b, p.out) - p.in) * fps);
        if (e > s) markers.push({ start: s, end: e, name: `Pause ${(Math.min(b, p.out) - Math.max(a, p.in)).toFixed(1)} s` });
      }
      cursor += len;
    }

    // D398 — the reel's one caption style; with word by word, one title per word, each holding the
    // whole line with the word being said coloured and the words not said yet dimmed or hidden.
    const titles: PlanTitle[] = [];
    const lines: PlanLine[] = [];
    const reel = { ...doc, pieces };
    const style = doc.captionStyle;
    const shortEdge = Math.min(frame.width, frame.height);
    const look = {
      fontKey: style.font,
      fontPostScript: captionFont(style.font).postScript,
      sizePx: sizePx(style, shortEdge),
      color: style.color,
      x: style.x,
      y: style.y,
      ...(style.outline ? { stroke: { color: "#000000", widthPx: strokePx(style, shortEdge) } } : {}),
      ...(style.box ? { box: { color: style.boxColor, opacity: BOX_OPACITY, sizePx: boxPadPx(style, shortEdge) } } : {}),
      track: 0,
    };
    const dim = dimColor(style);
    for (const c of doc.captions) {
      const t = captionTimes(reel, c);
      if (!t) continue;
      const start = Math.round(t.start * fps);
      const end = Math.min(cursor, Math.round(t.end * fps));
      if (end <= start) continue;
      const frames = wordFrames(reel, c, fps);
      const text = displayText(frames && frames.length ? frames.map((f) => f.text).join(" ") : c.text, style);
      lines.push({ start, end, text });
      if (!style.wordByWord || !frames || frames.length === 0) {
        titles.push({ ...look, start, end, text });
        continue;
      }
      frames.forEach((f, i) => {
        const s = i === 0 ? start : Math.max(start, f.start);
        const e = i === frames.length - 1 ? end : Math.min(end, f.end);
        if (e <= s) return;
        const runs: TextRun[] = [{ start: f.charStart, end: f.charEnd, color: style.activeColor }];
        if (style.upcoming !== "show") {
          for (const later of frames.slice(i + 1)) {
            runs.push(style.upcoming === "hide" ? { start: later.charStart, end: later.charEnd, hidden: true } : { start: later.charStart, end: later.charEnd, color: dim });
          }
        }
        titles.push({ ...look, start: s, end: e, text, runs });
      });
    }
    assignTitleTracks(titles);

    const sampleRate = media.find((m) => m.facts.audio)?.facts.audio?.sampleRate ?? FALLBACK_SAMPLE_RATE;
    return { ok: true, plan: { name: SEQUENCE_NAME, shape: doc.shape, fps, ...frame, sampleRate, media, clips, titles, lines, markers } };
  } catch (err) {
    if (err instanceof Unreadable) return { ok: false, reason: err.message };
    throw err;
  }
}
