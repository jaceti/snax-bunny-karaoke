import manifest from "../public/spooky-music/manifest.json" with {type:"json"};
// Winner reveals and between-song cards share the current folder-synced list.
// Keep filenames stable: removing a track must not resurrect it via cached audio.
export const INTERLUDE_TRACKS=manifest.map(track=>`/spooky-music/${track.file}`);

export class TrackBag {
  private bag:string[]=[];
  private previous:string|undefined;
  private tracks:readonly string[];
  private random:()=>number;
  constructor(tracks:readonly string[]=INTERLUDE_TRACKS,random= Math.random){this.tracks=tracks;this.random=random;}
  next(){
    if(!this.bag.length){
      this.bag=[...this.tracks];
      for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}
      if(this.bag.length>1&&this.bag.at(-1)===this.previous)[this.bag[0],this.bag[this.bag.length-1]]=[this.bag[this.bag.length-1],this.bag[0]];
    }
    const track=this.bag.pop();if(!track)throw new Error("Interlude playlist is empty");
    this.previous=track;return track;
  }
}

// One current clip + one prefetched clip, never the whole library. Async loads
// cannot start music after the name card has gone away or the host has paused.
export class InterludeMusic {
  private bag=new TrackBag();
  private nextTrack=this.bag.next();
  private track:string|null=null;
  private key:string|null=null;
  private wanted=false;
  private generation=0;
  private disposed=false;
  private source:AudioBufferSourceNode|null=null;
  private buffers=new Map<string,Promise<AudioBuffer|null>>();
  private loading=false;
  private context:AudioContext|null=null;
  prepare(ctx:AudioContext){this.context=ctx;void this.load(this.nextTrack);}
  private load(track:string){
    let pending=this.buffers.get(track);
    if(!pending){
      pending=(async()=>{try{
        const response=await fetch(track);if(!response.ok||this.disposed)return null;
        const bytes=await response.arrayBuffer();if(!this.context||this.disposed)return null;
        return await this.context.decodeAudioData(bytes);
      }catch{return null;}})();
      this.buffers.set(track,pending);
    }
    return pending;
  }
  set(on:boolean,key:string){
    if(this.disposed)return;
    if(on&&key!==this.key){
      this.stop();this.key=key;this.track=this.nextTrack;this.nextTrack=this.bag.next();
      for(const url of this.buffers.keys())if(url!==this.track&&url!==this.nextTrack)this.buffers.delete(url);
      if(this.context)void this.load(this.nextTrack);
    }
    this.wanted=on;
    if(!on){this.stop();return;}
    this.resume();
  }
  resume(){
    const ctx=this.context,track=this.track;
    if(!this.wanted||!track||!ctx||ctx.state!=="running"||this.source||this.loading||this.disposed)return;
    this.loading=true;const generation=this.generation;
    void this.load(track).then(buffer=>{
      if(generation!==this.generation)return;
      this.loading=false;
      if(!buffer){this.buffers.delete(track);return;}
      if(this.disposed||!this.wanted||ctx.state!=="running")return;
      const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;source.loop=true;
      gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(.7,ctx.currentTime+.3);
      source.connect(gain);gain.connect(ctx.destination);source.start();this.source=source;
      source.onended=()=>{source.disconnect();gain.disconnect();};
    });
  }
  private stop(){
    this.generation++;this.loading=false;
    // Clips have a soft opening; stop exactly as karaoke starts to avoid vocals
    // or a previous interlude spilling into the next singer's video.
    try{this.source?.stop();}catch{}this.source=null;
  }
  dispose(){this.disposed=true;this.wanted=false;this.stop();this.buffers.clear();}
}
