"use client";
// A selected caption's properties (mockup "Editor, caption selected"): text, timing, font, size,
// colour. The fonts are reel content shown in their own faces (D393).
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CAPTION_FONTS, captionFont, coveringFonts, missingChars } from "@/lib/editor/caption-fonts";
import { captionTimes, editCaption, MAX_CAPTION_TEXT } from "@/lib/editor/captions";
import { applyCaptionStyle, type CaptionStyle } from "@/lib/editor/caption-style";
import { formatTime } from "@/lib/editor/timeline";
import { cn } from "@/lib/utils";
import { CAPTION_FONT_CSS } from "./caption-font-faces";
import { useEditorStore } from "./editor-store-provider";

const SWATCHES = [
  { label: "White", value: "#ffffff" },
  { label: "Yellow", value: "#ffca2d" },
  { label: "Black", value: "#111827" },
];
const HEX = /^#?[0-9a-f]{6}$/i;

export function EditorCaptionProps({ captionId }: { captionId: string }) {
  const doc = useEditorStore((s) => s.doc);
  const sources = useEditorStore((s) => s.sources);
  const apply = useEditorStore((s) => s.apply);
  const editable = useEditorStore((s) => s.editable);
  const caption = doc.captions.find((c) => c.id === captionId);
  const [customOpen, setCustomOpen] = useState(false);
  if (!caption) return null;

  const t = captionTimes(doc, caption);
  const pieceIndex = doc.pieces.findIndex((p) => p.id === caption.pieceId);
  const handle = sources.find((s) => s.nodeId === doc.pieces[pieceIndex]?.sourceNodeId)?.handle ?? "";
  const style = doc.captionStyle;
  const patch = (p: Partial<CaptionStyle>) => apply((d) => applyCaptionStyle(d, p));
  const custom = !SWATCHES.some((s) => s.value === style.color.toLowerCase());

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-2">
        <span className="text-eyebrow text-muted-foreground">Caption</span>
        <Label htmlFor="cap-text" className="text-[13px] font-semibold">Text</Label>
        <Textarea id="cap-text" rows={2} maxLength={MAX_CAPTION_TEXT} value={caption.text} disabled={!editable} onChange={(e) => apply((d) => editCaption(d, caption.id, e.target.value))} />
        {t && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatTime(t.start)} → {formatTime(t.end)} · moves with piece {pieceIndex + 1}{handle ? ` (${handle})` : ""}
          </span>
        )}
        {(() => {
          const missing = missingChars(style.font, caption.text);
          if (missing.length === 0) return null;
          const shown = missing.slice(0, 4).join(" ");
          const others = coveringFonts(caption.text).map((k) => captionFont(k).label);
          return (
            <span className="text-xs text-destructive">
              {captionFont(style.font).label} has no {shown}.{" "}
              {others.length ? `${others.join(", ")} ${others.length === 1 ? "has" : "have"} them.` : "No caption font has them; Premiere will substitute one."}
            </span>
          );
        })()}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold">Font</span>
        <div role="radiogroup" aria-label="Caption font" className="flex flex-col gap-1.5">
          {CAPTION_FONTS.map((f) => (
            <Button
              key={f.key}
              role="radio"
              aria-checked={style.font === f.key}
              variant="outline"
              disabled={!editable}
              onClick={() => patch({ font: f.key })}
              style={{ fontFamily: CAPTION_FONT_CSS[f.key] }}
              className={cn("h-[34px] justify-start px-3 text-[15px]", style.font === f.key && "border-[1.5px] border-primary bg-primary/5")}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="cap-size" className="text-[13px] font-semibold">Size</Label>
          <InputGroup>
            <InputGroupInput
              id="cap-size"
              type="number"
              min={8}
              max={400}
              value={style.size}
              disabled={!editable}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 8 && n <= 400) patch({ size: n });
              }}
            />
            <InputGroupAddon align="inline-end"><InputGroupText>px</InputGroupText></InputGroupAddon>
          </InputGroup>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold">Colour</span>
          <div role="radiogroup" aria-label="Caption colour" className="flex items-center gap-2">
            {SWATCHES.map((s) => (
              <Button
                key={s.value}
                role="radio"
                aria-checked={style.color.toLowerCase() === s.value}
                aria-label={s.label}
                variant="outline"
                size="icon"
                disabled={!editable}
                onClick={() => patch({ color: s.value })}
                style={{ background: s.value }}
                className={cn("size-[26px] rounded-full", style.color.toLowerCase() === s.value && "border-2 border-primary")}
              />
            ))}
            <Button
              aria-label="Custom colour"
              variant="outline"
              size="icon"
              disabled={!editable}
              onClick={() => setCustomOpen((o) => !o)}
              className={cn("size-[26px] rounded-full border-dashed text-muted-foreground", custom && "border-2 border-solid border-primary")}
            >
              <Plus className="size-3.5" strokeWidth={1.5} />
            </Button>
          </div>
        </div>
      </div>
      {(customOpen || custom) && (
        <InputGroup className="max-w-40">
          <InputGroupAddon><InputGroupText>#</InputGroupText></InputGroupAddon>
          <InputGroupInput
            aria-label="Custom colour, hex"
            defaultValue={style.color.replace("#", "")}
            disabled={!editable}
            onChange={(e) => HEX.test(e.target.value) && patch({ color: `#${e.target.value.replace("#", "").toLowerCase()}` })}
          />
        </InputGroup>
      )}

      <span className="text-xs text-muted-foreground">Arrives in Premiere as editable text on V2. The font files ship in the package.</span>
    </div>
  );
}
