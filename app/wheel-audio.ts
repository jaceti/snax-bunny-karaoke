import type { WheelState } from "./wheel-model";

// A light toy-snare roll, softly pitched and quickening toward the reveal.
export function drumrollSamples(rate=22050,duration=7){
  const samples=new Float32Array(Math.ceil(rate*duration));let seed=271828;
  const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000*2-1;};
  for(let hit=0;hit<duration;hit+=.15-.095*(hit/duration)){
    const start=Math.floor(hit*rate);
    for(let i=0;i<rate*.085&&start+i<samples.length;i++){
      const time=i/rate,envelope=Math.exp(-time*64);
      samples[start+i]+=(noise()*.11+Math.sin(2*Math.PI*(580+140*(hit/duration))*time)*.1)*envelope;
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
  private wowSource:AudioBufferSourceNode|null=null;
  private loadingWow:Promise<void>|null=null;
  private enabled:(value:boolean)=>void;
  constructor(enabled:(value:boolean)=>void){this.enabled=enabled;}
  async unlock(){
    if(this.disposed)return;
    try{
      this.context??=new AudioContext();
      await this.context.resume();
      if(this.disposed)return;
      this.enabled(this.context.state==="running");
      void this.preloadWow();
      this.schedule();
    }catch{this.enabled(false);}
  }
  private preloadWow(){
    if(!this.loadingWow)this.loadingWow=(async()=>{
      try{
        const response=await fetch("/snax-wheel-wow.mp3");
        if(!response.ok||this.disposed)return;
        const bytes=await response.arrayBuffer();
        if(!this.context||this.disposed)return;
        this.wowBuffer=await this.context.decodeAudioData(bytes);
      }catch{/* The built-in tiny wow remains available if the recording cannot load. */}
    })();
    return this.loadingWow;
  }
  sync(wheel:WheelState|null,serverNow:number){
    if(this.disposed)return;
    if(wheel?.id!==this.wheel?.id||wheel?.phase==="ready")this.stop();
    this.wheel=wheel;this.offset=Date.now()-serverNow;
    if(!wheel){this.stop();return;}
    this.schedule();
  }
  private schedule(){
    const wheel=this.wheel,ctx=this.context;
    if(!wheel||!ctx||ctx.state!=="running"||wheel.startedAt===null||wheel.endsAt===null)return;
    const now=Date.now()-this.offset,remaining=wheel.endsAt-now;
    if(this.scheduled===wheel.id){if(remaining<=0)this.wow(wheel.id);return;}
    // Opening/reloading an already-finished result must never replay the sound.
    if(remaining<=0||wheel.phase!=="spinning")return;
    this.scheduled=wheel.id;
    const samples=drumrollSamples();const buffer=ctx.createBuffer(1,samples.length,22050);buffer.copyToChannel(samples,0);
    const source=ctx.createBufferSource();source.buffer=buffer;
    const gain=ctx.createGain();gain.gain.value=.65;source.connect(gain);gain.connect(ctx.destination);
    source.start(0,Math.max(0,(now-wheel.startedAt)/1000));source.stop(ctx.currentTime+remaining/1000);this.drum=source;
    this.timer=setTimeout(()=>this.wow(wheel.id),remaining);
  }
  private wow(id:string){
    if(this.disposed||this.wheel?.id!==id||this.heard.has(id)||this.scheduled!==id)return;
    this.heard.add(id);clearTimeout(this.timer);try{this.drum?.stop();}catch{}this.drum=null;
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
  private stop(){clearTimeout(this.timer);try{this.drum?.stop();}catch{}try{this.wowSource?.stop();}catch{}this.drum=null;this.wowSource=null;this.scheduled=null;if(this.speaking&&"speechSynthesis" in window){window.speechSynthesis.cancel();this.speaking=false;}}
  dispose(){this.disposed=true;this.stop();void this.context?.close();}
}
