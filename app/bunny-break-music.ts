export type BreakTrack={title:string;artist:string;src:string};
// Full recordings supplied in SnaxTrax, preserved without trimming.
export const BUNNY_BREAK_TRACKS:BreakTrack[]=[
  {title:"Axel F",artist:"Harold Faltermeyer",src:"/audio/bunny-break/axel-f.mp3"},
  {title:"Oh Yeah",artist:"Yello",src:"/audio/bunny-break/oh-yeah.mp3"},
  {title:"Popcorn",artist:"Hot Butter",src:"/audio/bunny-break/popcorn.mp3"},
  {title:"Love on a Real Train",artist:"Tangerine Dream",src:"/audio/bunny-break/love-on-a-real-train.mp3"},
];

// Uses the TV's existing unlocked audio context. No excerpts, looping a single
// clip, or duration timers: each recording's actual end advances to the next.
export class BunnyBreakMusic{
  private context:AudioContext|null=null;
  private source:AudioBufferSourceNode|null=null;
  private gain:GainNode|null=null;
  private buffers=new Map<number,Promise<AudioBuffer|null>>();
  private tracks:BreakTrack[];
  private id:string|null=null;
  private index=0;
  private active=false;
  private disposed=false;
  private generation=0;
  private loading=false;
  constructor(tracks=BUNNY_BREAK_TRACKS){this.tracks=tracks.filter(track=>track.src);}
  prepare(context:AudioContext){this.context=context;if(this.tracks.length)void this.load(this.index);}
  private load(index:number){
    let promise=this.buffers.get(index);
    if(!promise){promise=(async()=>{try{
      const response=await fetch(this.tracks[index].src!);if(!response.ok||this.disposed)return null;
      const bytes=await response.arrayBuffer();if(this.disposed||!this.context)return null;
      return await this.context.decodeAudioData(bytes);
    }catch{return null;}})();this.buffers.set(index,promise);}
    return promise;
  }
  sync(id:string|null,active:boolean){
    if(this.disposed)return;
    if(id!==this.id){this.stop();this.id=id;this.index=0;}
    this.active=!!id&&active;
    if(!this.active){this.stop();return;}
    this.resume();
  }
  resume(){
    const ctx=this.context;
    if(!ctx||ctx.state!=="running"||!this.active||this.source||this.loading||this.disposed||!this.tracks.length)return;
    this.loading=true;const generation=this.generation,index=this.index;
    void this.load(index).then(buffer=>{
      if(this.disposed||generation!==this.generation)return;
      this.loading=false;
      if(!buffer){this.buffers.delete(index);return;} // A later poll retries a failed load.
      if(!this.active||ctx.state!=="running")return;
      const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;source.loop=false;
      gain.gain.value=.7;source.connect(gain);gain.connect(ctx.destination);this.source=source;this.gain=gain;
      source.onended=()=>{
        source.disconnect();gain.disconnect();
        if(generation!==this.generation||this.source!==source||!this.active||this.disposed)return;
        this.source=null;this.gain=null;this.index=(index+1)%this.tracks.length;this.resume();
      };
      source.start();
      const next=(index+1)%this.tracks.length;
      for(const key of this.buffers.keys())if(key!==index&&key!==next)this.buffers.delete(key);
      void this.load(next);
    });
  }
  private stop(){this.generation++;this.loading=false;const source=this.source;this.source=null;if(source){source.onended=null;try{source.stop();}catch{}source.disconnect();}this.gain?.disconnect();this.gain=null;}
  dispose(){this.disposed=true;this.active=false;this.stop();this.buffers.clear();}
}
