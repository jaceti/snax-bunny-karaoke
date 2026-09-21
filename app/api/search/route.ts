import { env } from "cloudflare:workers";
import { karaokeScore, karaokeEligible, playable, type VideoDetails } from "./ranking";

type YouTubeSearchItem = { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } } };

function decode(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  try {
    const bindings = env as unknown as { DB?: D1Database; YOUTUBE_API_KEY?: string };
    const db = bindings.DB;
    const key = bindings.YOUTUBE_API_KEY;
    if (!db) return Response.json({ error: "The room database isn’t connected yet." }, { status: 503 });
    if (!key) return Response.json({ error: "YouTube search needs its one-time API key setup." }, { status: 503 });

    const roomCode = (request.headers.get("x-room-code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const invite = request.headers.get("x-room-invite") || "";
    const room = await db.prepare("SELECT invite_token_hash FROM rooms WHERE code = ?").bind(roomCode).first<{ invite_token_hash: string }>();
    if (!room || !invite || room.invite_token_hash !== await sha256(invite)) return Response.json({ error: "Scan the room QR code before searching." }, { status: 403 });

    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.trim().slice(0, 100) || "";
    if (q.length < 2) return Response.json({ results: [] });
    // One search request, plus one batched metadata check for up to 50 matches.
    // Paging through these results never triggers another YouTube search.
    const region = "US";
    const params = new URLSearchParams({ part: "snippet", type: "video", videoEmbeddable: "true", videoSyndicated: "true", regionCode: region, safeSearch: "moderate", maxResults: "50", q: `${q} karaoke lyrics`, key });
    const youtube = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const data = await youtube.json() as { items?: YouTubeSearchItem[]; error?: { message?: string } };
    if (!youtube.ok) throw new Error(data.error?.message || "YouTube search took a mic break.");
    const items = data.items || [];
    const ids = [...new Set(items.flatMap(item => item.id?.videoId ? [item.id.videoId] : []))];
    if (!ids.length) return Response.json({ results: [] }, { headers: { "cache-control": "no-store" } });
    const detailParams = new URLSearchParams({ part: "snippet,status,contentDetails", id: ids.join(","), key });
    const detailResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?${detailParams}`);
    const details = await detailResponse.json() as { items?: VideoDetails[] };
    if (!detailResponse.ok) throw new Error("We couldn’t check which tracks can play. Please try searching again.");
    const byId = new Map((details.items || []).map(video => [video.id, video]));
    const results = items.flatMap((item, index) => {
      const id = item.id?.videoId;
      const video = id ? byId.get(id) : undefined;
      if (!id || !item.snippet || !video || !playable(video, region) || !karaokeEligible(video)) return [];
      return [{ videoId: id, title: decode(item.snippet.title || "Karaoke track"), channel: decode(item.snippet.channelTitle || "YouTube"), thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || "", score: karaokeScore(video, q, index) }];
    }).sort((a, b) => b.score - a.score).map(({ score, ...song }) => song);
    return Response.json({ results }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Search took a mic break." }, { status: 500 });
  }
}
