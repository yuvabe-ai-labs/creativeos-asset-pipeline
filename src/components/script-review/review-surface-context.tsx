// src/components/script-review/review-surface-context.tsx
"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ReviewColumnState } from "@/hooks/use-review-column";
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { PlacedThreads } from "@/lib/script-review/threads";
import type { Part } from "@/lib/script-review/types";

// What every comment control on a review page needs, given once (docs/component-structure.md: no
// prop drilling), including the Comments column's focus (review board). The client's page and the
// team's view fill it differently.
export type ReviewSurface = ReviewColumnState & {
  mode: "client" | "team";
  /** The script on screen: the frozen version for the client, the live script for the team. */
  doc: ScriptDoc;
  placed: PlacedThreads;
  /** Parts the client may comment on now, by part key. Empty for the team, and after approval. */
  commentable: ReadonlyMap<string, Part>;
  onPost?: (part: Part, body: string) => Promise<void>;
  onEdit?: (commentId: string, body: string) => Promise<void>;
  onReply?: (commentId: string, body: string) => Promise<void>;
  onResolve?: (commentId: string, resolved: boolean) => Promise<void>;
};

const SurfaceContext = createContext<ReviewSurface | null>(null);

export function ReviewSurfaceProvider({ value, children }: { value: ReviewSurface; children: ReactNode }) {
  return <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>;
}

export function useReviewSurface(): ReviewSurface {
  const value = useContext(SurfaceContext);
  if (!value) throw new Error("useReviewSurface must be used inside ReviewSurfaceProvider.");
  return value;
}
