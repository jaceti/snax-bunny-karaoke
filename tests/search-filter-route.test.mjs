import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import * as ranking from '../app/api/search/ranking.ts';

test('search route excludes vocals and blocked embeds, preserves karaoke and uses only two API calls',async()=>{
  const tracks=[
    ['zoom','Karaoke Lyrics','UCrk8mp-ugqtAbjif6JARjlw',true],
    ['karafun','Karaoke Lyrics','UCbqcG1rdt9LMwOJN4PyGTKg',true],
    ['party','Karaoke Lyrics','UCWLqO9ztz16a_Ko4YB9PnFQ',true],
    ['sunfly','Karaoke Lyrics','UCcKX_cqJR4RwW5dxeqHbseQ',true],
    ['caritas','Karaoke Lyrics','UC49S5ro4yX1fR0DRnf0Adwg',true],
    ['guide','Karaoke With Guide Vocals','UCbqcG1rdt9LMwOJN4PyGTKg',true],
    ['lyric','Official Lyric Video','other',true],
    ['blocked','Karaoke Lyrics','UCbqcG1rdt9LMwOJN4PyGTKg',false],
    ['silent','No Lead Vocals Karaoke Lyrics','other',true],
  ].map(([id,suffix,channelId,embeddable])=>({id,snippet:{title:`ABBA Dancing Queen ${suffix}`,channelId,channelTitle:ranking.PREFERRED_CHANNELS.get(channelId)||'Other',thumbnails:{}},status:{embeddable,privacyStatus:'public',uploadStatus:'processed'},contentDetails:{definition:'hd'}}));
  const calls=[];
  const fakeFetch=async input=>{
    const url=new URL(input);calls.push(url.pathname);
    return Response.json({items:url.pathname.endsWith('/search')?tracks.map(t=>({id:{videoId:t.id},snippet:t.snippet})):tracks});
  };
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('test-invite'))).toString('hex');
  const env={DB:{prepare:()=>({bind:()=>({first:async()=>({invite_token_hash:hash})})})},YOUTUBE_API_KEY:'test-only'};
  const code=ts.transpileModule(readFileSync(new URL('../app/api/search/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{}};
  new Function('require','module','exports','fetch',code)(name=>name==='cloudflare:workers'?{env}:ranking,mod,mod.exports,fakeFetch);
  const response=await mod.exports.GET(new Request('https://example.test/api/search?q=ABBA%20Dancing%20Queen',{headers:{'x-room-code':'ROOM','x-room-invite':'test-invite'}}));
  assert.equal(response.status,200);
  const {results}=await response.json();
  assert.deepEqual(new Set(results.map(t=>t.videoId)),new Set(['zoom','karafun','party','sunfly','caritas','silent']));
  assert.equal(results[0].videoId,'zoom');
  assert.deepEqual(calls,['/youtube/v3/search','/youtube/v3/videos']);
});
