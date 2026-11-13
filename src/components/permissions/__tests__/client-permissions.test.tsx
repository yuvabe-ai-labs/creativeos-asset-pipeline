import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { clientPermissionsFor } from "@/lib/permissions/check";
import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { ClientPermissionsProvider, useCanvasPermissions, useClientPermissions } from "../client-permissions";
import { TestAccessProvider } from "../test-access-provider";

function Probe() {
  const p = useCanvasPermissions();
  return <p>{[p.view, p.edit, p.generate, p.approve, p.share, p.delete].join("|")}</p>;
}
function Canvas({ clientId }: { clientId: string }) {
  return <ClientPermissionsProvider value={useClientPermissions(clientId)}><Probe /></ClientPermissionsProvider>;
}

describe("clientPermissionsFor", () => {
  it("is the six answers for one client", () => {
    expect(clientPermissionsFor(testAccess({ permissions: ["view", "edit"], clientIds: ["c1"] }), "org-1", "c1"))
      .toEqual({ view: true, edit: true, generate: false, approve: false, share: false, delete: false });
    expect(Object.values(clientPermissionsFor(testOwnerAccess(), "org-1", "c1")).every(Boolean)).toBe(true);
  });

  it("is all false for an empty client id (outside a canvas)", () => {
    expect(Object.values(clientPermissionsFor(testOwnerAccess(), "org-1", "")).some(Boolean)).toBe(false);
  });
});

describe("the canvas's permissions", () => {
  it("are computed once for the canvas's client and read by its nodes", () => {
    const html = renderToStaticMarkup(
      <TestAccessProvider permissions={["view", "generate"]} clientIds={["c1"]}><Canvas clientId="c1" /></TestAccessProvider>,
    );
    expect(html).toContain("true|false|true|false|false|false");
  });

  it("are all false outside a canvas", () => {
    expect(renderToStaticMarkup(<Probe />)).toContain("false|false|false|false|false|false");
  });
});
