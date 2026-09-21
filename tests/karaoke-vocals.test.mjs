import {test} from 'node:test';
import assert from 'node:assert/strict';
import {karaokeEligible,karaokeScore,PREFERRED_CHANNELS} from '../app/api/search/ranking.ts';

const video=(title,description='',channelId='unknown')=>({snippet:{title,description,channelId}});
test('lead, guide and demonstration vocals are excluded even from trusted brands',()=>{
  for(const channelId of ['unknown',...PREFERRED_CHANNELS.keys()])for(const label of [
    'With Vocals','With Lead Vocals','Guide Vocal','Guide-Vocals','Full Vocals',
    'Vocal Demo','Vocal Guide','Vocal Demonstration','Vocal Cover','Singing Cover','Acappella',
    'A Cappella','Demonstration Version','Original Vocals Included','With Original Vocals',
  ])assert.equal(karaokeEligible(video(`ABBA Dancing Queen Karaoke Lyrics (${label})`,'',channelId)),false,label);
});
test('no-vocal versions and backing harmonies remain eligible',()=>{
  for(const label of ['No Vocals','Without Vocals','Without Lead Vocals','No Guide Vocals',
    'No-Lead-Vocals','Lead Vocals Removed','Vocal-Free','With No Vocals','Without Any Vocals',
    'With Backing Vocals','With Background Vocals','With Backing Harmonies','No Lead Vocals, With Backing Vocals']){
    assert.equal(karaokeEligible(video(`ABBA Dancing Queen Karaoke with Lyrics (${label})`)),true,label);
  }
});
test('ordinary lyric/music videos and covers do not become karaoke by mentioning lyrics',()=>{
  for(const title of ['ABBA Dancing Queen Official Music Video','ABBA Dancing Queen Official Video',
    'ABBA Dancing Queen Lyrics Video','ABBA Dancing Queen Lyric Video','ABBA Dancing Queen Lyrics',
    'ABBA Dancing Queen Vocal Cover','ABBA Dancing Queen Singalong'])assert.equal(karaokeEligible(video(title)),false,title);
  for(const title of ['ABBA Dancing Queen Karaoke Lyrics','ABBA Dancing Queen Instrumental with Lyrics',
    'ABBA Dancing Queen No Vocals Lyrics Video','ABBA Dancing Queen Backing Track with Lyrics'])assert.equal(karaokeEligible(video(title)),true,title);
  assert.equal(karaokeEligible(video('ABBA Dancing Queen','Karaoke version with lyrics on screen')),true);
});
test('opening descriptions can disclose vocals without unrelated promo links blocking a good track',()=>{
  assert.equal(karaokeEligible(video('Song Karaoke Lyrics','This track includes guide vocals.')),false);
  assert.equal(karaokeEligible(video('Song Karaoke Lyrics','This track includes vocals.')),false);
  assert.equal(karaokeEligible(video('Song Karaoke Lyrics','This version has no lead vocals.')),true);
  assert.equal(karaokeEligible(video('Song Karaoke Lyrics','With backing vocals and harmonies.')),true);
  assert.equal(karaokeEligible(video('Song Karaoke Lyrics','Karaoke version.\nWatch the guide vocals version: https://example.com')),true);
  assert.equal(karaokeEligible(video('Song Karaoke Lyrics','Also available with vocals on our channel.')),true);
  assert.equal(karaokeEligible(video('Song Karaoke No Vocals / Guide Vocals')),false);
});
test('explicit no-vocal tracks get a preference; Zoom stays first for comparable matches',()=>{
  assert.ok(karaokeScore(video('ABBA Karaoke Lyrics No Lead Vocals'),'ABBA',0)>karaokeScore(video('ABBA Karaoke Lyrics'),'ABBA',0));
  const [zoom,...others]=PREFERRED_CHANNELS.keys();
  for(const other of others)assert.ok(karaokeScore(video('ABBA Karaoke Lyrics No Vocals','',zoom),'ABBA',49)>karaokeScore(video('ABBA Karaoke Lyrics No Vocals','',other),'ABBA',0));
});

test('all four requested official channels get preferred ranking, not copied brand names',()=>{
  for(const [channelId,name] of [
    ['UCbqcG1rdt9LMwOJN4PyGTKg','KaraFun Karaoke'],['UCWLqO9ztz16a_Ko4YB9PnFQ','Party Tyme Karaoke'],
    ['UCcKX_cqJR4RwW5dxeqHbseQ','Sunfly Karaoke'],['UC49S5ro4yX1fR0DRnf0Adwg','Caritas Goth Karaoke'],
  ]){
    assert.equal(PREFERRED_CHANNELS.get(channelId),name);
    const official=video('ABBA Dancing Queen Karaoke Lyrics','',channelId);
    const fake=video('ABBA Dancing Queen Karaoke Lyrics');fake.snippet.channelTitle=name;
    official.snippet.channelTitle=name;
    assert.ok(karaokeScore(official,'ABBA Dancing Queen',20)>karaokeScore(fake,'ABBA Dancing Queen',0));
    assert.equal(karaokeEligible(video('ABBA Dancing Queen With Guide Vocals','',channelId)),false);
  }
});
