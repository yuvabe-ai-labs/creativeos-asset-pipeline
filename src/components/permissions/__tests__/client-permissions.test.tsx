import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { clientPermissionsFor } from "@/lib/permissions/check";
import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { ClientPermissionsProvider, useCanvasPermissions, useClientPermissions } from "../client-permissions";
import { TestAccessProvider } from "../test-access-provider";

function Probe() {
  const p = useCanvasPermissions();
  return <p>{[p.view, p.edit, p.generate, p.approve, p.share, p.delete, p.invite].join("|")}</p>;
}
function Canvas({ clientId }: { clientId: string }) {
  return <ClientPermissionsProvider value={useClientPermissions(clientId)}><Probe /></ClientPermissionsProvider>;
}

describe("clientPermissionsFor", () => {
  it("is view, edit and the five permissions for one client", () => {
    expect(clientPermissionsFor(testAccess({ permissions: ["generate"], clientIds: ["c1"] }), "org-1", "c1"))
      .toEqual({ view: true, edit: true, generate: true, approve: false, share: false, delete: false, invite: false });
    expect(Object.values(clientPermissionsFor(testOwnerAccess(), "org-1", "c1")).every(Boolean)).toBe(true);
  });

  it("is all false for an empty client id (outside a canvas)", () => {
    expect(Object.values(clientPermissionsFor(testOwnerAccess(), "org-1", "")).some(Boolean)).toBe(false);
  });
});

describe("the canvas's permissions", () => {
  it("are computed once for the canvas's client and read by its nodes", () => {
    const html = renderToStaticMarkup(
      <TestAccessProvider permissions={["generate"]} clientIds={["c1"]}><Canvas clientId="c1" /></TestAccessProvider>,
    );
    expect(html).toContain("true|true|true|false|false|false|false");
  });

  it("let someone on the client with no permissions look only", () => {
    const html = renderToStaticMarkup(
      <TestAccessProvider permissions={[]} clientIds={["c1"]}><Canvas clientId="c1" /></TestAccessProvider>,
    );
    expect(html).toContain("true|false|false|false|false|false|false");
  });

  it("are all false outside a canvas", () => {
    expect(renderToStaticMarkup(<Probe />)).toContain("false|false|false|false|false|false|false");
  });
});
