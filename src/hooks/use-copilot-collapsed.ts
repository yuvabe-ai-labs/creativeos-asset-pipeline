"use client";

import { readStoredFlag, useStoredFlag, writeStoredFlag } from "./use-stored-flag";

// Whether a copilot panel is folded to a rail so the page gets the full width, remembered in this
// browser only. One memory per key: per client for the journey panel (journeyFoldKey), and two per
// script (scriptFoldKey). A panel never folded starts as `fallback` says (open unless told).

const storageKey = (key: string) => `creativeos.scriptCopilot.collapsed.${key}`;

export const readCopilotCollapsed = (key: string, fallback = false): boolean => readStoredFlag(storageKey(key), fallback);

export const writeCopilotCollapsed = (key: string, collapsed: boolean): void => writeStoredFlag(storageKey(key), collapsed);

export const useCopilotCollapsed = (key: string, fallback = false) => useStoredFlag(storageKey(key), fallback);
