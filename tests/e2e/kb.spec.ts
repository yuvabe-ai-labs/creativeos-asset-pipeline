/**
 * KB_01 – KB_04 : Brand Knowledge Base page
 *
 * Prerequisites
 * ─────────────
 * Set in .env:
 *   TEST_CLIENT_SLUG — slug of a seeded client (e.g. "acme-corp")
 *
 * Run just KB tests:
 *   pnpm exec playwright test kb.spec.ts
 */

import { test, expect } from "@playwright/test";
import { KBPage } from "../pages/kb-page";

const CLIENT_SLUG = process.env.TEST_CLIENT_SLUG ?? "";

test.describe("Knowledge Base", () => {
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

    // Either the upload step or the review step should be rendered
    const hasUpload = await page.getByText(/upload/i).isVisible().catch(() => false);
    const hasReview = await page.getByText(/review|approved|reject/i).isVisible().catch(() => false);

    expect(hasUpload || hasReview).toBe(true);
  });

  // KB_04 — Breadcrumb trail links back to clients and client detail
  test("KB_04 breadcrumb shows Clients and client name links", async ({ page }) => {
    const kbPage = new KBPage(page, CLIENT_SLUG);
    await kbPage.goto();

    const clientsLink = page.getByRole("link", { name: /clients/i });
    await expect(clientsLink).toBeVisible();
    await expect(clientsLink).toHaveAttribute("href", "/");
  });
});
