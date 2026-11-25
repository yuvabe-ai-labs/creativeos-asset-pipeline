// D565 — the image and video models as every screen reads them, built from the catalog. Pure and
// client-safe: the browser builds them from the session's one catalog query, the server from
// getAiCatalog(). Cached per catalog object, so a card asking for its model costs a map lookup.
import type { ClientModelSpec, ParamSpec } from "@/lib/image-gen/types";
import type { VideoGenClientModelSpec } from "@/lib/video-gen/types";
import { DEFAULT_IMAGE_MODEL_ID, DEFAULT_VIDEO_MODEL_ID } from "./default-models";
import { toImageClientSpec, toVideoClientSpec } from "./to-spec";
import type { AiCatalog, AiModel, AiModelStatus } from "./types";

type Spec = { id: string; provider: string; providerLabel: string; params: ParamSpec[] };

export type ModelGroup<S> = { provider: string; label: string; models: S[] };

export type ModelList<S extends Spec> = {
  /** Every model of this kind the catalog holds, draft excluded, in sort order. */
  all: readonly S[];
  get: (id: string | null | undefined) => S | undefined;
  /** For rendering only: the model, or the default's when the id is unknown or missing. */
  specOrDefault: (id: string | null | undefined) => S;
  status: (id: string | null | undefined) => AiModelStatus | null;
  replacedBy: (id: string | null | undefined) => string | null;
  /** Live, or hidden and already the model of the thing asking (`ownModelId`). */
  isOffered: (id: string | null | undefined, ownModelId?: string | null) => boolean;
  /** The offered models grouped by provider label, groups and models in sort order. */
  groups: (ownModelId?: string | null) => ModelGroup<S>[];
  /** D566 — the code's preferred default while it is live, else the first live model. */
  defaultId: string;
  /** `preferredId` while it is live, else `defaultId`. */
  liveOr: (preferredId: string) => string;
};

export type ImageModels = ModelList<ClientModelSpec>;
export type VideoModels = ModelList<VideoGenClientModelSpec>;

function buildList<S extends Spec>(
  catalog: AiCatalog,
  kind: "image" | "video",
  toSpec: (m: AiModel) => S,
  preferredDefault: string,
): ModelList<S> {
  const rows = catalog.models
    .filter((m) => m.kind === kind && m.status !== "draft")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const rowById = new Map(rows.map((m) => [m.id, m]));
  const all = rows.map(toSpec);
  const specById = new Map(all.map((s) => [s.id, s]));
  const status = (id: string | null | undefined) => (id ? rowById.get(id)?.status ?? null : null);
  const isLive = (id: string) => status(id) === "live";
  const firstLive = rows.find((m) => m.status === "live")?.id;
  const defaultId = isLive(preferredDefault)
    ? preferredDefault
    : firstLive ?? (rowById.has(preferredDefault) ? preferredDefault : rows[0]?.id ?? preferredDefault);
  const isOffered = (id: string | null | undefined, ownModelId?: string | null) => {
    const s = status(id);
    return s === "live" || (s === "hidden" && id === ownModelId);
  };
  return {
    all,
    get: (id) => (id ? specById.get(id) : undefined),
    // The gate (ModelCatalogGate) only renders when the default exists, so this never misses.
    specOrDefault: (id) => (id && specById.get(id)) || specById.get(defaultId)!,
    status,
    replacedBy: (id) => (id ? rowById.get(id)?.replacedBy ?? null : null),
    isOffered,
    groups: (ownModelId) => {
      const offered = all.filter((s) => isOffered(s.id, ownModelId));
      const labels: string[] = [];
      for (const s of offered) if (!labels.includes(s.providerLabel)) labels.push(s.providerLabel);
      return labels.map((label) => {
        const models = offered.filter((s) => s.providerLabel === label);
        return { provider: models[0].provider, label, models };
      });
    },
    defaultId,
    liveOr: (preferredId) => (isLive(preferredId) ? preferredId : defaultId),
  };
}

const imageCache = new WeakMap<AiCatalog, ImageModels>();
const videoCache = new WeakMap<AiCatalog, VideoModels>();

export function imageModelsFrom(catalog: AiCatalog): ImageModels {
  let list = imageCache.get(catalog);
  if (!list) {
    list = buildList(catalog, "image", toImageClientSpec, DEFAULT_IMAGE_MODEL_ID);
    imageCache.set(catalog, list);
  }
  return list;
}

export function videoModelsFrom(catalog: AiCatalog): VideoModels {
  let list = videoCache.get(catalog);
  if (!list) {
    list = buildList(catalog, "video", toVideoClientSpec, DEFAULT_VIDEO_MODEL_ID);
    videoCache.set(catalog, list);
  }
  return list;
}

/** Any catalog model's label (text models too), or null: a screen never shows the id instead. */
export function catalogModelLabel(catalog: AiCatalog | undefined, id: string | null | undefined): string | null {
  if (!catalog || !id) return null;
  return catalog.models.find((m) => m.id === id)?.label ?? null;
}

/** A model's params with a default value, as `{ name: default }`. */
export function paramDefaults(params: readonly ParamSpec[]): Record<string, unknown> {
  return Object.fromEntries(
    params
      .filter((p) => p.defaultValue !== null && p.defaultValue !== undefined)
      .map((p) => [p.name, p.defaultValue]),
  );
}

/**
 * Label for a picker chip under its provider's heading: "Veo 3.1 Fast" under "Veo" reads "3.1
 * Fast". The catalog's picker_label overrides it.
 */
export function modelPickerLabel(spec: { label: string; providerLabel: string; pickerLabel?: string }): string {
  if (spec.pickerLabel) return spec.pickerLabel;
  const prefix = `${spec.providerLabel} `;
  return spec.label.startsWith(prefix) ? spec.label.slice(prefix.length) : spec.label;
}

/**
 * D567 — what a retired model moves to: the replacement the catalog names while it is live, else
 * `fallbackId`. The one rule for the browser (withoutRetiredModel) and the server (usableModelId).
 */
export function replacementFor(
  list: Pick<ModelList<Spec>, "status" | "replacedBy">,
  retiredId: string,
  fallbackId: string,
): string {
  const replacement = list.replacedBy(retiredId);
  return replacement && list.status(replacement) === "live" ? replacement : fallbackId;
}

/**
 * D567 — a node saved on a retired model opens on its replacement (when that is live) or the
 * fallback (the default unless given; a composite passes its own), with that model's defaults,
 * and keeps the old id in `retiredModelId` so its focus view can say so. Any other data comes
 * back as the same object, so nothing re-renders or saves.
 */
export function withoutRetiredModel<
  S extends Spec,
  T extends { modelId?: string; params?: Record<string, unknown>; retiredModelId?: string },
>(list: ModelList<S>, data: T, fallbackId: string = list.defaultId): T {
  if (!data.modelId || list.status(data.modelId) !== "retired") return data;
  const next = replacementFor(list, data.modelId, fallbackId);
  return {
    ...data,
    modelId: next,
    params: paramDefaults(list.specOrDefault(next).params),
    retiredModelId: data.modelId,
  };
}
