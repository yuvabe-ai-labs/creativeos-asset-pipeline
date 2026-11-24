import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/copilot-messages", () => ({ getCopilotCard: vi.fn() }));
vi.mock("@/lib/journey/market-copilot/start", () => ({ confirmBrands: vi.fn() }));
vi.mock("@/lib/journey/thread/load", () => ({ loadThread: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getCopilotCard } from "@/lib/db/copilot-messages";
import { confirmBrands } from "@/lib/journey/market-copilot/start";
import { loadThread } from "@/lib/journey/thread/load";
import type { BrandsCard } from "@/lib/journey/thread/schema";

// D530: a person confirms a brands card with its button. Confirming acts once; a handle that is not
// on the card is refused.

const M1 = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c33";
const U1 = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c44";
const STATE = { messages: [], live: [], suggestions: [], waiting: null };
const card: BrandsCard = {
  kind: "brands", status: "pending", focus: null, jobId: null,
  brands: [
    { handle: "minimalist", name: "Minimalist", why: "w", group: "direct", keep: true },
    { handle: "sleepyowl", name: "Sleepy Owl", why: "w", group: "adjacent", keep: true },
  ],
};
const params = Promise.resolve({ id: "c1", messageId: M1 });
const send = async (body: unknown) => {
  const { POST } = await import("./route");
  return POST(new NextRequest(`http://localhost/api/clients/c1/copilot/brands/${M1}`, { method: "POST", body: JSON.stringify(body) }), { params });
};

describe("POST /api/clients/:id/copilot/brands/:messageId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("o1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: U1, orgId: "o1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", slug: "acme", org_id: "o1", kb_status: "ready", market_status: "pending" } as never);
    vi.mocked(getCopilotCard).mockResolvedValue(card);
    vi.mocked(confirmBrands).mockResolvedValue({ status: "started", jobId: "j1" });
    vi.mocked(loadThread).mockResolvedValue(STATE);
  });

  it("starts the fetch for the handles kept and returns the thread", async () => {
    const res = await send({ keep: ["sleepyowl"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: STATE });
    expect(confirmBrands).toHaveBeenCalledWith({ client: expect.objectContaining({ id: "c1" }), userId: U1, messageId: M1, card, keep: ["sleepyowl"] });
  });

  it("confirms once: the second call gets the settled thread and starts no job", async () => {
    vi.mocked(getCopilotCard).mockResolvedValue({ ...card, status: "fetching" });
    const res = await send({ keep: ["sleepyowl"] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: STATE });
    expect(confirmBrands).not.toHaveBeenCalled();
  });

  it("returns the settled thread when another confirm won the race", async () => {
    vi.mocked(confirmBrands).mockResolvedValue({ status: "moved" });
    expect((await send({ keep: ["sleepyowl"] })).status).toBe(200);
  });

  it("refuses a handle that is not on the card", async () => {
    const res = await send({ keep: ["sleepyowl", "intruder"] });
    expect(res.status).toBe(400);
    expect(confirmBrands).not.toHaveBeenCalled();
  });

  it("refuses an empty list", async () => {
    expect((await send({ keep: [] })).status).toBe(400);
  });

  it("is 404 for a card that is not in this client's thread", async () => {
    vi.mocked(getCopilotCard).mockResolvedValue(null);
    expect((await send({ keep: ["sleepyowl"] })).status).toBe(404);
  });

  it("is 409 while another market job runs", async () => {
    vi.mocked(confirmBrands).mockResolvedValue({ status: "running" });
    expect((await send({ keep: ["sleepyowl"] })).status).toBe(409);
  });

  it("is 409 before the brand KB is approved", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", slug: "acme", org_id: "o1", kb_status: "in_review" } as never);
    expect((await send({ keep: ["sleepyowl"] })).status).toBe(409);
  });
});
