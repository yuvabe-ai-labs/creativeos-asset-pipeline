import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { seededModelCatalog } from "@/lib/ai-models/test-catalog";
import { imageModelsFrom, videoModelsFrom } from "@/lib/ai-models/model-lists";
import type { UsageRow } from "../usage-popover-shell";
import type { ImageGenVersionSummary } from "../image-gen-version-history";
import type { VideoGenVersionSummary } from "../video-gen-version-history";

// Never a model id in the UI: every label comes from the catalog, and a model it doesn't hold shows none.
const state = vi.hoisted(() => ({ usageRows: [] as UsageRow[], versionRows: [] as Array<{ summary?: string }> }));
vi.mock("@/hooks/queries/ai-models", async (orig) => ({
  ...(await orig<typeof import("@/hooks/queries/ai-models")>()),
  useImageModels: () => imageModelsFrom(seededModelCatalog()),
  useVideoModels: () => videoModelsFrom(seededModelCatalog()),
}));
vi.mock("@/hooks/use-node-cost", () => ({ useNodeCost: () => null }));
vi.mock("../usage-popover-shell", () => ({
  UsagePopoverShell: ({ rows }: { rows: UsageRow[] }) => {
    state.usageRows = rows;
    return null;
  },
}));
vi.mock("../version-list", () => ({
  VersionList: ({ rows }: { rows: Array<{ summary?: string }> }) => {
    state.versionRows = rows;
    return null;
  },
}));

import { ImageGenVersionHistory } from "../image-gen-version-history";
import { VideoGenUsagePopover } from "../video-gen-usage-popover";
import { VideoGenRequestPanel } from "../video-gen-request-panel";

const NANO_PRO = "gemini:gemini-3-pro-image";
const KLING = "kling:kling-3-0";
const UNKNOWN = "acme:secret-model-9";

beforeEach(() => {
  state.usageRows = [];
  state.versionRows = [];
});

describe("ImageGenVersionHistory model line", () => {
  const version = (modelUsed: string) =>
    ({ id: `v-${modelUsed}`, output: "https://x/a.png", error: null, modelUsed, createdAt: "2026-11-23T00:00:00Z" }) as unknown as ImageGenVersionSummary;

  it("names the model by its catalog label, and an unknown model not at all", () => {
    renderToStaticMarkup(
      <ImageGenVersionHistory versions={[version(NANO_PRO), version(UNKNOWN)]} activeVersionId={null} viewedVersionId={null} onView={() => {}} />,
    );
    expect(state.versionRows[0].summary).toBe(imageModelsFrom(seededModelCatalog()).get(NANO_PRO)!.label);
    expect(state.versionRows[1].summary).toBeUndefined();
  });
});

describe("VideoGenUsagePopover model label", () => {
  const version = (id: string, modelUsed: string) =>
    ({ id, output: "https://x/v.mp4", error: null, modelUsed, paramsUsed: { durationSeconds: 5 }, createdAt: "2026-11-23T00:00:00Z" }) as unknown as VideoGenVersionSummary;

  it("names the model by its catalog label, and an unknown model not at all", () => {
    renderToStaticMarkup(<VideoGenUsagePopover nodeId="n1" versions={[version("b", UNKNOWN), version("a", KLING)]} />);
    const meta = state.usageRows.map((r) => r.meta ?? "");
    expect(meta[1]).toContain(videoModelsFrom(seededModelCatalog()).get(KLING)!.label);
    expect(meta.join(" ")).not.toContain("kling-3-0");
    expect(meta.join(" ")).not.toContain("secret-model");
  });
});

describe("VideoGenRequestPanel model row", () => {
  const version = (modelUsed: string) =>
    ({ id: "v1", output: "https://x/v.mp4", error: null, modelUsed, paramsUsed: { mode: "pro" }, inputsUsed: { prompt: "p" }, createdAt: "2026-11-23T00:00:00Z" }) as unknown as VideoGenVersionSummary;

  it("names a catalog model by its label", () => {
    const html = renderToStaticMarkup(<VideoGenRequestPanel version={version(KLING)} labelById={new Map()} />);
    expect(html).toContain(videoModelsFrom(seededModelCatalog()).get(KLING)!.label);
  });

  it("shows an unknown model's settings by their raw names, with no model label and no id", () => {
    const html = renderToStaticMarkup(<VideoGenRequestPanel version={version(UNKNOWN)} labelById={new Map()} />);
    expect(html).not.toContain("secret-model");
    expect(html).not.toContain(videoModelsFrom(seededModelCatalog()).specOrDefault(UNKNOWN).label);
    expect(html).toMatch(/>Mode</);
  });
});
