-- node-files: public storage bucket for File node image uploads.
-- Text file content is stored inline in nodes.data.rawText — no storage needed.
-- Path pattern: {nodeId}/{filename}

insert into storage.buckets (id, name, public)
values ('node-files', 'node-files', true)
on conflict (id) do nothing;

create policy "Public read node-files"
  on storage.objects for select
  using (bucket_id = 'node-files');

create policy "Authenticated insert node-files"
  on storage.objects for insert
  with check (bucket_id = 'node-files');

create policy "Authenticated delete node-files"
  on storage.objects for delete
  using (bucket_id = 'node-files');
