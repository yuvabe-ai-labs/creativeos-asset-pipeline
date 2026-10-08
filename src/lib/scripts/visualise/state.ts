import type { Avatar } from "@/lib/avatars/schema";
import { listSentence } from "@/lib/avatars/generation";
import type { ScriptDoc } from "@/lib/scripts/schema";
import { PANEL_PROMPT_MAX, PANEL_RUNNING_TIMEOUT_MS, PANEL_TIMED_OUT } from "./constants";
import { castReadyForPanels, type PanelInputs } from "./panel-inputs";
import type { DrawBody, PanelTake } from "./schema";

// Spec §6.4–§6.7, §7, §8.1 — the state of every panel, what the readiness line counts and what
// Generate all draws, as pure functions over the takes and today's inputs.

export type PanelStatus = "not_yet" | "waiting" | "generating" | "ready" | "out_of_date" | "failed";
export type StaleReason = "shot" | "avatar";

export type PanelView = {
  status: PanelStatus;
  /** The take the client sees. Kept when out of date: a panel is never redrawn on its own. */
  pick: PanelTake | null;
  /** Every drawn take, oldest first (Take 1, Take 2…). */
  takes: PanelTake[];
  /** The latest attempt's message when it failed after the pick (or with no pick at all). */
  failure: string | null;
  staleBecause: StaleReason[];
  waitingFor: string[];
  canGenerate: boolean;
};

/** D343 — why a take no longer matches the script and the avatars as they are now. */
export function staleReasons(take: PanelTake, inputs: Pick<PanelInputs, "shotKey" | "faces">): StaleReason[] {
  const reasons: StaleReason[] = [];
  if (take.shotKey !== inputs.shotKey) reasons.push("shot");
  const castIds = new Set([...Object.keys(inputs.faces), ...Object.keys(take.faces)]);
  for (const id of castIds) {
    const then = take.faces[id];
    const now = inputs.faces[id];
    if (!then || !now || then.avatarId !== now.avatarId || then.faceKey !== now.faceKey) {
      reasons.push("avatar");
      break;
    }
  }
  return reasons;
}

const byCreated = (a: PanelTake, b: PanelTake) => a.createdAt.localeCompare(b.createdAt);

export function panelView(input: {
  inputs: Pick<PanelInputs, "shotKey" | "faces" | "waitingFor">;
  /** This shot's takes, in any order. */
  takes: PanelTake[];
  pickId: string | undefined;
  /** A draw this browser started and is still waiting on. */
  drawing: boolean;
  now: number;
}): PanelView {
  const settled = [...input.takes].sort(byCreated).map((t) =>
    t.status === "running" && input.now - Date.parse(t.createdAt) > PANEL_RUNNING_TIMEOUT_MS
      ? { ...t, status: "failed" as const, error: PANEL_TIMED_OUT }
      : t,
  );
  const takes = settled.filter((t) => t.status === "succeeded");
  const pick = takes.find((t) => t.id === input.pickId) ?? null;
  const latest = settled[settled.length - 1] ?? null;
  const failure = latest?.status === "failed" && (!pick || latest.createdAt > pick.createdAt)
    ? latest.error ?? "The panel could not be drawn."
    : null;
  const staleBecause = pick ? staleReasons(pick, input.inputs) : [];
  const canGenerate = input.inputs.waitingFor.length === 0;

  let status: PanelStatus;
  if (input.drawing || latest?.status === "running") status = "generating";
  else if (pick) status = staleBecause.length > 0 ? "out_of_date" : "ready";
  else if (!canGenerate) status = "waiting";
  else if (failure) status = "failed";
  else status = "not_yet";

  return { status, pick, takes, failure, staleBecause, waitingFor: input.inputs.waitingFor, canGenerate };
}

/** D344 — the prompt a draw sends. A plain redraw keeps a hand-edited prompt while the shot is
 *  unchanged; once the shot's text changed it starts fresh from the new text (spec §8.1), and the
 *  edited prompt stays with its take. */
export function promptForDraw(
  body: DrawBody,
  current: PanelTake | null,
  inputs: Pick<PanelInputs, "prompt" | "shotKey">,
): { ok: true; prompt: string; edited: boolean } | { ok: false; error: string } {
  if (body.kind === "reset") return { ok: true, prompt: inputs.prompt, edited: false };
  if (body.kind === "edited") {
    const prompt = body.prompt.trim();
    if (!prompt) return { ok: false, error: "The prompt is empty." };
    if (prompt.length > PANEL_PROMPT_MAX) return { ok: false, error: `The prompt can be at most ${PANEL_PROMPT_MAX} characters.` };
    return { ok: true, prompt, edited: prompt !== inputs.prompt };
  }
  if (current?.promptEdited && current.shotKey === inputs.shotKey) {
    return { ok: true, prompt: current.prompt, edited: true };
  }
  return { ok: true, prompt: inputs.prompt, edited: false };
}

/** A take still drawing within the timeout. Polling stops on an orphaned "running" take, which
 *  panelView already shows as failed. */
export function hasLiveDraw(takes: Pick<PanelTake, "status" | "createdAt">[], now: number): boolean {
  return takes.some((t) => t.status === "running" && now - Date.parse(t.createdAt) <= PANEL_RUNNING_TIMEOUT_MS);
}

/** D344, spec §8.1 — what the prompt box starts from: the picked take's exact prompt while the
 *  shot is unchanged; once the shot changed, the fresh prompt built from the new text (a
 *  hand-edited prompt stays with its old take), so a panel never redraws the old story. */
export function promptBoxStart(pick: Pick<PanelTake, "prompt" | "shotKey"> | null, inputs: Pick<PanelInputs, "prompt" | "shotKey">): string {
  return pick && pick.shotKey === inputs.shotKey ? pick.prompt : inputs.prompt;
}

export function waitingMessage(names: string[]): string {
  return `${listSentence(names)} need${names.length === 1 ? "s" : ""} an avatar with its four views first.`;
}

export type Readiness = { castReady: number; castTotal: number; panelsCurrent: number; shotsTotal: number };

/** Spec §7 — the two counts the readiness line shows (and spec 4 reads). */
export function visualiseReadiness(
  doc: ScriptDoc,
  avatars: ReadonlyMap<string, Avatar>,
  views: ReadonlyMap<string, PanelView>,
): Readiness {
  return {
    castReady: doc.cast.filter((c) => castReadyForPanels(c.avatarId ? avatars.get(c.avatarId) : undefined)).length,
    castTotal: doc.cast.length,
    panelsCurrent: doc.shots.filter((s) => views.get(s.id)?.status === "ready").length,
    shotsTotal: doc.shots.length,
  };
}

export type GenerateAllPlan = {
  /** In script order: every shot with no current panel that can be drawn now. */
  shotIds: string[];
  /** The total, or null when any shot has no price. */
  credits: number | null;
  /** Every one of them was drawn before: "Redraw", not "Generate". */
  redraw: boolean;
  /** Shots left out because someone on screen has no avatar yet. */
  waiting: number;
};

const NEEDS_DRAWING: PanelStatus[] = ["not_yet", "out_of_date", "failed"];

export function generateAllPlan(
  doc: ScriptDoc,
  views: ReadonlyMap<string, PanelView>,
  creditsFor: (shotId: string) => number | null,
): GenerateAllPlan {
  const shotIds = doc.shots
    .filter((s) => {
      const v = views.get(s.id);
      return v !== undefined && v.canGenerate && NEEDS_DRAWING.includes(v.status);
    })
    .map((s) => s.id);
  const prices = shotIds.map(creditsFor);
  return {
    shotIds,
    credits: prices.some((p) => p === null) ? null : prices.reduce<number>((sum, p) => sum + (p ?? 0), 0),
    redraw: shotIds.length > 0 && shotIds.every((id) => (views.get(id)?.takes.length ?? 0) > 0),
    waiting: doc.shots.filter((s) => views.get(s.id)?.canGenerate === false).length,
  };
}

/** "Redraw 9 panels · about 603 credits" (spec §6.5). */
export function generateAllLabel(plan: GenerateAllPlan): string {
  const n = plan.shotIds.length;
  const verb = plan.redraw ? "Redraw" : "Generate";
  const cost = plan.credits === null ? "" : ` · about ${plan.credits.toLocaleString()} credits`;
  return `${verb} ${n} panel${n === 1 ? "" : "s"}${cost}`;
}
