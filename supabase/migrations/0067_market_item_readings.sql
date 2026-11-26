-- 0067: the market research agent's reading of a reference (D530).
-- One post is read once: its hook, format, pacing, on-screen text, setting and occasion, kept on
-- the item so drafting signals again never pays to read the same post twice. Null until read.
-- Safe to re-run, and safe in any order with the code (the code treats a missing reading as unread).

alter table public.moodboard_items add column if not exists reading jsonb;

comment on column public.moodboard_items.reading is
  'The market agent''s reading of the post (D530): hook, format, pacing, on-screen text, setting, occasion, summary, and whether it was read from the media or the thumbnail. Null until read.';
