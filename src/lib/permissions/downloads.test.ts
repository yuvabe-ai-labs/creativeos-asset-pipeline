import { describe, it, expect } from "vitest";
import { testAccess } from "./test-fixtures";
import { canDownload } from "./downloads";

const ability = (keys: Parameters<typeof testAccess>[0]["keys"]) => testAccess({ keys, clientIds: ["c1"] }).ability;

describe("canDownload", () => {
  it("downloads.view: approved finals only", () => {
    expect(canDownload(ability(["downloads.view"]), "c1", true)).toBe(true);
    expect(canDownload(ability(["downloads.view"]), "c1", false)).toBe(false);
  });

  it("downloads.share: anything, drafts included", () => {
    expect(canDownload(ability(["downloads.share"]), "c1", false)).toBe(true);
    expect(canDownload(ability(["downloads.share"]), "c1", true)).toBe(true);
  });

  it("neither, or a client outside the list: nothing", () => {
    expect(canDownload(ability([]), "c1", true)).toBe(false);
    expect(canDownload(ability(["downloads.share"]), "c2", false)).toBe(false);
  });
});
