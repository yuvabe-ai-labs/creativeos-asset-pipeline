-- Auto captions (D395). Spec: docs/superpowers/specs/2026-10-22-auto-captions-design.md
--
-- media_transcripts: every word of one stored file with its time, once per file. Keyed by URL
-- like media_facts (0059): a take or dub file never changes, so its transcript never goes stale.
-- words: [{ t, s, e, p }] — text, start and end in seconds of the file, confidence 0–1.

create table if not exists media_transcripts (
  url              text primary key,
  language         text not null,
  words            jsonb not null,
  engine           text not null,
  model            text not null,
  duration_seconds double precision not null,
  created_at       timestamptz not null default now()
);

-- The app reads and writes through the service-role client.
alter table media_transcripts enable row level security;
