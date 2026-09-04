-- D219 (supersedes the stored-still half of D210 / spec §4.2): video annotations no
-- longer store a captured frame.
--
-- The frame was a full-resolution PNG riding the Server Action body. A 1080x1920
-- photographic still is 2-4 MB before base64 inflates it another third, so ONE video
-- annotation exceeded both Next's 1 MB serverActions.bodySizeLimit and Vercel's hard
-- 4.5 MB function request-body cap. Video annotation could never have worked this way.
--
-- It was also redundant: the row already carries timecode_ms, and a version's video URL
-- is immutable, so the reader seeks the player to that timecode and overlays the mask.
-- The captured frame stays a compose-time canvas base that never leaves the browser.
--
-- frame_path is kept (nullable, now always null) rather than dropped: no video-frame row
-- was ever written successfully, so there is nothing to migrate, and leaving the column
-- keeps this migration non-destructive.

alter table node_version_annotations
  drop constraint node_version_annotations_check;

alter table node_version_annotations
  add constraint node_version_annotations_check check (
    (kind = 'image' and timecode_ms is null)
    or (kind = 'video-frame' and timecode_ms is not null)
  );

comment on column node_version_annotations.frame_path is
  'Unused since D219 — always null. The reader seeks the video to timecode_ms instead of loading a stored still.';
