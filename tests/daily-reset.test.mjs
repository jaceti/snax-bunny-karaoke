import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ensureDailyReset } from '../app/daily-reset.ts';

function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE rooms(code TEXT PRIMARY KEY,host_token_hash TEXT,invite_token_hash TEXT,tv_token_hash TEXT,playback_status TEXT,requests_open INTEGER,ends_at TEXT,completed_count INTEGER);
    CREATE TABLE queue_items(id INTEGER PRIMARY KEY,room_code TEXT,status TEXT);
    CREATE TABLE singer_stats(room_code TEXT,singer_key TEXT,sung_count INTEGER);
    CREATE TABLE current_room(id INTEGER PRIMARY KEY,code TEXT,invite_token TEXT,tv_token TEXT);
    INSERT INTO rooms VALUES('ACTIVE','host','invite','tv','playing',0,'last-call',8),('OLDER','old-host','old-invite','old-tv','paused',0,'old-last-call',3);
    INSERT INTO current_room VALUES(1,'ACTIVE','public-invite','public-tv');
    INSERT INTO queue_items VALUES(1,'ACTIVE','playing'),(2,'ACTIVE','pending'),(3,'OLDER','pending');
    INSERT INTO singer_stats VALUES('ACTIVE','jess',4),('OLDER','friend',3);`);
  const adapt=(fail=false)=>({
    prepare(query){return {query,values:[],bind(...values){this.values=values;return this;},async run(){const out=sql.prepare(query).run(...this.values);return {meta:{changes:Number(out.changes)}};}};},
    async batch(statements){
      sql.exec('BEGIN');
      try{const results=[];for(const statement of statements){if(fail&&statement.query.startsWith('UPDATE rooms'))throw Error('test failure');results.push(await statement.run());}sql.exec('COMMIT');return results;}
      catch(error){sql.exec('ROLLBACK');throw error;}
    },
  });
  return {sql,adapt};
}

test('installation preserves tonight; 3 AM clears only the active show and leaves QR credentials unchanged',async()=>{
  const {sql,adapt}=fixture();const db=adapt();
  const before=sql.prepare('SELECT * FROM current_room').get();
  assert.equal(await ensureDailyReset(db,Date.parse('2026-09-21T09:59:59.999Z')),false);
  assert.equal(sql.prepare('SELECT count(*) n FROM queue_items').get().n,3);
  assert.equal(await ensureDailyReset(db,Date.parse('2026-09-21T10:00:00Z')),true);
  assert.deepEqual(sql.prepare('SELECT * FROM current_room').get(),before);
  const room=sql.prepare("SELECT * FROM rooms WHERE code='ACTIVE'").get();
  assert.equal(room.playback_status,'idle');assert.equal(room.requests_open,1);assert.equal(room.ends_at,null);assert.equal(room.completed_count,0);
  assert.equal(room.host_token_hash,'host');assert.equal(room.invite_token_hash,'invite');assert.equal(room.tv_token_hash,'tv');
  assert.equal(sql.prepare("SELECT count(*) n FROM queue_items WHERE room_code='ACTIVE'").get().n,0);
  assert.equal(sql.prepare("SELECT count(*) n FROM singer_stats WHERE room_code='ACTIVE'").get().n,0);
  assert.equal(sql.prepare("SELECT count(*) n FROM queue_items WHERE room_code='OLDER'").get().n,1);
  assert.equal(sql.prepare("SELECT completed_count FROM rooms WHERE code='OLDER'").get().completed_count,3);
  assert.equal(sql.prepare("SELECT sung_count FROM singer_stats WHERE room_code='OLDER'").get().sung_count,3);
  sql.close();
});

test('a retry or second timezone cron cannot clear new songs after the daily reset',async()=>{
  const {sql,adapt}=fixture();
  await ensureDailyReset(adapt(),Date.parse('2026-09-21T10:00:00Z'));
  sql.exec("INSERT INTO queue_items VALUES(4,'ACTIVE','pending')");
  assert.equal(await ensureDailyReset(adapt(),Date.parse('2026-09-21T11:00:00Z')),false);
  assert.equal(sql.prepare("SELECT count(*) n FROM queue_items WHERE room_code='ACTIVE'").get().n,1);
  sql.close();
});

test('an offline show catches up once before its next room request',async()=>{
  const {sql,adapt}=fixture();
  assert.equal(await ensureDailyReset(adapt(),Date.parse('2026-09-23T19:00:00Z')),true);
  assert.equal(sql.prepare("SELECT count(*) n FROM queue_items WHERE room_code='ACTIVE'").get().n,0);
  sql.close();
});

test('a failed reset rolls back deleted songs and retries safely',async()=>{
  const {sql,adapt}=fixture();const now=Date.parse('2026-09-21T10:00:00Z');
  await assert.rejects(ensureDailyReset(adapt(true),now),/test failure/);
  assert.equal(sql.prepare("SELECT count(*) n FROM queue_items WHERE room_code='ACTIVE'").get().n,2);
  assert.equal(sql.prepare('SELECT night FROM daily_reset').get().night,'2026-09-20');
  assert.equal(await ensureDailyReset(adapt(),now),true);
  sql.close();
});

test('winter 2 AM UTC candidate does not clear early; winter 3 AM does',async()=>{
  const {sql,adapt}=fixture();
  sql.exec("CREATE TABLE daily_reset(id INTEGER PRIMARY KEY,night TEXT,reset_at TEXT); INSERT INTO daily_reset VALUES(1,'2026-12-01',NULL)");
  assert.equal(await ensureDailyReset(adapt(),Date.parse('2026-12-02T10:00:00Z')),false);
  assert.equal(await ensureDailyReset(adapt(),Date.parse('2026-12-02T11:00:00Z')),true);
  sql.close();
});
