import Image from "next/image";
import { randomLoginImage } from "@/lib/login-images";

// The photo half of the sign-in split. A server component on purpose: the frame is
// chosen during the server render, so the client never re-picks and there is no
// hydration mismatch and no swap-in flash. Hidden below `md`, where a hero image would
// push the actual form off a phone screen.
export function LoginPanel() {
  const src = randomLoginImage();

  return (
    <div className="relative hidden overflow-hidden md:block">
      {/* Decorative: the panel's own copy below carries the meaning, so an alt
          description here would only add noise for a screen reader. */}
      <Image
        src={src}
        alt=""
        fill
        sizes="(min-width: 768px) 50vw, 0px"
        className="object-cover"
        priority
      />

      {/* Grounds the copy against whichever frame loaded — these are photographs we
          don't control, so the text needs its own contrast, not the image's goodwill. */}
      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/85 via-neutral-950/30 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 p-8">
        <p className="text-eyebrow text-[0.65rem] text-white/70">Yuvabe Studios</p>
        <h2 className="font-display mt-2 text-2xl leading-tight font-semibold text-white">
          Script to reel,
          <br />
          on one canvas
        </h2>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/70">
          Brand-aware generation, from the first draft to the approved clip.
        </p>
      </div>
    </div>
  );
}
