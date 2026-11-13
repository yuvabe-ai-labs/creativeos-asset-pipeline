import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
// The real chokepoint (withCanvas) runs. The caller sees only "other-client"; the canvas belongs
// to "client-1" in the caller's own agency. The canvas must be refused before its context (every
// node on it) is built or sent anywhere.
vi.unmock("@/lib/permissions/server");

const { buildContextMock, openAIMock } = vi.hoisted(() => ({ buildContextMock: vi.fn(), openAIMock: vi.fn() }));
vi.mock("@/lib/dal", async () => {
  const { testAccess } = await import("@/lib/permissions/test-fixtures");
  return {
    resolveCallerContext: vi.fn(async () => ({
      userId: "u1",
      orgId: "org-1",
      access: testAccess({ permissions: ["view", "generate"], clientIds: ["other-client"] }),
    })),
  };
});
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn(async () => ({ isImpersonating: false })) }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: "cv-1", client_id: "client-1", clients: { org_id: "org-1" } }, error: null }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/copilot/context", () => ({ buildCopilotContext: buildContextMock }));
vi.mock("@/lib/openai/server", () => ({ createOpenAI: openAIMock }));

import { POST as chat } from "./route";
import { POST as actions } from "./actions/route";
import { POST as references } from "./references/route";

const post = (body: unknown) => new Request("http://x/api/copilot", { method: "POST", body: JSON.stringify(body) });
const messages = [{ role: "user", content: "what is on this canvas?" }];

describe("copilot refuses a canvas outside the caller's clients", () => {
  beforeEach(() => vi.clearAllMocks());

  for (const [name, call] of [
    ["copilot", () => chat(post({ canvasId: "cv-1", messages }))],
    ["copilot/actions", () => actions(post({ canvasId: "cv-1", messages }))],
    ["copilot/references", () => references(post({ canvasId: "cv-1", message: "hi", reply: "hello" }))],
  ] as const) {
    it(`${name}: 404 before the canvas context is built`, async () => {
      const res = await call();
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Canvas not found." });
      expect(buildContextMock).not.toHaveBeenCalled();
      expect(openAIMock).not.toHaveBeenCalled();
    });
  }
});
