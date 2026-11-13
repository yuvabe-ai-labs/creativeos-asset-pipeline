// src/lib/permissions/legacy-need.test.ts
import { describe, it, expect } from "vitest";
import { actionForNeed } from "./legacy-need";

// Spec §4.3's table, for the one commit in which routes still name the old keys.
describe("actionForNeed", () => {
  it("keeps a plain action as it is", () => {
    expect(actionForNeed("approve")).toBe("approve");
    expect(actionForNeed("manage_team")).toBe("manage_team");
  });

  it("reads an area key as its level", () => {
    expect(actionForNeed("scripts.view")).toBe("view");
    expect(actionForNeed("canvases.edit")).toBe("edit");
    expect(actionForNeed("video_generation.generate")).toBe("generate");
    expect(actionForNeed("scripts.approve")).toBe("approve");
    expect(actionForNeed("client_review.share")).toBe("share");
    expect(actionForNeed("canvases.delete")).toBe("delete");
    expect(actionForNeed("downloads.share")).toBe("view");
  });

  it("reads the agency areas as the owner-only actions", () => {
    expect(actionForNeed("clients.edit")).toBe("manage_clients");
    expect(actionForNeed("clients.delete")).toBe("manage_clients");
    expect(actionForNeed("credits.view")).toBe("view_credits");
    expect(actionForNeed("team.edit")).toBe("manage_team");
  });
});
