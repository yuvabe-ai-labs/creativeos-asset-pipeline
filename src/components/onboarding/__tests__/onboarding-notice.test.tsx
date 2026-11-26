import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { OnboardingNotice } from "../onboarding-notice";

// renderToString marks every text-node boundary with <!-- -->, so the sentence must come out as
// one run: a boundary is where a reader (an accessibility tree, a copy) lost the space.
describe("OnboardingNotice", () => {
  it("says who is setting up access in one sentence, with its spaces", () => {
    const html = renderToString(<OnboardingNotice orgName="Perm Test Agency" />);
    expect(html).toContain("Perm Test Agency is setting up your access. Your clients will appear here once it&#x27;s ready.");
  });
});
