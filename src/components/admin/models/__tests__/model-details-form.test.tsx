import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ModelDetailsForm } from "../model-details-form";

const base = {
  id: "fal:flux-pro",
  kind: "image",
  label: "Flux Pro",
  pickerLabel: null,
  providerLabel: "Fal",
  description: null,
  status: "draft",
  replacedBy: null,
  sortOrder: 10,
};

const props = {
  model: base,
  canGoLive: true,
  replacements: [{ id: "fal:flux-2", label: "Flux 2" }],
  updatedBy: "Priya",
  updatedAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
};

describe("ModelDetailsForm", () => {
  it("shows the no-code note when the model cannot go live", () => {
    const html = renderToStaticMarkup(<ModelDetailsForm {...props} canGoLive={false} />);
    expect(html).toContain("This build has no code to run this model, so it can&#x27;t go live.");
  });

  it("hides the note when the model can go live", () => {
    const html = renderToStaticMarkup(<ModelDetailsForm {...props} />);
    expect(html).not.toContain("no code to run this model");
  });

  it("renders the replacement select only when retired", () => {
    const draft = renderToStaticMarkup(<ModelDetailsForm {...props} />);
    expect(draft).not.toContain("No replacement");
    const retired = renderToStaticMarkup(
      <ModelDetailsForm {...props} model={{ ...base, status: "retired" }} />,
    );
    expect(retired).toContain("No replacement");
  });

  it("names a replacement that is no longer live", () => {
    const html = renderToStaticMarkup(
      <ModelDetailsForm
        {...props}
        model={{ ...base, status: "retired", replacedBy: "fal:flux-1" }}
        staleReplacement={{ id: "fal:flux-1", label: "Flux 1" }}
      />,
    );
    expect(html).toContain("Flux 1 (no longer live)");
  });

  it("shows who changed it last, with a relative time", () => {
    const html = renderToStaticMarkup(<ModelDetailsForm {...props} />);
    expect(html).toContain("Last changed by Priya");
    expect(html).toContain("2h ago");
  });

  it("starts with Save changes disabled", () => {
    const html = renderToStaticMarkup(<ModelDetailsForm {...props} />);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Save changes/);
  });

  it("sits in a card like the other sections", () => {
    expect(renderToStaticMarkup(<ModelDetailsForm {...props} />)).toMatch(/^<div data-slot="card"/);
  });

  it("keeps the eyebrow style on its field labels", () => {
    const html = renderToStaticMarkup(<ModelDetailsForm {...props} />);
    expect(html).toMatch(/<label[^>]*class="[^"]*text-eyebrow[^"]*"[^>]*for="model-label"/);
  });
});
