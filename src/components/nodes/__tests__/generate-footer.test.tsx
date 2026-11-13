import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GenerateFooter } from "../generate-footer";
import { TestAccessProvider } from "@/components/permissions/test-access-provider";
import { GENERATE_OFF_REASON } from "@/components/permissions/gated-button";
import { ClientIdProvider } from "@/components/canvas/client-id-context";
import type { Permission } from "@/lib/permissions/model";

const render = (over: Partial<Parameters<typeof GenerateFooter>[0]> = {}, permissions?: readonly Permission[]) =>
  renderToStaticMarkup(
    <TestAccessProvider permissions={permissions}>
      <ClientIdProvider value="c1">
        <GenerateFooter need="generate" label="Re-generate" busy={false} onClick={vi.fn()} disabled={false} credits={605} {...over} />
      </ClientIdProvider>
    </TestAccessProvider>,
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

  it("is disabled with the reason when generating is turned off for the person", () => {
    const html = render({}, ["view"]);
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(text(html)).toContain(GENERATE_OFF_REASON);
  });
});
