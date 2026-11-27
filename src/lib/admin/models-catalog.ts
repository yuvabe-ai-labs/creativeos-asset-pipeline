// The models catalog's view (D591): the search, "What agencies see", picker or most-used order, the
// sections by kind with their one-line summaries, the kind chips and the folded retired list. Pure and
// client-safe: the catalog works it out again in the browser whenever the search or the view changes.
import type { PickerModel } from "./model-page";
import { LIST_GROUPS, kindRank, type ListGroup, type ModelListRow } from "./models-list";

export type CatalogView = "all" | "agency";
export type CatalogOrder = "picker" | "used";
export type CatalogState = { query: string; view: CatalogView; order: CatalogOrder };

/** A section's id in the page: "video", "image", "text", "audio", "other". */
export const groupSlug = (group: ListGroup): string => group.split(" ")[0].toLowerCase();

/** The section's element id, and its heading's: a kind chip scrolls to one and moves focus to the other. */
export const sectionId = (slug: string) => `kind-${slug}`;
export const headingId = (slug: string) => `kind-${slug}-title`;

/** In the picker agencies see: live, and passing its check. */
export const inPicker = (r: ModelListRow): boolean => r.status === "live" && !r.broken;

/** The search: name, provider or kind, any case. */
export function matchesQuery(r: ModelListRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || `${r.label} ${r.provider} ${r.group}`.toLowerCase().includes(q);
}

const off = (r: ModelListRow) => (inPicker(r) ? 0 : 1);
const byPicker = (a: ModelListRow, b: ModelListRow) => off(a) - off(b) || kindRank(a.kind) - kindRank(b.kind) || a.order - b.order;
const cost = (r: ModelListRow) => r.month?.costUsd ?? 0;
const runs = (r: ModelListRow) => r.month?.runs ?? 0;

/** Picker order puts what agencies can't pick (hidden, draft) last; "Most used" puts this month's highest cost first. */
export function orderRows(rows: readonly ModelListRow[], order: CatalogOrder): ModelListRow[] {
  if (order === "used") return [...rows].sort((a, b) => cost(b) - cost(a) || runs(b) - runs(a) || byPicker(a, b));
  return [...rows].sort(byPicker);
}

export type Totals = { runs: number; costUsd: number };

export function monthTotals(rows: readonly ModelListRow[]): Totals {
  return { runs: rows.reduce((a, r) => a + runs(r), 0), costUsd: rows.reduce((a, r) => a + cost(r), 0) };
}

/** A kind's one-line summary: "6 live · 1 hidden", then its runs and cost this month (none in "What agencies see"). */
export type KindSummary = { counts: string; month: Totals | null };

export function kindSummary(rows: readonly ModelListRow[], view: CatalogView): KindSummary {
  if (view === "agency") return { counts: `${rows.length} in the picker`, month: null };
  const of = (status: string) => rows.filter((r) => !r.broken && r.status === status).length;
  const broken = rows.filter((r) => r.broken).length;
  const counts = [
    `${of("live")} live`,
    of("hidden") ? `${of("hidden")} hidden` : "",
    of("draft") ? `${of("draft")} draft` : "",
    broken ? `${broken} failing its check` : "",
  ].filter(Boolean).join(" · ");
  const month = monthTotals(rows);
  return { counts, month: month.runs ? month : null };
}

/**
 * The pickers a group's "Picker order" opens: one per stored kind with more than one live model,
 * each holding every model of that kind (the order the server saves covers them all), in picker order.
 */
export function groupPickers(rows: readonly ModelListRow[], group: ListGroup): PickerModel[][] {
  const kinds = [...new Set(rows.filter((r) => r.group === group).map((r) => r.kind))].sort((a, b) => kindRank(a) - kindRank(b));
  return kinds.flatMap((kind) => {
    const same = rows.filter((r) => r.kind === kind).sort((a, b) => a.order - b.order);
    if (same.filter(inPicker).length < 2) return [];
    return [same.map((r) => ({ id: r.id, label: r.label, kind, status: r.status, broken: r.broken }))];
  });
}

export type KindSection = { group: ListGroup; slug: string; rows: ModelListRow[]; summary: KindSummary; pickers: PickerModel[][] };

export type Catalog = {
  sections: KindSection[];
  /** Every kind, with how many models it shows now; a chip with none is disabled. */
  chips: Array<{ group: ListGroup; slug: string; count: number }>;
  retired: ModelListRow[];
  /** Needs a look shows: not while searching, not in "What agencies see". */
  needs: boolean;
  /** Nothing matches the search. */
  empty: boolean;
};

const groupIndex = (g: ListGroup) => LIST_GROUPS.indexOf(g);

export function buildCatalog(rows: readonly ModelListRow[], state: CatalogState): Catalog {
  const agency = state.view === "agency";
  const searching = state.query.trim() !== "";
  const shown = rows.filter((r) => r.status !== "retired" && (!agency || inPicker(r)) && matchesQuery(r, state.query));
  const retired = agency
    ? []
    : rows
        .filter((r) => r.status === "retired" && matchesQuery(r, state.query))
        .sort((a, b) => groupIndex(a.group) - groupIndex(b.group) || byPicker(a, b));
  const order = agency ? "picker" : state.order;
  const sections = LIST_GROUPS.flatMap((group): KindSection[] => {
    const list = shown.filter((r) => r.group === group);
    if (!list.length) return [];
    return [{
      group,
      slug: groupSlug(group),
      rows: orderRows(list, order),
      summary: kindSummary(list, state.view),
      pickers: searching ? [] : groupPickers(rows, group),
    }];
  });
  return {
    sections,
    chips: LIST_GROUPS.map((group) => ({ group, slug: groupSlug(group), count: shown.filter((r) => r.group === group).length })),
    retired,
    needs: !agency && !searching,
    empty: !sections.length && !retired.length,
  };
}
