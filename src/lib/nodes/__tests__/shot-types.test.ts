import { describe, it, expect } from "vitest";
import { deriveShotType } from "../shot-types";

describe("deriveShotType", () => {
  it("returns Wide Shot for text containing 'wide'", () => {
    expect(deriveShotType("A wide establishing shot of the city")).toBe("Wide Shot");
  });
  it("returns Close-Up for text containing 'close'", () => {
    expect(deriveShotType("A close shot of the product")).toBe("Close-Up");
  });
  it("returns Medium Shot for text containing 'medium'", () => {
    expect(deriveShotType("Medium shot of the person walking")).toBe("Medium Shot");
  });
  it("returns Aerial for text containing 'aerial' or 'drone'", () => {
    expect(deriveShotType("Aerial view of the landscape")).toBe("Aerial");
    expect(deriveShotType("Drone shot pulling back")).toBe("Aerial");
  });
  it("returns POV for text containing 'pov' or 'point of view'", () => {
    expect(deriveShotType("POV walking through the door")).toBe("POV");
  });
  it("returns Over the Shoulder for 'over the shoulder'", () => {
    expect(deriveShotType("Over the shoulder view of the conversation")).toBe("Over the Shoulder");
  });
  it("returns undefined for unrecognized text", () => {
    expect(deriveShotType("Scene transitions smoothly")).toBeUndefined();
  });
  it("is case insensitive", () => {
    expect(deriveShotType("WIDE SHOT of the field")).toBe("Wide Shot");
  });
});
