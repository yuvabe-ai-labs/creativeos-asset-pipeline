import { Button } from "@/components/ui/button";
import { nodeHandle } from "@/lib/nodes/describe-node";
import type { Msg } from "./use-copilot-chat";

// One chat message: the role bubble plus (for assistant replies) any node-reference chips.
// Presentational — it only reads the Msg and calls onHighlight when a chip is clicked.
export function CopilotMessage({ msg, onHighlight }: { msg: Msg; onHighlight: (id: string) => void }) {
  return (
    <div className={msg.role === "user" ? "text-right" : ""}>
      {msg.role === "assistant" && (
        <div className="mb-1 text-eyebrow text-[10px] text-primary">Copilot · AI</div>
      )}
      <div
        className={
          msg.role === "user"
            ? "inline-block max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-primary/10 px-3 py-2 text-left text-sm"
            : "inline-block max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm"
        }
      >
        {msg.content}
      </div>
      {msg.role === "assistant" && msg.nodes && msg.nodes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {msg.nodes.map((n) => (
            <Button
              key={n.id}
              variant="ghost"
              size="xs"
              onClick={() => onHighlight(n.id)}
              title={`Highlight this ${n.type} on the canvas`}
              className="h-auto gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-normal text-primary hover:bg-primary/10"
            >
              {/* the handle ties the chip to the tag shown on the canvas node */}
              <span className="text-eyebrow text-[9px] opacity-60">
                {nodeHandle({ id: n.id, type: n.type })}
              </span>
              {n.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
