// src/services/people.service.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { peopleService } from "./people.service";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("peopleService", () => {
  const fetchMock = vi.fn();
  beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the agency's people from one route", async () => {
    fetchMock.mockResolvedValue(json({ people: [], invites: [] }));
    expect(await peopleService.list("org-1")).toEqual({ people: [], invites: [] });
    expect(fetchMock).toHaveBeenCalledWith("/api/orgs/org-1/people");
  });

  it("sends an invite for a client and returns the link", async () => {
    fetchMock.mockResolvedValue(json({ invite: { id: "i1" }, link: "https://app/invite/t", emailed: false }));
    const r = await peopleService.inviteToClient("org-1", "c1", "p@x.com");
    expect(r.link).toBe("https://app/invite/t");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/orgs/org-1/clients/c1/invites");
    expect(JSON.parse(init.body)).toEqual({ email: "p@x.com" });
  });

  it("throws the server's refusal", async () => {
    fetchMock.mockResolvedValue(json({ error: "This email already belongs to another agency." }, 409));
    await expect(peopleService.inviteToClient("org-1", "c1", "p@x.com")).rejects.toThrow("This email already belongs to another agency.");
  });
});
