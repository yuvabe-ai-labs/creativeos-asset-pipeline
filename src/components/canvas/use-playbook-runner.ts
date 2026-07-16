import { useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import { useCanvasStore, useCanvasStoreApi } from "./canvas-store-provider";
import { PLAYBOOKS, type RunContext, type SlotSpec, type SlotValue } from "@/lib/copilot/playbooks";
import {
  applyInference,
  missingSlots,
  nextAction,
  resolveSlotReply,
  type PlaybookRun,
} from "@/lib/copilot/runner";
import { planConnections, resolveNodeTarget } from "@/lib/copilot/actions";

const LIVE = new Set<PlaybookRun["status"]>(["eliciting", "running", "waiting-human"]);

// The playbook runner's impure shell (runner spec §2.3): recipes over the store's
// existing verbs, the advance loop, and the level-triggered "eyes" (P6). The chat
// hook injects `say` so run narration lands in the transcript; the checkpoint
// itself lives in the canvas store (survives the panel closing).
export function usePlaybookRunner(say: (text: string) => void) {
  const storeApi = useCanvasStoreApi();
  const { setCenter } = useReactFlow();
  // Reactive read of ONLY the status — re-arms the subscription effect on pause/resume.
  const runStatus = useCanvasStore((s) => s.playbookRun?.status);

  // The step context: run snapshot + injected effects. `created` is the tick loop's
  // mutable local; steps write into it via remember().
  function makeCtx(
    slots: Record<string, SlotValue>,
    created: Record<string, string>,
  ): RunContext {
    const state = () => storeApi.getState();
    return {
      slots,
      created,
      remember: (k, id) => {
        created[k] = id;
      },
      resolve: (handle) => resolveNodeTarget(state().nodes, handle),
      node: (id) => state().nodes.find((x) => x.id === id) ?? null,
      recipes: {
        createNode: (type, position, title) => {
          const id = crypto.randomUUID();
          state().addNode(type, position, id);
          if (title) state().updateNodeData(id, { title });
          return id;
        },
        connect: (fromHandles, toHandle) => {
          const s = state();
          const plan = planConnections(fromHandles, toHandle, s.nodes);
          if (!plan.target) return { wired: [], rejected: [], unknown: fromHandles };
          plan.wired.forEach((w) => s.connectNodes(w.sourceId, plan.target!.id));
          return {
            wired: plan.wired.map((w) => w.handle),
            rejected: plan.rejected.map((r) => r.handle),
            unknown: plan.unknown,
          };
        },
        open: (id) => {
          const node = state().nodes.find((x) => x.id === id);
          if (node)
            setCenter(node.position.x + 120, node.position.y + 60, { zoom: 1, duration: 500 });
          state().setFocusedNodeId(id);
        },
      },
    };
  }

  // The advance loop (spec §2.3): run copilot steps until a human step or the end.
  // Deliberately synchronous — every recipe is a synchronous store write.
  function tick(start: PlaybookRun) {
    const playbook = PLAYBOOKS[start.playbook];
    if (!playbook) return;
    let stepIndex = start.stepIndex;
    const created = { ...start.created };
    const log = [...start.log];
    const publish = (status: PlaybookRun["status"]) =>
      storeApi
        .getState()
        .setPlaybookRun({ ...start, stepIndex, created, log, status, askingSlot: undefined });

    for (;;) {
      const act = nextAction(playbook, { ...start, stepIndex, created, log });
      if (act.kind === "done") {
        publish("done");
        say(`✓ ${start.title} — done.`);
        return;
      }
      if (act.kind === "wait-human") {
        publish("waiting-human");
        say(act.step.instruction);
        return;
      }
      try {
        log.push(act.step.run(makeCtx(start.slots, created)));
        stepIndex += 1;
      } catch (e) {
        publish("cancelled");
        say(
          `I had to stop at "${act.step.label}": ` +
            `${e instanceof Error ? e.message : "something went wrong."} ` +
            `Anything I already created stays on the canvas.`,
        );
        return;
      }
    }
  }

  // The eyes (P6): active ONLY while waiting-human. The subscription is the wake-up
  // (edge); the predicate over CURRENT state is the decision (level). Missed or
  // duplicate wake-ups are harmless: advance re-checks status first (idempotent),
  // and the immediate check() catches the pre-completed step.
  useEffect(() => {
    if (runStatus !== "waiting-human") return;
    const check = () => {
      const state = storeApi.getState();
      const run = state.playbookRun;
      if (!run || run.status !== "waiting-human") return;
      const playbook = PLAYBOOKS[run.playbook];
      const step = playbook?.steps[run.stepIndex];
      if (!step || step.actor !== "human") return;
      const watched = step.watchId(run);
      if (watched && !state.nodes.some((n) => n.id === watched)) {
        state.patchPlaybookRun({ status: "cancelled" });
        say(`The node I was waiting on was deleted — cancelled "${run.title}".`);
        return;
      }
      if (step.done({ nodes: state.nodes, edges: state.edges }, run)) {
        say(`✓ ${step.label} — moving on.`);
        tick({
          ...run,
          status: "running",
          stepIndex: run.stepIndex + 1,
          log: [...run.log, step.label],
        });
      }
    };
    check(); // level-triggered: the predicate may ALREADY be true on arrival
    return storeApi.subscribe(check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runStatus]);

  // Route resolution → a run. Checks one-at-a-time, unanswerable slots, inference,
  // then either starts running or starts eliciting (spec §2.2).
  function startPlaybook(name: string, rawSlots: Record<string, SlotValue>) {
    const playbook = PLAYBOOKS[name];
    if (!playbook) return;
    const state = storeApi.getState();
    if (state.playbookRun && LIVE.has(state.playbookRun.status)) {
      say(
        `I'm mid-run on "${state.playbookRun.title}". Finish it, or say "cancel" ` +
          `(or hit ✕ on the card) to stop it first.`,
      );
      return;
    }
    const snap = { nodes: state.nodes, edges: state.edges };
    const slots = applyInference(playbook, rawSlots, snap);
    for (const spec of missingSlots(playbook, slots)) {
      const why = spec.unanswerable?.(snap);
      if (why) {
        say(why);
        return;
      }
    }
    const missing = missingSlots(playbook, slots);
    const base: PlaybookRun = {
      playbook: name,
      title: playbook.title(slots),
      slots,
      created: {},
      stepIndex: 0,
      status: "running",
      log: [],
    };
    if (missing.length > 0) {
      state.setPlaybookRun({ ...base, status: "eliciting", askingSlot: missing[0].key });
      say(missing[0].ask);
      return;
    }
    state.setPlaybookRun(base);
    tick(base);
  }

  // Client-first elicitation (spec §2.2): @-mentions / "none" fill with zero model
  // calls; { kind: "model" } tells the chat hook to run the actions-route fallback.
  function answerWithText(
    text: string,
  ): { kind: "filled" } | { kind: "model"; slot: SlotSpec } | { kind: "no-run" } {
    const state = storeApi.getState();
    const run = state.playbookRun;
    if (!run || run.status !== "eliciting" || !run.askingSlot) return { kind: "no-run" };
    const spec = PLAYBOOKS[run.playbook]?.slots.find((s) => s.key === run.askingSlot);
    if (!spec) return { kind: "no-run" };
    const res = resolveSlotReply(text, spec, state.nodes);
    if (res.kind === "model") return { kind: "model", slot: spec };
    fillSlot(spec.key, res.value);
    return { kind: "filled" };
  }

  // Fill one slot, then continue framing: ask the next missing slot, or start.
  function fillSlot(key: string, value: SlotValue) {
    const state = storeApi.getState();
    const run = state.playbookRun;
    if (!run || run.status !== "eliciting") return;
    const playbook = PLAYBOOKS[run.playbook];
    if (!playbook) return;
    const slots = { ...run.slots, [key]: value };
    const missing = missingSlots(playbook, slots);
    if (missing.length > 0) {
      state.setPlaybookRun({
        ...run,
        slots,
        title: playbook.title(slots),
        askingSlot: missing[0].key,
        reasked: false,
      });
      say(missing[0].ask);
      return;
    }
    const started: PlaybookRun = {
      ...run,
      slots,
      title: playbook.title(slots),
      status: "running",
      askingSlot: undefined,
    };
    state.setPlaybookRun(started);
    tick(started);
  }

  // Unresolvable reply: re-ask ONCE with the format hint, then keep waiting (spec §4).
  function reaskOrWait() {
    const state = storeApi.getState();
    const run = state.playbookRun;
    if (!run || run.status !== "eliciting" || !run.askingSlot) return;
    const spec = PLAYBOOKS[run.playbook]?.slots.find((s) => s.key === run.askingSlot);
    if (!spec) return;
    if (!run.reasked) {
      state.patchPlaybookRun({ reasked: true });
      say(`I couldn't spot a node in that. ${spec.ask}`);
    } else {
      say(`Still waiting on this one — ${spec.ask} (or say "cancel").`);
    }
  }

  // Cancel keeps created nodes — they're real work; delete is one click (spec §2.3).
  function cancelRun() {
    const state = storeApi.getState();
    const run = state.playbookRun;
    if (!run || !LIVE.has(run.status)) return;
    state.patchPlaybookRun({ status: "cancelled" });
    say(`Cancelled "${run.title}". Anything I already created stays on the canvas.`);
  }

  // Clear a finished/cancelled card from the panel.
  function dismissRun() {
    const run = storeApi.getState().playbookRun;
    if (run && !LIVE.has(run.status)) storeApi.getState().setPlaybookRun(null);
  }

  return { startPlaybook, answerWithText, fillSlot, reaskOrWait, cancelRun, dismissRun };
}
