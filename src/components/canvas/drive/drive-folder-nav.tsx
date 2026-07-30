"use client";

import { ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FolderCrumb = { id: string; name: string };

type Props = {
  crumbs: FolderCrumb[];
  onNavigate: (folderId: string, crumbIndex: number) => void;
};

export function DriveFolderNav({ crumbs, onNavigate }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 py-1">
      {crumbs.map((crumb, i) => (
        <div key={crumb.id} className="flex items-center gap-0.5">
          {i > 0 && (
            <ChevronRight className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.5} />
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-6 gap-1 px-1.5 text-xs",
              i === crumbs.length - 1
                ? "text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onNavigate(crumb.id, i)}
          >
            {i === 0 && <Home className="size-3" strokeWidth={1.5} />}
            {crumb.name}
          </Button>
        </div>
      ))}
    </div>
  );
}
