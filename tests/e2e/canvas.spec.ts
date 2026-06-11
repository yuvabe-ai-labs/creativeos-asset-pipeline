/**
 * CANVAS_01 – CANVAS_08 : Canvas & Node Graph
 *
 * Prerequisites
 * ─────────────
 * Set in .env:
 *   TEST_CLIENT_SLUG  — slug of a seeded client (e.g. "acme-corp")
 *   TEST_CANVAS_SLUG  — slug of a seeded canvas on that client with both node
 *                       types (script, kb) and at least one edge
 *   TEST_RUN_CANVAS_EDIT — set to "1" to run CANVAS_07, which adds a node to
 *                          the canvas and autosaves it to the DB.
 *
 * Run just canvas tests:
 *   pnpm exec playwright test canvas.spec.ts
 *
 * Run including the gated test:
 *   TEST_RUN_CANVAS_EDIT=1 pnpm exec playwright test canvas.spec.ts
 */

import { test, expect } from "@playwright/test";
import { CanvasPage } from "../pages/canvas-page";

// Canvas tests need a client with kb_status = "ready" (otherwise /clients/[id]
// pages redirect to /kb) and a seeded canvas with both node types + an edge.
const CLIENT_SLUG = process.env.TEST_READY_CLIENT_SLUG ?? process.env.TEST_CLIENT_SLUG ?? "";
const CANVAS_SLUG = process.env.TEST_CANVAS_SLUG ?? "";

test.describe("Canvas — Node Graph", () => {
  test.beforeAll(() => {
    if (!CLIENT_SLUG || !CANVAS_SLUG) {
      throw new Error(
        "TEST_CLIENT_SLUG and TEST_CANVAS_SLUG must be set in .env — point them at a seeded canvas"
      );
    }
  });

  // CANVAS_01 — Canvas page loads and xyflow mounts
  test("CANVAS_01 canvas page loads with xyflow wrapper visible", async ({ page }) => {
    const canvas = new CanvasPage(page, CLIENT_SLUG, CANVAS_SLUG);
    await canvas.goto();

    await expect(canvas.wrapper).toBeVisible();
  });

  // CANVAS_02 — Both node types are present in the DOM
  test("CANVAS_02 both node types (script, kb) are present on the canvas", async ({ page }) => {
    const canvas = new CanvasPage(page, CLIENT_SLUG, CANVAS_SLUG);
    await canvas.goto();

    await expect(canvas.nodeByType("script")).toBeVisible();
    await expect(canvas.nodeByType("kb")).toBeVisible();
  });

  // CANVAS_03 — Clicking a node gives it the .selected CSS class
  test("CANVAS_03 clicking a node gives it the selected class", async ({ page }) => {
    const canvas = new CanvasPage(page, CLIENT_SLUG, CANVAS_SLUG);
    await canvas.goto();

    const scriptNode = canvas.nodeByType("script");
    await scriptNode.click();

    await expect(scriptNode).toHaveClass(/selected/);
  });

  // CANVAS_04 — "Open" button on the KB node opens the Brand KB sheet
  test('CANVAS_04 "Open" button on the KB node opens the Brand KB sheet', async ({ page }) => {
    const canvas = new CanvasPage(page, CLIENT_SLUG, CANVAS_SLUG);
    await canvas.goto();

    await canvas.nodeByType("kb").getByRole("button", { name: /open/i }).click();

    await expect(page.getByRole("heading", { name: "Brand KB" })).toBeVisible();
    await expect(page.getByRole("link", { name: /edit kb/i })).toHaveAttribute(
      "href",
      `/clients/${CLIENT_SLUG}/kb`
    );
  });

  // CANVAS_05 — Closing the Brand KB sheet hides it again
  test("CANVAS_05 closing the Brand KB sheet hides it", async ({ page }) => {
    const canvas = new CanvasPage(page, CLIENT_SLUG, CANVAS_SLUG);
    await canvas.goto();

    await canvas.nodeByType("kb").getByRole("button", { name: /open/i }).click();
    await expect(page.getByRole("heading", { name: "Brand KB" })).toBeVisible();

    await page.getByRole("button", { name: /close/i }).click();
    await expect(page.getByRole("heading", { name: "Brand KB" })).not.toBeVisible();
  });

  // CANVAS_06 — At least one edge exists on the canvas
  test("CANVAS_06 canvas has at least one visible edge", async ({ page }) => {
    const canvas = new CanvasPage(page, CLIENT_SLUG, CANVAS_SLUG);
    await canvas.goto();

    await expect(canvas.anyEdge).toBeAttached();
  });

  // CANVAS_07 — "Add script node" creates a new node and auto-connects it to the KB node
  // (gated — autosaves the new node + edge to the seeded canvas in the DB)
  test('CANVAS_07 "Add script node" adds a node and connects it to the KB node', async ({ page }) => {
    test.skip(
      !process.env.TEST_RUN_CANVAS_EDIT,
      "Set TEST_RUN_CANVAS_EDIT=1 to run state-writing canvas tests"
    );

    const canvas = new CanvasPage(page, CLIENT_SLUG, CANVAS_SLUG);
    await canvas.goto();
    await canvas.anyEdge.waitFor({ state: "attached" });

    const previousScriptIds = await canvas.getAllNodeIdsByType("script");
    const edgesBefore = await canvas.allEdges.count();

    await page.getByRole("button", { name: /add script node/i }).click();

    await canvas.waitForNewNodeByType("script", previousScriptIds);
    await expect(canvas.allEdges).toHaveCount(edgesBefore + 1, {
      timeout: 10_000,
    });
  });

  // CANVAS_08 — Double-clicking a script node opens the script focus view
  test("CANVAS_08 double-clicking a script node opens the script focus view", async ({ page }) => {
    const canvas = new CanvasPage(page, CLIENT_SLUG, CANVAS_SLUG);
    await canvas.goto();

    await canvas.nodeByType("script").dblclick();

    await expect(page.getByRole("button", { name: /back to canvas/i })).toBeVisible();
  });
});
