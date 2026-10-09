import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConfirmationCard, CopilotAvatar } from "@/lib/scripts/copilot/schema";
import { avatarLabel } from "@/lib/scripts/copilot/avatar-label";
import { reelLabel } from "@/lib/scripts/utils";

/** Roughly what fits on one line beside an 8rem label in the copilot pane; longer values stack. */
const STACK_FROM = 32;

/** Spec 2 §5 — "Every path ends on the confirmation card: one short card listing each piece, marked
 *  given or proposed, plus the cast … and the items to confirm. The person writes, or changes a line." */
export function CopilotConfirmationCard({ card, avatars, disabled, onWrite }: {
  card: ConfirmationCard;
  /** The client's avatars, so each linked cast member shows which one (two can share a name). */
  avatars: CopilotAvatar[];
  disabled: boolean;
  onWrite: () => void;
}) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-xl border border-border bg-background p-3 text-sm">
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">{reelLabel(card.reelNumber)}</span>
        <span className="font-display text-base font-medium">{card.title}</span>
      </div>
      <dl className="flex flex-col gap-1.5">
        {card.lines.map((l) => {
          // A value that would wrap beside its label reads better under it, at the card's full width.
          const stacked = l.value.length > STACK_FROM;
          return (
            <div
              key={l.label}
              data-line={stacked ? "stacked" : "inline"}
              className={stacked ? "grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-0.5 py-0.5" : "grid grid-cols-[8rem_1fr_auto] items-start gap-2"}
            >
              <dt className="text-muted-foreground">{l.label}</dt>
              <dd className={stacked ? "col-span-2 row-start-2" : undefined}>{l.value}</dd>
              <Badge variant="outline" className="text-[0.7rem]">{l.source}</Badge>
            </div>
          );
        })}
      </dl>
      <div className="flex flex-col gap-1 border-t border-border pt-2">
        <span className="text-eyebrow">Cast</span>
        <ul className="flex flex-col gap-2">
          {card.cast.map((c) => {
            const avatar = avatars.find((a) => a.id === c.avatarId);
            // The Lead badge says it; a role that only repeats "lead" adds nothing.
            const role = /^lead$/i.test(c.role.trim()) ? "" : c.role.trim();
            return (
              <li key={c.name} className="flex items-center gap-2.5">
                <span className="relative size-10 shrink-0 overflow-hidden rounded-full bg-muted">
                  {avatar?.front ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatar.front} alt="" className="size-full object-cover object-top" />
                  ) : (
                    <UserRound className="absolute inset-0 m-auto size-5 text-muted-foreground/60" strokeWidth={1.5} aria-hidden />
                  )}
                </span>
                <span className="font-medium">{avatar ? avatarLabel(avatar, avatars) : c.name}</span>
                {c.isLead && <Badge variant="outline" className="text-[0.7rem]">Lead</Badge>}
                {role && <span className="min-w-0 text-muted-foreground">· {role}</span>}
              </li>
            );
          })}
        </ul>
      </div>
      {card.toConfirm.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          <span className="text-eyebrow">To confirm before Final</span>
          <ul className="flex list-disc flex-col gap-0.5 pl-4">{card.toConfirm.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}
      <Button size="sm" className="self-start" disabled={disabled} onClick={onWrite}>Write it</Button>
    </div>
  );
}
