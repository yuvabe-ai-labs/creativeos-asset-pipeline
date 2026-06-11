#!/usr/bin/env node
// Seeds the e2e test fixtures expected by tests/e2e/*.spec.ts into the
// Supabase project pointed to by NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
//
// Idempotent: re-running resets each fixture client/canvas to a known state,
// so it's safe to run before every CI test run.
//
// Slugs created here map to the TEST_*_SLUG env vars documented in the spec
// file headers — see the printout at the end of this script.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Slugs (map to TEST_*_SLUG env vars — see printout below) ─────────────────

const PENDING_SLUG = "e2e-pending-client";
const REVIEW_SLUG = "e2e-review-client";
const EDIT_SLUG = "e2e-edit-client";
const READY_SLUG = "e2e-ready-client";
const CANVAS_SLUG = "e2e-canvas";

// ── KB field helpers ──────────────────────────────────────────────────────────

function field(value, confidence = "high", status = "needs_review") {
  return { value, confidence, evidence_type: "explicit", status };
}

function buildBrandKB() {
  return {
    brand: field("Verdant & Co", "high", "approved"),
    brand_profile: {
      brand_name: field("Verdant & Co", "high", "approved"),
      tagline: field("Rooted in nature, made for you"),
      positioning: field("Plant-based skincare for mindful, eco-conscious adults"),
      mission: field("To make sustainable skincare accessible to everyone"),
      personality: field(["warm", "earthy", "honest"]),
      tone_of_voice: field("Calm, conversational, and grounded"),
      industry: field("beauty"),
    },
    visual_identity: {
      aesthetic: field("Warm earthy minimalism"),
      photography_style: field("Natural light lifestyle photography"),
      colour_palette_primary: field(["Deep Forest Green #1B4332", "Soft Cream #F5F0E6"]),
      colour_palette_secondary: field(["Clay Brown #A47148", "Sage #87A96B"], "medium"),
      colour_palette_avoid: field(["Neon Pink #FF00FF"], "low"),
      surface_palette: field(["linen", "raw wood", "stone"], "medium"),
      lighting: field("Golden hour, natural diffused"),
      visual_mood: field("Calm and grounded"),
      visual_benchmark: field(["Aesop", "Glossier"], "low"),
      typography_style: field("Clean serif headings, minimal sans body"),
    },
    target_audience: {
      age_range: field("25-40"),
      gender: field("unisex"),
      location: field("Urban, English-speaking markets"),
      lifestyle: field("Health-conscious, sustainability-minded professionals"),
      pain_points: field(["Sensitive skin", "Distrust of synthetic ingredients"], "medium"),
      desires: field(["Visible results", "Clean ingredient lists"]),
      human_casting: field(
        "Adults 25-40, natural skin texture, soft warm lighting, relaxed expressions",
        "medium"
      ),
    },
    creative_direction: {
      image: {
        shot_style: field("Macro and lifestyle"),
        composition: field("Negative space, rule of thirds"),
        environment: field("In-home, natural settings"),
        subjects: field("Product with hands, ingredients close-up"),
        feel: field("Tactile, serene"),
      },
      video: {
        motion_style: field("Subtle drift", "medium"),
        camera_movement: field("Slow pan, static hold", "medium"),
        transition_style: field("Soft dissolve", "medium"),
        atmosphere: field("Meditative calm"),
        pacing: field("Slow and breath-like", "medium"),
        text_system: field("INTRO: hook / BODY: one idea / OUTRO: product + CTA", "low"),
        music_direction: field("Acoustic, warm, low tempo", "low"),
      },
    },
    compliance: {
      preferred_verbs: field(["nourishes", "supports", "restores"]),
      preferred_phrases: field(["clean ingredients", "made with intention"]),
      never_use_words: field(["heals", "cures", "miracle"]),
      never_use_claims: field(["clinically proven to cure", "guaranteed results"]),
      never_use_tone: field(["aggressive urgency", "hype language"]),
      disclaimers: field(["Results may vary", "Patch test recommended"], "medium"),
    },
    image_analysis: {
      dominant_colors: field(["Deep Forest Green #1B4332", "Soft Cream #F5F0E6"], "medium"),
      visual_mood: field("Calm and earthy", "medium"),
      aesthetic: field("Minimal, natural", "medium"),
      subjects: field("Product, ingredients, hands", "medium"),
      composition_style: field("Flat lay, close crop", "medium"),
      lighting_character: field("Soft natural light", "medium"),
      brand_consistency_notes: field("Consistent warm, earthy palette across all images", "low"),
    },
  };
}

// ── Reel script (pre-parsed, seeded as the script node's active version) ────────

function buildReelScript() {
  return {
    title: "E2E Script — A",
    type: "reel",
    duration: "30s",
    schedule: {
      date: "2026-06-15",
      post_time: "09:00",
      category: "Educational",
      theme: "Morning skincare routine",
    },
    strategic_objective:
      "Drive awareness of Verdant & Co's plant-based skincare routine and grow profile visits from eco-conscious adults.",
    ai_production_type: "UGC-style talking head with macro product inserts",
    visual_script: {
      shots: [
        {
          description: "Talent picks up the cleanser bottle in soft morning light, smiling at camera.",
          duration: "4s",
        },
        {
          description: "Macro shot of cleanser foam being worked into damp skin.",
          duration: "3s",
        },
        {
          description: "Talent applies serum with a calm, deliberate motion, product label visible.",
          duration: "4s",
        },
      ],
      execution_refinement: "Keep tones warm and earthy; avoid harsh studio lighting.",
    },
    on_screen_text: {
      intro: "Your skin deserves better.",
      body: [
        "Step 1: Cleanse with plant-based actives",
        "Step 2: Hydrate with our nourishing serum",
      ],
      outro: "Verdant & Co — rooted in nature.",
    },
    voiceover:
      "Start your morning the way nature intended — gentle, plant-based skincare that actually works.",
    music_sound: "Soft acoustic guitar, warm and low tempo, fading in on the first shot.",
    caption:
      "Rooted in nature, made for you. Discover the Verdant & Co morning routine. #cleanbeauty #skincare",
    cta: "Shop the routine — link in bio",
    thumbnail_hook: "Your 30-second morning reset",
    qc_notes: [
      "Confirm product labels are legible in macro shots",
      "Check brand colour palette consistency across all shots",
    ],
    product_links: ["https://verdantandco.example/products/cleanser"],
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function upsertClient(slug, name, kbStatus) {
  const { data: existing, error: selectError } = await supabase
    .from("clients")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    const { error } = await supabase
      .from("clients")
      .update({ kb_status: kbStatus, active_kb_version_id: null })
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({ slug, name, kb_status: kbStatus })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

// Deletes existing KB versions, inserts a fresh one, and points the client at it.
async function resetClientKB(clientId, kbStatus) {
  const { error: delError } = await supabase
    .from("client_kb_versions")
    .delete()
    .eq("client_id", clientId);
  if (delError) throw delError;

  const { data, error } = await supabase
    .from("client_kb_versions")
    .insert({
      client_id: clientId,
      output: buildBrandKB(),
      model_used: "seed-script",
      doc_ids_used: [],
      fill_rate: 0.86,
      note: "Seeded for e2e tests",
    })
    .select("id, created_at")
    .single();
  if (error) throw error;

  const { error: updateError } = await supabase
    .from("clients")
    .update({ active_kb_version_id: data.id, kb_status: kbStatus })
    .eq("id", clientId);
  if (updateError) throw updateError;

  return data;
}

// Deletes existing canvases for the client and creates a fresh one with a
// kb node + script node + edge between them.
async function resetCanvas(clientId, clientSlug, kbVersion) {
  const { error: delError } = await supabase
    .from("canvases")
    .delete()
    .eq("client_id", clientId);
  if (delError) throw delError;

  const { data: canvas, error: canvasError } = await supabase
    .from("canvases")
    .insert({ client_id: clientId, slug: CANVAS_SLUG, name: "E2E Canvas" })
    .select("id")
    .single();
  if (canvasError) throw canvasError;

  const kb = buildBrandKB();
  const kbNodeId = crypto.randomUUID();
  const scriptNodeId = crypto.randomUUID();

  const { error: nodesError } = await supabase.from("nodes").insert([
    {
      id: kbNodeId,
      canvas_id: canvas.id,
      type: "kb",
      position: { x: 80, y: 120 },
      data: {
        clientId,
        clientSlug,
        kbVersionId: kbVersion.id,
        brandName: kb.brand?.value ?? null,
        fillRate: 0.86,
        extractedAt: kbVersion.created_at,
      },
    },
    {
      id: scriptNodeId,
      canvas_id: canvas.id,
      type: "script",
      position: { x: 360, y: 120 },
      data: { title: "E2E Script" },
    },
  ]);
  if (nodesError) throw nodesError;

  const { error: edgeError } = await supabase.from("edges").insert({
    id: crypto.randomUUID(),
    canvas_id: canvas.id,
    source_node_id: kbNodeId,
    target_node_id: scriptNodeId,
  });
  if (edgeError) throw edgeError;

  // Seed a pre-parsed script as the active version so the script node opens
  // straight into the "parsed" editor view (skips the upload/extract step).
  const { data: scriptVersion, error: versionError } = await supabase
    .from("node_versions")
    .insert({
      node_id: scriptNodeId,
      output: buildReelScript(),
      model_used: "seed-script",
      inputs_used: {},
      params_used: {},
    })
    .select("id")
    .single();
  if (versionError) throw versionError;

  const { error: activeError } = await supabase
    .from("nodes")
    .update({ active_version_id: scriptVersion.id })
    .eq("id", scriptNodeId);
  if (activeError) throw activeError;
}

// ── Seed ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding e2e fixtures...");

  await upsertClient(PENDING_SLUG, "E2E Pending Client", "pending");
  console.log(`  pending client:  ${PENDING_SLUG}`);

  const reviewId = await upsertClient(REVIEW_SLUG, "E2E Review Client", "in_review");
  await resetClientKB(reviewId, "in_review");
  console.log(`  review client:   ${REVIEW_SLUG}`);

  const editId = await upsertClient(EDIT_SLUG, "E2E Edit Client", "in_review");
  await resetClientKB(editId, "in_review");
  console.log(`  edit client:     ${EDIT_SLUG}`);

  const readyId = await upsertClient(READY_SLUG, "E2E Ready Client", "ready");
  const readyKB = await resetClientKB(readyId, "ready");
  await resetCanvas(readyId, READY_SLUG, readyKB);
  console.log(`  ready client:    ${READY_SLUG} (canvas: ${CANVAS_SLUG})`);

  console.log("\nDone. Set these in .env / GitHub secrets:\n");
  console.log(`TEST_CLIENT_SLUG=${PENDING_SLUG}`);
  console.log(`TEST_READY_CLIENT_SLUG=${READY_SLUG}`);
  console.log(`TEST_CANVAS_SLUG=${CANVAS_SLUG}`);
  console.log(`TEST_KB_REVIEW_SLUG=${REVIEW_SLUG}`);
  console.log(`TEST_KB_EDIT_SLUG=${EDIT_SLUG}`);
  console.log(`TEST_SCRIPT_CLIENT_SLUG=${READY_SLUG}`);
  console.log(`TEST_SCRIPT_CANVAS_SLUG=${CANVAS_SLUG}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
