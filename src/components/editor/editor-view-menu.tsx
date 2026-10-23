"use client";

import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { EditorLayoutApi } from "@/hooks/use-editor-layout";
import { useEditorView } from "./editor-view-context";

/** The View menu (D403), as in Descript: panels, room for the timeline or the preview, fit. */
export function EditorViewMenu({ layout }: { layout: EditorLayoutApi }) {
  const { fit } = useEditorView();
  const { sources, inspector } = layout.layout;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="gap-1.5">
            <Columns3 className="size-4" strokeWidth={1.5} />
            View
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuItem onClick={layout.toggleSources}>
          {sources ? "Hide sources" : "Show sources"}
          <span className="ml-auto pl-4 text-xs text-muted-foreground">Ctrl 1</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={layout.toggleInspector}>
          {inspector ? "Hide inspector" : "Show inspector"}
          <span className="ml-auto pl-4 text-xs text-muted-foreground">Ctrl 2</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => layout.setTimelineHeight(window.innerHeight * 0.55)}>Bigger timeline</DropdownMenuItem>
        <DropdownMenuItem onClick={() => layout.setTimelineHeight(0)}>Bigger preview</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={fit}>
          Fit the reel
          <span className="ml-auto pl-4 text-xs text-muted-foreground">Shift Z</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
