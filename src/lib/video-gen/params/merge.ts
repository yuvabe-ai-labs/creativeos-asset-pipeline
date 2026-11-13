import { defaultsForVideoModel, videoGenClientModelMap } from "../client-models";
import type { VideoGenClientModelSpec } from "../types";

/**
 * The params a node carries onto `newModel`: each value the new model accepts is kept, the rest
 * fall back to its defaults.
 *
 * D486 — between two models of ONE provider (Omni 1.1 ↔ 1.2) the operator is switching version,
 * not starting over, so free text (the negative prompt) is kept and an out-of-range slider is
 * clamped to the nearest end instead of reset. Across providers the tuned defaults still win:
 * each provider's negative-prompt default is written for that provider's artifacts.
 */
export function smartMergeVideoParams(
  currentParams: Record<string, unknown>,
  newModel: VideoGenClientModelSpec,
  previousModelId?: string,
): Record<string, unknown> {
  const newDefaults = defaultsForVideoModel(newModel.id);
  const sameProvider =
    previousModelId !== undefined && videoGenClientModelMap[previousModelId]?.provider === newModel.provider;
  const result: Record<string, unknown> = {};

  for (const param of newModel.params) {
    const current = currentParams[param.name];

    if (current === undefined) {
      result[param.name] = newDefaults[param.name];
      continue;
    }

    const constraints = param.constraints;

    if (constraints.type === "select") {
      result[param.name] = constraints.options.includes(current as string)
        ? current
        : newDefaults[param.name];
    } else if (constraints.type === "slider") {
      const val = current as number;
      if (val >= constraints.min && val <= constraints.max) result[param.name] = val;
      else if (sameProvider && typeof val === "number") {
        result[param.name] = Math.min(constraints.max, Math.max(constraints.min, val));
      } else result[param.name] = newDefaults[param.name];
    } else if (constraints.type === "textarea" && sameProvider && typeof current === "string") {
      result[param.name] = constraints.maxLength ? current.slice(0, constraints.maxLength) : current;
    } else {
      result[param.name] = newDefaults[param.name];
    }
  }

  return result;
}
