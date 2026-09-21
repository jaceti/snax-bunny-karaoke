import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WheelAudio,drumrollSamples,drumrollHitTimes,cymbalSamples,CYMBAL_DURATION } from '../app/wheel-audio.ts';

function audioFixture(t){
  t.mock.timers.enable({apis:['setTimeout','Date'],now:1000});
  const spoken=[],sources=[];
  const param={setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}};
  class Context{
    state='running';currentTime=0;destination={};async resume(){}async close(){}
    createBuffer(){return {copyToChannel(){}};}
    async decodeAudioData(){return {recordedWow:true};}
    createBufferSource(){const node={connect(){},start(...args){this.args=args;},stop(){this.stopped=true;}};sources.push(node);return node;}
    createGain(){return {gain:{...param},connect(){}};}
    createOscillator(){return {frequency:param,connect(){},start(){},stop(){}};}
  }
  const original={window:globalThis.window,AudioContext:globalThis.AudioContext,SpeechSynthesisUtterance:globalThis.SpeechSynthesisUtterance};
  globalThis.AudioContext=Context;globalThis.SpeechSynthesisUtterance=class{constructor(text){this.text=text;}};
  globalThis.window={speechSynthesis:{getVoices:()=>[],speak:word=>spoken.push(word),cancel(){}}};
  return {spoken,sources,Context,restore:()=>Object.assign(globalThis,original)};
}
const wheel={id:'spin-1',phase:'spinning',startedAt:1000,endsAt:8000,entries:[],winnerIndex:0,rotation:2200};

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
  t.mock.method(globalThis,'fetch',async url=>{assert.equal(url,'/snax-wheel-wow.mp3');return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};});
  audio.sync(wheel,1000);await audio.unlock();await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(sources.length,1);t.mock.timers.tick(7000);
  assert.equal(sources.length,2);assert.equal(sources[1].buffer.recordedWow,undefined);
  audio.sync({...wheel,phase:'winner'},8000);t.mock.timers.tick(CYMBAL_DURATION*1000);
  assert.equal(sources.length,3);assert.equal(sources[2].buffer.recordedWow,true);assert.equal(spoken.length,0);
  audio.sync({...wheel,phase:'winner'},8650);assert.equal(sources.length,3);
  audio.sync(null,8650);assert.equal(sources[2].stopped,true);
});
test('closing during the cymbal cancels the subsequent wow',async t=>{
  const {spoken,sources,restore}=audioFixture(t);const audio=new WheelAudio(()=>{});t.after(()=>{audio.dispose();restore();});
  audio.sync(wheel,1000);await audio.unlock();t.mock.timers.tick(7000);assert.equal(sources.length,2);
  audio.sync(null,8000);assert.equal(sources[1].stopped,true);t.mock.timers.tick(1000);assert.equal(spoken.length,0);
});
