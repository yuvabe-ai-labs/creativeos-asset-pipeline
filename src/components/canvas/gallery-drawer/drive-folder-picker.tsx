"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { Folder, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { DriveFoldersResponse } from "@/app/api/drive/folders/route";

type FolderItem = DriveFoldersResponse["items"][number];

type State =
  | { status: "loading"; selected: null; folders: [] }
  | { status: "error"; selected: null; folders: [] }
  | { status: "done"; selected: FolderItem | null; folders: FolderItem[] };

const LOADING: State = {
  status: "loading",
  selected: null,
  folders: [],
};

const ERROR: State = {
  status: "error",
  selected: null,
  folders: [],
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onLinked: (folder: { id: string; name: string }) => void;
};

export function DriveFolderPicker({
  open,
  onOpenChange,
  clientId,
  onLinked,
}: Props) {
  const [state, setState] = useState<State>(LOADING);
  const [saving, setSaving] = useState(false);
  const attemptRef = useRef(0);

  useEffect(() => {
    if (!open) return;

    const attempt = ++attemptRef.current;
    startTransition(() => setState(LOADING));

    fetch("/api/drive/folders")
      .then((r) => r.json())
      .then((data: DriveFoldersResponse) => {
        if (attemptRef.current !== attempt) return;

        setState({
          status: "done",
          selected: null,
          folders: data.items ?? [],
        });
      })
      .catch(() => {
        if (attemptRef.current !== attempt) return;
        setState(ERROR);
      });
  }, [open]);

  function handleRetry() {
    const attempt = ++attemptRef.current;

    setState(LOADING);

    fetch("/api/drive/folders")
      .then((r) => r.json())
      .then((data: DriveFoldersResponse) => {
        if (attemptRef.current !== attempt) return;

        setState({
          status: "done",
          selected: null,
          folders: data.items ?? [],
        });
      })
      .catch(() => {
        if (attemptRef.current !== attempt) return;
        setState(ERROR);
      });
  }

  function handleSelect(folder: FolderItem) {
    if (state.status !== "done") return;

    setState({
      ...state,
      selected: folder,
    });
  }

  async function handleLink() {
    if (state.status !== "done" || !state.selected) return;

    setSaving(true);

    try {
      const res = await fetch(`/api/clients/${clientId}/drive-folder`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          driveRootFolderId: state.selected.id,
        }),
      });

      if (!res.ok) throw new Error();

      onLinked({
        id: state.selected.id,
        name: state.selected.name,
      });

      onOpenChange(false);
    } catch {
      // Keep dialog open
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link a Drive folder</DialogTitle>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
          {state.status === "loading" && (
            <div className="flex h-28 items-center justify-center">
              <Loader2
                className="h-5 w-5 animate-spin text-muted-foreground"
                strokeWidth={1.5}
              />
            </div>
          )}

          {state.status === "error" && (
            <div className="flex h-28 flex-col items-center justify-center gap-2">
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t load folders.
              </p>

              <Button variant="link" size="sm" onClick={handleRetry}>
                Retry
              </Button>
            </div>
          )}

          {state.status === "done" && state.folders.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No folders found.
            </div>
          )}

          {state.status === "done" &&
            state.folders.map((folder) => {
              const selected = state.selected?.id === folder.id;

              return (
                <Button
                  key={folder.id}
                  type="button"
                  variant="ghost"
                  onClick={() => handleSelect(folder)}
                  className={cn(
                    "h-auto w-full justify-start gap-3 px-3 py-3 text-left",
                    "hover:bg-muted/50",
                    selected && "border-primary/30 bg-primary/5",
                  )}
                >
                  <Folder
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.5}
                  />

                  <span className="flex-1 truncate text-sm font-medium">
                    {folder.name}
                  </span>

                  {folder.isShared && (
                    <Badge variant="secondary" className="shrink-0">
                      Shared
                    </Badge>
                  )}
                </Button>
              );
            })}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>

          <Button
            onClick={handleLink}
            disabled={state.status !== "done" || !state.selected || saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            ) : (
              "Link folder"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
