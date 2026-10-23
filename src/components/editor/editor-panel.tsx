import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EditorPanelHeader } from "./editor-panel-rail";

/** A white side panel of the editor page (mockup: 14px radius, 1px border). Its header row hides
 *  it (D403). */
export function EditorPanel({ label, aside, side, shortcut, onCollapse, className, children }: {
  label: string;
  aside?: ReactNode;
  side: "left" | "right";
  shortcut: string;
  onCollapse(): void;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section aria-label={label} className={cn("flex min-h-0 flex-col gap-2 overflow-hidden rounded-[14px] border border-border bg-card p-3 pt-2", className)}>
      <EditorPanelHeader label={label} aside={aside} side={side} shortcut={shortcut} onCollapse={onCollapse} />
      {children}
    </section>
  );
}
