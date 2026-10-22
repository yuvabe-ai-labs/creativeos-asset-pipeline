"use client";
// Dub & lip sync for a clip, from the editor (D406–D408): 1. Dub (language, translation style),
// 2. Lip sync, locked until there is a dub. Runs in the background; the clip switches to what
// landed. The Dubbing node lives on the canvas, between the clip and the Editor.
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dubCredits, lipSyncCredits } from "@/lib/dubbing/cost";
import { DEFAULT_DUB_LANGUAGE, DEFAULT_DUB_STYLE, DUB_LANGUAGES, DUB_STYLES, dubLanguageLabel, type DubLanguage, type DubStyle } from "@/lib/dubbing/types";
import { setPicture, setSound } from "@/lib/editor/pieces";
import type { Piece, SourceView } from "@/lib/editor/types";
import { cn } from "@/lib/utils";
import { EditorChoiceToggle } from "./editor-choice-toggle";
import { useEditorDubContext } from "./editor-dub-context";
import { useEditorStore } from "./editor-store-provider";

function Step({ n, done, locked, title, children }: { n: number; done: boolean; locked?: boolean; title: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-2.5 rounded-xl border p-3", done ? "border-emerald-600/30" : "border-border", locked && "opacity-60")}>
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <span className={cn("grid size-5 place-items-center rounded-full text-[11px]", done ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-muted text-muted-foreground")}>
          {done ? <Check className="size-3" strokeWidth={2} /> : n}
        </span>
        {title}
      </div>
      {children}
    </div>
  );
}

export function EditorDubTab({ piece, source }: { piece: Piece; source: SourceView }) {
  const editable = useEditorStore((s) => s.editable);
  const sources = useEditorStore((s) => s.sources);
  const apply = useEditorStore((s) => s.apply);
  const dub = useEditorDubContext();
  const [language, setLanguage] = useState<DubLanguage>(DEFAULT_DUB_LANGUAGE);
  const [style, setStyle] = useState<DubStyle>(DEFAULT_DUB_STYLE);

  const running = dub.busy.get(source.nodeId);
  const settingUp = dub.settingUp.has(piece.id);
  const hasDub = Boolean(source.files.dubAudio);
  const hasLip = Boolean(source.files.lipSynced);
  const seconds = source.files.original.facts?.durationSeconds ?? 0;
  const lang = source.language ? dubLanguageLabel(source.language) : null;
  const note = dub.notes.get(source.nodeId);
  const error = dub.errors.get(source.nodeId);
  const why = !editable ? "Someone else is editing this reel." : running ? "Wait for the current run to finish." : undefined;

  return (
    <div className="flex flex-col gap-3">
      {note && <p className="m-0 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">{note}</p>}
      {error && <p className="m-0 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

      <Step n={1} done={hasDub && running !== "dub"} title={hasDub ? `Dub · ${lang ?? "done"}` : "Dub"}>
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
      </Step>

      <Step n={2} done={hasLip && running !== "lipsync"} locked={!hasDub} title={hasLip ? "Lip sync · done" : "Lip sync"}>
        {running === "lipsync" ? (
          <p className="m-0 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" strokeWidth={1.5} />
            Matching the mouth to the {lang ?? ""} dub.
          </p>
        ) : (
          <>
            <p className="m-0 text-xs text-muted-foreground">{hasDub ? `Matches the presenter's mouth to the ${lang ?? ""} dub.` : "Dub the clip first. Lip sync matches the mouth to the dub."}</p>
            <Button
              size="sm"
              variant={hasDub && !hasLip ? "default" : "outline"}
              disabled={!hasDub || Boolean(why)}
              title={!hasDub ? "Dub the clip first" : why}
              onClick={() => void dub.startLipSync(source.nodeId)}
              className="self-start"
            >
              {hasLip ? "Lip sync again" : "Lip sync"}
              <span className="font-normal opacity-75">· {lipSyncCredits(seconds)} credits</span>
            </Button>
          </>
        )}
      </Step>

      {hasDub && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-[13px] font-semibold">This clip plays</span>
          <EditorChoiceToggle
            label="Sound"
            value={piece.sound}
            disabled={!editable}
            options={[
              { value: "original", label: "Original sound", available: true },
              { value: "dubbed", label: `Dub · ${lang ?? ""}`, available: true },
            ]}
            onChange={(c) => apply((d) => setSound(d, piece.id, c, sources))}
          />
          {hasLip && (
            <EditorChoiceToggle
              label="Picture"
              value={piece.picture}
              disabled={!editable}
              options={[
                { value: "original", label: "Original picture", available: true },
                { value: "lipSynced", label: "Lip-synced", available: true },
              ]}
              onChange={(c) => apply((d) => setPicture(d, piece.id, c, sources))}
            />
          )}
          <span className="text-xs text-muted-foreground">In Premiere, the one not chosen stays in the sequence on its own track, switched off.</span>
        </div>
      )}
    </div>
  );
}
