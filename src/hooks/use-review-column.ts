// src/hooks/use-review-column.ts
"use client";

import { useCallback, useState } from "react";
import type { ColumnFocus } from "@/lib/script-review/column";
import type { Part } from "@/lib/script-review/types";
import { useMediaQuery } from "./use-media-query";

/** Tailwind's `xl` (80rem): from here the Comments column sits beside the board; below, it opens in a
 *  sheet. In rem, as Tailwind writes it, so this check and the CSS agree at any default font size. */
export const REVIEW_COLUMN_QUERY = "(min-width: 80rem)";

export type ReviewColumnState = {
  focus: ColumnFocus | null;
  /** A marker was pressed: focus its part in the column; `compose` opens its composer. */
  openPart: (part: Part, compose: boolean) => void;
  clearFocus: () => void;
  /** The narrow-screen sheet. */
  columnOpen: boolean;
  setColumnOpen: (open: boolean) => void;
};

/** Spec 4 §4, §6 (review board, 4.16): the column's focus and, below `xl`, its sheet. */
export function useReviewColumn(): ReviewColumnState {
  const wide = useMediaQuery(REVIEW_COLUMN_QUERY);
  const [focus, setFocus] = useState<ColumnFocus | null>(null);
  const [columnOpen, setColumnOpen] = useState(false);
  const openPart = useCallback(
    (part: Part, compose: boolean) => {
      setFocus((f) => ({ part, compose, nonce: (f?.nonce ?? 0) + 1 }));
      if (!wide) setColumnOpen(true);
    },
    [wide],
  );
  const clearFocus = useCallback(() => setFocus(null), []);
  return { focus, openPart, clearFocus, columnOpen, setColumnOpen };
}
