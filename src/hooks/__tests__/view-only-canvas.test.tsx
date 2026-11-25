import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const store = vi.hoisted(() => ({
  addNode: vi.fn(),
  updateNodeData: vi.fn(),
  connectNodes: vi.fn(),
  nodes: [] as unknown[],
  edges: [] as unknown[],
}));
const addScriptToCanvas = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/components/canvas/canvas-store-provider", () => ({
  useCanvasStore: (sel: (s: typeof store) => unknown) => sel(store),
  useCanvasStoreApi: () => ({ getState: () => store }),
}));
vi.mock("@/components/canvas/autosave-flush-context", () => ({ useFlushAutosave: () => async () => {} }));
vi.mock("@/services/file-node.service", () => ({ fileNodeService: {} }));
vi.mock("@/components/canvas/gallery-drawer/gallery-image-title", () => ({ galleryImageTitle: () => "t" }));
vi.mock("@/components/canvas/gallery-drawer/gallery-drawer", () => ({ GALLERY_DRAG_MIME: "application/x-gallery" }));
vi.mock("@/components/canvas/client-id-context", () => ({ useClientId: () => "c1" }));
vi.mock("@/services/scripts.service", () => ({ scriptsService: {} }));
vi.mock("@/lib/scripts/add-to-canvas", () => ({ addScriptToCanvas }));
vi.mock("@/lib/nodes/parse-script-node", () => ({ parseScriptNode: vi.fn() }));
vi.mock("sonner", () => ({ toast: {} }));
vi.mock("@xyflow/react", () => ({
  useReactFlow: () => ({ screenToFlowPosition: (p: { x: number; y: number }) => p }),
}));

import { CanvasEditableProvider } from "@/components/canvas/canvas-editable-context";
import { useGalleryDrawer } from "../use-gallery-drawer";
import { useAddAvatarNode } from "../use-add-avatar-node";
import { useAddScriptNode } from "../use-add-script-node";
import { useGalleryPaneDrop } from "../use-gallery-pane-drop";
import { useGalleryNodeDrop } from "../use-gallery-node-drop";
import type { GalleryImage } from "@/components/canvas/gallery-drawer/types";

const image = { id: "i1", source: "generation", imageUrl: "https://x/y.png", filename: "y.png" } as unknown as GalleryImage;

/** Renders a hook once under the editable flag and hands back what it returned. */
function run<T>(canEdit: boolean, useIt: () => T): T {
  let out!: T;
  function Probe() {
    out = useIt();
    return null;
  }
  renderToStaticMarkup(
    <CanvasEditableProvider value={canEdit}>
      <Probe />
    </CanvasEditableProvider>,
  );
  return out;
}

function dropEvent(data: Record<string, string>) {
  return {
    dataTransfer: { getData: (t: string) => data[t] ?? "", types: Object.keys(data), dropEffect: "" },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clientX: 5,
    clientY: 6,
  } as unknown as React.DragEvent & { preventDefault: ReturnType<typeof vi.fn> };
}

const galleryPayload = JSON.stringify({ images: [image] });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("gallery adds on a canvas that is not editable", () => {
  it("handleAdd creates no node when view-only, and does when editable", () => {
    run(false, () => useGalleryDrawer()).handleAdd([image], { position: { x: 0, y: 0 } });
    expect(store.addNode).not.toHaveBeenCalled();
    expect(store.connectNodes).not.toHaveBeenCalled();

    run(true, () => useGalleryDrawer()).handleAdd([image], { position: { x: 0, y: 0 } });
    expect(store.addNode).toHaveBeenCalledTimes(1);
  });

  it("addAvatarNode adds nothing when view-only, and does when editable", () => {
    run(false, () => useAddAvatarNode())("a1", { position: { x: 0, y: 0 } });
    expect(store.addNode).not.toHaveBeenCalled();

    run(true, () => useAddAvatarNode())("a1", { position: { x: 0, y: 0 } });
    expect(store.addNode).toHaveBeenCalledWith("avatar", { x: 0, y: 0 }, expect.any(String));
  });

  it("addScriptNode adds nothing when view-only, and does when editable", async () => {
    await run(false, () => useAddScriptNode())("s1", { x: 0, y: 0 });
    expect(addScriptToCanvas).not.toHaveBeenCalled();

    await run(true, () => useAddScriptNode())("s1", { x: 0, y: 0 });
    expect(addScriptToCanvas).toHaveBeenCalledTimes(1);
  });
});

describe("pane drop", () => {
  it("does nothing when view-only: no drop target, no node, event left alone", () => {
    const h = run(false, () => useGalleryPaneDrop());
    const over = dropEvent({ "application/x-gallery": galleryPayload });
    h.onDragOver(over);
    expect(over.preventDefault).not.toHaveBeenCalled();

    const drop = dropEvent({ "application/x-gallery": galleryPayload });
    h.onDrop(drop);
    expect(drop.preventDefault).not.toHaveBeenCalled();
    expect(store.addNode).not.toHaveBeenCalled();
  });

  it("adds a file node when editable", () => {
    const h = run(true, () => useGalleryPaneDrop());
    h.onDrop(dropEvent({ "application/x-gallery": galleryPayload }));
    expect(store.addNode).toHaveBeenCalledTimes(1);
  });
});

describe("node drop", () => {
  it("does nothing when view-only", () => {
    const h = run(false, () => useGalleryNodeDrop("n1", { x: 0, y: 0 }));
    const over = dropEvent({ "application/x-gallery": galleryPayload });
    h.onDragOver(over);
    expect(over.preventDefault).not.toHaveBeenCalled();

    h.onDrop(dropEvent({ "application/x-gallery": galleryPayload }));
    expect(store.addNode).not.toHaveBeenCalled();
    expect(store.connectNodes).not.toHaveBeenCalled();
  });

  it("adds and connects a file node when editable", () => {
    const h = run(true, () => useGalleryNodeDrop("n1", { x: 0, y: 0 }));
    h.onDrop(dropEvent({ "application/x-gallery": galleryPayload }));
    expect(store.addNode).toHaveBeenCalledTimes(1);
    expect(store.connectNodes).toHaveBeenCalledWith(expect.any(String), "n1");
  });
});
