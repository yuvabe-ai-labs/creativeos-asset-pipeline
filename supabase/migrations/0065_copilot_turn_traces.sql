-- Copilot turn traces (D509). Spec: docs/superpowers/specs/2026-11-19-copilot-turn-traces-design.md.
--
-- One row per agent turn of a client's copilot: what came in, exactly what the model was sent, each
-- round of tool calls and what they returned, what code did around the model, and how it ended. Kept
-- 30 days (a daily Trigger.dev task deletes older rows). Written after the turn's answer has been
-- sent, so tracing never slows a turn, and a failure to write one never fails it.

create table copilot_turn_traces (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  -- Which thread of the client. Only the onboarding thread exists today.
  thread       text not null check (thread in ('onboarding')),
  -- The reply this turn stored; null when the turn failed before storing one.
  message_id   uuid references client_copilot_messages(id) on delete set null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  -- What a line of the Turns list shows, so the list never reads `trace`.
  sent_text    text not null default '',
  tools        text[] not null default '{}',
  marks        text[] not null default '{}',
  duration_ms  integer not null,
  -- The whole trace; read only when one is opened.
  trace        jsonb not null
);

-- The Turns list: one client's newest first.
create index copilot_turn_traces_client_idx on copilot_turn_traces (client_id, created_at desc);
-- The daily sweep: everything older than 30 days.
create index copilot_turn_traces_age_idx on copilot_turn_traces (created_at);
-- Opening the trace of one reply.
create index copilot_turn_traces_message_idx on copilot_turn_traces (message_id);

-- Default-deny RLS with zero policies, as 0063: the app goes through the service-role client.
alter table copilot_turn_traces enable row level security;
