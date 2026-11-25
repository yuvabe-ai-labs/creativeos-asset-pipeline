// The price grid the admin model page and change-prices dialog draw: a model's main price laid out
// in its own settings (video: resolution by audio; image: size by quality for OpenAI, size
// otherwise), plus every other line as "other charges". Each cell is the price a run at that
// setting matches (lineFor), and settings come from priceDims, so the grid can't disagree with a
// run's estimate. Client-safe.
import { lineFor } from "@/lib/ai-models/pricing";
import { priceDims } from "@/lib/ai-models/model-edit";
import { displayAmount, formatUsd, isTokenMeter } from "@/lib/ai-models/price-format";
import type { AiModel, AiModelPrice, Meter, PriceLine } from "@/lib/ai-models/types";

type Value = string | boolean;
type When = Record<string, Value>;
type GridModel = Pick<AiModel, "id" | "kind" | "params" | "providerLabel">;

export type AxisKey = "size" | "quality" | "resolution" | "audio";
export type Axis = { key: AxisKey; label: string };
export type AxisValue = { value: Value | null; label: string; detail?: string };

export type GridCell = {
  /** The line this cell writes (meter plus its settings), see lineKey. */
  key: string;
  meter: Meter;
  when: When;
  /** Plain, for screen readers: "720p, audio on, price per second". */
  label: string;
  /** The price a run at this setting matches, null when none does. */
  usd: number | null;
  unit: "per second" | "per image";
  /** False when the model can never run at this setting (priceDims). */
  offered: boolean;
};

export type OtherCharge = {
  key: string;
  meter: Meter;
  when: When;
  label: string;
  /** The stored unit price. */
  usd: number;
  /** What the admin reads and types: per 1M for tokens. */
  amount: number;
  perMillion: boolean;
  /** A `usd` line: charged at what the provider reports, not a price to edit. */
  atCost: boolean;
};

export type PriceGrid = {
  rowAxis: Axis | null;
  colAxis: Axis | null;
  /** At least one row and one column for image and video; a missing axis is one value, null. */
  rowValues: AxisValue[];
  colValues: AxisValue[];
  /** rows x columns; empty for kinds with no grid. */
  cells: GridCell[][];
  otherCharges: OtherCharge[];
};

const ORDER: Record<AxisKey, readonly Value[]> = {
  resolution: ["360p", "480p", "720p", "1080p", "4k"],
  audio: [true, false],
  size: ["512", "1K", "1.5K", "2K", "3K", "4K", "1024x1024", "1536x1024", "1024x1536"],
  quality: ["low", "medium", "high", "xhigh", "max"],
};
const QUALITY: Record<string, string> = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };
const SIZE_NAME: Record<string, string> = { "1024x1024": "Square", "1536x1024": "Landscape", "1024x1536": "Portrait" };
const SIZE_PX: Record<string, string> = { "1024x1024": "1024 × 1024", "1536x1024": "1536 × 1024", "1024x1536": "1024 × 1536" };
/** The param a run reads each setting from; a model without it always runs at the setting's default. */
const PARAM_OF: Record<AxisKey, (m: GridModel) => string> = {
  size: (m) => (m.id.startsWith("openai:") ? "aspect_ratio" : "image_size"),
  quality: () => "quality",
  resolution: () => "resolution",
  audio: () => "audio",
};

const METER_LABEL: Partial<Record<Meter, string>> = {
  video_second: "per second of video",
  output_image: "per image",
  audio_second: "per second of audio",
  text_input_token: "per 1M text input tokens",
  image_input_token: "per 1M image input tokens",
  image_output_token: "per 1M image output tokens",
  text_output_token: "per 1M text output tokens",
  thought_token: "per 1M thinking tokens",
  input_token: "per 1M input tokens",
  cached_input_token: "per 1M cached input tokens",
  video_output_token: "per 1M video output tokens",
  input_image: "per reference image",
  request: "per request",
  character: "per character",
  usd: "charged at cost",
};

/** How a line's meter reads: "per 1M input tokens", "per Kling unit". */
export function meterLabel(meter: Meter, model: Pick<AiModel, "providerLabel">): string {
  if (meter === "provider_unit") return `per ${model.providerLabel} unit`;
  if (meter === "provider_credit") return `per ${model.providerLabel} credit`;
  return METER_LABEL[meter] ?? `per ${meter.replace(/_/g, " ")}`;
}

/** How a setting's value reads: "4K", "With audio", "Extra high", "Square". */
export function valueLabel(key: string, value: Value): string {
  if (key === "resolution") return value === "4k" ? "4K" : String(value);
  if (key === "audio") return value === true ? "With audio" : "No audio";
  if (key === "quality") return QUALITY[String(value)] ?? String(value);
  if (key === "size") return SIZE_NAME[String(value)] ?? String(value);
  return String(value);
}

const WHEN_ORDER = ["resolution", "size", "audio", "quality"];
/** A line's settings in words: "1080p", "4K, with audio", "Square, High". */
export function whenText(when: When): string {
  const rank = (k: string) => (WHEN_ORDER.includes(k) ? WHEN_ORDER.indexOf(k) : WHEN_ORDER.length);
  return Object.keys(when)
    .sort((a, b) => rank(a) - rank(b))
    .map((k) => (k === "audio" ? valueLabel(k, when[k]).toLowerCase() : valueLabel(k, when[k])))
    .join(", ");
}

/** A line's identity: its meter and its settings, e.g. "video_second|audio=true,resolution=720p". */
export function lineKey(meter: Meter, when: Readonly<Record<string, string | number | boolean>> = {}): string {
  return `${meter}|${Object.keys(when).sort().map((k) => `${k}=${String(when[k])}`).join(",")}`;
}

export function parseLineKey(key: string): { meter: Meter; when: When } {
  const [meter, w] = key.split("|");
  const when: When = {};
  for (const kv of w ? w.split(",") : []) {
    const [k, v] = kv.split("=");
    when[k] = v === "true" ? true : v === "false" ? false : v;
  }
  return { meter: meter as Meter, when };
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const asWhen = (line: PriceLine): When => (line.when ?? {}) as When;

function mainOf(model: GridModel): { meter: Meter; axes: [AxisKey, AxisKey] } | null {
  if (model.kind === "image") return { meter: "output_image", axes: ["size", "quality"] };
  if (model.kind === "video") return { meter: "video_second", axes: ["resolution", "audio"] };
  return null;
}

const AXIS_LABEL: Record<AxisKey, string> = { size: "Size", quality: "Quality", resolution: "Resolution", audio: "Audio" };

function axisValues(model: GridModel, key: AxisKey, mainLines: PriceLine[], dims: Record<string, readonly Value[]>): Value[] {
  const hasParam = model.params.some((p) => p.name === PARAM_OF[key](model));
  const fromLines = mainLines.flatMap((l) => (key in asWhen(l) ? [asWhen(l)[key]] : []));
  const values = [...new Set([...(hasParam ? (dims[key] ?? []) : []), ...fromLines])];
  const order = ORDER[key];
  const rank = (v: Value) => (order.includes(v) ? order.indexOf(v) : order.length);
  return values.sort((a, b) => rank(a) - rank(b));
}

function otherCharge(model: GridModel, line: PriceLine): OtherCharge {
  const when = asWhen(line);
  const at = Object.keys(when).length ? ` at ${whenText(when)}` : "";
  return {
    key: lineKey(line.meter, when),
    meter: line.meter,
    when,
    label: capitalise(meterLabel(line.meter, model) + at),
    usd: line.unit_usd,
    amount: displayAmount(line.meter, line.unit_usd),
    perMillion: isTokenMeter(line.meter),
    atCost: line.meter === "usd",
  };
}

export function priceGrid(model: GridModel, price: AiModelPrice): PriceGrid {
  const main = mainOf(model);
  if (!main) {
    return { rowAxis: null, colAxis: null, rowValues: [], colValues: [], cells: [], otherCharges: price.lines.map((l) => otherCharge(model, l)) };
  }
  const [rowKey, colKey] = main.axes;
  const isMain = (l: PriceLine) => l.meter === main.meter && Object.keys(asWhen(l)).every((k) => k === rowKey || k === colKey);
  const mainLines = price.lines.filter(isMain);
  const dims = priceDims(model);

  const rows = axisValues(model, rowKey, mainLines, dims);
  // Image quality is a column only for OpenAI (imageDims prices nothing else on it); audio only when the price splits on it.
  const showCol = colKey === "quality" ? model.id.startsWith("openai:") : mainLines.some((l) => "audio" in asWhen(l));
  const cols = showCol ? (colKey === "audio" ? [true, false] : axisValues(model, colKey, mainLines, dims)) : [];

  const rowAxis = rows.length ? { key: rowKey, label: AXIS_LABEL[rowKey] } : null;
  const colAxis = cols.length ? { key: colKey, label: AXIS_LABEL[colKey] } : null;
  const rowValues: AxisValue[] = rowAxis
    ? rows.map((v) => ({ value: v, label: valueLabel(rowKey, v), ...(SIZE_PX[String(v)] ? { detail: SIZE_PX[String(v)] } : {}) }))
    : [{ value: null, label: "All settings" }];
  const colValues: AxisValue[] = colAxis ? cols.map((v) => ({ value: v, label: valueLabel(colKey, v) })) : [{ value: null, label: "Price" }];
  const unit = main.meter === "output_image" ? "per image" : "per second";

  const cells = rowValues.map((r) =>
    colValues.map((c): GridCell => {
      const when: When = {};
      if (r.value !== null) when[rowKey] = r.value;
      if (c.value !== null) when[colKey] = c.value;
      const colWords = c.value === null ? null : colKey === "audio" ? (c.value ? "audio on" : "audio off") : `${c.label} quality`;
      return {
        key: lineKey(main.meter, when),
        meter: main.meter,
        when,
        label: capitalise([r.value === null ? null : r.label, colWords, `price ${unit}`].filter(Boolean).join(", ")),
        usd: lineFor(price, main.meter, when)?.unit_usd ?? null,
        unit,
        offered: Object.entries(when).every(([k, v]) => dims[k]?.includes(v) ?? false),
      };
    }),
  );
  return { rowAxis, colAxis, rowValues, colValues, cells, otherCharges: price.lines.filter((l) => !isMain(l)).map((l) => otherCharge(model, l)) };
}

export type PriceRange = { from: string; to: string; single: boolean };

const PER_UNIT: Partial<Record<Meter, string>> = { video_second: "a second", audio_second: "a second", output_image: "an image", request: "a request" };
const lineOf = (price: Pick<AiModelPrice, "lines">, meter: Meter) => price.lines.find((l) => l.meter === meter);

/** The models list's price text: "$0.023172 a second" / "up to $0.208512 at 4K". Null with no price. */
export function priceRange(model: GridModel, price: AiModelPrice): PriceRange | null {
  const grid = priceGrid(model, price);
  const cells = grid.cells.flat().filter((c): c is GridCell & { usd: number } => c.offered && c.usd !== null);
  if (cells.length) {
    const lo = cells.reduce((a, b) => (b.usd < a.usd ? b : a));
    const hi = cells.reduce((a, b) => (b.usd > a.usd ? b : a));
    const single = hi.usd === lo.usd;
    return {
      from: `${formatUsd(lo.usd)} ${PER_UNIT[lo.meter]}`,
      to: single ? "same at every setting" : `up to ${formatUsd(hi.usd)} at ${whenText(hi.when) || "top setting"}`,
      single,
    };
  }
  const request = lineOf(price, "request");
  if (request) {
    // A flat price per run (prompt runs, D559); an attached image adds its own flat price.
    const image = lineOf(price, "input_image");
    return { from: `${formatUsd(request.unit_usd)} a request`, to: image ? `plus ${formatUsd(image.unit_usd)} an attached image` : "flat price", single: true };
  }
  const flat = price.lines.find((l) => (l.meter === "video_second" || l.meter === "audio_second") && !Object.keys(asWhen(l)).length);
  if (flat) return { from: `${formatUsd(flat.unit_usd)} ${PER_UNIT[flat.meter]}`, to: "same at every setting", single: true };
  const tokensIn = lineOf(price, "input_token");
  const tokensOut = lineOf(price, "text_output_token");
  if (tokensIn && tokensOut) {
    return { from: `${formatUsd(displayAmount("input_token", tokensIn.unit_usd))} in · ${formatUsd(displayAmount("text_output_token", tokensOut.unit_usd))} out`, to: "per 1M tokens", single: true };
  }
  const credit = lineOf(price, "provider_credit");
  if (credit) return { from: formatUsd(credit.unit_usd), to: meterLabel("provider_credit", model), single: true };
  if (lineOf(price, "usd")) return { from: "At cost", to: "what the provider reports", single: true };
  return null;
}
