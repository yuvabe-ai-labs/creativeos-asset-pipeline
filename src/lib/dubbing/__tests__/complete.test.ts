import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
import { completeDubGeneration, completeLipSyncGeneration, type CompleteDeps } from "../complete";
import { seededPrice } from "@/lib/ai-models/test-prices";
import { dubUsd, lipSyncUsd } from "@/lib/ai-models/service-price";
import { DUB_MODEL_ID, LIP_SYNC_MODEL_ID } from "@/lib/ai-models/service-models";
import { usdToFinalCredits } from "@/lib/credits/units";

const OWN = (p: string) => `https://storage.googleapis.com/bucket/${p}`;
const DUB = { sourceNodeId: "vg", sourceVersionId: "sv", sourceUrl: OWN("src.mp4"), srcLang: "en-IN", targetLang: "hi-IN", durationSeconds: 8, provider: "sarvam", model: "sarvam-dub" };
const gen = (over: Record<string, unknown> = {}) => ({ id: "g1", org_id: "org", user_id: "u", node_id: "n1", type: "dub", model_used: "sarvam:dub", inputs_snapshot: { dub: DUB }, params_snapshot: {}, status: "running", ...over }) as never;

let deps: CompleteDeps;
beforeEach(() => {
  deps = {
    insertVersion: vi.fn(async () => ({ id: "ver-1" })),
    setActiveVersion: vi.fn(async () => undefined),
    getVersionById: vi.fn(),
    updateVersionOutputAndInputs: vi.fn(async () => undefined),
    settleGeneration: vi.fn(async () => undefined),
    succeedGeneration: vi.fn(async () => undefined),
    failAndRefund: vi.fn(async () => undefined),
    isOwnStoredUrl: (u: string) => u.startsWith("https://storage.googleapis.com/bucket/"),
    priceFor: vi.fn(async (g: { model_used: string | null }) => (g.model_used ? seededPrice(g.model_used) : null)),
    reservedFor: vi.fn(async () => 77),
    now: () => "2026-10-15T00:00:00.000Z",
  } as unknown as CompleteDeps;
});

describe("completeDubGeneration", () => {
  it("inserts an active version holding original + dubbed, and settles the dub cost", async () => {
    await completeDubGeneration("n1", gen(), { generationId: "g1", status: "succeeded", kind: "dub", stored: true, dubbedUrl: OWN("d.mp4"), dubbedAudioUrl: OWN("d.mp3"), durationSeconds: 8, vendorJobId: "dub_1" }, deps);
    expect(deps.insertVersion).toHaveBeenCalledWith(expect.objectContaining({
      nodeId: "n1", operatorUserId: "u", modelUsed: "sarvam:dub",
      output: { language: "hi-IN", original: OWN("src.mp4"), dubbed: OWN("d.mp4"), dubbedAudio: OWN("d.mp3"), lipSynced: null },
      inputsUsed: { dub: { ...DUB, vendorJobId: "dub_1" } },
      paramsUsed: { durationSeconds: 8 },
    }));
    const usd = dubUsd(seededPrice(DUB_MODEL_ID), 8)!;
    expect(deps.settleGeneration).toHaveBeenCalledWith({ orgId: "org", generationId: "g1", actualAmount: usdToFinalCredits(usd) });
    expect(deps.setActiveVersion).toHaveBeenCalledWith("n1", "ver-1");
    expect(deps.succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({ versionId: "ver-1", creditsCharged: usdToFinalCredits(usd), costUsd: usd, providerBill: { source: "request", meters: { audio_second: 8 } } }));
  });

  it("settles a delivered dub at the reserved amount when its price is missing", async () => {
    (deps.priceFor as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await completeDubGeneration("n1", gen(), { generationId: "g1", status: "succeeded", kind: "dub", stored: true, dubbedUrl: OWN("d.mp4"), dubbedAudioUrl: OWN("d.mp3"), durationSeconds: 8, vendorJobId: "dub_1" }, deps);
    expect(deps.reservedFor).toHaveBeenCalledWith("g1", expect.anything(), "dub");
    expect(deps.settleGeneration).toHaveBeenCalledWith({ orgId: "org", generationId: "g1", actualAmount: 77 });
    expect(deps.setActiveVersion).toHaveBeenCalledWith("n1", "ver-1");
    const call = (deps.succeedGeneration as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.costUsd).toBeUndefined();
    expect(call.creditsCharged).toBe(77);
  });

  it("fails and refunds a result stored outside our bucket or a missing record", async () => {
    await completeDubGeneration("n1", gen(), { generationId: "g1", status: "succeeded", kind: "dub", stored: true, dubbedUrl: "https://evil/d.mp4", dubbedAudioUrl: OWN("d.mp3"), durationSeconds: 8, vendorJobId: "x" }, deps);
    await completeDubGeneration("n1", gen({ inputs_snapshot: {} }), { generationId: "g1", status: "succeeded", kind: "dub", stored: true, dubbedUrl: OWN("d.mp4"), dubbedAudioUrl: OWN("d.mp3"), durationSeconds: 8, vendorJobId: "x" }, deps);
    expect(deps.failAndRefund).toHaveBeenCalledTimes(2);
    expect(deps.insertVersion).not.toHaveBeenCalled();
  });
});

describe("completeLipSyncGeneration", () => {
  const VERSION = { id: "ver-1", node_id: "n1", output: { language: "hi-IN", original: OWN("o.mp4"), dubbed: OWN("d.mp4"), dubbedAudio: OWN("d.mp3"), lipSynced: OWN("old.mp4") }, inputs_used: { dub: DUB, lipSync: { versionId: "ver-1", provider: "fal", model: "lipsync-2-pro", runs: 1 } } };
  const lgen = gen({ type: "lipsync", model_used: "fal:lipsync-2-pro", inputs_snapshot: { lipSync: { versionId: "ver-1", provider: "fal", model: "lipsync-2-pro", runs: 0 } } });

  it("overrides the version's lipSynced, counts the run and settles against that version", async () => {
    (deps.getVersionById as ReturnType<typeof vi.fn>).mockResolvedValue(VERSION);
    await completeLipSyncGeneration("n1", lgen, { generationId: "g1", status: "succeeded", kind: "lipsync", stored: true, videoUrl: OWN("new.mp4"), durationSeconds: 8, vendorRequestId: "r9" }, deps);
    expect(deps.updateVersionOutputAndInputs).toHaveBeenCalledWith(
      "ver-1",
      { ...VERSION.output, lipSynced: OWN("new.mp4") },
      { dub: DUB, lipSync: { versionId: "ver-1", provider: "fal", model: "lipsync-2-pro", runs: 2, lastRanAt: "2026-10-15T00:00:00.000Z", vendorRequestId: "r9" } },
    );
    expect(deps.insertVersion).not.toHaveBeenCalled();
    expect(deps.succeedGeneration).toHaveBeenCalledWith(expect.objectContaining({ versionId: "ver-1", creditsCharged: usdToFinalCredits(lipSyncUsd(seededPrice(LIP_SYNC_MODEL_ID), 8)!), costUsd: lipSyncUsd(seededPrice(LIP_SYNC_MODEL_ID), 8), providerBill: { source: "request", meters: { video_second: 8 } } }));
  });

  it("settles a delivered lip sync at the reserved amount when its price is missing", async () => {
    (deps.getVersionById as ReturnType<typeof vi.fn>).mockResolvedValue(VERSION);
    (deps.priceFor as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await completeLipSyncGeneration("n1", lgen, { generationId: "g1", status: "succeeded", kind: "lipsync", stored: true, videoUrl: OWN("new.mp4"), durationSeconds: 8, vendorRequestId: "r9" }, deps);
    expect(deps.reservedFor).toHaveBeenCalledWith("g1", expect.anything(), "lipsync");
    expect(deps.settleGeneration).toHaveBeenCalledWith({ orgId: "org", generationId: "g1", actualAmount: 77 });
    expect(deps.updateVersionOutputAndInputs).toHaveBeenCalled();
    const call = (deps.succeedGeneration as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.costUsd).toBeUndefined();
  });

  it("fails and refunds when the target version is gone or not a dub", async () => {
    (deps.getVersionById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await completeLipSyncGeneration("n1", lgen, { generationId: "g1", status: "succeeded", kind: "lipsync", stored: true, videoUrl: OWN("new.mp4"), durationSeconds: 8, vendorRequestId: "r" }, deps);
    expect(deps.failAndRefund).toHaveBeenCalled();
    expect(deps.updateVersionOutputAndInputs).not.toHaveBeenCalled();
  });
});
