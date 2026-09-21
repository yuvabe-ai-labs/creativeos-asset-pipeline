"use client";

import { Images } from "lucide-react";
import { FieldLabel } from "./field-label";
import { visionAttachmentsOf } from "@/lib/nodes/compose-message";
import { omniImageRefToken, ordinalToEnglish } from "@/lib/nodes/resolve-mention-tokens";
import type { UpstreamNode } from "./connected-inputs-card";

/**
 * The attached reference images, as pictures with the token each one answers to.
 *
 * Two things this fixes at once. The panel listed references as filenames — "Screenshot 2026 08 25
 * 155453" identifies nothing, so there was no way to tell which picture was which without opening
 * the rail. And the binding between an image and its prompt token was invisible: the generated
 * prompt says <IMAGE_REF_0> and nothing on screen said which photograph that was. A wrong binding
 * raises no error, it just generates the wrong product — and is only visible in a clip already
 * paid for.
 *
 * The token shown is the one the prompt will actually carry, so this doubles as the check: if the
 * badge under the sandals says <IMAGE_REF_1>, then <IMAGE_REF_1> in the prompt is the sandals.
 */
export function ReferenceImageStrip({
  upstream,
  omni,
  uncitedIndices,
  hideLabel = false,
}: {
  upstream: UpstreamNode[];
  omni: boolean;
  /**
   * Indices (into `visionAttachmentsOf(upstream)`, the same order-preserving filter this
   * component already applies) of references the caller's content never mentions — e.g. the
   * Multishot Prompt node passes the references none of its beats cite via `refsCitedIn`. Kept
   * domain-free here so any node type can mark an uncited reference without this shared
   * component knowing what a "beat" or a "plan" is.
   */
  uncitedIndices?: Set<number>;
  /**
   * Drops the strip's own "Reference images · N" heading. For callers whose surrounding chrome
   * already says it — the Multishot Prompt node's accordion chip carries exactly that label, so
   * rendering it again inside the panel it opens just repeats the thing you clicked.
   */
  hideLabel?: boolean;
}) {
  const images = visionAttachmentsOf(upstream);
  if (images.length === 0) return null;

  return (
    <div className="min-w-0 space-y-1.5">
      {!hideLabel && <FieldLabel icon={Images} label={`Reference images · ${images.length}`} />}


      <div className="flex min-w-0 flex-wrap gap-2">
        {images.map((image, i) => (
          <figure
            key={image.id}
            className="flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-muted/40 p-1.5"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.fileUrl}
              alt={image.label}
              className="size-20 rounded-md object-cover"
            />
            {uncitedIndices?.has(i) && (
              <span className="text-[0.6rem] text-muted-foreground">Not cited</span>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}
