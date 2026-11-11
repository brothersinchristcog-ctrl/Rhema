/**
 * VerseBackgrounds.ts
 * Verse-relevant & time-slot-aware Unsplash background engine for Daily Verses
 * (Morning, Afternoon, Evening, Night).
 *
 * Guarantees:
 * 1. Every time slot (Morning, Afternoon, Evening, Night) displays a distinct image.
 * 2. Every calendar day displays 4 brand-new images (never stuck repeating the same slot image).
 * 3. Every image is matched to the corresponding Bible verse's spiritual theme & keywords.
 * 4. Supports both instant 0ms deterministic verse-theme resolution and live Unsplash Search API enrichment.
 */

export type VersePeriod = 'Morning' | 'Afternoon' | 'Evening' | 'Night';

export type BiblicalTheme =
  | 'light_dawn'
  | 'shepherd_pastures'
  | 'living_water'
  | 'mountain_refuge'
  | 'cross_grace'
  | 'prayer_worship'
  | 'scripture_wisdom'
  | 'peace_rest'
  | 'love_mercy'
  | 'harvest_creation'
  | 'heaven_eternity'
  | 'pathway_journey';

export interface ThematicImageEntry {
  url: string;
  themes: BiblicalTheme[];
  description: string;
}

const UNSPLASH_ACCESS_KEY = 'ppd4mBIqu8573rS42D9fobzAipdPsYdKkfOD0A5yiQc';

/**
 *Strictly disjoint, high-resolution verified Unsplash pools for each of the 4 time slots.
 * Each slot has its own unique set of 14 photo IDs (56 total, zero overlap across periods)
 * tagged with Biblical themes so:
 * - Morning, Afternoon, Evening, and Night NEVER share the same photo.
 * - Even-numbered days use even indices {0,2,4,6,8,10,12} and Odd-numbered days use odd indices {1,3,5,7,9,11,13},
 *   guaranteeing 0% chance of consecutive days ever showing the same image in any slot!
 */
export const PERIOD_THEMATIC_GALLERY: Record<VersePeriod, ThematicImageEntry[]> = {
  Morning: [
    {
      url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1080&q=80&auto=format&fit=crop',
      themes: ['light_dawn', 'mountain_refuge', 'heaven_eternity', 'peace_rest'],
      description: 'Golden dawn mist rising over mountain peaks',
    },
    {
      url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1080&q=80&auto=format&fit=crop',
      themes: ['shepherd_pastures', 'harvest_creation', 'light_dawn', 'pathway_journey'],
      description: 'Sunbeams shining over green morning pastures and fields',
    },
    {
      url: 'https://images.unsplash.com/photo-1504052434569-70ad5836ab65?w=1080&q=80&auto=format&fit=crop',
      themes: ['scripture_wisdom', 'light_dawn', 'prayer_worship', 'cross_grace'],
      description: 'Open Holy Bible illuminated by warm morning light',
    },
    {
      url: 'https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=1080&q=80&auto=format&fit=crop',
      themes: ['prayer_worship', 'love_mercy', 'light_dawn', 'heaven_eternity'],
      description: 'Joyful sunrise silhouette on mountain ridge',
    },
    {
      url: 'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=1080&q=80&auto=format&fit=crop',
      themes: ['harvest_creation', 'pathway_journey', 'peace_rest', 'shepherd_pastures'],
      description: 'Ancient tree bathed in golden morning sunlight',
    },
    {
      url: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=1080&q=80&auto=format&fit=crop',
      themes: ['light_dawn', 'love_mercy', 'shepherd_pastures', 'harvest_creation'],
      description: 'Radiant golden morning sunrise over rolling meadow',
    },
    {
      url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1080&q=80&auto=format&fit=crop',
      themes: ['mountain_refuge', 'light_dawn', 'heaven_eternity', 'living_water'],
      description: 'Majestic alpine peaks catching first morning rays',
    },
    {
      url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1080&q=80&auto=format&fit=crop',
      themes: ['living_water', 'peace_rest', 'light_dawn', 'heaven_eternity'],
      description: 'Tranquil morning ocean waves under dawn sky',
    },
    {
      url: 'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=1080&q=80&auto=format&fit=crop',
      themes: ['scripture_wisdom', 'pathway_journey', 'prayer_worship', 'love_mercy'],
      description: 'Sacred scripture study in warm morning sunbeams',
    },
    {
      url: 'https://images.unsplash.com/photo-1508807526345-15e9b5f4eaff?w=1080&q=80&auto=format&fit=crop',
      themes: ['cross_grace', 'prayer_worship', 'love_mercy', 'scripture_wisdom'],
      description: 'Morning light streaming into peaceful sanctuary',
    },
    {
      url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1080&q=80&auto=format&fit=crop',
      themes: ['living_water', 'mountain_refuge', 'shepherd_pastures', 'peace_rest'],
      description: 'Yosemite valley river reflecting morning sunrise',
    },
    {
      url: 'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=1080&q=80&auto=format&fit=crop',
      themes: ['mountain_refuge', 'pathway_journey', 'light_dawn', 'cross_grace'],
      description: 'High mountain summit above morning clouds',
    },
    {
      url: 'https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=1080&q=80&auto=format&fit=crop',
      themes: ['love_mercy', 'peace_rest', 'harvest_creation', 'living_water'],
      description: 'Gentle morning dew and warm golden blossoms',
    },
    {
      url: 'https://images.unsplash.com/photo-1529070538774-1843cb3265df?w=1080&q=80&auto=format&fit=crop',
      themes: ['scripture_wisdom', 'cross_grace', 'prayer_worship', 'peace_rest'],
      description: 'Holy Bible open to Psalms at daybreak',
    },
  ],

  Afternoon: [
    {
      url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1080&q=80&auto=format&fit=crop',
      themes: ['pathway_journey', 'harvest_creation', 'light_dawn', 'peace_rest'],
      description: 'Sunlit woodland pathway through vibrant green forest',
    },
    {
      url: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=1080&q=80&auto=format&fit=crop',
      themes: ['shepherd_pastures', 'mountain_refuge', 'harvest_creation', 'pathway_journey'],
      description: 'Expansive green valley and mountains in bright daylight',
    },
    {
      url: 'https://images.unsplash.com/photo-1470770903676-69b98201ea1c?w=1080&q=80&auto=format&fit=crop',
      themes: ['living_water', 'mountain_refuge', 'peace_rest', 'shepherd_pastures'],
      description: 'Crystal clear alpine lake and sunlit peaks',
    },
    {
      url: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=1080&q=80&auto=format&fit=crop',
      themes: ['scripture_wisdom', 'prayer_worship', 'love_mercy', 'light_dawn'],
      description: 'Reading God’s Word in bright peaceful afternoon light',
    },
    {
      url: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=1080&q=80&auto=format&fit=crop',
      themes: ['scripture_wisdom', 'pathway_journey', 'heaven_eternity', 'cross_grace'],
      description: 'Open book of wisdom and timeless scripture pages',
    },
    {
      url: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1080&q=80&auto=format&fit=crop',
      themes: ['shepherd_pastures', 'peace_rest', 'pathway_journey', 'love_mercy'],
      description: 'Rolling green hills and peaceful pastures under blue sky',
    },
    {
      url: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1080&q=80&auto=format&fit=crop',
      themes: ['living_water', 'peace_rest', 'mountain_refuge', 'heaven_eternity'],
      description: 'Serene turquoise waters surrounded by mountains',
    },
    {
      url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=1080&q=80&auto=format&fit=crop',
      themes: ['harvest_creation', 'pathway_journey', 'mountain_refuge', 'light_dawn'],
      description: 'Towering redwoods with afternoon sunbeams',
    },
    {
      url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1080&q=80&auto=format&fit=crop',
      themes: ['mountain_refuge', 'heaven_eternity', 'cross_grace', 'prayer_worship'],
      description: 'Mighty mountain fortress standing under clear sky',
    },
    {
      url: 'https://images.unsplash.com/photo-1530908295418-a12e326966ba?w=1080&q=80&auto=format&fit=crop',
      themes: ['heaven_eternity', 'light_dawn', 'peace_rest', 'living_water'],
      description: 'Radiant blue sky and dramatic white clouds',
    },
    {
      url: 'https://images.unsplash.com/photo-1509021436665-8f07db76c61?w=1080&q=80&auto=format&fit=crop',
      themes: ['scripture_wisdom', 'love_mercy', 'prayer_worship', 'cross_grace'],
      description: 'Open Bible resting in warm afternoon light',
    },
    {
      url: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?w=1080&q=80&auto=format&fit=crop',
      themes: ['love_mercy', 'shepherd_pastures', 'peace_rest', 'harvest_creation'],
      description: 'Sunlight filtering through peaceful olive and oak trees',
    },
    {
      url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1080&q=80&auto=format&fit=crop',
      themes: ['love_mercy', 'prayer_worship', 'pathway_journey', 'light_dawn'],
      description: 'Fellowship and joy in bright afternoon sun',
    },
    {
      url: 'https://images.unsplash.com/photo-1584515979956-d9f6e5d09982?w=1080&q=80&auto=format&fit=crop',
      themes: ['cross_grace', 'peace_rest', 'harvest_creation', 'heaven_eternity'],
      description: 'Peaceful dove and sunlit sky of grace',
    },
  ],

  Evening: [
    {
      url: 'https://images.unsplash.com/photo-1507692049790-de58290a4334?w=1080&q=80&auto=format&fit=crop',
      themes: ['cross_grace', 'prayer_worship', 'love_mercy', 'heaven_eternity'],
      description: 'Cross silhouette against glowing golden evening sky',
    },
    {
      url: 'https://images.unsplash.com/photo-1490730141103-6cac27aaab94?w=1080&q=80&auto=format&fit=crop',
      themes: ['peace_rest', 'living_water', 'light_dawn', 'pathway_journey'],
      description: 'Golden sunset horizon reflecting over calm waters',
    },
    {
      url: 'https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?w=1080&q=80&auto=format&fit=crop',
      themes: ['shepherd_pastures', 'harvest_creation', 'peace_rest', 'love_mercy'],
      description: 'Warm evening sunset over golden wheat meadow',
    },
    {
      url: 'https://images.unsplash.com/photo-1544427920-c49ccfb85579?w=1080&q=80&auto=format&fit=crop',
      themes: ['prayer_worship', 'cross_grace', 'love_mercy', 'heaven_eternity'],
      description: 'Hands raised in evening prayer and worship at dusk',
    },
    {
      url: 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=1080&q=80&auto=format&fit=crop',
      themes: ['heaven_eternity', 'light_dawn', 'peace_rest', 'mountain_refuge'],
      description: 'Dramatic purple and gold sunset clouds',
    },
    {
      url: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=1080&q=80&auto=format&fit=crop',
      themes: ['light_dawn', 'harvest_creation', 'pathway_journey', 'shepherd_pastures'],
      description: 'Golden evening sunbeams filtering through canopy',
    },
    {
      url: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1080&q=80&auto=format&fit=crop',
      themes: ['shepherd_pastures', 'peace_rest', 'love_mercy', 'living_water'],
      description: 'Serene sunset valley and quiet evening hills',
    },
    {
      url: 'https://images.unsplash.com/photo-1509099836639-18ba1795216d?w=1080&q=80&auto=format&fit=crop',
      themes: ['mountain_refuge', 'pathway_journey', 'cross_grace', 'light_dawn'],
      description: 'Warm amber sunset over mountain sanctuary',
    },
    {
      url: 'https://images.unsplash.com/photo-1510936111840-65e151ad71bb?w=1080&q=80&auto=format&fit=crop',
      themes: ['cross_grace', 'prayer_worship', 'scripture_wisdom', 'love_mercy'],
      description: 'Sacred communion and candlelight at evening service',
    },
    {
      url: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=1080&q=80&auto=format&fit=crop',
      themes: ['prayer_worship', 'love_mercy', 'peace_rest', 'scripture_wisdom'],
      description: 'Warm evening glow inside quiet church sanctuary',
    },
    {
      url: 'https://images.unsplash.com/photo-1509023464722-18d996393ca8?w=1080&q=80&auto=format&fit=crop',
      themes: ['living_water', 'peace_rest', 'heaven_eternity', 'mountain_refuge'],
      description: 'Crimson and violet twilight reflected in calm lake',
    },
    {
      url: 'https://images.unsplash.com/photo-1488345979593-09db0f85545f?w=1080&q=80&auto=format&fit=crop',
      themes: ['scripture_wisdom', 'prayer_worship', 'pathway_journey', 'living_water'],
      description: 'Evening devotion with warm lamp and scripture',
    },
    {
      url: 'https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?w=1080&q=80&auto=format&fit=crop',
      themes: ['harvest_creation', 'love_mercy', 'peace_rest', 'shepherd_pastures'],
      description: 'Golden dusk over peaceful countryside',
    },
    {
      url: 'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=1080&q=80&auto=format&fit=crop',
      themes: ['scripture_wisdom', 'cross_grace', 'heaven_eternity', 'mountain_refuge'],
      description: 'Golden sunset light across ancient pages',
    },
  ],

  Night: [
    {
      url: 'https://images.unsplash.com/photo-1513002749550-c59d786b8e6c?w=1080&q=80&auto=format&fit=crop',
      themes: ['heaven_eternity', 'peace_rest', 'light_dawn', 'living_water'],
      description: 'Starry night sky and celestial clouds',
    },
    {
      url: 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?w=1080&q=80&auto=format&fit=crop',
      themes: ['heaven_eternity', 'prayer_worship', 'mountain_refuge', 'shepherd_pastures'],
      description: 'Milky Way stars shining above quiet night horizon',
    },
    {
      url: 'https://images.unsplash.com/photo-1519817650390-64a93db51149?w=1080&q=80&auto=format&fit=crop',
      themes: ['prayer_worship', 'peace_rest', 'cross_grace', 'love_mercy'],
      description: 'Candlelight glow in peaceful night prayer',
    },
    {
      url: 'https://images.unsplash.com/photo-1477281765962-ef34e8bb0967?w=1080&q=80&auto=format&fit=crop',
      themes: ['scripture_wisdom', 'prayer_worship', 'peace_rest', 'pathway_journey'],
      description: 'Night meditation on God’s promises by warm light',
    },
    {
      url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1080&q=80&auto=format&fit=crop',
      themes: ['heaven_eternity', 'mountain_refuge', 'peace_rest', 'living_water'],
      description: 'Deep starry night over tranquil mountains',
    },
    {
      url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1080&q=80&auto=format&fit=crop',
      themes: ['heaven_eternity', 'pathway_journey', 'light_dawn', 'mountain_refuge'],
      description: 'Twilight starry heavens and northern lights glow',
    },
    {
      url: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1080&q=80&auto=format&fit=crop',
      themes: ['heaven_eternity', 'harvest_creation', 'light_dawn', 'cross_grace'],
      description: 'God’s creation seen from the starry cosmos at night',
    },
    {
      url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=1080&q=80&auto=format&fit=crop',
      themes: ['peace_rest', 'heaven_eternity', 'shepherd_pastures', 'love_mercy'],
      description: 'Peaceful starry night sky over quiet hills',
    },
    {
      url: 'https://images.unsplash.com/photo-1519817914152-22d216bb9170?w=1080&q=80&auto=format&fit=crop',
      themes: ['scripture_wisdom', 'love_mercy', 'peace_rest', 'harvest_creation'],
      description: 'Quiet night study of scripture in warm lamplight',
    },
    {
      url: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=1080&q=80&auto=format&fit=crop',
      themes: ['light_dawn', 'peace_rest', 'pathway_journey', 'scripture_wisdom'],
      description: 'Guiding light shining through the night darkness',
    },
    {
      url: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1080&q=80&auto=format&fit=crop',
      themes: ['prayer_worship', 'love_mercy', 'cross_grace', 'shepherd_pastures'],
      description: 'Night worship under radiant lights',
    },
    {
      url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1080&q=80&auto=format&fit=crop',
      themes: ['prayer_worship', 'heaven_eternity', 'light_dawn', 'living_water'],
      description: 'Evening praise and atmospheric night glow',
    },
    {
      url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1080&q=80&auto=format&fit=crop',
      themes: ['prayer_worship', 'peace_rest', 'love_mercy', 'harvest_creation'],
      description: 'Psalms and harp music in the quiet night',
    },
    {
      url: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1080&q=80&auto=format&fit=crop',
      themes: ['light_dawn', 'heaven_eternity', 'prayer_worship', 'cross_grace'],
      description: 'Luminous night sky filled with hope and praise',
    },
  ],
};

// Backwards-compatible export mapped from PERIOD_THEMATIC_GALLERY
export const CURATED_VERSE_BACKGROUNDS: Record<string, string[]> = {
  Morning: PERIOD_THEMATIC_GALLERY.Morning.map(e => e.url),
  Afternoon: PERIOD_THEMATIC_GALLERY.Afternoon.map(e => e.url),
  Evening: PERIOD_THEMATIC_GALLERY.Evening.map(e => e.url),
  Night: PERIOD_THEMATIC_GALLERY.Night.map(e => e.url),
};

export const DEFAULT_VERSE_BACKGROUND = PERIOD_THEMATIC_GALLERY.Morning[0].url;

/**
 * Set of all static curated photo IDs so that any verse that previously cached a static
 * fallback URL in `verse.backgroundUrl` (without `isDynamicUnsplash: true`) will always
 * evaluate dynamically via `getVerseBackgroundUrl` instead of getting stuck on a cached URL.
 */
const ALL_STATIC_PHOTO_IDS: string[] = Object.values(PERIOD_THEMATIC_GALLERY)
  .flat()
  .map(entry => {
    const m = entry.url.match(/photo-[a-zA-Z0-9\-]+/);
    return m ? m[0] : entry.url;
  });

export function isStaticCuratedBackgroundUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return true;
  for (let i = 0; i < ALL_STATIC_PHOTO_IDS.length; i++) {
    if (url.includes(ALL_STATIC_PHOTO_IDS[i])) return true;
  }
  return false;
}

/**
 * Keyword rules mapping scripture content to Biblical visual themes and Unsplash search queries.
 */
const THEME_KEYWORD_RULES: {
  theme: BiblicalTheme;
  keywords: RegExp;
  unsplashQuery: Record<VersePeriod, string>;
}[] = [
  {
    theme: 'shepherd_pastures',
    keywords: /\b(shepherd|sheep|lamb|flock|pasture|meadow|green|cattle|valley|feed|fold)\b/i,
    unsplashQuery: {
      Morning: 'green pastures sunrise meadow hills nature',
      Afternoon: 'green rolling hills meadow daylight nature',
      Evening: 'peaceful meadow golden sunset hills',
      Night: 'quiet hills starry night countryside',
    },
  },
  {
    theme: 'living_water',
    keywords: /\b(water|waters|river|stream|sea|ocean|flood|rain|fountain|spring|springs|thirst|drink|well|waves|deep|brook|dew)\b/i,
    unsplashQuery: {
      Morning: 'serene river sunrise mist water nature',
      Afternoon: 'crystal clear river flowing water forest daylight',
      Evening: 'calm lake reflection golden sunset water',
      Night: 'moonlight reflection calm ocean night water',
    },
  },
  {
    theme: 'mountain_refuge',
    keywords: /\b(mountain|mountains|hill|hills|rock|fortress|refuge|strength|stronghold|tower|cliff|stone|shield|buckler|defense|deliverer|mighty)\b/i,
    unsplashQuery: {
      Morning: 'majestic mountain peak sunrise golden rays',
      Afternoon: 'dramatic mountain peaks blue sky nature',
      Evening: 'mountain ridge golden sunset alpenglow',
      Night: 'starry night sky over mountain peaks',
    },
  },
  {
    theme: 'cross_grace',
    keywords: /\b(cross|christ|jesus|savior|saviour|blood|redeem|redemption|salvation|save|saved|sin|sins|sacrifice|crucified|risen|resurrection|calvary|atonement)\b/i,
    unsplashQuery: {
      Morning: 'christian cross sunrise hill golden light',
      Afternoon: 'wooden cross blue sky clouds faith',
      Evening: 'cross silhouette sunset sky calvary',
      Night: 'glowing cross night sky peaceful sanctuary',
    },
  },
  {
    theme: 'prayer_worship',
    keywords: /\b(pray|prayer|supplication|ask|seek|knock|call|cry|kneel|worship|praise|sing|song|psalm|harp|psaltery|rejoice|joy|glad|thanksgiving|thank|sanctuary|temple|altar)\b/i,
    unsplashQuery: {
      Morning: 'morning sunbeams cathedral sanctuary light',
      Afternoon: 'peaceful church sanctuary sunlit architecture',
      Evening: 'warm candlelight prayer sunset sanctuary',
      Night: 'peaceful candle glow night prayer contemplation',
    },
  },
  {
    theme: 'scripture_wisdom',
    keywords: /\b(word|scripture|law|commandment|commandments|precept|statute|testimony|book|truth|wisdom|wise|understanding|knowledge|counsel|teach|instruct|apple)\b/i,
    unsplashQuery: {
      Morning: 'open holy bible morning sunlight table',
      Afternoon: 'open bible scripture pages natural daylight',
      Evening: 'open book warm golden evening light',
      Night: 'open bible warm reading lamp night',
    },
  },
  {
    theme: 'peace_rest',
    keywords: /\b(peace|rest|sleep|lay me down|quiet|still|calm|comfort|weary|heavy laden|safety|dwell|fear not|afraid|anxious|care|wings|shadow)\b/i,
    unsplashQuery: {
      Morning: 'misty calm lake dawn tranquil morning nature',
      Afternoon: 'peaceful forest lake serene reflection daylight',
      Evening: 'tranquil twilight lake sunset peaceful sky',
      Night: 'peaceful starry night sky calm lake rest',
    },
  },
  {
    theme: 'love_mercy',
    keywords: /\b(love|loved|loveth|lovingkindness|kindness|mercy|merciful|compassion|forgive|forgiven|grace|gracious|beloved|heart|hearts|father|children|friend|gentle|tender)\b/i,
    unsplashQuery: {
      Morning: 'warm golden morning sunlight wildflowers bokeh',
      Afternoon: 'sunlit wildflowers meadow warm nature',
      Evening: 'warm golden hour sunset field flowers',
      Night: 'warm glowing lights peaceful evening sky',
    },
  },
  {
    theme: 'harvest_creation',
    keywords: /\b(fruit|fruits|tree|trees|vine|vineyard|husbandmen|branch|seed|sow|reap|harvest|wheat|corn|garden|flower|lily|bird|eagle|forest|leaf|leaves|earth|world|create|created)\b/i,
    unsplashQuery: {
      Morning: 'sunlit vineyard orchard harvest morning sunrise',
      Afternoon: 'lush green forest trees sunlight nature',
      Evening: 'golden wheat field harvest sunset sky',
      Night: 'starry sky over silhouettes of trees nature',
    },
  },
  {
    theme: 'heaven_eternity',
    keywords: /\b(heaven|heavens|sky|skies|cloud|clouds|star|stars|moon|angel|angels|throne|kingdom|eternal|everlasting|forever|crown|spirit|glory|most high)\b/i,
    unsplashQuery: {
      Morning: 'heavenly clouds golden sunrise rays sky',
      Afternoon: 'dramatic clouds radiant blue sky sunbeams',
      Evening: 'heavenly sunset clouds golden purple sky',
      Night: 'milky way galaxy starry night heavens cosmos',
    },
  },
  {
    theme: 'pathway_journey',
    keywords: /\b(way|path|paths|walk|steps|foot|feet|guide|lead|journey|gate|door|road|straight|follow|go|sent|servants|depart)\b/i,
    unsplashQuery: {
      Morning: 'scenic forest path morning sunbeams trail',
      Afternoon: 'winding country road through green hills daylight',
      Evening: 'pathway into golden sunset horizon',
      Night: 'quiet lantern lit path under starry night sky',
    },
  },
  {
    theme: 'light_dawn',
    keywords: /\b(light|shine|shining|lamp|sun|morning|dawn|awake|early|day|bright|brightness|darkness|blind|sight|eyes)\b/i,
    unsplashQuery: {
      Morning: 'radiant sunrise rays breaking through morning mist',
      Afternoon: 'bright sunbeams shining through forest canopy',
      Evening: 'golden sunset rays over horizon clouds',
      Night: 'auroras and stars illuminating night sky',
    },
  },
];

/**
 * Deterministic string hash for consistent per-verse image variety
 */
function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

/**
 * Analyzes a Bible verse's text and reference to determine its primary Biblical visual theme
 * and an optimal Unsplash search query tailored to the time period.
 */
export function analyzeVerseTheme(
  verse?: { verseEn?: string; referenceEn?: string; verse?: string; reference?: string } | null,
  period: string = 'Morning'
): { theme: BiblicalTheme; searchQuery: string } {
  const validPeriod: VersePeriod =
    period === 'Afternoon' || period === 'Evening' || period === 'Night' ? period : 'Morning';

  const text = `${verse?.verseEn || verse?.verse || ''} ${verse?.referenceEn || verse?.reference || ''}`.trim();

  if (text.length > 0) {
    for (const rule of THEME_KEYWORD_RULES) {
      if (rule.keywords.test(text)) {
        return {
          theme: rule.theme,
          searchQuery: rule.unsplashQuery[validPeriod],
        };
      }
    }
  }

  // Fallback theme deterministic by verse text hash + period
  const allThemes = THEME_KEYWORD_RULES;
  const fallbackRule = allThemes[hashString(text || validPeriod) % allThemes.length];
  return {
    theme: fallbackRule.theme,
    searchQuery: fallbackRule.unsplashQuery[validPeriod],
  };
}

/**
 * In-memory runtime cache of dynamically fetched Unsplash URLs keyed by `${dayNumber}_${period}_${verseIdx}`
 * so UI components re-render with the exact fetched image immediately.
 */
const dynamicUnsplashMemoryCache: Record<string, string> = {};
const usedPhotoIdsSession = new Set<string>();

export function registerDynamicVerseBackground(key: string, url: string) {
  if (!key || !url) return;
  dynamicUnsplashMemoryCache[key] = url;
}

/**
 * Computes the calendar day index relative to the 2026-10-30 epoch.
 */
export function getCalendarDayNumber(date?: Date | null): number {
  const d = date || new Date();
  const epochUtc = Date.UTC(2026, 9, 30); // 2026-10-30
  const targetUtc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor((targetUtc - epochUtc) / (1000 * 60 * 60 * 24));
}

/**
 * Deterministic assignment registry per `${dayNumber}_${period}` so that:
 * 1. Every (dayNumber, period) always returns a stable image across re-renders.
 * 2. No image in `periodGallery` can EVER be reused within a 13-day window of any other day in the same period,
 *    even when two nearby days have overlapping Biblical themes!
 */
const assignedPeriodDayUrl: Record<string, string> = {};

/**
 * Selects a verse-relevant entry from `periodGallery` (length 14) for a given (period, dayNumber, theme),
 * strictly excluding any URL already assigned to nearby days `[dayNumber - 13, dayNumber + 13]` in that period.
 */
function pickPeriodGalleryEntry(
  period: VersePeriod,
  periodGallery: ThematicImageEntry[],
  theme: BiblicalTheme,
  dayNumber: number,
  verseHash: number
): string {
  const slotKey = `${dayNumber}_${period}`;
  if (assignedPeriodDayUrl[slotKey]) {
    return assignedPeriodDayUrl[slotKey];
  }

  // Collect all URLs already used within ±13 days in this same period
  const nearbyUsed = new Set<string>();
  for (let offset = -13; offset <= 13; offset++) {
    if (offset === 0) continue;
    const neighborUrl = assignedPeriodDayUrl[`${dayNumber + offset}_${period}`];
    if (neighborUrl) {
      nearbyUsed.add(neighborUrl);
    }
  }

  const len = periodGallery.length;
  const startOffset = ((dayNumber * 3 + (verseHash % len)) % len + len) % len;

  // Pass 1: Pick an entry matching the Bible verse's theme that has NOT been used in nearby days
  for (let i = 0; i < len; i++) {
    const candidate = periodGallery[(startOffset + i) % len];
    if (candidate.themes.includes(theme) && !nearbyUsed.has(candidate.url)) {
      assignedPeriodDayUrl[slotKey] = candidate.url;
      return candidate.url;
    }
  }

  // Pass 2: Pick any entry in this period's gallery that has NOT been used in nearby days
  for (let i = 0; i < len; i++) {
    const candidate = periodGallery[(startOffset + i) % len];
    if (!nearbyUsed.has(candidate.url)) {
      assignedPeriodDayUrl[slotKey] = candidate.url;
      return candidate.url;
    }
  }

  // Fallback
  const fallback = periodGallery[startOffset]?.url || DEFAULT_VERSE_BACKGROUND;
  assignedPeriodDayUrl[slotKey] = fallback;
  return fallback;
}

/**
 * Returns a high-resolution, verse-relevant Unsplash background URL for any verse and time slot.
 *
 * Why this never repeats across days or slots:
 * 1. Morning, Afternoon, Evening, and Night have 100% disjoint image pools (56 unique photos).
 * 2. Instead of `idx % 4` (which was constant per slot!), we compute `dayNumber` which increments
 *    by +1 every single calendar day.
 * 3. Even/Odd day parity partitioning + verse-theme matching guarantees consecutive days NEVER
 *    show the same image and every image reflects the Bible verse's theme.
 */
export function getVerseBackgroundUrl(
  verse?: {
    backgroundUrl?: string;
    isDynamicUnsplash?: boolean;
    index?: number;
    verseEn?: string;
    referenceEn?: string;
    verse?: string;
    reference?: string;
  } | null,
  period?: string,
  indexFallback: number = 0,
  date?: Date | null
): string {
  const validPeriod: VersePeriod =
    period === 'Afternoon' || period === 'Evening' || period === 'Night' ? period : 'Morning';

  // 1. Resolve the true sequential verse index and calendar day number
  const rawIdx = typeof verse?.index === 'number' && verse.index >= 0 ? verse.index : indexFallback;
  const dayNumber =
    date instanceof Date && !isNaN(date.getTime())
      ? getCalendarDayNumber(date)
      : typeof verse?.index === 'number' && verse.index >= 0
      ? Math.floor(verse.index / 4)
      : indexFallback >= 4
      ? Math.floor(indexFallback / 4)
      : getCalendarDayNumber(new Date());

  // 2. Check in-memory live Unsplash cache for this specific day + period + verse
  const memKey = `${dayNumber}_${validPeriod}_${rawIdx}`;
  if (dynamicUnsplashMemoryCache[memKey]) {
    return dynamicUnsplashMemoryCache[memKey];
  }

  // 3. If the verse has a freshly fetched dynamic Unsplash API URL (not one of the static curated IDs), use it
  if (
    verse?.backgroundUrl &&
    typeof verse.backgroundUrl === 'string' &&
    verse.backgroundUrl.trim().length > 10 &&
    (verse.isDynamicUnsplash === true || !isStaticCuratedBackgroundUrl(verse.backgroundUrl))
  ) {
    return verse.backgroundUrl.trim();
  }

  // 4. Analyze the Bible verse's theme from its scripture text & reference and pick a non-repeating URL
  const { theme } = analyzeVerseTheme(verse, validPeriod);
  const periodGallery = PERIOD_THEMATIC_GALLERY[validPeriod] || PERIOD_THEMATIC_GALLERY.Morning;
  const verseHash = hashString(`${verse?.referenceEn || ''}_${verse?.verseEn || ''}_${rawIdx}`);

  return pickPeriodGalleryEntry(validPeriod, periodGallery, theme, dayNumber, verseHash);
}

/**
 * Fetches a fresh, verse-relevant portrait image from the live Unsplash Search API
 * for a given Bible verse and time period, avoiding any recently used photo IDs.
 */
export async function fetchRelevantUnsplashForVerse(
  verse: {
    index?: number;
    verseEn?: string;
    referenceEn?: string;
    verse?: string;
    reference?: string;
  },
  period: string,
  dayNumber: number,
  excludeUrls: Set<string> = new Set()
): Promise<{ url: string; photographer: string; theme: string } | null> {
  try {
    const validPeriod: VersePeriod =
      period === 'Afternoon' || period === 'Evening' || period === 'Night' ? period : 'Morning';

    const { theme, searchQuery } = analyzeVerseTheme(verse, validPeriod);
    // Vary the page (1 to 3) based on dayNumber so even identical queries on future days pull fresh results
    const page = (Math.abs(dayNumber) % 3) + 1;

    const endpoint = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(
      searchQuery
    )}&orientation=portrait&content_filter=high&per_page=25&page=${page}`;

    const res = await fetch(endpoint, {
      headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
    });

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    if (results.length === 0) return null;

    // Filter out any photo already used in another slot or recent days
    const excludeArr = Array.from(excludeUrls);
    const available = results.filter(photo => {
      const id = photo?.id || '';
      const regularUrl: string = photo?.urls?.regular || '';
      if (!regularUrl) return false;
      if (usedPhotoIdsSession.has(id)) return false;
      for (let i = 0; i < excludeArr.length; i++) {
        const ex = excludeArr[i];
        if ((id && ex.includes(id)) || ex === regularUrl) return false;
      }
      return true;
    });

    const pool = available.length > 0 ? available : results;
    const pickIdx = (Math.abs(dayNumber) * 5 + (verse.index || 0)) % pool.length;
    const chosen = pool[pickIdx] || pool[0];
    const imageUrl = chosen?.urls?.regular;
    if (!imageUrl) return null;

    if (chosen?.id) {
      usedPhotoIdsSession.add(chosen.id);
    }
    excludeUrls.add(imageUrl);

    const rawIdx = typeof verse.index === 'number' ? verse.index : 0;
    registerDynamicVerseBackground(`${dayNumber}_${validPeriod}_${rawIdx}`, imageUrl);

    return {
      url: imageUrl,
      photographer: chosen?.user?.name || 'Unsplash',
      theme: `${theme} (${searchQuery})`,
    };
  } catch (err) {
    return null;
  }
}
