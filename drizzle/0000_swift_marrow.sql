CREATE TABLE `queue_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_code` text NOT NULL,
	`singer_name` text NOT NULL,
	`song_title` text NOT NULL,
	`video_title` text NOT NULL,
	`video_id` text NOT NULL,
	`thumbnail_url` text DEFAULT '' NOT NULL,
	`sort_order` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`started_at` text,
	`finished_at` text,
	FOREIGN KEY (`room_code`) REFERENCES `rooms`(`code`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_queue_room_status_order` ON `queue_items` (`room_code`,`status`,`sort_order`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`code` text PRIMARY KEY NOT NULL,
	`host_token_hash` text NOT NULL,
	`invite_token_hash` text NOT NULL,
	`tv_token_hash` text NOT NULL,
	`playback_status` text DEFAULT 'idle' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
