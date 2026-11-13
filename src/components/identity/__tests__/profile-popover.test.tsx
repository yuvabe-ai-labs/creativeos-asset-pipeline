// src/components/identity/__tests__/profile-popover.test.tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The popover's content is portaled and unmounted while closed, so static markup can't show it;
// this pins the facts in its source (plan 2 Task 11's test, now for the five-permission model).
describe("ProfilePopover", () => {
  const source = readFileSync("src/components/identity/profile-popover.tsx", "utf8");

  it("shows Owner or Member in the workspace row, never a preset or old role", () => {
    expect(source).toContain('isOwner ? "Owner" : "Member"');
    expect(source).not.toMatch(/ROLE_LABELS|orgRole|presetName|Senior|Designer/);
  });

  it("opens the credits channel only when credit figures are shown (the owner)", () => {
    expect(source).toMatch(/if \(!hydrated \|\| !orgId \|\| !showCredits\) return;/);
  });
});
