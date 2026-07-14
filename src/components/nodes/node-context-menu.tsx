"use client";

import { Copy, ImagePlus, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

type Props = {
  children: React.ReactNode;
  onDuplicate: () => void;
  onDelete?: () => void;
  onAddReferenceImage?: () => void;
};

export function NodeContextMenu({ children, onDuplicate, onDelete, onAddReferenceImage }: Props) {
  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onClick={onDuplicate}>
          <Copy className="mr-2 size-3.5" strokeWidth={1.5} />
          Duplicate
          <ContextMenuShortcut>⌘D</ContextMenuShortcut>
        </ContextMenuItem>
        {onAddReferenceImage && (
          <ContextMenuItem onClick={onAddReferenceImage}>
            <ImagePlus className="mr-2 size-3.5" strokeWidth={1.5} />
            Add Reference Image
          </ContextMenuItem>
        )}
        {onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="mr-2 size-3.5" strokeWidth={1.5} />
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
