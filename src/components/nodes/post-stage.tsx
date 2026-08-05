// src/components/nodes/post-stage.tsx
"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Stage, Layer, Transformer, Rect } from "react-konva";
import type Konva from "konva";
import type { PostLayer } from "@/lib/post/types";
import { pxToNormalized, fontSizeToPx } from "@/lib/post/units";
import { resolveFontKey, type FontKey } from "@/lib/post/fonts";
import { Textarea } from "@/components/ui/textarea";
import { PostLayerRender } from "./post-layer-render";
import { FONT_CSS_FAMILY } from "./post-fonts";

type Props = {
  layers: PostLayer[];
  containerW: number;
  containerH: number;
  selectedIds: string[];
  onSelect: (id: string | null) => void;
  onToggleSelect: (id: string) => void;
  onSelectMany: (ids: string[]) => void;
  resolveNodeImageUrl: (nodeId: string) => string | undefined;
  updateLayerLive: (id: string, patch: Partial<PostLayer>) => void;
  commitLayerChange: () => void;
  stageRef: React.RefObject<Konva.Stage | null>;
  onCommitText: (id: string, text: string) => void;
  // Forwarded straight through to PostLayerRender/PostImageLayer — this component holds
  // no state for it. The actual natural-size map is held by a later integration task in
  // post-focus-view.tsx.
  onImageLoaded: (layerId: string, naturalW: number, naturalH: number) => void;
};

export function PostStage({
  layers, containerW, containerH, selectedIds, onSelect, onToggleSelect, onSelectMany,
  resolveNodeImageUrl, updateLayerLive, commitLayerChange, stageRef, onCommitText, onImageLoaded,
}: Props) {
  const nodeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const transformerRef = useRef<Konva.Transformer>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [stageContainer, setStageContainer] = useState<HTMLDivElement | null>(null);
  const [editingRect, setEditingRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  // Rubber-band drag-select rectangle, in stage px, while a drag is in progress; null otherwise.
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  // Set when a real marquee completes, consumed by the very next per-layer click. See
  // handleStageMouseUp for why Konva fires that click at all.
  const suppressNextClickRef = useRef(false);

  // Attach the Transformer to every currently-selected node whenever selection changes.
  // useLayoutEffect, not useEffect, because export depends on it: use-post-export's
  // flushSync(() => onDeselect()) only guarantees render + LAYOUT effects have run before
  // it returns, so as a passive effect the selection handles could still be attached when
  // stage.toBlob() captures pixels — and get baked into the PNG. Everything here is
  // synchronous Konva work, so running it earlier is safe.
  useLayoutEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const nodes = selectedIds
      .map((id) => nodeRefs.current.get(id))
      .filter((n): n is Konva.Node => n !== undefined);
    transformer.nodes(nodes);
    transformer.getLayer()?.batchDraw();
  }, [selectedIds, layers]);

  /**
   * A rule and an arrow are one-dimensional: they run end to end across the middle of their
   * box, so the only handles that mean anything are the two ends. The default eight offered
   * six that changed the box's height — which a line has no visible use for — and made
   * lengthening one a hunt for the right handle among near-identical dots.
   *
   * Only when a single one is selected: a mixed multi-select still needs the full set.
   */
  const soleSelected = selectedIds.length === 1
    ? layers.find((l) => l.id === selectedIds[0])
    : undefined;
  const isStrokeOnlyShape =
    soleSelected?.kind === "shape" &&
    (soleSelected.shape === "line" || soleSelected.shape === "arrow");
  const enabledAnchors = isStrokeOnlyShape ? ["middle-left", "middle-right"] : undefined;

  // Refs must not be read during render (react-hooks/refs) — resolve the editing node's
  // client rect here instead, and have the overlay below read the resulting state.
  useLayoutEffect(() => {
    const node = editingTextId ? nodeRefs.current.get(editingTextId) : undefined;
    const rect = node ? node.getClientRect({ relativeTo: node.getStage() ?? undefined }) : null;
    setEditingRect(rect);
  }, [editingTextId]);

  // Reads a node's post-gesture geometry into the layer WITHOUT committing, so a multi-node
  // gesture can write every node and then land as a single undo step.
  function writeNodeGeometry(id: string, node: Konva.Node) {
    // Konva's Transformer RESIZES BY SCALING, never by changing width/height directly —
    // read scaleX/scaleY back into width/height, then reset scale to 1, or the layer's
    // stored geometry silently drifts from what's actually rendered (Global Constraints).
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const widthPx = "width" in node.attrs ? node.width() * scaleX : node.width();
    const heightPx = "height" in node.attrs ? node.height() * scaleY : node.height();
    node.scaleX(1);
    node.scaleY(1);
    updateLayerLive(id, {
      x: pxToNormalized(node.x(), containerW),
      y: pxToNormalized(node.y(), containerH),
      w: pxToNormalized(widthPx, containerW),
      h: pxToNormalized(heightPx, containerH),
      rotation: node.rotation(),
    });
  }

  function commitNodeGeometry(id: string, node: Konva.Node) {
    writeNodeGeometry(id, node);
    commitLayerChange();
  }

  function idForNode(node: Konva.Node): string | undefined {
    return [...nodeRefs.current.entries()].find(([, n]) => n === node)?.[0];
  }

  // Which TOP-LEVEL layer a click landed on, walking up from whatever node Konva reports as
  // the event target. Konva only ever sets `evt.target` to a Shape, never to a Group — and a
  // GroupLayer's children are rendered with isSelected hardcoded false, so their own
  // `draggable` is always false. Reading `e.target.draggable()` directly therefore can NEVER
  // see a selected group, which is why the guard below resolves an id instead.
  function resolveHitLayerId(target: Konva.Node, stage: Konva.Stage): string | null {
    let node: Konva.Node | null = target;
    while (node && node !== stage) {
      for (const [id, topNode] of nodeRefs.current.entries()) {
        if (topNode === node) return id;
      }
      node = node.getParent();
    }
    return null;
  }

  // Rubber-band select: a drag starting on empty space — or on a layer that isn't the one
  // currently being moved — draws a selection rect. A plain click with no drag never grows
  // past the `> 4`px guard in mouseup, so it does nothing extra.
  function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;
    // Every new gesture starts un-suppressed, and this MUST run before the early returns
    // below. A marquee only gets its suppression flag consumed if Konva actually synthesizes
    // a click, which it only does when the gesture started and ended on the SAME shape — so a
    // marquee released over a different layer, over empty stage, or off-canvas leaves the flag
    // set. If the reset sat after the "already selected" return, the very next shift-click on
    // a selected layer would take that early return, never reset, and have its click eaten.
    suppressNextClickRef.current = false;

    // The Transformer owns its resize/rotate handles as child nodes, so grabbing one reports
    // the ANCHOR as the event target. It belongs to no layer, so it resolves to a null hitId
    // and would fall through to the "empty space" branch below — clearing the selection,
    // detaching the Transformer mid-gesture, and killing the resize outright.
    for (let n: Konva.Node | null = e.target; n && n !== stage; n = n.getParent()) {
      if (n === transformerRef.current) return;
    }

    const hitId = e.target === stage ? null : resolveHitLayerId(e.target, stage);
    const hitLayer = hitId ? layers.find((l) => l.id === hitId) : null;

    // Locked layers are inert to selection everywhere else (see the per-layer onSelect
    // below), so a mousedown on one must not clear the current selection either.
    if (hitLayer?.locked) return;

    // The layer under the cursor is already selected, so it IS draggable — defer to Konva's
    // own move-drag rather than starting a rubber-band on top of it. Matching by id (not by
    // `.draggable()`) is what makes this correct for groups: the click lands on some child,
    // and resolveHitLayerId walks up to the group's own top-level node.
    if (hitId && selectedIds.includes(hitId)) return;

    const pos = stage.getPointerPosition();
    if (!pos) return;
    dragStartRef.current = pos;
    setSelectionRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
    // Only clear eagerly when the drag began on genuinely empty space. Deselecting on a
    // mousedown that turns out to be a plain click on a layer would flash the selection off
    // and straight back on, since Konva's click synthesis re-selects that layer a moment
    // later — and mousedown/mouseup are separate events with a real gap between them.
    if (hitId === null) onSelect(null);
  }

  // Right-click must target what's under the cursor before the context menu opens, or the
  // menu acts on whatever was selected beforehand — i.e. right-clicking B while A is selected
  // and pressing Delete would delete A. Deliberately does NOT preventDefault: the shadcn
  // ContextMenu wrapping this stage opens off the native `contextmenu` event.
  function handleStageContextMenu(e: Konva.KonvaEventObject<PointerEvent>) {
    const stage = e.target.getStage();
    if (!stage) return;
    const hitId = e.target === stage ? null : resolveHitLayerId(e.target, stage);
    if (hitId === null) {
      onSelect(null);
      return;
    }
    // Keep an existing multi-selection intact when right-clicking inside it — that is how a
    // user reaches "group these five", and re-selecting would silently discard the other four.
    if (!selectedIds.includes(hitId)) onSelect(hitId);
  }

  function handleStageMouseMove(e: Konva.KonvaEventObject<MouseEvent>) {
    if (!dragStartRef.current) return;
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos) return;
    const start = dragStartRef.current;
    setSelectionRect({
      x: Math.min(start.x, pos.x), y: Math.min(start.y, pos.y),
      w: Math.abs(pos.x - start.x), h: Math.abs(pos.y - start.y),
    });
  }

  function handleStageMouseUp() {
    if (!dragStartRef.current || !selectionRect) {
      dragStartRef.current = null;
      setSelectionRect(null);
      return;
    }
    if (selectionRect.w > 4 || selectionRect.h > 4) { // ignore accidental tiny drags (= a click)
      const hitIds = layers
        .filter((l) => !l.hidden && !l.locked)
        .filter((l) => {
          const lx = l.x * containerW, ly = l.y * containerH, lw = l.w * containerW, lh = l.h * containerH;
          return (
            lx < selectionRect.x + selectionRect.w && lx + lw > selectionRect.x &&
            ly < selectionRect.y + selectionRect.h && ly + lh > selectionRect.y
          );
        })
        .map((l) => l.id);
      if (hitIds.length) onSelectMany(hitIds);
      // Konva synthesizes a `click` on mouseup whenever the gesture STARTED and ENDED on the
      // same shape (Stage.js: `if (_mouseListenClick && clickStartShape === shape)`), and
      // nothing between pointerdown and the end of pointerup clears that flag — a drag does
      // not suppress it. Since mouseup bubbles to the Stage first, this handler's
      // onSelectMany would run and then the click would immediately collapse the selection
      // back to the single layer under the cursor. That is the normal case, not an edge one:
      // a Post node auto-places its connected image full-bleed, so most marquees begin and
      // end on that one shape.
      suppressNextClickRef.current = true;
    }
    dragStartRef.current = null;
    setSelectionRect(null);
  }

  // Native `mouseup` is only bound on the Konva Stage's own container element, so releasing
  // the button anywhere else on the page (a side panel, the header, even outside the browser
  // window) never reaches handleStageMouseUp — the rubber-band state is left stuck forever,
  // and the dashed marquee keeps rendering until the next mousedown on the canvas happens to
  // reset it. Fix: also finish the drag from a `window`-level listener, which sees `mouseup`
  // regardless of what element the release lands on. A ref mirrors the latest
  // handleStageMouseUp closure so the listener itself can be registered once on mount
  // (avoids churn from re-subscribing on every selectionRect/layers change) while still
  // reading current props/state when it fires. Calling handleStageMouseUp a second time for
  // the same mouseup (once via Stage's own binding, once via this listener, since the native
  // event bubbles to window regardless) is harmless: the first call already nulled out
  // dragStartRef.current/selectionRect, so the second call hits the early-return branch.
  const handleStageMouseUpRef = useRef(handleStageMouseUp);
  handleStageMouseUpRef.current = handleStageMouseUp;
  useEffect(() => {
    function onWindowMouseUp() {
      handleStageMouseUpRef.current();
    }
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => window.removeEventListener("mouseup", onWindowMouseUp);
  }, []);

  return (
    <div className="relative">
      <Stage
        ref={(node) => {
          stageRef.current = node;
          if (node) setStageContainer(node.container());
        }}
        width={containerW}
        height={containerH}
        className="overflow-hidden rounded-lg border border-border bg-white shadow-card"
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onContextMenu={handleStageContextMenu}
      >
        <Layer>
          {layers.filter((l) => !l.hidden).map((layer) => (
            <PostLayerRender
              key={layer.id}
              layer={layer}
              containerW={containerW}
              containerH={containerH}
              allLayers={layers}
              isSelected={selectedIds.includes(layer.id)}
              isBeingEdited={layer.id === editingTextId}
              resolveNodeImageUrl={resolveNodeImageUrl}
              nodeRef={(node) => {
                if (node) nodeRefs.current.set(layer.id, node);
                else nodeRefs.current.delete(layer.id);
              }}
              onSelect={(evt) => {
                if (layer.locked) return;
                // Swallow the click Konva synthesizes at the end of a marquee that began and
                // ended on this layer — without this it would replace the just-made
                // multi-selection with this single layer.
                if (suppressNextClickRef.current) {
                  suppressNextClickRef.current = false;
                  return;
                }
                if (evt?.evt.shiftKey) onToggleSelect(layer.id);
                else onSelect(layer.id);
              }}
              onDragEnd={(node) => commitNodeGeometry(layer.id, node)}
              onDblClickText={() => layer.kind === "text" && !layer.locked && setEditingTextId(layer.id)}
              onImageLoaded={onImageLoaded}
              // Grouped text (every template CTA label) registers here and opens the same
              // inline editor, so a button can be reworded without ungrouping it first.
              registerRef={(id, node) => {
                if (node) nodeRefs.current.set(id, node);
                else nodeRefs.current.delete(id);
              }}
              onDblClickTextFor={setEditingTextId}
              editingLayerId={editingTextId}
            />
          ))}
          {selectionRect && (
            <Rect
              x={selectionRect.x} y={selectionRect.y} width={selectionRect.w} height={selectionRect.h}
              fill="rgba(88,41,199,0.08)" stroke="#5829c7" strokeWidth={1} dash={[4, 4]} listening={false}
            />
          )}
          <Transformer
            ref={transformerRef}
            anchorStroke="#5829c7"
            anchorFill="#ffffff"
            anchorSize={10}
            anchorCornerRadius={5}
            borderStroke="#5829c7"
            borderStrokeWidth={2}
            rotateAnchorOffset={24}
            keepRatio={false}
            enabledAnchors={enabledAnchors}
            boundBoxFunc={(oldBox, newBox) =>
              // A line's box is short by design, and its height is never dragged now that only
              // the end anchors are live — so hold it to the width floor alone, or the minimum
              // would reject every resize of a box already under 20px tall.
              newBox.width < 20 || (!isStrokeOnlyShape && newBox.height < 20) ? oldBox : newBox
            }
            onTransformEnd={() => {
              // Konva fires 'transformend' on the Transformer exactly ONCE per gesture, with
              // `target` = getNode() = _nodes[0] (Transformer.js: `this._fire('transformend',
              // { evt, target: node })`). The per-node events it fires afterwards go to the
              // nodes themselves, which nothing here listens to. Reading `e.target` therefore
              // committed only the FIRST selected layer: every other layer in a multi-select
              // resize kept a stale scaleX/scaleY and never wrote its new geometry back, so it
              // snapped to its old size on reload while the export showed the new one.
              const nodes = transformerRef.current?.nodes() ?? [];
              let wrote = false;
              for (const node of nodes) {
                const id = idForNode(node);
                if (!id) continue;
                writeNodeGeometry(id, node);
                wrote = true;
              }
              // One commit for the whole gesture — updateLayerLive accumulates onto
              // liveLayersRef, so N writes land as a single undo step.
              if (wrote) commitLayerChange();
            }}
          />
        </Layer>
      </Stage>
      {/* The inline text-edit overlay is an HTML textarea, not a Konva node — Konva
          can't host an editable input, so it's rendered as a sibling positioned over
          the Stage via the container's client rect. */}
      {editingTextId && stageContainer && editingRect && (() => {
        const rect = editingRect;
        const layer = layers.find((l) => l.id === editingTextId);
        if (layer?.kind !== "text") return null;
        // Mirror the SAME font resolution post-text-layer.tsx uses for the resting Konva
        // Text node (Tamil-companion fallback included) so the overlay's face matches the
        // text it's covering, not just a generic system font.
        const fontKey = resolveFontKey(layer.fontFamily as FontKey, layer.text);
        return (
          <Textarea
            autoFocus
            defaultValue={layer.text}
            style={{
              position: "absolute",
              left: rect.x, top: rect.y, width: rect.width, height: rect.height,
              // Same conversion textLayerFontProps (layer-konva-props.ts) uses for the
              // resting Konva Text node, so the overlay's type doesn't visibly jump in
              // size relative to the text it's replacing.
              fontSize: fontSizeToPx(layer.fontSize, containerW, containerH),
              lineHeight: layer.lineHeight,
              fontFamily: FONT_CSS_FAMILY[fontKey],
              fontWeight: layer.fontWeight,
              color: layer.color,
              textAlign: layer.align,
              letterSpacing: layer.letterSpacing ? `${layer.letterSpacing}px` : undefined,
              opacity: layer.opacity ?? 1,
              resize: "none",
              // Cancels the shadcn Textarea's default `field-sizing-content` (auto-grows
              // to fit typed content, overriding even an explicit height) — this overlay's
              // box must stay exactly at the click-to-edit hit-rect computed above.
              fieldSizing: "fixed",
            }}
            className="nodrag absolute z-10 min-h-0 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
            onBlur={(e) => { onCommitText(editingTextId, e.target.value); setEditingTextId(null); }}
            onKeyDown={(e) => {
              // Both branches stop propagation: this overlay lives inside a Sheet, which is a
              // Base UI Dialog, and dialogs close on Escape. Without this the instinctive
              // "escape to cancel this edit" throws the operator out of the whole editor —
              // and Cmd/Ctrl+Enter would likewise reach the shortcut handler above it.
              if (e.key === "Escape") {
                e.stopPropagation();
                setEditingTextId(null);
              }
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.stopPropagation();
                onCommitText(editingTextId, (e.target as HTMLTextAreaElement).value);
                setEditingTextId(null);
              }
            }}
          />
        );
      })()}
    </div>
  );
}
