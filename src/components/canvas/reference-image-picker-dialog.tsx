"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReferenceImagePickerTabs, type PickerTab } from "./reference-image-picker-tabs";
import { DriveImageBrowser, type DriveSelectedImage } from "./drive/drive-image-browser";
import { GenerationsImageBrowser, type GeneratedSelectedImage } from "./generations/generations-image-browser";
import { ReferenceImageFooter } from "./reference-image-footer";

export type SelectedImage = DriveSelectedImage | GeneratedSelectedImage;

type Props = {
  canvasId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (images: SelectedImage[]) => void;
};

export function ReferenceImagePickerDialog({
  canvasId,
  open,
  onOpenChange,
  onAdd,
}: Props) {
  const [activeTab, setActiveTab] = useState<PickerTab>("drive");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [imageMap, setImageMap] = useState<Map<string, SelectedImage>>(new Map());

  function handleToggle(id: string, image: SelectedImage) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        setImageMap((m) => new Map(m).set(id, image));
      }
      return next;
    });
  }

  function handleTabChange(tab: PickerTab) {
    setActiveTab(tab);
    setSearchQuery("");
  }

  function handleAdd() {
    const images = Array.from(selectedIds)
      .map((id) => imageMap.get(id))
      .filter((img): img is SelectedImage => img != null);
    onAdd(images);
    handleClose();
  }

  function handleClose() {
    onOpenChange(false);
    setSelectedIds(new Set());
    setImageMap(new Map());
    setSearchQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex h-170 max-w-260 flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle className="font-display text-base font-semibold">
            Add Reference Image
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-48 shrink-0 border-r border-border bg-muted/30 px-3 py-4">
            <ReferenceImagePickerTabs
              activeTab={activeTab}
              onTabChange={handleTabChange}
            />
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
            {activeTab === "drive" ? (
              <DriveImageBrowser
                open={open}
                selectedIds={selectedIds}
                onToggle={handleToggle}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            ) : (
              <GenerationsImageBrowser
                canvasId={canvasId}
                open={open}
                selectedIds={selectedIds}
                onToggle={handleToggle}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            )}
          </div>
        </div>

        <ReferenceImageFooter
          selectedCount={selectedIds.size}
          onAdd={handleAdd}
          onCancel={handleClose}
        />
      </DialogContent>
    </Dialog>
  );
}
