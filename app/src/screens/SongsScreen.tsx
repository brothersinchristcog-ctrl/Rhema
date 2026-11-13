import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  StyleSheet,
  Image,
  Animated,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Platform,
  Alert,
  Modal,
  ScrollView,
  Share
} from 'react-native';
// Removed SafeAreaView as padding is handled by the header
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import {
  ArrowLeft,
  ChevronLeft,
  Search,
  Music,
  ChevronRight,
  AlertCircle,
  BookMarked,
  Bookmark,
  X,
  Sliders,
  Share2,
  CalendarDays,
  Info,
  MapPin,
  Calendar,
  Clock,
  Mic
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FirestoreService, { WorshipSong, EventServiceItem } from '../services/FirestoreService';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useChurch } from '../context/ChurchContext';
import { SongLanguageHelper, CANONICAL_SONG_CATEGORIES } from '../services/SongLanguageHelper';
import { CustomAlert } from '../components/CustomAlert';
import SongDetailModal from '../components/SongDetailModal';


const { width, height } = Dimensions.get('window');

const SONGBOOK_KEY = 'cog_my_songbook_ids';

const CATEGORIES = CANONICAL_SONG_CATEGORIES;

/* ───────────── 200 Unique Song Card Colors (Loops every 200 songs) ───────────── */
export interface SongCardColorDef {
  name: string;
  color: string;
}

export const SONG_CARD_COLORS: SongCardColorDef[] = [
  { name: 'Cove',            color: '#385A6C' }, // 1
  { name: 'Velours Noir',    color: '#1C1C1E' }, // 2
  { name: 'Cognac',          color: '#9E472A' }, // 3
  { name: 'Charcoal',        color: '#243342' }, // 4
  { name: 'Cashmere',        color: '#D8C3A5' }, // 5
  { name: 'Truffle',         color: '#5E4B3E' }, // 6
  { name: 'Forest',          color: '#22543D' }, // 7
  { name: 'Gunmetal',        color: '#2C465E' }, // 8
  { name: 'Moss',            color: '#607D3B' }, // 9
  { name: 'Deep Burgundy',   color: '#58111A' }, // 10
  { name: 'Ocean Blue',      color: '#0284C7' }, // 11
  { name: 'Pumpkin',         color: '#D35400' }, // 12
  { name: 'Ultra Violet',    color: '#5F4B8B' }, // 13
  { name: 'Deep Olive',      color: '#4A5320' }, // 14
  { name: 'Soft Sage',       color: '#A3B899' }, // 15
  { name: 'Lavender Pink',   color: '#E8AEB7' }, // 16
  { name: 'Mint Green',      color: '#86EFAC' }, // 17
  { name: 'Golden Yellow',   color: '#F5B041' }, // 18
  { name: 'Sage Green',      color: '#5A7A64' }, // 19
  { name: 'Peach Pink',      color: '#FFB7A5' }, // 20
  { name: 'Dark Emerald',    color: '#065F46' }, // 21
  { name: 'Alabaster',       color: '#E7E4DC' }, // 22
  { name: 'Slate Green',     color: '#2E5F52' }, // 23
  { name: 'Ivory',           color: '#FAF5E4' }, // 24
  { name: 'Natural',         color: '#C8B69B' }, // 25
  { name: 'Apricot',         color: '#FDBA74' }, // 26
  { name: 'Organic',         color: '#C4AB8E' }, // 27
  { name: 'Candle',          color: '#FAD02C' }, // 28
  { name: 'Coral',           color: '#FF6F61' }, // 29
  { name: 'Leaf',            color: '#4CAF50' }, // 30
  { name: 'Juniper',         color: '#2E4E4C' }, // 31
  { name: 'Orange',          color: '#F97316' }, // 32
  { name: 'Olive Grove',     color: '#6A7B44' }, // 33
  { name: 'Warm Sand',       color: '#D4B28C' }, // 34
  { name: 'Merlot Bliss',    color: '#6B1D2F' }, // 35
  { name: 'Creamy Taupe',    color: '#DFD3C3' }, // 36
  { name: 'Midnight Luxe',   color: '#121B28' }, // 37
  { name: 'Soft Ivory',      color: '#F0EAE1' }, // 38
  { name: 'Royal Sapphire',  color: '#174A7E' }, // 39
  { name: 'Champagne Gold',  color: '#E5C158' }, // 40
  { name: 'Antique Bronze',  color: '#705335' }, // 41
  { name: 'Platinum Silver', color: '#C5C6C7' }, // 42
  { name: 'Rosewood',        color: '#7B242C' }, // 43
  { name: 'Midnight Blue',   color: '#1A2B4C' }, // 44
  { name: 'Imperial Purple', color: '#542A68' }, // 45
  { name: 'Emerald Luxe',    color: '#0F5257' }, // 46
  { name: 'Dusty Mauve',     color: '#A77B91' }, // 47
  { name: 'Royal Plum',      color: '#5B2C6F' }, // 48
  { name: 'Arctic Blue',     color: '#6BA4B8' }, // 49
  { name: 'Peacock Teal',    color: '#0A6C74' }, // 50
  { name: 'Copper Rose',     color: '#B86B64' }, // 51
  { name: 'Burnished Gold',  color: '#AA8239' }, // 52
  { name: 'Obsidian',        color: '#232528' }, // 53
  { name: 'Moonstone',       color: '#A2B2C8' }, // 54
  { name: 'Blue Lagoon',     color: '#007A87' }, // 55
  { name: 'Velvet Wine',     color: '#5E192B' }, // 56
  { name: 'Silver Mist',     color: '#B8C2B9' }, // 57
  { name: 'Desert Rose',     color: '#C67171' }, // 58
  { name: 'Honey Amber',     color: '#D97706' }, // 59
  { name: 'Glacier Blue',    color: '#8EAEC4' }, // 60
  { name: 'Jade Green',      color: '#2E8B57' }, // 61
  { name: 'Mulberry',        color: '#701C45' }, // 62
  { name: 'Smoky Quartz',    color: '#5C4838' }, // 63
  { name: 'Royal Amethyst',  color: '#6B3FA0' }, // 64
  { name: 'Ocean Teal',      color: '#006666' }, // 65
  { name: 'Burnt Sienna',    color: '#C05621' }, // 66
  { name: 'Tuscan Gold',     color: '#C68B59' }, // 67
  { name: 'Pearl White',     color: '#ECE8E1' }, // 68
  { name: 'Midnight Indigo', color: '#1E2050' }, // 69
  { name: 'Blue Steel',      color: '#46627F' }, // 70
  { name: 'Eucalyptus',      color: '#4E7764' }, // 71
  { name: 'Crimson Velvet',  color: '#7E121D' }, // 72
  { name: 'Antique Rose',    color: '#B0727B' }, // 73
  { name: 'Copper Clay',     color: '#9C4124' }, // 74
  { name: 'Imperial Jade',   color: '#0D6848' }, // 75
  { name: 'Storm Grey',      color: '#5F6B72' }, // 76
  { name: 'Golden Ochre',    color: '#C68642' }, // 77
  { name: 'Sapphire Mist',   color: '#5C82A6' }, // 78
  { name: 'Plum Velvet',     color: '#4A1E34' }, // 79
  { name: 'Desert Bronze',   color: '#8C6239' }, // 80
  { name: 'Arctic Mint',     color: '#7EC8B8' }, // 81
  { name: 'Royal Teal',      color: '#115E59' }, // 82
  { name: 'Shadow Purple',   color: '#43304A' }, // 83
  { name: 'Maple Brown',     color: '#7A392B' }, // 84
  { name: 'Celestial Blue',  color: '#3B82F6' }, // 85
  { name: 'Garnet Red',      color: '#781D26' }, // 86
  { name: 'Opal Green',      color: '#88B2A1' }, // 87
  { name: 'Smoky Lavender',  color: '#736882' }, // 88
  { name: 'Rich Mahogany',   color: '#4C1D24' }, // 89
  { name: 'Silver Sage',     color: '#98A89A' }, // 90
  { name: 'Marigold',        color: '#F59E0B' }, // 91
  { name: 'Ink Blue',        color: '#152238' }, // 92
  { name: 'Terracotta',      color: '#D96B43' }, // 93
  { name: 'Pine Green',      color: '#1E4D2B' }, // 94
  { name: 'Rose Quartz',     color: '#B87A88' }, // 95
  { name: 'Espresso Brown',  color: '#2E1E14' }, // 96
  { name: 'Frosted Silver',  color: '#C8CBD0' }, // 97
  { name: 'Azure Blue',      color: '#0284C7' }, // 98
  { name: 'Golden Olive',    color: '#7D7930' }, // 99
  { name: 'Black Pearl',     color: '#191C20' }, // 100
  { name: 'Royal Onyx',        color: '#1B1917' }, // 101
  { name: 'Mystic Teal',       color: '#0E4B56' }, // 102
  { name: 'Velvet Sapphire',   color: '#1D3557' }, // 103
  { name: 'Golden Dusk',       color: '#B45309' }, // 104
  { name: 'Blue Opulence',     color: '#1E40AF' }, // 105
  { name: 'Scarlet Ember',     color: '#991B1B' }, // 106
  { name: 'Nordic Frost',      color: '#798E9C' }, // 107
  { name: 'Imperial Bronze',   color: '#6B4226' }, // 108
  { name: 'Midnight Orchid',   color: '#4A2040' }, // 109
  { name: 'Silver Lagoon',     color: '#52796F' }, // 110
  { name: 'Emerald Shadow',    color: '#144230' }, // 111
  { name: 'Golden Horizon',    color: '#C59B27' }, // 112
  { name: 'Mystic Lilac',      color: '#8B6F8A' }, // 113
  { name: 'Royal Copper',      color: '#A0522D' }, // 114
  { name: 'Deep Atlantic',     color: '#1B3B6F' }, // 115
  { name: 'Velvet Moss',       color: '#3D5A38' }, // 116
  { name: 'Crystal Blue',      color: '#2563EB' }, // 117
  { name: 'Amber Glow',        color: '#D97706' }, // 118
  { name: 'Noble Plum',        color: '#581C87' }, // 119
  { name: 'Arctic Pearl',      color: '#D8DEE9' }, // 120
  { name: 'Bronze Majesty',    color: '#7B5233' }, // 121
  { name: 'Twilight Rose',     color: '#A3586D' }, // 122
  { name: 'Sapphire Night',    color: '#162544' }, // 123
  { name: 'Golden Fern',       color: '#8C8635' }, // 124
  { name: 'Mystic Forest',     color: '#1E3A2F' }, // 125
  { name: 'Royal Garnet',      color: '#6E1A24' }, // 126
  { name: 'Silver Orchid',     color: '#A69CAC' }, // 127
  { name: 'Blue Majesty',      color: '#1D4ED8' }, // 128
  { name: 'Copper Ember',      color: '#A84B2C' }, // 129
  { name: 'Velvet Indigo',     color: '#2E1A47' }, // 130
  { name: 'Emerald Dawn',      color: '#1B6A4C' }, // 131
  { name: 'Lunar Silver',      color: '#BAC2C7' }, // 132
  { name: 'Crimson Orchid',    color: '#881337' }, // 133
  { name: 'Golden Nectar',     color: '#D48B28' }, // 134
  { name: 'Mystic Ocean',      color: '#164E63' }, // 135
  { name: 'Royal Mahogany',    color: '#4D2323' }, // 136
  { name: 'Frosted Jade',      color: '#729B89' }, // 137
  { name: 'Twilight Indigo',   color: '#242F5B' }, // 138
  { name: 'Amber Velvet',      color: '#A15D1C' }, // 139
  { name: 'Sapphire Royale',   color: '#1E3A8A' }, // 140
  { name: 'Opulent Bronze',    color: '#805634' }, // 141
  { name: 'Celadon Mist',      color: '#8E9B90' }, // 142
  { name: 'Scarlet Royale',    color: '#85141A' }, // 143
  { name: 'Lunar Violet',      color: '#4C2A58' }, // 144
  { name: 'Golden Willow',     color: '#94783E' }, // 145
  { name: 'Deep Cobalt',       color: '#1A365D' }, // 146
  { name: 'Velvet Cedar',      color: '#4A3528' }, // 147
  { name: 'Mystic Amber',      color: '#B87333' }, // 148
  { name: 'Royal Azure',       color: '#0369A1' }, // 149
  { name: 'Silver Dusk',       color: '#78828A' }, // 150
  { name: 'Emerald Crown',     color: '#046A38' }, // 151
  { name: 'Rosewood Noir',     color: '#3E1C24' }, // 152
  { name: 'Golden Laurel',     color: '#A08432' }, // 153
  { name: 'Arctic Sapphire',   color: '#3A6073' }, // 154
  { name: 'Crimson Dusk',      color: '#6B1D2F' }, // 155
  { name: 'Imperial Cobalt',   color: '#172554' }, // 156
  { name: 'Twilight Teal',     color: '#134E4A' }, // 157
  { name: 'Bronze Horizon',    color: '#8D5B3A' }, // 158
  { name: 'Velvet Orchid',     color: '#5B2149' }, // 159
  { name: 'Sapphire Bloom',    color: '#25527E' }, // 160
  { name: 'Mystic Charcoal',   color: '#292C33' }, // 161
  { name: 'Golden Cascade',    color: '#C69214' }, // 162
  { name: 'Royal Cypress',     color: '#224835' }, // 163
  { name: 'Lunar Sage',        color: '#93A29B' }, // 164
  { name: 'Deep Cerulean',     color: '#005F73' }, // 165
  { name: 'Copper Twilight',   color: '#944634' }, // 166
  { name: 'Emerald Mirage',    color: '#0F5132' }, // 167
  { name: 'Silver Crown',      color: '#ADB5BD' }, // 168
  { name: 'Velvet Maroon',     color: '#541212' }, // 169
  { name: 'Arctic Lagoon',     color: '#4682B4' }, // 170
  { name: 'Golden Mirage',     color: '#D4A373' }, // 171
  { name: 'Royal Juniper',     color: '#2B4A3F' }, // 172
  { name: 'Mystic Burgundy',   color: '#521822' }, // 173
  { name: 'Blue Royale',       color: '#1B4965' }, // 174
  { name: 'Bronze Willow',     color: '#7A5C3E' }, // 175
  { name: 'Crimson Majesty',   color: '#7C1020' }, // 176
  { name: 'Lunar Ocean',       color: '#23395D' }, // 177
  { name: 'Emerald Velvet',    color: '#1B4332' }, // 178
  { name: 'Golden Eclipse',    color: '#A67C1E' }, // 179
  { name: 'Sapphire Forest',   color: '#1F3A4B' }, // 180
  { name: 'Twilight Bronze',   color: '#6F4E37' }, // 181
  { name: 'Royal Celadon',     color: '#6B8E80' }, // 182
  { name: 'Mystic Sapphire',   color: '#203A60' }, // 183
  { name: 'Silver Horizon',    color: '#9AA0A6' }, // 184
  { name: 'Velvet Cypress',    color: '#1D3C2F' }, // 185
  { name: 'Amber Majesty',     color: '#B45B14' }, // 186
  { name: 'Imperial Ocean',    color: '#0C4A60' }, // 187
  { name: 'Golden Monarch',    color: '#C88D26' }, // 188
  { name: 'Arctic Orchid',     color: '#9D8189' }, // 189
  { name: 'Crimson Sapphire',  color: '#631726' }, // 190
  { name: 'Royal Moonstone',   color: '#5C6B73' }, // 191
  { name: 'Deep Lagoon',       color: '#0A5C5A' }, // 192
  { name: 'Copper Majesty',    color: '#8B4513' }, // 193
  { name: 'Velvet Cascade',    color: '#2C4258' }, // 194
  { name: 'Emerald Twilight',  color: '#194336' }, // 195
  { name: 'Silver Monarch',    color: '#8E9CA8' }, // 196
  { name: 'Mystic Pearl',      color: '#C4CCD3' }, // 197
  { name: 'Golden Dynasty',    color: '#A17A24' }, // 198
  { name: 'Blue Eclipse',      color: '#0F2137' }, // 199
  { name: 'Imperial Noir',     color: '#141518' }, // 200
];

const getSongCardColor = (index: number): SongCardColorDef => {
  const safeIndex = typeof index === 'number' && !isNaN(index) ? Math.abs(index) : 0;
  return SONG_CARD_COLORS[safeIndex % SONG_CARD_COLORS.length];
};

const isColorLight = (hex: string): boolean => {
  if (!hex || !hex.startsWith('#')) return true;
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 155;
};

const getTimelineStemColor = (hex: string, isDarkTheme: boolean): string => {
  if (!isDarkTheme || !hex || !hex.startsWith('#')) return hex;
  const c = hex.replace('#', '');
  if (c.length !== 6) return hex;
  let r = parseInt(c.substring(0, 2), 16) || 0;
  let g = parseInt(c.substring(2, 4), 16) || 0;
  let b = parseInt(c.substring(4, 6), 16) || 0;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum < 0.42) {
    const isNeutral = Math.max(r, g, b) - Math.min(r, g, b) < 16;
    if (isNeutral) {
      return '#A1A1AA'; // Light zinc/silver for dark/black neutrals (like Velours Noir #1C1C1E)
    }
    const factor = 0.55 / Math.max(0.08, lum);
    r = Math.min(255, Math.round(r * factor + (255 - r) * 0.25));
    g = Math.min(255, Math.round(g * factor + (255 - g) * 0.25));
    b = Math.min(255, Math.round(b * factor + (255 - b) * 0.25));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }
  return hex;
};

export default function SongsScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { isDark, toggleTheme, colors } = useTheme();
  const { language, t } = useLanguage();
  const { activeChurch } = useChurch();

  // ── Tabs ──────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'browse' | 'eventSongs' | 'theme' | 'songbook'>('browse');

  // ── Setlist State ─────────────────────────────────
  const [worshipServices, setWorshipServices] = useState<any[]>([]);
  const [activeServiceId, setActiveServiceId] = useState<string>('');
  const [activeEvent, setActiveEvent] = useState<any | null>(null);
  const [hasActiveEventSongs, setHasActiveEventSongs] = useState<boolean>(false);

  // ── All Songs ─────────────────────────────────────
  const [songs, setSongs] = useState<WorshipSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Category filter ───────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedChurchCategory, setSelectedChurchCategory] = useState('All');

  // ── Search ────────────────────────────────────────
  const [search, setSearch] = useState('');

  // ── My Songbook ───────────────────────────────────
  const [savedIds, setSavedIds] = useState<string[]>([]);

  // ── Lyrics Modal ──────────────────────────────────
  const [selectedSong, setSelectedSong] = useState<WorshipSong | null>(null);

  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'info' | 'error' | 'warning';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'success'
  });

  // ── Load songs ────────────────────────────────────
  const fetchSongs = async (forceRefresh = false) => {
    try {
      // Try cache first for instant display
      if (!forceRefresh) {
        try {
          const cached = await AsyncStorage.getItem('@songs_cache');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed.length > 0) {
              setSongs(parsed);
              setLoading(false);
            }
          }
        } catch (cacheError) {
          console.warn('Failed to read from cache:', cacheError);
        }
      }
      
      // Always fetch fresh data
      const data = await FirestoreService.getWorshipSongs({ forceRefresh });
      setSongs(data);
      
      // Update cache
      try {
        await AsyncStorage.setItem('@songs_cache', JSON.stringify(data));
      } catch (cacheWriteError) {
        console.warn('Failed to write to cache:', cacheWriteError);
      }
    } catch (error) {
      console.error('Error fetching songs from Firestore:', error);
      Alert.alert('Error', 'Failed to load songs. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // ── Load saved songbook from storage ─────────────
  const loadSavedIds = async () => {
    try {
      const raw = await AsyncStorage.getItem(SONGBOOK_KEY);
      if (raw) setSavedIds(JSON.parse(raw));
    } catch { /* ignore */ }
  };

  // ── Helper: Check if event is active or upcoming (filters out completed events) ──
  const isEventActiveOrUpcoming = (event: any): boolean => {
    if (!event) return false;

    // 1. Status check: Completed, Cancelled, and Draft events are excluded
    const status = String(event.status || event.publishStatus || '').toLowerCase().trim();
    if (status === 'completed' || status === 'cancelled' || status === 'draft') {
      return false;
    }

    // 2. Active recurring events remain active
    const recurring = String(event.recurring || '').toLowerCase().trim();
    const isRec = event.isRecurring === true || (recurring && recurring !== 'one-time event' && recurring !== 'none');
    if (isRec) {
      return true;
    }

    // 3. For one-time events, check date and time against current timestamp
    const rawDate = String(event.endDate || event.date || '').trim();
    if (!rawDate) return false;

    // Normalize date to YYYY-MM-DD
    let normalizedDate = rawDate;
    if (rawDate.includes('-')) {
      const parts = rawDate.split('-');
      if (parts[0].length === 2 && parts[2]?.length === 4) {
        normalizedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (normalizedDate < todayStr) {
      return false; // Ended on a past day
    }

    // If the event ends today, check whether the end time has already elapsed
    if (normalizedDate === todayStr) {
      const timeToCompare = event.endTime || event.time || event.startTime;
      if (timeToCompare) {
        try {
          let hour = 0;
          let min = 0;
          if (typeof timeToCompare === 'string' && timeToCompare.includes('T')) {
            const t = new Date(timeToCompare);
            hour = t.getHours();
            min = t.getMinutes();
          } else if (typeof timeToCompare === 'string') {
            const clean = timeToCompare.toUpperCase().replace(/\s+/g, '');
            const isPM = clean.includes('PM');
            const isAM = clean.includes('AM');
            const timePart = clean.replace('AM', '').replace('PM', '');
            const parts = timePart.split(':');
            hour = parseInt(parts[0], 10) || 0;
            min = parseInt(parts[1], 10) || 0;
            if (isPM && hour < 12) hour += 12;
            if (isAM && hour === 12) hour = 0;
          }

          const nowHour = now.getHours();
          const nowMin = now.getMinutes();
          if (hour < nowHour || (hour === nowHour && min < nowMin)) {
            return false; // Ended earlier today
          }
        } catch {
          // If time comparison cannot be parsed, keep active for today
        }
      }
    }

    return true;
  };

  // ── Load Setlists / Worship Services ─────────────
  const loadSetlists = async () => {
    try {
      const [upcomingRes, allRes] = await Promise.all([
        FirestoreService.getUpcomingEvents(50).catch(() => []),
        FirestoreService.getEvents().catch(() => [])
      ]);

      const combinedEvents = [...(upcomingRes || []), ...(allRes || [])];
      // Deduplicate events by id
      const uniqueEvents = Array.from(new Map(combinedEvents.map(e => [e.id, e])).values());

      // Filter STRICTLY for upcoming or active events (completed/past events are excluded)
      const activeUpcomingEvents = uniqueEvents.filter(isEventActiveOrUpcoming);

      // Sort upcoming events chronologically (earliest event first)
      activeUpcomingEvents.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        return dateA.localeCompare(dateB);
      });

      // Find active/upcoming events that have services with songs
      const eventsWithSongs = activeUpcomingEvents.filter(
        (ev: any) => ev && Array.isArray(ev.services) && ev.services.length > 0 && ev.services.some((s: any) => s && Array.isArray(s.songs) && s.songs.length > 0)
      );

      if (eventsWithSongs.length > 0) {
        const primaryEvent = eventsWithSongs[0];
        setActiveEvent(primaryEvent);
        const srvs = primaryEvent.services || [];
        setWorshipServices(srvs);
        setHasActiveEventSongs(true);
        // Automatically select the first service so its songs are displayed immediately
        setActiveServiceId(srvs[0]?.id || '');
      } else {
        // No active or upcoming events with songs!
        setActiveEvent(null);
        setWorshipServices([]);
        setHasActiveEventSongs(false);
        setActiveServiceId('');
      }
    } catch (e) {
      console.warn('Failed to load event songs:', e);
      setActiveEvent(null);
      setWorshipServices([]);
      setHasActiveEventSongs(false);
      setActiveServiceId('');
    }
  };

  const handleShareSetlist = async () => {
    const activeService: any = worshipServices.find(s => s.id === activeServiceId) || null;
    if (!activeService) {
      setAlertConfig({
        visible: true,
        title: 'Select a Service',
        message: 'Please choose a service above before sharing the worship setlist.',
        type: 'info'
      });
      return;
    }
    const serviceName = activeService?.name || 'Sunday Service';
    const activeList = activeService?.songs || [];
    const churchTitle = activeEvent ? (activeEvent.titleEn || activeEvent.title || activeChurch?.name) : (activeChurch?.name || 'Sunday Worship Service');
    const dateStr = (activeService?.startDate && activeService?.endDate && activeService.startDate !== activeService.endDate)
      ? `${activeService.startDate} – ${activeService.endDate}`
      : (activeService?.date || '');
    let msg = `🎵 *${serviceName.toUpperCase()} FLOW*\n`;
    msg += `⛪ *${churchTitle}* ${dateStr ? `| 📅 *${dateStr}*` : ''}\n\n`;
    if (activeList.length === 0) {
      msg += `(No songs scheduled for this service yet)\n`;
    } else {
      activeList.forEach((s: any, idx: number) => {
        msg += `*${idx + 1}. ${s.title}* ${s.isOffertory ? '(OFFERTORY)' : ''}\n`;
        msg += `  • Key: ${s.key || 'N/A'} | Time: ${s.timeSignature || '4/4'} | Tempo: ${s.tempo || '100'} BPM\n`;
        if (s.ledBy) msg += `  • Leading: ${s.ledBy}\n`;
        if (s.prelude) msg += `  • Prelude: ${s.prelude}\n`;
        if (s.interlude) msg += `  • Interlude: ${s.interlude}\n`;
        if (s.notes) msg += `  • Notes: ${s.notes}\n`;
        msg += `\n`;
      });
    }
    msg += `📲 View full song lyrics & charts in WeChristian App!`;
    try {
      await Share.share({ message: msg });
    } catch (e) {
      console.log(e);
    }
  };

  // ── Helper to enrich any song with setlist arrangement & designated leader ──
  const enrichSongWithSetlist = useCallback((baseSong: WorshipSong): WorshipSong => {
    if (!baseSong) return baseSong;
    const clean = (t: string) => (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const baseClean = clean(baseSong.title);
    const baseTeClean = clean(baseSong.titleTe || '');
    const baseEnClean = clean((baseSong as any).titleEn || '');

    let match: any = null;
    const servicesList = Array.isArray(worshipServices) ? worshipServices.filter(Boolean) : [];
    for (const service of servicesList) {
      if (service && service.songs && Array.isArray(service.songs)) {
        match = service.songs.find((s: any) => {
          if (!s) return false;
          const sc = clean(s.title);
          return sc === baseClean || (baseTeClean && sc === baseTeClean) || (baseEnClean && sc === baseEnClean);
        });
        if (match) break;
      }
    }

    if (match) {
      return {
        ...baseSong,
        ledBy: baseSong.ledBy || match.ledBy,
        key: baseSong.key || match.key,
        timeSignature: baseSong.timeSignature || match.timeSignature,
        tempo: baseSong.tempo || match.tempo,
        verses: baseSong.verses || match.verses,
        prelude: baseSong.prelude || match.prelude,
        interlude: baseSong.interlude || match.interlude,
        notes: baseSong.notes || match.notes,
      };
    }
    return baseSong;
  }, [worshipServices]);

  useEffect(() => {
    fetchSongs();
    loadSavedIds();
    loadSetlists();
  }, []);

  // ── Open specific song from notification ──────────
  const { songId } = route?.params || {};
  useEffect(() => {
    if (songId && songs.length > 0) {
      const songToOpen = songs.find(s => s.id === songId);
      if (songToOpen) {
        setSelectedSong(enrichSongWithSetlist(songToOpen));
        // Clear param so it doesn't reopen if the user closes it and navigates back
        navigation.setParams({ songId: undefined });
      }
    }
  }, [songId, songs, navigation, enrichSongWithSetlist]);

  const onRefresh = () => { setRefreshing(true); fetchSongs(true); loadSetlists(); };

  // ── Toggle save/unsave song ───────────────────────
  const toggleSave = async (song: WorshipSong) => {
    const isAlreadySaved = savedIds.includes(song.id);
    const songTitle = SongLanguageHelper.getSongTitle(song, language).primary || song.title;
    let newIds: string[];
    if (isAlreadySaved) {
      newIds = savedIds.filter(id => id !== song.id);
      setAlertConfig({ visible: true, title: t('songs.songRemoved'), message: t('songs.songRemovedMsg', { title: songTitle }), type: 'info' });
    } else {
      newIds = [...savedIds, song.id];
      setAlertConfig({ visible: true, title: t('songs.songSaved'), message: t('songs.songSavedMsg', { title: songTitle }), type: 'success' });
    }
    setSavedIds(newIds);
    await AsyncStorage.setItem(SONGBOOK_KEY, JSON.stringify(newIds));
  };

  // Helper: split multi-category string into array
  const getSongCategories = (song: WorshipSong): string[] =>
    (song.category || 'Other').split(';').map(c => c.trim()).filter(Boolean);

  // Search filter helper (handles song numbers, prefixes, Telugu/English titles, artist)
  const matchesSearch = (s: WorshipSong & { displayNumber?: number; masterIndex?: number }, q: string): boolean => {
    if (!q) return true;
    const numericQ = q.replace(/[^0-9]/g, '');
    const searchNum = numericQ ? parseInt(numericQ, 10) : NaN;
    const isPureNum = !isNaN(searchNum) && /^[#\s0-9]+$/.test(q);

    // When searching by song number, match strictly to that card's display number in the active list
    if (isPureNum) {
      return s.displayNumber === searchNum;
    }

    const { primary, secondary } = SongLanguageHelper.getSongTitle(s, language);
    return (
      primary.toLowerCase().includes(q) ||
      (secondary ? secondary.toLowerCase().includes(q) : false) ||
      (s.title && s.title.toLowerCase().includes(q)) ||
      (s.titleTe ? s.titleTe.toLowerCase().includes(q) : false) ||
      (s.titleEn ? s.titleEn.toLowerCase().includes(q) : false) ||
      (s.titleHi ? s.titleHi.toLowerCase().includes(q) : false) ||
      (s.titleTa ? s.titleTa.toLowerCase().includes(q) : false) ||
      (s.titleMr ? s.titleMr.toLowerCase().includes(q) : false) ||
      (s.titleMl ? s.titleMl.toLowerCase().includes(q) : false) ||
      (s.titleKn ? s.titleKn.toLowerCase().includes(q) : false) ||
      (s.artist ? s.artist.toLowerCase().includes(q) : false)
    );
  };

  // Category matching helper (robust normalization for Stuthi / Sthuthi / Sthuthi Songs / Offering / etc.)
  const normalizeCategoryName = (cat: string) => {
    if (!cat) return '';
    return cat.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/songs?$/g, '').replace('sthuthi', 'stuthi');
  };

  const categoryMatches = (songCats: string[], targetCat: string): boolean => {
    if (!targetCat || targetCat === 'All' || targetCat === 'All Songs') return true;
    const normTarget = normalizeCategoryName(targetCat);
    return songCats.some(c => {
      const normC = normalizeCategoryName(c);
      return normC === normTarget || normC.includes(normTarget) || normTarget.includes(normC);
    });
  };

  // Church songs categories: Canonical categories + any custom categories defined in church songs
  const churchCategories = React.useMemo(() => {
    const extraCats = new Set<string>();
    songs.filter(s => s.isChurchOwn).forEach(s => {
      getSongCategories(s).forEach(c => {
        const cLower = c.toLowerCase().trim();
        const exists = CATEGORIES.some(cat => {
          const catLower = cat.toLowerCase().trim();
          return catLower === cLower || 
            (catLower.includes('stuthi') && cLower.includes('sthuthi')) || 
            (catLower.includes('sthuthi') && cLower.includes('stuthi'));
        });
        if (!exists) {
          extraCats.add(c);
        }
      });
    });
    return [...CATEGORIES, ...Array.from(extraCats)];
  }, [songs]);

  // ── Permanent Master Index Map (ensures each song keeps its master color & number across categories) ──
  const songMasterIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    const allBrowse = songs.filter(s => {
      const cats = getSongCategories(s);
      if (cats.length === 1 && cats[0] === 'Theme Songs') return false;
      return true;
    });
    allBrowse.forEach((s, idx) => {
      map.set(s.id, idx + 1);
    });
    return map;
  }, [songs]);

  // ── Filtered songs ────────────────────────────────
  const browseBaseList = songs.filter(s => {
    const cats = getSongCategories(s);
    // Songs that are ONLY a Theme Song stay in Theme tab; others show in Browse too
    if (cats.length === 1 && cats[0] === 'Theme Songs') return false;
    return categoryMatches(cats, selectedCategory);
  });

  const filteredBrowse = useMemo(() => {
    const q = search.toLowerCase().trim();

    // 1. Number the songs in the current category sequentially starting from 1
    const categoryMatchesList = browseBaseList.map((s, idx) => {
      const masterNum = songMasterIndexMap.get(s.id) || (idx + 1);
      return { ...s, displayNumber: idx + 1, masterIndex: masterNum };
    }).filter(s => matchesSearch(s, q));

    if (!q) {
      return categoryMatchesList;
    }

    // If matches found within the selected category, show them
    if (categoryMatchesList.length > 0) {
      return categoryMatchesList;
    }

    // If no match in current category (e.g. searching for a song number from another category),
    // search across all browse songs seamlessly so the song is found
    if (selectedCategory !== 'All') {
      const allBrowseSongs = songs.filter(s => {
        const cats = getSongCategories(s);
        if (cats.length === 1 && cats[0] === 'Theme Songs') return false;
        return true;
      });

      return allBrowseSongs.map((s, idx) => {
        const masterNum = songMasterIndexMap.get(s.id) || (idx + 1);
        return { ...s, displayNumber: masterNum, masterIndex: masterNum };
      }).filter(s => matchesSearch(s, q));
    }

    return categoryMatchesList;
  }, [browseBaseList, search, songs, songMasterIndexMap, selectedCategory, language]);

  const savedSongsBase = songs.filter(s => savedIds.includes(s.id));
  const filteredSongbook = savedSongsBase.map((s, idx) => {
    const masterNum = songMasterIndexMap.get(s.id) || (idx + 1);
    return { ...s, displayNumber: idx + 1, masterIndex: masterNum };
  }).filter(s => {
    const q = search.toLowerCase().trim();
    return matchesSearch(s, q);
  });

  const themeBaseList = songs.filter(s => {
    const cats = getSongCategories(s);
    return cats.includes('Theme Songs');
  });
  const filteredTheme = themeBaseList.map((s, idx) => {
    const masterNum = songMasterIndexMap.get(s.id) || (idx + 1);
    return { ...s, displayNumber: idx + 1, masterIndex: masterNum };
  }).filter(s => {
    const q = search.toLowerCase().trim();
    return matchesSearch(s, q);
  });



  const getServiceCategoryMeta = (categoryName?: string, serviceName?: string) => {
    const categories = [
      { type: 'Sunday Service', icon: '⛪', color: '#1a2d5a', bg: '#EFF6FF', border: '#BFDBFE' },
      { type: 'Bible Study', icon: '📖', color: '#B45309', bg: '#FEF3C7', border: '#FDE68A' },
      { type: "Women's Fasting Prayer", icon: '🙏', color: '#BE185D', bg: '#FDF2F8', border: '#FBCFE8' },
      { type: 'Youth Meeting', icon: '🔥', color: '#C2410C', bg: '#FFF7ED', border: '#FED7AA' },
      { type: 'Cottage / House Prayer', icon: '🏠', color: '#047857', bg: '#ECFDF5', border: '#A7F3D0' },
      { type: 'All-Night Prayer', icon: '🌙', color: '#4338CA', bg: '#EEF2FF', border: '#C7D2FE' },
      { type: 'Midweek Prayer', icon: '🕊️', color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD' },
      { type: 'Sunday School / Kids', icon: '🎨', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
      { type: 'Special Church Program', icon: '✨', color: '#9D174D', bg: '#FFF1F2', border: '#FECDD3' }
    ];
    if (categoryName) {
      const found = categories.find(c => c.type.toLowerCase() === categoryName.toLowerCase());
      if (found) return found;
      return { type: categoryName, icon: '⛪', color: '#1a2d5a', bg: '#EFF6FF', border: '#BFDBFE' };
    }
    if (serviceName) {
      const lower = serviceName.toLowerCase();
      if (lower.includes('bible study')) return categories[1];
      if (lower.includes('women') || lower.includes('fasting')) return categories[2];
      if (lower.includes('youth')) return categories[3];
      if (lower.includes('cottage') || lower.includes('house') || lower.includes('cell')) return categories[4];
      if (lower.includes('all-night') || lower.includes('night prayer') || lower.includes('vigil')) return categories[5];
      if (lower.includes('midweek') || lower.includes('intercessory')) return categories[6];
      if (lower.includes('kids') || lower.includes('children') || lower.includes('school')) return categories[7];
      if (lower.includes('special') || lower.includes('revival') || lower.includes('anniversary') || lower.includes('thanksgiving')) return categories[8];
    }
    return categories[0];
  };

  const validServices = Array.isArray(worshipServices) ? worshipServices.filter(Boolean) : [];
  const activeService: any = validServices.find((s: any) => s && s.id === activeServiceId) || (validServices.length > 0 ? validServices[0] : null);
  
  // Return ONLY songs of the selected service. Automatically defaults to the primary service so songs load immediately.
  const activeSetlist: any[] = useMemo(() => {
    const targetId = activeServiceId || validServices[0]?.id;
    if (!targetId) return [];
    const found = validServices.find((s: any) => s && s.id === targetId);
    return (found && Array.isArray(found.songs)) ? found.songs : [];
  }, [validServices, activeServiceId]);

  const totalEventSongsCount = useMemo(() => {
    if (!activeService) return 0;
    return activeService.songs?.length || 0;
  }, [activeService]);

  // ── Event Songs as full WorshipSong list with 1-based sequential display numbers ──
  const eventSongItems: (WorshipSong & { displayNumber: number; masterIndex: number })[] = useMemo(() => {
    return (activeSetlist || []).map((s: any, idx: number) => {
      const match = songs.find(libSong =>
        libSong.title?.toLowerCase().trim() === s.title?.toLowerCase().trim()
      );
      if (match) {
        return {
          ...match,
          key: s.key || match.key,
          timeSignature: s.timeSignature || match.timeSignature,
          tempo: s.tempo || match.tempo,
          verses: s.verses || match.verses,
          prelude: s.prelude || match.prelude,
          interlude: s.interlude || match.interlude,
          notes: s.notes || match.notes,
          ledBy: s.ledBy || match.ledBy,
          isOffertory: s.isOffertory !== undefined ? s.isOffertory : (match as any).isOffertory,
          displayNumber: idx + 1,
          masterIndex: idx + 1,
        };
      }
      return {
        id: s.id || `setlist-song-${idx}`,
        title: s.title || `Song ${idx + 1}`,
        titleTe: s.titleTe,
        titleEn: s.titleEn || s.title,
        lyrics: s.lyrics || s.verses || `Lyrics for "${s.title}" are being prepared for this service.`,
        key: s.key,
        timeSignature: s.timeSignature,
        tempo: s.tempo,
        verses: s.verses,
        prelude: s.prelude,
        interlude: s.interlude,
        notes: s.notes,
        ledBy: s.ledBy,
        isOffertory: s.isOffertory,
        displayNumber: idx + 1,
        masterIndex: idx + 1,
      } as any;
    });
  }, [activeSetlist, songs]);

  const filteredEventSongs = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return eventSongItems;
    return eventSongItems.filter(s => matchesSearch(s, q));
  }, [eventSongItems, search]);

  const activeList = activeTab === 'browse' ? filteredBrowse : activeTab === 'songbook' ? filteredSongbook : activeTab === 'theme' ? filteredTheme : filteredEventSongs;
  const currentSongIndex = selectedSong ? activeList.findIndex(s => s.id === selectedSong.id) : -1;
  const totalSongs = activeList.length;

  // ── Song Card ─────────────────────────────────────
  const renderSongCard = ({ item, index }: { item: WorshipSong & { displayNumber?: number; masterIndex?: number }; index: number }) => {
    const enrichedItem = enrichSongWithSetlist(item);
    const isSaved = savedIds.includes(item.id);
    const masterNum = item.masterIndex !== undefined ? item.masterIndex : (item.displayNumber !== undefined ? item.displayNumber : (index + 1));
    const displayIndex = item.displayNumber !== undefined ? item.displayNumber : masterNum;
    // Default to Telugu for songs unless user explicitly chose another non-English language
    const displayLang = (language && language !== 'en') ? language : 'te';
    const { primary, secondary } = SongLanguageHelper.getSongTitle(enrichedItem, displayLang);
    const subtitle = secondary ? `${secondary}${enrichedItem.artist ? ` · ${enrichedItem.artist}` : ''}` : (enrichedItem.artist || '');

    const colorIndex = masterNum > 0 ? masterNum - 1 : index;
    const cardDef = getSongCardColor(colorIndex);
    const cardColor = cardDef.color;
    const currentTabList = activeTab === 'browse' ? filteredBrowse : (activeTab === 'songbook' ? filteredSongbook : (activeTab === 'eventSongs' ? filteredEventSongs : filteredTheme));
    const prevItem = index > 0 ? currentTabList[index - 1] : null;
    const prevMasterNum = prevItem?.masterIndex !== undefined ? prevItem.masterIndex : (prevItem?.displayNumber !== undefined ? prevItem.displayNumber : index);
    const prevColorIndex = prevMasterNum > 0 ? prevMasterNum - 1 : Math.max(0, index - 1);
    const prevCardColor = index > 0 ? getSongCardColor(prevColorIndex).color : null;
    const stemColor = getTimelineStemColor(cardColor, isDark);
    const prevStemColor = prevCardColor ? getTimelineStemColor(prevCardColor, isDark) : null;
    const isLight = isColorLight(cardColor);

    const titleColor = isLight ? '#0F172A' : '#FFFFFF';
    const artistColor = isLight ? '#475569' : 'rgba(255, 255, 255, 0.78)';
    const chevronColor = isLight ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.65)';
    const dividerColor = isDark ? 'rgba(255, 255, 255, 0.35)' : '#64748B';

    const totalCount = currentTabList.length;
    const isFirst = index === 0;
    const isLast = totalCount > 0 && index === totalCount - 1;
    const screenBg = isDark ? '#000000' : (colors.background || '#F8FAFC');
    const circleBorderColor = isLight ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.45)';
    const circleTextColor = isLight ? '#0F172A' : '#FFFFFF';
    const numFontSize = displayIndex >= 100 ? 10.5 : (displayIndex >= 10 ? 12.5 : 14.5);
    return (
      <View style={styles.songItemWrapper}>
        <View style={styles.songItemRow}>
          {/* Left Column: Lollipop Song Number circle badge with matching dotted stick */}
          <View style={styles.songTimeline}>
            {/* Top dotted stick (coming from previous song lollipop) */}
            {!isFirst && prevCardColor ? (
              <View style={styles.timelineTopStick} pointerEvents="none">
                <Svg width={4} height="100%">
                  <Path
                    d="M 2,0 L 2,400"
                    stroke={prevStemColor}
                    strokeWidth={2.8}
                    strokeDasharray="2, 5"
                    strokeLinecap="round"
                  />
                </Svg>
              </View>
            ) : null}

            {/* Bottom dotted stick (this song's lollipop stick reaching downwards to next song) */}
            {!isLast ? (
              <View style={styles.timelineBottomStick} pointerEvents="none">
                <Svg width={4} height="100%">
                  <Path
                    d="M 2,0 L 2,400"
                    stroke={stemColor}
                    strokeWidth={2.8}
                    strokeDasharray="2, 5"
                    strokeLinecap="round"
                  />
                </Svg>
              </View>
            ) : null}
            {/* Song Number verified badge in song card color */}
            <View style={styles.songNumBox}>
              <Svg width={36} height={36} viewBox="0 0 24 24" style={StyleSheet.absoluteFill}>
                <Path
                  d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.67-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91c-1.31.67-2.2 1.91-2.2 3.34s.89 2.67 2.2 3.34c-.46 1.39-.21 2.9.8 3.91s2.52 1.26 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.45 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34z"
                  fill={cardColor}
                  stroke={circleBorderColor}
                  strokeWidth={0.75}
                />
              </Svg>
              <Text style={[styles.songNumText, { color: circleTextColor, fontSize: numFontSize }]}>
                {displayIndex}
              </Text>
            </View>
          </View>

          {/* Right Column: Colored Song Card (Without index inside) */}
          <TouchableOpacity
            style={[
              styles.songCard,
              {
                backgroundColor: cardColor,
                borderColor: isLight ? 'rgba(0, 0, 0, 0.06)' : 'rgba(255, 255, 255, 0.12)',
                borderWidth: 1,
                shadowColor: '#000',
                shadowOpacity: isLight ? 0.06 : 0.22,
                shadowRadius: 5,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2.5,
              }
            ]}
            onPress={() => setSelectedSong(enrichedItem)}
            onLongPress={() => toggleSave(item)}
            delayLongPress={400}
            activeOpacity={0.85}
          >
            <View style={styles.info}>
              <Text style={[styles.title, { color: titleColor }]} numberOfLines={1}>
                {primary}
              </Text>
              {subtitle ? (
                <Text style={[styles.artist, { color: artistColor }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {isSaved && <Bookmark size={15} color="#FFFFFF" fill="#FFFFFF" style={{ marginRight: 6 }} />}
            <ChevronRight size={17} color={chevronColor} strokeWidth={2.4} />
          </TouchableOpacity>
        </View>

      </View>
    );
  };

  // ── Render Event Card Header ─────────────────────
  const renderEventCardHeader = () => {
    if (!activeEvent || validServices.length === 0) {
      return (
        <View style={{ paddingHorizontal: 20, paddingTop: 36, paddingBottom: 24, alignItems: 'center' }}>
          <View style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: isDark ? '#27272A' : '#F1F5F9',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 14,
            borderWidth: 1,
            borderColor: isDark ? '#3F3F46' : '#E2E8F0'
          }}>
            <CalendarDays size={28} color={isDark ? '#FFFFFF' : '#0F172A'} />
          </View>
          <Text style={{ fontSize: 17, fontWeight: '800', color: isDark ? '#FFFFFF' : '#0F172A', textAlign: 'center' }}>
            No Upcoming Event Songs
          </Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 19, maxWidth: 300 }}>
            Completed events and their songs are closed. When worship songs are scheduled for an upcoming event, they will appear here.
          </Text>
        </View>
      );
    }

    // Format display date in DD Month YYYY format (e.g., 07 November 2026)
    const displayServiceDate = (() => {
      const formatDDMonthYYYY = (dateStr: string): string => {
        if (!dateStr) return '';
        try {
          const clean = dateStr.trim().split(' ')[0].split('T')[0];
          const parts = clean.split('-');
          let y = 0, m = 0, d = 0;
          if (parts.length === 3) {
            if (parts[0].length === 4) {
              y = parseInt(parts[0], 10);
              m = parseInt(parts[1], 10) - 1;
              d = parseInt(parts[2], 10);
            } else if (parts[2].length === 4) {
              d = parseInt(parts[0], 10);
              m = parseInt(parts[1], 10) - 1;
              y = parseInt(parts[2], 10);
            }
          }
          if (y && !isNaN(m) && d) {
            const months = [
              'January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'
            ];
            const dayStr = String(d).padStart(2, '0');
            const monthStr = months[m] || '';
            return `${dayStr} ${monthStr} ${y}`;
          }
        } catch {}
        return dateStr;
      };

      if (activeService?.startDate && activeService?.endDate && activeService.startDate !== activeService.endDate) {
        return `${formatDDMonthYYYY(activeService.startDate)} – ${formatDDMonthYYYY(activeService.endDate)}`;
      }
      const rawDate = activeService?.date || (activeEvent ? (activeEvent.date || '') : '');
      return formatDDMonthYYYY(rawDate);
    })();

    const displayTitle = activeService
      ? (activeService.name || activeEvent?.title || 'Church Service Flow')
      : (activeEvent?.title || 'Church Service Flow');

    return (
      <View style={{ marginBottom: 8 }}>
        {/* Compact Event Service Card */}
        <View style={{
          marginHorizontal: 16,
          marginTop: 4,
          backgroundColor: isDark ? '#18181B' : '#FFFFFF',
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderWidth: 1,
          borderColor: isDark ? '#27272A' : '#E2E8F0',
          elevation: 2,
          shadowColor: '#000',
          shadowOpacity: isDark ? 0.3 : 0.05,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 2 }
        }}>
          {/* Top Row: Event Title & Circular Share Icon Button */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: isDark ? '#FFFFFF' : '#0F172A', letterSpacing: -0.2, lineHeight: 22 }}>
                {displayTitle}
              </Text>
              {activeEvent?.titleTelugu ? (
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: isDark ? '#A1A1AA' : '#64748B', marginTop: 2 }}>
                  {activeEvent.titleTelugu}
                </Text>
              ) : null}

              {/* Date in DD Month YYYY format below service name (Service Timing removed) */}
              {displayServiceDate ? (
                <View style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <CalendarDays size={13} color={isDark ? '#FBBF24' : '#D97706'} />
                    <Text style={{ fontSize: 12.5, color: isDark ? '#D4D4D8' : '#334155', fontWeight: '600' }}>
                      {displayServiceDate}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>

            {/* Top-Right Circular Share Icon Button Only */}
            <TouchableOpacity
              onPress={handleShareSetlist}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isDark ? '#27272A' : '#F1F5F9',
                borderWidth: 1,
                borderColor: isDark ? '#3F3F46' : '#E2E8F0'
              }}
              activeOpacity={0.8}
            >
              <Share2 size={15} color={isDark ? '#E4E4E7' : '#0F172A'} />
            </TouchableOpacity>
          </View>

          {/* Bottom Event / Service Circle-Capsule Badge */}
          {validServices.length > 0 && (
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: isDark ? '#27272A' : '#F1F5F9' }}>
              <Text style={{
                fontSize: 11,
                fontWeight: '800',
                color: isDark ? '#A1A1AA' : '#64748B',
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 8,
              }}>
                {activeServiceId ? 'Selected Service' : 'Select Service to View Songs'}
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, alignItems: 'center' }}
              >
                {validServices.map((srv: any) => {
                  if (!srv) return null;
                  const isSelected = activeServiceId ? activeServiceId === srv?.id : srv?.id === validServices[0]?.id;
                  const songCount = Array.isArray(srv.songs) ? srv.songs.length : 0;

                  return (
                    <TouchableOpacity
                      key={srv?.id || srv?.name || Math.random().toString()}
                      style={[{
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        borderRadius: 999,
                        backgroundColor: isDark ? '#121214' : '#F1F5F9',
                        borderWidth: 1.5,
                        borderColor: isDark ? '#27272A' : '#CBD5E1',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                      }, isSelected && {
                        backgroundColor: '#000000',
                        borderColor: isDark ? '#52525B' : '#000000',
                      }]}
                      onPress={() => setActiveServiceId(srv?.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[
                        { fontSize: 12.5, fontWeight: '700', color: isDark ? '#A1A1AA' : '#475569' },
                        isSelected && { color: '#FFFFFF', fontWeight: '800' }
                      ]}>
                        {srv?.name || 'Service'}
                      </Text>
                      {songCount > 0 && (
                        <View style={{
                          paddingHorizontal: 6,
                          paddingVertical: 1.5,
                          borderRadius: 8,
                          backgroundColor: isSelected ? 'rgba(255,255,255,0.22)' : (isDark ? '#27272A' : '#E2E8F0'),
                        }}>
                          <Text style={{
                            fontSize: 10.5,
                            fontWeight: '700',
                            color: isSelected ? '#FFFFFF' : (isDark ? '#A1A1AA' : '#64748B'),
                          }}>
                            {songCount}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Search Bar placed directly below the Event Card only when a service is selected */}
        {activeService ? (
          <View
            style={[
              styles.searchBar,
              {
                marginTop: 12,
                marginBottom: 4,
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                borderColor: isDark ? '#3F3F46' : '#CBD5E1',
                borderWidth: 1.5,
                shadowColor: '#000',
                shadowOpacity: isDark ? 0.25 : 0.05,
                shadowRadius: 6,
                elevation: 2,
              }
            ]}
          >
            <Search size={19} color={isDark ? '#9CA3AF' : '#334155'} strokeWidth={2.2} />
            <TextInput
              placeholder={`Search ${(activeService?.name || 'service').trim()} songs by name or number...`}
              placeholderTextColor={isDark ? '#9CA3AF' : '#64748B'}
              style={[styles.searchInput, { color: isDark ? '#FFFFFF' : '#0F172A' }]}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <X size={13} color={isDark ? '#E5E7EB' : '#334155'} strokeWidth={2.4} />
              </TouchableOpacity>
            )}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000000' : colors.background }]}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFE4CC"
      />

      {/* ── Top Header Card (Clean square card containing header, tabs, and straight category badges) ── */}
      <View
        style={{
          backgroundColor: '#FFE4CC',
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(250, 98, 3, 0.15)',
          overflow: 'hidden',
          paddingBottom: 14,
        }}
      >
        <LinearGradient
          colors={['#FFE4CC', '#FFD3AE', '#FFBF8C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.35, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* ── Screen Header (Clean circular back button & title) ── */}
        <View
          style={[
            styles.headerRow,
            { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8 }
          ]}
        >
          <TouchableOpacity
            style={styles.headerBackBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            activeOpacity={0.7}
          >
            <ArrowLeft size={22} color="#0F172A" strokeWidth={2.4} />
          </TouchableOpacity>

          <Text style={[styles.headerTitleText, { color: '#0F172A' }]} numberOfLines={1}>
            {t('songs.worshipAndPraise')}
          </Text>

          <View style={styles.headerRightSpacer} />
        </View>

        {/* ── Main Tabs Ribbon ── */}
        <View style={{ marginTop: 12, marginBottom: activeTab === 'browse' ? 10 : 2 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}>
            {/* Tab 1: All Songs */}
            <TouchableOpacity
              style={[
                styles.tabPill,
                activeTab === 'browse'
                  ? {
                      backgroundColor: '#FA6203',
                      borderColor: '#FA6203',
                      borderWidth: 1.5,
                    }
                  : {
                      backgroundColor: 'rgba(255, 255, 255, 0.75)',
                      borderColor: 'rgba(250, 98, 3, 0.18)',
                      borderWidth: 1.5,
                    },
              ]}
              onPress={() => { setActiveTab('browse'); setSearch(''); }}
              activeOpacity={0.75}
            >
              <Music
                size={13}
                color={
                  activeTab === 'browse'
                    ? '#FFFFFF'
                    : '#0F172A'
                }
                strokeWidth={2.4}
              />
              <Text
                style={[
                  styles.tabPillTxt,
                  {
                    color: activeTab === 'browse'
                      ? '#FFFFFF'
                      : '#0F172A',
                  },
                  activeTab === 'browse' && { fontWeight: '900' },
                ]}
              >
                {t('songs.allSongs')}
              </Text>
            </TouchableOpacity>

            {/* Tab: Event Songs (Always visible next to All Songs) */}
            <TouchableOpacity
              style={[
                styles.tabPill,
                activeTab === 'eventSongs'
                  ? {
                      backgroundColor: '#FA6203',
                      borderColor: '#FA6203',
                      borderWidth: 1.5,
                    }
                  : {
                      backgroundColor: 'rgba(255, 255, 255, 0.75)',
                      borderColor: 'rgba(250, 98, 3, 0.18)',
                      borderWidth: 1.5,
                    },
              ]}
              onPress={() => { setActiveTab('eventSongs'); setSearch(''); }}
              activeOpacity={0.75}
            >
              <Sliders
                size={13}
                color={
                  activeTab === 'eventSongs'
                    ? '#FFFFFF'
                    : '#0F172A'
                }
                strokeWidth={2.4}
              />
              <Text
                style={[
                  styles.tabPillTxt,
                  {
                    color: activeTab === 'eventSongs'
                      ? '#FFFFFF'
                      : '#0F172A',
                  },
                  activeTab === 'eventSongs' && { fontWeight: '900' },
                ]}
              >
                Event Songs
              </Text>
            </TouchableOpacity>

            {/* Tab 2: Theme Songs */}
            <TouchableOpacity
              style={[
                styles.tabPill,
                activeTab === 'theme'
                  ? {
                      backgroundColor: '#FA6203',
                      borderColor: '#FA6203',
                      borderWidth: 1.5,
                    }
                  : {
                      backgroundColor: 'rgba(255, 255, 255, 0.75)',
                      borderColor: 'rgba(250, 98, 3, 0.18)',
                      borderWidth: 1.5,
                    },
              ]}
              onPress={() => { setActiveTab('theme'); setSearch(''); }}
              activeOpacity={0.75}
            >
              <Music
                size={13}
                color={
                  activeTab === 'theme'
                    ? '#FFFFFF'
                    : '#0F172A'
                }
                strokeWidth={2.4}
              />
              <Text
                style={[
                  styles.tabPillTxt,
                  {
                    color: activeTab === 'theme'
                      ? '#FFFFFF'
                      : '#0F172A',
                  },
                  activeTab === 'theme' && { fontWeight: '900' },
                ]}
              >
                {t('songs.theme')}
              </Text>
            </TouchableOpacity>

            {/* Tab 3: My Songs */}
            <TouchableOpacity
              style={[
                styles.tabPill,
                activeTab === 'songbook'
                  ? {
                      backgroundColor: '#FA6203',
                      borderColor: '#FA6203',
                      borderWidth: 1.5,
                    }
                  : {
                      backgroundColor: 'rgba(255, 255, 255, 0.75)',
                      borderColor: 'rgba(250, 98, 3, 0.18)',
                      borderWidth: 1.5,
                    },
              ]}
              onPress={() => { setActiveTab('songbook'); setSearch(''); }}
              activeOpacity={0.75}
            >
              <BookMarked
                size={13}
                color={
                  activeTab === 'songbook'
                    ? '#FFFFFF'
                    : '#0F172A'
                }
                strokeWidth={2.4}
              />
              <Text
                style={[
                  styles.tabPillTxt,
                  {
                    color: activeTab === 'songbook'
                      ? '#FFFFFF'
                      : '#0F172A',
                  },
                  activeTab === 'songbook' && { fontWeight: '900' },
                ]}
              >
                {t('songs.mySongs')}{savedIds.length > 0 ? ` (${savedIds.length})` : ''}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* ── Category Chips Included in Above Card (Straight horizontal row, capsule badges) ── */}
        {activeTab === 'browse' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 2, marginBottom: 2 }}
            contentContainerStyle={{
              paddingHorizontal: 16,
              gap: 8,
              alignItems: 'center',
            }}
          >
            {CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setSelectedCategory(cat)}
                  style={[
                    styles.chip,
                    isSelected
                      ? {
                          backgroundColor: '#0F172A',
                          borderColor: '#0F172A',
                          borderWidth: 1.5,
                        }
                      : {
                          backgroundColor: 'rgba(255, 255, 255, 0.75)',
                          borderColor: 'rgba(250, 98, 3, 0.18)',
                          borderWidth: 1.5,
                        },
                  ]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipTxt,
                      {
                        color: isSelected
                          ? '#FFFFFF'
                          : '#0F172A',
                      },
                      isSelected && { fontWeight: '800' },
                    ]}
                  >
                    {SongLanguageHelper.getLocalizedCategory(cat, language)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── Lower Area (Surfaces beneath the top square card) ── */}
      <View style={{ flex: 1, backgroundColor: isDark ? '#000000' : colors.background }}>

      {/* ── Search Bar (Hidden at top on Event Songs tab since it renders below the Event Card) ── */}
      {activeTab !== 'eventSongs' && (
        <>
        <View
          style={[
            styles.searchBar,
            {
              backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              borderColor: isDark ? '#6B7280' : '#334155',
              borderWidth: 1.5,
              shadowColor: '#000',
              shadowOpacity: isDark ? 0.25 : 0.06,
              shadowRadius: 6,
              elevation: 3,
            }
          ]}
        >
          <Search size={19} color={isDark ? '#9CA3AF' : '#334155'} strokeWidth={2.2} />
          <TextInput
            placeholder={
              activeTab === 'browse' ? t('songs.searchSongs') :
              activeTab === 'theme' ? t('songs.searchThemeSongs') :
              t('songs.searchSongbook')
            }
              placeholderTextColor={isDark ? '#9CA3AF' : '#64748B'}
              style={[styles.searchInput, { color: isDark ? '#FFFFFF' : '#0F172A' }]}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
              >
                <X size={13} color={isDark ? '#E5E7EB' : '#334155'} strokeWidth={2.4} />
              </TouchableOpacity>
            )}
          </View>

          {/* Long Press hint */}
          {activeTab === 'browse' && (
            <Text style={styles.hint}>{t('songs.longPressSaveHint')}</Text>
          )}
          {activeTab === 'songbook' && (
            <Text style={styles.hint}>{t('songs.longPressRemoveHint')}</Text>
          )}
        </>
      )}
      {activeTab !== 'eventSongs' ? null : null}

      {/* ── Setlist Flow Tab ── */}
      {/* ── Event Songs Flow Tab ── */}
      {activeTab === 'eventSongs' && (
        <FlatList
          style={{ flex: 1 }}
          data={filteredEventSongs}
          keyExtractor={(item, idx) => `event-song-${item.id || "song"}-${idx}`}
          renderItem={renderSongCard}
          contentContainerStyle={[styles.listContent, { paddingTop: 10 }]}
          showsVerticalScrollIndicator={false}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? '#FFFFFF' : '#0F172A'} />}
          ListHeaderComponent={renderEventCardHeader()}
          ListEmptyComponent={
            (!activeEvent || validServices.length === 0) ? null : (
              <View style={styles.emptyState}>
                <Music size={44} color="#cbd5e1" />
                <Text style={[styles.emptyTitle, { color: isDark ? '#E4E4E7' : '#0F172A' }]}>
                  {eventSongItems.length === 0 ? 'No Songs in this Service' : t('songs.noSongsFound')}
                </Text>
                <Text style={styles.emptySub}>
                  {eventSongItems.length === 0 
                    ? `The song arrangement for ${activeService?.name || 'this service'} will appear here once published.` 
                    : t('songs.tryDifferentCategory')}
                </Text>
              </View>
            )
          }
        />
      )}

      {/* ── Browse List ── */}
      {activeTab === 'browse' && (
        loading && !refreshing ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#fbbf24" />
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={filteredBrowse}
            keyExtractor={item => item.id}
            renderItem={renderSongCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1a2d5a" />}
            ListHeaderComponent={
              <Text style={styles.secLbl}>
                {selectedCategory === 'All' ? t('songs.allSongs').toUpperCase() : SongLanguageHelper.getLocalizedCategory(selectedCategory, language).toUpperCase()} • {t('songs.songsCount', { count: filteredBrowse.length })}
              </Text>
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <AlertCircle size={44} color="#cbd5e1" />
                <Text style={[styles.emptyTitle, { color: isDark ? '#E4E4E7' : '#0F172A' }]}>{t('songs.noSongsFound')}</Text>
                <Text style={styles.emptySub}>{t('songs.tryDifferentCategory')}</Text>
              </View>
            }
          />
        )
      )}

      {/* ── My Songbook ── */}
      {activeTab === 'songbook' && (
        <FlatList
          style={{ flex: 1 }}
          data={filteredSongbook}
          keyExtractor={item => item.id}
          renderItem={renderSongCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          ListHeaderComponent={
            <Text style={styles.secLbl}>{t('songs.mySavedSongs')} • {t('songs.songsCount', { count: filteredSongbook.length })}</Text>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <BookMarked size={44} color="#cbd5e1" />
              <Text style={[styles.emptyTitle, { color: isDark ? '#E4E4E7' : '#0F172A' }]}>{t('songs.songbookEmpty')}</Text>
              <Text style={styles.emptySub}>{t('songs.songbookEmptySub')}</Text>
            </View>
          }
        />
      )}

      {/* ── Theme Songs List ── */}
      {activeTab === 'theme' && (
        loading && !refreshing ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#fbbf24" />
          </View>
        ) : (
          <FlatList
            style={{ flex: 1 }}
            data={filteredTheme}
            keyExtractor={item => item.id}
            renderItem={renderSongCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            initialNumToRender={15}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1a2d5a" />}
            ListHeaderComponent={
              <Text style={styles.secLbl}>
                {t('songs.themeSongs')} • {t('songs.songsCount', { count: filteredTheme.length })}
              </Text>
            }
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={[styles.emptyTitle, { color: isDark ? '#E4E4E7' : '#0F172A' }]}>{t('songs.noThemeSongs')}</Text>
                <Text style={styles.emptySub}>{t('songs.noThemeSongsSub')}</Text>
              </View>
            }
          />
        )
      )}

      </View>

      {/* ── Lyrics Modal ── */}
      <SongDetailModal
        visible={!!selectedSong}
        song={selectedSong}
        onClose={() => setSelectedSong(null)}
        isDark={isDark}
        isSaved={selectedSong ? savedIds.includes(selectedSong.id) : false}
        onToggleSave={toggleSave}
        currentSongIndex={currentSongIndex}
        totalSongs={totalSongs}
        onNext={() => currentSongIndex < totalSongs - 1 && setSelectedSong(enrichSongWithSetlist(activeList[currentSongIndex + 1]))}
        onPrev={() => currentSongIndex > 0 && setSelectedSong(enrichSongWithSetlist(activeList[currentSongIndex - 1]))}
      />
      <CustomAlert 
        visible={alertConfig.visible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circularBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  headerTitleText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  headerRightSpacer: {
    width: 40,
    height: 40,
  },
  headerCardWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  pageHeader: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(228, 238, 234, 0.25)',
  },
  headerDecoCircle1: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(228, 238, 234, 0.10)',
    top: -50,
    right: -25,
  },
  headerDecoCircle2: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(228, 238, 234, 0.08)',
    bottom: -40,
    left: 35,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#E4EEEA',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  headerCenterTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  pageTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  headerTitleAccentBar: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#E4EEEA',
    marginTop: 5,
    opacity: 0.85,
  },
  headerRightIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#E4EEEA',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  pageSub: { color: '#aac4e8', fontSize: 12, marginTop: 2, fontWeight: '600', marginHorizontal: 56 },

  // Tabs
  tabBar: { flexDirection: 'row', backgroundColor: '#e2e8f0', marginHorizontal: 16, marginTop: 15, marginBottom: 0, borderRadius: 25, padding: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 2, borderRadius: 21, gap: 2, minWidth: 0 },
  tabActive: { backgroundColor: '#0F172A' },
  tabTxt: { fontSize: 10, fontWeight: '700', color: '#64748b', flexShrink: 1, textAlign: 'center' },
  tabTxtActive: { color: '#fff' },

  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 6,
  },
  tabPillTxt: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Category chips
  chipScroll: { marginTop: 12, maxHeight: 52 },
  chip: { height: 36, paddingHorizontal: 16, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  chipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  chipTxt: { fontSize: 12, fontWeight: '700', color: '#475569' },
  chipTxtActive: { color: '#fff' },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 8,
    marginLeft: 10,
  },
  hint: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 10,
    fontStyle: 'italic',
  },

  listContent: { paddingBottom: 40 },
  secLbl: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.8, marginHorizontal: 16, marginBottom: 10, marginTop: 6 },

  // Song Card
  songItemWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 0,
  },
  songItemRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  songTimeline: {
    width: 38,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  timelineTopStick: {
    position: 'absolute',
    top: 0,
    bottom: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    overflow: 'hidden',
  },
  timelineBottomStick: {
    position: 'absolute',
    top: '50%',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    overflow: 'hidden',
  },
  songNumBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  songNumText: {
    fontWeight: '800',
    textAlign: 'center',
    includeFontPadding: false,
  },
  songCard: {
    flex: 1,
    marginVertical: 4.5,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  indexBox: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  indexTxt: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  info: { flex: 1 },
  title: { fontSize: 15.5, fontWeight: '700', letterSpacing: -0.2 },
  artist: { fontSize: 12.5, marginTop: 3, fontWeight: '500' },
  keyBadge: { backgroundColor: '#F0FDF4', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7, marginRight: 6 },
  keyTxt: { fontSize: 9, color: '#166534', fontWeight: '800' },

  emptyState: { padding: 40, alignItems: 'center', marginTop: 30 },
  emptyTitle: { fontSize: 15, fontWeight: '800', marginTop: 12 },
  emptySub: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 4 },
});
