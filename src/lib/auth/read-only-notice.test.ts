import { describe, it, expect, vi, beforeEach } from "vitest";

const { toastErrorMock } = vi.hoisted(() => ({ toastErrorMock: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: toastErrorMock } }));

import { notifyIfReadOnlyBlocked } from "./read-only-notice";
import { IMPERSONATION_READ_ONLY_MESSAGE } from "./constants";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("notifyIfReadOnlyBlocked", () => {
  beforeEach(() => vi.clearAllMocks());

  it("toasts when a write is blocked by the impersonation gate", async () => {
    await notifyIfReadOnlyBlocked(
      jsonResponse(403, { error: IMPERSONATION_READ_ONLY_MESSAGE }),
    );
    expect(toastErrorMock).toHaveBeenCalledWith(
      "Editing is disabled",
      expect.objectContaining({ id: "impersonation-read-only" }),
    );
  });

  it("stays silent on a 403 that is some other authorization failure", async () => {
    await notifyIfReadOnlyBlocked(jsonResponse(403, { error: "Forbidden" }));
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("stays silent on success responses", async () => {
    await notifyIfReadOnlyBlocked(jsonResponse(200, { ok: true }));
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it("stays silent on a 403 with a non-JSON body", async () => {
    await notifyIfReadOnlyBlocked(new Response("nope", { status: 403 }));
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  // The caller still needs to read the body itself — clone() is what makes that safe.
  it("leaves the caller's response body unconsumed", async () => {
    const res = jsonResponse(403, { error: IMPERSONATION_READ_ONLY_MESSAGE });
    await notifyIfReadOnlyBlocked(res);
    expect(res.bodyUsed).toBe(false);
    await expect(res.json()).resolves.toEqual({
      error: IMPERSONATION_READ_ONLY_MESSAGE,
    });
  });
});
