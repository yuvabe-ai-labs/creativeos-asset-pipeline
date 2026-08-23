import { describe, it, expect } from "vitest";
import { parsePageParams, MAX_PAGE_SIZE, FALLBACK_PAGE_SIZE } from "./page-params";

const params = (q: string) => new URLSearchParams(q);

describe("parsePageParams", () => {
  it("defaults when absent", () => {
    expect(parsePageParams(params(""))).toEqual({
      limit: FALLBACK_PAGE_SIZE,
      offset: 0,
    });
  });

  it("reads valid values", () => {
    expect(parsePageParams(params("limit=10&offset=30"))).toEqual({ limit: 10, offset: 30 });
  });

  it("clamps limit to the maximum — an unbounded limit is unbounded server work", () => {
    expect(parsePageParams(params("limit=100000")).limit).toBe(MAX_PAGE_SIZE);
  });

  it("rejects a negative or zero limit", () => {
    expect(parsePageParams(params("limit=-5")).limit).toBe(FALLBACK_PAGE_SIZE);
    expect(parsePageParams(params("limit=0")).limit).toBe(FALLBACK_PAGE_SIZE);
  });

  it("rejects a negative offset — .range() throws on one", () => {
    expect(parsePageParams(params("offset=-1")).offset).toBe(0);
  });

  it("ignores non-numeric junk", () => {
    expect(parsePageParams(params("limit=abc&offset=xyz"))).toEqual({
      limit: FALLBACK_PAGE_SIZE,
      offset: 0,
    });
  });

  it("floors fractional values", () => {
    expect(parsePageParams(params("limit=10.9&offset=5.7"))).toEqual({
      limit: 10,
      offset: 5,
    });
  });
});
