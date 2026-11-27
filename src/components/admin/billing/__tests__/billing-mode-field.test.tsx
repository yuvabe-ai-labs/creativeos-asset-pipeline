import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BillingModeField } from "../billing-mode-field";
import { FreeCreditsField } from "../free-credits-field";
import { SegmentedChoice } from "../segmented-choice";

const hidden = (name: string, value: string) =>
  new RegExp(`<input(?=[^>]*type="hidden")(?=[^>]*name="${name}")(?=[^>]*value="${value}")[^>]*>`);

describe("Add an agency: billing", () => {
  it("starts managed by Yuvabe, with the monthly credit limit and no free credits", () => {
    const html = renderToStaticMarkup(<BillingModeField />);
    expect(html).toContain("Pays for a plan");
    expect(html).toContain("Managed by Yuvabe");
    expect(html).toMatch(hidden("billingMode", "managed"));
    expect(html).toContain("Monthly credit limit");
    expect(html).not.toContain("Free credits to start");
  });

  it("starts with no free credits: an empty amount, no date until an amount is typed, nothing given", () => {
    const html = renderToStaticMarkup(<FreeCreditsField />);
    expect(html).toContain("Free credits");
    expect(html).toContain('placeholder="None"');
    expect(html).not.toContain("Expires at");
    expect(html).toMatch(hidden("freeGive", ""));
    expect(html).not.toContain("Last day");
  });

  it("explains nothing under the fields", () => {
    const html = renderToStaticMarkup(<BillingModeField />);
    expect(html).not.toContain("Yuvabe pays. The agency is never charged.");
  });

  it("marks the chosen option", () => {
    const html = renderToStaticMarkup(
      <SegmentedChoice value="b" options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} onChange={() => {}} />,
    );
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1);
    expect(html.indexOf('aria-pressed="true"')).toBeGreaterThan(html.indexOf(">A<"));
  });
});
