import { env } from "cloudflare:workers";

type QueueRow = { id:number; singer_name:string; song_title:string; video_title:string; video_id:string; thumbnail_url:string; sort_order:number; status:"pending"|"playing"|"done"; started_at:string|null; sung_count?:number };

function codeOf(value:string) { return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); }
function dbBinding() { const db=(env as unknown as {DB?:D1Database}).DB; if(!db) throw new Error("The room database isn’t connected yet."); return db; }
function queueItem(row:QueueRow) { return { id:row.id, singerName:row.singer_name, songTitle:row.song_title, videoTitle:row.video_title, videoId:row.video_id, thumbnailUrl:row.thumbnail_url, sortOrder:row.sort_order, status:row.status, startedAt:row.started_at, sungCount:Number(row.sung_count||0) }; }
async function hash(value:string) { const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest),(byte)=>byte.toString(16).padStart(2,"0")).join(""); }

async function verify(code:string, request:Request, kind:"host"|"invite"|"tv") {
  const header = kind === "host" ? "x-host-token" : kind === "invite" ? "x-room-invite" : "x-tv-token";
  const column = kind === "host" ? "host_token_hash" : kind === "invite" ? "invite_token_hash" : "tv_token_hash";
  const token=request.headers.get(header)||""; if(!token) return false;
  const room=await dbBinding().prepare(`SELECT ${column} AS token_hash FROM rooms WHERE code = ?`).bind(code).first<{token_hash:string}>();
  return !!room && room.token_hash === await hash(token);
}

// Requests close this many minutes before the room's end time. Rabbit Box runs a
// 15-minute countdown clock at last call and the app matches it.
const CUTOFF_MINUTES = 15;

function requestsAreOpen(room:{requests_open:number;ends_at:string|null}) {
  if(!room.requests_open) return false;
  if(!room.ends_at) return true;
  const closesAt = Date.parse(room.ends_at) - CUTOFF_MINUTES*60_000;
  return Number.isNaN(closesAt) || Date.now() < closesAt;
}

async function state(code:string) {
  const db=dbBinding();
  const room=await db.prepare("SELECT code, playback_status, requests_open, ends_at, completed_count FROM rooms WHERE code = ?").bind(code).first<{code:string;playback_status:"idle"|"playing"|"paused";requests_open:number;ends_at:string|null;completed_count:number}>();
  if(!room) return null;
  const [now,waiting,current]=await Promise.all([
    db.prepare("SELECT q.id,q.singer_name,q.song_title,q.video_title,q.video_id,q.thumbnail_url,q.sort_order,q.status,q.started_at,COALESCE(s.sung_count,0) AS sung_count FROM queue_items q LEFT JOIN singer_stats s ON s.room_code=q.room_code AND s.singer_key=lower(trim(q.singer_name)) WHERE q.room_code=? AND q.status='playing' ORDER BY q.sort_order LIMIT 1").bind(code).first<QueueRow>(),
    db.prepare("SELECT q.id,q.singer_name,q.song_title,q.video_title,q.video_id,q.thumbnail_url,q.sort_order,q.status,q.started_at,COALESCE(s.sung_count,0) AS sung_count FROM queue_items q LEFT JOIN singer_stats s ON s.room_code=q.room_code AND s.singer_key=lower(trim(q.singer_name)) WHERE q.room_code=? AND q.status='pending' ORDER BY q.sort_order LIMIT 100").bind(code).all<QueueRow>(),
    db.prepare("SELECT code FROM current_room WHERE id=1").first<{code:string}>().catch(()=>null),
  ]);
  return { code, playbackStatus:room.playback_status, requestsOpen:requestsAreOpen(room), requestsToggle:!!room.requests_open, endsAt:room.ends_at, cutoffMinutes:CUTOFF_MINUTES, isCurrent:current?.code===code, nowPlaying:now?queueItem(now):null, queue:waiting.results.map(queueItem), completedCount:Number(room.completed_count||0) };
}

export async function GET(request:Request, context:{params:Promise<{code:string}>}) {
  try { const code=codeOf((await context.params).code); const allowed=await verify(code,request,"host")||await verify(code,request,"invite")||await verify(code,request,"tv"); if(!allowed) return Response.json({error:"Use this room’s private link to enter."},{status:403}); const room=await state(code); if(!room) return Response.json({error:"That room has left the building."},{status:404}); return Response.json(room,{headers:{"cache-control":"no-store"}}); }
  catch(error){ const message=error instanceof Error?error.message:"Couldn’t load the room."; return Response.json({error:message.includes("no such table")?"The room database is still setting up.":message},{status:500}); }
}

export async function POST(request:Request, context:{params:Promise<{code:string}>}) {
  try {
    const code=codeOf((await context.params).code); if(!await verify(code,request,"invite")) return Response.json({error:"Scan this room’s QR code to add a song."},{status:403});
    const body=await request.json() as {singerName?:string;songTitle?:string;videoTitle?:string;videoId?:string;thumbnailUrl?:string};
    const singerName=body.singerName?.trim().slice(0,32)||""; const songTitle=body.songTitle?.trim().slice(0,140)||""; const videoTitle=body.videoTitle?.trim().slice(0,240)||""; const videoId=body.videoId?.trim().slice(0,20)||""; const thumbnailUrl=body.thumbnailUrl?.trim().slice(0,600)||"";
    if(!singerName||!songTitle||!videoTitle||!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) return Response.json({error:"That song selection is missing a detail."},{status:400});
    const db=dbBinding(); const room=await state(code); if(!room) return Response.json({error:"That room has left the building."},{status:404});
    if(!room.requestsOpen) return Response.json({error:"Requests are closed for tonight. The bunny is tired."},{status:409});
    // Cleanup whenever the app is used: no YouTube data lingers past 30 days.
    await db.prepare("DELETE FROM queue_items WHERE created_at < datetime('now','-30 days')").run().catch(()=>{});
    const order=await db.prepare("SELECT COALESCE(MAX(sort_order),0)+1 AS next_order FROM queue_items WHERE room_code=?").bind(code).first<{next_order:number}>();
    await db.prepare("INSERT INTO queue_items (room_code,singer_name,song_title,video_title,video_id,thumbnail_url,sort_order,status) VALUES (?,?,?,?,?,?,?,'pending')").bind(code,singerName,songTitle,videoTitle,videoId,thumbnailUrl,Number(order?.next_order||1)).run();
    return Response.json(await state(code),{status:201});
  } catch(error){ return Response.json({error:error instanceof Error?error.message:"Couldn’t add that song."},{status:500}); }
}

export async function PATCH(request:Request, context:{params:Promise<{code:string}>}) {
  try {
    const code=codeOf((await context.params).code); const isHost=await verify(code,request,"host"); const isTv=isHost?false:await verify(code,request,"tv"); const isGuest=isHost||isTv?false:await verify(code,request,"invite");
    if(!isHost&&!isTv&&!isGuest) return Response.json({error:"This control needs a private room link."},{status:403});
    const {action,itemId,requestsOpen,endsAt,inviteToken,tvToken}=await request.json() as {action?:"play"|"pause"|"skip"|"complete"|"move_up"|"move_down"|"delete"|"set_requests"|"set_end_time"|"reset_event"|"claim_current"|"balance";itemId?:number;requestsOpen?:boolean;endsAt?:string|null;inviteToken?:string;tvToken?:string};
    if(!action) return Response.json({error:"Unknown room control."},{status:400});
    if(["play","pause","skip","set_requests","set_end_time","reset_event","claim_current","balance","move_up","move_down","delete"].includes(action)&&!isHost) return Response.json({error:"Only the host can control the room."},{status:403});

    if(action==="claim_current") {
      // Make this room the one the printed singer QR codes join. The host proves it
      // holds the real invite token before we publish it.
      const db0=dbBinding();
      const row=await db0.prepare("SELECT invite_token_hash, tv_token_hash FROM rooms WHERE code=?").bind(code).first<{invite_token_hash:string;tv_token_hash:string}>();
      if(!row||!inviteToken||row.invite_token_hash!==await hash(inviteToken)) return Response.json({error:"That invite link doesn’t match this room."},{status:400});
      const tv = tvToken && row.tv_token_hash===await hash(tvToken) ? tvToken : null;
      await db0.prepare("INSERT INTO current_room (id, code, invite_token, tv_token, updated_at) VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET code = excluded.code, invite_token = excluded.invite_token, tv_token = excluded.tv_token, updated_at = CURRENT_TIMESTAMP").bind(code,inviteToken,tv).run();
      return Response.json(await state(code));
    }

    if(action==="set_requests") {
      // Reopening after last call has already passed: the host's toggle wins, so clear
      // the stale last-call time instead of leaving requests silently closed.
      if(requestsOpen){ const row=await dbBinding().prepare("SELECT requests_open, ends_at FROM rooms WHERE code=?").bind(code).first<{requests_open:number;ends_at:string|null}>(); if(row&&row.ends_at&&!requestsAreOpen({requests_open:1,ends_at:row.ends_at})) await dbBinding().prepare("UPDATE rooms SET ends_at=NULL WHERE code=?").bind(code).run(); }
      await dbBinding().prepare("UPDATE rooms SET requests_open=? WHERE code=?").bind(requestsOpen?1:0,code).run();
      return Response.json(await state(code));
    }
    if(action==="set_end_time") {
      const value = endsAt && !Number.isNaN(Date.parse(endsAt)) ? new Date(endsAt).toISOString() : null;
      await dbBinding().prepare("UPDATE rooms SET ends_at=? WHERE code=?").bind(value,code).run();
      return Response.json(await state(code));
    }
    if(action==="reset_event") {
      const db2=dbBinding();
      await db2.batch([
        db2.prepare("DELETE FROM queue_items WHERE room_code=?").bind(code),
        db2.prepare("UPDATE rooms SET playback_status='idle', requests_open=1, ends_at=NULL, completed_count=0 WHERE code=?").bind(code),
        db2.prepare("DELETE FROM singer_stats WHERE room_code=?").bind(code),
      ]);
      return Response.json(await state(code));
    }

    if(action==="balance") {
      // Fair rotation: nobody sings twice until everyone waiting has had a turn, and
      // people who have sung less tonight go first. Ties keep request order.
      const db3=dbBinding();
      const pending=await db3.prepare("SELECT q.id,q.singer_name,q.sort_order,COALESCE(s.sung_count,0) AS sung_count FROM queue_items q LEFT JOIN singer_stats s ON s.room_code=q.room_code AND s.singer_key=lower(trim(q.singer_name)) WHERE q.room_code=? AND q.status='pending' ORDER BY q.sort_order").bind(code).all<{id:number;singer_name:string;sort_order:number;sung_count:number}>();
      const bySinger=new Map<string,{sung:number;first:number;items:number[]}>();
      for(const row of pending.results){ const key=row.singer_name.trim().toLowerCase(); const entry=bySinger.get(key)||{sung:row.sung_count,first:row.sort_order,items:[]}; entry.items.push(row.id); bySinger.set(key,entry); }
      const ordered:number[]=[]; let round=0;
      while(true){ const turn=[...bySinger.values()].filter(e=>e.items.length>round).sort((a,b)=>(a.sung+round)-(b.sung+round)||a.first-b.first); if(!turn.length) break; for(const e of turn) ordered.push(e.items[round]); round+=1; }
      if(ordered.length) await db3.batch(ordered.map((id,index)=>db3.prepare("UPDATE queue_items SET sort_order=? WHERE id=? AND room_code=?").bind(index+1,id,code)));
      return Response.json(await state(code));
    }

    if(action==="complete"&&!isTv&&!isHost) return Response.json({error:"Only the TV player can finish a song."},{status:403});
    const db=dbBinding();
    if(["delete","move_up","move_down"].includes(action)) {
      if(!itemId) return Response.json({error:"Choose a queued song first."},{status:400});
      const item=await db.prepare("SELECT id,sort_order FROM queue_items WHERE id=? AND room_code=? AND status='pending'").bind(itemId,code).first<{id:number;sort_order:number}>();
      if(!item) return Response.json({error:"That song is no longer waiting."},{status:409});
      if(action==="delete") await db.prepare("DELETE FROM queue_items WHERE id=? AND room_code=?").bind(itemId,code).run();
      else {
        const before=action==="move_up"; const neighbor=await db.prepare(`SELECT id,sort_order FROM queue_items WHERE room_code=? AND status='pending' AND sort_order ${before?"<":">"} ? ORDER BY sort_order ${before?"DESC":"ASC"} LIMIT 1`).bind(code,item.sort_order).first<{id:number;sort_order:number}>();
        if(neighbor) await db.batch([db.prepare("UPDATE queue_items SET sort_order=-1 WHERE id=?").bind(item.id),db.prepare("UPDATE queue_items SET sort_order=? WHERE id=?").bind(item.sort_order,neighbor.id),db.prepare("UPDATE queue_items SET sort_order=? WHERE id=?").bind(neighbor.sort_order,item.id)]);
      }
      return Response.json(await state(code));
    }
    const current=await db.prepare("SELECT id FROM queue_items WHERE room_code=? AND status='playing' ORDER BY sort_order LIMIT 1").bind(code).first<{id:number}>();
    if((action==="complete"||action==="skip")&&current){ if(itemId&&itemId!==current.id) return Response.json(await state(code));
      // Privacy policy: a played or skipped selection is deleted immediately. Keep only a tally.
      const singer=await db.prepare("SELECT singer_name FROM queue_items WHERE id=?").bind(current.id).first<{singer_name:string}>();
      await db.batch([
        db.prepare("DELETE FROM queue_items WHERE id=?").bind(current.id),
        db.prepare("UPDATE rooms SET completed_count=completed_count+1 WHERE code=?").bind(code),
        db.prepare("INSERT INTO singer_stats (room_code, singer_key, sung_count, last_sung_at) VALUES (?, ?, 1, CURRENT_TIMESTAMP) ON CONFLICT(room_code, singer_key) DO UPDATE SET sung_count=sung_count+1, last_sung_at=CURRENT_TIMESTAMP").bind(code,(singer?.singer_name||"").trim().toLowerCase()),
      ]); }
    if(action==="pause") await db.prepare("UPDATE rooms SET playback_status='paused' WHERE code=?").bind(code).run();
    if(action==="play") {
      if(!current){ const next=await db.prepare("SELECT id FROM queue_items WHERE room_code=? AND status='pending' ORDER BY sort_order LIMIT 1").bind(code).first<{id:number}>(); if(next) await db.prepare("UPDATE queue_items SET status='playing',started_at=CURRENT_TIMESTAMP WHERE id=?").bind(next.id).run(); }
      await db.prepare("UPDATE rooms SET playback_status='playing' WHERE code=?").bind(code).run();
    }
    if(action==="complete"||action==="skip") {
      const next=await db.prepare("SELECT id FROM queue_items WHERE room_code=? AND status='pending' ORDER BY sort_order LIMIT 1").bind(code).first<{id:number}>();
      if(next){ await db.prepare("UPDATE queue_items SET status='playing',started_at=CURRENT_TIMESTAMP WHERE id=?").bind(next.id).run(); await db.prepare("UPDATE rooms SET playback_status='playing' WHERE code=?").bind(code).run(); }
      else await db.prepare("UPDATE rooms SET playback_status='idle' WHERE code=?").bind(code).run();
    }
    return Response.json(await state(code));
  } catch(error){ return Response.json({error:error instanceof Error?error.message:"The controls missed their cue."},{status:500}); }
}
