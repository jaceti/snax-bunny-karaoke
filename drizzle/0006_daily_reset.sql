CREATE TABLE IF NOT EXISTS daily_reset (
  id INTEGER PRIMARY KEY CHECK (id=1),
  night TEXT NOT NULL,
  reset_at TEXT
);
INSERT OR IGNORE INTO daily_reset (id,night) VALUES (1,'2026-09-20');
