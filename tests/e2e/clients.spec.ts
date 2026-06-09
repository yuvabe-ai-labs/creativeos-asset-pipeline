/**
 * CLIENT_01 – CLIENT_04 : Clients list page
 * Covers /, page load, New Client button, client card navigation, and page title.
 * Requires at least one seeded client in the database.
 */

import { test, expect } from "@playwright/test";
import { ClientsPage } from "../pages/clients-page";

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

    await expect(page).toHaveTitle(/CreativeOS/i);
  });
});
