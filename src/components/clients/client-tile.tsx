import Link from "next/link";
import { KBStatusBadge } from "@/components/clients/kb-status-badge";
import { PendingCountPill } from "@/components/shared/pending-count-pill";
import { TruncatedText } from "@/components/ui/truncated-text";
import { ClientRowActions } from "@/components/clients/client-row-actions";
import { ClientSectionLinks } from "@/components/clients/client-section-links";
import { formatRelativeTime } from "@/lib/format/relative-time";
import { initials } from "@/lib/format/initials";
import type { ClientWithCount } from "@/lib/db/clients";

function activity(client: ClientWithCount): string {
  if (client.canvas_count === 0) return "No canvases yet";
  const canvases = `${client.canvas_count} ${client.canvas_count === 1 ? "canvas" : "canvases"}`;
  return `${canvases}, active ${formatRelativeTime(client.last_active)}`;
}

/**
 * One client on the home grid. The logo sits as a white chip on the editor's signal grid —
 * an asset placed on a canvas — which is the tile's one distinctive move; the rest stays
 * quiet. The plate + name are ONE link (to the client's canvases); the ⋯ menu and the
 * section shortcuts are siblings of it, never nested, since an <a> can't hold an <a> or a
 * <button>.
 */
export function ClientTile({
  client,
  archived,
  pendingCount,
}: {
  client: ClientWithCount;
  archived: boolean;
  pendingCount: number;
}) {
  return (
    <li className="group relative flex flex-col rounded-xl border bg-card shadow-card transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.006]">
      <Link
        href={`/clients/${client.slug}`}
        className="flex flex-1 flex-col rounded-t-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span className="canvas-surface flex aspect-[4/3] items-center justify-center rounded-t-xl border-b">
          <span className="flex size-32 items-center justify-center rounded-2xl border bg-card p-5 shadow-card">
            {client.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={client.logo_url}
                alt=""
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="font-display text-3xl font-semibold tracking-[-0.02em] text-muted-foreground/50">
                {initials(client.name)}
              </span>
            )}
          </span>
        </span>

        <span className="flex flex-col gap-1 px-4 pt-3.5 pb-3">
          <span className="flex items-center justify-between gap-2">
            <TruncatedText className="font-display text-base font-medium">
              {client.name}
            </TruncatedText>
            <KBStatusBadge status={client.kb_status} />
          </span>
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-sm text-muted-foreground">{activity(client)}</span>
            <PendingCountPill count={pendingCount} scope="client" />
          </span>
        </span>
      </Link>

      {/* Revealed on hover/focus where hover exists; always shown on touch, and kept up while
          its popover is open so the menu doesn't lose its anchor when the pointer leaves. */}
      <div className="absolute top-2 right-2 rounded-md bg-card/90 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100">
        <ClientRowActions clientId={client.id} slug={client.slug} archived={archived} />
      </div>

      {!archived && <ClientSectionLinks slug={client.slug} clientName={client.name} />}
    </li>
  );
}
