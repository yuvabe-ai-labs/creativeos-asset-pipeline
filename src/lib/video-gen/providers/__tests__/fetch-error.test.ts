import { describe, it, expect } from "vitest";
import { describeFetchError } from "../fetch-error";

describe("describeFetchError", () => {
  it("unwraps the cause chain undici hides behind 'fetch failed'", () => {
    const socket = Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" });
    const err = new TypeError("fetch failed", { cause: socket });
    const out = describeFetchError(err);
    expect(out).toContain("fetch failed");
    expect(out).toContain("other side closed");
    expect(out).toContain("UND_ERR_SOCKET");
  });

  it("reports the code of a DNS failure", () => {
    const dns = Object.assign(new Error("getaddrinfo ENOTFOUND host"), { code: "ENOTFOUND" });
    expect(describeFetchError(new TypeError("fetch failed", { cause: dns }))).toContain("ENOTFOUND");
  });

  it("handles an error with no cause", () => {
    expect(describeFetchError(new Error("plain"))).toBe("plain");
  });

  it("handles a non-Error throw", () => {
    expect(describeFetchError("boom")).toBe("boom");
  });

  it("terminates on a self-referential cause chain", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    a.cause = a;
    expect(describeFetchError(a)).toBe("a");
  });
});
