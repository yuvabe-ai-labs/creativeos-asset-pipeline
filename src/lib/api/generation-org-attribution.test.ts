import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The org-attribution class of bug (round 1: pages read caller.orgId instead of
// resolveOrgId(); round 2: createClientAction/createCanvasAction wrote caller.orgId;
// round 3: all four generation routes billed/stamped caller.orgId despite withNode
// already resolving the correct effectiveOrgId for its own isolation check) keeps
// recurring because unit tests prove each function correct in isolation without ever
// asserting WHICH org value it was fed. This test reads the generation routes' own
// source and fails if any of them passes caller.orgId into a credit/generation
// DB call — regardless of whether that specific call's unit test happens to pass.
const GENERATION_ROUTES = [
  "src/app/api/nodes/[id]/generate/route.ts",
  "src/app/api/nodes/[id]/image-generate/route.ts",
  "src/app/api/nodes/[id]/video-generate/route.ts",
  "src/app/api/nodes/[id]/video-prompt/route.ts",
  // Task 12 extracted video-prompt/route.ts's reserve/insert/settle/refund calls into this
  // helper — the route itself no longer contains any of ORG_SCOPED_WRITE_FUNCTIONS, so
  // scanning the route alone would find zero call sites and pass vacuously. Scan the helper
  // too, since that's where the real calls (and the real regression risk) now live. The
  // Multishot Prompt route is about to be built on this same helper, doubling the surface
  // this guards.
  "src/lib/api/prompt-run.ts",
];

const ORG_SCOPED_WRITE_FUNCTIONS = [
  "insertGeneration",
  "reserveCredits",
  "settleGeneration",
  "refundReservation",
];

describe("generation routes attribute org-scoped writes to the effective org, not the caller's own org", () => {
  // Populated by each per-route test below; checked afterward so a future extraction that
  // hollows out every scanned file's call sites fails loudly instead of leaving this whole
  // suite green while asserting nothing (see the empty-scan note next to each per-route it()).
  const callSitesFoundByRoute = new Map<string, number>();

  for (const relPath of GENERATION_ROUTES) {
    it(`${relPath} never passes caller.orgId into a credit/generation write`, () => {
      const source = readFileSync(join(process.cwd(), relPath), "utf8");
      let totalCallSites = 0;
      for (const fnName of ORG_SCOPED_WRITE_FUNCTIONS) {
        // Look at each call site of fnName and confirm none of its nearby argument
        // text contains the literal "caller.orgId" — deliberately blunt (source-text,
        // not AST-based), matching this branch's existing coverage-test philosophy:
        // cheap, fails loudly on the exact regression pattern, not a general-purpose
        // static analyzer.
        const callSites = [...source.matchAll(new RegExp(`${fnName}\\(([^;]*?)\\)`, "gs"))];
        totalCallSites += callSites.length;
        for (const [, args] of callSites) {
          expect(
            args.includes("caller.orgId"),
            `${relPath}: a ${fnName}(...) call passes caller.orgId — use effectiveOrgId ` +
              `instead (caller.orgId is the operator's real org, not the org being acted as).`,
          ).toBe(false);
        }
      }
      callSitesFoundByRoute.set(relPath, totalCallSites);
    });
  }

  it("scanned at least one real call site overall (an empty scan protects nothing)", () => {
    const total = [...callSitesFoundByRoute.values()].reduce((a, b) => a + b, 0);
    expect(
      total,
      "every per-route test above passed, but zero calls to insertGeneration/reserveCredits/" +
        "settleGeneration/refundReservation were found across all of GENERATION_ROUTES — the " +
        "scan is vacuous, not clean. A route was likely refactored to call these through a " +
        "helper that isn't in GENERATION_ROUTES yet; add it.",
    ).toBeGreaterThan(0);
  });
});
