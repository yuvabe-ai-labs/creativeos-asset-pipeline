import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CopilotThinking } from "../copilot-thinking";

describe("CopilotThinking", () => {
  it("opens on 'Thinking of ideas' in the brand shimmer, inside the gradient pill", () => {
    const html = renderToStaticMarkup(<CopilotThinking />);
    expect(html).toContain("thinking-pill");
    expect(html).toMatch(/class="text-shimmer-brand[^"]*">Thinking of ideas…</);
  });

  it("gives screen readers one steady line, not the ticking glyph, verbs and seconds", () => {
    const html = renderToStaticMarkup(<CopilotThinking />);
    expect(html).toContain('<span class="sr-only">The copilot is thinking.</span>');
    expect(html.match(/aria-hidden="true"/g)?.length).toBe(2);
  });
});
