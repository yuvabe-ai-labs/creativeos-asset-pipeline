import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { cappedStream, contentTypeOf, MediaTooLargeError, readCapped } from "./media";

/** A response that sends `chunks` pieces of `size` bytes, with no declared length. */
function chunked(chunks: number, size: number, headers: Record<string, string> = {}) {
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent === chunks) return controller.close();
      sent++;
      controller.enqueue(new Uint8Array(size).fill(1));
    },
  });
  return { response: new Response(body, { headers }), sent: () => sent };
}

async function drain(stream: AsyncIterable<unknown>) {
  for await (const chunk of stream) void chunk;
}

describe("contentTypeOf", () => {
  it("lowercases the type and drops its parameters", () => {
    expect(contentTypeOf(new Response("", { headers: { "content-type": "Image/JPEG; charset=x" } }))).toBe("image/jpeg");
  });
});

describe("readCapped", () => {
  it("reads a file within its limit", async () => {
    const { response } = chunked(3, 4);
    expect((await readCapped(response, 100)).byteLength).toBe(12);
  });

  it("refuses a file whose declared size is over the limit, without reading it", async () => {
    const { response, sent } = chunked(3, 4, { "content-length": "500" });
    await expect(readCapped(response, 100)).rejects.toBeInstanceOf(MediaTooLargeError);
    expect(sent()).toBe(0);
  });

  it("stops reading as soon as an undeclared file passes the limit", async () => {
    const { response, sent } = chunked(50, 10);
    await expect(readCapped(response, 25)).rejects.toBeInstanceOf(MediaTooLargeError);
    expect(sent()).toBeLessThan(10);
  });
});

describe("cappedStream", () => {
  it("passes a file through and counts its bytes", async () => {
    const { response } = chunked(5, 8);
    const { stream, bytes } = cappedStream(response, 100);
    await drain(stream);
    expect(bytes()).toBe(40);
  });

  it("fails part way once the file passes the limit", async () => {
    const { response, sent } = chunked(50, 10);
    const { stream } = cappedStream(response, 25);
    await expect(drain(stream)).rejects.toBeInstanceOf(MediaTooLargeError);
    expect(sent()).toBeLessThan(10);
  });

  it("refuses a file whose declared size is over the limit before streaming", () => {
    const { response } = chunked(1, 1, { "content-length": "500" });
    expect(() => cappedStream(response, 100)).toThrow(MediaTooLargeError);
  });
});
