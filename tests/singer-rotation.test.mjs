import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as rotation from '../app/singer-rotation.ts';
import * as wheels from '../app/wheel-server.ts';
import * as picks from '../app/snax-picks.ts';
import * as access from '../app/api/rooms/shared-host.ts';
import {wheelEntries,pickWheelWinner,WHEEL_DURATION} from '../app/wheel-model.ts';
import {ensureDailyReset} from '../app/daily-reset.ts';

async function fixture(){
  const sql=new DatabaseSync(':memory:');
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('test-host'))).toString('hex');
  sql.exec(`CREATE TABLE rooms(code TEXT PRIMARY KEY,host_token_hash TEXT,invite_token_hash TEXT,tv_token_hash TEXT,playback_status TEXT,requests_open INTEGER,ends_at TEXT,completed_count INTEGER);
    CREATE TABLE queue_items(id INTEGER PRIMARY KEY AUTOINCREMENT,room_code TEXT,singer_name TEXT,song_title TEXT,video_title TEXT,video_id TEXT,thumbnail_url TEXT,sort_order INTEGER,status TEXT,started_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE singer_stats(room_code TEXT,singer_key TEXT,sung_count INTEGER,last_sung_at TEXT,PRIMARY KEY(room_code,singer_key));
    CREATE TABLE current_room(id INTEGER PRIMARY KEY,code TEXT);
    INSERT INTO rooms VALUES('ROOM','${hash}','invite','tv','playing',1,NULL,0);
    INSERT INTO current_room VALUES(1,'ROOM');
    INSERT INTO queue_items(id,room_code,singer_name,song_title,video_title,video_id,thumbnail_url,sort_order,status) VALUES
      (1,'ROOM','Jess','Current','Current','current','',0,'playing'),
      (2,'ROOM',' JESS ','Second','Second','second1','',1,'pending'),
      (3,'ROOM','Jess','Third','Third','third11','',2,'pending'),
      (4,'ROOM','Alex','Alex song','Alex song','alex111','',3,'pending'),
      (5,'ROOM','Sam','Sam song','Sam song','sam1111','',4,'pending');`);
  const db={prepare(query){return {query,values:[],bind(...values){this.values=values;return this;},async run(){const r=sql.prepare(query).run(...this.values);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};},async first(){return sql.prepare(query).get(...this.values)||null;},async all(){return {results:sql.prepare(query).all(...this.values)};}};},async batch(stmts){sql.exec('BEGIN');try{const results=[];for(const s of stmts)results.push(await s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  const source=ts.transpileModule(readFileSync(new URL('../app/api/rooms/[code]/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{}};new Function('require','module','exports',source)(name=>{
    if(name==='cloudflare:workers')return {env:{DB:db}};
    if(name.endsWith('shared-host'))return access;
    if(name.endsWith('wheel-server'))return wheels;
    if(name.endsWith('snax-picks'))return picks;
    if(name.endsWith('singer-rotation'))return rotation;
    throw Error(name);
  },mod,mod.exports);
  const context={params:Promise.resolve({code:'ROOM'})};
  const patch=async body=>{const response=await mod.exports.PATCH(new Request('https://example.test/api/rooms/ROOM',{method:'PATCH',headers:{'x-host-token':'test-host','content-type':'application/json'},body:JSON.stringify(body)}),context);const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;};
  const get=async()=>{const response=await mod.exports.GET(new Request('https://example.test/api/rooms/ROOM',{headers:{'x-host-token':'test-host'}}),context);assert.equal(response.status,200);return response.json();};
  return {sql,db,patch,get};
}

test('wheel remains uniformly random among all eligible distinct singers, regardless of song count',()=>{
  const rows=['Jess','Alex','Alex','Sam','Pat'].map((singer_name,i)=>({id:i+1,singer_name,song_title:'song'}));
  const roster=wheelEntries(rotation.eligibleSingers(rows,' JESS '));
  const counts={};for(let draw=0;draw<300;draw++){const name=roster[pickWheelWinner(roster,()=>draw)].name;counts[name]=(counts[name]||0)+1;}
  assert.deepEqual(counts,{Alex:100,Sam:100,Pat:100});assert.ok(!roster.some(e=>e.name==='Jess'));
});
for(const theme of ['classic','spooky'])test(`${theme} excludes current/just-finished singer at opening and rechecks on spin`,async()=>{
  const {db,sql}=await fixture();await wheels.openWheel(db,'ROOM',theme);const ready=await wheels.readWheel(db,'ROOM');
  assert.deepEqual(ready.entries.filter(e=>!e.filler).map(e=>e.name),['Alex','Sam']);
  await wheels.finishInterruptedSong(db,'ROOM',1);
  assert.equal(await rotation.previousSinger(db,'ROOM'),'jess');
  const now=Date.now();await wheels.spinWheel(db,'ROOM',ready.id,now);
  const spinning=await wheels.readWheel(db,'ROOM',now);assert.ok(['Alex','Sam'].includes(spinning.entries[spinning.winnerIndex].name));
  await wheels.closeWheel(db,'ROOM',ready.id,now+WHEEL_DURATION);
  await wheels.openWheel(db,'ROOM',theme);const second=await wheels.readWheel(db,'ROOM');
  assert.ok(!second.entries.some(e=>e.name===spinning.entries[spinning.winnerIndex].name));sql.close();
});
test('wheel includes a new alternative arriving after it opened with only one singer',async()=>{
  const {db,sql}=await fixture();sql.exec('DELETE FROM queue_items WHERE id IN (4,5)');
  await wheels.openWheel(db,'ROOM','spooky');const ready=await wheels.readWheel(db,'ROOM');assert.equal(ready.entries[0].name,'JESS');
  sql.exec("INSERT INTO queue_items(room_code,singer_name,song_title,sort_order,status) VALUES('ROOM','New singer','New song',9,'pending')");
  await wheels.spinWheel(db,'ROOM',ready.id);const spun=await wheels.readWheel(db,'ROOM');assert.equal(spun.entries[spun.winnerIndex].name,'New singer');sql.close();
});
test('visible next singer matches automatic completion, skip, and pause/resume',async()=>{
  const {get,patch,sql}=await fixture();const before=await get();assert.deepEqual(before.queue.map(q=>q.id),[4,2,5,3]);
  await patch({action:'pause'});const first=await patch({action:'complete',itemId:1});
  assert.equal(first.nowPlaying.id,4);assert.equal(first.playbackStatus,'paused');assert.equal(first.queue[0].id,2);
  const resumed=await patch({action:'play'});assert.equal(resumed.nowPlaying.id,4);
  const second=await patch({action:'skip',itemId:4});assert.equal(second.nowPlaying.id,2);assert.equal(second.queue[0].id,5);
  const stale=await patch({action:'complete',itemId:1});assert.equal(stale.nowPlaying.id,2);
  const third=await patch({action:'complete',itemId:2});assert.equal(third.nowPlaying.id,5);sql.close();
});
test('play after an empty queue remembers the last singer across a new request and reload',async()=>{
  const {db,patch,sql}=await fixture();sql.exec("DELETE FROM queue_items WHERE status='pending'");await patch({action:'complete',itemId:1});
  assert.equal(await rotation.previousSinger(db,'ROOM'),'jess');
  sql.exec("INSERT INTO queue_items(room_code,singer_name,song_title,sort_order,status) VALUES('ROOM','Jess','Again',1,'pending'),('ROOM','Alex','Other',2,'pending')");
  const room=await patch({action:'play'});assert.equal(room.nowPlaying.singerName,'Alex');sql.close();
});
test('a solo singer can continue; reset clears last-singer memory',async()=>{
  const {db,patch,sql}=await fixture();sql.exec('DELETE FROM queue_items WHERE id IN (4,5)');
  const room=await patch({action:'complete',itemId:1});assert.equal(room.nowPlaying.id,2);
  await patch({action:'reset_event'});assert.equal(await rotation.previousSinger(db,'ROOM'),'');
  sql.exec("INSERT INTO room_rotation VALUES('ROOM','jess')");
  await ensureDailyReset(db,Date.parse('2026-10-01T10:00:00Z'));assert.equal(await rotation.previousSinger(db,'ROOM'),'');sql.close();
});
test('Snax pins do not allow a consecutive turn, nor exclude the only alternative on a wheel',async()=>{
  const {db,get,patch,sql}=await fixture();await picks.ensureSnaxSchema(db);
  sql.exec("UPDATE queue_items SET singer_name='Snax' WHERE id IN (1,2,3);INSERT INTO snax_pins VALUES(2,'ROOM')");
  assert.equal((await get()).queue[0].id,4);assert.equal((await patch({action:'complete',itemId:1})).nowPlaying.id,4);
  sql.exec("UPDATE queue_items SET singer_name='Alex' WHERE id=3;DELETE FROM queue_items WHERE id=5");
  await wheels.openWheel(db,'ROOM','spooky');const wheel=await wheels.readWheel(db,'ROOM');assert.deepEqual(wheel.entries.filter(e=>!e.filler).map(e=>e.name),['Snax']);sql.close();
});
