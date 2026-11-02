/**
 * VerseBackgrounds.ts
 * Curated high-resolution spiritual nature & Christian background images
 * for the 4 Daily Verse time slots (Morning, Afternoon, Evening, Night).
 * Guarantees that every Daily Verse card always has a stunning background.
 */

export const CURATED_VERSE_BACKGROUNDS: Record<string, string[]> = {
  Morning: [
    'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1080&q=80&auto=format&fit=crop', // Yosemite sunrise
    'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=1080&q=80&auto=format&fit=crop', // Golden morning sunrise
    'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1080&q=80&auto=format&fit=crop', // Mountain sunrise rays
    'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1080&q=80&auto=format&fit=crop', // Ocean sunrise
  ],
  Afternoon: [
    'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1080&q=80&auto=format&fit=crop', // Sunlight forest
    'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1080&q=80&auto=format&fit=crop', // Majestic mountain daylight
    'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1080&q=80&auto=format&fit=crop', // Green pastures
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1080&q=80&auto=format&fit=crop', // Serene lake waters
  ],
  Evening: [
    'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1080&q=80&auto=format&fit=crop', // Golden sunset
    'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=1080&q=80&auto=format&fit=crop', // Evening golden sun
    'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1080&q=80&auto=format&fit=crop', // Peaceful sunset meadow
    'https://images.unsplash.com/photo-1509099836639-18ba1795216d?w=1080&q=80&auto=format&fit=crop', // Warm sunset mountain
  ],
  Night: [
    'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1080&q=80&auto=format&fit=crop', // Starry night sky
    'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1080&q=80&auto=format&fit=crop', // Twilight starry heavens
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1080&q=80&auto=format&fit=crop', // Celestial starry space
    'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=1080&q=80&auto=format&fit=crop', // Peaceful starry sky
  ],
};

export const DEFAULT_VERSE_BACKGROUND =
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1080&q=80&auto=format&fit=crop';

/**
 * Returns a high-res background image URL for any verse.
 * If verse already has a valid backgroundUrl, returns it.
 * Otherwise, deterministically selects a stunning background based on period and index.
 */
export function getVerseBackgroundUrl(
  verse?: { backgroundUrl?: string; index?: number } | null,
  period?: string,
  indexFallback: number = 0
): string {
  if (verse?.backgroundUrl && typeof verse.backgroundUrl === 'string' && verse.backgroundUrl.trim().length > 10) {
    return verse.backgroundUrl.trim();
  }

  const p = period && CURATED_VERSE_BACKGROUNDS[period] ? period : 'Morning';
  const list = CURATED_VERSE_BACKGROUNDS[p] || CURATED_VERSE_BACKGROUNDS.Morning;
  const idx = typeof verse?.index === 'number' ? Math.abs(verse.index) : Math.abs(indexFallback);

  return list[idx % list.length] || DEFAULT_VERSE_BACKGROUND;
}
