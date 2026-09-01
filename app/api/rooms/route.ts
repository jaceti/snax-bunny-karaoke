import { env } from "cloudflare:workers";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST() {
  try {
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) return Response.json({ error: "The room database isn’t connected yet." }, { status: 503 });
    const hostToken = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    const inviteToken = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    const tvToken = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    const [hostTokenHash, inviteTokenHash, tvTokenHash] = await Promise.all([hash(hostToken), hash(inviteToken), hash(tvToken)]);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = makeCode();
      try {
        await db.prepare("INSERT INTO rooms (code, host_token_hash, invite_token_hash, tv_token_hash) VALUES (?, ?, ?, ?)").bind(code, hostTokenHash, inviteTokenHash, tvTokenHash).run();
        return Response.json({ code, hostToken, inviteToken, tvToken }, { status: 201 });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (!message.includes("UNIQUE") && !message.includes("constraint")) throw error;
      }
    }
    return Response.json({ error: "The room-code machine needs one more try." }, { status: 503 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn’t create the room.";
    return Response.json({ error: message.includes("no such table") ? "The room database is still setting up." : message }, { status: 500 });
  }
}
