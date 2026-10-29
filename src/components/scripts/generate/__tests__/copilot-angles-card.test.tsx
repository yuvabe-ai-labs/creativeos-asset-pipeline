import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CopilotAnglesCard } from "../copilot-angles-card";
import type { Angle } from "@/lib/scripts/copilot/schema";

const angle: Angle = {
  id: "A", hook: "We almost didn't come to see this one", situation: "A couple's Sunday site visit",
  productMoment: "Walking onto the 3BHK's balcony at sunset", supportingCast: "Their kid runs ahead", proof: "RERA number, possession date",
  reviewTheme: "", format: "", occasion: "", postDate: "", lead: "", leadAvatarId: null, signalIds: [], fromSignals: "",
};

describe("the angles card", () => {
  it("shows what each angle commits to in brand-neutral words", () => {
    const html = renderToStaticMarkup(<CopilotAnglesCard angles={[angle]} disabled={false} onPick={() => {}} />);
    expect(html).toContain("Product moment");
    expect(html).toContain("Walking onto the 3BHK&#x27;s balcony at sunset");
    expect(html).toContain("Proof");
    expect(html).not.toContain("Meal and use");
  });

  it("hides the review theme when the brand doesn't use reviews", () => {
    expect(renderToStaticMarkup(<CopilotAnglesCard angles={[angle]} disabled={false} onPick={() => {}} />)).not.toContain("Review theme");
    expect(renderToStaticMarkup(<CopilotAnglesCard angles={[{ ...angle, reviewTheme: "Easy handover" }]} disabled={false} onPick={() => {}} />)).toContain("Review theme");
  });
});
