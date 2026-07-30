import { useEffect } from "react";
import { useCanvasStore } from "@/components/canvas/canvas-store-provider";

// A focus view is a modal surface over the canvas, but the canvas listens for its
// shortcuts on `document` — React Flow's deleteKeyCode included — so those keys keep
// firing behind an open sheet. Nodes report their focus view here; the canvas reads
// `useAnyFocusViewOpen()` and goes inert while anything is open.
export function useFocusViewRegistration(id: string, open: boolean) {
  const setFocusViewOpen = useCanvasStore((s) => s.setFocusViewOpen);
  useEffect(() => {
    setFocusViewOpen(id, open);
    // Retract the claim if the node unmounts while open (deleted by the copilot,
    // canvas remount). Without this the id sticks and the canvas stays deaf until
    // a reload — a worse failure than the one this whole hook exists to fix.
    return () => setFocusViewOpen(id, false);
  }, [id, open, setFocusViewOpen]);
}

export function useAnyFocusViewOpen() {
  return useCanvasStore((s) => s.openFocusViewIds.length > 0);
}
