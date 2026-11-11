import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PermissionKey } from "@/lib/permissions/catalogue";
import { GatedButton, GENERATE_OFF_REASON } from "../gated-button";
import { TestAbilityProvider } from "../test-ability-provider";

const render = (keys: readonly PermissionKey[], props: { disabled?: boolean; disabledReason?: string | null } = {}) =>
  renderToStaticMarkup(
    <TestAbilityProvider keys={keys} clientIds={["c1"]}>
      <GatedButton need="image_generation.generate" clientId="c1" {...props}>Generate image</GatedButton>
    </TestAbilityProvider>,
  );

describe("GatedButton", () => {
  it("is a plain enabled button when the person may generate", () => {
    const html = render(["image_generation.generate"]);
    expect(html).toMatch(/<button(?![^>]*\sdisabled="")[^>]*>Generate image<\/button>/);
    expect(html).not.toContain(GENERATE_OFF_REASON);
  });

  it("is disabled and says why when the person may not", () => {
    const html = render([]);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Generate image<\/button>/);
    expect(html).toContain(GENERATE_OFF_REASON);
  });

  it("the permission reason wins over the button's own reason", () => {
    const html = render([], { disabled: true, disabledReason: "Connect a prompt first." });
    expect(html).toContain(GENERATE_OFF_REASON);
    expect(html).not.toContain("Connect a prompt first.");
  });

  it("shows its own reason when allowed but disabled", () => {
    const html = render(["image_generation.generate"], { disabled: true, disabledReason: "Connect a prompt first." });
    expect(html).toContain("Connect a prompt first.");
  });

  it("is refused for a client outside the person's list", () => {
    const html = renderToStaticMarkup(
      <TestAbilityProvider keys={["image_generation.generate"]} clientIds={["c1"]}>
        <GatedButton need="image_generation.generate" clientId="c2">Generate image</GatedButton>
      </TestAbilityProvider>,
    );
    expect(html).toContain(GENERATE_OFF_REASON);
  });
});
