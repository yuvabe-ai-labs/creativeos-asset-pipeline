import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CopilotConfirmationCard } from "../copilot-confirmation-card";

const card = {
  title: "Navratri morning, and dosa is still on the menu.", reelNumber: 10,
  lines: [
    { label: "Format", value: "Founder-led", source: "given" as const },
    { label: "Home and kit", value: "Chennai home; Golu steps visible; everyday kitchen setting; South kitchen kit.", source: "proposed" as const },
  ],
  cast: [], toConfirm: [],
};

describe("the confirmation card's lines", () => {
  it("keeps a short line on one row and stacks a long one under its label", () => {
    const html = renderToStaticMarkup(<CopilotConfirmationCard card={card} avatars={[]} disabled={false} onWrite={() => {}} />);
    const rows = html.match(/<div data-line="[a-z]+"/g);
    expect(rows).toEqual(['<div data-line="inline"', '<div data-line="stacked"']);
  });

  it("names the linked avatar so two Jameses can't be confused, and says Lead once", () => {
    const avatars = [
      { id: "a2", name: "James", story: "", front: null, specific: false },
      { id: "a3", name: "James", story: "", front: "https://x/james.jpg", specific: true },
    ];
    const withCast = { ...card, cast: [{ name: "James", role: "lead", isLead: true, avatarId: "a3" }] };
    const html = renderToStaticMarkup(<CopilotConfirmationCard card={withCast} avatars={avatars} disabled={false} onWrite={() => {}} />);
    expect(html).toContain("James · Specific");
    expect(html).toContain('src="https://x/james.jpg"');
    expect(html.match(/lead/gi)?.length).toBe(1);
  });
});
