/** Reads a streamed answer made of one JSON object per line (D337, D515) and calls `onLine` with
 *  each one, in order. A line or a character cut in two by the network is put back together, blank
 *  lines are skipped, and a last line with no newline after it still counts. If `onLine` throws,
 *  reading stops and the error is the caller's. */
export async function readNdjson<T>(body: ReadableStream<Uint8Array>, onLine: (line: T) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const handle = (line: string) => {
    if (line.trim()) onLine(JSON.parse(line) as T);
  };
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) {
        handle(buffer.slice(0, i));
        buffer = buffer.slice(i + 1);
      }
    }
    handle(buffer + decoder.decode());
  } finally {
    // Stops the download when the caller gave up part-way; a no-op once the body has ended.
    void reader.cancel().catch(() => {});
  }
}
