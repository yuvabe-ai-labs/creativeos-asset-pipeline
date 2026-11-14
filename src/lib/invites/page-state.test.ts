import { describe, it, expect } from "vitest";
import { invitePageState } from "./page-state";
import type { InvitationForSignUp } from "@/lib/people/types";

const inv = (over: Partial<InvitationForSignUp> = {}): InvitationForSignUp => ({
  id: "i1", orgId: "org-1", orgName: "Acme", email: "p@x.com", asOwner: false, clientName: "Chupps", inviterName: "Asha", open: true, ...over,
});

describe("the invite page (spec §6.3)", () => {
  it("is invalid for an unknown, used, revoked or expired link", () => {
    expect(invitePageState(null, null)).toEqual({ kind: "invalid" });
    expect(invitePageState(inv({ open: false }), null)).toEqual({ kind: "invalid" });
  });

  it("asks someone signed in as another email to switch", () => {
    expect(invitePageState(inv(), "other@x.com")).toEqual({ kind: "wrong_email", email: "p@x.com" });
  });

  it("sends someone already signed in with this email on", () => {
    expect(invitePageState(inv(), "P@X.com")).toEqual({ kind: "signed_in" });
  });

  it("shows the sign-up form otherwise", () => {
    expect(invitePageState(inv(), null)).toMatchObject({ kind: "sign_up" });
  });
});
