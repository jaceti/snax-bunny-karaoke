export type WheelEntry={name:string;songTitle:string;queueId:number|null;filler:boolean};
export type WheelState={id:string;phase:"ready"|"spinning"|"winner";entries:WheelEntry[];winnerIndex:number|null;startedAt:number|null;endsAt:number|null;rotation:number};
export const WHEEL_DURATION=7000;
// Keep movement perceptible until the landing, rather than crawling for seconds.
export function wheelEase(progress:number){return 1-Math.pow(1-Math.max(0,Math.min(1,progress)),2);}
export function wheelEntries(queue:Array<{id:number;singer_name:string;song_title:string}>):WheelEntry[]{
  const seen=new Set<string>();const entries:WheelEntry[]=[];
  for(const row of queue){const key=row.singer_name.trim().toLowerCase();if(!key||seen.has(key))continue;seen.add(key);entries.push({name:row.singer_name.trim(),songTitle:row.song_title,queueId:row.id,filler:false});}
  if(entries.length%2)entries.push({name:"SNAX · JUST WATCHING",songTitle:"Decorative space — never wins",queueId:null,filler:true});
  return entries;
}
export function pickWheelWinner(entries:WheelEntry[],randomWord=()=>crypto.getRandomValues(new Uint32Array(1))[0]){
  const eligible=entries.map((entry,index)=>({entry,index})).filter(({entry})=>!entry.filler&&entry.queueId!==null);
  if(!eligible.length)throw new Error("Add a singer to the lineup before spinning.");
  const limit=Math.floor(0x100000000/eligible.length)*eligible.length;
  let draw=randomWord();while(draw>=limit)draw=randomWord();
  return eligible[draw%eligible.length].index;
}
export function wheelRotation(index:number,count:number){return 6*360+(360-(index+.5)*360/count)%360;}
