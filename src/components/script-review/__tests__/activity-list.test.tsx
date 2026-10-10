// src/components/script-review/__tests__/activity-list.test.tsx
import { describe, it, expect } from "vitest";
import type { ActivityLine } from "@/lib/script-review/types";
import { formatDayTime } from "@/lib/script-review/utils";
import { ActivityList } from "../activity-list";
import { renderInSurface, testSurface } from "./surface";

// Oldest first, as buildActivity returns them.
const lines: ActivityLine[] = [
  { id: "a", at: "2026-10-08T16:27:00Z", text: "Shared, version 1", links: [] },
  { id: "b", at: "2026-10-08T18:32:00Z", text: "Moved back to Visualise", links: [] },
  { id: "c", at: "2026-10-08T19:07:00Z", text: "S1 and S2 revised", links: [{ label: "S1", part: { kind: "shot", shotId: "s01" } }, { label: "S2", part: { kind: "shot", shotId: "s02" } }] },
  { id: "d", at: "2026-10-08T19:10:00Z", text: "Shared again, version 2", links: [] },
];

const render = (ls: ActivityLine[]) => renderInSurface(testSurface(), <ActivityList lines={ls} />);

describe("ActivityList (a timeline, latest on top, the rest in an accordion)", () => {
  it("shows the latest two events, the latest on top, and keeps the rest closed", () => {
    const html = render(lines);
    expect(html.indexOf("Shared again, version 2")).toBeLessThan(html.indexOf("S1 and S2 revised"));
    expect(html).not.toContain("Moved back to Visualise");
    expect(html).not.toContain("Shared, version 1");
  });

  it("opens the earlier events from an accordion trigger, closed at first", () => {
    const html = render(lines);
    expect(html).toContain('data-slot="accordion-trigger"');
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>2 earlier/);
  });

  it("has no accordion when there is nothing earlier", () => {
    expect(render(lines.slice(2))).not.toContain('data-slot="accordion"');
  });

  it("puts a dot on every shown event, joined by a rail that stops at the last", () => {
    const html = render(lines);
    const items = html.match(/<li[^>]*>/g)!;
    expect(items).toHaveLength(2);
    for (const li of items) {
      expect(li).toContain("before:w-px");
      expect(li).toContain("last:before:hidden");
    }
    expect(html.match(/data-dot=/g)).toHaveLength(2);
  });

  it("fills only the latest event's dot, the top one", () => {
    const html = render(lines);
    expect(html.match(/data-dot="latest"/g)).toHaveLength(1);
    expect(html.indexOf("data-dot=")).toBe(html.indexOf('data-dot="latest"'));
  });

  it("keeps each event's part links and its time", () => {
    const html = render(lines);
    expect(html).toMatch(/>S1<\/button>/);
    expect(html).toMatch(/>S2<\/button>/);
    expect(html).toContain(formatDayTime(lines[3].at));
    expect(html).toContain(formatDayTime(lines[2].at));
  });

  it("draws no timeline before anything has happened", () => {
    const html = render([]);
    expect(html).toContain("Nothing yet.");
    expect(html).not.toContain("data-dot=");
    expect(html).not.toContain('data-slot="accordion"');
  });
});
