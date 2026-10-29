import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GenerateFooter } from "../generate-footer";

const render = (over: Partial<Parameters<typeof GenerateFooter>[0]> = {}) =>
  renderToStaticMarkup(
    <GenerateFooter label="Re-generate" busy={false} onClick={vi.fn()} disabled={false} credits={605} {...over} />,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// D435 — one Generate for every node: pinned at the column's foot, full width, with its estimate.
describe("GenerateFooter", () => {
  it("is pinned to the foot of the column, full width, with the estimate", () => {
    const html = render();
    expect(html).toMatch(/class="[^"]*sticky bottom-0[^"]*mt-auto/);
    expect(html).toMatch(/<button[^>]*class="[^"]*w-full/);
    expect(text(html)).toContain("Re-generate");
    expect(text(html)).toContain("Est. 605 credits");
  });

  it("shows the busy label without the estimate, and stays disabled", () => {
    const html = render({ busy: true, busyLabel: "Changing voice…", disabled: true });
    expect(text(html)).toContain("Changing voice…");
    expect(text(html)).not.toContain("Est.");
    expect(html).toMatch(/<button[^>]*disabled=""/);
  });
});
