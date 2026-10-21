// src/components/script-review/__tests__/scope-note.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScopeNote } from "../scope-note";

describe("ScopeNote (D385)", () => {
  it("says what a partial share holds, without putting approval off until later", () => {
    const script = renderToStaticMarkup(<ScopeNote scope="script" />);
    const avatars = renderToStaticMarkup(<ScopeNote scope="avatars" />);
    expect(script).toContain("This share is the script only.");
    expect(avatars).toContain("This share is the script and the avatars.");
    for (const html of [script, avatars]) expect(html).not.toMatch(/approve/i);
  });

  it("shows nothing on a full share", () => {
    expect(renderToStaticMarkup(<ScopeNote scope="panels" />)).toBe("");
  });
});
