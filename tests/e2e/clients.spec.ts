/**
 * CLIENT_01 – CLIENT_10 : Clients list page & Client Detail page
 *
 * CLIENT_01 – CLIENT_04 cover /, page load, New Client button, client card
 * navigation, and page title. Requires at least one seeded client in the
 * database.
 *
 * CLIENT_05 – CLIENT_10 cover /clients/[id] (the per-client canvas list page)
 * and the kb_status routing guard.
 *
 * Set in .env:
 *   TEST_CLIENT_SLUG       — slug of a client with kb_status != "ready"
 *                            (used to verify the redirect guard, CLIENT_05)
 *   TEST_READY_CLIENT_SLUG — slug of a client with kb_status = "ready" and
 *                            at least one canvas (CLIENT_06–CLIENT_10)
 */

import { test, expect } from "@playwright/test";
import { ClientsPage } from "../pages/clients-page";
import { ClientDetailPage } from "../pages/client-detail-page";

test.describe("Clients — Home Page", () => {
  // CLIENT_01 — Clients page loads with heading and New Client button
  test("CLIENT_01 / loads with heading and New Client button", async ({ page }) => {
    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    await expect(clientsPage.heading).toBeVisible();
    await expect(clientsPage.newClientButton).toBeVisible();
  });

  // CLIENT_02 — New Client button opens a dialog
  test("CLIENT_02 New Client button opens the create client dialog", async ({ page }) => {
    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    await clientsPage.newClientButton.click();

    await expect(page.getByRole("dialog")).toBeVisible();
  });

  // CLIENT_03 — Seeded client card is visible and links to the client page
  test("CLIENT_03 seeded client card is visible", async ({ page }) => {
    const clientSlug = process.env.TEST_CLIENT_SLUG;
    test.skip(!clientSlug, "Set TEST_CLIENT_SLUG in .env to enable this test");

    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    const card = page.locator(`a[href*="/clients/${clientSlug}"]`).first();
    await expect(card).toBeVisible();
  });

  // CLIENT_04 — Page has the correct document title
  test("CLIENT_04 page has correct document title", async ({ page }) => {
    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    await expect(page).toHaveTitle(/ThisTitleShouldNotMatch/i);
  });
});

// ── Client Detail page (/clients/[id]) ───────────────────────────────────────

test.describe("Clients — Client Detail Page", () => {
  const PENDING_SLUG = process.env.TEST_CLIENT_SLUG ?? "";
  const READY_SLUG = process.env.TEST_READY_CLIENT_SLUG ?? "";

  // CLIENT_05 — Routing guard: clients whose KB isn't ready are redirected to /kb
  test("CLIENT_05 client with kb_status != ready redirects to /clients/[id]/kb", async ({ page }) => {
    test.skip(!PENDING_SLUG, "Set TEST_CLIENT_SLUG to a client with kb_status != ready");

    await page.goto(`/clients/${PENDING_SLUG}`);

    await expect(page).toHaveURL(new RegExp(`/clients/${PENDING_SLUG}/kb$`));
    await expect(page.getByRole("heading", { name: /brand knowledge base/i })).toBeVisible();
  });

  // CLIENT_06 — Client detail page loads with the client's name as heading
  test("CLIENT_06 client detail page loads with client name heading", async ({ page }) => {
    test.skip(!READY_SLUG, "Set TEST_READY_CLIENT_SLUG to a client with kb_status = ready");

    const detail = new ClientDetailPage(page, READY_SLUG);
    await detail.goto();

    await expect(detail.heading).toBeVisible();
  });

  // CLIENT_07 — Breadcrumb "Clients" link navigates back to /
  test("CLIENT_07 breadcrumb Clients link navigates back to /", async ({ page }) => {
    test.skip(!READY_SLUG, "Set TEST_READY_CLIENT_SLUG to a client with kb_status = ready");

    const detail = new ClientDetailPage(page, READY_SLUG);
    await detail.goto();

    await detail.clientsBreadcrumbLink.click();

    await expect(page).toHaveURL(/\/$/);
    await expect(new ClientsPage(page).heading).toBeVisible();
  });

  // CLIENT_08 — "Brand KB" button links to /clients/[id]/kb
  test("CLIENT_08 Brand KB button navigates to the Knowledge Base page", async ({ page }) => {
    test.skip(!READY_SLUG, "Set TEST_READY_CLIENT_SLUG to a client with kb_status = ready");

    const detail = new ClientDetailPage(page, READY_SLUG);
    await detail.goto();

    await detail.brandKBButton.click();

    await expect(page).toHaveURL(new RegExp(`/clients/${READY_SLUG}/kb$`));
    await expect(page.getByRole("heading", { name: /brand knowledge base/i })).toBeVisible();
  });

  // CLIENT_09 — "New canvas" button opens the create-canvas dialog
  test("CLIENT_09 New canvas button opens the create canvas dialog", async ({ page }) => {
    test.skip(!READY_SLUG, "Set TEST_READY_CLIENT_SLUG to a client with kb_status = ready");

    const detail = new ClientDetailPage(page, READY_SLUG);
    await detail.goto();

    await detail.newCanvasButton.click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: /new canvas/i })).toBeVisible();
    await expect(page.getByLabel(/name/i)).toBeVisible();
  });

  // CLIENT_10 — Canvas cards render and link to the canvas editor
  test("CLIENT_10 canvas cards are visible and open the canvas editor", async ({ page }) => {
    test.skip(!READY_SLUG, "Set TEST_READY_CLIENT_SLUG to a client with kb_status = ready");

    const detail = new ClientDetailPage(page, READY_SLUG);
    await detail.goto();

    const noCanvases = await detail.noCanvasesMessage.isVisible().catch(() => false);
    test.skip(noCanvases, "Client has no canvases yet — cannot test canvas card navigation");

    await expect(detail.anyCanvasCard).toBeVisible();
    await detail.anyCanvasCard.click();

    await expect(page).toHaveURL(new RegExp(`/clients/${READY_SLUG}/canvases/[^/]+$`));
    await expect(page.getByTestId("rf__wrapper")).toBeVisible();
  });
});
