import { env } from "cloudflare:workers";
import { sharedHostToken } from "../shared-host";

// Tonight's room — what the static singer QR codes on jessaceti.com/snaxkaraoke
// and around the venue resolve to. Public by design: the invite token it returns
// is the same one printed into every singer QR code, and the TV token lets the
// hub's "Open TV display" button bring up the big screen for tonight's room.
export async function GET() {
  try {
    const db = (env as unknown as { DB?: D1Database }).DB;
    if (!db) return Response.json({ error: "The room database isn’t connected yet." }, { status: 503 });
    const current = await db.prepare("SELECT c.code, c.invite_token, c.tv_token, r.requests_open, r.ends_at FROM current_room c JOIN rooms r ON r.code = c.code WHERE c.id = 1").first<{ code: string; invite_token: string; tv_token: string | null; requests_open: number; ends_at: string | null }>();
    if (!current) return Response.json({ error: "Snax hasn’t opened tonight’s room yet. Hang tight." }, { status: 404, headers: { "cache-control": "no-store" } });
    return Response.json({ code: current.code, inviteToken: current.invite_token, tvToken: current.tv_token }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn’t find tonight’s room.";
    return Response.json({ error: message.includes("no such table") ? "The room database is still setting up." : message }, { status: 500 });
  }
}

// Explicit host entry: anyone choosing the public Host Console may control the
// current show. GET remains singer/TV-only; joining as host never mutates a room.
export async function POST(){
  try{
    const db=(env as unknown as {DB?:D1Database}).DB;
    if(!db)return Response.json({error:"The room database isn’t connected yet."},{status:503});
    const current=await db.prepare("SELECT c.code,c.invite_token,c.tv_token,r.host_token_hash FROM current_room c JOIN rooms r ON r.code=c.code WHERE c.id=1").first<{code:string;invite_token:string;tv_token:string|null;host_token_hash:string}>();
    if(!current)return Response.json({error:"No current room."},{status:404,headers:{"cache-control":"no-store"}});
    return Response.json({code:current.code,hostToken:await sharedHostToken(current.code,current.host_token_hash),inviteToken:current.invite_token,tvToken:current.tv_token},{headers:{"cache-control":"no-store"}});
  }catch{
    return Response.json({error:"Couldn’t connect the host controls. Please try again."},{status:500,headers:{"cache-control":"no-store"}});
  }
}
