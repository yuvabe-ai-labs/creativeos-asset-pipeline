import { describe, it, expect, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("@/lib/supabase/get-user-with-retry", () => ({ getUserWithRetry: vi.fn() }));

import { config } from "./proxy";

// The matcher is a regex source; a path the regex does NOT match skips the session check.
const runsProxy = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

describe("proxy matcher (D307)", () => {
  it("skips the session check for the public review page and API", () => {
    expect(runsProxy("/r/abc")).toBe(false);
    expect(runsProxy("/api/r/abc")).toBe(false);
    expect(runsProxy("/api/r/abc/comments/c1")).toBe(false);
  });
  it("still gates everything else, including look-alike paths", () => {
    expect(runsProxy("/review")).toBe(true);
    expect(runsProxy("/api/review/inbox")).toBe(true);
    expect(runsProxy("/clients/x")).toBe(true);
    expect(runsProxy("/api/nodes/n/client-review")).toBe(true);
  });
  it("keeps the existing exemptions", () => {
    expect(runsProxy("/login")).toBe(false);
    expect(runsProxy("/api/webhooks/trigger")).toBe(false);
  });
});
