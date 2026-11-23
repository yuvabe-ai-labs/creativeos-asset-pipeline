// src/components/admin/__tests__/credit-limit-field.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CreditLimitField } from "../credit-limit-field";
import { CreditLimitToggle } from "../credit-limit-toggle";

describe("CreditLimitField (Add an agency)", () => {
  it("starts Unlimited: the two choices, no amount box, and a blank limit sent with the form", () => {
    const html = renderToStaticMarkup(<CreditLimitField />);
    expect(html).toContain("Monthly credit limit");
    expect(html).toContain("Unlimited");
    expect(html).toContain("Set limit");
    expect(html).not.toContain("e.g. 500");
    expect(html).toMatch(/<input[^>]*type="hidden"[^>]*name="creditLimit"[^>]*value=""|<input[^>]*name="creditLimit"[^>]*type="hidden"[^>]*value=""/);
  });
});

describe("CreditLimitToggle (shared with the agency page's editor)", () => {
  it("marks the chosen side", () => {
    const unlimited = renderToStaticMarkup(<CreditLimitToggle mode="unlimited" onUnlimited={() => {}} onSet={() => {}} />);
    const set = renderToStaticMarkup(<CreditLimitToggle mode="set" onUnlimited={() => {}} onSet={() => {}} />);
    expect(unlimited).not.toEqual(set);
    expect(unlimited).toContain('aria-pressed="true"');
    expect(unlimited.indexOf('aria-pressed="true"')).toBeLessThan(unlimited.indexOf("Set limit"));
    expect(set.indexOf('aria-pressed="true"')).toBeGreaterThan(set.indexOf("Unlimited"));
  });
});
