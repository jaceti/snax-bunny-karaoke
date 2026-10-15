import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
const [input,ffmpeg]=process.argv.slice(2);
if(!input||!ffmpeg)throw Error('Usage: node scripts/prepare-gobble-music.mjs SOURCE_DIRECTORY FFMPEG');
const output=path.resolve('public/gobble-music');await mkdir(output,{recursive:true});
function run(source,file,filters){
  const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',path.join(input,source),'-vn','-af',filters,'-ac','1','-ar','44100','-codec:a','libmp3lame','-b:a','128k','-map_metadata','-1',path.join(output,file)],{encoding:'utf8'});
  if(result.status!==0)throw Error(result.stderr);
}
// The supplied file has gobbles at 2.323–3.246 and 4.723–5.646 seconds.
// Isolate one, repeat seamlessly with short edge ramps, and end at wheel landing.
run('Turkey Gobble Sound Effect.mp3','gobble-spin.mp3','atrim=start=2.32:end=3.25,asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st=0.922:d=0.008,aloop=loop=-1:size=41013,atrim=duration=7,loudnorm=I=-20:TP=-2:LRA=7,afade=t=out:st=6.97:d=0.03');
const tracks=[['Thanksgiving Theme (Reprise).mp3','thanksgiving-reprise.mp3'],['The Great Pumpkin Waltz.mp3','pumpkin-waltz.mp3'],["It's The Great Pumpkin Charlie Brown   Full Soundtrack..mp3",'great-pumpkin.mp3']];
const manifest=[];
for(const [source,file] of tracks){
  run(source,file,'atrim=start=8:duration=45,asetpts=PTS-STARTPTS,loudnorm=I=-20:TP=-2:LRA=7,afade=t=in:d=0.25,afade=t=out:st=44.5:d=0.5');
  manifest.push({file,source,startSeconds:8,durationSeconds:45});
}
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Prepared continuous seven-second gobble and three 45-second winner interludes.');
