"use client";

import { useState } from "react";
import { Download, Loader2, RefreshCw, Sparkles, Upload, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FaceRow } from "@/lib/ugc/board";

type Props = {
  row: FaceRow;
  onPrompt: (text: string) => void;
  onGenerate: () => void;
  onRegenerate: () => void;
  /** Google tab only — BytePlus rejects uploaded real faces. */
  canUpload: boolean;
  onUpload: (file: File) => Promise<string | null>;
};

// Once a face exists its prompt locks: the face was made from that text, and
// "New face" copies the row instead of overwriting it.
export function FaceColumn({ row, onPrompt, onGenerate, onRegenerate, canUpload, onUpload }: Props) {
  const busy = row.faceStatus === "generating";
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploaded = row.faceSource === "upload";
  return (
    <div className="flex w-56 shrink-0 flex-col gap-2 border-r border-neutral-100 pr-4">
      <span className="text-eyebrow">1 · Seedream presenter</span>

      <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
        {row.faceUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.faceUrl} alt="Generated presenter" className="size-full object-cover" />
        ) : busy ? (
          <Loader2 className="size-5 animate-spin text-primary" strokeWidth={1.5} />
        ) : (
          <UserRound className="size-6 text-neutral-300" strokeWidth={1.5} />
        )}
      </div>

      {row.faceError && <p className="text-xs text-destructive">{row.faceError}</p>}
      {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}

      {uploaded ? (
        <p className="text-xs text-neutral-500">
          Uploaded photo — used as the reference for every script in this row.
        </p>
      ) : (
        <Textarea
          value={row.facePrompt}
          onChange={(e) => onPrompt(e.target.value)}
          rows={4}
          placeholder="Describe the presenter — age, look, setting, lighting, framing…"
          disabled={busy || !!row.faceUrl}
          className="text-xs"
        />
      )}

      {row.faceUrl ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={onRegenerate} disabled={uploaded}>
            <RefreshCw className="size-3.5" strokeWidth={1.5} />
            New face
          </Button>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<a href={row.faceUrl} target="_blank" rel="noreferrer" />}
          >
            <Download className="size-3.5" strokeWidth={1.5} />
            Image
          </Button>
        </div>
      ) : (
        <>
          <Button size="sm" onClick={onGenerate} disabled={busy || !row.facePrompt.trim()}>
            <Sparkles className="size-3.5" strokeWidth={1.5} />
            {busy ? "Generating…" : "Generate face"}
          </Button>
          {canUpload && (
            <>
              <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-primary/40 px-2 py-1.5 text-[0.8rem] text-primary hover:bg-primary/5">
                <Upload className="size-3.5" strokeWidth={1.5} />
                Upload a photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) setUploadError(await onUpload(file));
                  }}
                />
              </label>
              <p className="text-[11px] text-neutral-400">
                Under 3 MB. Only upload someone who agreed to it — Google may still refuse a real
                person&apos;s likeness, and the refusal is shown as-is.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
