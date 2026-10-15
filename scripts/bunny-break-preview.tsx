// Local-only visual/audio QA; no live queue, credentials, or production route.
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QRCodeSVG} from 'qrcode.react';
import {BunnyBreakView} from '../app/bunny-break-view';
import {BunnyBreakMusic,BUNNY_BREAK_TRACKS} from '../app/bunny-break-music';
function Preview(){
  const [active,setActive]=useState(true),[status,setStatus]=useState('Audio not started'),[details,setDetails]=useState('');
  const music=useRef<BunnyBreakMusic|null>(null),context=useRef<AudioContext|null>(null);
  useEffect(()=>()=>{music.current?.dispose();void context.current?.close();},[]);
  async function start(){
    context.current??=new AudioContext();await context.current.resume();
    music.current??=new BunnyBreakMusic();music.current.prepare(context.current);music.current.sync('local-preview',true);
    setActive(true);setStatus(`Audio ${context.current.state}`);
    const decoded=await Promise.all(BUNNY_BREAK_TRACKS.map(async track=>{
      const response=await fetch(track.src);const buffer=await context.current!.decodeAudioData(await response.arrayBuffer());
      return `${track.title}: ${Math.round(buffer.duration)} seconds`;
    }));setDetails(decoded.join(' · '));
  }
  return <><nav style={{position:'fixed',bottom:0,left:0,zIndex:99,padding:8,background:'white',fontSize:12}}><button onClick={()=>void start()}>Start break audio</button> <button onClick={()=>{music.current?.sync(null,false);setActive(false);setStatus('Audio stopped');}}>End break</button><div role="status">{status} · {details}</div></nav><div className="tv-stage-full"><div className="tv-top"><div className="tv-brand"><strong>SNAX</strong></div><div className="tv-now"><span>Bunny bathroom break</span><strong>Snax will be right back!</strong></div><div className="tv-now tv-next"><span>After the break</span><strong>ALEX</strong></div></div><div className="tv-body"><div className="tv-video">{active?<BunnyBreakView/>:<p style={{padding:50,color:'white'}}>Break ended — karaoke resumes.</p>}</div><aside className="tv-side"><div className="tv-qr"><QRCodeSVG value="https://snax-bunny-karaoke.snax-b0f.workers.dev/?join=now" size={200}/><strong>SCAN TO SING</strong></div></aside></div></div></>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
