import { type Page, type Locator, expect } from "@playwright/test";

export type NodeState = "idle" | "generating" | "ready" | "approved" | "error";

export const STATE_LABELS: Record<NodeState, string> = {
  idle: "Idle",
  generating: "Generating",
  ready: "Ready",
  approved: "Approved",
  error: "Error",
};

export class CanvasPage {
  readonly wrapper: Locator;

  constructor(
    readonly page: Page,
    readonly clientSlug: string,
    readonly canvasSlug: string
  ) {
    this.wrapper = page.getByTestId("rf__wrapper");
  }

  async goto() {
    await this.page.goto(`/clients/${this.clientSlug}/canvases/${this.canvasSlug}`);
    await this.wrapper.waitFor({ state: "visible" });
  }

  // ── Node locators ────────────────────────────────────────────────────────────

  node(id: string): Locator {
    return this.page.getByTestId(`rf__node-${id}`);
  }

  nodeByType(type: string): Locator {
    return this.page.locator(`.react-flow__node-${type}`).first();
  }

  nodesByType(type: string): Locator {
    return this.page.locator(`.react-flow__node-${type}`);
  }

  // ── Edge locators ────────────────────────────────────────────────────────────

  edge(id: string): Locator {
    return this.page.getByTestId(`rf__edge-${id}`);
  }

  get anyEdge(): Locator {
    return this.page.locator('[data-testid^="rf__edge-"]').first();
  }

  get allEdges(): Locator {
    return this.page.locator('[data-testid^="rf__edge-"]');
  }

  // ── Handle locators ──────────────────────────────────────────────────────────

  sourceHandle(nodeId: string): Locator {
    return this.page.locator(
      `.react-flow__handle[data-nodeid="${nodeId}"][data-handlepos="right"]`
    );
  }

  targetHandle(nodeId: string): Locator {
    return this.page.locator(
      `.react-flow__handle[data-nodeid="${nodeId}"][data-handlepos="left"]`
    );
  }

  // ── Inside-node locators ─────────────────────────────────────────────────────

  nodeButton(nodeId: string, name: RegExp | string): Locator {
    return this.node(nodeId).getByRole("button", { name });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  async resolveNodeIdByType(type: string): Promise<string> {
    const loc = this.nodeByType(type);
    await loc.waitFor({ state: "visible" });
    const id = await loc.getAttribute("data-id");
    if (!id) throw new Error(`No node of type ${type} found on canvas`);
    return id;
  }

  async expectNodeState(nodeId: string, state: NodeState) {
    await expect(this.node(nodeId)).toContainText(STATE_LABELS[state]);
  }

  async waitForNodeState(nodeId: string, state: NodeState, timeout = 90_000) {
    const label = STATE_LABELS[state];
    await this.page.waitForFunction(
      ({ testId, text }) => {
        const el = document.querySelector(`[data-testid="${testId}"]`);
        return (
          el?.textContent?.toLowerCase().includes(text.toLowerCase()) ?? false
        );
      },
      { testId: `rf__node-${nodeId}`, text: label },
      { timeout }
    );
  }

  async getAllNodeIdsByType(type: string): Promise<Set<string>> {
    const nodes = await this.page.locator(`.react-flow__node-${type}`).all();
    const ids = new Set<string>();
    for (const n of nodes) {
      const id = await n.getAttribute("data-id");
      if (id) ids.add(id);
    }
    return ids;
  }

  async waitForNewNodeByType(type: string, previousIds: Set<string>): Promise<string> {
    const selector = `.react-flow__node-${type}`;
    const prevArr = Array.from(previousIds);
    await this.page.waitForFunction(
      ({ sel, prev }) => {
        const els = Array.from(document.querySelectorAll(sel));
        return els.some((el) => {
          const id = el.getAttribute("data-id");
          return id !== null && !prev.includes(id);
        });
      },
      { sel: selector, prev: prevArr }
    );
    const nodes = await this.page.locator(selector).all();
    for (const n of nodes) {
      const id = await n.getAttribute("data-id");
      if (id && !previousIds.has(id)) return id;
    }
    throw new Error(`waitForNewNodeByType: no new ${type} node appeared`);
  }

  async dragConnect(sourceNodeId: string, targetNodeId: string) {
    const src = this.sourceHandle(sourceNodeId);
    const tgt = this.targetHandle(targetNodeId);

    await src.waitFor({ state: "visible" });
    await tgt.waitFor({ state: "visible" });

    await src.dragTo(tgt);
  }
}
