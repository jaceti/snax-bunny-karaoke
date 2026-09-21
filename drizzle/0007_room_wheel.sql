CREATE TABLE IF NOT EXISTS room_wheel (
  room_code TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  resume_playback INTEGER NOT NULL DEFAULT 0
);
