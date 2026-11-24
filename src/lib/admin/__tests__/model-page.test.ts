import { describe, expect, it } from "vitest";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import type { AiModel } from "@/lib/ai-models/types";
import {
  STATUS_HELP,
  monthSummary,
  moveInOrder,
  ordinal,
  pickerOrder,
  settingsPeoplePick,
  statusChange,
  statusPatch,
  type PickerModel,
} from "../model-page";

const catalog = seededModelCatalog();
const model = (id: string): AiModel => {
  const m = catalog.models.find((x) => x.id === id);
  if (!m) throw new Error(`no seeded model ${id}`);
  return m;
};
const OMNI11 = "gemini:gemini-omni-1.1-flash";
const picker: PickerModel[] = catalog.models
  .filter((m) => m.kind === "video")
  .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
  .map((m) => ({ id: m.id, label: m.label, kind: m.kind, status: m.status, broken: false }));

describe("ordinal", () => {
  it("writes 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 22nd", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "103rd"]);
  });
});

describe("pickerOrder", () => {
  it("lists the models of the same kind in picker order and says where this one sits", () => {
    const o = pickerOrder(picker, OMNI11);
    expect(o.items.map((i) => i.id)).toEqual(picker.map((p) => p.id));
    expect(o.position).toBe(picker.findIndex((p) => p.id === OMNI11) + 1);
    expect(o.text).toBe(`${ordinal(o.position)} of ${picker.length} in the picker`);
    expect(o.title).toBe("Order in the video picker");
  });

  it("ignores models of other kinds and names each kind's picker in plain words", () => {
    const mixed = [...picker, { id: "sarvam:dub", label: "Dub", kind: "dub", status: "live", broken: false }];
    expect(pickerOrder(mixed, "sarvam:dub")).toMatchObject({ position: 1, title: "Order in the dubbing picker" });
    expect(pickerOrder(mixed, OMNI11).items).toHaveLength(picker.length);
  });

  it("marks models that aren't live (and broken ones) next to their names", () => {
    const o = pickerOrder([...picker, { id: "x:broken", label: "Broken", kind: "video", status: "live", broken: true }], OMNI11);
    expect(o.items.find((i) => i.id === "veo:veo-3.1")?.note).toBe("Retired");
    expect(o.items.find((i) => i.id === OMNI11)?.note).toBeNull();
    expect(o.items.find((i) => i.id === "x:broken")?.note).toBe("Fails its check");
  });
});

describe("moveInOrder", () => {
  it("swaps with the neighbour, and gives null past either end", () => {
    expect(moveInOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInOrder(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
    expect(moveInOrder(["a", "b", "c"], "a", -1)).toBeNull();
    expect(moveInOrder(["a", "b", "c"], "c", 1)).toBeNull();
    expect(moveInOrder(["a", "b", "c"], "z", 1)).toBeNull();
  });
});

describe("statusChange", () => {
  const base = {
    label: "Gemini Omni 1.1 Flash",
    kind: "video",
    from: "live",
    to: "hidden",
    savedReplacement: null,
    replacement: null,
    otherLive: 3,
    hasPrice: true,
    canGoLive: true,
    runsThisMonth: 174,
  };

  it("says what hiding does, with this month's runs, and can be saved", () => {
    expect(statusChange(base)).toEqual({
      heading: "Live → Hidden.",
      text: "174 runs this month; nodes already using it keep working.",
      blocked: false,
      needsReplacement: false,
      canSave: true,
    });
    expect(statusChange({ ...base, runsThisMonth: 0 }).text).toBe("Nodes already using it keep working.");
  });

  it("refuses to take the last live image or video model out of the picker", () => {
    const c = statusChange({ ...base, otherLive: 0 });
    expect(c.blocked).toBe(true);
    expect(c.canSave).toBe(false);
    expect(c.text).toBe("Gemini Omni 1.1 Flash is the only live video model. Make another one live first, or agencies lose this step altogether.");
    // The server only guards image and video (D546); other kinds can go.
    expect(statusChange({ ...base, kind: "dub", otherLive: 0 }).blocked).toBe(false);
  });

  it("refuses to go live without the code to run it, or without a price", () => {
    const noCode = statusChange({ ...base, from: "draft", to: "live", canGoLive: false });
    expect(noCode).toMatchObject({ blocked: true, canSave: false });
    expect(noCode.text).toBe("This build has no code to run this model, so it can't go live.");
    const noPrice = statusChange({ ...base, from: "draft", to: "live", hasPrice: false });
    expect(noPrice).toMatchObject({ blocked: true, canSave: false });
    expect(noPrice.text).toBe("Add a price first. A live model without a price would run for free.");
  });

  it("asks for a replacement before a model can be retired", () => {
    const c = statusChange({ ...base, to: "retired" });
    expect(c).toMatchObject({ needsReplacement: true, canSave: false, heading: "Live → Retired." });
    expect(c.text).toBe("174 runs this month. Nodes using it switch to the replacement.");
    expect(statusChange({ ...base, to: "retired", replacement: "kling:kling-3-0" }).canSave).toBe(true);
  });

  it("lets a retired model get or change its replacement without changing status", () => {
    const c = statusChange({ ...base, from: "retired", to: "retired", replacement: "kling:kling-3-0" });
    expect(c).toMatchObject({ heading: null, needsReplacement: true, canSave: true });
    expect(statusChange({ ...base, from: "retired", to: "retired", savedReplacement: "kling:kling-3-0", replacement: "kling:kling-3-0" }).canSave).toBe(false);
  });

  it("uses the status's own help for draft and live", () => {
    expect(statusChange({ ...base, to: "draft" }).text).toBe(STATUS_HELP.draft);
    expect(statusChange({ ...base, from: "hidden", to: "live" }).text).toBe(STATUS_HELP.live);
  });
});

describe("statusPatch", () => {
  it("writes the replacement only for a retired model", () => {
    expect(statusPatch("hidden", "x")).toEqual({ status: "hidden" });
    expect(statusPatch("retired", "kling:kling-3-0")).toEqual({ status: "retired", replaced_by: "kling:kling-3-0" });
  });
});

describe("settingsPeoplePick", () => {
  it("lists the settings people see, with their options and default, in plain words", () => {
    const rows = settingsPeoplePick(model("kling:kling-3-0").params);
    expect(rows.map((r) => r.label)).toEqual(["Resolution", "Length", "Audio", "Negative prompt"].filter((l) => l !== "Negative prompt"));
    expect(rows[0]).toEqual({ label: "Resolution", values: "720p, 1080p, 4K", defaultText: "720p" });
    expect(rows[1]).toEqual({ label: "Length", values: "3 to 15 s", defaultText: "5 s" });
    expect(rows[2]).toEqual({ label: "Audio", values: "On, Off", defaultText: "On" });
  });

  it("names image settings and leaves hidden ones out", () => {
    const rows = settingsPeoplePick(model("openai:gpt-image-2").params);
    expect(rows.map((r) => r.label)).toEqual(["Aspect ratio", "Quality", "Background", "File type"]);
    expect(rows[1]).toEqual({ label: "Quality", values: "Low, Medium, High, Auto", defaultText: "Medium" });
    expect(rows[3].values).toBe("PNG, JPEG, WEBP");
  });

  it("is empty for a model with no settings", () => {
    expect(settingsPeoplePick(model("sarvam:dub").params)).toEqual([]);
  });
});

describe("monthSummary", () => {
  it("shows runs, what we paid at full precision and credits", () => {
    expect(monthSummary({ runs: 174, costUsd: 101.08, credits: 101205, unpriced: 0 })).toEqual({
      runs: "174",
      paid: "$101.08",
      credits: "101,205",
      note: { tone: "ok", text: "Every run was charged at the price live when it started." },
    });
  });

  it("says when some runs had no price, and when credits weren't kept", () => {
    const s = monthSummary({ runs: 3, costUsd: 0.5, credits: 0, unpriced: 2 });
    expect(s?.credits).toBe("Not tracked");
    expect(s?.note).toEqual({ tone: "warn", text: "2 runs had costs the price didn't cover." });
  });

  it("is null with no runs", () => {
    expect(monthSummary(undefined)).toBeNull();
    expect(monthSummary({ runs: 0, costUsd: 0, credits: 0, unpriced: 0 })).toBeNull();
  });
});
