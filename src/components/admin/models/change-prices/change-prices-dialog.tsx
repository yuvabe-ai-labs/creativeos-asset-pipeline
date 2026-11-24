"use client";

import type { Review } from "@/lib/admin/change-prices";
import type { When } from "@/lib/admin/change-prices-when";
import { FlowDialog } from "./flow-dialog";
import { ReviewStep } from "./review-step";
import { WhenStep } from "./when-step";

/**
 * When and Review for new prices: Now or a date in IST (with the scheduled change's start as a
 * shortcut), then the review and the one button that saves.
 */
export function ChangePricesDialog({
  stage,
  label,
  when,
  now,
  scheduled,
  shortcut,
  whenProblem,
  review,
  saving,
  onWhen,
  onBack,
  onClose,
  onNext,
}: {
  stage: "when" | "review" | null;
  /** The model's name, in the review's title. */
  label: string;
  when: When;
  now: Date;
  /** Starts of changes already scheduled, marked on the calendar. */
  scheduled: Date[];
  /** The scheduled change's start, offered as one click. */
  shortcut: Date | null;
  whenProblem: string | null;
  review: Review | null;
  saving: boolean;
  onWhen: (when: Partial<When>) => void;
  onBack: () => void;
  onClose: () => void;
  onNext: () => void;
}) {
  return (
    <FlowDialog
      step={stage}
      title={stage === "review" ? `Review the new prices for ${label}` : "When do the new prices start?"}
      primary={stage === "review" ? (review?.confirm ?? "") : "Next: review"}
      canGoOn={stage === "review" ? !!review?.canSave : whenProblem === null}
      saving={saving}
      onBack={onBack}
      onClose={onClose}
      onNext={onNext}
    >
      {stage === "review" && review ? (
        <ReviewStep review={review} label={label} />
      ) : (
        <WhenStep when={when} now={now} scheduled={scheduled} shortcut={shortcut} problem={whenProblem} onChange={onWhen} />
      )}
    </FlowDialog>
  );
}
