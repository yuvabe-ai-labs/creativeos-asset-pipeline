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
];

const ORG_SCOPED_WRITE_FUNCTIONS = [
  "insertGeneration",
  "reserveCredits",
  "settleGeneration",
  "refundReservation",
];

describe("generation routes attribute org-scoped writes to the effective org, not the caller's own org", () => {
  for (const relPath of GENERATION_ROUTES) {
    it(`${relPath} never passes caller.orgId into a credit/generation write`, () => {
      const source = readFileSync(join(process.cwd(), relPath), "utf8");
      for (const fnName of ORG_SCOPED_WRITE_FUNCTIONS) {
        // Look at each call site of fnName and confirm none of its nearby argument
        // text contains the literal "caller.orgId" — deliberately blunt (source-text,
        // not AST-based), matching this branch's existing coverage-test philosophy:
        // cheap, fails loudly on the exact regression pattern, not a general-purpose
        // static analyzer.
        const callSites = [...source.matchAll(new RegExp(`${fnName}\\(([^;]*?)\\)`, "gs"))];
        for (const [, args] of callSites) {
          expect(
            args.includes("caller.orgId"),
            `${relPath}: a ${fnName}(...) call passes caller.orgId — use effectiveOrgId ` +
              `instead (caller.orgId is the operator's real org, not the org being acted as).`,
          ).toBe(false);
        }
      }
    });
  }
});
