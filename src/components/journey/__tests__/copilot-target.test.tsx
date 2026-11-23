import { describe, it, expect } from "vitest";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CopilotTarget } from "../copilot-target";

// CopilotTarget has no hooks, so calling it returns its element tree to read directly.
const keysOf = (version: number, landed: number | null) => {
  const root = CopilotTarget({
    id: "kb:form:website",
    state: { asking: true, writing: true, version, landed },
    children: <input />,
  }) as ReactElement<{ children: ReactNode }>;
  return Children.toArray(root.props.children).filter(isValidElement).map((c) => c.key);
};

describe("a copilot target", () => {
  // The content and the landed highlight are keyed by the same write count. Siblings sharing a key
  // make React duplicate the field on each re-render while the change shows as landed (three website
  // rows after one save, QA 2.2).
  it("keys its content and its landed highlight apart when they carry the same count", () => {
    const keys = keysOf(3, 3);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // A field is marked only when its value changes, not while the copilot asks about it.
  it("draws no mark while the copilot only asks about it", () => {
    const out = renderToStaticMarkup(
      <CopilotTarget id="kb:form:website" state={{ asking: true, writing: false, version: 0, landed: null }}><input /></CopilotTarget>,
    );
    expect(out).not.toContain("Copilot is asking");
    expect(out).not.toContain("bg-primary/5");
    expect(out).not.toContain("ring-primary/20");
  });
});
