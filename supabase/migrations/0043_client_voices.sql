-- Which ElevenLabs voices belong to which client (D292). See
-- docs/superpowers/specs/2026-09-29-client-avatars-design.md §3.4 and §6.
--
-- One ElevenLabs account serves every client, so without this a voice cloned for one client
-- is offered to all of them. Purely additive: one new table, nothing existing is altered.

create table client_voices (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid not null references clients(id) on delete cascade,
  -- The ACCOUNT voice id on ElevenLabs (for a Library voice, the id of the saved copy).
  elevenlabs_voice_id text not null,
  name                text not null,
  -- 'clone': made from the client's own audio. 'library': saved from the Voice Library.
  source              text not null check (source in ('library', 'clone')),
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  -- A voice is recorded once per client. The same Library voice may be recorded for two.
  unique (client_id, elevenlabs_voice_id)
);

-- Removal asks "does any other client still use this voice?" before freeing the slot.
create index client_voices_voice_idx on client_voices (elevenlabs_voice_id);

-- Default-deny RLS with zero policies, as 0041: the app reads and writes through the
-- service-role client; this only closes the direct-REST path the anon key would open.
alter table client_voices enable row level security;
