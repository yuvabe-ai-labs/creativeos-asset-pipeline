// src/components/scripts/script-sheet-frame.tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** D465 — the Visualise board and the client's board in one column: the summary card, then the
 *  storyboard sheet at full width. When given, the Comments column sits at the right from `xl`. */
export function ScriptSheetFrame({ children, column }: { children: ReactNode; column?: ReactNode }) {
  return (
    <div className={cn("grid items-start gap-6", column && "xl:grid-cols-[minmax(0,1fr)_20rem]")}>
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
      {column}
    </div>
  );
}
