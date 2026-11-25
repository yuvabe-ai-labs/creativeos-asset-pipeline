import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorAutoCaptionsButton } from "../editor-auto-captions-button";

// D558 - the button waits for the model's price row; this stands in for the page's captions run.
const ctx = vi.hoisted(() => ({
  cost: { credits: 4 as number | null, free: false },
  priceLoading: false,
  priceError: false,
}));
vi.mock("../auto-captions-context", () => ({
  useAutoCaptionsContext: () => ({
    cost: () => ctx.cost,
    priceLoading: ctx.priceLoading,
    priceError: ctx.priceError,
    start: vi.fn(),
    listening: new Set<string>(),
    todo: ["p1"],
  }),
}));
vi.mock("../editor-store-provider", () => ({
  useEditorStore: (sel: (s: unknown) => unknown) => sel({ editable: true, doc: { pieces: [{ id: "p1" }] } }),
}));

function render(): { disabled: boolean; title: string | null } {
  const html = renderToStaticMarkup(<EditorAutoCaptionsButton />);
  const attrs = /<button\b([^>]*)>/.exec(html)?.[1] ?? "";
  return { disabled: /\sdisabled(=|\s|$)/.test(attrs), title: /title="([^"]*)"/.exec(attrs)?.[1].replace(/&#x27;/g, "'") ?? null };
}
function withState(over: Partial<typeof ctx.cost> & { loading?: boolean; error?: boolean }) {
  ctx.cost = { credits: over.credits === undefined ? 4 : over.credits, free: over.free ?? false };
  ctx.priceLoading = over.loading ?? false;
  ctx.priceError = over.error ?? false;
  return render();
}

describe("EditorAutoCaptionsButton price gate", () => {
  it("is disabled while the price loads", () => {
    expect(withState({ credits: null, loading: true }).disabled).toBe(true);
  });
  it("is disabled with a plain reason when there is no price row", () => {
    const r = withState({ credits: null });
    expect(r.disabled).toBe(true);
    expect(r.title).toBe("No price set for this model");
  });
  it("says the price could not be loaded, not that there is none, when the catalog read failed", () => {
    const r = withState({ credits: null, error: true });
    expect(r.disabled).toBe(true);
    expect(r.title).toBe("Couldn't load the price. Try again.");
  });
  it("is enabled once priced", () => {
    const r = withState({ credits: 4 });
    expect(r.disabled).toBe(false);
    expect(r.title).toBeNull();
  });
  it("stays enabled for a free run", () => {
    expect(withState({ credits: 0, free: true }).disabled).toBe(false);
  });
});
