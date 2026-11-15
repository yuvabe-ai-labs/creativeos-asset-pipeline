import { describe, expect, it } from "vitest";
import { rowToThreadMessage } from "../rows";

const base = { id: "m1", role: "assistant" as const, content: "Hi", created_at: "2026-11-13T00:00:00Z" };

describe("rowToThreadMessage", () => {
  it("reads a plain row", () => {
    expect(rowToThreadMessage({ ...base, card: null, attachments: [], suggestions: [] })).toEqual({
      id: "m1", role: "assistant", content: "Hi", card: null, attachments: [], suggestions: [], createdAt: "2026-11-13T00:00:00Z",
    });
  });

  it("keeps a valid card, attachments and suggestions", () => {
    const m = rowToThreadMessage({
      ...base,
      card: { kind: "status", lines: [{ text: "Read the website", state: "done" }] },
      attachments: [{ kind: "document", id: "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c11", name: "brand.pdf", url: null }],
      suggestions: ["Start the build"],
    });
    expect(m.card).toEqual({ kind: "status", lines: [{ text: "Read the website", state: "done" }] });
    expect(m.attachments).toHaveLength(1);
    expect(m.suggestions).toEqual(["Start the build"]);
  });

  it("drops a card or attachment it cannot read instead of throwing", () => {
    const m = rowToThreadMessage({ ...base, card: { kind: "from-the-future" }, attachments: [{ nope: true }], suggestions: "x" });
    expect(m.card).toBeNull();
    expect(m.attachments).toEqual([]);
    expect(m.suggestions).toEqual([]);
  });

  it("keeps the readable attachments when one of them is not", () => {
    const m = rowToThreadMessage({
      ...base, card: null, suggestions: [],
      attachments: [{ nope: true }, { kind: "image", id: "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c11", name: "hero.png", url: "https://x/y.png" }],
    });
    expect(m.attachments).toEqual([{ kind: "image", id: "0b7d7a0e-6a4f-4c0e-9a55-1f1f8f3a2c11", name: "hero.png", url: "https://x/y.png" }]);
  });
});
