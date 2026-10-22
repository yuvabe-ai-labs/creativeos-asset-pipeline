"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { CAPTION_FONTS, type CaptionFontKey } from "@/lib/editor/caption-fonts";
import { applyCaptionStyle, MAX_SIZE, MIN_SIZE, type CaptionStyle } from "@/lib/editor/caption-style";
import { CAPTION_FONT_CSS } from "./caption-font-faces";
import { EditorCaptionPresets } from "./editor-caption-presets";
import { useEditorStore, useEditorStoreApi } from "./editor-store-provider";

/** The reel's one caption style (D396): presets, then font, size, colour and word by word. Every
 *  change reaches every caption. A slider or colour drag is one undo step (D400). */
export function EditorCaptionsStyle() {
  const store = useEditorStoreApi();
  const style = useEditorStore((s) => s.doc.captionStyle);
  const count = useEditorStore((s) => s.doc.captions.length);
  const editable = useEditorStore((s) => s.editable);
  const set = (patch: Partial<CaptionStyle>) => store.getState().apply((d) => applyCaptionStyle(d, patch));
  const begin = () => store.getState().begin();
  const commit = () => store.getState().commit();

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-xs text-muted-foreground">
        {count ? `Changes apply to all ${count} captions.` : "Captions you add will use this style."} Drag a caption on the preview to move it; drag a corner to resize.
      </p>
      <EditorCaptionPresets />
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
      <p className="m-0 border-t border-border pt-3 text-xs text-muted-foreground">
        {style.wordByWord ? "Arrives in Premiere as editable text on V2, one clip per word." : "Arrives in Premiere as editable text on V2, one clip per line."} The fonts ship in the package.
      </p>
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
