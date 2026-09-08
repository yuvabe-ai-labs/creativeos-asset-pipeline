// Pure normalization + derivation for the Performance tab (D235, D237). No I/O here:
// the Apify payload comes in, nulls and numbers come out, so every rule (the -1
// hidden-likes sentinel, median-vs-hidden exclusion, engagement math) is unit-testable
// against the real spike fixture.

export type ApifyPost = {
  shortCode: string;
  type: string; // "Image" | "Video" | "Sidecar" (provider vocabulary)
  caption?: string;
  url: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  timestamp: string;
  displayUrl?: string;
};

export type ApifyProfileItem = {
  username: string;
  fullName?: string;
  biography?: string;
  externalUrl?: string;
  businessCategoryName?: string;
  profilePicUrlHD?: string;
  followersCount: number;
  followsCount?: number;
  postsCount?: number;
  latestPosts?: ApifyPost[];
};

export type NormalizedSnapshot = {
  handle: string;
  followersCount: number;
  followsCount: number;
  postsCount: number;
  raw: unknown;
};

export type NormalizedPost = {
  shortCode: string;
  postType: "image" | "video" | "carousel";
  caption: string;
  postUrl: string;
  likesCount: number | null;
  commentsCount: number;
  videoViewCount: number | null;
  postedAt: string;
  displayUrl: string | null;
};

export type PerformanceStats = {
  engagementRate: number | null;
  medianLikes: number | null;
  cadencePerMonth: number | null;
  followerDelta7d: number | null;
};

const HANDLE_RE = /^[a-z0-9._]{1,30}$/;

export function parseInstagramHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let candidate = raw.trim();
  if (candidate.includes("instagram.com")) {
    try {
      const url = new URL(candidate.startsWith("http") ? candidate : `https://${candidate}`);
      candidate = url.pathname.split("/").filter(Boolean)[0] ?? "";
    } catch {
      return null;
    }
  }
  candidate = candidate.replace(/^@/, "").toLowerCase();
  return HANDLE_RE.test(candidate) ? candidate : null;
}

const TYPE_MAP: Record<string, NormalizedPost["postType"]> = {
  Image: "image",
  Video: "video",
  Sidecar: "carousel",
};

export function normalizeProfileItem(item: ApifyProfileItem): {
  snapshot: NormalizedSnapshot;
  posts: NormalizedPost[];
} {
  const snapshot: NormalizedSnapshot = {
    handle: item.username.toLowerCase(),
    followersCount: item.followersCount,
    followsCount: item.followsCount ?? 0,
    postsCount: item.postsCount ?? 0,
    raw: item,
  };
  const posts: NormalizedPost[] = (item.latestPosts ?? []).map((p) => {
    const postType = TYPE_MAP[p.type] ?? "image";
    return {
      shortCode: p.shortCode,
      postType,
      caption: p.caption ?? "",
      postUrl: p.url,
      // -1 is the provider's in-band "the platform hid this count" sentinel (D237);
      // it must become null HERE so it can never poison a median downstream.
      likesCount: p.likesCount == null || p.likesCount < 0 ? null : p.likesCount,
      commentsCount: p.commentsCount ?? 0,
      videoViewCount: postType === "video" ? (p.videoViewCount ?? null) : null,
      postedAt: p.timestamp,
      displayUrl: p.displayUrl ?? null,
    };
  });
  return { snapshot, posts };
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const MS_PER_DAY = 86_400_000;

export function computeStats(input: {
  posts: { likesCount: number | null; commentsCount: number; postedAt: string }[];
  followers: number | null;
  series: { capturedAt: string; followers: number }[];
}): PerformanceStats {
  const visible = input.posts.filter((p) => p.likesCount !== null);
  const medianLikes = median(visible.map((p) => p.likesCount as number));
  const medianComments = median(input.posts.map((p) => p.commentsCount));

  const engagementRate =
    medianLikes !== null && medianComments !== null && input.followers
      ? (medianLikes + medianComments) / input.followers
      : null;

  let cadencePerMonth: number | null = null;
  if (input.posts.length >= 2) {
    const times = input.posts.map((p) => new Date(p.postedAt).getTime());
    const spreadDays = (Math.max(...times) - Math.min(...times)) / MS_PER_DAY;
    if (spreadDays > 0) cadencePerMonth = input.posts.length / (spreadDays / 30.44);
  }

  let followerDelta7d: number | null = null;
  if (input.series.length >= 2) {
    const sorted = [...input.series].sort(
      (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime(),
    );
    const latest = sorted[sorted.length - 1];
    const cutoff = new Date(latest.capturedAt).getTime() - 7 * MS_PER_DAY;
    // Most recent snapshot at least 7 days older than the latest one.
    const baseline = [...sorted]
      .reverse()
      .find((s) => new Date(s.capturedAt).getTime() <= cutoff);
    if (baseline) followerDelta7d = latest.followers - baseline.followers;
  }

  return { engagementRate, medianLikes, cadencePerMonth, followerDelta7d };
}

export function postMultiplier(
  likesCount: number | null,
  medianLikes: number | null,
): number | null {
  if (likesCount === null || medianLikes === null || medianLikes <= 0) return null;
  return likesCount / medianLikes;
}
