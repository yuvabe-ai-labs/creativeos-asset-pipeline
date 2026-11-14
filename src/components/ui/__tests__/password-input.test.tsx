import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { PasswordInput } from "../password-input";

describe("PasswordInput", () => {
  it("is a hidden password field with a show/hide eye inside the field's group", () => {
    const html = renderToStaticMarkup(<PasswordInput id="password" name="password" autoComplete="new-password" />);
    expect(html).toContain('type="password"');
    expect(html).toContain('name="password"');
    expect(html).toMatch(/autocomplete="new-password"/i);
    expect(html).toContain('aria-label="Show password"');
    expect(html).toContain('data-slot="input-group"');
  });

  it("is the one used by the sign-in and invite sign-up forms", () => {
    for (const file of ["src/app/login/login-form.tsx", "src/app/invite/[token]/invite-sign-up-form.tsx"]) {
      expect(readFileSync(file, "utf8")).toContain("<PasswordInput");
    }
  });
});
