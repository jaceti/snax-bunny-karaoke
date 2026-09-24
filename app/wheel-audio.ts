import type { WheelState } from "./wheel-model";

// A steady traditional snare roll, with wire rattle and drum-head resonance.
export function drumrollHitTimes(duration=7){
  const hits:number[]=[];
  for(let hit=0;hit<duration*28;hit++)hits.push(hit/28);
  return hits;
}
export const CYMBAL_DURATION=.65;
export function cymbalSamples(rate=22050){
  const samples=new Float32Array(Math.ceil(rate*CYMBAL_DURATION));let seed=8675309,low=0;
  for(let i=0;i<samples.length;i++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const time=i/rate,white=seed/0x100000000*2-1;low+=.22*(white-low);
    const metal=Math.sin(2*Math.PI*4231*time)*Math.sin(2*Math.PI*5873*time);
    const envelope=Math.min(1,time/.002)*Math.exp(-time*7)*Math.min(1,(CYMBAL_DURATION-time)/.06);
    samples[i]=((white-low)*.42+metal*.12)*envelope;
  }
  return samples;
}
export function drumrollSamples(rate=22050,duration=7){
  const samples=new Float32Array(Math.ceil(rate*duration));let seed=271828;
  const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000*2-1;};
  for(const [index,hit]of drumrollHitTimes(duration).entries()){
    const start=Math.floor(hit*rate);
    let low=0;const accent=index%2?.82:1;
    for(let i=0;i<rate*.16&&start+i<samples.length;i++){
      const time=i/rate,white=noise();low+=.15*(white-low);
      const wires=(white-low)*Math.exp(-time*31)*.3;
      const head=(Math.sin(2*Math.PI*185*time)+.4*Math.sin(2*Math.PI*330*time))*Math.exp(-time*46)*.18;
      const attack=Math.min(1,time/.001);
      const tail=Math.min(1,(samples.length-start-i)/(rate*.012));
      samples[start+i]+=(wires+head)*accent*attack*tail;
    }
  }
  return samples;
}

export class WheelAudio {
  private context:AudioContext|null=null;
  private drum:AudioBufferSourceNode|null=null;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private wheel:WheelState|null=null;
  private offset=0;
  private scheduled:string|null=null;
  private heard=new Set<string>();
  private disposed=false;
  private speaking=false;
  private wowBuffer:AudioBuffer|null=null;
  private drumBuffer:AudioBuffer|null=null;
  private wowSource:AudioBufferSourceNode|null=null;
  private cymbal:AudioBufferSourceNode|null=null;
  private loadingWow:Promise<void>|null=null;
  // Background music under the TV's between-songs "Up next" card.
  private interludeBuffer:AudioBuffer|null=null;
  private interludeSource:AudioBufferSourceNode|null=null;
  private interludeGain:GainNode|null=null;
  private interludeWanted=false;
  // Snax's "Bumbersnax" track plays from the moment the wheel reveals a winner
  // until the host closes the wheel.
  private winnerBuffer:AudioBuffer|null=null;
  private winnerSource:AudioBufferSourceNode|null=null;
  private winnerGain:GainNode|null=null;
  private enabled:(value:boolean)=>void;
  constructor(enabled:(value:boolean)=>void){this.enabled=enabled;}
  async unlock(){
    if(this.disposed)return;
    try{
      if(!this.context){
        this.context=new AudioContext();
        this.context.onstatechange=()=>{if(!this.disposed){this.enabled(this.context?.state==="running");this.schedule();}};
      }
      // Preload even while browser permission is pending, not after the first spin.
      void this.preloadWow();
      await this.context.resume();
      if(this.disposed)return;
      this.enabled(this.context.state==="running");
      this.schedule();
      if(this.interludeWanted)this.interlude(true);
    }catch{this.enabled(false);}
  }
  private preloadWow(){
    if(!this.loadingWow)this.loadingWow=(async()=>{
      try{
        await Promise.all(["wow","drumroll","interlude","winner"].map(async kind=>{
          const response=await fetch(kind==="drumroll"?"/snax-wheel-drumroll-v2.mp3":kind==="interlude"?"/interlude-suspense.mp3":kind==="winner"?"/snax-wheel-winner.mp3":"/snax-wheel-wow.mp3");
          if(!response.ok||this.disposed)return;
          const bytes=await response.arrayBuffer();
          if(!this.context||this.disposed)return;
          const buffer=await this.context.decodeAudioData(bytes);
          if(kind==="wow")this.wowBuffer=buffer;else if(kind==="winner")this.winnerBuffer=buffer;else if(kind==="interlude"){this.interludeBuffer=buffer;if(this.interludeWanted)this.interlude(true);}else this.drumBuffer=buffer;
        }));
      }catch{/* The built-in tiny wow remains available if the recording cannot load. */}
    })();
    return this.loadingWow;
  }
  sync(wheel:WheelState|null,serverNow:number){
    if(this.disposed)return;
    // Anchor once per spin. Poll/network jitter must not move the finish line.
    if(wheel?.id!==this.wheel?.id||wheel?.startedAt!==this.wheel?.startedAt)this.offset=Date.now()-serverNow;
    if(wheel?.id!==this.wheel?.id||wheel?.phase==="ready")this.stop();
    this.wheel=wheel;
    if(!wheel){this.stop();return;}
    // Retry automatically on wheel updates; a TV already allowed to play media
    // should never need a separate wheel-specific activation.
    if(!this.context||this.context.state!=="running")void this.unlock();
    this.schedule();
  }
  private schedule(){
    const wheel=this.wheel,ctx=this.context;
    if(!wheel||!ctx||ctx.state!=="running"||wheel.startedAt===null||wheel.endsAt===null)return;
    const now=Date.now()-this.offset,remaining=wheel.endsAt-now;
    if(this.scheduled===wheel.id){if(wheel.phase==="winner"||remaining<=0)this.wow(wheel.id);return;}
    // Opening/reloading an already-finished result must never replay the sound.
    if(remaining<=0||wheel.phase!=="spinning")return;
    this.scheduled=wheel.id;
    let buffer=this.drumBuffer;
    if(!buffer){const samples=drumrollSamples();buffer=ctx.createBuffer(1,samples.length,22050);buffer.copyToChannel(samples,0);}
    const source=ctx.createBufferSource();source.buffer=buffer;
    const gain=ctx.createGain();gain.gain.value=this.drumBuffer ? 0.6 : 0.38;source.connect(gain);gain.connect(ctx.destination);
    source.start(0,Math.max(0,(now-wheel.startedAt)/1000));source.stop(ctx.currentTime+remaining/1000);this.drum=source;
    this.timer=setTimeout(()=>this.wow(wheel.id),remaining);
  }
  // Suspense music under the "Up next" card: fades in when the card appears and
  // fades out as the next video starts. Silent (never blocks) if audio is locked.
  interlude(on:boolean){
    this.interludeWanted=on;
    const ctx=this.context;
    if(this.disposed||!ctx)return;
    if(on){
      if(this.interludeSource||!this.interludeBuffer||ctx.state!=="running")return;
      const source=ctx.createBufferSource(),gain=ctx.createGain();
      source.buffer=this.interludeBuffer;source.loop=true;
      gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(.55,ctx.currentTime+.6);
      source.connect(gain);gain.connect(ctx.destination);source.start();
      this.interludeSource=source;this.interludeGain=gain;
      return;
    }
    this.stopInterlude(.8);
  }
  private stopInterlude(fade=0){
    const source=this.interludeSource,gain=this.interludeGain,ctx=this.context;
    this.interludeSource=null;this.interludeGain=null;
    if(!source)return;
    try{
      if(ctx&&gain&&fade>0){gain.gain.cancelScheduledValues(ctx.currentTime);gain.gain.setValueAtTime(gain.gain.value,ctx.currentTime);gain.gain.linearRampToValueAtTime(0,ctx.currentTime+fade);source.stop(ctx.currentTime+fade+.05);}
      else source.stop();
    }catch{try{source.stop();}catch{}}
  }
  // The rendered wheel can end the roll immediately, even after a delayed poll.
  land(id:string){this.wow(id);}
  private wow(id:string){
    if(this.disposed||this.wheel?.id!==id||this.heard.has(id)||this.scheduled!==id)return;
    this.heard.add(id);clearTimeout(this.timer);try{this.drum?.stop();}catch{}this.drum=null;
    const ctx=this.context;
    if(ctx&&this.winnerBuffer&&!this.winnerSource){
      const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=this.winnerBuffer;gain.gain.value=.7;
      source.connect(gain);gain.connect(ctx.destination);source.start();this.winnerSource=source;this.winnerGain=gain;
    }
    if(ctx){
      const samples=cymbalSamples(),buffer=ctx.createBuffer(1,samples.length,22050);buffer.copyToChannel(samples,0);
      const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;gain.gain.value=.75;
      source.connect(gain);gain.connect(ctx.destination);source.start();this.cymbal=source;
    }
    this.timer=setTimeout(()=>this.playWow(id),CYMBAL_DURATION*1000);
  }
  private playWow(id:string){
    if(this.disposed||this.wheel?.id!==id||this.scheduled!==id)return;
    if(this.context&&this.wowBuffer){
      const source=this.context.createBufferSource(),gain=this.context.createGain();
      source.buffer=this.wowBuffer;gain.gain.value=.8;
      source.connect(gain);gain.connect(this.context.destination);source.start();this.wowSource=source;
      return;
    }
    // Browser speech provides an actual voiced word, stretched and pitched up.
    if("speechSynthesis" in window){
      const word=new SpeechSynthesisUtterance("Wooooow!");word.pitch=2;word.rate=.35;word.volume=.65;
      const voices=window.speechSynthesis.getVoices();
      word.voice=voices.find(v=>/Samantha|Kathy|Junior|Karen|Zira/i.test(v.name))||voices.find(v=>v.lang.startsWith("en"))||null;
      word.onend=()=>{this.speaking=false;};word.onerror=()=>{this.speaking=false;};
      this.speaking=true;window.speechSynthesis.speak(word);
    }
    // Small rising harmonies add the playful little-creature chorus underneath.
    const ctx=this.context;if(!ctx)return;
    for(const [pitch,delay]of [[640,0],[810,.08],[960,.14]]){
      const tone=ctx.createOscillator(),gain=ctx.createGain();tone.type="sine";tone.frequency.setValueAtTime(pitch*.7,ctx.currentTime+delay);tone.frequency.exponentialRampToValueAtTime(pitch,ctx.currentTime+delay+.6);tone.frequency.exponentialRampToValueAtTime(pitch*.8,ctx.currentTime+delay+2);
      gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(.025,ctx.currentTime+delay+.15);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+delay+2.2);tone.connect(gain);gain.connect(ctx.destination);tone.start(ctx.currentTime+delay);tone.stop(ctx.currentTime+delay+2.25);
    }
  }
  private stopWinner(){
    const source=this.winnerSource,gain=this.winnerGain,ctx=this.context;this.winnerSource=null;this.winnerGain=null;
    if(!source)return;
    try{if(ctx&&gain){gain.gain.cancelScheduledValues(ctx.currentTime);gain.gain.setValueAtTime(gain.gain.value,ctx.currentTime);gain.gain.linearRampToValueAtTime(0,ctx.currentTime+.6);source.stop(ctx.currentTime+.65);}else source.stop();}catch{try{source.stop();}catch{}}
  }
  private stop(){this.stopWinner();clearTimeout(this.timer);try{this.drum?.stop();}catch{}try{this.wowSource?.stop();}catch{}try{this.cymbal?.stop();}catch{}this.drum=null;this.wowSource=null;this.cymbal=null;this.scheduled=null;if(this.speaking&&"speechSynthesis" in window){window.speechSynthesis.cancel();this.speaking=false;}}
  dispose(){this.disposed=true;this.stop();this.stopInterlude();if(this.context)this.context.onstatechange=null;void this.context?.close();}
}
