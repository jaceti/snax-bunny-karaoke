import { readdir,mkdir,writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
const [input,ffmpeg]=process.argv.slice(2);
if(!input||!ffmpeg)throw new Error('Usage: node scripts/prepare-spooky-music.mjs MUSIC_DIRECTORY FFMPEG_PATH');
const tracks=(await readdir(input)).filter(file=>file.endsWith('.m4a')).sort();
if(tracks.length!==27)throw new Error('Expected the 27 supplied tracks');
const output=path.resolve('public/spooky-music');await mkdir(output,{recursive:true});
const manifest=[];
for(const [index,title]of tracks.entries()){
  const file=`interlude-${String(index+1).padStart(2,'0')}.mp3`;
  const result=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-ss','8','-i',path.join(input,title),'-t','14','-vn','-af','loudnorm=I=-20:TP=-2:LRA=7,afade=t=in:d=0.2,afade=t=out:st=13.5:d=0.5','-ac','1','-ar','44100','-codec:a','libmp3lame','-b:a','96k',path.join(output,file)],{encoding:'utf8'});
  if(result.status!==0)throw new Error(result.stderr);
  manifest.push({file,source:title,startSeconds:8,durationSeconds:14});
  console.log(`Prepared ${index+1}/${tracks.length}: ${title}`);
}
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
