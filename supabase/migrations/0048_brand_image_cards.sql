-- Brand image analysis (D312). See docs/superpowers/specs/2026-10-07-kb-image-analysis-design.md.
--
-- Each brand image (uploaded or imported) is read once into a card; the Brand KB's Image Analysis
-- section is written from the cards. Additive: one new table and one function.

create table client_brand_image_cards (
  image_id   uuid primary key references client_brand_images(id) on delete cascade,
  client_id  uuid not null references clients(id) on delete cascade,
  -- Which version of the card prompt made it; an older one is re-made (IMAGE_CARD_VERSION).
  version    integer not null,
  model      text not null,
  -- Copied out of the card for filtering without reading the JSON.
  category   text not null,
  card       jsonb not null,
  created_at timestamptz not null default now()
);

create index client_brand_image_cards_client_idx on client_brand_image_cards (client_id, category);

-- Default-deny RLS with zero policies, as 0041/0043: the app goes through the service-role client.
alter table client_brand_image_cards enable row level security;

-- Replaces only the image_analysis section of a KB version's output, in one statement. The review
-- screen saves the whole output, so a read-modify-write here could undo an edit made in between,
-- or be undone by one.
create or replace function set_kb_image_analysis(p_version_id uuid, p_value jsonb)
returns void
language sql
as $$
  update client_kb_versions
     set output = jsonb_set(output, '{image_analysis}', p_value, true)
   where id = p_version_id;
$$;
