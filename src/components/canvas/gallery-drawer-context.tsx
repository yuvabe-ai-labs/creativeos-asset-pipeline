"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { OpenDrawerOptions } from "./gallery-drawer/types";

type Ctx = {
  open: boolean;
  options: OpenDrawerOptions | null;
  openDrawer: (opts?: OpenDrawerOptions) => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

const GalleryDrawerContext = createContext<Ctx | null>(null);

export function GalleryDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<OpenDrawerOptions | null>(null);

  const openDrawer = useCallback((opts?: OpenDrawerOptions) => {
    setOptions(opts ?? null);
    setOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setOpen(false);
    setOptions(null);
  }, []);

  const toggleDrawer = useCallback(() => {
    setOpen((prev) => {
      if (prev) setOptions(null);
      return !prev;
    });
  }, []);

  return (
    <GalleryDrawerContext.Provider
      value={{ open, options, openDrawer, closeDrawer, toggleDrawer }}
    >
      {children}
    </GalleryDrawerContext.Provider>
  );
}

export function useGalleryDrawer(): Ctx {
  const ctx = useContext(GalleryDrawerContext);
  if (!ctx)
    throw new Error("useGalleryDrawer must be used inside GalleryDrawerProvider");
  return ctx;
}
