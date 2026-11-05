// YouTubeService.ts
// Automatically finds the recording of a past church event from YouTube or active live streams

const YOUTUBE_API_KEY = 'AIzaSyBGkm7DNk_jpM-XKJI0JPk_vJlufS4Q7-Q';

// Cache channelId per handle so we don't fetch it every time
const channelIdCache: Record<string, string> = {
  '@Brothersinchristfellowship': 'UC3J_2zP2bIuCwEia_ASvghw',
  '@Brothersinchhristfellowship': 'UC3J_2zP2bIuCwEia_ASvghw',
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

  // Fix common handle typos (e.g. double 'h' in Brothers In Christ Fellowship)
  s = s.replace(/Brothersinchhristfellowship/gi, 'Brothersinchristfellowship');

  // Direct video ID from watch or embed link
  const vMatch = s.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/i);
  if (vMatch && !s.includes('/live')) {
    return { videoId: vMatch[1], handle: null, channelId: null, cleanUrl: `https://www.youtube.com/watch?v=${vMatch[1]}` };
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
  if (channelIdCache[targetHandle]) return channelIdCache[targetHandle];

  // Method 1: Direct HTML scrape (Zero quota cost, immune to 429 quota exhaustion)
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
      const m = html.match(/channel_id=([a-zA-Z0-9_-]+)/) ||
                html.match(/"channelId":"([a-zA-Z0-9_-]+)"/) ||
                html.match(/<meta itemprop="identifier" content="([a-zA-Z0-9_-]+)">/) ||
                html.match(/<meta itemprop="channelId" content="([a-zA-Z0-9_-]+)">/);
      if (m && m[1]) {
        channelIdCache[targetHandle] = m[1];
        console.log('✅ [YouTubeService] Channel ID resolved via direct lookup:', m[1]);
        return m[1];
      }
    }
  } catch (scrapeErr) {
    // Continue to API fallback
  }

  // Method 2: YouTube API search fallback (when quota is available)
  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(targetHandle)}&type=channel&key=${YOUTUBE_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.items && data.items.length > 0) {
      const id = data.items[0].id.channelId;
      channelIdCache[targetHandle] = id;
      console.log('✅ [YouTubeService] Channel ID resolved via API:', id);
      return id;
    }
  } catch (error) {
    console.error('❌ [YouTubeService] getChannelId API error:', error);
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

/**
 * Searches the church's YouTube channel for an active live broadcast or recent stream.
 * Returns { videoId, title, isLiveNow } if found, or null if no stream is active.
 * Uses direct HTML inspection first to bypass API quota limits (HTTP 429).
 */
export async function findActiveLiveStream(
  channelHandleOrUrl?: string
): Promise<{ videoId: string; title: string; isLiveNow?: boolean } | null> {
  if (!channelHandleOrUrl) return null;
  try {
    const { handle, channelId: directCId, videoId: directVideoId } = sanitizeYoutubeInput(channelHandleOrUrl);

    if (directVideoId) {
      return { videoId: directVideoId, title: 'Live Broadcast', isLiveNow: true };
    }

    const channelId = directCId || (handle ? await getChannelId(handle) : null);
    const targetPath = handle ? handle : (channelId ? `channel/${channelId}` : null);

    // Method 1: Direct Live URL Check (Zero API quota cost, bypasses 429 quota limit)
    if (targetPath) {
      try {
        const liveUrl = `https://www.youtube.com/${targetPath}/live`;
        const liveRes = await fetch(liveUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          redirect: 'follow',
        });
        const finalUrl = liveRes.url || '';
        const html = await liveRes.text();

        const v1 = finalUrl.match(/watch\?v=([a-zA-Z0-9_-]{11})/);
        const v2 = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        const v3 = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})"/);
        const liveVideoId = v1?.[1] || v2?.[1] || v3?.[1];

        if (liveVideoId) {
          const isLiveNow = html.includes('"isLive":true') ||
                            html.includes('"isLiveBroadcast":true') ||
                            html.includes('LIVE NOW') ||
                            html.includes('LIVE_STREAM') ||
                            html.includes('"status":"LIVE"') ||
                            html.includes('"isLiveNow":true');

          const isLiveContent = html.includes('"isLiveContent":true');

          const titleMatch = html.match(/<title>([^<]+)<\/title>/);
          const title = titleMatch 
            ? titleMatch[1].replace(/ - YouTube$/i, '').trim() 
            : 'Church Video';

          console.log(`🔴 [YouTubeService] Stream / recording resolved directly: ${liveVideoId} ("${title}") [isLiveNow: ${isLiveNow || isLiveContent}]`);
          return { videoId: liveVideoId, title, isLiveNow: !!(isLiveNow || isLiveContent) };
        }
      } catch (scrapeLiveErr) {
        console.warn('⚠️ [YouTubeService] Direct live check notice:', scrapeLiveErr);
      }
    }

    // Method 2: YouTube API search fallback
    if (channelId) {
      try {
        const searchUrl =
          `https://www.googleapis.com/youtube/v3/search` +
          `?part=snippet` +
          `&channelId=${channelId}` +
          `&eventType=live` +
          `&type=video` +
          `&maxResults=1` +
          `&key=${YOUTUBE_API_KEY}`;

        const res = await fetch(searchUrl);
        const data = await res.json();

        if (data.items && data.items.length > 0) {
          const item = data.items[0];
          const videoId = item?.id?.videoId;
          const title = item?.snippet?.title || 'Church Live Stream';
          if (videoId) {
            console.log(`🔴 [YouTubeService] Active live stream found via API: ${videoId} ("${title}")`);
            return { videoId, title, isLiveNow: true };
          }
        }
      } catch (apiErr) {
        // Ignored
      }
    }

    return null;
  } catch (err) {
    console.error('❌ [YouTubeService] findActiveLiveStream error:', err);
    return null;
  }
}
