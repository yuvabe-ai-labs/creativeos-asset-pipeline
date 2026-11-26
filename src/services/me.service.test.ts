import { describe, it, expect, vi, beforeEach } from "vitest";

const authFetch = vi.fn();
vi.mock("@/lib/supabase/session-ready", () => ({ authFetch: (...a: unknown[]) => authFetch(...a) }));

import { fetchMe } from "./me.service";
import { ApiError, readJson } from "./read-json";
import { onAccessDenied } from "@/lib/permissions/access-signal";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("fetchMe", () => {
  beforeEach(() => authFetch.mockReset());

  it("reads /api/me uncached and returns the payload", async () => {
    authFetch.mockResolvedValue(json(200, { name: "Arun" }));
    expect(await fetchMe()).toEqual({ name: "Arun" });
    expect(authFetch).toHaveBeenCalledWith("/api/me", { cache: "no-store" });
  });

  it("throws an ApiError carrying the status", async () => {
    authFetch.mockResolvedValue(json(500, { error: "Failed to load profile." }));
    await expect(fetchMe()).rejects.toMatchObject({ status: 500, message: "Failed to load profile." });
  });
});

describe("readJson", () => {
  it("reports a 403 before throwing", async () => {
    const listener = vi.fn();
    const off = onAccessDenied(listener);
    await expect(readJson(json(403, { error: "No" }), "x")).rejects.toBeInstanceOf(ApiError);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });
});
