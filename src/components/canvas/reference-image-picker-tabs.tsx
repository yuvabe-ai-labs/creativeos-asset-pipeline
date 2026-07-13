"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { DriveIcon } from "@/components/ui/drive-icon";

export type PickerTab = "drive" | "generated";

type Props = {
  activeTab: PickerTab;
  onTabChange: (tab: PickerTab) => void;
};

const TABS: { id: PickerTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "drive",
    label: "Google Drive",
    icon: <DriveIcon size={16} />,
  },
  {
    id: "generated",
    label: "Generated Images",
    icon: <Sparkles className="size-4 shrink-0" strokeWidth={1.5} />,
  },
];

export function ReferenceImagePickerTabs({ activeTab, onTabChange }: Props) {
  return (
    <nav className="flex flex-col gap-0.5">
      <p className="text-eyebrow mb-2 px-2 text-[0.65rem]!">Source</p>
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-150",
            activeTab === tab.id
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
