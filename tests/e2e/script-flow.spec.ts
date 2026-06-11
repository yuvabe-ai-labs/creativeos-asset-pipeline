/**
 * SCRIPT_01 – SCRIPT_13 : Script node full lifecycle
 *
 * Two modes depending on the canvas state:
 *
 *   A) Script already parsed (existing data)
 *      → SCRIPT_03 / SCRIPT_04 skipped automatically
 *      → SCRIPT_05–13 (edit / delete / add / save) run with no extra env vars
 *
 *   B) Script not yet parsed (empty node)
 *      → Set TEST_RUN_GENERATE=1 to upload the fixture and trigger AI parse
 *      → After parse completes, SCRIPT_05–13 run as normal
 *
 * Prerequisites — set in .env:
 *   TEST_SCRIPT_CLIENT_SLUG — slug of a client with a canvas containing a script node
 *                             (falls back to TEST_CLIENT_SLUG if unset)
 *   TEST_SCRIPT_CANVAS_SLUG — slug of that canvas
 *                             (falls back to TEST_CANVAS_SLUG if unset)
 *   TEST_RUN_GENERATE       — set to "1" only when the node has no parsed script yet
 */

import { test, expect, type Page, type Locator } from "@playwright/test";
import path from "path";

const CLIENT_SLUG = process.env.TEST_SCRIPT_CLIENT_SLUG ?? process.env.TEST_CLIENT_SLUG ?? "";
const CANVAS_SLUG = process.env.TEST_SCRIPT_CANVAS_SLUG ?? process.env.TEST_CANVAS_SLUG ?? "";
const FIXTURE = path.join(__dirname, "../fixtures/Prakriti-Sattva.txt");

let wasAlreadyParsed = false;
let savedTitle = ""; // read in SCRIPT_05, verified in SCRIPT_13

// ── helpers ──────────────────────────────────────────────────────────────────

function sheet(page: Page) {
  return page.getByRole("dialog");
}

/** Scope to a <section> by its eyebrow label text */
function sec(page: Page, label: string | RegExp): Locator {
  return page.locator("section").filter({ hasText: label }).first();
}

/** Click-to-edit single-line field → fill → Enter to commit */
async function editSingle(page: Page, btn: Locator, text: string) {
  await btn.click();
  const inp = page.locator("input:focus").first();
  await inp.clear();
  await inp.fill(text);
  await inp.press("Enter");
}

/** Click-to-edit multiline field → fill → Ctrl+Enter to commit */
async function editMulti(page: Page, btn: Locator, text: string) {
  await btn.click();
  const ta = page.locator("textarea:focus").first();
  await ta.clear();
  await ta.fill(text);
  await page.keyboard.press("Control+Enter");
}

// ── serial suite ──────────────────────────────────────────────────────────────

test.describe.configure({ mode: "serial" });

let sharedPage: Page;

test.describe("Script node — full lifecycle", () => {
  test.beforeAll(async ({ browser }) => {
    if (!CLIENT_SLUG || !CANVAS_SLUG) {
      throw new Error("TEST_CLIENT_SLUG and TEST_CANVAS_SLUG must be set in .env");
    }
    sharedPage = await browser.newPage();
    await sharedPage.goto(`/clients/${CLIENT_SLUG}/canvases/${CANVAS_SLUG}`);
    await sharedPage.getByTestId("rf__wrapper").waitFor({ state: "visible" });
  });

  test.afterAll(async () => {
    await sharedPage.close();
  });

  // ── SCRIPT_01 ────────────────────────────────────────────────────────────────
  test("SCRIPT_01 script node is visible on the canvas", async () => {
    await expect(
      sharedPage.locator(".react-flow__node-script").first()
    ).toBeVisible();
  });

  // ── SCRIPT_02 ────────────────────────────────────────────────────────────────
  test("SCRIPT_02 clicking Open opens the script focus view sheet", async () => {
    await sharedPage
      .locator(".react-flow__node-script")
      .first()
      .getByRole("button", { name: /open/i })
      .click();

    await expect(sheet(sharedPage)).toBeVisible();
    await expect(
      sharedPage.getByRole("button", { name: /back to canvas/i })
    ).toBeVisible();

    // Save button is only rendered in parsed state — use as state detector
    wasAlreadyParsed = await sharedPage
      .getByRole("button", { name: "Save" })
      .isVisible();
  });

  // ── SCRIPT_03 — upload only when no existing script ──────────────────────────
  test("SCRIPT_03 uploading a reel brief starts parsing", async () => {
    test.skip(wasAlreadyParsed, "Script already parsed — upload skipped");
    test.skip(!process.env.TEST_RUN_GENERATE, "Set TEST_RUN_GENERATE=1 to upload and parse");

    const fileInput = sharedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(FIXTURE);

    await expect(sharedPage.getByText(/extracting the script/i)).toBeVisible({
      timeout: 5_000,
    });
  });

  // ── SCRIPT_04 — wait for AI parse only after fresh upload ────────────────────
  test("SCRIPT_04 parse completes and script document is displayed", async () => {
    test.skip(wasAlreadyParsed, "Script already parsed — parse wait skipped");
    test.skip(!process.env.TEST_RUN_GENERATE, "Set TEST_RUN_GENERATE=1 to upload and parse");
    test.slow();

    await expect(
      sharedPage.getByRole("button", { name: "Save" })
    ).toBeVisible({ timeout: 60_000 });

    await expect(
      sharedPage.getByText(/review and edit the extracted reel script/i)
    ).toBeVisible();

    await expect(
      sharedPage.getByRole("button", { name: "Remove shot" }).first()
    ).toBeVisible();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SCRIPT_05 – SCRIPT_12 run whenever the sheet is in parsed state
  // (existing data OR just freshly parsed above)
  // ─────────────────────────────────────────────────────────────────────────────

  function needsParsed() {
    return !wasAlreadyParsed && !process.env.TEST_RUN_GENERATE;
  }

  // ── SCRIPT_05 — title ─────────────────────────────────────────────────────────
  test("SCRIPT_05 edit title field", async () => {
    test.skip(needsParsed(), "Need a parsed script");

    // Read the current title so we always write a DIFFERENT value (avoids dirty=false)
    const titleBtn = sharedPage.locator('button[title="Click to edit"]').first();
    const current = (await titleBtn.textContent())?.trim() ?? "";
    savedTitle = current === "E2E Script — A" ? "E2E Script — B" : "E2E Script — A";

    await editSingle(sharedPage, titleBtn, savedTitle);

    await expect(
      sharedPage.getByRole("button", { name: "Save" })
    ).toBeEnabled();
  });

  // ── SCRIPT_06 — schedule section ──────────────────────────────────────────────
  test("SCRIPT_06 edit all four schedule fields", async () => {
    test.skip(needsParsed(), "Need a parsed script");

    const schedSec = sec(sharedPage, /schedule/i);
    const fields = schedSec.locator('button[title="Click to edit"]');

    // date, post_time, category, theme — rendered in that DOM order
    await editSingle(sharedPage, fields.nth(0), "Jun 20, 2026");
    await editSingle(sharedPage, fields.nth(1), "10 AM IST");
    await editSingle(sharedPage, fields.nth(2), "Brand Awareness");
    await editSingle(sharedPage, fields.nth(3), "Summer Collection");

    // Spot-check one value persisted into the DOM before moving on
    await expect(schedSec.getByText("Jun 20, 2026")).toBeVisible();
  });

  // ── SCRIPT_07 — objective + production type ───────────────────────────────────
  test("SCRIPT_07 edit objective and production type", async () => {
    test.skip(needsParsed(), "Need a parsed script");

    const objBtn = sec(sharedPage, /objective/i).locator('button[title="Click to edit"]').first();
    await editMulti(sharedPage, objBtn,
      "Showcase Ayurvedic ingredients through tactile, cinematic macro visuals.");

    const prodBtn = sec(sharedPage, /production type/i).locator('button[title="Click to edit"]').first();
    await editSingle(sharedPage, prodBtn,
      "Product macro + slow-motion ingredient shots. Natural window light, marble surface.");

    await expect(sec(sharedPage, /objective/i).getByText("Showcase Ayurvedic")).toBeVisible();
  });

  // ── SCRIPT_08 — visual script shots ──────────────────────────────────────────
  test("SCRIPT_08 delete first shot, edit second shot, add a new shot", async () => {
    test.skip(needsParsed(), "Need a parsed script");

    const visualSec = sec(sharedPage, /visual script/i);
    const removeButtons = sharedPage.getByRole("button", { name: "Remove shot" });

    // Delete first shot
    const countBefore = await removeButtons.count();
    await removeButtons.first().click();
    await expect(
      sharedPage.getByRole("button", { name: "Remove shot" })
    ).toHaveCount(countBefore - 1);

    // Edit description of the new first shot (multiline EditableField)
    const firstShotDesc = visualSec
      .locator("li")
      .first()
      .locator('button[title="Click to edit"]')
      .first();
    await editMulti(sharedPage, firstShotDesc,
      "Single amber oil drop falls onto pale marble. Slow motion. Side-lit.");

    // Add a new shot
    const countAfterDelete = await sharedPage
      .getByRole("button", { name: "Remove shot" })
      .count();
    await sharedPage.getByRole("button", { name: /add shot/i }).click();
    await expect(
      sharedPage.getByRole("button", { name: "Remove shot" })
    ).toHaveCount(countAfterDelete + 1);

    // Fill new shot description
    const newDesc = visualSec
      .locator('button[title="Click to edit"]', { hasText: /shot description/i })
      .last();
    await editMulti(sharedPage, newDesc, "Full product range on aged linen. Warm light from left.");

    // Fill new shot duration
    const newDuration = visualSec
      .locator("li")
      .last()
      .locator('button[title="Click to edit"]')
      .last();
    await editSingle(sharedPage, newDuration, "6s");
  });

  // ── SCRIPT_09 — on-screen text ────────────────────────────────────────────────
  test("SCRIPT_09 edit intro, add a body line, edit outro", async () => {
    test.skip(needsParsed(), "Need a parsed script");

    const osSec = sec(sharedPage, /on-screen text/i);
    const fields = osSec.locator('button[title="Click to edit"]');

    // intro — first field
    await editSingle(sharedPage, fields.first(), "Rooted in nature. Perfected over centuries.");

    // Add a body line
    const removeLinesBefore = await osSec
      .getByRole("button", { name: "Remove line" })
      .count();
    await osSec.getByRole("button", { name: /add line/i }).click();
    await expect(
      osSec.getByRole("button", { name: "Remove line" })
    ).toHaveCount(removeLinesBefore + 1);

    // Fill new body line
    const newLine = osSec
      .locator('button[title="Click to edit"]', { hasText: /^Add…$|line/i })
      .last();
    await editSingle(sharedPage, newLine, "Discover your Prakriti.");

    // outro — last field in the section
    await editSingle(sharedPage, fields.last(), "Prakriti Sattva.");
  });

  // ── SCRIPT_10 — voiceover, music, caption, CTA ───────────────────────────────
  test("SCRIPT_10 edit voiceover, music, caption, CTA, thumbnail hook", async () => {
    test.skip(needsParsed(), "Need a parsed script");

    const voBtn = sec(sharedPage, /voiceover/i).locator('button[title="Click to edit"]').first();
    await editMulti(sharedPage, voBtn, "No voiceover. Let the visuals speak.");

    const musBtn = sec(sharedPage, /music/i).locator('button[title="Click to edit"]').first();
    await editMulti(sharedPage, musBtn,
      "Ambient instrumental — sitar meets cello. Meditative, premium feel.");

    const capBtn = sec(sharedPage, /caption/i).locator('button[title="Click to edit"]').first();
    await editMulti(sharedPage, capBtn,
      "Ayurvedic skincare guided by your Prakriti. #PrakritiSattva #SlowBeauty");

    const ctaSec = sec(sharedPage, /^cta/i);
    const ctaFields = ctaSec.locator('button[title="Click to edit"]');

    await editSingle(sharedPage, ctaFields.first(), "Discover your skin type → prakritisattva.com");
    await editSingle(sharedPage, ctaFields.last(), "Ancient wisdom. Modern ritual.");

    await expect(sec(sharedPage, /caption/i).getByText("PrakritiSattva")).toBeVisible();
  });

  // ── SCRIPT_11 — QC notes + product links ─────────────────────────────────────
  test("SCRIPT_11 add a QC note and a product link", async () => {
    test.skip(needsParsed(), "Need a parsed script");

    // QC notes — add a note
    const qcSec = sec(sharedPage, /qc notes/i);
    const qcBefore = await qcSec.getByRole("button", { name: "Remove note" }).count();
    await qcSec.getByRole("button", { name: /add note/i }).click();
    await expect(
      qcSec.getByRole("button", { name: "Remove note" })
    ).toHaveCount(qcBefore + 1);

    const newNote = qcSec
      .locator('button[title="Click to edit"]', { hasText: /^Add…$|note/i })
      .last();
    await editSingle(sharedPage, newNote, "Final label must be sharp for at least 3 seconds.");

    // Product links — add a link
    const linkSec = sec(sharedPage, /product links/i);
    const linksBefore = await linkSec.getByRole("button", { name: "Remove link" }).count();
    await linkSec.getByRole("button", { name: /add link/i }).click();
    await expect(
      linkSec.getByRole("button", { name: "Remove link" })
    ).toHaveCount(linksBefore + 1);

    const newLink = linkSec
      .locator('button[title="Click to edit"]', { hasText: /https|^Add…$|link/i })
      .last();
    await editSingle(sharedPage, newLink, "https://prakritisattva.com");
  });

  // ── SCRIPT_12 — save all ──────────────────────────────────────────────────────
  test("SCRIPT_12 save commits all edits and disables Save", async () => {
    test.skip(needsParsed(), "Need a parsed script");

    const saveBtn = sharedPage.getByRole("button", { name: "Save" });
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    await expect(saveBtn).toBeDisabled();
  });

  // ── SCRIPT_13 — close + reopen to verify persistence ─────────────────────────
  test("SCRIPT_13 close and reopen — saved title is still there", async () => {
    test.skip(needsParsed(), "Need a parsed script");

    await sharedPage.getByRole("button", { name: /back to canvas/i }).click();
    await expect(sheet(sharedPage)).not.toBeVisible();
    await expect(sharedPage.getByTestId("rf__wrapper")).toBeVisible();

    // Reopen
    await sharedPage
      .locator(".react-flow__node-script")
      .first()
      .getByRole("button", { name: /open/i })
      .click();

    await expect(sheet(sharedPage)).toBeVisible();
    await expect(sharedPage.getByText(savedTitle)).toBeVisible();
  });
});
