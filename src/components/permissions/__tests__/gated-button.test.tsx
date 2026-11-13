import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Permission } from "@/lib/permissions/model";
import { GatedButton, GENERATE_OFF_REASON } from "../gated-button";
import { TestAccessProvider } from "../test-access-provider";

const render = (permissions: readonly Permission[], props: { disabled?: boolean; disabledReason?: string | null } = {}, clientId = "c1") =>
  renderToStaticMarkup(
    <TestAccessProvider permissions={permissions} clientIds={["c1"]}>
      <GatedButton need="generate" clientId={clientId} {...props}>Generate image</GatedButton>
    </TestAccessProvider>,
  );

describe("GatedButton", () => {
  it("is a plain enabled button when the person may generate", () => {
    const html = render(["view", "generate"]);
    expect(html).toMatch(/<button(?![^>]*\sdisabled="")[^>]*>Generate image<\/button>/);
    expect(html).not.toContain(GENERATE_OFF_REASON);
  });

  it("is disabled and says why without Generate", () => {
    const html = render(["view"]);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Generate image<\/button>/);
    expect(html).toContain(GENERATE_OFF_REASON);
  });

  it("the permission reason wins over the button's own reason", () => {
    const html = render(["view"], { disabled: true, disabledReason: "Connect a prompt first." });
    expect(html).toContain(GENERATE_OFF_REASON);
    expect(html).not.toContain("Connect a prompt first.");
  });

  it("shows its own reason when allowed but disabled", () => {
    expect(render(["view", "generate"], { disabled: true, disabledReason: "Connect a prompt first." })).toContain("Connect a prompt first.");
  });

  it("is refused on a client the person is not on", () => {
    expect(render(["view", "generate"], {}, "c2")).toContain(GENERATE_OFF_REASON);
  });
});
