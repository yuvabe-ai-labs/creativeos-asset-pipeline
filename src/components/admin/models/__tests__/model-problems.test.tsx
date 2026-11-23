import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelProblems } from "../model-problems";

describe("ModelProblems", () => {
  const html = renderToStaticMarkup(<ModelProblems problems={["params: Expected array", "label: Required"]} />);

  it("lists each problem", () => {
    expect(html).toContain("params: Expected array");
    expect(html).toContain("label: Required");
  });

  it("says what can be fixed here and what needs a migration", () => {
    expect(html).toContain("The app leaves this model out until it is fixed.");
    expect(html).toContain(
      "Labels, order and status can still be changed here; settings, rules and limits are fixed by a migration.",
    );
  });
});
