import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AssetChip } from "../asset-chip";

describe("AssetChip (D465: work in progress shows on the chip)", () => {
  it("says a plate is drawing after its popup closes", () => {
    const html = renderToStaticMarkup(
      <AssetChip kind="location" name="Chennai kitchen" thumbUrl={null} usedIn="S3" working="Drawing…"><li>card</li></AssetChip>,
    );
    expect(html).toContain("Drawing…");
    expect(html).toContain("animate-spin");
  });
});
