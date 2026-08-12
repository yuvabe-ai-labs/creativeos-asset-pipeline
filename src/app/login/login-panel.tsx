import Image from "next/image";
import { randomLoginImage } from "@/lib/login-images";

/**
 * How the panel's copy gets its contrast. Flip this one word to switch.
 *
 * - "plate" — the copy sits on a smoked-glass card over the photograph. Keeps the
 *             full-bleed look and stays legible (70% dark + blur clears AA even over a
 *             white frame), but it does cover a corner of the image.
 * - "band"  — the copy sits in a solid strip BELOW the photograph, never over it.
 *             Readability is independent of the image, because nothing overlaps: it
 *             cannot fail on a bright frame, a busy frame, or a frame added later.
 *             The photograph is 100% unobstructed, just shorter.
 *
 * Rejected: darkening the whole frame with a gradient. Strong enough to guarantee the
 * text turns the photograph into a black rectangle, which defeats having one.
 */
const PANEL_STYLE: "plate" | "band" = "plate";

function PanelCopy() {
  return (
    <>
      <h2 className="font-display text-2xl leading-tight font-semibold text-white">
        Script to reel,
        <br />
        on one canvas
      </h2>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/85">
        Brand-aware generation, from the first draft to the approved clip.
      </p>
    </>
  );
}

// The photo half of the sign-in split. A server component on purpose: the frame is
// chosen during the server render, so the client never re-picks and there is no
// hydration mismatch and no swap-in flash. Hidden below `md`, where a hero image would
// push the actual form off a phone screen.
export function LoginPanel() {
  const src = randomLoginImage();

  // Decorative: the panel's own copy carries the meaning, so an alt description here
  // would only add noise for a screen reader.
  const photo = (
    <Image
      src={src}
      alt=""
      fill
      sizes="(min-width: 768px) 50vw, 0px"
      className="object-cover"
      priority
    />
  );

  if (PANEL_STYLE === "band") {
    return (
      <div className="hidden flex-col overflow-hidden bg-neutral-950 md:flex">
        <div className="relative flex-1">
          {photo}
          {/* Feathers the photo into the strip so the two don't meet on a hard line. */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-neutral-950 to-transparent" />
        </div>
        <div className="px-8 pt-2 pb-8">
          <PanelCopy />
        </div>
      </div>
    );
  }

  return (
    <div className="relative hidden overflow-hidden md:block">
      {photo}
      <div className="absolute inset-x-0 bottom-0 p-5">
        {/* No hairline ring and a generous radius: the ring drew a hard rectangle
            against the photo, which is what read as a sharp edge. The blur now ends on
            a soft corner instead of an outlined one. */}
        <div className="rounded-3xl bg-neutral-950/70 px-7 py-6 backdrop-blur-lg">
          <PanelCopy />
        </div>
      </div>
    </div>
  );
}
