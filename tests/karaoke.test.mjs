import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TvPlayback } from '../app/tv-playback.ts';
import { karaokeScore, playable, PREFERRED_CHANNELS } from '../app/api/search/ranking.ts';

function setup(t, complete = async () => true) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [], completions = [];
  let videoId = '', blocked = false;
  const player = {
    loadVideoById(id) { videoId = id; calls.push(['load', id]); },
    cueVideoById(id) { videoId = id; calls.push(['cue', id]); },
    playVideo() { calls.push(['play']); },
    pauseVideo() { calls.push(['pause']); },
    getVideoData() { return { video_id: videoId }; },
    destroy() { calls.push(['destroy']); },
  };
  const playback = new TvPlayback({ interlude() {}, blocked(value) { blocked = value; }, error() {}, complete: async id => { completions.push(id); return complete(id); } });
  playback.attach(player);
  t.after(() => playback.dispose());
  return { playback, player, calls, completions, blocked: () => blocked };
}
const songA = { id: 1, videoId: 'first' }, songB = { id: 2, videoId: 'second' };

test('wheel winner is cued silently and plays on close without another interlude',t=>{
  const {playback,calls}=setup(t);
  playback.update(songA,'playing');playback.stateChanged(1);
  playback.update(songA,'paused',true);
  playback.update(songB,'paused',true);assert.deepEqual(calls.at(-1),['cue','second']);
  playback.update(songB,'playing',false);assert.deepEqual(calls.at(-1),['play']);
});

test('opening the wheel retires songs only when more than half has played',async t=>{
  const {playback,player,completions}=setup(t);
  player.getDuration=()=>200;let position=99;player.getCurrentTime=()=>position;
  playback.update(songA,'playing');playback.stateChanged(1);
  playback.update(songA,'paused',true);assert.deepEqual(completions,[]);
  playback.update(songA,'paused',false);position=100;
  playback.update(songA,'paused',true);assert.deepEqual(completions,[]);
  playback.update(songA,'paused',false);position=101;
  playback.update(songA,'paused',true);await Promise.resolve();assert.deepEqual(completions,[1]);
  playback.stateChanged(0);assert.deepEqual(completions,[1]);
});

test('ordinary pauses preserve a majority-played song; an ended song completes during wheel pause',async t=>{
  const {playback,player,completions}=setup(t);
  player.getDuration=()=>200;player.getCurrentTime=()=>190;
  playback.update(songA,'playing');playback.stateChanged(1);
  playback.update(songA,'paused');assert.deepEqual(completions,[]);
  player.getCurrentTime=()=>0;player.getPlayerState=()=>0;
  playback.update(songA,'paused',true);await Promise.resolve();assert.deepEqual(completions,[1]);
});

test('three queued songs load in one player without another activation', async t => {
  const { playback, calls, completions } = setup(t);
  for (const song of [songA, songB, { id: 3, videoId: 'third' }]) {
    playback.update(song, 'playing');
    if (song.id > 1) t.mock.timers.tick(10_000);
    playback.stateChanged(1);
    playback.stateChanged(0);
    playback.stateChanged(0);
    await Promise.resolve();
  }
  assert.deepEqual(calls.filter(c => c[0] === 'load'), [['load', 'first'], ['load', 'second'], ['load', 'third']]);
  assert.deepEqual(completions, [1, 2, 3]);
  assert.equal(calls.some(c => c[0] === 'destroy'), false);
});

test('host pause during transition cues silently; host resume plays', t => {
  const { playback, calls } = setup(t);
  playback.update(songA, 'playing');
  playback.update(songB, 'playing');
  playback.update(songB, 'paused');
  t.mock.timers.tick(10_000);
  assert.deepEqual(calls.at(-1), ['cue', 'second']);
  playback.stateChanged(1);
  assert.deepEqual(calls.at(-1), ['pause']);
  playback.update(songB, 'playing');
  assert.deepEqual(calls.at(-1), ['play']);
});

test('skip during interlude cancels old song and ignores stale end events', t => {
  const { playback, calls, completions } = setup(t);
  playback.update(songA, 'playing'); playback.stateChanged(1);
  playback.update(songB, 'playing'); playback.stateChanged(0);
  t.mock.timers.tick(5000);
  playback.update({ id: 3, videoId: 'third' }, 'playing');
  t.mock.timers.tick(10_000);
  playback.stateChanged(0);
  assert.deepEqual(calls.filter(c => c[0] === 'load'), [['load', 'first'], ['load', 'third']]);
  assert.deepEqual(completions, []);
});

test('same video requested twice reloads by queue item, ordinary polls do not', t => {
  const { playback, calls } = setup(t);
  playback.update(songA, 'playing');
  playback.update({ ...songA }, 'playing');
  playback.update({ id: 2, videoId: 'first' }, 'playing');
  t.mock.timers.tick(10_000);
  assert.equal(calls.filter(c => c[0] === 'load').length, 2);
});

test('a failed completion is retried without needing host input', async t => {
  let attempts = 0;
  const { playback, completions } = setup(t, async () => ++attempts > 1);
  playback.update(songA, 'playing'); playback.stateChanged(1); playback.stateChanged(0);
  await new Promise(resolve => setImmediate(resolve));
  t.mock.timers.tick(2500);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(completions, [1, 1]);
});

test('initial browser block allows one click, and pause prevents that click starting audio', t => {
  const { playback, calls, blocked } = setup(t);
  playback.update(songA, 'playing'); playback.autoplayBlocked();
  assert.equal(blocked(), true);
  playback.allowPlayback(); assert.deepEqual(calls.at(-1), ['play']);
  playback.stateChanged(1); assert.equal(blocked(), false);
  playback.update(songA, 'paused'); playback.allowPlayback();
  assert.deepEqual(calls.at(-1), ['pause']);
});

test('player readiness uses latest host state rather than stale constructor state', t => {
  const { playback, calls } = setup(t);
  playback.update(null, 'idle');
  playback.update(songA, 'paused');
  assert.deepEqual(calls.at(-1), ['cue', 'first']);
});

const details = (title, definition = 'hd') => ({ snippet: { title, channelTitle: 'Karaoke Studio', liveBroadcastContent: 'none' }, status: { embeddable: true, privacyStatus: 'public', uploadStatus: 'processed' }, contentDetails: { definition } });
test('preferred official brands get a boost without rewarding impersonation or wrong songs', () => {
  const base = details('ABBA Dancing Queen Karaoke Lyrics');
  for (const channelId of PREFERRED_CHANNELS.keys()) {
    const preferred = { ...base, snippet: { ...base.snippet, channelId } };
    assert.ok(karaokeScore(preferred, 'ABBA Dancing Queen', 10) > karaokeScore(base, 'ABBA Dancing Queen', 0));
    const wrong = { ...preferred, snippet: { ...preferred.snippet, title: 'Other Artist Different Song Karaoke Lyrics' } };
    assert.ok(karaokeScore(base, 'ABBA Dancing Queen', 10) > karaokeScore(wrong, 'ABBA Dancing Queen', 0));
  }
  const imitation = { ...base, snippet: { ...base.snippet, channelTitle: 'Sing King', channelId: 'imitation' } };
  const ordinary = { ...imitation, snippet: { ...imitation.snippet, channelTitle: 'Another Singer' } };
  assert.equal(karaokeScore(imitation, 'ABBA', 0), karaokeScore(ordinary, 'ABBA', 0));
});
test('lyrics karaoke outranks instrumentals, music videos and explicit no-lyrics versions', () => {
  const score = title => karaokeScore(details(title), 'Dancing Queen ABBA', 0);
  const preferred = score('ABBA Dancing Queen Karaoke with Lyrics');
  for (const title of ['ABBA Dancing Queen Instrumental', 'ABBA Dancing Queen Karaoke No Lyrics', 'ABBA Dancing Queen Official Music Video', 'ABBA Dancing Queen Lyric Video']) assert.ok(preferred > score(title));
  assert.ok(karaokeScore(details('ABBA Dancing Queen Karaoke Lyrics'), 'ABBA', 0) > karaokeScore(details('ABBA Dancing Queen Karaoke Lyrics', 'sd'), 'ABBA', 0));
  assert.ok(preferred > score('Other Song Karaoke Lyrics'));
});

test('Zoom is the top brand for equivalent lyric matches, without boosting unrelated songs', () => {
  const base = details('ABBA Dancing Queen Karaoke Lyrics');
  const zoom = { ...base, snippet: { ...base.snippet, channelId: 'UCrk8mp-ugqtAbjif6JARjlw' } };
  for (const channelId of PREFERRED_CHANNELS.keys()) {
    if (channelId === zoom.snippet.channelId) continue;
    const alternative = { ...base, snippet: { ...base.snippet, channelId } };
    assert.ok(karaokeScore(zoom, 'ABBA Dancing Queen', 49) > karaokeScore(alternative, 'ABBA Dancing Queen', 0));
  }
  const unrelated = { ...zoom, snippet: { ...zoom.snippet, title: 'Different Song Karaoke Lyrics' } };
  assert.ok(karaokeScore(base, 'ABBA Dancing Queen', 0) > karaokeScore(unrelated, 'ABBA Dancing Queen', 0));
  assert.equal(playable({ ...zoom, status: { ...zoom.status, embeddable: false } }, 'US'), false);
});

test('known blocked, private, age-restricted, live and region-restricted uploads are excluded', () => {
  const good = details('Karaoke with lyrics');
  assert.equal(playable(good, 'US'), true);
  const bad = [
    { ...good, status: { ...good.status, embeddable: false } },
    { ...good, status: { ...good.status, privacyStatus: 'private' } },
    { ...good, status: { ...good.status, uploadStatus: 'failed' } },
    { ...good, contentDetails: { contentRating: { ytRating: 'ytAgeRestricted' } } },
    { ...good, contentDetails: { regionRestriction: { blocked: ['US'] } } },
    { ...good, contentDetails: { regionRestriction: { allowed: ['GB'] } } },
    { ...good, snippet: { liveBroadcastContent: 'upcoming' } },
    {},
  ];
  for (const video of bad) assert.equal(playable(video, 'US'), false);
});
