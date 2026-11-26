"use client";

import { useReducer } from "react";
import { addIstDays, istDate, istTime, todayIst } from "@/lib/admin/ist";
import { bulkApplyPercent, parsePercent, type BulkTarget } from "@/lib/admin/percent-edit";
import { bulkMessage } from "@/lib/admin/change-prices-words";
import type { When } from "@/lib/admin/change-prices-when";

/** Where the flow is: the chooser, the grid on the page, or the When / Review dialogs. */
export type FlowStage = "closed" | "choose" | "prices" | "when" | "review";
/** Which row the grid starts from: today's prices, or the scheduled change. */
export type FlowBase = "live" | "next";

export type FlowState = {
  stage: FlowStage;
  base: FlowBase;
  /** The chooser's pick before Continue. */
  pick: FlowBase;
  /** What the admin typed, by line key. */
  values: Record<string, string>;
  /** Cells a percent set (marked "≈ rounded"); a percent re-applies over them but never over hand-typed ones. */
  percentKeys: string[];
  bulk: string;
  includeOther: boolean;
  bulkMessage: { tone: "info" | "error"; text: string } | null;
  when: When;
  whens: { live: When; next: When | null };
  saving: boolean;
  keysOpen: boolean;
  /** The keyboard help opens by itself once, the first time the grid shows. */
  keysSeen: boolean;
};

const NOW_WHEN: When = { mode: "now", date: "", time: "00:00" };

export const closedFlow: FlowState = {
  stage: "closed",
  base: "live",
  pick: "next",
  values: {},
  percentKeys: [],
  bulk: "",
  includeOther: true,
  bulkMessage: null,
  when: NOW_WHEN,
  whens: { live: NOW_WHEN, next: null },
  saving: false,
  keysOpen: false,
  keysSeen: false,
};

/** Today's prices start now (the date field ready at tomorrow 00:00 IST); a scheduled change keeps its start. */
export function defaultWhens(next: { effectiveFrom: string } | null, now: Date): FlowState["whens"] {
  const at = next ? new Date(next.effectiveFrom) : null;
  return {
    live: { mode: "now", date: addIstDays(todayIst(now), 1), time: "00:00" },
    next: at ? { mode: "date", date: istDate(at), time: istTime(at) } : null,
  };
}

export type FlowAction =
  | { type: "start"; whens: FlowState["whens"] }
  | { type: "pick"; pick: FlowBase }
  | { type: "choose" }
  | { type: "rechoose" }
  | { type: "cancel" }
  | { type: "type"; key: string; text: string }
  | { type: "reset"; key: string }
  | { type: "bulkText"; text: string }
  | { type: "includeOther"; on: boolean }
  | { type: "bulkApply"; cells: BulkTarget[]; otherCharges: (BulkTarget & { atCost: boolean })[]; hasOtherCharges: boolean }
  | { type: "step"; stage: "prices" | "when" | "review" }
  | { type: "back" }
  /** Esc or the close button on When or Review: back to the grid. */
  | { type: "close" }
  /** The start passed while the review was open: back to When to pick another. */
  | { type: "stale" }
  | { type: "when"; when: Partial<When> }
  | { type: "saving"; on: boolean }
  | { type: "done" }
  | { type: "keys"; open: boolean };

/** Opens the grid from `base` with nothing typed. */
function editFrom(s: FlowState, base: FlowBase): FlowState {
  return {
    ...s,
    stage: "prices",
    base,
    values: {},
    percentKeys: [],
    bulk: "",
    bulkMessage: null,
    when: base === "next" && s.whens.next ? s.whens.next : s.whens.live,
    keysOpen: !s.keysSeen,
    keysSeen: true,
  };
}

const without = (keys: string[], key: string) => keys.filter((k) => k !== key);

export function changePricesReducer(s: FlowState, a: FlowAction): FlowState {
  // While a save runs, nothing moves.
  if (s.saving && a.type !== "saving" && a.type !== "done" && a.type !== "stale") return s;
  switch (a.type) {
    case "start": {
      const fresh = { ...closedFlow, keysSeen: s.keysSeen, whens: a.whens };
      return a.whens.next ? { ...fresh, stage: "choose", pick: "next" } : editFrom(fresh, "live");
    }
    case "pick":
      return { ...s, pick: a.pick };
    case "choose":
      return editFrom(s, s.pick);
    case "rechoose":
      return { ...s, stage: "choose", pick: "next", keysOpen: false };
    case "cancel":
    case "done":
      return { ...closedFlow, keysSeen: s.keysSeen };
    case "type":
      return { ...s, values: { ...s.values, [a.key]: a.text }, percentKeys: without(s.percentKeys, a.key) };
    case "reset": {
      const values = { ...s.values };
      delete values[a.key];
      return { ...s, values, percentKeys: without(s.percentKeys, a.key) };
    }
    case "bulkText":
      return { ...s, bulk: a.text };
    case "includeOther":
      return { ...s, includeOther: a.on };
    case "bulkApply": {
      const typed = s.bulk.trim();
      const percent = parsePercent(typed);
      if (percent === null) {
        const tooLow = /^[−–-]/.test(typed) && parsePercent(typed.replace(/^[−–-]/, "")) !== null;
        return { ...s, bulkMessage: { tone: "error", text: tooLow ? "A price can't go down by more than 100%." : "Type a percent first, like −31 or 20." } };
      }
      const include = s.includeOther || !a.hasOtherCharges;
      const r = bulkApplyPercent({ cells: a.cells, otherCharges: a.otherCharges, values: s.values, percentKeys: s.percentKeys, percent, includeOtherCharges: include });
      return {
        ...s,
        values: r.values,
        percentKeys: r.percentKeys,
        bulkMessage: { tone: r.changed + r.kept === 0 ? "error" : "info", text: bulkMessage({ changed: r.changed, kept: r.kept, percent, hasOtherCharges: a.hasOtherCharges, includeOtherCharges: include }) },
      };
    }
    case "step":
      return { ...s, stage: a.stage, keysOpen: false };
    case "back":
      return s.stage === "review" ? { ...s, stage: "when" } : s.stage === "when" ? { ...s, stage: "prices" } : s;
    case "close":
      return s.stage === "when" || s.stage === "review" ? { ...s, stage: "prices" } : s;
    case "stale":
      return { ...s, stage: "when", saving: false };
    case "when":
      return { ...s, when: { ...s.when, ...a.when } };
    case "saving":
      return { ...s, saving: a.on };
    case "keys":
      return { ...s, keysOpen: a.open };
  }
}

/** The change-prices flow's state on the model page. */
export function useChangePrices() {
  return useReducer(changePricesReducer, closedFlow);
}
