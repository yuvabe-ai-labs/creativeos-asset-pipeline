-- D495–D499: a Client review holds versions; each version has its own link, its own comments
-- and its own Allow download switch. One Client review node per canvas from now on; canvases
-- that already have several keep them all, each as a single-version review.

create table canvas_review_versions (
  id              uuid primary key default gen_random_uuid(),
  review_id       uuid not null references canvas_reviews(id) on delete cascade,
  version_no      int  not null check (version_no >= 1),
  video_path      text not null,
  -- The cut's name, from its file name at upload; the focus view's title follows the version
  -- on screen, and the version's link and download carry it. Null falls back to the node title.
  title           text check (title is null or char_length(title) between 1 and 200),
  allow_download  boolean not null default true,
  -- D496: a v1 moved from a pre-version review keeps the exact link the client already has
  -- (no "-v1" suffix). New reviews' v1 links carry the suffix.
  legacy_link     boolean not null default false,
  created_by      uuid not null,
  created_at      timestamptz not null default now(),
  unique (review_id, version_no)
);

-- Default-deny, as 0047: only the service role touches it.
alter table canvas_review_versions enable row level security;

-- D499: every existing review becomes v1 with its cut, download on (today's links keep their
-- button, D497), named after its node as the client saw it.
insert into canvas_review_versions (review_id, version_no, video_path, title, allow_download, legacy_link, created_by, created_at)
select r.id, 1, r.video_path, nullif(left(btrim(n.data->>'title'), 200), ''), true, true, r.created_by, r.created_at
  from canvas_reviews r
  join nodes n on n.id = r.node_id;

alter table canvas_review_comments
  add column version_id uuid references canvas_review_versions(id) on delete cascade;

update canvas_review_comments c
   set version_id = v.id
  from canvas_review_versions v
 where v.review_id = c.review_id
   and v.version_no = 1;

alter table canvas_review_comments alter column version_id set not null;

create index canvas_review_comments_version_created
  on canvas_review_comments (version_id, created_at);

-- The cut now lives on the version. Kept (nullable, unread) for one release so a rollback
-- still has it; drop in a later migration.
alter table canvas_reviews alter column video_path drop not null;

-- D495 backstop: a canvas gets no second Client review node. Only a NEW node id is checked, so
-- upserts of canvases that already have several (D499) keep saving. The app refuses earlier
-- (add menu, store, duplicate routes, canvas save); this catches any other insert path.
-- BEFORE INSERT fires for every row of an INSERT … ON CONFLICT, hence the id check.
create or replace function refuse_second_client_review_node() returns trigger
language plpgsql as $$
begin
  if new.type <> 'client-review' then
    return new;
  end if;
  if exists (select 1 from nodes where id = new.id) then
    return new;
  end if;
  -- Two sessions adding one each at the same moment must not both pass.
  perform pg_advisory_xact_lock(hashtext('client-review:' || new.canvas_id::text));
  if exists (
    select 1 from nodes
     where canvas_id = new.canvas_id
       and type = 'client-review'
       and id <> new.id
  ) then
    raise exception 'This canvas already has a Client review node.'
      using errcode = 'P0001', hint = 'one_client_review_per_canvas';
  end if;
  return new;
end;
$$;

create trigger nodes_one_client_review_per_canvas
  before insert on nodes
  for each row execute function refuse_second_client_review_node();
