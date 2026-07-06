import { defaultsForModel } from "../client-models";
import type { ClientModelSpec } from "../types";

export function smartMergeParams(
  currentParams: Record<string, unknown>,
  newModel: ClientModelSpec,
): Record<string, unknown> {
  const newDefaults = defaultsForModel(newModel);
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
      result[param.name] =
        val >= constraints.min && val <= constraints.max
          ? val
          : newDefaults[param.name];
    } else {
      result[param.name] = newDefaults[param.name];
    }
  }

  return result;
}
