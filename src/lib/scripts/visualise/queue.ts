/**
 * D346 — Generate all's queue: runs `work` over `items` in order, at most `limit` at a time.
 * Once `stop()` says so (the credit cap was hit) nothing new starts; items already running
 * finish. A failing item does not stop the others: `work` reports its own errors.
 */
export async function runQueue<T>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<void>,
  stop: () => boolean = () => false,
): Promise<{ started: T[] }> {
  const started: T[] = [];
  let next = 0;
  async function lane() {
    while (next < items.length && !stop()) {
      const item = items[next++];
      started.push(item);
      await work(item).catch(() => undefined);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  return { started };
}
