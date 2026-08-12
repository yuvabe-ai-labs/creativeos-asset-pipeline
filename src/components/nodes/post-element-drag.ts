import {
  ELEMENT_DRAG_TYPE, serializeElementDrag, type ElementDragPayload,
} from "@/lib/post/element-drag";

/**
 * Starts a drag from a left-panel tile — the one place the payload and the drag image are set,
 * so all three panels (Elements, Text, Connected) carry the same one.
 *
 * The browser's default drag image is a screenshot of the whole tile, anchored at whatever
 * point inside it you happened to grab. That trails the cursor at an arbitrary offset and drags
 * the tile's button chrome along with it. This replaces it with a small chip of just the tile's
 * contents, centred under the pointer, so what you are carrying reads at a glance.
 */
export function startElementDrag(e: React.DragEvent<HTMLElement>, payload: ElementDragPayload) {
  e.dataTransfer.setData(ELEMENT_DRAG_TYPE, serializeElementDrag(payload));
  e.dataTransfer.effectAllowed = "copy";

  const ghost = document.createElement("div");
  // Off-screen rather than hidden: the browser only snapshots an element that is attached and
  // rendered, so display:none or visibility:hidden would silently fall back to the default.
  // max-w keeps a long text preset from producing a chip half the width of the screen.
  ghost.className =
    "pointer-events-none fixed top-0 left-[-9999px] flex max-w-[220px] items-center gap-2 " +
    "overflow-hidden rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium shadow-card";

  const picture = e.currentTarget.querySelector("img");
  if (picture) {
    // Picture tiles get a purpose-built 40px thumbnail rather than a clone of the tile.
    //
    // Cloning carried the tile's `<img class="size-full">` into a ghost with no width of its
    // own, so `100%` resolved against nothing and the image laid out at its INTRINSIC size —
    // a 2000px brand logo produced a 2000px drag image, which the compositor then carried on
    // every pointer move. That is why pictures dragged heavily and shapes did not.
    const thumb = document.createElement("img");
    // currentSrc, not src: the URL the browser actually fetched, so this reuses the bitmap
    // already decoded for the tile instead of starting a second load mid-gesture.
    thumb.src = picture.currentSrc || picture.src;
    thumb.className = "size-10 shrink-0 rounded-sm object-contain";
    ghost.appendChild(thumb);
  } else {
    // Shapes, icons and text presets are small vector or text content — a clone reads best,
    // and carries no bitmap to blow the drag image up.
    ghost.innerHTML = e.currentTarget.innerHTML;
  }
  document.body.appendChild(ghost);
  // Measured after appending — a text preset's chip is much wider than an icon's, and the
  // offset has to be half of whatever it actually came out as to sit under the cursor.
  e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
  // The snapshot is taken after this handler returns, so the node has to outlive it — but only
  // by a frame, not for the whole drag.
  requestAnimationFrame(() => ghost.remove());
}
