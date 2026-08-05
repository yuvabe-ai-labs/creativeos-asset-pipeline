"use client";

import { POST_TOOLS, type PostTool } from "./post-tool-rail";

type Props = {
  tool: PostTool | null;
  children: React.ReactNode;
};

/**
 * One shell for every panel — one width, one scroll behaviour, one header treatment (D116).
 * `scrollbar-thin` keeps overflow from falling back to the raw OS scrollbar.
 */
export function PostToolPanel({ tool, children }: Props) {
  if (!tool) return null;
  const meta = POST_TOOLS.find((t) => t.key === tool);
  return (
    <div className="scrollbar-thin w-64 shrink-0 overflow-y-auto border-r border-border p-3">
      <p className="text-eyebrow mb-3 !text-[0.6rem]">{meta?.label ?? ""}</p>
      {children}
    </div>
  );
}
