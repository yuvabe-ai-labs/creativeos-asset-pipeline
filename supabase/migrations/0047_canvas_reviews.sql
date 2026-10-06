-- D307: public, token-scoped client review of an uploaded cut.
-- One review per Client review node; comments are add + edit (never delete).
-- Server code reads and writes both tables with the service-role client (D44).
-- No anon policy — the public page goes through /api/r/* (D86 stands).

create table canvas_reviews (
  id           uuid primary key default gen_random_uuid(),
  canvas_id    uuid not null references canvases(id) on delete cascade,
  node_id      uuid not null unique references nodes(id) on delete cascade,
  org_id       uuid not null references organizations(id),
  video_path   text not null,
  share_token  text not null unique,
  created_by   uuid not null,
  created_at   timestamptz not null default now()
);

create table canvas_review_comments (
  id              uuid primary key default gen_random_uuid(),
  review_id       uuid not null references canvas_reviews(id) on delete cascade,
  author_name     text not null check (char_length(author_name) between 1 and 60),
  body            text not null check (char_length(body) between 1 and 2000),
  timecode_ms     int  not null check (timecode_ms >= 0),
  edited_by_name  text check (edited_by_name is null or char_length(edited_by_name) between 1 and 60),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index canvas_review_comments_review_created
  on canvas_review_comments (review_id, created_at);

-- org_id from canvas → client → org, same pattern as set_node_version_org_id (0030).
create or replace function set_canvas_review_org_id() returns trigger
language plpgsql as $$
begin
  if new.org_id is null then
    select cl.org_id into new.org_id
      from canvases cv
      join clients cl on cl.id = cv.client_id
     where cv.id = new.canvas_id;
  end if;
  return new;
end;
$$;

create trigger canvas_reviews_set_org_id
  before insert on canvas_reviews
  for each row execute function set_canvas_review_org_id();

-- Default-deny: RLS on, no policies. Only the service role touches these tables.
alter table canvas_reviews enable row level security;
alter table canvas_review_comments enable row level security;
