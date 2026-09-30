"use client";

import { useState } from "react";
import { AlertTriangle, Download, FileText, Loader2, Mic, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ScriptTile as Tile } from "@/lib/ugc/board";

type Props = {
  tile: Tile;
  canRun: boolean;
  onScript: (text: string) => void;
  onRun: () => void;
  onRemove: () => void;
  // "Use this voice": resolves to an error message, or null once the row has the voice.
  onUseVoice: () => Promise<string | null>;
  canUseVoice: boolean;
  isVoiceSource: boolean;
};

const secs = (ms: number | null) => (ms == null ? "" : `${(ms / 1000).toFixed(0)}s`);

// A tile is the script until it becomes the video. Editing the script of a finished
// video (via "show script") drops it back to draft — that is the re-run path.
export function ScriptTile({
  tile,
  canRun,
  onScript,
  onRun,
  onRemove,
  onUseVoice,
  canUseVoice,
  isVoiceSource,
}: Props) {
  const [showScript, setShowScript] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  async function takeVoice() {
    setVoiceBusy(true);
    setVoiceError(null);
    setVoiceError(await onUseVoice());
    setVoiceBusy(false);
  }
  const busy = tile.status === "queued" || tile.status === "generating";

  if (tile.status === "done" && tile.videoUrl && !showScript) {
    return (
      <div className="flex w-44 shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-900 bg-neutral-900">
        <video src={tile.videoUrl} controls playsInline className="aspect-[9/16] w-full object-cover" />
        <div className="flex items-center gap-1 px-2 py-1.5 text-xs text-neutral-400">
          {secs(tile.elapsedMs)}
          {tile.ranWithVoice && (
            <Mic className="size-3 text-neutral-300" strokeWidth={1.5} aria-label="Made with the row's voice" />
          )}
          {canUseVoice && (
          <Button
            variant="ghost"
            size="icon-sm"
            className={isVoiceSource ? "ml-auto text-primary" : "ml-auto text-neutral-300"}
            onClick={takeVoice}
            disabled={voiceBusy}
            aria-label={isVoiceSource ? "This clip is the row's voice" : "Use this voice for this face"}
            title={isVoiceSource ? "This clip is the row's voice" : "Use this voice for this face"}
          >
            {voiceBusy ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
            ) : (
              <Mic className="size-3.5" strokeWidth={1.5} />
            )}
          </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className={canUseVoice ? "text-neutral-300" : "ml-auto text-neutral-300"}
            onClick={() => setShowScript(true)}
            aria-label="Show script"
          >
            <FileText className="size-3.5" strokeWidth={1.5} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-neutral-300"
            nativeButton={false}
            aria-label="Download video"
            render={<a href={tile.videoUrl} target="_blank" rel="noreferrer" />}
          >
            <Download className="size-3.5" strokeWidth={1.5} />
          </Button>
        </div>
        {voiceError && <p className="px-2 pb-1.5 text-xs text-destructive">{voiceError}</p>}
      </div>
    );
  }

  return (
    <div className="relative flex w-44 shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-card shadow-card">
      {tile.status === "rejected" && (
        <div className="flex gap-1.5 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
          <span className="line-clamp-3">{tile.error}</span>
        </div>
      )}
      <Textarea
        value={showScript ? (tile.ranScript ?? tile.script) : tile.script}
        onChange={(e) => {
          setShowScript(false);
          onScript(e.target.value);
        }}
        disabled={busy}
        placeholder="Scene, action and dialogue…"
        className="aspect-[9/13] min-h-0 flex-1 resize-none rounded-none border-0 text-xs shadow-none focus-visible:ring-0"
      />
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-primary/5 text-xs font-medium text-primary">
          <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
          {tile.status === "queued" ? "Queued" : "Generating…"}
        </div>
      )}
      <div className="flex items-center gap-1 border-t border-neutral-100 bg-neutral-50 px-2 py-1.5">
        {showScript ? (
          <Button variant="ghost" size="sm" onClick={() => setShowScript(false)}>
            Back to video
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="icon-sm" onClick={onRemove} disabled={busy} aria-label="Remove script">
              <X className="size-3.5" strokeWidth={1.5} />
            </Button>
            <Button size="sm" className="ml-auto" onClick={onRun} disabled={!canRun || busy || !tile.script.trim()}>
              <Play className="size-3.5" strokeWidth={1.5} />
              Run
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
