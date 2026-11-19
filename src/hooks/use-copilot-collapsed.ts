"use client";

import { readStoredFlag, useStoredFlag, writeStoredFlag } from "./use-stored-flag";

// Whether a copilot panel is folded to a rail so the page gets the full width. Remembered per script
// (or per client, for the journey panel) in this browser only; one never folded starts open.

const key = (scriptId: string) => `creativeos.scriptCopilot.collapsed.${scriptId}`;

export const readCopilotCollapsed = (scriptId: string): boolean => readStoredFlag(key(scriptId), false);

export const writeCopilotCollapsed = (scriptId: string, collapsed: boolean): void => writeStoredFlag(key(scriptId), collapsed);

export const useCopilotCollapsed = (scriptId: string) => useStoredFlag(key(scriptId), false);
