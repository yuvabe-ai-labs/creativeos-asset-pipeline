// src/components/script-review/review-cast.tsx
import type { ScriptDoc } from "@/lib/scripts/schema";
import type { VersionVisuals } from "@/lib/script-review/types";
import { ReviewCastCard } from "./review-cast-card";

/** The cast, read-only, in the script's order: one card per person, the page's width, each big
 *  enough for the client to judge the avatar and watch its preview (D465, D466). */
export function ReviewCast({ doc, visuals, showAvatars }: { doc: ScriptDoc; visuals: VersionVisuals; showAvatars: boolean }) {
  return (
    <section aria-label="Cast" className="flex flex-col gap-3">
      <h2 className="text-eyebrow">Cast</h2>
      <div className="flex flex-col gap-4">
        {doc.cast.map((member) => (
          <ReviewCastCard key={member.id} member={member} avatar={visuals.avatars[member.id]} showAvatar={showAvatars} />
        ))}
      </div>
    </section>
  );
}
