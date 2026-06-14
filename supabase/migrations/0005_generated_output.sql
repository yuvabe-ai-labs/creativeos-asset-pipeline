-- Step 1 of the eval flywheel (D22): preserve the model's RAW output so a manual
-- edit no longer destroys the "before" half of the generated -> shipped diff.
--
-- `generated_output` is written once at generation (insertVersion) and never mutated;
-- `output` stays the human-editable working copy (D18). Their divergence after an edit
-- is the eval signal. `output` remains the single source for display/downstream (D19).
-- See docs/superpowers/specs/2026-06-14-raw-generation-capture-design.md.

alter table node_versions add column generated_output jsonb;

-- Backfill: for existing rows the current output is the only prior record we have.
-- Imperfect for already-edited rows, but the best available and harmless.
update node_versions set generated_output = output where generated_output is null;
