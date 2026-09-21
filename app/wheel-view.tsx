"use client";
import { useEffect,useId,useRef,useState,type CSSProperties } from "react";
import { wheelEase,type WheelState } from "./wheel-model";

export function WheelView({wheel,serverNow}:{wheel:WheelState;serverNow:number}){
  const portraitClip=useId();
  const rainbow=["#ff4268","#ff963d","#ffe234","#60d66c","#35c8f4","#7865ee","#eb65d6"];
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
  const angle=wheel.rotation*wheelEase(progress);
  const count=wheel.entries.length;const step=360/count;
  const point=(degrees:number)=>[240+220*Math.cos((degrees-90)*Math.PI/180),240+220*Math.sin((degrees-90)*Math.PI/180)];
  return <section className={`wheel-show ${won?"wheel-won":""}`} aria-label="Snax singer wheel">
    {won&&<div className="wheel-confetti" aria-hidden="true">{Array.from({length:132},(_,i)=><i key={i} style={{"--x":`${(i*37)%101}%`,"--delay":`${(i%23)*-.13}s`,"--turn":`${180+i*29}deg`,"--size":`${[10,24,15,32,19,12][i%6]}px`,"--fall":`${2.6+(i%7)*.19}s`,background:rainbow[i%rainbow.length],color:rainbow[i%rainbow.length]} as CSSProperties}>{i%4===0?"★":""}</i>)}</div>}
    <div className="wheel-disc-wrap"><div className="wheel-pointer" aria-hidden="true">▼</div>
      <svg className="wheel-disc" viewBox="0 0 480 480" role="img" aria-label={`Wheel with ${wheel.entries.filter(e=>!e.filler).length} singers`} style={{transform:`rotate(${angle}deg)`}}>
        {wheel.entries.map((entry,index)=>{const a=point(index*step),b=point((index+1)*step),middle=(index+.5)*step,label=entry.filler?"SNAX":entry.name,fontSize=Math.max(9,Math.min(32,520/count));return <g key={`${entry.queueId}-${index}`}><path d={`M240 240 L${a[0]} ${a[1]} A220 220 0 ${step>180?1:0} 1 ${b[0]} ${b[1]} Z`} fill={index%2?"#58c7df":"#ff8fb3"} stroke="#111" strokeWidth="4"/><text x="310" y="240" dominantBaseline="central" transform={`rotate(${middle-90} 240 240)`} textAnchor="start" fill="#111" fontWeight="900" fontSize={fontSize} textLength={label.length*fontSize*.62>132?132:undefined} lengthAdjust="spacingAndGlyphs">{label}<title>{entry.name}</title></text></g>;})}
        <defs><clipPath id={portraitClip}><circle cx="240" cy="240" r="51"/></clipPath></defs>
        <g transform={`rotate(${-angle} 240 240)`}><circle cx="240" cy="240" r="55" fill="#fffdf7" stroke="#111" strokeWidth="5"/><image href="/snax-profile-hd.png" x="189" y="189" width="102" height="102" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${portraitClip})`}><title>Snax the Bunny</title></image></g>
      </svg>
    </div>
    <div className="wheel-copy" aria-live="polite"><p className="eyebrow">Snax picks the next star</p><h2>{won?"TAKE THE MIC!":wheel.phase==="ready"?"WHO’S NEXT?":"ROUND WE GO…"}</h2>
      {won&&winner?<div className="wheel-winner"><span>★ You’re up next ★</span><strong>{winner.name}</strong><p>{winner.songTitle}</p><small>Your first waiting song is now at the top of the lineup.</small></div>:<><p>{wheel.phase==="ready"?"The host is about to spin. One singer. One chance. All eyes on the wheel.":"A little bunny luck is coming your way."}</p><div className="wheel-singer-list">{wheel.entries.filter(e=>!e.filler).map(e=><span key={e.queueId}>{e.name}</span>)}</div></>}
      {wheel.entries.some(e=>e.filler)&&<small className="wheel-filler-note">Snax’s extra space is just for looks—it never wins.</small>}
    </div>
  </section>;
}
