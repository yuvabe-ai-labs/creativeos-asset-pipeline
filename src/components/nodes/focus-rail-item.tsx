"use client";

import type { ReactNode } from "react";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// One entry in a focus view's left rail. `icon` is a pre-rendered element so both
// Lucide icons and the connected-node <NodeIcon> can be passed uniformly.
//
// `onRemove` is optional; pass it and the row grows a hover control. It renders as a SIBLING of
// the row button, never a child — a <button> inside a <button> is invalid HTML, and the click
// would bubble into "select this item" instead of removing it.
//
// `removeKind` says what that control IS. "disconnect" is the destructive ✕ for an input wired
// straight into this node. "via" is a quiet link icon for an input that reaches this node THROUGH
// another one (a Video Gen lists the images wired into its prompt node): there is no edge here to
// remove, so a ✕ would be a lie — clicking it says where the connection comes from instead.
export function RailItem({
  icon,
  label,
  active,
  onClick,
  badge,
  onRemove,
  removeLabel = "Remove",
  removeKind = "disconnect",
}: {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  removeKind?: "disconnect" | "via";
}) {
  return (
    <div className="group/rail relative">
      <Button
        variant="ghost"
        onClick={onClick}
        className={cn(
          "h-auto w-full justify-start gap-2 px-2.5 py-2 text-sm font-normal",
          active
            ? "border-primary/25 bg-primary/8 font-medium text-foreground hover:bg-primary/8"
            : "text-muted-foreground",
          // Room for the ✕ so a long filename truncates before it collides.
          onRemove && "pr-9",
        )}
      >
        <span className="flex w-4 shrink-0 items-center justify-center">{icon}</span>
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {badge}
      </Button>

      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          type="button"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={onRemove}
          // Revealed on hover, but ALSO on its own focus — a hover-only control is
          // unreachable by keyboard. focus-visible keeps it quiet for mouse users.
          className={cn(
            "absolute right-1.5 top-1/2 size-6 -translate-y-1/2 rounded-md text-muted-foreground",
            "opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100 focus-visible:opacity-100",
            removeKind === "disconnect"
              ? "hover:bg-destructive/10 hover:text-destructive-text"
              : "hover:bg-muted hover:text-foreground",
          )}
        >
          {removeKind === "disconnect" ? (
            <X className="size-3.5" strokeWidth={2} />
          ) : (
            <Link2 className="size-3.5" strokeWidth={1.5} />
          )}
        </Button>
      )}
    </div>
  );
}
