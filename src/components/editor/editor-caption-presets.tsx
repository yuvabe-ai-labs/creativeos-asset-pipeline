"use client";

import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { applyCaptionStyle, CAPTION_PRESETS, PRESET_KEYS, presetOf, type CaptionLook } from "@/lib/editor/caption-style";
import { cn } from "@/lib/utils";
import { CAPTION_FONT_CSS } from "./caption-font-faces";
import { useEditorStore } from "./editor-store-provider";

const sampleStyle = (look: CaptionLook): CSSProperties => ({
  fontFamily: CAPTION_FONT_CSS[look.font],
  textTransform: look.upper ? "uppercase" : "none",
  ...(look.box
    ? { background: look.boxColor, padding: "1px 6px", borderRadius: 3 }
    : look.outline
      ? { WebkitTextStroke: "1.5px #000", paintOrder: "stroke fill" }
      : { textShadow: "0 1px 6px rgba(0,0,0,.6)" }),
});

/** Four looks (D396). A preset never moves or retimes captions. */
export function EditorCaptionPresets() {
  const style = useEditorStore((s) => s.doc.captionStyle);
  const apply = useEditorStore((s) => s.apply);
  const editable = useEditorStore((s) => s.editable);
  const current = presetOf(style);
  return (
    <div role="radiogroup" aria-label="Caption presets" className="grid grid-cols-2 gap-2">
      {PRESET_KEYS.map((k) => {
        const { label, sample, look } = CAPTION_PRESETS[k];
        return (
          <Button
            key={k}
            role="radio"
            aria-checked={current === k}
            variant="outline"
            disabled={!editable}
            onClick={() => apply((d) => applyCaptionStyle(d, look))}
            className={cn(
              "flex h-auto flex-col gap-1 rounded-[10px] border-border bg-neutral-900 py-3 text-white transition-transform duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006] hover:bg-neutral-900 hover:text-white",
              current === k && "outline outline-2 outline-offset-2 outline-primary",
            )}
          >
            <span className="text-[15px] leading-tight text-white" style={sampleStyle(look)}>
              {look.wordByWord ? (
                <>
                  <span style={{ color: look.activeColor }}>{sample.slice(0, 2)}</span>
                  {sample.slice(2)}
                </>
              ) : (
                sample
              )}
            </span>
            <span className="text-[10.5px] text-white/70">{label}</span>
          </Button>
        );
      })}
    </div>
  );
}
