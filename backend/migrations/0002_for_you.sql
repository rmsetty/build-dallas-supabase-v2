-- embedded_at: NULL = needs embedding, ISO time = vector live, 'removed' = vector deleted.
ALTER TABLE provider_events ADD COLUMN embedded_at TEXT;
CREATE INDEX IF NOT EXISTS provider_unembedded ON provider_events(starts_at)
  WHERE embedded_at IS NULL;
CREATE INDEX IF NOT EXISTS provider_embedded ON provider_events(starts_at)
  WHERE embedded_at IS NOT NULL AND embedded_at <> 'removed';
-- One row per user: interests, their vector, and the cached ranked event IDs.
CREATE TABLE IF NOT EXISTS user_feeds (
  user_id TEXT PRIMARY KEY,
  interests TEXT NOT NULL CHECK (json_valid(interests)),
  about TEXT NOT NULL DEFAULT '',
  text_hash TEXT NOT NULL,
  embedding TEXT NOT NULL CHECK (json_valid(embedding)),
  catalog_version INTEGER NOT NULL DEFAULT -1,
  ranked TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(ranked)),
  computed_at TEXT,
  updated_at TEXT NOT NULL,
  saves_day TEXT NOT NULL,
  saves_count INTEGER NOT NULL DEFAULT 0
);
-- catalog_version increments whenever new event vectors are upserted.
CREATE TABLE IF NOT EXISTS feed_meta (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT OR IGNORE INTO feed_meta (key, value) VALUES ('catalog_version', 0);
