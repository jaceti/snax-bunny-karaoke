export type TvSong = { id: number; videoId: string };
export type PlaybackStatus = "idle" | "playing" | "paused";
export type TvPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  cueVideoById(id: string): void;
  loadVideoById(id: string): void;
  getVideoData(): { video_id?: string };
  getPlayerState?(): number;
  getCurrentTime?(): number;
  getDuration?(): number;
  destroy(): void;
};

// Keep the same iframe for the entire TV session, including between-song cards.
// Replacing the iframe discards the user's playback activation in some browsers.
export class TvPlayback {
  private player: TvPlayer | null = null;
  private song: TvSong | null = null;
  private loaded: number | null = null;
  private status: PlaybackStatus = "idle";
  private wheelOpen = false;
  private interlude = false;
  private hasHadSong = false;
  private started = false;
  private finishing: number | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private callbacks: {
    interlude(value: boolean): void;
    blocked(value: boolean): void;
    complete(id: number): Promise<boolean>;
    error(): void;
  };

  constructor(callbacks: TvPlayback["callbacks"]) { this.callbacks = callbacks; }

  attach(player: TvPlayer) {
    if (this.disposed) return;
    this.player = player;
    this.sync();
  }

  update(song: TvSong | null, status: PlaybackStatus, wheelOpen = false) {
    if (this.disposed) return;
    const changed = song?.id !== this.song?.id;
    // The host swapped a dud video for the same singer: reload in place, no interlude.
    const swapped = !changed && !!song && !!this.song && song.videoId !== this.song.videoId;
    const statusChanged = status !== this.status;
    const wheelChanged = wheelOpen !== this.wheelOpen;
    this.wheelOpen = wheelOpen;
    this.status = status;
    this.song = song;
    if (changed) {
      clearTimeout(this.timer);
      clearTimeout(this.retry);
      this.finishing = null;
      this.started = false;
      this.callbacks.blocked(false);
      this.interlude = !!song && this.hasHadSong && !wheelOpen;
      this.callbacks.interlude(this.interlude);
      if (song) this.hasHadSong = true;
      // Invalidate the previous item before pausing: its late end event is stale.
      this.loaded = null;
      this.player?.pauseVideo();
      if (this.interlude) this.timer = setTimeout(() => {
        this.interlude = false;
        this.callbacks.interlude(false);
        this.sync();
      }, 10_000);
    }
    if (swapped) {
      clearTimeout(this.retry);
      this.finishing = null;
      this.started = false;
      this.loaded = null;
      this.player?.pauseVideo();
    }
    if (changed || swapped || statusChanged || wheelChanged) this.sync();
  }

  private sync() {
    if (!this.player || this.disposed) return;
    if (!this.song || this.interlude) { this.player.pauseVideo(); return; }
    if (this.loaded !== this.song.id) {
      this.loaded = this.song.id;
      this.started = false;
      if (this.status === "playing") this.player.loadVideoById(this.song.videoId);
      else this.player.cueVideoById(this.song.videoId);
    } else if (this.status === "playing") this.player.playVideo();
    else {
      // Do not turn an already-ended video into an interrupted song when a
      // host pause arrives before YouTube's asynchronous ENDED notification.
      const duration=this.player.getDuration?.()||0;
      const majorityPlayed=this.wheelOpen&&duration>0&&(this.player.getCurrentTime?.()||0)>duration/2;
      if(this.started&&(this.player.getPlayerState?.()===0||majorityPlayed))void this.finish(this.song.id);
      this.player.pauseVideo();
    }
    if (this.status !== "playing") this.callbacks.blocked(false);
  }

  allowPlayback() {
    if (this.status === "playing" && !this.interlude && this.song) this.player?.playVideo();
  }

  autoplayBlocked() {
    if (!this.disposed && this.status === "playing" && !this.interlude) this.callbacks.blocked(true);
  }

  private isCurrent() {
    return !this.disposed && !this.interlude && this.song && this.loaded === this.song.id
      && this.player?.getVideoData().video_id === this.song.videoId;
  }

  stateChanged(state: number) {
    if (!this.isCurrent()) return;
    if (state === 1) {
      // A late player event must never override the host's pause.
      if (this.status !== "playing") { this.player?.pauseVideo(); return; }
      this.started = true;
      this.callbacks.blocked(false);
    }
    if (state === 0 && this.started && this.song) void this.finish(this.song.id);
  }

  playerError() {
    if (!this.isCurrent() || !this.song) return;
    this.callbacks.error();
    void this.finish(this.song.id);
  }

  private async finish(id: number) {
    if (this.disposed || this.song?.id !== id || this.finishing === id) return;
    this.finishing = id;
    const ok = await this.callbacks.complete(id).catch(() => false);
    if (!ok && !this.disposed && this.song?.id === id) {
      this.finishing = null;
      // The API ignores duplicate completion for an already-advanced song.
      this.retry = setTimeout(() => void this.finish(id), 2500);
    }
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    clearTimeout(this.retry);
    this.player?.destroy();
    this.player = null;
  }
}
