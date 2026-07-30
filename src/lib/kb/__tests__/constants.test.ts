import { describe, it, expect } from "vitest";
import { KB_DOC_PER_FILE_LIMIT_BYTES, KB_DOC_SIZE_LIMIT_BYTES } from "../constants";

describe("KB constants", () => {
  it("per-file limit is 1 MB", () => {
    expect(KB_DOC_PER_FILE_LIMIT_BYTES).toBe(1 * 1024 * 1024);
  });

  it("per-file limit is smaller than per-client limit", () => {
    expect(KB_DOC_PER_FILE_LIMIT_BYTES).toBeLessThan(KB_DOC_SIZE_LIMIT_BYTES);
  });
});
