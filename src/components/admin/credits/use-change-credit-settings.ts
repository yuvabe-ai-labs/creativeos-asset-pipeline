"use client";

import { useReducer } from "react";
import { defaultCreditWhen } from "@/lib/admin/credits-change";
import { parseMargin, sameSettings, settingsChangeWords, type Settings } from "@/lib/admin/credits-page";
import type { When } from "@/lib/admin/change-prices-when";

/** Where the flow is: closed, the settings on the page, or the When / Review dialogs. */
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
  | { type: "start"; live: Settings; now: Date }
  | { type: "margin"; text: string }
  | { type: "step"; step: Step }
  | { type: "go"; stage: "when" | "review" }
  | { type: "back" }
  /** Esc or the close button on When or Review: back to the settings. */
  | { type: "close" }
  | { type: "cancel" }
  | { type: "when"; when: Partial<When> }
  | { type: "saving"; on: boolean }
  | { type: "done" }
  /** The start passed while the review was open: back to When to pick another. */
  | { type: "stale" };

export function changeCreditsReducer(s: CreditFlow, a: CreditFlowAction): CreditFlow {
  // While a save runs, nothing moves.
  if (s.saving && a.type !== "saving" && a.type !== "done" && a.type !== "stale") return s;
  switch (a.type) {
    case "start":
      return { stage: "settings", margin: String(a.live.marginPercent), step: a.live.roundStep, when: defaultCreditWhen(a.now), saving: false };
    case "margin":
      return { ...s, margin: a.text };
    case "step":
      return { ...s, step: a.step };
    case "go":
      return { ...s, stage: a.stage };
    case "back":
      return s.stage === "review" ? { ...s, stage: "when" } : s.stage === "when" ? { ...s, stage: "settings" } : s;
    case "close":
      return s.stage === "when" || s.stage === "review" ? { ...s, stage: "settings" } : s;
    case "cancel":
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

/** The settings typed so far: null while the margin needs a fix; what changes from the live settings. */
export function creditDraft(s: CreditFlow, live: Settings): { settings: Settings | null; changed: boolean; summary: string | null } {
  const margin = parseMargin(s.margin);
  if (margin === null) return { settings: null, changed: false, summary: null };
  const settings = { marginPercent: margin, roundStep: s.step };
  return { settings, changed: !sameSettings(settings, live), summary: settingsChangeWords(live, settings) };
}

/** The change-credit-settings flow's state on the Credits page. */
export function useChangeCreditSettings() {
  return useReducer(changeCreditsReducer, closedCreditFlow);
}
