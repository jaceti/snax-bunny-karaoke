// Irregular overlapping calls: two original gobbles, subtly different voices.
// Render once so every TV plays the same seven-second mix without extra timers.
export const GOBBLE_CALLS = [
  [0, 0, 1, .95, -.12], [.48, 1, .91, .62, .24],
  [1.12, 0, 1.07, .8, -.2], [1.71, 1, .97, .72, .12],
  [2.31, 1, 1.11, .6, -.24], [2.86, 0, .94, .9, .18],
  [3.47, 1, 1.03, .76, -.08], [4.01, 0, .89, .64, .23],
  [4.65, 0, 1.08, .86, -.18], [5.19, 1, .96, .7, .1],
  [5.72, 0, 1.02, .8, -.22], [6.31, 1, .92, .72, .2],
];
export function gobbleMixFilter(){
  const branches=GOBBLE_CALLS.map((_,i)=>`[call${i}]`).join('');
  const filters=[`[0:a]aresample=44100,asplit=${GOBBLE_CALLS.length}${branches}`];
  GOBBLE_CALLS.forEach(([delay,take,pitch,volume,pan],i)=>{
    const start=take?4.72:2.32;
    filters.push(`[call${i}]atrim=start=${start}:duration=0.93,asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st=0.91:d=0.02,asetrate=${Math.round(44100*pitch)},aresample=44100,volume=${volume},pan=stereo|c0=${(1-pan)/2}*c0|c1=${(1+pan)/2}*c0,adelay=${Math.round(delay*1000)}:all=1[mix${i}]`);
  });
  filters.push(`${GOBBLE_CALLS.map((_,i)=>`[mix${i}]`).join('')}amix=inputs=${GOBBLE_CALLS.length}:normalize=0,apad,atrim=duration=7,loudnorm=I=-20:TP=-2:LRA=7,afade=t=out:st=6.94:d=0.06[out]`);
  return filters.join(';');
}
