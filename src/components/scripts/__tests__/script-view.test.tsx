// src/components/scripts/__tests__/script-view.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScriptView } from "../script-view";
import { reelDoc } from "@/lib/script-review/__tests__/fixtures";

describe("ScriptView slots (MP3)", () => {
  it("renders spec 1's view with anchors and nothing else when no slots are given", () => {
    const html = renderToStaticMarkup(<ScriptView script={{ doc: reelDoc(), stage: "visualise" }} avatarFaces={{}} />);
    expect(html).toContain('id="script-context"');
    expect(html).toContain('id="cast-meenakshi"');
    expect(html).toContain('id="shot-s04"');
    expect(html).not.toContain("data-slot-test");
  });

  it("puts each slot beside its own part", () => {
    const html = renderToStaticMarkup(
      <ScriptView
        script={{ doc: reelDoc(), stage: "visualise" }}
        avatarFaces={{}}
        slots={{
          context: <span data-slot-test="context" />,
          castMember: (m) => <span data-slot-test={`cast-${m.id}`} />,
          shot: (s) => <span data-slot-test={`shot-${s.id}`} />,
        }}
      />,
    );
    expect(html).toContain('data-slot-test="context"');
    expect(html.match(/data-slot-test="shot-/g)).toHaveLength(14);
    const husband = html.slice(html.indexOf('id="cast-husband"'));
    expect(husband).toContain('data-slot-test="cast-husband"');
    const s04 = html.slice(html.indexOf('id="shot-s04"'), html.indexOf('id="shot-s05"'));
    expect(s04).toContain('data-slot-test="shot-s04"');
  });
});
