-- T1: structural cache (component facts) ---------------------------------
CREATE TABLE IF NOT EXISTS component (
  id TEXT PRIMARY KEY, file TEXT NOT NULL, name TEXT NOT NULL,
  content_hash TEXT NOT NULL, structural_fp TEXT NOT NULL, json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_component_hash ON component(content_hash);
CREATE INDEX IF NOT EXISTS idx_component_fp ON component(structural_fp);

-- T2: semantic cache (embeddings). model_version part of identity (§2.6) -
CREATE TABLE IF NOT EXISTS embedding (
  component_id TEXT NOT NULL, model_version TEXT NOT NULL,
  vec BLOB NOT NULL, PRIMARY KEY (component_id, model_version)
);

-- T3: immutable findings — append-only (§3.2) ---------------------------
CREATE TABLE IF NOT EXISTS finding (
  id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, rule_id TEXT NOT NULL,
  type TEXT NOT NULL, analysis_version INTEGER NOT NULL, fp_algo_version INTEGER NOT NULL,
  producing_run_id TEXT NOT NULL, commit_sha TEXT NOT NULL, severity_raw TEXT NOT NULL,
  evidence_json TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_finding_fp ON finding(fingerprint, rule_id);
CREATE INDEX IF NOT EXISTS idx_finding_ver ON finding(fingerprint, analysis_version);

-- T4: raw feedback events — append-only, memory source-of-truth (§3.6) ---
CREATE TABLE IF NOT EXISTS feedback_event (
  id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, rule_id TEXT NOT NULL,
  verdict TEXT NOT NULL, source TEXT NOT NULL, origin_run_id TEXT,
  weight_hint REAL, reason TEXT, commit_sha TEXT, created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_fp ON feedback_event(fingerprint, rule_id);

-- T5: derived weights — materialized view of T4 (§3.3) -------------------
CREATE TABLE IF NOT EXISTS weight (
  fingerprint TEXT NOT NULL, rule_id TEXT NOT NULL, value REAL NOT NULL,
  confidence REAL NOT NULL, event_count INTEGER NOT NULL, last_event INTEGER NOT NULL,
  config_version TEXT NOT NULL, computed_as_of INTEGER NOT NULL,
  PRIMARY KEY (fingerprint, rule_id)
);

-- boundary rules (committed, tier-2-adjacent) ---------------------------
CREATE TABLE IF NOT EXISTS boundary_rule (
  id TEXT PRIMARY KEY, from_glob TEXT NOT NULL, to_glob TEXT NOT NULL,
  kind TEXT NOT NULL, reason TEXT
);

-- snapshot: temporal index derived from T3 (§3.5) -----------------------
CREATE TABLE IF NOT EXISTS snapshot (
  commit_sha TEXT NOT NULL, fingerprint TEXT NOT NULL, rule_id TEXT NOT NULL,
  severity_raw TEXT NOT NULL, evidence_digest TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (commit_sha, fingerprint, rule_id)
);
