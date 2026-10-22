// OpenTimelineIO JSON ("otio_json"), written directly (D389), ported from the rough-cut spike
// (Timeline.1 / Stack.1 / Track.1 / Clip.2 / Gap.1 / ExternalReference.1 / TimeRange.1 /
// RationalTime.1). Ranges are in sequence frames at the plan's rate. Unlike the spike, sound
// tracks fill with gaps so they stay in sync with the picture, and the dub has its own track.
import { mediaUrl } from "./premiere-xml";
import type { PlanMedia, SequencePlan } from "./sequence-plan";

const time = (value: number, rate: number) => ({ OTIO_SCHEMA: "RationalTime.1", rate, value });
const range = (start: number, duration: number, rate: number) => ({
  OTIO_SCHEMA: "TimeRange.1", duration: time(duration, rate), start_time: time(start, rate),
});

export function buildOtio(plan: SequencePlan): string {
  const fps = plan.fps;
  const media = new Map(plan.media.map((m) => [m.id, m]));
  const available = (m: PlanMedia) =>
    m.facts.video ? range(0, m.facts.video.frames, m.facts.video.fps) : range(0, Math.round(m.facts.durationSeconds * fps), fps);

  const clip = (m: PlanMedia, inn: number, length: number) => ({
    OTIO_SCHEMA: "Clip.2",
    metadata: {},
    name: m.fileName,
    source_range: range(inn, length, fps),
    effects: [],
    markers: [],
    enabled: true,
    color: null,
    media_references: {
      DEFAULT_MEDIA: {
        OTIO_SCHEMA: "ExternalReference.1",
        metadata: {},
        name: "",
        available_range: available(m),
        available_image_bounds: null,
        target_url: mediaUrl(m.fileName),
      },
    },
    active_media_reference_key: "DEFAULT_MEDIA",
  });
  const gap = (length: number) => ({
    OTIO_SCHEMA: "Gap.1", metadata: {}, name: "", source_range: range(0, length, fps), effects: [], markers: [], enabled: true, color: null,
  });
  const track = (name: string, kind: "Video" | "Audio", children: unknown[]) => ({
    OTIO_SCHEMA: "Track.1", metadata: {}, name, source_range: null, effects: [], markers: [], enabled: true, color: null, kind, children,
  });

  const video = plan.clips.map((c) => clip(media.get(c.picture.media)!, c.picture.in, c.end - c.start));
  const sound = plan.clips.map((c) => (c.sound ? clip(media.get(c.sound.media)!, c.sound.in, c.end - c.start) : gap(c.end - c.start)));
  const dub = plan.clips.map((c) => (c.dub ? clip(media.get(c.dub.media)!, c.dub.in, c.dub.out - c.dub.in) : gap(c.end - c.start)));
  const hasDub = plan.clips.some((c) => c.dub);

  return JSON.stringify({
    OTIO_SCHEMA: "Timeline.1",
    metadata: {},
    name: plan.name,
    global_start_time: null,
    tracks: {
      OTIO_SCHEMA: "Stack.1", metadata: {}, name: "tracks", source_range: null, effects: [], markers: [], enabled: true, color: null,
      children: [track("V1", "Video", video), track("A1", "Audio", sound), ...(hasDub ? [track("Dub", "Audio", dub)] : [])],
    },
  }, null, 4);
}
