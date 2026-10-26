// The Premiere export (D392, spec §9), with its I/O injected so it runs the same in the
// Trigger.dev task and in tests. It downloads exactly the media the plan uses, builds the
// package, and uploads the zip LAST: a failure at any step leaves no package that looks
// complete. Failures carry a plain message the export dialog shows as is.
import { zipSync } from "fflate";
import type { CaptionFontKey } from "./caption-fonts";
import { fontsUsed, packageEntries, packageNames } from "./package";
import type { SequencePlan } from "./sequence-plan";
import type { JobStatus } from "@/lib/jobs/types";
import type { ReelShape } from "./types";

export const MAX_PACKAGE_MEDIA_BYTES = 700 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 4;

export type ExportJobInput = { canvasId: string; nodeId: string; clientId: string; plan: SequencePlan };

export type ExportSummary = {
  clips: number;
  lipSynced: number;
  dubs: number;
  captions: number;
  fonts: number;
  durationSeconds: number;
  shape: ReelShape;
  fps: number;
};

/** `sequenceName` and `xmlName` are absent on exports made before D416. */
export type ExportResult = { url: string; fileName: string; sequenceName?: string; xmlName?: string; bytes: number; summary: ExportSummary };

/** What the export dialog polls. */
export type ExportStatus = { status: JobStatus; phase: string | null; error: string | null; result: ExportResult | null };

/** A failure whose message is shown to the user as is. */
export class ExportFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExportFailure";
  }
}

/** A download answered with an HTTP error. */
export class DownloadError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
    this.name = "DownloadError";
  }
}

export type ExportDeps = {
  fetchBytes(url: string): Promise<Uint8Array>;
  readFonts(keys: CaptionFontKey[]): Promise<Array<{ name: string; bytes: Uint8Array }>>;
  /** Stores the zip under `fileName`, which is also the name it downloads as. */
  upload(zip: Uint8Array, fileName: string): Promise<string>;
  setPhase(message: string): Promise<void>;
  now(): Date;
};

export async function runEditorExport(input: ExportJobInput, deps: ExportDeps): Promise<ExportResult> {
  const { plan } = input;
  const createdAt = deps.now();
  const names = packageNames(plan.name, createdAt);

  await deps.setPhase("Collecting the media…");
  const media = new Map<number, Uint8Array>();
  let total = 0;
  for (let i = 0; i < plan.media.length; i += DOWNLOAD_CONCURRENCY) {
    await Promise.all(
      plan.media.slice(i, i + DOWNLOAD_CONCURRENCY).map(async (m) => {
        let bytes: Uint8Array;
        try {
          bytes = await deps.fetchBytes(m.url);
        } catch (err) {
          throw new ExportFailure(
            err instanceof DownloadError ? `Couldn't download ${m.fileName} (HTTP ${err.status}).` : `Couldn't download ${m.fileName}.`,
          );
        }
        total += bytes.byteLength;
        if (total > MAX_PACKAGE_MEDIA_BYTES) {
          const mb = Math.round(total / (1024 * 1024));
          throw new ExportFailure(`This reel's media is ${mb} MB, more than the 700 MB a package can hold. Remove some clips and try again.`);
        }
        media.set(m.id, bytes);
      }),
    );
  }
  const fontKeys = fontsUsed(plan);
  const fonts = fontKeys.length ? await deps.readFonts(fontKeys) : [];

  await deps.setPhase("Writing the sequence…");
  const entries = packageEntries(plan, { media, fonts }, createdAt, names);

  await deps.setPhase(`Packaging ${names.zip}…`);
  const zip = zipSync(entries);
  const url = await deps.upload(zip, names.zip);

  const count = (role: string) => plan.media.filter((m) => m.role === role).length;
  const frames = plan.clips.length ? plan.clips[plan.clips.length - 1].end : 0;
  return {
    url,
    fileName: names.zip,
    sequenceName: plan.name,
    xmlName: names.xml,
    bytes: zip.byteLength,
    summary: {
      clips: count("take"),
      lipSynced: count("lip-synced"),
      dubs: count("dub-audio"),
      captions: plan.lines.length,
      fonts: fontKeys.length,
      durationSeconds: frames / plan.fps,
      shape: plan.shape,
      fps: plan.fps,
    },
  };
}
