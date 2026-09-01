"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Song={videoId:string;title:string;channel:string;thumbnail:string};
type QueueItem={id:number;singerName:string;songTitle:string;videoTitle:string;videoId:string;thumbnailUrl:string;sortOrder:number;status:"pending"|"playing"|"done";startedAt:string|null};
type RoomState={code:string;playbackStatus:"idle"|"playing"|"paused";nowPlaying:QueueItem|null;queue:QueueItem[];completedCount:number};
type Screen="landing"|"name"|"singer"|"host"|"tv";
type Player={playVideo:()=>void;pauseVideo:()=>void;destroy?:()=>void};

declare global { interface Window { YT?:{Player:new(id:string,options:{height:string;width:string;videoId?:string;playerVars?:Record<string,number>;events:{onReady:()=>void;onStateChange:(event:{data:number})=>void;onError?:()=>void}})=>Player}; onYouTubeIframeAPIReady?:()=>void; } }

const cleanCode=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6);
const messageOf=(error:unknown)=>error instanceof Error?error.message:"Something went sideways. Try again.";

export default function Home(){
  const [screen,setScreen]=useState<Screen>("landing");
  const [roomCode,setRoomCode]=useState("");
  const [inviteToken,setInviteToken]=useState("");
  const [tvToken,setTvToken]=useState("");
  const [singerName,setSingerName]=useState("");
  const [room,setRoom]=useState<RoomState|null>(null);
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<Song[]>([]);
  const [searching,setSearching]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [tvActivated,setTvActivated]=useState(false);
  const codeRef=useRef(""); const inviteRef=useRef(""); const tvRef=useRef(""); const screenRef=useRef<Screen>("landing");
  const playerRef=useRef<Player|null>(null); const playerMountRef=useRef<HTMLDivElement|null>(null);

  useEffect(()=>{ screenRef.current=screen; },[screen]);

  const headersFor=useCallback((mode=screenRef.current)=>{
    const code=codeRef.current;
    if(mode==="host") return {"x-host-token":localStorage.getItem(`snax-host-${code}`)||""};
    if(mode==="tv") return {"x-tv-token":tvRef.current};
    return {"x-room-invite":inviteRef.current};
  },[]);

  const fetchRoom=useCallback(async(code:string,quiet=false,mode?:Screen)=>{
    try{
      const response=await fetch(`/api/rooms/${cleanCode(code)}`,{cache:"no-store",headers:headersFor(mode)});
      const data=await response.json() as RoomState&{error?:string};
      if(!response.ok) throw new Error(data.error||"That room has left the building.");
      setRoom(data); if(!quiet)setNotice(""); return data;
    }catch(error){if(!quiet)setNotice(messageOf(error));return null;}
  },[headersFor]);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const code=cleanCode(params.get("room")||params.get("host")||params.get("tv")||"");
    const invite=params.get("invite")||""; const television=params.get("screen")||"";
    if(params.get("host")&&code){
      const storedInvite=localStorage.getItem(`snax-invite-${code}`)||""; const storedTv=localStorage.getItem(`snax-tv-${code}`)||"";
      codeRef.current=code; inviteRef.current=storedInvite; tvRef.current=storedTv; setRoomCode(code);setInviteToken(storedInvite);setTvToken(storedTv);setScreen("host");void fetchRoom(code,false,"host");
    }else if(params.get("tv")&&code&&television.length>30){
      codeRef.current=code;tvRef.current=television;inviteRef.current=invite;setRoomCode(code);setTvToken(television);setInviteToken(invite);setScreen("tv");void fetchRoom(code,false,"tv");
    }else if(params.get("room")&&code&&invite.length>30){
      codeRef.current=code;inviteRef.current=invite;setRoomCode(code);setInviteToken(invite);setScreen("name");void fetchRoom(code,false,"name");
    }
  },[fetchRoom]);

  useEffect(()=>{
    if(!roomCode||!["host","singer","tv"].includes(screen))return;
    const timer=window.setInterval(()=>void fetchRoom(roomCode,true),screen==="tv"?900:1500);
    return()=>window.clearInterval(timer);
  },[fetchRoom,roomCode,screen]);

  const joinUrl=useMemo(()=>typeof window!=="undefined"&&roomCode&&inviteToken?`${window.location.origin}/?room=${roomCode}&invite=${encodeURIComponent(inviteToken)}`:"",[roomCode,inviteToken]);
  const tvUrl=useMemo(()=>typeof window!=="undefined"&&roomCode&&tvToken?`${window.location.origin}/?tv=${roomCode}&screen=${encodeURIComponent(tvToken)}&invite=${encodeURIComponent(inviteToken)}`:"",[roomCode,tvToken,inviteToken]);

  async function createRoom(){
    setBusy(true);setNotice("");
    try{const response=await fetch("/api/rooms",{method:"POST"});const data=await response.json() as {code?:string;hostToken?:string;inviteToken?:string;tvToken?:string;error?:string};
      if(!response.ok||!data.code||!data.hostToken||!data.inviteToken||!data.tvToken)throw new Error(data.error||"Couldn’t make the room.");
      localStorage.setItem(`snax-host-${data.code}`,data.hostToken);localStorage.setItem(`snax-invite-${data.code}`,data.inviteToken);localStorage.setItem(`snax-tv-${data.code}`,data.tvToken);
      codeRef.current=data.code;inviteRef.current=data.inviteToken;tvRef.current=data.tvToken;setRoomCode(data.code);setInviteToken(data.inviteToken);setTvToken(data.tvToken);history.replaceState({},"",`?host=${data.code}`);setScreen("host");await fetchRoom(data.code,false,"host");
    }catch(error){setNotice(messageOf(error));}finally{setBusy(false);}
  }

  async function control(action:"play"|"pause"|"skip"|"complete"|"move_up"|"move_down"|"delete",itemId?:number){
    setBusy(true);
    try{const response=await fetch(`/api/rooms/${codeRef.current}`,{method:"PATCH",headers:{"content-type":"application/json",...headersFor()},body:JSON.stringify({action,itemId})});const data=await response.json() as RoomState&{error?:string};if(!response.ok)throw new Error(data.error||"That control missed its cue.");setRoom(data);}
    catch(error){setNotice(messageOf(error));}finally{setBusy(false);}
  }

  async function search(event:FormEvent){
    event.preventDefault();if(query.trim().length<2)return;setSearching(true);setNotice("");
    try{const response=await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`,{headers:{"x-room-code":roomCode,"x-room-invite":inviteRef.current}});const data=await response.json() as {results?:Song[];error?:string};if(!response.ok)throw new Error(data.error||"Search took a mic break.");setResults(data.results||[]);if(!data.results?.length)setNotice("No karaoke tracks found. Try adding the artist name.");}
    catch(error){setNotice(messageOf(error));}finally{setSearching(false);}
  }

  async function addSong(song:Song){
    setBusy(true);setNotice("");
    try{const response=await fetch(`/api/rooms/${roomCode}`,{method:"POST",headers:{"content-type":"application/json","x-room-invite":inviteRef.current},body:JSON.stringify({singerName:singerName.trim(),songTitle:song.title,videoTitle:song.title,videoId:song.videoId,thumbnailUrl:song.thumbnail})});const data=await response.json() as RoomState&{error?:string};if(!response.ok)throw new Error(data.error||"That song missed the queue.");setRoom(data);setResults([]);setQuery("");setNotice("Your song is in the lineup!");}
    catch(error){setNotice(messageOf(error));}finally{setBusy(false);}
  }

  useEffect(()=>{
    if(screen!=="tv"||!tvActivated||!room?.nowPlaying||!playerMountRef.current)return;
    let cancelled=false;const current=room.nowPlaying;
    const build=()=>{if(cancelled||!window.YT||!playerMountRef.current)return;playerRef.current?.destroy?.();playerMountRef.current.replaceChildren();const target=document.createElement("div");target.id=`snax-player-${current.id}`;playerMountRef.current.appendChild(target);playerRef.current=new window.YT.Player(target.id,{height:"100%",width:"100%",videoId:current.videoId,playerVars:{autoplay:1,controls:0,disablekb:1,fs:0,rel:0,playsinline:1},events:{onReady:()=>room.playbackStatus==="paused"?playerRef.current?.pauseVideo():playerRef.current?.playVideo(),onStateChange:(event)=>{if(event.data===0)void control("complete",current.id);},onError:()=>{setNotice("That upload can’t play here, so the TV is moving on.");window.setTimeout(()=>void control("complete",current.id),900);}}});};
    if(window.YT)build();else{window.onYouTubeIframeAPIReady=build;if(!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')){const script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";document.head.appendChild(script);}}
    return()=>{cancelled=true;playerRef.current?.destroy?.();playerRef.current=null;playerMountRef.current?.replaceChildren();};
  },[room?.nowPlaying?.id,screen,tvActivated]);

  useEffect(()=>{if(screen!=="tv"||!tvActivated||!room?.nowPlaying)return;if(room.playbackStatus==="paused")playerRef.current?.pauseVideo();if(room.playbackStatus==="playing")playerRef.current?.playVideo();},[room?.playbackStatus,room?.nowPlaying,screen,tvActivated]);

  function home(){history.replaceState({},"","/");setScreen("landing");setRoom(null);setNotice("");}

  return <main className={`snax-shell view-${screen}`}>
    {screen!=="tv"&&<div className="marquee" aria-hidden="true"><span>SNAX THE BUNNY</span><i>★</i><span>KARAOKE NIGHT</span><i>★</i><span>SNAX THE BUNNY</span></div>}
    {notice&&<div className="toast" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}

    {screen==="landing"&&<>
      <section className="hero"><div className="hero-copy"><p className="eyebrow">Live from the bunny lounge</p><h1>Take the mic.<br/><em>Make it a moment.</em></h1><p className="lede">A karaoke room for hosts, singers, and everyone watching from the couch.</p></div><SnaxPortrait/></section>
      <section className="role-grid"><article className="role-card host-card"><span className="role-number">01</span><div><p className="card-kicker">Running the room?</p><h2>Host console</h2><p>Start a private room, manage the lineup, and keep the night moving.</p></div><button type="button" onClick={createRoom} disabled={busy}>Start a room <span>→</span></button></article><article className="role-card singer-card"><span className="role-number">02</span><div><p className="card-kicker">Ready to sing?</p><h2>Singer view</h2><p>Scan the TV code, pick your name, and search YouTube karaoke tracks.</p></div><div className="scan-note"><span className="mini-qr">▦</span> Join by scanning the room QR</div></article><article className="role-card tv-card"><span className="role-number">03</span><div><p className="card-kicker">On the big screen</p><h2>TV display</h2><p>Lyrics, now singing, who’s next, and a QR code that stays visible.</p></div><div className="tv-preview"><span>NOW SINGING</span><strong>SNAX</strong><i>♪</i></div></article></section>
      <Footer/>
    </>}

    {screen==="name"&&<section className="phone-stage"><button className="wordmark" onClick={home}>SNAX</button><div className="phone-card name-card"><SnaxPortrait small/><p className="eyebrow">Room {roomCode}</p><h1>What’s your stage name?</h1><form onSubmit={(event)=>{event.preventDefault();if(!singerName.trim()){setNotice("Give us a stage name first.");return;}setScreen("singer");}}><label htmlFor="singer">Name</label><input id="singer" value={singerName} onChange={event=>setSingerName(event.target.value)} maxLength={32} placeholder="Bunnyoncé" autoFocus/><button disabled={busy}>Enter the room <span>→</span></button></form><p className="fine">No sign-in. Just songs.</p></div></section>}

    {screen==="singer"&&<section className="singer-stage"><header className="app-header"><button className="wordmark" onClick={home}>SNAX</button><span>Room <strong>{roomCode}</strong></span><span className="singer-chip">{singerName}</span></header><div className="singer-grid"><div className="search-panel"><p className="eyebrow">You’re in, {singerName}</p><h1>Pick your song</h1><form className="song-search" onSubmit={search}><label htmlFor="song">Search a song or artist</label><div><input id="song" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Robyn, Chappell Roan, ABBA…"/><button disabled={searching}>{searching?"Searching…":"Find karaoke"}</button></div><small>We automatically add “karaoke lyrics” to every YouTube search.</small></form><div className="results">{results.map(song=><article key={song.videoId}><img src={song.thumbnail} alt=""/><div><strong>{song.title}</strong><small>{song.channel}</small><button onClick={()=>void addSong(song)} disabled={busy}>Add to lineup +</button></div></article>)}</div></div><QueuePanel room={room} busy={busy} onControl={control}/></div></section>}

    {screen==="host"&&<section className="host-stage"><header className="app-header"><button className="wordmark" onClick={home}>SNAX</button><div className="host-room">Host console · Room <strong>{roomCode}</strong></div><button className="open-tv" onClick={()=>window.open(tvUrl,"_blank","noopener,noreferrer")}>Open TV display ↗</button></header><div className="host-grid"><section className="host-controls"><p className="eyebrow">Playback</p><h1>{room?.nowPlaying?room.nowPlaying.singerName:"Ready when you are"}</h1><p className="current-song">{room?.nowPlaying?.songTitle||"Start playback when the first song hits the lineup."}</p><div className="control-row"><button className="play-control" onClick={()=>void control(room?.playbackStatus==="playing"?"pause":"play")} disabled={busy||(!room?.nowPlaying&&!room?.queue.length)}>{room?.playbackStatus==="playing"?"Pause":"Play"} <span>{room?.playbackStatus==="playing"?"Ⅱ":"▶"}</span></button><button onClick={()=>void control("skip",room?.nowPlaying?.id)} disabled={busy||!room?.nowPlaying}>Skip <span>→</span></button></div><div className="host-tip">Playback happens on the TV display. Keep this host console open on your phone or laptop.</div></section><section className="host-join"><p className="eyebrow">Guest entry</p><h2>{roomCode}</h2>{joinUrl&&<QRCodeSVG value={joinUrl} size={174} level="M" marginSize={1} bgColor="#fffdf7" fgColor="#111111"/>}<p>Guests scan this code to choose a name and add songs. No account needed.</p></section><QueuePanel room={room} busy={busy} onControl={control} host/></div></section>}

    {screen==="tv"&&<section className="tv-stage-full"><div className="tv-brand"><img src="/snax-profile-hd.png" alt="Snax the Bunny"/><strong>SNAX</strong><span>Karaoke</span></div><div className="tv-video"><div ref={playerMountRef} className="youtube-player"/>{(!tvActivated||!room?.nowPlaying)&&<div className="tv-idle"><span>{room?.queue.length?"Up first":"Welcome to"}</span><strong>{room?.queue[0]?.singerName||"Snax Karaoke"}</strong><em>{room?.queue[0]?.songTitle||"Scan the code. Pick a song. Take the mic."}</em>{!tvActivated&&<button onClick={()=>setTvActivated(true)}>Enable TV playback <span>▶</span></button>}</div>}<div className="tv-bottom"><div><span>{room?.nowPlaying?"Now singing":"Next up"}</span><strong>{room?.nowPlaying?.singerName||room?.queue[0]?.singerName||"The stage is open"}</strong><em>{room?.nowPlaying?.songTitle||room?.queue[0]?.songTitle||"Add a song from your phone"}</em></div><ol>{room?.queue.slice(room?.nowPlaying?0:1,room?.nowPlaying?3:4).map((item,index)=><li key={item.id}><span>{index+1}</span><div><strong>{item.singerName}</strong><small>{item.songTitle}</small></div></li>)}</ol></div>{joinUrl&&<aside className="tv-qr"><strong>{roomCode}</strong><QRCodeSVG value={joinUrl} size={112} level="M" marginSize={1} bgColor="#fffdf7" fgColor="#111111"/></aside>}</div></section>}
  </main>;
}

function SnaxPortrait({small=false}:{small?:boolean}){return <div className={`snax-portrait-wrap ${small?"portrait-small":""}`}><div className="ear ear-left"/><div className="ear ear-right"/><img src="/snax-profile-hd.png" alt="Snax the Bunny" className="snax-portrait"/>{!small&&<span className="portrait-label">Hosted by Snax</span>}</div>}
function Footer(){return <footer><strong>SNAX</strong><span>Despite all my rage, I am still just a rabbit on stage.</span><a href="https://www.instagram.com/snaxthebunny/" target="_blank" rel="noreferrer">@snaxthebunny ↗</a></footer>}
function QueuePanel({room,busy,onControl,host=false}:{room:RoomState|null;busy:boolean;host?:boolean;onControl:(action:"move_up"|"move_down"|"delete",id:number)=>Promise<void>}){return <section className={`queue-panel ${host?"host-queue":""}`}><div className="queue-title"><div><p className="eyebrow">The lineup</p><h2>Who’s next?</h2></div><span>{room?.queue.length||0} waiting</span></div>{room?.nowPlaying&&<div className="now-card"><span>Now singing</span><strong>{room.nowPlaying.singerName}</strong><small>{room.nowPlaying.songTitle}</small></div>}<ol>{room?.queue.map((item,index)=><li key={item.id}><span className="queue-position">{index+1}</span><div className="queue-copy"><strong>{item.singerName}</strong><small>{item.songTitle}</small></div><div className="queue-actions"><button onClick={()=>void onControl("move_up",item.id)} disabled={busy||index===0} aria-label="Move song up">↑</button><button onClick={()=>void onControl("move_down",item.id)} disabled={busy||index===room.queue.length-1} aria-label="Move song down">↓</button><button onClick={()=>void onControl("delete",item.id)} disabled={busy} aria-label="Delete song">×</button></div></li>)}{!room?.queue.length&&<li className="empty-queue">No one’s waiting yet. The microphone is getting nervous.</li>}</ol></section>}
