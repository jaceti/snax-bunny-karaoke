import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GOBBLE_CALLS,gobbleMixFilter} from '../scripts/gobble-spin-mix.mjs';
test('gobble mix layers both recordings with irregular timing and gentle voice variation',()=>{
  assert.deepEqual([...new Set(GOBBLE_CALLS.map(c=>c[1]))].sort(),[0,1]);
  assert.ok(new Set(GOBBLE_CALLS.map(c=>c[2])).size>5);
  const intervals=GOBBLE_CALLS.slice(1).map((c,i)=>c[0]-GOBBLE_CALLS[i][0]);
  assert.ok(new Set(intervals.map(n=>n.toFixed(2))).size>5);
  GOBBLE_CALLS.forEach(([delay,,pitch,volume,pan],i)=>{
    assert.ok(pitch>=.88&&pitch<=1.12);assert.ok(volume>0&&volume<=1);assert.ok(Math.abs(pan)<=.25);
    if(i)assert.ok(delay<GOBBLE_CALLS[i-1][0]+.93/GOBBLE_CALLS[i-1][2]);
  });
  const filter=gobbleMixFilter();
  assert.match(filter,/atrim=duration=7/);assert.match(filter,/loudnorm=I=-20:TP=-2/);
  assert.match(filter,/afade=t=out:st=6.94:d=0.06/);assert.doesNotMatch(filter,/aloop/);
});
