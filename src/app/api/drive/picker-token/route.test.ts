import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/drive/client", () => ({
  exchangeRefreshToken: vi.fn(),
}));

import { exchangeRefreshToken } from "@/lib/drive/client";

describe("GET /api/drive/picker-token", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GDRIVE_CLIENT_ID = "test-client-id";
  });

  it("returns accessToken and clientId", async () => {
    vi.mocked(exchangeRefreshToken).mockResolvedValueOnce("ya29.test");

    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.accessToken).toBe("ya29.test");
    expect(body.clientId).toBe("test-client-id");
  });

  it("returns 500 when token exchange fails", async () => {
    vi.mocked(exchangeRefreshToken).mockRejectedValueOnce(new Error("invalid_grant"));

    const { GET } = await import("./route");
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/Google Drive/i);
  });
});
