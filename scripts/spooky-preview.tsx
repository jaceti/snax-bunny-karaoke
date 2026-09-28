// Local-only visual/audio harness. Never installed as an app route.
import React,{useState,useRef,useEffect,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {QRCodeSVG} from 'qrcode.react';
import {WheelView} from '../app/wheel-view';
import {wheelEntries,wheelRotation,type WheelState} from '../app/wheel-model';
import {SpookyBats} from '../app/spooky-icons';
import {WheelAudio} from '../app/wheel-audio';
function FitText({text,max,min=18}:{text:string;max:number;min?:number}){
  const ref=useRef<HTMLElement|null>(null);
  useLayoutEffect(()=>{
    const el=ref.current,box=el?.parentElement;if(!el||!box)return;
    const fit=()=>{el.style.fontSize=`${max}px`;const available=box.clientWidth,needed=el.scrollWidth;if(needed>available&&needed>0)el.style.fontSize=`${Math.max(min,Math.floor(max*available/needed)-1)}px`;};
    fit();const observer=new ResizeObserver(fit);observer.observe(box);return()=>observer.disconnect();
  },[text,max,min]);
  return <strong ref={ref} style={{display:"block",whiteSpace:"nowrap",overflow:"hidden"}}>{text}</strong>;
}
function Preview(){
  const entries=wheelEntries(['JESS','ALEX','SAM','SNAX','FRANKIE'].map((singer_name,i)=>({id:i+1,singer_name,song_title:'This Is Halloween — Karaoke'})));
  const [wheel,setWheel]=useState<WheelState>({id:'preview',theme:'spooky',phase:'ready',entries,winnerIndex:null,startedAt:null,endsAt:null,rotation:0});
  const [card,setCard]=useState(false),[audioEnabled,setAudioEnabled]=useState(false);
  const audio=useRef<WheelAudio|null>(null);
  useEffect(()=>{audio.current=new WheelAudio(setAudioEnabled);return()=>audio.current?.dispose();},[]);
  useEffect(()=>{audio.current?.sync(card?null:wheel,Date.now());audio.current?.interlude(card,'preview-song');},[wheel,card]);
  function spin(){void audio.current?.unlock();setCard(false);const start=Date.now();setWheel({...wheel,id:String(start),phase:'spinning',winnerIndex:2,startedAt:start,endsAt:start+7000,rotation:wheelRotation(2,entries.length)});setTimeout(()=>setWheel(w=>({...w,phase:'winner'})),7000);}
  return <><nav style={{position:'fixed',bottom:0,left:0,zIndex:99,display:'flex',gap:12,padding:10,background:'white'}}><button onClick={spin}>Test spin</button><button onClick={()=>{void audio.current?.unlock();setCard(true);}}>Test interlude</button><button onClick={()=>{setCard(false);setWheel({...wheel,theme:wheel.theme==='spooky'?'classic':'spooky',phase:'ready',id:String(Date.now()),startedAt:null,endsAt:null});}}>Switch wheel</button><span>{audioEnabled?'Audio running':'Audio pending'}</span></nav><div className="tv-stage-full"><div className="tv-top"><div className="tv-brand"><strong>SNAX</strong></div><div className="tv-now"><span>Now singing</span><strong style={{fontSize:32}}>JESS</strong></div><div className="tv-now tv-next"><span>Up next</span><strong style={{fontSize:32}}>ALEX</strong></div></div><div className="tv-body"><div className="tv-video">{!card?<WheelView wheel={wheel} serverNow={Date.now()} onLand={id=>audio.current?.land(id)}/>:<div className="tv-idle tv-idle-interlude spooky-interlude"><SpookyBats/><img src="/snax-spooky-bunny.png" alt="Snax" className="tv-idle-bunny"/><div className="tv-idle-copy"><span>Up next</span><FitText text="FRANKIE" max={150} min={40}/><em>This Is Halloween — Karaoke</em></div><div className="tv-idle-qr"><QRCodeSVG value="https://snax-bunny-karaoke.snax-b0f.workers.dev/?join=now" size={220}/><strong>SCAN TO SING</strong></div></div>}</div><aside className="tv-side"><div className="tv-qr"><QRCodeSVG value="https://snax-bunny-karaoke.snax-b0f.workers.dev/?join=now" size={200}/><strong>SCAN TO SING</strong></div></aside></div></div></>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
