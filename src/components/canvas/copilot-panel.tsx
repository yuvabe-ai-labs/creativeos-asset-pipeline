"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopilotChat } from "./use-copilot-chat";
import { CopilotMessage } from "./copilot-message";
import { CopilotComposer } from "./copilot-composer";
import { CopilotRunCard } from "./copilot-run-card";

// The docked copilot panel: shell + open/close only. All conversation logic lives in
// useCopilotChat; the message rows and composer are their own components. This file owns
// nothing but layout and the scroll-to-bottom behavior.
export function CopilotPanel({ canvasId }: { canvasId: string }) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, thinking, highlightNode, send, cancelRun, dismissRun } =
    useCopilotChat(canvasId);

  // Keep the transcript pinned to the newest message. Fires on EVERY message change —
  // sending, recipe replies (parse/fan-out), proposal cards, and each streamed token —
  // so the latest content is always in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, thinking]);

  // Ctrl+Space toggles the copilot from anywhere on the canvas — the command-bar
  // launcher (like Cmd+K palettes). `e.code` because `e.key` for Space is " ".
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="absolute right-4 bottom-4 z-[60] gap-2 shadow-md">
        <Sparkles className="size-4" /> Copilot
      </Button>
    );
  }

  return (
    // z-[60] keeps the copilot ABOVE focus-view sheets (portaled at z-50): mid-run,
    // the runner opens a sheet while the run card narrates — both must stay visible.
    <div className="absolute right-4 top-4 bottom-4 z-[60] flex w-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-background/95 shadow-lg backdrop-blur">
      <header className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2 font-display font-medium">
          <Sparkles className="size-4 text-primary" /> Copilot
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(false)}
          aria-label="Close copilot"
          className="-mr-1.5 text-muted-foreground"
        >
          <X className="size-4" />
        </Button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask me about this canvas — I can see your nodes. Try &ldquo;what&apos;s on this
            canvas?&rdquo; then click a node chip to highlight it.
          </p>
        )}
        {messages.map((m, i) => (
          <CopilotMessage key={i} msg={m} onHighlight={highlightNode} />
        ))}
        <CopilotRunCard onCancel={cancelRun} onDismiss={dismissRun} />
        {thinking && (
          <div className="text-eyebrow animate-pulse text-[10px] text-muted-foreground">
            Copilot is thinking…
          </div>
        )}
      </div>

      <CopilotComposer onSend={send} thinking={thinking} />
    </div>
  );
}
