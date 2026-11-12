import React, { useState, useEffect, useContext } from 'react';
import { 
  Platform,
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator, 
  RefreshControl,
  StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, Plus, Check, ChevronLeft, Filter, X, ArrowLeft, Calendar } from 'lucide-react-native';
import { AdminTabContext } from '../../context/AdminTabContext';

import FirestoreService, { DailyPromise } from '../../services/FirestoreService';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';

const colors = {
  ink: '#202923',
  ink2: '#22304F',
  inkSoft: '#6B7593',
  parchment: '#F3EAD9',
  paper: '#FFFCF5',
  gold: '#A67C3D',
  goldDeep: '#8C6428',
  goldBright: '#D8B369',
  clay: '#A24B34',
  clayBg: '#F3E1D6',
  clayLine: '#E3C3B2',
  moss: '#3E6B52',
  mossBg: '#E6EFE7',
  rule: '#DED0AC',
};

const serifFont = Platform.OS === 'ios' ? 'Georgia' : 'serif';

export default function AdminPromiseList() {
  const { isDark, colors: adminColors, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor: adminBorderColor, appFontFamily, barStyle, scaleFont } = useAdminTheme();
  const { setActiveTab, setEditingData, setTabByName } = useContext(AdminTabContext);
  const [promises, setPromises] = useState<DailyPromise[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [missingDates, setMissingDates] = useState<number[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'published' | 'draft' | 'missing'>('all');
  
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();

  const handleEdit = (item: DailyPromise) => {
    setEditingData(item);
    setTabByName?.('New Promise');
  };

  const handleView = (item: DailyPromise) => {
    setEditingData(item);
    setTabByName?.('New Promise');
  };

  useEffect(() => {
    loadPromises();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPromises();
    setRefreshing(false);
  };

  const loadPromises = async () => {
    setLoading(true);
    try {
      const data = await FirestoreService.getDailyPromisesArchive();
      setPromises(data);
      
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const existingDates = new Set(data.map(p => p.date));
      const missing: number[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (!existingDates.has(dStr)) missing.push(d);
      }
      setMissingDates(missing);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const todayPromise = promises.find(p => p.date === todayStr);
  const upcoming = promises.filter(p => p.date && p.date > todayStr).sort((a,b) => (a.date || '').localeCompare(b.date || ''));
  const past = promises.filter(p => p.date && p.date < todayStr).sort((a,b) => (b.date || '').localeCompare(a.date || ''));

  const stats = {
    published: promises.filter(p => p.status === 'Published').length,
    draft: promises.filter(p => p.status === 'Draft').length,
    missing: missingDates.length
  };

  const publishedPromises = promises
    .filter(p => p.status === 'Published')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const draftPromises = promises
    .filter(p => p.status === 'Draft')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  if (loading && promises.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.goldBright} />
      </View>
    );
  }

  const stripHtml = (html: string) => {
    if (!html) return '';
    return html.replace(/<[^>]*>?/gm, '').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  };

  const renderCard = (item: DailyPromise, type: 'today' | 'upcoming' | 'past' | 'filtered') => {
    const isMissingTe = !item.verseTelugu;
    const isMissingLink = !item.youtubeId;

    let displayDate = item.date;
    if (item.date) {
      const parts = item.date.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        displayDate = `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
      }
    }

    const verseTextEn = stripHtml(item.verse);
    const firstChar = verseTextEn.charAt(0);
    const restChar = verseTextEn.slice(1);

    return (
      <View
        key={item.id}
        style={[
          styles.verseCard,
          {
            backgroundColor: isDark ? '#18181B' : '#FFFFFF',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0',
          },
        ]}
      >
        <View
          style={[
            styles.vcBand,
            {
              backgroundColor: isDark ? '#27272A' : '#F8FAFC',
              borderBottomWidth: 1,
              borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
            },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <Text style={[styles.vcDate, { color: isDark ? '#FFFFFF' : '#202923' }]}>{displayDate}</Text>
            {!!item.status && (
              <View style={[
                styles.statusBadgePill,
                item.status === 'Published' && { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5' },
                item.status === 'Draft' && { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7' },
                item.status === 'Scheduled' && { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE' },
              ]}>
                <Text style={[
                  styles.statusBadgeTxt,
                  item.status === 'Published' && { color: isDark ? '#34D399' : '#065F46' },
                  item.status === 'Draft' && { color: isDark ? '#FBBF24' : '#92400E' },
                  item.status === 'Scheduled' && { color: isDark ? '#60A5FA' : '#1E3A8A' },
                ]}>
                  {item.status}
                </Text>
              </View>
            )}
          </View>
          <View
            style={[
              styles.seal,
              {
                backgroundColor: isDark ? '#000000' : '#202923',
                borderColor: isDark ? '#3F3F46' : '#202923',
              },
            ]}
          >
            {type === 'upcoming' ? <Plus size={13} color="#FFFFFF" strokeWidth={2.6} /> : <Check size={13} color="#FFFFFF" strokeWidth={2.8} />}
          </View>
        </View>

        <View style={styles.vcBody}>
          <View style={[styles.vcRef, { alignItems: 'baseline' }]}>
            <Text style={{ includeFontPadding: false, textAlignVertical: 'bottom' }}>
              {(item.verseReferenceEn || item.verseReference) && (
                <Text style={{ fontSize: 13.5, color: isDark ? '#FFFFFF' : '#202923', fontWeight: '800' }}>
                  {item.verseReferenceEn || item.verseReference}
                </Text>
              )}
              {item.verseReferenceTe && (item.verseReferenceEn || item.verseReference) && (
                <Text style={{ fontSize: 13, color: isDark ? '#52525B' : '#CBD5E1', marginHorizontal: 8 }}>  |  </Text>
              )}
              {item.verseReferenceTe && (
                <Text style={{ fontSize: 13.5, color: isDark ? '#FFFFFF' : '#202923', fontWeight: '800' }}>
                  {item.verseReferenceTe}
                </Text>
              )}
            </Text>
            {(item as any).author && (
              <>
                <Text style={[styles.dot, { color: isDark ? '#71717A' : '#94A3B8' }]}>•</Text>
                <Text style={[styles.author, { color: isDark ? '#D4D4D8' : '#475569' }]}>{(item as any).author}</Text>
              </>
            )}
          </View>

          <Text style={[styles.vcQuote, { color: isDark ? '#E4E4E7' : '#334155' }]}>
            <Text style={[styles.dropCap, { color: isDark ? '#FFFFFF' : '#202923' }]}>{firstChar}</Text>
            {restChar}
          </Text>
          
          {item.verseTelugu ? (
            <Text style={[styles.vcQuoteTel, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
              {stripHtml(item.verseTelugu)}
            </Text>
          ) : null}

          <View style={[styles.vcBottom, { borderTopColor: isDark ? '#27272A' : '#F1F5F9', borderStyle: 'solid' }]}>
            <View style={styles.vcFlags}>
              <Text style={[styles.flagOn, { color: isDark ? '#34D399' : colors.moss }]}>✓ English</Text>
              <Text style={isMissingTe ? [styles.flagOff, { color: isDark ? '#71717A' : '#94A3B8' }] : [styles.flagOn, { color: isDark ? '#34D399' : colors.moss }]}>{isMissingTe ? '✗ Telugu' : '✓ Telugu'}</Text>
              <Text style={isMissingLink ? [styles.flagOff, { color: isDark ? '#71717A' : '#94A3B8' }] : [styles.flagOn, { color: isDark ? '#34D399' : colors.moss }]}>{isMissingLink ? '▶ No link' : '▶ YouTube'}</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.editBadgeBtn,
                {
                  backgroundColor: isDark ? '#000000' : '#202923',
                  borderColor: isDark ? '#3F3F46' : '#202923',
                },
              ]}
              onPress={() => type === 'past' ? handleView(item) : handleEdit(item)}
              activeOpacity={0.8}
            >
              <Text style={styles.editBadgeBtnTxt}>Edit →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // Get current date for Ribbon
  const d = new Date();
  const monthNamesShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const todayRibbonStr = `${d.getDate()} ${monthNamesShort[d.getMonth()]}`;
  const displayDateFullStr = `${d.getDate()} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()]} ${d.getFullYear()}`;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.hero, { borderBottomWidth: 1, borderBottomColor: isDark ? '#27272A' : '#E2E8F0', paddingBottom: 14, marginBottom: 4 }]}>
        <View style={styles.heroTitleRow}>
          <TouchableOpacity
            onPress={() => setTabByName?.('Dashboard')}
            style={styles.circularBackBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={22} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.2} />
          </TouchableOpacity>
          
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text
              style={[
                styles.heroTitle,
                {
                  color: isDark ? '#FFFFFF' : '#0F172A',
                  textAlign: 'center',
                  fontSize: 20,
                  fontWeight: '800',
                  fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                  letterSpacing: -0.4,
                }
              ]}
              numberOfLines={1}
            >
              Daily Promises
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.newBtn,
              {
                flexShrink: 0,
                backgroundColor: isDark ? '#FFFFFF' : '#000000',
                borderRadius: 999,
                paddingHorizontal: 13,
                paddingVertical: 7.5,
                borderWidth: 1.5,
                borderColor: isDark ? '#FFFFFF' : '#000000',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
              }
            ]}
            onPress={() => { setEditingData(null); setTabByName?.('New Promise'); }}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.newBtnTxt,
                {
                  color: isDark ? '#000000' : '#FFFFFF',
                  fontWeight: '800',
                  fontSize: 12,
                }
              ]}
              numberOfLines={1}
            >
              + New Promise
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.content}>
          <View style={styles.stats}>
            {/* 1. Published Card */}
            <TouchableOpacity 
              style={[
                styles.statBox, 
                {
                  backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                  borderColor: activeFilter === 'published'
                    ? (isDark ? '#34D399' : colors.moss)
                    : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(62, 107, 82, 0.22)'),
                  borderWidth: activeFilter === 'published' ? 1.8 : 1,
                  paddingVertical: 0,
                  overflow: 'hidden',
                }
              ]}
              onPress={() => setActiveFilter(prev => prev === 'published' ? 'all' : 'published')}
              activeOpacity={0.75}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ['rgba(52, 211, 153, 0.14)', 'rgba(39, 39, 42, 0.55)', 'rgba(15, 15, 18, 0.90)']
                    : ['#FFFFFF', '#F7FCF9', '#ECFDF5']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statGlassInner}
              >
                <View style={[styles.statNotch, { backgroundColor: isDark ? '#34D399' : colors.moss }]} />
                <Text style={[styles.num, { color: isDark ? '#34D399' : colors.moss }]}>{stats.published}</Text>
                <View style={styles.statLabelRow}>
                  <Text style={[styles.statLabel, { color: isDark ? '#E4E4E7' : colors.inkSoft }, activeFilter === 'published' && { color: isDark ? '#34D399' : colors.moss }]}>Published</Text>
                  {activeFilter === 'published' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#34D399' : colors.moss }]} />}
                </View>
                <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>{activeFilter === 'published' ? 'Active ✓' : 'Tap to view'}</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* 2. Drafts Card */}
            <TouchableOpacity 
              style={[
                styles.statBox, 
                {
                  backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                  borderColor: activeFilter === 'draft'
                    ? (isDark ? '#FBBF24' : colors.goldDeep)
                    : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(166, 124, 61, 0.24)'),
                  borderWidth: activeFilter === 'draft' ? 1.8 : 1,
                  paddingVertical: 0,
                  overflow: 'hidden',
                }
              ]}
              onPress={() => setActiveFilter(prev => prev === 'draft' ? 'all' : 'draft')}
              activeOpacity={0.75}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ['rgba(251, 191, 36, 0.14)', 'rgba(39, 39, 42, 0.55)', 'rgba(15, 15, 18, 0.90)']
                    : ['#FFFFFF', '#FFFDF7', '#FEF3C7']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statGlassInner}
              >
                <View style={[styles.statNotch, { backgroundColor: isDark ? '#FBBF24' : colors.gold }]} />
                <Text style={[styles.num, { color: isDark ? '#FBBF24' : colors.goldDeep }]}>{stats.draft}</Text>
                <View style={styles.statLabelRow}>
                  <Text style={[styles.statLabel, { color: isDark ? '#E4E4E7' : colors.inkSoft }, activeFilter === 'draft' && { color: isDark ? '#FBBF24' : colors.goldDeep }]}>Drafts</Text>
                  {activeFilter === 'draft' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#FBBF24' : colors.goldDeep }]} />}
                </View>
                <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>{activeFilter === 'draft' ? 'Active ✓' : 'Tap to view'}</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* 3. Missing Card */}
            <TouchableOpacity 
              style={[
                styles.statBox, 
                {
                  backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                  borderColor: activeFilter === 'missing'
                    ? (isDark ? '#F87171' : colors.clay)
                    : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(162, 75, 52, 0.22)'),
                  borderWidth: activeFilter === 'missing' ? 1.8 : 1,
                  paddingVertical: 0,
                  overflow: 'hidden',
                }
              ]}
              onPress={() => setActiveFilter(prev => prev === 'missing' ? 'all' : 'missing')}
              activeOpacity={0.75}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ['rgba(248, 113, 113, 0.14)', 'rgba(39, 39, 42, 0.55)', 'rgba(15, 15, 18, 0.90)']
                    : ['#FFFFFF', '#FFF9F8', '#FEE2E2']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.statGlassInner}
              >
                <View style={[styles.statNotch, { backgroundColor: isDark ? '#F87171' : colors.clay }]} />
                <Text style={[styles.num, { color: isDark ? '#F87171' : colors.clay }]}>{stats.missing}</Text>
                <View style={styles.statLabelRow}>
                  <Text style={[styles.statLabel, { color: isDark ? '#E4E4E7' : colors.inkSoft }, activeFilter === 'missing' && { color: isDark ? '#F87171' : colors.clay }]}>Missing</Text>
                  {activeFilter === 'missing' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#F87171' : colors.clay }]} />}
                </View>
                <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>{activeFilter === 'missing' ? 'Active ✓' : 'Tap to view'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Active Filter Indicator Bar */}
          {activeFilter !== 'all' && (
            <View style={styles.filterBanner}>
              <View style={styles.filterBannerLeft}>
                <Filter size={14} color={
                  activeFilter === 'published' ? colors.moss :
                  activeFilter === 'draft' ? colors.goldDeep :
                  colors.clay
                } />
                <Text style={styles.filterBannerTxt}>
                  Showing <Text style={{ fontWeight: '800', color: 
                    activeFilter === 'published' ? colors.moss :
                    activeFilter === 'draft' ? colors.goldDeep :
                    colors.clay
                  }}>
                    {activeFilter === 'published' ? `Published Promises (${publishedPromises.length})` :
                     activeFilter === 'draft' ? `Draft Promises (${draftPromises.length})` :
                     `Missing Dates (${missingDates.length})`}
                  </Text>
                </Text>
              </View>
              <TouchableOpacity style={styles.clearFilterBtn} onPress={() => setActiveFilter('all')} activeOpacity={0.7}>
                <X size={12} color="#475569" />
                <Text style={styles.clearFilterBtnTxt}>Show All</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Filtered View: Published */}
          {activeFilter === 'published' && (
            <View>
              {publishedPromises.length > 0 ? (
                publishedPromises.map(item => renderCard(item, 'filtered'))
              ) : (
                <View style={[styles.premiumEmptyOuter, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0' }]}>
                  <LinearGradient
                    colors={isDark ? ['rgba(255, 255, 255, 0.06)', 'rgba(24, 24, 27, 0.92)'] : ['#FFFFFF', '#F8FAFC']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.premiumEmptyInner}
                  >
                    <View style={[styles.premiumEmptyIconCircle, { backgroundColor: isDark ? '#27272A' : '#F1F5F9', borderColor: isDark ? '#3F3F46' : '#E2E8F0' }]}>
                      <Calendar size={20} color={isDark ? '#FFFFFF' : '#202923'} strokeWidth={2} />
                    </View>
                    <Text style={[styles.premiumEmptyText, { color: isDark ? '#A1A1AA' : '#475569' }]}>No published promises found.</Text>
                    <TouchableOpacity
                      style={[styles.premiumScheduleBtn, { backgroundColor: isDark ? '#000000' : '#202923', borderColor: isDark ? '#3F3F46' : '#202923' }]}
                      onPress={() => { setEditingData(null); setTabByName?.('New Promise'); }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.premiumScheduleBtnTxt}>+ Create Promise</Text>
                    </TouchableOpacity>
                  </LinearGradient>
                </View>
              )}
            </View>
          )}

          {/* Filtered View: Drafts */}
          {activeFilter === 'draft' && (
            <View>
              {draftPromises.length > 0 ? (
                draftPromises.map(item => renderCard(item, 'filtered'))
              ) : (
                <View style={[styles.premiumEmptyOuter, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0' }]}>
                  <LinearGradient
                    colors={isDark ? ['rgba(255, 255, 255, 0.06)', 'rgba(24, 24, 27, 0.92)'] : ['#FFFFFF', '#F8FAFC']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.premiumEmptyInner}
                  >
                    <View style={[styles.premiumEmptyIconCircle, { backgroundColor: isDark ? '#27272A' : '#F1F5F9', borderColor: isDark ? '#3F3F46' : '#E2E8F0' }]}>
                      <Calendar size={20} color={isDark ? '#FFFFFF' : '#202923'} strokeWidth={2} />
                    </View>
                    <Text style={[styles.premiumEmptyText, { color: isDark ? '#A1A1AA' : '#475569' }]}>No draft promises found. All promises are published or scheduled.</Text>
                    <TouchableOpacity
                      style={[styles.premiumScheduleBtn, { backgroundColor: isDark ? '#000000' : '#202923', borderColor: isDark ? '#3F3F46' : '#202923' }]}
                      onPress={() => { setEditingData(null); setTabByName?.('New Promise'); }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.premiumScheduleBtnTxt}>+ Create Draft</Text>
                    </TouchableOpacity>
                  </LinearGradient>
                </View>
              )}
            </View>
          )}

          {/* Filtered View: Missing */}
          {activeFilter === 'missing' && (
            <View>
              <View style={[styles.premiumNoticeOuter, { borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0', backgroundColor: isDark ? '#18181B' : '#FFFFFF' }]}>
                <LinearGradient
                  colors={isDark ? ['rgba(255, 255, 255, 0.08)', 'rgba(39, 39, 42, 0.50)', 'rgba(18, 18, 21, 0.90)'] : ['#FFFFFF', '#F8FAFC', '#F1F5F9']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.premiumNoticeInner}
                >
                  <View style={[styles.premiumNoticeIconWrap, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9', borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0' }]}>
                    <AlertCircle size={20} color={isDark ? '#FBBF24' : '#0F172A'} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={[styles.premiumNoticeTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                        {missingDates.length} days need daily promises
                      </Text>
                      <View style={[styles.premiumNoticeBadge, { backgroundColor: isDark ? '#000000' : '#0F172A', borderColor: isDark ? '#3F3F46' : '#0F172A' }]}>
                        <Text style={styles.premiumNoticeBadgeTxt}>QUEUE</Text>
                      </View>
                    </View>
                    <Text style={[styles.premiumNoticeSub, { color: isDark ? '#A1A1AA' : '#475569' }]}>
                      Tap any date below to open the promise editor and schedule it immediately.
                    </Text>
                  </View>
                </LinearGradient>
              </View>

              <View style={styles.missingHead}>
                <Text style={[styles.missingTitle, { color: isDark ? '#C6A66B' : '#98713D', fontSize: 18, fontWeight: '800' }]}>All Missing Dates ({missingDates.length})</Text>
                {missingDates.length > 0 && (
                  <TouchableOpacity
                    style={[styles.fillAll, { backgroundColor: isDark ? '#18181B' : '#202923', borderColor: isDark ? '#3F3F46' : '#202923' }]}
                    onPress={() => {
                      const now = new Date();
                      const dStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(missingDates[0]).padStart(2, '0')}`;
                      setEditingData({ date: dStr });
                      setTabByName?.('New Promise');
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.fillAllTxt}>+ Fill First ({missingDates[0]})</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.missingGrid}>
                {missingDates.map(d => {
                  const monthStr = monthNamesShort[(new Date()).getMonth()];
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.missingCell,
                        {
                          backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                          borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0',
                        },
                      ]}
                      onPress={() => { 
                        const now = new Date();
                        const dStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                        setEditingData({ date: dStr }); 
                        setTabByName?.('New Promise'); 
                      }}
                      activeOpacity={0.78}
                    >
                      <LinearGradient
                        colors={isDark ? ['rgba(198, 166, 107, 0.10)', 'rgba(24, 24, 27, 0.92)'] : ['#FFFFFF', '#FAF8F5']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.missingCellInner}
                      >
                        <Text style={[styles.missingMonthTxt, { color: isDark ? '#C6A66B' : '#98713D' }]}>{monthStr}</Text>
                        <Text style={[styles.missingDay, { color: isDark ? '#F2F0E8' : '#202923' }]}>{d}</Text>
                        <View
                          style={[
                            styles.missingAddPill,
                            {
                              backgroundColor: isDark ? 'rgba(198, 166, 107, 0.16)' : 'rgba(152, 113, 61, 0.10)',
                              borderColor: isDark ? 'rgba(198, 166, 107, 0.35)' : 'rgba(152, 113, 61, 0.25)',
                            },
                          ]}
                        >
                          <Text style={[styles.missingAdd, { color: isDark ? '#C6A66B' : '#98713D' }]}>+ Add</Text>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Default / Standard View: All */}
          {activeFilter === 'all' && (
            <>
              {missingDates.length > 0 && (
                <View style={[styles.premiumNoticeOuter, { borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0', backgroundColor: isDark ? '#18181B' : '#FFFFFF' }]}>
                  <LinearGradient
                    colors={isDark ? ['rgba(255, 255, 255, 0.08)', 'rgba(39, 39, 42, 0.50)', 'rgba(18, 18, 21, 0.90)'] : ['#FFFFFF', '#F8FAFC', '#F1F5F9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.premiumNoticeInner}
                  >
                    <View style={[styles.premiumNoticeIconWrap, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9', borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0' }]}>
                      <AlertCircle size={20} color={isDark ? '#FBBF24' : '#0F172A'} strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={[styles.premiumNoticeTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                          {missingDates.length} days are still empty
                        </Text>
                        <View style={[styles.premiumNoticeBadge, { backgroundColor: isDark ? '#000000' : '#0F172A', borderColor: isDark ? '#3F3F46' : '#0F172A' }]}>
                          <Text style={styles.premiumNoticeBadgeTxt}>QUEUE</Text>
                        </View>
                      </View>
                      <Text style={[styles.premiumNoticeSub, { color: isDark ? '#A1A1AA' : '#475569' }]}>
                        Nothing is scheduled for the dates below. Fill them in before the queue catches up.
                      </Text>
                    </View>
                  </LinearGradient>
                </View>
              )}

              <View style={styles.sectionTitleRow}>
                <Text style={[styles.todayHeadingText, { color: isDark ? '#F2F0E8' : '#202923' }]}>Today</Text>
              </View>
              {todayPromise ? renderCard(todayPromise, 'today') : (
                <View style={[styles.premiumEmptyOuter, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0' }]}>
                  <LinearGradient
                    colors={isDark ? ['rgba(255, 255, 255, 0.06)', 'rgba(39, 39, 42, 0.45)', 'rgba(24, 24, 27, 0.92)'] : ['#FFFFFF', '#F8FAFC', '#F1F5F9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.premiumEmptyInner}
                  >
                    <View style={[styles.premiumEmptyIconCircle, { backgroundColor: isDark ? '#27272A' : '#F1F5F9', borderColor: isDark ? '#3F3F46' : '#E2E8F0' }]}>
                      <Calendar size={20} color={isDark ? '#F2F0E8' : '#202923'} strokeWidth={2.2} />
                    </View>
                    <Text
                      style={[styles.premiumEmptyTitle, { color: isDark ? '#F2F0E8' : '#202923', width: '100%', textAlign: 'center' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.85}
                    >
                      No Promise Scheduled
                    </Text>
                    <Text
                      style={[styles.premiumEmptyText, { color: isDark ? '#A1A1AA' : '#475569', width: '100%' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                    >
                      Pending for <Text style={[styles.dateTag, { color: isDark ? '#F2F0E8' : '#202923' }]}>{displayDateFullStr}</Text>
                    </Text>
                    <TouchableOpacity
                      style={[styles.premiumScheduleBtn, { backgroundColor: isDark ? '#000000' : '#202923', borderColor: isDark ? '#3F3F46' : '#202923' }]}
                      onPress={() => { setEditingData({ date: todayStr }); setTabByName?.('New Promise'); }}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.premiumScheduleBtnTxt}>+ Schedule today's promise</Text>
                    </TouchableOpacity>
                  </LinearGradient>
                </View>
              )}

              <View style={styles.sectionTitleRow}>
                <Text style={[styles.todayHeadingText, { color: isDark ? '#B9C8BD' : '#315C50' }]}>Upcoming</Text>
              </View>
              {upcoming.length > 0 ? (
                upcoming.slice(0, 10).map(item => renderCard(item, 'upcoming'))
              ) : (
                <View style={[styles.premiumEmptyOuter, { backgroundColor: isDark ? '#18181B' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0' }]}>
                  <LinearGradient
                    colors={isDark ? ['rgba(255, 255, 255, 0.06)', 'rgba(24, 24, 27, 0.92)'] : ['#FFFFFF', '#F8FAFC']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.premiumEmptyInner}
                  >
                    <Text style={[styles.premiumEmptyText, { color: isDark ? '#A1A1AA' : '#475569', marginBottom: 0 }]}>
                      No upcoming promises scheduled yet.
                    </Text>
                  </LinearGradient>
                </View>
              )}

              <View style={styles.missingHead}>
                <Text style={[styles.missingTitle, { color: isDark ? '#C6A66B' : '#98713D', fontSize: 18, fontWeight: '800' }]}>Missing dates ({missingDates.length})</Text>
                <TouchableOpacity
                  style={[styles.fillAll, { backgroundColor: isDark ? '#18181B' : '#202923', borderColor: isDark ? '#3F3F46' : '#202923' }]}
                  onPress={() => setActiveFilter('missing')}
                  activeOpacity={0.8}
                >
                  <Text style={styles.fillAllTxt}>View all ({missingDates.length}) →</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.missingGrid}>
                {missingDates.slice(0, 6).map(d => {
                  const monthStr = monthNamesShort[(new Date()).getMonth()];
                  return (
                    <TouchableOpacity
                      key={d}
                      style={[
                        styles.missingCell,
                        {
                          backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                          borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : '#E2E8F0',
                        },
                      ]}
                      onPress={() => { 
                        const now = new Date();
                        const dStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                        setEditingData({ date: dStr }); 
                        setTabByName?.('New Promise'); 
                      }}
                      activeOpacity={0.78}
                    >
                      <LinearGradient
                        colors={isDark ? ['rgba(198, 166, 107, 0.10)', 'rgba(24, 24, 27, 0.92)'] : ['#FFFFFF', '#FAF8F5']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.missingCellInner}
                      >
                        <Text style={[styles.missingMonthTxt, { color: isDark ? '#C6A66B' : '#98713D' }]}>{monthStr}</Text>
                        <Text style={[styles.missingDay, { color: isDark ? '#F2F0E8' : '#202923' }]}>{d}</Text>
                        <View
                          style={[
                            styles.missingAddPill,
                            {
                              backgroundColor: isDark ? 'rgba(198, 166, 107, 0.16)' : 'rgba(152, 113, 61, 0.10)',
                              borderColor: isDark ? 'rgba(198, 166, 107, 0.35)' : 'rgba(152, 113, 61, 0.25)',
                            },
                          ]}
                        >
                          <Text style={[styles.missingAdd, { color: isDark ? '#C6A66B' : '#98713D' }]}>+ Add</Text>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.sectionTitleRow}>
                <Text style={[styles.todayHeadingText, { color: isDark ? '#FFFFFF' : '#202923' }]}>Past Promises</Text>
              </View>
              {past.slice(0, 5).map(item => renderCard(item, 'past'))}
            </>
          )}

          <Text style={styles.footerBranding}>Church Admin · Daily Promise Manager</Text>
          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => { setEditingData(null); setTabByName?.('New Promise'); }}>
        <Plus size={32} color={colors.ink} strokeWidth={3} />
      </TouchableOpacity>
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  circularBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: { flex: 1, backgroundColor: colors.parchment },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.parchment },

  scroll: { paddingBottom: 20 },
  
  // Hero
  hero: { 
    backgroundColor: 'transparent', 
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    marginBottom: 6,
    overflow: 'visible',
    position: 'relative'
  },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 },
  heroTitle: { color: '#1a2d5a', fontSize: 20, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '800', letterSpacing: -0.4, marginBottom: 0 },
  newBtn: { backgroundColor: '#000000', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
  newBtnTxt: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  content: { paddingHorizontal: 16 },

  // Original Centered Stat Cards with Refined Glassmorphism
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18, marginTop: 12 },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    borderWidth: 1,
    borderColor: '#E2E8F0',
    position: 'relative',
  },
  statGlassInner: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    position: 'relative',
  },
  statNotch: { position: 'absolute', top: -1, width: 32, height: 3.5, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  num: { fontFamily: serifFont, fontSize: 25, fontWeight: '700', marginBottom: 2 },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 1.1, color: colors.inkSoft, fontWeight: '700' },
  activeIndicatorDot: { width: 6, height: 6, borderRadius: 3 },
  statHintTxt: { fontSize: 8.5, color: '#94A3B8', fontWeight: '600', marginTop: 2, letterSpacing: 0.3 },

  // Filter Banner
  filterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(26, 45, 90, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  filterBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  filterBannerTxt: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '500',
  },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  clearFilterBtnTxt: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '700',
  },

  // Premium Notice Card (replaces old red alert card)
  premiumNoticeOuter: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 22,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  premiumNoticeInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  premiumNoticeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  premiumNoticeTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  premiumNoticeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 999,
    borderWidth: 1,
  },
  premiumNoticeBadgeTxt: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.6,
  },
  premiumNoticeSub: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
  },

  // Sections (Today, Upcoming, Past Promises)
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 8 },
  todayHeadingText: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
  },

  // Redesigned Today / Empty Card
  premiumEmptyOuter: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 24,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  premiumEmptyInner: {
    paddingHorizontal: 14,
    paddingVertical: 20,
    alignItems: 'center',
  },
  premiumEmptyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  premiumEmptyTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  premiumEmptyText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 16,
  },
  dateTag: { fontFamily: serifFont, fontWeight: '700' },
  premiumScheduleBtn: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 999,
    borderWidth: 1,
  },
  premiumScheduleBtnTxt: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // Missing Dates
  missingHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  missingTitle: { fontFamily: serifFont, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  fillAll: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  fillAllTxt: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  missingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 30 },
  missingCell: {
    width: '31%',
    borderWidth: 1,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  missingCellInner: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 8,
  },
  missingMonthTxt: { fontSize: 9.5, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 2 },
  missingDay: { fontFamily: serifFont, fontSize: 21, fontWeight: '800', marginBottom: 6 },
  missingAddPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  missingAdd: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },

  // Redesigned Verse Card
  verseCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  vcBand: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vcDate: { fontSize: 13.5, fontWeight: '800', letterSpacing: -0.2 },
  seal: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  statusBadgePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
  },
  statusBadgeTxt: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  vcBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  vcRef: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  dot: { fontSize: 9 },
  author: { fontSize: 11, fontWeight: '700' },
  vcQuote: { fontFamily: serifFont, fontStyle: 'italic', fontSize: 14, lineHeight: 21, marginBottom: 8, paddingBottom: 4 },
  dropCap: { fontFamily: serifFont, fontSize: 26, fontWeight: '700' },
  vcQuoteTel: { fontStyle: 'italic', fontSize: 12.5, lineHeight: 19, marginBottom: 12 },
  vcBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1 },
  vcFlags: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  flagOn: { fontSize: 10.5, fontWeight: '700' },
  flagOff: { fontSize: 10.5, fontWeight: '600' },
  editBadgeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  editBadgeBtnTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  footerBranding: { textAlign: 'center', paddingTop: 20, paddingBottom: 8, fontSize: 11, letterSpacing: 0.8, color: '#B3A67E', textTransform: 'uppercase', fontWeight: '600' },

  fab: { position: 'absolute', bottom: 90, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.goldBright, justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#8C6428', shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' }
}));
