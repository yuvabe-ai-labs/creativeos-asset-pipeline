-- Script-to-canvas (D372): a canvas remembers the approved script it was created from, so the
-- script's page can say "Open canvas". One canvas per script; deleting the canvas (a hard delete)
-- frees the script to make another. Deleting the script leaves the canvas, unlinked.
alter table canvases
  add column source_script_id uuid references client_scripts(id) on delete set null;

create unique index canvases_source_script_id_key
  on canvases (source_script_id)
  where source_script_id is not null;
