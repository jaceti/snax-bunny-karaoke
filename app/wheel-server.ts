import { wheelEntries,pickWheelWinner,wheelRotation,WHEEL_DURATION,type WheelState } from "./wheel-model.ts";
const initialized=new WeakMap<D1Database,Promise<unknown>>();
export async function ensureWheelSchema(db:D1Database){
  let promise=initialized.get(db);
  if(!promise){promise=db.prepare("CREATE TABLE IF NOT EXISTS room_wheel (room_code TEXT PRIMARY KEY,state TEXT NOT NULL,resume_playback INTEGER NOT NULL DEFAULT 0)").run();initialized.set(db,promise);promise.catch(()=>initialized.delete(db));}
  await promise;
}
async function rawWheel(db:D1Database,code:string){await ensureWheelSchema(db);return db.prepare("SELECT state,resume_playback FROM room_wheel WHERE room_code=?").bind(code).first<{state:string;resume_playback:number}>();}
export async function readWheel(db:D1Database,code:string,now=Date.now()):Promise<WheelState|null>{
  const row=await rawWheel(db,code);if(!row)return null;
  const wheel=JSON.parse(row.state) as WheelState;
  if(wheel.phase==="spinning"&&wheel.endsAt!==null&&now>=wheel.endsAt){
    const winner=wheel.winnerIndex===null?null:wheel.entries[wheel.winnerIndex];
    wheel.phase="winner";
    if(winner&&!winner.filler&&winner.queueId!==null){
      // One atomic landing: preserve the interrupted song directly behind the
      // winner. Keep the old state as a guard until the final statement so
      // simultaneous TV/host polls cannot promote or demote the winner twice.
      await db.batch([
        db.prepare("UPDATE queue_items SET status='pending',started_at=NULL,sort_order=(SELECT COALESCE(MIN(sort_order),0)-1 FROM queue_items WHERE room_code=? AND status='pending') WHERE room_code=? AND status='playing' AND EXISTS (SELECT 1 FROM room_wheel WHERE room_code=? AND state=?) AND EXISTS (SELECT 1 FROM queue_items WHERE id=? AND room_code=? AND status='pending')").bind(code,code,code,row.state,winner.queueId,code),
        db.prepare("UPDATE queue_items SET status='playing',started_at=CURRENT_TIMESTAMP WHERE id=? AND room_code=? AND status='pending' AND EXISTS (SELECT 1 FROM room_wheel WHERE room_code=? AND state=?)").bind(winner.queueId,code,code,row.state),
        db.prepare("UPDATE room_wheel SET state=? WHERE room_code=? AND state=?").bind(JSON.stringify(wheel),code,row.state),
      ]);
    }
  }
  return wheel;
}
async function entries(db:D1Database,code:string){
  const rows=await db.prepare("SELECT id,singer_name,song_title FROM queue_items WHERE room_code=? AND status='pending' ORDER BY sort_order,id").bind(code).all<{id:number;singer_name:string;song_title:string}>();
  return wheelEntries(rows.results);
}
export async function openWheel(db:D1Database,code:string){
  await ensureWheelSchema(db);
  if(await rawWheel(db,code))return;
  const roster=await entries(db,code);if(!roster.length)throw new Error("Add at least one singer to the lineup before opening the wheel.");
  const interrupted=await db.prepare("SELECT id FROM queue_items WHERE room_code=? AND status='playing' ORDER BY sort_order,id LIMIT 1").bind(code).first<{id:number}>();
  const wheel:WheelState={id:crypto.randomUUID(),phase:"ready",entries:roster,winnerIndex:null,startedAt:null,endsAt:null,rotation:0,interruptedQueueId:interrupted?.id??null};
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO room_wheel (room_code,state,resume_playback) SELECT code,?,CASE WHEN playback_status='playing' THEN 1 ELSE 0 END FROM rooms WHERE code=?").bind(JSON.stringify(wheel),code),
    db.prepare("UPDATE rooms SET playback_status='paused' WHERE code=? AND EXISTS (SELECT 1 FROM room_wheel WHERE room_code=?)").bind(code,code),
  ]);
}
export async function spinWheel(db:D1Database,code:string,wheelId:string,now=Date.now()){
  const row=await rawWheel(db,code);if(!row)throw new Error("Open the wheel first.");
  const old=JSON.parse(row.state) as WheelState;
  if(old.id!==wheelId)throw new Error("That wheel has closed. Refresh the host console.");
  if(old.phase!=="ready")return; // Repeated clicks/retries share one winner.
  const roster=await entries(db,code);const winnerIndex=pickWheelWinner(roster);
  const wheel:WheelState={...old,entries:roster,phase:"spinning",winnerIndex,startedAt:now,endsAt:now+WHEEL_DURATION,rotation:wheelRotation(winnerIndex,roster.length)};
  const serialized=JSON.stringify(wheel);
  await db.batch([
    db.prepare("UPDATE room_wheel SET state=? WHERE room_code=? AND state=?").bind(serialized,code,row.state),
  ]);
}
export async function finishInterruptedSong(db:D1Database,code:string,itemId:number){
  const row=await rawWheel(db,code);if(!row)return false;
  const wheel=JSON.parse(row.state) as WheelState;
  if(wheel.interruptedQueueId!==itemId)return true;
  // ENDED can arrive just after the host pauses/opens the wheel, or after the
  // landing moved this item back to pending. Count it once and never replay it.
  await db.batch([
    db.prepare("INSERT INTO singer_stats (room_code,singer_key,sung_count,last_sung_at) SELECT room_code,lower(trim(singer_name)),1,CURRENT_TIMESTAMP FROM queue_items WHERE room_code=? AND id=? ON CONFLICT(room_code,singer_key) DO UPDATE SET sung_count=sung_count+1,last_sung_at=CURRENT_TIMESTAMP").bind(code,itemId),
    db.prepare("UPDATE rooms SET completed_count=completed_count+1 WHERE code=? AND EXISTS (SELECT 1 FROM queue_items WHERE room_code=? AND id=?)").bind(code,code,itemId),
    db.prepare("DELETE FROM queue_items WHERE room_code=? AND id=?").bind(code,itemId),
  ]);
  return true;
}

export async function closeWheel(db:D1Database,code:string,wheelId:string,now=Date.now()){
  // A close request may be the first request after landing.
  const current=await rawWheel(db,code);
  if(!current)return;
  if((JSON.parse(current.state) as WheelState).id!==wheelId)throw new Error("That wheel has already closed.");
  await readWheel(db,code,now);
  const row=await rawWheel(db,code);if(!row)return;
  const wheel=JSON.parse(row.state) as WheelState;
  if(wheel.id!==wheelId)throw new Error("That wheel has already closed.");
  if(wheel.phase==="spinning"&&wheel.endsAt!==null&&now<wheel.endsAt)throw new Error("Let the wheel finish its spin first.");
  await db.batch([
    db.prepare("UPDATE rooms SET playback_status=CASE WHEN NOT EXISTS (SELECT 1 FROM queue_items WHERE room_code=? AND status='playing') THEN 'idle' WHEN ?=1 OR (SELECT resume_playback FROM room_wheel WHERE room_code=?)=1 THEN 'playing' ELSE 'paused' END WHERE code=? AND EXISTS (SELECT 1 FROM room_wheel WHERE room_code=? AND state=?)").bind(code,wheel.phase==="winner"?1:0,code,code,code,row.state),
    db.prepare("DELETE FROM room_wheel WHERE room_code=? AND state=?").bind(code,row.state),
  ]);
}
