-- Rough Cut Editor (D387–D393). Spec: docs/superpowers/specs/2026-10-20-rough-cut-editor-design.md
--
-- editor_edits: the reel's edit, one row per Editor node (D390). It is not node data: canvas
-- autosave doesn't run on the editor page, and every trim would rewrite the canvas. Deleting the
-- Editor node deletes its edit (the canvas has no undo).
-- media_facts: what the server measured in a stored file's header, once per file (D391).
-- editor_generation_lock(): whether a node may generate while it feeds the Editor (D389), in one
-- round trip for every generate route.

create table editor_edits (
  node_id    uuid primary key references nodes(id) on delete cascade,
  canvas_id  uuid not null references canvases(id) on delete cascade,
  org_id     uuid not null references organizations(id),
  doc        jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index editor_edits_canvas_idx on editor_edits (canvas_id);

-- org_id comes from the canvas, as canvas_reviews does it (0047).
create or replace function set_editor_edit_org_id() returns trigger language plpgsql as $$
begin
  if new.org_id is null then
    select cl.org_id into new.org_id
    from canvases cv join clients cl on cl.id = cv.client_id
    where cv.id = new.canvas_id;
  end if;
  return new;
end;
$$;

create trigger editor_edits_set_org_id
  before insert on editor_edits
  for each row execute function set_editor_edit_org_id();

-- The app reads and writes through the service-role client.
alter table editor_edits enable row level security;

create table media_facts (
  url              text primary key,
  duration_seconds double precision not null,
  video            jsonb,  -- { fps, frames, width, height }
  audio            jsonb,  -- { channels, sampleRate }
  measured_at      timestamptz not null default now()
);

alter table media_facts enable row level security;

-- The lock check and the Editor's inputs filter edges by their ends.
create index if not exists edges_source_node_id_idx on edges (source_node_id);
create index if not exists edges_target_node_id_idx on edges (target_node_id);

-- 'editor': the node feeds the Editor. 'dub': it feeds a Dubbing node that feeds the Editor.
-- Null: free to generate.
create or replace function editor_generation_lock(p_node_id uuid) returns text
language sql stable as $$
  select case
    when exists (
      select 1 from edges e
      join nodes t on t.id = e.target_node_id
      where e.source_node_id = p_node_id and t.type = 'editor'
    ) then 'editor'
    when exists (
      select 1 from edges e1
      join nodes d on d.id = e1.target_node_id and d.type = 'dubbing'
      join edges e2 on e2.source_node_id = d.id
      join nodes t on t.id = e2.target_node_id and t.type = 'editor'
      where e1.source_node_id = p_node_id
    ) then 'dub'
  end
$$;
