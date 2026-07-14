"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DriveFolderPicker } from "@/components/canvas/gallery-drawer/drive-folder-picker";

type Props = {
  clientId: string;
  initialFolder: { id: string; name: string } | null;
};

export function ClientDriveFolderRow({ clientId, initialFolder }: Props) {
  const [folder, setFolder] = useState(initialFolder);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  async function handleUnlink() {
    await fetch(`/api/clients/${clientId}/drive-folder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveRootFolderId: null }),
    });
    setFolder(null);
    setPopoverOpen(false);
  }

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border pt-3 mt-3">
      <span className="text-sm text-muted-foreground">Drive Folder</span>
      <div className="flex items-center gap-2">
        {folder ? (
          <>
            <span className="text-sm font-medium truncate max-w-48">{folder.name}</span>
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger
                render={
                  <Button variant="ghost" size="icon" className="size-7">
                    <Settings2 className="size-3.5" strokeWidth={1.5} />
                  </Button>
                }
              />
              <PopoverContent className="w-40 p-1" align="end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-sm"
                  onClick={() => { setPopoverOpen(false); setPickerOpen(true); }}
                >
                  Change folder
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-sm text-destructive hover:text-destructive"
                  onClick={handleUnlink}
                >
                  Unlink
                </Button>
              </PopoverContent>
            </Popover>
          </>
        ) : (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-sm font-semibold text-foreground underline underline-offset-4"
            onClick={() => setPickerOpen(true)}
          >
            Not configured
          </Button>
        )}
      </div>
      <DriveFolderPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        clientId={clientId}
        onLinked={(f) => setFolder(f)}
      />
    </div>
  );
}
