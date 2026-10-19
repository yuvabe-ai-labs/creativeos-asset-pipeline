// src/components/scripts/__tests__/script-card.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { reelDoc } from "@/lib/script-review/__tests__/fixtures";

vi.mock("../delete-script-button", () => ({
  DeleteScriptButton: ({ block }: { block?: string | null }) => <span data-delete-block={String(block ?? "none")} />,
}));

import { ScriptCard } from "../script-card";

const script = {
  id: "s1", clientId: "c1", stage: "approved" as const, doc: reelDoc(),
  approvedAt: null, createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-19T00:00:00Z",
};

describe("ScriptCard (D384)", () => {
  it("offers delete with the script's block, beside the link rather than inside it", () => {
    const html = renderToStaticMarkup(<ScriptCard clientId="c1" script={script} href="/x" deleteBlock="shared" />);
    expect(html).toContain('href="/x"');
    expect(html).toContain('data-delete-block="shared"');
    const link = html.slice(html.indexOf("<a"), html.indexOf("</a>"));
    expect(link).not.toContain("data-delete-block");
  });

  it("keeps the client-feedback count above the stretched link, so its tooltip still shows", () => {
    const html = renderToStaticMarkup(<ScriptCard clientId="c1" script={script} href="/x" feedbackCount={2} />);
    expect(html).toMatch(/<div class="relative z-10[^"]*">(?:(?!<\/div>).)*Client feedback/);
  });

  it("offers a plain delete when nothing blocks it", () => {
    const html = renderToStaticMarkup(<ScriptCard clientId="c1" script={script} href="/x" />);
    expect(html).toContain('data-delete-block="none"');
  });
});
