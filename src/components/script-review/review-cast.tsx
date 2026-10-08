// src/components/script-review/review-cast.tsx
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { VersionVisuals } from "@/lib/script-review/types";
import { ReviewCastCard } from "./review-cast-card";

/** The Visuals pane's cast, read-only, in the script's order (spec 3's CastSlots, for a version). */
export function ReviewCast({ doc, visuals, showAvatars }: { doc: ScriptDoc; visuals: VersionVisuals; showAvatars: boolean }) {
  return (
    <section aria-label="Cast" className="flex flex-col gap-3">
      <h2 className="text-eyebrow">Cast</h2>
      <div className="grid gap-4">
        {doc.cast.map((member) => (
          <ReviewCastCard key={member.id} member={member} avatar={visuals.avatars[member.id]} showAvatar={showAvatars} />
        ))}
      </div>
    </section>
  );
}
