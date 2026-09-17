import { Skeleton } from "@/components/ui/skeleton";
import { MARKET_MASONRY } from "@/lib/market/constants";

// Fixed heights (not random) so server and client render the same markup. The mix
// mirrors a real shelf: short link cards (favicon + host) between tall thumbnails.
const TILE_HEIGHTS = ["h-28", "h-96", "h-72", "h-28", "h-80", "h-28", "h-64", "h-28", "h-96", "h-28", "h-72", "h-28"];

/** Placeholder for the Direct/Adjacent masonry — dashed add tile first, as in the live grid. */
export function MarketGridSkeleton() {
  return (
    <div className={MARKET_MASONRY} aria-hidden>
      <div className="min-h-36 rounded-lg border border-dashed border-primary/20" />
      {TILE_HEIGHTS.map((h, i) => (
        <Skeleton key={i} className={`${h} w-full rounded-lg`} />
      ))}
    </div>
  );
}
