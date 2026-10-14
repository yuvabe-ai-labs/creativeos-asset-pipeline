// src/app/api/r/s/[token]/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { comment, content, event } from "@/lib/script-review/__tests__/fixtures";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(), resolveOrgId: vi.fn() }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn() }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn() }));
vi.mock("@/lib/db/scripts", () => ({ getScript: vi.fn() }));
vi.mock("@/lib/db/script-reviews", () => ({
  getScriptReviewByToken: vi.fn(), listVersions: vi.fn(), listScriptComments: vi.fn(), listScriptEvents: vi.fn(),
}));

import { getScript } from "@/lib/db/scripts";
import { getScriptReviewByToken, listScriptComments, listScriptEvents, listVersions } from "@/lib/db/script-reviews";

const TOKEN = "golu-starts-today-6f1c";
const params = (token = TOKEN) => Promise.resolve({ token });
const req = () => new NextRequest(`http://localhost/api/r/s/${TOKEN}`);
const review = {
  id: "r-secret", script_id: "s-secret", client_id: "c-secret", share_token: "6f1c", created_by: "u-secret", created_at: "t",
  stage: "in_review" as const, clientName: "Jackfruit365", orgName: "Yuvabe Studios",
};

describe("GET /api/r/s/[token]", () => {
  beforeEach(() => vi.resetAllMocks());

  it("looks the review up by the code at the end of the link", async () => {
    vi.mocked(getScriptReviewByToken).mockResolvedValue(null);
    const { GET } = await import("./route");
    expect((await GET(req(), { params: params() })).status).toBe(404);
    expect(getScriptReviewByToken).toHaveBeenCalledWith("6f1c");
  });

  it("404s a mangled link without touching the database", async () => {
    const { GET } = await import("./route");
    expect((await GET(req(), { params: params("..%2F") })).status).toBe(404);
    expect(getScriptReviewByToken).not.toHaveBeenCalled();
  });

  it("404s a link with nothing shared yet", async () => {
    vi.mocked(getScriptReviewByToken).mockResolvedValue(review);
    vi.mocked(listVersions).mockResolvedValue([]);
    vi.mocked(listScriptComments).mockResolvedValue([]);
    vi.mocked(listScriptEvents).mockResolvedValue([]);
    const { GET } = await import("./route");
    expect((await GET(req(), { params: params() })).status).toBe(404);
  });

  it("shows the shared version, never the team's live edits (Review Focus 2), and no internal ids", async () => {
    const shared = { ...content(), id: "v-secret", number: 1, sharedAt: "2026-10-10T09:00:00.000Z" };
    shared.doc.shots[0].visual = "As shared";
    vi.mocked(getScriptReviewByToken).mockResolvedValue(review);
    vi.mocked(listVersions).mockResolvedValue([shared]);
    vi.mocked(listScriptComments).mockResolvedValue([comment()]);
    vi.mocked(listScriptEvents).mockResolvedValue([event()]);
    const { GET } = await import("./route");
    const res = await GET(req(), { params: params() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version.doc.shots[0].visual).toBe("As shared");
    expect(body.fromName).toBe("Yuvabe Studios");
    expect(getScript).not.toHaveBeenCalled();
    const text = JSON.stringify(body);
    for (const secret of ["r-secret", "s-secret", "c-secret", "u-secret", "v-secret"]) expect(text).not.toContain(secret);
  });
});
