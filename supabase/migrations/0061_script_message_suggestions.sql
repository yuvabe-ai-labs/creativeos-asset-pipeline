-- Brand-aware copilot chips. Spec: docs/superpowers/specs/2026-10-28-brand-neutral-system-design.md §3.1, §3.6
--
-- suggestions: the copilot's chips for what the person might send next, written by the model call
-- that wrote the reply, for this brand. A JSON array of strings; null on the person's messages and
-- on replies written before this column existed (read as none).

alter table client_script_messages add column if not exists suggestions jsonb;
