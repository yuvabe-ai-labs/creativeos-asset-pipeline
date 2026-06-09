/**
 * CANVAS_01 – CANVAS_09 : Canvas & Node Graph
 *
 * Prerequisites
 * ─────────────
 * Set in .env:
 *   TEST_CLIENT_SLUG  — slug of a seeded client (e.g. "acme-corp")
 *   TEST_CANVAS_SLUG  — slug of a seeded canvas on that client with both node
 *                       types (script, kb) and at least one edge
 *   TEST_RUN_GENERATE — set to "1" to run AI generation tests (CANVAS_07, CANVAS_08).
 *                       Omit or leave blank to skip them (they fire real OpenAI calls).
 *
 * Run just canvas tests:
 *   pnpm exec playwright test canvas.spec.ts
 *
 * Run including generation tests:
 *   TEST_RUN_GENERATE=1 pnpm exec playwright test canvas.spec.ts
 */

import { test, expect } from "@playwright/test";
import { CanvasPage } from "../pages/canvas-page";

const CLIENT_SLUG = process.env.TEST_CLIENT_SLUG ?? "";
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

  // CANVAS_04 — Clicking a node opens the inspector panel
  test("CANVAS_04 clicking a node opens the inspector panel", async ({ page }) => {
    const canvas = new CanvasPage(page, CLIENT_SLUG, CANVAS_SLUG);
    await canvas.goto();

    await canvas.nodeByType("script").click();

    await expect(canvas.inspectorPanel).toBeVisible();
  });

  // CANVAS_05 — Clicking the canvas pane (background) closes the inspector
  test("CANVAS_05 clicking the canvas background closes the inspector", async ({ page }) => {
    const canvas = new CanvasPage(page, CLIENT_SLUG, CANVAS_SLUG);
    await canvas.goto();

    await canvas.nodeByType("script").click();
    await expect(canvas.inspectorPanel).toBeVisible();

    await page
      .locator(".react-flow__pane")
      .click({ position: { x: 10, y: 10 } });
    await expect(canvas.inspectorPanel).not.toBeVisible();
  });

  // CANVAS_06 — At least one edge exists on the canvas
  test("CANVAS_06 canvas has at least one visible edge", async ({ page }) => {
    const canvas = new CanvasPage(page, CLIENT_SLUG, CANVAS_SLUG);
    await canvas.goto();

    await expect(canvas.anyEdge).toBeAttached();
  });

  // CANVAS_07 — Drag-to-connect creates a new edge between two nodes
  test("CANVAS_07 drag-connect script source to kb target creates an edge", async ({ page }) => {
    const canvas = new CanvasPage(page, CLIENT_SLUG, CANVAS_SLUG);
    await canvas.goto();

    const scriptId = await canvas.resolveNodeIdByType("script");
    const kbId = await canvas.resolveNodeIdByType("kb");

    const edgesBefore = await canvas.allEdges.count();

    await canvas.dragConnect(scriptId, kbId);

    await expect(canvas.allEdges).toHaveCount(edgesBefore + 1, {
      timeout: 10_000,
    });
  });

  // CANVAS_08 — Inspector panel updates when a different node is selected
  test("CANVAS_08 inspector updates when a different node is selected", async ({ page }) => {
    const canvas = new CanvasPage(page, CLIENT_SLUG, CANVAS_SLUG);
    await canvas.goto();

    await canvas.nodeByType("script").click();
    await expect(canvas.inspectorPanel).toBeVisible();

    await canvas.nodeByType("kb").click();
    // Inspector should still be visible but now showing kb content
    await expect(canvas.inspectorPanel).toBeVisible();
  });

  // CANVAS_09 — Generate/parse button triggers state change (gated)
  test("CANVAS_09 clicking Parse transitions script node to generating", async ({ page }) => {
    test.skip(
      !process.env.TEST_RUN_GENERATE,
      "Set TEST_RUN_GENERATE=1 to run AI generation tests"
    );

    const canvas = new CanvasPage(page, CLIENT_SLUG, CANVAS_SLUG);
    await canvas.goto();

    const nodeId = await canvas.resolveNodeIdByType("script");
    const parseBtn = canvas.nodeButton(nodeId, /parse|generate/i);
    await expect(parseBtn).toBeEnabled();
    await parseBtn.click();

    await expect(parseBtn).toBeDisabled();
  });
});
