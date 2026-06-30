-- 1. Persist optional brand website URL on the client
ALTER TABLE clients ADD COLUMN website_url text;

-- 2. KB job execution-scratchpad table (mirrors `generations` per D25)
CREATE TYPE client_kb_job_status AS ENUM (
  'queued',
  'researching',
  'extracting',
  'finalizing',
  'succeeded',
  'failed'
);

CREATE TABLE client_kb_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status          client_kb_job_status NOT NULL DEFAULT 'queued',
  phase_message   text,
  website_url     text,
  doc_ids_used    uuid[] NOT NULL DEFAULT '{}',
  trigger_run_id  text,
  version_id      uuid REFERENCES client_kb_versions(id) ON DELETE SET NULL,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_kb_jobs_client_status_idx
  ON client_kb_jobs(client_id, status);

-- 3. One running job per client — partial unique index
CREATE UNIQUE INDEX client_kb_jobs_one_running_idx
  ON client_kb_jobs(client_id)
  WHERE status IN ('queued','researching','extracting','finalizing');

-- 4. Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE client_kb_jobs;
