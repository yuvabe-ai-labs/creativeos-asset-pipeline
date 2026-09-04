"use client";

import { useState, type ReactNode } from "react";
import { ArrowLeft, SlidersHorizontal, FileInput, History } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EditableField } from "./editable-field";
import { GenerationErrorBadge } from "./generation-error-badge";
import { GuidedNextButton } from "@/components/canvas/guided-next-button";
import { normalizeTitle } from "@/lib/nodes/title";
import { AddConnection } from "./add-connection";
import { RailItem } from "./focus-rail-item";
import {
  ConnectedDetailView,
  NodeIcon,
  type UpstreamNode,
  type ConnectedPreview,
} from "./connected-inputs-card";
import { UsagePopover } from "./prompt-usage-popover";
import { PromptVersionChips } from "./prompt-version-chips";
import { InlineApprovalBar } from "./inline-approval-bar";
import { PromptVersionHistory, type VersionSummary } from "./prompt-version-history";
import type { ApprovalStatus } from "@/lib/approval";
import { useIdentity } from "@/hooks/use-identity";
import { useNodeVersionUpdates } from "@/hooks/use-node-version-updates";

export type PromptFocusShellSlots = {
  // A ready-wired <PromptVersionChips> — the caller places it wherever its own "Generated
  // ___" header lives; the layout of that header is per-prompt-type.
  versionChips: ReactNode;
  // A ready-wired <InlineApprovalBar> (gated on the viewer's role) — the caller places it
  // beside its own eval bar, which is NOT part of this shell (see the module note below).
  approvalControls: ReactNode;
};

export type PromptFocusShellProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  title: string;
  titlePlaceholder: string;
  onTitleCommit: (title: string) => void;
  // Gates the "discard unsaved changes?" confirm on close — the caller owns the draft vs.
  // saved-output comparison that decides this, since the shape of "output" is per-prompt-type.
  dirty: boolean;
  lastError: string | null;
  generating: boolean;
  versions: VersionSummary[];
  activeVersionId: string | null;
  restoring: boolean;
  onRestoreVersion: (versionId: string) => void;
  upstream: UpstreamNode[];
  // AddConnection's targetType, e.g. "video-prompt" — which node types may feed this one.
  targetType: string;
  primaryRailIcon: ReactNode;
  primaryRailLabel: string;
  selected: string;
  onSelectedChange: (key: string) => void;
  reviewBadge?: ReactNode;
  selectedNode: ConnectedPreview | null;
  isNodeSelected: boolean;
  loadingPreview: boolean;
  approvalStatus: ApprovalStatus;
  approvalNote: string;
  approvedByName: string | null;
  approvedAt: string | null;
  approvalSaving: boolean;
  onSetApproval: (status: ApprovalStatus, note: string | null) => void;
  // Fired by the live-refresh subscription below — the caller's own re-fetch (still its own
  // versions/eval/approval state) runs here, exactly as it did before the wiring moved.
  onLiveVersionUpdate: () => void;
  // The fixed tabs ("prompt" / "details" / "request") switch on `selected` internally —
  // everything about their content is per-prompt-type. The two panes generic enough to live
  // here are rendered by the shell itself: the connected-node detail (when a connected input is
  // selected) and "history", which needs nothing the shell was not already given.
  children: (slots: PromptFocusShellSlots) => ReactNode;
};

/**
 * Rail keys the shell owns. Anything else in `selected` is a connected node's id — which is how
 * each view computes `isNodeSelected`, so a key added here without being added there would make
 * the shell hunt for a connected node by that name and render an empty detail pane.
 *
 * Exported because both consumers need the identical list; two hand-maintained copies is exactly
 * how "history" would go missing from one view and not the other.
 */
export const RESERVED_RAIL_KEYS = ["prompt", "history", "details", "request"] as const;

// The scaffolding every prompt-type focus view shares: the bottom-sheet frame (back button,
// editable title, usage popover, guided-next button, error badge, discard-unsaved-changes
// confirm), the rail (the caller's own primary tab + the connected-inputs list + the fixed
// Details/Sent-to-model tabs), the connected-node read-only detail pane, the version chips,
// the approval control, and the useNodeVersionUpdates live-refresh wiring.
//
// Extracted from video-prompt-focus-view.tsx (Task 12) so the Multishot Prompt node is built
// against this instead of a copy of it — video-prompt-focus-view.tsx and prompt-focus-view.tsx
// (the image Prompt node's own focus view, not touched by this extraction) were already this
// same scaffolding duplicated once; a third copy is exactly what this shell exists to prevent.
//
// Deliberately NOT here — left where they already varied between the two existing views, or
// might reasonably vary again for a third:
//   - The compose/output body itself (instruction editor, controls, Generate button, the
//     output editor) — the "prompt" tab's content, entirely per-prompt-type.
//   - Brand KB slice toggles and the eval (pass/fail) bar — both live in the "details" tab
//     alongside `approvalControls`, but neither is generic today: eval note vs. approval note
//     have separate life cycles (see the note on `onLiveVersionUpdate`), and a future prompt
//     type may have no KB slices at all.
//   - The versions/approval fetch-and-save FUNCTIONS (fetchVersions, saveApproval, etc.) —
//     the caller keeps owning that logic and its state untouched; this shell only takes the
//     resulting values as props and renders the shared chrome around them. Moving the state
//     itself in here would have meant reconciling two independent, already-diverging refetch
//     paths in the two existing views (a live-update refresh and a post-generate refresh),
//     which risked changing which fields each one updates — exactly the kind of behaviour
//     change this extraction must not introduce.
export function PromptFocusShell({
  open,
  onOpenChange,
  nodeId,
  title,
  titlePlaceholder,
  onTitleCommit,
  dirty,
  lastError,
  generating,
  versions,
  activeVersionId,
  restoring,
  onRestoreVersion,
  upstream,
  targetType,
  primaryRailIcon,
  primaryRailLabel,
  selected,
  onSelectedChange,
  reviewBadge,
  selectedNode,
  isNodeSelected,
  loadingPreview,
  approvalStatus,
  approvalNote,
  approvedByName,
  approvedAt,
  approvalSaving,
  onSetApproval,
  onLiveVersionUpdate,
  children,
}: PromptFocusShellProps) {
  const { identity } = useIdentity();
  // A pending destructive action awaiting confirmation. Replaces window.confirm so the
  // prompt stays inside the design system instead of native OS chrome.
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    actionLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // D179: keep this panel live while it is open — the same treatment the gen focus views get.
  useNodeVersionUpdates(nodeId, open, onLiveVersionUpdate);

  // YUV-288: navigating away must not silently drop an unsaved manual edit.
  function requestClose() {
    if (dirty) {
      setConfirm({
        title: "Discard unsaved changes?",
        description:
          "You have edits that haven't been saved. Closing now will discard them.",
        actionLabel: "Discard",
        onConfirm: () => onOpenChange(false),
      });
      return;
    }
    onOpenChange(false);
  }

  const versionChips = (
    <PromptVersionChips
      versions={versions}
      activeVersionId={activeVersionId}
      restoring={restoring}
      onSwitch={onRestoreVersion}
    />
  );

  const approvalControls = (
    <InlineApprovalBar
      status={approvalStatus}
      note={approvalNote}
      saving={approvalSaving}
      // R7.1/D160: not gated on `editable` — approval writes only to node_versions, outside
      // what the D33 lock serialises.
      canApprove={identity?.role === "senior"}
      onSet={onSetApproval}
      approvedByName={approvedByName}
      approvedAt={approvedAt}
    />
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else requestClose();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-t-2xl bg-background data-[side=bottom]:h-[92vh]"
      >
        {/* Header */}
        <div className="shrink-0 border-b">
          <div className="mx-auto w-full max-w-7xl px-6 pb-5 pt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={requestClose}
              className="-ml-2.5 gap-1.5 font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Back to canvas
            </Button>

            <header className="mt-4 flex items-start justify-between gap-4">
              <div>
                <SheetTitle className="p-0 font-display text-3xl font-semibold tracking-tight">
                  <EditableField
                    value={title || ""}
                    onCommit={(t) => onTitleCommit(normalizeTitle(t))}
                    placeholder={titlePlaceholder}
                    className="font-display text-3xl font-semibold tracking-tight"
                  />
                </SheetTitle>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {/* Always rendered — pre-generation it reads "0 credits used". */}
                <UsagePopover versions={versions} />
                <GuidedNextButton
                  sourceId={nodeId}
                  variant="button"
                  onNavigate={() => onOpenChange(false)}
                />
              </div>
            </header>
            {lastError && !generating && (
              <div className="mt-2">
                <GenerationErrorBadge error={lastError} />
              </div>
            )}
          </div>
        </div>

        {/* Body: left rail + detail pane */}
        <div className="mx-auto flex w-full max-w-7xl min-h-0 flex-1 overflow-hidden">
          {/* Rail */}
          <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border px-3 py-4">
            <RailItem
              icon={primaryRailIcon}
              label={primaryRailLabel}
              active={selected === "prompt"}
              onClick={() => onSelectedChange("prompt")}
            />

            <div className="flex items-center justify-between px-2.5 pb-1 pt-3">
              <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground/70">
                Connected · {upstream.length}
              </span>
              <AddConnection
                targetId={nodeId}
                targetType={targetType}
                connectedIds={upstream.map((u) => u.id)}
              />
            </div>
            {upstream.length === 0 ? (
              <p className="px-2.5 text-xs text-muted-foreground">No inputs connected.</p>
            ) : (
              upstream.map((u) => (
                <RailItem
                  key={u.id}
                  icon={<NodeIcon type={u.type} />}
                  label={u.label}
                  active={selected === u.id}
                  onClick={() => onSelectedChange(u.id)}
                />
              ))
            )}

            <div className="mx-2.5 my-2 h-px bg-border" />
            {/* Every other versioned node type (Image Gen, Video Gen) carries History in its
                rail; the prompt nodes had only the v1/v2 chips, and PromptVersionHistory —
                built for exactly this in D180, on the same VersionHistoryList shell — was
                rendered nowhere. It lives on the shell rather than in each view because it
                needs nothing per-prompt-type: the shell already holds versions, the active id,
                and the restore handler. */}
            <RailItem
              icon={<History className="size-4 text-primary" />}
              label="History"
              active={selected === "history"}
              onClick={() => onSelectedChange("history")}
            />
            <RailItem
              icon={<SlidersHorizontal className="size-4 text-primary" />}
              label="Details"
              active={selected === "details"}
              onClick={() => onSelectedChange("details")}
              badge={reviewBadge}
            />
            <RailItem
              icon={<FileInput className="size-4 text-primary" />}
              label="Sent to model"
              active={selected === "request"}
              onClick={() => onSelectedChange("request")}
            />
          </nav>

          {/* Detail pane */}
          {/* A flex COLUMN, so panes inside size with `flex-1` instead of `h-full`. As a plain
              block it worked only while every descendant's height resolved as a percentage
              chain, and one extra level of nesting was enough to break it — the Multishot
              Prompt's breakup view grew past the sheet instead of scrolling inside it.

              Still no overflow-hidden: it would crop the raised column's left shadow. The panes
              inside own their scrolling. */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {children({ versionChips, approvalControls })}

            {/* A plain block, not a flex column: its one child is a list that sizes itself, and
                a flex child with `overflow-hidden` would be squashed to fit instead of
                overflowing, leaving the scroller with nothing to scroll. */}
            {selected === "history" && (
              <div className="min-h-0 w-full max-w-3xl flex-1 overflow-y-auto px-6 py-6">
                {versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No versions yet — generate once and every run is kept here.
                  </p>
                ) : (
                  <PromptVersionHistory
                    versions={versions}
                    activeVersionId={activeVersionId}
                    onRestore={onRestoreVersion}
                    restoring={restoring}
                  />
                )}
              </div>
            )}

            {/* Connected node — read-only detail. While the inputs are still being resolved,
                this shows the SHAPE of the panel rather than a centred "Loading…". */}
            {isNodeSelected &&
              (selectedNode ? (
                <ConnectedDetailView node={selectedNode} />
              ) : loadingPreview ? (
                <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-6">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="min-h-0 flex-1 rounded-xl" />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-6">
                  <p className="text-sm text-muted-foreground">This input has no preview yet.</p>
                </div>
              ))}
          </div>
        </div>
      </SheetContent>

      <AlertDialog
        open={!!confirm}
        onOpenChange={(next) => {
          if (!next) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirm(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.onConfirm();
                setConfirm(null);
              }}
            >
              {confirm?.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
