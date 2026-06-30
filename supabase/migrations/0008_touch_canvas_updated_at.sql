-- Fix stale "Last edited" / "Last active".
--
-- canvases.updated_at was set only by `default now()` on INSERT and then never
-- bumped: the canvases repo has no update path and there was no trigger. But a
-- canvas's edits live in CHILD tables (nodes / edges / node_versions), so editing
-- a canvas never touched its own row — updated_at was effectively "created at".
--
-- These triggers bump the parent canvas's updated_at on ANY child insert/update/
-- delete, so updated_at finally means "last edited". "Last active" on the clients
-- tab is MAX(canvas.updated_at), so it follows for free.

-- nodes and edges carry canvas_id directly — bump that canvas.
create or replace function touch_canvas_updated_at()
returns trigger
language plpgsql
as $$
begin
  update canvases
     set updated_at = now()
   where id = coalesce(new.canvas_id, old.canvas_id);
  return null; -- AFTER trigger: return value is ignored
end;
$$;

-- node_versions has only node_id — reach the canvas through its node.
create or replace function touch_canvas_via_node()
returns trigger
language plpgsql
as $$
begin
  update canvases c
     set updated_at = now()
    from nodes n
   where n.id = coalesce(new.node_id, old.node_id)
     and c.id = n.canvas_id;
  return null;
end;
$$;

create trigger nodes_touch_canvas
  after insert or update or delete on nodes
  for each row execute function touch_canvas_updated_at();

create trigger edges_touch_canvas
  after insert or update or delete on edges
  for each row execute function touch_canvas_updated_at();

create trigger node_versions_touch_canvas
  after insert or update or delete on node_versions
  for each row execute function touch_canvas_via_node();

-- One-time historical backfill. True per-edit times were never recorded, so we
-- reconstruct the best available proxy: the latest of the canvas's own created_at,
-- its newest node's created_at, and its newest node_version's created_at (the
-- append-only log of every generation / saved edit). Not exact for past edits, but
-- far better than every row reading "created at". Updating canvases fires none of
-- the triggers above (they live on the child tables), so there is no recursion.
update canvases c
   set updated_at = greatest(
     c.created_at,
     coalesce(
       (select max(n.created_at) from nodes n where n.canvas_id = c.id),
       c.created_at
     ),
     coalesce(
       (select max(nv.created_at)
          from node_versions nv
          join nodes n on n.id = nv.node_id
         where n.canvas_id = c.id),
       c.created_at
     )
   );
