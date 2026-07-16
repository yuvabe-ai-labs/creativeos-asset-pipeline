import { useState } from "react";
import { useReactFlow, type NodeChange } from "@xyflow/react";
import { useCanvasStoreApi } from "./canvas-store-provider";
import { nodeHandle, nodeLabel, resolveMentions } from "@/lib/nodes/describe-node";
import {
  buildHistory,
  mergeMentionedIds,
  resolveScriptTarget,
  resolveNodeTarget,
  fileNameToTitle,
  scriptCreatedMessage,
  planConnections,
  type CopilotAction,
} from "@/lib/copilot/actions";
import type { AppNode } from "@/lib/canvas-nodes";
import type { ReelScript } from "@/lib/nodes/reel-script";
import { usePlaybookRunner } from "./use-playbook-runner";
import { normalizeSlots } from "@/lib/copilot/runner";

// A node the copilot referenced — arrives as STRUCTURED data (not text), so we can
// render it as a clickable chip that highlights the real node on the canvas.
export type NodeRef = { id: string; label: string; type: string };
export type Msg = {
  role: "user" | "assistant";
  content: string;
  nodes?: NodeRef[];
  // Implicit grounding (the canvas selection) this turn was sent with — labels are
  // captured AT SEND TIME so history survives later node deletion/renaming.
  context?: { handle: string; name: string }[];
};
// A .md/.txt script the human dropped into the composer, pending send.
export type Attachment = { name: string; text: string };

// The copilot's "brain": all conversation state + the code-owned recipes that run the model's
// decisions. Deliberately DOM-free — it only pushes Msgs and mutates the canvas store, so the
// panel/composer/message components stay purely presentational (no prop-drilled logic).
export function useCopilotChat(canvasId: string) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [thinking, setThinking] = useState(false);
  const storeApi = useCanvasStoreApi();
  const { setCenter, screenToFlowPosition } = useReactFlow();

  // Run narration (instructions, ✓ lines, cancellations) lands in the transcript
  // like any other assistant message.
  const say = (text: string) =>
    setMessages((m) => [...m, { role: "assistant" as const, content: text }]);
  const runner = usePlaybookRunner(say);

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

  // Where an agent-created node lands: the CENTER of the visible canvas, so it appears where
  // the human is looking (not off-screen to the right like placeNewNode). Offsets by a half
  // node so the node's center — not its top-left — sits at the viewport center.
  function viewportCenterPosition() {
    const c = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    return { x: c.x - 120, y: c.y - 60 };
  }

  // RECIPE — "create a script node from this". One model DECISION (create_script_node)
  // expands into this fixed, code-owned sequence: create the node, write the pasted text
  // into it as the source, name it, and bring it into view.
  function createScriptNode(source: string, title?: string) {
    const { addNode, updateNodeData } = storeApi.getState();
    const id = crypto.randomUUID();
    const position = viewportCenterPosition();
    addNode("script", position, id);
    updateNodeData(id, { source, ...(title ? { title } : {}) });
    highlightNode(id); // select it on the canvas
    setCenter(position.x + 120, position.y + 60, { zoom: 1, duration: 500 }); // pan to it
    // The confirmation carries the node's HANDLE — on a later "yes", the model reads it from
    // the conversation and passes it to parse_script, so parse targets THIS node (not a stale one).
    const handle = nodeHandle({ id, type: "script" });
    setMessages((m) => [
      ...m,
      { role: "assistant", content: scriptCreatedMessage(handle, title) },
    ]);
  }

  // RECIPE — parse a Script node the user already created. Resolve the target, POST to the
  // parse route (retrying if the node is still autosaving — the app's own runParse pattern),
  // store the parsed output, then auto fan-out the shots onto the canvas.
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
      // Auto fan-out: parsing now drops the shots onto the canvas as Shot nodes wired from the
      // script. fanOutShots reads the `parsed` we just wrote — Zustand's set is synchronous, so
      // it sees it this tick — and self-guards on zero shots, so the count>0 check here only
      // picks the chat wording. This is the whole "parse fans out automatically" feature.
      const count = output.visual_script?.shots?.length ?? 0;
      if (count > 0) storeApi.getState().fanOutShots(target.id);
      highlightNode(target.id);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            count > 0
              ? `Parsed and fanned out ${count} shot${count === 1 ? "" : "s"} onto the canvas.`
              : "Parsed the script, but I didn't find any shots in it.",
        },
      ]);
    } finally {
      setThinking(false);
    }
  }

  // RECIPE — add a node the model requested, then open its detail view. add_node is a
  // cheap, reversible, structural op, so (per the blast-radius rule) it executes INSTANTLY
  // like create_script_node / parse_script — no proposal gate. The real HITL gate is owed
  // later at the GENERATION step, where cost + irreversibility earn it.
  function addNodeAndOpen(args: { type: string; title?: string }) {
    const { addNode, updateNodeData } = storeApi.getState();
    const id = crypto.randomUUID();
    const position = viewportCenterPosition();
    addNode(args.type, position, id);
    if (args.title) updateNodeData(id, { title: args.title });
    // Pan to it, then open its detail view via the shared focus signal (same as open_node).
    setCenter(position.x + 120, position.y + 60, { zoom: 1, duration: 500 });
    storeApi.getState().setFocusedNodeId(id);
    const h = nodeHandle({ id, type: args.type });
    setMessages((m) => [...m, { role: "assistant", content: `Added ${h} — its editor is in view.` }]);
  }

  // RECIPE — open a node's surface (Composer for a Shot, focus view otherwise). Reuses the
  // store's focus-view signal the tray/guided-flow already use: setFocusedNodeId(id).
  function openNode(handle: string) {
    const target = resolveNodeTarget(storeApi.getState().nodes, handle);
    if (!target) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `I couldn't find a node called ${handle}.` },
      ]);
      return;
    }
    // Navigate to it first (same glide the Generation Tray uses), then open its surface —
    // so the node is centered on the canvas behind the sheet, not left off-screen.
    setCenter(target.position.x + 120, target.position.y + 60, { zoom: 1, duration: 500 });
    storeApi.getState().setFocusedNodeId(target.id);
    const h = nodeHandle({ id: target.id, type: target.type });
    setMessages((m) => [...m, { role: "assistant", content: `Opened ${h} — its editor is in view.` }]);
  }

  // RECIPE — wire @from… → @to. Cheap/reversible/structural → runs instantly (no gate).
  // Validation lives here because store.connectNodes is a dumb addEdge (no rule check).
  function connectHandles(fromHandles: string[], toHandle: string) {
    const { nodes, connectNodes } = storeApi.getState();
    const plan = planConnections(fromHandles, toHandle, nodes);
    if (!plan.target) {
      setMessages((m) => [...m, { role: "assistant", content: `I couldn't find a node called ${toHandle}.` }]);
      return;
    }
    plan.wired.forEach((w) => connectNodes(w.sourceId, plan.target!.id));
    const toH = nodeHandle({ id: plan.target.id, type: plan.target.type });
    const parts: string[] = [];
    if (plan.wired.length) parts.push(`Wired ${plan.wired.map((w) => w.handle).join(", ")} → ${toH}.`);
    if (plan.rejected.length) parts.push(`Can't connect ${plan.rejected.map((r) => r.handle).join(", ")} to ${toH} (not an allowed connection).`);
    if (plan.unknown.length) parts.push(`Couldn't find ${plan.unknown.join(", ")}.`);
    setMessages((m) => [...m, { role: "assistant", content: parts.join(" ") || "Nothing to connect." }]);
  }

  // Send a turn. `attachment` (an uploaded script) short-circuits to a deterministic
  // create-script recipe — no model call. Otherwise: resolve @-mentions, ask the actions
  // route whether this is a COMMAND (create/parse/add/open/connect) and route accordingly, else fall
  // through to the streamed prose answer + reference chips.
  async function send(text: string, attachment: Attachment | null, contextIds: string[] = []) {
    // File upload path: a .md/.txt script file → create a Script node from its text
    // (deterministic — an uploaded script is unambiguous, no model call needed).
    if (attachment) {
      const file = attachment;
      setMessages((m) => [...m, { role: "user", content: `📄 ${file.name}` }]);
      createScriptNode(file.text, fileNameToTitle(file.name));
      return;
    }

    // A live run owns some turns: "cancel" stops it; while ELICITING, the message is
    // the answer to the asked slot (client-first, model fallback — spec §2.2). While
    // waiting-human, ordinary chat/commands still work — the run just keeps watching.
    const liveRun = storeApi.getState().playbookRun;
    const runLive =
      !!liveRun && ["eliciting", "running", "waiting-human"].includes(liveRun.status);
    if (runLive && /^\s*(cancel|stop|abort)\s*[.!]?\s*$/i.test(text)) {
      setMessages((m) => [...m, { role: "user", content: text }]);
      runner.cancelRun();
      return;
    }
    if (liveRun?.status === "eliciting") {
      setMessages((m) => [...m, { role: "user", content: text }]);
      const answered = runner.answerWithText(text);
      if (answered.kind !== "model") return; // filled (or run vanished) — runner spoke
      // Model fallback: the actions route extracts the handle from a free-text reply.
      setThinking(true);
      try {
        const res = await fetch("/api/copilot/actions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: buildHistory(messages, text),
            canvasId,
            mentionedIds: [],
            elicit: {
              playbook: liveRun.playbook,
              slotKey: answered.slot.key,
              question: answered.slot.ask,
            },
          }),
        });
        const action = res.ok
          ? (((await res.json()) as { action?: CopilotAction | null }).action ?? null)
          : null;
        const value =
          action?.name === "run_playbook"
            ? normalizeSlots(action.args.slots)[answered.slot.key]
            : undefined;
        if (value !== undefined) runner.fillSlot(answered.slot.key, value);
        else runner.reaskOrWait();
      } catch {
        runner.reaskOrWait();
      } finally {
        setThinking(false);
      }
      return;
    }

    // Resolve the @HANDLE tokens the human typed → the exact node ids they pointed at.
    // Grounding set = those typed mentions ∪ the selection chip's ids. These travel with
    // the request so the server grounds the copilot on precisely them.
    const nodesNow = storeApi.getState().nodes;
    const mentionedIds = mergeMentionedIds(resolveMentions(text, nodesNow), contextIds);
    // Labels for history — resolved now, tolerating ids whose node vanished mid-send.
    const context = contextIds.flatMap((id) => {
      const n = nodesNow.find((node) => node.id === id);
      return n ? [nodeLabel(n)] : [];
    });
    // The whole chat window travels with the turn — this is the copilot's memory.
    const history = buildHistory(messages, text);
    setMessages((m) => [
      ...m,
      { role: "user", content: text, ...(context.length ? { context } : {}) },
    ]);
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

      // "open @SHOT-1A2B" → open that node's surface (Composer / focus view) and stop.
      if (action?.name === "open_node") {
        openNode(action.args.handle);
        setThinking(false);
        return;
      }

      // "connect @FILE-… to @VID-…" → wire the edges instantly and stop.
      if (action?.name === "connect_nodes") {
        connectHandles(action.args.from, action.args.to);
        setThinking(false);
        return;
      }

      // A COMPLEX command → route to a playbook run. startPlaybook handles the
      // one-run-at-a-time guard, unanswerable slots, inference, and elicitation.
      if (action?.name === "run_playbook") {
        runner.startPlaybook(action.args.name, action.args.slots);
        setThinking(false);
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

      // CALL 3: a REQUESTED add_node executes INSTANTLY — create the node and open its
      // detail view (blast-radius rule: cheap/reversible structural ops don't gate).
      if (action?.name === "add_node") {
        addNodeAndOpen(action.args);
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

  return {
    messages,
    thinking,
    highlightNode,
    send,
    cancelRun: runner.cancelRun,
    dismissRun: runner.dismissRun,
  };
}
