"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_AGENCY_SORT,
  countLine,
  filterCounts,
  nextSort,
  searchAgencies,
  visibleAgencies,
  type AgencyFilter,
  type AgencyRow as Row,
  type AgencySort,
} from "@/lib/admin/agencies-list";
import { AgenciesToolbar } from "./agencies-toolbar";
import { AgenciesTableHead } from "./agencies-table-head";
import { AgenciesState } from "./agencies-state";
import { AgencyRow } from "./agency-row";

const LINK = "[data-agency-link]";

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el as HTMLElement).isContentEditable;
}

// Admin › Agencies (D590): the whole list on one page, searched, filtered and sorted in the browser.
// Needs attention first by default. "/" jumps to search, ↑ ↓ move between rows, Enter opens one.
export function AgenciesTable({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AgencyFilter>("all");
  const [sort, setSort] = useState<AgencySort>(DEFAULT_AGENCY_SORT);
  const searchRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  const counts = useMemo(() => filterCounts(searchAgencies(rows, query)), [rows, query]);
  const shown = useMemo(() => visibleAgencies(rows, query, filter, sort), [rows, query, filter, sort]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
      // Not while a dialog is open over the list.
      if (document.querySelector("[role='dialog']")) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const links = () => Array.from(bodyRef.current?.querySelectorAll<HTMLElement>(LINK) ?? []);

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
    } else if (e.key === "ArrowDown") {
      const first = links()[0];
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function onBodyKey(e: React.KeyboardEvent<HTMLTableSectionElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const el = e.target as HTMLElement;
    if (!el.matches(LINK)) return;
    e.preventDefault();
    const all = links();
    const next = all[all.indexOf(el) + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) next.focus();
    else if (e.key === "ArrowUp") searchRef.current?.focus();
  }

  function clearSearch() {
    setQuery("");
    searchRef.current?.focus();
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-card shadow-card">
        <AgenciesState title="No agencies yet">Add the first one and its owner gets an invite by email.</AgenciesState>
      </div>
    );
  }

  const q = query.trim();
  const filtered = q !== "" || filter !== "all";

  return (
    <div>
      <AgenciesToolbar
        searchRef={searchRef}
        query={query}
        onQueryChange={setQuery}
        onQueryKeyDown={onSearchKey}
        filter={filter}
        onFilterChange={setFilter}
        counts={counts}
      />
      <div className="rounded-xl border bg-card shadow-card">
        <table className="w-full border-separate border-spacing-0">
          <AgenciesTableHead sort={sort} onSort={(key) => setSort((s) => nextSort(s, key))} />
          <tbody ref={bodyRef} onKeyDown={onBodyKey}>
            {shown.length > 0 ? (
              shown.map((row) => <AgencyRow key={row.id} row={row} />)
            ) : (
              <tr>
                <td colSpan={6}>
                  <AgenciesState
                    title="No agencies match"
                    actions={
                      <>
                        {q && <Button variant="outline" onClick={clearSearch}>Clear search</Button>}
                        {filter !== "all" && <Button variant="outline" onClick={() => setFilter("all")}>Show all agencies</Button>}
                      </>
                    }
                  >
                    {q ? `Nothing for “${q}”${filter !== "all" ? " with this filter" : ""}.` : "No agency fits this filter."}
                  </AgenciesState>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-[0.8rem] text-muted-foreground">
          <span aria-live="polite">
            {countLine(shown.length, rows.length)}
            {filtered && shown.length > 0 && (
              <>
                {" · "}
                <Button
                  variant="link"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                  className="h-auto p-0 text-[0.8rem] text-foreground underline decoration-border underline-offset-[3px] hover:decoration-foreground"
                >
                  Clear filters
                </Button>
              </>
            )}
          </span>
          <span className="hidden text-muted-foreground/70 md:inline">↑ ↓ to move between rows, Enter to open, / to search</span>
        </div>
      </div>
    </div>
  );
}
