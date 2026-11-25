import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { documentInput } from "../document-input";

describe("documentInput", () => {
  it("names each file before it, so the model can say which document a value came from", async () => {
    const content = await documentInput([{ filename: "guide.pdf", file_ext: "pdf", storage_url: "https://cdn/guide.pdf" }]);
    expect(content).toEqual([
      { type: "input_text", text: "Document: guide.pdf" },
      { type: "input_file", file_url: "https://cdn/guide.pdf" },
    ]);
  });
});
