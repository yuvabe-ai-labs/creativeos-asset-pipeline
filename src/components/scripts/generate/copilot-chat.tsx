"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ScriptMessage } from "@/lib/scripts/copilot/schema";
import { CopilotChatMessage, type ChatActions } from "./copilot-chat-message";
import { CopilotComposer } from "./copilot-composer";

/** Spec 2 §3 — the left pane. The conversation is kept with the script. */
export function CopilotChat({ messages, actions }: { messages: ScriptMessage[]; actions: ChatActions }) {
  const end = useRef<HTMLDivElement>(null);
  // Follow the conversation: scroll to the newest message, or the working line, when either appears.
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length, actions.busy]);

  return (
    <section aria-label="Copilot" className="flex min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card lg:sticky lg:top-6 lg:h-[calc(100vh-9rem)]">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Sparkles className="size-4 text-primary" strokeWidth={1.5} aria-hidden />
        <h2 className="font-display text-base font-medium">Copilot</h2>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        <ol className="flex flex-col gap-4 p-4" aria-live="polite">
          {messages.map((m) => <CopilotChatMessage key={m.id} message={m} actions={actions} />)}
          {actions.busy && <li className="animate-pulse text-sm text-muted-foreground">Working on it. A first draft takes up to a minute.</li>}
        </ol>
        <div ref={end} />
      </ScrollArea>
      <CopilotComposer busy={actions.busy} onSend={actions.send} />
    </section>
  );
}
