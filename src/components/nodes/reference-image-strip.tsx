"use client";

import { Images } from "lucide-react";
import { FieldLabel } from "./field-label";
import { isVisionAttachment } from "@/lib/nodes/compose-message";
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
}: {
  upstream: UpstreamNode[];
  omni: boolean;
}) {
  const images = upstream.filter((u) =>
    isVisionAttachment({ type: u.type, fileUrl: u.fileUrl, fileKind: u.fileKind, useLlm: u.useLlm }),
  );
  if (images.length === 0) return null;

  return (
    <div className="min-w-0 space-y-1.5">
      <FieldLabel icon={Images} label={`Reference images · ${images.length}`} />
      <p className="text-xs text-muted-foreground">
        {omni
          ? "Named in the prompt by these tokens. The model reads the pictures itself — you don't have to label them."
          : "Referenced in the prompt by position. The model reads the pictures itself."}
      </p>

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
            <figcaption className="max-w-20 truncate text-center text-[0.65rem] font-medium text-primary">
              {omni ? omniImageRefToken(i + 1) : ordinalToEnglish(i + 1)}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
