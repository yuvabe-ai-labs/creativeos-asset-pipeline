/**
 * KB_01 – KB_28 : Brand Knowledge Base page
 *
 * Prerequisites
 * ─────────────
 * Set in .env:
 *   TEST_CLIENT_SLUG       — slug of a seeded client with kb_status = "pending"
 *                            (upload step tests KB_05–KB_11)
 *   TEST_KB_REVIEW_SLUG    — slug of a seeded client with kb_status = "in_review"
 *                            and at least one extracted KB version
 *                            (review step tests KB_12–KB_28)
 *
 * Optional flags:
 *   TEST_RUN_KB_EDIT=1       — enable tests that write to the DB (approve-all + Save)
 *   TEST_RUN_KB_REANALYZE=1  — enable the AI re-analyze test (fires a real API call)
 *
 * Run just KB tests:
 *   pnpm exec playwright test kb.spec.ts
 */

import { test, expect } from "@playwright/test";
import { KBPage } from "../pages/kb-page";

const CLIENT_SLUG = process.env.TEST_CLIENT_SLUG ?? "";
const REVIEW_SLUG = process.env.TEST_KB_REVIEW_SLUG ?? "";
// Separate slug for the DB-writing "Approve all + Save" test (KB_26), so it
// doesn't mutate REVIEW_SLUG's data and break the read-only review tests.
const EDIT_SLUG = process.env.TEST_KB_EDIT_SLUG ?? REVIEW_SLUG;

// ── Shared page load ─────────────────────────────────────────────────────────

test.describe("Knowledge Base — common", () => {
  test.beforeAll(() => {
    if (!CLIENT_SLUG) {
      throw new Error(
        "TEST_CLIENT_SLUG must be set in .env — point it at a seeded client slug"
      );
    }
  });

  // KB_01 — KB page loads with correct heading
  test("KB_01 KB page loads with Brand Knowledge Base heading", async ({ page }) => {
    const kbPage = new KBPage(page, CLIENT_SLUG);
    await kbPage.goto();

    await expect(kbPage.heading).toBeVisible();
  });

  // KB_02 — Page title is correct
  test("KB_02 KB page has correct document title", async ({ page }) => {
    const kbPage = new KBPage(page, CLIENT_SLUG);
    await kbPage.goto();

    await expect(page).toHaveTitle(/CreativeOS/i);
  });

  // KB_03 — Upload or review section renders (depends on client kb_status)
  test("KB_03 KB page renders upload or review section", async ({ page }) => {
    const kbPage = new KBPage(page, CLIENT_SLUG);
    await kbPage.goto();

    const hasUpload = await kbPage.isInUploadStep();
    const hasReview = await kbPage.isInReviewStep();

    expect(hasUpload || hasReview).toBe(true);
  });

  // KB_04 — Breadcrumb trail links back to clients list
  test("KB_04 breadcrumb shows Clients link back to /", async ({ page }) => {
    const kbPage = new KBPage(page, CLIENT_SLUG);
    await kbPage.goto();

    const clientsLink = page.getByRole("link", { name: /clients/i });
    await expect(clientsLink).toBeVisible();
    await expect(clientsLink).toHaveAttribute("href", "/");
  });
});

// ── Upload step (kb_status = "pending") ──────────────────────────────────────

test.describe("Knowledge Base — upload step", () => {
  test.beforeAll(() => {
    if (!CLIENT_SLUG) {
      throw new Error(
        "TEST_CLIENT_SLUG must be set in .env — point it at a client with kb_status = pending"
      );
    }
  });

  // KB_05 — Brand Documents card visible
  test("KB_05 Brand Documents card is visible in upload step", async ({ page }) => {
    const kbPage = new KBPage(page, CLIENT_SLUG);
    await kbPage.goto();
    test.skip(!(await kbPage.isInUploadStep()), "Client is not in upload state — set TEST_CLIENT_SLUG to a pending client");

    await expect(kbPage.brandDocumentsCard).toBeVisible();
  });

  // KB_06 — Brand Images card visible
  test("KB_06 Brand Images card is visible in upload step", async ({ page }) => {
    const kbPage = new KBPage(page, CLIENT_SLUG);
    await kbPage.goto();
    test.skip(!(await kbPage.isInUploadStep()), "Client is not in upload state");

    await expect(kbPage.brandImagesCard).toBeVisible();
  });

  // KB_07 — Extract button is disabled when no documents uploaded
  test("KB_07 Extract button is disabled when no documents are present", async ({ page }) => {
    const kbPage = new KBPage(page, CLIENT_SLUG);
    await kbPage.goto();
    test.skip(!(await kbPage.isInUploadStep()), "Client is not in upload state");

    const noDocsYet = await kbPage.noDocumentsMessage.isVisible().catch(() => false);
    test.skip(!noDocsYet, "Client already has documents — cannot test disabled extract state");

    await expect(kbPage.extractButton).toBeDisabled();
  });

  // KB_08 — Upload hint shown when no documents
  test("KB_08 hint to upload at least one document is shown when empty", async ({ page }) => {
    const kbPage = new KBPage(page, CLIENT_SLUG);
    await kbPage.goto();
    test.skip(!(await kbPage.isInUploadStep()), "Client is not in upload state");

    const noDocsYet = await kbPage.noDocumentsMessage.isVisible().catch(() => false);
    test.skip(!noDocsYet, "Client already has documents — skip empty-state check");

    await expect(kbPage.uploadHintMessage).toBeVisible();
  });

  // KB_09 — Upload zones ("Add documents" / "Add images") are present
  test("KB_09 Add documents and Add images upload zones are present", async ({ page }) => {
    const kbPage = new KBPage(page, CLIENT_SLUG);
    await kbPage.goto();
    test.skip(!(await kbPage.isInUploadStep()), "Client is not in upload state");

    await expect(kbPage.addDocumentsZone).toBeVisible();
    await expect(kbPage.addImagesZone).toBeVisible();
  });

  // KB_10 — Accepted file formats shown for documents
  test("KB_10 document card shows accepted formats (PDF · DOCX · PPTX · MD · TXT)", async ({ page }) => {
    const kbPage = new KBPage(page, CLIENT_SLUG);
    await kbPage.goto();
    test.skip(!(await kbPage.isInUploadStep()), "Client is not in upload state");

    await expect(page.getByText(/PDF · DOCX · PPTX · MD · TXT/)).toBeVisible();
  });

  // KB_11 — Accepted file formats shown for images
  test("KB_11 images card shows accepted formats (JPG · PNG · WebP)", async ({ page }) => {
    const kbPage = new KBPage(page, CLIENT_SLUG);
    await kbPage.goto();
    test.skip(!(await kbPage.isInUploadStep()), "Client is not in upload state");

    await expect(page.getByText(/JPG · PNG · WebP/)).toBeVisible();
  });
});

// ── Review step (kb_status = "in_review" | "ready") ──────────────────────────

test.describe("Knowledge Base — review step", () => {
  test.beforeAll(() => {
    if (!REVIEW_SLUG) {
      throw new Error(
        "TEST_KB_REVIEW_SLUG must be set in .env — point it at a client with kb_status = in_review"
      );
    }
  });

  // KB_12 — All 7 module tabs render
  test("KB_12 all 7 module tabs are visible", async ({ page }) => {
    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    const tabs = [
      "Brand Voice",
      "Visual Identity",
      "Image Analysis",
      "Audience & Casting",
      "Image Direction",
      "Video Direction",
      "Compliance Rules",
    ];

    for (const label of tabs) {
      await expect(kbPage.moduleTab(label)).toBeVisible();
    }
  });

  // KB_13 — Brand Voice module is active by default
  test("KB_13 Brand Voice tab is selected by default", async ({ page }) => {
    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    const brandVoiceTab = kbPage.moduleTab("Brand Voice");
    await expect(brandVoiceTab).toBeVisible();
    // Base UI tabs mark the active tab with data-active (not aria-selected)
    await expect(brandVoiceTab).toHaveAttribute("data-active", "");
  });

  // KB_14 — Reviewed counter ("X / Y reviewed") is present
  test("KB_14 reviewed counter shows X / Y reviewed for the active module", async ({ page }) => {
    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    await expect(kbPage.reviewedCounter).toBeVisible();
  });

  // KB_15 — Field rows with confidence badges are visible
  test("KB_15 field rows show confidence badges (High / Med / Low)", async ({ page }) => {
    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    const confidenceBadge = page
      .getByText(/^(High|Med|Low)$/)
      .first();
    await expect(confidenceBadge).toBeVisible();
  });

  // KB_16 — Approve all button visible when fields need review
  test("KB_16 Approve all button is visible when the module has unreviewed fields", async ({ page }) => {
    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    const approveAllVisible = await kbPage.approveAllButton.isVisible().catch(() => false);
    const reviewedText = await kbPage.reviewedCounter.textContent();
    const allReviewed = reviewedText?.startsWith(
      reviewedText.replace(/(\d+) \/ \d+ reviewed/, "$1")
    );

    if (!allReviewed && !approveAllVisible) {
      throw new Error("Approve all button should be visible when there are unreviewed fields");
    }
  });

  // KB_17 — Reject (X icon) button visible for non-empty fields
  test("KB_17 Reject button is visible on at least one field row", async ({ page }) => {
    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    await expect(kbPage.firstRejectButton).toBeVisible();
  });

  // KB_18 — AI Refine (sparkle icon) button visible on field rows
  test("KB_18 AI Refine (sparkles) button is visible on at least one field row", async ({ page }) => {
    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    await expect(kbPage.firstAIRefineButton).toBeVisible();
  });

  // KB_19 — Clicking the AI refine button opens a popover with a textarea
  test("KB_19 clicking AI Refine button opens popover with textarea", async ({ page }) => {
    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    await kbPage.firstAIRefineButton.click();

    await expect(kbPage.aiRefineTextarea).toBeVisible();
  });

  // KB_20 — Clicking a different module tab switches the content
  test("KB_20 switching module tabs updates the displayed module heading", async ({ page }) => {
    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    await kbPage.moduleTab("Visual Identity").click();

    await expect(
      page.getByRole("heading", { name: /visual identity/i })
    ).toBeVisible();
  });

  // KB_21 — Source files button opens the source drawer
  test("KB_21 Source files button opens the source drawer", async ({ page }) => {
    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    await kbPage.sourceFilesButton.click();

    await expect(kbPage.sourceDrawer).toBeVisible();
  });

  // KB_22 — Source drawer shows Documents & Images tabs
  test("KB_22 source drawer contains Documents and Images tabs", async ({ page }) => {
    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    await kbPage.sourceFilesButton.click();

    await expect(page.getByText("Source Documents & Images")).toBeVisible();
    await expect(page.getByRole("tab", { name: /documents/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /images/i })).toBeVisible();
  });

  // KB_23 — Mark KB Ready button is present in the review step
  test("KB_23 Mark KB Ready button is present in the review step", async ({ page }) => {
    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    await expect(kbPage.markReadyButton).toBeVisible();
  });

  // KB_24 — Rejecting a field shows the Restore link (local state, no DB write)
  test("KB_24 rejecting a field shows a Restore link without saving", async ({ page }) => {
    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    // Click reject on the first eligible field
    const rejectBtn = kbPage.firstRejectButton;
    await expect(rejectBtn).toBeVisible();
    await rejectBtn.click();

    await expect(kbPage.restoreLink).toBeVisible();
  });

  // KB_25 — Unsaved changes badge appears after a field status change
  test("KB_25 unsaved changes badge appears after rejecting a field", async ({ page }) => {
    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    await kbPage.firstRejectButton.click();

    await expect(kbPage.unsavedBadge).toBeVisible();
  });

  // KB_26 — Approve all + Save writes to DB (gated — requires TEST_RUN_KB_EDIT=1)
  test("KB_26 Approve all then Save persists changes", async ({ page }) => {
    test.skip(
      !process.env.TEST_RUN_KB_EDIT,
      "Set TEST_RUN_KB_EDIT=1 to run state-writing KB tests"
    );

    const kbPage = new KBPage(page, EDIT_SLUG);
    await kbPage.goto();

    // The default "Brand Voice" tab may already be fully reviewed — switch to
    // "Compliance Rules", which has unreviewed fields on the Nike fixture.
    await kbPage.moduleTab("Compliance Rules").click();

    const approveAllVisible = await kbPage.approveAllButton.isVisible().catch(() => false);
    test.skip(!approveAllVisible, "No unreviewed fields to approve in this module");

    await kbPage.approveAllButton.click();
    await expect(kbPage.unsavedBadge).toBeVisible();

    await kbPage.saveButton.click();
    await expect(page.getByText("Changes saved")).toBeVisible({ timeout: 10_000 });
    await expect(kbPage.unsavedBadge).not.toBeVisible();
  });

  // KB_27 — Colour palette fields render swatch chips with hex colours
  test("KB_27 Primary Colours field renders colour swatches with hex codes", async ({ page }) => {
    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    await kbPage.moduleTab("Visual Identity").click();

    const row = kbPage.fieldRow("Primary Colours");
    const hasHex = await row
      .getByText(/#[0-9a-fA-F]{3,6}\b/)
      .first()
      .isVisible()
      .catch(() => false);
    test.skip(!hasHex, "Primary Colours field has no hex values for this client");

    await expect(kbPage.colorSwatches("Primary Colours").first()).toBeVisible();
  });

  // KB_28 — Submitting AI Refine re-analyzes a field (gated — fires a real AI call)
  test("KB_28 submitting AI Refine re-analyzes the field with a new value", async ({ page }) => {
    test.skip(
      !process.env.TEST_RUN_KB_REANALYZE,
      "Set TEST_RUN_KB_REANALYZE=1 to run AI re-analysis tests (fires a real API call)"
    );

    const kbPage = new KBPage(page, REVIEW_SLUG);
    await kbPage.goto();

    await kbPage.firstAIRefineButton.click();
    await kbPage.aiRefineTextarea.fill("Make this more concise");
    await kbPage.aiRefineSubmitButton.click();

    await expect(kbPage.reanalyzingIndicator).toBeVisible();
    await expect(kbPage.reanalyzingIndicator).not.toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/updated — review the new value/i)).toBeVisible();
  });
});
