import { describe, it, expect, vi, beforeEach } from "vitest";

// The Auto captions task (trigger/editor-transcribe.ts): what settle needs is read before any audio
// is sent, so a failed read after ElevenLabs has billed can never refund that audio.
const m = vi.hoisted(() => ({
  getJob: vi.fn(),
  startJob: vi.fn(async () => undefined),
  failJob: vi.fn(async () => undefined),
  succeedJob: vi.fn(async () => undefined),
  runTranscription: vi.fn(),
  getGenerationForSettle: vi.fn(),
  getGeneration: vi.fn(),
  succeedGeneration: vi.fn(async () => undefined),
  failGeneration: vi.fn(async () => undefined),
  settleGeneration: vi.fn(async () => undefined),
  refundReservation: vi.fn(async () => undefined),
  // No price: settled at the reserved amount, so the catalog is never read for settings.
  pricingForGeneration: vi.fn(async () => ({ price: null, catalog: { models: [], prices: [], creditSettings: [] } })),
  reservedAmountForUnpriced: vi.fn(async () => 25),
}));

vi.mock("@trigger.dev/sdk", () => ({
  task: (config: unknown) => config,
  logger: { info: vi.fn() },
  AbortTaskRunError: class AbortTaskRunError extends Error {},
}));
vi.mock("@/lib/jobs/db", () => ({ getJob: m.getJob, startJob: m.startJob, failJob: m.failJob, succeedJob: m.succeedJob }));
vi.mock("@/lib/transcribe/run", () => ({ runTranscription: m.runTranscription }));
vi.mock("@/lib/transcribe/elevenlabs", () => ({ transcribeUrl: vi.fn() }));
vi.mock("@/lib/db/media-transcripts", () => ({ saveTranscript: vi.fn() }));
vi.mock("@/lib/db/generations", () => ({
  getGeneration: m.getGeneration,
  getGenerationForSettle: m.getGenerationForSettle,
  succeedGeneration: m.succeedGeneration,
  failGeneration: m.failGeneration,
}));
vi.mock("@/lib/db/credit-transactions", () => ({ settleGeneration: m.settleGeneration, refundReservation: m.refundReservation }));
vi.mock("@/lib/ai-models/run-price", () => ({ pricingForGeneration: m.pricingForGeneration }));
vi.mock("@/lib/generations/complete", () => ({ reservedAmountForUnpriced: m.reservedAmountForUnpriced }));

import { editorTranscribeTask } from "../../../../trigger/editor-transcribe";

const run = (editorTranscribeTask as unknown as { run: (p: { jobId: string }) => Promise<unknown> }).run;
const INPUT = { canvasId: "cv1", nodeId: "n1", generationId: "gen1", orgId: "org-1", files: [{ url: "https://s/a.mp4", seconds: 8 }] };
const GEN = { id: "gen1", org_id: "org-1", model_used: "elevenlabs:scribe_v2", model_price_id: "p1", created_at: "2026-11-22T00:00:00Z" };
const DONE = { result: { failed: [] }, secondsDone: 8, characterCost: 3, providerUsd: null };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ELEVEN_LABS_API_KEY = "k";
  m.getJob.mockResolvedValue({ id: "job1", input: INPUT });
  m.getGenerationForSettle.mockResolvedValue(GEN);
  m.getGeneration.mockResolvedValue(GEN);
  m.runTranscription.mockResolvedValue(DONE);
});

describe("editor-transcribe task", () => {
  it("reads what settle needs before any audio is transcribed", async () => {
    await run({ jobId: "job1" });
    expect(m.getGenerationForSettle).toHaveBeenCalledWith("gen1");
    expect(m.getGenerationForSettle.mock.invocationCallOrder[0]).toBeLessThan(m.runTranscription.mock.invocationCallOrder[0]);
    expect(m.getGeneration).not.toHaveBeenCalled();
    expect(m.settleGeneration).toHaveBeenCalledWith({ orgId: "org-1", generationId: "gen1", actualAmount: 25 });
  });

  it("sends no audio when that read fails, so nothing billed is refunded", async () => {
    m.getGenerationForSettle.mockRejectedValueOnce(new Error("db down"));
    await expect(run({ jobId: "job1" })).rejects.toThrow("db down");
    expect(m.runTranscription).not.toHaveBeenCalled();
  });
});
