import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildKlingFalRequest, splitKlingShots, toFalImageTags, falTier, FAL_SHOT_MAX_CHARS } from "../providers/kling-fal";
import { renderPlan, type MultishotPlan } from "@/lib/nodes/multishot-plan";
import { multishotCapabilityFor } from "@/lib/nodes/multishot-models";
import type { VoLine } from "@/lib/nodes/reel-script";
import { KLING_OMNI_MODEL_ID } from "../client-models";
import { withRequestLines } from "../request-prompt";
import { NO_ON_SCREEN_TEXT_LINE, SPEECH_TIMING, SHORT_SOUND_LINE_MAX_CHARS, shortSoundLine } from "../compose-omni-prompt";

const NEG = "warped label, flicker";

describe("falTier — resolution is the endpoint on fal", () => {
  it("maps 720p/1080p/4k to standard/pro/4k, and anything else to standard", () => {
    expect(falTier("720p")).toBe("standard");
    expect(falTier("1080p")).toBe("pro");
    expect(falTier("4k")).toBe("4k");
    expect(falTier(undefined)).toBe("standard");
    expect(falTier("8k")).toBe("standard");
  });
});

describe("toFalImageTags (Q7)", () => {
  it("rewrites Kling's @image_N to fal's @ImageN, multi-digit included", () => {
    expect(toFalImageTags("@image_1 meets @image_10")).toBe("@Image1 meets @Image10");
  });

  it("shifts the numbering when a start frame takes image 1", () => {
    expect(toFalImageTags("@image_1 and @image_2", 1)).toBe("@Image2 and @Image3");
  });
});

describe("Kling 3.0 on fal", () => {
  it("sends frames, audio, duration and the real negative_prompt to the v3 endpoint for the tier", () => {
    const req = buildKlingFalRequest("kling-3-0", {
      prompt: "a bottle turns",
      startFrameUrl: "https://x.test/s.png",
      endFrameUrl: "https://x.test/e.png",
      referenceUrls: [],
      params: { resolution: "1080p", duration: 7, audio: "native", negative_prompt: NEG },
    });
    expect(req.endpoint).toBe("fal-ai/kling-video/v3/pro/image-to-video");
    expect(req.body).toEqual({
      prompt: "a bottle turns",
      start_image_url: "https://x.test/s.png",
      end_image_url: "https://x.test/e.png",
      duration: "7",
      generate_audio: true,
      negative_prompt: NEG,
    });
    expect(req.durationSeconds).toBe(7);
  });

  it("sends generate_audio false explicitly, since fal's v3 default is on", () => {
    const req = buildKlingFalRequest("kling-3-0", {
      prompt: "p", startFrameUrl: "https://x.test/s.png", referenceUrls: [], params: { audio: "off" },
    });
    expect(req.body.generate_audio).toBe(false);
    expect(req.body).not.toHaveProperty("negative_prompt");
  });

  it("refuses a request with no start frame before anything is sent", () => {
    expect(() => buildKlingFalRequest("kling-3-0", { prompt: "p", referenceUrls: [], params: {} })).toThrow(/start frame/);
  });
});

describe("Kling 3.0 Omni on fal", () => {
  it("uses O3 reference-to-video with frames and references together, tags converted, Avoid line added (Q2)", () => {
    const req = buildKlingFalRequest("kling-3-0-omni", {
      prompt: "@image_1 is placed on the counter",
      startFrameUrl: "https://x.test/s.png",
      endFrameUrl: "https://x.test/e.png",
      referenceUrls: ["https://x.test/r1.png"],
      params: { resolution: "4k", duration: 5, audio: "off", negative_prompt: NEG, aspect_ratio: "1:1" },
    });
    expect(req.endpoint).toBe("fal-ai/kling-video/o3/4k/reference-to-video");
    expect(req.body).toEqual({
      prompt: "@Image1 is placed on the counter\n\nAvoid: warped label, flicker.",
      start_image_url: "https://x.test/s.png",
      end_image_url: "https://x.test/e.png",
      image_urls: ["https://x.test/r1.png"],
      duration: "5",
      generate_audio: false,
    });
    // O3 has no negative-prompt field; a start frame sets the ratio (OM8).
    expect(req.body).not.toHaveProperty("negative_prompt");
    expect(req.body).not.toHaveProperty("aspect_ratio");
  });

  it("sends aspect_ratio on the references-only path", () => {
    const req = buildKlingFalRequest("kling-3-0-omni", {
      prompt: "p", referenceUrls: ["https://x.test/r1.png"], params: { aspect_ratio: "9:16" },
    });
    expect(req.body.aspect_ratio).toBe("9:16");
    expect(req.body).not.toHaveProperty("start_image_url");
  });

  it("asks fal to choose its own cuts only for a node saved with multi_shot on", () => {
    const on = buildKlingFalRequest("kling-3-0-omni", { prompt: "p", referenceUrls: ["r"], params: { multi_shot: true } });
    const off = buildKlingFalRequest("kling-3-0-omni", { prompt: "p", referenceUrls: ["r"], params: {} });
    expect(on.body.shot_type).toBe("intelligent");
    expect(off.body).not.toHaveProperty("shot_type");
  });
});

describe("Kling O1 on fal (Q1)", () => {
  it("frames only → O1 image-to-video, with no audio or resolution fields", () => {
    const req = buildKlingFalRequest("kling-o1", {
      prompt: "a cat walks",
      startFrameUrl: "https://x.test/s.png",
      endFrameUrl: "https://x.test/e.png",
      referenceUrls: [],
      params: { duration: "10", resolution: "720p", audio: "native", negative_prompt: NEG },
    });
    expect(req.endpoint).toBe("fal-ai/kling-video/o1/image-to-video");
    expect(req.body).toEqual({
      prompt: "a cat walks\n\nAvoid: warped label, flicker.",
      start_image_url: "https://x.test/s.png",
      end_image_url: "https://x.test/e.png",
      duration: "10",
    });
  });

  it("references only → O1 reference-to-video with the aspect ratio", () => {
    const req = buildKlingFalRequest("kling-o1", {
      prompt: "@image_1 on a shelf", referenceUrls: ["https://x.test/r1.png"], params: { aspect_ratio: "9:16" },
    });
    expect(req.endpoint).toBe("fal-ai/kling-video/o1/reference-to-video");
    expect(req.body).toEqual({
      prompt: "@Image1 on a shelf",
      image_urls: ["https://x.test/r1.png"],
      duration: "5",
      aspect_ratio: "9:16",
    });
  });

  it("start frame + references → the start frame rides as @Image1 and every handle moves up one", () => {
    const req = buildKlingFalRequest("kling-o1", {
      prompt: "@image_1 slides in",
      startFrameUrl: "https://x.test/s.png",
      referenceUrls: ["https://x.test/r1.png", "https://x.test/r2.png"],
      params: {},
    });
    expect(req.endpoint).toBe("fal-ai/kling-video/o1/reference-to-video");
    expect(req.body.image_urls).toEqual(["https://x.test/s.png", "https://x.test/r1.png", "https://x.test/r2.png"]);
    expect(req.body.prompt).toBe("Take @Image1 as the start frame.\n\n@Image2 slides in");
  });

  it("refuses end frame + references, which neither O1 endpoint can carry", () => {
    expect(() =>
      buildKlingFalRequest("kling-o1", {
        prompt: "p", startFrameUrl: "s", endFrameUrl: "e", referenceUrls: ["r"], params: {},
      }),
    ).toThrow(/end frame together with reference images/);
  });

  // fal's live O1 validator: "Duration only support 5 or 10 seconds when no refer image" (422,
  // staging, a 6 s start-frame request), though its page lists 3–10.
  it("sends only 5 or 10 s; any other saved value becomes 5, before it can earn fal's 422", () => {
    const at = (duration: unknown, referenceUrls: string[] = []) =>
      buildKlingFalRequest("kling-o1", { prompt: "p", startFrameUrl: "s", referenceUrls, params: { duration } });
    expect(at("10").body.duration).toBe("10");
    expect(at(5).body.duration).toBe("5");
    for (const saved of [6, 3, 8, 15, "abc", undefined]) expect(at(saved).body.duration).toBe("5");
    expect(at(6, ["r"]).body.duration).toBe("5");
    expect(at(6).durationSeconds).toBe(5);
  });
});

// ── Multishot (Q5, Q6) ────────────────────────────────────────────────────────

const KLING = multishotCapabilityFor(KLING_OMNI_MODEL_ID);
const cuts = [
  { id: "c1", text: "", seconds: 3 },
  { id: "c2", text: "", seconds: 4 },
  { id: "c3", text: "", seconds: 3 },
];
const plan: MultishotPlan = {
  version: 1,
  look: "Warm morning light, soft film look.",
  beats: [
    { cutId: "c1", text: "Close-up of the bottle on marble." },
    { cutId: "c2", text: "A hand picks up the bottle, slowly." },
    { cutId: "c3", text: "The bottle turns to face camera." },
  ],
};

/** The prompt exactly as the route hands it to the provider: request lines, then the ladder. */
function sentPrompt(vo?: VoLine[]): string {
  return withRequestLines(renderPlan(plan, cuts, KLING, [], vo), { provider: "kling", rolesLine: "" });
}

describe("shortSoundLine", () => {
  it("SHORT_SOUND_LINE_MAX_CHARS is the longest form, which the node's per-shot budget reserves", () => {
    const forms = [
      'Voiceover, off-screen: "a" and Mia says on camera: "b"',
      'Mia says on camera: "b"',
      'Voiceover, off-screen: "a"',
      "no lines",
    ].map(shortSoundLine);
    expect(Math.max(...forms.map((f) => f.length))).toBe(SHORT_SOUND_LINE_MAX_CHARS);
  });
});

describe("splitKlingShots", () => {
  it("returns null for a prompt that is not a ladder", () => {
    expect(splitKlingShots("a bottle on a counter")).toBeNull();
  });

  it("returns null rather than dropping text that follows the ladder", () => {
    expect(splitKlingShots("shot 1, 3, a;\nshot 2, 2, b;\nand then something else")).toBeNull();
  });

  it("splits the prompt the Multishot lane really sends into a shared lead and its shots", () => {
    const split = splitKlingShots(sentPrompt())!;
    expect(split.shots).toEqual([
      { seconds: 3, text: "Close-up of the bottle on marble." },
      { seconds: 4, text: "A hand picks up the bottle, slowly." },
      { seconds: 3, text: "The bottle turns to face camera." },
    ]);
    // The request lines are rebuilt short per shot, so only the operator's look is kept as-is.
    expect(split.look).toEqual(["Warm morning light, soft film look."]);
    expect(split.voiceover).toBeUndefined();
    expect(split.roles).toBeUndefined();
  });
});

describe("Multishot on fal → multi_prompt", () => {
  it("sends one entry per shot with its own length; every shot gets the short rules line and the look", () => {
    const req = buildKlingFalRequest("kling-3-0-omni", {
      prompt: sentPrompt(), referenceUrls: ["r"], params: { duration: 99, negative_prompt: NEG },
    });
    const shots = req.body.multi_prompt as Array<{ prompt: string; duration: string }>;
    expect(req.body).not.toHaveProperty("prompt");
    expect(req.body.shot_type).toBe("customize");
    expect(shots.map((s) => s.duration)).toEqual(["3", "4", "3"]);
    for (const shot of shots) {
      expect(shot.prompt.startsWith(`${NO_ON_SCREEN_TEXT_LINE} Ambience and foley only. Nobody speaks. No music.`)).toBe(true);
      expect(shot.prompt).toContain("Warm morning light, soft film look.");
      // fal's 512-per-shot cap: the full sound clause and the Avoid line are not sent in a shot list.
      expect(shot.prompt).not.toContain("Sound design:");
      expect(shot.prompt).not.toContain("Avoid:");
      expect(shot.prompt.length).toBeLessThanOrEqual(FAL_SHOT_MAX_CHARS);
    }
    expect(shots[1].prompt.endsWith("A hand picks up the bottle, slowly.")).toBe(true);
    // The ladder's own total is the clip's length (and what settlement charges), not the param.
    expect(req.body.duration).toBe("10");
    expect(req.durationSeconds).toBe(10);
  });

  it("puts the sequence voiceover in the first shot only, so it is not spoken once per shot", () => {
    const vo: VoLine[] = [{ text: "Made for mornings.", speaker: "narrator" }];
    const req = buildKlingFalRequest("kling-3-0-omni", { prompt: sentPrompt(vo), referenceUrls: ["r"], params: {} });
    const shots = req.body.multi_prompt as Array<{ prompt: string }>;
    expect(shots[0].prompt).toContain("Made for mornings.");
    // The short introduction carries the timing, so the separate timing sentence is not repeated.
    expect(shots[0].prompt).toContain("Spoken in order over the whole clip (0-10s), starting in the first second, done by 10s:");
    expect(shots[0].prompt).not.toContain("Spoken over the whole sequence");
    expect(shots.some((s) => s.prompt.includes(SPEECH_TIMING))).toBe(false);
    expect(shots[1].prompt).not.toContain("Made for mornings.");
    expect(shots[2].prompt).not.toContain("Made for mornings.");
    // Every shot is told who speaks, in the short form.
    for (const shot of shots) expect(shot.prompt).toContain("Only the voiceover is spoken, off-screen.");
  });

  // run_06gs9nlrridfqnv47hblj0rra2 (staging copy, 10 Nov 2026): fal's 422 on shot 1. As sent by
  // the first option-2 build it was still 575 characters; it must now fit.
  it("fits the real two-shot voiceover prompt that fal rejected", () => {
    const prompt = withRequestLines(
      [
        'Spoken over the whole sequence (0-4s), starting in the first second and finished before 4s, in order: Voiceover, off-screen: "I know who likes it less salty, who skips breakfast, who wants the roti softer."',
        "shot 1, 2, Sunita stirs dal in the warm home kitchen, standing at the stove beside a pot, with Aman helping nearby as written, in a steady medium shot from the storyboard;\nshot 2, 2, Sunita checks a grocery list in the home kitchen, holding the list at the counter in a closer shot from the storyboard, while Aman helps as written.;",
      ].join("\n\n"),
      { provider: "kling", rolesLine: "" },
    );
    const req = buildKlingFalRequest("kling-3-0-omni", { prompt, referenceUrls: ["r"], params: {} });
    const shots = req.body.multi_prompt as Array<{ prompt: string }>;
    expect(shots).toHaveLength(2);
    for (const shot of shots) expect(shot.prompt.length).toBeLessThanOrEqual(FAL_SHOT_MAX_CHARS);
    expect(shots[0].prompt).toContain("who wants the roti softer.");
  });

  it("puts the roles line in the first shot, and drops it when that shot would not fit", () => {
    const roles = "Reference roles: @image_1 is the product, a glass bottle.";
    const ok = buildKlingFalRequest("kling-3-0-omni", { prompt: `${roles}\n\n${sentPrompt()}`, referenceUrls: ["r"], params: {} });
    const okShots = ok.body.multi_prompt as Array<{ prompt: string }>;
    expect(okShots[0].prompt).toContain("Reference roles: @Image1 is the product");
    expect(okShots[1].prompt).not.toContain("Reference roles:");

    const longRoles = `Reference roles: @image_1 is ${"x".repeat(420)}.`;
    const dropped = buildKlingFalRequest("kling-3-0-omni", { prompt: `${longRoles}\n\n${sentPrompt()}`, referenceUrls: ["r"], params: {} });
    expect((dropped.body.multi_prompt as Array<{ prompt: string }>)[0].prompt).not.toContain("Reference roles:");
  });

  it("refuses a shot that still does not fit before anything is submitted, naming the shot", () => {
    const long = "shot 1, 3, a;\nshot 2, 3, " + "y".repeat(500) + ";";
    expect(() => buildKlingFalRequest("kling-3-0-omni", { prompt: long, referenceUrls: ["r"], params: {} })).toThrow(
      /Shot 2 is \d+ characters .* allows 512 per shot/,
    );
  });

  it("is not applied to O1, which has no shot list on fal", () => {
    const req = buildKlingFalRequest("kling-o1", { prompt: sentPrompt(), startFrameUrl: "s", referenceUrls: [], params: {} });
    expect(req.body).not.toHaveProperty("multi_prompt");
  });
});

// ── Transport: submit, poll, collect ─────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);
const QUEUE = "https://queue.fal.run";
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

function mockFal(...queue: unknown[]) {
  const pending = [...queue];
  mockFetch.mockImplementation(async (url: string) => {
    // Image downloads (the shape fitter) answer 404: an image whose bytes cannot be had is
    // forwarded as its URL, untouched — see kling-provider.test.ts.
    if (!String(url).startsWith(QUEUE)) return { ok: false, status: 404 };
    if (pending.length === 0) throw new Error(`Unexpected fal call: ${url}`);
    return pending.shift();
  });
}

const falCalls = () => mockFetch.mock.calls.filter((c) => String(c[0]).startsWith(QUEUE));

describe("Kling generate goes through fal by default (D484)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    process.env.FAL_KEY = "fk";
    delete process.env.KLING_TRANSPORT;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.FAL_KEY;
  });

  it("submits to fal, polls until completed, and returns the video with the requested length", async () => {
    mockFal(
      json({ request_id: "req1", status_url: `${QUEUE}/fal-ai/kling-video/requests/req1/status`, response_url: `${QUEUE}/fal-ai/kling-video/requests/req1` }),
      json({ status: "IN_PROGRESS" }),
      json({ status: "COMPLETED" }),
      json({ video: { url: "https://fal.media/out.mp4" } }),
    );
    const { kling30Omni } = await import("../providers/kling");
    const done = kling30Omni.generate({
      prompt: "p", startFrameUrl: "https://x.test/s.png", referenceUrls: [], params: { duration: 6, resolution: "1080p" },
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(done).resolves.toEqual({ videoUrl: "https://fal.media/out.mp4", durationSeconds: 6 });

    const [submitUrl, submitInit] = falCalls()[0] as [string, RequestInit];
    expect(submitUrl).toBe(`${QUEUE}/fal-ai/kling-video/o3/pro/reference-to-video`);
    expect((submitInit.headers as Record<string, string>).Authorization).toBe("Key fk");
    // Status and result use the URLs fal returned, never ones we build.
    expect(falCalls()[1][0]).toBe(`${QUEUE}/fal-ai/kling-video/requests/req1/status`);
    expect(falCalls()[3][0]).toBe(`${QUEUE}/fal-ai/kling-video/requests/req1`);
  });

  it("rides out a failed status check without resubmitting the paid job", async () => {
    mockFal(
      json({ request_id: "req2", status_url: `${QUEUE}/s`, response_url: `${QUEUE}/r` }),
      json({ detail: "busy" }, 503),
      json({ status: "COMPLETED" }),
      json({ video: { url: "https://fal.media/out.mp4" } }),
    );
    const { kling30 } = await import("../providers/kling");
    const done = kling30.generate({ prompt: "p", startFrameUrl: "https://x.test/s.png", referenceUrls: [], params: {} });
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(done).resolves.toMatchObject({ videoUrl: "https://fal.media/out.mp4" });
    const submits = falCalls().filter((c) => (c[1] as RequestInit | undefined)?.method === "POST");
    expect(submits).toHaveLength(1);
  });

  it("reports fal's own reason when the job failed", async () => {
    mockFal(
      json({ request_id: "req3", status_url: `${QUEUE}/s`, response_url: `${QUEUE}/r` }),
      json({ status: "COMPLETED" }),
      json({ detail: "content policy violation" }, 422),
    );
    const { kling30 } = await import("../providers/kling");
    const done = kling30.generate({ prompt: "p", startFrameUrl: "https://x.test/s.png", referenceUrls: [], params: {} });
    const settled = expect(done).rejects.toThrow(/Kling generation failed: .*content policy violation/);
    await vi.advanceTimersByTimeAsync(10_000);
    await settled;
  });
});
