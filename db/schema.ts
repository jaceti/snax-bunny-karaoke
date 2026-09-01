import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  hostTokenHash: text("host_token_hash").notNull(),
  inviteTokenHash: text("invite_token_hash").notNull(),
  tvTokenHash: text("tv_token_hash").notNull(),
  playbackStatus: text("playback_status", { enum: ["idle", "playing", "paused"] }).notNull().default("idle"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const queueItems = sqliteTable("queue_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roomCode: text("room_code").notNull().references(() => rooms.code, { onDelete: "cascade" }),
  singerName: text("singer_name").notNull(),
  songTitle: text("song_title").notNull(),
  videoTitle: text("video_title").notNull(),
  videoId: text("video_id").notNull(),
  thumbnailUrl: text("thumbnail_url").notNull().default(""),
  sortOrder: integer("sort_order").notNull(),
  status: text("status", { enum: ["pending", "playing", "done"] }).notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
}, (table) => [
  index("idx_queue_room_status_order").on(table.roomCode, table.status, table.sortOrder),
]);
