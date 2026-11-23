// D540 — whether a model may run, decided in one place for every route, the billed image run and
// the Trigger tasks. Pure and client-safe: the adapter maps are passed in.
//   live    — runs
//   hidden  — runs only on the node that already uses it
//   retired — refused, with the replacement the catalog names
//   draft, unknown, no adapter in this build — refused
import type { AiCatalog, AiModel, AiModelKind } from "./types";

export const MODEL_RETIRED_MESSAGE = "This model was retired. Pick another.";
export const MODEL_UNAVAILABLE_MESSAGE = "This model isn't available. Pick another.";
/** A run the model's schema rejects, or one its price can't estimate. Plain copy: log the id. */
export const INVALID_PARAMS_MESSAGE = "These settings aren't valid for this model.";
export const NO_ESTIMATE_MESSAGE = "This model can't be priced for these settings. Pick other settings or another model.";

export type ModelRefusal = {
  ok: false;
  reason: "retired" | "unavailable";
  message: string;
  /** The model offered instead of a retired one. */
  replacedBy: string | null;
};

export type RunOptions = {
  /** The model the node already uses (its stored data.modelId): a hidden model keeps running there. */
  existingNodeModelId?: string | null;
  /** False in a Trigger task: the route checked the status when it reserved the run (D541). */
  checkStatus?: boolean;
};

/** A task's model lookup failed. Final: no retry finds a row or an adapter that isn't there. */
export class ModelUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelUnavailableError";
  }
}

/** A route's model was refused (retired, draft, hidden, unknown, no adapter): a 400 with this message. */
export class ModelRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRefusedError";
  }
}

const unavailable = (): ModelRefusal => ({
  ok: false, reason: "unavailable", message: MODEL_UNAVAILABLE_MESSAGE, replacedBy: null,
});

export function runnableModel<A>(
  catalog: AiCatalog,
  modelId: string,
  opts: RunOptions & { kind: AiModelKind; adapters: Readonly<Record<string, A>> },
): { ok: true; model: AiModel & { providerModelId: string }; adapter: A } | ModelRefusal {
  const model = catalog.models.find((m) => m.id === modelId && m.kind === opts.kind);
  // The id came from the request: never echo it.
  if (!model) return unavailable();
  if (opts.checkStatus !== false) {
    if (model.status === "retired") {
      return { ok: false, reason: "retired", message: MODEL_RETIRED_MESSAGE, replacedBy: model.replacedBy };
    }
    if (model.status === "draft") return unavailable();
    if (model.status === "hidden" && opts.existingNodeModelId !== modelId) return unavailable();
  }
  const adapter = Object.prototype.hasOwnProperty.call(opts.adapters, model.adapterKey)
    ? opts.adapters[model.adapterKey]
    : undefined;
  if (adapter === undefined || !model.providerModelId) {
    // A row this build can't run: migration 0084 not applied, or a row ahead of the code.
    console.error("[ai-models] model can't run in this build", {
      modelId, adapterKey: model.adapterKey, providerModelId: model.providerModelId,
    });
    return unavailable();
  }
  return { ok: true, model: { ...model, providerModelId: model.providerModelId }, adapter };
}

/** The model a node's preview reads: its stored model while it may still run there, else the fallback. */
export function usableModelId(
  catalog: AiCatalog,
  modelId: string,
  opts: { kind: AiModelKind; fallbackId: string },
): string {
  const model = catalog.models.find((m) => m.id === modelId && m.kind === opts.kind);
  return model && (model.status === "live" || model.status === "hidden") ? modelId : opts.fallbackId;
}

/** A node's stored model id (`data.modelId`), or null. */
export function nodeModelId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const id = (data as { modelId?: unknown }).modelId;
  return typeof id === "string" ? id : null;
}
