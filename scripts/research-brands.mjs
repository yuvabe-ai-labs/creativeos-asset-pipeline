#!/usr/bin/env node
/**
 * Brand website research comparison script.
 *
 * Usage:
 *   node scripts/research-brands.mjs [--out ./output] url1 url2 url3 ...
 *
 * For each URL, runs OpenAI + Gemini IN PARALLEL and produces two files:
 *   {brand}-openai.md   — gpt-5 + web_search
 *   {brand}-gemini.md   — gemini-3.1-pro-preview + Google Search grounding
 *
 * A summary table (timing + cost in USD + INR) is printed at the end.
 *
 * Requires in .env (or shell):
 *   OPENAI_API_KEY
 *   GOOGLE_GENAI_API_KEY
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Load .env
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ---------------------------------------------------------------------------
// Pricing (per million tokens, USD) — sourced 2026-07-01
// gpt-5:                  $0.63 input / $5.00 output
// gemini-3.1-pro-preview: $2.00 input / $12.00 output
// ---------------------------------------------------------------------------
const PRICING = {
  openai: { inputPerM: 0.63, outputPerM: 5.00, model: "gpt-5" },
  gemini: { inputPerM: 2.00, outputPerM: 12.00, model: "gemini-3.1-pro-preview" },
};
const USD_TO_INR = 84;

function calcCost(provider, inputTokens, outputTokens) {
  const p = PRICING[provider];
  const usd = (inputTokens / 1_000_000) * p.inputPerM +
               (outputTokens / 1_000_000) * p.outputPerM;
  return { usd, inr: usd * USD_TO_INR };
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
let outDir = "./research-output";
const urls = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && args[i + 1]) {
    outDir = args[++i];
  } else {
    urls.push(args[i]);
  }
}

if (urls.length === 0) {
  console.error("Usage: node scripts/research-brands.mjs [--out ./output] url1 url2 ...\n");
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------
// System prompt (identical for both providers)
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are a brand researcher for CreativeOS, an AI-powered creative production system.
Given a brand website URL, visit it and produce a clean Markdown brief that a downstream brand-extraction LLM will consume alongside uploaded brand documents.

INSTRUCTIONS
- Visit the homepage. Follow nav links to about, products/services, contact, and 1-2 most prominent content pages. Do NOT crawl the whole site — depth is wasted; breadth across page types is what matters.
- Quote distinctive phrases verbatim from the site for tone/voice cues.
- Note hex codes only if visible in stated brand color callouts; do not guess from screenshots.
- Spot compliance signals: words the brand uses repeatedly (preferred verbs); words conspicuously avoided (e.g. medical claim words for a wellness brand); regulatory disclaimers in footer.
- For social: list handle URLs only if linked from the site itself.

OUTPUT
A single Markdown document with these H2 sections (omit a section if genuinely no signal on it — do NOT invent):

## About
## Voice & tone cues
## Visual cues
## Target audience signals
## Products / services
## Social presence
## Compliance signals spotted
## Sources
   - bullet list of URLs you actually opened`;

// ---------------------------------------------------------------------------
// Slug from URL
// ---------------------------------------------------------------------------
function slugFromUrl(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname.replace(/[^a-z0-9]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  } catch {
    return url.replace(/[^a-z0-9]/gi, "-").slice(0, 40);
  }
}

// ---------------------------------------------------------------------------
// OpenAI research
// ---------------------------------------------------------------------------
async function researchWithOpenAI(url) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });

  const t0 = Date.now();
  const res = await openai.responses.create({
    model: "gpt-5",
    input: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Brand website: ${url}` },
    ],
    tools: [{ type: "web_search" }],
  });
  const elapsed = (Date.now() - t0) / 1000;

  const md = res.output_text?.trim();
  if (!md) throw new Error(`OpenAI returned no content for ${url}`);

  const inputTokens  = res.usage?.input_tokens  ?? 0;
  const outputTokens = res.usage?.output_tokens ?? 0;
  const cost = calcCost("openai", inputTokens, outputTokens);

  return { md, elapsed, inputTokens, outputTokens, cost };
}

// ---------------------------------------------------------------------------
// Gemini research
// ---------------------------------------------------------------------------
async function researchWithGemini(url) {
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_GENAI_API_KEY");

  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey });

  const t0 = Date.now();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [{ role: "user", parts: [{ text: `Brand website: ${url}` }] }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
    },
  });
  const elapsed = (Date.now() - t0) / 1000;

  const md = response.text?.trim();
  if (!md) throw new Error(`Gemini returned no content for ${url}`);

  const usage = response.usageMetadata ?? {};
  const inputTokens  = usage.promptTokenCount     ?? 0;
  const outputTokens = usage.candidatesTokenCount ?? 0;
  const cost = calcCost("gemini", inputTokens, outputTokens);

  return { md, elapsed, inputTokens, outputTokens, cost };
}

// ---------------------------------------------------------------------------
// Markdown header block written at the top of each output file
// ---------------------------------------------------------------------------
function makeHeader({ url, provider, model, elapsed, inputTokens, outputTokens, cost }) {
  const fmtUsd = (n) => `$${n.toFixed(4)}`;
  const fmtInr = (n) => `₹${n.toFixed(2)}`;

  return [
    `# ${url} — ${provider} Research`,
    ``,
    `| Field            | Value                        |`,
    `|------------------|------------------------------|`,
    `| Provider         | ${provider}                  |`,
    `| Model            | \`${model}\`                 |`,
    `| URL researched   | ${url}                       |`,
    `| Time taken       | ${elapsed.toFixed(1)}s       |`,
    `| Input tokens     | ${inputTokens.toLocaleString()} |`,
    `| Output tokens    | ${outputTokens.toLocaleString()} |`,
    `| Total tokens     | ${(inputTokens + outputTokens).toLocaleString()} |`,
    `| Cost (USD)       | ${fmtUsd(cost.usd)}          |`,
    `| Cost (INR ≈84x)  | ${fmtInr(cost.inr)}          |`,
    ``,
    `> Pricing: ${provider === "OpenAI"
      ? `gpt-5 — $${PRICING.openai.inputPerM}/M input · $${PRICING.openai.outputPerM}/M output`
      : `gemini-3.1-pro-preview — $${PRICING.gemini.inputPerM}/M input · $${PRICING.gemini.outputPerM}/M output`}`,
    ``,
    `---`,
    ``,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Summary table printed to terminal at the end
// ---------------------------------------------------------------------------
function printSummary(results) {
  console.log("\n" + "═".repeat(90));
  console.log("  SUMMARY");
  console.log("═".repeat(90));

  const col = (s, w) => String(s ?? "—").padEnd(w);
  const header = [
    col("Brand", 22),
    col("Provider", 10),
    col("Model", 26),
    col("Time", 8),
    col("Tokens in/out", 18),
    col("USD", 10),
    col("INR", 10),
    col("Status", 8),
  ].join(" ");
  const divider = "-".repeat(90);

  console.log(header);
  console.log(divider);

  let totalUsd = 0;
  let totalInr = 0;

  for (const r of results) {
    if (r.status === "ok") {
      totalUsd += r.cost.usd;
      totalInr += r.cost.inr;
    }
    const tokenStr = r.status === "ok"
      ? `${r.inputTokens.toLocaleString()} / ${r.outputTokens.toLocaleString()}`
      : "—";
    const row = [
      col(r.slug, 22),
      col(r.provider, 10),
      col(r.model, 26),
      col(r.status === "ok" ? `${r.elapsed.toFixed(1)}s` : "—", 8),
      col(tokenStr, 18),
      col(r.status === "ok" ? `$${r.cost.usd.toFixed(4)}` : "—", 10),
      col(r.status === "ok" ? `₹${r.cost.inr.toFixed(2)}` : "—", 10),
      col(r.status === "ok" ? "✓" : `✗ ${r.error}`, 8),
    ].join(" ");
    console.log(row);
  }

  console.log(divider);
  console.log(
    col("TOTAL", 22) +
    col("", 10) +
    col("", 26) +
    col("", 8) +
    col("", 18) +
    `$${totalUsd.toFixed(4)}`.padEnd(10) + " " +
    `₹${totalInr.toFixed(2)}`.padEnd(10)
  );
  console.log("═".repeat(90) + "\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
console.log(`\nResearching ${urls.length} brand(s) → ${path.resolve(outDir)}`);
console.log("OpenAI + Gemini calls run in parallel per brand.\n");

const allResults = [];

for (const url of urls) {
  const slug = slugFromUrl(url);
  console.log(`▶ ${url}`);

  const [openaiResult, geminiResult] = await Promise.allSettled([
    researchWithOpenAI(url),
    researchWithGemini(url),
  ]);

  // OpenAI
  if (openaiResult.status === "fulfilled") {
    const r = openaiResult.value;
    const header = makeHeader({
      url,
      provider: "OpenAI",
      model: PRICING.openai.model,
      elapsed: r.elapsed,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cost: r.cost,
    });
    const outFile = path.join(outDir, `${slug}-openai.md`);
    fs.writeFileSync(outFile, header + r.md + "\n");
    console.log(`  ✓ OpenAI  ${r.elapsed.toFixed(1)}s  $${r.cost.usd.toFixed(4)} / ₹${r.cost.inr.toFixed(2)}  → ${path.basename(outFile)}`);
    allResults.push({ slug, provider: "OpenAI", model: PRICING.openai.model, status: "ok", ...r });
  } else {
    const msg = openaiResult.reason?.message ?? "unknown error";
    console.log(`  ✗ OpenAI  ${msg}`);
    allResults.push({ slug, provider: "OpenAI", model: PRICING.openai.model, status: "error", error: msg });
  }

  // Gemini
  if (geminiResult.status === "fulfilled") {
    const r = geminiResult.value;
    const header = makeHeader({
      url,
      provider: "Gemini",
      model: PRICING.gemini.model,
      elapsed: r.elapsed,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cost: r.cost,
    });
    const outFile = path.join(outDir, `${slug}-gemini.md`);
    fs.writeFileSync(outFile, header + r.md + "\n");
    console.log(`  ✓ Gemini  ${r.elapsed.toFixed(1)}s  $${r.cost.usd.toFixed(4)} / ₹${r.cost.inr.toFixed(2)}  → ${path.basename(outFile)}`);
    allResults.push({ slug, provider: "Gemini", model: PRICING.gemini.model, status: "ok", ...r });
  } else {
    const msg = geminiResult.reason?.message ?? "unknown error";
    console.log(`  ✗ Gemini  ${msg}`);
    allResults.push({ slug, provider: "Gemini", model: PRICING.gemini.model, status: "error", error: msg });
  }

  console.log();
}

printSummary(allResults);
