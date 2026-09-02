"use client";

import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  splitSentenceBeats,
  segmentByTerms,
  splitImageRefs,
  CAMERA_SPEC_PATTERNS,
  TIMECODE_PATTERNS,
} from "@/lib/nodes/prompt-focus";

export type PromptRefImage = { id: string; label: string; fileUrl?: string };

/**
 * One `<IMAGE_REF_N>` token, rendered as the picture it stands for.
 *
 * Deliberately the same chip the instruction editor builds for an @-mention — same padding, same
 * `bg-primary/10`, same `size-3.5` thumbnail — so a reference reads identically whether it was
 * typed into the instruction or written into the prompt by the model.
 *
 * The title carries the raw token. The picture says WHICH reference at a glance; the token is what
 * actually ships to the model, and hovering is how you check the binding without leaving the view.
 */
function ImageRefChip({ image, token }: { image: PromptRefImage | undefined; token: string }) {
  // The model invented a token past the end of the roster. Showing it raw and marked is the only
  // honest option — quietly dropping it would hide a prompt that will bind to nothing.
  if (!image) {
    return (
      <span
        title={`${token} — no reference image is attached at this index`}
        className="mx-0.5 inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 align-middle text-xs font-medium text-destructive"
      >
        <ImageOff className="size-3 shrink-0" strokeWidth={1.5} />
        {token}
      </span>
    );
  }

  return (
    <span
      title={`${token} — ${image.label}`}
      className="mx-0.5 inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 align-middle text-xs font-medium text-primary"
    >
      {image.fileUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.fileUrl} alt="" className="size-3.5 shrink-0 rounded object-cover" />
      )}
      {/* The index, not the filename: the prompt already names the thing in the words right
          before this chip ("the CHUPPS V-Straps <IMAGE_REF_1>"), so the thumbnail beside that
          claim is the check, and a filename repeated here would only crowd it. */}
      <span>{token.replace(/^<IMAGE_REF_(\d+)>$/, "REF $1")}</span>
    </span>
  );
}

/**
 * The generated motion prompt as the operator should read it: sentence beats, timings and lens
 * specs highlighted, and every reference token replaced by its picture.
 *
 * Before this, a prompt full of `<IMAGE_REF_0>` read as raw markup — something to tidy out rather
 * than the load-bearing syntax that binds a beat to an attached photograph.
 */
export function GeneratedPromptBody({
  text,
  images,
}: {
  text: string;
  images: PromptRefImage[];
}) {
  return (
    <span className="block space-y-2.5">
      {splitSentenceBeats(text).map((beat, i) => (
        <span key={i} className="block">
          {splitImageRefs(beat).map((segment, j) =>
            segment.refIndex === undefined ? (
              <span key={j}>
                {segmentByTerms(segment.text, [
                  ...CAMERA_SPEC_PATTERNS,
                  ...TIMECODE_PATTERNS,
                ]).map((seg, k) =>
                  seg.highlighted ? (
                    <span key={k} className={cn("rounded bg-primary/10 px-0.5 font-bold")}>
                      {seg.text}
                    </span>
                  ) : (
                    <span key={k}>{seg.text}</span>
                  ),
                )}
              </span>
            ) : (
              <ImageRefChip
                key={j}
                token={segment.text}
                image={images[segment.refIndex]}
              />
            ),
          )}
        </span>
      ))}
    </span>
  );
}
