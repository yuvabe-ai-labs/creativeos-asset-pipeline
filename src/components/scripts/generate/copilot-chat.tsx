"use client";

import { useEffect, useRef, useState } from "react";
import { PanelLeftClose, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopilotCollapsed } from "@/hooks/use-copilot-collapsed";
import { cn } from "@/lib/utils";
import type { CopilotAvatar, ScriptMessage } from "@/lib/scripts/copilot/schema";
import type { Suggestion } from "@/lib/scripts/copilot/suggestions";
import { CopilotChatMessage, type ChatActions } from "./copilot-chat-message";
import { CopilotComposer } from "./copilot-composer";
import { CopilotSuggestions } from "./copilot-suggestions";
import { CopilotThinking } from "./copilot-thinking";
import { CopilotRail } from "./copilot-rail";

/** Spec 2 §3 — the left pane. The conversation is kept with the script. From lg up it folds to a
 *  rail on request, so a written script can take the page (kept per script in this browser). */
export function CopilotChat({ scriptId, messages, actions, suggestions, avatars }: {
  scriptId: string;
  messages: ScriptMessage[];
  actions: ChatActions;
  suggestions: Suggestion[];
  avatars: CopilotAvatar[];
}) {
  const [collapsed, setCollapsed] = useCopilotCollapsed(scriptId);
  const end = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  // Follow the conversation: scroll to the newest message, or the working line, when either appears,
  // and again when the copilot unfolds (a hidden scroll area does not keep its place).
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length, actions.busy, collapsed]);

  return (
    <section
      aria-label="Copilot"
      className={cn(
        "flex min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card lg:sticky lg:top-6 lg:h-[calc(100vh-9rem)]",
        "transition-[width] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        collapsed ? "lg:w-12" : "lg:w-[29rem]",
      )}
    >
      {collapsed && <CopilotRail onExpand={() => setCollapsed(false)} />}
      {/* Kept mounted while folded, so a half-typed message survives. Held at the open width, so
          unfolding reveals it rather than reflowing every line mid-animation. */}
      <div className={cn("flex min-h-0 flex-1 flex-col lg:w-[calc(29rem-2px)] lg:shrink-0", collapsed && "lg:hidden")}>
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Sparkles className="size-4 text-primary" strokeWidth={1.5} aria-hidden />
          <h2 className="font-display text-base font-medium">Copilot</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Hide copilot"
                    // Never hide a reply the copilot is still writing.
                    disabled={actions.busy}
                    onClick={() => setCollapsed(true)}
                    className="ml-auto hidden text-muted-foreground lg:inline-flex"
                  />
                }
              >
                <PanelLeftClose strokeWidth={1.5} />
              </TooltipTrigger>
              <TooltipContent side="bottom">Hide copilot</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </header>
        <ScrollArea className="min-h-0 flex-1">
          <ol className="flex flex-col gap-4 p-4" aria-live="polite">
            {messages.map((m) => <CopilotChatMessage key={m.id} message={m} actions={actions} avatars={avatars} />)}
            {actions.busy && (
              <li>
                <CopilotThinking />
              </li>
            )}
          </ol>
          {/* Under the newest message, so the options sit right below the question they answer. Hidden
              while the copilot works: the thinking line stands in their place. */}
          {!actions.busy && <CopilotSuggestions suggestions={suggestions} onSend={actions.send} onFill={setText} />}
          <div ref={end} />
        </ScrollArea>
        <CopilotComposer busy={actions.busy} text={text} onTextChange={setText} onSend={actions.send} />
      </div>
    </section>
  );
}
