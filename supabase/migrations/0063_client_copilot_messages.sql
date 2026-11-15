-- Copilot journey, piece 2 part 1. Spec:
-- docs/superpowers/specs/2026-11-12-copilot-journey-brand-kb-design.md §3; map
-- docs/superpowers/specs/2026-11-15-copilot-journey-map.md §5 (D496).
--
-- The client's saved onboarding thread: one conversation per client that starts before any script
-- exists, so it cannot live in client_script_messages (which requires a script). A script's own
-- thread stays there. Both stores hold the same message parts.

create table client_copilot_messages (
  id          uuid primary key default gen_random_uuid(),
  seq         bigint generated always as identity,
  client_id   uuid not null references clients(id) on delete cascade,
  -- Which thread of the client. Only the onboarding thread exists today.
  thread      text not null check (thread in ('onboarding')),
  role        text not null check (role in ('user', 'assistant')),
  content     text not null default '',
  -- The structured part of an assistant message (status lines; later, gate and change cards).
  card        jsonb,
  -- What the person attached to a message: [{ kind, id, name, url }].
  attachments jsonb not null default '[]',
  -- The reply choices offered under an assistant message.
  suggestions jsonb not null default '[]',
  -- True on the one message that opens the thread.
  is_opening  boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Always read one client's thread, in order. `seq` orders messages inserted together.
create index client_copilot_messages_thread_idx on client_copilot_messages (client_id, thread, seq);

-- At most one opening message per thread, so two turns that race on an empty thread cannot both
-- store it: the second insert fails on this index and the code treats that as "already there".
create unique index client_copilot_messages_opening_idx on client_copilot_messages (client_id, thread) where is_opening;

-- Default-deny RLS with zero policies, as 0052: the app goes through the service-role client.
alter table client_copilot_messages enable row level security;
