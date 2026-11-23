import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PEOPLE_SUBGRID, peopleGrid, peopleSpan, type PeopleColumns } from "./person-layout";

// One card holding one list of PersonRows, with the column names above them from sm up. The
// Team page and every Members list use it, so their rows line up the same way.
export function PeopleList({ columns, children, empty }: { columns: PeopleColumns; children: ReactNode; empty?: ReactNode }) {
  return (
    <Card className="px-5 py-2 shadow-card">
      {empty ?? (
        <div className={peopleGrid(columns)}>
          <div className={cn("text-eyebrow hidden border-b py-2.5 text-[0.65rem] text-muted-foreground", PEOPLE_SUBGRID, peopleSpan(columns))}>
            <span>Person</span>
            <span>Status</span>
            {columns.permissions && <span>Permissions</span>}
            {columns.clients && <span>Clients</span>}
            <span className="sr-only">Actions</span>
          </div>
          <ul className={cn("flex flex-col", PEOPLE_SUBGRID, peopleSpan(columns))}>{children}</ul>
        </div>
      )}
    </Card>
  );
}
