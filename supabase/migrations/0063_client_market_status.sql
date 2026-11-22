-- Copilot journey, piece 1. Spec: docs/superpowers/specs/2026-11-12-copilot-journey-design.md §5.2, §6
--
-- market_status: whether a person has approved this client's market research. Scripts open on
-- 'approved'. Every client that exists now is approved (the column is added with that default),
-- and every client created after this starts 'pending'.

alter table clients add column if not exists market_status text not null default 'approved'
  check (market_status in ('pending', 'approved'));
alter table clients alter column market_status set default 'pending';
