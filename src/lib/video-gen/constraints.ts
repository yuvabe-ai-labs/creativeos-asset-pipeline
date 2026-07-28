import type {
  Condition,
  ConstraintRule,
  ConstraintState,
  EvaluatedConstraints,
} from "./types";

type ImageRole = "start_frame" | "end_frame" | "reference";

export function buildConstraintState(
  imageRoles: Record<string, ImageRole>,
  params: Record<string, unknown>,
): ConstraintState {
  const roles = Object.values(imageRoles);
  return {
    params,
    hasStartFrame: roles.includes("start_frame"),
    hasEndFrame: roles.includes("end_frame"),
    referenceCount: roles.filter((r) => r === "reference").length,
  };
}

function evaluateCondition(condition: Condition, state: ConstraintState): boolean {
  if ("field" in condition) {
    const fieldValue = state[condition.field as keyof ConstraintState];
    switch (condition.op) {
      case "eq":  return fieldValue === condition.value;
      case "gt":
        return typeof fieldValue === "number" && typeof condition.value === "number"
          ? fieldValue > condition.value
          : false;
      case "gte":
        return typeof fieldValue === "number" && typeof condition.value === "number"
          ? fieldValue >= condition.value
          : false;
      default: return false;
    }
  }
  if (condition.op === "and")
    return condition.conditions.every((c) => evaluateCondition(c, state));
  if (condition.op === "or")
    return condition.conditions.some((c) => evaluateCondition(c, state));
  return false;
}

export function evaluateConstraints(
  rules: ConstraintRule[] | undefined,
  state: ConstraintState,
): EvaluatedConstraints {
  const result: EvaluatedConstraints = {
    lockedParams: {},
    lockedParamReasons: {},
    disableFrameInputs: false,
    disableRefs: false,
    disableGenerate: false,
  };

  if (!rules) return result;

  for (const rule of rules) {
    if (!evaluateCondition(rule.when, state)) continue;

    if (rule.effect.disableFrameInputs && !result.disableFrameInputs) {
      result.disableFrameInputs = true;
      result.disableFrameInputsReason = rule.reason;
    }
    if (rule.effect.disableRefs && !result.disableRefs) {
      result.disableRefs = true;
      result.disableRefsReason = rule.reason;
    }
    if (rule.effect.disableGenerate && !result.disableGenerate) {
      result.disableGenerate = true;
      result.disableGenerateReason = rule.reason;
    }
    for (const { name, value } of rule.effect.lockParams ?? []) {
      result.lockedParams[name] = value;
      result.lockedParamReasons[name] = rule.reason;
    }
  }

  return result;
}

/**
 * D86 — locked parameter values are the source of truth, not a display substitution.
 *
 * The params panel used to render `lockedParams[name]` while `params[name]` kept the stale
 * value, and the control was `disabled` so `onParamChange` could never reconcile them. Since
 * `params` is what gets posted, the UI showed a locked 8 and sent 6.
 *
 * Returns `params` merged with `lockedParams`, or `null` when no change is needed — the null
 * return lets callers early-out of an effect instead of setting state on every render.
 */
export function reconcileLockedParams(
  params: Record<string, unknown>,
  lockedParams: Record<string, unknown>,
): Record<string, unknown> | null {
  const entries = Object.entries(lockedParams);
  if (entries.length === 0) return null;
  if (!entries.some(([name, value]) => params[name] !== value)) return null;
  return { ...params, ...lockedParams };
}
