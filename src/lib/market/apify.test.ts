import { describe, it, expect, vi } from "vitest";
import { fetchProfileDetails } from "./apify";

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("fetchProfileDetails", () => {
  it("POSTs the profile URL to the sync dataset endpoint with a bearer token", async () => {
    const fetchImpl = mockFetch(201, [{ username: "prakritisattva", followersCount: 144 }]);
    const item = await fetchProfileDetails("prakritisattva", { token: "tok", fetchImpl });
    expect(item?.username).toBe("prakritisattva");
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("apify~instagram-scraper/run-sync-get-dataset-items");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body as string);
    expect(body.directUrls).toEqual(["https://www.instagram.com/prakritisattva/"]);
    expect(body.resultsType).toBe("details");
  });
  it("returns null for an empty dataset", async () => {
    const item = await fetchProfileDetails("nobody", { token: "tok", fetchImpl: mockFetch(201, []) });
    expect(item).toBeNull();
  });
  it("throws on an HTTP error", async () => {
    await expect(
      fetchProfileDetails("x", { token: "tok", fetchImpl: mockFetch(402, { error: "quota" }) }),
    ).rejects.toThrow(/402/);
  });
});
