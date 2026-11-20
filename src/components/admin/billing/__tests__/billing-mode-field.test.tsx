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

  it("starts free credits at None, with no amount or day filled in", () => {
    const html = renderToStaticMarkup(<FreeCreditsField />);
    expect(html).toContain("Give free credits");
    expect(html).toMatch(hidden("freeGive", ""));
    expect(html).not.toContain('name="freeCredits"');
    expect(html).not.toContain('name="freeUntil"');
  });

  it("marks the chosen option", () => {
    const html = renderToStaticMarkup(
      <SegmentedChoice value="b" options={[{ value: "a", label: "A" }, { value: "b", label: "B" }]} onChange={() => {}} />,
    );
    expect(html.match(/aria-pressed="true"/g)?.length).toBe(1);
    expect(html.indexOf('aria-pressed="true"')).toBeGreaterThan(html.indexOf(">A<"));
  });
});
