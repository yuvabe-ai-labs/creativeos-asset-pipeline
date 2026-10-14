import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkFinalBar, openItemNames } from "../mark-final-bar";

const items = [
  { id: "confirm.c1", label: "To confirm", question: "Confirm: October 2026", path: "notes.confirm.c1" },
  { id: "header.postDate", label: "Post date", question: "What's the post date for this reel?", path: "header.postDate" },
];
const bar = (over: { disabled?: boolean } = {}) =>
  renderToStaticMarkup(<MarkFinalBar openItems={items} canUndo={false} onUndo={() => {}} onMarkFinal={() => {}} pending={false} disabled={over.disabled ?? false} />);

describe("MarkFinalBar", () => {
  it("offers Mark final with items still open, and says how many (D363)", () => {
    const html = bar();
    expect(html).toContain("2 still open");
    expect(html).toMatch(/<button[^>]*>(?:(?!<\/button>)[\s\S])*Mark final/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Mark final/);
  });

  it("stays off with no draft or while the copilot works", () => {
    expect(bar({ disabled: true })).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Mark final/);
  });

  it("names a confirmation by what to confirm, and anything else by its label", () => {
    expect(openItemNames(items)).toEqual(["Confirm: October 2026", "Post date"]);
  });
});
