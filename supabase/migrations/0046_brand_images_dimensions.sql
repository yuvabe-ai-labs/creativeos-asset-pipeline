-- Pixel size of each imported brand asset (D302). See
-- docs/superpowers/specs/2026-10-05-brand-kb-social-asset-import-design.md §5.
--
-- The Brand assets masonry needs every tile's aspect ratio before the image loads, or the grid
-- reflows as each one arrives. Recorded at import from the decoded image (a video's from its
-- poster). Null for uploads and for rows imported before this — the browser measures those.

alter table client_brand_images
  add column width  integer check (width > 0),
  add column height integer check (height > 0);
