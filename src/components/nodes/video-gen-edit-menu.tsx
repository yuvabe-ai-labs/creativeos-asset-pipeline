"use client";

import { ChevronDown, Mic, PencilLine, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type VideoGenMode = "generate" | "edit" | "voice";

type EditOption = {
  disabled: boolean;
  /** Its job is running: a small dot, so it shows while another panel is open. */
  running: boolean;
};

const RunningDot = () => <span className="size-1.5 animate-pulse rounded-full bg-primary" />;

// D493 — Edit video and Edit voice are reached from one "Edit" menu at the top right of the take
// (opens on hover or click); the generate settings stay the centre column's default.
export function VideoGenEditMenu({
  mode,
  onModeChange,
  edit,
  voice,
}: {
  mode: VideoGenMode;
  onModeChange: (mode: VideoGenMode) => void;
  edit: EditOption;
  voice: EditOption;
}) {
  const items: Array<{ id: Exclude<VideoGenMode, "generate">; label: string; icon: typeof Sparkles; option: EditOption }> = [
    { id: "edit", label: "Edit video", icon: Sparkles, option: edit },
    { id: "voice", label: "Edit voice", icon: Mic, option: voice },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        openOnHover
        delay={100}
        // Long enough to cross the gap to the menu without it closing under the pointer.
        closeDelay={200}
        render={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className={cn(
              "gap-1.5 px-1.5 text-sm font-medium text-foreground hover:bg-transparent hover:text-primary data-popup-open:text-primary",
              mode !== "generate" && "text-primary",
            )}
          />
        }
      >
        <PencilLine className="size-3.5" strokeWidth={1.5} />
        Edit
        {(edit.running || voice.running) && <RunningDot />}
        <ChevronDown className="size-3.5" strokeWidth={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {items.map(({ id, label, icon: Icon, option }) => (
          <DropdownMenuItem
            key={id}
            disabled={option.disabled}
            onClick={() => onModeChange(id)}
            className={cn(
              "gap-2 data-highlighted:bg-primary/8 data-highlighted:text-primary",
              mode === id && "bg-primary/8 text-primary",
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.5} />
            {label}
            {option.running && <RunningDot />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
