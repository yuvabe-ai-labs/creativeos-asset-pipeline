import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_PARTIAL_DRAFT, type PartialDraft } from "@/lib/scripts/copilot/partial-draft";
import { DraftPreview } from "../draft-preview";

const skeletonRows = (html: string) => html.match(/data-slot="skeleton"/g)?.length ?? 0;

describe("DraftPreview", () => {
  it("shows the script's skeleton the moment writing starts, before any of it arrives", () => {
    const html = renderToStaticMarkup(<DraftPreview draft={EMPTY_PARTIAL_DRAFT} />);
    expect(html).toContain("The shots appear here as they");
    expect(html).not.toContain("Writing the first draft…"); // no placeholder title on a blank card
    expect(skeletonRows(html)).toBeGreaterThan(20);
  });

  it("draws the shots that have arrived, with placeholder rows below for the rest", () => {
    const draft: PartialDraft = {
      ...EMPTY_PARTIAL_DRAFT,
      header: { title: "Kerala Piravi at our table" },
      cast: [{ key: "lead", name: "James", description: "Founder", isLead: true }],
      shots: [{ beat: "HOOK", lengthSeconds: 3, visual: "James lifts the lid", vo: "Ever wondered", onScreenText: "", onScreen: ["lead"] }] as PartialDraft["shots"],
    };
    const html = renderToStaticMarkup(<DraftPreview draft={draft} />);
    expect(html).toContain("1 shot so far");
    expect(html).toContain("James lifts the lid");
    expect(html).toContain("Kerala Piravi at our table");
    expect(skeletonRows(html)).toBe(2 * 8); // two pending rows, eight blocks each; the cast is real
  });
});
