import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Image,
  Modal,
  StyleSheet,
  Share,
  Linking,
  Platform,
  StatusBar,
  useWindowDimensions,
  Animated,
  Easing,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import FirestoreService, { Sermon } from '../services/FirestoreService';
import { formatSermonDuration, isSermonVisibleToMembers } from '../utils/DateUtils';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

/* ───────────── Category Definitions & Colors ───────────── */
const ALL_CATEGORIES = [
  'All',
  'Bible Study',
  "Women's Fasting Prayer",
  'Second Saturday Prayer',
  'Sunday Service',
  'All-Night Prayer',
  'Youth Meeting',
  'Revival Meeting',
  'Special Messages',
  'Shorts',
  'Testimonies',
  'Uncategorized',
];

/* ───────────── 40 Unique Card Colors (Interleaved to Prevent Similar Adjacent Colors) ───────────── */
export interface CardColorDef {
  name: string;
  color: string;
}

export const SERMON_CARD_COLORS: CardColorDef[] = [
  { name: 'Royal Sapphire',  color: '#174A7E' }, // 39 from user
  { name: 'Peach Pink',      color: '#FFB7A5' }, // 20
  { name: 'Forest',          color: '#22543D' }, // 7
  { name: 'Cashmere',        color: '#D8C3A5' }, // 5
  { name: 'Ultra Violet',    color: '#5F4B8B' }, // 13
  { name: 'Candle',          color: '#FAD02C' }, // 28
  { name: 'Charcoal',        color: '#243342' }, // 4 (rich deep midnight charcoal)
  { name: 'Mint Green',      color: '#86EFAC' }, // 17
  { name: 'Coral',           color: '#FF6F61' }, // 29
  { name: 'Truffle',         color: '#5E4B3E' }, // 6
  { name: 'Soft Sage',       color: '#A3B899' }, // 15
  { name: 'Cognac',          color: '#9E472A' }, // 3
  { name: 'Ocean Blue',      color: '#0284C7' }, // 11
  { name: 'Alabaster',       color: '#E7E4DC' }, // 22
  { name: 'Deep Burgundy',   color: '#58111A' }, // 10
  { name: 'Golden Yellow',   color: '#F5B041' }, // 18
  { name: 'Slate Green',     color: '#2E5F52' }, // 23 (rich jade slate)
  { name: 'Dusty Mauve',     color: '#A77B91' }, // 40 from user
  { name: 'Orange',          color: '#F97316' }, // 32
  { name: 'Gunmetal',        color: '#2C465E' }, // 8 (rich steel navy gunmetal)
  { name: 'Ivory',           color: '#FAF5E4' }, // 24
  { name: 'Moss',            color: '#607D3B' }, // 9
  { name: 'Pumpkin',         color: '#D35400' }, // 12
  { name: 'Midnight Luxe',   color: '#121B28' }, // 37
  { name: 'Lavender Pink',   color: '#E8AEB7' }, // 16
  { name: 'Leaf',            color: '#4CAF50' }, // 30
  { name: 'Warm Sand',       color: '#D4B28C' }, // 34
  { name: 'Merlot Bliss',    color: '#6B1D2F' }, // 35
  { name: 'Cove',            color: '#385A6C' }, // 1
  { name: 'Apricot',         color: '#FDBA74' }, // 26
  { name: 'Dark Emerald',    color: '#065F46' }, // 21
  { name: 'Natural',         color: '#C8B69B' }, // 25
  { name: 'Velours Noir',    color: '#1C1C1E' }, // 2
  { name: 'Olive Grove',     color: '#6A7B44' }, // 33
  { name: 'Creamy Taupe',    color: '#DFD3C3' }, // 36 (warm creamy almond)
  { name: 'Juniper',         color: '#2E4E4C' }, // 31
  { name: 'Organic',         color: '#C4AB8E' }, // 27 (warm honey taupe)
  { name: 'Deep Olive',      color: '#4A5320' }, // 14
  { name: 'Soft Ivory',      color: '#F0EAE1' }, // 38
  { name: 'Sage Green',      color: '#5A7A64' }, // 19 (rich evergreen sage)
];

const getSermonCardColor = (index: number): CardColorDef => {
  const safeIndex = typeof index === 'number' && !isNaN(index) ? Math.abs(index) : 0;
  return SERMON_CARD_COLORS[safeIndex % SERMON_CARD_COLORS.length];
};

const getCardColor = (input: number | string): string => {
  if (typeof input === 'number') {
    return getSermonCardColor(input).color;
  }
  return SERMON_CARD_COLORS[0].color;
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

const formatTabCategory = (cat: string): string => {
  if (!cat) return '';
  const trimmed = cat.trim();
  if (/^women['’]?s?\s+fasting(\s+prayer)?$/i.test(trimmed)) {
    return "Women's Fasting";
  }
  return trimmed;
};

const normalizeCategory = (cat: string): string => {
  if (!cat) return '';
  return cat
    .toLowerCase()
    .replace(/[\u2018\u2019'`]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const isCategoryMatch = (sermonCat: string, filterCat: string): boolean => {
  const normS = normalizeCategory(sermonCat);
  const normF = normalizeCategory(filterCat);
  if (!normS || !normF) return false;
  if (normS === normF) return true;
  // Handle women vs womens and singular vs plural
  const canonicalS = normS.replace(/^women\b/, 'womens').replace(/s$/, '');
  const canonicalF = normF.replace(/^women\b/, 'womens').replace(/s$/, '');
  return canonicalS === canonicalF;
};

const C = {
  lime: '#c9e8a3',
  ink: '#16213f',
};

const MON = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_ROWS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [9, 10, 11],
];
const WK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ───────────── Sermon Item Interface ───────────── */
export interface SermonItemData {
  id: string | number;
  cat: string;
  categoriesList: string[];
  title: string;
  te?: string;
  spk: string;
  date: string; // 'YYYY-MM-DD'
  dur: string;
  verse?: string;
  notes?: string;
  notesUrl?: string;
  youtubeId?: string;
  thumb?: string;
  raw?: any;
}

/* ───────────── Helpers ───────────── */
const pd = (s?: string) => {
  if (!s) return new Date();
  if (typeof s === 'string') {
    const clean = s.trim();
    const parts = clean.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

const fmt = (d: Date) => `${d.getDate()} ${MON[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
const ini = (n = '') => (n.replace(/[^A-Za-z ]/g, '').trim().charAt(0) || 'P').toUpperCase();

const extractYoutubeId = (url: string) => {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.trim();
  const match = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]+)/);
  return match ? match[1] : cleanUrl;
};

/* ───────────── Custom SVG Icons ───────────── */
const Icon = ({ name, size = 22, color = '#111827' }: { name: string; size?: number; color?: string }) => {
  const p = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  let body: React.ReactNode = null;
  switch (name) {
    case 'back':
      body = <Path d="M19 12H5M11 6l-6 6 6 6" {...p} />;
      break;
    case 'down':
      body = <Path d="M6 9l6 6 6-6" {...p} strokeWidth={2.4} />;
      break;
    case 'chl':
      body = <Path d="M15 5l-7 7 7 7" {...p} />;
      break;
    case 'chr':
      body = <Path d="M9 5l7 7-7 7" {...p} />;
      break;
    case 'clock':
      body = (
        <>
          <Circle cx="12" cy="12" r="9" {...p} />
          <Path d="M12 7v5l3 2" {...p} />
        </>
      );
      break;
    case 'cal':
      body = (
        <>
          <Rect x="3.5" y="5" width="17" height="15" rx="3.5" {...p} />
          <Path d="M8 3v4M16 3v4M3.5 10h17" {...p} />
        </>
      );
      break;
    case 'book':
      body = (
        <Path
          d="M3 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H3zM21 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z"
          {...p}
        />
      );
      break;
    case 'folder':
      body = (
        <Path
          d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2.5h7.5A2.5 2.5 0 0 1 21 9v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"
          fill={color}
        />
      );
      break;
    case 'share':
      body = (
        <>
          <Circle cx="18" cy="5" r="3" {...p} />
          <Circle cx="6" cy="12" r="3" {...p} />
          <Circle cx="18" cy="19" r="3" {...p} />
          <Path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" {...p} />
        </>
      );
      break;
    case 'play':
      body = <Path d="M7 4l13 8-13 8z" fill={color} />;
      break;
    case 'pause':
      body = (
        <>
          <Rect x="6" y="4" width="4.5" height="16" rx="1.5" fill={color} />
          <Rect x="13.5" y="4" width="4.5" height="16" rx="1.5" fill={color} />
        </>
      );
      break;
    case 'expand':
      body = <Path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" {...p} />;
      break;
    case 'video':
      body = (
        <>
          <Rect x="3" y="6" width="13" height="12" rx="3" {...p} />
          <Path d="M16 10.5l5-3v9l-5-3" {...p} />
        </>
      );
      break;
    case 'dots':
      body = (
        <>
          <Circle cx="12" cy="5" r="1.8" fill={color} />
          <Circle cx="12" cy="12" r="1.8" fill={color} />
          <Circle cx="12" cy="19" r="1.8" fill={color} />
        </>
      );
      break;
    default:
      body = null;
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {body}
    </Svg>
  );
};

/* ───────────── Poster / Thumbnail ───────────── */
const POSTER: [string, string][] = [
  ['#2a1450', '#d9672a'],
  ['#3a1a4a', '#e0508a'],
  ['#1a2144', '#5a2a1e'],
  ['#14407a', '#1d9bd8'],
];

const Thumb = ({ s, style, small }: { s: SermonItemData; style?: any; small?: boolean }) => {
  const hash = Math.abs(
    typeof s.id === 'number'
      ? s.id
      : (s.id ? String(s.id).split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) : 0)
  );
  const colors = POSTER[hash % POSTER.length];

  let uri = s.thumb || '';
  if (uri && uri.includes('hqdefault.jpg')) {
    uri = uri.replace('hqdefault.jpg', 'mqdefault.jpg');
  }

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#0F172A' }, style]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { borderRadius: 8 }]}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={colors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            StyleSheet.absoluteFill,
            { padding: small ? 5 : 12, justifyContent: 'center' },
          ]}
        >
          <Text
            numberOfLines={2}
            style={{
              color: '#ffd34d',
              fontWeight: '800',
              fontSize: small ? 8 : 18,
              lineHeight: small ? 10 : 22,
            }}
          >
            {s.title}
          </Text>
        </LinearGradient>
      )}
    </View>
  );
};

const PlayDot = ({ size = 26 }: { size?: number }) => (
  <View
    style={{
      position: 'absolute',
      alignSelf: 'center',
      top: '50%',
      marginTop: -size / 2,
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <View
      style={{
        marginLeft: 2,
        borderLeftWidth: size * 0.38,
        borderTopWidth: size * 0.23,
        borderBottomWidth: size * 0.23,
        borderLeftColor: '#FFFFFF',
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
      }}
    />
  </View>
);

/* ───────────── Month / Year Picker Sheet ───────────── */
const MonthSheet = ({
  visible,
  year,
  month,
  isMonthFiltered,
  onClose,
  onPick,
  onPickAll,
  sermons,
  colors,
  isDark,
}: {
  visible: boolean;
  year: number;
  month: number;
  isMonthFiltered: boolean;
  onClose: () => void;
  onPick: (year: number, month: number) => void;
  onPickAll?: () => void;
  sermons: SermonItemData[];
  colors: any;
  isDark: boolean;
}) => {
  const [sy, setSy] = useState(year);
  useEffect(() => {
    if (visible) setSy(year);
  }, [visible, year]);

  const has = (y: number, m: number) =>
    sermons.some((s) => {
      const d = pd(s.date);
      return d.getFullYear() === y && d.getMonth() === m;
    });

  const dotColor = isDark ? C.lime : (colors.accent || '#15803d');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBg} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header row with Sheet Title and All Months button */}
          <View style={styles.sheetHeaderRow}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Select Month & Year</Text>
            {onPickAll && (
              <TouchableOpacity
                onPress={onPickAll}
                style={[
                  styles.allMonthsBtn,
                  {
                    backgroundColor: !isMonthFiltered
                      ? C.lime
                      : (isDark ? 'rgba(255,255,255,0.08)' : colors.background),
                    borderColor: !isMonthFiltered ? C.lime : colors.border,
                    borderWidth: 1,
                  },
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.allMonthsTxt,
                    { color: !isMonthFiltered ? C.ink : colors.text },
                    !isMonthFiltered && { fontWeight: '800' },
                  ]}
                >
                  All Months
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.yr}>
            <TouchableOpacity
              style={[
                styles.yrBtn,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.background,
                  borderColor: colors.border,
                  borderWidth: 1,
                },
              ]}
              onPress={() => setSy(sy - 1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="chl" size={19} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.yrTxt, { color: colors.text }]}>{sy}</Text>
            <TouchableOpacity
              style={[
                styles.yrBtn,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.background,
                  borderColor: colors.border,
                  borderWidth: 1,
                },
              ]}
              onPress={() => setSy(sy + 1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="chr" size={19} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.mg}>
            {MONTH_ROWS.map((row, rIdx) => (
              <View key={rIdx} style={styles.mRow}>
                {row.map((i) => {
                  const n = MON[i];
                  const on = isMonthFiltered && sy === year && i === month;
                  return (
                    <TouchableOpacity
                      key={n}
                      onPress={() => onPick(sy, i)}
                      style={[
                        styles.mBtn,
                        {
                          backgroundColor: on
                            ? C.lime
                            : (isDark ? '#1C1C20' : colors.background),
                          borderColor: on ? C.lime : colors.border,
                          borderWidth: 1,
                        },
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.mTxt,
                          { color: on ? C.ink : colors.text },
                          on && { fontWeight: '800' },
                        ]}
                      >
                        {n.slice(0, 3)}
                      </Text>
                      {has(sy, i) && (
                        <View
                          style={[
                            styles.mDot,
                            { backgroundColor: on ? C.ink : dotColor },
                          ]}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

/* ───────────── Date Pill (Consistent Badge Size - Fills on Click, No Ballooning) ───────────── */
const DatePill = ({
  label,
  sub,
  on,
  dot,
  onPress,
  colors,
  isDark,
  isAshTop,
}: {
  label: string;
  sub: string;
  on: boolean;
  dot: boolean;
  onPress: () => void;
  colors: any;
  isDark: boolean;
  isAshTop?: boolean;
}) => {
  const dotColor = isDark ? C.lime : (colors.accent || '#15803d');

  let bg = on ? C.lime : (isDark ? '#1C1C20' : 'rgba(0,0,0,0.07)');
  let border = on ? C.lime : (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)');
  let numColor = on ? C.ink : colors.text;
  let subColor = on ? '#3a4a2a' : colors.textSecondary;
  let dotBg = dot ? (on ? C.ink : dotColor) : 'transparent';

  if (isAshTop) {
    if (on) {
      bg = '#FFFFFF';
      border = '#FFFFFF';
      numColor = '#0F172A';
      subColor = '#334155';
      dotBg = dot ? '#0F172A' : 'transparent';
    } else {
      bg = 'rgba(255,255,255,0.16)';
      border = 'rgba(255,255,255,0.28)';
      numColor = '#FFFFFF';
      subColor = 'rgba(255,255,255,0.85)';
      dotBg = dot ? '#FFFFFF' : 'transparent';
    }
  }

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.dp,
        {
          backgroundColor: bg,
          borderColor: border,
        },
      ]}
    >
      <Text
        style={[
          styles.dpN,
          { color: numColor },
          on && { fontWeight: '800' },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.dpW,
          { color: subColor },
          on && { fontWeight: '700' },
        ]}
      >
        {sub}
      </Text>
      <View
        style={[
          styles.dpDot,
          { backgroundColor: dotBg },
        ]}
      />
    </TouchableOpacity>
  );
};

/* ───────────── Sermon Item with Vibrant Folder-Tab ───────────── */
const SermonItem = ({
  s,
  onOpen,
  index,
  onDotsPress,
  colors,
  isDark,
  activeCategory,
}: {
  s: SermonItemData;
  onOpen: (s: SermonItemData) => void;
  index: number;
  onDotsPress: (s: SermonItemData) => void;
  colors: any;
  isDark: boolean;
  activeCategory?: string;
}) => {
  const d = pd(s.date);
  const cardDef = getSermonCardColor(index);
  const cardColor = cardDef.color;
  const isLight = isColorLight(cardColor);

  const titleColor = isLight ? '#0F172A' : '#FFFFFF';
  const subColor = isLight ? '#334155' : 'rgba(255, 255, 255, 0.82)';
  const iconPillBg = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.18)';
  const dividerColor = isDark ? 'rgba(255, 255, 255, 0.25)' : '#94A3B8';
  const metaColor = isDark ? 'rgba(255, 255, 255, 0.75)' : '#64748B';

  const displayCategory = (activeCategory && activeCategory !== 'All' && activeCategory !== 'Uncategorized')
    ? activeCategory
    : (s.cat || 'Sunday Service');

  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(a, {
      toValue: 1,
      duration: 380,
      delay: Math.min(index * 60, 320),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [a, index]);

  return (
    <Animated.View
      style={[
        styles.item,
        {
          opacity: a,
          transform: [
            {
              translateY: a.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.itemRow}>
        {/* Left: Date timeline */}
        <View style={styles.tl}>
          <Text style={[styles.tlD, { color: colors.text }]}>{d.getDate()}</Text>
          <Text style={[styles.tlM, { color: colors.textSecondary }]}>{MON[d.getMonth()].slice(0, 3)}</Text>
          
          {/* Distinct dots between month and day */}
          <View style={styles.tlDots}>
            <View style={[styles.tlDot, { backgroundColor: dividerColor }]} />
            <View style={[styles.tlDot, { backgroundColor: dividerColor }]} />
            <View style={[styles.tlDot, { backgroundColor: dividerColor }]} />
          </View>

          <Text style={[styles.tlM, { color: colors.textSecondary }]}>{WK[d.getDay()]}</Text>
        </View>

        {/* Right: Vibrant Folder Card */}
        <Pressable style={{ flex: 1, minWidth: 0 }} onPress={() => onOpen(s)}>
          <View style={styles.tabRow}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', flex: 1 }}>
              <View style={[styles.tab, { backgroundColor: cardColor }]}>
                <Text numberOfLines={1} style={[styles.tabTxt, { color: titleColor }]}>
                  {formatTabCategory(displayCategory)}
                </Text>
              </View>
              {/* Inverted corner connecting tab to card body seamlessly */}
              <Svg width={16} height={16} style={{ marginLeft: -0.5 }}>
                <Path d="M0 0L0 16L16 16A16 16 0 0 1 0 0Z" fill={cardColor} />
              </Svg>

              {/* Duration moved next to card curve, placed on top of card */}
              {!!s.dur && (
                <View style={styles.durTag}>
                  <Icon name="clock" size={13} color={metaColor} />
                  <Text style={[styles.durTxt, { color: metaColor }]}>{s.dur}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: cardColor }]}>
            <View style={styles.r1}>
              <View style={styles.th}>
                <Thumb s={s} small style={StyleSheet.absoluteFill} />
                <PlayDot size={24} />
              </View>
              <View style={{ flex: 1, minWidth: 0, paddingLeft: 4 }}>
                <Text numberOfLines={1} style={[styles.ti, { color: titleColor }]}>
                  {s.title}
                </Text>
                {!!s.te && (
                  <Text numberOfLines={1} style={[styles.te, { color: titleColor, opacity: 0.9 }]}>
                    {s.te}
                  </Text>
                )}
                <Text numberOfLines={1} style={[styles.sp, { color: subColor }]}>
                  {s.spk}
                </Text>
                {!!s.verse && (
                  <Text numberOfLines={1} style={[styles.vs, { color: subColor, opacity: 0.95 }]}>
                    📖 {s.verse}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={[styles.mn, { backgroundColor: iconPillBg }]}
                onPress={() => onDotsPress(s)}
              >
                <Icon name="dots" size={16} color={titleColor} />
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </View>

      {/* Dashed divider between sermon items (clearly visible in white theme) */}
      <View style={styles.cardDivider}>
        <Svg width="100%" height={2}>
          <Path
            d="M 0,1 L 1200,1"
            stroke={dividerColor}
            strokeWidth={1.5}
            strokeDasharray="6, 5"
          />
        </Svg>
      </View>
    </Animated.View>
  );
};

/* ───────────── MAIN SERMONS SCREEN ───────────── */
export default function SermonsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors, isDark, appearance } = useTheme();
  const { t } = useLanguage();

  const [sermons, setSermons] = useState<SermonItemData[]>([]);
  const [categoryList, setCategoryList] = useState<string[]>(ALL_CATEGORIES);
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Month & Year state: start with current month/year
  const now = new Date();
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth());
  const [day, setDay] = useState<number | null>(null); // null = All days
  const [sheet, setSheet] = useState(false);
  const [isMonthFiltered, setIsMonthFiltered] = useState(false);

  // Card Options Modal
  const [actionSermon, setActionSermon] = useState<SermonItemData | null>(null);
  const [headerMenuVisible, setHeaderMenuVisible] = useState(false);

  const dateRef = useRef<ScrollView>(null);

  const getCategoryLabel = (cat: string) => {
    if (!cat) return '';
    const normalized = cat.trim().toLowerCase().replace(/['’]/g, '');
    switch (normalized) {
      case 'all':
        return t('sermons.categories.all') || 'All';
      case 'bible study':
        return t('sermons.categories.bibleStudy') || 'Bible Study';
      case 'womens fasting prayer':
      case 'women fasting prayer':
        return t('sermons.categories.womensFastingPrayer') || "Women's Fasting Prayer";
      case 'second saturday prayer':
        return t('sermons.categories.secondSaturdayPrayer') || 'Second Saturday Prayer';
      case 'sunday service':
        return t('sermons.categories.sundayService') || 'Sunday Service';
      case 'all-night prayer':
      case 'all night prayer':
        return t('sermons.categories.allNightPrayer') || 'All-Night Prayer';
      case 'youth meeting':
        return t('sermons.categories.youthMeeting') || 'Youth Meeting';
      case 'revival meeting':
        return t('sermons.categories.revivalMeeting') || 'Revival Meeting';
      case 'special messages':
      case 'special message':
        return t('sermons.categories.specialMessages') || 'Special Messages';
      case 'shorts':
      case 'short':
        return t('sermons.categories.shorts') || 'Shorts';
      case 'testimonies':
      case 'testimony':
        return t('sermons.categories.testimonies') || 'Testimonies';
      case 'uncategorized':
        return t('sermons.categories.uncategorized') || 'Uncategorized';
      default:
        return cat;
    }
  };

  // Map real Firestore sermon to our UI structure
  const mapFirestoreSermon = (s: Sermon): SermonItemData => {
    const sAny = s as any;
    let catsArray: string[] = [];
    if (typeof s.categories === 'string' && s.categories.trim()) {
      catsArray = s.categories.split(/[;,|]/).map((c: string) => c.trim()).filter(Boolean);
    } else if (Array.isArray(sAny.categories)) {
      catsArray = sAny.categories.map((c: any) => typeof c === 'string' ? c.trim() : '').filter(Boolean);
    } else if (sAny.category) {
      catsArray = [String(sAny.category).trim()];
    }

    if (sAny.category && typeof sAny.category === 'string') {
      const singleCat = sAny.category.trim();
      if (singleCat && !catsArray.includes(singleCat)) {
        catsArray.push(singleCat);
      }
    }

    const sermonCat = catsArray[0] || 'Sunday Service';
    const yId = extractYoutubeId(s.youtubeId || '');
    const thumbUri =
      s.thumbnailUrl ||
      s.imageUrl ||
      (yId && yId.length === 11 ? `https://img.youtube.com/vi/${yId}/mqdefault.jpg` : '');

    return {
      id: s.id,
      cat: sermonCat,
      categoriesList: catsArray,
      title: s.title || 'Sermon',
      te: s.titleTelugu || '',
      spk: s.pastor || 'Pastor',
      date: s.date || '',
      dur: formatSermonDuration(s.duration) || s.duration || '',
      verse: s.scripture || '',
      notes: s.notesFileName || s.notesText || (s.notesUrl ? 'Sermon Notes' : ''),
      notesUrl: s.notesUrl || '',
      youtubeId: yId,
      thumb: thumbUri,
      raw: s,
    };
  };

  const fetchSermons = async () => {
    try {
      setLoading(true);
      const [data, serverCats] = await Promise.all([
        FirestoreService.getSermons(250),
        FirestoreService.getSermonCategories().catch(() => [])
      ]);
      const visible = (data || []).filter((s: any) => isSermonVisibleToMembers(s));
      const mapped = visible.map(mapFirestoreSermon);
      setSermons(mapped);

      // Build restored complete category list: All + ALL_CATEGORIES + serverCats + sermonCats + Uncategorized
      const sermonCats: string[] = [];
      visible.forEach((s: any) => {
        if (typeof s.categories === 'string' && s.categories.trim()) {
          s.categories.split(/[;,|]/).forEach((c: string) => {
            const trimmed = c.trim();
            if (trimmed && !sermonCats.includes(trimmed)) sermonCats.push(trimmed);
          });
        } else if (Array.isArray(s.categories)) {
          s.categories.forEach((c: any) => {
            const trimmed = typeof c === 'string' ? c.trim() : '';
            if (trimmed && !sermonCats.includes(trimmed)) sermonCats.push(trimmed);
          });
        } else if (s.category && typeof s.category === 'string') {
          const trimmed = s.category.trim();
          if (trimmed && !sermonCats.includes(trimmed)) sermonCats.push(trimmed);
        }
      });

      const merged = ['All'];
      const addCat = (c: string) => {
        if (c && c !== 'All' && c !== 'Uncategorized' && !merged.includes(c)) {
          merged.push(c);
        }
      };
      ALL_CATEGORIES.forEach(addCat);
      (serverCats || []).forEach(addCat);
      sermonCats.forEach(addCat);
      merged.push('Uncategorized');

      setCategoryList(merged);

      // If sermons exist, set year & month to the newest sermon's date
      if (mapped.length > 0) {
        const sorted = [...mapped].sort((a, b) => pd(b.date).getTime() - pd(a.date).getTime());
        const latest = sorted[0];
        if (latest && latest.date) {
          const ld = pd(latest.date);
          setY(ld.getFullYear());
          setM(ld.getMonth());
        }
      }
    } catch (err) {
      console.warn('Error fetching sermons from Firestore:', err);
      setSermons([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSermons();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchSermons();
  };

  const catOK = (s: SermonItemData) => {
    if (activeCategory === 'All') return true;
    if (activeCategory === 'Uncategorized') return !s.categoriesList || s.categoriesList.length === 0;
    if (isCategoryMatch(s.cat, activeCategory)) return true;
    if (s.categoriesList && s.categoriesList.some((c) => isCategoryMatch(c, activeCategory))) {
      return true;
    }
    return false;
  };

  const inMonth = (s: SermonItemData) => {
    const d = pd(s.date);
    return d.getFullYear() === y && d.getMonth() === m;
  };

  // Days with sermons in selected month & category
  const withSermon = useMemo(() => {
    const o: Record<number, boolean> = {};
    sermons.forEach((s) => {
      const d = pd(s.date);
      if (d.getFullYear() === y && d.getMonth() === m && catOK(s)) {
        o[d.getDate()] = true;
      }
    });
    return o;
  }, [sermons, y, m, activeCategory]);

  // Filtered list:
  // - Category filters display ALL matching sermons with complete details (NO 40 limit)
  // - Month and Year filters display ALL sermons for the selected period (NO 40 limit)
  // - The 40-sermon limit applies STRICTLY to the general "All" section
  const list = useMemo(() => {
    // 1. Explicit Month/Year filter is ACTIVE:
    if (isMonthFiltered) {
      return sermons
        .filter((s) => inMonth(s) && (day === null || pd(s.date).getDate() === day) && catOK(s))
        .sort((a, b) => pd(b.date).getTime() - pd(a.date).getTime());
    }

    // 2. Specific day filter without month filter:
    if (day !== null) {
      return sermons
        .filter((s) => inMonth(s) && pd(s.date).getDate() === day && catOK(s))
        .sort((a, b) => pd(b.date).getTime() - pd(a.date).getTime());
    }

    // 3. Specific Category filter is ACTIVE:
    // Display ALL matching sermons with complete details (NO 40 limit)
    if (activeCategory !== 'All') {
      return sermons
        .filter(catOK)
        .sort((a, b) => pd(b.date).getTime() - pd(a.date).getTime());
    }

    // 4. General "All" Section (activeCategory === 'All' and no month/day filter):
    // The 40-sermon limit applies STRICTLY to the All section
    return [...sermons]
      .sort((a, b) => pd(b.date).getTime() - pd(a.date).getTime())
      .slice(0, 40);
  }, [sermons, y, m, day, activeCategory, isMonthFiltered]);

  const daysInMonth = new Date(y, m + 1, 0).getDate();

  // Scroll active date pill to center
  useEffect(() => {
    const idx = day === null ? 0 : day;
    dateRef.current?.scrollTo({ x: Math.max(0, idx * 62 - width / 2 + 38), animated: true });
  }, [day, y, m, width]);

  // Open sermon video screen
  const handleOpenSermon = (s: SermonItemData) => {
    navigation.navigate('SermonVideo', {
      sermonData: {
        ...(s.raw || {}),
        id: s.id,
        title: s.title,
        titleTelugu: s.te,
        pastor: s.spk,
        date: s.date,
        duration: s.dur,
        scripture: s.verse,
        categories: s.categoriesList && s.categoriesList.length > 0 ? s.categoriesList.join(';') : s.cat,
        youtubeId: s.youtubeId,
        thumbnailUrl: s.thumb,
        imageUrl: s.thumb,
        notesUrl: s.notesUrl,
        notesFileName: s.notes,
      },
      sermonId: String(s.id),
    });
  };

  // Share sermon
  const handleShareSermon = (s: SermonItemData) => {
    Share.share({
      message: `${s.title} – Rhema Global Ministries\nSpeaker: ${s.spk}${
        s.youtubeId ? `\nhttps://youtu.be/${s.youtubeId}` : ''
      }`,
    });
  };

  const topSafeArea = Math.max(insets.top, Platform.OS === 'ios' ? 44 : (StatusBar.currentHeight || 0));

  // In pure_white or light themes, use an elegant slate/ash gradient at the top
  // so the white dome curve arches with clean, subtle, premium contrast.
  const isAshTop = !isDark && (appearance === 'pure_white' || appearance === 'warm_white' || colors.background === '#FFFFFF');
  const topSectionBg = isDark ? colors.background : (isAshTop ? '#1E293B' : colors.background);

  return (
    <View style={[styles.container, { backgroundColor: isDark ? colors.background : colors.surface }]}>
      <StatusBar
        barStyle={isAshTop ? 'light-content' : (colors.barStyle || (isDark ? 'light-content' : 'dark-content'))}
        backgroundColor={isAshTop ? '#1E293B' : topSectionBg}
      />

      {/* ── Refined Ash / Slate Gradient at Top ── */}
      {isAshTop && (
        <LinearGradient
          colors={['#1E293B', '#334155', '#475569']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.35, y: 1 }}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 380 }}
          pointerEvents="none"
        />
      )}

      {/* ── Screen Header (Pinned directly at top beneath status bar) ── */}
      <View style={[styles.headerBar, { paddingTop: topSafeArea + 4, backgroundColor: 'transparent' }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.7}
        >
          <Icon name="back" size={22} color={isAshTop ? '#FFFFFF' : colors.text} />
        </TouchableOpacity>

        <Text style={[styles.headerTitle, { color: isAshTop ? '#FFFFFF' : colors.text }]} numberOfLines={1}>
          Sermons
        </Text>

        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => setHeaderMenuVisible(true)}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          activeOpacity={0.7}
        >
          <Icon name="dots" size={20} color={isAshTop ? '#FFFFFF' : colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
        style={{ backgroundColor: 'transparent' }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isAshTop ? '#FFFFFF' : C.lime}
            colors={[isAshTop ? '#94A3B8' : C.lime, '#334155']}
          />
        }
      >
        {/* ── Month & Year Selector ── */}
        <View style={styles.monContainer}>
          <Pressable style={styles.mon} onPress={() => setSheet(true)}>
            <Text style={[styles.monTxt, { color: isAshTop ? '#FFFFFF' : colors.text }]}>
              {isMonthFiltered ? `${MON[m]} ${y}` : 'All Months'}
            </Text>
            <Icon
              name="down"
              size={22}
              color={isAshTop ? '#CBD5E1' : (isDark ? C.lime : (colors.accent || '#2563EB'))}
            />
          </Pressable>

          {isMonthFiltered && (
            <TouchableOpacity
              style={[
                styles.clearFilterBtn,
                { backgroundColor: isAshTop ? 'rgba(255,255,255,0.18)' : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)') },
              ]}
              onPress={() => {
                setIsMonthFiltered(false);
                setDay(null);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.clearFilterTxt, { color: isAshTop ? '#FFFFFF' : colors.textSecondary }]}>
                Show All ✕
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Horizontal Date Strip ── */}
        <ScrollView
          ref={dateRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, backgroundColor: 'transparent' }}
          contentContainerStyle={styles.dates}
        >
          <DatePill
            label="All"
            sub="days"
            on={day === null}
            dot={false}
            onPress={() => setDay(null)}
            colors={colors}
            isDark={isDark}
            isAshTop={isAshTop}
          />
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
            <DatePill
              key={d}
              label={String(d)}
              sub={WK[new Date(y, m, d).getDay()]}
              on={day === d}
              dot={!!withSermon[d]}
              onPress={() => {
                setIsMonthFiltered(true);
                setDay(d);
              }}
              colors={colors}
              isDark={isDark}
              isAshTop={isAshTop}
            />
          ))}
        </ScrollView>

        {/* ── Top Convex Curve Transition (Smooth prominent curve above category badges) ── */}
        <View style={{ width: '100%', height: 72, overflow: 'hidden', marginTop: 2 }}>
          <Svg
            width={width}
            height={72}
            viewBox={`0 0 ${width} 72`}
            style={{ position: 'absolute', bottom: 0 }}
          >
            <Path
              d={`M 0,72 Q ${width / 2},-16 ${width},72 L ${width},72 L 0,72 Z`}
              fill={colors.surface}
            />
          </Svg>
        </View>

        {/* ── Lower Panel in colors.surface ── */}
        <View style={[styles.panel, { backgroundColor: colors.surface, marginTop: -1, flex: 1 }]}>
          {/* Fully Rounded Category Badges Strip (Capsule Badge - Fixed Height, No Ballooning) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ gap: 8, paddingVertical: 4, alignItems: 'center' }}
          >
            {categoryList.map((cat) => {
              const isSelected = activeCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setActiveCategory(cat)}
                  style={[
                    styles.chip,
                    isSelected
                      ? {
                          backgroundColor: isDark ? '#FFFFFF' : '#1E293B',
                          borderColor: isDark ? '#FFFFFF' : '#1E293B',
                          borderWidth: 1.5,
                        }
                      : {
                          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFF',
                          borderColor: isDark ? 'rgba(255,255,255,0.28)' : '#94A3B8',
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
                          ? (isDark ? '#111827' : '#FFFFFF')
                          : (isDark ? 'rgba(255,255,255,0.85)' : '#1E293B'),
                      },
                      isSelected && { fontWeight: '800' },
                    ]}
                  >
                    {getCategoryLabel(cat)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Summary Counter Row */}
          <View style={styles.sum}>
            <Text style={[styles.sumT, { color: colors.text }]}>
              {list.length} {list.length === 1 ? 'sermon' : 'sermons'}
            </Text>
            <Text style={[styles.sumD, { color: colors.textSecondary }]}>
              {day !== null
                ? `${day} ${MON[m].slice(0, 3)} ${y}`
                : isMonthFiltered
                ? `${MON[m]} ${y}`
                : 'All dates'}
            </Text>
          </View>

          {/* Real Sermons List / Loading / Empty State */}
          {loading ? (
            <View style={styles.empty}>
              <ActivityIndicator size="large" color={isDark ? C.lime : (colors.accent || '#15803d')} />
              <Text style={[styles.emptyS, { color: colors.textSecondary, marginTop: 14 }]}>
                Loading sermons...
              </Text>
            </View>
          ) : list.length === 0 ? (
            <View style={styles.empty}>
              <Icon name="video" size={52} color={colors.textSecondary} />
              <Text style={[styles.emptyT, { color: colors.text }]}>No sermons found</Text>
              <Text style={[styles.emptyS, { color: colors.textSecondary }]}>
                {sermons.length === 0
                  ? 'No sermons have been published yet.'
                  : isMonthFiltered
                  ? `No sermons found for ${MON[m]} ${y}. Try choosing another month or tap "Show All".`
                  : 'Try selecting another date, month or category.'}
              </Text>
              {isMonthFiltered && (
                <TouchableOpacity
                  style={{
                    marginTop: 14,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 20,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
                  }}
                  onPress={() => {
                    setIsMonthFiltered(false);
                    setDay(null);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
                    Show All Months
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            list.map((s, i) => (
              <SermonItem
                key={String(s.id)}
                s={s}
                index={i}
                onOpen={handleOpenSermon}
                onDotsPress={(item) => setActionSermon(item)}
                colors={colors}
                isDark={isDark}
                activeCategory={activeCategory}
              />
            ))
          )}
        </View>
      </ScrollView>

      {/* ── Month & Year Picker Sheet Modal ── */}
      <MonthSheet
        visible={sheet}
        year={y}
        month={m}
        isMonthFiltered={isMonthFiltered}
        sermons={sermons}
        colors={colors}
        isDark={isDark}
        onClose={() => setSheet(false)}
        onPickAll={() => {
          setIsMonthFiltered(false);
          setDay(null);
          setSheet(false);
        }}
        onPick={(yy, mm) => {
          setY(yy);
          setM(mm);
          setDay(null);
          setIsMonthFiltered(true);
          setSheet(false);
        }}
      />

      {/* ── Sermon Card Actions Modal ── */}
      <Modal
        visible={!!actionSermon}
        transparent
        animationType="fade"
        onRequestClose={() => setActionSermon(null)}
      >
        <Pressable style={styles.actionModalBg} onPress={() => setActionSermon(null)}>
          <Pressable
            style={[
              styles.actionModalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {actionSermon && (
              <>
                <Text style={[styles.actionModalTitle, { color: colors.text }]} numberOfLines={2}>
                  {actionSermon.title}
                </Text>
                <Text style={[styles.actionModalSub, { color: colors.textSecondary }]}>
                  {actionSermon.spk} · {fmt(pd(actionSermon.date))}
                </Text>
                {!!actionSermon.verse && (
                  <Text style={[styles.actionModalSub, { color: colors.accent || '#15803d', fontWeight: '600', marginTop: 3 }]}>
                    Scripture: {actionSermon.verse}
                  </Text>
                )}

                <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />

                <TouchableOpacity
                  style={styles.actionBtnPrimary}
                  onPress={() => {
                    const s = actionSermon;
                    setActionSermon(null);
                    handleOpenSermon(s);
                  }}
                >
                  <Icon name="play" size={18} color={C.ink} />
                  <Text style={styles.actionBtnPrimaryTxt}>Watch Sermon</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.background,
                      borderColor: colors.border,
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => {
                    const s = actionSermon;
                    setActionSermon(null);
                    handleShareSermon(s);
                  }}
                >
                  <Icon name="share" size={18} color={colors.text} />
                  <Text style={[styles.actionBtnTxt, { color: colors.text }]}>Share Message</Text>
                </TouchableOpacity>

                {!!actionSermon.notesUrl && (
                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      {
                        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.background,
                        borderColor: colors.border,
                        borderWidth: 1,
                      },
                    ]}
                    onPress={() => {
                      const url = actionSermon.notesUrl;
                      setActionSermon(null);
                      if (url) Linking.openURL(url);
                    }}
                  >
                    <Icon name="book" size={18} color={colors.text} />
                    <Text style={[styles.actionBtnTxt, { color: colors.text }]}>Read Study Notes</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    {
                      marginTop: 6,
                      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.background,
                      borderColor: colors.border,
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => setActionSermon(null)}
                >
                  <Text style={[styles.actionBtnTxt, { color: colors.textSecondary }]}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Header Menu Options Modal ── */}
      <Modal
        visible={headerMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setHeaderMenuVisible(false)}
      >
        <Pressable style={styles.actionModalBg} onPress={() => setHeaderMenuVisible(false)}>
          <Pressable
            style={[
              styles.actionModalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.actionModalTitle, { color: colors.text }]}>Sermon Options</Text>
            <View style={[styles.actionDivider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.background,
                  borderColor: colors.border,
                  borderWidth: 1,
                },
              ]}
              onPress={() => {
                setHeaderMenuVisible(false);
                onRefresh();
              }}
            >
              <Icon name="video" size={18} color={colors.text} />
              <Text style={[styles.actionBtnTxt, { color: colors.text }]}>Refresh Sermons</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.background,
                  borderColor: colors.border,
                  borderWidth: 1,
                },
              ]}
              onPress={() => {
                setHeaderMenuVisible(false);
                setIsMonthFiltered(false);
                setDay(null);
                setActiveCategory('All');
              }}
            >
              <Icon name="cal" size={18} color={colors.text} />
              <Text style={[styles.actionBtnTxt, { color: colors.text }]}>Reset All Filters</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                {
                  marginTop: 6,
                  backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.background,
                  borderColor: colors.border,
                  borderWidth: 1,
                },
              ]}
              onPress={() => setHeaderMenuVisible(false)}
            >
              <Text style={[styles.actionBtnTxt, { color: colors.textSecondary }]}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ───────────── Stylesheet ───────────── */
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  monContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
  },
  mon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  monTxt: { fontSize: 25, fontWeight: '700', letterSpacing: -0.3 },
  clearFilterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  clearFilterTxt: {
    fontSize: 12,
    fontWeight: '700',
  },

  dates: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  dp: {
    width: 52,
    height: 64,
    maxHeight: 64,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    alignSelf: 'center',
  },
  dpN: { fontSize: 18, fontWeight: '700' },
  dpW: { fontSize: 11.5, fontWeight: '600' },
  dpDot: { width: 5, height: 5, borderRadius: 2.5 },

  panel: {
    paddingHorizontal: 16,
    paddingBottom: 60,
    minHeight: 650,
    flex: 1,
  },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    maxHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 18,
    alignSelf: 'center',
  },
  chipTxt: { fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
  sum: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 16,
    marginHorizontal: 4,
    marginBottom: 4,
  },
  sumT: { fontSize: 15, fontWeight: '700' },
  sumD: { fontSize: 13, fontWeight: '500' },

  item: {
    paddingVertical: 12,
  },
  itemRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tl: { width: 46, alignItems: 'center', paddingTop: 4, paddingBottom: 2 },
  tlD: { fontSize: 23, fontWeight: '700' },
  tlM: { fontSize: 12, fontWeight: '500', marginTop: 3 },
  tlDots: {
    flex: 1,
    minHeight: 22,
    marginVertical: 6,
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  tlDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 1.75,
  },
  cardDivider: {
    marginTop: 18,
    width: '100%',
    height: 2,
    overflow: 'hidden',
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  tab: {
    paddingTop: 8,
    paddingBottom: 7,
    paddingHorizontal: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  tabTxt: { fontSize: 12, fontWeight: '800', letterSpacing: 0.1 },
  durTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
    paddingBottom: 6,
  },
  durTxt: { fontSize: 11.5, fontWeight: '700' },
  card: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    padding: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  r1: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  th: { width: 94, height: 64, borderRadius: 8, overflow: 'hidden' },
  ti: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  te: { fontSize: 12.5, fontWeight: '700', marginTop: 1 },
  sp: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  vs: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  mn: {
    alignSelf: 'center',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'center', paddingVertical: 54 },
  emptyT: { fontSize: 16, fontWeight: '700', marginTop: 14 },
  emptyS: { fontSize: 13.5, marginTop: 6, textAlign: 'center' },

  /* Month Picker Modal */
  sheetBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 22,
    paddingBottom: 36,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  allMonthsBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allMonthsTxt: {
    fontSize: 13,
  },
  yr: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  yrTxt: { fontSize: 22, fontWeight: '700' },
  yrBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mg: { gap: 10 },
  mRow: { flexDirection: 'row', gap: 10 },
  mBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mTxt: { fontSize: 15, fontWeight: '600' },
  mDot: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  /* Action Sheet Modal */
  actionModalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  actionModalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
  },
  actionModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  actionModalSub: {
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
  actionDivider: {
    height: 1,
    marginVertical: 16,
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: C.lime,
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 10,
  },
  actionBtnPrimaryTxt: {
    color: C.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 16,
    marginBottom: 8,
  },
  actionBtnTxt: {
    fontSize: 14.5,
    fontWeight: '600',
  },
});
