import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const catalog = vi.hoisted(() => ({ isPending: false }));
vi.mock("@/hooks/queries/ai-models", () => ({ useAiCatalog: () => catalog }));

import { AvatarCreditCost } from "../avatar-credit-cost";

describe("AvatarCreditCost (D557)", () => {
  it("shows the credits", () => {
    expect(renderToStaticMarkup(<AvatarCreditCost credits={1250} />)).toContain("1,250");
  });
  it("shows a spinner, not a number, while the prices load", () => {
    catalog.isPending = true;
    const html = renderToStaticMarkup(<AvatarCreditCost credits={null} />);
    expect(html).toContain('aria-label="Working out the cost"');
    expect(html).toContain("animate-spin");
    catalog.isPending = false;
  });
  it("shows nothing for a model with no price once loaded", () => {
    expect(renderToStaticMarkup(<AvatarCreditCost credits={null} />)).toBe("");
  });
});
