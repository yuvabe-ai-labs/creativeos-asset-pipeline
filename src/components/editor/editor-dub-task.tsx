"use client";
// The Dub task for a clip, from the editor (D406–D408): language and translation style, then which
// sound the clip plays. Runs in the background; the clip switches to what landed. The Dubbing node
// lives on the canvas, between the clip and the Editor. Lip sync is its own task (editor-lip-task).
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dubCredits } from "@/lib/dubbing/cost";
import { DEFAULT_DUB_LANGUAGE, DEFAULT_DUB_STYLE, DUB_LANGUAGES, DUB_STYLES, dubLanguageLabel, type DubLanguage, type DubStyle } from "@/lib/dubbing/types";
import type { Piece, SourceView } from "@/lib/editor/types";
import { useAutoCaptionsContext } from "./auto-captions-context";
import { EditorChoiceToggle } from "./editor-choice-toggle";
import { useEditorDubContext } from "./editor-dub-context";
import { useEditorStore } from "./editor-store-provider";

/** What both the Dub and Lip sync tasks read about a clip's dub. */
export function useClipDub(piece: Piece, source: SourceView) {
  const editable = useEditorStore((s) => s.editable);
  const dub = useEditorDubContext();
  const running = dub.busy.get(source.nodeId);
  return {
    dub,
    editable,
    running,
    settingUp: dub.settingUp.has(piece.id),
    hasDub: Boolean(source.files.dubAudio),
    hasLip: Boolean(source.files.lipSynced),
    seconds: source.files.original.facts?.durationSeconds ?? 0,
    lang: source.language ? dubLanguageLabel(source.language) : null,
    note: dub.notes.get(source.nodeId),
    error: dub.errors.get(source.nodeId),
    why: !editable ? "Someone else is editing this reel." : running ? "Wait for the current run to finish." : undefined,
  };
}

export function ClipDubNotices({ note, error }: { note?: string; error?: string }) {
  return (
    <>
      {note && <p className="m-0 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{note}</p>}
      {error && <p className="m-0 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}
    </>
  );
}

export function EditorDubTask({ piece, source }: { piece: Piece; source: SourceView }) {
  const { dub, editable, running, settingUp, hasDub, seconds, lang, note, error, why } = useClipDub(piece, source);
  const { switchSound } = useAutoCaptionsContext();
  const [language, setLanguage] = useState<DubLanguage>(DEFAULT_DUB_LANGUAGE);
  const [style, setStyle] = useState<DubStyle>(DEFAULT_DUB_STYLE);

  return (
    <div className="flex flex-col gap-3">
      <ClipDubNotices note={note} error={error} />
      {running === "dub" || settingUp ? (
        <p className="m-0 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
          {settingUp ? "Setting up the dub…" : `Dubbing ${source.handle}. You can keep editing.`}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <Label className="text-xs">Dub into</Label>
              <Select value={language} onValueChange={(v) => v && setLanguage(v as DubLanguage)} disabled={!editable}>
                <SelectTrigger aria-label="Dub into" className="w-full">
                  <SelectValue>{(v: string) => dubLanguageLabel(v)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DUB_LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <Label className="text-xs">Translation style</Label>
              <Select value={style} onValueChange={(v) => v && setStyle(v as DubStyle)} disabled={!editable}>
                <SelectTrigger aria-label="Translation style" className="w-full">
                  <SelectValue>{(v: string) => DUB_STYLES.find((s) => s.code === v)?.label ?? v}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DUB_STYLES.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="m-0 text-xs text-muted-foreground">{DUB_STYLES.find((s) => s.code === style)?.hint} Uses the presenter&apos;s own voice.</p>
          <Button size="sm" variant={hasDub ? "outline" : "default"} disabled={Boolean(why) || seconds === 0} title={why} onClick={() => void dub.startDub(piece, { language, style })} className="self-start">
            {hasDub ? "Dub again" : "Dub clip"}
            <span className="font-normal opacity-75">· {dubCredits(seconds)} credits</span>
          </Button>
        </>
      )}

      {hasDub && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-[13px] font-semibold">Sound</span>
          <EditorChoiceToggle
            label="Sound"
            value={piece.sound}
            disabled={!editable}
            options={[
              { value: "original", label: "Original sound", available: true },
              { value: "dubbed", label: `Dub · ${lang ?? ""}`, available: true },
            ]}
            onChange={(c) => switchSound(piece.id, c)}
          />
          <span className="text-xs text-muted-foreground">In Premiere, the one not chosen stays in the sequence on its own track, switched off.</span>
        </div>
      )}
    </div>
  );
}
