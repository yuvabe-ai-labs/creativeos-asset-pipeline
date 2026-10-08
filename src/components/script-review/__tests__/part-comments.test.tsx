import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScriptView } from "@/components/scripts/script-view";
import { partKey } from "@/lib/script-review/parts";
import { buildThreads, placeThreads } from "@/lib/script-review/threads";
import type { Part, ScriptComment } from "@/lib/script-review/types";
import { comment, reelDoc } from "@/lib/script-review/__tests__/fixtures";
import { PartComments } from "../part-comments";
import { ReviewSurfaceProvider, type ReviewSurface } from "../review-surface-context";

const SHOT: Part = { kind: "shot", shotId: "s04" };
const FRONT: Part = { kind: "view", castId: "meenakshi", view: "front" };

function surface(comments: ScriptComment[], commentable: Part[]): ReviewSurface {
  const doc = reelDoc();
  return {
    mode: "client",
    doc,
    placed: placeThreads(buildThreads(comments), doc, {}),
    commentable: new Map(commentable.map((p) => [partKey(p), p])),
    onPost: async () => {},
    focus: null,
    openPart: () => {},
    clearFocus: () => {},
    columnOpen: false,
    setColumnOpen: () => {},
  };
}

const render = (value: ReviewSurface, node: React.ReactNode) =>
  renderToStaticMarkup(<ReviewSurfaceProvider value={value}>{node}</ReviewSurfaceProvider>);

describe("PartComments marker (design canvas, 8 Oct)", () => {
  it("marks a commented part and counts its threads in the client-feedback chip", () => {
    const html = render(surface([comment({ part: SHOT }), comment({ id: "c2", part: SHOT })], [SHOT]), <PartComments part={SHOT} />);
    expect(html).toContain("data-part-commented");
    expect(html).toContain("bg-client/15");
    expect(html).toContain("2 comments");
  });

  it("leaves an uncommented part unmarked", () => {
    const html = render(surface([], [SHOT]), <PartComments part={SHOT} />);
    expect(html).not.toContain("data-part-commented");
    expect(html).toContain("Comment");
  });
});

describe("PartComments compact (avatar views)", () => {
  it("shows the caption and an icon-only comment button named for the view", () => {
    const html = render(surface([], [FRONT]), <PartComments part={FRONT} compact={{ caption: "Front", actionLabel: "Comment on the Front view" }} />);
    expect(html).toContain(">Front<");
    expect(html).toContain('aria-label="Comment on the Front view"');
    expect(html).not.toContain(">Comment<");
  });

  it("keeps the caption when the view cannot take a comment", () => {
    const html = render(surface([], []), <PartComments part={FRONT} compact={{ caption: "Front", actionLabel: "Comment on the Front view" }} />);
    expect(html).toContain(">Front<");
    expect(html).not.toContain("aria-label=");
  });
});

describe("the context slot sits inside the context card", () => {
  it("renders the context slot within the card's section, so the card can show it is commented", () => {
    const html = renderToStaticMarkup(
      <ScriptView script={{ doc: reelDoc(), stage: "in_review" }} avatarFaces={{}} slots={{ context: <span data-slot-test="context" /> }} />,
    );
    const card = html.slice(html.indexOf('id="script-context"'), html.indexOf("</section>"));
    expect(card).toContain('data-slot-test="context"');
  });
});
