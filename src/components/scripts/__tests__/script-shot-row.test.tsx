import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import reel01 from "@/lib/scripts/fixtures/reel-01.json";
import { scriptDocSchema } from "@/lib/scripts/schema";
import { timeShots } from "@/lib/scripts/timeline";
import { ScriptShotRow } from "../script-shot-row";

const doc = scriptDocSchema.parse(reel01);
const timed = timeShots(doc.shots)[0];

describe("ScriptShotRow (compact)", () => {
  it("sweeps the shimmer across the whole row while its panel draws, not just the text", () => {
    const html = renderToStaticMarkup(
      <ScriptShotRow timed={timed} cast={doc.cast} compact state={{ drawing: true, onOpen: () => {} }} aside={<span>Drawing…</span>} />,
    );
    const li = html.match(/^<li[^>]*>/)![0];
    expect(li).toMatch(/class="[^"]*\brelative\b/);
    expect(li).toMatch(/class="[^"]*\boverflow-hidden\b/);
    // The sweep is the row's first child, before the shot's clickable text and its aside.
    expect(html.indexOf("animate-shimmer")).toBeLessThan(html.indexOf("<button"));
  });

  it("draws no shimmer when the panel is not drawing", () => {
    const html = renderToStaticMarkup(<ScriptShotRow timed={timed} cast={doc.cast} compact state={{}} />);
    expect(html).not.toContain("animate-shimmer");
  });
});
