import { describe, expect, it, vi, beforeEach } from "vitest";

const getSession = vi.fn();
vi.mock("./client", () => ({
  createBrowserSupabase: () => ({ auth: { getSession } }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { authFetch } from "./session-ready";

describe("authFetch", () => {
  beforeEach(() => {
    getSession.mockReset();
    fetchMock.mockReset();
  });

  it("waits for the session check to resolve before calling fetch", async () => {
    const order: string[] = [];
    getSession.mockImplementation(async () => {
      order.push("session");
      return { data: { session: null } };
    });
    fetchMock.mockImplementation(async () => {
      order.push("fetch");
      return { ok: true };
    });

    await authFetch("/api/me");

    expect(order).toEqual(["session", "fetch"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/me", undefined);
  });

  it("passes the request input and init through to fetch unchanged", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    fetchMock.mockResolvedValue({ ok: true });

    await authFetch("/api/nodes/1/generate", { method: "POST", body: "x" });

    expect(fetchMock).toHaveBeenCalledWith("/api/nodes/1/generate", { method: "POST", body: "x" });
  });
});
