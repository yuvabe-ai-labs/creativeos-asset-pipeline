// src/components/ui/__tests__/accordion.test.tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../accordion";

const openPanel = () =>
  renderToStaticMarkup(
    <Accordion defaultValue={["a"]}>
      <AccordionItem value="a">
        <AccordionTrigger>Earlier</AccordionTrigger>
        <AccordionContent>Inside</AccordionContent>
      </AccordionItem>
    </Accordion>,
  ).match(/<div[^>]*data-slot="accordion-content"[^>]*>/)![0];

describe("AccordionContent (motion)", () => {
  it("grows from Base UI's own panel height, not keyframes that end at height: auto", () => {
    const panel = openPanel();
    expect(panel).toContain("h-(--accordion-panel-height)");
    expect(panel).toContain("transition-[height]");
    expect(panel).toContain("data-starting-style:h-0");
    expect(panel).toContain("data-ending-style:h-0");
    expect(panel).not.toContain("animate-accordion");
  });

  it("opens gradually on the house ease-out and closes fast", () => {
    const panel = openPanel();
    expect(panel).toContain("ease-[cubic-bezier(0.22,1,0.36,1)]");
    expect(panel).toContain("duration-320");
    expect(panel).toContain("data-ending-style:duration-200");
    expect(panel).toContain("motion-reduce:transition-none");
  });
});
