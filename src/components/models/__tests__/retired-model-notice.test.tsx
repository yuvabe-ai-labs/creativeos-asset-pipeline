import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RetiredModelNotice } from "../retired-model-notice";

// No DOM in this suite (node environment, no @testing-library): the markup is asserted, and the
// Dismiss click is not exercised.
describe("RetiredModelNotice", () => {
  it("says the model was retired, without naming it, and offers Dismiss", () => {
    const html = renderToStaticMarkup(<RetiredModelNotice retiredModelId="openai:gpt-image-1" onDismiss={vi.fn()} />);
    expect(html).toContain("This model was retired. Pick another.");
    expect(html).not.toContain("gpt-image-1");
    expect(html).toContain('aria-label="Dismiss"');
    expect(html).toMatch(/<button/);
  });

  it("renders nothing without a retired model", () => {
    expect(renderToStaticMarkup(<RetiredModelNotice retiredModelId={undefined} onDismiss={() => {}} />)).toBe("");
  });
});
