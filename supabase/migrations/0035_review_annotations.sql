-- D239–D244: region + note feedback attached to a changes_requested decision.
-- Child of node_version_decisions (0033); one row per painted region ("pin").
--
-- mask_path/frame_path are GCS object paths under the node the annotation marks up —
-- the same bucket and lib/storage module the generated image or video itself uses (D247).
--
-- mask_path stores the PAINTED OVERLAY png (alpha > 0 = the region), NOT the
-- OpenAI edit mask. The overlay renders directly as the read-only region layer,
-- and overlayToMaskRGBA (src/lib/image-gen/mask.ts) converts it to the OpenAI
-- alpha convention at replay time — one stored asset serves display now and
-- AI replay later (D239).

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
  -- Doubles as THE read index: every read asks "all annotations for these decision
  -- ids, in pin order", which this unique btree already serves. A separate index on
  -- (decision_id, seq) would be an exact duplicate — a second write per insert for
  -- nothing. (0033 needs its own index because no constraint covers its sort order.)
  unique (decision_id, seq),
  -- video-frame rows always carry a timecode and a captured still; image rows never do.
  check (
    (kind = 'image' and timecode_ms is null and frame_path is null)
    or (kind = 'video-frame' and timecode_ms is not null and frame_path is not null)
  )
);

-- Same posture as 0033: org-isolation SELECT, writes via service role only.
alter table node_version_annotations enable row level security;

create policy "org isolation" on node_version_annotations for select
  using (
    org_id = (select org_id from org_memberships where user_id = auth.uid() limit 1)
  );

-- No bucket row: overlay + frame PNGs live in GCS alongside every other generated asset
-- (see src/lib/storage), so mask_path/frame_path are GCS object paths, not Supabase
-- Storage keys. D247.
