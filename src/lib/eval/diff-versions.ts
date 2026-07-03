import type { TraceVersion } from "@/lib/eval/node-traces";

export type VersionDelta = {
  reroll: boolean;
  changes: { field: "instruction" | "controls" | "kbSlices" | "reference" | "promptVersion"; from: string; to: string }[];
};

const j = (v: unknown) => JSON.stringify(v ?? null);
const refKey = (v: TraceVersion) => (v.upstream ?? []).map((u) => u.versionId).join(",");

// What the human changed between two attempts — by STRUCTURED field comparison,
// no LLM (spec §4.5). `reroll` = nothing structured changed (same request, output
// moved = model nondeterminism).
export function diffVersions(prev: TraceVersion, curr: TraceVersion): VersionDelta {
  const changes: VersionDelta["changes"] = [];
  const push = (field: VersionDelta["changes"][number]["field"], from: string, to: string) =>
    changes.push({ field, from, to });

  if ((prev.instruction ?? "") !== (curr.instruction ?? "")) push("instruction", prev.instruction ?? "", curr.instruction ?? "");
  if (j(prev.controls) !== j(curr.controls)) push("controls", j(prev.controls), j(curr.controls));
  if (j(prev.kbSlices) !== j(curr.kbSlices)) push("kbSlices", j(prev.kbSlices), j(curr.kbSlices));
  if (refKey(prev) !== refKey(curr)) push("reference", refKey(prev), refKey(curr));
  if ((prev.promptVersion ?? "") !== (curr.promptVersion ?? "")) push("promptVersion", prev.promptVersion ?? "", curr.promptVersion ?? "");

  return { reroll: changes.length === 0, changes };
}
