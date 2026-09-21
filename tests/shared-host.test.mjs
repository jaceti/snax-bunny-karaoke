import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sharedHostToken, hostTokenMatches } from '../app/api/rooms/shared-host.ts';
import { joinSharedHost } from '../app/host-access.ts';

const original='original-host-secret';
const storedHash=createHash('sha256').update(original).digest('hex');
test('shared host credentials are stable, room-specific, and preserve the original host',async()=>{
  const shared=await sharedHostToken('ABC123',storedHash);
  assert.equal(shared,await sharedHostToken('ABC123',storedHash));
  assert.notEqual(shared,storedHash);
  assert.notEqual(shared,original);
  assert.equal(await hostTokenMatches('ABC123',storedHash,shared),true);
  assert.equal(await hostTokenMatches('ABC123',storedHash,original),true);
  assert.equal(await hostTokenMatches('XYZ789',storedHash,shared),false);
  for(const token of ['','singer-token','tv-token','ABC123'])assert.equal(await hostTokenMatches('ABC123',storedHash,token),false);
});

test('two fresh browsers opening the existing host entry both join the current room',async()=>{
  for(let browser=0;browser<2;browser++){
    const saved=new Map();
    const room=await joinSharedHost({setItem:(key,value)=>saved.set(key,value)},undefined,async(path,options)=>{
      assert.equal(path,'/api/rooms/current');
      assert.equal(options.method,'POST');
      return Response.json({code:'ABC123',hostToken:'shared-host',inviteToken:'singer',tvToken:'tv'});
    });
    assert.equal(room.code,'ABC123');
    assert.equal(saved.get('snax-host-ABC123'),'shared-host');
    assert.equal(saved.get('snax-invite-ABC123'),'singer');
  }
});

test('refreshing an existing host URL enables that room; stale URLs do not silently switch rooms',async()=>{
  const response=async()=>Response.json({code:'ABC123',hostToken:'shared-host',inviteToken:'singer'});
  let writes=0;
  const storage={setItem(){writes++;}};
  await assert.rejects(joinSharedHost(storage,'OLD123',response),/older room/);
  assert.equal(writes,0);
  assert.equal((await joinSharedHost(storage,'ABC123',response)).code,'ABC123');
  assert.equal(writes,2);
});

test('only a missing current room permits creation; other errors do not reset the show',async()=>{
  const storage={setItem(){throw Error('must not save');}};
  assert.equal(await joinSharedHost(storage,undefined,async()=>Response.json({}, {status:404})),null);
  await assert.rejects(joinSharedHost(storage,'ABC123',async()=>Response.json({}, {status:404})));
  await assert.rejects(joinSharedHost(storage,undefined,async()=>Response.json({}, {status:500})));
});
