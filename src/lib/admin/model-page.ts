// The admin model page's header strip (prototype v3, "Model"): where the model sits in its picker,
// what a status change does before it is saved, and the settings people pick; plus the side
// column's "This month". The server checks every write again (D546). Client-safe.
import { formatUsd } from "@/lib/ai-models/price-format";
import type { ParamSpec } from "@/lib/image-gen/types";

export const STATUS_ORDER = ["live", "hidden", "retired", "draft"] as const;

export const STATUS_TEXT: Record<string, string> = { live: "Live", hidden: "Hidden", retired: "Retired", draft: "Draft" };

export const STATUS_HELP: Record<string, string> = {
  live: "Shown in the model picker for every agency.",
  hidden: "Taken out of the picker. Nodes already using it keep working.",
  retired: "Taken out of the picker. Nodes using it switch to the replacement.",
  draft: "Only super admins can pick it. Use this while you set it up.",
};

const PICKER_NOUN: Record<string, string> = {
  video: "video",
  image: "image",
  text: "text",
  dub: "dubbing",
  voice: "voice change",
  lipsync: "lip sync",
  transcribe: "captions",
  scrape: "web scraping",
};

const pickerNoun = (kind: string) => PICKER_NOUN[kind] ?? kind;

/** "1st", "2nd", "3rd", "4th", "11th", "21st". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const s = n % 10 === 1 ? "st" : n % 10 === 2 ? "nd" : n % 10 === 3 ? "rd" : "th";
  return `${n}${s}`;
}

/** A model as the order popover lists it. `broken`: the row fails its check (D547) but still holds a place. */
export type PickerModel = { id: string; label: string; kind: string; status: string; broken: boolean };

export type PickerOrder = {
  kind: string;
  items: Array<{ id: string; label: string; note: string | null }>;
  /** 1-based. */
  position: number;
  text: string;
  title: string;
};

/** Where `id` sits among the models of its kind; `models` come in picker order (sort_order, then id). */
export function pickerOrder(models: readonly PickerModel[], id: string): PickerOrder {
  const kind = models.find((m) => m.id === id)?.kind ?? "";
  const same = models.filter((m) => m.kind === kind);
  const position = same.findIndex((m) => m.id === id) + 1;
  return {
    kind,
    items: same.map((m) => ({
      id: m.id,
      label: m.label,
      note: m.id === id ? null : m.broken ? "Fails its check" : m.status === "live" ? null : (STATUS_TEXT[m.status] ?? m.status),
    })),
    position,
    text: `${ordinal(position)} of ${same.length} in the picker`,
    title: `Order in the ${pickerNoun(kind)} picker`,
  };
}

/** Which arrow keeps focus after a move: the one just used, or the other once the model reaches an end (that one is disabled). */
export function arrowAfterMove(position: number, total: number, delta: -1 | 1): "up" | "down" {
  if (delta === -1) return position <= 1 ? "down" : "up";
  return position >= total ? "up" : "down";
}

/** The order with `id` swapped one place up (−1) or down (+1); null when it can't move that way. */
export function moveInOrder(ids: readonly string[], id: string, delta: -1 | 1): string[] | null {
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export type StatusChangeInput = {
  label: string;
  kind: string;
  from: string;
  to: string;
  savedReplacement: string | null;
  replacement: string | null;
  /** Other live models of the same kind. */
  otherLive: number;
  /** A price live now (passing its check). */
  hasPrice: boolean;
  /** When the model has no live price but one is scheduled: its start date, "3 Dec 2026". */
  priceStarts: string | null;
  /** The build has code to run this model (image and video only; other kinds always can). */
  canGoLive: boolean;
  runsThisMonth: number;
};

export type StatusChange = {
  /** "Live → Hidden."; null when only the replacement changes. */
  heading: string | null;
  text: string;
  /** A guard stops this change; the text says why. */
  blocked: boolean;
  needsReplacement: boolean;
  canSave: boolean;
};

const isMedia = (kind: string) => kind === "image" || kind === "video";
const runs = (n: number) => (n === 1 ? "1 run" : `${n.toLocaleString("en-US")} runs`);

/** What a pending status change does, in plain words, and whether it can be saved (the server's D546 guards, ahead of time). */
export function statusChange(c: StatusChangeInput): StatusChange {
  let guard: string | null = null;
  if (c.from === "live" && c.to !== "live" && isMedia(c.kind) && c.otherLive === 0) {
    guard = `${c.label} is the only live ${pickerNoun(c.kind)} model. Make another one live first, or agencies lose this step altogether.`;
  } else if (c.to === "live" && c.from !== "live" && !c.canGoLive) {
    guard = "This build has no code to run this model, so it can't go live.";
  } else if (c.to === "live" && c.from !== "live" && isMedia(c.kind) && !c.hasPrice) {
    // The server refuses it too (D546, amended).
    guard = c.priceStarts ? `Its price starts on ${c.priceStarts}.` : "Add a price first. Runs of a live model with no price are refused.";
  }
  const needsReplacement = c.to === "retired";
  let text: string;
  if (guard) text = guard;
  else if (c.to === "retired") text = `${c.runsThisMonth > 0 ? `${runs(c.runsThisMonth)} this month. ` : ""}Nodes using it switch to the replacement.`;
  else if (c.to === "hidden") text = c.runsThisMonth > 0 ? `${runs(c.runsThisMonth)} this month; nodes already using it keep working.` : "Nodes already using it keep working.";
  else text = STATUS_HELP[c.to] ?? "";
  const changed = c.to !== c.from || (needsReplacement && c.replacement !== c.savedReplacement);
  return {
    heading: c.to === c.from ? null : `${STATUS_TEXT[c.from] ?? c.from} → ${STATUS_TEXT[c.to] ?? c.to}.`,
    text,
    blocked: guard !== null,
    needsReplacement,
    canSave: !guard && changed && (!needsReplacement || c.replacement !== null),
  };
}

/** The patch updateAiModelAction takes for a status change; the server clears the replacement for any other status. */
export function statusPatch(to: string, replacement: string | null): Record<string, unknown> {
  return to === "retired" ? { status: to, replaced_by: replacement } : { status: to };
}

const PARAM_LABEL: Record<string, string> = {
  aspect_ratio: "Aspect ratio",
  image_size: "Image size",
  output_format: "File type",
  resolution: "Resolution",
  quality: "Quality",
  background: "Background",
  duration: "Length",
  audio: "Audio",
  ratio: "Aspect ratio",
};
const QUALITY: Record<string, string> = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function optionLabel(name: string, v: unknown): string {
  const s = String(v);
  if (name === "resolution") return s === "4k" ? "4K" : s;
  if (name === "quality") return QUALITY[s] ?? capitalise(s);
  if (name === "audio") return s === "native" ? "On" : s === "off" ? "Off" : capitalise(s);
  if (name === "output_format") return s.toUpperCase();
  if (typeof v === "boolean") return v ? "On" : "Off";
  return /^[a-z]/.test(s) ? capitalise(s) : s;
}

export type SettingRow = { label: string; values: string; defaultText: string | null };

/** The settings people see when they run this model, with their choices and default. Free text and hidden settings are left out. */
export function settingsPeoplePick(params: readonly ParamSpec[]): SettingRow[] {
  return params.flatMap((p): SettingRow[] => {
    if (!p.visible) return [];
    const label = PARAM_LABEL[p.name] ?? p.label;
    const unit = p.name === "duration" ? " s" : "";
    const def = p.defaultValue === undefined || p.defaultValue === null ? null : p.defaultValue;
    const c = p.constraints;
    switch (c.type) {
      case "select":
        return [{ label, values: c.options.map((o) => optionLabel(p.name, o)).join(", "), defaultText: def === null ? null : optionLabel(p.name, def) }];
      case "slider":
      case "number":
        if (c.min === undefined || c.max === undefined) return [];
        return [{ label, values: `${c.min} to ${c.max}${unit}`, defaultText: def === null ? null : `${String(def)}${unit}` }];
      case "toggle":
        return [{ label, values: "On, Off", defaultText: def === null ? null : optionLabel(p.name, def) }];
      default:
        return [];
    }
  });
}

export type MonthStatsInput = { runs: number; costUsd: number; credits: number; unpriced: number };
export type MonthSummary = { runs: string; paid: string; credits: string; note: { tone: "ok" | "warn"; text: string } };

/** "This month": runs, what we paid (full precision) and credits charged. Null with no runs. */
export function monthSummary(s: MonthStatsInput | undefined): MonthSummary | null {
  if (!s || s.runs <= 0) return null;
  return {
    runs: s.runs.toLocaleString("en-US"),
    paid: formatUsd(s.costUsd),
    credits: s.credits ? Math.round(s.credits).toLocaleString("en-US") : "Not tracked",
    note:
      s.unpriced > 0
        ? { tone: "warn", text: `${runs(s.unpriced)} had costs the price didn't cover.` }
        : { tone: "ok", text: "Every run was charged at the price live when it started." },
  };
}
