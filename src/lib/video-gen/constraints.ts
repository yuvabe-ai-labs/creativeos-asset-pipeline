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
 * Whether this model's rules make frames and references an either/or choice.
 *
 * Asked of the RULES, not of a live assignment, so the UI can say so before anything is picked —
 * the spine renders "or" between the two groups rather than leaving an operator to discover the
 * exclusivity by being blocked. Probes each side in isolation: if references alone would shut
 * frames off AND a frame alone would shut references off, the two can never coexist.
 *
 * False for Kling O1, which accepts both together, and false for any model with no such rule.
 */
export function areFramesAndRefsExclusive(rules: ConstraintRule[] | undefined): boolean {
  const withRefsOnly = evaluateConstraints(rules, {
    params: {},
    hasStartFrame: false,
    hasEndFrame: false,
    referenceCount: 1,
  });
  const withFrameOnly = evaluateConstraints(rules, {
    params: {},
    hasStartFrame: true,
    hasEndFrame: false,
    referenceCount: 0,
  });
  return withRefsOnly.disableFrameInputs && withFrameOnly.disableRefs;
}

/**
 * Force a role assignment to be one the model's rules can actually satisfy.
 *
 * Veo's rules make the two sets mutually exclusive — references disable frames, frames disable
 * references — but nothing stopped both from being assigned at once. Switching models migrates
 * roles by CAPABILITY only (startFrame / endFrame / maxReferenceImages), then fills unassigned
 * images with defaults, so a node carrying start+end that lands on a refs-capable model gains
 * references as well. The result satisfies no rule evaluation, and the route rejects it at
 * generate time (D97 — the server rejects, it never corrects), which is a failure the operator
 * had no way to cause deliberately.
 *
 * Detection is driven by the rules, never hardcoded: only a MUTUAL block is a contradiction. If
 * just one side fires, the state is legal and intended (references alone disable frames — that
 * is the rule doing its job). Kling O1 declares no exclusion rule at all, so start + end +
 * references stays legal there and passes through untouched.
 *
 * Frames win the tie: D95 makes start+end the default shape of a shot, so references are what
 * gets dropped.
 */
export function reconcileRolesWithRules(
  rules: ConstraintRule[] | undefined,
  imageRoles: Record<string, ImageRole>,
  params: Record<string, unknown>,
): Record<string, ImageRole> {
  const evaluated = evaluateConstraints(rules, buildConstraintState(imageRoles, params));
  if (!evaluated.disableFrameInputs || !evaluated.disableRefs) return imageRoles;
  return Object.fromEntries(
    Object.entries(imageRoles).filter(([, role]) => role !== "reference"),
  );
}

/**
 * D98 — locked parameter values are the source of truth, not a display substitution.
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

/**
 * D97 — the server rejects, it never corrects.
 *
 * Returns the reason a request violates the model's rules, or null when it is legal.
 * Auto-correcting would silently change both what the caller asked for and what they are
 * billed, so a violation is a 400 rather than a fixup. The UI evaluates these same rules and
 * should never let an illegal combination through; this is the backstop for callers that
 * bypass it.
 */
export function validateAgainstRules(
  rules: ConstraintRule[] | undefined,
  state: ConstraintState,
): string | null {
  const evaluated = evaluateConstraints(rules, state);

  if (evaluated.disableGenerate) {
    return evaluated.disableGenerateReason ?? "This combination is not supported";
  }
  for (const [name, value] of Object.entries(evaluated.lockedParams)) {
    if (state.params[name] !== value) {
      return (
        evaluated.lockedParamReasons[name] ??
        `${name} must be ${String(value)} for this combination`
      );
    }
  }
  return null;
}
