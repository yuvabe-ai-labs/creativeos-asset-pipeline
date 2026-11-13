// src/components/permissions/__tests__/downloads-come-with-view.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";

// D507: View covers downloads. A person who can see a file can see its client, so no download
// button has a permission of its own.
const SURFACES = [
  "src/components/nodes/image-gen-focus-view.tsx",
  "src/components/nodes/post-focus-view.tsx",
  "src/components/editor/editor-export-dialog.tsx",
  "src/components/editor/editor-render-dialog.tsx",
];

describe("downloads come with View", () => {
  it.each(SURFACES)("%s shows its download without a separate check", (file) => {
    expect(readFileSync(file, "utf8")).not.toMatch(/useCanDownload|Downloading is turned off/);
  });

  it("has no download permission module", () => {
    expect(existsSync("src/lib/permissions/downloads.ts")).toBe(false);
  });
});
