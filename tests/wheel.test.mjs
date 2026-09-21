import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { wheelEntries,pickWheelWinner,wheelRotation,WHEEL_DURATION } from '../app/wheel-model.ts';
import { openWheel,spinWheel,closeWheel,readWheel,finishInterruptedSong } from '../app/wheel-server.ts';
import { ensureDailyReset } from '../app/daily-reset.ts';

function fixture(status='playing'){
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE rooms(code TEXT PRIMARY KEY,playback_status TEXT,requests_open INTEGER,ends_at TEXT,completed_count INTEGER);
    CREATE TABLE queue_items(id INTEGER PRIMARY KEY,room_code TEXT,status TEXT,sort_order INTEGER,singer_name TEXT,song_title TEXT);
    CREATE TABLE singer_stats(room_code TEXT,singer_key TEXT,sung_count INTEGER,last_sung_at TEXT,PRIMARY KEY(room_code,singer_key));
    CREATE TABLE current_room(id INTEGER PRIMARY KEY,code TEXT);
    INSERT INTO rooms VALUES('ROOM','${status}',1,NULL,0),('OTHER','idle',1,NULL,0);
    INSERT INTO current_room VALUES(1,'ROOM');
    INSERT INTO queue_items VALUES(1,'ROOM','playing',0,'Current singer','Current song'),(2,'ROOM','pending',1,'Jess','Jess first'),(3,'ROOM','pending',2,'Alex','Alex song'),(4,'ROOM','pending',3,'Sam','Sam song'),(5,'ROOM','pending',4,'Jess','Jess later'),(6,'OTHER','pending',1,'Other','Other song');`);
  const db={
    prepare(query){return {query,values:[],bind(...values){this.values=values;return this;},async run(){const r=sql.prepare(query).run(...this.values);return {meta:{changes:Number(r.changes)}};},async first(){return sql.prepare(query).get(...this.values)||null;},async all(){return {results:sql.prepare(query).all(...this.values)};}};},
    async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}},
  };
  sql.exec('ALTER TABLE queue_items ADD COLUMN started_at TEXT');
  return {sql,db};
}

test('one space per singer; odd counts add a non-winning filler; even counts do not',()=>{
  const roster=wheelEntries([{id:1,singer_name:'Jess',song_title:'first'},{id:2,singer_name:' jess ',song_title:'later'},{id:3,singer_name:'Alex',song_title:'song'},{id:4,singer_name:'Sam',song_title:'song'}]);
  assert.equal(roster.length,4);assert.equal(roster[0].queueId,1);assert.equal(roster[3].filler,true);
  for(let draw=0;draw<300;draw++)assert.equal(roster[pickWheelWinner(roster,()=>draw)].filler,false);
  assert.equal(wheelEntries([{id:1,singer_name:'A',song_title:'x'},{id:2,singer_name:'B',song_title:'y'}]).length,2);
  assert.deepEqual(wheelEntries([]),[]);
  assert.throws(()=>pickWheelWinner([]),/Add a singer/);
});

test('winner sampling is uniform over singers and rejects modulo-biased random values',()=>{
  const roster=wheelEntries(['A','B','C'].map((singer_name,i)=>({id:i+1,singer_name,song_title:'x'})));
  const counts=[0,0,0];for(let i=0;i<300;i++)counts[pickWheelWinner(roster,()=>i)]++;
  assert.deepEqual(counts,[100,100,100]);
  const words=[0xffffffff,2];assert.equal(pickWheelWinner(roster,()=>words.shift()),2);
  for(let i=0;i<4;i++)assert.equal(Math.round((wheelRotation(i,4)+(i+.5)*90)%360),0);
});

test('landing makes the winner current and the interrupted singer next; closing plays the winner',async()=>{
  const {sql,db}=fixture();await openWheel(db,'ROOM');
  const ready=await readWheel(db,'ROOM');assert.equal(ready.phase,'ready');assert.equal(ready.entries.length,4);
  assert.equal(sql.prepare("SELECT playback_status FROM rooms WHERE code='ROOM'").get().playback_status,'paused');
  const time=Date.now();await spinWheel(db,'ROOM',ready.id,time);
  const spinning=await readWheel(db,'ROOM',time);const winner=spinning.entries[spinning.winnerIndex];
  assert.equal(winner.filler,false);assert.equal(spinning.phase,'spinning');
  assert.equal(sql.prepare("SELECT id FROM queue_items WHERE room_code='ROOM' AND status='pending' ORDER BY sort_order,id LIMIT 1").get().id,2);
  assert.notEqual(winner.queueId,5);assert.equal(sql.prepare("SELECT id FROM queue_items WHERE status='playing'").get().id,1);
  await assert.rejects(closeWheel(db,'ROOM',ready.id,time+1),/finish/);
  const before=JSON.stringify(sql.prepare('SELECT * FROM queue_items ORDER BY id').all());
  await spinWheel(db,'ROOM',ready.id,time+100);
  assert.equal((await readWheel(db,'ROOM',time)).winnerIndex,spinning.winnerIndex);
  assert.equal(JSON.stringify(sql.prepare('SELECT * FROM queue_items ORDER BY id').all()),before);
  assert.equal((await readWheel(db,'ROOM',time+WHEEL_DURATION)).phase,'winner');
  assert.equal(sql.prepare("SELECT id FROM queue_items WHERE status='playing'").get().id,winner.queueId);
  assert.equal(sql.prepare("SELECT id FROM queue_items WHERE room_code='ROOM' AND status='pending' ORDER BY sort_order,id LIMIT 1").get().id,1);
  const landed=JSON.stringify(sql.prepare('SELECT * FROM queue_items ORDER BY id').all());
  await readWheel(db,'ROOM',time+WHEEL_DURATION+1);
  assert.equal(JSON.stringify(sql.prepare('SELECT * FROM queue_items ORDER BY id').all()),landed);
  await closeWheel(db,'ROOM',ready.id,time+WHEEL_DURATION);
  assert.equal(await readWheel(db,'ROOM'),null);assert.equal(sql.prepare("SELECT playback_status FROM rooms WHERE code='ROOM'").get().playback_status,'playing');
  assert.equal(sql.prepare("SELECT sort_order FROM queue_items WHERE room_code='OTHER'").get().sort_order,1);
  sql.close();
});

test('closing an unspun wheel preserves the queue and an existing host pause',async()=>{
  const {sql,db}=fixture('paused');const before=JSON.stringify(sql.prepare('SELECT * FROM queue_items ORDER BY id').all());
  await openWheel(db,'ROOM');const wheel=await readWheel(db,'ROOM');await openWheel(db,'ROOM');assert.equal((await readWheel(db,'ROOM')).id,wheel.id);
  await closeWheel(db,'ROOM',wheel.id);
  assert.equal(sql.prepare("SELECT playback_status FROM rooms WHERE code='ROOM'").get().playback_status,'paused');
  assert.equal(JSON.stringify(sql.prepare('SELECT * FROM queue_items ORDER BY id').all()),before);sql.close();
});

test('new requests before spin are included, and the 3 AM reset closes an active wheel',async()=>{
  const {sql,db}=fixture();await openWheel(db,'ROOM');const wheel=await readWheel(db,'ROOM');
  sql.exec("INSERT INTO queue_items VALUES(7,'ROOM','pending',5,'New singer','New song',NULL)");
  await spinWheel(db,'ROOM',wheel.id,Date.now());
  const spun=await readWheel(db,'ROOM');assert.equal(spun.entries.length,4);assert.equal(spun.entries.some(e=>e.filler),false);assert.equal(spun.entries.some(e=>e.name==='New singer'),true);
  await ensureDailyReset(db,Date.parse('2026-09-21T10:00:00Z'));
  assert.equal(await readWheel(db,'ROOM'),null);assert.equal(sql.prepare("SELECT playback_status FROM rooms WHERE code='ROOM'").get().playback_status,'idle');sql.close();
});

test('empty queues cannot open the wheel; a single singer wins without landing on filler',async()=>{
  const {sql,db}=fixture();sql.exec("DELETE FROM queue_items WHERE room_code='ROOM' AND status='pending'");
  await assert.rejects(openWheel(db,'ROOM'),/at least one/);
  sql.exec("INSERT INTO queue_items VALUES(2,'ROOM','pending',1,'Solo','Only song',NULL)");
  await openWheel(db,'ROOM');const wheel=await readWheel(db,'ROOM');await spinWheel(db,'ROOM',wheel.id);
  const spun=await readWheel(db,'ROOM');assert.equal(spun.entries.length,2);assert.equal(spun.entries[spun.winnerIndex].name,'Solo');sql.close();
});

test('a finished or majority-played interrupted song is counted once and never requeued',async()=>{
  for(const late of [false,true]){
    const {sql,db}=fixture();await openWheel(db,'ROOM');const wheel=await readWheel(db,'ROOM');
    const time=Date.now();await spinWheel(db,'ROOM',wheel.id,time);
    if(late)await readWheel(db,'ROOM',time+WHEEL_DURATION);
    assert.equal(await finishInterruptedSong(db,'ROOM',1),true);
    await finishInterruptedSong(db,'ROOM',1);
    const landed=await readWheel(db,'ROOM',time+WHEEL_DURATION);
    const winner=landed.entries[landed.winnerIndex];
    assert.equal(sql.prepare('SELECT id FROM queue_items WHERE id=1').get(),undefined);
    assert.equal(sql.prepare("SELECT completed_count FROM rooms WHERE code='ROOM'").get().completed_count,1);
    assert.equal(sql.prepare("SELECT sung_count FROM singer_stats WHERE room_code='ROOM'").get().sung_count,1);
    assert.equal(sql.prepare("SELECT id FROM queue_items WHERE status='playing'").get().id,winner.queueId);
    await finishInterruptedSong(db,'ROOM',winner.queueId);
    assert.equal(sql.prepare("SELECT id FROM queue_items WHERE status='playing'").get().id,winner.queueId);
    await closeWheel(db,'ROOM',wheel.id,time+WHEEL_DURATION);sql.close();
  }
});

test('close can finalize landing without a prior poll, including an idle or paused room',async()=>{
  for(const status of ['paused','idle']){
    const {sql,db}=fixture(status);if(status==='idle')sql.exec('DELETE FROM queue_items WHERE id=1');
    await openWheel(db,'ROOM');const wheel=await readWheel(db,'ROOM');const time=Date.now();
    await spinWheel(db,'ROOM',wheel.id,time);const spun=await readWheel(db,'ROOM',time);
    await closeWheel(db,'ROOM',wheel.id,time+WHEEL_DURATION);
    assert.equal(sql.prepare("SELECT id FROM queue_items WHERE status='playing'").get().id,spun.entries[spun.winnerIndex].queueId);
    assert.equal(sql.prepare("SELECT playback_status FROM rooms WHERE code='ROOM'").get().playback_status,'playing');sql.close();
  }
});
