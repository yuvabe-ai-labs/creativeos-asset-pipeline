import { describe, it, expect, vi } from "vitest";
import {
  runnableModel, usableModelId, nodeModelId, MODEL_RETIRED_MESSAGE, MODEL_UNAVAILABLE_MESSAGE, type RunOptions,
  ModelUnavailableError, ModelRefusedError,
} from "../runnable";
import { seededModelCatalog, withModel } from "../test-catalog";
import type { AiCatalog } from "../types";

const GPT2 = "openai:gpt-image-2";
const ADAPTERS = { "image:gpt-image-2": "gpt-2-adapter", "image:gpt-image-1": "gpt-1-adapter" };
const run = (catalog: AiCatalog, id = GPT2, opts: RunOptions = {}) =>
  runnableModel(catalog, id, { ...opts, kind: "image", adapters: ADAPTERS });

describe("runnableModel (D563)", () => {
  it("runs a live model with its adapter and the provider's model name", () => {
    const r = run(seededModelCatalog());
    expect(r.ok && r.adapter).toBe("gpt-2-adapter");
    expect(r.ok && r.model.providerModelId).toBe("gpt-image-2");
  });

  it("runs a hidden model only on the node that already uses it", () => {
    const catalog = withModel(seededModelCatalog(), GPT2, { status: "hidden" });
    expect(run(catalog)).toMatchObject({ ok: false, reason: "unavailable", message: MODEL_UNAVAILABLE_MESSAGE });
    expect(run(catalog, GPT2, { existingNodeModelId: "gemini:gemini-3-pro-image" }).ok).toBe(false);
    expect(run(catalog, GPT2, { existingNodeModelId: GPT2 }).ok).toBe(true);
  });

  it("refuses a retired model and offers its replacement", () => {
    expect(run(seededModelCatalog(), "openai:gpt-image-1")).toEqual({
      ok: false, reason: "retired", message: MODEL_RETIRED_MESSAGE, replacedBy: "openai:gpt-image-2.5-sunburst",
    });
  });

  it("refuses a draft, even on a node that uses it", () => {
    const catalog = withModel(seededModelCatalog(), GPT2, { status: "draft" });
    expect(run(catalog, GPT2, { existingNodeModelId: GPT2 })).toMatchObject({ ok: false, reason: "unavailable" });
  });

  it("refuses an unknown id, or one of another kind, without naming it", () => {
    const unknown = run(seededModelCatalog(), "openai:gpt-image-9");
    expect(unknown).toMatchObject({ ok: false, reason: "unavailable" });
    expect(!unknown.ok && unknown.message).not.toContain("gpt-image-9");
    expect(run(seededModelCatalog(), "gemini:gemini-omni-1.2-flash").ok).toBe(false);
  });

  it("refuses a model whose adapter is not in this build, or that has no provider model name, and logs it", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(run(seededModelCatalog(), "openai:gpt-image-1-mini")).toMatchObject({ ok: false, reason: "unavailable" });
    expect(run(withModel(seededModelCatalog(), GPT2, { providerModelId: null })).ok).toBe(false);
    expect(err).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });

  it("refuses an empty provider model name, the same as a missing one", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(run(withModel(seededModelCatalog(), GPT2, { providerModelId: "" }))).toEqual({
      ok: false, reason: "unavailable", message: MODEL_UNAVAILABLE_MESSAGE, replacedBy: null,
    });
    expect(run(withModel(seededModelCatalog(), GPT2, { providerModelId: null }))).toEqual({
      ok: false, reason: "unavailable", message: MODEL_UNAVAILABLE_MESSAGE, replacedBy: null,
    });
    expect(err).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });

  it("skips the status check when the route already made it (a Trigger task)", () => {
    const r = run(seededModelCatalog(), "openai:gpt-image-1", { checkStatus: false });
    expect(r.ok && r.adapter).toBe("gpt-1-adapter");
  });
});

describe("usableModelId", () => {
  const opts = { kind: "video" as const, fallbackId: "gemini:gemini-omni-1.2-flash" };
  it("keeps a live or hidden model and falls back from a retired, draft or unknown one", () => {
    const catalog = withModel(seededModelCatalog(), "kling:kling-o1", { status: "hidden" });
    expect(usableModelId(catalog, "kling:kling-3-0", opts)).toBe("kling:kling-3-0");
    expect(usableModelId(catalog, "kling:kling-o1", opts)).toBe("kling:kling-o1");
    expect(usableModelId(catalog, "veo:veo-3.1", opts)).toBe(opts.fallbackId);
    expect(usableModelId(catalog, "", opts)).toBe(opts.fallbackId);
  });

  it("moves a retired model to its live replacement, as the browser opens the node (D567)", () => {
    let catalog = withModel(seededModelCatalog(), "veo:veo-3.1", { status: "retired", replacedBy: "seedance:seedance-2-5" });
    expect(usableModelId(catalog, "veo:veo-3.1", opts)).toBe("seedance:seedance-2-5");
    catalog = withModel(catalog, "seedance:seedance-2-5", { status: "hidden" });
    expect(usableModelId(catalog, "veo:veo-3.1", opts)).toBe(opts.fallbackId);
  });
});

describe("nodeModelId", () => {
  it("reads a node's stored model id, and nothing else", () => {
    expect(nodeModelId({ modelId: "kling:kling-3-0" })).toBe("kling:kling-3-0");
    expect(nodeModelId({ modelId: 3 })).toBeNull();
    expect(nodeModelId(null)).toBeNull();
    expect(nodeModelId(undefined)).toBeNull();
  });
});

describe("the refusal errors", () => {
  it("name themselves and carry the plain copy", () => {
    const unavailable = new ModelUnavailableError(MODEL_UNAVAILABLE_MESSAGE);
    expect(unavailable.name).toBe("ModelUnavailableError");
    expect(unavailable.message).toBe(MODEL_UNAVAILABLE_MESSAGE);
    const refused = new ModelRefusedError(MODEL_RETIRED_MESSAGE);
    expect(refused).toBeInstanceOf(Error);
    expect(refused.name).toBe("ModelRefusedError");
    expect(refused.message).toBe(MODEL_RETIRED_MESSAGE);
  });
});
