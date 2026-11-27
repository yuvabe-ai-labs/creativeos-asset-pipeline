// The Usage page's numbers for one period (D597), built from org_usage_overview's rows (0106). One
// source, the credit ledger's charges, so the total, the daily chart and every breakdown add up.
// Client-safe: the page's browser query returns this shape.
import { todayIst } from "./dates";
import { USAGE_KINDS, USAGE_KIND_LABEL, kindOf, type UsageKind } from "./usage-kinds";
import type { UsagePeriod } from "./usage-period";

export type UsageGroupBy = "kind" | "model" | "member" | "client" | "canvas";

export const USAGE_GROUP_TITLE: Record<UsageGroupBy, string> = { kind: "By kind of work", model: "By model", member: "Members", client: "Clients", canvas: "Canvases" };

/** One row of a breakdown. `removed`: charges whose run was deleted later (its canvas item, avatar
 *  or script), which can't be told apart or opened. */
export type UsageGroupRow = { key: string | null; name: string; detail: string | null; credits: number; runs: number; removed: boolean };

export type UsageDay = { day: string; total: number; runs: number; kinds: Record<UsageKind, number>; removed: number };

export type UsageOverview = {
  period: UsagePeriod;
  from: string;
  to: string;
  total: number;
  runs: number;
  /** The month before the period, in all. */
  previousTotal: number;
  /** Credits used in the last 7 days and the 7 before, counted back from now. */
  last7: number;
  prev7: number;
  /** Every day of the period up to today, oldest first. */
  days: UsageDay[];
  groups: Record<UsageGroupBy, UsageGroupRow[]>;
};

export type OverviewDbRow = {
  section: string;
  key: string | null;
  name: string | null;
  detail: string | null;
  removed: boolean;
  credits: number | string;
  runs: number;
};

const DAY_MS = 86_400_000;

export const REMOVED_NAME = "Deleted work";
export const REMOVED_DETAIL = "Runs whose canvas item, avatar or script was deleted";

const NO_KEY: Record<Exclude<UsageGroupBy, "kind">, { name: string; detail: string | null }> = {
  model: { name: "No model recorded", detail: null },
  member: { name: "Someone no longer in the agency", detail: null },
  client: { name: "No client", detail: null },
  canvas: { name: "Outside a canvas", detail: "Avatars and scripts" },
};

const emptyKinds = (): Record<UsageKind, number> => ({ video: 0, image: 0, voice: 0, text: 0 });
const byCredits = (a: UsageGroupRow, b: UsageGroupRow) => b.credits - a.credits || a.name.localeCompare(b.name);

/** Credits a day at the last 7 days' pace. */
export function dailyPace(o: Pick<UsageOverview, "last7">): number {
  return o.last7 / 7;
}

export function buildUsageOverview(
  rows: OverviewDbRow[],
  opts: { period: UsagePeriod; from: string; to: string; now: Date; modelLabel: (id: string) => string | null },
): UsageOverview {
  const { period, from, to, now, modelLabel } = opts;
  const days = new Map<string, UsageDay>();
  const end = Math.min(new Date(to).getTime(), now.getTime());
  for (let t = new Date(from).getTime(); t < end; t += DAY_MS) {
    const day = todayIst(new Date(t));
    days.set(day, { day, total: 0, runs: 0, kinds: emptyKinds(), removed: 0 });
  }

  const kinds = new Map<UsageKind, UsageGroupRow>();
  const groups: Record<Exclude<UsageGroupBy, "kind">, UsageGroupRow[]> = { model: [], member: [], client: [], canvas: [] };
  const removedRow = (credits: number, runs: number): UsageGroupRow => ({ key: null, name: REMOVED_NAME, detail: REMOVED_DETAIL, credits, runs, removed: true });
  let removedKind: UsageGroupRow | null = null;
  let total = 0;
  let runs = 0;
  let previousTotal = 0;
  let last7 = 0;
  let prev7 = 0;

  for (const r of rows) {
    const credits = Number(r.credits);
    if (r.section === "day") {
      total += credits;
      runs += r.runs;
      const d = r.key ? days.get(r.key) : undefined;
      if (d) {
        d.total += credits;
        d.runs += r.runs;
        if (r.removed) d.removed += credits;
        else d.kinds[kindOf(r.detail)] += credits;
      }
      if (r.removed) {
        removedKind ??= removedRow(0, 0);
        removedKind.credits += credits;
        removedKind.runs += r.runs;
      } else {
        const k = kindOf(r.detail);
        const row = kinds.get(k) ?? { key: k, name: USAGE_KIND_LABEL[k], detail: null, credits: 0, runs: 0, removed: false };
        row.credits += credits;
        row.runs += r.runs;
        kinds.set(k, row);
      }
    } else if (r.section === "previous") {
      previousTotal = credits;
    } else if (r.section === "pace") {
      if (r.key === "last7") last7 = credits;
      else if (r.key === "prev7") prev7 = credits;
    } else if (r.section === "model" || r.section === "member" || r.section === "client" || r.section === "canvas") {
      const by = r.section;
      if (r.removed) {
        groups[by].push(removedRow(credits, r.runs));
        continue;
      }
      let name: string;
      let detail: string | null;
      if (r.key === null) ({ name, detail } = NO_KEY[by]);
      else if (by === "model") {
        name = modelLabel(r.key) ?? "Older model";
        detail = USAGE_KIND_LABEL[kindOf(r.detail)];
      } else if (by === "member") {
        name = r.name ?? "Unnamed";
        detail = null;
      } else if (by === "client") {
        name = r.name ?? "Removed client";
        detail = null;
      } else {
        name = r.name || "Untitled canvas";
        detail = r.detail;
      }
      groups[by].push({ key: r.key, name, detail, credits, runs: r.runs, removed: false });
    }
  }

  const kindRows = USAGE_KINDS.flatMap((k) => (kinds.has(k) ? [kinds.get(k)!] : [])).sort(byCredits);
  if (removedKind) kindRows.push(removedKind);
  // Deleted work goes last in every list, whatever its size: it can't be opened.
  const sorted = (list: UsageGroupRow[]) => [...list.filter((r) => !r.removed).sort(byCredits), ...list.filter((r) => r.removed)];

  return {
    period,
    from,
    to,
    total,
    runs,
    previousTotal,
    last7,
    prev7,
    days: [...days.values()],
    groups: {
      kind: kindRows,
      model: sorted(groups.model),
      member: sorted(groups.member),
      client: sorted(groups.client),
      canvas: sorted(groups.canvas),
    },
  };
}
