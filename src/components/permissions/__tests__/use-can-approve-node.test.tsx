import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Permission } from "@/lib/permissions/model";
import { ClientIdProvider } from "@/components/canvas/client-id-context";
import { TestAccessProvider } from "../test-access-provider";
import { useCanApproveNode } from "../use-can-approve-node";

function Probe() {
  return <p>{String(useCanApproveNode("image-gen"))}</p>;
}
const can = (permissions: readonly Permission[], clientId = "c1") =>
  renderToStaticMarkup(
    <TestAccessProvider permissions={permissions} clientIds={["c1"]}>
      <ClientIdProvider value={clientId}><Probe /></ClientIdProvider>
    </TestAccessProvider>,
  ).includes("true");

describe("useCanApproveNode", () => {
  it("needs Approve on the canvas's client", () => {
    expect(can(["view", "approve"])).toBe(true);
    expect(can(["view"])).toBe(false);
  });

  it("is false on a client the person is not on, and outside a canvas", () => {
    expect(can(["view", "approve"], "c2")).toBe(false);
    expect(can(["view", "approve"], "")).toBe(false);
  });
});
