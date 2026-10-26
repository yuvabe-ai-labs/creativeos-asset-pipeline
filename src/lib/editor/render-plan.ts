// The ffmpeg command for the MP4 (D417). Pure. Each clip is cut by frames at the reel's rate,
// fitted into the frame (black bars, as the preview does), and given its own sound, its dub or
// silence, so picture and sound stay in step; then the clips are joined and, when asked, the
// captions are burned in. Paths are relative: ffmpeg runs in the render's working dir, so no
// path ever needs escaping inside the filter graph.
import { rateParts } from "./premiere-xml";
import type { SequencePlan } from "./sequence-plan";

export type RenderQuality = "full" | "quick";

const QUICK_SHORT_EDGE = 720;
const SAMPLE_RATE = 48000;
const CRF: Record<RenderQuality, string> = { full: "20", quick: "23" };
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const sec = (n: number) => String(Math.round(n * 1e6) / 1e6);

export function outputSize(plan: SequencePlan, quality: RenderQuality): { width: number; height: number } {
  const short = Math.min(plan.width, plan.height);
  if (quality === "full" || short <= QUICK_SHORT_EDGE) return { width: plan.width, height: plan.height };
  const k = QUICK_SHORT_EDGE / short;
  return { width: even(plan.width * k), height: even(plan.height * k) };
}

export function renderSeconds(plan: SequencePlan): number {
  return plan.clips.length ? plan.clips[plan.clips.length - 1].end / plan.fps : 0;
}

function fpsExpr(fps: number): string {
  const { timebase, ntsc } = rateParts(fps);
  return ntsc ? `${timebase * 1000}/1001` : String(timebase);
}

export function renderArgs(
  plan: SequencePlan,
  opts: { quality: RenderQuality; inputs: Map<number, string>; output: string; ass: string | null; fontsDir: string | null },
): string[] {
  const { width: W, height: H } = outputSize(plan, opts.quality);
  const order = plan.media.map((m) => m.id).filter((id) => opts.inputs.has(id));
  const index = new Map(order.map((id, i) => [id, i]));
  const at = (media: number) => {
    const i = index.get(media);
    if (i === undefined) throw new Error(`No input for media ${media}`);
    return i;
  };
  const rate = fpsExpr(plan.fps);

  const parts: string[] = [];
  plan.clips.forEach((c, i) => {
    const len = c.end - c.start;
    const d = sec(len / plan.fps);
    parts.push(
      `[${at(c.picture.media)}:v]fps=${rate},trim=start_frame=${c.picture.in}:end_frame=${c.picture.in + len},setpts=PTS-STARTPTS,` +
        `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p[v${i}]`,
    );
    const sound = c.dubOn && c.dub ? { media: c.dub.media, in: c.dub.in } : c.sound;
    parts.push(
      sound
        ? `[${at(sound.media)}:a]atrim=start=${sec(sound.in / plan.fps)}:duration=${d},asetpts=PTS-STARTPTS,aresample=${SAMPLE_RATE},` +
            `aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=duration=${d}[a${i}]`
        : `anullsrc=r=${SAMPLE_RATE}:cl=stereo,atrim=duration=${d}[a${i}]`,
    );
  });
  const pairs = plan.clips.map((_, i) => `[v${i}][a${i}]`).join("");
  parts.push(`${pairs}concat=n=${plan.clips.length}:v=1:a=1[vc][ac]`);
  const burn = opts.ass !== null;
  if (burn) parts.push(`[vc]ass=filename=${opts.ass}${opts.fontsDir ? `:fontsdir=${opts.fontsDir}` : ""}[vout]`);

  return [
    "-hide_banner", "-y", "-nostats",
    ...order.flatMap((id) => ["-i", opts.inputs.get(id)!]),
    "-filter_complex", parts.join(";"),
    "-map", burn ? "[vout]" : "[vc]", "-map", "[ac]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", CRF[opts.quality], "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-progress", "pipe:1",
    opts.output,
  ];
}
