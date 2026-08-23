import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Enumerates every exported `*Action` function across src/lib/actions/*.ts and asserts
// each is either wrapped in withAction(...) or explicitly allowlisted below with a
// stated reason. This is the test that makes D101 an enforced invariant instead of a
// convention someone has to remember — it fails the moment a new mutating action ships
// unwrapped, which is exactly the class of bug (createClientAction, Stage 4 review
// round 2) that a green test suite full of unit tests didn't catch.
const ACTIONS_DIR = join(__dirname);

// Functions deliberately NOT gated, with the reason — extend this list only with a
// one-line justification, the same way canvas-lock.ts's own file comment explains it.
const ALLOWLIST: Record<string, string> = {
  getCanvasLockAction: "read, not a write",
  acquireCanvasLockAction: "per-editor-session bookkeeping, not tenant data (D101 amendment)",
  heartbeatCanvasLockAction: "per-editor-session bookkeeping, not tenant data (D101 amendment)",
  releaseCanvasLockAction: "per-editor-session bookkeeping, not tenant data (D101 amendment)",
  loginAction: "runs before any session/impersonation state exists",
  logoutAction: "runs after signOut(); also directly calls endImpersonation() itself",
  enterImpersonationAction: "impersonation session-control, not tenant data",
  enterElevatedModeAction: "impersonation session-control, not tenant data",
  exitImpersonationAction: "impersonation session-control, not tenant data",
  changePasswordAction:
    "operator's own auth credential, not tenant data — same self/session-scoped " +
    "category as loginAction/logoutAction. Also unreachable while impersonating: " +
    "proxy.ts forces every route except /account/password to redirect there whenever " +
    "must_change_password is set, before any impersonation-related routing can happen.",
  createOrgAction:
    "admin.ts: /admin platform-administration (requireSuperAdmin()-gated), not " +
    "acting-as-an-org (D85 draws this line explicitly). No target org exists yet. " +
    "Tried gating this in review round 2 and reverted: withAction() has no way to know " +
    "this action's target org differs from whatever org is currently impersonated, so " +
    "gating it both spuriously blocks unrelated /admin work and misattributes the " +
    "audit-log's target_org_id to the wrong org.",
  updateOrgCreditLimitAction:
    "admin.ts: same D85 platform-administration category and same revert rationale as " +
    "createOrgAction — orgId is an explicit caller-supplied parameter, never correlated " +
    "with the impersonation session's target org.",
  resetMemberPasswordAction:
    "admin.ts: same D85 platform-administration category and same revert rationale as " +
    "createOrgAction — orgId is an explicit caller-supplied parameter, never correlated " +
    "with the impersonation session's target org.",
  addOrgMemberAction:
    "admin.ts: same D85 platform-administration category and same revert rationale as " +
    "createOrgAction — orgId is an explicit caller-supplied parameter, never correlated " +
    "with the impersonation session's target org.",
  updateMemberRoleAction:
    "admin.ts: same D85 platform-administration category and same revert rationale as " +
    "createOrgAction — orgId is an explicit caller-supplied parameter, never correlated " +
    "with the impersonation session's target org.",
};

function findActionFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") && e.name !== "with-action.ts")
    .map((e) => join(dir, e.name));
}

function extractExportedActionFunctions(source: string): { name: string; body: string }[] {
  const re = /export async function (\w*Action\w*|startKBBuildJob|markStuckJobFailed)\s*\(/g;
  const matches: { name: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    matches.push({ name: match[1], index: match.index });
  }
  // Bound each function's body slice at the START OF THE NEXT exported action match
  // (or EOF) — not a fixed-size window. A fixed window (e.g. a flat 2000 chars) lets a
  // `withAction(` call belonging to the NEXT function in the same file bleed into this
  // function's slice when two actions sit close together, producing a false pass for a
  // function that is genuinely unwrapped. Verified against this file's own
  // canvases.ts (createCanvasAction/renameCanvasAction/deleteCanvasAction sit within a
  // few hundred chars of each other — well inside a 2000-char window).
  return matches.map(({ name, index }, i) => {
    const end = i + 1 < matches.length ? matches[i + 1].index : source.length;
    return { name, body: source.slice(index, end) };
  });
}

describe("every mutating server action is gated by withAction() or explicitly allowlisted", () => {
  const files = findActionFiles(ACTIONS_DIR);
  expect(files.length).toBeGreaterThan(0); // sanity: the glob itself didn't silently match nothing

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const actions = extractExportedActionFunctions(source);

    for (const { name, body } of actions) {
      it(`${name} (${file.split(/[\\/]/).pop()}) is wrapped in withAction() or allowlisted`, () => {
        const isWrapped = body.includes("withAction(");
        const isAllowlisted = name in ALLOWLIST;
        expect(
          isWrapped || isAllowlisted,
          `${name} is neither wrapped in withAction() nor in the ALLOWLIST — ` +
            `either wrap it, or add it to ALLOWLIST with a one-line reason.`,
        ).toBe(true);
      });
    }
  }
});
