// Reading an imported file without holding more of it in memory than it needs (D483). An image
// is read whole but stops the moment it passes its limit. A video is never read whole: it passes
// through as a stream, counted on the way.
import "server-only";
import { Readable, Transform } from "node:stream";

/** A file over its limit. The download stops there, so the file never fully lands in memory. */
export class MediaTooLargeError extends Error {
  constructor(public readonly limit: number) {
    super(`larger than ${Math.round(limit / (1024 * 1024))} MB`);
    this.name = "MediaTooLargeError";
  }
}

/** The response's media type, lowercased and without parameters. */
export function contentTypeOf(res: Response): string {
  return res.headers.get("content-type")?.split(";")[0].trim().toLowerCase() || "application/octet-stream";
}

/** Stops reading a response that will not be used, so its connection is released. */
export function discardBody(res: Response): void {
  res.body?.cancel().catch(() => {});
}

/** Refuses a file whose declared size is already over the limit, before reading any of it. */
function assertDeclaredWithin(res: Response, limit: number): void {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    discardBody(res);
    throw new MediaTooLargeError(limit);
  }
}

/**
 * Reads a whole response, stopping as soon as it passes `limit`. A server may declare no size,
 * or the wrong one, so the bytes are counted as they arrive rather than trusted.
 */
export async function readCapped(res: Response, limit: number): Promise<Buffer> {
  assertDeclaredWithin(res, limit);
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw new MediaTooLargeError(limit);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks, total);
}

/**
 * A response body as a Node stream that fails once it passes `limit`. Only a small piece is in
 * memory at a time, whatever the file's size. `bytes()` is how much has passed so far.
 */
export function cappedStream(res: Response, limit: number): { stream: Readable; bytes: () => number } {
  assertDeclaredWithin(res, limit);
  let total = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      total += chunk.length;
      if (total > limit) return done(new MediaTooLargeError(limit));
      done(null, chunk);
    },
  });
  if (!res.body) {
    counter.end();
    return { stream: counter, bytes: () => total };
  }
  const source = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  // pipe() does not pass errors along, so each side stops the other.
  source.on("error", (e) => counter.destroy(e));
  counter.on("close", () => source.destroy());
  source.pipe(counter);
  return { stream: counter, bytes: () => total };
}
