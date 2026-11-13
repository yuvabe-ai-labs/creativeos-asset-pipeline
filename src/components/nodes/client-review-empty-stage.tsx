"use client";

import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

// D498 — the centre of the Client review focus view before the first cut: a dashed drop-style
// card that says what happens (v1, its own link, later cuts as v2, v3) with the upload action.
// Read-only sessions see the same card without the button.
export function ClientReviewEmptyStage({
  editable,
  onUpload,
}: {
  editable: boolean;
  onUpload: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex w-full max-w-xl flex-col items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] px-8 py-20 text-center">
        <Upload className="size-6 text-primary" strokeWidth={1.5} />
        <p className="font-display text-lg font-semibold tracking-tight">Upload the first cut</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          It becomes v1, with its own link to send to the client. Later cuts come in here as v2, v3
          and so on.
        </p>
        {editable ? (
          <Button onClick={onUpload} className="mt-1">
            Upload first version
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">No cut uploaded yet.</p>
        )}
      </div>
    </div>
  );
}
