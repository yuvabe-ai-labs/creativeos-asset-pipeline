-- D209–D214: region + note feedback attached to a changes_requested decision.
-- Child of node_version_decisions (0033); one row per painted region ("pin").
--
-- mask_path stores the PAINTED OVERLAY png (alpha > 0 = the region), NOT the
-- OpenAI edit mask. The overlay renders directly as the read-only region layer,
-- and overlayToMaskRGBA (src/lib/image-gen/mask.ts) converts it to the OpenAI
-- alpha convention at replay time — one stored asset serves display now and
-- AI replay later (D209).

create table node_version_annotations (
  id           uuid primary key default gen_random_uuid(),
  decision_id  uuid not null references node_version_decisions(id) on delete cascade,
  org_id       uuid not null references organizations(id),
  seq          int  not null,
  kind         text not null check (kind in ('image', 'video-frame')),
  timecode_ms  int,
  frame_path   text,
  mask_path    text not null,
  note         text not null,
  created_at   timestamptz not null default now(),
  unique (decision_id, seq),
  -- video-frame rows always carry a timecode and a captured still; image rows never do.
  check (
    (kind = 'image' and timecode_ms is null and frame_path is null)
    or (kind = 'video-frame' and timecode_ms is not null and frame_path is not null)
  )
);

-- Every read asks "all annotations for these decision ids, in pin order".
create index node_version_annotations_decision_idx
  on node_version_annotations (decision_id, seq);

-- Same posture as 0033: org-isolation SELECT, writes via service role only.
alter table node_version_annotations enable row level security;

create policy "org isolation" on node_version_annotations for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );

-- Private bucket for overlay + frame PNGs; assets are served via signed URLs.
insert into storage.buckets (id, name, public)
values ('review-annotations', 'review-annotations', false)
on conflict (id) do nothing;
