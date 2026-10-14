-- The Brand assets grid's page order (D302). See
-- docs/superpowers/specs/2026-10-05-brand-kb-social-asset-import-design.md §5.
--
-- Newest post first; a website asset (no post date) by when it was imported. Stored so keyset
-- pagination can seek on it with an index rather than sort the client's whole library per page.
-- Additive: a generated column fills itself for existing rows.

alter table client_brand_images
  add column sort_at timestamptz generated always as (coalesce(posted_at, created_at)) stored;

create index client_brand_images_imported_page_idx
  on client_brand_images (client_id, sort_at desc, id desc)
  where source <> 'upload';
