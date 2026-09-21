"use client";

import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { TvPlayback, type TvPlayer } from "./tv-playback";
import { acceptHostInvite, hostShareLink } from "./host-access";

type Song={videoId:string;title:string;channel:string;thumbnail:string};
type QueueItem={id:number;singerName:string;songTitle:string;videoTitle:string;videoId:string;thumbnailUrl:string;sortOrder:number;status:"pending"|"playing"|"done";startedAt:string|null;sungCount?:number};
type RoomState={code:string;playbackStatus:"idle"|"playing"|"paused";requestsOpen:boolean;requestsToggle:boolean;endsAt:string|null;cutoffMinutes:number;isCurrent?:boolean;nowPlaying:QueueItem|null;queue:QueueItem[];completedCount:number};
type Screen="landing"|"name"|"singer"|"host"|"tv";
type Player=TvPlayer;

declare global { interface Window { YT?:{Player:new(id:string,options:{height:string;width:string;videoId?:string;playerVars?:Record<string,number>;events:{onReady:(event:{target:Player})=>void;onStateChange:(event:{data:number})=>void;onError?:()=>void;onAutoplayBlocked?:()=>void}})=>Player}; onYouTubeIframeAPIReady?:()=>void; } }

const cleanCode=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6);
const messageOf=(error:unknown)=>error instanceof Error?error.message:"Something went sideways. Try again.";

export default function Home(){
  const [screen,setScreen]=useState<Screen>("landing");
  const [roomCode,setRoomCode]=useState("");
  const [inviteToken,setInviteToken]=useState("");
  const [tvToken,setTvToken]=useState("");
  const [singerName,setSingerName]=useState("");
  const [room,setRoom]=useState<RoomState|null>(null);
  const [canHost,setCanHost]=useState(false);
  const [hostShareUrl,setHostShareUrl]=useState("");
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<Song[]>([]);
  const [searching,setSearching]=useState(false);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [autoplayBlocked,setAutoplayBlocked]=useState(false);
  // Between songs the TV shows a short "up next" card (Snax + QR + who's next) for
  // ten seconds, then the next video takes the whole player area — nothing is ever
  // drawn on top of the YouTube player itself.
  const [interlude,setInterlude]=useState(false);
  // Local paging through one search's results — never triggers another YouTube call.
  const PAGE_SIZE=12; const [shown,setShown]=useState(PAGE_SIZE);
  const [consent,setConsent]=useState(false);
  const [endsAtInput,setEndsAtInput]=useState(""); const endsAtFocused=useRef(false);
  // Keep the last-call box in sync with the room (shown in the host's local time).
  useEffect(()=>{ if(endsAtFocused.current) return; if(!room?.endsAt){ setEndsAtInput(""); return; } const d=new Date(room.endsAt); if(Number.isNaN(d.getTime())) return; setEndsAtInput(`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`); },[room?.endsAt]);
  // "11:45 PM" typed on the host's phone means tonight — or early tomorrow for a
  // past-midnight last call — and is sent to the server as an absolute UTC instant.
  function lastCallFromTime(value:string){ const [h,m]=value.split(":").map(Number); if(Number.isNaN(h)||Number.isNaN(m)) return null; const now=new Date(); const target=new Date(now.getFullYear(),now.getMonth(),now.getDate(),h,m,0,0); if(target.getTime()<now.getTime()-6*60*60*1000) target.setDate(target.getDate()+1); return target.toISOString(); }
  const [offline,setOffline]=useState(false);
  const codeRef=useRef(""); const inviteRef=useRef(""); const tvRef=useRef(""); const screenRef=useRef<Screen>("landing");
  const tvPlaybackRef=useRef<TvPlayback|null>(null);
  const completeSongRef=useRef<(id:number)=>Promise<boolean>>(async()=>false); const playerMountRef=useRef<HTMLDivElement|null>(null);

  useEffect(()=>{ screenRef.current=screen; },[screen]);
  useEffect(()=>{ setConsent(localStorage.getItem("snax-consent")==="1"); },[]);
  function acceptConsent(value:boolean){ setConsent(value); try{ localStorage.setItem("snax-consent",value?"1":"0"); }catch{} }

  const headersFor=useCallback((mode=screenRef.current):Record<string,string>=>{
    const code=codeRef.current;
    if(mode==="host"){ const token=localStorage.getItem(`snax-host-${code}`); if(token)return {"x-host-token":token}; return {"x-room-invite":inviteRef.current}; }
    if(mode==="tv") return {"x-tv-token":tvRef.current};
    return {"x-room-invite":inviteRef.current};
  },[]);

  const fetchRoom=useCallback(async(code:string,quiet=false,mode?:Screen)=>{
    try{
      const response=await fetch(`/api/rooms/${cleanCode(code)}`,{cache:"no-store",headers:headersFor(mode)});
      const data=await response.json() as RoomState&{error?:string};
      if(!response.ok) throw new Error(data.error||"That room has left the building.");
      if(codeRef.current!==cleanCode(code))return null;
      if((mode||screenRef.current)==="host"){
        const token=localStorage.getItem(`snax-host-${cleanCode(code)}`)||"";
        setCanHost(!!token);setHostShareUrl(hostShareLink(window.location.origin,cleanCode(code),token));
      }
      setRoom(data); setOffline(false); if(!quiet)setNotice(""); return data;
    }catch(error){
      // A dropped poll on venue wifi must not blank the room. Keep showing the
      // last good state and quietly flag that we are behind.
      setOffline(true);
      if(!quiet)setNotice(messageOf(error));
      return null;
    }
  },[headersFor]);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const code=cleanCode(params.get("room")||params.get("host")||params.get("tv")||"");
    const invite=params.get("invite")||""; const television=params.get("screen")||"";
    if(params.get("host")&&code){
      const hostKey=new URLSearchParams(window.location.hash.slice(1)).get("hostKey");
      void (async()=>{
        if(hostKey){
          setBusy(true);
          try{await acceptHostInvite(code,hostKey,localStorage);}
          finally{history.replaceState({},"",`?host=${code}`);setBusy(false);}
        }
        await openHostRoom(code);
      })().catch(error=>setNotice(messageOf(error)));
    }else if(params.get("tv")&&code&&television.length>30){
      codeRef.current=code;tvRef.current=television;inviteRef.current=invite;setRoomCode(code);setTvToken(television);setInviteToken(invite);setScreen("tv");void fetchRoom(code,false,"tv");
    }else if(params.get("room")&&code&&invite.length>30){
      codeRef.current=code;inviteRef.current=invite;setRoomCode(code);setInviteToken(invite);setScreen("name");void fetchRoom(code,false,"name");
    }else if(params.get("tv")==="now"){
      // Hub page "Open TV display": bring up the big screen for tonight's room.
      void openCurrentTv();
    }else if(params.get("join")==="now"){
      // Static singer QR (hub page / printed cards): look up tonight's room and walk in.
      void joinCurrentRoom();
    }else if(params.get("start")==="host"){
      // Arriving from the jessaceti.com/snaxkaraoke hub, where consent was already given.
      // Rejoin tonight's room without replacing its queue on a new device.
      acceptConsent(true); void resumeOrCreateRoom();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[fetchRoom]);

  // Polling is what keeps every phone in the room looking at the same lineup, and
  // it is also the whole request bill. Only poll a visible tab, and back off when
  // the network is unhappy rather than hammering it.
  useEffect(()=>{
    if(!roomCode||!["host","singer","tv"].includes(screen))return;
    // TV refreshes every second (it drives playback), the host every 2.5s, and guest
    // phones every 4s — that's the polling budget for a 50-phone room on Cloudflare.
    const base=screen==="tv"?1000:screen==="host"?2500:4000;
    let timer=0; let failures=0; let stopped=false;

    const tick=async()=>{
      if(stopped)return;
      if(document.visibilityState==="hidden"){ timer=window.setTimeout(tick,base); return; }
      const result=await fetchRoom(roomCode,true);
      failures=result?0:Math.min(failures+1,5);
      if(!stopped) timer=window.setTimeout(tick,base*(failures?2**failures:1));
    };

    const wake=()=>{ if(document.visibilityState==="visible"){ window.clearTimeout(timer); failures=0; void tick(); } };
    document.addEventListener("visibilitychange",wake);
    timer=window.setTimeout(tick,base);
    return()=>{ stopped=true; window.clearTimeout(timer); document.removeEventListener("visibilitychange",wake); };
  },[fetchRoom,roomCode,screen]);


  async function joinCurrentRoom(){
    setBusy(true);setNotice("");
    try{const response=await fetch("/api/rooms/current",{cache:"no-store"});const data=await response.json() as {code?:string;inviteToken?:string;error?:string};
      if(!response.ok||!data.code||!data.inviteToken)throw new Error(data.error||"Snax hasn’t opened tonight’s room yet. Hang tight.");
      codeRef.current=data.code;inviteRef.current=data.inviteToken;setRoomCode(data.code);setInviteToken(data.inviteToken);history.replaceState({},"",`?room=${data.code}&invite=${encodeURIComponent(data.inviteToken)}`);setScreen("name");await fetchRoom(data.code,false,"name");
    }catch(error){history.replaceState({},"","/");setScreen("landing");setNotice(messageOf(error));}finally{setBusy(false);}
  }

  async function openCurrentTv(){
    setBusy(true);setNotice("");
    try{const response=await fetch("/api/rooms/current",{cache:"no-store"});const data=await response.json() as {code?:string;inviteToken?:string;tvToken?:string|null;error?:string};
      if(!response.ok||!data.code||!data.inviteToken)throw new Error(data.error||"Snax hasn’t opened tonight’s room yet. Hang tight.");
      if(!data.tvToken)throw new Error("Tonight’s room was opened before TV links existed — start a fresh room from the host console.");
      codeRef.current=data.code;tvRef.current=data.tvToken;inviteRef.current=data.inviteToken;setRoomCode(data.code);setTvToken(data.tvToken);setInviteToken(data.inviteToken);history.replaceState({},"",`?tv=${data.code}&screen=${encodeURIComponent(data.tvToken)}&invite=${encodeURIComponent(data.inviteToken)}`);setScreen("tv");await fetchRoom(data.code,false,"tv");
    }catch(error){history.replaceState({},"","/");setScreen("landing");setNotice(messageOf(error));}finally{setBusy(false);}
  }

  async function openHostRoom(code:string,current?:{inviteToken?:string;tvToken?:string|null}){
    codeRef.current=code;
    inviteRef.current=current?.inviteToken||localStorage.getItem(`snax-invite-${code}`)||"";
    tvRef.current=current?.tvToken||localStorage.getItem(`snax-tv-${code}`)||"";
    if(!inviteRef.current){
      const response=await fetch("/api/rooms/current",{cache:"no-store"});
      if(response.ok){const live=await response.json() as {code:string;inviteToken?:string;tvToken?:string};if(live.code===code){inviteRef.current=live.inviteToken||"";tvRef.current=live.tvToken||"";}}
    }
    setCanHost(false);setHostShareUrl("");
    setRoom(null);setRoomCode(code);setInviteToken(inviteRef.current);setTvToken(tvRef.current);
    screenRef.current="host";setScreen("host");history.replaceState({},"",`?host=${code}`);
    await fetchRoom(code,false,"host");
  }

  async function resumeOrCreateRoom(){
    setBusy(true);setNotice("");
    try{
      const response=await fetch("/api/rooms/current",{cache:"no-store"});
      if(response.status===404){await createRoom();return;}
      const data=await response.json() as {code?:string;inviteToken?:string;tvToken?:string|null;error?:string};
      if(!response.ok||!data.code)throw new Error(data.error||"Couldn’t reconnect to tonight’s room. Please try again.");
      await openHostRoom(data.code,data);
    }catch(error){setNotice(messageOf(error));}finally{setBusy(false);}
  }

  async function createRoom(){
    setBusy(true);setNotice("");
    try{const response=await fetch("/api/rooms",{method:"POST"});const data=await response.json() as {code?:string;hostToken?:string;inviteToken?:string;tvToken?:string;error?:string};
      if(!response.ok||!data.code||!data.hostToken||!data.inviteToken||!data.tvToken)throw new Error(data.error||"Couldn’t make the room.");
      localStorage.setItem(`snax-host-${data.code}`,data.hostToken);localStorage.setItem(`snax-invite-${data.code}`,data.inviteToken);localStorage.setItem(`snax-tv-${data.code}`,data.tvToken);
      codeRef.current=data.code;inviteRef.current=data.inviteToken;tvRef.current=data.tvToken;setCanHost(true);setRoomCode(data.code);setInviteToken(data.inviteToken);setTvToken(data.tvToken);history.replaceState({},"",`?host=${data.code}`);setScreen("host");await fetchRoom(data.code,false,"host");
    }catch(error){setNotice(messageOf(error));}finally{setBusy(false);}
  }

  async function control(action:"play"|"pause"|"skip"|"complete"|"move_up"|"move_down"|"delete",itemId?:number){
    setBusy(true);
    try{const response=await fetch(`/api/rooms/${codeRef.current}`,{method:"PATCH",headers:{"content-type":"application/json",...headersFor()},body:JSON.stringify({action,itemId})});const data=await response.json() as RoomState&{error?:string};if(!response.ok)throw new Error(data.error||"That control missed its cue.");setRoom(data);return true;}
    catch(error){setNotice(messageOf(error));return false;}finally{setBusy(false);}
  }
  completeSongRef.current=(id)=>control("complete",id);

  async function setEvent(body:Record<string,unknown>){
    setBusy(true);
    try{const response=await fetch(`/api/rooms/${codeRef.current}`,{method:"PATCH",headers:{"content-type":"application/json",...headersFor("host")},body:JSON.stringify(body)});const data=await response.json() as RoomState&{error?:string};if(!response.ok)throw new Error(data.error||"That setting didn’t stick.");setRoom(data);}
    catch(error){setNotice(messageOf(error));}finally{setBusy(false);}
  }

  async function runSearch(term:string){
    setSearching(true);setNotice("");
    try{const response=await fetch(`/api/search?q=${encodeURIComponent(term)}`,{headers:{"x-room-code":roomCode,"x-room-invite":inviteRef.current}});const data=await response.json() as {results?:Song[];error?:string};if(!response.ok)throw new Error(data.error||"Search took a mic break.");
      const incoming=data.results||[]; setResults(incoming); setShown(PAGE_SIZE);
      if(!incoming.length)setNotice("No karaoke tracks found. Try adding the artist name.");}
    catch(error){setNotice(messageOf(error));}finally{setSearching(false);}
  }
  async function search(event:FormEvent){
    event.preventDefault();const term=query.trim();if(term.length<2)return;await runSearch(term);
  }


  async function addSong(song:Song){
    setBusy(true);setNotice("");
    try{const response=await fetch(`/api/rooms/${roomCode}`,{method:"POST",headers:{"content-type":"application/json","x-room-invite":inviteRef.current},body:JSON.stringify({singerName:singerName.trim(),songTitle:song.title,videoTitle:song.title,videoId:song.videoId,thumbnailUrl:song.thumbnail})});const data=await response.json() as RoomState&{error?:string};if(!response.ok)throw new Error(data.error||"That song missed the queue.");setRoom(data);setResults([]);setShown(PAGE_SIZE);setQuery("");setNotice("Your song is in the lineup!");}
    catch(error){setNotice(messageOf(error));}finally{setBusy(false);}
  }

  useEffect(()=>{
    if(screen!=="tv"||!playerMountRef.current)return;
    let cancelled=false;
    let player:Player|null=null;
    let ready=false;
    const playback=new TvPlayback({interlude:setInterlude,blocked:setAutoplayBlocked,complete:id=>completeSongRef.current(id),error:()=>setNotice("That upload can’t play here, so the TV is moving on.")});
    tvPlaybackRef.current=playback;
    const build=()=>{
      if(cancelled||player||!window.YT?.Player||!playerMountRef.current)return;
      const target=document.createElement("div");target.id="snax-tv-player";playerMountRef.current.appendChild(target);
      player=new window.YT.Player(target.id,{height:"100%",width:"100%",playerVars:{autoplay:0,controls:1,rel:0,playsinline:1},events:{onReady:event=>{if(!cancelled){ready=true;playback.attach(event.target);}},onAutoplayBlocked:()=>playback.autoplayBlocked(),onStateChange:event=>playback.stateChanged(event.data),onError:()=>playback.playerError()}});
    };
    if(window.YT?.Player)build();else{window.onYouTubeIframeAPIReady=build;if(!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')){const script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";document.head.appendChild(script);}}
    return()=>{cancelled=true;playback.dispose();if(!ready)player?.destroy();tvPlaybackRef.current=null;playerMountRef.current?.replaceChildren();if(window.onYouTubeIframeAPIReady===build)window.onYouTubeIframeAPIReady=undefined;};
  },[screen,roomCode]);

  useEffect(()=>{tvPlaybackRef.current?.update(room?.nowPlaying||null,room?.playbackStatus||"idle");},[room,screen,roomCode]);

  function home(){history.replaceState({},"","/");setScreen("landing");setRoom(null);setNotice("");}
  async function copyHostLink(){
    try{await navigator.clipboard.writeText(hostShareUrl);setNotice("Private host link copied. Share only with people who should control the show.");}
    catch{setNotice("Couldn’t copy the link. Have your co-host scan the private host QR instead.");}
  }

  return <main className={`snax-shell view-${screen}`}>
    {screen!=="tv"&&<div className="marquee" aria-hidden="true"><span>SNAX THE BUNNY</span><i>★</i><span>KARAOKE NIGHT</span><i>★</i><span>SNAX THE BUNNY</span></div>}
    {notice&&<div className="toast" role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
    {offline&&["host","singer","tv"].includes(screen)&&<div className="offline-flag" role="status">Reconnecting…</div>}

    {screen==="landing"&&<>
      <section className="hero"><div className="hero-copy"><p className="eyebrow">Live from the bunny lounge</p><h1>Take the mic.<br/><em>Make it a magic moment.</em></h1></div><SnaxPortrait/></section>
      <section className="role-grid"><article className="role-card host-card"><span className="role-number">01</span><div><p className="card-kicker">Running the room?</p><h2>Host console</h2><p>Start a private room, manage the lineup, and keep the night moving.</p></div><label className="consent-check"><input type="checkbox" checked={consent} onChange={event=>acceptConsent(event.target.checked)}/><span>I agree to the <a href="/privacy">Privacy Policy</a>, <a href="/terms">Terms</a>, and <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms</a>.</span></label><button type="button" onClick={resumeOrCreateRoom} disabled={busy||!consent}>Open host console <span>→</span></button></article><article className="role-card singer-card"><span className="role-number">02</span><div><p className="card-kicker">Ready to sing?</p><h2>Singer view</h2><p>Scan the TV code, pick your name, and search YouTube karaoke tracks.</p></div><div className="scan-note"><span className="mini-qr">▦</span> Join by scanning the room QR</div></article><article className="role-card tv-card"><span className="role-number">03</span><div><p className="card-kicker">On the big screen</p><h2>TV display</h2><p>Lyrics, now singing, who’s next, and a QR code that stays visible.</p></div><div className="tv-preview"><span>NOW SINGING</span><strong>SNAX</strong><i>♪</i></div></article></section>
      <Footer/>
    </>}

    {screen==="name"&&<section className="phone-stage"><button className="wordmark" onClick={home}>SNAX</button><div className="phone-card name-card"><SnaxPortrait small/><p className="eyebrow">Room {roomCode}</p><h1>What’s your stage name?</h1><form onSubmit={(event)=>{event.preventDefault();if(!singerName.trim()){setNotice("Give us a stage name first.");return;}if(!consent){setNotice("Tick the box and you’re in.");return;}setScreen("singer");}}><label htmlFor="singer">Name</label><input id="singer" value={singerName} onChange={event=>setSingerName(event.target.value)} maxLength={32} placeholder="Bunnyoncé" autoFocus/><label className="consent-check"><input type="checkbox" checked={consent} onChange={event=>acceptConsent(event.target.checked)}/><span>I agree to the <a href="/privacy">Privacy Policy</a>, <a href="/terms">Terms</a>, and <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms</a>.</span></label><button disabled={busy||!consent}>Enter the room <span>→</span></button></form><p className="fine">No sign-in. Just songs.</p></div></section>}

    {screen==="singer"&&<section className="singer-stage"><header className="app-header"><button className="wordmark" onClick={home}>SNAX</button><span>Room <strong>{roomCode}</strong></span><span className="singer-chip">{singerName}</span></header><div className="singer-grid"><div className="search-panel"><p className="eyebrow">You’re in, {singerName}</p><h1>Pick your song</h1>{room&&!room.requestsOpen&&<p className="requests-closed">Requests are closed for tonight. The bunny is tired.</p>}{(!room||room.requestsOpen)&&<><form className="song-search" onSubmit={search}><label htmlFor="song">Search a song or artist</label><div><input id="song" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Robyn, Chappell Roan, ABBA…"/><button disabled={searching}>{searching?"Searching…":"Find karaoke"}</button></div><small>Karaoke with lyrics first, with HD versions preferred.</small></form><div className="results">{results.slice(0,shown).map(song=><article key={song.videoId}><img src={song.thumbnail} alt=""/><div><strong><a href={`https://www.youtube.com/watch?v=${song.videoId}`} target="_blank" rel="noreferrer" title="Open on YouTube">{song.title}</a></strong><small>{song.channel}</small><button onClick={()=>void addSong(song)} disabled={busy}>Add to lineup +</button></div></article>)}</div>{results.length>shown&&<button type="button" className="load-more" onClick={()=>setShown(count=>count+PAGE_SIZE)}>Show more ({results.length-shown} left) ↓</button>}{results.length>0&&results.length<=shown&&<p className="results-end">That’s every match for this search. Try adding the artist or a word from the title for more.</p>}</>}</div><QueuePanel room={room} busy={busy} onControl={control}/></div></section>}

    {screen==="host"&&<section className="host-stage"><header className="app-header"><button className="wordmark" onClick={home}>SNAX</button><div className="host-room">Host console · Room <strong>{roomCode}</strong></div></header>
      {room?.isCurrent===false&&<div className="requests-closed">This is an older room. The TV and singer QR may be using tonight’s room. <button onClick={resumeOrCreateRoom} disabled={busy}>Connect to tonight’s room</button></div>}
      {!canHost&&<div className="requests-closed">Viewing only. Ask a host to share the private “Scan to host” QR from their host console to enable your controls.</div>}
      <div className="host-grid"><section className="host-controls"><p className="eyebrow">Playback</p><h1>{room?.nowPlaying?room.nowPlaying.singerName:"Ready when you are"}</h1>{room?.nowPlaying&&<p className="current-song">{room.nowPlaying.songTitle}</p>}<div className="control-row"><button className="play-control" onClick={()=>void control(room?.playbackStatus==="playing"?"pause":"play")} disabled={!canHost||busy||(!room?.nowPlaying&&!room?.queue.length)}>{room?.playbackStatus==="playing"?"Pause":"Play"} <span>{room?.playbackStatus==="playing"?"Ⅱ":"▶"}</span></button><button onClick={()=>void control("skip",room?.nowPlaying?.id)} disabled={!canHost||busy||!room?.nowPlaying}>Skip <span>→</span></button></div>
      </section><QueuePanel room={room} busy={!canHost||busy} onControl={control} host/><section className="host-night">
      <div className="event-controls">
        <h2>Run the night</h2>
        <label className="event-toggle"><input type="checkbox" checked={!!room?.requestsToggle} disabled={!canHost||busy} onChange={event=>void setEvent({action:"set_requests",requestsOpen:event.target.checked})}/><span>{room?.requestsOpen?"Song requests are open":room?.requestsToggle?"Requests closed — past last call":"Song requests are closed"}</span></label>
        <div className="event-row">
          <label className="event-field">Last call
            <input type="time" value={endsAtInput} disabled={!canHost||busy} onFocus={()=>{endsAtFocused.current=true;}} onChange={event=>{const value=event.target.value;setEndsAtInput(value);if(value.length===5)void setEvent({action:"set_end_time",endsAt:lastCallFromTime(value)});}} onBlur={()=>{endsAtFocused.current=false;if(endsAtInput.length===5)void setEvent({action:"set_end_time",endsAt:lastCallFromTime(endsAtInput)});}}/>
          </label>
          <button type="button" className="event-clear" disabled={!canHost||busy||!room?.endsAt} onClick={()=>{setEndsAtInput("");void setEvent({action:"set_end_time",endsAt:null});}}>Clear</button>
        </div>
        <p className="event-note">{room?.endsAt?`Last call ${new Date(room.endsAt).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})} — requests close on their own at ${new Date(new Date(room.endsAt).getTime()-(room.cutoffMinutes||15)*60000).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"})}. Flip the toggle back on to reopen anytime.`:`Set tonight’s last call and requests close on their own ${room?.cutoffMinutes??15} minutes before it.`}</p>
        <div className="event-actions">
          <button type="button" disabled={!canHost||busy||(room?.queue.length||0)<2} onClick={()=>void setEvent({action:"balance"})}>Balance the lineup</button>
          <button type="button" disabled={!canHost||busy||!room?.queue.length} onClick={()=>{const count=room?.queue.length||0;if(window.confirm(`Clear all ${count} waiting ${count===1?"song":"songs"}? This cannot be undone. Any song currently playing will continue.`))void setEvent({action:"clear_queue"});}}>Clear queue</button>
        </div>
        <p className="event-note">Balance puts first-timers ahead and spaces out repeat singers, so nobody sings twice before everyone waiting has had a turn.</p>
      </div>
      {canHost&&hostShareUrl&&<section className="host-share" aria-label="Private host invitation">
        <div><p className="eyebrow">Private · Hosts only</p><h2>Scan to host</h2><p>Anyone who scans this can control this room’s playback and lineup. Keep it off the public TV.</p><button type="button" onClick={()=>void copyHostLink()}>Copy private host link</button><small>Room {roomCode} · Same code for this room</small></div>
        <QRCodeSVG value={hostShareUrl} size={220} level="M" marginSize={4} bgColor="#ffffff" fgColor="#000000" title="Private QR: scan to control this karaoke room"/>
      </section>}
      </section></div></section>}

    {screen==="tv"&&<section className="tv-stage-full">
      <header className="tv-top">
        <div className="tv-brand"><img src="/snax-profile-hd.png" alt="Snax the Bunny"/><strong>SNAX</strong><span>Karaoke</span></div>
        <div className="tv-now" aria-live="polite">{room?.nowPlaying?<><span>{room.playbackStatus==="paused"?"Paused · Now singing":interlude?"Taking the mic":"Now singing"}</span><FitText text={room.nowPlaying.singerName} max={40} min={18}/><a href={`https://www.youtube.com/watch?v=${room.nowPlaying.videoId}`} target="_blank" rel="noreferrer">{room.nowPlaying.videoTitle} ↗</a></>:<><span>Now singing</span><FitText text="The stage is open" max={40} min={18}/><em>Ready when you are</em></>}</div>
        <div className="tv-now tv-next" aria-live="polite"><span>Up next</span><FitText text={room?.queue[0]?.singerName||"You could be next"} max={34} min={18}/><em>{room?.queue[0]?.songTitle||"Scan the QR to add a song"}</em></div>
      </header>
      <div className="tv-body">
        <div className="tv-video">
          <div ref={playerMountRef} className="youtube-player" style={{visibility:room?.nowPlaying&&!interlude?"visible":"hidden"}} aria-hidden={!room?.nowPlaying||interlude}/>
          {(!room?.nowPlaying||interlude)&&<div className={`tv-idle ${interlude&&room?.nowPlaying?"tv-idle-interlude":""}`}>
            <img src="/snax-profile-hd.png" alt="Snax the Bunny" className="tv-idle-bunny"/>
            <div className="tv-idle-copy"><span>{room?.nowPlaying?"Up next":room?.queue.length?"Up first":"Welcome to"}</span><FitText text={room?.nowPlaying?.singerName||room?.queue[0]?.singerName||"Snax Karaoke"} max={150} min={40}/><em>{room?.nowPlaying?.songTitle||room?.queue[0]?.songTitle||"Scan the code. Pick a song. Take the mic."}</em></div>
            <div className="tv-idle-qr"><SingerQRCode size={220}/><strong>{roomCode}</strong><small>Scan to sing</small></div>
          </div>}
        </div>
        <aside className="tv-side">
          {autoplayBlocked&&room?.playbackStatus==="playing"&&<div className="tv-playback-prompt" role="status"><p>This browser needs one click on the TV to allow sound. Keep this TV page open; the queue continues automatically.</p><button onClick={()=>tvPlaybackRef.current?.allowPlayback()}>Allow TV playback ▶</button></div>}
          <div className="tv-qr"><SingerQRCode size={150}/><strong>{roomCode}</strong><small>Scan to add a song</small></div>
          <div className="tv-lineup"><span>Next up</span><ol>{room?.queue.slice(0,4).map((item,index)=><li key={item.id}><span>{index+1}</span><div><strong>{item.singerName}</strong><small>{item.songTitle}</small></div></li>)}{!room?.queue.length&&<li className="tv-lineup-empty">Lineup’s open. Grab your phone.</li>}</ol></div>
        </aside>
      </div>
    </section>}
  </main>;
}

function SingerQRCode({size}:{size:number}){return <QRCodeSVG value="https://snax-bunny-karaoke.snax-b0f.workers.dev/?join=now" size={size} level="H" marginSize={4} bgColor="#ffffff" fgColor="#000000" title="Scan to join Snax Karaoke"/>;}

function SnaxPortrait({small=false}:{small?:boolean}){return <div className={`snax-portrait-wrap ${small?"portrait-small":""}`}><div className="ear ear-left"/><div className="ear ear-right"/><img src="/snax-profile-hd.png" alt="Snax the Bunny" className="snax-portrait"/>{!small&&<span className="portrait-label">Hosted by Snax</span>}</div>}
function Footer(){return <footer><strong>SNAX</strong><span>Despite all my rage, I am still just a rabbit on stage.</span><nav aria-label="Legal and social links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="https://www.instagram.com/snaxthebunny/" target="_blank" rel="noreferrer">@snaxthebunny ↗</a></nav></footer>}
// A singer's name always stays on one line on the TV: start at `max` px and shrink
// until it fits the space it's given (re-measured whenever the container resizes).
function FitText({text,max,min=18,className}:{text:string;max:number;min?:number;className?:string}){
  const ref=useRef<HTMLElement|null>(null);
  useLayoutEffect(()=>{
    const el=ref.current; const box=el?.parentElement; if(!el||!box) return;
    const fit=()=>{ el.style.fontSize=`${max}px`; const available=box.clientWidth; const needed=el.scrollWidth; if(needed>available&&needed>0) el.style.fontSize=`${Math.max(min,Math.floor(max*available/needed)-1)}px`; };
    fit(); const observer=new ResizeObserver(fit); observer.observe(box); return()=>observer.disconnect();
  },[text,max,min]);
  return <strong ref={ref} className={className} style={{display:"block",whiteSpace:"nowrap",overflow:"hidden"}}>{text}</strong>;
}

// Venmo tip for the host. Tries the Venmo app first (prefilled recipient, amount and
// note), then falls back to Venmo on the web if the app doesn't take over.
const VENMO_HANDLE="promqueen";
function TipCard(){
  const [amount,setAmount]=useState<number|null>(null);
  function tip(value:number|null){
    const note=encodeURIComponent("Snax Karaoke tip");
    const app=`venmo://paycharge?txn=pay&recipients=${VENMO_HANDLE}${value?`&amount=${value}`:""}&note=${note}`;
    const web=`https://account.venmo.com/pay?recipients=${VENMO_HANDLE}${value?`&amount=${value}`:""}&note=${note}`;
    const start=Date.now(); window.location.href=app;
    window.setTimeout(()=>{ if(document.visibilityState==="visible"&&Date.now()-start<1600) window.open(web,"_blank","noopener,noreferrer"); },900);
  }
  return <section className="tip-card"><p className="eyebrow">Venmo @{VENMO_HANDLE}</p><h2>Hot Tips for Snax</h2><div className="tip-amounts">{[5,10,20].map(value=><button key={value} type="button" className={amount===value?"selected":""} onClick={()=>setAmount(value)}>${value}</button>)}</div><button type="button" className="tip-go" onClick={()=>tip(amount)}>{amount?`Tip $${amount} on Venmo`:"Open Venmo"} <span>→</span></button></section>;
}

function QueuePanel({room,busy,onControl,host=false}:{room:RoomState|null;busy:boolean;host?:boolean;onControl:(action:"move_up"|"move_down"|"delete",id:number)=>Promise<unknown>}){return <section className={`queue-panel ${host?"host-queue":""}`}><div className="queue-title"><div><p className="eyebrow">The lineup</p><h2>Who’s next?</h2></div><span>{room?.queue.length||0} waiting</span></div>{room?.nowPlaying&&<div className="now-card"><span>Now singing</span><strong>{room.nowPlaying.singerName}</strong><small>{room.nowPlaying.songTitle}</small></div>}<ol>{(host?room?.queue:room?.queue.slice(0,4))?.map((item,index)=><li key={item.id}><span className="queue-position">{index+1}</span><div className="queue-copy"><strong>{item.singerName}{host&&(item.sungCount||0)>0&&<em className="turns">{item.sungCount===1?"sang once":`sang ${item.sungCount}×`}</em>}</strong><small>{item.songTitle}</small></div>{host&&<div className="queue-actions"><button onClick={()=>void onControl("move_up",item.id)} disabled={busy||index===0} aria-label="Move song up">↑</button><button onClick={()=>void onControl("move_down",item.id)} disabled={busy||index===(room?.queue.length||0)-1} aria-label="Move song down">↓</button><button onClick={()=>void onControl("delete",item.id)} disabled={busy} aria-label="Delete song">×</button></div>}</li>)}{!room?.queue.length&&<li className="empty-queue">No one’s waiting yet. The microphone is getting nervous.</li>}{!host&&(room?.queue.length||0)>4&&<li className="empty-queue">+{(room?.queue.length||0)-4} more after that</li>}</ol>{!host&&<TipCard/>}</section>}
