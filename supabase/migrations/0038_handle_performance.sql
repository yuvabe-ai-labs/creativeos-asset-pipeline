-- Handle Performance (D235, D237): daily Apify snapshots of the client's Instagram
-- account. account_snapshots is the time series (one row per scrape, full provider
-- payload kept in raw — normalize-at-boundary, D237); tracked_posts holds the LATEST
-- metrics per post, upserted by shortcode. platform is check-constrained single-value
-- today so competitor/TikTok expansion (V1.x) is a constraint change, not a reshape.

create table account_snapshots (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  platform        text not null default 'instagram'
    check (platform in ('instagram')),
  handle          text not null,
  followers_count int  not null,
  follows_count   int  not null,
  posts_count     int  not null,
  raw             jsonb not null,
  captured_at     timestamptz not null default now()
);

create index account_snapshots_series_idx
  on account_snapshots (client_id, platform, handle, captured_at desc);

create table tracked_posts (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients(id) on delete cascade,
  platform         text not null default 'instagram'
    check (platform in ('instagram')),
  handle           text not null,
  short_code       text not null,
  post_type        text not null check (post_type in ('image', 'video', 'carousel')),
  caption          text not null default '',
  post_url         text not null,
  likes_count      int,            -- null = provider hid the count (-1 sentinel dies at ingest)
  comments_count   int not null default 0,
  video_view_count int,            -- videos only
  posted_at        timestamptz not null,
  thumbnail_url    text,           -- GCS re-hosted; the provider displayUrl expires
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  unique (client_id, platform, short_code)
);

create index tracked_posts_client_idx on tracked_posts (client_id, posted_at desc);

-- Default-deny RLS, matching 0017/0027: enable with zero policies. App access goes
-- through the service-role client (createServerSupabase), which bypasses RLS; this
-- only closes the direct-REST path.
alter table account_snapshots enable row level security;
alter table tracked_posts enable row level security;
