import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrandsCard } from "@/lib/journey/thread/schema";
import { ThreadBrandsCard } from "../thread-brands-card";

// D530 step 1: the list of brands the person reviews before anything is fetched.

const card: BrandsCard = {
  kind: "brands", status: "pending", focus: "monsoon hooks", jobId: null,
  brands: [
    { handle: "minimalist", name: "Minimalist", why: "Same buyer, same category.", group: "direct", keep: true },
    { handle: "deconstruct", name: "Deconstruct", why: "Same shelf.", group: "direct", keep: false },
    { handle: "sleepyowl", name: "Sleepy Owl", why: "The audience follows them.", group: "adjacent", keep: true },
  ],
};
const html = (c: BrandsCard) => renderToStaticMarkup(<ThreadBrandsCard id="m1" card={c} busy={false} onConfirm={() => {}} />);
const count = (s: string, needle: string) => s.split(needle).length - 1;

describe("ThreadBrandsCard", () => {
  it("shows both groups, each brand with its handle and reason, and a switch per brand", () => {
    const out = html(card);
    expect(out).toContain("Direct");
    expect(out).toContain("Adjacent");
    expect(out).toContain("@minimalist");
    expect(out).toContain("Same buyer, same category.");
    expect(count(out, 'role="switch"')).toBe(3);
  });

  it("offers to fetch the brands kept, counted", () => {
    expect(html(card)).toContain("Fetch their posts (2)");
  });

  it("has no controls once fetched, and says so", () => {
    const out = html({ ...card, status: "fetched" });
    expect(out).not.toContain('role="switch"');
    expect(out).not.toContain("Fetch their posts");
    expect(out).toContain("Posts brought in");
  });

  it("says it was replaced when stale", () => {
    expect(html({ ...card, status: "stale" })).toContain("Replaced by a newer list");
  });
});
