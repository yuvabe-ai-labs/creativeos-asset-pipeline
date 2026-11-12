import { describe, it, expect } from "vitest";
import { isUnhandledPointer, pointerAction, urlWithParam, urlWithoutParams } from "./focus-pointer";

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

describe("pointerAction", () => {
  it("opens a link's node when no view is open", () => {
    expect(pointerAction("n1", null, null)).toBe("open");
    expect(pointerAction("n2", "n1", null)).toBe("open");
  });

  it("does nothing for a link already followed, or no link", () => {
    expect(pointerAction("n1", "n1", null)).toBe("none");
    expect(pointerAction(null, null, null)).toBe("none");
    expect(pointerAction(null, "n1", "n2")).toBe("none");
  });

  it("does nothing when the URL already names the open view", () => {
    expect(pointerAction("n2", "n2", "n2")).toBe("none");
  });

  // The bug: Multishot Prompt → Open video generation. The video view is open, a server action
  // finishes, and Next.js writes back the Multishot Prompt's URL. That must not reopen it.
  it("corrects a stale URL instead of reopening the view it names", () => {
    expect(pointerAction("multishot", "video", "video")).toBe("correct");
    expect(pointerAction("multishot", "multishot", "video")).toBe("correct");
  });
});

describe("urlWithoutParams", () => {
  const canvas = "https://app.test/clients/acme/canvases/spring";

  it("drops ?node= and keeps the rest of the query", () => {
    expect(urlWithoutParams(`${canvas}?review=1&node=n1`, ["node"])).toBe(
      "/clients/acme/canvases/spring?review=1",
    );
  });

  // Closing the drawer spends ?review=1 the same way closing the focus view spends ?node=.
  it("drops ?review= and keeps a live pointer", () => {
    expect(urlWithoutParams(`${canvas}?review=1&node=n1`, ["review"])).toBe(
      "/clients/acme/canvases/spring?node=n1",
    );
  });

  it("drops the question mark when nothing else is left", () => {
    expect(urlWithoutParams(`${canvas}?node=n1`, ["node"])).toBe(
      "/clients/acme/canvases/spring",
    );
    expect(urlWithoutParams(`${canvas}?review=1&node=n1`, ["review", "node"])).toBe(
      "/clients/acme/canvases/spring",
    );
  });

  it("returns null when none of the params are present", () => {
    expect(urlWithoutParams(`${canvas}?review=1`, ["node"])).toBe(null);
    expect(urlWithoutParams(canvas, ["review", "node"])).toBe(null);
  });

  it("clears the params it finds even when a sibling is absent", () => {
    expect(urlWithoutParams(`${canvas}?review=1`, ["review", "node"])).toBe(
      "/clients/acme/canvases/spring",
    );
  });

  it("preserves the hash and unrelated params", () => {
    expect(urlWithoutParams("https://app.test/c/x?node=n1&review=1&tab=a#top", ["node"])).toBe(
      "/c/x?review=1&tab=a#top",
    );
  });
});

// D473 — an open focus view keeps `?node=` in the URL so the link can be shared.
describe("urlWithParam", () => {
  it("sets the node, keeping the other params and the hash", () => {
    expect(urlWithParam("https://app.test/c/x?tab=a#top", "node", "n1")).toBe("/c/x?tab=a&node=n1#top");
  });

  it("replaces a different node", () => {
    expect(urlWithParam("https://app.test/c/x?node=n1", "node", "n2")).toBe("/c/x?node=n2");
  });

  it("removes the node when the view closes", () => {
    expect(urlWithParam("https://app.test/c/x?node=n1&review=1", "node", null)).toBe("/c/x?review=1");
  });

  it("writes nothing when the URL already says it", () => {
    expect(urlWithParam("https://app.test/c/x?node=n1", "node", "n1")).toBeNull();
    expect(urlWithParam("https://app.test/c/x", "node", null)).toBeNull();
  });
});
