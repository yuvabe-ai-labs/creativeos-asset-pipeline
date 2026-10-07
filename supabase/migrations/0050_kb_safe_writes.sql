-- KB writes that never undo a background write (D318). Image Analysis is rewritten by a background
-- run (D312) while people review the KB, so no write may replace the whole output from an older
-- copy. See docs/superpowers/specs/2026-10-07-kb-image-analysis-design.md §5.

-- The review screen's Save: every section as sent, except Image Analysis, kept as stored. The
-- screen's Image Analysis reviews are merged in the app and written with set_kb_image_analysis.
create or replace function save_kb_output_keep_image_analysis(p_version_id uuid, p_output jsonb)
returns void
language sql
as $$
  update client_kb_versions
     set output = case
                    when output ? 'image_analysis'
                      then jsonb_set(p_output, '{image_analysis}', output -> 'image_analysis', true)
                    else p_output
                  end
   where id = p_version_id;
$$;

-- One field, and nothing else: a single-field re-analysis or patch, without a read-modify-write of
-- the whole output.
create or replace function set_kb_field(p_version_id uuid, p_path text[], p_value jsonb)
returns void
language sql
as $$
  update client_kb_versions
     set output = jsonb_set(output, p_path, p_value, true)
   where id = p_version_id;
$$;
