"use client";

import type { ReactNode } from "react";
import { AlertCircle, ArrowLeft, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { EditorHistoryButtons } from "./editor-history-buttons";
import { useEditorStore } from "./editor-store-provider";
import { REEL_SHAPES, type ReelShape } from "@/lib/editor/types";
import type { SaveStatus } from "@/hooks/use-editor-autosave";

const STATUS: Record<SaveStatus, { label: string; icon: typeof Check }> = {
  saved: { label: "Saved", icon: Check },
  saving: { label: "Saving…", icon: Loader2 },
  unsaved: { label: "Unsaved changes", icon: Loader2 },
  error: { label: "Couldn't save · retrying", icon: AlertCircle },
};

/** The editor's top bar (mockup "Editor, clip selected"): back, where you are, the reel's shape,
 *  the save state, and the export action (passed in). */
export function EditorHeader({ breadcrumb, title, status, readOnly, onBack, actions }: {
  breadcrumb: string;
  title: string;
  status: SaveStatus;
  readOnly: boolean;
  onBack(): void;
  actions?: ReactNode;
}) {
  const shape = useEditorStore((s) => s.doc.shape);
  const apply = useEditorStore((s) => s.apply);
  const setShape = (next: ReelShape) => apply((d) => (d.shape === next ? d : { ...d, shape: next }));
  const { label, icon: Icon } = STATUS[status];

  return (
    <header className="flex h-[60px] flex-none items-center gap-4 border-b border-border bg-card px-6">
      <Button variant="ghost" onClick={onBack} className="gap-1.5 text-sm font-medium">
        <ArrowLeft className="size-4" strokeWidth={1.5} />
        Back to canvas
      </Button>
      <div className="h-6 w-px bg-border" aria-hidden="true" />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xs text-muted-foreground">{breadcrumb}</span>
        <span className="truncate font-display text-[17px] font-semibold">{title}</span>
      </div>
      {!readOnly && <EditorHistoryButtons />}
      <div className="flex-1" />
      <ToggleGroup
        aria-label="Reel shape"
        value={[shape]}
        onValueChange={(v: string[]) => v[0] && setShape(v[0] as ReelShape)}
        disabled={readOnly}
        className="rounded-[9px] bg-muted p-[3px]"
        spacing={0}
      >
        {REEL_SHAPES.map((s) => (
          <ToggleGroupItem key={s} value={s} className="h-7 rounded-[7px] px-3 text-[13px] data-[pressed]:bg-card data-[pressed]:font-semibold data-[pressed]:shadow-sm">
            {s}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {!readOnly && (
        <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground" aria-live="polite">
          <Icon className={status === "saving" ? "size-3.5 animate-spin" : "size-3.5"} strokeWidth={1.5} />
          {label}
        </span>
      )}
      {actions}
    </header>
  );
}
