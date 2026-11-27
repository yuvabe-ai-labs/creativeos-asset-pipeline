"use client";

import { NOW_DETAIL, NOW_WARNING, dateDetail, type CreditReview } from "@/lib/admin/credits-change";
import type { CreditRunRow, Settings } from "@/lib/admin/credits-page";
import type { When } from "@/lib/admin/change-prices-when";
import { FlowDialog } from "@/components/admin/models/change-prices/flow-dialog";
import { WhenStep } from "@/components/admin/models/change-prices/when-step";
import { CreditReviewStep } from "./credit-review-step";
import { CreditSettingsStep } from "./credit-settings-step";
import { CREDIT_STEPS, type CreditFlow, type Step } from "./use-change-credit-settings";

const TITLES = {
  settings: "Change credit settings",
  when: "When do the new settings start?",
  review: "Review the new credit settings",
} as const;

/**
 * The change-credit-settings flow in one dialog (D594): Settings with three example runs, When (Now
 * with its warning, or a date in IST), then the Review and the one button that saves.
 */
export function ChangeCreditSettingsDialog({
  flow,
  invalid,
  canGoOn,
  examples,
  filledIn,
  now,
  scheduled,
  whenProblem,
  keptUntil,
  review,
  onMargin,
  onStep,
  onWhen,
  onBack,
  onClose,
  onNext,
}: {
  flow: CreditFlow;
  /** The margin needs a fix. */
  invalid: boolean;
  /** Next on the Settings step. */
  canGoOn: boolean;
  examples: CreditRunRow[];
  /** "the 1 Dec change" when the flow opened with it filled in. */
  filledIn: string | null;
  now: Date;
  /** Starts of changes already scheduled, marked on the calendar. */
  scheduled: Date[];
  whenProblem: string | null;
  /** The settings runs keep until a date start. */
  keptUntil: Settings;
  review: CreditReview | null;
  onMargin: (text: string) => void;
  onStep: (step: Step) => void;
  onWhen: (when: Partial<When>) => void;
  onBack: () => void;
  onClose: () => void;
  onNext: () => void;
}) {
  const stage = flow.stage === "closed" ? null : flow.stage;
  return (
    <FlowDialog
      steps={CREDIT_STEPS}
      focusIds={["credits-change-start"]}
      step={stage}
      title={stage ? TITLES[stage] : TITLES.settings}
      primary={stage === "review" ? (review?.confirm ?? "") : stage === "when" ? "Next: review" : "Next: when"}
      canGoOn={stage === "review" ? !!review?.canSave : stage === "when" ? whenProblem === null : canGoOn}
      saving={flow.saving}
      onBack={onBack}
      onClose={onClose}
      onNext={onNext}
    >
      {stage === "review" && review ? (
        <CreditReviewStep review={review} />
      ) : stage === "when" ? (
        <WhenStep
          when={flow.when}
          now={now}
          scheduled={scheduled}
          shortcut={null}
          copy={{ label: "When the new settings start", now: NOW_DETAIL, date: dateDetail(keptUntil), nowWarning: NOW_WARNING }}
          problem={whenProblem}
          onChange={onWhen}
        />
      ) : (
        <CreditSettingsStep
          margin={flow.margin}
          step={flow.step}
          invalid={invalid}
          examples={examples}
          filledIn={filledIn}
          onMargin={onMargin}
          onStep={onStep}
        />
      )}
    </FlowDialog>
  );
}
