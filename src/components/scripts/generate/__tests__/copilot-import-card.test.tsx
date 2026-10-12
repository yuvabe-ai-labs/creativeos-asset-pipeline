import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import type { ImportCard } from "@/lib/scripts/copilot/schema";
import { CopilotImportCard } from "../copilot-import-card";

const card: ImportCard = {
  kind: "import", status: "pending", summary: "Reel 07 · 9 shots · 50s", replacing: "13 shots · 62s",
  doc: scriptDocSchema.parse(reel01), notes: { brief: "", confirmations: [] }, reply: "Imported.",
};
const html = (c: ImportCard) => renderToStaticMarkup(<CopilotImportCard card={c} disabled={false} onResolve={() => {}} />);

describe("the replace card", () => {
  it("says what the paste holds and what it would replace, with both choices", () => {
    const out = html(card);
    expect(out).toContain(card.doc.header.title);
    expect(out).toContain("Reel 07 · 9 shots · 50s, replacing 13 shots · 62s");
    expect(out).toContain("Replace the draft");
    expect(out).toContain("Keep the current one");
  });
  it("shows how it was settled once decided", () => {
    expect(html({ ...card, status: "accepted" })).toContain("Replaced the draft");
    expect(html({ ...card, status: "rejected" })).toContain("Kept the current draft");
    expect(html({ ...card, status: "rejected" })).not.toContain("Replace the draft");
  });
});
