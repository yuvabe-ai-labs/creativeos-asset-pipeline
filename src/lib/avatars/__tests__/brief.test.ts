import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/scripts/copilot/model", () => ({ structuredCaller: vi.fn() }));

import { briefFront } from "../brief";
import { AVATAR_BRIEF_SYSTEM } from "@/prompts/avatar-character";
import type { StructuredCall } from "@/lib/scripts/copilot/model";

const input = { name: "Rajan", description: "Her husband Rajan, 58, behind her.", setting: "Kerala", instructions: "Clean-shaven" };

describe("briefFront (D395)", () => {
  it("asks the model with the brief's system prompt and turns its answer into the front input", async () => {
    const call = vi.fn(async () => ({
      gender: "Male", age: "55+", ageYears: "58", ethnicity: "South Asian",
      appearance: "Clean-shaven.", wardrobe: "A white mundu.", markers: "",
    })) as unknown as StructuredCall;
    const front = await briefFront(input, call);
    expect(vi.mocked(call).mock.calls[0][0]).toMatchObject({ name: "avatar_brief", system: AVATAR_BRIEF_SYSTEM });
    expect(vi.mocked(call).mock.calls[0][0].user).toContain("Clean-shaven");
    expect(front).toEqual({
      description: "A 58-year-old South Asian man. Clean-shaven. A white mundu.",
      attributes: { gender: "Male", age: "55+", ethnicity: "South Asian" },
    });
  });

  it("still gives a face to draw from when the model fails, the instructions first", async () => {
    const call = vi.fn(async () => { throw new Error("timeout"); }) as unknown as StructuredCall;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await briefFront(input, call)).toEqual({
      description: "Clean-shaven Her husband Rajan, 58, behind her.", attributes: {},
    });
  });
});
