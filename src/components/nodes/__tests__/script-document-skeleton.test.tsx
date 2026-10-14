import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ScriptDocumentSkeleton } from "../script-document-skeleton";

describe("ScriptDocumentSkeleton", () => {
  it("says Parsing script… on a first parse, and keeps its re-read wording otherwise", () => {
    expect(renderToStaticMarkup(<ScriptDocumentSkeleton />)).toContain("Parsing script…");
    expect(renderToStaticMarkup(<ScriptDocumentSkeleton reextracting />)).toContain("Reading the script again…");
  });
});
