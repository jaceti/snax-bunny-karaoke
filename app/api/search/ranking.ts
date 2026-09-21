export type VideoDetails = {
  id?: string;
  snippet?: { title?: string; channelTitle?: string; channelId?: string; description?: string; liveBroadcastContent?: string };
  status?: { embeddable?: boolean; privacyStatus?: string; uploadStatus?: string };
  contentDetails?: { definition?: string; contentRating?: { ytRating?: string }; regionRestriction?: { allowed?: string[]; blocked?: string[] } };
};

// Verified official YouTube channel IDs, September 2026. Match IDs, never a
// copied brand name in a title. These are preferences, not playback guarantees.
// Sources: singking.com, karafun.com, stingray.com/thekaraokechannel,
// sing2music.com/sing2karaoke, zoom-entertainments.co.uk and their official YouTube channels.
// Additional sources: sunflykaraoke.com -> @sunflykaraokeofficial;
// clubcaritas.com -> /c/CaritasGothKaraoke; Sybersound's Party Tyme channel announcement.
const ZOOM_CHANNEL_ID = "UCrk8mp-ugqtAbjif6JARjlw";
const SNAX_FAVORITES = new Set([
  "UCbqcG1rdt9LMwOJN4PyGTKg", // KaraFun
  "UCWLqO9ztz16a_Ko4YB9PnFQ", // Party Tyme
  "UCcKX_cqJR4RwW5dxeqHbseQ", // Sunfly
  "UC49S5ro4yX1fR0DRnf0Adwg", // Caritas
]);
export const PREFERRED_CHANNELS = new Map([
  [ZOOM_CHANNEL_ID, "Zoom Karaoke Official"],
  ["UCwTRjvjVge51X-ILJ4i22ew", "Sing King"],
  ["UCbqcG1rdt9LMwOJN4PyGTKg", "KaraFun Karaoke"],
  ["UCWLqO9ztz16a_Ko4YB9PnFQ", "Party Tyme Karaoke"],
  ["UCcKX_cqJR4RwW5dxeqHbseQ", "Sunfly Karaoke"],
  ["UC49S5ro4yX1fR0DRnf0Adwg", "Caritas Goth Karaoke"],
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

function normalized(value = "") {
  return value.normalize("NFKC").toLowerCase().replace(/&amp;/g,"&")
    .replace(/[‐‑–—-]/g," ").replace(/\s+/g," ").trim();
}

// Remove explicit ABSENCE claims before checking for the opposite. In
// particular, "no lead vocals" must never match the "lead vocals" exclusion.
function withoutNoVocalClaims(text:string) {
  return text
    .replace(/\b(?:no|without)\s+(?:(?:any|the)\s+)?(?:(?:lead|main|guide|original|full|demo)\s+)?vocals?\b/g," ")
    .replace(/\b(?:(?:lead|main|guide|original|full)\s+)?vocals?\s+(?:removed|free)\b/g," ");
}
function noVocalClaim(text:string) { return withoutNoVocalClaims(text)!==text; }
function hasLeadVocals(text:string) {
  const claims=withoutNoVocalClaims(text);
  return /\b(?:with|including|includes|contains|featuring)\s+(?:the\s+)?(?:(?:original|lead|main|guide|full|demo)\s+)?vocals?\b/.test(claims)
    || /\b(?:lead|main|guide|original|full|demo)\s+vocals?\b/.test(claims)
    || /\b(?:vocal|vocals|singing)\s+(?:guide|demo|demonstration|cover|version)\b/.test(claims)
    || /\b(?:demonstration|practice)\s+(?:vocals?|version)\b/.test(claims)
    || /\ba\s*cappella\b/.test(claims);
}

// A metadata filter, not audio analysis. Check titles and the opening track
// description, not promotional links to alternate "with vocals" versions.
export function karaokeEligible(video:VideoDetails) {
  const title=normalized(video.snippet?.title);
  const description=(video.snippet?.description||"").split(/\r?\n/).filter(line=>line.trim()).slice(0,2)
    .filter(line=>!/(?:https?:\/\/|www\.|\b(?:check out|also available|other versions?|subscribe|download|playlist|find|visit|watch|get)\b)/i.test(line))
    .map(line=>normalized(line)).join(" ");
  if(hasLeadVocals(title)||hasLeadVocals(description))return false;
  const karaoke=/\bkaraoke\b/.test(title);
  const instrumental=/\binstrumental\b|\bbacking track\b/.test(title)||noVocalClaim(title);
  if(/\b(?:official (?:music )?video|music video|lyrics? video)\b/.test(title)&&!karaoke&&!instrumental)return false;
  if(/\b(?:vocal cover|singing cover|reaction|tutorial)\b/.test(title))return false;
  return karaoke || PREFERRED_CHANNELS.has(video.snippet?.channelId||"")
    || (instrumental&&/\blyrics?\b/.test(`${title} ${description}`))
    || /\b(?:karaoke (?:version|track)|instrumental with lyrics)\b/.test(description);
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
  if (noVocalClaim(normalized(title))) score += 12;
  // A trusted brand must still match the requested song and not say no lyrics.
  if (match >= .75 && !noLyrics && PREFERRED_CHANNELS.has(video.snippet?.channelId || "")) {
    // Snax's first-choice provider; stronger than the other brand preferences.
    score += video.snippet?.channelId === ZOOM_CHANNEL_ID ? 55 : SNAX_FAVORITES.has(video.snippet?.channelId||"") ? 30 : 25;
  }
  if (noLyrics) score -= 90;
  if (!lyrics && /\binstrumental\b|\bbacking track\b/.test(title)) score -= 20;
  if (/\bofficial (?:music )?video\b|\blyric video\b/.test(title) && !karaoke) score -= 40;
  if (/\b(?:tutorial|reaction|vocal cover)\b/.test(title)) score -= 35;
  return score;
}
