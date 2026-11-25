"use client";

import { useStoredFlag } from "./use-stored-flag";

/** The copilot panel's developer switch (turn traces, D521): off by default, remembered per browser.
 *  It keeps the panel tidy; it is not a permission. */
export const useCopilotDeveloper = () => useStoredFlag("creativeos.copilot.developer", false);
