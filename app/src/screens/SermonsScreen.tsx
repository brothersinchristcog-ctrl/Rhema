import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  SectionList,
  Dimensions,
  Platform,
  Image
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { 
  ArrowLeft, 
  Play, 
  ChevronDown,
  ChevronRight,
  BookOpen,
  Layers
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import FirestoreService, { Sermon } from '../services/FirestoreService';
import { formatSermonDuration, isSermonVisibleToMembers, formatDateDisplay } from '../utils/DateUtils';

const { width } = Dimensions.get('window');

const extractYoutubeId = (url: string) => {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.trim();
  const match = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]+)/);
  return match ? match[1] : cleanUrl;
};

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

const CATEGORY_COLORS: Record<string, string> = {
  'Bible Study':              '#1a2d5a',
  "Women's Fasting Prayer":   '#be185d',
  'Second Saturday Prayer':   '#7c3aed',
  'Sunday Service':           '#0369a1',
  'All-Night Prayer':         '#1d4ed8',
  'Youth Meeting':            '#15803d',
  'Revival Meeting':          '#b45309',
  'Special Messages':         '#c0392b',
  'Shorts':                   '#d97706',
  'Testimonies':              '#047857',
  'Uncategorized':            '#64748b',
};

const DYNAMIC_PALETTE = ['#1a2d5a', '#be185d', '#7c3aed', '#0369a1', '#1d4ed8', '#15803d', '#b45309', '#c0392b', '#047857', '#0f766e', '#4338ca'];

const getCategoryColor = (cat: string) => {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat];
  let hash = 0;
  for (let i = 0; i < cat.length; i++) hash = cat.charCodeAt(i) + ((hash << 5) - hash);
  return DYNAMIC_PALETTE[Math.abs(hash) % DYNAMIC_PALETTE.length];
};

export default function SermonsScreen({ navigation }: any) {
  const { isDark, toggleTheme, colors } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [activeCategory, setActiveCategory] = useState('All');
  const [categoryList, setCategoryList] = useState<string[]>(ALL_CATEGORIES);
  const [sermons, setSermons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  const getCategoryLabel = (cat: string) => {
    if (!cat) return '';
    const normalized = cat.trim().toLowerCase().replace(/['’]/g, '');
    switch (normalized) {
      case 'all':
        return t('sermons.categories.all');
      case 'bible study':
        return t('sermons.categories.bibleStudy');
      case 'womens fasting prayer':
      case 'women fasting prayer':
        return t('sermons.categories.womensFastingPrayer');
      case 'second saturday prayer':
        return t('sermons.categories.secondSaturdayPrayer');
      case 'sunday service':
        return t('sermons.categories.sundayService');
      case 'all-night prayer':
      case 'all night prayer':
        return t('sermons.categories.allNightPrayer');
      case 'youth meeting':
        return t('sermons.categories.youthMeeting');
      case 'revival meeting':
        return t('sermons.categories.revivalMeeting');
      case 'special messages':
      case 'special message':
        return t('sermons.categories.specialMessages');
      case 'shorts':
      case 'short':
        return t('sermons.categories.shorts');
      case 'testimonies':
      case 'testimony':
        return t('sermons.categories.testimonies');
      case 'uncategorized':
        return t('sermons.categories.uncategorized');
      default:
        return cat;
    }
  };

  const fetchSermons = async () => {
    try {
      const [data, serverCats] = await Promise.all([
        FirestoreService.getSermons(64),
        FirestoreService.getSermonCategories().catch(() => [])
      ]);
      
      const visibleSermons = (data || []).filter((s: any) => isSermonVisibleToMembers(s));
      setSermons(visibleSermons);

      // Extract categories from loaded sermons
      const sermonCats: string[] = [];
      visibleSermons.forEach((s: any) => {
        if (typeof s.categories === 'string' && s.categories.trim()) {
          s.categories.split(';').forEach((c: string) => {
            const trimmed = c.trim();
            if (trimmed && !sermonCats.includes(trimmed)) sermonCats.push(trimmed);
          });
        } else if (Array.isArray(s.categories)) {
          s.categories.forEach((c: string) => {
            const trimmed = typeof c === 'string' ? c.trim() : '';
            if (trimmed && !sermonCats.includes(trimmed)) sermonCats.push(trimmed);
          });
        }
      });

      const merged = ['All'];
      const addCat = (c: string) => {
        if (c && c !== 'All' && c !== 'Uncategorized' && !merged.includes(c)) {
          merged.push(c);
        }
      };
      ALL_CATEGORIES.forEach(addCat);
      serverCats.forEach(addCat);
      sermonCats.forEach(addCat);
      merged.push('Uncategorized');

      setCategoryList(merged);
    } catch (error) {
      console.error('Error fetching sermons:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchSermons(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchSermons(); };

  const toggleSection = (cat: string) => {
    setCollapsedSections(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  // Build grouped sections
  const buildSections = () => {
    const filtered = activeCategory === 'All' ? sermons : sermons.filter(s => {
      let catsArray: string[] = [];
      if (typeof s.categories === 'string' && s.categories.trim().length > 0) {
        catsArray = s.categories.split(';').map((c: string) => c.trim()).filter(Boolean);
      } else if (Array.isArray(s.categories)) {
        catsArray = s.categories;
      }
      
      if (activeCategory === 'Uncategorized') return catsArray.length === 0;
      return catsArray.includes(activeCategory);
    });

    if (activeCategory !== 'All') {
      return [{ title: activeCategory, data: filtered }];
    }

    // Group by ALL categories
    const grouped: Record<string, any[]> = {};
    filtered.forEach(sermon => {
      let cats: string[] = [];
      if (typeof sermon.categories === 'string' && sermon.categories.trim().length > 0) {
        cats = sermon.categories.split(';').map((c: string) => c.trim()).filter(Boolean);
      } else if (Array.isArray(sermon.categories) && sermon.categories.length > 0) {
        cats = sermon.categories;
      }
      
      if (cats.length === 0) cats = ['Uncategorized'];

      cats.forEach((cat: string) => {
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(sermon);
      });
    });

    // Sort categories in defined order
    return categoryList.filter(c => c !== 'All' && grouped[c]?.length > 0)
      .map(cat => ({ title: cat, data: grouped[cat] }));
  };

  const sections = buildSections();

  const renderSermonItem = (item: any) => {
    const cleanYId = extractYoutubeId(item.youtubeId || '');
    const thumbUri = item.thumbnailUrl || item.imageUrl || (cleanYId && cleanYId.length === 11 ? `https://img.youtube.com/vi/${cleanYId}/hqdefault.jpg` : null);

    return (
      <TouchableOpacity 
        style={[styles.sermonCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => navigation.navigate('SermonVideo', { 
          sermonData: item
        })}
      >
        <View style={[styles.scThumb, { backgroundColor: isDark ? '#18181B' : '#E2E8F0', overflow: 'hidden' }]}>
          {thumbUri ? (
            <Image source={{ uri: thumbUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          ) : null}
          <View style={styles.playOverlay}>
            <Play size={16} color="#fff" fill="#c0392b" />
          </View>
        </View>
      <View style={styles.scInfo}>
        <Text style={[styles.scTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title}{item.titleTelugu ? ` · ${item.titleTelugu}` : ''}
        </Text>
        <Text style={[styles.scMeta, { color: colors.textSecondary }]}>
          {item.pastor || t('sermons.pastor')} · {formatDateDisplay(item.date) || 'N/A'}{formatSermonDuration(item.duration) ? ` · ${formatSermonDuration(item.duration)}` : ''}
        </Text>
        {item.scripture ? (
          <View style={[styles.scriptureTag, { backgroundColor: isDark ? 'rgba(124, 58, 237, 0.15)' : '#f5f3ff' }]}>
            <BookOpen size={10} color={isDark ? '#A78BFA' : '#7c3aed'} />
            <Text style={[styles.scriptureTagTxt, { color: isDark ? '#A78BFA' : '#7c3aed' }]}>{item.scripture}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

  const renderSectionHeader = (title: string) => {
    const isCollapsed = collapsedSections[title];
    const color = getCategoryColor(title);
    const count = sections.find(s => s.title === title)?.data.length || 0;
    const countLabel = count === 1 ? t('sermons.sermonCountSingular') : t('sermons.sermonsCountPlural');
    return (
      <TouchableOpacity
        style={[
          styles.sectionHeader, 
          { 
            borderLeftColor: color, 
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: 1,
            borderLeftWidth: 4,
          }
        ]}
        onPress={() => toggleSection(title)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: isDark ? colors.text : color }]}>{getCategoryLabel(title)}</Text>
          <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>{count} {countLabel}</Text>
        </View>
        {isCollapsed
          ? <ChevronRight size={18} color={isDark ? colors.text : color} />
          : <ChevronDown size={18} color={isDark ? colors.text : color} />
        }
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent || "#FCD34D"} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.barStyle || (isDark ? 'light-content' : 'dark-content')} backgroundColor={colors.background} />
      
      {/* ── Screen Header (Clean circular back button & title) ── */}
      <View
        style={[
          styles.headerRow,
          { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8 }
        ]}
      >
        <TouchableOpacity
          style={[styles.circularBackBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          <ArrowLeft size={20} color={colors.text} strokeWidth={2.4} />
        </TouchableOpacity>

        <Text style={[styles.headerTitleText, { color: colors.text }]} numberOfLines={1}>
          Sermons
        </Text>

        <View style={styles.headerRightSpacer} />
      </View>

      {/* Category Filter Pills */}
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {categoryList.map(cat => (
            <TouchableOpacity 
              key={cat} 
              style={[
                styles.pill,
                { backgroundColor: colors.surface, borderColor: colors.border },
                activeCategory === cat && { backgroundColor: getCategoryColor(cat), borderColor: getCategoryColor(cat) }
              ]}
              onPress={() => setActiveCategory(cat)}
            >
              <Text style={[styles.pillText, { color: colors.textSecondary }, activeCategory === cat && { color: '#fff' }]}>{getCategoryLabel(cat)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Sermons Grouped by Category */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent || "#527C78"} />}
      >
        {sections.length === 0 ? (
          <View style={styles.emptyState}>
            <Layers size={48} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>{t('sermons.noSermonsFound')}</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>{t('sermons.pullToRefresh')}</Text>
          </View>
        ) : (
          sections.map(section => {
            const isCollapsed = collapsedSections[section.title];
            return (
              <View key={section.title} style={styles.sectionBlock}>
                {renderSectionHeader(section.title)}
                {!isCollapsed && section.data.map(item => (
                  <View key={item.id}>
                    {renderSermonItem(item)}
                  </View>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 15, fontWeight: '600' },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  circularBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  headerTitleText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  headerRightSpacer: {
    width: 44,
    height: 44,
  },
  headerSub: { color: '#aac4e8', fontSize: 11, marginTop: 2 },
  themeToggle: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  themeToggleText: { color: '#fff', fontSize: 16 },

  filterSection: { paddingVertical: 12 },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  pillText: { fontSize: 12, fontWeight: '600' },

  sectionBlock: { marginBottom: 4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderLeftWidth: 4,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
  },
  sectionTitle: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  sectionCount: { fontSize: 11, fontWeight: '500', marginTop: 2 },

  sermonCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    gap: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    borderWidth: 1,
  },
  scThumb: {
    width: 80,
    height: 56,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden'
  },
  playOverlay: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  scInfo: { flex: 1 },
  scTitle: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  scMeta: { fontSize: 10, marginTop: 5, lineHeight: 14 },
  scriptureTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    backgroundColor: '#f5f3ff',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  scriptureTagTxt: { fontSize: 9, fontWeight: '700', color: '#7c3aed' },

  emptyState: { alignItems: 'center', paddingVertical: 80 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 16 },
  emptySub: { fontSize: 13, marginTop: 6 },
});
