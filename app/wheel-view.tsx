"use client";
import { useEffect,useId,useMemo,useRef,useState,type CSSProperties } from "react";
import { wheelEase,wheelEntryLabel,type WheelState } from "./wheel-model";
import { wheelConfetti } from "./wheel-confetti";
import { Skeleton,SpookyBats } from "./spooky-icons";

export function WheelView({wheel,serverNow,onLand}:{wheel:WheelState;serverNow:number;onLand?:(id:string)=>void}){
  const portraitClip=useId();
  const spooky=wheel.theme==="spooky";
  const confetti=useMemo(()=>wheelConfetti(wheel.id),[wheel.id]);
  const clockKey=`${wheel.id}:${wheel.startedAt}`;
  const clock=useRef({key:clockKey,offset:Date.now()-serverNow});
  if(clock.current.key!==clockKey)clock.current={key:clockKey,offset:Date.now()-serverNow};
  const landRef=useRef(onLand);landRef.current=onLand;
  const [progress,setProgress]=useState(0);
  useEffect(()=>{
    if(wheel.startedAt===null||wheel.endsAt===null){setProgress(0);return;}
    let frame=0;const start=wheel.startedAt,end=wheel.endsAt;
    const tick=()=>{const p=Math.max(0,Math.min(1,(Date.now()-clock.current.offset-start)/(end-start)));setProgress(p);if(p<1)frame=requestAnimationFrame(tick);};
    tick();return()=>cancelAnimationFrame(frame);
  },[wheel.id,wheel.startedAt,wheel.endsAt]);
  const won=wheel.phase!=="ready"&&(wheel.phase==="winner"||progress>=1);
  useEffect(()=>{if(won)landRef.current?.(wheel.id);},[won,wheel.id]);
  const winner=wheel.winnerIndex===null?null:wheel.entries[wheel.winnerIndex];
  const angle=wheel.rotation*wheelEase(won?1:progress);
  const count=wheel.entries.length;const step=360/count;
  const point=(degrees:number,radius=220)=>[240+radius*Math.cos((degrees-90)*Math.PI/180),240+radius*Math.sin((degrees-90)*Math.PI/180)];
  return <section className={`wheel-show ${won?"wheel-won":""} ${spooky?"wheel-spooky":""}`} aria-label={spooky?"Snax spooky singer wheel":"Snax singer wheel"}>
    {spooky&&<SpookyBats/>}
    {won&&<div className="wheel-confetti" aria-hidden="true">{confetti.map((piece,i)=><i key={i} className={spooky?"confetti-skeleton":`confetti-shape-${piece.shape}`} style={{"--x":`${piece.x}%`,"--y":`${piece.y}vh`,"--delay":`${piece.delay}s`,"--turn":`${piece.turn}deg`,"--angle":`${piece.angle}deg`,"--drift":`${piece.drift}px`,"--sway":`${piece.sway}px`,"--size":`${spooky?piece.size*.65+9:piece.size}px`,"--fall":`${piece.duration}s`,background:piece.color,color:spooky?"#e4e2d5":piece.color} as CSSProperties}>{spooky?<Skeleton/>:piece.shape===2?"★":""}</i>)}</div>}
    <div className="wheel-disc-wrap"><div className="wheel-pointer" aria-hidden="true">▼</div>
      <svg className="wheel-disc" viewBox="0 0 480 480" role="img" aria-label={`Wheel with ${wheel.entries.filter(e=>!e.filler).length} singers`} style={{transform:`rotate(${angle}deg)`}}>
        {spooky&&<circle cx="240" cy="240" r="233" fill="#deded0" stroke="#deded0" strokeWidth="2"/>}
        {wheel.entries.map((entry,index)=>{const a=point(index*step),b=point((index+1)*step),middle=(index+.5)*step,label=wheelEntryLabel(entry),fontSize=Math.max(9,Math.min(32,520/count));return <g key={`${entry.queueId}-${index}`}><path d={`M240 240 L${a[0]} ${a[1]} A220 220 0 ${step>180?1:0} 1 ${b[0]} ${b[1]} Z`} fill={spooky?(index%2?"#a8ada3":"#e4e2d5"):(index%2?"#58c7df":"#ff8fb3")} stroke="#111" strokeWidth="4"/><text x="310" y="240" dominantBaseline="central" transform={`rotate(${middle-90} 240 240)`} textAnchor="start" fill="#111" fontWeight="900" fontSize={fontSize} textLength={label.length*fontSize*.62>132?132:undefined} lengthAdjust="spacingAndGlyphs">{label}<title>{entry.filler?"Decorative star — never wins":entry.name.toUpperCase()}</title></text></g>;})}
        <circle cx="240" cy="240" r="220" fill="none" stroke="#111" strokeWidth="4"/>
        <g className="wheel-notches" aria-hidden="true" stroke="#111" strokeWidth="3" strokeLinecap="round">{Array.from({length:48},(_,index)=>{const inner=point(index*7.5,221),outer=point(index*7.5,228);return <line key={index} x1={inner[0]} y1={inner[1]} x2={outer[0]} y2={outer[1]}/>;})}</g>
        <defs><clipPath id={portraitClip}><circle cx="240" cy="240" r="55"/></clipPath></defs>
        <g transform={`rotate(${-angle} 240 240)`}>{spooky&&<circle cx="240" cy="240" r="55" fill="#272725"/>}<image href={spooky?"/snax-spooky-bunny.png":"/snax-profile-hd.png"} x="185" y="185" width="110" height="110" preserveAspectRatio={spooky?"xMidYMid meet":"xMidYMid slice"} clipPath={`url(#${portraitClip})`}><title>Snax the Bunny</title></image><circle cx="240" cy="240" r="55" fill="none" stroke="#111" strokeWidth="5"/></g>
      </svg>
    </div>
    <div className="wheel-copy" aria-live="polite"><p className="eyebrow">{spooky?"Snax’s haunted karaoke":"Snax picks the next star"}</p><h2>{spooky?(won?"RISE & SING!":wheel.phase==="ready"?"SPOOKY WHEEL":"FATE IS SPINNING…"):(won?"TAKE THE MIC!":wheel.phase==="ready"?"WHO’S NEXT?":"ROUND WE GO…")}</h2>
      {won&&winner?<div className="wheel-winner"><span>★ Now singing ★</span><strong>{winner.name.toUpperCase()}</strong><p>{winner.songTitle}</p><small>Your song is ready to play when the host closes the wheel.</small></div>:<p>{spooky?(wheel.phase==="ready"?"One spin. One chosen soul. All eyes on the wheel.":"Who will haunt the microphone?"):(wheel.phase==="ready"?"The host is about to spin. One singer. One chance. All eyes on the wheel.":"A little bunny luck is coming your way.")}</p>}
      {wheel.entries.some(e=>e.filler)&&<small className="wheel-filler-note">The star space is just for looks—it never wins.</small>}
      {spooky&&<div className="spooky-skeleton-band" aria-hidden="true"><Skeleton/><Skeleton/><Skeleton/></div>}
    </div>
  </section>;
}
