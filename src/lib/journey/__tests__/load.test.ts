import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/clients", () => ({ getClientBySlug: vi.fn() }));
vi.mock("@/lib/dal", () => ({ resolveOrgId: vi.fn() }));

import { getClientBySlug } from "@/lib/db/clients";
import { resolveOrgId } from "@/lib/dal";
import { loadFrameClient } from "../load";

const row = (over: Record<string, unknown> = {}) =>
  ({ id: "c1", slug: "chupps", name: "Chupps", org_id: "org-1", kb_status: "ready", market_status: "pending", ...over }) as never;

describe("loadFrameClient", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  });

  it("gives the frame what it draws, and nothing else from the row", async () => {
    vi.mocked(getClientBySlug).mockResolvedValue(row());
    expect(await loadFrameClient("chupps")).toEqual({
      client: { id: "c1", slug: "chupps", name: "Chupps", kbStatus: "ready" },
      state: { kb: "approved", market: "in_progress", scripts: "locked" },
    });
  });

  it("is null for a slug that does not exist", async () => {
    vi.mocked(getClientBySlug).mockResolvedValue(null);
    expect(await loadFrameClient("nope")).toBeNull();
  });

  it("is null for a client outside the caller's org, so the tabs never name it", async () => {
    vi.mocked(getClientBySlug).mockResolvedValue(row({ org_id: "org-2" }));
    expect(await loadFrameClient("chupps")).toBeNull();
  });
});
