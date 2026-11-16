import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/copilot-messages", () => ({ hasCopilotMessages: vi.fn(), insertOpeningIfEmpty: vi.fn() }));
vi.mock("@/lib/journey/kb-copilot/load", () => ({ loadKbContext: vi.fn() }));
vi.mock("@/lib/journey/kb-copilot/context", () => ({ openingMessage: vi.fn(() => "The opening.") }));

import { hasCopilotMessages, insertOpeningIfEmpty } from "@/lib/db/copilot-messages";
import { loadKbContext } from "@/lib/journey/kb-copilot/load";
import { ensureOpening } from "../opening";

const client = { id: "c1" } as never;

describe("ensureOpening", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(loadKbContext).mockResolvedValue({ ctx: {} as never, sources: new Map() });
  });

  it("stores the opening when the thread has nothing in it yet", async () => {
    vi.mocked(hasCopilotMessages).mockResolvedValue(false);
    await ensureOpening(client);
    expect(insertOpeningIfEmpty).toHaveBeenCalledWith("c1", "onboarding", expect.any(String));
  });

  it("reads nothing more and writes nothing when the thread has begun", async () => {
    vi.mocked(hasCopilotMessages).mockResolvedValue(true);
    await ensureOpening(client);
    expect(loadKbContext).not.toHaveBeenCalled();
    expect(insertOpeningIfEmpty).not.toHaveBeenCalled();
  });
});
