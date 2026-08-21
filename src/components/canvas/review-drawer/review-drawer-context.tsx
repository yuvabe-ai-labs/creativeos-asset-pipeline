"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

// Same shape as gallery-drawer-context.tsx on purpose — the two drawers should open,
// close and toggle identically, so a reader who knows one knows the other.
type Ctx = {
  open: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

const ReviewDrawerContext = createContext<Ctx | null>(null);

export function ReviewDrawerProvider({
  children,
  initialOpen = false,
}: {
  children: ReactNode;
  // D161: a ?review=1 arrival opens the drawer immediately. The senior followed a count to
  // get here (R5.7), so the list they were following should already be on screen rather
  // than needing one more click to reveal.
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);
  const toggleDrawer = useCallback(() => setOpen((p) => !p), []);

  return (
    <ReviewDrawerContext.Provider value={{ open, openDrawer, closeDrawer, toggleDrawer }}>
      {children}
    </ReviewDrawerContext.Provider>
  );
}

export function useReviewDrawer(): Ctx {
  const ctx = useContext(ReviewDrawerContext);
  if (!ctx) throw new Error("useReviewDrawer must be used inside ReviewDrawerProvider");
  return ctx;
}
