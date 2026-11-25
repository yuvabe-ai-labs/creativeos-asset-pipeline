import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ listClientNames: vi.fn(), teamProps: vi.fn() }));
vi.mock("@/lib/permissions/server", () => ({
  resolveActingCaller: vi.fn(async () => ({ caller: {}, effectiveOrgId: "org-1" })),
  accessOf: vi.fn(() => ({})),
}));
vi.mock("@/lib/permissions/check", () => ({ check: vi.fn(() => "allow") }));
vi.mock("@/lib/db/people", () => ({ listAgencyPeople: vi.fn(async () => []), listOpenInvites: vi.fn(async () => []) }));
vi.mock("@/lib/db/clients", () => ({ listClientNames: m.listClientNames }));
vi.mock("@/components/team/team-people", () => ({
  TeamPeople: (props: { breadcrumb: React.ReactNode; focusUserId: string | null }) => {
    m.teamProps(props);
    return <div>{props.breadcrumb}</div>;
  },
}));

import TeamPage from "./page";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const render = async (sp: { person?: string; from?: string }) =>
  renderToStaticMarkup(await TeamPage({ searchParams: Promise.resolve(sp) }));

describe("/team: where you are", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.listClientNames.mockResolvedValue([{ id: "c1", name: "Chupps", slug: "chupps", logo_url: null }]);
  });

  it("shows Clients › Team", async () => {
    expect(text(await render({}))).toBe("Clients Team");
  });

  it("from a client's Members page, shows that client's trail, from the client list it already reads", async () => {
    const html = await render({ person: "u1", from: "chupps" });
    expect(text(html)).toBe("Clients Chupps Members Team");
    expect(html).toContain('href="/clients/chupps/members"');
    expect(m.listClientNames).toHaveBeenCalledTimes(1);
    expect(m.teamProps.mock.calls[0][0].focusUserId).toBe("u1");
  });

  it("ignores a slug that isn't one of the agency's clients", async () => {
    expect(text(await render({ from: "someone-else" }))).toBe("Clients Team");
  });
});
