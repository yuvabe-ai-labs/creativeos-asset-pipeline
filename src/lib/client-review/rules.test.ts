import { describe, it, expect } from "vitest";
import { clientReviewAddState, soleClientReviewId } from "./rules";

const review = (id: string) => ({ id, type: "client-review" });
const other = { id: "p", type: "prompt" };

describe("clientReviewAddState (D495, D499)", () => {
  it("adds when the canvas has no review node", () => {
    expect(clientReviewAddState([other])).toBe("add");
    expect(clientReviewAddState([])).toBe("add");
  });

  it("opens the one there is", () => {
    expect(clientReviewAddState([other, review("a")])).toBe("open");
  });

  it("is blocked on an older canvas with several", () => {
    expect(clientReviewAddState([review("a"), other, review("b")])).toBe("blocked");
  });
});

describe("soleClientReviewId", () => {
  it("is the id only when there is exactly one", () => {
    expect(soleClientReviewId([other, review("a")])).toBe("a");
    expect(soleClientReviewId([other])).toBeNull();
    expect(soleClientReviewId([review("a"), review("b")])).toBeNull();
  });
});
