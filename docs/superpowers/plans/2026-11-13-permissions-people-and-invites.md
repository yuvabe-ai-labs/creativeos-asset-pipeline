# Permissions, plan 4 of 4: people, invites and Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner sets permissions on a Team page, invites people from inside a client and manages each client's Members list; invited people sign up from an emailed link and wait for access; the super admin creates an agency with its owner invite and manages any agency's people from Admin, every change audit-logged.

**Architecture:**
- **One people resource per agency.** `list_agency_people` (migration 0062) plus the open invitations is the Team page, every client's Members list and the invite popup's "In your agency" list. It is read once (`GET /api/orgs/[orgId]/people`), cached under `peopleKeys.list(orgId)`, and screens filter it.
- **One set of routes for the owner and the super admin.** Every write goes through `/api/orgs/[orgId]/…` behind a new chokepoint, `withTeam`: the owner passes `check(…, "manage_team")` in the agency they act in (with the usual impersonation write gate); a super admin working from Admin passes for any agency, and each change is written to the audit log as `admin_action`. The business rules (refusals, the daily limit, emails) live once in `src/lib/people/ops.ts`.
- **Shared screens.** The Team page component (`TeamPeople`) and the client Members component (`ClientMembers`) render on `/team` and `/clients/[id]/members` for the owner, and in Admin's People and Clients tabs with an `orgId` prop and two optional extras (Make owner, reset password).
- **Invites.** A random token is stored as issued and emailed as a link, so Copy link always shows the same link. `/invite/[token]` is outside the session proxy; signing up creates the account, then `accept_invitation` marks the invite used and creates the membership and client row in one transaction.
- **Email.** `src/lib/email/send.ts` posts to Resend's HTTP API with `fetch` (no new package). Without `RESEND_API_KEY` nothing is sent, the invite still exists, and the link is shown to copy.

**Tech Stack:**
- Next.js 16.2.6 App Router (route handlers, server actions, `useActionState`)
- TanStack Query 5.104 (service → query file with key factory → consumers)
- Supabase Postgres and Auth admin API through the service-role client
- shadcn on Base UI (`Button`, `Input`, `InputGroup`, `Select`, `Checkbox`, `Dialog`, `AlertDialog`, `Tabs`, `Card`, `Badge`)
- Resend HTTP API (`POST https://api.resend.com/emails`)
- Vitest in the `node` environment; components render with `renderToStaticMarkup`

**Spec:** [docs/superpowers/specs/2026-11-12-agency-permissions-design.md](../specs/2026-11-12-agency-permissions-design.md) §6, §9 (D505, D506, D508, D509). **Depends on plan 3:** [2026-11-13-permissions-six-core.md](2026-11-13-permissions-six-core.md) (the checker, `useCan`, the payload, migration 0062 with `accept_invitation`, `list_agency_people`, `find_user_by_email`, `transfer_agency_owner`, `create_agency_with_owner_invite`, and `admin_action`).

## Global Constraints

- **Worktree:** work only in `C:/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm` on `feat/permission-access-browser`, after plan 3's last commit. Never touch `C:/Users/yuvab/OneDrive/Desktop/codes/creativeos-asset-pipeline`. Never use bare `git stash`.
- **Commits:** one per task, exact message given, no Claude/AI attribution of any kind (no `Co-Authored-By` line, no "Generated with" line). Check with `git log -1 --format=%B`; amend with the exact message if a trailer slipped in.
- **Never** run SQL against any database, apply a migration, push, or install a package (`node_modules` is a junction into the other checkout). Resend is called with `fetch`.
- **Owner only:** the Team page, the Members page, inviting, adding and removing people on a client, and setting permissions are `manage_team` (spec §2.2). Permissions are edited only on the Team page (D509).
- **Statuses, exactly:** `Invited`, `Signed up · Needs permissions`, `Member`, `Owner`.
- **Copy, exactly (spec §6):** editor note `These apply on every client {name} is on, and on any client they're added to later.`; members heading `{n} people on this client`; invite step 2 note `They get an email to sign up. Once they have, you set their permissions on the Team page.`; refusals `Already in {Agency}. Add them from the list.`, `Already invited to {client}. Once they've signed up, add them from the list.`, `This email already belongs to another agency.`; wrong-email sign-in `This invite is for {email}. Sign in with that email to accept it.`; Add an agency note `The owner gets an email to sign up, and can do everything in this agency.`
- **Emails (spec §6.7):** `You're invited to {Agency}` (member, invite or resend), `Set up {Agency} on CreativeOS` (owner, created or resend), `{Name} signed up to {Agency}` with body `{Name} signed up to {Agency}. Give them permissions on the Team page.` (owner and inviter), `Your access to {Agency} is ready` (the person, on Give access). At most **50 invites per agency per day**. Without `RESEND_API_KEY` (or `EMAIL_FROM`) the invite is created and the link shown; the result says it was not emailed.
- **Invites:** token = 32 random bytes, base64url, stored as issued in `org_invitations.token` (unique; the table is server-only: RLS on, no policies); valid 7 days; single use. Copy link shows the stored link unchanged (no new token, no email, no limit). Only Resend issues a new token (the old link stops working) and emails it; Cancel revokes.
- **Audit:** every change the super admin makes from Admin is `logImpersonationEvent({ eventType: "admin_action", targetOrgId, detail: { action, …person } })`.
- **Data fetching:** every new read and write is three layers: `src/services/people.service.ts` → `src/hooks/queries/people.ts` (`peopleKeys` factory) → components. Components never call `fetch`.
- **Controls:** shadcn primitives from `src/components/ui/*` only; an icon inside a field is `InputGroup` / `InputGroupAddon`. `src/components/<feature>/` holds `.tsx` only; constants, types and helpers live in `src/lib/people/`.
- **Extend, don't fork:** the admin roster, the Team page and the Members list share components; the admin remove dialog is moved and generalised, not copied; `CopyRow` moves to `src/components/shared/`.
- **Performance:** each screen makes one people read; nothing per row fetches; ids sent by the browser are checked against the agency (rule 14); independent reads in one `Promise.all`.
- **Copy:** plain words, no vendor names ("email", not "Resend"), no raw errors, no em-dash phrasing.
- **Tests:** run per directory from the uppercase path: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run <dir or file>`. Typecheck `npx tsc --noEmit`; lint `npx eslint <files>`. Known pre-existing, not yours: tsc `src/app/api/nodes/[id]/image-generate/route.test.ts(56,12) TS2304`; vitest "refuses a deprecated model" in `src/app/api/nodes/[id]/composite-generate` and `src/app/api/nodes/[id]/image-generate`.

## Decisions this plan makes

- **Routes live under `/api/orgs/[orgId]/…` and serve the owner and the super admin alike** through `withTeam`. A super admin acting from Admin skips the impersonation write gate (D85: Admin is platform administration) and is audit-logged as `admin_action`; while viewing as that same agency, the owner path and its write gate apply instead.
- **Invite links are stored as issued so Copy link shows the same one**; acceptable because the table is server-only and links are single-use and expire after 7 days (Arun, 13 Nov). Each open invite in the people list carries its link, so Copy link makes no request.
- **Remove deletes the person's login**, as the admin removal did (one agency per person: a login without a membership could never sign in again). Their work stays, attributed to "an unknown maker".
- **Give access needs at least one permission** in the editor (the button is disabled with none); the server accepts any set from the six.
- **Admin keeps its Generations and Support activity tabs** beside Overview, People and Clients. Reset password stays, shown only in Admin through an optional slot on the shared row.
- **The daily limit's refusal reads** `You've sent 50 invites today. Try again tomorrow.` (the spec gives the limit, not the words).

## File structure

| File | Role |
|---|---|
| `src/lib/email/send.ts`, `src/lib/email/templates.ts` | send through Resend over `fetch`; the four emails |
| `src/lib/invites/token.ts` | token and link |
| `src/lib/people/{types,constants,utils,schema}.ts` | people types, labels and refusals, pure helpers, request schemas |
| `src/lib/db/people.ts` | every people and invitation read and write |
| `src/lib/people/ops.ts` | the rules: invite, resend, cancel, permissions, remove, add, make owner, create agency, sign-up notices |
| `src/lib/api/route-helpers.ts` | `withTeam` |
| `src/app/api/orgs/[orgId]/…` (8 route files) | the people API |
| `src/services/people.service.ts`, `src/hooks/queries/people.ts` | browser layers |
| `src/components/team/*` | permission editor, Team page sections, Members list, invite popup, remove dialog |
| `src/app/team/page.tsx`, `src/app/clients/[id]/members/page.tsx`, `src/app/invite/[token]/page.tsx` | pages |
| `src/components/identity/team-nav-link.tsx`, `src/components/clients/client-members-button.tsx` | entry points |
| `src/components/admin/add-agency-dialog.tsx`, `resend-owner-invite-button.tsx`, `src/app/admin/orgs/[id]/admin-clients-tab.tsx` | Admin |
| Deleted | `src/components/admin/new-org-dialog.tsx`, `src/app/admin/orgs/[id]/{add-member-dialog,member-role-select,remove-member-dialog}.tsx`, `createOrgWithOwner`, `addOrgMember`, `updateMemberRole`, `removeOrgMember`, `listOrgMembers`, `AddMemberSchema`, `ORG_ROLES`, `OrgRole`, `NOT_YET_CHECKED` |

---

### Task 1: Emails, sent through Resend when it is set up

**Files:**
- Create: `src/lib/email/send.ts`, `src/lib/email/templates.ts`, `src/lib/email/send.test.ts`, `src/lib/email/templates.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Email = { to: string[]; subject: string; text: string; html: string }`; `type EmailResult = { sent: true } | { sent: false; reason: "not_configured" | "failed" }`; `sendEmail(email: Email): Promise<EmailResult>`; `memberInviteEmail(a: { to: string; agency: string; inviter: string; client: string; link: string }): Email`; `ownerInviteEmail(a: { to: string; agency: string; link: string }): Email`; `signedUpEmail(a: { to: string[]; name: string; agency: string; link: string }): Email`; `accessReadyEmail(a: { to: string; agency: string; link: string }): Email`; `appLink(path: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/email/send.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import { sendEmail } from "./send";

const email = { to: ["a@example.com"], subject: "Hi", text: "Hello", html: "<p>Hello</p>" };

describe("sendEmail", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "CreativeOS <hello@example.com>";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
  });

  it("sends nothing, and says so, without the key or the sender", async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendEmail(email)).toEqual({ sent: false, reason: "not_configured" });
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.EMAIL_FROM;
    expect(await sendEmail(email)).toEqual({ sent: false, reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the email with the key", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "e1" }), { status: 200 }));
    expect(await sendEmail(email)).toEqual({ sent: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer re_test");
    expect(JSON.parse(init.body)).toEqual({ from: "CreativeOS <hello@example.com>", to: ["a@example.com"], subject: "Hi", text: "Hello", html: "<p>Hello</p>" });
  });

  it("reports a refused or failed send as failed, never throwing", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 422 }));
    expect(await sendEmail(email)).toEqual({ sent: false, reason: "failed" });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(await sendEmail(email)).toEqual({ sent: false, reason: "failed" });
    err.mockRestore();
  });
});
```

```ts
// src/lib/email/templates.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { accessReadyEmail, appLink, memberInviteEmail, ownerInviteEmail, signedUpEmail } from "./templates";

describe("emails (spec §6.3, §6.7)", () => {
  beforeEach(() => { process.env.APP_URL = "https://app.example/"; });

  it("invites a member to work on a client", () => {
    const e = memberInviteEmail({ to: "p@x.com", agency: "Acme", inviter: "Asha", client: "Chupps", link: "https://app.example/invite/t" });
    expect(e.subject).toBe("You're invited to Acme");
    expect(e.text).toContain("Asha has invited you to join Acme on CreativeOS, to work on Chupps.");
    expect(e.text).toContain("Join Acme: https://app.example/invite/t");
    expect(e.html).toContain('href="https://app.example/invite/t"');
    expect(e.to).toEqual(["p@x.com"]);
  });

  it("invites an owner to set up the agency", () => {
    const e = ownerInviteEmail({ to: "o@x.com", agency: "Acme", link: "https://app.example/invite/t" });
    expect(e.subject).toBe("Set up Acme on CreativeOS");
  });

  it("tells the owner and inviter someone signed up", () => {
    const e = signedUpEmail({ to: ["o@x.com", "i@x.com"], name: "Ravi", agency: "Acme", link: "https://app.example/team" });
    expect(e.subject).toBe("Ravi signed up to Acme");
    expect(e.text).toContain("Ravi signed up to Acme. Give them permissions on the Team page.");
  });

  it("tells the person their access is ready", () => {
    expect(accessReadyEmail({ to: "p@x.com", agency: "Acme", link: "https://app.example/" }).subject).toBe("Your access to Acme is ready");
  });

  it("escapes what people typed in the html", () => {
    const e = memberInviteEmail({ to: "p@x.com", agency: "<b>Acme</b>", inviter: "A", client: "C", link: "https://app.example/invite/t" });
    expect(e.html).not.toContain("<b>Acme</b>");
    expect(e.html).toContain("&lt;b&gt;Acme&lt;/b&gt;");
  });

  it("builds links on APP_URL", () => {
    expect(appLink("/team")).toBe("https://app.example/team");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/lib/email`
Expected: FAIL, `Failed to resolve import "./send"`.

- [ ] **Step 3: Write the sender and the templates**

```ts
// src/lib/email/send.ts
import "server-only";

export type Email = { to: string[]; subject: string; text: string; html: string };
export type EmailResult = { sent: true } | { sent: false; reason: "not_configured" | "failed" };

// Spec §6.7: email through Resend's HTTP API (no SDK). Without RESEND_API_KEY and a verified
// EMAIL_FROM nothing is sent and the caller shows the link to copy instead. A failed send never
// fails the action that asked for it: the invite or the access change has already happened.
export async function sendEmail(email: Email): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { sent: false, reason: "not_configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: email.to, subject: email.subject, text: email.text, html: email.html }),
    });
    if (!res.ok) {
      console.error("[email] send refused", res.status, await res.text().catch(() => ""));
      return { sent: false, reason: "failed" };
    }
    return { sent: true };
  } catch (e) {
    console.error("[email] send failed", e);
    return { sent: false, reason: "failed" };
  }
}
```

```ts
// src/lib/email/templates.ts
import type { Email } from "./send";

// The four emails of spec §6.7. Plain text first; the html is the same words with one button.

export function appLink(path: string): string {
  const base = process.env.APP_URL;
  if (!base) throw new Error("APP_URL env var not set");
  return `${base.replace(/\/$/, "")}${path}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function compose(to: string[], subject: string, lines: string[], action: { label: string; link: string }): Email {
  const text = [...lines, "", `${action.label}: ${action.link}`].join("\n");
  const html = [
    ...lines.map((l) => `<p>${escapeHtml(l)}</p>`),
    `<p><a href="${escapeHtml(action.link)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#5829c7;color:#ffffff;text-decoration:none">${escapeHtml(action.label)}</a></p>`,
  ].join("");
  return { to, subject, text, html };
}

export function memberInviteEmail(a: { to: string; agency: string; inviter: string; client: string; link: string }): Email {
  return compose([a.to], `You're invited to ${a.agency}`, [
    `${a.inviter} has invited you to join ${a.agency} on CreativeOS, to work on ${a.client}.`,
    "The link works for 7 days.",
  ], { label: `Join ${a.agency}`, link: a.link });
}

export function ownerInviteEmail(a: { to: string; agency: string; link: string }): Email {
  return compose([a.to], `Set up ${a.agency} on CreativeOS`, [
    `You're the owner of ${a.agency} on CreativeOS. Create your account to set it up and invite your team.`,
    "The link works for 7 days.",
  ], { label: `Set up ${a.agency}`, link: a.link });
}

export function signedUpEmail(a: { to: string[]; name: string; agency: string; link: string }): Email {
  return compose(a.to, `${a.name} signed up to ${a.agency}`, [
    `${a.name} signed up to ${a.agency}. Give them permissions on the Team page.`,
  ], { label: "Open the Team page", link: a.link });
}

export function accessReadyEmail(a: { to: string; agency: string; link: string }): Email {
  return compose([a.to], `Your access to ${a.agency} is ready`, [
    `Your access to ${a.agency} on CreativeOS is ready. Your clients are waiting for you.`,
  ], { label: "Open CreativeOS", link: a.link });
}
```

Append to `.env.example`:

```
# Invite and access emails (spec §6.7). Without both, invites are still created and the link is
# shown to copy. EMAIL_FROM must be on a domain verified with the email provider.
RESEND_API_KEY=
EMAIL_FROM=
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/email`
Expected: PASS.

Run: `npx tsc --noEmit` and `npx eslint src/lib/email`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email .env.example
git commit -m "feat(email): invite, sign-up and access emails, sent when email is set up (spec 6.7)"
git log -1 --format=%B
```

---

### Task 2: Invite tokens and the people data layer

**Files:**
- Create: `src/lib/invites/token.ts`, `src/lib/invites/token.test.ts`, `src/lib/people/types.ts`, `src/lib/people/constants.ts`, `src/lib/people/utils.ts`, `src/lib/people/utils.test.ts`, `src/lib/people/schema.ts`, `src/lib/db/people.ts`, `src/lib/db/people.test.ts`

**Interfaces:**
- Consumes: plan 3's `Permission`, `PERMISSIONS`, `orderedPermissions`, `toPermissionSet`; SQL `list_agency_people`, `find_user_by_email`, `accept_invitation`, `transfer_agency_owner`, `create_agency_with_owner_invite`.
- Produces:
  - `token.ts`: `newInviteToken(): string`, `inviteLink(token: string): string`.
  - `types.ts`: `type PersonStatus = "owner" | "member" | "signed_up"`; `type AgencyPerson = { userId: string; name: string; email: string; status: PersonStatus; permissions: Permission[]; joinedAt: string; invitedByName: string | null; invitedClient: { id: string; name: string } | null; clientIds: string[] }`; `type OpenInvite = { id: string; email: string; clientId: string | null; clientName: string | null; asOwner: boolean; sentAt: string; expiresAt: string; link: string }`; `type AgencyPeople = { people: AgencyPerson[]; invites: OpenInvite[] }`; `type InviteResult = { invite: OpenInvite; link: string; emailed: boolean }`; `type InvitationForSignUp = { id: string; orgId: string; orgName: string; email: string; asOwner: boolean; clientName: string | null; inviterName: string | null; open: boolean }`.
  - `constants.ts`: `INVITES_PER_AGENCY_PER_DAY = 50`, `INVITE_TTL_DAYS = 7`, `PERMISSION_LABELS`, `STATUS_LABELS`, `REFUSALS`.
  - `utils.ts`: `isValidEmail(v: string): boolean`, `normaliseEmail(v: string): string`, `peopleOnClient(people, clientId): AgencyPerson[]`, `peopleNotOnClient(people, clientId): AgencyPerson[]`, `signedUpPeople(people): AgencyPerson[]`, `invitesForClient(invites, clientId): OpenInvite[]`, `oneDayAgo(now?: Date): string`.
  - `schema.ts`: `UpdatePermissionsSchema`, `AddMembersSchema`, `InviteSchema`, `AcceptInviteSchema`, `CreateAgencySchema`.
  - `db/people.ts`: `toPerson(row: PeopleRow): AgencyPerson`, `toInvite(row: InviteRow): OpenInvite`, `listAgencyPeople(orgId)`, `listOpenInvites(orgId)`, `getMembership(orgId, userId): Promise<{ isOwner: boolean; accessGiven: boolean } | null>`, `getMemberships(orgId, userIds): Promise<{ userId: string; isOwner: boolean }[]>`, `setMemberPermissions(orgId, userId, permissions, giveAccess): Promise<void>`, `addPeopleToClient(orgId, clientId, userIds, by): Promise<void>`, `removePersonFromClient(orgId, clientId, userId): Promise<void>`, `countSignedUp(orgId): Promise<number>`, `ownerIds(orgId): Promise<string[]>`, `loginEmails(userIds): Promise<string[]>`, `findLoginByEmail(email): Promise<{ userId: string; orgId: string | null } | null>`, `createLogin(email, password): Promise<{ ok: true; userId: string } | { ok: false }>`, `deleteLogin(userId): Promise<void>`, `findOpenInviteByEmail(orgId, email): Promise<{ id: string; clientName: string | null } | null>`, `countInvitesSince(orgId, sinceIso): Promise<number>`, `insertInvitation(i: { orgId: string; clientId: string; email: string; token: string; invitedBy: string }): Promise<OpenInvite>`, `replaceInvitationToken(orgId, inviteId, token): Promise<OpenInvite | null>`, `revokeInvitation(orgId, inviteId): Promise<boolean>`, `getOpenOwnerInvite(orgId): Promise<OpenInvite | null>`, `getInvitationByToken(token): Promise<InvitationForSignUp | null>`, `acceptInvitation(token, userId, name): Promise<{ orgId: string; clientId: string | null; asOwner: boolean; invitedBy: string | null }>`, `transferOwner(orgId, userId): Promise<void>`, `createAgencyWithOwnerInvite(a: { name: string; slug: string; ownerEmail: string; token: string; by: string }): Promise<string>`, `listOrgSlugs(): Promise<string[]>`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/invites/token.test.ts
import { describe, it, expect, beforeEach } from "vitest";

import { inviteLink, newInviteToken } from "./token";

describe("invite tokens", () => {
  beforeEach(() => { process.env.APP_URL = "https://app.example"; });

  it("is 32 random bytes, base64url, new each time", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("links to the sign-up page", () => {
    expect(inviteLink("abc")).toBe("https://app.example/invite/abc");
  });
});
```

```ts
// src/lib/people/utils.test.ts
import { describe, it, expect } from "vitest";
import { invitesForClient, isValidEmail, normaliseEmail, oneDayAgo, peopleNotOnClient, peopleOnClient, signedUpPeople } from "./utils";
import type { AgencyPerson, OpenInvite } from "./types";

const person = (over: Partial<AgencyPerson>): AgencyPerson => ({
  userId: "u", name: "N", email: "n@x.com", status: "member", permissions: ["view"], joinedAt: "2026-11-01T00:00:00Z",
  invitedByName: null, invitedClient: null, clientIds: [], ...over,
});
const owner = person({ userId: "o", status: "owner", clientIds: [] });
const onC1 = person({ userId: "a", clientIds: ["c1"] });
const waitingOnC1 = person({ userId: "b", status: "signed_up", clientIds: ["c1"] });
const elsewhere = person({ userId: "c", clientIds: ["c2"] });

describe("people helpers", () => {
  it("checks and normalises emails", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(normaliseEmail("  Asha@Example.COM ")).toBe("asha@example.com");
  });

  it("puts the owner first on every client, then the people on it", () => {
    expect(peopleOnClient([onC1, owner, elsewhere, waitingOnC1], "c1").map((p) => p.userId)).toEqual(["o", "a", "b"]);
  });

  it("offers everyone else in the agency, waiting people included, never the owner", () => {
    expect(peopleNotOnClient([owner, onC1, waitingOnC1, elsewhere], "c1").map((p) => p.userId)).toEqual(["c"]);
  });

  it("lists who signed up and waits", () => {
    expect(signedUpPeople([owner, onC1, waitingOnC1]).map((p) => p.userId)).toEqual(["b"]);
  });

  it("keeps a client's open invites", () => {
    const inv = (id: string, clientId: string | null): OpenInvite => ({ id, email: `${id}@x.com`, clientId, clientName: null, asOwner: clientId === null, sentAt: "t", expiresAt: "t", link: `https://app.example/invite/${id}` });
    expect(invitesForClient([inv("i1", "c1"), inv("i2", "c2"), inv("i3", null)], "c1").map((i) => i.id)).toEqual(["i1"]);
  });

  it("is a day before now", () => {
    expect(oneDayAgo(new Date("2026-11-13T12:00:00.000Z"))).toBe("2026-11-12T12:00:00.000Z");
  });
});
```

```ts
// src/lib/db/people.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));

import { toInvite, toPerson } from "./people";

describe("people rows", () => {
  it("map a list_agency_people row to a person with a status", () => {
    const base = {
      user_id: "u1", display_name: "Ravi", email: "r@x.com", is_owner: false, access_given_at: null,
      permissions: ["share", "view", "nonsense"], joined_at: "2026-11-12T10:00:00Z", invited_by_name: "Asha",
      invited_client_id: "c1", invited_client_name: "Chupps", client_ids: ["c1"],
    };
    expect(toPerson(base)).toEqual({
      userId: "u1", name: "Ravi", email: "r@x.com", status: "signed_up", permissions: ["view", "share"],
      joinedAt: "2026-11-12T10:00:00Z", invitedByName: "Asha", invitedClient: { id: "c1", name: "Chupps" }, clientIds: ["c1"],
    });
    expect(toPerson({ ...base, access_given_at: "2026-11-13T00:00:00Z" }).status).toBe("member");
    expect(toPerson({ ...base, is_owner: true }).status).toBe("owner");
    expect(toPerson({ ...base, invited_client_id: null, invited_client_name: null, client_ids: null }).invitedClient).toBeNull();
  });

  it("map an invitation row with its client name and its stored link (the same every time)", () => {
    process.env.APP_URL = "https://app.example";
    expect(toInvite({ id: "i1", email: "p@x.com", client_id: "c1", as_owner: false, created_at: "s", expires_at: "e", token: "tok1", clients: { name: "Chupps" } }))
      .toEqual({ id: "i1", email: "p@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "s", expiresAt: "e", link: "https://app.example/invite/tok1" });
    expect(toInvite({ id: "i2", email: "o@x.com", client_id: null, as_owner: true, created_at: "s", expires_at: "e", token: "tok2", clients: null }).clientName).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/lib/invites src/lib/people src/lib/db/people.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Tokens, types, constants, helpers and schemas**

```ts
// src/lib/invites/token.ts
import { randomBytes } from "node:crypto";

// D502/D506: the link carries a random token, stored as issued so Copy link always shows the same
// link (Arun, 13 Nov). The table is server-only; a link is single use and expires after 7 days.
export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function inviteLink(token: string): string {
  const base = process.env.APP_URL;
  if (!base) throw new Error("APP_URL env var not set");
  return `${base.replace(/\/$/, "")}/invite/${token}`;
}
```

```ts
// src/lib/people/types.ts
import type { Permission } from "@/lib/permissions/model";

/** Spec §2.4. An open invite is the fourth status, "invited". */
export type PersonStatus = "owner" | "member" | "signed_up";

export type AgencyPerson = {
  userId: string;
  name: string;
  email: string;
  status: PersonStatus;
  /** The agency-level set (what the owner edits on the Team page). */
  permissions: Permission[];
  joinedAt: string;
  invitedByName: string | null;
  /** The client they were invited to, once they have signed up. */
  invitedClient: { id: string; name: string } | null;
  /** The clients they are on, oldest first. Empty for the owner (on every client). */
  clientIds: string[];
};

export type OpenInvite = {
  id: string;
  email: string;
  clientId: string | null;
  clientName: string | null;
  asOwner: boolean;
  sentAt: string;
  expiresAt: string;
  /** The link as issued: Copy link shows it unchanged; only Resend replaces it. */
  link: string;
};

/** The one people resource per agency: the Team page, every Members list, the invite popup. */
export type AgencyPeople = { people: AgencyPerson[]; invites: OpenInvite[] };

/** `emailed` false: email is not set up or the send failed; show the link to copy. */
export type InviteResult = { invite: OpenInvite; link: string; emailed: boolean };

export type InvitationForSignUp = {
  id: string;
  orgId: string;
  orgName: string;
  email: string;
  asOwner: boolean;
  clientName: string | null;
  inviterName: string | null;
  /** Not accepted, not revoked, not expired. */
  open: boolean;
};
```

```ts
// src/lib/people/constants.ts
import type { Permission } from "@/lib/permissions/model";
import type { PersonStatus } from "./types";

/** Spec §6.7: a leaked session can't mass-mail. */
export const INVITES_PER_AGENCY_PER_DAY = 50;
export const INVITE_TTL_DAYS = 7;

export const PERMISSION_LABELS: Record<Permission, string> = {
  view: "View",
  edit: "Edit",
  generate: "Generate",
  approve: "Approve",
  share: "Share",
  delete: "Delete",
};

export const STATUS_LABELS: Record<PersonStatus | "invited", string> = {
  owner: "Owner",
  member: "Member",
  signed_up: "Signed up · Needs permissions",
  invited: "Invited",
};

/** Spec §6.2 refusals, and the plain messages the people routes answer with. */
export const REFUSALS = {
  invalidEmail: "Enter a valid email.",
  alreadyInAgency: (agency: string) => `Already in ${agency}. Add them from the list.`,
  alreadyInvited: (client: string) => `Already invited to ${client}. Once they've signed up, add them from the list.`,
  otherAgency: "This email already belongs to another agency.",
  dailyLimit: `You've sent ${INVITES_PER_AGENCY_PER_DAY} invites today. Try again tomorrow.`,
  ownerFixed: "The agency owner can't be removed.",
  ownerPermissions: "The agency owner has every permission already.",
  personNotFound: "That person isn't in this agency.",
  inviteNotFound: "That invite isn't open any more.",
  inviteInvalid: "This invite link is no longer valid.",
  ownerInviteOpen: "This agency already has an owner or an open owner invite.",
} as const;
```

```ts
// src/lib/people/utils.ts
import type { AgencyPerson, OpenInvite } from "./types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** A client's Members list: the owner first (on every client), then the people on it. */
export function peopleOnClient(people: readonly AgencyPerson[], clientId: string): AgencyPerson[] {
  return [
    ...people.filter((p) => p.status === "owner"),
    ...people.filter((p) => p.status !== "owner" && p.clientIds.includes(clientId)),
  ];
}

/** The invite popup's "In your agency": everyone not on this client, people still waiting included. */
export function peopleNotOnClient(people: readonly AgencyPerson[], clientId: string): AgencyPerson[] {
  return people.filter((p) => p.status !== "owner" && !p.clientIds.includes(clientId));
}

export function signedUpPeople(people: readonly AgencyPerson[]): AgencyPerson[] {
  return people.filter((p) => p.status === "signed_up");
}

export function invitesForClient(invites: readonly OpenInvite[], clientId: string): OpenInvite[] {
  return invites.filter((i) => i.clientId === clientId);
}

export function oneDayAgo(now: Date = new Date()): string {
  return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
}
```

```ts
// src/lib/people/schema.ts
import * as z from "zod";
import { PERMISSIONS } from "@/lib/permissions/model";

export const UpdatePermissionsSchema = z.object({
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
  giveAccess: z.boolean().optional(),
});

/** Ids from the browser: checked against the agency before any write (performance rule 14). */
export const AddMembersSchema = z.object({ userIds: z.array(z.uuid()).min(1).max(200) });

/** The email's wording is checked in the ops, so the refusal is the spec's sentence. */
export const InviteSchema = z.object({ email: z.string().max(320) });

export const AcceptInviteSchema = z.object({
  name: z.string().trim().min(2, { error: "Enter your name." }).max(80),
  password: z.string().min(8, { error: "Password must be at least 8 characters." }),
});

export const CreateAgencySchema = z.object({
  name: z.string().trim().min(2, { error: "Enter the agency's name." }).max(80),
  email: z.email({ error: "Enter a valid email." }).trim(),
});
```

- [ ] **Step 4: The data layer**

```ts
// src/lib/db/people.ts
import "server-only";
import { createServerSupabase } from "@/lib/supabase/server";
import { unwrapEmbed, type Embed } from "@/lib/db/embed";
import { orderedPermissions, toPermissionSet, type Permission } from "@/lib/permissions/model";
import { inviteLink } from "@/lib/invites/token";
import { INVITE_TTL_DAYS } from "@/lib/people/constants";
import type { AgencyPerson, InvitationForSignUp, OpenInvite } from "@/lib/people/types";

// Every read and write of people and invitations (migration 0062). The rules (who may, the
// refusals, the emails) are in src/lib/people/ops.ts; nothing here decides access. Invite tokens
// are stored as issued; they leave the server only to the owner or the super admin (the people
// routes are manage_team) and in the invited person's email.

type PeopleRow = {
  user_id: string;
  display_name: string;
  email: string;
  is_owner: boolean;
  access_given_at: string | null;
  permissions: string[] | null;
  joined_at: string;
  invited_by_name: string | null;
  invited_client_id: string | null;
  invited_client_name: string | null;
  client_ids: string[] | null;
};

type InviteRow = {
  id: string;
  email: string;
  client_id: string | null;
  as_owner: boolean;
  created_at: string;
  expires_at: string;
  token: string;
  clients: Embed<{ name: string }>;
};

const INVITE_COLUMNS = "id, email, client_id, as_owner, created_at, expires_at, token, clients(name)";

export function toPerson(row: PeopleRow): AgencyPerson {
  return {
    userId: row.user_id,
    name: row.display_name,
    email: row.email,
    status: row.is_owner ? "owner" : row.access_given_at ? "member" : "signed_up",
    permissions: orderedPermissions(toPermissionSet(row.permissions)),
    joinedAt: row.joined_at,
    invitedByName: row.invited_by_name,
    invitedClient: row.invited_client_id && row.invited_client_name ? { id: row.invited_client_id, name: row.invited_client_name } : null,
    clientIds: row.client_ids ?? [],
  };
}

export function toInvite(row: InviteRow): OpenInvite {
  return {
    id: row.id,
    email: row.email,
    clientId: row.client_id,
    clientName: unwrapEmbed(row.clients)?.name ?? null,
    asOwner: row.as_owner,
    sentAt: row.created_at,
    expiresAt: row.expires_at,
    link: inviteLink(row.token),
  };
}

function expiry(): string {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function listAgencyPeople(orgId: string): Promise<AgencyPerson[]> {
  const { data, error } = await createServerSupabase().rpc("list_agency_people", { p_org_id: orgId });
  if (error) throw error;
  return ((data ?? []) as PeopleRow[]).map(toPerson);
}

export async function listOpenInvites(orgId: string): Promise<OpenInvite[]> {
  const { data, error } = await createServerSupabase()
    .from("org_invitations")
    .select(INVITE_COLUMNS)
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as InviteRow[]).map(toInvite);
}

export async function getMembership(orgId: string, userId: string): Promise<{ isOwner: boolean; accessGiven: boolean } | null> {
  const { data, error } = await createServerSupabase()
    .from("org_memberships")
    .select("is_owner, access_given_at")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { is_owner: boolean; access_given_at: string | null } | null;
  return row ? { isOwner: row.is_owner, accessGiven: row.access_given_at !== null } : null;
}

export async function getMemberships(orgId: string, userIds: readonly string[]): Promise<{ userId: string; isOwner: boolean }[]> {
  const { data, error } = await createServerSupabase()
    .from("org_memberships")
    .select("user_id, is_owner")
    .eq("org_id", orgId)
    .in("user_id", [...userIds]);
  if (error) throw error;
  return ((data ?? []) as { user_id: string; is_owner: boolean }[]).map((r) => ({ userId: r.user_id, isOwner: r.is_owner }));
}

/** One update; the cascade trigger carries the change onto every client row (spec §3.3). */
export async function setMemberPermissions(orgId: string, userId: string, permissions: Permission[], giveAccess: boolean): Promise<void> {
  const { error } = await createServerSupabase()
    .from("org_memberships")
    .update(giveAccess ? { permissions, access_given_at: new Date().toISOString() } : { permissions })
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("is_owner", false);
  if (error) throw error;
}

/** One insert; each row copies the person's agency set (trigger). Already on the client: kept. */
export async function addPeopleToClient(orgId: string, clientId: string, userIds: readonly string[], by: string): Promise<void> {
  const rows = userIds.map((user_id) => ({ user_id, org_id: orgId, client_id: clientId, added_by: by }));
  const { error } = await createServerSupabase()
    .from("membership_clients")
    .upsert(rows, { onConflict: "user_id,org_id,client_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function removePersonFromClient(orgId: string, clientId: string, userId: string): Promise<void> {
  const { error } = await createServerSupabase()
    .from("membership_clients")
    .delete()
    .eq("org_id", orgId)
    .eq("client_id", clientId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** The header's Team count (spec §6.1). */
export async function countSignedUp(orgId: string): Promise<number> {
  const { count, error } = await createServerSupabase()
    .from("org_memberships")
    .select("user_id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("is_owner", false)
    .is("access_given_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function ownerIds(orgId: string): Promise<string[]> {
  const { data, error } = await createServerSupabase()
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("is_owner", true);
  if (error) throw error;
  return ((data ?? []) as { user_id: string }[]).map((r) => r.user_id);
}

/** Emails live only in auth.users. Called for one to three people at a time (the notices). */
export async function loginEmails(userIds: readonly string[]): Promise<string[]> {
  const db = createServerSupabase();
  const users = await Promise.all(userIds.map((id) => db.auth.admin.getUserById(id)));
  return users.flatMap(({ data, error }) => (error || !data.user?.email ? [] : [data.user.email]));
}

export async function findLoginByEmail(email: string): Promise<{ userId: string; orgId: string | null } | null> {
  const { data, error } = await createServerSupabase().rpc("find_user_by_email", { p_email: email });
  if (error) throw error;
  const row = ((data ?? []) as { user_id: string; org_id: string | null }[])[0];
  return row ? { userId: row.user_id, orgId: row.org_id } : null;
}

export async function createLogin(email: string, password: string): Promise<{ ok: true; userId: string } | { ok: false }> {
  const { data, error } = await createServerSupabase().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { platform_role: "member" },
  });
  if (error || !data.user) {
    console.error("[invite] could not create the login", error);
    return { ok: false };
  }
  return { ok: true, userId: data.user.id };
}

/** Deletes the login; the profile, membership and client rows go with it (cascade). The owner's
 *  is refused by the owner-protection trigger. Their work stays, unattributed. */
export async function deleteLogin(userId: string): Promise<void> {
  const { error } = await createServerSupabase().auth.admin.deleteUser(userId);
  if (error) throw error;
}

export async function findOpenInviteByEmail(orgId: string, email: string): Promise<{ id: string; clientName: string | null } | null> {
  const { data, error } = await createServerSupabase()
    .from("org_invitations")
    .select(INVITE_COLUMNS)
    .eq("org_id", orgId)
    // Stored lowercased (normaliseEmail, and lower() in create_agency_with_owner_invite); eq, not
    // ilike, so an underscore in an address is not a wildcard.
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const invite = toInvite(data as unknown as InviteRow);
  return { id: invite.id, clientName: invite.clientName };
}

export async function countInvitesSince(orgId: string, sinceIso: string): Promise<number> {
  const { count, error } = await createServerSupabase()
    .from("org_invitations")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .gte("created_at", sinceIso);
  if (error) throw error;
  return count ?? 0;
}

export async function insertInvitation(i: { orgId: string; clientId: string; email: string; token: string; invitedBy: string }): Promise<OpenInvite> {
  const { data, error } = await createServerSupabase()
    .from("org_invitations")
    .insert({ org_id: i.orgId, client_id: i.clientId, email: i.email, token: i.token, invited_by: i.invitedBy, expires_at: expiry() })
    .select(INVITE_COLUMNS)
    .single();
  if (error) throw error;
  return toInvite(data as unknown as InviteRow);
}

/** Resend only: a new token (the old link stops working), sent now, 7 more days. Copy link never
 *  calls this; it shows the stored link. */
export async function replaceInvitationToken(orgId: string, inviteId: string, token: string): Promise<OpenInvite | null> {
  const { data, error } = await createServerSupabase()
    .from("org_invitations")
    .update({ token, created_at: new Date().toISOString(), expires_at: expiry() })
    .eq("id", inviteId)
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select(INVITE_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return data ? toInvite(data as unknown as InviteRow) : null;
}

export async function revokeInvitation(orgId: string, inviteId: string): Promise<boolean> {
  const { data, error } = await createServerSupabase()
    .from("org_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function getOpenOwnerInvite(orgId: string): Promise<OpenInvite | null> {
  const { data, error } = await createServerSupabase()
    .from("org_invitations")
    .select(INVITE_COLUMNS)
    .eq("org_id", orgId)
    .eq("as_owner", true)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? toInvite(data as unknown as InviteRow) : null;
}

type SignUpRow = {
  id: string;
  org_id: string;
  email: string;
  as_owner: boolean;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  invited_by: string | null;
  organizations: Embed<{ name: string }>;
  clients: Embed<{ name: string }>;
};

export async function getInvitationByToken(token: string): Promise<InvitationForSignUp | null> {
  const db = createServerSupabase();
  const { data, error } = await db
    .from("org_invitations")
    .select("id, org_id, email, as_owner, accepted_at, revoked_at, expires_at, invited_by, organizations(name), clients(name)")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as SignUpRow;
  let inviterName: string | null = null;
  if (row.invited_by) {
    const { data: profile, error: profileError } = await db.from("profiles").select("display_name").eq("user_id", row.invited_by).maybeSingle();
    if (profileError) throw profileError;
    inviterName = (profile as { display_name: string } | null)?.display_name ?? null;
  }
  return {
    id: row.id,
    orgId: row.org_id,
    orgName: unwrapEmbed(row.organizations)?.name ?? "",
    email: row.email,
    asOwner: row.as_owner,
    clientName: unwrapEmbed(row.clients)?.name ?? null,
    inviterName,
    open: !row.accepted_at && !row.revoked_at && new Date(row.expires_at).getTime() > Date.now(),
  };
}

export async function acceptInvitation(
  token: string,
  userId: string,
  displayName: string,
): Promise<{ orgId: string; clientId: string | null; asOwner: boolean; invitedBy: string | null }> {
  const { data, error } = await createServerSupabase().rpc("accept_invitation", {
    p_token: token,
    p_user_id: userId,
    p_display_name: displayName,
  });
  if (error) throw error;
  const row = ((data ?? []) as { org_id: string; client_id: string | null; as_owner: boolean; invited_by: string | null }[])[0];
  if (!row) throw new Error("The invitation was not accepted.");
  return { orgId: row.org_id, clientId: row.client_id, asOwner: row.as_owner, invitedBy: row.invited_by };
}

export async function transferOwner(orgId: string, userId: string): Promise<void> {
  const { error } = await createServerSupabase().rpc("transfer_agency_owner", { p_org_id: orgId, p_new_owner: userId });
  if (error) throw error;
}

export async function createAgencyWithOwnerInvite(a: { name: string; slug: string; ownerEmail: string; token: string; by: string }): Promise<string> {
  const { data, error } = await createServerSupabase().rpc("create_agency_with_owner_invite", {
    p_name: a.name,
    p_slug: a.slug,
    p_owner_email: a.ownerEmail,
    p_token: a.token,
    p_by: a.by,
  });
  if (error) throw error;
  return data as string;
}

export async function listOrgSlugs(): Promise<string[]> {
  const { data, error } = await createServerSupabase().from("organizations").select("slug");
  if (error) throw error;
  return ((data ?? []) as { slug: string }[]).map((r) => r.slug);
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/invites src/lib/people src/lib/db/people.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit` and `npx eslint src/lib/invites src/lib/people src/lib/db/people.ts src/lib/db/people.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/invites src/lib/people src/lib/db/people.ts src/lib/db/people.test.ts
git commit -m "feat(people): invite tokens and the people and invitation data layer"
git log -1 --format=%B
```

---

### Task 3: The people rules, shared by the owner and Admin

**Files:**
- Create: `src/lib/people/ops.ts`, `src/lib/people/ops.test.ts`

**Interfaces:**
- Consumes: Task 1's emails, Task 2's data layer, tokens, constants and helpers; `uniqueSlug` from `src/lib/slug.ts`.
- Produces: `type OpResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404 | 409 | 429; error: string }`; `type Agency = { orgId: string; orgName: string }`; `type Actor = { userId: string; name: string }`; `inviteToClient(agency, client: { id: string; name: string }, email: string, by: Actor): Promise<OpResult<InviteResult>>`; `resendInvite(agency, inviteId: string, by: Actor): Promise<OpResult<InviteResult>>` (Resend only: new token, emailed); `cancelInvite(agency, inviteId): Promise<OpResult<null>>`; `updatePermissions(agency, userId, permissions: Permission[], giveAccess: boolean): Promise<OpResult<{ emailed: boolean }>>`; `removePerson(agency, userId): Promise<OpResult<null>>`; `addToClient(agency, clientId, userIds: string[], by: Actor): Promise<OpResult<{ added: number }>>`; `removeFromClient(agency, clientId, userId): Promise<OpResult<null>>`; `makeOwner(agency, userId): Promise<OpResult<null>>`; `createAgency(name: string, ownerEmail: string, by: Actor): Promise<OpResult<{ orgId: string; link: string; emailed: boolean }>>`; `resendOwnerInvite(agency, by: Actor): Promise<OpResult<InviteResult>>`; `notifySignedUp(a: { orgId: string; orgName: string; userId: string; name: string; invitedBy: string | null }): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/people/ops.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  findLoginByEmail: vi.fn(), findOpenInviteByEmail: vi.fn(), countInvitesSince: vi.fn(), insertInvitation: vi.fn(),
  replaceInvitationToken: vi.fn(), revokeInvitation: vi.fn(), getMembership: vi.fn(), getMemberships: vi.fn(),
  setMemberPermissions: vi.fn(), deleteLogin: vi.fn(), addPeopleToClient: vi.fn(), removePersonFromClient: vi.fn(),
  transferOwner: vi.fn(), loginEmails: vi.fn(), ownerIds: vi.fn(), listOrgSlugs: vi.fn(),
  createAgencyWithOwnerInvite: vi.fn(), getOpenOwnerInvite: vi.fn(),
}));
vi.mock("@/lib/db/people", () => db);
const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email/send", () => ({ sendEmail }));

import {
  addToClient, cancelInvite, createAgency, inviteToClient, makeOwner, notifySignedUp,
  removePerson, resendInvite, updatePermissions,
} from "./ops";

const agency = { orgId: "org-1", orgName: "Acme" };
const client = { id: "c1", name: "Chupps" };
const by = { userId: "owner-1", name: "Asha" };
const invite = { id: "i1", email: "p@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "s", expiresAt: "e", link: "https://app.example/invite/stored" };

beforeEach(() => {
  for (const fn of Object.values(db)) fn.mockReset();
  sendEmail.mockReset().mockResolvedValue({ sent: true });
  process.env.APP_URL = "https://app.example";
  db.findLoginByEmail.mockResolvedValue(null);
  db.findOpenInviteByEmail.mockResolvedValue(null);
  db.countInvitesSince.mockResolvedValue(0);
  db.insertInvitation.mockResolvedValue(invite);
});

describe("inviteToClient (spec §6.2)", () => {
  it("creates the invite for this client, emails the link and returns it", async () => {
    const r = await inviteToClient(agency, client, "  P@X.com ", by);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(db.insertInvitation).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-1", clientId: "c1", email: "p@x.com", invitedBy: "owner-1" }));
    expect(db.insertInvitation.mock.calls[0][0].token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r.value.link).toBe("https://app.example/invite/stored");
    expect(sendEmail.mock.calls[0][0].text).toContain("https://app.example/invite/stored");
    expect(r.value.emailed).toBe(true);
    expect(sendEmail.mock.calls[0][0].subject).toBe("You're invited to Acme");
  });

  it("still creates the invite and returns the link when email is not set up", async () => {
    sendEmail.mockResolvedValue({ sent: false, reason: "not_configured" });
    const r = await inviteToClient(agency, client, "p@x.com", by);
    expect(r.ok && r.value.emailed).toBe(false);
    expect(db.insertInvitation).toHaveBeenCalled();
  });

  it.each([
    ["an invalid email", () => {}, "nope", 400, "Enter a valid email."],
    ["someone already in the agency", () => db.findLoginByEmail.mockResolvedValue({ userId: "u9", orgId: "org-1" }), "p@x.com", 409, "Already in Acme. Add them from the list."],
    ["an email with an open invite", () => db.findOpenInviteByEmail.mockResolvedValue({ id: "i0", clientName: "Bata" }), "p@x.com", 409, "Already invited to Bata. Once they've signed up, add them from the list."],
    ["an email with a login in another agency", () => db.findLoginByEmail.mockResolvedValue({ userId: "u9", orgId: "org-2" }), "p@x.com", 409, "This email already belongs to another agency."],
    ["the 51st invite today", () => db.countInvitesSince.mockResolvedValue(50), "p@x.com", 429, "You've sent 50 invites today. Try again tomorrow."],
  ])("refuses %s", async (_what, arrange, email, status, error) => {
    arrange();
    expect(await inviteToClient(agency, client, email, by)).toEqual({ ok: false, status, error });
    expect(db.insertInvitation).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("resendInvite and cancelInvite", () => {
  it("Resend replaces the token (the old link stops working) and emails the new link", async () => {
    const replaced = { ...invite, link: "https://app.example/invite/new" };
    db.replaceInvitationToken.mockResolvedValue(replaced);
    const r = await resendInvite(agency, "i1", by);
    expect(r).toEqual({ ok: true, value: { invite: replaced, link: "https://app.example/invite/new", emailed: true } });
    expect(db.replaceInvitationToken).toHaveBeenCalledWith("org-1", "i1", expect.stringMatching(/^[A-Za-z0-9_-]{43}$/));
    expect(sendEmail.mock.calls[0][0].text).toContain("https://app.example/invite/new");
  });

  it("Resend counts towards the daily limit", async () => {
    db.countInvitesSince.mockResolvedValue(50);
    expect(await resendInvite(agency, "i1", by)).toEqual({ ok: false, status: 429, error: "You've sent 50 invites today. Try again tomorrow." });
    expect(db.replaceInvitationToken).not.toHaveBeenCalled();
  });

  it("refuses an invite that is no longer open", async () => {
    db.replaceInvitationToken.mockResolvedValue(null);
    expect(await resendInvite(agency, "i1", by)).toEqual({ ok: false, status: 404, error: "That invite isn't open any more." });
    db.revokeInvitation.mockResolvedValue(false);
    expect(await cancelInvite(agency, "i1")).toEqual({ ok: false, status: 404, error: "That invite isn't open any more." });
  });
});

describe("updatePermissions (spec §6.1)", () => {
  it("gives access: saves the set, sets access given and emails the person", async () => {
    db.getMembership.mockResolvedValue({ isOwner: false, accessGiven: false });
    db.loginEmails.mockResolvedValue(["p@x.com"]);
    const r = await updatePermissions(agency, "u1", ["share", "view"], true);
    expect(r).toEqual({ ok: true, value: { emailed: true } });
    expect(db.setMemberPermissions).toHaveBeenCalledWith("org-1", "u1", ["view", "share"], true);
    expect(sendEmail.mock.calls[0][0].subject).toBe("Your access to Acme is ready");
  });

  it("edits a member's set without a second ready email", async () => {
    db.getMembership.mockResolvedValue({ isOwner: false, accessGiven: true });
    await updatePermissions(agency, "u1", ["view"], true);
    expect(db.setMemberPermissions).toHaveBeenCalledWith("org-1", "u1", ["view"], false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses the owner and someone not in the agency", async () => {
    db.getMembership.mockResolvedValue({ isOwner: true, accessGiven: true });
    expect(await updatePermissions(agency, "o1", ["view"], false)).toEqual({ ok: false, status: 409, error: "The agency owner has every permission already." });
    db.getMembership.mockResolvedValue(null);
    expect(await updatePermissions(agency, "x", ["view"], false)).toEqual({ ok: false, status: 404, error: "That person isn't in this agency." });
  });
});

describe("removePerson", () => {
  it("deletes the login of someone waiting or a member", async () => {
    db.getMembership.mockResolvedValue({ isOwner: false, accessGiven: false });
    expect(await removePerson(agency, "u1")).toEqual({ ok: true, value: null });
    expect(db.deleteLogin).toHaveBeenCalledWith("u1");
  });

  it("refuses the owner", async () => {
    db.getMembership.mockResolvedValue({ isOwner: true, accessGiven: true });
    expect(await removePerson(agency, "o1")).toEqual({ ok: false, status: 409, error: "The agency owner can't be removed." });
    expect(db.deleteLogin).not.toHaveBeenCalled();
  });
});

describe("addToClient", () => {
  it("adds the agency's people in one insert, skipping the owner", async () => {
    db.getMemberships.mockResolvedValue([{ userId: "u1", isOwner: false }, { userId: "o1", isOwner: true }, { userId: "u2", isOwner: false }]);
    expect(await addToClient(agency, "c1", ["u1", "o1", "u2"], by)).toEqual({ ok: true, value: { added: 2 } });
    expect(db.addPeopleToClient).toHaveBeenCalledWith("org-1", "c1", ["u1", "u2"], "owner-1");
  });

  it("refuses an id from outside the agency, and writes nothing", async () => {
    db.getMemberships.mockResolvedValue([{ userId: "u1", isOwner: false }]);
    expect(await addToClient(agency, "c1", ["u1", "stranger"], by)).toEqual({ ok: false, status: 404, error: "That person isn't in this agency." });
    expect(db.addPeopleToClient).not.toHaveBeenCalled();
  });
});

describe("makeOwner", () => {
  it("transfers ownership", async () => {
    db.getMembership.mockResolvedValue({ isOwner: false, accessGiven: true });
    expect(await makeOwner(agency, "u1")).toEqual({ ok: true, value: null });
    expect(db.transferOwner).toHaveBeenCalledWith("org-1", "u1");
  });
});

describe("createAgency (spec §6.6)", () => {
  it("creates the agency with its owner invite and emails the owner", async () => {
    db.listOrgSlugs.mockResolvedValue(["acme"]);
    db.createAgencyWithOwnerInvite.mockResolvedValue("org-9");
    const r = await createAgency("Acme", "O@X.com", by);
    expect(r).toMatchObject({ ok: true, value: { orgId: "org-9", emailed: true } });
    expect(db.createAgencyWithOwnerInvite).toHaveBeenCalledWith(expect.objectContaining({ name: "Acme", slug: "acme-2", ownerEmail: "o@x.com", by: "owner-1" }));
    expect(sendEmail.mock.calls[0][0].subject).toBe("Set up Acme on CreativeOS");
  });

  it("refuses an owner email that already has a login", async () => {
    db.findLoginByEmail.mockResolvedValue({ userId: "u9", orgId: "org-2" });
    expect(await createAgency("Acme", "o@x.com", by)).toEqual({ ok: false, status: 409, error: "This email already belongs to another agency." });
  });
});

describe("notifySignedUp", () => {
  it("emails the owner and the inviter once each", async () => {
    db.ownerIds.mockResolvedValue(["o1"]);
    db.loginEmails.mockResolvedValue(["o@x.com", "i@x.com"]);
    await notifySignedUp({ orgId: "org-1", orgName: "Acme", userId: "u1", name: "Ravi", invitedBy: "i1" });
    expect(db.loginEmails).toHaveBeenCalledWith(["o1", "i1"]);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: ["o@x.com", "i@x.com"], subject: "Ravi signed up to Acme" });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/lib/people/ops.test.ts`
Expected: FAIL, `Failed to resolve import "./ops"`.

- [ ] **Step 3: Write the rules**

```ts
// src/lib/people/ops.ts
import "server-only";
import * as people from "@/lib/db/people";
import { sendEmail } from "@/lib/email/send";
import { accessReadyEmail, appLink, memberInviteEmail, ownerInviteEmail, signedUpEmail } from "@/lib/email/templates";
import { inviteLink, newInviteToken } from "@/lib/invites/token";
import { orderedPermissions, toPermissionSet, type Permission } from "@/lib/permissions/model";
import { uniqueSlug } from "@/lib/slug";
import { INVITES_PER_AGENCY_PER_DAY, REFUSALS } from "./constants";
import type { InviteResult } from "./types";
import { isValidEmail, normaliseEmail, oneDayAgo } from "./utils";

// The people rules (spec §6.1–§6.3, §6.6), once for the owner's screens and Admin. Callers have
// already checked manage_team (withTeam) or the super admin (requireSuperAdmin). Refusals are
// returned with the spec's words; database faults throw and the route answers plainly.

export type OpResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 404 | 409 | 429; error: string };
export type Agency = { orgId: string; orgName: string };
export type Actor = { userId: string; name: string };

const ok = <T>(value: T): OpResult<T> => ({ ok: true, value });
const refuse = (status: 400 | 404 | 409 | 429, error: string): OpResult<never> => ({ ok: false, status, error });

export async function inviteToClient(agency: Agency, client: { id: string; name: string }, rawEmail: string, by: Actor): Promise<OpResult<InviteResult>> {
  const email = normaliseEmail(rawEmail);
  if (!isValidEmail(email)) return refuse(400, REFUSALS.invalidEmail);
  const [login, open, sentToday] = await Promise.all([
    people.findLoginByEmail(email),
    people.findOpenInviteByEmail(agency.orgId, email),
    people.countInvitesSince(agency.orgId, oneDayAgo()),
  ]);
  if (login?.orgId === agency.orgId) return refuse(409, REFUSALS.alreadyInAgency(agency.orgName));
  if (open) return refuse(409, REFUSALS.alreadyInvited(open.clientName ?? agency.orgName));
  // One agency per person (D508): any other login can't join from the link.
  if (login) return refuse(409, REFUSALS.otherAgency);
  if (sentToday >= INVITES_PER_AGENCY_PER_DAY) return refuse(429, REFUSALS.dailyLimit);

  const invite = await people.insertInvitation({ orgId: agency.orgId, clientId: client.id, email, token: newInviteToken(), invitedBy: by.userId });
  const link = invite.link;
  const mail = await sendEmail(memberInviteEmail({ to: email, agency: agency.orgName, inviter: by.name, client: client.name, link }));
  return ok({ invite, link, emailed: mail.sent });
}

/** Resend: a new token (the old link stops working), emailed, counted towards the daily limit.
 *  Copy link is not here: it shows the stored link (OpenInvite.link) and makes no request. */
export async function resendInvite(agency: Agency, inviteId: string, by: Actor): Promise<OpResult<InviteResult>> {
  if ((await people.countInvitesSince(agency.orgId, oneDayAgo())) >= INVITES_PER_AGENCY_PER_DAY) {
    return refuse(429, REFUSALS.dailyLimit);
  }
  const invite = await people.replaceInvitationToken(agency.orgId, inviteId, newInviteToken());
  if (!invite) return refuse(404, REFUSALS.inviteNotFound);
  const link = invite.link;
  const email = invite.asOwner
    ? ownerInviteEmail({ to: invite.email, agency: agency.orgName, link })
    : memberInviteEmail({ to: invite.email, agency: agency.orgName, inviter: by.name, client: invite.clientName ?? agency.orgName, link });
  const mail = await sendEmail(email);
  return ok({ invite, link, emailed: mail.sent });
}

export async function cancelInvite(agency: Agency, inviteId: string): Promise<OpResult<null>> {
  return (await people.revokeInvitation(agency.orgId, inviteId)) ? ok(null) : refuse(404, REFUSALS.inviteNotFound);
}

/** Give access (first time) or edit. The cascade carries the set onto every client row. */
export async function updatePermissions(agency: Agency, userId: string, permissions: Permission[], giveAccess: boolean): Promise<OpResult<{ emailed: boolean }>> {
  const member = await people.getMembership(agency.orgId, userId);
  if (!member) return refuse(404, REFUSALS.personNotFound);
  if (member.isOwner) return refuse(409, REFUSALS.ownerPermissions);
  const firstAccess = giveAccess && !member.accessGiven;
  await people.setMemberPermissions(agency.orgId, userId, orderedPermissions(toPermissionSet(permissions)), firstAccess);
  if (!firstAccess) return ok({ emailed: false });
  const [to] = await people.loginEmails([userId]);
  if (!to) return ok({ emailed: false });
  const mail = await sendEmail(accessReadyEmail({ to, agency: agency.orgName, link: appLink("/") }));
  return ok({ emailed: mail.sent });
}

export async function removePerson(agency: Agency, userId: string): Promise<OpResult<null>> {
  const member = await people.getMembership(agency.orgId, userId);
  if (!member) return refuse(404, REFUSALS.personNotFound);
  if (member.isOwner) return refuse(409, REFUSALS.ownerFixed);
  await people.deleteLogin(userId);
  return ok(null);
}

export async function addToClient(agency: Agency, clientId: string, userIds: string[], by: Actor): Promise<OpResult<{ added: number }>> {
  const unique = [...new Set(userIds)];
  const found = await people.getMemberships(agency.orgId, unique);
  if (found.length !== unique.length) return refuse(404, REFUSALS.personNotFound);
  // The owner is on every client already and never has a row.
  const toAdd = found.filter((m) => !m.isOwner).map((m) => m.userId);
  if (toAdd.length > 0) await people.addPeopleToClient(agency.orgId, clientId, toAdd, by.userId);
  return ok({ added: toAdd.length });
}

/** Off this client only: they stay in the agency with their other clients and permissions. */
export async function removeFromClient(agency: Agency, clientId: string, userId: string): Promise<OpResult<null>> {
  await people.removePersonFromClient(agency.orgId, clientId, userId);
  return ok(null);
}

export async function makeOwner(agency: Agency, userId: string): Promise<OpResult<null>> {
  const member = await people.getMembership(agency.orgId, userId);
  if (!member) return refuse(404, REFUSALS.personNotFound);
  if (!member.isOwner) await people.transferOwner(agency.orgId, userId);
  return ok(null);
}

export async function createAgency(name: string, rawEmail: string, by: Actor): Promise<OpResult<{ orgId: string; link: string; emailed: boolean }>> {
  const email = normaliseEmail(rawEmail);
  if (!isValidEmail(email)) return refuse(400, REFUSALS.invalidEmail);
  const [login, slugs] = await Promise.all([people.findLoginByEmail(email), people.listOrgSlugs()]);
  if (login) return refuse(409, REFUSALS.otherAgency);
  const token = newInviteToken();
  const orgId = await people.createAgencyWithOwnerInvite({ name, slug: uniqueSlug(name, slugs), ownerEmail: email, token, by: by.userId });
  const link = inviteLink(token);
  const mail = await sendEmail(ownerInviteEmail({ to: email, agency: name, link }));
  return ok({ orgId, link, emailed: mail.sent });
}

export async function resendOwnerInvite(agency: Agency, by: Actor): Promise<OpResult<InviteResult>> {
  const open = await people.getOpenOwnerInvite(agency.orgId);
  if (!open) return refuse(404, REFUSALS.inviteNotFound);
  return resendInvite(agency, open.id, by);
}

/** Spec §6.3: when a member signs up, the owner and whoever invited them are told. Best effort. */
export async function notifySignedUp(a: { orgId: string; orgName: string; userId: string; name: string; invitedBy: string | null }): Promise<void> {
  try {
    const owners = await people.ownerIds(a.orgId);
    const ids = [...new Set([...owners, ...(a.invitedBy ? [a.invitedBy] : [])])];
    const to = await people.loginEmails(ids);
    if (to.length === 0) return;
    await sendEmail(signedUpEmail({ to, name: a.name, agency: a.orgName, link: appLink(`/team?person=${a.userId}`) }));
  } catch (e) {
    console.error("[invite] could not send the signed-up notice", e);
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/people`
Expected: PASS.

Run: `npx tsc --noEmit` and `npx eslint src/lib/people`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/people/ops.ts src/lib/people/ops.test.ts
git commit -m "feat(people): invite, access, membership and agency rules in one place (spec 6)"
git log -1 --format=%B
```

---

### Task 4: `withTeam` and the people API

**Files:**
- Modify: `src/lib/api/route-helpers.ts` (add `withTeam`), `src/lib/db/impersonation-audit.ts` (`admin_action`), `src/lib/auth/impersonation-audit-view.ts` (`AuditEventType`), `src/lib/permissions/route-coverage.test.ts` (recognise `withTeam`), `src/lib/actions/with-action-coverage.test.ts` (drop `NOT_YET_CHECKED`)
- Delete: `src/lib/permissions/not-yet-checked.ts` (its last entry, `manage_team`, is now checked)
- Create (routes): `src/app/api/orgs/[orgId]/people/route.ts`, `src/app/api/orgs/[orgId]/people/[userId]/route.ts`, `src/app/api/orgs/[orgId]/people/[userId]/owner/route.ts`, `src/app/api/orgs/[orgId]/invites/[inviteId]/route.ts`, `src/app/api/orgs/[orgId]/invites/[inviteId]/resend/route.ts`, `src/app/api/orgs/[orgId]/clients/[clientId]/members/route.ts`, `src/app/api/orgs/[orgId]/clients/[clientId]/members/[userId]/route.ts`, `src/app/api/orgs/[orgId]/clients/[clientId]/invites/route.ts`
- Test: `src/lib/api/with-team.test.ts`, `src/app/api/orgs/[orgId]/people/route.test.ts`

**Interfaces:**
- Consumes: plan 3's `check`, `accessOf`, `resolveActingCaller`; `getOrgById`, `getClientById`, `getDisplayName`; Task 2's `listAgencyPeople`, `listOpenInvites`; Task 3's ops; `logImpersonationEvent`.
- Produces: `type TeamContext = { orgId: string; orgName: string; caller: CallerContext; actor: Actor; client: ClientRow | null; viaAdmin: boolean; logAdmin(action: string, detail?: Record<string, unknown>): Promise<void> }`; `withTeam(req, params: Promise<{ orgId: string; clientId?: string }>, guard: { need: "manage_team" }, handler: (ctx: TeamContext) => Promise<AnyResponse>)`; `opResponse<T extends Record<string, unknown>>(r: OpResult<T | null>): AnyResponse`. Routes: `GET /api/orgs/:orgId/people` → `AgencyPeople`; `PATCH /api/orgs/:orgId/people/:userId` `{ permissions, giveAccess? }` → `{ emailed }`; `DELETE /api/orgs/:orgId/people/:userId`; `POST /api/orgs/:orgId/people/:userId/owner` (super admin only); `DELETE /api/orgs/:orgId/invites/:inviteId`; `POST /api/orgs/:orgId/invites/:inviteId/resend` → `InviteResult` (new token, emailed; Copy link needs no route); `POST /api/orgs/:orgId/clients/:clientId/members` `{ userIds }` → `{ added }`; `DELETE /api/orgs/:orgId/clients/:clientId/members/:userId`; `POST /api/orgs/:orgId/clients/:clientId/invites` `{ email }` → `InviteResult`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/api/with-team.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));
vi.unmock("@/lib/permissions/server");

const m = vi.hoisted(() => ({
  caller: null as unknown,
  impersonation: { isImpersonating: false } as Record<string, unknown>,
  log: vi.fn(async () => undefined),
  org: { id: "org-1", name: "Acme" } as { id: string; name: string } | null,
  client: { id: "c1", org_id: "org-1", name: "Chupps" } as { id: string; org_id: string; name: string } | null,
}));
vi.mock("@/lib/dal", () => ({ resolveCallerContext: vi.fn(async () => m.caller) }));
vi.mock("@/lib/auth/impersonation", () => ({ resolveImpersonationState: vi.fn(async () => m.impersonation) }));
vi.mock("@/lib/db/impersonation-audit", () => ({ logImpersonationEvent: m.log }));
vi.mock("@/lib/db/organizations", () => ({ getOrgById: vi.fn(async () => m.org) }));
vi.mock("@/lib/db/clients", () => ({ getClientById: vi.fn(async () => m.client) }));
vi.mock("@/lib/db/profiles", () => ({ getDisplayName: vi.fn(async () => "Asha") }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));

import { withTeam } from "./route-helpers";
import { testAccess, testOwnerAccess } from "@/lib/permissions/test-fixtures";
import { accessFromRows } from "@/lib/permissions/model";

const req = (method: string) => new Request("http://x/api/orgs/org-1/people", { method });
const ok = vi.fn(async () => NextResponse.json({ ok: true }));
const caller = (access: unknown, platformRole = "member", orgId = "org-1") => ({ userId: "u1", email: "u1@x.com", platformRole, orgId, mustChangePassword: false, access });

describe("withTeam (spec §6.1, §6.6)", () => {
  beforeEach(() => {
    ok.mockClear();
    m.log.mockClear();
    m.impersonation = { isImpersonating: false };
    m.org = { id: "org-1", name: "Acme" };
    m.client = { id: "c1", org_id: "org-1", name: "Chupps" };
  });

  it("lets the owner manage their own agency", async () => {
    m.caller = caller(testOwnerAccess());
    const res = await withTeam(req("POST"), Promise.resolve({ orgId: "org-1" }), { need: "manage_team" }, ok);
    expect(res.status).toBe(200);
    expect(ok).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-1", orgName: "Acme", viaAdmin: false, actor: { userId: "u1", name: "Asha" } }));
  });

  it("refuses a member with 403, and another agency with 404", async () => {
    m.caller = caller(testAccess({ permissions: ["view", "edit"], clientIds: ["c1"] }));
    expect((await withTeam(req("POST"), Promise.resolve({ orgId: "org-1" }), { need: "manage_team" }, ok)).status).toBe(403);
    m.caller = caller(testOwnerAccess("org-2"), "member", "org-2");
    expect((await withTeam(req("GET"), Promise.resolve({ orgId: "org-1" }), { need: "manage_team" }, ok)).status).toBe(404);
    expect(ok).not.toHaveBeenCalled();
  });

  it("lets a super admin manage any agency from Admin, writing each change to the audit log", async () => {
    m.caller = caller(accessFromRows("u1", true, []), "super_admin", "yuvabe");
    const handler = vi.fn(async (ctx: { logAdmin: (a: string, d?: Record<string, unknown>) => Promise<void> }) => {
      await ctx.logAdmin("remove_person", { userId: "u7" });
      return NextResponse.json({ ok: true });
    });
    const res = await withTeam(req("DELETE"), Promise.resolve({ orgId: "org-1" }), { need: "manage_team" }, handler as never);
    expect(res.status).toBe(200);
    expect(m.log).toHaveBeenCalledWith({ operatorId: "u1", targetOrgId: "org-1", eventType: "admin_action", detail: { action: "remove_person", userId: "u7" } });
  });

  it("keeps view-as rules while the super admin views as that agency (read-only blocks writes)", async () => {
    m.caller = caller(accessFromRows("u1", true, []), "super_admin", "yuvabe");
    m.impersonation = { isImpersonating: true, operatorId: "u1", targetOrgId: "org-1", elevated: false };
    expect((await withTeam(req("POST"), Promise.resolve({ orgId: "org-1" }), { need: "manage_team" }, ok)).status).toBe(403);
  });

  it("answers 404 for a client of another agency, and hands over the client otherwise", async () => {
    m.caller = caller(testOwnerAccess());
    m.client = { id: "c9", org_id: "org-2", name: "Other" };
    expect((await withTeam(req("POST"), Promise.resolve({ orgId: "org-1", clientId: "c9" }), { need: "manage_team" }, ok)).status).toBe(404);
    m.client = { id: "c1", org_id: "org-1", name: "Chupps" };
    await withTeam(req("POST"), Promise.resolve({ orgId: "org-1", clientId: "c1" }), { need: "manage_team" }, ok);
    expect(ok).toHaveBeenCalledWith(expect.objectContaining({ client: expect.objectContaining({ id: "c1" }) }));
  });

  it("answers 404 for an agency that does not exist", async () => {
    m.caller = caller(accessFromRows("u1", true, []), "super_admin", "yuvabe");
    m.org = null;
    expect((await withTeam(req("GET"), Promise.resolve({ orgId: "nope" }), { need: "manage_team" }, ok)).status).toBe(404);
  });
});
```

```ts
// src/app/api/orgs/[orgId]/people/route.test.ts
import { describe, it, expect, vi } from "vitest";
import { NextResponse } from "next/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/api/route-helpers", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/route-helpers")>()),
  withTeam: vi.fn(async (_req: Request, _p: unknown, _g: unknown, handler: (ctx: unknown) => Promise<NextResponse>) =>
    handler({ orgId: "org-1", orgName: "Acme", viaAdmin: false, logAdmin: vi.fn() })),
}));
vi.mock("@/lib/db/people", () => ({
  listAgencyPeople: vi.fn(async () => [{ userId: "u1", status: "owner" }]),
  listOpenInvites: vi.fn(async () => [{ id: "i1" }]),
}));

import { GET } from "./route";

describe("GET /api/orgs/:orgId/people", () => {
  it("answers the agency's people and open invites in one response", async () => {
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ orgId: "org-1" }) });
    expect(await res.json()).toEqual({ people: [{ userId: "u1", status: "owner" }], invites: [{ id: "i1" }] });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/lib/api/with-team.test.ts "src/app/api/orgs"`
Expected: FAIL (`withTeam` is not exported; the route file is missing).

- [ ] **Step 3: `withTeam`**

`src/lib/db/impersonation-audit.ts`: add `| "admin_action"` to `ImpersonationEventType`. `src/lib/auth/impersonation-audit-view.ts`: add `| "admin_action"` to `AuditEventType` (the Support activity view groups session events; an `admin_action` outside a session is skipped there, as other events without a session are).

In `src/lib/api/route-helpers.ts` add the imports

```ts
import { getOrgById } from "@/lib/db/organizations";
import { getDisplayName } from "@/lib/db/profiles";
import type { Actor, OpResult } from "@/lib/people/ops";
```

and, after `withAccess`:

```ts
// ── Team (spec §6.1, §6.2, §6.6) ──────────────────────────────────────────────

export type TeamContext = {
  orgId: string;
  orgName: string;
  caller: CallerContext;
  /** Who is acting, for invites and emails ("{Inviter} has invited you"). */
  actor: Actor;
  /** Set when the route has a clientId: that client, checked to be in this agency. */
  client: ClientRow | null;
  /** A super admin working on the agency from Admin (not while viewing as it). */
  viaAdmin: boolean;
  /** Writes made from Admin go to the audit log as admin_action; a no-op for the owner. */
  logAdmin: (action: string, detail?: Record<string, unknown>) => Promise<void>;
};

// One chokepoint for the owner's Team and Members screens and Admin's People and Clients tabs.
// The owner passes manage_team in the agency they act in, under the usual impersonation write
// gate. A super admin working from Admin passes for any agency (D85: Admin is platform
// administration, not acting as the agency) and each change is audit-logged; while they view as
// this same agency, the owner path and its write gate apply. The agency, the client and the
// caller are read side by side.
export async function withTeam(
  req: Request,
  params: Promise<{ orgId: string; clientId?: string }>,
  guard: { need: "manage_team" },
  handler: (ctx: TeamContext) => Promise<AnyResponse>,
): Promise<AnyResponse> {
  const { orgId, clientId } = await params;
  const [acting, org, client] = await Promise.all([
    resolveActingCaller(),
    getOrgById(orgId),
    clientId ? getClientById(clientId) : Promise.resolve(null),
  ]);
  if (!org) return apiError("Not found.", 404);
  if (clientId && (!client || client.org_id !== orgId)) return apiError("Client not found.", 404);

  const { caller, impersonation } = acting;
  const viewingThisAgency = impersonation.isImpersonating && impersonation.targetOrgId === orgId;
  const viaAdmin = caller.platformRole === "super_admin" && !viewingThisAgency;
  if (!viaAdmin) {
    if (orgId !== acting.effectiveOrgId) return apiError("Not found.", 404);
    const decision = check(accessOf(caller), guard.need, { orgId, clientId: null });
    if (decision !== "allow") return denial(decision, "Not found.");
    const blocked = await writeGate(req, impersonation);
    if (blocked) return blocked;
  }

  const name = await getDisplayName(caller.userId);
  const logAdmin = async (action: string, detail: Record<string, unknown> = {}) => {
    if (!viaAdmin) return;
    await logImpersonationEvent({ operatorId: caller.userId, targetOrgId: orgId, eventType: "admin_action", detail: { action, ...detail } });
  };
  return handler({ orgId, orgName: org.name, caller, actor: { userId: caller.userId, name: name ?? "Your agency owner" }, client, viaAdmin, logAdmin });
}

/** A people rule's answer as a response: refusals with their status and words. */
export function opResponse<T extends Record<string, unknown>>(result: OpResult<T | null>): AnyResponse {
  if (!result.ok) return apiError(result.error, result.status);
  return apiOk(result.value ?? {});
}
```

(The display name read is one primary-key lookup, after the gate so a refused caller costs nothing more.)

- [ ] **Step 4: The routes**

```ts
// src/app/api/orgs/[orgId]/people/route.ts
import { apiOk, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { listAgencyPeople, listOpenInvites } from "@/lib/db/people";

type Ctx = { params: Promise<{ orgId: string }> };

// GET — the agency's people and open invites: the Team page, every Members list and the invite
// popup read this one response (spec §10).
export async function GET(req: Request, { params }: Ctx) {
  return withTeam(req, params, { need: "manage_team" }, ({ orgId }) =>
    withQuietErrors("Could not load the team.", async () => {
      const [people, invites] = await Promise.all([listAgencyPeople(orgId), listOpenInvites(orgId)]);
      return apiOk({ people, invites });
    }),
  );
}
```

```ts
// src/app/api/orgs/[orgId]/people/[userId]/route.ts
import { apiError, opResponse, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { removePerson, updatePermissions } from "@/lib/people/ops";
import { UpdatePermissionsSchema } from "@/lib/people/schema";

type Ctx = { params: Promise<{ orgId: string; userId: string }> };

// PATCH { permissions, giveAccess? } — the Team page's editor (spec §6.1). Give access saves the
// set and lets them in; the cascade puts it on every client they are on.
export async function PATCH(req: Request, { params }: Ctx) {
  const { userId } = await params;
  return withTeam(req, params, { need: "manage_team" }, (ctx) =>
    withQuietErrors("Could not save the permissions.", async () => {
      const parsed = UpdatePermissionsSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Choose permissions from the list.", 400);
      const result = await updatePermissions(ctx, userId, parsed.data.permissions, parsed.data.giveAccess ?? false);
      if (result.ok) await ctx.logAdmin(parsed.data.giveAccess ? "give_access" : "set_permissions", { userId, permissions: parsed.data.permissions });
      return opResponse(result);
    }),
  );
}

// DELETE — remove someone waiting, or a member, from the agency.
export async function DELETE(req: Request, { params }: Ctx) {
  const { userId } = await params;
  return withTeam(req, params, { need: "manage_team" }, (ctx) =>
    withQuietErrors("Could not remove them.", async () => {
      const result = await removePerson(ctx, userId);
      if (result.ok) await ctx.logAdmin("remove_person", { userId });
      return opResponse(result);
    }),
  );
}
```

```ts
// src/app/api/orgs/[orgId]/people/[userId]/owner/route.ts
import { apiError, opResponse, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { makeOwner } from "@/lib/people/ops";

type Ctx = { params: Promise<{ orgId: string; userId: string }> };

// POST — Make owner (spec §6.6): only the super admin moves ownership; the previous owner becomes
// a member with all six on every client.
export async function POST(req: Request, { params }: Ctx) {
  const { userId } = await params;
  return withTeam(req, params, { need: "manage_team" }, (ctx) =>
    withQuietErrors("Could not change the owner.", async () => {
      if (ctx.caller.platformRole !== "super_admin") return apiError("Not found.", 404);
      const result = await makeOwner(ctx, userId);
      if (result.ok) await ctx.logAdmin("make_owner", { userId });
      return opResponse(result);
    }),
  );
}
```

```ts
// src/app/api/orgs/[orgId]/invites/[inviteId]/route.ts
import { opResponse, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { cancelInvite } from "@/lib/people/ops";

type Ctx = { params: Promise<{ orgId: string; inviteId: string }> };

// DELETE — cancel an open invite (Team page, Members list).
export async function DELETE(req: Request, { params }: Ctx) {
  const { inviteId } = await params;
  return withTeam(req, params, { need: "manage_team" }, (ctx) =>
    withQuietErrors("Could not cancel the invite.", async () => {
      const result = await cancelInvite(ctx, inviteId);
      if (result.ok) await ctx.logAdmin("cancel_invite", { inviteId });
      return opResponse(result);
    }),
  );
}
```

```ts
// src/app/api/orgs/[orgId]/invites/[inviteId]/resend/route.ts
import { opResponse, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { resendInvite } from "@/lib/people/ops";

type Ctx = { params: Promise<{ orgId: string; inviteId: string }> };

// POST — Resend: a new token, so the old link stops working, and the new link emailed. (Copy link
// needs no route: each open invite in the people list carries its stored link.)
export async function POST(req: Request, { params }: Ctx) {
  const { inviteId } = await params;
  return withTeam(req, params, { need: "manage_team" }, (ctx) =>
    withQuietErrors("Could not send the invite.", async () => {
      const result = await resendInvite(ctx, inviteId, ctx.actor);
      if (result.ok) await ctx.logAdmin("resend_invite", { inviteId });
      return opResponse(result);
    }),
  );
}
```

```ts
// src/app/api/orgs/[orgId]/clients/[clientId]/members/route.ts
import { apiError, opResponse, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { addToClient } from "@/lib/people/ops";
import { AddMembersSchema } from "@/lib/people/schema";

type Ctx = { params: Promise<{ orgId: string; clientId: string }> };

// POST { userIds } — "Add n people" in the invite popup's first step (spec §6.2). One insert; each
// row copies the person's agency set.
export async function POST(req: Request, { params }: Ctx) {
  return withTeam(req, params, { need: "manage_team" }, (ctx) =>
    withQuietErrors("Could not add them.", async () => {
      const parsed = AddMembersSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Choose people from the list.", 400);
      const result = await addToClient(ctx, ctx.client!.id, parsed.data.userIds, ctx.actor);
      if (result.ok) await ctx.logAdmin("add_to_client", { clientId: ctx.client!.id, userIds: parsed.data.userIds });
      return opResponse(result);
    }),
  );
}
```

```ts
// src/app/api/orgs/[orgId]/clients/[clientId]/members/[userId]/route.ts
import { opResponse, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { removeFromClient } from "@/lib/people/ops";

type Ctx = { params: Promise<{ orgId: string; clientId: string; userId: string }> };

// DELETE — off this client only; they keep the agency, their other clients and their permissions.
export async function DELETE(req: Request, { params }: Ctx) {
  const { userId } = await params;
  return withTeam(req, params, { need: "manage_team" }, (ctx) =>
    withQuietErrors("Could not remove them from this client.", async () => {
      const result = await removeFromClient(ctx, ctx.client!.id, userId);
      if (result.ok) await ctx.logAdmin("remove_from_client", { clientId: ctx.client!.id, userId });
      return opResponse(result);
    }),
  );
}
```

```ts
// src/app/api/orgs/[orgId]/clients/[clientId]/invites/route.ts
import { apiError, opResponse, withQuietErrors, withTeam } from "@/lib/api/route-helpers";
import { inviteToClient } from "@/lib/people/ops";
import { InviteSchema } from "@/lib/people/schema";

type Ctx = { params: Promise<{ orgId: string; clientId: string }> };

// POST { email } — "Invite someone new" (spec §6.2): the invite is always for this client.
export async function POST(req: Request, { params }: Ctx) {
  return withTeam(req, params, { need: "manage_team" }, (ctx) =>
    withQuietErrors("Could not send the invite.", async () => {
      const parsed = InviteSchema.safeParse(await req.json().catch(() => null));
      if (!parsed.success) return apiError("Enter a valid email.", 400);
      const client = ctx.client!;
      const result = await inviteToClient(ctx, { id: client.id, name: client.name }, parsed.data.email, ctx.actor);
      if (result.ok) await ctx.logAdmin("invite", { clientId: client.id, email: result.value.invite.email });
      return opResponse(result);
    }),
  );
}
```

- [ ] **Step 5: Coverage knows `withTeam`, and `manage_team` is checked**

`src/lib/permissions/route-coverage.test.ts`: in `GUARDED_RE` change `(withClient|withCanvas|withNode|withMoodboard|withAccess)` to `(withClient|withCanvas|withNode|withMoodboard|withAccess|withTeam)`.

`git rm src/lib/permissions/not-yet-checked.ts`, and in `src/lib/actions/with-action-coverage.test.ts` delete the `NOT_YET_CHECKED` import and change the filter to `const missing = ACTIONS.filter((a) => !used.has(a));` (the new routes under `src/app/api/orgs` are already in its `collect("src/app/api", "route.ts")` and name `"manage_team"`).

- [ ] **Step 6: Run the tests**

```bash
npx vitest run src/lib/api src/lib/permissions src/lib/actions/with-action-coverage.test.ts "src/app/api/orgs"
```

Expected: PASS.

Run: `npx tsc --noEmit` and `npx eslint src/lib/api src/app/api/orgs src/lib/db/impersonation-audit.ts src/lib/auth/impersonation-audit-view.ts`.

- [ ] **Step 7: Commit**

```bash
git add -A src/lib/api src/app/api/orgs src/lib/db/impersonation-audit.ts src/lib/auth/impersonation-audit-view.ts src/lib/permissions src/lib/actions/with-action-coverage.test.ts
git commit -m "feat(people): withTeam and the people API for the owner and Admin (spec 6.1, 6.2, 6.6)"
git log -1 --format=%B
```

---

### Task 5: People on TanStack Query

**Files:**
- Create: `src/services/people.service.ts`, `src/services/people.service.test.ts`, `src/hooks/queries/people.ts`, `src/hooks/queries/__tests__/people.test.ts`

**Interfaces:**
- Consumes: Task 4's routes; `readJson`; plan 3's `invalidateMe`.
- Produces: `peopleService` with `list(orgId): Promise<AgencyPeople>`, `updatePermissions(orgId, userId, input: { permissions: Permission[]; giveAccess?: boolean }): Promise<{ emailed: boolean }>`, `remove(orgId, userId): Promise<void>`, `makeOwner(orgId, userId): Promise<void>`, `resendInvite(orgId, inviteId): Promise<InviteResult>`, `cancelInvite(orgId, inviteId): Promise<void>`, `addToClient(orgId, clientId, userIds: string[]): Promise<{ added: number }>`, `removeFromClient(orgId, clientId, userId): Promise<void>`, `inviteToClient(orgId, clientId, email: string): Promise<InviteResult>`; `peopleKeys = { all(orgId), list(orgId) }`; `usePeople(orgId, initialData?)`; `useUpdatePermissions(orgId)`, `useRemovePerson(orgId)`, `useMakeOwner(orgId)`, `useResendInvite(orgId)`, `useCancelInvite(orgId)`, `useAddToClient(orgId, clientId)`, `useRemoveFromClient(orgId, clientId)`, `useInviteToClient(orgId, clientId)`.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

```ts
// src/hooks/queries/__tests__/people.test.ts
import { describe, it, expect } from "vitest";
import { peopleKeys } from "../people";

describe("peopleKeys", () => {
  it("keys each agency's people apart", () => {
    expect(peopleKeys.list("org-1")).toEqual(["people", "org-1", "list"]);
    expect(peopleKeys.all("org-2")).toEqual(["people", "org-2"]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/services/people.service.test.ts src/hooks/queries/__tests__/people.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: The service and the query file**

```ts
// src/services/people.service.ts
import type { Permission } from "@/lib/permissions/model";
import type { AgencyPeople, InviteResult } from "@/lib/people/types";
import { readJson } from "./read-json";

const JSON_HEADERS = { "Content-Type": "application/json" };
const base = (orgId: string) => `/api/orgs/${orgId}`;

class PeopleService {
  async list(orgId: string): Promise<AgencyPeople> {
    return readJson<AgencyPeople>(await fetch(`${base(orgId)}/people`), "Could not load the team.");
  }

  async updatePermissions(orgId: string, userId: string, input: { permissions: Permission[]; giveAccess?: boolean }): Promise<{ emailed: boolean }> {
    const res = await fetch(`${base(orgId)}/people/${userId}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(input) });
    return readJson<{ emailed: boolean }>(res, "Could not save the permissions.");
  }

  async remove(orgId: string, userId: string): Promise<void> {
    await readJson(await fetch(`${base(orgId)}/people/${userId}`, { method: "DELETE" }), "Could not remove them.");
  }

  async makeOwner(orgId: string, userId: string): Promise<void> {
    await readJson(await fetch(`${base(orgId)}/people/${userId}/owner`, { method: "POST" }), "Could not change the owner.");
  }

  /** Resend: a new link, emailed. Copy link needs no call (OpenInvite.link). */
  async resendInvite(orgId: string, inviteId: string): Promise<InviteResult> {
    const res = await fetch(`${base(orgId)}/invites/${inviteId}/resend`, { method: "POST" });
    return readJson<InviteResult>(res, "Could not send the invite.");
  }

  async cancelInvite(orgId: string, inviteId: string): Promise<void> {
    await readJson(await fetch(`${base(orgId)}/invites/${inviteId}`, { method: "DELETE" }), "Could not cancel the invite.");
  }

  async addToClient(orgId: string, clientId: string, userIds: string[]): Promise<{ added: number }> {
    const res = await fetch(`${base(orgId)}/clients/${clientId}/members`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ userIds }) });
    return readJson<{ added: number }>(res, "Could not add them.");
  }

  async removeFromClient(orgId: string, clientId: string, userId: string): Promise<void> {
    await readJson(await fetch(`${base(orgId)}/clients/${clientId}/members/${userId}`, { method: "DELETE" }), "Could not remove them from this client.");
  }

  async inviteToClient(orgId: string, clientId: string, email: string): Promise<InviteResult> {
    const res = await fetch(`${base(orgId)}/clients/${clientId}/invites`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ email }) });
    return readJson<InviteResult>(res, "Could not send the invite.");
  }
}

export const peopleService = new PeopleService();
```

```ts
// src/hooks/queries/people.ts
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { peopleService } from "@/services/people.service";
import { invalidateMe } from "@/hooks/queries/me";
import type { Permission } from "@/lib/permissions/model";
import type { AgencyPeople } from "@/lib/people/types";

// One people resource per agency (spec §10): the Team page, every Members list and the invite
// popup select from it. Keys are built here and nowhere else.
export const peopleKeys = {
  all: (orgId: string) => ["people", orgId] as const,
  list: (orgId: string) => [...peopleKeys.all(orgId), "list"] as const,
};

/** Seeded by the page's server render; refetched whenever a screen mounts, since another owner
 *  session (or Admin) may have changed it. */
export function usePeople(orgId: string, initialData?: AgencyPeople) {
  return useQuery({
    queryKey: peopleKeys.list(orgId),
    queryFn: () => peopleService.list(orgId),
    initialData,
    staleTime: 0,
  });
}

function useRefreshPeople(orgId: string, alsoMe = false) {
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({ queryKey: peopleKeys.all(orgId) });
    // The header's Signed up count rides on /api/me.
    if (alsoMe) await invalidateMe(queryClient);
  };
}

export function useUpdatePermissions(orgId: string) {
  const refresh = useRefreshPeople(orgId, true);
  return useMutation({
    mutationFn: (v: { userId: string; permissions: Permission[]; giveAccess?: boolean }) =>
      peopleService.updatePermissions(orgId, v.userId, { permissions: v.permissions, giveAccess: v.giveAccess }),
    onSuccess: refresh,
  });
}

export function useRemovePerson(orgId: string) {
  const refresh = useRefreshPeople(orgId, true);
  return useMutation({ mutationFn: (userId: string) => peopleService.remove(orgId, userId), onSuccess: refresh });
}

export function useMakeOwner(orgId: string) {
  const refresh = useRefreshPeople(orgId);
  return useMutation({ mutationFn: (userId: string) => peopleService.makeOwner(orgId, userId), onSuccess: refresh });
}

export function useResendInvite(orgId: string) {
  const refresh = useRefreshPeople(orgId);
  return useMutation({
    mutationFn: (inviteId: string) => peopleService.resendInvite(orgId, inviteId),
    onSuccess: refresh,
  });
}

export function useCancelInvite(orgId: string) {
  const refresh = useRefreshPeople(orgId);
  return useMutation({ mutationFn: (inviteId: string) => peopleService.cancelInvite(orgId, inviteId), onSuccess: refresh });
}

export function useAddToClient(orgId: string, clientId: string) {
  const refresh = useRefreshPeople(orgId);
  return useMutation({ mutationFn: (userIds: string[]) => peopleService.addToClient(orgId, clientId, userIds), onSuccess: refresh });
}

export function useRemoveFromClient(orgId: string, clientId: string) {
  const refresh = useRefreshPeople(orgId);
  return useMutation({ mutationFn: (userId: string) => peopleService.removeFromClient(orgId, clientId, userId), onSuccess: refresh });
}

export function useInviteToClient(orgId: string, clientId: string) {
  const refresh = useRefreshPeople(orgId);
  return useMutation({ mutationFn: (email: string) => peopleService.inviteToClient(orgId, clientId, email), onSuccess: refresh });
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/services/people.service.test.ts src/hooks/queries`
Expected: PASS.

Run: `npx tsc --noEmit` and `npx eslint src/services/people.service.ts src/hooks/queries/people.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/services/people.service.ts src/services/people.service.test.ts src/hooks/queries/people.ts src/hooks/queries/__tests__/people.test.ts
git commit -m "feat(people): people service and query hooks with one key factory"
git log -1 --format=%B
```

---

### Task 6: The permission editor

**Files:**
- Create: `src/components/team/permission-editor.tsx`, `src/components/team/__tests__/permission-editor.test.tsx`

**Interfaces:**
- Consumes: `PERMISSIONS`, `orderedPermissions`, `type Permission`; `PERMISSION_LABELS`.
- Produces: `PermissionEditor({ value: Permission[]; onChange: (next: Permission[]) => void; personName: string; disabled?: boolean })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/team/__tests__/permission-editor.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PermissionEditor } from "../permission-editor";

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("PermissionEditor (D509)", () => {
  it("shows a chip with a remove button for each permission, in order", () => {
    const html = renderToStaticMarkup(<PermissionEditor value={["share", "view"]} onChange={vi.fn()} personName="Ravi" />);
    expect(text(html)).toMatch(/View .*Share/);
    expect(html).toContain('aria-label="Remove View"');
    expect(html).toContain('aria-label="Remove Share"');
  });

  it("starts with none, then Choose a permission and Add", () => {
    const html = renderToStaticMarkup(<PermissionEditor value={[]} onChange={vi.fn()} personName="Ravi" />);
    expect(text(html)).toContain("Choose a permission");
    expect(text(html)).toContain("Add");
    expect(html).not.toContain("aria-label=\"Remove");
  });

  it("says where the permissions apply", () => {
    const html = renderToStaticMarkup(<PermissionEditor value={[]} onChange={vi.fn()} personName="Ravi" />);
    expect(text(html)).toContain("These apply on every client Ravi is on, and on any client they're added to later.");
  });

  it("hides the picker once all six are chosen", () => {
    const html = renderToStaticMarkup(
      <PermissionEditor value={["view", "edit", "generate", "approve", "share", "delete"]} onChange={vi.fn()} personName="Ravi" />,
    );
    expect(text(html)).not.toContain("Choose a permission");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/components/team`
Expected: FAIL (module missing).

- [ ] **Step 3: Write the editor**

```tsx
// src/components/team/permission-editor.tsx
"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERMISSIONS, orderedPermissions, type Permission } from "@/lib/permissions/model";
import { PERMISSION_LABELS } from "@/lib/people/constants";

// D509: the only place permissions are set. Chips with ×, then "Choose a permission" and Add;
// none to start. The parent saves (Give access, or Save on a member).
export function PermissionEditor({
  value,
  onChange,
  personName,
  disabled = false,
}: {
  value: Permission[];
  onChange: (next: Permission[]) => void;
  personName: string;
  disabled?: boolean;
}) {
  const [choice, setChoice] = useState<Permission | null>(null);
  const held = orderedPermissions(value);
  const remaining = PERMISSIONS.filter((p) => !held.includes(p));
  const items = remaining.map((p) => ({ value: p, label: PERMISSION_LABELS[p] }));

  function add() {
    if (!choice) return;
    onChange(orderedPermissions([...held, choice]));
    setChoice(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {held.map((p) => (
          <span key={p} className="flex items-center gap-1 rounded-md border border-border bg-muted/40 py-0.5 pr-0.5 pl-2 text-sm">
            {PERMISSION_LABELS[p]}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${PERMISSION_LABELS[p]}`}
              disabled={disabled}
              onClick={() => onChange(held.filter((h) => h !== p))}
            >
              <X className="size-3" strokeWidth={1.5} />
            </Button>
          </span>
        ))}
        {remaining.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Select items={items} value={choice} onValueChange={(v) => setChoice((v as Permission | null) ?? null)} disabled={disabled}>
              <SelectTrigger size="sm" className="w-44" aria-label="Choose a permission">
                <SelectValue placeholder="Choose a permission" />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-dashed border-primary/40 text-primary hover:bg-primary/5"
              disabled={disabled || !choice}
              onClick={add}
            >
              <Plus className="size-3.5" strokeWidth={1.5} />
              Add
            </Button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        These apply on every client {personName} is on, and on any client they&apos;re added to later.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/components/team`
Expected: PASS.

Run: `npx tsc --noEmit` and `npx eslint src/components/team`.

- [ ] **Step 5: Commit**

```bash
git add src/components/team
git commit -m "feat(team): the permission editor, chips with a picker (D509)"
git log -1 --format=%B
```

---

### Task 7: The Team page

**Files:**
- Create: `src/components/team/team-people.tsx`, `src/components/team/team-waiting-card.tsx`, `src/components/team/team-invited-row.tsx`, `src/components/team/team-invited-list.tsx`, `src/components/team/team-member-row.tsx`, `src/app/team/page.tsx`, `src/components/team/__tests__/team-people.test.tsx`
- Move: `src/components/admin/copy-row.tsx` → `src/components/shared/copy-row.tsx` (update its imports: `git grep -l "admin/copy-row" -- src`); `src/app/admin/orgs/[id]/remove-member-dialog.tsx` → `src/components/team/remove-person-dialog.tsx` (generalised below)

**Interfaces:**
- Consumes: Task 5's hooks; Task 6's editor; `peopleOnClient`, `signedUpPeople`; `STATUS_LABELS`; `formatRelativeTime`; plan 3's `check`, `accessOf`, `resolveActingCaller`; `listAgencyPeople`, `listOpenInvites`, `listClients`.
- Produces: `TeamPeople({ orgId: string; clients: { id: string; name: string }[]; initial?: AgencyPeople; focusUserId?: string | null; canMakeOwner?: boolean; extraMemberActions?: (person: AgencyPerson) => ReactNode })`; `RemovePersonDialog({ name: string; detail: string; onConfirm: () => Promise<void>; label?: string })`; the `/team` page (owner only, 404 otherwise; `?person=<userId>` highlights that person).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/team/__tests__/team-people.test.tsx
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/services/people.service", () => ({ peopleService: { list: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/team" }));

import { TeamPeople } from "../team-people";
import type { AgencyPeople, AgencyPerson } from "@/lib/people/types";

const person = (over: Partial<AgencyPerson>): AgencyPerson => ({
  userId: "u", name: "N", email: "n@x.com", status: "member", permissions: [], joinedAt: "2026-11-10T00:00:00Z",
  invitedByName: null, invitedClient: null, clientIds: [], ...over,
});
const data: AgencyPeople = {
  people: [
    person({ userId: "o", name: "Asha", email: "asha@x.com", status: "owner" }),
    person({ userId: "m", name: "Meera", email: "meera@x.com", permissions: ["view", "edit"], clientIds: ["c1"] }),
    person({ userId: "w", name: "Ravi", email: "ravi@x.com", status: "signed_up", invitedByName: "Asha", invitedClient: { id: "c1", name: "Chupps" }, clientIds: ["c1"] }),
  ],
  invites: [{ id: "i1", email: "new@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "2026-11-12T00:00:00Z", expiresAt: "2026-11-19T00:00:00Z", link: "https://app.example/invite/tok1" }],
};
const render = (props: Partial<Parameters<typeof TeamPeople>[0]> = {}) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TeamPeople orgId="org-1" clients={[{ id: "c1", name: "Chupps" }]} initial={data} {...props} />
    </QueryClientProvider>,
  );
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("TeamPeople (spec §6.1)", () => {
  it("has three sections: Waiting for you, Invited, Members", () => {
    const t = text(render());
    expect(t.indexOf("Waiting for you")).toBeLessThan(t.indexOf("Invited"));
    expect(t.indexOf("Invited")).toBeLessThan(t.indexOf("Members"));
  });

  it("shows a signed-up person with where they were invited, an editor and Give access", () => {
    const t = text(render());
    expect(t).toContain("Ravi");
    expect(t).toMatch(/Signed up .* · invited to Chupps by Asha/);
    expect(t).toContain("Give access");
    expect(t).toContain("Choose a permission");
  });

  it("copies the stored link without a request: Copy link reads invite.link, only Resend calls the server", () => {
    const source = readFileSync("src/components/team/team-invited-row.tsx", "utf8");
    expect(source).toContain("navigator.clipboard.writeText(invite.link)");
    expect(source).not.toMatch(/mutateAsync\(\{[^}]*email/);
  });

  it("lists open invites with their client, Copy link, Resend and Cancel", () => {
    const t = text(render());
    expect(t).toContain("new@x.com");
    expect(t).toContain("Copy link");
    expect(t).toContain("Resend");
    expect(t).toContain("Cancel");
  });

  it("lists the owner first with no actions, then members with their chips, clients, Edit and Remove", () => {
    const t = text(render());
    expect(t.indexOf("Asha")).toBeLessThan(t.indexOf("Meera"));
    expect(t).toMatch(/Meera .*View .*Edit .*Chupps/);
    expect(t).toContain("Remove");
  });

  it("offers Make owner only where asked (Admin)", () => {
    expect(text(render())).not.toContain("Make owner");
    expect(text(render({ canMakeOwner: true }))).toContain("Make owner");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/components/team`
Expected: FAIL (module missing).

- [ ] **Step 3: Move the shared pieces**

```bash
mkdir -p src/components/shared
git mv src/components/admin/copy-row.tsx src/components/shared/copy-row.tsx
git grep -l "admin/copy-row" -- src | xargs sed -i 's#@/components/admin/copy-row#@/components/shared/copy-row#; s#"\./copy-row"#"@/components/shared/copy-row"#'
git grep -l '"./copy-row"' -- src/components/admin | xargs -r sed -i 's#"\./copy-row"#"@/components/shared/copy-row"#'
git mv "src/app/admin/orgs/[id]/remove-member-dialog.tsx" src/components/team/remove-person-dialog.tsx
```

Replace the whole of `src/components/team/remove-person-dialog.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// D181, generalised for the Team page and Admin. Plain Buttons rather than the Close-primitive
// actions: a click must not close the dialog before the removal resolves, because a refusal
// (the owner can't be removed) is one the person has to read.
export function RemovePersonDialog({
  name,
  detail,
  onConfirm,
  label = "Remove",
}: {
  name: string;
  /** What removing does here, e.g. "They lose access to Acme and their login is deleted." */
  detail: string;
  onConfirm: () => Promise<void>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    if (saving) return;
    setOpen(next);
    if (!next) setError(null);
  }

  async function confirm() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove them.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
            <AlertDialogDescription>{detail}</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Work they made stays where it is. It will show as made by <span className="font-medium">an unknown maker</span>.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" disabled={saving} onClick={() => void confirm()}>
              {saving ? "Removing…" : label}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

`src/app/admin/orgs/[id]/org-detail-tabs.tsx` imported the moved file; until Task 13 replaces its roster, point it at the moved dialog so this commit compiles. Replace `import { RemoveMemberDialog } from "./remove-member-dialog";` with

```tsx
import { RemovePersonDialog } from "@/components/team/remove-person-dialog";
import { removeOrgMemberAction } from "@/lib/actions/admin";
```

and the `<RemoveMemberDialog orgId={org.id} userId={m.user_id} displayName={m.display_name} email={m.email} />` element with

```tsx
                  <RemovePersonDialog
                    name={m.display_name}
                    detail={`This deletes their account (${m.email}) and they lose access immediately.`}
                    onConfirm={async () => {
                      const res = await removeOrgMemberAction(org.id, m.user_id);
                      if (res?.error) throw new Error(res.error);
                    }}
                  />
```

- [ ] **Step 4: The sections**

```tsx
// src/components/team/team-waiting-card.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRemovePerson, useUpdatePermissions } from "@/hooks/queries/people";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { Permission } from "@/lib/permissions/model";
import type { AgencyPerson } from "@/lib/people/types";
import { PermissionEditor } from "./permission-editor";
import { RemovePersonDialog } from "./remove-person-dialog";

// Spec §6.1 "Waiting for you": someone who signed up. Give access saves the permissions and lets
// them in; the cascade fills the client rows they already have, and they are emailed.
export function TeamWaitingCard({ orgId, person, clientNames, focused }: { orgId: string; person: AgencyPerson; clientNames: ReadonlyMap<string, string>; focused: boolean }) {
  const [draft, setDraft] = useState<Permission[]>([]);
  const update = useUpdatePermissions(orgId);
  const remove = useRemovePerson(orgId);
  const clients = person.clientIds.map((id) => clientNames.get(id)).filter(Boolean).join(", ");
  const invited = person.invitedClient
    ? ` · invited to ${person.invitedClient.name}${person.invitedByName ? ` by ${person.invitedByName}` : ""}`
    : "";

  return (
    <Card id={`person-${person.userId}`} className={`flex flex-col gap-4 p-5 shadow-card ${focused ? "ring-2 ring-primary/40" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{person.name}</span>
          <span className="text-sm text-muted-foreground">{person.email}</span>
          <span className="text-xs text-muted-foreground">
            Signed up {formatRelativeTime(person.joinedAt)}{invited}
          </span>
          {clients && <span className="mt-1 text-xs text-muted-foreground">Clients: {clients}</span>}
        </div>
        <RemovePersonDialog
          name={person.name}
          detail="They haven't started yet. Their login is deleted and the invite link stops working."
          onConfirm={() => remove.mutateAsync(person.userId)}
        />
      </div>
      <PermissionEditor value={draft} onChange={setDraft} personName={person.name} disabled={update.isPending} />
      {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}
      <div>
        <Button disabled={draft.length === 0 || update.isPending} onClick={() => update.mutate({ userId: person.userId, permissions: draft, giveAccess: true })}>
          {update.isPending ? "Giving access…" : "Give access"}
        </Button>
      </div>
    </Card>
  );
}
```

```tsx
// src/components/team/team-invited-row.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyRow } from "@/components/shared/copy-row";
import { useCancelInvite, useResendInvite } from "@/hooks/queries/people";
import { formatRelativeTime } from "@/lib/format/relative-time";
import type { OpenInvite } from "@/lib/people/types";

// Spec §6.1 "Invited", and the invite rows of a client's Members list (one look for both). Copy
// link copies the stored link: the same link every time, no request. Resend issues a new link
// (the old one stops working) and emails it; the people list refreshes with the new link.
export function TeamInvitedRow({
  orgId,
  invite,
  showClient = true,
  status,
}: {
  orgId: string;
  invite: OpenInvite;
  showClient?: boolean;
  /** The Members list shows the status ("Invited") beside the email. */
  status?: string;
}) {
  const resend = useResendInvite(orgId);
  const cancel = useCancelInvite(orgId);
  const [showLink, setShowLink] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function copyLink() {
    void navigator.clipboard.writeText(invite.link);
    setShowLink(true);
    setNotice("Link copied.");
  }

  async function resendInvite() {
    try {
      const result = await resend.mutateAsync(invite.id);
      setShowLink(!result.emailed);
      setNotice(result.emailed ? "Sent again with a new link. The old link no longer works." : "The email wasn't sent. Copy the new link and send it to them.");
    } catch {
      // Shown below through resend.error.
    }
  }

  const error = resend.error ?? cancel.error;
  return (
    <li className="flex flex-col gap-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{invite.email}</span>
          {status && <span className="text-xs text-muted-foreground">{status}</span>}
          <span className="text-xs text-muted-foreground">
            {showClient && invite.clientName ? `${invite.clientName} · ` : ""}Sent {formatRelativeTime(invite.sentAt)} · Expires {formatRelativeTime(invite.expiresAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={copyLink}>Copy link</Button>
          <Button size="sm" variant="outline" disabled={resend.isPending} onClick={() => void resendInvite()}>Resend</Button>
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={cancel.isPending} onClick={() => cancel.mutate(invite.id)}>
            Cancel
          </Button>
        </div>
      </div>
      {/* invite.link follows the people list, so after a Resend this is the new link. */}
      {showLink && <CopyRow label="Invite link" value={invite.link} />}
      {notice && <p className="text-xs text-muted-foreground">{notice}</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
    </li>
  );
}
```

```tsx
// src/components/team/team-invited-list.tsx
"use client";

import type { OpenInvite } from "@/lib/people/types";
import { TeamInvitedRow } from "./team-invited-row";

export function TeamInvitedList({ orgId, invites }: { orgId: string; invites: OpenInvite[] }) {
  if (invites.length === 0) return <p className="text-sm text-muted-foreground">No open invites.</p>;
  return (
    <ul className="flex flex-col">
      {invites.map((i) => <TeamInvitedRow key={i.id} orgId={orgId} invite={i} />)}
    </ul>
  );
}
```

```tsx
// src/components/team/team-member-row.tsx
"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useMakeOwner, useRemovePerson, useUpdatePermissions } from "@/hooks/queries/people";
import { PERMISSION_LABELS, STATUS_LABELS } from "@/lib/people/constants";
import type { Permission } from "@/lib/permissions/model";
import type { AgencyPerson } from "@/lib/people/types";
import { PermissionEditor } from "./permission-editor";
import { RemovePersonDialog } from "./remove-person-dialog";

// Spec §6.1 "Members". The owner has no actions. Edit opens the same editor; saving changes the
// agency level and the cascade applies it to every client they are on.
export function TeamMemberRow({
  orgId,
  person,
  clientNames,
  canMakeOwner,
  extraActions,
  focused,
}: {
  orgId: string;
  person: AgencyPerson;
  clientNames: ReadonlyMap<string, string>;
  canMakeOwner: boolean;
  extraActions?: ReactNode;
  focused: boolean;
}) {
  const [editing, setEditing] = useState<Permission[] | null>(null);
  const update = useUpdatePermissions(orgId);
  const remove = useRemovePerson(orgId);
  const makeOwner = useMakeOwner(orgId);
  const isOwner = person.status === "owner";
  const clients = person.clientIds.map((id) => clientNames.get(id)).filter(Boolean).join(", ");

  async function save() {
    if (!editing) return;
    await update.mutateAsync({ userId: person.userId, permissions: editing });
    setEditing(null);
  }

  const error = update.error ?? makeOwner.error;
  return (
    <li id={`person-${person.userId}`} className={`flex flex-col gap-3 border-b py-3 last:border-b-0 ${focused ? "rounded-lg bg-primary/5 px-2" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="font-medium">{person.name}</span>
          <span className="text-xs text-muted-foreground">{person.email}</span>
          {isOwner ? (
            <span className="text-xs text-muted-foreground">{STATUS_LABELS.owner} · every permission on every client</span>
          ) : (
            <>
              <span className="flex flex-wrap gap-1">
                {person.permissions.map((p) => (
                  <span key={p} className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs">{PERMISSION_LABELS[p]}</span>
                ))}
              </span>
              {clients && <span className="text-xs text-muted-foreground">Clients: {clients}</span>}
            </>
          )}
        </div>
        {!isOwner && (
          <div className="flex items-center gap-2">
            {canMakeOwner && (
              <Button size="sm" variant="ghost" disabled={makeOwner.isPending} onClick={() => makeOwner.mutate(person.userId)}>Make owner</Button>
            )}
            {extraActions}
            {editing === null && <Button size="sm" variant="outline" onClick={() => setEditing(person.permissions)}>Edit</Button>}
            <RemovePersonDialog
              name={person.name}
              detail="They lose access to every client of this agency at once, and their login is deleted."
              onConfirm={() => remove.mutateAsync(person.userId)}
            />
          </div>
        )}
      </div>
      {editing !== null && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <PermissionEditor value={editing} onChange={setEditing} personName={person.name} disabled={update.isPending} />
          <div className="flex gap-2">
            <Button size="sm" disabled={update.isPending} onClick={() => void save()}>{update.isPending ? "Saving…" : "Save"}</Button>
            <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error.message}</p>}
    </li>
  );
}
```

```tsx
// src/components/team/team-people.tsx
"use client";

import { useMemo, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { usePeople } from "@/hooks/queries/people";
import { signedUpPeople } from "@/lib/people/utils";
import type { AgencyPeople, AgencyPerson } from "@/lib/people/types";
import { TeamWaitingCard } from "./team-waiting-card";
import { TeamInvitedList } from "./team-invited-list";
import { TeamMemberRow } from "./team-member-row";

// Spec §6.1: the Team page, the only place permissions are set. Rendered on /team for the owner
// and as Admin's People tab (orgId of that agency, with Make owner and reset password there).
export function TeamPeople({
  orgId,
  clients,
  initial,
  focusUserId = null,
  canMakeOwner = false,
  extraMemberActions,
}: {
  orgId: string;
  clients: { id: string; name: string }[];
  initial?: AgencyPeople;
  focusUserId?: string | null;
  canMakeOwner?: boolean;
  extraMemberActions?: (person: AgencyPerson) => ReactNode;
}) {
  const { data, error } = usePeople(orgId, initial);
  const clientNames = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  if (error && !data) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!data) return null;

  const waiting = signedUpPeople(data.people);
  const members = data.people.filter((p) => p.status !== "signed_up");
  const invites = data.invites.filter((i) => !i.asOwner);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h2 className="text-eyebrow">Waiting for you</h2>
        {waiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is waiting for permissions.</p>
        ) : (
          waiting.map((p) => <TeamWaitingCard key={p.userId} orgId={orgId} person={p} clientNames={clientNames} focused={p.userId === focusUserId} />)
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-eyebrow">Invited</h2>
        <Card className="px-5 py-2 shadow-card"><TeamInvitedList orgId={orgId} invites={invites} /></Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-eyebrow">Members</h2>
        <Card className="px-5 py-2 shadow-card">
          <ul className="flex flex-col">
            {members.map((p) => (
              <TeamMemberRow
                key={p.userId}
                orgId={orgId}
                person={p}
                clientNames={clientNames}
                canMakeOwner={canMakeOwner}
                extraActions={extraMemberActions?.(p)}
                focused={p.userId === focusUserId}
              />
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
```

```tsx
// src/app/team/page.tsx
import { notFound } from "next/navigation";
import { check } from "@/lib/permissions/check";
import { accessOf, resolveActingCaller } from "@/lib/permissions/server";
import { listAgencyPeople, listOpenInvites } from "@/lib/db/people";
import { listClients } from "@/lib/db/clients";
import { TeamPeople } from "@/components/team/team-people";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team — CreativeOS" };

// Spec §6.1, owner only (a member gets the 404 page). ?person=<id> highlights that person, the
// target of a Members list's "Set permissions" and of the signed-up email.
export default async function TeamPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const [{ caller, effectiveOrgId }, { person }] = await Promise.all([resolveActingCaller(), searchParams]);
  if (check(accessOf(caller), "manage_team", { orgId: effectiveOrgId, clientId: null }) !== "allow") notFound();
  const [people, invites, clients] = await Promise.all([
    listAgencyPeople(effectiveOrgId),
    listOpenInvites(effectiveOrgId),
    listClients(effectiveOrgId, null),
  ]);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="font-display mb-8 text-2xl font-semibold tracking-tight">Team</h1>
      <TeamPeople
        orgId={effectiveOrgId}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        initial={{ people, invites }}
        focusUserId={person ?? null}
      />
    </main>
  );
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/team src/components/admin src/app/admin`
Expected: PASS.

Run: `npx tsc --noEmit` and `npx eslint src/components/team src/components/shared src/app/team "src/app/admin/orgs/[id]"`.

- [ ] **Step 6: Commit**

```bash
git add -A src/components/team src/components/shared src/components/admin src/app/team "src/app/admin/orgs/[id]"
git commit -m "feat(team): the Team page: waiting, invited and members, permissions set here only (spec 6.1)"
git log -1 --format=%B
```

---

### Task 8: The header's Team link counts who signed up

**Files:**
- Create: `src/components/identity/team-nav-link.tsx`, `src/components/identity/__tests__/team-nav-link.test.tsx`
- Modify: `src/lib/me/types.ts`, `src/lib/me/payload.ts`, `src/lib/me/payload.test.ts`, `src/lib/me/test-fixtures.ts`, `src/hooks/use-identity.ts`, `src/components/layout/header-actions.tsx`, `src/app/api/me/route.test.ts`

**Interfaces:**
- Consumes: Task 2's `countSignedUp`; plan 3's `check`, `useCan`.
- Produces: `MePayload.signedUpCount: number | null` (owner only); `useIdentity().signedUpCount`; `TeamNavLink()`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/identity/__tests__/team-nav-link.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/services/me.service", () => ({ fetchMe: vi.fn() }));

import { TeamNavLink } from "../team-nav-link";
import { AccessProvider } from "@/components/permissions/access-provider";
import { testMePayload } from "@/lib/me/test-fixtures";

const render = (payload: ReturnType<typeof testMePayload>) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <AccessProvider initial={payload}><TeamNavLink /></AccessProvider>
    </QueryClientProvider>,
  );

describe("TeamNavLink (spec §6.1)", () => {
  it("shows the owner the Team link with how many signed up", () => {
    const html = render(testMePayload({ isOwner: true, clients: [], signedUpCount: 2 }));
    expect(html).toContain('href="/team"');
    expect(html).toContain("Team");
    expect(html).toContain(">2<");
  });

  it("shows no count when nobody is waiting", () => {
    expect(render(testMePayload({ isOwner: true, clients: [], signedUpCount: 0 }))).not.toMatch(/>0</);
  });

  it("is not shown to a member", () => {
    expect(render(testMePayload())).toBe("");
  });
});
```

In `src/lib/me/payload.test.ts`, add `vi.mock("@/lib/db/people", () => ({ countSignedUp: vi.fn(async () => 1) }));` beside the other mocks and `signedUpCount: 1` to the owner's expected object.

In `src/app/api/me/route.test.ts`, add `countSignedUp: vi.fn(async () => 3)` to the hoisted `m`, `vi.mock("@/lib/db/people", () => ({ countSignedUp: m.countSignedUp }));`, and in "sends the owner's agency…" add `signedUpCount: 3` to the expected object; in "sends no credit figures…" add `expect(me.signedUpCount).toBeNull(); expect(m.countSignedUp).not.toHaveBeenCalled();` (and `m.countSignedUp.mockClear()` in `beforeEach`).

- [ ] **Step 2: Run them to see them fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/components/identity src/app/api/me`
Expected: FAIL.

- [ ] **Step 3: The count and the link**

`src/lib/me/types.ts`: add after `monthlyCreditLimit`:

```ts
  /** People signed up and waiting for permissions, for the header's Team link. Null unless manage_team. */
  signedUpCount: number | null;
```

`src/lib/me/payload.ts`: add `import { countSignedUp } from "@/lib/db/people";`; after `showCredits` add `const showTeam = check(access, "manage_team", { orgId: effectiveOrgId, clientId: null }) === "allow";`; extend the `Promise.all` to `const [name, orgRow, creditsUsed, signedUpCount] = await Promise.all([ …, showTeam ? countSignedUp(effectiveOrgId) : Promise.resolve(null) ]);` and add `signedUpCount,` to the returned object.

`src/lib/me/test-fixtures.ts`: add `signedUpCount: null,` before `...over`.

`src/hooks/use-identity.ts`: add `signedUpCount: number | null;` to the return type and `signedUpCount: data?.signedUpCount ?? null,` to the object.

```tsx
// src/components/identity/team-nav-link.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useCan } from "@/components/permissions/use-can";
import { useIdentity } from "@/hooks/use-identity";
import { cn } from "@/lib/utils";

// Spec §6.1: the owner's way to the Team page, with how many people signed up and wait for
// permissions. The count rides on /api/me, so this makes no request of its own.
export function TeamNavLink() {
  const canManage = useCan("manage_team");
  const { signedUpCount } = useIdentity();
  const pathname = usePathname();
  if (!canManage) return null;
  const isActive = pathname?.startsWith("/team") ?? false;
  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={<Link href="/team" />}
      className={cn("gap-1.5 underline decoration-2 underline-offset-4", isActive ? "text-foreground decoration-primary" : "text-muted-foreground decoration-transparent")}
    >
      Team
      {signedUpCount !== null && signedUpCount > 0 && (
        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[0.65rem] font-semibold text-primary-foreground">{signedUpCount}</span>
      )}
    </Button>
  );
}
```

`src/components/layout/header-actions.tsx`: add `import { TeamNavLink } from "@/components/identity/team-nav-link";` and render `<TeamNavLink />` just before `<AdminNavLink />`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/identity src/app/api/me src/lib/me src/hooks`
Expected: PASS.

Run: `npx tsc --noEmit` and `npx eslint src/components/identity src/components/layout src/lib/me src/hooks/use-identity.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/components/identity src/components/layout/header-actions.tsx src/lib/me src/hooks/use-identity.ts src/app/api/me/route.test.ts
git commit -m "feat(team): the header's Team link shows how many people signed up"
git log -1 --format=%B
```

---

### Task 9: A client's Members page, beside Brand Workspace

**Files:**
- Create: `src/components/team/client-members.tsx`, `src/components/team/client-member-row.tsx`, `src/components/clients/client-members-button.tsx`, `src/app/clients/[id]/members/page.tsx`, `src/components/team/__tests__/client-members.test.tsx`
- Modify: `src/app/clients/[id]/(canvases)/page.tsx` (the Members button)

**Interfaces:**
- Consumes: Task 5's hooks; `peopleOnClient`, `invitesForClient`; `STATUS_LABELS`; Task 7's `TeamInvitedRow`; plan 3's `loadClientPage`, `check`, `useCan`.
- Produces: `ClientMembers({ orgId: string; client: { id: string; name: string }; initial?: AgencyPeople; teamHref: (userId: string) => string; inviteSlot?: ReactNode })`; `ClientMembersButton({ slug: string })` (owner only); the `/clients/[id]/members` page (owner only, 404 otherwise). Task 10 adds the invite popup through `inviteSlot`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/team/__tests__/client-members.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/services/people.service", () => ({ peopleService: { list: vi.fn() } }));

import { ClientMembers } from "../client-members";
import type { AgencyPeople, AgencyPerson } from "@/lib/people/types";

const person = (over: Partial<AgencyPerson>): AgencyPerson => ({
  userId: "u", name: "N", email: "n@x.com", status: "member", permissions: [], joinedAt: "t",
  invitedByName: null, invitedClient: null, clientIds: [], ...over,
});
const data: AgencyPeople = {
  people: [
    person({ userId: "o", name: "Asha", status: "owner" }),
    person({ userId: "m", name: "Meera", clientIds: ["c1"] }),
    person({ userId: "w", name: "Ravi", status: "signed_up", clientIds: ["c1"] }),
    person({ userId: "x", name: "Elsewhere", clientIds: ["c2"] }),
  ],
  invites: [{ id: "i1", email: "new@x.com", clientId: "c1", clientName: "Chupps", asOwner: false, sentAt: "2026-11-12T00:00:00Z", expiresAt: "2026-11-19T00:00:00Z", link: "https://app.example/invite/tok1" }],
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const render = () =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ClientMembers orgId="org-1" client={{ id: "c1", name: "Chupps" }} initial={data} teamHref={(id) => `/team?person=${id}`} />
    </QueryClientProvider>,
  );

describe("ClientMembers (spec §6.2)", () => {
  it("counts the people on this client: the owner, members, people waiting and open invites", () => {
    expect(text(render())).toContain("4 people on this client");
  });

  it("shows each status, the owner without actions", () => {
    const t = text(render());
    expect(t).toMatch(/Asha n@x\.com Owner/);
    expect(t).toMatch(/Meera n@x\.com Member/);
    expect(t).toMatch(/Ravi n@x\.com Signed up · Needs permissions/);
    expect(t).toMatch(/new@x\.com Invited/);
    expect(t).not.toContain("Elsewhere");
  });

  it("links someone waiting to the Team page, and offers Remove on people", () => {
    const html = render();
    expect(html).toContain('href="/team?person=w"');
    expect(text(html)).toContain("Set permissions");
    expect(text(html)).toContain("Remove");
    expect(text(html)).toContain("Resend");
  });

  it("never edits permissions here", () => {
    expect(text(render())).not.toContain("Choose a permission");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/components/team/__tests__/client-members.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: The list, the row, the button and the page**

```tsx
// src/components/team/client-member-row.tsx
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useRemoveFromClient } from "@/hooks/queries/people";
import { STATUS_LABELS } from "@/lib/people/constants";
import type { AgencyPerson } from "@/lib/people/types";
import { RemovePersonDialog } from "./remove-person-dialog";

// One person on a client's Members list: Name, Status, Actions (spec §6.2). Remove takes them off
// this client only; permissions are set on the Team page.
export function ClientMemberRow({ orgId, clientId, clientName, person, teamHref }: {
  orgId: string;
  clientId: string;
  clientName: string;
  person: AgencyPerson;
  teamHref: (userId: string) => string;
}) {
  const remove = useRemoveFromClient(orgId, clientId);
  return (
    <li className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b py-3 text-sm last:border-b-0">
      <div className="flex min-w-0 flex-col">
        <span className="font-medium">{person.name}</span>
        <span className="truncate text-xs text-muted-foreground">{person.email}</span>
      </div>
      <span className="text-muted-foreground">{STATUS_LABELS[person.status]}</span>
      <div className="flex items-center justify-end gap-2">
        {person.status === "signed_up" && (
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={teamHref(person.userId)} />}>
            Set permissions
          </Button>
        )}
        {person.status !== "owner" && (
          <RemovePersonDialog
            name={person.name}
            detail={`They come off ${clientName} only. They stay in the agency with their other clients and permissions.`}
            onConfirm={() => remove.mutateAsync(person.userId)}
          />
        )}
      </div>
    </li>
  );
}
```

```tsx
// src/components/team/client-members.tsx
"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { usePeople } from "@/hooks/queries/people";
import { STATUS_LABELS } from "@/lib/people/constants";
import { invitesForClient, peopleOnClient } from "@/lib/people/utils";
import type { AgencyPeople } from "@/lib/people/types";
import { ClientMemberRow } from "./client-member-row";
import { TeamInvitedRow } from "./team-invited-row";

// Spec §6.2: who works on this client. Invite, add and remove; permissions are not edited here
// (D509). Rendered on /clients/[id]/members for the owner and in Admin's Clients tab.
export function ClientMembers({
  orgId,
  client,
  initial,
  teamHref,
  inviteSlot,
}: {
  orgId: string;
  client: { id: string; name: string };
  initial?: AgencyPeople;
  teamHref: (userId: string) => string;
  /** The Invite popup (Task 10), placed in the header. */
  inviteSlot?: ReactNode;
}) {
  const { data, error } = usePeople(orgId, initial);
  if (error && !data) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!data) return null;
  const people = peopleOnClient(data.people, client.id);
  const invites = invitesForClient(data.invites, client.id);
  const count = people.length + invites.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-eyebrow">{count} {count === 1 ? "person" : "people"} on this client</h2>
        {inviteSlot}
      </div>
      <Card className="px-5 py-2 shadow-card">
        <div className="text-eyebrow grid grid-cols-[1fr_auto_auto] gap-4 border-b py-2 text-[0.7rem] text-muted-foreground/80">
          <span>Name</span><span>Status</span><span className="text-right">Actions</span>
        </div>
        <ul className="flex flex-col">
          {people.map((p) => (
            <ClientMemberRow key={p.userId} orgId={orgId} clientId={client.id} clientName={client.name} person={p} teamHref={teamHref} />
          ))}
          {invites.map((i) => (
            <TeamInvitedRow key={i.id} orgId={orgId} invite={i} showClient={false} status={STATUS_LABELS.invited} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
```

```tsx
// src/components/clients/client-members-button.tsx
"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCan } from "@/components/permissions/use-can";

// Spec §6.2: the Members button sits beside Brand Workspace, for the owner only.
export function ClientMembersButton({ slug }: { slug: string }) {
  if (!useCan("manage_team")) return null;
  return (
    <Button variant="outline" nativeButton={false} render={<Link href={`/clients/${slug}/members`} />}>
      <Users className="size-4" strokeWidth={1.5} />
      Members
    </Button>
  );
}
```

```tsx
// src/app/clients/[id]/members/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClientPage } from "@/lib/permissions/page";
import { check } from "@/lib/permissions/check";
import { accessOf } from "@/lib/permissions/server";
import { listAgencyPeople, listOpenInvites } from "@/lib/db/people";
import { ClientMembers } from "@/components/team/client-members";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export const dynamic = "force-dynamic";

// Spec §6.2, owner only: a member who opens the address gets the 404 page.
export default async function ClientMembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { client, caller, effectiveOrgId } = await loadClientPage(id, "view");
  if (check(accessOf(caller), "manage_team", { orgId: effectiveOrgId, clientId: null }) !== "allow") notFound();
  const [people, invites] = await Promise.all([listAgencyPeople(effectiveOrgId), listOpenInvites(effectiveOrgId)]);
  const ref = { id: client.id, name: client.name };
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink render={<Link href="/">Clients</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink render={<Link href={`/clients/${client.slug}`}>{client.name}</Link>} /></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Members</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="font-display mb-8 text-2xl font-semibold tracking-tight">Members</h1>
      <ClientMembers
        orgId={effectiveOrgId}
        client={ref}
        initial={{ people, invites }}
        teamHref={(userId) => `/team?person=${userId}`}
      />
    </main>
  );
}
```

(Task 10 adds the Invite popup through `inviteSlot`.)

`src/app/clients/[id]/(canvases)/page.tsx`: add `import { ClientMembersButton } from "@/components/clients/client-members-button";` and render `<ClientMembersButton slug={client.slug} />` right after `<ClientSettingsMenu slug={client.slug} />`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/team src/components/clients`
Expected: PASS.

Run: `npx tsc --noEmit` and `npx eslint src/components/team src/components/clients "src/app/clients/[id]/members" "src/app/clients/[id]/(canvases)/page.tsx"`.

- [ ] **Step 5: Commit**

```bash
git add src/components/team src/components/clients/client-members-button.tsx "src/app/clients/[id]/members" "src/app/clients/[id]/(canvases)/page.tsx"
git commit -m "feat(team): a client's Members page beside Brand Workspace, with statuses (spec 6.2)"
git log -1 --format=%B
```

---

### Task 10: The two-step invite popup

**Files:**
- Create: `src/components/team/invite-dialog.tsx`, `src/components/team/invite-dialog-add-step.tsx`, `src/components/team/invite-dialog-email-step.tsx`, `src/components/team/__tests__/invite-dialog.test.tsx`
- Modify: `src/app/clients/[id]/members/page.tsx` (the `inviteSlot`)

**Interfaces:**
- Consumes: `usePeople`, `useAddToClient`, `useInviteToClient`; `peopleNotOnClient`; `STATUS_LABELS`; `CopyRow`.
- Produces: `InviteDialog({ orgId: string; client: { id: string; name: string } })`; `InviteDialogAddStep({ orgId, client, onInviteNew, onDone })`; `InviteDialogEmailStep({ orgId, client, onBack })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/team/__tests__/invite-dialog.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/services/people.service", () => ({ peopleService: { list: vi.fn() } }));

import { InviteDialogAddStep } from "../invite-dialog-add-step";
import { InviteDialogEmailStep } from "../invite-dialog-email-step";
import { peopleKeys } from "@/hooks/queries/people";
import type { AgencyPeople, AgencyPerson } from "@/lib/people/types";

const person = (over: Partial<AgencyPerson>): AgencyPerson => ({
  userId: "u", name: "N", email: "n@x.com", status: "member", permissions: [], joinedAt: "t",
  invitedByName: null, invitedClient: null, clientIds: [], ...over,
});
const data: AgencyPeople = {
  people: [
    person({ userId: "o", name: "Asha", status: "owner" }),
    person({ userId: "m", name: "Meera", clientIds: ["c1"] }),
    person({ userId: "w", name: "Ravi", status: "signed_up", clientIds: ["c2"] }),
    person({ userId: "x", name: "Kiran", clientIds: ["c2"] }),
  ],
  invites: [],
};
const client = { id: "c1", name: "Chupps" };
const withPeople = (el: React.ReactElement) => {
  const qc = new QueryClient();
  qc.setQueryData(peopleKeys.list("org-1"), data);
  return renderToStaticMarkup(<QueryClientProvider client={qc}>{el}</QueryClientProvider>);
};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

describe("invite popup (spec §6.2)", () => {
  it("step 1 lists everyone in the agency not on this client, people waiting included, never the owner", () => {
    const t = text(withPeople(<InviteDialogAddStep orgId="org-1" client={client} onInviteNew={vi.fn()} onDone={vi.fn()} />));
    expect(t).toContain("In your agency");
    expect(t).toContain("Ravi");
    expect(t).toContain("Kiran");
    expect(t).not.toContain("Meera");
    expect(t).not.toContain("Asha");
    expect(t).toContain("Invite someone new");
  });

  it("step 1 has a search field and an Add button that counts the chosen people", () => {
    const html = withPeople(<InviteDialogAddStep orgId="org-1" client={client} onInviteNew={vi.fn()} onDone={vi.fn()} />);
    expect(html).toContain('placeholder="Search people"');
    expect(text(html)).toContain("Add 0 people");
  });

  it("step 2 asks for an email, with Back and Send invite and what happens next", () => {
    const t = text(withPeople(<InviteDialogEmailStep orgId="org-1" client={client} onBack={vi.fn()} />));
    expect(t).toContain("Back");
    expect(t).toContain("Send invite");
    expect(t).toContain("They get an email to sign up. Once they have, you set their permissions on the Team page.");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/components/team/__tests__/invite-dialog.test.tsx`
Expected: FAIL (modules missing).

- [ ] **Step 3: The popup**

```tsx
// src/components/team/invite-dialog-add-step.tsx
"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useAddToClient, usePeople } from "@/hooks/queries/people";
import { STATUS_LABELS } from "@/lib/people/constants";
import { peopleNotOnClient } from "@/lib/people/utils";

// Step 1, "In your agency": everyone not on this client, members and people still waiting, with a
// search and checkboxes. One insert; each row copies the person's agency set, so a member sees the
// client at once and someone waiting sees it when given access.
export function InviteDialogAddStep({ orgId, client, onInviteNew, onDone }: {
  orgId: string;
  client: { id: string; name: string };
  onInviteNew: () => void;
  onDone: () => void;
}) {
  const { data } = usePeople(orgId);
  const add = useAddToClient(orgId, client.id);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return peopleNotOnClient(data?.people ?? [], client.id).filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    );
  }, [data, client.id, query]);

  function toggle(userId: string, on: boolean) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(userId); else next.delete(userId);
      return next;
    });
  }

  async function submit() {
    await add.mutateAsync([...chosen]);
    onDone();
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-eyebrow">In your agency</h3>
      <InputGroup>
        <InputGroupAddon><Search strokeWidth={1.5} /></InputGroupAddon>
        <InputGroupInput placeholder="Search people" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search people" />
      </InputGroup>
      <ul className="flex max-h-64 flex-col overflow-y-auto">
        {candidates.length === 0 && <li className="py-3 text-sm text-muted-foreground">Everyone in your agency is on {client.name}.</li>}
        {candidates.map((p) => (
          <li key={p.userId} className="flex items-center gap-3 border-b py-2 text-sm last:border-b-0">
            <Checkbox checked={chosen.has(p.userId)} onCheckedChange={(on) => toggle(p.userId, on === true)} aria-label={`Add ${p.name}`} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{p.name}</span>
              <span className="truncate text-xs text-muted-foreground">{p.email}</span>
            </div>
            <span className="text-xs text-muted-foreground">{STATUS_LABELS[p.status]}</span>
          </li>
        ))}
      </ul>
      {add.error && <p className="text-sm text-destructive">{add.error.message}</p>}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" className="border-dashed border-primary/40 text-primary hover:bg-primary/5" onClick={onInviteNew}>
          Invite someone new
        </Button>
        <Button disabled={chosen.size === 0 || add.isPending} onClick={() => void submit()}>
          {add.isPending ? "Adding…" : `Add ${chosen.size} ${chosen.size === 1 ? "person" : "people"}`}
        </Button>
      </div>
    </div>
  );
}
```

```tsx
// src/components/team/invite-dialog-email-step.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyRow } from "@/components/shared/copy-row";
import { useInviteToClient } from "@/hooks/queries/people";
import type { InviteResult } from "@/lib/people/types";

// Step 2, "Invite someone new": the invitation is for this client; the link is emailed and shown
// to copy. Refusals come back from the server in the spec's words.
export function InviteDialogEmailStep({ orgId, client, onBack }: { orgId: string; client: { id: string; name: string }; onBack: () => void }) {
  const invite = useInviteToClient(orgId, client.id);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<InviteResult | null>(null);

  if (sent) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          {sent.emailed ? `Invite sent to ${sent.invite.email}.` : `The email wasn't sent. Copy the link and send it to ${sent.invite.email}.`}
        </p>
        <CopyRow label="Invite link" value={sent.link} />
        <p className="text-xs text-muted-foreground">They get an email to sign up. Once they have, you set their permissions on the Team page.</p>
        <div><Button variant="outline" onClick={onBack}>Back</Button></div>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          setSent(await invite.mutateAsync(email));
        } catch {
          // The refusal is shown below through invite.error.
        }
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <p className="text-xs text-muted-foreground">They get an email to sign up. Once they have, you set their permissions on the Team page.</p>
      {invite.error && <p className="text-sm text-destructive">{invite.error.message}</p>}
      <div className="flex justify-between gap-3">
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        <Button type="submit" disabled={!email.trim() || invite.isPending}>{invite.isPending ? "Sending…" : "Send invite"}</Button>
      </div>
    </form>
  );
}
```

```tsx
// src/components/team/invite-dialog.tsx
"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { InviteDialogAddStep } from "./invite-dialog-add-step";
import { InviteDialogEmailStep } from "./invite-dialog-email-step";

// Spec §6.2: Invite opens a popup. Step 1 adds people already in the agency; "Invite someone new"
// opens step 2. Each opening starts at step 1 (the body remounts on its key).
export function InviteDialog({ orgId, client }: { orgId: string; client: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"add" | "email">("add");
  const [opening, setOpening] = useState(0);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setStep("add");
      setOpening((n) => n + 1);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button><UserPlus className="size-4" strokeWidth={1.5} />Invite</Button>} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add people to {client.name}</DialogTitle>
          <DialogDescription>People you add see this client with the permissions they have on the Team page.</DialogDescription>
        </DialogHeader>
        {step === "add" ? (
          <InviteDialogAddStep key={opening} orgId={orgId} client={client} onInviteNew={() => setStep("email")} onDone={() => setOpen(false)} />
        ) : (
          <InviteDialogEmailStep key={`email-${opening}`} orgId={orgId} client={client} onBack={() => setStep("add")} />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

`src/app/clients/[id]/members/page.tsx`: add `import { InviteDialog } from "@/components/team/invite-dialog";` and the prop `inviteSlot={<InviteDialog orgId={effectiveOrgId} client={ref} />}` on `ClientMembers`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/components/team`
Expected: PASS.

Run: `npx tsc --noEmit` and `npx eslint src/components/team "src/app/clients/[id]/members"`.

- [ ] **Step 5: Commit**

```bash
git add src/components/team "src/app/clients/[id]/members/page.tsx"
git commit -m "feat(team): the invite popup: add people from the agency or invite someone new (spec 6.2)"
git log -1 --format=%B
```

---

### Task 11: Signing up from an invite

**Files:**
- Create: `src/app/invite/[token]/page.tsx`, `src/app/invite/[token]/invite-sign-up-form.tsx`, `src/lib/actions/invites.ts`, `src/lib/actions/invites.test.ts`, `src/lib/invites/page-state.ts`, `src/lib/invites/page-state.test.ts`
- Modify: `src/proxy.ts` (matcher), `src/lib/actions/with-action-coverage.test.ts` (allowlist)

**Interfaces:**
- Consumes: Task 2's `getInvitationByToken`, `createLogin`, `deleteLogin`, `acceptInvitation`, `AcceptInviteSchema`; Task 3's `notifySignedUp`; `createSSRServerClient`, `getUserWithRetry`.
- Produces: `type InvitePageState = { kind: "invalid" } | { kind: "wrong_email"; email: string } | { kind: "signed_in" } | { kind: "sign_up"; invitation: InvitationForSignUp }`; `invitePageState(invitation: InvitationForSignUp | null, signedInEmail: string | null): InvitePageState`; `type AcceptInviteState = { error?: string } | undefined`; `acceptInviteAction(token: string, prev: AcceptInviteState, formData: FormData): Promise<AcceptInviteState>`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/invites/page-state.test.ts
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
```

```ts
// src/lib/actions/invites.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  getInvitationByToken: vi.fn(), createLogin: vi.fn(), deleteLogin: vi.fn(), acceptInvitation: vi.fn(),
  notifySignedUp: vi.fn(async () => undefined), signIn: vi.fn(async () => ({ error: null })),
  redirect: vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); }),
}));
vi.mock("@/lib/db/people", () => ({ getInvitationByToken: m.getInvitationByToken, createLogin: m.createLogin, deleteLogin: m.deleteLogin, acceptInvitation: m.acceptInvitation }));
vi.mock("@/lib/people/ops", () => ({ notifySignedUp: m.notifySignedUp }));
vi.mock("@/lib/supabase/ssr-server", () => ({ createSSRServerClient: vi.fn(async () => ({ auth: { signInWithPassword: m.signIn } })) }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));

import { acceptInviteAction } from "./invites";

const form = (name: string, password: string) => {
  const f = new FormData();
  f.set("name", name);
  f.set("password", password);
  return f;
};
const invitation = { id: "i1", orgId: "org-1", orgName: "Acme", email: "p@x.com", asOwner: false, clientName: "Chupps", inviterName: "Asha", open: true };

describe("acceptInviteAction (spec §6.3)", () => {
  beforeEach(() => {
    for (const fn of Object.values(m)) if ("mockClear" in fn) fn.mockClear();
    m.getInvitationByToken.mockResolvedValue(invitation);
    m.createLogin.mockResolvedValue({ ok: true, userId: "u-new" });
    m.acceptInvitation.mockResolvedValue({ orgId: "org-1", clientId: "c1", asOwner: false, invitedBy: "owner-1" });
  });

  it("creates the account, accepts in one step, signs them in, tells the owner and inviter, and goes home", async () => {
    await expect(acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).rejects.toThrow("REDIRECT /");
    expect(m.createLogin).toHaveBeenCalledWith("p@x.com", "longenough");
    expect(m.getInvitationByToken).toHaveBeenCalledWith("tok");
    expect(m.acceptInvitation).toHaveBeenCalledWith("tok", "u-new", "Ravi");
    expect(m.signIn).toHaveBeenCalledWith({ email: "p@x.com", password: "longenough" });
    expect(m.notifySignedUp).toHaveBeenCalledWith({ orgId: "org-1", orgName: "Acme", userId: "u-new", name: "Ravi", invitedBy: "owner-1" });
  });

  it("sends no signed-up notice for the owner's own invite", async () => {
    m.acceptInvitation.mockResolvedValue({ orgId: "org-1", clientId: null, asOwner: true, invitedBy: "admin-1" });
    await expect(acceptInviteAction("tok", undefined, form("Asha", "longenough"))).rejects.toThrow("REDIRECT /");
    expect(m.notifySignedUp).not.toHaveBeenCalled();
  });

  it("refuses a short password or a missing name before anything is created", async () => {
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "short"))).toEqual({ error: "Password must be at least 8 characters." });
    expect(await acceptInviteAction("tok", undefined, form("", "longenough"))).toEqual({ error: "Enter your name." });
    expect(m.createLogin).not.toHaveBeenCalled();
  });

  it("refuses a link that is no longer valid", async () => {
    m.getInvitationByToken.mockResolvedValue({ ...invitation, open: false });
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).toEqual({ error: "This invite link is no longer valid." });
  });

  it("deletes the new account when accepting fails (used in the meantime)", async () => {
    m.acceptInvitation.mockRejectedValue(new Error("This invite link is no longer valid."));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).toEqual({ error: "This invite link is no longer valid." });
    expect(m.deleteLogin).toHaveBeenCalledWith("u-new");
    err.mockRestore();
  });

  it("refuses an email that already has a login", async () => {
    m.createLogin.mockResolvedValue({ ok: false });
    expect(await acceptInviteAction("tok", undefined, form("Ravi", "longenough"))).toEqual({ error: "This email already belongs to another agency." });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/lib/invites src/lib/actions/invites.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: The page state, the action, the page and the form**

```ts
// src/lib/invites/page-state.ts
import type { InvitationForSignUp } from "@/lib/people/types";

export type InvitePageState =
  | { kind: "invalid" }
  | { kind: "wrong_email"; email: string }
  | { kind: "signed_in" }
  | { kind: "sign_up"; invitation: InvitationForSignUp };

/** Spec §6.3: what /invite/[token] shows, from the invitation and who (if anyone) is signed in. */
export function invitePageState(invitation: InvitationForSignUp | null, signedInEmail: string | null): InvitePageState {
  if (!invitation || !invitation.open) return { kind: "invalid" };
  if (signedInEmail && signedInEmail.toLowerCase() !== invitation.email.toLowerCase()) {
    return { kind: "wrong_email", email: invitation.email };
  }
  if (signedInEmail) return { kind: "signed_in" };
  return { kind: "sign_up", invitation };
}
```

```ts
// src/lib/actions/invites.ts
"use server";

import { redirect } from "next/navigation";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { acceptInvitation, createLogin, deleteLogin, getInvitationByToken } from "@/lib/db/people";
import { notifySignedUp } from "@/lib/people/ops";
import { REFUSALS } from "@/lib/people/constants";
import { AcceptInviteSchema } from "@/lib/people/schema";

export type AcceptInviteState = { error?: string } | undefined;

// Spec §6.3. Runs before any account exists: the token is the capability (allowlisted in
// with-action-coverage.test.ts). The email comes from the invitation, never the form.
export async function acceptInviteAction(token: string, _prev: AcceptInviteState, formData: FormData): Promise<AcceptInviteState> {
  const parsed = AcceptInviteSchema.safeParse({ name: formData.get("name") ?? "", password: formData.get("password") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your name and password." };

  const invitation = await getInvitationByToken(token);
  if (!invitation?.open) return { error: REFUSALS.inviteInvalid };

  const login = await createLogin(invitation.email, parsed.data.password);
  if (!login.ok) return { error: REFUSALS.otherAgency };

  let accepted: Awaited<ReturnType<typeof acceptInvitation>>;
  try {
    // Single use: marks the invite accepted in the same transaction as the membership and row.
    accepted = await acceptInvitation(token, login.userId, parsed.data.name);
  } catch (e) {
    console.error("[invite] accept failed; removing the new login", e);
    await deleteLogin(login.userId);
    return { error: REFUSALS.inviteInvalid };
  }

  const supabase = await createSSRServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: invitation.email, password: parsed.data.password });

  if (!accepted.asOwner) {
    await notifySignedUp({ orgId: accepted.orgId, orgName: invitation.orgName, userId: login.userId, name: parsed.data.name, invitedBy: accepted.invitedBy });
  }
  // A member lands on the onboarding screen (they wait for access); the owner on an empty client list.
  redirect(error ? "/login" : "/");
}
```

```tsx
// src/app/invite/[token]/invite-sign-up-form.tsx
"use client";

import { useActionState } from "react";
import { acceptInviteAction, type AcceptInviteState } from "@/lib/actions/invites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InviteSignUpForm({ token, email, agency }: { token: string; email: string; agency: string }) {
  const [state, action, pending] = useActionState<AcceptInviteState, FormData>(acceptInviteAction.bind(null, token), undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} disabled readOnly />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Your name</Label>
        <Input id="name" name="name" autoComplete="name" autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>{pending ? "Creating your account…" : "Create account"}</Button>
      <p className="text-xs text-muted-foreground">You&apos;re joining {agency}.</p>
    </form>
  );
}
```

```tsx
// src/app/invite/[token]/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getInvitationByToken } from "@/lib/db/people";
import { invitePageState } from "@/lib/invites/page-state";
import { createSSRServerClient } from "@/lib/supabase/ssr-server";
import { getUserWithRetry } from "@/lib/supabase/get-user-with-retry";
import { InviteSignUpForm } from "./invite-sign-up-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Join — CreativeOS" };

// Spec §6.3. Outside the session proxy (src/proxy.ts): someone invited has no account yet.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invitation, user] = await Promise.all([
    getInvitationByToken(token),
    createSSRServerClient().then(getUserWithRetry),
  ]);
  const state = invitePageState(invitation, user?.email ?? null);
  if (state.kind === "signed_in") redirect("/");

  return (
    <main className="login-surface flex flex-1 items-center justify-center p-6">
      <Card className="flex w-full max-w-md flex-col gap-6 p-8 shadow-card">
        {state.kind === "invalid" && (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight">This invite link is no longer valid</h1>
            <p className="text-sm text-muted-foreground">It may have been used, cancelled or replaced, or it expired. Ask for a new one, or sign in if you have an account.</p>
            <Button nativeButton={false} render={<Link href="/login">Sign in</Link>} />
          </>
        )}
        {state.kind === "wrong_email" && (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Wrong account</h1>
            <p className="text-sm text-muted-foreground">This invite is for {state.email}. Sign in with that email to accept it.</p>
            <Button nativeButton={false} render={<Link href="/login">Sign in</Link>} />
          </>
        )}
        {state.kind === "sign_up" && (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-eyebrow text-muted-foreground">
                {state.invitation.asOwner ? "Set up your agency" : `Invited by ${state.invitation.inviterName ?? state.invitation.orgName}`}
              </p>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                {state.invitation.asOwner ? `Set up ${state.invitation.orgName} on CreativeOS` : `Join ${state.invitation.orgName}`}
              </h1>
              {state.invitation.clientName && <p className="text-sm text-muted-foreground">To work on {state.invitation.clientName}.</p>}
            </div>
            <InviteSignUpForm token={token} email={state.invitation.email} agency={state.invitation.orgName} />
          </>
        )}
      </Card>
    </main>
  );
}
```

`src/proxy.ts`: in the matcher, add `invite/` to the excluded prefixes: `"/((?!login|invite/|api/webhooks|r/|api/r/|_next/static|…` (keep the rest of the pattern unchanged), and add `/invite/*` to the comment above it (`the invite sign-up page (/invite/*, token-scoped: the person has no account yet)`).

`src/lib/actions/with-action-coverage.test.ts`: add to `ALLOWLIST`:

```ts
  acceptInviteAction: "runs before any account exists; the invite token is the capability (spec 6.3)",
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/invites src/lib/actions src/app`
Expected: PASS (apart from the two known failures in `src/app`).

Run: `npx tsc --noEmit` and `npx eslint src/app/invite src/lib/actions/invites.ts src/lib/invites src/proxy.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/app/invite src/lib/actions/invites.ts src/lib/actions/invites.test.ts src/lib/invites src/proxy.ts src/lib/actions/with-action-coverage.test.ts
git commit -m "feat(invites): sign up from an invite link; owner and inviter told (spec 6.3)"
git log -1 --format=%B
```

---

### Task 12: Add an agency, with its owner invite

**Files:**
- Create: `src/components/admin/add-agency-dialog.tsx`, `src/components/admin/resend-owner-invite-button.tsx`, `src/components/admin/__tests__/orgs-table.test.tsx`
- Modify: `src/lib/actions/admin.ts` (`createAgencyAction`, `resendOwnerInviteAction`; remove `createOrgAction`), `src/lib/db/organizations.ts` (`listOrgsWithClientCount` marks pending owners; remove `createOrgWithOwner`), `src/lib/orgs/org-schema.ts` (remove `CreateOrgSchema`), `src/components/admin/orgs-table.tsx`, `src/app/admin/(agencies)/page.tsx`, `src/lib/actions/with-action-coverage.test.ts`
- Delete: `src/components/admin/new-org-dialog.tsx` (the temporary-password version)

**Interfaces:**
- Consumes: Task 3's `createAgency`, `resendOwnerInvite`; `CreateAgencySchema`; `requireSuperAdmin`; `logImpersonationEvent`.
- Produces: `type CreateAgencyState = { error?: string; result?: { orgId: string; email: string; link: string; emailed: boolean } } | undefined`; `createAgencyAction(prev, formData): Promise<CreateAgencyState>`; `resendOwnerInviteAction(orgId: string): Promise<{ error?: string; link?: string; emailed?: boolean }>`; `OrgWithCount.owner_pending: boolean`; `AddAgencyDialog()`; `ResendOwnerInviteButton({ orgId })`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/admin/__tests__/orgs-table.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/actions/admin", () => ({ resendOwnerInviteAction: vi.fn() }));

import { OrgsTable } from "../orgs-table";

const org = (over: Record<string, unknown>) => ({ id: "o1", name: "Acme", slug: "acme", monthly_credit_limit: null, created_at: "2026-11-01T00:00:00Z", client_count: 0, owner_pending: false, ...over });

describe("OrgsTable (spec §6.6)", () => {
  it("marks an agency whose owner hasn't signed up, with Resend", () => {
    const html = renderToStaticMarkup(<OrgsTable orgs={[org({ id: "o1", name: "Acme", owner_pending: true }), org({ id: "o2", name: "Bata" })]} />);
    expect(html).toContain("Owner hasn&#x27;t signed up");
    expect((html.match(/Resend/g) ?? []).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run src/components/admin/__tests__/orgs-table.test.tsx`
Expected: FAIL (no mark, no Resend).

- [ ] **Step 3: The actions**

In `src/lib/actions/admin.ts`:
- Change the imports from `@/lib/db/organizations` to drop `createOrgWithOwner`; from `@/lib/orgs/org-schema` drop `CreateOrgSchema`; add:

```ts
import { CreateAgencySchema } from "@/lib/people/schema";
import { createAgency, resendOwnerInvite } from "@/lib/people/ops";
import { getOrgById } from "@/lib/db/organizations";
import { getDisplayName } from "@/lib/db/profiles";
import { logImpersonationEvent } from "@/lib/db/impersonation-audit";
```

- Replace `CreateOrgState` and `createOrgAction` with:

```ts
export type CreateAgencyState =
  | { error?: string; result?: { orgId: string; email: string; link: string; emailed: boolean } }
  | undefined;

// Spec §6.6 "Add an agency": the agency and its owner invite in one step. The owner signs up from
// the email (or the copied link) and can do everything in the agency. No temporary password.
export async function createAgencyAction(_prev: CreateAgencyState, formData: FormData): Promise<CreateAgencyState> {
  const admin = await requireSuperAdmin();
  const parsed = CreateAgencySchema.safeParse({ name: formData.get("name"), email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the name and email." };
  const name = (await getDisplayName(admin.userId)) ?? "Yuvabe";
  try {
    const result = await createAgency(parsed.data.name, parsed.data.email, { userId: admin.userId, name });
    if (!result.ok) return { error: result.error };
    await logImpersonationEvent({ operatorId: admin.userId, targetOrgId: result.value.orgId, eventType: "admin_action", detail: { action: "create_agency", email: parsed.data.email } });
    revalidatePath("/admin");
    return { result: { ...result.value, email: parsed.data.email } };
  } catch (e) {
    console.error("[admin] could not create the agency", e);
    return { error: "Could not create the agency." };
  }
}

// The agencies list's Resend for an owner who hasn't signed up: a new link, emailed and shown.
export async function resendOwnerInviteAction(orgId: string): Promise<{ error?: string; link?: string; emailed?: boolean }> {
  const admin = await requireSuperAdmin();
  const [org, name] = await Promise.all([getOrgById(orgId), getDisplayName(admin.userId)]);
  if (!org) return { error: "Agency not found." };
  try {
    const result = await resendOwnerInvite({ orgId, orgName: org.name }, { userId: admin.userId, name: name ?? "Yuvabe" });
    if (!result.ok) return { error: result.error };
    await logImpersonationEvent({ operatorId: admin.userId, targetOrgId: orgId, eventType: "admin_action", detail: { action: "resend_owner_invite" } });
    return { link: result.value.link, emailed: result.value.emailed };
  } catch (e) {
    console.error("[admin] could not resend the owner invite", e);
    return { error: "Could not send the invite." };
  }
}
```

`src/lib/actions/with-action-coverage.test.ts` `ALLOWLIST`: rename the `createOrgAction` entry to `createAgencyAction` (same reason text) and add `resendOwnerInviteAction:` with the reason `"admin.ts: same D85 platform-administration category and same revert rationale as createAgencyAction — orgId is an explicit caller-supplied parameter."`.

`src/lib/orgs/org-schema.ts`: delete `CreateOrgSchema` and `CreateOrgFields`.

`src/lib/db/organizations.ts`: delete `createOrgWithOwner` with its comment; change `OrgWithCount` to `export type OrgWithCount = OrgRow & { client_count: number; owner_pending: boolean };` and `listOrgsWithClientCount` to:

```ts
// The agencies list. owner_pending: the agency has no owner yet (its invited owner hasn't signed
// up, spec §6.6). Owners are read in one query beside the agencies.
export async function listOrgsWithClientCount(): Promise<OrgWithCount[]> {
  const supabase = createServerSupabase();
  const [orgsRes, ownersRes] = await Promise.all([
    supabase.from("organizations").select("*, clients(count)").order("created_at", { ascending: true }),
    supabase.from("org_memberships").select("org_id").eq("is_owner", true),
  ]);
  if (orgsRes.error) throw orgsRes.error;
  if (ownersRes.error) throw ownersRes.error;
  const owned = new Set(((ownersRes.data ?? []) as { org_id: string }[]).map((r) => r.org_id));
  return ((orgsRes.data ?? []) as (OrgRow & { clients: { count: number }[] })[]).map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    monthly_credit_limit: o.monthly_credit_limit,
    created_at: o.created_at,
    client_count: o.clients?.[0]?.count ?? 0,
    owner_pending: !owned.has(o.id),
  }));
}
```

- [ ] **Step 4: The dialog, the Resend button and the list**

```tsx
// src/components/admin/add-agency-dialog.tsx
"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { createAgencyAction, type CreateAgencyState } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyRow } from "@/components/shared/copy-row";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Remounted (key) on every opening: useActionState has no reset, and a finished create must not
// show again next time.
function AddAgencyBody({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState<CreateAgencyState, FormData>(createAgencyAction, undefined);
  const created = state?.result;
  if (created) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Agency added</DialogTitle>
          <DialogDescription>
            {created.emailed ? `We emailed ${created.email} a link to sign up.` : `The email wasn't sent. Copy the link and send it to ${created.email}.`}
          </DialogDescription>
        </DialogHeader>
        <CopyRow label="Owner's sign-up link" value={created.link} />
        <DialogFooter><Button onClick={onDone}>Done</Button></DialogFooter>
      </>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Add an agency</DialogTitle>
        <DialogDescription>The owner gets an email to sign up, and can do everything in this agency.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Agency name</Label>
        <Input id="name" name="name" autoFocus />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Owner&apos;s email</Label>
        <Input id="email" name="email" type="email" />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add agency"}</Button>
      </DialogFooter>
    </form>
  );
}

export function AddAgencyDialog() {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(0);
  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (next) setOpening((n) => n + 1); }}>
      <DialogTrigger render={<Button><Plus className="size-4" strokeWidth={1.5} />Add an agency</Button>} />
      <DialogContent className="sm:max-w-md">
        <AddAgencyBody key={opening} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
```

```tsx
// src/components/admin/resend-owner-invite-button.tsx
"use client";

import { useState } from "react";
import { resendOwnerInviteAction } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { CopyRow } from "@/components/shared/copy-row";

export function ResendOwnerInviteButton({ orgId }: { orgId: string }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ error?: string; link?: string; emailed?: boolean } | null>(null);
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={async (e) => {
          e.preventDefault();
          setPending(true);
          setResult(await resendOwnerInviteAction(orgId));
          setPending(false);
        }}
      >
        {pending ? "Sending…" : "Resend"}
      </Button>
      {result?.error && <p className="text-xs text-destructive">{result.error}</p>}
      {result?.link && (
        <div className="w-72">
          <CopyRow label={result.emailed ? "Sent again" : "Email not sent. Copy the link"} value={result.link} />
        </div>
      )}
    </div>
  );
}
```

`src/components/admin/orgs-table.tsx`: add `import { ResendOwnerInviteButton } from "./resend-owner-invite-button";` and replace the whole `<li …>…</li>` inside `rows.map` with (the Resend button sits beside the link, not inside it):

```tsx
              <li key={org.id} className="flex items-center border-b last:border-b-0 hover:bg-muted/40">
                <Link href={`/admin/orgs/${org.id}`} className="flex flex-1 items-center gap-4 px-5 py-3.5 transition-colors">
                  <span className="flex flex-[3] items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card text-xs font-semibold text-muted-foreground/50">
                      {initials(org.name)}
                    </span>
                    <span className="flex flex-col">
                      <span className="font-medium">{org.name}</span>
                      {org.owner_pending && (
                        <span className="text-xs text-muted-foreground">Owner hasn&apos;t signed up</span>
                      )}
                    </span>
                  </span>
                  <span className="flex-1 text-sm text-muted-foreground">
                    {org.client_count} client{org.client_count === 1 ? "" : "s"}
                  </span>
                  <span className="flex-1 text-sm text-muted-foreground">
                    {org.monthly_credit_limit === null ? "Unlimited" : org.monthly_credit_limit}
                  </span>
                  <span className="flex-1 text-right text-sm text-muted-foreground">{formatRelativeTime(org.created_at)}</span>
                </Link>
                {org.owner_pending && (
                  <div className="pr-5">
                    <ResendOwnerInviteButton orgId={org.id} />
                  </div>
                )}
              </li>
```

`src/app/admin/(agencies)/page.tsx`: replace `NewOrgDialog` (import and usage) with `AddAgencyDialog` from `@/components/admin/add-agency-dialog`.

`git rm src/components/admin/new-org-dialog.tsx`

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/components/admin src/lib/actions src/lib/orgs`
Expected: PASS.

Run: `npx tsc --noEmit` and `npx eslint src/components/admin src/lib/actions/admin.ts src/lib/db/organizations.ts src/lib/orgs "src/app/admin/(agencies)"`.

- [ ] **Step 6: Commit**

```bash
git add -A src/components/admin src/lib/actions src/lib/db/organizations.ts src/lib/orgs "src/app/admin/(agencies)"
git commit -m "feat(admin): add an agency with its owner invite; mark owners who haven't signed up (spec 6.6)"
git log -1 --format=%B
```

---

### Task 13: Admin's agency page: People and Clients, Make owner, audit

**Files:**
- Create: `src/app/admin/orgs/[id]/admin-clients-tab.tsx`, `src/app/admin/orgs/[id]/__tests__/org-detail-tabs.test.tsx`
- Modify: `src/app/admin/orgs/[id]/page.tsx`, `src/app/admin/orgs/[id]/org-detail-tabs.tsx`, `src/app/admin/orgs/[id]/reset-password-dialog.tsx` (unchanged API; rendered through the People tab's slot), `src/lib/actions/admin.ts`, `src/lib/db/organizations.ts`, `src/lib/orgs/org-schema.ts`, `src/lib/dal-logic.ts`, `src/lib/actions/with-action-coverage.test.ts`
- Delete: `src/app/admin/orgs/[id]/add-member-dialog.tsx`, `src/app/admin/orgs/[id]/member-role-select.tsx` (the temporary-password and role paths, D497/D505)

**Interfaces:**
- Consumes: Task 7's `TeamPeople`; Task 9's `ClientMembers`; Task 10's `InviteDialog`; `listAgencyPeople`, `listOpenInvites`, `listClients`; `ResetPasswordDialog`.
- Produces: tabs Overview, People, Clients, Generations, Support activity; `AdminClientsTab({ orgId, clients, initial })`. Removed: `addOrgMemberAction`, `updateMemberRoleAction`, `removeOrgMemberAction`, `addOrgMember`, `updateMemberRole`, `removeOrgMember`, `listOrgMembers`, `AddMemberSchema`, `ORG_ROLES`, `OrgRole`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/admin/orgs/[id]/__tests__/org-detail-tabs.test.tsx
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

// The tabs render client-only charts; this pins the structure in the source.
describe("admin agency page (spec §6.6)", () => {
  const tabs = readFileSync("src/app/admin/orgs/[id]/org-detail-tabs.tsx", "utf8");

  it("has People and Clients tabs beside Overview, built on the owner's components", () => {
    expect(tabs).toMatch(/value="people"/);
    expect(tabs).toMatch(/value="clients"/);
    expect(tabs).toContain("<TeamPeople");
    expect(tabs).toContain("canMakeOwner");
    expect(tabs).toContain("<AdminClientsTab");
  });

  it("no longer has the temporary-password or role controls", () => {
    expect(tabs).not.toMatch(/AddMemberDialog|MemberRoleSelect|RemoveMemberDialog|org_role/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm && npx vitest run "src/app/admin"`
Expected: FAIL.

- [ ] **Step 3: The Clients tab**

```tsx
// src/app/admin/orgs/[id]/admin-clients-tab.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClientMembers } from "@/components/team/client-members";
import { InviteDialog } from "@/components/team/invite-dialog";
import type { AgencyPeople } from "@/lib/people/types";

// Spec §6.6 "Clients": each client opens the same Members component the owner uses, so the super
// admin invites into a client the same way. "Set permissions" goes to this page's People tab.
export function AdminClientsTab({ orgId, clients, initial }: { orgId: string; clients: { id: string; name: string }[]; initial: AgencyPeople }) {
  const [openId, setOpenId] = useState<string | null>(clients[0]?.id ?? null);
  const open = clients.find((c) => c.id === openId) ?? null;
  if (clients.length === 0) return <p className="text-sm text-muted-foreground">This agency has no clients yet.</p>;
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-wrap gap-2 p-3 shadow-card">
        {clients.map((c) => (
          <Button key={c.id} size="sm" variant={c.id === openId ? "default" : "outline"} onClick={() => setOpenId(c.id)}>
            {c.name}
          </Button>
        ))}
      </Card>
      {open && (
        <ClientMembers
          key={open.id}
          orgId={orgId}
          client={open}
          initial={initial}
          teamHref={(userId) => `/admin/orgs/${orgId}?tab=people&person=${userId}`}
          inviteSlot={<InviteDialog orgId={orgId} client={open} />}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: The page and the tabs**

`src/app/admin/orgs/[id]/page.tsx`:
- Replace `listOrgMembers` in the `@/lib/db/organizations` import with nothing, and add `import { listAgencyPeople, listOpenInvites } from "@/lib/db/people";` and `import { listClients } from "@/lib/db/clients";`.
- Accept `searchParams: Promise<{ tab?: string; person?: string }>` beside `params`, and read both with `const [{ id }, { tab, person }] = await Promise.all([params, searchParams]);`.
- In the `Promise.all`, replace `listOrgMembers(id),` with `listAgencyPeople(id), listOpenInvites(id), listClients(id, null),` and rename the destructured `members` to `people, invites, clients`.
- Pass `people={people} invites={invites} clients={clients.map((c) => ({ id: c.id, name: c.name }))} initialTab={tab ?? "overview"} focusUserId={person ?? null}` to `OrgDetailTabs` instead of `members={members}`.

`src/app/admin/orgs/[id]/org-detail-tabs.tsx`:
- Replace the imports of `AddMemberDialog`, `MemberRoleSelect` and the remove dialog with:

```tsx
import { TeamPeople } from "@/components/team/team-people";
import { AdminClientsTab } from "./admin-clients-tab";
import type { AgencyPerson, OpenInvite } from "@/lib/people/types";
```

- Delete `type Member = …`. In the props replace `members: Member[];` with `people: AgencyPerson[]; invites: OpenInvite[]; clients: { id: string; name: string }[]; initialTab: string; focusUserId: string | null;` (and in the destructure), and `useState("overview")` with `useState(initialTab)`.
- Add, after the Overview trigger: `<TabsTrigger value="people" className={triggerClass}>People</TabsTrigger>` and `<TabsTrigger value="clients" className={triggerClass}>Clients</TabsTrigger>`.
- In Overview: `<StatTile label="Members" value={String(members.length)} />` → `<StatTile label="People" value={String(people.length)} />`, and delete the whole Members `Card` (its roster moves to People), with the two imports Task 7 added for it (`RemovePersonDialog`, `removeOrgMemberAction`).
- Add after the Overview `TabsContent`:

```tsx
      {/* People: the owner's Team page, with the owner's powers, plus Make owner and reset password. */}
      <TabsContent value="people" className="animate-rise">
        <TeamPeople
          orgId={org.id}
          clients={clients}
          initial={{ people, invites }}
          focusUserId={focusUserId}
          canMakeOwner
          extraMemberActions={(p) => <ResetPasswordDialog orgId={org.id} userId={p.userId} displayName={p.name} />}
        />
      </TabsContent>

      <TabsContent value="clients" className="animate-rise">
        <AdminClientsTab orgId={org.id} clients={clients} initial={{ people, invites }} />
      </TabsContent>
```

- [ ] **Step 5: Remove the old seat paths**

```bash
git rm "src/app/admin/orgs/[id]/add-member-dialog.tsx" "src/app/admin/orgs/[id]/member-role-select.tsx"
```

`src/lib/actions/admin.ts`: delete `AddMemberState`, `addOrgMemberAction`, `updateMemberRoleAction`, `removeOrgMemberAction` with their comments, and the now-unused imports (`z`, `addOrgMember`, `updateMemberRole`, `removeOrgMember`, `AddMemberSchema`, `ORG_ROLES`).

`src/lib/db/organizations.ts`: delete `listOrgMembers`, `addOrgMember`, `updateMemberRole`, `removeOrgMember` with their comments, and `import type { OrgRole } from "@/lib/dal-logic";`.

`src/lib/orgs/org-schema.ts`: delete `ORG_ROLES`, `AddMemberSchema`, `AddMemberFields`.

`src/lib/dal-logic.ts`: delete `export type OrgRole` (no reader is left).

`src/lib/actions/with-action-coverage.test.ts` `ALLOWLIST`: delete the `addOrgMemberAction`, `updateMemberRoleAction` and `removeOrgMemberAction` entries.

Run: `git grep -nE "addOrgMember|updateMemberRole|removeOrgMember|listOrgMembers|AddMemberSchema|ORG_ROLES|OrgRole|createOrgWithOwner|tempPassword: string; orgId" -- src`
Expected: no output (`generateTempPassword` stays for reset password).

- [ ] **Step 6: Run the tests**

```bash
npx vitest run src/app/admin src/components src/lib
```

Expected: PASS.

Run: `npx tsc --noEmit` and `npx eslint src/app/admin src/lib/actions/admin.ts src/lib/db/organizations.ts src/lib/orgs src/lib/dal-logic.ts`.

- [ ] **Step 7: Commit**

```bash
git add -A src/app/admin src/lib/actions src/lib/db/organizations.ts src/lib/orgs src/lib/dal-logic.ts
git commit -m "feat(admin): People and Clients tabs on the owner's components, Make owner; temporary passwords go (spec 6.6)"
git log -1 --format=%B
```

---

### Task 14: Rollout notes, the decisions, and a full check

**Files:**
- Modify: `docs/auth-production-migration.md` (the Migration 0062 section from plan 3 Task 2), `docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md` (§7)

- [ ] **Step 1: The rollout notes (spec §9)**

In `docs/auth-production-migration.md`, in the "Migration 0062" section, add after the **Ordering** list:

````markdown
**Email (spec §6.7), each environment, before the people screens are used:**

- `RESEND_API_KEY` and `EMAIL_FROM` (an address on a domain verified with Resend) in Vercel.
  Without them invites are still created and the link is shown to copy; nothing is emailed.
- `APP_URL` must be the environment's public address: invite links and the emails' buttons use it.

**The invite page is outside the session check.** `src/proxy.ts` excludes `/invite/*`: the token is
the capability, and someone invited has no account yet.

**Old admin screens are gone with this code:** no temporary passwords, no role select. A new agency
is "Add an agency" (name and owner email); the owner signs up from the emailed link. People are
managed on the agency page's People and Clients tabs, and every change there is in the audit log as
`admin_action`.

**Check by hand on staging after deploying:**

1. Add an agency with an email you can read; open the link, sign up; you land on an empty client
   list as owner.
2. As that owner, create a client, open Members, Invite someone new; sign up from that link in a
   private window; you see "You're being onboarded".
3. The owner gets the signed-up email; the header shows Team 1. Give access with View and Edit;
   the person reloads and sees the client, canvas editable, Generate disabled with the reason.
4. Remove Generate on Team for someone who had it: their next request is refused; their buttons
   follow on focus.
5. In `impersonation_audit_log`, the agency's `admin_action` rows list each change from Admin.

```sql
-- expect the admin actions from step 1 and any Admin changes
select event_type, detail, occurred_at from impersonation_audit_log
 where target_org_id = '<agency>' and event_type = 'admin_action' order by occurred_at;
-- expect 0 open invites older than 7 days still usable (expired ones are refused by the app)
select count(*) from org_invitations where accepted_at is null and revoked_at is null and expires_at < now();
```
````

- [ ] **Step 2: Record the decisions**

Append after D510 (confirm the number against `staging` before merging):

```markdown
### D511 — People, invites and Admin share one API and one set of screens *(recorded 2026-11-13; refines D505, D506, D509; originated → `2026-11-13-permissions-people-and-invites.md`)*

**Decision.**
- Every people change goes through `/api/orgs/[orgId]/…` behind `withTeam`: the owner passes `manage_team` in the agency they act in, under the impersonation write gate; a super admin working from Admin passes for any agency, skips that gate (D85) and is logged as `admin_action`. While viewing as the same agency, the owner path applies.
- The rules (refusals, the 50-a-day limit, emails) live once in `src/lib/people/ops.ts`; the Team page (`TeamPeople`) and a client's Members list (`ClientMembers`) render for the owner and in Admin's People and Clients tabs.
- One people read per agency (`list_agency_people` plus open invites) feeds the Team page, every Members list and the invite popup.
- Invite links are stored as issued so Copy link shows the same one; acceptable because the table is server-only and links are single-use and expire after 7 days (Arun, 13 Nov). Only Resend issues a new link (the old one stops working); Cancel revokes.
- Remove deletes the person's login (one agency per person), as the old admin removal did.
- Email goes through Resend's HTTP API with `fetch`; without `RESEND_API_KEY` and `EMAIL_FROM` the link is shown to copy.

**Why.** D509 (one place for permissions), AGENTS.md "share the wiring too", and D85's line between administering the platform and acting as an agency.

**Rejected.** Separate admin routes mirroring the owner's (two copies of every rule).
```

- [ ] **Step 3: Full verification**

```bash
cd /C/Users/yuvab/OneDrive/Desktop/codes/creativeos-perm
npx vitest run src/lib
npx vitest run src/components
npx vitest run src/hooks
npx vitest run src/services
npx vitest run src/app
```

Expected: PASS apart from the two known `refuses a deprecated model` failures; a timeout in an API route test is re-run alone and must pass.

Run: `npx tsc --noEmit` (only the known line), `npx eslint src`, `npm run build` (completes).

- [ ] **Step 4: Count the calls** (AGENTS.md performance rules)

With the dev server on a local copy: open `/team`, a client's Members page and the invite popup with the Network panel filtered to `/api/`.
Expected: one `/api/orgs/<id>/people` per screen visit (none on the first paint, which is seeded), nothing per row; opening the invite popup makes no request; the header makes no request for the Team count.

- [ ] **Step 5: Commit**

```bash
git add docs/auth-production-migration.md docs/superpowers/specs/2026-05-30-creativeos-staging-roadmap.md
git commit -m "docs(permissions): people and invite rollout notes; record D511"
git log -1 --format=%B
```

---

## Self-review

- **Spec coverage:** §6.1 Team page (sections, chip editor, Give access, Remove, Invited with Copy link (the stored link)/Resend (a new link)/Cancel, Members with Edit/Remove, header count) → Tasks 6, 7, 8. §6.2 Members page (button beside Brand Workspace, list, statuses, Set permissions link, Remove off the client, invite rows, two-step popup with search and checkboxes, refusals) → Tasks 3, 9, 10. §6.3 invite email and sign-up (fixed email, member waits, owner gets access, invalid and wrong-email states, single use, signed-up email) → Tasks 1, 3, 11. §6.6 Admin (Add an agency, pending owner with Resend, People and Clients tabs on the owner's components, Make owner, temporary passwords and role select removed, audit log) → Tasks 4, 12, 13. §6.7 emails and the daily limit → Tasks 1, 3. §9 migration doc → plan 3 Task 2 and Task 14. §10 performance (one read per screen, ids checked, one insert to add people) → Tasks 3, 4, 5, 14. §11 server-action tests → Tasks 3, 4, 11, 12.
- **Names across tasks:** `withTeam`, `TeamContext`, `opResponse` (Task 4) are used by every route; `peopleKeys`, `usePeople` and the eight mutation hooks (Task 5) by Tasks 7–10; `TeamInvitedRow` (Task 7) by Task 9; `ClientMembers` and `InviteDialog` (Tasks 9, 10) by Task 13; `RemovePersonDialog` (Task 7) by Tasks 7, 9; `CopyRow` at `src/components/shared/copy-row.tsx` from Task 7 on; `createAgencyAction` / `resendOwnerInviteAction` (Task 12); `REFUSALS`, `STATUS_LABELS`, `PERMISSION_LABELS` (Task 2).

## Open points

1. **One route set for the owner and Admin.** The spec says Admin's tabs reuse the owner's components; it doesn't say how their writes are authorised. This plan routes both through `/api/orgs/[orgId]/…` with `withTeam` (owner: `manage_team` plus the write gate; super admin from Admin: any agency, `admin_action` logged, no impersonation gate per D85).
2. **Invite links are stored as issued** (`org_invitations.token`, unique) so Copy link shows the same link; acceptable because the table is server-only and links are single-use and expire after 7 days (Arun, 13 Nov). Each open invite in the people response carries its link, so it reaches only the owner and the super admin.
3. **Remove deletes the login**, as `removeOrgMember` did, because a login without a membership could never sign in again in a one-agency-per-person version. The spec says "deletes the membership".
4. **An email with a login but no membership** (rare: only if a login outlived its membership) is refused with "This email already belongs to another agency.", since signing up again with it would fail.
5. **The daily-limit refusal's wording** is this plan's (`You've sent 50 invites today. Try again tomorrow.`); the spec gives only the limit. Copy link makes no request and doesn't count towards it; Resend does.
6. **`EMAIL_FROM`** is a new environment variable beside `RESEND_API_KEY`: Resend needs a sender on the verified domain (spec §9 mentions the domain, not the variable).
7. **Admin tabs:** the spec lists Overview, People and Clients; Generations and Support activity stay. Reset password stays, in People only, through an optional slot. `admin_action` rows outside an impersonation session are not shown in Support activity yet (that view groups by session).
8. **Give access with no permissions** is disabled in the editor; the spec says the editor starts with none but not whether an empty Give access is allowed.
9. **ADR number D511** must be checked against `staging` before merging.
