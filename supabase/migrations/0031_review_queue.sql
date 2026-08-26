-- D159: every review surface is a filter over ONE derivation.
--
-- Client counts, canvas counts, the review drawer and both roles' navbar lists all read
-- this view. Three independently written queries can drift apart; one cannot — which is
-- what makes R5.5 ("the three levels show the same underlying number") structural rather
-- than a convention someone has to remember.
--
-- Read what the joins buy, because it is most of the feature:
--   join on active_version_id   -> R3.3 (twenty regenerations expose ONE row) and
--                                  R3.5 (a node that never generated exposes none)
--   where type in (image,video) -> R3.2 (assets only; prompt nodes are not reviewable)
-- and because a regenerate moves the active pointer to a fresh `pending` row, R3.6/R9.4
-- (the loop closes with no resubmit step) fall out with no extra machinery.
--
-- Depends on 0030 for node_versions.org_id and operator_user_id.

create or replace view review_queue_items as
select
  v.org_id,
  cl.id   as client_id,
  cl.name as client_name,
  cl.slug as client_slug,
  cv.id   as canvas_id,
  cv.name as canvas_name,
  cv.slug as canvas_slug,
  n.id    as node_id,
  n.type  as node_type,
  -- Carried by the view, not resolved by the caller: the navbar popover is ORG-WIDE
  -- (R9.6), so it renders rows for canvases that are not loaded in the browser and has
  -- no client-side node to read a title or a thumbnail from.
  n.data ->> 'title' as node_title,
  v.id    as version_id,
  v.output,
  v.approval_status,
  v.note,
  v.operator_user_id,
  v.operator,                      -- legacy free-text fallback (R11.4)
  v.created_at,
  v.approved_at
from nodes n
join node_versions v on v.id = n.active_version_id
join canvases      cv on cv.id = n.canvas_id
join clients       cl on cl.id = cv.client_id
where n.type in ('image-gen', 'video-gen');

-- One call per list page, not one query per row. PRD §8's free-tier constraint is not
-- theoretical here: the client list renders for every org member on every visit.
--
-- Returns BOTH groupings from one scan so the two levels cannot disagree at runtime
-- either — the client list sums these rows, the canvas list reads them directly.
create or replace function org_review_counts(p_org_id uuid)
returns table (client_id uuid, canvas_id uuid, pending int)
language sql
stable
as $$
  select client_id, canvas_id, count(*)::int
    from review_queue_items
   where org_id = p_org_id
     and approval_status = 'pending'
   group by client_id, canvas_id;
$$;
