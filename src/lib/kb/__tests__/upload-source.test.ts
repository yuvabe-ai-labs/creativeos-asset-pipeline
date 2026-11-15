import { describe, expect, it } from "vitest";
import { KB_DOC_PER_FILE_LIMIT_BYTES, KB_DOC_SIZE_LIMIT_BYTES, KB_IMG_SIZE_LIMIT_BYTES } from "../constants";
import { formatBytes } from "../utils";
import { checkSourceFile, sourceKindOf } from "../upload-source";

const KB = 1024;
const none = { document: 0, image: 0 };

describe("sourceKindOf", () => {
  it("reads the kind from the extension, whatever its case", () => {
    expect(sourceKindOf("a.PDF")).toBe("document");
    expect(sourceKindOf("notes.final.txt")).toBe("document");
    expect(sourceKindOf("b.webp")).toBe("image");
    expect(sourceKindOf("photo.JPEG")).toBe("image");
  });
  it("is null for anything the brand KB does not take", () => {
    expect(sourceKindOf("c.exe")).toBeNull();
    expect(sourceKindOf("noextension")).toBeNull();
  });
});

describe("checkSourceFile", () => {
  it("allows a file that fits", () => {
    expect(checkSourceFile({ name: "brand.pdf", size: 200 * KB }, none)).toBeNull();
    expect(checkSourceFile({ name: "hero.png", size: 4000 * KB }, none)).toBeNull();
  });

  it("refuses a kind it does not take, and says which it does", () => {
    expect(checkSourceFile({ name: "setup.exe", size: KB }, none))
      .toBe(".exe files are not supported. Documents: PDF, DOCX, PPTX, MD, TXT. Images: JPG, PNG, WEBP.");
  });

  it("refuses a document over the limit for one file", () => {
    expect(checkSourceFile({ name: "big.pdf", size: KB_DOC_PER_FILE_LIMIT_BYTES + 1 }, none))
      .toBe(`big.pdf is over the ${formatBytes(KB_DOC_PER_FILE_LIMIT_BYTES)} limit for one file.`);
  });

  it("refuses a document that would pass the total for documents", () => {
    expect(checkSourceFile({ name: "more.pdf", size: 500 * KB }, { document: KB_DOC_SIZE_LIMIT_BYTES - 100 * KB, image: 0 }))
      .toBe(`Adding more.pdf would pass the ${formatBytes(KB_DOC_SIZE_LIMIT_BYTES)} limit for documents.`);
  });

  it("checks an image against the image total, not the document total", () => {
    const fullOfDocuments = { document: KB_DOC_SIZE_LIMIT_BYTES, image: 0 };
    expect(checkSourceFile({ name: "hero.png", size: 500 * KB }, fullOfDocuments)).toBeNull();
    expect(checkSourceFile({ name: "hero.png", size: 500 * KB }, { document: 0, image: KB_IMG_SIZE_LIMIT_BYTES - 100 * KB }))
      .toBe(`Adding hero.png would pass the ${formatBytes(KB_IMG_SIZE_LIMIT_BYTES)} limit for images.`);
  });

  it("leaves the totals to the server when it is not told what is already used", () => {
    expect(checkSourceFile({ name: "brand.pdf", size: 200 * KB })).toBeNull();
  });
});
