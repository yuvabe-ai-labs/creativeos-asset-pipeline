import type { ScriptDoc } from "../schema";

// Piece 5.1 §3.8 (D508) — what a copilot change touched on the Visualise board, as the board's
// target ids ("cast:{id}", "location:{id}", "product:{id}", "shot:{id}"), so the page can show each
// one land. Something removed has nothing left to show.

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function changed<T extends { id: string }>(prefix: string, before: readonly T[], after: readonly T[]): string[] {
  const old = new Map(before.map((x) => [x.id, x]));
  return after.filter((x) => !old.has(x.id) || !same(old.get(x.id), x)).map((x) => `${prefix}:${x.id}`);
}

export function changedTargets(before: ScriptDoc, after: ScriptDoc): string[] {
  return [
    ...changed("cast", before.cast, after.cast),
    ...changed("location", before.locations, after.locations),
    ...changed("product", before.products, after.products),
    ...changed("shot", before.shots, after.shots),
  ];
}
