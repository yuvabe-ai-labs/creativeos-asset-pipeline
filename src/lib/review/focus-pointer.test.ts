import { describe, it, expect } from "vitest";
import { isUnhandledPointer, urlWithoutFocusPointer } from "./focus-pointer";

describe("isUnhandledPointer", () => {
  it("honours the first pointer of a session", () => {
    expect(isUnhandledPointer("n1", null)).toBe(true);
  });

  it("does not honour the same pointer twice", () => {
    expect(isUnhandledPointer("n1", "n1")).toBe(false);
  });

  // The bug: a second inbox link to the SAME canvas is a soft navigation, so the drawer
  // never remounts. A mount-scoped latch swallowed this pointer; a value-scoped one honours it.
  it("honours a different pointer on the same canvas", () => {
    expect(isUnhandledPointer("n2", "n1")).toBe(true);
  });

  it("ignores an absent pointer", () => {
    expect(isUnhandledPointer(null, null)).toBe(false);
    expect(isUnhandledPointer(null, "n1")).toBe(false);
    expect(isUnhandledPointer("", null)).toBe(false);
  });
});

describe("urlWithoutFocusPointer", () => {
  it("drops ?node= and keeps the rest of the query", () => {
    expect(
      urlWithoutFocusPointer("https://app.test/clients/acme/canvases/spring?review=1&node=n1"),
    ).toBe("/clients/acme/canvases/spring?review=1");
  });

  it("drops the question mark when node was the only param", () => {
    expect(urlWithoutFocusPointer("https://app.test/clients/acme/canvases/spring?node=n1")).toBe(
      "/clients/acme/canvases/spring",
    );
  });

  it("returns null when there is no pointer to clear", () => {
    expect(urlWithoutFocusPointer("https://app.test/clients/acme/canvases/spring?review=1")).toBe(
      null,
    );
    expect(urlWithoutFocusPointer("https://app.test/clients/acme/canvases/spring")).toBe(null);
  });

  it("preserves the hash", () => {
    expect(urlWithoutFocusPointer("https://app.test/c/x?node=n1&review=1#top")).toBe(
      "/c/x?review=1#top",
    );
  });
});
