import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeScript, SCRIPT_ID } from "@/lib/scripts/visualise/__tests__/fixtures";
import type { AssetOpBuilder } from "@/lib/db/script-assets";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-assets", () => ({ changeScriptAssets: vi.fn() }));
vi.mock("@/lib/image-gen/billed-run", () => ({ runBilledImageGeneration: vi.fn() }));
vi.mock("@/lib/storage", () => ({ uploadScriptAsset: vi.fn() }));
vi.mock("@/lib/scripts/visualise/kb-text", () => ({ loadKbText: vi.fn() }));

import { resolveCallerContext, resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { changeScriptAssets } from "@/lib/db/script-assets";
import { runBilledImageGeneration } from "@/lib/image-gen/billed-run";
import { loadKbText } from "@/lib/scripts/visualise/kb-text";
import { CreditLimitError } from "@/lib/db/credit-transactions";
import { PANEL_MODEL_ID } from "@/lib/scripts/visualise/constants";

const params = Promise.resolve({ id: "c1", scriptId: SCRIPT_ID, locationId: "kitchen" });
const post = () => new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/locations/kitchen/plate`, { method: "POST" });

const base = makeScript();
const script = (stage = "visualise" as const) => ({
  ...base,
  stage,
  doc: { ...base.doc, locations: [{ id: "kitchen", name: "Kitchen", description: "Teal walls.", image: null }] },
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Client", org_id: "org-1" } as never);
  vi.mocked(resolveCallerContext).mockResolvedValue({ userId: "u1", email: "u@x.com" } as never);
  vi.mocked(loadKbText).mockResolvedValue("");
  vi.mocked(getScript).mockResolvedValue(script());
  vi.mocked(runBilledImageGeneration).mockResolvedValue({ generation: { output_snapshot: "https://x/plate.png" }, creditsCharged: 1 } as never);
  vi.mocked(changeScriptAssets).mockResolvedValue({ ok: true, doc: script().doc, stage: "visualise" });
});

describe("POST …/locations/:locationId/plate", () => {
  it("draws an empty set billed to the script, then makes it the location's plate", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(), { params });
    expect(res.status).toBe(200);
    const run = vi.mocked(runBilledImageGeneration).mock.calls[0][0];
    expect(run).toMatchObject({ owner: { scriptId: SCRIPT_ID }, modelId: PANEL_MODEL_ID, referenceUrls: [] });
    expect(run.prompt).toContain("Kitchen. Teal walls.");
    expect(run.prompt).toMatch(/no people/);
    const build = vi.mocked(changeScriptAssets).mock.calls[0][2] as AssetOpBuilder;
    expect(build(script().doc)).toEqual({ op: "set_location_image", locationId: "kitchen", image: { url: "https://x/plate.png", source: "plate" } });
  });

  it("is a 404 for a location the script does not have, and a 409 for an approved script", async () => {
    const { POST } = await import("./route");
    vi.mocked(getScript).mockResolvedValue({ ...script(), doc: { ...script().doc, locations: [] } });
    expect((await POST(post(), { params })).status).toBe(404);
    vi.mocked(getScript).mockResolvedValue({ ...script(), stage: "approved" });
    expect((await POST(post(), { params })).status).toBe(409);
    expect(runBilledImageGeneration).not.toHaveBeenCalled();
  });

  it("says the credit limit plainly, and writes nothing when the draw fails", async () => {
    vi.mocked(runBilledImageGeneration).mockRejectedValue(new CreditLimitError("limit"));
    const { POST } = await import("./route");
    const res = await POST(post(), { params });
    expect(res.status).toBe(402);
    expect(changeScriptAssets).not.toHaveBeenCalled();
  });
});
