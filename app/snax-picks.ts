// Snax's own setlist. Picks live in a private list only the host console sees.
// "Snax sings next" moves the top pick into the lineup directly behind whatever is
// playing now, and pins it there so Balance and the wheel never displace it.
export const SNAX_NAME="Snax";
export type SnaxPick={id:number;songTitle:string;videoTitle:string;videoId:string;thumbnailUrl:string};

const initialized=new WeakMap<D1Database,Promise<unknown>>();
export async function ensureSnaxSchema(db:D1Database){
  let promise=initialized.get(db);
  if(!promise){
    promise=db.batch([
      db.prepare("CREATE TABLE IF NOT EXISTS snax_picks (id INTEGER PRIMARY KEY AUTOINCREMENT, room_code TEXT NOT NULL, song_title TEXT NOT NULL, video_title TEXT NOT NULL, video_id TEXT NOT NULL, thumbnail_url TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
      db.prepare("CREATE TABLE IF NOT EXISTS snax_pins (queue_id INTEGER PRIMARY KEY, room_code TEXT NOT NULL)"),
    ]);
    initialized.set(db,promise);promise.catch(()=>initialized.delete(db));
  }
  await promise;
}

export async function listPicks(db:D1Database,code:string):Promise<SnaxPick[]>{
  await ensureSnaxSchema(db);
  const rows=await db.prepare("SELECT id,song_title,video_title,video_id,thumbnail_url FROM snax_picks WHERE room_code=? ORDER BY id").bind(code).all<{id:number;song_title:string;video_title:string;video_id:string;thumbnail_url:string}>();
  return rows.results.map(row=>({id:row.id,songTitle:row.song_title,videoTitle:row.video_title,videoId:row.video_id,thumbnailUrl:row.thumbnail_url}));
}

// Queue ids currently pinned for Snax, in lineup order. Stale pins are dropped.
export async function pinnedIds(db:D1Database,code:string):Promise<number[]>{
  await ensureSnaxSchema(db);
  await db.prepare("DELETE FROM snax_pins WHERE room_code=? AND queue_id NOT IN (SELECT id FROM queue_items WHERE room_code=? AND status='pending')").bind(code,code).run();
  const rows=await db.prepare("SELECT q.id FROM snax_pins p JOIN queue_items q ON q.id=p.queue_id WHERE p.room_code=? ORDER BY q.sort_order,q.id").bind(code).all<{id:number}>();
  return rows.results.map(row=>row.id);
}

export async function addPick(db:D1Database,code:string,song:{songTitle:string;videoTitle:string;videoId:string;thumbnailUrl:string}){
  await ensureSnaxSchema(db);
  // Same 30-day ceiling the lineup uses for YouTube data.
  await db.prepare("DELETE FROM snax_picks WHERE created_at < datetime('now','-30 days')").run();
  const count=await db.prepare("SELECT COUNT(*) AS n FROM snax_picks WHERE room_code=?").bind(code).first<{n:number}>();
  if(Number(count?.n||0)>=50)throw new Error("Snax’s list is full. Remove a pick first.");
  await db.prepare("INSERT INTO snax_picks (room_code,song_title,video_title,video_id,thumbnail_url) VALUES (?,?,?,?,?)").bind(code,song.songTitle,song.videoTitle,song.videoId,song.thumbnailUrl).run();
}

export async function deletePick(db:D1Database,code:string,pickId:number){
  await ensureSnaxSchema(db);
  await db.prepare("DELETE FROM snax_picks WHERE id=? AND room_code=?").bind(pickId,code).run();
}

export async function movePick(db:D1Database,code:string,pickId:number,direction:"up"|"down"){
  const picks=await listPicks(db,code);const index=picks.findIndex(pick=>pick.id===pickId);const other=picks[direction==="up"?index-1:index+1];
  if(index<0||!other)return;
  // Swap contents rather than ids so the list order (by id) changes.
  const a=picks[index];
  await db.batch([
    db.prepare("UPDATE snax_picks SET song_title=?,video_title=?,video_id=?,thumbnail_url=? WHERE id=? AND room_code=?").bind(other.songTitle,other.videoTitle,other.videoId,other.thumbnailUrl,a.id,code),
    db.prepare("UPDATE snax_picks SET song_title=?,video_title=?,video_id=?,thumbnail_url=? WHERE id=? AND room_code=?").bind(a.songTitle,a.videoTitle,a.videoId,a.thumbnailUrl,other.id,code),
  ]);
}

// Put Snax's next pick (or a specific pick) straight after the current song.
export async function snaxSingsNext(db:D1Database,code:string,pickId?:number){
  if((await pinnedIds(db,code)).length)throw new Error("Snax is already up next.");
  const picks=await listPicks(db,code);
  const pick=pickId?picks.find(item=>item.id===pickId):picks[0];
  if(!pick)throw new Error("Add a song to Snax’s picks first.");
  const top=await db.prepare("SELECT COALESCE(MIN(sort_order),1)-1 AS top FROM queue_items WHERE room_code=? AND status='pending'").bind(code).first<{top:number}>();
  const insert=await db.prepare("INSERT INTO queue_items (room_code,singer_name,song_title,video_title,video_id,thumbnail_url,sort_order,status) VALUES (?,?,?,?,?,?,?,'pending')").bind(code,SNAX_NAME,pick.songTitle,pick.videoTitle,pick.videoId,pick.thumbnailUrl,Number(top?.top??0)).run();
  const queueId=Number((insert as {meta?:{last_row_id?:number}}).meta?.last_row_id);
  if(!queueId)throw new Error("Snax’s song missed the lineup.");
  await db.batch([
    db.prepare("INSERT OR REPLACE INTO snax_pins (queue_id,room_code) VALUES (?,?)").bind(queueId,code),
    db.prepare("DELETE FROM snax_picks WHERE id=? AND room_code=?").bind(pick.id,code),
  ]);
  return queueId;
}
