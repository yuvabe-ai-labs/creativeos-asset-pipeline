import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/profiles", () => ({ resolveDisplayNames: vi.fn() }));
vi.mock("@/lib/db/kb", () => ({ readKBFieldValues: vi.fn(), patchKBFields: vi.fn() }));
vi.mock("@/lib/db/copilot-messages", () => ({ getCopilotMessage: vi.fn(), claimChangeCard: vi.fn(), setMessageCard: vi.fn() }));
vi.mock("@/lib/journey/thread/load", () => ({ loadThread: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { resolveDisplayNames } from "@/lib/db/profiles";
import { patchKBFields, readKBFieldValues } from "@/lib/db/kb";
import { claimChangeCard, getCopilotMessage, setMessageCard } from "@/lib/db/copilot-messages";
import { loadThread } from "@/lib/journey/thread/load";
import type { ChangeCard } from "@/lib/journey/thread/schema";

const V1 = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c11";
const M1 = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c33";
const U1 = "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c44";
const TONE = "brand_profile.tone_of_voice";
const WORDS = "compliance.never_use_words";
const STATE = { messages: [], live: [], suggestions: [], waiting: null };
const card: ChangeCard = {
  kind: "change", versionId: V1, status: "pending", decision: null,
  fields: [
    { path: TONE, label: "Tone", before: "Warm", after: "Plain", from: "You, in this chat", docId: null },
    { path: WORDS, label: "Words", before: ["cheap"], after: ["cheap", "chemical-free"], from: "guide.pdf", docId: "d1" },
  ],
};
const params = Promise.resolve({ id: "c1", messageId: M1 });
const send = async (body: unknown) => {
  const { POST } = await import("./route");
  return POST(new NextRequest(`http://localhost/api/clients/c1/copilot/changes/${M1}`, { method: "POST", body: JSON.stringify(body) }), { params });
};
const claimed = () => vi.mocked(claimChangeCard).mock.calls[0]?.[2] as ChangeCard | undefined;

describe("POST /api/clients/:id/copilot/changes/:messageId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("o1");
    vi.mocked(resolveCallerContext).mockResolvedValue({ userId: U1, orgId: "o1" } as never);
    vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", slug: "acme", org_id: "o1", kb_status: "ready", active_kb_version_id: V1 } as never);
    vi.mocked(resolveDisplayNames).mockResolvedValue(new Map([[U1, "Cyril"]]));
    vi.mocked(getCopilotMessage).mockResolvedValue({ id: M1, role: "assistant", content: "", card, attachments: [], suggestions: [], createdAt: "" });
    vi.mocked(readKBFieldValues).mockResolvedValue({ [TONE]: "Warm", [WORDS]: ["cheap"] });
    vi.mocked(claimChangeCard).mockResolvedValue(true);
    vi.mocked(loadThread).mockResolvedValue(STATE);
  });

  it("applies the kept fields, records who approved, and leaves kb_status alone", async () => {
    const res = await send({ decision: "approve", keep: [TONE] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: STATE });
    expect(patchKBFields).toHaveBeenCalledWith(V1, [
      { path: ["brand_profile", "tone_of_voice"], patch: { value: "Plain", status: "approved", evidence_type: "explicit", confidence: "high" } },
    ]);
    expect(claimed()).toMatchObject({ status: "applied", decision: { by: "Cyril", byId: U1, kept: [TONE], outOfDate: [] } });
  });

  it("discards: writes nothing to the KB, and records who discarded", async () => {
    const res = await send({ decision: "discard" });
    expect(res.status).toBe(200);
    expect(patchKBFields).not.toHaveBeenCalled();
    expect(claimed()).toMatchObject({ status: "discarded", decision: { by: "Cyril", kept: [] } });
  });

  it("applies a card once when two approvals race", async () => {
    vi.mocked(claimChangeCard).mockResolvedValue(false);
    const res = await send({ decision: "approve", keep: [TONE] });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("That change was already settled.");
    expect(patchKBFields).not.toHaveBeenCalled();
  });

  it("refuses a card that is no longer pending without claiming it", async () => {
    vi.mocked(getCopilotMessage).mockResolvedValue({ id: M1, role: "assistant", content: "", card: { ...card, status: "applied" }, attachments: [], suggestions: [], createdAt: "" });
    expect((await send({ decision: "discard" })).status).toBe(409);
    expect(claimChangeCard).not.toHaveBeenCalled();
  });

  it("does not overwrite a field changed by hand since, and records it as out of date", async () => {
    vi.mocked(readKBFieldValues).mockResolvedValue({ [TONE]: "Typed by hand", [WORDS]: ["cheap"] });
    await send({ decision: "approve", keep: [TONE, WORDS] });
    expect(vi.mocked(patchKBFields).mock.calls[0][1].map((p) => p.path.join("."))).toEqual([WORDS]);
    expect(claimed()).toMatchObject({ status: "applied", decision: { kept: [WORDS], outOfDate: [TONE] } });
  });

  it("marks the card stale and writes nothing when the active KB is another version", async () => {
    vi.mocked(getClientById).mockResolvedValue({ id: "c1", slug: "acme", org_id: "o1", active_kb_version_id: "v2" } as never);
    const res = await send({ decision: "approve", keep: [TONE] });
    expect(res.status).toBe(200);
    expect(patchKBFields).not.toHaveBeenCalled();
    expect(readKBFieldValues).not.toHaveBeenCalled();
    expect(claimed()).toMatchObject({ status: "stale", decision: { kept: [] } });
  });

  it("writes nothing, and says so, when every kept field was changed by hand since", async () => {
    vi.mocked(readKBFieldValues).mockResolvedValue({ [TONE]: "Typed", [WORDS]: ["typed"] });
    await send({ decision: "approve", keep: [TONE, WORDS] });
    expect(patchKBFields).not.toHaveBeenCalled();
    expect(claimed()).toMatchObject({ status: "applied", decision: { kept: [], outOfDate: [TONE, WORDS] } });
  });

  it("puts the card back as pending when the write fails, so it can be tried again", async () => {
    vi.mocked(patchKBFields).mockRejectedValue(new Error("down"));
    const res = await send({ decision: "approve", keep: [TONE] });
    expect(res.status).toBe(500);
    expect(setMessageCard).toHaveBeenCalledWith("c1", M1, card);
  });

  it("refuses a message that is not a change card on this client's thread", async () => {
    vi.mocked(getCopilotMessage).mockResolvedValue(null);
    expect((await send({ decision: "discard" })).status).toBe(404);
    vi.mocked(getCopilotMessage).mockResolvedValue({ id: M1, role: "assistant", content: "", card: { kind: "note" }, attachments: [], suggestions: [], createdAt: "" });
    expect((await send({ decision: "discard" })).status).toBe(404);
  });

  it("refuses a body that is neither approve nor discard", async () => {
    expect((await send({ decision: "maybe" })).status).toBe(400);
    expect((await send({ decision: "approve" })).status).toBe(400);
    expect(claimChangeCard).not.toHaveBeenCalled();
  });
});
