"use client";

import { Images } from "lucide-react";
import { FieldLabel } from "./field-label";
import { visionAttachmentsOf } from "@/lib/nodes/compose-message";
import { omniImageRefToken, ordinalToEnglish } from "@/lib/nodes/resolve-mention-tokens";
import { refsCitedIn, type MultishotPlan } from "@/lib/nodes/multishot-plan";
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
  plan,
}: {
  upstream: UpstreamNode[];
  omni: boolean;
  /**
   * Present only on the Multishot Prompt node, whose plan is checkable against its own
   * beats. When given, a reference no beat's text cites (via `refsCitedIn`) is marked —
   * the writer is told to cite only what a shot needs, so an uncited reference is normal,
   * but a connected image the finished prompt never mentions is otherwise only
   * discoverable in the rendered video.
   */
  plan?: MultishotPlan | null;
}) {
  const images = visionAttachmentsOf(upstream);
  if (images.length === 0) return null;

  const cited = plan ? new Set(plan.beats.flatMap((b) => refsCitedIn(b.text))) : null;

  return (
    <div className="min-w-0 space-y-1.5">
      <FieldLabel icon={Images} label={`Reference images · ${images.length}`} />


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
            {cited && !cited.has(i) && (
              <span className="text-[0.6rem] text-muted-foreground">Not cited</span>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}
