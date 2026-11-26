"use client";

import { useState } from "react";
import { buildCreditReview, settingsBefore } from "@/lib/admin/credits-change";
import { changeWhenProblem, replacedRow } from "@/lib/admin/change-prices-when";
import { creditRunRows, type AgencyModelRuns, type CreditRun, type PricedRun, type Settings } from "@/lib/admin/credits-page";
import type { CreditSettings } from "@/lib/ai-models/types";
import { ChangeCreditSettingsDialog } from "./change-credit-settings-dialog";
import { CreditEditBar } from "./credit-edit-bar";
import { CreditSettingsCard } from "./credit-settings-card";
import { CreditsSummary } from "./credits-summary";
import { HowWorkedOutDialog } from "./how-worked-out-dialog";
import { TypicalRunsTable } from "./typical-runs-table";
import { creditDraft, useChangeCreditSettings } from "./use-change-credit-settings";
import { useSaveCreditSettings } from "./use-save-credit-settings";

/**
 * The Credits page's summary, typical runs and side column, with the change flow: Change credit
 * settings opens the settings on the page with an edit bar; When and Review are dialogs; saving goes
 * through the server checks and refreshes the page.
 */
export function CreditsWorkspace({
  summary,
  live,
  settings,
  starts,
  runs,
  agencyRuns,
  modelRuns,
  aside,
}: {
  summary: { line: string; next: { when: string; utc: string; text: string } | null };
  live: Settings;
  /** The settings rows that pass their check. */
  settings: CreditSettings[];
  /** Every row's id and start, broken ones too: a new change can't share a start, except the one it replaces. */
  starts: { id: string; effectiveFrom: string }[];
  runs: CreditRun[];
  agencyRuns: AgencyModelRuns[];
  modelRuns: Record<string, PricedRun>;
  aside: React.ReactNode;
}) {
  const [flow, dispatch] = useChangeCreditSettings();
  const [now, setNow] = useState(() => new Date());
  const [howOpen, setHowOpen] = useState(false);
  const save = useSaveCreditSettings();

  const editing = flow.stage !== "closed";
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
    dispatch({ type: "start", live, now: at });
    // The margin takes focus once the settings show.
    requestAnimationFrame(() => document.getElementById("credits-margin")?.focus());
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
      <CreditsSummary line={summary.line} next={summary.next} onHow={() => setHowOpen(true)} onStart={editing ? null : start} />
      {editing && (
        <CreditEditBar
          summary={draft.summary}
          invalid={draft.settings === null}
          canGoOn={draft.canGoOn}
          onCancel={() => dispatch({ type: "cancel" })}
          onNext={() => go("when")}
        />
      )}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-6">
          {editing && (
            <CreditSettingsCard
              margin={flow.margin}
              step={flow.step}
              draft={draft.settings}
              live={live}
              onMargin={(text) => dispatch({ type: "margin", text })}
              onStep={(step) => dispatch({ type: "step", step })}
            />
          )}
          <section aria-labelledby="runs-title" className="rounded-2xl border bg-card px-5 py-5 shadow-card md:px-[22px]">
            <h2 id="runs-title" className="mb-3 font-display text-lg font-semibold tracking-tight">
              {editing ? "Typical runs, before and after" : "What typical runs cost in credits"}
            </h2>
            <TypicalRunsTable rows={creditRunRows(runs, live, editing ? draft.settings : null)} />
          </section>
        </div>
        {aside}
      </div>

      <HowWorkedOutDialog open={howOpen} settings={live} onOpenChange={setHowOpen} />
      <ChangeCreditSettingsDialog
        stage={flow.stage === "when" || flow.stage === "review" ? flow.stage : null}
        when={flow.when}
        now={now}
        scheduled={settings.filter((s) => new Date(s.effectiveFrom) > now).map((s) => new Date(s.effectiveFrom))}
        whenProblem={whenProblem}
        keptUntil={keptUntil}
        review={review}
        saving={flow.saving}
        onWhen={(when) => dispatch({ type: "when", when })}
        onBack={() => dispatch({ type: "back" })}
        onClose={() => dispatch({ type: "close" })}
        onNext={() => (flow.stage === "review" ? void confirm() : go("review"))}
      />
    </>
  );
}
