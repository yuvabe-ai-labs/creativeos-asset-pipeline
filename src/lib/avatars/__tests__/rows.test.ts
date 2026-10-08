import { describe, it, expect } from "vitest";
import { patchToRow, rowToAvatar, generationToCandidate, generationToImage, type AvatarRow } from "../rows";
import { makeAvatar, makeImage, makeViews } from "./fixtures";
import type { GenerationRow } from "@/lib/db/types";

const row: AvatarRow = {
  id: "a1", client_id: "c1", name: "Riya", story: "",
  person_type: "specific",
  likeness_consent_by: "user-1", likeness_consent_at: "2026-09-30T10:05:00.000Z",
  front: makeImage(), sheet: makeImage(), sheet_stale: false, sheet_views: null,
  voice: null, voice_sample: null, status: "ready", archived_at: null,
  created_at: "2026-09-30T10:00:00.000Z", updated_at: "2026-09-30T10:05:00.000Z",
};

describe("rowToAvatar", () => {
  it("maps snake_case columns to the domain shape", () => {
    expect(rowToAvatar(row)).toEqual(makeAvatar());
  });
});

describe("patchToRow", () => {
  it("writes only the keys the patch carries, under their column names", () => {
    expect(patchToRow({ name: "Meera", sheetStale: true })).toEqual({ name: "Meera", sheet_stale: true });
  });

  it("keeps an explicit null, for personType", () => {
    expect(patchToRow({ personType: null })).toEqual({ person_type: null });
  });

  it("keeps explicit nulls for the consent fields", () => {
    expect(patchToRow({ likenessConsentBy: null, likenessConsentAt: null })).toEqual({
      likeness_consent_by: null, likeness_consent_at: null,
    });
  });
});

const gen = (over: Partial<GenerationRow> = {}): GenerationRow => ({
  id: "g1", node_id: null, avatar_id: "a1", org_id: "org-1", client_id: "c1",
  type: "image", status: "succeeded", provider_job_id: null,
  model_used: "seedream:seedream-5-0-lite",
  params_snapshot: { aspect_ratio: "3:4" },
  inputs_snapshot: { slot: "front", prompt: "A chef.", batchId: "b1", referenceUrls: [] },
  output_snapshot: "https://storage.googleapis.com/b/clients/c1/avatars/a1/generated/front/x.png",
  tokens_used: null, cost_usd: 0.035, credits_charged: 35, version_id: null, user_id: "user-1",
  error: null, meta: { width: 1536, height: 2048, sizeBytes: 900 },
  created_at: "2026-09-30T10:00:00.000Z", updated_at: "2026-09-30T10:00:20.000Z",
  ...over,
});

describe("generationToImage", () => {
  it("builds an image whose source says how it was generated", () => {
    expect(generationToImage(gen())).toEqual({
      url: "https://storage.googleapis.com/b/clients/c1/avatars/a1/generated/front/x.png",
      width: 1536, height: 2048, sizeBytes: 900,
      source: {
        kind: "generated", modelId: "seedream:seedream-5-0-lite", mode: "text", prompt: "A chef.",
        generatedAt: "2026-09-30T10:00:00.000Z", generationId: "g1", untouched: true,
      },
    });
  });

  it("marks an image made from references as an edit", () => {
    const row = gen({ inputs_snapshot: { slot: "sheet", prompt: "p", batchId: null, referenceUrls: ["u"] } });
    expect(generationToImage(row)?.source).toMatchObject({ mode: "edit" });
  });

  it("is null for a failed or still-running generation", () => {
    expect(generationToImage(gen({ status: "failed", output_snapshot: null }))).toBeNull();
    expect(generationToImage(gen({ status: "running", output_snapshot: null }))).toBeNull();
  });
});

describe("generationToCandidate", () => {
  it("maps a succeeded front generation", () => {
    expect(generationToCandidate(gen())).toEqual({
      generationId: "g1", batchId: "b1",
      url: "https://storage.googleapis.com/b/clients/c1/avatars/a1/generated/front/x.png",
      modelId: "seedream:seedream-5-0-lite", createdAt: "2026-09-30T10:00:00.000Z",
      width: 1536, height: 2048, sizeBytes: 900,
    });
  });

  it("is null for a sheet generation and for a failed one", () => {
    const sheet = gen({ inputs_snapshot: { slot: "sheet", prompt: "p", batchId: null, referenceUrls: ["u"] } });
    expect(generationToCandidate(sheet)).toBeNull();
    expect(generationToCandidate(gen({ status: "failed", output_snapshot: null }))).toBeNull();
  });
});

describe("sheet views (D339)", () => {
  it("maps sheet_views both ways", () => {
    const views = makeViews();
    expect(rowToAvatar({ ...row, sheet_views: views }).sheetViews).toEqual(views);
    expect(patchToRow({ sheetViews: null })).toEqual({ sheet_views: null });
  });

  it("reads a row from before the column existed as no views", () => {
    const older: Partial<AvatarRow> = { ...row };
    delete older.sheet_views;
    expect(rowToAvatar(older as AvatarRow).sheetViews).toBeNull();
  });
});
