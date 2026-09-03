CREATE TABLE IF NOT EXISTS `current_room` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `code` text NOT NULL,
  `invite_token` text NOT NULL,
  `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
