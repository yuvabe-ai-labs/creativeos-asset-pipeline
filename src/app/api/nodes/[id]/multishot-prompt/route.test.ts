import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MultishotPlan } from "@/lib/nodes/multishot-plan";
import {
  multishotPromptGenerate,
  MULTISHOT_LOOK_SCHEMA,
  MULTISHOT_BEAT_SCHEMA,
} from "@/prompts/multishot-prompt-generate";
import {
  KLING_OMNI_MODEL_ID,
  GEMINI_OMNI_MODEL_ID,
  SEEDANCE_MODEL_ID,
} from "@/lib/video-gen/client-models";

vi.mock("server-only", () => ({}));

const CUTS = [
  { id: "c1", text: "keys", seconds: 2 },
  { id: "c2", text: "cab", seconds: 2 },
];
const PLAN: MultishotPlan = {
  version: 1,
  look: "Warm low sun from camera-left.",
  beats: [
    { cutId: "c1", text: "Tight on a hand lifting keys." },
    { cutId: "c2", text: "A cab door swings open." },
  ],
};

// withNode hands the handler (nodeId, node, caller, clientId, orgId) once auth has passed.
vi.mock("@/lib/api/route-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/route-helpers")>(
    "@/lib/api/route-helpers",
  );
  return {
    ...actual,
    withNode: (
      req: Request,
      _params: unknown,
      fn: (
        nodeId: string,
        node: unknown,
        caller: { userId: string; email: string },
        clientId: string,
        orgId: string,
      ) => Promise<Response>,
    ) => fn("node-1", {}, { userId: "u1", email: "u@x.com" }, "client-1", "org-1"),
  };
});

vi.mock("@/lib/nodes/resolve-inputs", () => ({
  resolveMultishotPromptInputs: vi.fn(async () => ({
    clientContext: "",
    kbVersionId: null,
    slices: [],
    upstream: [],
    cuts: CUTS,
    targetModel: undefined,
  })),
  buildMultishotUserTurn: vi.fn(() => "USER TURN"),
}));

vi.mock("@/lib/db/versions", () => ({ insertVersion: vi.fn(async () => ({ id: "v1" })) }));

// runPromptGeneration owns reserve -> call -> settle -> version. The tests care about what the
// route hands it, so it runs `call()` and reports back.
const runPromptGeneration = vi.fn(
  async (args: { call: () => Promise<{ output: unknown }>; paramsUsed: Record<string, unknown> }) => {
    const { output } = await args.call();
    return { output, versionId: "v1" };
  },
);
vi.mock("@/lib/api/prompt-run", () => ({
  runPromptGeneration: (a: never) => runPromptGeneration(a),
  CreditLimitError: class extends Error {},
}));

const create = vi.fn();
vi.mock("@/lib/openai/server", () => ({ createOpenAI: () => ({ chat: { completions: { create } } }) }));

import { POST } from "./route";
import { resolveMultishotPromptInputs } from "@/lib/nodes/resolve-inputs";

const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "node-1" }),
  });

const returns = (obj: unknown) =>
  create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(obj) } }], usage: null });

// messages[1].content goes through buildUserContent — a plain string when there are no vision
// attachments (always true here, since resolveMultishotPromptInputs is mocked with upstream: []),
// but asserting against the actual shape rather than assuming it keeps this honest if that mock
// ever grows an image.
function userText(call: { messages: Array<{ role: string; content: unknown }> }): string {
  const content = call.messages[1].content;
  if (typeof content === "string") return content;
  return (content as Array<{ type: string; text?: string }>)
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("\n");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST multishot-prompt — refine scopes", () => {
  it("400s a cut refine with no cutId", async () => {
    const res = await post({ scope: "cut", plan: PLAN });
    expect(res.status).toBe(400);
  });

  it("400s a cut refine naming a shot that is not on the node", async () => {
    const res = await post({ scope: "cut", cutId: "nope", plan: PLAN });
    expect(res.status).toBe(400);
  });

  it("400s a scoped refine with no plan to refine", async () => {
    const res = await post({ scope: "look" });
    expect(res.status).toBe(400);
  });

  it("400s a note over the cap", async () => {
    const res = await post({ scope: "look", plan: PLAN, note: "x".repeat(2001) });
    expect(res.status).toBe(400);
  });

  // The narrow schema plus the server-side merge: the model returns ONE beat's text, and the
  // beats it was never asked about come back exactly as they were sent.
  it("merges a cut refine and leaves the other beats identical", async () => {
    returns({ text: "A palm sweeps the keys off oak." });
    const res = await post({ scope: "cut", cutId: "c1", plan: PLAN, note: "tighter" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { plan: MultishotPlan };
    expect(json.plan.beats[0].text).toBe("A palm sweeps the keys off oak.");
    expect(json.plan.beats[1].text).toBe(PLAN.beats[1].text);
    expect(json.plan.look).toBe(PLAN.look);
  });

  it("merges a look refine and leaves every beat identical", async () => {
    returns({ look: "Overcast, flat and soft." });
    const res = await post({ scope: "look", plan: PLAN });
    const json = (await res.json()) as { plan: MultishotPlan };
    expect(json.plan.look).toBe("Overcast, flat and soft.");
    expect(json.plan.beats).toEqual(PLAN.beats);
  });

  // A version that cannot say what was asked of it is useless to the eval flywheel (D22).
  it("records the scope, the shot and the note on the version", async () => {
    returns({ text: "Rewritten." });
    await post({ scope: "cut", cutId: "c2", plan: PLAN, note: "slower" });
    expect(runPromptGeneration.mock.calls[0][0].paramsUsed).toMatchObject({
      scope: "cut",
      cutId: "c2",
      note: "slower",
    });
  });

  it("422s a merged plan that fails validation", async () => {
    returns({ text: "   " }); // empty after trim
    const res = await post({ scope: "cut", cutId: "c1", plan: PLAN });
    expect(res.status).toBe(422);
  });

  it("defaults to a full generate when no scope is given", async () => {
    returns(PLAN);
    const res = await post({ instruction: "punchy" });
    expect(res.status).toBe(200);
    expect(runPromptGeneration.mock.calls[0][0].paramsUsed).toMatchObject({ scope: "all" });
    const json = (await res.json()) as { plan: MultishotPlan };
    // D236 — a whole-sequence generate STAMPS the writer's model onto the plan it returns, so the
    // response is the model's plan plus that one field. Everything downstream (renderPlan's
    // format, refsCitedIn's dialect, video-generate's model guard) reads the stamp instead of the
    // Multishot node's current `targetModel`, which the operator can flip at any time.
    expect(json.plan).toEqual({ ...PLAN, targetModel: GEMINI_OMNI_MODEL_ID });
  });

  // Nothing previously inspected what the route actually sent the model — which is why the
  // Critical (scope "all" silently dropping the operator's note) shipped through per-task review.
  describe("what gets sent to the model", () => {
    it("sends the beat schema for a cut refine", async () => {
      returns({ text: "Rewritten." });
      await post({ scope: "cut", cutId: "c1", plan: PLAN, note: "tighter" });
      expect(create.mock.calls[0][0].response_format.json_schema.schema).toBe(MULTISHOT_BEAT_SCHEMA);
    });

    it("sends the look schema for a look refine", async () => {
      returns({ look: "Overcast." });
      await post({ scope: "look", plan: PLAN, note: "colder" });
      expect(create.mock.calls[0][0].response_format.json_schema.schema).toBe(MULTISHOT_LOOK_SCHEMA);
    });

    it("sends the full plan schema for a full generate", async () => {
      returns(PLAN);
      await post({ scope: "all", note: "punchier" });
      expect(create.mock.calls[0][0].response_format.json_schema.schema).toBe(
        multishotPromptGenerate().schema,
      );
    });

    // Regression test for the Critical: refineInstruction used to return "" unconditionally for
    // scope "all", so the header's whole-sequence note was validated, capped and recorded on the
    // version row, but never put in front of the model — it billed a plain regenerate while the
    // version claimed a steer was applied. Asserted for all three scopes so no scope can regress
    // the same way silently again.
    it("puts the note in the user content on a cut refine", async () => {
      returns({ text: "Rewritten." });
      await post({ scope: "cut", cutId: "c1", plan: PLAN, note: "make it tighter" });
      expect(userText(create.mock.calls[0][0])).toContain("make it tighter");
    });

    it("puts the note in the user content on a look refine", async () => {
      returns({ look: "Overcast." });
      await post({ scope: "look", plan: PLAN, note: "colder light" });
      expect(userText(create.mock.calls[0][0])).toContain("colder light");
    });

    it("puts the note in the user content on a full generate", async () => {
      returns(PLAN);
      await post({ scope: "all", note: "punchier overall" });
      expect(userText(create.mock.calls[0][0])).toContain("punchier overall");
    });
  });
});

// D236 — which writer a Multishot node's target model gets, and that the choice is recorded on
// the version row. The plan schema itself does not vary (D238), so these only check the system
// prompt sent and the promptId recorded, not the shape of the returned plan.
describe("POST multishot-prompt — per-model writer routing", () => {
  it("writes with Kling's prompt when the Multishot node targets Kling", async () => {
    vi.mocked(resolveMultishotPromptInputs).mockResolvedValueOnce({
      clientContext: "",
      kbVersionId: null,
      slices: [],
      upstream: [],
      cuts: CUTS,
      targetModel: KLING_OMNI_MODEL_ID,
    });
    returns(PLAN);
    const res = await post({ instruction: "punchy" });
    expect(res.status).toBe(200);
    const systemSent = create.mock.calls[0][0].messages[0].content;
    expect(systemSent).toContain("Kling 3.0 Omni");
    expect(systemSent).toContain("512 CHARACTERS");
  });

  // D236 — the third writer, keyed on the same capability id as the other two branches.
  it("writes with Seedance's prompt when the Multishot node targets Seedance", async () => {
    vi.mocked(resolveMultishotPromptInputs).mockResolvedValueOnce({
      clientContext: "",
      kbVersionId: null,
      slices: [],
      upstream: [],
      cuts: CUTS,
      targetModel: SEEDANCE_MODEL_ID,
    });
    returns(PLAN);
    const res = await post({ instruction: "punchy" });
    expect(res.status).toBe(200);
    const systemSent = create.mock.calls[0][0].messages[0].content;
    expect(systemSent).toContain("Seedance");
    expect(systemSent).not.toContain("512 CHARACTERS");
  });

  it("writes with Omni's prompt when targetModel is absent", async () => {
    returns(PLAN);
    const res = await post({ instruction: "punchy" });
    expect(res.status).toBe(200);
    const systemSent = create.mock.calls[0][0].messages[0].content;
    expect(systemSent).not.toContain("Kling 3.0 Omni");
  });

  it("records which model the plan was written for", async () => {
    vi.mocked(resolveMultishotPromptInputs).mockResolvedValueOnce({
      clientContext: "",
      kbVersionId: null,
      slices: [],
      upstream: [],
      cuts: CUTS,
      targetModel: KLING_OMNI_MODEL_ID,
    });
    returns(PLAN);
    await post({ instruction: "punchy" });
    expect(runPromptGeneration.mock.calls[0][0].paramsUsed).toMatchObject({
      promptId: "multishot-prompt-kling@1",
      targetModel: KLING_OMNI_MODEL_ID,
    });
  });

  // D236 — the version row already recorded the model (the test above), but the PLAN did not, and
  // the plan is what every downstream hop actually reads. A version row nobody consults at
  // generate time is provenance, not a contract.
  it("stamps the writer's model onto the plan that becomes the version's output", async () => {
    vi.mocked(resolveMultishotPromptInputs).mockResolvedValueOnce({
      clientContext: "",
      kbVersionId: null,
      slices: [],
      upstream: [],
      cuts: CUTS,
      targetModel: KLING_OMNI_MODEL_ID,
    });
    returns(PLAN);
    const res = await post({ instruction: "punchy" });
    const json = (await res.json()) as { plan: MultishotPlan; prompt: string };
    expect(json.plan.targetModel).toBe(KLING_OMNI_MODEL_ID);
    // And the returned preview is rendered against that stamp — Kling's triples, not Omni's ladder.
    expect(json.prompt).toContain("shot 1, ");
  });

  // A narrow refine rewrites ONE fragment and leaves every other beat as the original writer left
  // it, so it must NOT restamp: doing so would relabel a plan that is still mostly the other
  // model's, which is the silent reinterpretation the stamp exists to prevent. D239's way out of a
  // mismatch is a regenerate — and a regenerate is scope "all".
  it("does not restamp on a narrow refine — the original stamp survives", async () => {
    vi.mocked(resolveMultishotPromptInputs).mockResolvedValueOnce({
      clientContext: "",
      kbVersionId: null,
      slices: [],
      upstream: [],
      cuts: CUTS,
      // The node has since been switched to Kling…
      targetModel: KLING_OMNI_MODEL_ID,
    });
    returns({ look: "Overcast, flat and soft." });
    // …but this plan was written by Omni's writer.
    const omniPlan: MultishotPlan = { ...PLAN, targetModel: GEMINI_OMNI_MODEL_ID };
    const res = await post({ scope: "look", plan: omniPlan });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { plan: MultishotPlan; prompt: string };
    expect(json.plan.look).toBe("Overcast, flat and soft.");
    expect(json.plan.targetModel).toBe(GEMINI_OMNI_MODEL_ID);
    expect(json.prompt).toContain("[0-");
    expect(json.prompt).not.toContain("shot 1, ");
  });
});
