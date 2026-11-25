import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/copilot-messages", () => ({ getCopilotCard: vi.fn(), claimCopilotCard: vi.fn() }));
vi.mock("@/lib/db/signals", () => ({ createSignal: vi.fn() }));
vi.mock("@/lib/journey/thread/load", () => ({ loadThread: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { claimCopilotCard, getCopilotCard } from "@/lib/db/copilot-messages";
import { createSignal } from "@/lib/db/signals";
import { loadThread } from "@/lib/journey/thread/load";
import type { SignalDraftCard } from "@/lib/journey/thread/schema";

// D530: a drafted signal is saved only when a person keeps its card, once, citing only the card's posts.

const M1 = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c33";
const U1 = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c44";
const STATE = { messages: [], live: [], suggestions: [], waiting: null };
const card: SignalDraftCard = {
  kind: "signal-draft", status: "pending", name: "Monsoon rituals", tags: ["monsoon"], description: "Rain at the window.",
  itemIds: ["i1", "i2", "i3"], thumbs: [], signalId: null,
};
const keep = { decision: "keep", name: "Monsoon mornings", tags: ["monsoon", "morning"], description: "Edited.", itemIds: ["i1", "i3"] };
const params = Promise.resolve({ id: "c1", messageId: M1 });
const send = async (body: unknown) => {
  const { POST } = await import("./route");
  return POST(new NextRequest(`http://localhost/api/clients/c1/copilot/signal-drafts/${M1}`, { method: "POST", body: JSON.stringify(body) }), { params });
};

describe("POST /api/clients/:id/copilot/signal-drafts/:messageId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("o1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: U1, orgId: "o1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", slug: "acme", org_id: "o1", kb_status: "ready" } as never);
    vi.mocked(getCopilotCard).mockResolvedValue(card);
    vi.mocked(claimCopilotCard).mockImplementation(async (_c, _m, _k, _f, next) => next as never);
    vi.mocked(createSignal).mockResolvedValue({ id: "s1" } as never);
    vi.mocked(loadThread).mockResolvedValue(STATE);
  });

  it("keeps the edited draft as a signal and marks the card kept", async () => {
    const res = await send(keep);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: STATE, signalId: "s1" });
    expect(createSignal).toHaveBeenCalledWith("c1", { name: "Monsoon mornings", tags: ["monsoon", "morning"], description: "Edited.", itemIds: ["i1", "i3"], createdBy: U1 });
    const calls = vi.mocked(claimCopilotCard).mock.calls;
    expect(calls[0].slice(0, 4)).toEqual(["c1", M1, "signal-draft", "pending"]);
    expect(calls[0][4]).toMatchObject({ status: "kept", name: "Monsoon mornings", itemIds: ["i1", "i3"] });
    expect(calls[1][4]).toMatchObject({ status: "kept", signalId: "s1" });
  });

  it("keeps once: the second call makes no second signal", async () => {
    vi.mocked(getCopilotCard).mockResolvedValue({ ...card, status: "kept", signalId: "s1" });
    const res = await send(keep);
    expect(res.status).toBe(200);
    expect(createSignal).not.toHaveBeenCalled();
  });

  it("makes no signal when another keep won the race", async () => {
    vi.mocked(claimCopilotCard).mockResolvedValue(null);
    expect((await send(keep)).status).toBe(200);
    expect(createSignal).not.toHaveBeenCalled();
  });

  it("refuses an item id that is not on the card", async () => {
    const res = await send({ ...keep, itemIds: ["i1", "foreign"] });
    expect(res.status).toBe(400);
    expect(createSignal).not.toHaveBeenCalled();
    expect(claimCopilotCard).not.toHaveBeenCalled();
  });

  it("refuses a keep with no name", async () => {
    expect((await send({ ...keep, name: "  " })).status).toBe(400);
  });

  it("drop leaves no signal", async () => {
    const res = await send({ decision: "drop" });
    expect(res.status).toBe(200);
    expect(createSignal).not.toHaveBeenCalled();
    expect(vi.mocked(claimCopilotCard).mock.calls[0][4]).toMatchObject({ status: "dropped" });
  });

  it("puts the card back when the signal could not be saved", async () => {
    vi.mocked(createSignal).mockResolvedValue(null);
    const res = await send(keep);
    expect(res.status).toBe(400);
    const back = vi.mocked(claimCopilotCard).mock.calls[1];
    expect(back.slice(0, 4)).toEqual(["c1", M1, "signal-draft", "kept"]);
    expect(back[4]).toEqual(card);
  });
});
