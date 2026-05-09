-- PostgreSQL baseline schema for normref ingest pipeline
-- Safe to run multiple times in dev environments.

BEGIN;

CREATE TABLE IF NOT EXISTS ingest_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  std_code TEXT,
  spec_type TEXT,
  title TEXT,
  source_file TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status ON ingest_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ingest_jobs_created_at ON ingest_jobs(created_at DESC);

CREATE TABLE IF NOT EXISTS ingest_artifacts (
  id BIGSERIAL PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES ingest_jobs(job_id) ON DELETE CASCADE,
  artifact_name TEXT NOT NULL,
  artifact_path TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  schema_valid BOOLEAN NOT NULL DEFAULT FALSE,
  business_valid BOOLEAN NOT NULL DEFAULT FALSE,
  valid BOOLEAN NOT NULL DEFAULT FALSE,
  item_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, artifact_name)
);

CREATE INDEX IF NOT EXISTS idx_ingest_artifacts_job ON ingest_artifacts(job_id);
CREATE INDEX IF NOT EXISTS idx_ingest_artifacts_name ON ingest_artifacts(artifact_name);
CREATE INDEX IF NOT EXISTS idx_ingest_artifacts_valid ON ingest_artifacts(valid);
CREATE INDEX IF NOT EXISTS idx_ingest_artifacts_payload_gin ON ingest_artifacts USING GIN (payload);

CREATE TABLE IF NOT EXISTS pipeline_audits (
  id BIGSERIAL PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES ingest_jobs(job_id) ON DELETE CASCADE,
  audit_status TEXT NOT NULL DEFAULT 'PENDING',
  publishable BOOLEAN NOT NULL DEFAULT FALSE,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_audits_publishable ON pipeline_audits(publishable);
CREATE INDEX IF NOT EXISTS idx_pipeline_audits_status ON pipeline_audits(audit_status);

CREATE TABLE IF NOT EXISTS asset_reviews (
  id BIGSERIAL PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES ingest_jobs(job_id) ON DELETE CASCADE,
  object_type TEXT NOT NULL CHECK (object_type IN ('component', 'rule', 'gate')),
  object_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'needs_edit')),
  reviewer_id TEXT NOT NULL,
  reviewer_name TEXT,
  changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  comment TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_reviews_job ON asset_reviews(job_id);
CREATE INDEX IF NOT EXISTS idx_asset_reviews_object ON asset_reviews(job_id, object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_asset_reviews_decision ON asset_reviews(decision);
CREATE INDEX IF NOT EXISTS idx_asset_reviews_reviewed_at ON asset_reviews(reviewed_at DESC);

-- Latest decision snapshot per asset (fast UI summary)
CREATE MATERIALIZED VIEW IF NOT EXISTS asset_review_latest AS
SELECT DISTINCT ON (job_id, object_type, object_id)
  job_id,
  object_type,
  object_id,
  decision,
  reviewer_id,
  reviewer_name,
  comment,
  reviewed_at
FROM asset_reviews
ORDER BY job_id, object_type, object_id, reviewed_at DESC, id DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_review_latest_unique
  ON asset_review_latest(job_id, object_type, object_id);

CREATE TABLE IF NOT EXISTS unresolved_rule_queue (
  id BIGSERIAL PRIMARY KEY,
  queue_id TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL REFERENCES ingest_jobs(job_id) ON DELETE CASCADE,
  rule_id TEXT NOT NULL,
  reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending_confirmation',
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unresolved_rule_queue_job ON unresolved_rule_queue(job_id);
CREATE INDEX IF NOT EXISTS idx_unresolved_rule_queue_status ON unresolved_rule_queue(status);

CREATE TABLE IF NOT EXISTS publish_runs (
  id BIGSERIAL PRIMARY KEY,
  publish_id TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL REFERENCES ingest_jobs(job_id) ON DELETE CASCADE,
  normdoc_id TEXT,
  package_id TEXT,
  bundle_hash TEXT,
  status TEXT NOT NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publish_runs_job ON publish_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_publish_runs_status ON publish_runs(status);
CREATE INDEX IF NOT EXISTS idx_publish_runs_created_at ON publish_runs(created_at DESC);

COMMIT;
