"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CastMember } from "@/lib/scripts/schema";

/** Spec 2 §3 — present only in the Generate workspace. Without it the script view is read-only and
 *  renders exactly as spec 1 drew it. Paths are those of src/lib/scripts/copilot/fields.ts. */
export type ScriptEdit = {
  /** Save what the person typed into one field. */
  commit: (path: string, value: string) => void;
  /** The control under each cast member (the avatar link, spec 2 §4.4). */
  castControl?: (member: CastMember) => ReactNode;
  /** The field an inline AI edit is working on, shown as busy. */
  busyPath: string | null;
};

const ScriptEditContext = createContext<ScriptEdit | null>(null);

export function ScriptEditProvider({ value, children }: { value: ScriptEdit; children: ReactNode }) {
  return <ScriptEditContext.Provider value={value}>{children}</ScriptEditContext.Provider>;
}

export function useScriptEdit(): ScriptEdit | null {
  return useContext(ScriptEditContext);
}
