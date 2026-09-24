import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { addPick,listPicks,movePick,deletePick,pinnedIds,snaxSingsNext } from '../app/snax-picks.ts';
import { openWheel,readWheel } from '../app/wheel-server.ts';
import { TvPlayback } from '../app/tv-playback.ts';

function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE rooms(code TEXT PRIMARY KEY,playback_status TEXT,requests_open INTEGER,ends_at TEXT,completed_count INTEGER);
    CREATE TABLE queue_items(id INTEGER PRIMARY KEY AUTOINCREMENT,room_code TEXT,singer_name TEXT,song_title TEXT,video_title TEXT,video_id TEXT,thumbnail_url TEXT,sort_order INTEGER,status TEXT,started_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT INTO rooms VALUES('ROOM','paused',1,NULL,0);
    INSERT INTO queue_items(room_code,singer_name,song_title,video_title,video_id,thumbnail_url,sort_order,status) VALUES
      ('ROOM','Current','Now','Now','nowvid1','',1,'playing'),('ROOM','Jess','A','A','vidaaaa','',2,'pending'),('ROOM','Alex','B','B','vidbbbb','',3,'pending');`);
  const db={
    prepare(query){return {query,values:[],bind(...values){this.values=values;return this;},async run(){const r=sql.prepare(query).run(...this.values);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};},async first(){return sql.prepare(query).get(...this.values)||null;},async all(){return {results:sql.prepare(query).all(...this.values)};}};},
    async batch(statements){sql.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}},
  };
  return {sql,db};
}
const song=(n)=>({songTitle:`Snax song ${n}`,videoTitle:`Snax song ${n}`,videoId:`snaxvid${n}`,thumbnailUrl:''});

test('picks stay private, reorder, and delete',async()=>{
  const {db}=fixture();
  await addPick(db,'ROOM',song(1));await addPick(db,'ROOM',song(2));
  let picks=await listPicks(db,'ROOM');assert.deepEqual(picks.map(p=>p.videoId),['snaxvid1','snaxvid2']);
  await movePick(db,'ROOM',picks[1].id,'up');
  picks=await listPicks(db,'ROOM');assert.deepEqual(picks.map(p=>p.videoId),['snaxvid2','snaxvid1']);
  await deletePick(db,'ROOM',picks[0].id);
  assert.deepEqual((await listPicks(db,'ROOM')).map(p=>p.videoId),['snaxvid1']);
  assert.deepEqual(await listPicks(db,'OTHER'),[]);
});

test('Snax sings next goes straight after the current song, is pinned, and leaves the wheel alone',async()=>{
  const {db,sql}=fixture();
  await addPick(db,'ROOM',song(1));await addPick(db,'ROOM',song(2));
  const id=await snaxSingsNext(db,'ROOM');
  const order=sql.prepare("SELECT singer_name,video_id FROM queue_items WHERE status='pending' ORDER BY sort_order").all();
  assert.deepEqual(order.map(r=>r.singer_name),['Snax','Jess','Alex']);
  assert.equal(order[0].video_id,'snaxvid1');
  assert.deepEqual(await pinnedIds(db,'ROOM'),[id]);
  assert.deepEqual((await listPicks(db,'ROOM')).map(p=>p.videoId),['snaxvid2']);
  await assert.rejects(snaxSingsNext(db,'ROOM'),/already up next/);
  // The playing song is still current: the host's pause is untouched.
  assert.equal(sql.prepare("SELECT singer_name FROM queue_items WHERE status='playing'").get().singer_name,'Current');
  await openWheel(db,'ROOM');
  const wheel=await readWheel(db,'ROOM');
  assert.ok(!wheel.entries.some(e=>e.name==='Snax'));
  // Once her song leaves the lineup the pin clears and the next pick can go.
  sql.prepare('DELETE FROM queue_items WHERE id=?').run(id);
  assert.deepEqual(await pinnedIds(db,'ROOM'),[]);
  await snaxSingsNext(db,'ROOM');
  assert.equal((await pinnedIds(db,'ROOM')).length,1);
});

test('empty picks list explains itself',async()=>{
  const {db}=fixture();
  await assert.rejects(snaxSingsNext(db,'ROOM'),/Add a song/);
});

test('TV reloads a swapped video in place without an interlude',()=>{
  const calls=[];const interludes=[];
  const player={playVideo(){calls.push('play');},pauseVideo(){calls.push('pause');},cueVideoById(id){calls.push(`cue:${id}`);},loadVideoById(id){calls.push(`load:${id}`);},getVideoData(){return {};},destroy(){}};
  const tv=new TvPlayback({interlude:v=>interludes.push(v),blocked(){},complete:async()=>true,error(){}});
  tv.attach(player);
  tv.update({id:1,videoId:'dudvideo1'},'playing');
  assert.ok(calls.includes('load:dudvideo1'));
  calls.length=0;interludes.length=0;
  tv.update({id:1,videoId:'goodvideo'},'playing');
  assert.ok(calls.includes('load:goodvideo'));
  assert.ok(!interludes.includes(true));
  calls.length=0;
  tv.update({id:1,videoId:'goodvideo'},'playing');
  assert.ok(!calls.some(c=>c.startsWith('load')));
  tv.dispose();
});
