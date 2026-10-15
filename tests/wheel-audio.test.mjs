import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WheelAudio,drumrollSamples,drumrollHitTimes,cymbalSamples,CYMBAL_DURATION } from '../app/wheel-audio.ts';
import {GOBBLE_TRACKS,GOBBLE_SPIN} from '../app/gobble-music.ts';

function audioFixture(t){
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const spoken=[],sources=[];
  const param={setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}};
  class Context{
    state='running';currentTime=0;destination={};async resume(){}async close(){}
    createBuffer(){return {copyToChannel(){}};}
    async decodeAudioData(bytes){return {tag:new Uint8Array(bytes)[0],recordedWow:new Uint8Array(bytes)[0]===1,recordedDrum:new Uint8Array(bytes)[0]===2};}
    createBufferSource(){const node={connect(){},disconnect(){},start(...args){this.args=args;},stop(){this.stopped=true;}};sources.push(node);return node;}
    createGain(){return {gain:{...param},connect(){},disconnect(){}};}
    createOscillator(){return {frequency:param,connect(){},start(){},stop(){}};}
  }
  const original={window:globalThis.window,AudioContext:globalThis.AudioContext,SpeechSynthesisUtterance:globalThis.SpeechSynthesisUtterance};
  globalThis.AudioContext=Context;globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  globalThis.window={speechSynthesis:{getVoices:()=>[],speak:word=>spoken.push(word),cancel(){}}};
  return {spoken,sources,Context,restore:()=>Object.assign(globalThis,original)};
}
const wheel={id:'spin-1',phase:'spinning',startedAt:1000,endsAt:8000,entries:[],winnerIndex:0,rotation:2200};

test('Gobble Wheel uses continuous turkey sound, ends on landing, then shuffles only its three winner tracks',async t=>{
  const {sources,spoken,restore}=audioFixture(t);const audio=new WheelAudio(()=>{});t.after(()=>{audio.dispose();restore();});
  const settle=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
  t.mock.method(globalThis,'fetch',async url=>({ok:true,arrayBuffer:async()=>Uint8Array.of(url===GOBBLE_SPIN?99:GOBBLE_TRACKS.includes(url)?GOBBLE_TRACKS.indexOf(url)+10:1).buffer}));
  const selected=[];
  for(let i=0;i<3;i++){
    const now=Date.now(),spin={...wheel,id:`gobble-${i}`,theme:'gobble',startedAt:now,endsAt:now+7000};
    audio.sync({...spin,phase:'ready',startedAt:null,endsAt:null},now);await settle();const prior=sources.length;
    audio.sync(spin,now);await settle();const gobble=sources.at(-1);assert.equal(gobble.buffer.tag,99);assert.deepEqual(gobble.args,[0,0]);assert.equal(sources.length,prior+1);
    t.mock.timers.tick(6999);assert.equal(sources.length,prior+1);
    t.mock.timers.tick(1);await settle();assert.equal(sources.length,prior+2);assert.equal(gobble.stopped,true);
    const music=sources.at(-1);assert.equal(music.loop,true);assert.ok([10,11,12].includes(music.buffer.tag));selected.push(music.buffer.tag);
    audio.sync({...spin,phase:'winner'},Date.now());audio.land(spin.id);await settle();assert.equal(sources.length,prior+2);
    audio.sync(null,Date.now());assert.equal(music.stopped,true);
  }
  assert.equal(new Set(selected).size,3);assert.equal(spoken.length,0);
});
test('slow gobble loading cannot delay winner music or play turkey sound after landing',async t=>{
  const {sources,restore}=audioFixture(t);const audio=new WheelAudio(()=>{});t.after(()=>{audio.dispose();restore();});let release;
  t.mock.method(globalThis,'fetch',url=>url===GOBBLE_SPIN?new Promise(resolve=>{release=resolve;}):Promise.resolve({ok:true,arrayBuffer:async()=>Uint8Array.of(10).buffer}));
  audio.sync({...wheel,theme:'gobble'},1000);for(let i=0;i<25;i++)await Promise.resolve();
  t.mock.timers.tick(7000);for(let i=0;i<25;i++)await Promise.resolve();assert.equal(sources.length,1);assert.equal(sources[0].loop,true);
  release({ok:true,arrayBuffer:async()=>Uint8Array.of(99).buffer});for(let i=0;i<25;i++)await Promise.resolve();assert.equal(sources.length,1);
});

test('TV audio integration keeps pending break silent, plays active break through polls, and stops on exit',async t=>{
  const {sources,restore}=audioFixture(t);const audio=new WheelAudio(()=>{});t.after(()=>{audio.dispose();restore();});
  t.mock.method(globalThis,'fetch',async()=>({ok:true,arrayBuffer:async()=>Uint8Array.of(9).buffer}));
  audio.bunnyBreak({id:'break-1',phase:'pending'});await audio.unlock();for(let i=0;i<12;i++)await Promise.resolve();assert.equal(sources.length,0);
  audio.sync(null,1000);audio.interlude(false,'undefined');audio.bunnyBreak({id:'break-1',phase:'active'});
  for(let i=0;i<12;i++)await Promise.resolve();assert.equal(sources.length,1);
  for(let poll=0;poll<5;poll++){audio.sync(null,1000);audio.bunnyBreak({id:'break-1',phase:'active'});}
  assert.equal(sources.length,1);assert.notEqual(sources[0].stopped,true);
  audio.bunnyBreak(null);assert.equal(sources[0].stopped,true);
});

test('drumroll lasts seven seconds with safe sample levels',()=>{
  const samples=drumrollSamples();assert.equal(samples.length,7*22050);
  let peak=0;for(const value of samples)peak=Math.max(peak,Math.abs(value));assert.ok(peak>0);assert.ok(peak<1);
});
test('traditional snare stays at a constant tempo; cymbal is finite and unclipped',()=>{
  const hits=drumrollHitTimes();assert.equal(hits.length,7*28);
  for(let i=0;i<hits.length-1;i++)assert.ok(Math.abs((hits[i+1]-hits[i])-1/28)<1e-10);
  const samples=cymbalSamples();assert.equal(samples.length,Math.ceil(22050*CYMBAL_DURATION));
  let peak=0;for(const value of samples)peak=Math.max(peak,Math.abs(value));assert.ok(peak>0&&peak<1);
});
test('a host-triggered spin starts TV sounds automatically when autoplay is allowed',async t=>{
  const {sources,restore}=audioFixture(t);const enabled=[];const audio=new WheelAudio(value=>enabled.push(value));t.after(()=>{audio.dispose();restore();});
  audio.sync(wheel,1000);await Promise.resolve();assert.equal(sources.length,1);assert.equal(enabled.at(-1),true);
  audio.sync(wheel,1000);assert.equal(sources.length,1);
});
test('a browser-blocked context starts at the correct point after activation',async t=>{
  const {sources,Context,restore}=audioFixture(t);let context;
  globalThis.AudioContext=class extends Context{constructor(){super();this.state='suspended';context=this;}};
  const audio=new WheelAudio(()=>{});t.after(()=>{audio.dispose();restore();});
  audio.sync(wheel,1000);await Promise.resolve();assert.equal(sources.length,0);
  t.mock.timers.tick(2000);context.state='running';context.onstatechange();
  assert.equal(sources.length,1);assert.equal(sources[0].args[1],2);
});
test('drumroll stops at landing, then cymbal crash, then exactly one wow',async t=>{
  const {spoken,sources,restore}=audioFixture(t);const audio=new WheelAudio(()=>{});t.after(()=>{audio.dispose();restore();});
  audio.sync(wheel,1000);await audio.unlock();assert.equal(sources.length,1);assert.equal(spoken.length,0);
  t.mock.timers.tick(6999);assert.equal(spoken.length,0);
  t.mock.timers.tick(1);assert.equal(spoken.length,0);assert.equal(sources.length,2);assert.equal(sources[0].stopped,true);
  t.mock.timers.tick(CYMBAL_DURATION*1000-1);assert.equal(spoken.length,0);
  t.mock.timers.tick(1);assert.equal(spoken.length,1);assert.equal(spoken[0].pitch,2);assert.ok(spoken[0].rate<1);assert.match(spoken[0].text,/Wow|Wooooow/);
  audio.sync({...wheel,phase:'winner'},8000);audio.sync({...wheel,phase:'winner'},8000);assert.equal(spoken.length,1);
});
test('reopening a finished result is silent and closing cancels a pending reveal',async t=>{
  const {spoken,restore}=audioFixture(t);const audio=new WheelAudio(()=>{});t.after(()=>{audio.dispose();restore();});
  audio.sync({...wheel,phase:'winner'},9000);await audio.unlock();assert.equal(spoken.length,0);
  audio.sync({...wheel,id:'spin-2'},1000);audio.sync(null,1000);t.mock.timers.tick(8000);assert.equal(spoken.length,0);
});
test('the combined recording replaces browser speech and follows the cymbal once',async t=>{
  const {spoken,sources,restore}=audioFixture(t);const audio=new WheelAudio(()=>{});t.after(()=>{audio.dispose();restore();});
  t.mock.method(globalThis,'fetch',async url=>{assert.match(url,/^\/(snax-wheel-(wow|drumroll-v2|winner)|spooky-music\/interlude-\d{2})\.mp3$/);return {ok:true,arrayBuffer:async()=>new Uint8Array([url.includes('wow')?1:url.includes('drumroll')?2:url.includes('winner')?3:4]).buffer};});
  await audio.unlock();for(let i=0;i<6;i++)await Promise.resolve();audio.sync(wheel,1000);
  assert.equal(sources.length,1);assert.equal(sources[0].buffer.recordedDrum,true);t.mock.timers.tick(7000);
  // Landing: the Bumbersnax winner track starts, then the cymbal.
  assert.equal(sources.length,3);assert.equal(sources[1].buffer.recordedWow,false);assert.equal(sources[1].buffer.recordedDrum,false);assert.equal(sources[2].buffer.recordedWow,undefined);
  audio.sync({...wheel,phase:'winner'},8000);t.mock.timers.tick(CYMBAL_DURATION*1000);
  assert.equal(sources.length,4);assert.equal(sources[3].buffer.recordedWow,true);assert.equal(spoken.length,0);
  audio.sync({...wheel,phase:'winner'},8650);assert.equal(sources.length,4);
  audio.sync(null,8650);assert.equal(sources[3].stopped,true);assert.equal(sources[1].stopped,true);
});
test('closing during the cymbal cancels the subsequent wow',async t=>{
  const {spoken,sources,restore}=audioFixture(t);const audio=new WheelAudio(()=>{});t.after(()=>{audio.dispose();restore();});
  audio.sync(wheel,1000);await audio.unlock();t.mock.timers.tick(7000);assert.equal(sources.length,2);
  audio.sync(null,8000);assert.equal(sources[1].stopped,true);t.mock.timers.tick(1000);assert.equal(spoken.length,0);
});
test('polling jitter cannot prolong a spin; a visual landing stops the drum immediately',async t=>{
  const {sources,restore}=audioFixture(t);const audio=new WheelAudio(()=>{});t.after(()=>{audio.dispose();restore();});
  audio.sync(wheel,1000);await audio.unlock();t.mock.timers.tick(3000);
  audio.sync(wheel,3500); // A delayed server snapshot must not move the clock.
  t.mock.timers.tick(3900);audio.land(wheel.id);
  assert.equal(sources[0].stopped,true);assert.equal(sources.length,2);
  t.mock.timers.tick(100);audio.sync({...wheel,phase:'winner'},8000);assert.equal(sources.length,2);
});
test('authoritative winner update stops audio even before the local timer fires',async t=>{
  const {sources,restore}=audioFixture(t);const audio=new WheelAudio(()=>{});t.after(()=>{audio.dispose();restore();});
  audio.sync(wheel,1000);await audio.unlock();t.mock.timers.tick(6500);
  audio.sync({...wheel,phase:'winner'},8000);assert.equal(sources[0].stopped,true);assert.equal(sources.length,2);
});

test('spooky reveal uses supplied music while preserving cymbal/wow and stops on close',async t=>{
  const {sources,restore}=audioFixture(t);const audio=new WheelAudio(()=>{});t.after(()=>{audio.dispose();restore();});
  t.mock.method(globalThis,'fetch',async url=>({ok:true,arrayBuffer:async()=>new Uint8Array([url.includes('wow')?1:url.includes('drumroll')?2:url.includes('winner')?3:4]).buffer}));
  audio.sync({...wheel,theme:'spooky'},1000);await audio.unlock();for(let i=0;i<12;i++)await Promise.resolve();
  t.mock.timers.tick(7000);for(let i=0;i<12;i++)await Promise.resolve();
  const music=sources.find(source=>source.loop);assert.ok(music);assert.equal(music.started,undefined);assert.ok(music.args);
  audio.interlude(false,'one');assert.notEqual(music.stopped,true);
  audio.sync(null,8000);assert.equal(music.stopped,true);
});
