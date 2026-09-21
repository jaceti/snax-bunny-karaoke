import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WheelAudio,drumrollSamples } from '../app/wheel-audio.ts';

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
  return {spoken,sources,restore:()=>Object.assign(globalThis,original)};
}
const wheel={id:'spin-1',phase:'spinning',startedAt:1000,endsAt:8000,entries:[],winnerIndex:0,rotation:2200};

test('drumroll lasts seven seconds with safe sample levels',()=>{
  const samples=drumrollSamples();assert.equal(samples.length,7*22050);
  let peak=0;for(const value of samples)peak=Math.max(peak,Math.abs(value));assert.ok(peak>0);assert.ok(peak<1);
});
test('drumroll runs during spin; slow high-pitched wow happens only once at landing',async t=>{
  const {spoken,sources,restore}=audioFixture(t);const audio=new WheelAudio(()=>{});t.after(()=>{audio.dispose();restore();});
  audio.sync(wheel,1000);await audio.unlock();assert.equal(sources.length,1);assert.equal(spoken.length,0);
  t.mock.timers.tick(6999);assert.equal(spoken.length,0);
  t.mock.timers.tick(1);assert.equal(spoken.length,1);assert.equal(spoken[0].pitch,2);assert.ok(spoken[0].rate<1);assert.match(spoken[0].text,/Wow|Wooooow/);
  audio.sync({...wheel,phase:'winner'},8000);audio.sync({...wheel,phase:'winner'},8000);assert.equal(spoken.length,1);
});
test('reopening a finished result is silent and closing cancels a pending reveal',async t=>{
  const {spoken,restore}=audioFixture(t);const audio=new WheelAudio(()=>{});t.after(()=>{audio.dispose();restore();});
  audio.sync({...wheel,phase:'winner'},9000);await audio.unlock();assert.equal(spoken.length,0);
  audio.sync({...wheel,id:'spin-2'},1000);audio.sync(null,1000);t.mock.timers.tick(8000);assert.equal(spoken.length,0);
});
test('the combined recording replaces browser speech and plays once at landing',async t=>{
  const {spoken,sources,restore}=audioFixture(t);const audio=new WheelAudio(()=>{});t.after(()=>{audio.dispose();restore();});
  t.mock.method(globalThis,'fetch',async url=>{assert.equal(url,'/snax-wheel-wow.mp3');return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};});
  audio.sync(wheel,1000);await audio.unlock();await Promise.resolve();await Promise.resolve();await Promise.resolve();
  assert.equal(sources.length,1);t.mock.timers.tick(7000);
  assert.equal(sources.length,2);assert.equal(sources[1].buffer.recordedWow,true);assert.equal(spoken.length,0);
  audio.sync({...wheel,phase:'winner'},8000);assert.equal(sources.length,2);
  audio.sync(null,8000);assert.equal(sources[1].stopped,true);
});
