"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { buildCreditReview, settingsBefore } from "@/lib/admin/credits-change";
import { changeWhenProblem, replacedRow } from "@/lib/admin/change-prices-when";
import { exampleRuns, type NextChange } from "@/lib/admin/credits-overview";
import { creditRunRows, type AgencyModelRuns, type CreditRun, type PricedRun, type Settings } from "@/lib/admin/credits-page";
import { istDate, istTime } from "@/lib/admin/ist";
import type { PriceTimeline } from "@/lib/admin/price-sheet";
import type { CreditSettings } from "@/lib/ai-models/types";
import { Button } from "@/components/ui/button";
import { ChangeCreditSettingsDialog } from "./change-credit-settings-dialog";
import { CreditsCard } from "./credits-card";
import { creditDraft, useChangeCreditSettings } from "./use-change-credit-settings";
import { useSaveCreditSettings } from "./use-save-credit-settings";

/**
 * The Credits page (D594): the title with its one action, the settings card, and the change flow in
 * one dialog. Saving goes through the server checks and refreshes the page.
 */
export function CreditsWorkspace({
  now: nowRow,
  next,
  history,
  live,
  settings,
  starts,
  runs,
  agencyRuns,
  modelRuns,
}: {
  now: { line: string; since: string };
  next: NextChange | null;
  history: { timeline: PriceTimeline; kept: Record<string, string> };
  live: Settings;
  /** The settings rows that pass their check. */
  settings: CreditSettings[];
  /** Every row's id and start, broken ones too: a new change can't share a start, except the one it replaces. */
  starts: { id: string; effectiveFrom: string }[];
  runs: CreditRun[];
  agencyRuns: AgencyModelRuns[];
  modelRuns: Record<string, PricedRun>;
}) {
  const [flow, dispatch] = useChangeCreditSettings();
  const [now, setNow] = useState(() => new Date());
  const [filledIn, setFilledIn] = useState<string | null>(null);
  const save = useSaveCreditSettings();

  const draft = creditDraft(flow, live);
  const inDialog = flow.stage === "when" || flow.stage === "review";
  const replaced = inDialog ? replacedRow(settings, flow.when, now) : null;
  const whenProblem = inDialog ? changeWhenProblem(flow.when, now, "credits", starts, replaced?.id ?? null) : null;
  // What runs keep until a date start (the When step's "On a date" words).
  const keptUntil = settingsBefore(settings, { ...flow.when, mode: "date" }, now, replaced);
  const review =
    flow.stage === "review" && draft.settings
      ? buildCreditReview({ settings, draft: draft.settings, when: flow.when, now, runs, agencyRuns, modelRuns })
      : null;

  function start() {
    const at = new Date();
    setNow(at);
    // A scheduled change the server would still replace is filled in, at its own start.
    const scheduled = next?.canCancel ? settings.find((s) => s.id === next.id) : undefined;
    const from = scheduled
      ? { settings: scheduled, when: { mode: "date" as const, date: istDate(new Date(scheduled.effectiveFrom)), time: istTime(new Date(scheduled.effectiveFrom)) } }
      : undefined;
    setFilledIn(from && next ? next.name : null);
    dispatch({ type: "start", live, now: at, from });
  }

  function go(stage: "when" | "review") {
    setNow(new Date());
    dispatch({ type: "go", stage });
  }

  async function confirm() {
    if (!review?.canSave || !draft.settings) return;
    dispatch({ type: "saving", on: true });
    const result = await save(draft.settings, flow.when, review.replacedRow, review.before);
    if (result === "stale") {
      setNow(new Date());
      dispatch({ type: "stale" });
    } else dispatch(result === "saved" ? { type: "done" } : { type: "saving", on: false });
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Credits</h1>
          <p className="mt-1 text-sm text-muted-foreground">What runs cost agencies in credits. One setting for every agency.</p>
        </div>
        <Button id="credits-change-start" onClick={start} className="max-sm:w-full">
          <Pencil aria-hidden strokeWidth={1.5} />
          Change credit settings
        </Button>
      </div>
      <CreditsCard now={nowRow} live={live} next={next} history={history} />

      <ChangeCreditSettingsDialog
        flow={flow}
        invalid={draft.settings === null}
        canGoOn={draft.canGoOn}
        examples={creditRunRows(exampleRuns(runs), live, draft.settings ?? live)}
        filledIn={filledIn}
        now={now}
        scheduled={settings.filter((s) => new Date(s.effectiveFrom) > now).map((s) => new Date(s.effectiveFrom))}
        whenProblem={whenProblem}
        keptUntil={keptUntil}
        review={review}
        onMargin={(text) => dispatch({ type: "margin", text })}
        onStep={(step) => dispatch({ type: "step", step })}
        onWhen={(when) => dispatch({ type: "when", when })}
        onBack={() => dispatch({ type: "back" })}
        onClose={() => dispatch({ type: "close" })}
        onNext={() => (flow.stage === "review" ? void confirm() : go(flow.stage === "when" ? "review" : "when"))}
      />
    </>
  );
}
