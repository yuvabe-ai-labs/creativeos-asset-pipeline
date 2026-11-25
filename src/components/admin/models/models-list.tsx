"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import {
  LIST_GROUPS,
  filterModelRows,
  groupModelRows,
  type ListGroup,
  type ModelListRow,
} from "@/lib/admin/models-list";
import { LIST_COLUMNS, ModelListRowView } from "@/components/admin/models/model-list-row";

const HEADERS = ["Model", "Status", "Our price", "Typical run", "Next change", "This month"];

/** The models list: kind tabs, "Only with runs this month", search, and the rows grouped by kind. */
export function ModelsList({ rows }: { rows: ModelListRow[] }) {
  const [group, setGroup] = useState<ListGroup | "all">("all");
  const [onlyRuns, setOnlyRuns] = useState(false);
  const [query, setQuery] = useState("");
  const [showRetired, setShowRetired] = useState(false);

  const { groups, retired } = useMemo(
    () => groupModelRows(filterModelRows(rows, { group, onlyRuns, query }), showRetired),
    [rows, group, onlyRuns, query, showRetired],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={group} onValueChange={(v) => setGroup(v as ListGroup | "all")} className="max-w-full">
          <TabsList aria-label="Kind" className="max-w-full justify-start overflow-x-auto">
            {(["all", ...LIST_GROUPS] as const).map((g) => (
              <TabsTrigger key={g} value={g} className="flex-none px-2.5">
                {g === "all" ? "All" : g}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Toggle
          variant="outline"
          size="sm"
          pressed={onlyRuns}
          onPressedChange={setOnlyRuns}
          className="rounded-full aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:text-primary"
        >
          Only with runs this month
        </Toggle>
        <InputGroup className="w-full bg-card md:ml-auto md:w-56">
          <InputGroupAddon>
            <Search aria-hidden strokeWidth={1.5} />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models"
            aria-label="Search models"
          />
        </InputGroup>
      </div>

      <div role="table" aria-label="Models" className="overflow-hidden rounded-xl border bg-card shadow-card">
        <div role="row" className={cn(LIST_COLUMNS, "hidden h-10 items-center border-b bg-muted/40 md:grid")}>
          {HEADERS.map((h, i) => (
            <span
              key={h}
              role="columnheader"
              className={cn("text-xs font-medium whitespace-nowrap text-muted-foreground", i === HEADERS.length - 1 && "text-right")}
            >
              {h}
            </span>
          ))}
        </div>
        {groups.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No models match. Clear the search or pick another kind.
          </p>
        ) : (
          groups.map((g) => (
            <div key={g.group} role="rowgroup">
              <div role="row" className="flex items-center gap-2 border-b bg-muted/25 px-4 pt-4 pb-2 md:px-5">
                <span role="rowheader" className="text-sm font-semibold">{g.group}</span>
                <span className="text-xs text-muted-foreground">{g.live} live</span>
              </div>
              {g.rows.map((r) => (
                <ModelListRowView key={r.id} row={r} />
              ))}
            </div>
          ))
        )}
      </div>

      {retired > 0 && (
        <Button variant="link" size="sm" className="mt-3 px-0" onClick={() => setShowRetired((v) => !v)}>
          {showRetired ? "Hide" : "Show"} {retired} retired {retired === 1 ? "model" : "models"}
        </Button>
      )}
    </div>
  );
}
