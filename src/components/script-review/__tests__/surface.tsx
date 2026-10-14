// src/components/script-review/__tests__/surface.tsx
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { partKey } from "@/lib/script-review/parts";
import { buildThreads, placeThreads } from "@/lib/script-review/threads";
import type { Part, ScriptComment } from "@/lib/script-review/types";
import { reelDoc } from "@/lib/script-review/__tests__/fixtures";
import { ReviewSurfaceProvider, type ReviewSurface } from "../review-surface-context";

/** A client-mode surface over Reel 01 with the given comments and commentable parts. */
export function testSurface(
  over: { comments?: ScriptComment[]; commentable?: Part[]; mode?: "client" | "team" } & Omit<Partial<ReviewSurface>, "commentable" | "mode"> = {},
): ReviewSurface {
  const { comments = [], commentable = [], mode = "client", ...rest } = over;
  const doc = reelDoc();
  return {
    mode,
    doc,
    placed: placeThreads(buildThreads(comments), doc, {}),
    commentable: new Map(commentable.map((p) => [partKey(p), p])),
    onPost: mode === "client" ? async () => {} : undefined,
    focus: null,
    openPart: () => {},
    clearFocus: () => {},
    columnOpen: false,
    setColumnOpen: () => {},
    ...rest,
  };
}

export const renderInSurface = (surface: ReviewSurface, node: ReactNode) =>
  renderToStaticMarkup(<ReviewSurfaceProvider value={surface}>{node}</ReviewSurfaceProvider>);
