/**
 * KB_FLOW_01 – KB_FLOW_16 : Brand Knowledge Base full lifecycle
 *
 * Two modes depending on the client's KB state:
 *
 *   A) KB already extracted (review step visible)
 *      → KB_FLOW_02–06 skipped automatically
 *      → KB_FLOW_07–16 (edit / reject / approve / save) run with no extra env vars
 *
 *   B) KB not yet extracted (upload step visible)
 *      → Set TEST_RUN_GENERATE=1 to upload fixtures and trigger AI extraction
 *      → After extraction completes, KB_FLOW_07–16 run as normal
 *
 * Prerequisites — set in .env:
 *   TEST_CLIENT_SLUG  — e.g. "puma"
 *   TEST_RUN_GENERATE — set to "1" only when the client has no extracted KB yet
 */

import { test, expect, type Page, type Locator } from "@playwright/test";
import path from "path";

const CLIENT_SLUG = process.env.TEST_CLIENT_SLUG ?? "";

const DOC_FIXTURE = path.join(__dirname, "../fixtures/puma/PUMA Brand Brief.pdf");
const IMG_FIXTURES = [
  "JrxBNoPlrDmpT4lt4hI5bsmXE_BPK57l-eiOijeKXUUukLW9rySleOFCbfzUh-HOWmOejILOkRYTVBvuM_FbCJ0K99tjRAerx_pGGcSsQzwfe4hljyIvEMb97nGUQKtd7NX1TlUbHHD73T39KzFuirYThS0PrzE6Q6p2SgRDX_kXb-FuYctPhtjvec97j3YL.jpeg",
  "jvCMGF_tsuS47PKkVdn938YhGYG6T-Wff7f7QYvRTc6mTxzN3BG-KCXOYegENBLe_mbly2iyiTww-4fVzEqspxG1-fNTsZzm6tFKWGYoPgNjEh1vmbTzjkJZjHx2IskEnAH5xqnFRuMVQ0SzeqT6e2wyju39hNH8MW3SbC606KM.jpeg",
].map((f) => path.join(__dirname, "../fixtures/puma", f));

let wasAlreadyExtracted = false;

// ── helpers ───────────────────────────────────────────────────────────────────

/** Scope to a KB field <section> by its eyebrow label text */
function fieldSec(page: Page, label: string | RegExp): Locator {
  return page.locator("section").filter({ hasText: label }).first();
}

/** Click-to-edit a multiline KB field → fill → Ctrl+Enter to commit */
async function editField(page: Page, sec: Locator, text: string) {
  const btn = sec.locator('button[title="Click to edit"]').first();
  await btn.click();
  const ta = page.locator("textarea:focus").first();
  await ta.clear();
  await ta.fill(text);
  await page.keyboard.press("Control+Enter");
}

/** Click Approve all if the button is visible; otherwise a no-op. */
async function approveAllIfVisible(page: Page) {
  const btn = page.getByRole("button", { name: /approve all/i });
  if (await btn.isVisible()) {
    await btn.click();
  }
}

/**
 * Review every field in the currently visible module tab:
 *  - FIRST empty field → fill it with a value (tests the edit path on empty fields)
 *  - REMAINING empty fields → click the individual ✓ tick to approve-as-empty
 *  - Fields with values still on needs_review → bulk-approve via "Approve all"
 */
async function reviewModule(page: Page) {
  const TICK = 'button[title="Approve — confirm this field is empty"]';

  const emptyCount = await page.locator(TICK).count();

  if (emptyCount > 0) {
    // Fill the first empty field — its parent section is identified by the tick button
    const firstEmptySec = page
      .locator("section")
      .filter({ has: page.locator(TICK) })
      .first();
    await editField(page, firstEmptySec, "Not specified");

    // Tick-approve all remaining empty fields. Clicking .first() each iteration is
    // correct: after each click the field becomes "approved" and its tick button
    // disappears, so .first() always points at the next unhandled field.
    const remaining = await page.locator(TICK).count();
    for (let i = 0; i < remaining; i++) {
      await page.locator(TICK).first().click({ force: true });
    }
  }

  // Bulk-approve any non-empty fields still on needs_review
  await approveAllIfVisible(page);
}

// ── serial suite ──────────────────────────────────────────────────────────────

test.describe.configure({ mode: "serial" });

let sharedPage: Page;

test.describe("KB — full lifecycle", () => {
  test.beforeAll(async ({ browser }) => {
    if (!CLIENT_SLUG) {
      throw new Error("TEST_CLIENT_SLUG must be set in .env — point it at a seeded client slug");
    }
    sharedPage = await browser.newPage();
    await sharedPage.goto(`/clients/${CLIENT_SLUG}/kb`);

    // Wait for the KB page to be fully rendered — use step-specific subtitle text
    // rather than the heading, which appears on many pages and exists in SSR output
    // before the client component hydrates.
    //
    // Upload step subtitle is rendered by the server component (fast).
    // Review step subtitle is inside the "use client" component — this wait ensures
    // React has finished hydrating before any test reads state like tab presence.
    const uploadSubtitle = sharedPage.getByText(
      /upload brand documents and images to extract/i
    );
    const reviewSubtitle = sharedPage.getByText(
      /review the extracted brand knowledge|your brand kb is live/i
    );
    await expect(uploadSubtitle.or(reviewSubtitle)).toBeVisible({ timeout: 15_000 });
  });

  test.afterAll(async () => {
    await sharedPage.close();
  });

  // ── KB_FLOW_01 ───────────────────────────────────────────────────────────────
  test("KB_FLOW_01 KB page loads and shows upload or review section", async () => {
    await expect(
      sharedPage.getByRole("heading", { name: /brand knowledge base/i })
    ).toBeVisible();

    // Detect step via the subtitle text rendered by the server component (unique per
    // step, available immediately — unlike tabs which only mount after hydration).
    wasAlreadyExtracted = await sharedPage
      .getByText(/review the extracted brand knowledge|your brand kb is live/i)
      .isVisible();

    if (wasAlreadyExtracted) {
      // Review step: Save button must be present (always rendered, even when disabled)
      await expect(sharedPage.getByRole("button", { name: "Save" })).toBeVisible();
    } else {
      // Upload step: unique subtitle confirms we are on the correct step
      await expect(
        sharedPage.getByText(/upload brand documents and images to extract/i)
      ).toBeVisible();
    }
  });

  // ── KB_FLOW_02 — upload brand brief PDF ──────────────────────────────────────
  test("KB_FLOW_02 uploading brand brief PDF lists the file", async () => {
    test.skip(wasAlreadyExtracted, "KB already extracted — upload skipped");
    test.skip(!process.env.TEST_RUN_GENERATE, "Set TEST_RUN_GENERATE=1 to upload fixtures");

    const fileInput = sharedPage.locator('input[type="file"][accept=".pdf,.docx,.pptx,.md,.txt"]');
    await fileInput.setInputFiles(DOC_FIXTURE);

    // File name should appear in the document list
    await expect(sharedPage.getByText("PUMA Brand Brief.pdf")).toBeVisible({ timeout: 10_000 });
  });

  // ── KB_FLOW_03 — upload brand images ─────────────────────────────────────────
  test("KB_FLOW_03 uploading brand images lists the files", async () => {
    test.skip(wasAlreadyExtracted, "KB already extracted — upload skipped");
    test.skip(!process.env.TEST_RUN_GENERATE, "Set TEST_RUN_GENERATE=1 to upload fixtures");

    const fileInput = sharedPage.locator('input[type="file"][accept=".jpg,.jpeg,.png,.webp"]');
    await fileInput.setInputFiles(IMG_FIXTURES);

    // At least one image filename should appear (li text is "filename.jpeg 62 KB", so no $ anchor)
    await expect(
      sharedPage.locator("ul li").filter({ hasText: /\.jpeg/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── KB_FLOW_04 — extract button enabled ──────────────────────────────────────
  test("KB_FLOW_04 Extract & Build KB button is enabled after doc upload", async () => {
    test.skip(wasAlreadyExtracted, "KB already extracted — button check skipped");
    test.skip(!process.env.TEST_RUN_GENERATE, "Set TEST_RUN_GENERATE=1 to upload fixtures");

    await expect(
      sharedPage.getByRole("button", { name: /extract.*build kb/i })
    ).toBeEnabled();
  });

  // ── KB_FLOW_05 — trigger extraction ──────────────────────────────────────────
  test("KB_FLOW_05 clicking Extract & Build KB shows extraction skeleton", async () => {
    test.skip(wasAlreadyExtracted, "KB already extracted — extract trigger skipped");
    test.skip(!process.env.TEST_RUN_GENERATE, "Set TEST_RUN_GENERATE=1 to upload and extract");

    await sharedPage.getByRole("button", { name: /extract.*build kb/i }).click();

    // Extraction skeleton / analyzing message should appear
    await expect(
      sharedPage.getByText(/analyzing|extracting|this usually takes/i)
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── KB_FLOW_06 — extraction completes ────────────────────────────────────────
  test("KB_FLOW_06 extraction completes and all 7 tabs are visible", async () => {
    test.skip(wasAlreadyExtracted, "KB already extracted — extraction wait skipped");
    test.skip(!process.env.TEST_RUN_GENERATE, "Set TEST_RUN_GENERATE=1 to upload and extract");
    test.slow();

    // Wait for the Brand Voice tab to appear — signals review step is mounted
    await expect(
      sharedPage.getByRole("tab", { name: /brand voice/i })
    ).toBeVisible({ timeout: 90_000 });

    // All 7 module tabs must be present
    const tabLabels = [
      "Brand Voice",
      "Visual Identity",
      "Image Analysis",
      "Audience & Casting",
      "Image Direction",
      "Video Direction",
      "Compliance Rules",
    ];
    for (const label of tabLabels) {
      await expect(sharedPage.getByRole("tab", { name: label })).toBeVisible();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // KB_FLOW_07 – KB_FLOW_16 run whenever the review step is active
  // (existing extracted KB OR just freshly extracted above)
  // ─────────────────────────────────────────────────────────────────────────────

  function needsExtracted() {
    return !wasAlreadyExtracted && !process.env.TEST_RUN_GENERATE;
  }

  // ── KB_FLOW_07 — Brand Voice: refine Mission with AI + edit Tagline ─────────────
  test("KB_FLOW_07 Brand Voice — refine Mission with AI, edit Tagline, verify dirty", async () => {
    test.skip(needsExtracted(), "Need an extracted KB");

    await sharedPage.getByRole("tab", { name: /brand voice/i }).click();

    // Refine Mission with AI — gated because it makes a real re-analyze API call
    if (process.env.TEST_RUN_GENERATE) {
      const missionSec = fieldSec(sharedPage, /mission/i);

      // Open the "Refine with AI" popover (sparkles button — force-click for hover-only buttons)
      await missionSec.locator('button[title="Refine with AI"]').first().click({ force: true });

      // Fill the AI comment and submit
      await sharedPage
        .getByPlaceholder(/e\.g\. "make this/i)
        .fill("More energetic and performance-focused for a sports brand");
      await sharedPage.getByRole("button", { name: "Re-analyze" }).click();

      // Wait for the spinner to disappear (re-analysis complete, ≤ 30 s)
      await expect(missionSec.getByText("Re-analyzing…")).not.toBeVisible({ timeout: 30_000 });
    }

    // Direct edit of Tagline — always runs, ensures the dirty badge appears
    const taglineSec = fieldSec(sharedPage, /tagline/i);
    await editField(sharedPage, taglineSec, "Performance For All");

    await expect(sharedPage.getByText("Unsaved changes")).toBeVisible();
    await expect(sharedPage.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  // ── KB_FLOW_08 — Brand Voice: reject personality, verify, restore ─────────────
  test("KB_FLOW_08 Brand Voice — reject personality field, verify, then restore", async () => {
    test.skip(needsExtracted(), "Need an extracted KB");

    const personalitySec = fieldSec(sharedPage, /personality/i);

    // Reject the field — button only appears on hover; force-click it
    const rejectBtn = personalitySec.locator('button[title="Reject"]').first();
    await rejectBtn.click({ force: true });

    // The label should now carry a line-through style (checked via class)
    await expect(
      personalitySec.locator(".line-through").first()
    ).toBeVisible();

    // Restore the field
    await personalitySec.getByText("Restore").click();

    // Line-through should be gone
    await expect(
      personalitySec.locator(".line-through").first()
    ).not.toBeVisible();
  });

  // ── KB_FLOW_09 — Brand Voice: Approve all + Save ──────────────────────────────
  test("KB_FLOW_09 Brand Voice — Approve all then Save", async () => {
    test.skip(needsExtracted(), "Need an extracted KB");

    await approveAllIfVisible(sharedPage);

    // Save all pending edits
    const saveBtn = sharedPage.getByRole("button", { name: "Save" });
    if (await saveBtn.isEnabled()) {
      await saveBtn.click();
      await expect(saveBtn).toBeDisabled({ timeout: 10_000 });
    }

    // Unsaved changes badge must be gone
    await expect(sharedPage.getByText("Unsaved changes")).not.toBeVisible();
  });

  // ── KB_FLOW_10 — Visual Identity: tab switch + edit + Approve all ─────────────
  test("KB_FLOW_10 Visual Identity — switch tab, edit aesthetic, Approve all", async () => {
    test.skip(needsExtracted(), "Need an extracted KB");

    await sharedPage.getByRole("tab", { name: /visual identity/i }).click();

    // Heading should update
    await expect(sharedPage.getByRole("heading", { name: /visual identity/i, level: 2 })).toBeVisible();

    // Edit the Aesthetic field explicitly, then handle any remaining empty fields
    const aestheticSec = fieldSec(sharedPage, /aesthetic/i);
    await editField(sharedPage, aestheticSec, "Bold, athletic, minimal");

    await reviewModule(sharedPage);
  });

  // ── KB_FLOW_11 — Image Analysis: tab switch + state check ─────────────────────
  test("KB_FLOW_11 Image Analysis — tab switch shows fields or empty state", async () => {
    test.skip(needsExtracted(), "Need an extracted KB");

    await sharedPage.getByRole("tab", { name: /image analysis/i }).click();

    await expect(
      sharedPage.getByRole("heading", { name: /image analysis/i, level: 2 })
    ).toBeVisible();

    // Either field rows are rendered or the "No brand images" empty state is shown
    const hasFields = await sharedPage
      .locator("section")
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmptyState = await sharedPage
      .getByText(/no brand images were analyzed/i)
      .isVisible()
      .catch(() => false);

    expect(hasFields || hasEmptyState).toBe(true);

    // Fill empty fields / tick-approve the rest / bulk-approve the remainder
    await reviewModule(sharedPage);
  });

  // ── KB_FLOW_12 — Audience & Casting: tab switch + review fields ───────────────
  test("KB_FLOW_12 Audience & Casting — switch tab and review all fields", async () => {
    test.skip(needsExtracted(), "Need an extracted KB");

    await sharedPage.getByRole("tab", { name: /audience.*casting/i }).click();

    await expect(
      sharedPage.getByRole("heading", { name: /audience.*casting/i, level: 2 })
    ).toBeVisible();

    await reviewModule(sharedPage);
  });

  // ── KB_FLOW_13 — Image Direction: tab switch + review fields ──────────────────
  test("KB_FLOW_13 Image Direction — switch tab and review all fields", async () => {
    test.skip(needsExtracted(), "Need an extracted KB");

    await sharedPage.getByRole("tab", { name: /image direction/i }).click();

    await expect(
      sharedPage.getByRole("heading", { name: /image direction/i, level: 2 })
    ).toBeVisible();

    await reviewModule(sharedPage);
  });

  // ── KB_FLOW_14 — Video Direction: tab switch + review fields ──────────────────
  test("KB_FLOW_14 Video Direction — switch tab and review all fields", async () => {
    test.skip(needsExtracted(), "Need an extracted KB");

    await sharedPage.getByRole("tab", { name: /video direction/i }).click();

    await expect(
      sharedPage.getByRole("heading", { name: /video direction/i, level: 2 })
    ).toBeVisible();

    await reviewModule(sharedPage);
  });

  // ── KB_FLOW_15 — Compliance Rules: tab switch + review fields + Save ──────────
  test("KB_FLOW_15 Compliance Rules — switch tab, review all fields, then Save", async () => {
    test.skip(needsExtracted(), "Need an extracted KB");

    await sharedPage.getByRole("tab", { name: /compliance/i }).click();

    await expect(
      sharedPage.getByRole("heading", { name: /compliance/i, level: 2 })
    ).toBeVisible();

    await reviewModule(sharedPage);

    // Persist all outstanding edits from tabs 10–15
    const saveBtn = sharedPage.getByRole("button", { name: "Save" });
    if (await saveBtn.isEnabled()) {
      await saveBtn.click();
      await expect(saveBtn).toBeDisabled({ timeout: 10_000 });
    }
  });

  // ── KB_FLOW_16 — Mark KB Ready (finalize or verify state) ────────────────────
  test("KB_FLOW_16 Mark KB Ready finalizes the KB or reflects current review progress", async () => {
    test.skip(needsExtracted(), "Need an extracted KB");

    // Button always renders — label/enabled state depends on review completion
    const markReadyBtn = sharedPage.getByRole("button", {
      name: /mark kb ready|kb is ready|review all fields first/i,
    });
    await expect(markReadyBtn).toBeVisible();

    const isEnabled = await markReadyBtn.isEnabled();
    if (isEnabled) {
      // All fields reviewed, no unsaved changes → click to finalize
      await expect(markReadyBtn).toContainText(/mark kb ready/i);
      await markReadyBtn.click();

      // App redirects to the client detail page after marking ready
      await sharedPage.waitForURL(`**/clients/${CLIENT_SLUG}`, { timeout: 15_000 });
    } else {
      // Either already in "ready" state ("KB is Ready") or fields still need review
      const label = await markReadyBtn.textContent();
      expect(label?.trim()).toMatch(/kb is ready|review all fields first/i);
    }
  });
});
