-- Image cards on two fixed axes (D314): FORMAT (what the image looks like) and PURPOSE (why it was
-- posted). See docs/superpowers/specs/2026-10-07-kb-image-analysis-design.md §3.

alter table client_brand_image_cards rename column category to format;
alter table client_brand_image_cards add column purpose text;

alter index client_brand_image_cards_client_idx rename to client_brand_image_cards_client_format_idx;
create index client_brand_image_cards_client_purpose_idx on client_brand_image_cards (client_id, purpose);
