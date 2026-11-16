-- Copilot journey, piece 2 part 2. Plan: docs/superpowers/plans/2026-11-16-copilot-journey-kb-chat-part-2.md
--
-- Two functions and no table change. To see them work after applying:
--   select kb_unreviewed_fields('<a client_kb_versions id>');
--   begin;
--     select patch_kb_fields('<the same id>', '[{"path":["brand_profile","tagline"],"patch":{"status":"approved"}}]');
--     select output #> '{brand_profile,tagline}' from client_kb_versions where id = '<the same id>';
--   rollback;

-- A review of one or more fields, merged into each field and nothing else (refines D318). The
-- review screen's Save sends only the fields the person changed, and the copilot sends the one it
-- filled, so neither writes an older copy of the KB over the other. The app only sends paths its own
-- schema knows. A field the stored KB does not hold yet (one added to the schema after this KB was
-- built) is created from the patch, when its section exists; anything else is skipped.
create or replace function patch_kb_fields(p_version_id uuid, p_patches jsonb)
returns void
language plpgsql
as $$
declare
  v_output jsonb;
  v_item jsonb;
  v_path text[];
  v_current jsonb;
begin
  select output into v_output from client_kb_versions where id = p_version_id for update;
  if v_output is null then
    raise exception 'KB version not found';
  end if;
  for v_item in select * from jsonb_array_elements(p_patches) loop
    select array_agg(x order by ord) into v_path
      from jsonb_array_elements_text(v_item -> 'path') with ordinality as t(x, ord);
    v_current := v_output #> v_path;
    if jsonb_typeof(v_item -> 'patch') = 'object' and (v_current is null or jsonb_typeof(v_current) = 'object') then
      -- create_missing adds only the last key, so a path whose section is missing changes nothing.
      v_output := jsonb_set(v_output, v_path, coalesce(v_current, '{}'::jsonb) || (v_item -> 'patch'), true);
    end if;
  end loop;
  update client_kb_versions set output = v_output where id = p_version_id;
end;
$$;

-- The fields still to review, as dotted paths, without sending the KB to the app: the copilot panel
-- polls this. The six sections the build writes; never Image Analysis (D423). Returns null when the
-- version does not exist (no row), which the app treats as a failure, not as "nothing left".
create or replace function kb_unreviewed_fields(p_version_id uuid)
returns text[]
language sql
stable
as $$
  select (
    select coalesce(array_agg(s.prefix || '.' || f.key order by s.ord, f.key), '{}')
      from (values
        (1, 'brand_profile',            v.output #> '{brand_profile}'),
        (2, 'visual_identity',          v.output #> '{visual_identity}'),
        (3, 'target_audience',          v.output #> '{target_audience}'),
        (4, 'creative_direction.image', v.output #> '{creative_direction,image}'),
        (5, 'creative_direction.video', v.output #> '{creative_direction,video}'),
        (6, 'compliance',               v.output #> '{compliance}')
      ) as s(ord, prefix, section)
      cross join lateral jsonb_each(case when jsonb_typeof(s.section) = 'object' then s.section else '{}'::jsonb end) as f(key, value)
     where f.value ->> 'status' = 'needs_review'
  )
  from client_kb_versions v
  where v.id = p_version_id;
$$;
