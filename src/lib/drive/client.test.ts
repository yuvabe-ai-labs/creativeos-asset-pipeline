import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("exchangeRefreshToken", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.GDRIVE_CLIENT_ID = "test-client-id";
    process.env.GDRIVE_CLIENT_SECRET = "test-client-secret";
    process.env.GDRIVE_REFRESH_TOKEN = "test-refresh-token";
  });

  it("returns access token on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: "ya29.test", expires_in: 3600 }),
    });

    const { exchangeRefreshToken } = await import("./client");
    const token = await exchangeRefreshToken();
    expect(token).toBe("ya29.test");
  });

  it("throws when Google returns an error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      text: async () => "invalid_grant",
    });

    const { exchangeRefreshToken } = await import("./client");
    await expect(exchangeRefreshToken()).rejects.toThrow("Drive token exchange failed");
  });

  it("throws when env vars are missing", async () => {
    delete process.env.GDRIVE_CLIENT_ID;

    const { exchangeRefreshToken } = await import("./client");
    await expect(exchangeRefreshToken()).rejects.toThrow("GDRIVE_CLIENT_ID");
  });
});

describe("fetchDriveFileBuffer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns buffer and content-type on success", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: (h: string) => (h === "content-type" ? "image/png" : null) },
      arrayBuffer: async () => fakeBytes.buffer,
    });

    const { fetchDriveFileBuffer } = await import("./client");
    const result = await fetchDriveFileBuffer("file-id-123", "ya29.test");
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(result.contentType).toBe("image/png");
  });

  it("throws when Drive returns 403", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "Forbidden" });

    const { fetchDriveFileBuffer } = await import("./client");
    await expect(fetchDriveFileBuffer("file-id-123", "ya29.test")).rejects.toThrow(
      "Failed to fetch Drive file"
    );
  });
});
