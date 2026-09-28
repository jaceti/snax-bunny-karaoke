export const singerKey=(name:string)=>name.trim().toLowerCase();
type SingerRow={singer_name:string};

// Only the immediately preceding singer sits out, and only if another singer
// is waiting. This is an eligibility filter, NOT a deterministic wheel order.
export function eligibleSingers<T extends SingerRow>(rows:T[],previous:string){
  const others=rows.filter(row=>singerKey(row.singer_name)!==singerKey(previous));
  return others.length?others:rows;
}

// Preserve request/host order except where it would give someone two turns in
// a row. Used by both the visible "up next" lineup and actual queue advancement.
export function noRepeatOrder<T extends SingerRow>(rows:T[],previous:string){
  const remaining=[...rows],ordered:T[]=[];let last=singerKey(previous);
  while(remaining.length){
    const alternative=remaining.findIndex(row=>singerKey(row.singer_name)!==last);
    const [next]=remaining.splice(alternative<0?0:alternative,1);
    ordered.push(next);last=singerKey(next.singer_name);
  }
  return ordered;
}

const initialized=new WeakMap<D1Database,Promise<unknown>>();
export async function ensureRotationSchema(db:D1Database){
  let ready=initialized.get(db);
  if(!ready){ready=db.prepare("CREATE TABLE IF NOT EXISTS room_rotation (room_code TEXT PRIMARY KEY,last_singer_key TEXT NOT NULL)").run();initialized.set(db,ready);ready.catch(()=>initialized.delete(db));}
  await ready;
}

export async function previousSinger(db:D1Database,code:string){
  await ensureRotationSchema(db);
  const current=await db.prepare("SELECT singer_name FROM queue_items WHERE room_code=? AND status='playing' ORDER BY sort_order,id LIMIT 1").bind(code).first<{singer_name:string}>();
  if(current)return singerKey(current.singer_name);
  const last=await db.prepare("SELECT last_singer_key FROM room_rotation WHERE room_code=?").bind(code).first<{last_singer_key:string}>();
  if(last)return singerKey(last.last_singer_key);
  // Adopt existing history on deployment without resetting tonight's show.
  const legacy=await db.prepare("SELECT singer_key FROM singer_stats WHERE room_code=? ORDER BY last_sung_at DESC,rowid DESC LIMIT 1").bind(code).first<{singer_key:string}>();
  return singerKey(legacy?.singer_key||"");
}

// Include in the same transaction BEFORE deleting the finished/skipped item.
export function rememberSingerStatement(db:D1Database,code:string,id:number){
  return db.prepare("INSERT INTO room_rotation (room_code,last_singer_key) SELECT room_code,lower(trim(singer_name)) FROM queue_items WHERE room_code=? AND id=? ON CONFLICT(room_code) DO UPDATE SET last_singer_key=excluded.last_singer_key").bind(code,id);
}

export async function nextQueuedSinger(db:D1Database,code:string){
  const previous=await previousSinger(db,code);
  const pending=await db.prepare("SELECT id,singer_name FROM queue_items WHERE room_code=? AND status='pending' ORDER BY sort_order,id").bind(code).all<{id:number;singer_name:string}>();
  return eligibleSingers(pending.results,previous)[0]||null;
}
