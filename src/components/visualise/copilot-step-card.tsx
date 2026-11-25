"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLinkCast } from "@/hooks/queries/visualise";
import { useScriptAssets } from "@/components/scripts/script-assets-context";
import { listSentence } from "@/lib/avatars/generation";
import type { CopilotAvatar } from "@/lib/scripts/copilot/schema";
import type { MissingPicture, VisualiseStep } from "@/lib/scripts/copilot/visualise-walk";
import { generateAllLabel } from "@/lib/scripts/visualise/state";
import { GenerateAllDialog } from "./generate-all-dialog";
import { showOnBoard } from "./show-on-board";
import { useVisualiseBoardActions } from "./visualise-board-context";
import { useScriptFollow } from "./script-follow-context";

const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Piece 5.1 §3.2 (D526) — the walk's current step, at the foot of the thread. Worked out from the
 *  board each time it is shown. The send step is the send card, shown by the caller. Drawing is
 *  the board's own Generate all, with its confirmation. */
export function CopilotStepCard({ clientId, step, avatars, onAttach }: {
  clientId: string;
  step: Exclude<VisualiseStep, { kind: "send" }>;
  /** The client's avatars ready to cast. */
  avatars: CopilotAvatar[];
  /** Opens the composer's picture picker for this product or location (Task 8). */
  onAttach?: (target: string) => void;
}) {
  const { data, draws, model } = useVisualiseBoardActions();
  const link = useLinkCast(clientId, data.script.id);
  const assets = useScriptAssets();
  const follow = useScriptFollow();
  // The cast steps carry only a count: what can be drawn now is the board's own plan.
  const plan = "plan" in step ? step.plan : model.plan;
  const draw = (label: string) => (
    <GenerateAllDialog size="sm" label={label} plan={plan} busy={draws.drawingAll} onConfirm={() => void draws.drawAll(plan.shotIds)} />
  );
  // The board's rule (withCastAvatar): an avatar another character has is not offered.
  const taken = new Set(data.script.doc.cast.filter((c) => c.avatarId && !(step.kind === "cast" && c.id === step.castId)).map((c) => c.avatarId));
  const free = avatars.filter((a) => !taken.has(a.id));

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-background p-3 text-sm">
      <span className="text-eyebrow">Next for the storyboard</span>
      {step.kind === "cast" && (
        <>
          <span className="font-medium">Who plays {step.name}?</span>
          {free.length === 0 ? (
            <span className="text-muted-foreground">This client has no avatars ready yet. Make one from {step.name}'s slot on the board.</span>
          ) : (
            <div className="flex flex-wrap gap-2">
              {free.map((a) => (
                <Button
                  key={a.id}
                  size="sm"
                  variant="outline"
                  disabled={link.isPending}
                  onClick={() => link.mutate(
                    { castId: step.castId, avatarId: a.id },
                    { onError: (e) => toast.error(e.message), onSuccess: () => follow?.land([`cast:${step.castId}`]) },
                  )}
                >
                  {a.front && <img src={a.front} alt="" className="size-5 rounded-full object-cover" />}
                  {a.name}
                </Button>
              ))}
            </div>
          )}
          {step.drawable > 0 && (
            <ElseDraw sentence={`You can already draw the shots ${step.name} is not in.`} button={draw(`Draw the ${step.drawable} panels I can draw now`)} />
          )}
        </>
      )}
      {step.kind === "finish_avatar" && (
        <>
          <span>{step.name}'s avatar isn't ready to draw yet: it needs to be saved with its four views.</span>
          <Button size="sm" variant="outline" className="self-start" onClick={() => showOnBoard(`cast:${step.castId}`)}>Show {step.name} on the board</Button>
          {step.drawable > 0 && <ElseDraw sentence="Meanwhile, the other shots can be drawn." button={draw(`Draw the ${step.drawable} panels I can draw now`)} />}
        </>
      )}
      {step.kind === "pictures" && (
        <>
          <span>{picturesSentence(step.missing)}</span>
          <ul className="flex flex-col gap-2">
            {step.missing.map((m) => (
              <li key={`${m.kind}:${m.id}`} className="flex flex-wrap items-center gap-2">
                <span className="mr-auto font-medium">{upper(m.name)}</span>
                {onAttach && <Button size="sm" variant="outline" onClick={() => onAttach(`${m.kind}:${m.id}`)}>Attach a picture</Button>}
                {m.kind === "location" && assets && (
                  <Button size="sm" variant="outline" disabled={assets.drawing.has(m.id)} onClick={() => assets.generatePlate(m.id)}>Draw it</Button>
                )}
                {m.kind === "product" && <Button size="sm" variant="outline" onClick={() => showOnBoard(`product:${m.id}`)}>Pick on the board</Button>}
              </li>
            ))}
          </ul>
          <ElseDraw sentence="Or draw now, without them." button={draw(`Draw ${step.plan.shotIds.length} panel${step.plan.shotIds.length === 1 ? "" : "s"} without them`)} />
        </>
      )}
      {step.kind === "draw" && draw(generateAllLabel(step.plan))}
      {step.kind === "drawing" && <span className="text-muted-foreground">Drawing {step.count} panel{step.count === 1 ? "" : "s"}…</span>}
    </div>
  );
}

function ElseDraw({ sentence, button }: { sentence: string; button: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <span className="text-muted-foreground">{sentence}</span>
      <div className="self-start">{button}</div>
    </div>
  );
}

/** "The café and the bottle have no picture. Panels drawn now would need redrawing once they do." */
export function picturesSentence(missing: MissingPicture[]): string {
  const one = missing.length === 1;
  return `${upper(listSentence(missing.map((m) => m.name)))} ${one ? "has" : "have"} no picture. Panels drawn now would need redrawing once ${one ? "it does" : "they do"}.`;
}
