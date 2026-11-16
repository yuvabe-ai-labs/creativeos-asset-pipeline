import type { ThreadMessage, Waiting } from "@/lib/journey/thread/schema";
import { isBuilding, type KbContext } from "./context";
import { unreviewedByModule } from "./review";
import { walkOf } from "./walk";

// What the brand KB stage is waiting on the person for (journey spec §4.3), worked out on every
// read from the stored KB and the thread. Never stored, so it follows a review done by hand. Pure.

/** The approval this stage's gate card asks for; the Brand KB page's component carries it out. */
export const APPROVE_KB_ACTION = "approve-kb";

export function kbWaiting(ctx: KbContext, messages: ThreadMessage[]): Waiting | null {
  // The copilot asks nothing while a build runs (spec §2.2), and an approved KB waits on nobody.
  if (isBuilding(ctx) || ctx.kbStatus === "ready") return null;

  if (!ctx.hasVersion) {
    const last = messages[messages.length - 1];
    return last?.role === "assistant" ? { kind: "reply", label: "Your reply" } : null;
  }

  // Not read: say nothing. An unknown count must never look like "nothing left", which is the gate.
  if (ctx.unreviewed === null) return null;

  const { pending } = walkOf(messages);
  if (pending && ctx.unreviewed.includes(pending)) return { kind: "reply", label: "Your answer" };

  const left = ctx.unreviewed.length;
  if (left > 0) {
    return {
      kind: "task",
      label: `Review ${left} field${left === 1 ? "" : "s"}`,
      text: `${left} field${left === 1 ? " is" : "s are"} still to review on the right.`,
      links: unreviewedByModule(ctx.unreviewed).map((m) => ({
        label: `${m.label} · ${m.count}`,
        href: `/clients/${ctx.clientSlug}/kb?section=${m.module}`,
      })),
    };
  }

  return {
    kind: "gate",
    label: "Approve the brand KB",
    title: "Approve the brand KB",
    opens: "Approving it opens market research.",
    why: "Only a person can approve it. I never do.",
    action: APPROVE_KB_ACTION,
  };
}
