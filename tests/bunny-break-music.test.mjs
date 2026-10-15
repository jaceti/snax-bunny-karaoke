import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {BunnyBreakMusic,BUNNY_BREAK_TRACKS} from '../app/bunny-break-music.ts';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function context(){
  const sources=[],gains=[];
  return {state:'running',destination:{},sources,gains,
    async decodeAudioData(bytes){return {tag:new Uint8Array(bytes)[0],duration:240};},
    createBufferSource(){const source={loop:null,onended:null,connect(){},disconnect(){this.disconnected=true;},start(...args){this.args=args;},stop(){this.stopped=true;}};sources.push(source);return source;},
    createGain(){const gain={gain:{value:0},connect(){},disconnect(){this.disconnected=true;}};gains.push(gain);return gain;}};
}
test('four original full recordings exist, in requested order, without turkey sound',()=>{
  assert.deepEqual(BUNNY_BREAK_TRACKS.map(t=>t.title),['Axel F','Oh Yeah','Popcorn','Love on a Real Train']);
  for(const track of BUNNY_BREAK_TRACKS){const file=new URL(`../public${track.src}`,import.meta.url);assert.ok(existsSync(file));assert.ok(readFileSync(file).length>2_000_000);}
});
test('break music plays full songs sequentially and wraps; polls never restart or overlap; exit stops sound',async t=>{
  t.mock.method(globalThis,'fetch',async src=>({ok:true,arrayBuffer:async()=>Uint8Array.of(BUNNY_BREAK_TRACKS.findIndex(track=>track.src===src)+1).buffer}));
  const ctx=context(),music=new BunnyBreakMusic();music.prepare(ctx);music.sync('break-1',false);await flush();assert.equal(ctx.sources.length,0);
  music.sync('break-1',true);await flush();
  for(let i=0;i<6;i++){
    const source=ctx.sources.at(-1);assert.equal(source.buffer.tag,i%4+1);assert.equal(source.loop,false);assert.deepEqual(source.args,[],'no time limit, offset, or excerpt');
    for(let poll=0;poll<5;poll++)music.sync('break-1',true);
    await flush();assert.equal(ctx.sources.length,i+1);
    if(i<5){source.onended();await flush();}
  }
  const last=ctx.sources.at(-1);music.sync(null,false);assert.equal(last.stopped,true);assert.equal(last.onended,null);assert.equal(ctx.gains.at(-1).disconnected,true);
  await flush();assert.equal(ctx.sources.length,6);
  music.sync('break-2',true);await flush();assert.equal(ctx.sources.at(-1).buffer.tag,1);music.dispose();
});
test('blocked audio resumes after TV activation; delayed download cannot restart a cancelled break',async t=>{
  let resolveFetch;
  t.mock.method(globalThis,'fetch',()=>new Promise(resolve=>{resolveFetch=resolve;}));
  const ctx=context(),music=new BunnyBreakMusic([BUNNY_BREAK_TRACKS[0]]);ctx.state='suspended';music.prepare(ctx);music.sync('break',true);
  assert.equal(ctx.sources.length,0);ctx.state='running';music.resume();music.sync(null,false);
  resolveFetch({ok:true,arrayBuffer:async()=>Uint8Array.of(1).buffer});await flush();assert.equal(ctx.sources.length,0);
  music.sync('next-break',true);await flush();assert.equal(ctx.sources.length,1);music.dispose();assert.equal(ctx.sources[0].stopped,true);
});
test('transient audio download failure retries without advancing past a song',async t=>{
  let count=0;t.mock.method(globalThis,'fetch',async()=>({ok:++count>1,arrayBuffer:async()=>Uint8Array.of(1).buffer}));
  const ctx=context(),music=new BunnyBreakMusic([BUNNY_BREAK_TRACKS[0]]);music.prepare(ctx);music.sync('break',true);await flush();assert.equal(ctx.sources.length,0);
  music.sync('break',true);await flush();assert.equal(ctx.sources.length,1);assert.equal(ctx.sources[0].buffer.tag,1);music.dispose();
});
