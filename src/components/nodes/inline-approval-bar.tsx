"use client";

import { Check, MessageSquareWarning, RotateCcw, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ApprovalStatus } from "@/lib/approval";

// Sign-off control — sibling of InlineEvalBar. Distinct signal from pass/fail (D29).
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
  canApprove: boolean; // cosmetic role hint (spec §4.4); NOT security
  onSet: (status: ApprovalStatus, note: string | null) => void;
}) {
  const [draftNote, setDraftNote] = useState(note);
  const [showNote, setShowNote] = useState(status === "changes_requested");

  if (!canApprove) {
    return <ApprovalReadout status={status} />;
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-eyebrow">Approval</span>
        <div className="flex items-center gap-1">
          <ActionButton
            active={status === "approved"}
            saving={saving}
            title="Approve"
            tone="emerald"
            onClick={() => onSet(status === "approved" ? "pending" : "approved", null)}
          >
            <Check className="size-3.5" strokeWidth={1.5} />
          </ActionButton>
          <ActionButton
            active={status === "changes_requested"}
            saving={saving}
            title="Request changes"
            tone="amber"
            onClick={() => setShowNote((s) => !s || status !== "changes_requested")}
          >
            <MessageSquareWarning className="size-3.5" strokeWidth={1.5} />
          </ActionButton>
          {status !== "pending" && (
            <ActionButton
              active={false}
              saving={saving}
              title="Reset to pending"
              tone="muted"
              onClick={() => {
                setShowNote(false);
                onSet("pending", null);
              }}
            >
              <RotateCcw className="size-3.5" strokeWidth={1.5} />
            </ActionButton>
          )}
        </div>
      </div>

      <div
        className={cn(
          "grid transition-all duration-200",
          showNote ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
        style={{ transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)" }}
      >
        <div className="min-h-0 overflow-hidden">
          <textarea
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            onBlur={() => onSet("changes_requested", draftNote.trim() || null)}
            placeholder="What needs to change?"
            rows={1}
            className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:border-primary/60 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  active,
  saving,
  title,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  saving: boolean;
  title: string;
  tone: "emerald" | "amber" | "muted";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeTone = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400",
    amber:
      "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50 hover:text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    muted: "border-border bg-muted text-foreground hover:bg-muted hover:text-foreground",
  }[tone];
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={saving}
      onClick={onClick}
      title={title}
      className={cn(
        "h-auto rounded-md p-1.5 transition-colors",
        active
          ? activeTone
          : "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {saving ? <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} /> : children}
    </Button>
  );
}

function ApprovalReadout({ status }: { status: ApprovalStatus }) {
  const label = {
    pending: "Awaiting approval",
    approved: "Approved",
    changes_requested: "Changes requested",
  }[status];
  return (
    <div className="flex items-center justify-between">
      <span className="text-eyebrow">Approval</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
