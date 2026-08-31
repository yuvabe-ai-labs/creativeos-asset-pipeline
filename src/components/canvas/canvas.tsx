"use client";

import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  type Connection,
  type Edge,
  type NodeTypes,
  type OnBeforeDelete,
  type XYPosition,
} from "@xyflow/react";
import { useShallow } from "zustand/react/shallow";
import { toast } from "sonner";
import { canConnect, flowToPersisted, type AppNode } from "@/lib/canvas-nodes";
import { saveCanvasNodesAction } from "@/lib/actions/nodes";
import { readClipboardImage, clipboardHasImage } from "@/lib/nodes/clipboard-image";
import { fileNodeService } from "@/services/file-node.service";
import { ScriptNode } from "@/components/nodes/script-node";
import { KBNode } from "@/components/nodes/kb-node";
import { FileNode } from "@/components/nodes/file-node";
import { TextNode } from "@/components/nodes/text-node";
import { PromptNode } from "@/components/nodes/prompt-node";
import { ShotNode } from "@/components/nodes/shot-node";
import { DrawNode } from "@/components/nodes/draw-node";
import { ImageGenNode } from "@/components/nodes/image-gen-node";
import { VideoPromptNode } from "@/components/nodes/video-prompt-node";
import { VideoGenNode } from "@/components/nodes/video-gen-node";
import { PostNode } from "@/components/nodes/post-node";
import { useCanvasStore, useCanvasStoreApi } from "./canvas-store-provider";
import { useAnyFocusViewOpen } from "@/hooks/use-focus-view-open";
import { CanvasAutosave } from "./canvas-autosave";
import { ConnectionBadge } from "./connection-badge";
import { QuickAddMenu } from "./quick-add-menu";
import { mnemonicToType, isEditableTarget } from "@/lib/canvas-node-options";
import { useCanvasLock } from "@/hooks/use-canvas-lock";
import { useCanvasApprovalSync } from "./use-canvas-approval-sync";
import { CanvasEditableProvider } from "./canvas-editable-context";
import { AutosaveFlushProvider } from "./autosave-flush-context";
import { CanvasIdProvider } from "./canvas-id-context";
import { ClientIdProvider } from "./client-id-context";
import { GenerationTray } from "./generation-tray";
import { CopilotPanel } from "./copilot-panel";
import { LockBanner } from "./lock-banner";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { useDeleteConfirmation } from "@/hooks/use-delete-confirmation";
import { CanvasKBStatus, CanvasKBBadge } from "./canvas-kb-status";
import { GalleryDrawerIntegration } from "./gallery-drawer-integration";
import { ReviewDrawer } from "./review-drawer/review-drawer";
import type { GalleryPaneDropHandlers } from "@/hooks/use-gallery-pane-drop";
import type { ClientKBJobRow } from "@/lib/db/types";

// Register custom node types once (stable reference — never inline this object).
const nodeTypes: NodeTypes = {
  script: ScriptNode,
  kb: KBNode,
  file: FileNode,
  text: TextNode,
  prompt: PromptNode,
  shot: ShotNode,
  draw: DrawNode,
  "image-gen": ImageGenNode,
  "video-prompt": VideoPromptNode,
  "video-gen": VideoGenNode,
  post: PostNode,
};

export function Canvas({
  canvasId,
  clientId,
  initialKBJob,
  hasActiveKB,
  initialDriveRootFolder,
}: {
  canvasId: string;
  clientId: string;
  initialKBJob: ClientKBJobRow | null;
  hasActiveKB: boolean;
  initialDriveRootFolder: { id: string; name: string } | null;
  // No `reviewMode` prop: D161's "entering to review does not take the edit lock" is
  // DEFERRED (see the ADR log), so the canvas no longer needs to know how it was entered —
  // every entry takes the lock, as before. `?review=1` still opens the review drawer, but
  // that is wired in the page via ReviewDrawerProvider, not here.
  // No `focusNodeId` prop either: R9.3's `?node=` pointer is read from the live URL inside
  // ReviewDrawer. A prop is a snapshot, and a same-canvas inbox link does not remount this
  // subtree, so the snapshot went stale and the second asset never opened.
}) {
  // One subscription, shallow-compared, so the component only re-renders when
  // these slices actually change.
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    connectNodes,
    duplicateNode,
    duplicateNodes,
    updateNodeData,
    deleteNode,
  } = useCanvasStore(
    useShallow((s) => ({
      nodes: s.nodes,
      edges: s.edges,
      onNodesChange: s.onNodesChange,
      onEdgesChange: s.onEdgesChange,
      onConnect: s.onConnect,
      addNode: s.addNode,
      connectNodes: s.connectNodes,
      duplicateNode: s.duplicateNode,
      duplicateNodes: s.duplicateNodes,
      updateNodeData: s.updateNodeData,
      deleteNode: s.deleteNode,
    })),
  );

  const storeApi = useCanvasStoreApi();

  // A node focus view is a modal surface over the canvas. Its sheet is portaled to
  // <body>, so the canvas's document-level shortcuts (React Flow's Delete/Backspace
  // included) keep firing behind it unless we explicitly stand down.
  const anyFocusViewOpen = useAnyFocusViewOpen();

  const { canEdit, heldByName, canTakeOver, sessionId, takeOver, reportLockLost } =
    useCanvasLock(canvasId);

  // R8.3: keep every node's ApprovalBadge live while the canvas is open, so a senior's
  // decision made elsewhere lands here without a reload.
  useCanvasApprovalSync(canvasId);
  // Read the latest canEdit from event handlers/closures without re-subscribing them.
  const canEditRef = useRef(canEdit);
  useLayoutEffect(() => {
    canEditRef.current = canEdit;
  });

  // Confirm every node deletion (context menu + keyboard) through one dialog.
  const { onBeforeDelete: confirmDelete, dialogProps: deleteDialog } =
    useDeleteConfirmation();
  const onBeforeDelete = useCallback<OnBeforeDelete<AppNode>>(
    (payload) => {
      if (!canEditRef.current) return Promise.resolve(false); // read-only: no deletion
      return confirmDelete(payload);
    },
    [confirmDelete],
  );

  const nodesRef = useRef(nodes);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  const rfRef = useRef<{
    screenToFlowPosition: (pos: { x: number; y: number }) => XYPosition;
  } | null>(null);
  // Populated by GalleryDrawerIntegration (which sits inside ReactFlowProvider
  // and can call useReactFlow); wired onto <ReactFlow>'s onDragOver/onDrop below
  // so pane-level gallery drops go through React's synthetic event system, same
  // as node-level drops — required for stopPropagation to actually prevent both
  // from firing on one drop.
  const galleryPaneDropRef = useRef<GalleryPaneDropHandlers>({
    onDragOver: () => {},
    onDrop: () => {},
  });
  const [quickAdd, setQuickAdd] = useState<{
    screenX: number;
    screenY: number;
    flowPos: XYPosition;
  } | null>(null);
  const [canPaste, setCanPaste] = useState(false);
  // Last pointer position over the pane (screen coords) — where keyboard-opened
  // palette and instant mnemonics place the new node.
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const quickAddOpenRef = useRef(false);
  useEffect(() => {
    quickAddOpenRef.current = quickAdd !== null;
  }, [quickAdd]);

  const handleAddNode = useCallback(
    (type: string, position: XYPosition) => {
      const newNodeId = crypto.randomUUID();
      addNode(type, position, newNodeId);
      if (type === "script") {
        const kbNode = nodesRef.current.find((n) => n.type === "kb");
        if (kbNode) connectNodes(kbNode.id, newNodeId);
      }
    },
    [addNode, connectNodes],
  );

  // Paste an image from the clipboard as a new File node at the cursor. Persist the
  // node first (replace-all upsert) so the /file route finds it (dodges the autosave race).
  const handlePasteImage = useCallback(
    async (flowPos: XYPosition) => {
      if (!canEditRef.current) return; // read-only: no mutations
      const img = await readClipboardImage();
      if (!img) {
        toast.error("Couldn't read an image from the clipboard.");
        return;
      }
      const newNodeId = crypto.randomUUID();
      addNode("file", flowPos, newNodeId);
      try {
        await saveCanvasNodesAction(
          canvasId,
          storeApi.getState().nodes.map(flowToPersisted),
        );
        const file = new File([img.blob], img.filename, { type: img.blob.type });
        const result = await fileNodeService.upload(newNodeId, file);
        if (!result.fileUrl) throw new Error("Upload failed");
        updateNodeData(newNodeId, {
          filename: result.filename,
          fileExt: result.fileExt,
          fileKind: result.fileKind,
          fileUrl: result.fileUrl,
          fileSizeBytes: result.fileSizeBytes,
          imageWidth: result.imageWidth,
          imageHeight: result.imageHeight,
        });
        toast.success("Image pasted");
      } catch (e) {
        deleteNode(newNodeId);
        toast.error(e instanceof Error ? e.message : "Couldn't paste image");
      }
    },
    [addNode, updateNodeData, deleteNode, canvasId, storeApi],
  );

  const openQuickAddAt = useCallback((screenX: number, screenY: number) => {
    if (!canEditRef.current) return; // read-only: no add menu
    if (!rfRef.current) return;
    const flowPos = rfRef.current.screenToFlowPosition({ x: screenX, y: screenY });
    setQuickAdd({ screenX, screenY, flowPos });
    setCanPaste(false);
    void clipboardHasImage().then(setCanPaste);
  }, []);

  // Returns the last recorded pointer position, or the viewport center when the
  // user hasn't moved the mouse over the canvas yet (e.g. right after page load).
  const pointerOrCenter = useCallback(
    () => lastPointer.current ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    [],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!canEditRef.current) return; // read-only: no keyboard mutations
      // A focus view owns the keyboard while it's open — read the store here rather than
      // closing over it, so the listener never re-subscribes and never goes stale.
      if (storeApi.getState().openFocusViewIds.length > 0) return;
      // Duplicate (existing behavior) — modified key, fires regardless of focus.
      if ((e.ctrlKey || e.metaKey) && e.key === "d") {
        e.preventDefault();
        const selectedIds = nodesRef.current
          .filter((n) => n.selected && n.type !== "kb")
          .map((n) => n.id);
        void duplicateNodes(selectedIds, canvasId);
        return;
      }

      // The following shortcuts must not fire while typing or while the palette
      // is already open (its input owns the keystrokes).
      if (isEditableTarget(document.activeElement)) return;
      if (quickAddOpenRef.current) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // "/" opens the palette at the last pointer position (or viewport center).
      if (e.key === "/") {
        const p = pointerOrCenter();
        e.preventDefault();
        openQuickAddAt(p.x, p.y);
        return;
      }

      // Bare mnemonic letter → instant create at the last pointer position (or viewport center).
      const type = mnemonicToType(e.key);
      if (type) {
        const p = pointerOrCenter();
        if (!rfRef.current) return;
        e.preventDefault();
        handleAddNode(type, rfRef.current.screenToFlowPosition({ x: p.x, y: p.y }));
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [duplicateNode, duplicateNodes, canvasId, openQuickAddAt, handleAddNode, pointerOrCenter, storeApi]);

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const source = nodes.find((n) => n.id === connection.source);
      const target = nodes.find((n) => n.id === connection.target);
      if (!source || !target) return false;
      if (!canConnect(source.type ?? "", target.type ?? "")) return false;
      // script → prompt: one script can only wire to a single prompt
      if (source.type === "script" && target.type === "prompt") {
        const alreadyConnected = edges.some(
          (e) =>
            e.source === connection.source &&
            nodes.find((n) => n.id === e.target)?.type === "prompt",
        );
        if (alreadyConnected) return false;
      }
      // shot → prompt: only one shot input per prompt
      if (source.type === "shot" && target.type === "prompt") {
        const alreadyShotConnected = edges.some(
          (e) =>
            e.target === connection.target &&
            nodes.find((n) => n.id === e.source)?.type === "shot",
        );
        if (alreadyShotConnected) return false;
      }
      // file → prompt: max 5 file inputs per prompt node
      if (source.type === "file" && target.type === "prompt") {
        const fileInputCount = edges.filter(
          (e) =>
            e.target === connection.target &&
            nodes.find((n) => n.id === e.source)?.type === "file",
        ).length;
        if (fileInputCount >= 5) return false;
      }
      return true;
    },
    [nodes, edges],
  );

  // Render Script -> Shot edges dashed: they are lineage/provenance (D21), NOT live
  // data flow. Derived from node types so it survives reload without a schema change.
  const nodeTypeById = useMemo(() => {
    const m = new Map<string, string | undefined>();
    for (const n of nodes) m.set(n.id, n.type);
    return m;
  }, [nodes]);
  const displayEdges = useMemo(
    () =>
      edges.map((e) =>
        nodeTypeById.get(e.source) === "script" &&
        nodeTypeById.get(e.target) === "shot"
          ? {
              ...e,
              animated: true,
              style: {
                strokeDasharray: "6 4",
                stroke: "var(--muted-foreground)",
              },
            }
          : e,
      ),
    [edges, nodeTypeById],
  );

  return (
    <ReactFlowProvider>
    <ClientIdProvider value={clientId}>
    <CanvasIdProvider value={canvasId}>
    <CanvasEditableProvider value={canEdit}>
    <AutosaveFlushProvider>
    <div className="absolute inset-0 bg-[var(--neutral-50)]">
      <CanvasAutosave
        canvasId={canvasId}
        sessionId={sessionId}
        canEdit={canEdit}
        onLockLost={reportLockLost}
      />

      <ConnectionBadge />

      {/* Headless KB status subscriber — drives kbStatus in the canvas store */}
      <CanvasKBStatus clientId={clientId} initialJob={initialKBJob} hasActiveKB={hasActiveKB} />

      {/* Top-right overlay: KB badge */}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <CanvasKBBadge />
      </div>

      {/* Gallery drawer + its canvas integrations (G shortcut, pane drop). */}
      <GalleryDrawerIntegration
        canvasId={canvasId}
        clientId={clientId}
        initialDriveRootFolder={initialDriveRootFolder}
        paneDropRef={galleryPaneDropRef}
      />

      {/* D163: review drawer. Mounted here (inside ReactFlowProvider and the canvas store)
          because its rows fly the canvas to a node — the same navigation the generation
          tray performs. Non-modal, so it stays put under a focus view (R6.11). */}
      <ReviewDrawer canvasId={canvasId} />

      {!canEdit && (
        <LockBanner heldByName={heldByName} canTakeOver={canTakeOver} onTakeOver={takeOver} />
      )}

      <DeleteConfirmDialog {...deleteDialog} />

      {quickAdd && (
        <QuickAddMenu
          screenX={quickAdd.screenX}
          screenY={quickAdd.screenY}
          flowPos={quickAdd.flowPos}
          onSelect={(type) => handleAddNode(type, quickAdd.flowPos)}
          onClose={() => { setQuickAdd(null); setCanPaste(false); }}
          canPasteImage={canPaste}
          onPasteImage={() => handlePasteImage(quickAdd.flowPos)}
        />
      )}

      <ReactFlow
        nodes={nodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        onBeforeDelete={onBeforeDelete}
        // null tears React Flow's document keydown listener down entirely (useKeyPress
        // no-ops on a null keyCode) rather than us swallowing the event after the fact.
        deleteKeyCode={canEdit && !anyFocusViewOpen ? ["Backspace", "Delete"] : null}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        selectionKeyCode={null}
        panOnScroll
        panOnDrag={[1]}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
        className="!bg-transparent"
        onInit={(instance) => {
          rfRef.current = instance;
        }}
        onPointerMove={(e) => {
          lastPointer.current = { x: e.clientX, y: e.clientY };
        }}
        onDragOver={(e) => galleryPaneDropRef.current.onDragOver(e)}
        onDrop={(e) => galleryPaneDropRef.current.onDrop(e)}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          openQuickAddAt(e.clientX, e.clientY);
        }}
        onSelectionContextMenu={(e, selectedNodes) => {
          // The NodesSelection overlay sits above nodes (and above the bare pane)
          // and intercepts contextmenu events after drag-select. Temporarily hide
          // it so elementFromPoint finds what's underneath, then re-dispatch there
          // so its ContextMenuTrigger fires — NodeContextMenu reads live selection
          // state and shows batched Duplicate/Delete for the whole selection.
          //
          // dispatchEvent only bubbles UP from the given target, so when the click
          // landed on a node we must re-dispatch on that exact deep element (not
          // e.g. the outer .react-flow__node wrapper) so the bubble path still
          // passes through ContextMenuTrigger's own listener div partway up.
          //
          // A right-click on empty space *inside* the selection box has no node
          // underneath at all — elementFromPoint resolves to the bare pane, whose
          // own onPaneContextMenu would open the quick-add palette instead. Fall
          // back to dispatching directly on a selected node's trigger div.
          e.preventDefault();
          const overlay = e.target as HTMLElement;
          overlay.style.pointerEvents = "none";
          const underneath = document.elementFromPoint(e.clientX, e.clientY);
          overlay.style.pointerEvents = "";
          const target = underneath?.closest(".react-flow__node")
            ? underneath
            : selectedNodes[0]
              ? document.querySelector(
                  `.react-flow__node[data-id="${selectedNodes[0].id}"] [data-slot="context-menu-trigger"]`,
                )
              : null;
          target?.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              cancelable: true,
              clientX: e.clientX,
              clientY: e.clientY,
              screenX: e.screenX,
              screenY: e.screenY,
            }),
          );
        }}
        onPaneClick={() => { setQuickAdd(null); setCanPaste(false); }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={48}
          size={2}
          color="rgba(148,163,184,0.45)"
        />
        <Controls showInteractive={false} />
      </ReactFlow>

      <GenerationTray canvasId={canvasId} />
      <CopilotPanel canvasId={canvasId} /> 
    </div>
    </AutosaveFlushProvider>
    </CanvasEditableProvider>
    </CanvasIdProvider>
    </ClientIdProvider>
    </ReactFlowProvider>
  );
}
