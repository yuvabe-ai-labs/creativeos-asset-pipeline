"use client";

import { NOW_DETAIL, NOW_WARNING, dateDetail, type CreditReview } from "@/lib/admin/credits-change";
import type { Settings } from "@/lib/admin/credits-page";
import type { When } from "@/lib/admin/change-prices-when";
import { FlowDialog } from "@/components/admin/models/change-prices/flow-dialog";
import { WhenStep } from "@/components/admin/models/change-prices/when-step";
import { CREDIT_STEPS } from "./credit-edit-bar";
import { CreditReviewStep } from "./credit-review-step";

/**
 * When and Review for new credit settings, in the change-prices flow's dialog: Now (with its warning)
 * or a date in IST, then the review and the one button that saves.
 */
export function ChangeCreditSettingsDialog({
  stage,
  when,
  now,
  scheduled,
  whenProblem,
  keptUntil,
  review,
  saving,
  onWhen,
  onBack,
  onClose,
  onNext,
}: {
  stage: "when" | "review" | null;
  when: When;
  now: Date;
  /** Starts of changes already scheduled, marked on the calendar. */
  scheduled: Date[];
  whenProblem: string | null;
  /** The settings runs keep until a date start. */
  keptUntil: Settings;
  review: CreditReview | null;
  saving: boolean;
  onWhen: (when: Partial<When>) => void;
  onBack: () => void;
  onClose: () => void;
  onNext: () => void;
}) {
  return (
    <FlowDialog
      steps={CREDIT_STEPS}
      focusIds={["credits-next", "credits-change-start"]}
      step={stage}
      title={stage === "review" ? "Review the new credit settings" : "When do the new settings start?"}
      primary={stage === "review" ? (review?.confirm ?? "") : "Next: review"}
      canGoOn={stage === "review" ? !!review?.canSave : whenProblem === null}
      saving={saving}
      onBack={onBack}
      onClose={onClose}
      onNext={onNext}
    >
      {stage === "review" && review ? (
        <CreditReviewStep review={review} />
      ) : (
        <WhenStep
          when={when}
          now={now}
          scheduled={scheduled}
          shortcut={null}
          copy={{ label: "When the new settings start", now: NOW_DETAIL, date: dateDetail(keptUntil), nowWarning: NOW_WARNING }}
          problem={whenProblem}
          onChange={onWhen}
        />
      )}
    </FlowDialog>
  );
}
