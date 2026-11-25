// YouTubeService.ts
// Automatically finds the recording of a past church event from YouTube or active live streams

export const RHEMA_YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@RhemaGlobalMinistries';
export const RHEMA_YOUTUBE_STREAMS_URL = 'https://www.youtube.com/@RhemaGlobalMinistries/streams';
export const RHEMA_YOUTUBE_CHANNEL_ID = 'UCd7Ge98_3YHmo_Z3czAkUoQ';

/**
 * Resolves a church YouTube URL, discarding empty or legacy placeholder handles
 * so Rhema Global Ministries streams always use the official church channel.
 */
export function resolveRhemaYoutubeUrl(rawUrl?: string): string {
  const clean = (rawUrl || '').trim();
  if (
    !clean ||
    /brothersinchrist/i.test(clean) ||
    /uc3j_2zp2biucweia_asvghw/i.test(clean)
  ) {
    return RHEMA_YOUTUBE_CHANNEL_URL;
  }
  return clean;
}

const YOUTUBE_API_KEY = 'AIzaSyBGkm7DNk_jpM-XKJI0JPk_vJlufS4Q7-Q';

// Runtime cache of channelId per handle/URL
const channelIdCache: Record<string, string> = {
  '@RhemaGlobalMinistries': RHEMA_YOUTUBE_CHANNEL_ID,
  '@rhemaglobalministries': RHEMA_YOUTUBE_CHANNEL_ID,
  [RHEMA_YOUTUBE_CHANNEL_URL]: RHEMA_YOUTUBE_CHANNEL_ID,
};

/**
 * Sanitizes input handles or URLs, fixing common user typos
 */
export function sanitizeYoutubeInput(input?: string): {
  handle: string | null;
  channelId: string | null;
  videoId: string | null;
  cleanUrl: string | null;
} {
  if (!input || typeof input !== 'string') return { handle: null, channelId: null, videoId: null, cleanUrl: null };
  let s = input.trim();

  // Fix common domain typos
  s = s.replace(/https?:\/\/(www\w*)\.youtube\.com/i, 'https://www.youtube.com');
  s = s.replace(/https?:\/\/(www\w*)\.yyoutube\.com/i, 'https://www.youtube.com');
  s = s.replace(/https?:\/\/yyoutube\.com/i, 'https://www.youtube.com');
  s = s.replace(/https?:\/\/youube\.com/i, 'https://www.youtube.com');

  // Direct video ID from watch, embed, or live link
  const vMatch = s.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/))([\w-]{11})/i);
  if (vMatch) {
    return { videoId: vMatch[1], handle: null, channelId: null, cleanUrl: `https://www.youtube.com/watch?v=${vMatch[1]}` };
  }

  // Pure 11-char ID
  if (/^[\w-]{11}$/.test(s)) {
    return { videoId: s, handle: null, channelId: null, cleanUrl: `https://www.youtube.com/watch?v=${s}` };
  }

  // Channel ID
  let channelId: string | null = null;
  if (s.includes('/channel/')) {
    channelId = s.split('/channel/')[1].split('/')[0].split('?')[0];
  } else if (/^UC[\w-]{22}$/.test(s)) {
    channelId = s;
  }

  // Handle
  let handle: string | null = null;
  if (s.includes('@')) {
    const rawHandle = s.split('@')[1].split('/')[0].split('?')[0];
    handle = '@' + rawHandle;
  } else if (/^[\w-]+$/.test(s) && !channelId) {
    handle = '@' + s;
  }

  const cleanUrl = channelId 
    ? `https://www.youtube.com/channel/${channelId}` 
    : handle 
    ? `https://www.youtube.com/${handle}` 
    : s;

  return { handle, channelId, videoId: null, cleanUrl };
}

/**
 * Resolves the YouTube channel ID from the channel handle or URL.
 * Uses direct page metadata extraction first (0 quota cost, immune to 429 quota exhaustion),
 * falling back to YouTube Data API if needed.
 */
export async function getChannelId(channelHandleOrUrl: string): Promise<string | null> {
  if (!channelHandleOrUrl) return null;

  const { handle, channelId: directCId } = sanitizeYoutubeInput(channelHandleOrUrl);
  if (directCId) return directCId;

  const targetHandle = handle || (channelHandleOrUrl.startsWith('@') ? channelHandleOrUrl : '@' + channelHandleOrUrl);
  const lowerHandle = targetHandle.toLowerCase();
  if (lowerHandle === '@rhemaglobalministries') return RHEMA_YOUTUBE_CHANNEL_ID;
  if (channelIdCache[targetHandle]) return channelIdCache[targetHandle];
  if (channelIdCache[lowerHandle]) return channelIdCache[lowerHandle];

  // Method 1: Official YouTube Data API v3 `channels.list?forHandle=` (1 quota unit)
  try {
    const cleanHandle = targetHandle.replace(/^@/, '');
    const url = `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(cleanHandle)}&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      const id = data.items?.[0]?.id;
      if (id && /^UC[\w-]{22}$/.test(id)) {
        channelIdCache[targetHandle] = id;
        channelIdCache[lowerHandle] = id;
        return id;
      }
    }
  } catch (error) {
    // Fall through to direct channel metadata lookup
  }

  // Method 2: Direct HTML metadata lookup (Zero quota cost)
  try {
    const scrapeUrl = `https://www.youtube.com/${targetHandle.startsWith('@') ? targetHandle : '@' + targetHandle}`;
    const res = await fetch(scrapeUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (res.ok) {
      const html = await res.text();
      const m = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})">/) ||
                html.match(/"externalId":"(UC[\w-]{22})"/) ||
                html.match(/channel_id=(UC[\w-]{22})/) ||
                html.match(/<meta itemprop="identifier" content="(UC[\w-]{22})">/);
      if (m && m[1]) {
        channelIdCache[targetHandle] = m[1];
        channelIdCache[lowerHandle] = m[1];
        return m[1];
      }
    }
  } catch (scrapeErr) {
    // Non-fatal
  }

  console.warn('⚠️ [YouTubeService] Could not resolve channel ID from handle:', channelHandleOrUrl);
  return null;
}

/**
 * Searches the church's YouTube channel for a video that was published
 * on the same date as the given event date.
 * Uses robust UTC parsing and intelligent keyword matching in memory,
 * while excluding daily promise devotionals and shorts.
 *
 * @param eventDate - The date of the event in 'YYYY-MM-DD' format
 * @param eventTitle - The title of the event, used as a keyword fallback
 * @param channelHandle - The YouTube handle (e.g. '@MyChurch')
 * @returns The 11-character YouTube video ID, or null if not found
 */
export async function findEventVideo(
  eventDate: string,
  eventTitle: string,
  channelHandle?: string
): Promise<string | null> {
  try {
    if (!channelHandle) return null;
    const channelId = await getChannelId(channelHandle);
    if (!channelId) return null;

    // 1. Robust UTC Date Parsing (avoids device timezone offset shifts)
    const dateParts = eventDate.split('T')[0].split('-');
    if (dateParts.length !== 3) {
      console.warn('⚠️ [YouTubeService] Invalid event date format:', eventDate);
      return null;
    }
    
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10);
    const day = parseInt(dateParts[2], 10);
    
    const eventDay = new Date(Date.UTC(year, month - 1, day));
    if (isNaN(eventDay.getTime())) {
      console.warn('⚠️ [YouTubeService] Invalid event date:', eventDate);
      return null;
    }

    // ±3 day search window to accommodate timezone differences and delayed uploads
    const publishedAfter = new Date(eventDay);
    publishedAfter.setUTCDate(publishedAfter.getUTCDate() - 2);
    
    const publishedBefore = new Date(eventDay);
    publishedBefore.setUTCDate(publishedBefore.getUTCDate() + 3);

    const afterISO = publishedAfter.toISOString();
    const beforeISO = publishedBefore.toISOString();

    console.log(`🔍 [YouTubeService] Searching for "${eventTitle}" in UTC range: ${afterISO.split('T')[0]} to ${beforeISO.split('T')[0]}`);

    // Query more results (maxResults=15) to ensure we don't miss the event video
    // due to daily promise/song flooding.
    const searchUrl =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet` +
      `&channelId=${channelId}` +
      `&type=video` +
      `&order=date` +
      `&publishedAfter=${encodeURIComponent(afterISO)}` +
      `&publishedBefore=${encodeURIComponent(beforeISO)}` +
      `&maxResults=15` +
      `&key=${YOUTUBE_API_KEY}`;

    const response = await fetch(searchUrl);
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      console.log('ℹ️ [YouTubeService] No videos uploaded in this date range.');
      return null;
    }

    // 2. Intelligent In-Memory Filtering and Selection
    const normalizedEventTitle = eventTitle.toLowerCase();
    
    // Tokenize event title into significant search terms
    const stopWords = new Set(['and', 'the', 'or', 'in', 'of', 'to', 'at', 'a', 'for', 'with', 'us', 'on', 'is', 'our', 'study', 'service', 'meeting', 'prayer', 'worship']);
    const eventTokens = normalizedEventTitle
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(token => token.length > 2 && !stopWords.has(token));

    // Core categories of church events to match
    const isBibleStudy = normalizedEventTitle.includes('bible') || normalizedEventTitle.includes('study');
    const isSundayService = normalizedEventTitle.includes('sunday') || normalizedEventTitle.includes('service') || normalizedEventTitle.includes('worship');
    const isFastingPrayer = normalizedEventTitle.includes('fasting') || normalizedEventTitle.includes('prayer');
    const isYouth = normalizedEventTitle.includes('youth');

    console.log(`💡 [YouTubeService] Extracted event tokens:`, eventTokens, `| Category:`, { isBibleStudy, isSundayService, isFastingPrayer, isYouth });

    const candidates: Array<{ videoId: string; title: string; score: number }> = [];

    for (const item of data.items) {
      const videoTitle = item.snippet.title.toLowerCase();
      const videoDesc = (item.snippet.description || '').toLowerCase();
      const videoId = item.id.videoId;

      // Rule 1: Exclude Daily Promise and Shorts videos
      const isDailyPromise = 
        videoTitle.includes('promise') || 
        videoTitle.includes('daily') || 
        videoTitle.includes('వాగ్దానం') || 
        videoTitle.includes('vaghanam') || 
        videoTitle.includes('vaganam') ||
        videoTitle.includes('vagdhanam');
        
      const isShort = 
        videoTitle.includes('short') || 
        videoTitle.includes('#shorts') || 
        videoTitle.includes('ytshorts') || 
        videoTitle.includes('youtubeshorts');

      if (isDailyPromise || isShort) {
        console.log(`🚫 [YouTubeService] Excluded daily devotional/short: "${item.snippet.title}"`);
        continue;
      }

      // Rule 2: Scoring the video based on keywords
      let score = 0;

      // Category matching bonus
      if (isBibleStudy && (videoTitle.includes('bible') || videoTitle.includes('study'))) score += 10;
      if (isSundayService && (videoTitle.includes('sunday') || videoTitle.includes('worship') || videoTitle.includes('service'))) score += 10;
      if (isFastingPrayer && (videoTitle.includes('fasting') || videoTitle.includes('prayer'))) score += 10;
      if (isYouth && videoTitle.includes('youth')) score += 10;

      // Token matching
      for (const token of eventTokens) {
        if (videoTitle.includes(token)) score += 5;
        if (videoDesc.includes(token)) score += 1;
      }

      // Live stream preference bonus
      if (videoTitle.includes('live') || videoTitle.includes('stream')) {
        score += 2;
      }

      candidates.push({ videoId, title: item.snippet.title, score });
    }

    // Sort candidates descending by score
    candidates.sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      const bestMatch = candidates[0];
      // Require a minimum score of 2 to avoid returning a completely random video
      // if no relevant candidate exists.
      if (bestMatch.score >= 2) {
        console.log(`🎯 [YouTubeService] Best video match found: "${bestMatch.title}" (Score: ${bestMatch.score}, ID: ${bestMatch.videoId})`);
        return bestMatch.videoId;
      }
      
      // Fallback: If no high score, but we have a non-excluded candidate and it's a general live stream
      const liveStream = candidates.find(c => c.title.toLowerCase().includes('live'));
      if (liveStream) {
        console.log(`🎯 [YouTubeService] Fallback to general live stream candidate: "${liveStream.title}" (ID: ${liveStream.videoId})`);
        return liveStream.videoId;
      }
    }

    console.log('ℹ️ [YouTubeService] No matching church service video found.');
    return null;
  } catch (error) {
    console.error('❌ [YouTubeService] findEventVideo error:', error);
    return null;
  }
}

export interface ActiveLiveStreamResult {
  videoId: string | null;
  title: string;
  isLiveNow: boolean;
  hasEnded: boolean;
  status: 'live' | 'completed' | 'none';
  isRecent?: boolean;
}

/**
 * Checks the live broadcast status of a specific YouTube video ID.
 * When `expectedChannelId` is provided, strictly verifies that the video belongs
 * to that exact YouTube channel (rejecting any foreign/recommended videos).
 */
const LIVE_STATUS_CACHE = new Map<string, { ts: number; data: any }>();
const LIVE_STATUS_IN_FLIGHT = new Map<string, Promise<any>>();
const ACTIVE_STREAM_CACHE = new Map<string, { ts: number; data: ActiveLiveStreamResult }>();
const ACTIVE_STREAM_IN_FLIGHT = new Map<string, Promise<ActiveLiveStreamResult>>();
const YOUTUBE_LIVE_CACHE_TTL_MS = 30_000;

export async function checkVideoLiveStatus(
  videoId: string,
  expectedChannelId?: string | null
): Promise<{
  status: 'live' | 'completed' | 'none';
  isLiveNow: boolean;
  hasEnded: boolean;
  title?: string;
  channelId?: string;
  channelTitle?: string;
  channelMismatch?: boolean;
}> {
  if (!videoId || !/^[\w-]{11}$/.test(videoId.trim())) {
    return { status: 'none', isLiveNow: false, hasEnded: false };
  }
  const cleanVideoId = videoId.trim();
  const cacheKey = `${cleanVideoId}:${expectedChannelId || ''}`;
  const cached = LIVE_STATUS_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.ts < YOUTUBE_LIVE_CACHE_TTL_MS) {
    return cached.data;
  }
  const pending = LIVE_STATUS_IN_FLIGHT.get(cacheKey);
  if (pending) return pending;

  const task: Promise<{
    status: 'live' | 'completed' | 'none';
    isLiveNow: boolean;
    hasEnded: boolean;
    title?: string;
    channelId?: string;
    channelTitle?: string;
    channelMismatch?: boolean;
  }> = (async (): Promise<{
    status: 'live' | 'completed' | 'none';
    isLiveNow: boolean;
    hasEnded: boolean;
    title?: string;
    channelId?: string;
    channelTitle?: string;
    channelMismatch?: boolean;
  }> => {
    try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${cleanVideoId}&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const item = data.items && data.items[0];
      if (item) {
        const title = item.snippet?.title || '';
        const ownerChannelId = item.snippet?.channelId || '';
        const ownerChannelTitle = item.snippet?.channelTitle || '';
        const liveContent = item.snippet?.liveBroadcastContent;
        const liveDetails = item.liveStreamingDetails;

        if (expectedChannelId && ownerChannelId && ownerChannelId !== expectedChannelId) {
          console.warn(
            `🚫 [YouTubeService] Rejected foreign video ${cleanVideoId} (${ownerChannelTitle} / ${ownerChannelId}) — expected ${expectedChannelId}`
          );
          return {
            status: 'none',
            isLiveNow: false,
            hasEnded: false,
            title,
            channelId: ownerChannelId,
            channelTitle: ownerChannelTitle,
            channelMismatch: true,
          };
        }

        if (liveContent === 'live' && liveDetails?.actualStartTime && !liveDetails?.actualEndTime) {
          return {
            status: 'live',
            isLiveNow: true,
            hasEnded: false,
            title,
            channelId: ownerChannelId,
            channelTitle: ownerChannelTitle,
          };
        }
        if (liveDetails && (liveDetails.actualEndTime || liveContent === 'none')) {
          return {
            status: 'completed',
            isLiveNow: false,
            hasEnded: true,
            title,
            channelId: ownerChannelId,
            channelTitle: ownerChannelTitle,
          };
        }
        return {
          status: 'none',
          isLiveNow: false,
          hasEnded: false,
          title,
          channelId: ownerChannelId,
          channelTitle: ownerChannelTitle,
        };
      }
      // Valid 200 response with empty items means video does not exist
      return { status: 'none', isLiveNow: false, hasEnded: false };
    }
  } catch (e) {
    // Fall through to primary-player watch-page inspection only on API/network failure
  }

  // Fallback: inspect ONLY the primary player's `videoDetails` object on the watch page (NEVER sidebar videos)
  try {
    const watchRes = await fetch(`https://www.youtube.com/watch?v=${cleanVideoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (watchRes.ok) {
      const html = await watchRes.text();
      if (html.includes('"status":"LOGIN_REQUIRED"')) {
        return { status: 'none', isLiveNow: false, hasEnded: false };
      }

      const vdMatch = html.match(
        new RegExp(`"videoDetails":\\{"videoId":"${cleanVideoId}"([\\s\\S]{0,2000})`)
      );
      if (!vdMatch) {
        return { status: 'none', isLiveNow: false, hasEnded: false };
      }

      const vdChunk = vdMatch[1] || '';
      const ownerMatch = vdChunk.match(/"channelId":"(UC[\w-]{22})"/);
      const ownerChannelId = ownerMatch ? ownerMatch[1] : '';

      if (expectedChannelId && ownerChannelId !== expectedChannelId) {
        console.warn(
          `🚫 [YouTubeService] Rejected foreign watch-page video ${cleanVideoId} (${ownerChannelId || 'unknown'}) — expected ${expectedChannelId}`
        );
        return {
          status: 'none',
          isLiveNow: false,
          hasEnded: false,
          channelId: ownerChannelId,
          channelMismatch: true,
        };
      }

      const titleMatch = html.match(/<title>([^<]+)<\/title>/);
      const title = titleMatch ? titleMatch[1].replace(/ - YouTube$/i, '').trim() : '';
      const isLiveInPlayer = vdChunk.includes('"isLive":true') && !vdChunk.includes('"isUpcoming":true');
      const isLiveContent = vdChunk.includes('"isLiveContent":true');

      if (isLiveInPlayer) {
        return { status: 'live', isLiveNow: true, hasEnded: false, title, channelId: ownerChannelId };
      }
      if (isLiveContent) {
        return { status: 'completed', isLiveNow: false, hasEnded: true, title, channelId: ownerChannelId };
      }
      return { status: 'none', isLiveNow: false, hasEnded: false, title, channelId: ownerChannelId };
    }
  } catch {
    // Non-fatal
  }

  return { status: 'none', isLiveNow: false, hasEnded: false };
  })()
    .then((result) => {
      LIVE_STATUS_CACHE.set(cacheKey, { ts: Date.now(), data: result });
      return result;
    })
    .finally(() => {
      LIVE_STATUS_IN_FLIGHT.delete(cacheKey);
    });

  LIVE_STATUS_IN_FLIGHT.set(cacheKey, task);
  return task;
}

/**
 * Searches the church's YouTube channel for an active live broadcast.
 * Uses channel-scoped Live Streams Playlist (UULV) + Channel RSS + `videos.list` (2 quota units, ZERO search.list)
 * and strictly verifies that any detected video belongs to the exact church channelId.
 */
export async function findActiveLiveStream(
  channelHandleOrUrl?: string,
  expectedChannelId?: string | null
): Promise<ActiveLiveStreamResult> {
  if (!channelHandleOrUrl) {
    return { videoId: null, title: '', isLiveNow: false, hasEnded: false, status: 'none' };
  }
  const streamKey = `${channelHandleOrUrl}:${expectedChannelId || ''}`;
  const cachedStream = ACTIVE_STREAM_CACHE.get(streamKey);
  if (cachedStream && Date.now() - cachedStream.ts < YOUTUBE_LIVE_CACHE_TTL_MS) {
    return cachedStream.data;
  }
  const pendingStream = ACTIVE_STREAM_IN_FLIGHT.get(streamKey);
  if (pendingStream) return pendingStream;

  const runStreamDiscovery = async (): Promise<ActiveLiveStreamResult> => {
  try {
    const { handle, channelId: directCId, videoId: directVideoId } = sanitizeYoutubeInput(channelHandleOrUrl);

    // If an 11-char video ID was provided directly:
    if (directVideoId) {
      const vStatus = await checkVideoLiveStatus(directVideoId, expectedChannelId);
      if (vStatus.channelMismatch) {
        return { videoId: null, title: '', isLiveNow: false, hasEnded: false, status: 'none' };
      }
      return {
        videoId: directVideoId,
        title: vStatus.title || 'Live Stream',
        isLiveNow: vStatus.isLiveNow,
        hasEnded: vStatus.hasEnded,
        status: vStatus.status,
      };
    }

    const channelId = expectedChannelId || directCId || (handle ? await getChannelId(handle) : null);
    if (!channelId) {
      return { videoId: null, title: '', isLiveNow: false, hasEnded: false, status: 'none' };
    }

    // Method 1: Fetch UULV Live Streams Playlist AND Channel RSS in parallel
    const candidateIds: string[] = [];
    const suffix = channelId.slice(2);

    const [uulvIds, rssIds] = await Promise.all([
      fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=UULV${suffix}&maxResults=5&key=${YOUTUBE_API_KEY}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((uulvData) =>
          (uulvData?.items || []).map((it: any) => it?.contentDetails?.videoId).filter(Boolean) as string[]
        )
        .catch(() => [] as string[]),
      fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`)
        .then((res) => (res.ok ? res.text() : ''))
        .then((xml) => {
          const out: string[] = [];
          if (!xml) return out;
          const matches = xml.matchAll(/<yt:videoId>([\w-]{11})<\/yt:videoId>/g);
          for (const m of matches) {
            if (m[1]) out.push(m[1]);
            if (out.length >= 6) break;
          }
          return out;
        })
        .catch(() => [] as string[]),
    ]);
    candidateIds.push(...uulvIds, ...rssIds);

    const uniqueIds = Array.from(new Set(candidateIds.filter((id) => /^[\w-]{11}$/.test(id)))).slice(0, 12);
    if (uniqueIds.length > 0) {
      try {
        const vRes = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${uniqueIds.join(',')}&key=${YOUTUBE_API_KEY}`
        );
        if (vRes.ok) {
          const vData = await vRes.json();
          for (const item of vData.items || []) {
            if (item?.snippet?.channelId !== channelId) continue;
            const liveContent = item?.snippet?.liveBroadcastContent;
            const liveDetails = item?.liveStreamingDetails;
            if (liveContent === 'live' && liveDetails?.actualStartTime && !liveDetails?.actualEndTime) {
              const title = item.snippet?.title || 'Church Live Stream';
              console.log(`🔴 [YouTubeService] Verified active live stream for ${channelId}: ${item.id} ("${title}")`);
              return { videoId: item.id, title, isLiveNow: true, hasEnded: false, status: 'live' };
            }
          }
        }
      } catch {
        // Fall through to hardened /live check
      }
    }

    // Method 2: Hardened `/channel/{channelId}/live` fast-start check (strictly verified against channelId)
    try {
      const liveUrl = `https://www.youtube.com/channel/${channelId}/live`;
      const liveRes = await fetch(liveUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });
      if (liveRes.ok) {
        const html = await liveRes.text();
        if (!html.includes('"status":"LOGIN_REQUIRED"')) {
          const vdMatch = html.match(/"videoDetails":\{"videoId":"([\w-]{11})"([\s\S]{0,2000})/);
          if (vdMatch && vdMatch[1]) {
            const candidateId = vdMatch[1];
            const vdChunk = vdMatch[2] || '';
            const ownsVideo = vdChunk.includes(`"channelId":"${channelId}"`);
            const looksLive = vdChunk.includes('"isLive":true') && !vdChunk.includes('"isUpcoming":true');
            if (ownsVideo && looksLive) {
              const verified = await checkVideoLiveStatus(candidateId, channelId);
              if (verified.isLiveNow && !verified.channelMismatch) {
                console.log(`🔴 [YouTubeService] Active live stream resolved via /live: ${candidateId}`);
                return {
                  videoId: candidateId,
                  title: verified.title || 'Church Service',
                  isLiveNow: true,
                  hasEnded: false,
                  status: 'live',
                };
              }
            }
          }
        }
      }
    } catch (scrapeLiveErr) {
      console.warn('⚠️ [YouTubeService] Direct live check notice:', scrapeLiveErr);
    }

    return { videoId: null, title: '', isLiveNow: false, hasEnded: false, status: 'none' };
  } catch (err) {
    console.error('❌ [YouTubeService] findActiveLiveStream error:', err);
    return { videoId: null, title: '', isLiveNow: false, hasEnded: false, status: 'none' };
  }
  };

  const task = runStreamDiscovery()
    .then((result) => {
      ACTIVE_STREAM_CACHE.set(streamKey, { ts: Date.now(), data: result });
      ACTIVE_STREAM_IN_FLIGHT.delete(streamKey);
      return result;
    })
    .catch(() => {
      ACTIVE_STREAM_IN_FLIGHT.delete(streamKey);
      return { videoId: null, title: '', isLiveNow: false, hasEnded: false, status: 'none' } as ActiveLiveStreamResult;
    });

  ACTIVE_STREAM_IN_FLIGHT.set(streamKey, task);
  return task;
}
