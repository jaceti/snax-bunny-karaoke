CREATE TABLE IF NOT EXISTS `singer_stats` (
  `room_code` text NOT NULL,
  `singer_key` text NOT NULL,
  `sung_count` integer DEFAULT 0 NOT NULL,
  `last_sung_at` text,
  PRIMARY KEY (`room_code`, `singer_key`)
);
