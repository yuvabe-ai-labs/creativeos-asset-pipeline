-- D170/D172: a maker's approval notification is a dismiss-on-view read receipt, not a
-- queue table or a timer. approved_seen_at is set once, when the maker's own focus view
-- renders their approved, unseen active version (markVersionApprovalSeenAction).
--
-- D172: rows already approved when this ships are backfilled as already-seen, so the
-- deploy does not retroactively flood every maker's inbox with historical approvals —
-- the mechanism only governs approvals that happen from here forward.

alter table node_versions add column approved_seen_at timestamptz;

update node_versions
   set approved_seen_at = approved_at
 where approval_status = 'approved'
   and approved_seen_at is null;

-- Recreated with two more columns so inboxFilterFor (src/lib/review/queue.ts) can filter
-- on them via PostgREST .or() — a column must exist in the queried view even when it is
-- not in the caller's .select() list. Every other column and join is unchanged from 0031.
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
  n.data ->> 'title' as node_title,
  v.id    as version_id,
  v.output,
  v.approval_status,
  v.note,
  v.operator_user_id,
  v.operator,
  v.created_at,
  v.approved_at,
  v.approved_by_user_id,
  v.approved_seen_at
from nodes n
join node_versions v on v.id = n.active_version_id
join canvases      cv on cv.id = n.canvas_id
join clients       cl on cl.id = cv.client_id
where n.type in ('image-gen', 'video-gen');
