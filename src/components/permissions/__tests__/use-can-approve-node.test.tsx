import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PermissionKey } from "@/lib/permissions/catalogue";
import { ClientIdProvider } from "@/components/canvas/client-id-context";
import { TestAbilityProvider } from "../test-ability-provider";
import { useCanApproveNode } from "../use-can-approve-node";

function Probe({ type }: { type: string }) {
  return <p>{String(useCanApproveNode(type))}</p>;
}
const can = (keys: readonly PermissionKey[], type: string, clientId = "c1") =>
  renderToStaticMarkup(
    <TestAbilityProvider keys={keys} clientIds={["c1"]}>
      <ClientIdProvider value={clientId}><Probe type={type} /></ClientIdProvider>
    </TestAbilityProvider>,
  ).includes("true");

describe("useCanApproveNode", () => {
  it("asks the node type's area", () => {
    expect(can(["image_generation.approve"], "image-gen")).toBe(true);
    expect(can(["image_generation.approve"], "prompt")).toBe(true);
    expect(can(["image_generation.approve"], "video-gen")).toBe(false);
    expect(can(["video_generation.approve"], "multishot-prompt")).toBe(true);
  });

  it("is false for a node type nobody approves, and for a client outside the list", () => {
    expect(can(["image_generation.approve"], "text")).toBe(false);
    expect(can(["image_generation.approve"], "image-gen", "c2")).toBe(false);
  });
});
