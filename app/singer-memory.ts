export const SINGER_MEMORY_KEY="snax-singer-night-v1";
export type SingerIdentity={name:string;night:string};
type MemoryStorage=Pick<Storage,"getItem"|"setItem"|"removeItem">;
const pacific=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"});

// A karaoke night runs from 3 AM Pacific to the next 3 AM, including DST changes.
export function singerNight(now=Date.now()){
  const parts=Object.fromEntries(pacific.formatToParts(now).map(part=>[part.type,part.value]));
  const day=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)));
  if(Number(parts.hour)<3)day.setUTCDate(day.getUTCDate()-1);
  return day.toISOString().slice(0,10);
}

export function nextSingerReset(now=Date.now()){
  const night=singerNight(now);
  let before=Math.floor(now),after=before+27*60*60*1000;
  while(after-before>1){const middle=Math.floor((before+after)/2);if(singerNight(middle)===night)before=middle;else after=middle;}
  return after;
}

export function readSingerIdentity(storage:MemoryStorage|null,now=Date.now()):SingerIdentity|null{
  try{
    const raw=storage?.getItem(SINGER_MEMORY_KEY);
    if(!raw)return null;
    const value=JSON.parse(raw);
    if(value&&typeof value.name==="string"&&value.name.trim()&&value.name.length<=32&&value.night===singerNight(now))return {name:value.name.trim(),night:value.night};
    storage?.removeItem(SINGER_MEMORY_KEY);
  }catch{/* Blocked/corrupt storage must not prevent singing. */}
  return null;
}

export function rememberSinger(storage:MemoryStorage|null,name:string,now=Date.now()){
  const existing=readSingerIdentity(storage,now);
  if(existing)return {identity:existing,persisted:true};
  const clean=name.trim().slice(0,32);
  if(!clean)throw new Error("Give us a stage name first.");
  const identity={name:clean,night:singerNight(now)};
  try{
    if(storage){storage.setItem(SINGER_MEMORY_KEY,JSON.stringify(identity));return {identity,persisted:true};}
  }catch{/* Keep an in-memory name for this tab when local storage is unavailable. */}
  return {identity,persisted:false};
}
