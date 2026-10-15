import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GOBBLE_TRACKS,GOBBLE_SPIN} from '../app/gobble-music.ts';
import {TrackBag} from '../app/interlude-music.ts';
test('Gobble Wheel has exactly the three supplied music interludes, separate from spin and spooky tracks',()=>{
  assert.equal(GOBBLE_TRACKS.length,3);assert.equal(new Set(GOBBLE_TRACKS).size,3);assert.ok(!GOBBLE_TRACKS.includes(GOBBLE_SPIN));
  for(const url of [...GOBBLE_TRACKS,GOBBLE_SPIN]){assert.match(url,/^\/gobble-music\//);assert.ok(readFileSync(new URL(`../public${url}`,import.meta.url)).length>40_000);}
});
test('winner shuffle is random across seeds and never repeats until the three Gobble tracks are exhausted',()=>{
  const first=new Set();
  for(let seed=0;seed<30;seed++){
    let value=Math.imul(seed+1,0x9e3779b9)>>>0;const bag=new TrackBag(GOBBLE_TRACKS,()=>{value=(value*1664525+1013904223)>>>0;return value/4294967296;});
    const cycle=[bag.next(),bag.next(),bag.next()];assert.equal(new Set(cycle).size,3);first.add(cycle[0]);assert.notEqual(bag.next(),cycle[2]);
  }
  assert.ok(first.size>1);
});
