import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Waiting } from "@/lib/journey/thread/schema";
import { ThreadGateCard } from "./thread-gate-card";

/** The one thing the person has to do next, at the foot of the thread (journey spec §4.3). A reply
 *  the copilot is waiting for draws nothing here: its question is already the last thing said, and
 *  the folded rail carries the label. The same in every stage: `onGate` is handed the name of the
 *  approval, and only the stage's own component knows how to carry it out. */
export function ThreadWaiting({ waiting, onGate, gateBusy }: {
  waiting: Waiting | null;
  onGate: (action: string) => void;
  gateBusy: boolean;
}) {
  // A reply waits on the question already said; a change waits on the card already in the thread.
  if (!waiting || waiting.kind === "reply" || waiting.kind === "change") return null;
  if (waiting.kind === "gate") {
    return (
      <div className="px-4 pb-4">
        <ThreadGateCard title={waiting.title} opens={waiting.opens} why={waiting.why} busy={gateBusy} onApprove={() => onGate(waiting.action)} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 px-4 pb-4" aria-label="Waiting for you">
      <p className="text-eyebrow text-muted-foreground">Waiting for you</p>
      <p className="text-sm">{waiting.text}</p>
      {waiting.links.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {waiting.links.map((link) => (
            <Button key={link.href} variant="outline" size="xs" nativeButton={false} render={<Link href={link.href} scroll={false} />}>
              {link.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
