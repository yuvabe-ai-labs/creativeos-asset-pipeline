import { describe, it, expect } from "vitest";

// Mirrors the calculation logic from image-gen-usage-popover.tsx
function computeStats(versions: Array<{ paramsUsed?: { tokensUsed?: { total_tokens: number } | null; modelId?: string } | null; modelUsed?: string | null; createdAt: string }>) {
  let totalUsd = 0;
  let counted = 0;
  const perGen: { vNum: number; hasData: boolean }[] = [];

  const ordered = [...versions].reverse();
  ordered.forEach((v, i) => {
    const tokens = v.paramsUsed?.tokensUsed ?? null;
    const hasData = !!tokens;
    perGen.push({ vNum: i + 1, hasData });
    if (hasData) {
      counted++;
      totalUsd += 0.01; // mock cost
    }
  });

  return { counted, perGenLength: perGen.length, totalUsd };
}

describe("usage popover calculation", () => {
  it("shows all versions even when some have no token data", () => {
    const versions = [
      { paramsUsed: { tokensUsed: { total_tokens: 100 }, modelId: "openai:gpt-image-2" }, createdAt: "2026-01-01T00:00:00Z" },
      { paramsUsed: null, createdAt: "2026-01-02T00:00:00Z" },
      { paramsUsed: { tokensUsed: { total_tokens: 200 }, modelId: "openai:gpt-image-2" }, createdAt: "2026-01-03T00:00:00Z" },
    ];
    const { counted, perGenLength } = computeStats(versions);
    expect(perGenLength).toBe(3); // all 3 shown
    expect(counted).toBe(2);      // only 2 have cost data
  });

  it("counted === 0 only when truly no versions exist", () => {
    const { counted, perGenLength } = computeStats([]);
    expect(counted).toBe(0);
    expect(perGenLength).toBe(0);
  });
});
