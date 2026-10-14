import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@trigger.dev/sdk/v3", () => ({ tasks: { trigger: vi.fn() } }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn() }));
vi.mock("@/lib/storage", () => ({ removeObject: vi.fn() }));
vi.mock("@/lib/db/clients", () => ({ setKBStatus: vi.fn(), getClientById: vi.fn() }));
vi.mock("@/lib/db/kb-jobs", () => ({}));
// withAction is the impersonation write-gate; pass it through so these tests exercise the save.
vi.mock("@/lib/actions/with-action", () => ({
  withAction: (_name: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/lib/db/kb", () => ({
  getKBImageAnalysis: vi.fn(),
  saveKBOutputKeepingImageAnalysis: vi.fn(),
  setKBField: vi.fn(),
  deleteKBDocument: vi.fn(),
  deleteBrandImage: vi.fn(),
  listKBDocuments: vi.fn(),
  listBrandImages: vi.fn(),
}));
vi.mock("@/lib/db/image-cards", () => ({ setKBImageAnalysis: vi.fn() }));
vi.mock("@/lib/image-analysis/start", () => ({ startImageAnalysisQuietly: vi.fn() }));

import { getKBImageAnalysis, saveKBOutputKeepingImageAnalysis } from "@/lib/db/kb";
import { setKBImageAnalysis } from "@/lib/db/image-cards";
import { defaultEmptyImageAnalysis, type KBField, type KBFieldStatus, type TraceableBrandKB } from "@/lib/kb/schema";
import { saveKBOutputAction } from "./kb";

const field = <T,>(value: T, status: KBFieldStatus = "needs_review"): KBField<T> => ({ value, confidence: "high", evidence_type: "inferred", status });
const ia = (over: Record<string, KBField<unknown>>) => ({ ...defaultEmptyImageAnalysis(), ...over }) as TraceableBrandKB["image_analysis"];
const kb = (imageAnalysis: TraceableBrandKB["image_analysis"]) => ({ brand_profile: {}, image_analysis: imageAnalysis }) as unknown as TraceableBrandKB;

describe("saveKBOutputAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves every other section, and leaves Image Analysis alone when the draft did not change it", async () => {
    const stored = ia({ aesthetic: field("Clean") });
    vi.mocked(getKBImageAnalysis).mockResolvedValue(stored);
    await saveKBOutputAction("v-1", kb(stored));
    expect(saveKBOutputKeepingImageAnalysis).toHaveBeenCalledWith("v-1", kb(stored));
    expect(setKBImageAnalysis).not.toHaveBeenCalled();
  });

  it("never puts back an older analysis: a run's newer section stays, with the team's reviews on it", async () => {
    // The screen loaded "Clean"; a run has since written "Fresh". The team approved one field and edited another.
    vi.mocked(getKBImageAnalysis).mockResolvedValue(ia({ aesthetic: field("Fresh"), visual_mood: field("Calm"), subjects: field("Packs") }));
    const draft = ia({ aesthetic: field("Clean", "approved"), visual_mood: field("Calm", "approved"), subjects: field("Our words", "edited") });
    await saveKBOutputAction("v-1", kb(draft));
    const saved = vi.mocked(setKBImageAnalysis).mock.calls[0][1];
    expect(saved.aesthetic).toEqual(field("Fresh", "needs_review"));
    expect(saved.visual_mood).toEqual(field("Calm", "approved"));
    expect(saved.subjects).toEqual(field("Our words", "edited"));
  });
});
