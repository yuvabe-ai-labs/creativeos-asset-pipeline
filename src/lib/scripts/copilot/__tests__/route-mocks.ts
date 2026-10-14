// Shared by the Generate route tests (Tasks 8 and 9). Not a test file itself.
import { vi } from "vitest";
import { NextRequest } from "next/server";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { EMPTY_BRIEF, EMPTY_NOTES, type GenerateScript, type GenerateState } from "../schema";
import type { Change } from "../change";

export const SCRIPT_ID = "6f1c2b1e-0000-4000-8000-000000000001";
export const AVATAR_ID = "7a2d3c4e-0000-4000-8000-000000000002";
export const reel01Doc = () => scriptDocSchema.parse(reel01);

export function generateScript(over: Partial<GenerateScript> = {}): GenerateScript {
  return { id: SCRIPT_ID, clientId: "c1", stage: "generate", doc: null, brief: EMPTY_BRIEF, notes: EMPTY_NOTES, docVersion: 1, createdAt: "t", updatedAt: "t", ...over };
}

export function stateOf(script: GenerateScript): GenerateState {
  return { script, messages: [], openItems: [], avatars: [], formats: [] };
}

/** A stand-in for changeGenerateScript that runs the change once against `current`. */
export function runChangeAgainst(current: GenerateScript) {
  return async <T,>(_clientId: string, _scriptId: string, change: (c: GenerateScript) => Change<T>) => {
    const decided = change(current);
    if ("error" in decided) return decided;
    const script = decided.patch ? { ...current, ...decided.patch, docVersion: current.docVersion + 1 } : current;
    return { script, result: decided.result };
  };
}

export function jsonRequest(url: string, method: string, body?: unknown) {
  return new NextRequest(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}

/** The auth mocks every withClient route test needs (as spec 1's route tests). */
export async function allowClient() {
  const { resolveCallerContext, resolveOrgId } = await import("@/lib/dal");
  const { resolveImpersonationState } = await import("@/lib/auth/impersonation");
  const { getClientById } = await import("@/lib/db/clients");
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "user-1", orgId: "org-1" } as never);
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
}
