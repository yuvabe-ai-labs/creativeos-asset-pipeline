import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

const fetchMe = vi.fn();
vi.mock("@/services/me.service", () => ({ fetchMe: () => fetchMe() }));

import { invalidateMe, meKeys, meQueryOptions } from "../me";
import { onAccessDenied, reportStatus } from "@/lib/permissions/access-signal";
import { testMePayload } from "@/lib/me/test-fixtures";
import { testOwnerAccess } from "@/lib/permissions/test-fixtures";

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
    client.setQueryData(meKeys.current(), testMePayload(testOwnerAccess()));
    const unsubscribe = new QueryObserver(client, meQueryOptions()).subscribe(() => {});
    const off = onAccessDenied(() => void invalidateMe(client));

    // One response passes through both authFetch and readJson: two reports.
    reportStatus(403);
    reportStatus(403);
    await vi.waitFor(() => expect(fetchMe).toHaveBeenCalledTimes(1));
    resolve(testMePayload(testOwnerAccess(), { name: "Fresh" }));
    await vi.waitFor(() => expect(client.getQueryData<{ name: string }>(meKeys.current())?.name).toBe("Fresh"));
    expect(fetchMe).toHaveBeenCalledTimes(1);

    off();
    unsubscribe();
  });
});
