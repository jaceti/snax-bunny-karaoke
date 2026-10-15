import manifest from '../public/gobble-music/manifest.json' with {type:'json'};
export const GOBBLE_SPIN='/gobble-music/gobble-spin.mp3';
export const GOBBLE_TRACKS=manifest.map(track=>`/gobble-music/${track.file}`);
