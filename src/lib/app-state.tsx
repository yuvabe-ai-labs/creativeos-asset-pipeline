"use client";

// Increment 1B: in-memory app state via React Context + useState.
// This is deliberately plain React — no Zustand, no DB yet. State lives in this
// component's memory, so it RESETS ON REFRESH (on purpose — you'll feel the gap that
// persistence fills in 1D). In 1C we introduce Zustand for the *canvas* specifically.

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Canvas, Client } from "@/lib/types";

// Readable, URL-friendly id from a name (e.g. "Acme Co." -> "acme-co").
// Used as the in-memory id so routes read like /clients/acme-co/canvases/spring-reel.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Ensure the slug is unique within a scope, suffixing -2, -3… on collision.
function uniqueSlug(name: string, taken: Iterable<string>): string {
  const base = slugify(name) || "item";
  const used = new Set(taken);
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  return slug;
}

type AppState = {
  clients: Client[];
  getClient: (id: string) => Client | undefined;
  addClient: (name: string, contextNotes: string) => Client;
  addCanvas: (clientId: string, name: string) => Canvas | undefined;
};

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);

  const getClient = useCallback(
    (id: string) => clients.find((c) => c.id === id),
    [clients],
  );

  const addClient = useCallback(
    (name: string, contextNotes: string) => {
      const client: Client = {
        id: uniqueSlug(name, clients.map((c) => c.id)),
        name,
        contextNotes,
        canvases: [],
        createdAt: Date.now(),
      };
      setClients((prev) => [...prev, client]);
      return client;
    },
    [clients],
  );

  const addCanvas = useCallback(
    (clientId: string, name: string) => {
      const client = clients.find((c) => c.id === clientId);
      if (!client) return undefined;
      const canvas: Canvas = {
        id: uniqueSlug(name, client.canvases.map((c) => c.id)),
        name,
        createdAt: Date.now(),
      };
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId ? { ...c, canvases: [...c.canvases, canvas] } : c,
        ),
      );
      return canvas;
    },
    [clients],
  );

  const value = useMemo(
    () => ({ clients, getClient, addClient, addCanvas }),
    [clients, getClient, addClient, addCanvas],
  );

  return (
    <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used inside <AppStateProvider>");
  return ctx;
}
