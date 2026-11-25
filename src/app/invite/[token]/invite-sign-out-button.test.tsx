import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/actions/auth", () => ({ logoutAction: vi.fn() }));

import { InviteSignOutButton } from "./invite-sign-out-button";

// Spec §6.3: someone signed in as another email signs out here (the header, with its sign-out,
// is hidden on /invite) and comes back to this same link to create the invited account.
describe("InviteSignOutButton", () => {
  it("renders a Sign out button", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}><InviteSignOutButton /></QueryClientProvider>,
    );
    expect(html).toContain("Sign out");
    expect(html).toContain('data-slot="button"');
  });

  it("signs out through the existing action, clears the cache, and reloads this same invite link", () => {
    const source = readFileSync("src/app/invite/[token]/invite-sign-out-button.tsx", "utf8");
    expect(source).toContain("await logoutAction()");
    expect(source).toContain("queryClient.clear()");
    expect(source).toContain("window.location.reload()");
  });

  it("is what the wrong-account page shows, not a link to sign in", () => {
    const page = readFileSync("src/app/invite/[token]/page.tsx", "utf8");
    expect(page).toContain("<InviteSignOutButton");
    expect(page).toContain("REFUSALS.inviteOtherAccount(state.email)");
  });
});
