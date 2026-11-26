import { describe, it, expect } from "vitest";
import { seededModelCatalog, withModel } from "@/lib/ai-models/test-catalog";
import {
  imageModelsFrom, videoModelsFrom, paramDefaults, modelPickerLabel, withoutRetiredModel, replacementFor, catalogModelLabel,
} from "@/lib/ai-models/model-lists";
import { DEFAULT_IMAGE_MODEL_ID, DEFAULT_VIDEO_MODEL_ID } from "@/lib/ai-models/default-models";

const NANO_PRO = "gemini:gemini-3-pro-image";
const SUNBURST = "openai:gpt-image-2.5-sunburst";
const GPT1 = "openai:gpt-image-1"; // retired in the seed, replaced by Sunburst
const SEEDREAM = "seedream:seedream-5-0-lite";
const OMNI12 = "gemini:gemini-omni-1.2-flash";
const OMNI11 = "gemini:gemini-omni-1.1-flash";

describe("imageModelsFrom", () => {
  it("lists every non-draft image model in sort order, and only image models", () => {
    const images = imageModelsFrom(seededModelCatalog());
    const sorted = seededModelCatalog().models
      .filter((m) => m.kind === "image" && m.status !== "draft")
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => m.id);
    expect(images.all.map((m) => m.id)).toEqual(sorted);
    expect(images.get(NANO_PRO)?.label).toBe("Nano Banana Pro");
    expect(images.get(OMNI12)).toBeUndefined();
  });

  it("is the same object for the same catalog, and a new one for a new catalog", () => {
    const catalog = seededModelCatalog();
    expect(imageModelsFrom(catalog)).toBe(imageModelsFrom(catalog));
    expect(imageModelsFrom(withModel(catalog, NANO_PRO, { label: "X" }))).not.toBe(imageModelsFrom(catalog));
  });

  it("reports status and replacement", () => {
    const images = imageModelsFrom(seededModelCatalog());
    expect(images.status(GPT1)).toBe("retired");
    expect(images.replacedBy(GPT1)).toBe(SUNBURST);
    expect(images.status("nope:nope")).toBeNull();
    expect(images.replacedBy(NANO_PRO)).toBeNull();
  });

  it("offers live models, and a hidden model only to its own node", () => {
    const images = imageModelsFrom(withModel(seededModelCatalog(), NANO_PRO, { status: "hidden" }));
    expect(images.isOffered(SUNBURST)).toBe(true);
    expect(images.isOffered(NANO_PRO)).toBe(false);
    expect(images.isOffered(NANO_PRO, NANO_PRO)).toBe(true);
    expect(images.isOffered(GPT1, GPT1)).toBe(false);
    expect(images.isOffered("nope:nope")).toBe(false);
  });

  it("groups the offered models by provider label, in sort order", () => {
    const catalog = withModel(seededModelCatalog(), NANO_PRO, { status: "hidden" });
    const images = imageModelsFrom(catalog);
    const ids = (g: ReturnType<typeof images.groups>) => g.flatMap((x) => x.models.map((m) => m.id));
    expect(ids(images.groups())).not.toContain(NANO_PRO);
    expect(ids(images.groups())).not.toContain(GPT1);
    expect(ids(images.groups(NANO_PRO))).toContain(NANO_PRO);
    expect(images.groups().map((g) => g.label)).toEqual(["OpenAI", "Gemini", "Seedream"]);
    expect(images.groups()[0].provider).toBe("openai");
  });

  it("defaults to the code's preference while it is live, else the first live model", () => {
    expect(imageModelsFrom(seededModelCatalog()).defaultId).toBe(DEFAULT_IMAGE_MODEL_ID);
    const hidden = imageModelsFrom(withModel(seededModelCatalog(), DEFAULT_IMAGE_MODEL_ID, { status: "hidden" }));
    expect(hidden.defaultId).toBe(hidden.groups()[0].models[0].id);
    expect(hidden.liveOr(DEFAULT_IMAGE_MODEL_ID)).toBe(hidden.defaultId);
    expect(hidden.liveOr(SUNBURST)).toBe(SUNBURST);
  });

  it("specOrDefault falls back to the default's spec for an unknown id", () => {
    const images = imageModelsFrom(seededModelCatalog());
    expect(images.specOrDefault("nope:nope").id).toBe(DEFAULT_IMAGE_MODEL_ID);
    expect(images.specOrDefault(undefined).id).toBe(DEFAULT_IMAGE_MODEL_ID);
    expect(images.specOrDefault(SUNBURST).id).toBe(SUNBURST);
  });
});

describe("videoModelsFrom", () => {
  it("lists video models, defaults to Omni 1.2, and labels chips without the provider", () => {
    const videos = videoModelsFrom(seededModelCatalog());
    expect(videos.defaultId).toBe(DEFAULT_VIDEO_MODEL_ID);
    expect(videos.get(OMNI11)?.imageInputs.maxReferenceImages).toBe(12);
    expect(modelPickerLabel(videos.get(OMNI12)!)).toBe("Omni 1.2");
    expect(modelPickerLabel({ label: "Veo 3.1 Fast", providerLabel: "Veo" })).toBe("3.1 Fast");
    expect(modelPickerLabel({ label: "Other", providerLabel: "Veo" })).toBe("Other");
  });
});

describe("paramDefaults", () => {
  it("keeps every param with a default, and none without", () => {
    expect(paramDefaults([
      { name: "a", defaultValue: "x" }, { name: "b", defaultValue: 0 }, { name: "c", defaultValue: null },
    ] as never)).toEqual({ a: "x", b: 0 });
  });
});

describe("withoutRetiredModel", () => {
  const images = imageModelsFrom(seededModelCatalog());

  it("moves a retired model to its live replacement, with its defaults, and remembers the old id", () => {
    const out = withoutRetiredModel(images, { title: "t", modelId: GPT1, params: { quality: "high" } });
    expect(out).toEqual({
      title: "t", modelId: SUNBURST, params: paramDefaults(images.get(SUNBURST)!.params), retiredModelId: GPT1,
    });
  });

  it("uses the default when the replacement is not live", () => {
    const catalog = withModel(seededModelCatalog(), SUNBURST, { status: "hidden" });
    const out = withoutRetiredModel(imageModelsFrom(catalog), { modelId: GPT1 });
    expect(out.modelId).toBe(DEFAULT_IMAGE_MODEL_ID);
  });

  it("uses the fallback given instead of the default when the replacement is not live", () => {
    const catalog = withModel(seededModelCatalog(), SUNBURST, { status: "hidden" });
    const out = withoutRetiredModel(imageModelsFrom(catalog), { modelId: GPT1 }, SEEDREAM);
    expect(out.modelId).toBe(SEEDREAM);
  });

  it("returns the same object for a live, hidden, unknown or missing model", () => {
    const hidden = imageModelsFrom(withModel(seededModelCatalog(), NANO_PRO, { status: "hidden" }));
    for (const data of [{ modelId: SUNBURST }, { modelId: "nope:nope" }, {}]) {
      expect(withoutRetiredModel(images, data)).toBe(data);
    }
    const onHidden = { modelId: NANO_PRO };
    expect(withoutRetiredModel(hidden, onHidden)).toBe(onHidden);
  });
});

describe("replacementFor", () => {
  it("is the retired model's replacement while it is live, else the fallback", () => {
    const images = imageModelsFrom(seededModelCatalog());
    expect(replacementFor(images, GPT1, NANO_PRO)).toBe(SUNBURST);
    const hidden = imageModelsFrom(withModel(seededModelCatalog(), SUNBURST, { status: "hidden" }));
    expect(replacementFor(hidden, GPT1, NANO_PRO)).toBe(NANO_PRO);
    expect(replacementFor(images, "nope:nope", NANO_PRO)).toBe(NANO_PRO);
  });
});

describe("catalogModelLabel", () => {
  it("is the label of any model the catalog holds (a text model too), else null: never the id", () => {
    const catalog = seededModelCatalog();
    expect(catalogModelLabel(catalog, "openai:gpt-5")).toBe(catalog.models.find((m) => m.id === "openai:gpt-5")!.label);
    expect(catalogModelLabel(catalog, "gpt-5.4-mini")).toBeNull();
    expect(catalogModelLabel(undefined, "openai:gpt-5")).toBeNull();
    expect(catalogModelLabel(catalog, null)).toBeNull();
  });
});
