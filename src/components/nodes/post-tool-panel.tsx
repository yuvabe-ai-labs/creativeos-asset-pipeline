"use client";

import { cn } from "@/lib/utils";
import { POST_TOOLS, type PostTool } from "./post-tool-rail";

type Props = {
  tool: PostTool | null;
  children: React.ReactNode;
};

/**
 * Panels that carry their own sub-navigation need room for two columns. Brand is the only
 * one today; every other panel keeps the single standard width, so the shell stays "one
 * width" (D116) for everything that is genuinely one column.
 */
const WIDE_TOOLS = new Set<PostTool>(["brand"]);

/**
 * One shell for every panel — one scroll behaviour, one header treatment (D116).
 * `scrollbar-thin` keeps overflow from falling back to the raw OS scrollbar.
 */
export function PostToolPanel({ tool, children }: Props) {
  if (!tool) return null;
  const meta = POST_TOOLS.find((t) => t.key === tool);
  const wide = WIDE_TOOLS.has(tool);
  return (
    <div
      className={cn(
        "scrollbar-thin shrink-0 overflow-y-auto border-r border-border p-3",
        wide ? "w-[23rem]" : "w-64",
      )}
    >
      {/* A panel with its own section nav prints the section name itself, next to the
          content it belongs to — a header here as well would title the whole panel "Brand"
          directly above a column that already says "Brand Kit". */}
      {!wide && <p className="text-eyebrow mb-3 !text-[0.6rem]">{meta?.label ?? ""}</p>}
      {children}
    </div>
  );
}
