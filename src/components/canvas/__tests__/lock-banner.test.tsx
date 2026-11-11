import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LockBanner } from "../lock-banner";

describe("LockBanner", () => {
  it("says the canvas is view only, with no take-over, for someone who can't edit it", () => {
    const html = renderToStaticMarkup(<LockBanner viewOnly heldByName={null} canTakeOver={false} onTakeOver={() => {}} />);
    expect(html).toContain("You can view this canvas. Editing is turned off for you.");
    expect(html).not.toContain("Take over editing");
  });

  it("keeps the take-over banner for an editor whose canvas someone else holds", () => {
    const html = renderToStaticMarkup(<LockBanner heldByName="Priya" canTakeOver onTakeOver={() => {}} />);
    expect(html).toContain("Priya is editing");
    expect(html).toContain("Take over editing");
  });
});
