import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ALL_CLIENT_PERMISSIONS, NO_CLIENT_PERMISSIONS, type ClientPermissions } from "@/lib/permissions/model";
import { GatedButton, GENERATE_OFF_REASON } from "../gated-button";
import { ClientPermissionsProvider } from "../client-permissions";

const render = (value: ClientPermissions, props: { disabled?: boolean; disabledReason?: string | null } = {}) =>
  renderToStaticMarkup(
    <ClientPermissionsProvider value={value}>
      <GatedButton {...props}>Generate image</GatedButton>
    </ClientPermissionsProvider>,
  );

describe("GatedButton", () => {
  it("is a plain enabled button when the person may generate", () => {
    const html = render(ALL_CLIENT_PERMISSIONS);
    expect(html).toMatch(/<button(?![^>]*\sdisabled="")[^>]*>Generate image<\/button>/);
    expect(html).not.toContain(GENERATE_OFF_REASON);
  });

  it("is disabled and says why without Generate", () => {
    const html = render({ ...ALL_CLIENT_PERMISSIONS, generate: false });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Generate image<\/button>/);
    expect(html).toContain(GENERATE_OFF_REASON);
  });

  it("the permission reason wins over the button's own reason", () => {
    const html = render({ ...ALL_CLIENT_PERMISSIONS, generate: false }, { disabled: true, disabledReason: "Connect a prompt first." });
    expect(html).toContain(GENERATE_OFF_REASON);
    expect(html).not.toContain("Connect a prompt first.");
  });

  it("shows its own reason when allowed but disabled", () => {
    expect(render(ALL_CLIENT_PERMISSIONS, { disabled: true, disabledReason: "Connect a prompt first." })).toContain("Connect a prompt first.");
  });

  it("is refused outside a canvas (no permissions provided)", () => {
    expect(renderToStaticMarkup(<GatedButton>Generate image</GatedButton>)).toContain(GENERATE_OFF_REASON);
    expect(render(NO_CLIENT_PERMISSIONS)).toContain(GENERATE_OFF_REASON);
  });
});
