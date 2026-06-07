"use client";

import { useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { ArrowLeft, PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { Dialog, DialogPortal, DialogOverlay, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ReelScript } from "@/lib/nodes/reel-script";
import { setScriptValue, addItem, removeItem } from "@/lib/nodes/script-edit";
import { ScriptDocument } from "./script-document";

type Path = (string | number)[];

type ScriptFocusViewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  source: string;
  parsed: ReelScript;
  onSave: (next: ReelScript) => void;
};

// Full-screen, buffered editor for a parsed reel script. Edits live in a local
// draft until the user clicks Save (which calls onSave). Closing with unsaved
// edits asks for confirmation. The original script is collapsed by default.
export function ScriptFocusView({
  open,
  onOpenChange,
  title,
  source,
  parsed,
  onSave,
}: ScriptFocusViewProps) {
  const [draft, setDraft] = useState<ReelScript>(parsed);
  const [showOriginal, setShowOriginal] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Reseed the draft from the saved script when the view transitions to open.
  // Adjusting state during render is React's documented alternative to a reset
  // effect (https://react.dev/learn/you-might-not-need-an-effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(parsed);
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(parsed);

  function requestClose() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onOpenChange(false);
  }

  function handleSave() {
    onSave(draft);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpenChange(true);
        else requestClose();
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex flex-col bg-background outline-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
          <header className="flex items-center justify-between border-b px-5 py-3">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={requestClose}>
                <ArrowLeft className="size-4" /> Back
              </Button>
              <DialogTitle className="font-display text-lg">
                {title || "Reel script"}
              </DialogTitle>
              {dirty && (
                <span className="text-xs text-muted-foreground">Unsaved changes</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOriginal((v) => !v)}
              >
                {showOriginal ? (
                  <>
                    <PanelLeftClose className="size-4" /> Hide original
                  </>
                ) : (
                  <>
                    <PanelLeftOpen className="size-4" /> Show original
                  </>
                )}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!dirty}>
                Save
              </Button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            {showOriginal && (
              <aside className="w-80 shrink-0 overflow-y-auto border-r bg-muted/20 p-5">
                <span className="text-eyebrow">Original script</span>
                <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {source || "No original script."}
                </pre>
              </aside>
            )}
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-2xl px-6 py-10">
                <ScriptDocument
                  script={draft}
                  onChange={(path: Path, value) =>
                    setDraft((d) => setScriptValue(d, path, value))
                  }
                  onAddItem={(path: Path, item) =>
                    setDraft((d) => addItem(d, path, item))
                  }
                  onRemoveItem={(path: Path, index) =>
                    setDraft((d) => removeItem(d, path, index))
                  }
                />
              </div>
            </main>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}
