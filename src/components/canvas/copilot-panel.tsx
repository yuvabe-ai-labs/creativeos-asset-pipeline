"use client";

import { useRef, useState } from "react";
import { Sparkles, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// Lesson 1 — the copilot panel, docked in the real canvas.
// Right now it's a plain chat: message in -> reply out (via /api/copilot).
// Each lesson adds ONE primitive on top of this same panel.
//
// AI-UX patterns applied here (Shape of AI):
//   - Prompt entry  : the textarea + Enter-to-send + a visible Send affordance
//   - Thinking state: an honest "thinking…" while the model runs
//   - AI notice     : every model reply is labelled "Copilot · AI" so the user
//                     knows it's generated and should read it critically

type Msg = { role: "user" | "assistant"; content: string };

export function CopilotPanel({ canvasId }: { canvasId: string }) {
  // Lesson 2: we now send `canvasId` with every message so the server can read
  // your real canvas and ground its answer (see /api/copilot/route.ts).
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function send() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setThinking(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, canvasId }),
      });
      const json = (await res.json()) as { reply?: string; error?: string };
      setMessages((m) => [
        ...m,
        { role: "assistant", content: json.reply ?? json.error ?? "(no reply)" },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Something went wrong reaching the copilot." },
      ]);
    } finally {
      setThinking(false);
      requestAnimationFrame(() =>
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }),
      );
    }
  }

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="absolute right-4 top-4 z-20 gap-2 shadow-md"
      >
        <Sparkles className="size-4" /> Copilot
      </Button>
    );
  }

  return (
    <div className="absolute right-4 top-4 bottom-4 z-20 flex w-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-background/95 shadow-lg backdrop-blur">
      <header className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="flex items-center gap-2 font-display font-medium">
          <Sparkles className="size-4 text-primary" /> Copilot
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close copilot"
        >
          <X className="size-4" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ask me about this canvas — I can see your nodes now. Try &ldquo;what&apos;s on
            this canvas?&rdquo;
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : ""}>
            {m.role === "assistant" && (
              <div className="mb-1 text-eyebrow text-[10px] text-primary">Copilot · AI</div>
            )}
            <div
              className={
                m.role === "user"
                  ? "inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary/10 px-3 py-2 text-left text-sm"
                  : "inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm"
              }
            >
              {m.content}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="text-eyebrow animate-pulse text-[10px] text-muted-foreground">
            Copilot is thinking…
          </div>
        )}
      </div>

      <div className="border-t border-border/70 p-3">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Ask the copilot…  (Enter to send, Shift+Enter for a newline)"
          rows={2}
          className="resize-none"
        />
        <div className="mt-2 flex justify-end">
          <Button
            onClick={() => void send()}
            disabled={thinking || input.trim().length === 0}
            className="gap-1.5"
          >
            <Send className="size-3.5" /> Send
          </Button>
        </div>
      </div>
    </div>
  );
}
