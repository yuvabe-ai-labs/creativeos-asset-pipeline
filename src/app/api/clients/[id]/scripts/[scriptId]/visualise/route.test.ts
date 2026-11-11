import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeScript, SCRIPT_ID } from "@/lib/scripts/visualise/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/scripts/visualise/board-server", () => ({ loadVisualiseBoard: vi.fn() }));
vi.mock("@/lib/db/script-visualise", () => ({ setVisualiseField: vi.fn() }));

import { resolveOrgId } from "@/lib/dal";
import { resolveImpersonationState } from "@/lib/auth/impersonation";
import { getClientById } from "@/lib/db/clients";
import { getScript } from "@/lib/db/scripts";
import { loadVisualiseBoard } from "@/lib/scripts/visualise/board-server";
import { setVisualiseField } from "@/lib/db/script-visualise";

const ctx = { params: Promise.resolve({ id: "c1", scriptId: SCRIPT_ID }) };
const get = () => new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/visualise`);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveOrgId).mockResolvedValue("org-1");
  vi.mocked(resolveImpersonationState).mockResolvedValue({ isImpersonating: false } as never);
  vi.mocked(getClientById).mockResolvedValue({ id: "c1", name: "Jackfruit365", org_id: "org-1" } as never);
});

describe("GET …/scripts/:scriptId/visualise", () => {
  it("returns the script and its board", async () => {
    vi.mocked(getScript).mockResolvedValue(makeScript());
    vi.mocked(loadVisualiseBoard).mockResolvedValue({ avatars: [], takes: [], picks: {}, kits: [] });
    const { GET } = await import("./route");
    const res = await GET(get(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ script: { id: SCRIPT_ID }, board: { picks: {} } });
  });

  it("is a 404 for a script this client does not have", async () => {
    vi.mocked(getScript).mockResolvedValue(null);
    const { GET } = await import("./route");
    expect((await GET(get(), ctx)).status).toBe(404);
  });
});

describe("PATCH …/scripts/:scriptId/visualise", () => {
  const patch = (body: unknown) =>
    new NextRequest(`http://localhost/api/clients/c1/scripts/${SCRIPT_ID}/visualise`, { method: "PATCH", body: JSON.stringify(body) });

  it("writes one script field and returns the script", async () => {
    vi.mocked(setVisualiseField).mockResolvedValue({ ok: true, script: makeScript() });
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ path: "context.purpose", value: "New purpose" }), ctx);
    expect(res.status).toBe(200);
    expect(setVisualiseField).toHaveBeenCalledWith("c1", SCRIPT_ID, { kind: "context", field: "purpose" }, "New purpose");
    expect(await res.json()).toMatchObject({ script: { id: SCRIPT_ID } });
  });

  it("refuses the reel's notes, which the board does not show", async () => {
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ path: "notes.brief", value: "x" }), ctx);
    expect(res.status).toBe(400);
    expect(setVisualiseField).not.toHaveBeenCalled();
  });

  it("passes on the refusal for a script that is not in Visualise", async () => {
    vi.mocked(setVisualiseField).mockResolvedValue({ ok: false, error: "The script can be edited here only while it is in Visualise.", status: 409 });
    const { PATCH } = await import("./route");
    const res = await PATCH(patch({ path: "header.title", value: "T" }), ctx);
    expect(res.status).toBe(409);
  });
});
