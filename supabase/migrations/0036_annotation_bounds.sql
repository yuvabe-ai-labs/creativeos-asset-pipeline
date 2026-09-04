-- D218 (supersedes D216): persist each annotation's painted bounding box.
--
-- 0035 stored only the overlay PNG and the note, on the reasoning that the mask IS the
-- region locator. On real screens that read poorly: the regions land correctly but the
-- numbered pins have nowhere to go, so they stack down the left edge, detached from the
-- thing they label. Compose mode already computes these bounds to anchor its note card —
-- this column just stops us throwing them away at submit.
--
-- Fractions of the media's natural size ({x, y, w, h}, each 0..1), so a pin renders
-- correctly at any display scale. Nullable: rows written before this migration have no
-- bounds and keep the left-edge stack fallback.

alter table node_version_annotations
  add column bounds jsonb;

comment on column node_version_annotations.bounds is
  'Painted region bbox as fractions of natural media size: {"x":0..1,"y":0..1,"w":0..1,"h":0..1}. Null for pre-D218 rows.';
