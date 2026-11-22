import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  serviceModelRows, SERVICE_SEED_HEADER, DUB_MODEL_ID, LIP_SYNC_MODEL_ID,
  VOICE_CHANGE_PRICE_MODEL_ID, TRANSCRIBE_MODEL_ID, PROMPT_MODEL_ID,
  NO_PRICE_REASON, PRICE_LOAD_FAILED_REASON, priceUnavailableReason,
} from "../service-models";
import { seedSql, SEED_JSON_TAG } from "../seed";
import { parseAiModelRow } from "../schema";
import { DUB_ENGINE, LIP_SYNC_ENGINE } from "@/lib/dubbing/providers";
import { TRANSCRIBE_ENGINE } from "@/lib/transcribe/providers";
import { VOICE_CHANGE_MODEL_ID } from "@/lib/elevenlabs/constants";

const FILE = resolve(process.cwd(), "supabase/migrations/0079_ai_service_models.sql");

describe("service models", () => {
  it("are the ids the routes record", () => {
    expect(DUB_MODEL_ID).toBe(DUB_ENGINE.modelUsed);
    expect(LIP_SYNC_MODEL_ID).toBe(LIP_SYNC_ENGINE.modelUsed);
    expect(TRANSCRIBE_MODEL_ID).toBe(TRANSCRIBE_ENGINE.modelUsed);
    expect(VOICE_CHANGE_PRICE_MODEL_ID).toBe(`elevenlabs:${VOICE_CHANGE_MODEL_ID}`);
    expect(PROMPT_MODEL_ID).toBe("openai:gpt-5.4-mini");
  });

  it("pass the catalog's row check, one per id, all live", () => {
    const rows = serviceModelRows();
    expect(rows.map((r) => r.id).sort()).toEqual(
      [DUB_MODEL_ID, LIP_SYNC_MODEL_ID, VOICE_CHANGE_PRICE_MODEL_ID, TRANSCRIBE_MODEL_ID, PROMPT_MODEL_ID].sort(),
    );
    for (const row of rows) {
      const parsed = parseAiModelRow({ ...row, description: null, provider_model_id: null, updated_at: "2026-11-23T00:00:00Z" });
      expect(parsed, row.id).not.toBeNull();
      expect(parsed!.status).toBe("live");
    }
  });
});

describe("migration 0079 (service models)", () => {
  it("matches serviceModelRows", () => {
    const rows = serviceModelRows();
    if (process.env.UPDATE_SEED === "1") writeFileSync(FILE, seedSql(rows, SERVICE_SEED_HEADER));
    expect(existsSync(FILE), "run with UPDATE_SEED=1 to write it").toBe(true);
    const sql = readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");
    expect(sql).toBe(seedSql(rows, SERVICE_SEED_HEADER));
    const json = sql.slice(sql.indexOf(SEED_JSON_TAG) + SEED_JSON_TAG.length, sql.lastIndexOf(SEED_JSON_TAG));
    expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(rows)));
  });
});

describe("priceUnavailableReason", () => {
  it("says nothing while the price loads or once it is priced", () => {
    expect(priceUnavailableReason({ loading: true, error: false }, false)).toBeNull();
    expect(priceUnavailableReason({ loading: false, error: false }, true)).toBeNull();
  });
  it("tells a failed catalog read apart from a model with no price", () => {
    expect(priceUnavailableReason({ loading: false, error: true }, false)).toBe(PRICE_LOAD_FAILED_REASON);
    expect(PRICE_LOAD_FAILED_REASON).toBe("Couldn't load the price. Try again.");
    expect(priceUnavailableReason({ loading: false, error: false }, false)).toBe(NO_PRICE_REASON);
  });
});
