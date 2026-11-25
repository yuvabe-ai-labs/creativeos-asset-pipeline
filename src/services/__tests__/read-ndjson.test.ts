import { describe, expect, it } from "vitest";
import { readNdjson } from "../read-ndjson";

const bytes = (text: string) => new TextEncoder().encode(text);
/** A body that arrives in exactly these chunks. */
function body(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}
async function lines(chunks: Uint8Array[]) {
  const seen: unknown[] = [];
  await readNdjson(body(chunks), (line) => seen.push(line));
  return seen;
}
const NL = String.fromCharCode(10);

describe("readNdjson", () => {
  it("yields each line once, in order", async () => {
    expect(await lines([bytes(`{"n":1}${NL}{"n":2}${NL}`)])).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("joins a line split across two chunks", async () => {
    expect(await lines([bytes('{"type":"te'), bytes(`xt"}${NL}`)])).toEqual([{ type: "text" }]);
  });

  it("joins a multi-byte character split across two chunks", async () => {
    const whole = bytes(`{"text":"Saving…"}${NL}`);
    const cut = whole.indexOf(0xe2) + 1; // inside the three bytes of the ellipsis
    expect(await lines([whole.slice(0, cut), whole.slice(cut)])).toEqual([{ text: "Saving…" }]);
  });

  it("yields a last line that has no newline after it", async () => {
    expect(await lines([bytes(`{"n":1}${NL}{"n":2}`)])).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("skips blank lines", async () => {
    expect(await lines([bytes(`${NL}{"n":1}${NL}${NL}  ${NL}`)])).toEqual([{ n: 1 }]);
  });

  it("stops and rejects when a handler throws", async () => {
    const seen: unknown[] = [];
    const reading = readNdjson(body([bytes(`{"n":1}${NL}{"n":2}${NL}`)]), (line) => {
      seen.push(line);
      throw new Error("stop");
    });
    await expect(reading).rejects.toThrow("stop");
    expect(seen).toEqual([{ n: 1 }]);
  });
});
