import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  hostTokenHash: text("host_token_hash").notNull(),
  inviteTokenHash: text("invite_token_hash").notNull(),
  tvTokenHash: text("tv_token_hash").notNull(),
  playbackStatus: text("playback_status", { enum: ["idle", "playing", "paused"] }).notNull().default("idle"),
  // Host can close the room to new requests at the end of the night.
  requestsOpen: integer("requests_open", { mode: "boolean" }).notNull().default(true),
  // Optional last-call time. Requests close automatically CUTOFF_MINUTES before it.
  endsAt: text("ends_at"),
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

// "Tonight's room": the one room the static QR codes on the hub and around the
// venue join. Set when a host opens a room, re-claimable from the host console.
// The invite token is stored in plain text here on purpose — it is the same
// token printed into every singer QR code, so it is public by design.
export const currentRoom = sqliteTable("current_room", {
  id: integer("id").primaryKey(),
  code: text("code").notNull(),
  inviteToken: text("invite_token").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
