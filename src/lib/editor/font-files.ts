// The caption fonts' files for the Premiere package (D393): each font used, with its licence (the
// OFL requires the licence to travel with the font). Read from the repo's src/fonts/captions,
// which trigger.config.ts copies into the export task's deploy image (additionalFiles).
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { captionFont, type CaptionFontKey } from "./caption-fonts";

const FONT_DIR = path.join(process.cwd(), "src", "fonts", "captions");

export async function readCaptionFontFiles(keys: CaptionFontKey[]): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  const names = keys.flatMap((k) => [captionFont(k).file, captionFont(k).licence]);
  return Promise.all(names.map(async (name) => ({ name, bytes: new Uint8Array(await readFile(path.join(FONT_DIR, name))) })));
}
