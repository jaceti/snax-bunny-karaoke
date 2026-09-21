import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wheelConfetti} from '../app/wheel-confetti.ts';
import {wheelEase} from '../app/wheel-model.ts';
test('confetti uses independently scattered positions, speeds, sizes and drift',()=>{
  const pieces=wheelConfetti('test-wheel');assert.equal(pieces.length,160);
  for(const key of ['x','y','duration','delay','drift','sway','size'])assert.equal(new Set(pieces.map(p=>p[key])).size,160,key);
  assert.equal(new Set(pieces.map(p=>p.color)).size,7);assert.equal(new Set(pieces.map(p=>p.shape)).size,3);
  assert.ok(pieces.some(p=>p.drift<0)&&pieces.some(p=>p.drift>0));
  assert.deepEqual(wheelConfetti('test-wheel'),pieces);assert.notDeepEqual(wheelConfetti('another-wheel'),pieces);
});
test('wheel remains visibly in motion near landing and ends exactly on target',()=>{
  assert.equal(wheelEase(0),0);assert.equal(wheelEase(1),1);
  assert.ok((1-wheelEase(.9))*2300>20);assert.ok(wheelEase(.99)<1);
});
