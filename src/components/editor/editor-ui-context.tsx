"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

// Page-level UI the menus and panels share (D405): which inspector tab shows, opening the inspector
// on a tab from a right-click, and going back to the canvas.
export type InspectorTab = "clip" | "captions" | "dub";

type Ui = {
  inspectorTab: InspectorTab;
  setInspectorTab(t: InspectorTab): void;
  /** Show the inspector (if hidden) on a tab. */
  openInspector(t: InspectorTab): void;
  goToCanvas(): void;
};

const UiContext = createContext<Ui | null>(null);

export function EditorUiProvider({ inspectorShown, showInspector, goToCanvas, children }: { inspectorShown: boolean; showInspector(): void; goToCanvas(): void; children: ReactNode }) {
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("clip");
  const value = useMemo<Ui>(
    () => ({
      inspectorTab,
      setInspectorTab,
      openInspector: (t) => {
        setInspectorTab(t);
        if (!inspectorShown) showInspector();
      },
      goToCanvas,
    }),
    [inspectorTab, inspectorShown, showInspector, goToCanvas],
  );
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useEditorUi(): Ui {
  const v = useContext(UiContext);
  if (!v) throw new Error("useEditorUi must be used inside EditorUiProvider");
  return v;
}
