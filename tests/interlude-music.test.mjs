import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {TrackBag,InterludeMusic,INTERLUDE_TRACKS} from '../app/interlude-music.ts';

const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function fixture(t,{delayed=false}={}){
  const sources=[],requests=[],resolvers=[];
  const ctx={state:'running',currentTime:0,destination:{},decodeAudioData:async bytes=>({bytes}),
    createBufferSource(){const source={connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};sources.push(source);return source;},
    createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};}};
  t.mock.method(globalThis,'fetch',url=>{requests.push(url);const response={ok:true,arrayBuffer:async()=>new ArrayBuffer(1)};return delayed?new Promise(resolve=>resolvers.push(()=>resolve(response))):Promise.resolve(response);});
  const music=new InterludeMusic();music.prepare(ctx);t.after(()=>music.dispose());
  return {music,ctx,sources,requests,resolvers};
}
test('all 27 supplied clips exist and shuffle without repeats until the library is exhausted',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../public/spooky-music/manifest.json',import.meta.url)));
  assert.equal(manifest.length,27);
  for(const track of INTERLUDE_TRACKS)assert.ok(statSync(new URL('../public'+track,import.meta.url)).size>1000);
  const bag=new TrackBag(INTERLUDE_TRACKS,()=>.5);let previous;
  for(let round=0;round<4;round++){
    const cycle=Array.from({length:27},()=>bag.next());assert.equal(new Set(cycle).size,27);assert.notEqual(previous,cycle[0]);previous=cycle.at(-1);
  }
});
test('prefetches only one clip; repeated room polls do not restart it; next singer uses another clip',async t=>{
  const {music,sources,requests}=fixture(t);await flush();assert.equal(requests.length,1);
  music.set(true,'singer-1');await flush();assert.equal(sources.length,1);assert.equal(requests.length,2);
  const first=sources[0].buffer;music.set(true,'singer-1');await flush();assert.equal(sources.length,1);
  music.set(false,'singer-1');assert.equal(sources[0].stopped,true);
  music.set(true,'singer-2');await flush();assert.equal(sources.length,2);assert.notEqual(sources[1].buffer,first);
});
test('host pause immediately stops music; resume reuses the same song clip',async t=>{
  const {music,sources}=fixture(t);music.set(true,'one');await flush();const buffer=sources[0].buffer;
  music.set(false,'one');assert.equal(sources[0].stopped,true);
  music.set(true,'one');await flush();assert.equal(sources[1].buffer,buffer);
});
test('late loading never starts music after a name card closes',async t=>{
  const {music,sources,resolvers}=fixture(t,{delayed:true});music.set(true,'one');music.set(false,'one');
  resolvers.forEach(resolve=>resolve());await flush();assert.equal(sources.length,0);
});
test('browser unlock retries the current card, but never a card that has ended',async t=>{
  const {music,sources,ctx}=fixture(t);ctx.state='suspended';music.set(true,'one');await flush();assert.equal(sources.length,0);
  ctx.state='running';music.resume();await flush();assert.equal(sources.length,1);
  music.set(false,'one');music.resume();await flush();assert.equal(sources.length,1);
});
test('leaving the TV stops audio and invalidates pending loads',async t=>{
  const {music,sources}=fixture(t);music.set(true,'one');await flush();music.dispose();assert.equal(sources[0].stopped,true);
  music.set(true,'two');music.resume();await flush();assert.equal(sources.length,1);
});
