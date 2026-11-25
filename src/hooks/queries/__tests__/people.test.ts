// src/hooks/queries/__tests__/people.test.ts
import { describe, it, expect } from "vitest";
import { peopleKeys } from "../people";

describe("peopleKeys", () => {
  it("keys each agency's people apart", () => {
    expect(peopleKeys.list("org-1")).toEqual(["people", "org-1", "list"]);
    expect(peopleKeys.all("org-2")).toEqual(["people", "org-2"]);
  });
});
