"use client";
import { useEffect,useRef,useState,type CSSProperties } from "react";
import { type WheelState } from "./wheel-model";

export function WheelView({wheel,serverNow}:{wheel:WheelState;serverNow:number}){
  const clockOffset=useRef(Date.now()-serverNow);
  useEffect(()=>{clockOffset.current=Date.now()-serverNow;},[serverNow]);
  const [progress,setProgress]=useState(0);
  useEffect(()=>{
    if(wheel.startedAt===null||wheel.endsAt===null){setProgress(0);return;}
    let frame=0;const start=wheel.startedAt,end=wheel.endsAt;
    const tick=()=>{const p=Math.max(0,Math.min(1,(Date.now()-clockOffset.current-start)/(end-start)));setProgress(p);if(p<1)frame=requestAnimationFrame(tick);};
    tick();return()=>cancelAnimationFrame(frame);
  },[wheel.id,wheel.startedAt,wheel.endsAt]);
  const won=wheel.phase==="winner"||progress>=1;
  const winner=wheel.winnerIndex===null?null:wheel.entries[wheel.winnerIndex];
  const angle=wheel.rotation*(1-Math.pow(1-progress,5));
  const count=wheel.entries.length;const step=360/count;
  const point=(degrees:number)=>[240+220*Math.cos((degrees-90)*Math.PI/180),240+220*Math.sin((degrees-90)*Math.PI/180)];
  return <section className={`wheel-show ${won?"wheel-won":""}`} aria-label="Snax singer wheel">
    {won&&<div className="wheel-confetti" aria-hidden="true">{Array.from({length:44},(_,i)=><i key={i} style={{"--x":`${(i*37)%101}%`,"--delay":`${(i%9)*-.17}s`,"--turn":`${i*29}deg`,background:i%3===0?"var(--ink)":i%2?"var(--pink)":"var(--snax-blue)"} as CSSProperties}>{i%4===0?"★":""}</i>)}</div>}
    <div className="wheel-disc-wrap"><div className="wheel-pointer" aria-hidden="true">▼</div>
      <svg className="wheel-disc" viewBox="0 0 480 480" role="img" aria-label={`Wheel with ${wheel.entries.filter(e=>!e.filler).length} singers`} style={{transform:`rotate(${angle}deg)`}}>
        {wheel.entries.map((entry,index)=>{const a=point(index*step),b=point((index+1)*step),middle=(index+.5)*step;return <g key={`${entry.queueId}-${index}`}><path d={`M240 240 L${a[0]} ${a[1]} A220 220 0 ${step>180?1:0} 1 ${b[0]} ${b[1]} Z`} fill={index%2?"#58c7df":"#ff8fb3"} stroke="#111" strokeWidth="4"/><text x="240" y="105" transform={`rotate(${middle} 240 240)`} textAnchor="middle" fill="#111" fontWeight="900" fontSize={Math.max(7,Math.min(22,160/count))} textLength={entry.name.length*Math.max(7,Math.min(22,160/count))*.62>Math.min(150,Math.max(30,650/count))?Math.min(150,Math.max(30,650/count)):undefined} lengthAdjust="spacingAndGlyphs">{entry.name}<title>{entry.name}</title></text></g>;})}
        <circle cx="240" cy="240" r="42" fill="#111" stroke="#fffdf7" strokeWidth="5"/><text x="240" y="250" textAnchor="middle" fill="#ff8fb3" fontSize="26" fontWeight="900">SNAX</text>
      </svg>
    </div>
    <div className="wheel-copy" aria-live="polite"><p className="eyebrow">Snax picks the next star</p><h2>{won?"TAKE THE MIC!":wheel.phase==="ready"?"WHO’S NEXT?":"ROUND WE GO…"}</h2>
      {won&&winner?<div className="wheel-winner"><span>★ You’re up next ★</span><strong>{winner.name}</strong><p>{winner.songTitle}</p><small>Your first waiting song is now at the top of the lineup.</small></div>:<><p>{wheel.phase==="ready"?"The host is about to spin. One singer. One chance. All eyes on the wheel.":"A little bunny luck is coming your way."}</p><div className="wheel-singer-list">{wheel.entries.filter(e=>!e.filler).map(e=><span key={e.queueId}>{e.name}</span>)}</div></>}
      <small className="wheel-filler-note">{wheel.entries.some(e=>e.filler)?"Snax’s extra space is just for looks—it never wins.":"Every waiting singer has an equal chance."}</small>
    </div>
  </section>;
}
