"use client";

import { useReducer } from "react";
import { defaultCreditWhen } from "@/lib/admin/credits-change";
import { parseMargin, sameSettings, settingsChangeWords, type Settings } from "@/lib/admin/credits-page";
import type { When } from "@/lib/admin/change-prices-when";

export const CREDIT_STEPS = ["Settings", "When", "Review"] as const;

/** Where the flow is: closed, or one of its three steps, all in one dialog (D594). */
export type CreditFlowStage = "closed" | "settings" | "when" | "review";
export type Step = Settings["roundStep"];

export type CreditFlow = {
  stage: CreditFlowStage;
  /** The margin as typed. */
  margin: string;
  step: Step;
  when: When;
  saving: boolean;
};

export const closedCreditFlow: CreditFlow = {
  stage: "closed",
  margin: "",
  step: 5,
  when: { mode: "date", date: "", time: "00:00" },
  saving: false,
};

export type CreditFlowAction =
  /** `from` fills in a scheduled change (its settings and start), so saving on its day replaces it. */
  | { type: "start"; live: Settings; now: Date; from?: { settings: Settings; when: When } }
  | { type: "margin"; text: string }
  | { type: "step"; step: Step }
  | { type: "go"; stage: "when" | "review" }
  | { type: "back" }
  /** Esc, the close button or Cancel: the flow closes. */
  | { type: "close" }
  | { type: "when"; when: Partial<When> }
  | { type: "saving"; on: boolean }
  | { type: "done" }
  /** The start passed while the review was open: back to When to pick another. */
  | { type: "stale" };

export function changeCreditsReducer(s: CreditFlow, a: CreditFlowAction): CreditFlow {
  // While a save runs, nothing moves.
  if (s.saving && a.type !== "saving" && a.type !== "done" && a.type !== "stale") return s;
  switch (a.type) {
    case "start": {
      const from = a.from?.settings ?? a.live;
      return { stage: "settings", margin: String(from.marginPercent), step: from.roundStep, when: a.from?.when ?? defaultCreditWhen(a.now), saving: false };
    }
    case "margin":
      return { ...s, margin: a.text };
    case "step":
      return { ...s, step: a.step };
    case "go":
      return { ...s, stage: a.stage };
    case "back":
      return s.stage === "review" ? { ...s, stage: "when" } : s.stage === "when" ? { ...s, stage: "settings" } : s;
    case "close":
    case "done":
      return closedCreditFlow;
    case "when":
      return { ...s, when: { ...s.when, ...a.when } };
    case "saving":
      return { ...s, saving: a.on };
    case "stale":
      return { ...s, stage: "when", saving: false };
  }
}

/**
 * The settings typed so far: null while the margin needs a fix; what changes from the live settings.
 * Next is open whenever the margin is valid, even with today's settings: a return to them can be
 * scheduled over a later change, and the Review says when there is nothing new to save.
 */
export function creditDraft(
  s: CreditFlow,
  live: Settings,
): { settings: Settings | null; changed: boolean; summary: string | null; canGoOn: boolean } {
  const margin = parseMargin(s.margin);
  if (margin === null) return { settings: null, changed: false, summary: null, canGoOn: false };
  const settings = { marginPercent: margin, roundStep: s.step };
  return { settings, changed: !sameSettings(settings, live), summary: settingsChangeWords(live, settings), canGoOn: true };
}

/** The change-credit-settings flow's state on the Credits page. */
export function useChangeCreditSettings() {
  return useReducer(changeCreditsReducer, closedCreditFlow);
}
