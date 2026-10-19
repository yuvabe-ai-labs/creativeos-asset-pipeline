// src/components/scripts/__tests__/delete-script-copy.test.ts
import { describe, it, expect } from "vitest";
import { deleteDialogCopy } from "../delete-script-copy";
import { SCRIPT_DELETE_BLOCKED, SCRIPT_DELETE_BLOCKS } from "@/lib/scripts/constants";

describe("deleteDialogCopy (D384)", () => {
  it("asks to confirm, and says what goes and that it can't be undone, when nothing blocks", () => {
    expect(deleteDialogCopy(null)).toEqual({
      canDelete: true,
      title: "Delete this script?",
      description: "The brief, the copilot conversation and the storyboard go with it. This can't be undone.",
    });
  });

  it.each(SCRIPT_DELETE_BLOCKS)("explains a %s block instead of offering delete", (block) => {
    expect(deleteDialogCopy(block)).toEqual({
      canDelete: false,
      title: "This script can't be deleted",
      description: SCRIPT_DELETE_BLOCKED[block],
    });
  });
});
