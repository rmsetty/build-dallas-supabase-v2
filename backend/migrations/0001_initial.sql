CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public','unlisted','private')),
  starts_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data))
);
CREATE INDEX IF NOT EXISTS events_public_feed ON events(visibility, starts_at, id);
CREATE INDEX IF NOT EXISTS events_host_feed ON events(host_id, starts_at, id);
CREATE TABLE IF NOT EXISTS provider_events (
  source TEXT NOT NULL CHECK (source IN ('luma','eventbrite','meetup')),
  id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  startup INTEGER NOT NULL DEFAULT 0,
  search_text TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, id)
);
CREATE INDEX IF NOT EXISTS provider_feed ON provider_events(starts_at, source, id);
CREATE INDEX IF NOT EXISTS provider_discover ON provider_events(startup, starts_at, source, id);
CREATE TABLE IF NOT EXISTS ingestion_status (
  source TEXT PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  incomplete INTEGER NOT NULL DEFAULT 0
);
