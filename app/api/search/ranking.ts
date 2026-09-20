export type VideoDetails = {
  id?: string;
  snippet?: { title?: string; channelTitle?: string; channelId?: string; description?: string; liveBroadcastContent?: string };
  status?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string };
  contentDetails?: { definition?: string; contentRating?: { ytRating?: string }; regionRestriction?: { allowed?: string[]; blocked?: string[] } };
};

// Verified official YouTube channel IDs, September 2026. Match IDs, never a
// copied brand name in a title. These are preferences, not playback guarantees.
// Sources: singking.com, karafun.com, stingray.com/thekaraokechannel,
// sing2music.com/sing2karaoke and their official YouTube channels.
export const PREFERRED_CHANNELS = new Map([
  ["UCwTRjvjVge51X-ILJ4i22ew", "Sing King"],
  ["UCbqcG1rdt9LMwOJN4PyGTKg", "KaraFun Karaoke"],
  ["UCYi9TC1HC_U2kaRAK6I4FSQ", "Stingray Karaoke"],
  ["UCIw3418aea4CeR16lG4v8qQ", "Sing2Karaoke"],
]);

export function playable(video: VideoDetails, region: string) {
  const status = video.status;
  const restrictions = video.contentDetails?.regionRestriction;
  return status?.embeddable === true && status.privacyStatus === "public"
    && status.uploadStatus === "processed"
    && video.contentDetails?.contentRating?.ytRating !== "ytAgeRestricted"
    && !restrictions?.blocked?.includes(region)
    && (!restrictions?.allowed || restrictions.allowed.includes(region))
    && !["live", "upcoming"].includes(video.snippet?.liveBroadcastContent || "");
}

// These are ranking signals, not a promise that we inspected the video itself.
// YouTube captions are not used: karaoke lyrics are usually part of the picture.
export function karaokeScore(video: VideoDetails, query: string, originalRank: number) {
  const title = video.snippet?.title?.toLowerCase() || "";
  const channel = video.snippet?.channelTitle?.toLowerCase() || "";
  const description = video.snippet?.description?.toLowerCase() || "";
  const noLyrics = /\b(?:no|without)\s+(?:on[ -]screen\s+)?lyrics?\b/.test(title);
  const lyrics = !noLyrics && /\blyrics?\b|\bsing[ -]?along\b/.test(title);
  const karaoke = /\bkaraoke\b/.test(title);
  const tokens = query.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter(word => !["karaoke", "lyrics", "with", "the", "a"].includes(word)) || [];
  const match = tokens.length ? tokens.filter(word => title.includes(word)).length / tokens.length : 1;
  let score = match * 80 + Math.max(0, 20 - originalRank * .4);
  if (karaoke) score += 35;
  if (lyrics) score += 55;
  else if (!noLyrics && /\b(?:on[ -]screen|with) lyrics?\b/.test(description)) score += 20;
  if (/\bkaraoke\b/.test(channel)) score += 8;
  if (video.contentDetails?.definition === "hd") score += 8;
  // A trusted brand must still match the requested song and not say no lyrics.
  if (match >= .75 && !noLyrics && PREFERRED_CHANNELS.has(video.snippet?.channelId || "")) score += 25;
  if (noLyrics) score -= 90;
  if (!lyrics && /\binstrumental\b|\bbacking track\b/.test(title)) score -= 20;
  if (/\bofficial (?:music )?video\b|\blyric video\b/.test(title) && !karaoke) score -= 40;
  if (/\b(?:tutorial|reaction|vocal cover)\b/.test(title)) score -= 35;
  return score;
}
