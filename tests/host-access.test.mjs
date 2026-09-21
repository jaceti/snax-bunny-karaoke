import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostShareLink, acceptHostInvite } from '../app/host-access.ts';

test('private host QR is stable and keeps the secret out of server URLs',()=>{
  const link=hostShareLink('https://example.com','ABC123','private-token');
  assert.equal(link,hostShareLink('https://example.com','ABC123','private-token'));
  const url=new URL(link);
  assert.equal(url.searchParams.get('host'),'ABC123');
  assert.equal(url.search.includes('private-token'),false);
  assert.equal(new URLSearchParams(url.hash.slice(1)).get('hostKey'),'private-token');
  assert.equal(hostShareLink('https://example.com','ABC123',''),'');
});

test('scanning the host QR grants another browser access to the same room without creating a room',async()=>{
  const stored=new Map();
  const storage={setItem:(key,value)=>stored.set(key,value)};
  const url=new URL(hostShareLink('https://example.com','ABC123','private-token'));
  await acceptHostInvite(url.searchParams.get('host'),new URLSearchParams(url.hash.slice(1)).get('hostKey'),storage,async(path,options)=>{
    assert.equal(path,'/api/rooms/ABC123');
    assert.equal(options.method,undefined); // GET only; no room/queue mutation.
    assert.deepEqual(options.headers,{'x-host-token':'private-token'});
    return new Response('{}',{status:200});
  });
  assert.equal(stored.get('snax-host-ABC123'),'private-token');
});

test('an invalid or public singer token never replaces saved host access',async()=>{
  for(const status of [403,404,500]){
    let writes=0;
    await assert.rejects(acceptHostInvite('ABC123','not-a-host-token',{setItem(){writes++;}},async()=>new Response('{}',{status})),/could not be verified/);
    assert.equal(writes,0);
  }
});
