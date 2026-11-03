import { describe, expect, it } from "vitest";
import { connectedInputsKey } from "../use-connected-inputs-key";

describe("connectedInputsKey", () => {
  const shot = { id: "s1" };
  const still = { id: "ig1", fileUrl: "https://x/a.png" };

  it("is the same for the same inputs", () => {
    expect(connectedInputsKey([shot, still])).toBe(connectedInputsKey([{ ...shot }, { ...still }]));
  });

  it("changes when an input is added or removed", () => {
    expect(connectedInputsKey([shot, still])).not.toBe(connectedInputsKey([shot]));
    expect(connectedInputsKey([])).not.toBe(connectedInputsKey([shot]));
  });

  it("changes when an input's picture changes (a connected Image Gen finishing)", () => {
    expect(connectedInputsKey([still])).not.toBe(
      connectedInputsKey([{ ...still, fileUrl: "https://x/b.png" }]),
    );
    expect(connectedInputsKey([{ id: "ig1" }])).not.toBe(connectedInputsKey([still]));
  });
});
