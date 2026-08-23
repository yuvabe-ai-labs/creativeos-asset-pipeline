import type { ParamSpec } from "@/lib/image-gen/types";

/**
 * What a past generation was actually run with — reading `node_versions.params_used` back
 * through the model's own param specs (YUV-295).
 *
 * `params_used` is a raw record: whatever the model's specs resolved to at generate time, plus
 * the pipeline's own bookkeeping (video stamps `durationSeconds` from the provider's response
 * in lib/generations/complete.ts; image stamps `modelId`, `tokensUsed` and the output's
 * dimensions in the image-generate route). The specs are what named, ordered and bounded those
 * values in the UI, so both functions here go through them rather than guessing from the keys.
 *
 * Spec-driven rather than model-id-driven, so image and video share one implementation: each
 * caller resolves its own model map and passes `spec.params` (or undefined for a model the
 * client no longer knows).
 */

/** Written by the pipeline, never chosen by the operator — see the module note above. */
const INTERNAL_PARAM_KEYS = new Set([
  "durationSeconds",
  "modelId",
  "tokensUsed",
  "imageWidth",
  "imageHeight",
  "fileSizeBytes",
]);

/** Panel order: primary group first, then by each spec's own `order` (the sort the params panels use). */
function inPanelOrder(specs: ParamSpec[]): ParamSpec[] {
  const groupRank = (g: ParamSpec["group"]) => (g === "primary" ? 0 : 1);
  return [...specs].sort(
    (a, b) => groupRank(a.group) - groupRank(b.group) || a.order - b.order,
  );
}

/**
 * The params to write onto the node when a version is restored, or null when `specs` is
 * missing — i.e. the client no longer knows that version's model. The caller then restores the
 * output alone rather than writing settings that belong to no model.
 *
 * Fills anything the version predates with that model's current default instead of leaving it
 * undefined, and carries only real settings (never the bookkeeping keys above).
 */
export function paramsForRestore(
  specs: ParamSpec[] | undefined,
  paramsUsed: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!specs) return null;
  return Object.fromEntries(
    specs.map((p) => [
      p.name,
      paramsUsed[p.name] !== undefined ? paramsUsed[p.name] : p.defaultValue,
    ]),
  );
}

export type VersionParamEntry = { name: string; label: string; value: string };

function formatValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "On" : "Off";
  return String(value);
}

/** "aspect_ratio" -> "Aspect ratio", for versions whose model spec is gone. */
function humanizeKey(key: string): string {
  const words = key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A version's params as label/value pairs for its History row.
 *
 * Long-form text params (a tuned negative prompt) are left out: the row is a one-line summary
 * answering "what produced this", and a paragraph would crowd out the handful of values —
 * resolution, duration, aspect, quality — that actually distinguish two versions of the same
 * shot. Falls back to humanized keys when the model spec is gone, so a legacy version can still
 * say what it ran with.
 */
export function describeVersionParams(
  specs: ParamSpec[] | undefined,
  paramsUsed: Record<string, unknown>,
): VersionParamEntry[] {
  if (!specs) {
    return Object.entries(paramsUsed)
      .filter(([key, value]) => !INTERNAL_PARAM_KEYS.has(key) && value !== undefined && value !== null)
      .map(([key, value]) => ({ name: key, label: humanizeKey(key), value: formatValue(value) }));
  }
  return inPanelOrder(specs)
    .filter((p) => p.visible && p.component !== "textarea")
    .filter((p) => paramsUsed[p.name] !== undefined && paramsUsed[p.name] !== null)
    .map((p) => ({ name: p.name, label: p.label, value: formatValue(paramsUsed[p.name]) }));
}
