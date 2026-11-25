import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SignalDraftCard } from "@/lib/journey/thread/schema";
import { ThreadSignalDraftCard } from "../thread-signal-draft-card";

// D530 step 3: a drafted signal the person keeps, edits or drops.

const card: SignalDraftCard = {
  kind: "signal-draft", status: "pending", name: "Monsoon rituals", tags: ["monsoon", "routine"],
  description: "Reels open on rain at a window.", itemIds: ["i1", "i2"],
  thumbs: [{ itemId: "i1", url: "https://cdn/1.jpg", handle: "minimalist" }, { itemId: "i2", url: null, handle: "sleepyowl" }],
  signalId: null,
};
const html = (c: SignalDraftCard) => renderToStaticMarkup(<ThreadSignalDraftCard id="m1" card={c} busy={false} onDecide={() => {}} />);

describe("ThreadSignalDraftCard", () => {
  it("shows the name, tags, description and the posts behind it", () => {
    const out = html(card);
    expect(out).toContain("Monsoon rituals");
    expect(out).toContain("monsoon");
    expect(out).toContain("Reels open on rain at a window.");
    expect(out).toContain("https://cdn/1.jpg");
    expect(out).toContain("@sleepyowl");
  });

  it("offers keep, edit and drop while pending", () => {
    const out = html(card);
    expect(out).toContain(">Keep<");
    expect(out).toContain(">Edit<");
    expect(out).toContain(">Drop<");
  });

  it("says it was kept, with no controls", () => {
    const out = html({ ...card, status: "kept", signalId: "s1" });
    expect(out).toContain("Kept as a signal");
    expect(out).not.toContain(">Drop<");
  });

  it("says it was dropped", () => {
    expect(html({ ...card, status: "dropped" })).toContain("Dropped");
  });
});
