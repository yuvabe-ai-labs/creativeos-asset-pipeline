import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

const fetchMe = vi.fn();
vi.mock("@/services/me.service", () => ({ fetchMe: () => fetchMe() }));

import { invalidateMe, meKeys, meQueryOptions } from "../me";
import { onAccessDenied, reportStatus } from "@/lib/permissions/access-signal";
import { testMePayload } from "@/lib/me/test-fixtures";
import { ApiError } from "@/services/read-json";

describe("meKeys", () => {
  it("builds the one key", () => {
    expect(meKeys.current()).toEqual(["me", "current"]);
  });
});

describe("a 403 refreshes meKeys.current()", () => {
  it("refetches once however many refused responses arrive together", async () => {
    let resolve: (v: unknown) => void = () => {};
    fetchMe.mockReset().mockImplementation(() => new Promise((r) => { resolve = r; }));
    const client = new QueryClient();
    client.setQueryData(meKeys.current(), testMePayload());
    const unsubscribe = new QueryObserver(client, meQueryOptions()).subscribe(() => {});
    const off = onAccessDenied(() => void invalidateMe(client));

    // One response passes through both authFetch and readJson: two reports.
    reportStatus(403);
    reportStatus(403);
    await vi.waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(1));
    resolve(testMePayload({ name: "Fresh" }));
    await vi.waitFor(() => expect(client.getQueryData<{ name: string }>(meKeys.current())?.name).toBe("Fresh"));
    expect(fetchMe).toHaveBeenCalledTimes(1);

    off();
    unsubscribe();
  });
});

describe("meQueryOptions retry", () => {
  const retry = meQueryOptions().retry as (failureCount: number, error: Error) => boolean;

  it("never retries a refused or missing answer (4xx)", () => {
    expect(retry(0, new ApiError("Password change required", 403))).toBe(false);
    expect(retry(0, new ApiError("Unauthorized", 401))).toBe(false);
  });

  it("retries a failure that may pass once", () => {
    expect(retry(0, new ApiError("Could not load your account.", 500))).toBe(true);
    expect(retry(0, new Error("network"))).toBe(true);
    expect(retry(1, new Error("network"))).toBe(false);
  });
});
