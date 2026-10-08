-- Script copilot spec 2 (Generate). See
-- docs/superpowers/specs/2026-10-08-script-copilot-2-generate-design.md.
-- Additive: nothing existing changes meaning. A new script has no document until the copilot
-- writes its first draft, so `doc` may be null, but only while the script is at Generate:
-- Visualise, In review and Approved always have one (specs 3 and 4 rely on that).
alter table client_scripts alter column doc drop not null;
alter table client_scripts add constraint client_scripts_doc_outside_generate
  check (doc is not null or stage = 'generate');

-- The copilot's working brief (the four pieces, the proposed angles, the confirmation card) and
-- the reel's own notes (the confirmed brief and the items to confirm). JSON, validated by
-- src/lib/scripts/copilot/schema.ts on every read; null reads as empty.
alter table client_scripts add column brief jsonb;
alter table client_scripts add column notes jsonb;
-- Compare-and-set counter for doc/brief/notes writes, so a typed edit and a copilot edit landing
-- together never overwrite each other (the loser re-reads and re-applies its change).
alter table client_scripts add column doc_version integer not null default 0;

-- The copilot conversation, kept with the script (spec 2 §3). `card` holds the structured part
-- of an assistant message (angles, research, confirmation, before-and-after).
create table client_script_messages (
  id         uuid primary key default gen_random_uuid(),
  seq        bigint generated always as identity,
  script_id  uuid not null references client_scripts(id) on delete cascade,
  client_id  uuid not null references clients(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null default '',
  card       jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Always read one script's conversation, in order. `seq` orders messages inserted together.
create index client_script_messages_script_idx on client_script_messages (script_id, seq);

-- Default-deny RLS with zero policies, as 0051: the app goes through the service-role client.
alter table client_script_messages enable row level security;
