// Final Cut Pro 7 XML ("xmeml") for Premiere Pro, written directly in TypeScript (D388). Ported
// from the rough-cut spike, whose output opened in the user's Windows Premiere on 2026-10-20.
//
// What differs from OpenTimelineIO's fcp_xml adapter, on purpose:
//  1. Audio clipitems are real, linked clipitems. The link block matches what Premiere itself
//     exports (linkclipref + mediatype + trackindex + clipindex [+ groupindex]); OTIO wrote the
//     audio copies as empty stubs reusing the VIDEO ids and dropped <link>.
//  2. Each file keeps its own frame rate; the sequence takes the plan's rate. All clipitem
//     in/out/start/end values are sequence frames, computed once in sequence-plan.ts.
//  3. Picture and sound may come from different files (a lip-synced picture over the original
//     sound), each with its own masterclip.
//  4. A dub sits on its own audio tracks (group 2); the original sound stays, switched off.
//  5. Captions are styled Graphic titles on V2 (premiere-title.ts).
// Media paths are relative (media/…): a package built in the cloud can't know where it will be
// unzipped, so Premiere needs at most one relink. Element meanings: Apple's (retired) FCP XML
// Interchange Format element catalog.
import { titleClipitem } from "./premiere-title";
import { framesWithin, type PlanMedia, type SequencePlan } from "./sequence-plan";
import { rate, serialize, timecode, x, type XNode } from "./xml-node";

export { rateParts } from "./xml-node";

export function mediaUrl(fileName: string): string {
  return `media/${encodeURIComponent(fileName)}`;
}

function fileElement(m: PlanMedia, seqFps: number): XNode {
  const id = `file-${m.id}`;
  const { video, audio } = m.facts;
  const audioMedia = audio && x("audio", null,
    x("samplecharacteristics", null, x("depth", null, 16), x("samplerate", null, audio.sampleRate)),
    x("channelcount", null, audio.channels),
  );
  if (!video) {
    return x("file", { id },
      x("name", null, m.fileName),
      x("pathurl", null, mediaUrl(m.fileName)),
      rate(seqFps),
      x("duration", null, framesWithin(m.facts.durationSeconds, seqFps)),
      x("media", null, audioMedia),
    );
  }
  return x("file", { id },
    x("name", null, m.fileName),
    x("pathurl", null, mediaUrl(m.fileName)),
    rate(video.fps),
    x("duration", null, video.frames),
    timecode(video.fps),
    x("media", null,
      x("video", null,
        x("samplecharacteristics", null, rate(video.fps), x("width", null, video.width), x("height", null, video.height)),
      ),
      audioMedia,
    ),
  );
}

/** Scale-to-fit for a clip whose picture isn't the sequence's frame size. */
function basicMotion(scale: number): XNode {
  return x("filter", null,
    x("effect", null,
      x("name", null, "Basic Motion"),
      x("effectid", null, "basic"),
      x("effectcategory", null, "motion"),
      x("effecttype", null, "motion"),
      x("mediatype", null, "video"),
      x("parameter", { authoringApp: "PremierePro" },
        x("parameterid", null, "scale"),
        x("name", null, "Scale"),
        x("valuemin", null, 0),
        x("valuemax", null, 1000),
        x("value", null, scale),
      ),
    ),
  );
}

type LinkRef = { id: string; mediatype: "video" | "audio"; trackindex: number; clipindex: number; group?: number };

const linkElement = (l: LinkRef) =>
  x("link", null,
    x("linkclipref", null, l.id),
    x("mediatype", null, l.mediatype),
    x("trackindex", null, l.trackindex),
    x("clipindex", null, l.clipindex),
    l.group !== undefined && x("groupindex", null, l.group),
  );

export function buildPremiereXml(plan: SequencePlan): string {
  const seqFps = plan.fps;
  const mediaById = new Map(plan.media.map((m) => [m.id, m]));
  const media = (id: number) => mediaById.get(id)!;
  const lengthInSeq = (m: PlanMedia) =>
    framesWithin(m.facts.video ? m.facts.video.frames / m.facts.video.fps : m.facts.durationSeconds, seqFps);
  const pairOf = (channels: number) => Math.min(2, channels);

  const written = new Set<number>();
  const fileRef = (m: PlanMedia) => {
    if (written.has(m.id)) return x("file", { id: `file-${m.id}` });
    written.add(m.id);
    return fileElement(m, seqFps);
  };

  const origTracks = Math.max(1, ...plan.clips.map((c) => (c.sound ? pairOf(c.sound.channels) : 0)));
  const dubTracks = Math.max(0, ...plan.clips.map((c) => (c.dub ? pairOf(c.dub.channels) : 0)));
  const audioCounters = Array.from({ length: origTracks + dubTracks }, () => 0);

  // Lay out every clip first, so each clipitem can carry the full set of links.
  const placed = plan.clips.map((clip, n) => {
    const video: LinkRef = { id: `clipitem-v${n + 1}`, mediatype: "video", trackindex: 1, clipindex: n + 1 };
    const audio: LinkRef[] = Array.from({ length: clip.sound ? pairOf(clip.sound.channels) : 0 }, (_, ch) => ({
      id: `clipitem-a${ch + 1}-${n + 1}`, mediatype: "audio", trackindex: ch + 1, clipindex: ++audioCounters[ch], group: 1,
    }));
    const dub: LinkRef[] = Array.from({ length: clip.dub ? pairOf(clip.dub.channels) : 0 }, (_, ch) => ({
      id: `clipitem-d${ch + 1}-${n + 1}`, mediatype: "audio", trackindex: origTracks + ch + 1,
      clipindex: ++audioCounters[origTracks + ch], group: 2,
    }));
    return { clip, video, audio, dub, len: clip.end - clip.start };
  });
  type Placed = (typeof placed)[number];
  const links = (p: Placed) => [p.video, ...p.audio, ...p.dub].map(linkElement);

  const videoItem = (p: Placed) => {
    const m = media(p.clip.picture.media);
    const inn = p.clip.picture.in;
    return x("clipitem", { id: p.video.id },
      x("masterclipid", null, `masterclip-${m.id}`),
      x("name", null, m.fileName),
      x("enabled", null, "TRUE"),
      x("duration", null, lengthInSeq(m)),
      rate(seqFps),
      x("start", null, p.clip.start), x("end", null, p.clip.end), x("in", null, inn), x("out", null, inn + p.len),
      fileRef(m),
      x("sourcetrack", null, x("mediatype", null, "video"), x("trackindex", null, 1)),
      p.clip.scale !== null && basicMotion(p.clip.scale),
      ...links(p),
    );
  };

  // The original sound stays in the sequence but is switched off under a dub.
  const audioItem = (p: Placed, self: LinkRef, ch: number) => {
    const m = media(p.clip.sound!.media);
    const inn = p.clip.sound!.in;
    return x("clipitem", { id: self.id },
      x("masterclipid", null, `masterclip-${m.id}`),
      x("name", null, m.fileName),
      x("enabled", null, p.clip.dub ? "FALSE" : "TRUE"),
      x("duration", null, lengthInSeq(m)),
      rate(seqFps),
      x("start", null, p.clip.start), x("end", null, p.clip.end), x("in", null, inn), x("out", null, inn + p.len),
      fileRef(m),
      x("sourcetrack", null, x("mediatype", null, "audio"), x("trackindex", null, ch + 1)),
      ...links(p),
    );
  };

  const dubItem = (p: Placed, self: LinkRef, ch: number) => {
    const d = p.clip.dub!;
    const m = media(d.media);
    return x("clipitem", { id: self.id },
      x("masterclipid", null, `masterclip-${m.id}`),
      x("name", null, m.fileName),
      x("enabled", null, "TRUE"),
      x("duration", null, lengthInSeq(m)),
      rate(seqFps),
      x("start", null, p.clip.start), x("end", null, p.clip.start + (d.out - d.in)), x("in", null, d.in), x("out", null, d.out),
      fileRef(m),
      x("sourcetrack", null, x("mediatype", null, "audio"), x("trackindex", null, ch + 1)),
      ...links(p),
    );
  };

  const audioTracks = [
    ...Array.from({ length: origTracks }, (_, ch) =>
      x("track", null, ...placed.filter((p) => p.audio[ch]).map((p) => audioItem(p, p.audio[ch], ch)))),
    ...Array.from({ length: dubTracks }, (_, ch) =>
      x("track", null, ...placed.filter((p) => p.dub[ch]).map((p) => dubItem(p, p.dub[ch], ch)))),
  ];

  const titles = plan.titles.map((t, i) => titleClipitem({
    n: i + 1, title: t, start: t.start, end: t.end, fps: seqFps, width: plan.width, height: plan.height,
  }));

  const duration = plan.clips.length ? plan.clips[plan.clips.length - 1].end : 0;
  const sequence = x("sequence", { id: "sequence-1" },
    x("name", null, plan.name),
    x("duration", null, duration),
    rate(seqFps),
    timecode(seqFps),
    x("media", null,
      x("video", null,
        x("format", null,
          x("samplecharacteristics", null, rate(seqFps), x("width", null, plan.width), x("height", null, plan.height), x("pixelaspectratio", null, "square")),
        ),
        x("track", null, ...placed.map(videoItem)),
        titles.length > 0 && x("track", null, ...titles),
      ),
      x("audio", null,
        x("numOutputChannels", null, 2),
        x("format", null, x("samplecharacteristics", null, x("depth", null, 16), x("samplerate", null, plan.sampleRate))),
        ...audioTracks,
      ),
    ),
  );

  const doc = x("xmeml", { version: "4" }, x("project", null, x("name", null, plan.name), x("children", null, sequence)));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n${serialize(doc)}\n`;
}
