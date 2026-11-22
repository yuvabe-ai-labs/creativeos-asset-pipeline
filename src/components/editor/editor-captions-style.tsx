"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { CAPTION_FONTS, type CaptionFontKey } from "@/lib/editor/caption-fonts";
import { applyCaptionLook, applyCaptionStyle, captionLook, MAX_SIZE, MIN_SIZE, resetCaptionLook, type CaptionStyle } from "@/lib/editor/caption-style";
import { CAPTION_FONT_CSS } from "./caption-font-faces";
import { EditorCaptionPresets } from "./editor-caption-presets";
import { useEditorStore, useEditorStoreApi } from "./editor-store-provider";

/** The reel's caption style (D396): presets, then font, size, colour and word by word. Every change
 *  reaches every caption that hasn't its own value. With `captionId`, the same controls set that
 *  one caption's own look (D505), with a reset back to the reel's. A slider or colour drag is one
 *  undo step (D400). */
export function EditorCaptionsStyle({ captionId }: { captionId?: string } = {}) {
  const store = useEditorStoreApi();
  const reelStyle = useEditorStore((s) => s.doc.captionStyle);
  const ownLook = useEditorStore((s) => (captionId ? s.doc.captions.find((x) => x.id === captionId)?.look : undefined));
  const style = captionLook({ captionStyle: reelStyle }, { look: ownLook });
  const hasOwnLook = !!ownLook;
  const count = useEditorStore((s) => s.doc.captions.length);
  const editable = useEditorStore((s) => s.editable);
  const set = (patch: Partial<CaptionStyle>) =>
    store.getState().apply((d) => (captionId ? applyCaptionLook(d, captionId, patch) : applyCaptionStyle(d, patch)));
  const begin = () => store.getState().begin();
  const commit = () => store.getState().commit();

  return (
    <div className="flex flex-col gap-4">
      {captionId ? (
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-xs text-muted-foreground">
            {hasOwnLook ? "This caption has its own style; the default style no longer changes it." : "This caption uses the default style until you change it here."} Changes here apply to this caption only.
          </p>
          {hasOwnLook && (
            <Button
              variant="ghost"
              size="xs"
              disabled={!editable}
              onClick={() => store.getState().apply((d) => resetCaptionLook(d, captionId))}
              className="shrink-0 gap-1"
            >
              <RotateCcw className="size-3" strokeWidth={1.5} />
              Use default style
            </Button>
          )}
        </div>
      ) : (
        <p className="m-0 text-xs text-muted-foreground">
          {count ? "The default style: it reaches only the captions you haven't styled or moved on their own." : "Captions you add will use this style."} To change one caption, select it on the preview or in a clip&apos;s captions.
        </p>
      )}
      <EditorCaptionPresets captionId={captionId} />
      <div className="flex flex-col gap-3.5 border-t border-border pt-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-xs font-semibold">Font</Label>
            <Select value={style.font} onValueChange={(v) => v && set({ font: v as CaptionFontKey })} disabled={!editable}>
              <SelectTrigger aria-label="Font" className="w-full">
                <SelectValue>{(v: string) => CAPTION_FONTS.find((f) => f.key === v)?.label ?? v}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CAPTION_FONTS.map((f) => (
                  <SelectItem key={f.key} value={f.key} style={{ fontFamily: CAPTION_FONT_CSS[f.key] }}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5" onPointerDown={begin} onPointerUp={commit} onPointerCancel={commit}>
            <Label className="flex justify-between text-xs font-semibold">
              Size <span className="font-normal tabular-nums text-muted-foreground">{style.size} px</span>
            </Label>
            <Slider
              min={MIN_SIZE}
              max={MAX_SIZE}
              step={2}
              value={[style.size]}
              disabled={!editable}
              aria-label="Caption size"
              onValueChange={(v) => set({ size: Array.isArray(v) ? v[0] : v })}
              className="pt-2"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <ColorField label="Colour" value={style.color} disabled={!editable} onChange={(color) => set({ color })} onBegin={begin} onCommit={commit} />
          {style.wordByWord && <ColorField label="Word being said" value={style.activeColor} disabled={!editable} onChange={(activeColor) => set({ activeColor })} onBegin={begin} onCommit={commit} />}
        </div>
        <Label className="flex cursor-pointer items-center justify-between gap-3 text-xs font-semibold">
          <span>
            Word by word <span className="font-normal text-muted-foreground">{style.wordByWord ? "· the word being said lights up" : "· the whole line at once"}</span>
          </span>
          <Switch checked={style.wordByWord} disabled={!editable} onCheckedChange={(v) => set({ wordByWord: v })} />
        </Label>
      </div>
      {!captionId && (
        <p className="m-0 border-t border-border pt-3 text-xs text-muted-foreground">
          {style.wordByWord ? "Arrives in Premiere as editable text on V2, one clip per word." : "Arrives in Premiere as editable text on V2, one clip per line."} The fonts ship in the package.
        </p>
      )}
    </div>
  );
}

function ColorField({ label, value, disabled, onChange, onBegin, onCommit }: {
  label: string;
  value: string;
  disabled: boolean;
  onChange(v: string): void;
  onBegin(): void;
  onCommit(): void;
}) {
  return (
    <Label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Input
        type="color"
        value={value}
        disabled={disabled}
        onFocus={onBegin}
        onBlur={onCommit}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        className="h-7 w-9 cursor-pointer p-0.5"
      />
      {label}
    </Label>
  );
}
