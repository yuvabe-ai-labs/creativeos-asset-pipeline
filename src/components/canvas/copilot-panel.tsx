"use client";

import { useRef, useState } from "react";
import { useReactFlow, type NodeChange } from "@xyflow/react";
import { Sparkles, Send, X, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCanvasStore, useCanvasStoreApi } from "./canvas-store-provider";
import { nodeHandle, nodeLabel, resolveMentions } from "@/lib/nodes/describe-node";
import { placeNewNode, buildHistory, resolveScriptTarget, type CopilotAction } from "@/lib/copilot/actions";
import { cn } from "@/lib/utils";
import type { AppNode } from "@/lib/canvas-nodes";
import type { ReelScript } from "@/lib/nodes/reel-script";

// A node the copilot referenced — arrives as STRUCTURED data (not text), so we can
// render it as a clickable chip that highlights the real node on the canvas.
type NodeRef = { id: string; label: string; type: string };
// The action the copilot *requested* via function calling (L5) — the raw server payload.
type ActionRequest = { name: "add_node"; args: { type: string; title?: string } };
// The same action once it enters the HITL gate (L6): it gains a lifecycle. It stays
// `pending` until the human decides. Only on `approved` does anything run; `createdNodeId`
// records the node the approval produced, so we can highlight it.
type ProposedAction = ActionRequest & {
  status: "pending" | "approved" | "rejected";
  createdNodeId?: string;
};
type Msg = {
  role: "user" | "assistant";
  content: string;
  nodes?: NodeRef[];
  proposal?: ProposedAction;
};

export function CopilotPanel({ canvasId }: { canvasId: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const storeApi = useCanvasStoreApi();
  const { setCenter } = useReactFlow();
  const nodes = useCanvasStore((s) => s.nodes);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // @-mention picker state: non-null while the composer is mid-@reference.
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

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

  // RECIPE — "create a script node from this". One model DECISION (create_script_node)
  // expands into this fixed, code-owned sequence: create the node, write the pasted text
  // into it as the source, name it, and bring it into view. No server call yet — parsing
  // (and the persist barrier it needs) is the next increment.
  function createScriptNode(source: string, title?: string) {
    const { addNode, updateNodeData, nodes } = storeApi.getState();
    const id = crypto.randomUUID();
    const position = placeNewNode(nodes);
    addNode("script", position, id);
    updateNodeData(id, { source, ...(title ? { title } : {}) });
    highlightNode(id); // select it on the canvas
    setCenter(position.x + 120, position.y + 60, { zoom: 1, duration: 500 }); // pan to it
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        content: title
          ? `Created a Script node — “${title}” — from your text. Want me to parse it into shots?`
          : "Created a Script node from your text. Want me to parse it into shots?",
      },
    ]);
  }

  // RECIPE — parse a Script node the user already created. Resolve the target, POST to the
  // parse route (retrying if the node is still autosaving — the app's own runParse pattern),
  // inject the parsed output for display, and report the shot count in chat.
  async function parseScript(handle?: string) {
    const target = resolveScriptTarget(storeApi.getState().nodes, handle);
    if (!target) {
      setMessages((m) => [...m, { role: "assistant", content: "I don't see a script node to parse." }]);
      setThinking(false);
      return;
    }
    const source = ((target.data as { source?: string }).source ?? "").trim();
    if (!source) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "That script node has no text to parse yet." },
      ]);
      setThinking(false);
      return;
    }
    try {
      let output: ReelScript | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`/api/nodes/${target.id}/parse`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source }),
        });
        if (res.ok) {
          output = ((await res.json()) as { output: ReelScript }).output;
          break;
        }
        if (res.status === 404 && attempt < 2) {
          await new Promise((r) => setTimeout(r, 900)); // node still autosaving — wait past the debounce
          continue;
        }
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setMessages((m) => [...m, { role: "assistant", content: err.error ?? "Parsing failed." }]);
        return;
      }
      if (!output) {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "The node is still saving — ask me to parse it again in a moment." },
        ]);
        return;
      }
      storeApi.getState().updateNodeData(target.id, { parsed: output });
      highlightNode(target.id);
      const count = output.visual_script?.shots?.length ?? 0;
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            count > 0
              ? `Parsed into ${count} shot${count === 1 ? "" : "s"}. Open the node to review them.`
              : "Parsed the script, but I didn't find any shots in it.",
        },
      ]);
    } finally {
      setThinking(false);
    }
  }

  // APPROVE — the gate opens. THIS is the first line in the whole copilot that mutates
  // the canvas, and it runs only on a human click. The server merely proposed {type,title};
  // we execute it here via the store, then mark the proposal approved.
  function approveProposal(msgIndex: number) {
    const proposal = messages[msgIndex]?.proposal;
    if (!proposal || proposal.status !== "pending") return;

    const { addNode, updateNodeData, nodes } = storeApi.getState();
    const id = crypto.randomUUID();
    addNode(proposal.args.type, placeNewNode(nodes), id);
    if (proposal.args.title) updateNodeData(id, { title: proposal.args.title });

    setMessages((m) =>
      m.map((msg, i) =>
        i === msgIndex && msg.proposal
          ? { ...msg, proposal: { ...msg.proposal, status: "approved", createdNodeId: id } }
          : msg,
      ),
    );
    highlightNode(id); // select the new node so the user sees what appeared
  }

  // REJECT — the gate stays shut. No store mutation; we just record the decision so the
  // card shows it was dismissed (and can't be approved afterward).
  function rejectProposal(msgIndex: number) {
    setMessages((m) =>
      m.map((msg, i) =>
        i === msgIndex && msg.proposal?.status === "pending"
          ? { ...msg, proposal: { ...msg.proposal, status: "rejected" } }
          : msg,
      ),
    );
  }

  // @-mention: candidate node references for the current @query. Human-directed
  // grounding — YOU pick which nodes matter; the copilot never volunteers them. Matches
  // on the handle AND the (title-derived) name, so a titled node is found by its title
  // and an untitled/agent-made one by its handle. Capped so the list stays scannable.
  const mentionOptions =
    mention !== null
      ? nodes
          .map((n) => ({ id: n.id, type: n.type as string, ...nodeLabel(n) }))
          .filter((o) => {
            const q = mention.query.toLowerCase();
            return o.handle.toLowerCase().includes(q) || o.name.toLowerCase().includes(q);
          })
          .slice(0, 8)
      : [];

  // On each keystroke, detect an "@word" at the caret → open/refresh the picker.
  function onComposerChange(value: string, caret: number) {
    setInput(value);
    const m = value.slice(0, caret).match(/@([\w-]*)$/);
    if (m) {
      setMention({ query: m[1], start: caret - m[0].length });
      setMentionIndex(0);
    } else {
      setMention(null);
    }
  }

  // Replace the "@query" at the caret with the chosen node's stable handle token.
  function insertMention(o: { handle: string }) {
    if (mention === null) return;
    const el = inputRef.current;
    const caret = el?.selectionStart ?? input.length;
    const before = input.slice(0, mention.start);
    const after = input.slice(caret);
    const token = `@${o.handle} `;
    setInput(before + token + after);
    setMention(null);
    const pos = (before + token).length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  async function send() {
    const text = input.trim();
    if (!text || thinking) return;
    // Resolve the @HANDLE tokens the human typed → the exact node ids they pointed at.
    // These travel with the request so the server grounds the copilot on precisely them.
    const mentionedIds = resolveMentions(text, storeApi.getState().nodes);
    // The whole chat window travels with the turn — this is the copilot's memory.
    const history = buildHistory(messages, text);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setThinking(true);
    try {
      // PHASE 1 — decision. Ask the actions route FIRST: is this a COMMAND to act on,
      // or a question to answer? (Lesson 5 machinery, now used to route the turn.)
      let action: CopilotAction | null = null;
      try {
        const actRes = await fetch("/api/copilot/actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: history, canvasId, mentionedIds }),
        });
        if (actRes.ok) {
          action = ((await actRes.json()) as { action?: CopilotAction | null }).action ?? null;
        }
      } catch {
        /* best-effort — a failed decision just falls through to a normal answer */
      }

      // "Turn this pasted script into a Script node" is a COMMAND → run the code recipe
      // and stop. The model decided; code does the work (no prose paragraph + a node).
      if (action?.name === "create_script_node") {
        createScriptNode(text, action.args.title);
        setThinking(false);
        return;
      }

      // "yes" / "parse it" → the model returns parse_script; run the recipe and stop.
      if (action?.name === "parse_script") {
        await parseScript(action.args.handle);
        return;
      }

      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history, canvasId, mentionedIds }),
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

      // CALL 3 (Lesson 5): a REQUESTED add_node becomes a read-only proposal card.
      // Reuses the decision already fetched in Phase 1 — no second model call.
      if (action?.name === "add_node") {
        const proposal = { ...action, status: "pending" as const };
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { ...copy[copy.length - 1], proposal };
          return copy;
        });
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
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
                  >
                    {/* the handle ties the chip to the tag shown on the canvas node */}
                    <span className="text-eyebrow text-[9px] opacity-60">
                      {nodeHandle({ id: n.id, type: n.type })}
                    </span>
                    {n.label}
                  </button>
                ))}
              </div>
            )}
            {/* Lesson 5: a REQUESTED action, shown read-only. The model asked to add a
                node; nothing has run. Approve/edit/reject buttons arrive in Lesson 6. */}
            {m.role === "assistant" && m.proposal && (
              <div className="mt-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 py-2">
                <div className="text-eyebrow mb-0.5 text-[10px] text-primary">
                  Proposed action
                </div>
                <div className="flex items-center gap-1.5 text-sm text-foreground">
                  <Plus className="size-3.5 text-primary" />
                  Add a{" "}
                  <span className="font-medium">{m.proposal.args.type}</span> node
                  {m.proposal.args.title && (
                    <span className="text-muted-foreground">
                      — “{m.proposal.args.title}”
                    </span>
                  )}
                </div>
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
        <div className="relative">
          {/* @-mention picker: appears above the composer when you type "@". YOU drive
              it — the list is the canvas nodes, shown by title/type + stable handle. */}
          {mention !== null && mentionOptions.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-border bg-background shadow-lg">
              <div className="text-eyebrow px-3 py-1.5 text-[10px] text-muted-foreground">
                Reference a node
              </div>
              <ul className="max-h-56 overflow-y-auto pb-1">
                {mentionOptions.map((o, i) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      // onMouseDown (not onClick) + preventDefault keeps the textarea
                      // focused so the caret survives the insertion.
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(o);
                      }}
                      onMouseEnter={() => setMentionIndex(i)}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                        i === mentionIndex ? "bg-primary/10" : "hover:bg-muted",
                      )}
                    >
                      <span className="text-eyebrow text-[9px] text-muted-foreground">
                        {o.handle}
                      </span>
                      <span className="truncate">{o.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) =>
              onComposerChange(e.target.value, e.target.selectionStart ?? e.target.value.length)
            }
            onKeyDown={(e) => {
              // While the picker is open, the arrow/enter/esc keys drive it — not the composer.
              if (mention !== null && mentionOptions.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setMentionIndex((i) => (i + 1) % mentionOptions.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIndex((i) => (i - 1 + mentionOptions.length) % mentionOptions.length);
                  return;
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  insertMention(mentionOptions[mentionIndex]);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMention(null);
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask the copilot…  (type @ to reference a node)"
            rows={2}
            className="resize-none"
          />
        </div>
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
