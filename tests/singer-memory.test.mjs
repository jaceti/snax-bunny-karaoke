import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SINGER_MEMORY_KEY, singerNight, nextSingerReset, readSingerIdentity, rememberSinger } from '../app/singer-memory.ts';
const at=value=>Date.parse(value);
function storage(){const map=new Map();return {map,getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};}

test('reloading, rescanning, and another tab retain the first name for the night',()=>{
  const saved=storage();
  const start=at('2026-09-21T02:00:00Z'); // 7 PM Pacific
  assert.equal(rememberSinger(saved,'  Jess  ',start).identity.name,'Jess');
  assert.equal(readSingerIdentity(saved,start+1000).name,'Jess');
  assert.equal(rememberSinger(saved,'Another name',start+2000).identity.name,'Jess');
  assert.equal(readSingerIdentity(saved,at('2026-09-21T09:59:59.999Z')).name,'Jess');
});

test('identity resets exactly at 3 AM Pacific, not midnight',()=>{
  const saved=storage();
  const start=at('2026-09-21T02:00:00Z');
  rememberSinger(saved,'Jess',start);
  assert.equal(singerNight(start),'2026-09-20');
  assert.equal(nextSingerReset(start),at('2026-09-21T10:00:00Z'));
  assert.equal(readSingerIdentity(saved,at('2026-09-21T07:00:00Z')).name,'Jess');
  assert.equal(readSingerIdentity(saved,at('2026-09-21T10:00:00Z')),null);
  assert.equal(saved.map.has(SINGER_MEMORY_KEY),false);
  assert.equal(rememberSinger(saved,'New night name',at('2026-09-21T10:00:00Z')).identity.name,'New night name');
});

test('spring-forward reset stays at 3 AM, even on the 23-hour night',()=>{
  const start=at('2026-03-07T11:00:00Z');
  const reset=at('2026-03-08T10:00:00Z');
  assert.equal(nextSingerReset(start),reset);
  assert.equal(singerNight(reset-1),'2026-03-07');
  assert.equal(singerNight(reset),'2026-03-08');
});

test('fall-back repeated hour does not reset early on the 25-hour night',()=>{
  const start=at('2026-10-31T10:00:00Z');
  const reset=at('2026-11-01T11:00:00Z');
  assert.equal(nextSingerReset(start),reset);
  for(const instant of ['2026-11-01T08:30:00Z','2026-11-01T09:30:00Z'])assert.equal(singerNight(at(instant)),'2026-10-31');
  assert.equal(singerNight(reset),'2026-11-01');
});

test('expired names after a sleeping/closed browser never restore, and host credentials survive',()=>{
  const saved=storage();saved.setItem('snax-host-ABC123','host-secret');saved.setItem('snax-consent','1');
  rememberSinger(saved,'Jess',at('2026-09-21T02:00:00Z'));
  assert.equal(readSingerIdentity(saved,at('2026-09-22T02:00:00Z')),null);
  assert.equal(saved.getItem('snax-host-ABC123'),'host-secret');
  assert.equal(saved.getItem('snax-consent'),'1');
});

test('corrupt storage is ignored and blocked storage supports a tab-local fallback',()=>{
  const saved=storage();saved.setItem(SINGER_MEMORY_KEY,'not json');
  assert.equal(readSingerIdentity(saved),null);
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  assert.equal(readSingerIdentity(blocked),null);
  assert.equal(rememberSinger(blocked,'Jess').persisted,false);
  assert.equal(rememberSinger(null,'Jess').identity.name,'Jess');
  assert.throws(()=>rememberSinger(saved,'   '),/stage name/);
});
