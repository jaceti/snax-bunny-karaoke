import { singerNight } from "./singer-memory.ts";

// Preserve the current show on installation; first reset: September 21, 3 AM Pacific.
export const RESET_ACTIVATION_NIGHT="2026-09-20";
const initialized=new WeakMap<D1Database,Promise<void>>();
const checkedNight=new WeakMap<D1Database,string>();

export async function ensureDailyReset(db:D1Database,now=Date.now()){
  const night=singerNight(now);
  if(checkedNight.get(db)===night)return false;
  let ready=initialized.get(db);
  if(!ready){
    ready=(async()=>{
      await db.prepare("CREATE TABLE IF NOT EXISTS daily_reset (id INTEGER PRIMARY KEY CHECK (id=1), night TEXT NOT NULL, reset_at TEXT)").run();
      await db.prepare("INSERT OR IGNORE INTO daily_reset (id,night) VALUES (1,?)").bind(RESET_ACTIVATION_NIGHT).run();
    })();
    initialized.set(db,ready);
    ready.catch(()=>initialized.delete(db));
  }
  await ready;
  // Only the current show is in scope. Preserve archived rooms, access keys,
  // the current_room pointer, and the permanent QR codes.
  // Conditions and the completion marker commit together, so a retry cannot
  // clear newly added songs after another invocation already reset the day.
  const due="(SELECT night FROM daily_reset WHERE id=1) < ?";
  const current="(SELECT code FROM current_room WHERE id=1)";
  const results=await db.batch([
    db.prepare(`DELETE FROM queue_items WHERE room_code=${current} AND ${due}`).bind(night),
    db.prepare(`DELETE FROM singer_stats WHERE room_code=${current} AND ${due}`).bind(night),
    db.prepare(`UPDATE rooms SET playback_status='idle',requests_open=1,ends_at=NULL,completed_count=0 WHERE code=${current} AND ${due}`).bind(night),
    db.prepare("UPDATE daily_reset SET night=?,reset_at=? WHERE id=1 AND night < ?").bind(night,new Date(now).toISOString(),night),
  ]);
  checkedNight.set(db,night);
  return Number(results[3]?.meta?.changes||0)>0;
}
