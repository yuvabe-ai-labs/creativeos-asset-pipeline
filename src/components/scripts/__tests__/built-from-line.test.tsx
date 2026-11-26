import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BuiltFromLine } from "../built-from-line";

// D531: the line at the top of a script naming the signals it is built from.

const signals = [{ id: "s1", name: "Monsoon rituals" }, { id: "s2", name: "Office dry skin" }, { id: "s3", name: "Question hooks" }];
const html = (props: Partial<Parameters<typeof BuiltFromLine>[0]> = {}) =>
  renderToStaticMarkup(<BuiltFromLine signals={signals} chosen={["s1", "s2"]} editable onChange={() => {}} {...props} />);
const count = (s: string, needle: string) => s.split(needle).length - 1;

describe("BuiltFromLine", () => {
  it("says it is set when an angle is picked, before any is", () => {
    expect(html({ chosen: null })).toContain("Set when you pick an angle");
  });

  it("names each chosen signal, with one remove button per chip and the add chip", () => {
    const out = html();
    expect(out).toContain("Built from");
    expect(out).toContain("Monsoon rituals");
    expect(out).toContain("Office dry skin");
    expect(count(out, 'aria-label="Remove ')).toBe(2);
    expect(out).toContain("Add a signal");
  });

  it("drops a signal that no longer exists", () => {
    const out = html({ chosen: ["s1", "gone"] });
    expect(count(out, 'aria-label="Remove ')).toBe(1);
  });

  it("read-only shows the names and no controls", () => {
    const out = html({ editable: false });
    expect(out).toContain("Monsoon rituals");
    expect(out).not.toContain('aria-label="Remove ');
    expect(out).not.toContain("Add a signal");
  });

  it("says when the script uses no signal", () => {
    expect(html({ chosen: [], editable: false })).toContain("No signals");
  });

  it("offers no add chip when every signal is already used", () => {
    expect(html({ chosen: ["s1", "s2", "s3"] })).not.toContain("Add a signal");
  });
});
