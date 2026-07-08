"use client";

import { useRef, useState } from "react";
import type { NodeChange } from "@xyflow/react";
import { Sparkles, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCanvasStoreApi } from "./canvas-store-provider";
import type { AppNode } from "@/lib/canvas-nodes";

// A node the copilot referenced — arrives as STRUCTURED data (not text), so we can
// render it as a clickable chip that highlights the real node on the canvas.
type NodeRef = { id: string; label: string; type: string };
type Msg = { role: "user" | "assistant"; content: string; nodes?: NodeRef[] };

export function CopilotPanel({ canvasId }: { canvasId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const storeApi = useCanvasStoreApi();

  // Clicking a chip selects (highlights) that node on the real canvas.
  function highlightNode(id: string) {
    const { nodes, onNodesChange } = storeApi.getState();
    const changes: NodeChange<AppNode>[] = [
      ...nodes
        .filter((n) => n.selected)
        .map((n) => ({ type: "select" as const, id: n.id, selected: false })),
      { type: "select", id, selected: true },
    ];
    onNodesChange(changes);
  }

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

      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setMessages((m) => [
          ...m,
          { role: "assistant", content: err.error ?? "Something went wrong." },
        ]);
        return;
      }

      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      setThinking(false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        // CALL 1: plain-text prose streams straight into the message (like Lesson 3).
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { ...copy[copy.length - 1], content: reply };
          return copy;
        });
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }

      // CALL 2: after the prose is done, a separate STRUCTURED call resolves which
      // nodes the answer referenced → we render them as chips. (chips are a bonus,
      // so any failure here is swallowed.)
      try {
        const refRes = await fetch("/api/copilot/references", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, canvasId, reply }),
        });
        if (refRes.ok) {
          const { referencedNodes } = (await refRes.json()) as { referencedNodes?: NodeRef[] };
          if (referencedNodes?.length) {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { ...copy[copy.length - 1], nodes: referencedNodes };
              return copy;
            });
          }
        }
      } catch {
        /* ignore — chips are optional */
      }
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Something went wrong reaching the copilot." },
      ]);
    } finally {
      setThinking(false);
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
            Ask me about this canvas — I can see your nodes. Try &ldquo;what&apos;s on
            this canvas?&rdquo; then click a node chip to highlight it.
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
            {m.role === "assistant" && m.nodes && m.nodes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.nodes.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => highlightNode(n.id)}
                    title={`Highlight this ${n.type} on the canvas`}
                    className="rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            )}
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
