import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CastAvatarLink } from "../cast-avatar-link";
import type { CastMember } from "@/lib/scripts/schema";
import type { CopilotAvatar } from "@/lib/scripts/copilot/schema";

const AVATAR_ID = "11111111-1111-4111-8111-111111111111";
const GONE_ID = "22222222-2222-4222-8222-222222222222";
const member = (avatarId: string | null) => ({ id: "c1", name: "Priya", description: "Late 20s, warm", isLead: true, avatarId }) as CastMember;
const avatar = (id: string, name: string, specific = false): CopilotAvatar => ({ id, name, story: "", front: null, specific });

const render = (m: CastMember, avatars: CopilotAvatar[]) =>
  renderToStaticMarkup(<CastAvatarLink member={m} avatars={avatars} pending={false} onChange={() => {}} />);

describe("the cast member's avatar control", () => {
  it("shows no dropdown when the client has no avatars, only the plain status", () => {
    const html = render(member(null), []);
    expect(html).toContain("No avatar yet");
    expect(html).not.toContain("<button");
  });

  it("says a deleted avatar is gone when there is nothing left to choose", () => {
    expect(render(member(GONE_ID), [])).toContain("Avatar no longer available");
  });

  it("invites a choice when the client has avatars and none is linked", () => {
    const html = render(member(null), [avatar(AVATAR_ID, "James")]);
    expect(html).toContain("Choose an avatar");
    expect(html).not.toContain("Words only");
  });

  it("names the linked avatar, with its kind when two share a name", () => {
    const avatars = [avatar(AVATAR_ID, "James", true), avatar(GONE_ID, "James")];
    expect(render(member(AVATAR_ID), avatars)).toContain("James · Specific");
  });
});
