// The MP4 render (D417), with its I/O injected so it runs the same in the Trigger.dev task and in
// tests. Downloads the plan's media into a temp dir, writes the captions (ASS) and their font when
// asked, runs ffmpeg there, and uploads the video LAST. The temp dir is always removed. Failures
// carry a plain message the dialog shows as is; the underlying error rides on `cause` for the log.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { JobStatus } from "@/lib/jobs/types";
import type { CaptionFontKey } from "./caption-fonts";
import { collectMedia, ExportFailure } from "./export-run";
import { fontsUsed, packageNames } from "./package";
import { buildAss } from "./render-ass";
import { outputSize, renderArgs, renderSeconds, type RenderQuality } from "./render-plan";
import type { SequencePlan } from "./sequence-plan";

export type RenderOptions = { quality: RenderQuality; captions: boolean };
export type RenderJobInput = { canvasId: string; nodeId: string; clientId: string; plan: SequencePlan; options: RenderOptions };
export type RenderResult = { url: string; fileName: string; bytes: number; width: number; height: number; durationSeconds: number };
/** What the MP4 dialog polls. */
export type RenderStatus = { status: JobStatus; phase: string | null; error: string | null; result: RenderResult | null };

export type RenderDeps = {
  fetchBytes(url: string): Promise<Uint8Array>;
  readFonts(keys: CaptionFontKey[]): Promise<Array<{ name: string; bytes: Uint8Array }>>;
  ffmpeg(args: string[], cwd: string, onProgress: (seconds: number) => void): Promise<void>;
  upload(bytes: Uint8Array, fileName: string): Promise<string>;
  setPhase(message: string): Promise<void>;
  now(): Date;
};

const RENDER_FAILED = "The video couldn't be rendered. Try again.";
const PROGRESS_STEP = 10;

export async function runEditorRender(input: RenderJobInput, deps: RenderDeps): Promise<RenderResult> {
  const { plan, options } = input;
  const names = packageNames(plan.name, deps.now());
  const size = outputSize(plan, options.quality);
  const total = renderSeconds(plan);

  await deps.setPhase("Collecting the media…");
  const media = await collectMedia(plan, deps.fetchBytes);

  const dir = await mkdtemp(path.join(tmpdir(), "editor-render-"));
  try {
    const inputs = new Map<number, string>();
    for (const m of plan.media) {
      const name = `m${m.id}${path.extname(m.fileName) || ".mp4"}`;
      await writeFile(path.join(dir, name), media.get(m.id)!);
      inputs.set(m.id, name);
    }
    const ass = options.captions ? buildAss(plan, size) : null;
    if (ass) {
      await writeFile(path.join(dir, "captions.ass"), ass, "utf8");
      await mkdir(path.join(dir, "fonts"));
      for (const f of await deps.readFonts(fontsUsed(plan))) {
        if (f.name.endsWith(".ttf")) await writeFile(path.join(dir, "fonts", f.name), f.bytes);
      }
    }

    await deps.setPhase("Rendering…");
    let reported = 0;
    const output = "out.mp4";
    try {
      await deps.ffmpeg(renderArgs(plan, { quality: options.quality, inputs, output, ass: ass ? "captions.ass" : null, fontsDir: ass ? "fonts" : null }), dir, (seconds) => {
        const pct = total > 0 ? Math.min(99, Math.floor((seconds / total) * 100)) : 0;
        if (pct >= reported + PROGRESS_STEP) {
          reported = pct - (pct % PROGRESS_STEP);
          void deps.setPhase(`Rendering… ${reported}%`).catch(() => {});
        }
      });
    } catch (err) {
      throw new ExportFailure(RENDER_FAILED, { cause: err });
    }

    await deps.setPhase("Saving the video…");
    const bytes = new Uint8Array(await readFile(path.join(dir, output)));
    const url = await deps.upload(bytes, names.video);
    return { url, fileName: names.video, bytes: bytes.byteLength, width: size.width, height: size.height, durationSeconds: total };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
