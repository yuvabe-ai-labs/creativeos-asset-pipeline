import { describe, it, expect } from "vitest";
import {
  REF_ROLES,
  asRefRoles,
  refRolesFromReading,
  referenceRolesLine,
  type RefRole,
} from "../ref-roles";
import {
  imageRefDialect,
  klingImageDialect,
  seedanceImageDialect,
} from "../prompt-token-dialect";

const labels = (entries: Array<[string, RefRole, string]>) =>
  new Map(entries.map(([id, role, name]) => [id, { role, name }]));

describe("refRolesFromReading", () => {
  const ids = ["a", "b", "c"];

  it("maps each reading's image number onto the attachment in that position", () => {
    expect(
      refRolesFromReading(
        [
          { image: 2, role: "location", name: "podcast set", contents: "…" },
          { image: 1, role: "product", name: " Jackfruit365 pouch ", contents: "…" },
        ],
        ids,
      ),
    ).toEqual([
      { id: "b", role: "location", name: "podcast set" },
      { id: "a", role: "product", name: "Jackfruit365 pouch" },
    ]);
  });

  it("drops numbers outside the attachment list and non-integers", () => {
    expect(
      refRolesFromReading(
        [
          { image: 0, role: "product", name: "x" },
          { image: 4, role: "product", name: "x" },
          { image: 1.5, role: "product", name: "x" },
          { image: "1", role: "product", name: "x" },
        ],
        ids,
      ),
    ).toEqual([]);
  });

  it("reads an unknown role as other, caps the name, and keeps the first entry per image", () => {
    const long = "n".repeat(80);
    expect(
      refRolesFromReading(
        [
          { image: 3, role: "background", name: long },
          { image: 3, role: "product", name: "second" },
        ],
        ids,
      ),
    ).toEqual([{ id: "c", role: "other", name: "n".repeat(60) }]);
  });

  it("is empty for anything that is not an array", () => {
    expect(refRolesFromReading(undefined, ids)).toEqual([]);
    expect(refRolesFromReading({ image: 1 }, ids)).toEqual([]);
  });
});

describe("asRefRoles", () => {
  it("keeps well-formed rows and drops the rest", () => {
    expect(
      asRefRoles([
        { id: "a", role: "product", name: "pouch" },
        { id: "b", role: "nonsense", name: "x" },
        { id: 3, role: "person", name: "x" },
        null,
      ]),
    ).toEqual([{ id: "a", role: "product", name: "pouch" }]);
  });

  it("is undefined for a value that is not an array", () => {
    expect(asRefRoles(undefined)).toBeUndefined();
    expect(asRefRoles("x")).toBeUndefined();
  });
});

describe("referenceRolesLine", () => {
  it("says what each sent image is, in Omni's tokens", () => {
    const sent = ["a", "b", "c"];
    expect(
      referenceRolesLine(
        sent,
        labels([
          ["a", "product", "Jackfruit365 pouch"],
          ["b", "location", "podcast set"],
          ["c", "person", "James"],
        ]),
        imageRefDialect(sent),
      ),
    ).toBe(
      "Reference roles: <IMAGE_REF_0> is the product (Jackfruit365 pouch): keep it exactly as pictured. " +
        "<IMAGE_REF_1> is the location (podcast set): the place, not a subject. " +
        "<IMAGE_REF_2> is a person (James).",
    );
  });

  it("writes each role's own clause", () => {
    const sent = ["s", "t", "m"];
    expect(
      referenceRolesLine(
        sent,
        labels([
          ["s", "storyboard", "panel 2"],
          ["t", "style", "warm grade"],
          ["m", "brand mark", "logo"],
        ]),
        imageRefDialect(sent),
      ),
    ).toBe(
      "Reference roles: <IMAGE_REF_0> is a storyboard (panel 2): layout and framing only, never show the drawing. " +
        "<IMAGE_REF_1> is a style reference (warm grade): light and colour only. " +
        "<IMAGE_REF_2> is a brand mark (logo): a logo graphic, not an object.",
    );
  });

  it("uses Kling's and Seedance's own tokens", () => {
    const sent = ["a"];
    const l = labels([["a", "product", "pouch"]]);
    expect(referenceRolesLine(sent, l, klingImageDialect(sent))).toBe(
      "Reference roles: @image_1 is the product (pouch): keep it exactly as pictured.",
    );
    expect(referenceRolesLine(sent, l, seedanceImageDialect(sent))).toBe(
      "Reference roles: @Image 1 is the product (pouch): keep it exactly as pictured.",
    );
  });

  it("numbers over what is sent, and skips images with no label", () => {
    // "a" was left out of the request, so "b" is the first reference sent.
    const sent = ["b", "c"];
    expect(
      referenceRolesLine(sent, labels([["a", "product", "pouch"], ["c", "person", "James"]]), imageRefDialect(sent)),
    ).toBe("Reference roles: <IMAGE_REF_1> is a person (James).");
  });

  it("reads without a name, and drops an unnamed other", () => {
    const sent = ["a", "b"];
    expect(
      referenceRolesLine(sent, labels([["a", "product", ""], ["b", "other", ""]]), imageRefDialect(sent)),
    ).toBe("Reference roles: <IMAGE_REF_0> is the product: keep it exactly as pictured.");
  });

  it("never carries a semicolon, which would end a Kling shot early", () => {
    const sent = ["a"];
    expect(referenceRolesLine(sent, labels([["a", "product", "pouch; 100g"]]), klingImageDialect(sent))).toBe(
      "Reference roles: @image_1 is the product (pouch, 100g): keep it exactly as pictured.",
    );
  });

  it("is empty when nothing sent is labelled, or the model has no tokens", () => {
    expect(referenceRolesLine(["a"], labels([]), imageRefDialect(["a"]))).toBe("");
    expect(referenceRolesLine(["a"], labels([["a", "product", "pouch"]]), null)).toBe("");
  });

  it("knows every role", () => {
    expect(REF_ROLES).toEqual(["product", "person", "location", "storyboard", "style", "brand mark", "other"]);
  });
});
