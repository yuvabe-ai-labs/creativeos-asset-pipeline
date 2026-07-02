import { describe, it, expect } from "vitest";
import { deleteConfirmCopy } from "./delete-confirm";

describe("deleteConfirmCopy", () => {
  it("uses singular copy for a single node", () => {
    expect(deleteConfirmCopy(1).title).toBe("Delete this node?");
  });

  it("uses plural copy with the count for multiple nodes", () => {
    expect(deleteConfirmCopy(3).title).toBe("Delete 3 nodes?");
  });

  it("warns that connected links are removed too", () => {
    expect(deleteConfirmCopy(1).description).toMatch(/links/i);
    expect(deleteConfirmCopy(4).description).toMatch(/links/i);
  });

  it("falls back to singular copy for a count of one or less", () => {
    expect(deleteConfirmCopy(0).title).toBe("Delete this node?");
  });
});
