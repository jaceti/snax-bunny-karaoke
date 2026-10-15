import { nextQueuedSinger } from "./singer-rotation.ts";
export type BunnyBreak={id:string;phase:"pending"|"active"};
const initialized=new WeakMap<D1Database,Promise<unknown>>();
export async function ensureBreakSchema(db:D1Database){
  let ready=initialized.get(db);
  if(!ready){ready=db.prepare("CREATE TABLE IF NOT EXISTS room_break (room_code TEXT PRIMARY KEY,id TEXT NOT NULL,phase TEXT NOT NULL)").run();initialized.set(db,ready);ready.catch(()=>initialized.delete(db));}
  await ready;
}
export async function readBreak(db:D1Database,code:string):Promise<BunnyBreak|null>{
  await ensureBreakSchema(db);
  return db.prepare("SELECT id,phase FROM room_break WHERE room_code=?").bind(code).first<BunnyBreak>();
}
// No queued song can slip past a pending/active break, even on a delayed end
// notification. Existing playing rows also prevent two songs being promoted.
export async function startNextOutsideBreak(db:D1Database,code:string){
  await ensureBreakSchema(db);
  const next=await nextQueuedSinger(db,code);
  if(next)await db.prepare("UPDATE queue_items SET status='playing',started_at=CURRENT_TIMESTAMP WHERE id=? AND room_code=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM queue_items WHERE room_code=? AND status='playing') AND NOT EXISTS(SELECT 1 FROM room_break WHERE room_code=?)").bind(next.id,code,code,code).run();
  return db.prepare("SELECT id FROM queue_items WHERE room_code=? AND status='playing' ORDER BY sort_order,id LIMIT 1").bind(code).first<{id:number}>();
}
export async function activatePendingBreak(db:D1Database,code:string){
  await ensureBreakSchema(db);
  await db.batch([
    db.prepare("UPDATE room_break SET phase='active' WHERE room_code=? AND phase='pending' AND NOT EXISTS(SELECT 1 FROM queue_items WHERE room_code=? AND status='playing')").bind(code,code),
    db.prepare("UPDATE rooms SET playback_status='paused' WHERE code=? AND EXISTS(SELECT 1 FROM room_break WHERE room_code=? AND phase='active')").bind(code,code),
  ]);
  return readBreak(db,code);
}
export async function setBunnyBreak(db:D1Database,code:string,enabled:boolean){
  await ensureBreakSchema(db);
  if(enabled){
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO room_break(room_code,id,phase) SELECT code,?,CASE WHEN EXISTS(SELECT 1 FROM queue_items WHERE room_code=? AND status='playing') THEN 'pending' ELSE 'active' END FROM rooms WHERE code=?").bind(crypto.randomUUID(),code,code),
      db.prepare("UPDATE rooms SET playback_status='paused' WHERE code=? AND EXISTS(SELECT 1 FROM room_break WHERE room_code=? AND phase='active')").bind(code,code),
    ]);
    return;
  }
  const old=await readBreak(db,code);if(!old)return;
  await db.prepare("DELETE FROM room_break WHERE room_code=? AND id=?").bind(code,old.id).run();
  // Cancelling a pending break preserves the current song and host pause.
  // If the song finished during the cancellation, advance just once instead.
  const current=await db.prepare("SELECT id FROM queue_items WHERE room_code=? AND status='playing' LIMIT 1").bind(code).first<{id:number}>();
  if(old.phase==='active'||!current){
    await startNextOutsideBreak(db,code);
    await db.prepare("UPDATE rooms SET playback_status=CASE WHEN EXISTS(SELECT 1 FROM queue_items WHERE room_code=? AND status='playing') THEN 'playing' ELSE 'idle' END WHERE code=? AND NOT EXISTS(SELECT 1 FROM room_break WHERE room_code=?)").bind(code,code,code).run();
  }
}
