// Stable per celebration (no hydration flicker), independently scattered fields.
export function wheelConfetti(id:string,count=160){
  let seed=2166136261;for(const ch of id)seed=Math.imul(seed^ch.charCodeAt(0),16777619)>>>0;
  const random=()=>{seed=(seed+0x6D2B79F5)>>>0;let t=seed;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
  const colors=["#ff4268","#ff963d","#ffe234","#60d66c","#35c8f4","#7865ee","#eb65d6"];
  return Array.from({length:count},()=>({x:random()*100,y:-10-random()*55,delay:-random()*4,duration:3.4+random()*2.6,size:9+random()*23,drift:(random()-.5)*300,sway:(random()-.5)*130,angle:random()*360,turn:(random()-.5)*1600,color:colors[Math.floor(random()*colors.length)],shape:Math.floor(random()*3)}));
}
