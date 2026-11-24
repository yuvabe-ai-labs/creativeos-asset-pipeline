// D535 — migration 0080 is frozen history: the service prices as seeded. This pins what each row
// charges, so editing a seeded row (rather than adding a dated one) fails here.
import { describe, it, expect } from "vitest";
import {
  dubUsd, lipSyncUsd, voiceChangeEstimateUsd, voiceChangeCharge, transcribeEstimateUsd, transcribeCharge,
  promptFlatCredits, promptCharge,
} from "../service-price";
import { seededPrice } from "../test-prices";
import { videoChargeUsd } from "../video-price";
import { creditsFromUsd } from "@/lib/credits/units";
import { seededSettingsRow } from "../test-catalog";
import { DUB_MODEL_ID, LIP_SYNC_MODEL_ID, VOICE_CHANGE_PRICE_MODEL_ID, TRANSCRIBE_MODEL_ID, PROMPT_MODEL_ID } from "../service-models";

const SECONDS = [0.4, 1, 3, 9.6, 30, 61, 600];
const MULTIPLIERS = [1, 1.5, 2, 3];
const ATTACHMENTS = [0, 1, 2, 5];
const KLING = ["kling:kling-3-0", "kling:kling-o1", "kling:kling-3-0-omni"];
const credits = (usd: number | null) => (usd === null ? null : creditsFromUsd(usd, seededSettingsRow()));

describe("frozen service prices (0080)", () => {
  it("pins every service price", () => {
    const out: Record<string, unknown> = {};
    for (const s of SECONDS) {
      out[`dub ${s}s`] = { usd: dubUsd(seededPrice(DUB_MODEL_ID), s), credits: credits(dubUsd(seededPrice(DUB_MODEL_ID), s)) };
      out[`lipsync ${s}s`] = { usd: lipSyncUsd(seededPrice(LIP_SYNC_MODEL_ID), s), credits: credits(lipSyncUsd(seededPrice(LIP_SYNC_MODEL_ID), s)) };
      const t = transcribeEstimateUsd(seededPrice(TRANSCRIBE_MODEL_ID), s);
      out[`transcribe estimate ${s}s`] = { usd: t, credits: credits(t) };
      for (const m of MULTIPLIERS) {
        const v = voiceChangeEstimateUsd(seededPrice(VOICE_CHANGE_PRICE_MODEL_ID), s, m);
        out[`voice estimate ${s}s x${m}`] = { usd: v, credits: credits(v) };
        const c = voiceChangeCharge(seededPrice(VOICE_CHANGE_PRICE_MODEL_ID), { characterCost: null, seconds: s, priceMultiplier: m });
        out[`voice fallback ${s}s x${m}`] = c && { usd: c.usd, credits: credits(c.usd), bill: c.bill };
      }
    }
    for (const credit of [1, 3, 8, 17]) {
      const c = transcribeCharge(seededPrice(TRANSCRIBE_MODEL_ID), { providerCredits: credit, providerUsd: null, seconds: 60 });
      out[`transcribe charge ${credit} credits`] = c && { usd: c.usd, credits: credits(c.usd), bill: c.bill };
      const v = voiceChangeCharge(seededPrice(VOICE_CHANGE_PRICE_MODEL_ID), { characterCost: credit, seconds: 60, priceMultiplier: 1 });
      out[`voice charge ${credit} credits`] = v && { usd: v.usd, credits: credits(v.usd), bill: v.bill };
    }
    const usage = { prompt_tokens: 8606, completion_tokens: 160, total_tokens: 8766 };
    for (const n of ATTACHMENTS) {
      const p = seededPrice(PROMPT_MODEL_ID);
      const c = promptCharge(p, usage, n);
      out[`prompt ${n} attachments`] = { credits: promptFlatCredits(p, n), usd: c?.usd, recordedUsd: c?.recordedUsd, bill: c?.bill };
    }
    const at = new Date("2026-11-24T00:00:00Z");
    for (const id of KLING) {
      const price = seededPrice(id, at);
      out[`${id} lines`] = price.lines;
      out[`${id} 6.4 units`] = videoChargeUsd(price, { usage: { kind: "kling", units: 6.4 }, durationSeconds: 8, audioEnabled: false, resolution: "720p" });
      out[`${id} no units`] = videoChargeUsd(price, { usage: null, durationSeconds: 8, audioEnabled: true, resolution: "1080p" });
    }
    expect(out).toMatchSnapshot();
  });
  it("charges lip sync 7.2 s 600 credits, not the float figure 605", () => {
    expect(credits(lipSyncUsd(seededPrice(LIP_SYNC_MODEL_ID), 7.2))).toBe(600);
  });
});
