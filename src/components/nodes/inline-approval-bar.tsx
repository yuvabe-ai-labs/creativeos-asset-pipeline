"use client";

import { Check, MessageSquareWarning, RotateCcw, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ApprovalStatus } from "@/lib/approval";

// Which action is in flight. Only the button you pressed shows progress — passing one
// `saving` flag to every button made all three spin at once, which read as the whole
// control having a seizure rather than as "your click is being saved".
type Pending = "approve" | "reject" | "reset" | null;

const STATUS_META: Record<ApprovalStatus, { label: string; dot: string; text: string }> = {
  pending: { label: "Pending review", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
  approved: { label: "Approved", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  changes_requested: { label: "Changes requested", dot: "bg-destructive", text: "text-destructive" },
};

// Sign-off control — sibling of InlineEvalBar. Distinct signal from pass/fail (D29).
//
// Rebuilt for the review workflow. Three things it now gets right that it did not before:
//
//   1. Only the pressed action spins (see `Pending`).
//   2. Rejecting is an EXPLICIT submit with the note required up front. It used to fire on
//      the textarea's blur — so clicking "request changes" and clicking away sent an empty
//      rejection, which the server (correctly, R6.5) now refuses. Blur-to-save is wrong for
//      a destructive, note-required action regardless of the server rule.
//   3. Actions are labelled. Three unlabelled icons asked the reviewer to guess which one
//      sends work back to a colleague.
export function InlineApprovalBar({
  status,
  note,
  saving,
  canApprove,
  onSet,
}: {
  status: ApprovalStatus;
  note: string;
  saving: boolean;
  // R2.3: hides the control from a designer as a COURTESY. The real gate is the role
  // check inside setVersionApprovalAction, which resolves the caller server-side (D166) —
  // this prop is not, and must never become, the mechanism.
  canApprove: boolean;
  onSet: (status: ApprovalStatus, note: string | null) => void;
}) {
  const [draftNote, setDraftNote] = useState(note);
  const [composing, setComposing] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  // `saving` going false means the parent's await resolved — clear the local marker.
  const [wasSaving, setWasSaving] = useState(saving);
  if (wasSaving !== saving) {
    setWasSaving(saving);
    if (!saving) setPending(null);
  }

  if (!canApprove) {
    return <ApprovalReadout status={status} note={note} />;
  }

  const meta = STATUS_META[status];
  const canSubmitRejection = draftNote.trim().length > 0;

  function act(next: Pending, run: () => void) {
    setPending(next);
    run();
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-eyebrow">Approval</span>
        <span className={cn("flex items-center gap-1.5 text-xs font-medium", meta.text)}>
          <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
          {meta.label}
        </span>
      </div>

      {composing ? (
        // Explicit rejection composer. Submit is disabled until there is something to
        // send — the maker cannot act on "changes requested" with no reason attached.
        <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
          <Textarea
            autoFocus
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder="What needs to change? The maker sees this on the node."
            rows={2}
            disabled={saving}
            className="resize-none border-border bg-background text-xs leading-relaxed"
          />
          <div className="mt-2 flex items-center justify-end gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={saving}
              onClick={() => {
                setComposing(false);
                setDraftNote(note);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="xs"
              disabled={saving || !canSubmitRejection}
              onClick={() =>
                act("reject", () => {
                  setComposing(false);
                  onSet("changes_requested", draftNote.trim());
                })
              }
            >
              {pending === "reject" ? (
                <Loader2 className="size-3 animate-spin" strokeWidth={1.5} />
              ) : (
                <MessageSquareWarning className="size-3" strokeWidth={1.5} />
              )}
              Send back
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-1.5">
          {status !== "approved" && (
            <Button
              type="button"
              size="xs"
              disabled={saving}
              onClick={() => act("approve", () => onSet("approved", null))}
              className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
            >
              {pending === "approve" ? (
                <Loader2 className="size-3 animate-spin" strokeWidth={1.5} />
              ) : (
                <Check className="size-3" strokeWidth={1.5} />
              )}
              Approve
            </Button>
          )}

          {status !== "changes_requested" && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={saving}
              onClick={() => {
                setDraftNote(note);
                setComposing(true);
              }}
            >
              <MessageSquareWarning className="size-3" strokeWidth={1.5} />
              Request changes
            </Button>
          )}

          {status !== "pending" && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              disabled={saving}
              title="Return this asset to pending review"
              onClick={() => act("reset", () => onSet("pending", null))}
              className="ml-auto text-muted-foreground"
            >
              {pending === "reset" ? (
                <Loader2 className="size-3 animate-spin" strokeWidth={1.5} />
              ) : (
                <RotateCcw className="size-3" strokeWidth={1.5} />
              )}
              Undo
            </Button>
          )}
        </div>
      )}

      {/* The standing rejection, visible to the reviewer too — so a senior returning to a
          node can see what they asked for without reopening the composer. */}
      {status === "changes_requested" && !composing && note.trim() && (
        <p className="mt-2 rounded-r-md border-l-2 border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs leading-relaxed text-destructive">
          {note}
        </p>
      )}
    </div>
  );
}

// What a designer sees. It used to render the status label and NOTHING else, which meant
// the reviewer's note — the entire payload of the return path — was invisible to the one
// person it is written for: they knew they had been rejected, but not why.
function ApprovalReadout({ status, note }: { status: ApprovalStatus; note: string }) {
  const meta = STATUS_META[status];
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-eyebrow">Approval</span>
        <span className={cn("flex items-center gap-1.5 text-xs font-medium", meta.text)}>
          <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
          {meta.label}
        </span>
      </div>
      {/* R9.3: the note is read ON THE NODE, beside the controls that act on it — the
          place the fix actually happens. */}
      {status === "changes_requested" && note.trim() && (
        <p className="mt-2 rounded-r-md border-l-2 border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs leading-relaxed text-destructive">
          {note}
        </p>
      )}
    </div>
  );
}
