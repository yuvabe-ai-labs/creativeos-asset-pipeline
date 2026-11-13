import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Every drive/* route reads Drive through ONE platform-wide token, so each needs canvas edit and
// goes through withAccess (permission + impersonation write gate). The chokepoint has its own
// tests; here it refuses, and the route must not reach Drive.
const { withAccessMock, exchangeMock } = vi.hoisted(() => ({
  withAccessMock: vi.fn(),
  exchangeMock: vi.fn(async () => "fake-token"),
}));
vi.mock("@/lib/drive/client", () => ({ exchangeRefreshToken: exchangeMock }));
vi.mock("@/lib/api/route-helpers", async () => ({
  ...(await vi.importActual<typeof import("@/lib/api/route-helpers")>("@/lib/api/route-helpers")),
  withAccess: withAccessMock,
}));

import { GET as browse } from "./browse/route";
import { GET as files } from "./files/route";
import { GET as folders } from "./folders/route";
import { GET as pickerToken } from "./picker-token/route";
import { GET as file } from "./file/[id]/route";
import { GET as thumbnail } from "./thumbnail/[id]/route";

const req = (path: string) =>
  new NextRequest(`http://localhost:3000/api/drive/${path}`, { headers: { host: "localhost:3000", origin: "http://localhost:3000" } });
const idParams = { params: Promise.resolve({ id: "f1" }) };

const routes: Array<[string, () => Promise<Response>]> = [
  ["browse", () => browse(req("browse?folderId=root"))],
  ["files", () => files(req("files"))],
  ["folders", () => folders(req("folders"))],
  ["picker-token", () => pickerToken(req("picker-token"))],
  ["file/[id]", () => file(req("file/f1"), idParams)],
  ["thumbnail/[id]", () => thumbnail(req("thumbnail/f1"), idParams)],
];

describe("drive routes need canvas edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withAccessMock.mockImplementation(async () => Response.json({ error: "no" }, { status: 403 }));
  });

  for (const [name, call] of routes) {
    it(`${name}: asks for canvases.edit and stops when refused`, async () => {
      const res = await call();
      expect(res.status).toBe(403);
      expect(withAccessMock).toHaveBeenCalledWith(expect.any(Request), { need: "edit" }, expect.any(Function));
      expect(exchangeMock).not.toHaveBeenCalled();
    });
  }
});
