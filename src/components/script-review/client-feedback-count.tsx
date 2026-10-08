// src/components/script-review/client-feedback-count.tsx
import { MessageSquareText } from "lucide-react";

/** Spec 4 §6 and D356: the total of client comments and approvals, in D310's amber, no seen-state. */
export function ClientFeedbackCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      title={`${count} client ${count === 1 ? "comment or approval" : "comments and approvals"}, in total`}
      className="inline-flex items-center gap-1 rounded-full bg-client/15 px-2 py-0.5 text-xs font-medium tabular-nums text-client-text"
    >
      <MessageSquareText className="size-3.5" strokeWidth={1.5} aria-hidden />
      Client feedback {count}
    </span>
  );
}
