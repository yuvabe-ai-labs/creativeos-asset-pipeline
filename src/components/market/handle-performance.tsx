"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePerformance } from "@/hooks/use-performance";
import { HandleIdentityStrip } from "./handle-identity-strip";
import { PerformanceChart } from "./performance-chart";
import { PerformancePostTile } from "./performance-post-tile";

function StatCard({
  label,
  value,
  hint,
  delta,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: string | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <p className="text-eyebrow">{label}</p>
      <p className="mt-1 flex items-baseline gap-2 font-display text-2xl font-semibold tabular-nums">
        {value}
        {delta && (
          <span className="text-xs font-semibold text-green-700 dark:text-green-400">{delta}</span>
        )}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

/** One tracked handle's panel (D253). Each sub-tab renders this independently — a
 *  handle added today shows "first snapshot pending" while its neighbours show data.
 *
 *  `fetchFirst` (D275): a handle that was just added fires the refresh route the moment
 *  this mounts, so the ~10 s scrape is shown here — as a fetching state on the tab the
 *  user is already looking at — instead of holding the add dialog open on a spinner. */
export function HandlePerformance({
  clientId,
  handle,
  fetchFirst = false,
  onFirstFetchDone,
  onRemove,
}: {
  clientId: string;
  handle: string;
  fetchFirst?: boolean;
  onFirstFetchDone?: () => void;
  onRemove: () => void;
}) {
  const { data, loading, refreshing, refresh } = usePerformance(clientId, handle);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Once per mount, and only after the initial load has confirmed there is nothing yet:
  // a re-added handle that still has history (D253) must not be scraped again.
  const firstFetchStarted = useRef(false);
  useEffect(() => {
    if (!fetchFirst || loading || !data || firstFetchStarted.current) return;
    if (data.latest) {
      onFirstFetchDone?.();
      return;
    }
    firstFetchStarted.current = true;
    void refresh().then((error) => {
      setRefreshError(error);
      onFirstFetchDone?.();
    });
  }, [fetchFirst, loading, data, refresh, onFirstFetchDone]);

  if (loading || !data) {
    return <p className="py-10 text-sm text-muted-foreground">Loading @{handle}…</p>;
  }

  const { stats } = data;
  const pct = stats.engagementRate !== null ? `${(stats.engagementRate * 100).toFixed(1)}%` : "—";
  const cadence =
    stats.cadencePerMonth !== null ? `~${stats.cadencePerMonth.toFixed(1)}/mo` : "—";

  return (
    <div className="space-y-5">
      <HandleIdentityStrip handle={data.handle} identity={data.identity} onRemove={onRemove} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Followers"
          value={data.latest ? String(data.latest.followersCount) : "—"}
          delta={
            stats.followerDelta7d !== null && stats.followerDelta7d !== 0
              ? `${stats.followerDelta7d > 0 ? "+" : ""}${stats.followerDelta7d} this week`
              : null
          }
          hint={data.latest ? `${data.latest.followsCount} following` : undefined}
        />
        <StatCard label="Engagement" value={pct} hint="median likes + comments ÷ followers" />
        <StatCard
          label="Posts"
          value={data.latest ? String(data.latest.postsCount) : "—"}
          hint="all time"
        />
        <StatCard label="Cadence" value={cadence} hint="from the posts we hold" />
      </div>

      {/* Handle tracked, pipeline has not run yet — or is running right now. */}
      {!data.latest ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center shadow-card">
          {refreshing ? (
            <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <RefreshCw strokeWidth={1.5} className="size-4 animate-spin text-primary" />
              Fetching the first snapshot for{" "}
              <span className="font-medium text-foreground">@{data.handle}</span> — about ten
              seconds.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              First snapshot pending for{" "}
              <span className="font-medium text-foreground">@{data.handle}</span>. Refresh to
              fetch it now, or wait for tonight&apos;s sweep.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <div className="flex items-baseline justify-between">
            <p className="text-eyebrow">Followers · since tracking began</p>
            {data.series.length >= 2 && (
              <p className="text-xs text-muted-foreground/70 tabular-nums">
                {data.series.length} snapshots
              </p>
            )}
          </div>
          <PerformanceChart series={data.series} />
        </div>
      )}

      {data.posts.length > 0 && (
        <>
          <div className="flex items-baseline justify-between">
            <p className="text-eyebrow">Recent posts</p>
            {stats.medianLikes !== null && (
              <p className="text-xs text-muted-foreground/70">
                multiplier vs account median ({stats.medianLikes} likes)
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {data.posts.map((post) => (
              <PerformancePostTile key={post.id} post={post} medianLikes={stats.medianLikes} />
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-xs text-muted-foreground/70">
        <span>
          {data.latest
            ? `Last updated ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.latest.capturedAt))}`
            : "No snapshots yet"}
          {refreshError && <span className="ml-2 text-destructive">{refreshError}</span>}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={refreshing}
          className="border-dashed border-primary/40 text-primary hover:bg-primary/5"
          onClick={async () => setRefreshError(await refresh())}
        >
          <RefreshCw strokeWidth={1.5} className={refreshing ? "animate-spin" : undefined} />
          {refreshing ? "Refreshing…" : "Refresh now"}
        </Button>
      </div>
    </div>
  );
}
