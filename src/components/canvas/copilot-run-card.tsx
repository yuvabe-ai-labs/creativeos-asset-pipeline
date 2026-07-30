import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCanvasStore } from "./canvas-store-provider";
import { PLAYBOOKS } from "@/lib/copilot/playbooks";

// The run card (runner spec §2.4): a live checklist rendered FROM store state — not
// message history — so it updates in place and survives the panel closing. Done
// copilot steps show what they DID (run.log, with handles); the active human step
// is highlighted with its instruction; pending steps are dim.
export function CopilotRunCard({
  onCancel,
  onDismiss,
}: {
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const run = useCanvasStore((s) => s.playbookRun);
  // Elicitation happens as plain chat turns — the card appears once steps exist.
  if (!run || run.status === "eliciting") return null;
  const playbook = PLAYBOOKS[run.playbook];
  const current = playbook?.steps[run.stepIndex];
  const live = run.status === "running" || run.status === "waiting-human";
  const waiting = run.status === "waiting-human" && current?.actor === "human";
  const pending = playbook ? playbook.steps.slice(run.stepIndex + (waiting ? 1 : 0)) : [];

  return (
    <div className="rounded-xl border border-border bg-card p-3 text-sm shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-[13px] font-medium">{run.title}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={live ? onCancel : onDismiss}
          aria-label={live ? "Cancel run" : "Dismiss"}
          title={live ? "Cancel this run (created nodes stay)" : "Dismiss"}
          className="-mr-1 text-muted-foreground"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {run.log.map((line, i) => (
          <li key={i} className="flex items-start gap-1.5 text-muted-foreground">
            <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>{line}</span>
          </li>
        ))}
        {waiting && current?.actor === "human" && (
          <li className="flex items-start gap-1.5 font-medium">
            <span aria-hidden className="mt-0.5 shrink-0 text-primary">
              →
            </span>
            <span>{current.instruction}</span>
          </li>
        )}
        {live &&
          pending.map((s) => (
            <li key={s.label} className="flex items-start gap-1.5 text-muted-foreground/60">
              <span aria-hidden className="mt-0.5 shrink-0">
                ○
              </span>
              <span>{s.label}</span>
            </li>
          ))}
        {run.status === "done" && <li className="font-medium text-primary">Done</li>}
        {run.status === "cancelled" && (
          <li className="text-muted-foreground">Cancelled — created nodes kept.</li>
        )}
      </ul>
    </div>
  );
}
