// Brand-neutral spec §3.5 — moves a client's pasted house rules from the image analysis's
// Consistency Notes (where seed-house-spec.mjs put them for the demo, and where re-running Image
// Analysis overwrites them) into Content Rules, their own field. Writes the active KB version in
// place. Changes client data: preview first.
//
//   MOVE_CLIENT=<client slug> npx vitest run --config vitest.integration.config.ts scripts/move-house-rules.itest.ts
//   MOVE_CLIENT=<client slug> MOVE_APPLY=1 npx vitest run --config vitest.integration.config.ts scripts/move-house-rules.itest.ts
import { describe, it, beforeAll } from "vitest";

beforeAll(() => {
  process.loadEnvFile(".env");
});

describe("move house rules into Content Rules", () => {
  it("previews the move, and makes it only with MOVE_APPLY=1", async () => {
    const slug = process.env.MOVE_CLIENT;
    if (!slug) throw new Error("Set MOVE_CLIENT to a client slug.");
    const { getClientBySlug } = await import("@/lib/db/clients");
    const { getActiveKBVersion, setKBField } = await import("@/lib/db/kb");
    const { withHouseRulesMoved } = await import("@/lib/kb/move-house-rules");
    type KB = import("@/lib/kb/schema").TraceableBrandKB;

    const client = await getClientBySlug(slug);
    if (!client) throw new Error(`No client ${slug}`);
    const version = await getActiveKBVersion(client.id);
    if (!version) throw new Error(`${client.name} has no active KB.`);
    const { kb, moved } = withHouseRulesMoved(version.output as unknown as KB);
    if (!moved) {
      console.log(`\n${client.name}: nothing to move (no Consistency Notes, or Content Rules already written).\n`);
      return;
    }
    const text = kb.compliance.content_rules?.value ?? "";
    console.log(`\n${client.name}: would move ${text.length} characters into Content Rules. First 400:\n\n${text.slice(0, 400)}\n`);
    if (process.env.MOVE_APPLY !== "1") {
      console.log("Preview only. Set MOVE_APPLY=1 to write it.\n");
      return;
    }
    await setKBField(version.id, ["compliance", "content_rules"], kb.compliance.content_rules);
    console.log(`Written to KB version ${version.id}.\n`);
  }, 60_000);
});
