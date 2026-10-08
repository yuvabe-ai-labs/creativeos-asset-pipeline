import type { ReactNode } from "react";
import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { castAnchor } from "@/lib/scripts/anchors";
import type { CastMember } from "@/lib/scripts/schema";

export function ScriptCastList({
  cast,
  avatarFaces,
  renderExtra,
}: {
  cast: CastMember[];
  avatarFaces: Record<string, string | null>;
  renderExtra?: (member: CastMember) => ReactNode;
}) {
  return (
    <section aria-label="Cast" className="flex flex-col gap-3">
      <h2 className="text-eyebrow">Cast</h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {cast.map((c) => {
          const face = c.avatarId ? avatarFaces[c.avatarId] ?? null : null;
          const extra = renderExtra?.(c);
          return (
            <li key={c.id} id={castAnchor(c.id)} className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-3 has-[[data-part-commented]]:border-client/40">
              <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                {face ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={face} alt={`${c.name}, avatar`} className="size-full object-cover" />
                ) : (
                  <UserRound className="absolute inset-0 m-auto size-6 text-muted-foreground/50" strokeWidth={1.5} aria-hidden />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  {c.isLead && <Badge variant="outline">Lead</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{c.description}</p>
                {!c.avatarId && <span className="text-xs text-muted-foreground">No avatar yet</span>}
              </div>
              {extra ? <div className="basis-full">{extra}</div> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
