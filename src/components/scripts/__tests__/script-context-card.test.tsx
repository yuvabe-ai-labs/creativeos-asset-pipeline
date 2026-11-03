import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { reel01Doc } from "@/lib/scripts/visualise/__tests__/fixtures";
import { ScriptContextCard } from "../script-context-card";

const doc = () => {
  const d = reel01Doc();
  d.context = { ...d.context, purpose: "A comfort-food reel.", settingAndCamera: "Bengaluru kitchen, handheld.", disclaimers: "Helps control blood sugar levels*", watchOuts: ["No close-ups of the child."] };
  return d;
};

describe("ScriptContextCard (D465)", () => {
  it("keeps every section for the team", () => {
    const html = renderToStaticMarkup(<ScriptContextCard doc={doc()} stage="visualise" />);
    expect(html).toContain("Setting and camera");
    expect(html).toContain("Watch-outs");
  });

  it("shows the client only the idea and the claims", () => {
    const html = renderToStaticMarkup(<ScriptContextCard doc={doc()} stage="in_review" audience="client" />);
    expect(html).toContain("Purpose");
    expect(html).toContain("Disclaimers");
    expect(html).not.toContain("Setting and camera");
    expect(html).not.toContain("Watch-outs");
  });

  it("draws the side area inside the card", () => {
    const html = renderToStaticMarkup(<ScriptContextCard doc={doc()} stage="visualise" side={<span>chips</span>} />);
    expect(html.indexOf("<span>chips</span>")).toBeGreaterThan(-1);
    expect(html.indexOf("<span>chips</span>")).toBeLessThan(html.lastIndexOf("</section>"));
  });
});
