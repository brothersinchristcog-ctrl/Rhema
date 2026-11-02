import React, { useEffect, useState, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Share,
  Dimensions,
  Image,
  StatusBar,
  Platform,
  RefreshControl,
  Alert
} from 'react-native';
import ViewShot from 'react-native-view-shot';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, ArrowLeft, ChevronRight, Download, Share2, Calendar, Play, BookOpen, Sparkles } from 'lucide-react-native';
import * as MediaLibrary from 'expo-media-library';
import FirestoreService, { DailyPromise } from '../services/FirestoreService';
import { useChurch } from '../context/ChurchContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

const { width } = Dimensions.get('window');

// Utility to strip HTML tags
const stripHtml = (html: string | undefined): string => {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').trim();
};

export default function PromiseArchiveScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const [promises, setPromises] = useState<DailyPromise[]>([]);
  const [selectedPromise, setSelectedPromise] = useState<DailyPromise | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { activeChurch } = useChurch();
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const scrollViewRef = useRef<ScrollView>(null);
  const viewShotRef = useRef<ViewShot>(null);

  const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const fetchPromises = async () => {
    try {
      const data = await FirestoreService.getDailyPromisesArchive();
      // Ensure sorted by date descending in case Firestore returns them out of order
      const sortedData = data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPromises(sortedData);

      const today = getTodayStr();
      const todayPromise = sortedData.find(p => p.date === today);

      if (todayPromise) {
        setSelectedPromise(todayPromise);
      } else {
        setSelectedPromise(null);
      }
    } catch (error) {
      console.error('Error fetching promises:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchPromises();
  }, []);

  // Reset to Today's promise when focusing the tab
  useFocusEffect(
    React.useCallback(() => {
      const today = getTodayStr();
      const todayPromise = promises.find(p => p.date === today);
      if (todayPromise) {
        setSelectedPromise(todayPromise);
      } else {
        setSelectedPromise(null);
      }
    }, [promises])
  );

  const handleBack = () => {
    if (selectedPromise && promises.length > 0 && selectedPromise.id !== promises[0].id) {
      setSelectedPromise(promises[0]);
    } else {
      navigation.goBack();
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchPromises();
  };

  const handleShare = async (promise: DailyPromise) => {
    try {
      const verse = stripHtml(promise.verse);
      const telugu = stripHtml(promise.verseTelugu);
      const refEn = promise.verseReferenceEn || promise.verseReference || 'Bible';

      await Share.share({
        message: `Daily Promise from ${activeChurch?.name || 'Your Church'}:\n\n"${verse}"\n\n${telugu}\n\n- ${refEn}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleSaveCard = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') {
        Alert.alert('Permission Needed', 'Please grant permission to save images to your gallery.');
        return;
      }
      
      if (viewShotRef.current && viewShotRef.current.capture) {
        const uri = await viewShotRef.current.capture();
        await MediaLibrary.saveToLibraryAsync(uri);
        Alert.alert('Saved Successfully!', 'The promise card has been saved to your photo gallery.');
      }
    } catch (error) {
      console.error('Save failed:', error);
      Alert.alert('Error', 'Failed to save the image. Please try again.');
    }
  };

  const formatDisplayDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).toUpperCase();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.background} />

      {/* ── Page Header ── */}
            {/* ── Screen Header (Clean circular back button & title) ── */}
      <View
        style={[
          styles.headerRow,
          { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8 }
        ]}
      >
        <TouchableOpacity
          style={[styles.circularBackBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => handleBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          <ArrowLeft size={20} color={colors.text} strokeWidth={2.4} />
        </TouchableOpacity>

        <Text style={[styles.headerTitleText, { color: colors.text }]} numberOfLines={1}>
          {t('nav.promise')}
        </Text>

        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView 
        ref={scrollViewRef}
        style={{ flex: 1, backgroundColor: colors.background }}
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        {/* Quick Link to 4 Time-Slot Daily Verses */}
        <TouchableOpacity
          style={[styles.dailyVersesBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigation.navigate('VerseOfTheDay')}
          activeOpacity={0.85}
        >
          <View style={styles.dailyVersesBannerLeft}>
            <View style={[styles.dailyVersesBannerIcon, { backgroundColor: colors.accent }]}>
              <Sparkles size={16} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.dailyVersesBannerTitle, { color: colors.text }]}>Today's 4 Daily Verses</Text>
              <Text style={[styles.dailyVersesBannerSub, { color: colors.textSecondary }]}>Morning · Afternoon · Evening · Night</Text>
            </View>
          </View>
          <ChevronRight size={18} color={colors.accent} />
        </TouchableOpacity>

        {selectedPromise ? (
          <View style={styles.mainContent}>
            <Text style={[styles.topDate, { color: colors.textSecondary }]}>{formatDisplayDate(selectedPromise.date)}</Text>

            {/* --- Hero Card --- */}
            <View style={[styles.heroCardOuter, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
              <ViewShot ref={viewShotRef} options={{ format: 'jpg', quality: 1 }} style={[styles.heroCapture, { backgroundColor: colors.surface }]}>
                <View style={{ alignItems: 'center', marginBottom: 20 }}>
                  <Text style={{ color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 }}>
                    {activeChurch?.name?.toUpperCase() || "TODAY'S PROMISE"}
                  </Text>
                  <View style={{ height: 1.5, width: 32, backgroundColor: colors.accent, opacity: 0.45, marginTop: 10 }} />
                </View>

                <View style={styles.heroHeader}>
                  <Text style={[styles.heroRefEn, { color: colors.accent, textAlign: 'center' }]}>
                    {selectedPromise.verseReferenceEn || ''}
                    {selectedPromise.verseReferenceEn && selectedPromise.verseReferenceTe ? ' - ' : ''}
                    {selectedPromise.verseReferenceTe || (!selectedPromise.verseReferenceEn ? stripHtml(selectedPromise.verse).substring(0, 30) + '...' : '')}
                  </Text>
                </View>

                {selectedPromise.verseTelugu ? (
                  <Text style={[styles.verseTe, { color: colors.text }]}>"{stripHtml(selectedPromise.verseTelugu)}"</Text>
                ) : null}
                <Text style={[styles.verseEn, { color: selectedPromise.verseTelugu ? colors.textSecondary : colors.text }]}>"{stripHtml(selectedPromise.verse)}"</Text>
                
                <View style={{ alignItems: 'center', marginTop: 12 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '600', letterSpacing: 1, opacity: 0.75 }}>
                    {formatDisplayDate(selectedPromise.date)}
                  </Text>
                </View>
              </ViewShot>

              <View style={styles.heroActionsContainer}>
                <View style={styles.heroActions}>
                  <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: isDark ? '#18181B' : '#F8FAFC', borderColor: colors.border }]} 
                    onPress={handleSaveCard}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      <Calendar size={18} color={colors.accent} />
                      <Text style={[styles.actionBtnTxt, { color: colors.text }]}>Save card</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.actionBtn, { backgroundColor: isDark ? '#18181B' : '#F8FAFC', borderColor: colors.border }]} 
                    onPress={() => handleShare(selectedPromise)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      <Share2 size={18} color={colors.accent} />
                      <Text style={[styles.actionBtnTxt, { color: colors.text }]}>Share</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* --- Devotional Note --- */}
            <View style={[styles.reflectionBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.reflectionTitle, { color: colors.text }]}>Devotional Note</Text>
              <Text style={[styles.reflectionText, { color: colors.textSecondary }]}>
                {stripHtml(selectedPromise.devotionalNote) || "In all seasons of life — in trials, in weakness, in uncertainty — we are not alone."}
              </Text>
              <Text style={[styles.reflectionAuthor, { color: colors.accent }]}>— Pastor {selectedPromise.pastor || 'Daniel Raju'}</Text>
            </View>

            {/* --- 1-min Devotional Bar --- */}
            {selectedPromise.youtubeId && (
              <TouchableOpacity
                style={[styles.devotionalBar, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => navigation.navigate('DailyVideo', { youtubeId: selectedPromise.youtubeId, videoTitle: selectedPromise.videoTitle, pastor: selectedPromise.pastor })}
                activeOpacity={0.85}
              >
                <View style={[styles.playCircle, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}>
                  <Play size={20} color={colors.accent} fill={colors.accent} />
                </View>
                <View style={styles.devotionalInfo}>
                  <Text style={[styles.devotionalTitle, { color: colors.text }]}>Today's 1-min devotional</Text>
                  <Text style={[styles.devotionalSubTe, { color: colors.accent }]}>నేటి 1 నిమిషాల సందేశం</Text>
                  <Text style={[styles.devotionalSub, { color: colors.textSecondary }]}>
                    {selectedPromise.verseReferenceEn || selectedPromise.verseReferenceTe || 'Bible Reference'} · {selectedPromise.duration || '58 seconds'}
                  </Text>
                </View>
                <ChevronRight size={24} color={colors.accent} />
              </TouchableOpacity>
            )}
          </View>
        ) : !loading ? (
          <View style={[styles.noTodayCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.noTodayIcon, { backgroundColor: colors.background }]}>
              <BookOpen size={30} color={colors.textSecondary} />
            </View>
            <Text style={[styles.noTodayTxt, { color: colors.text }]}>No Promise Yet</Text>
            <Text style={[styles.noTodaySubTe, { color: colors.accent }]}>నేటి వాగ్దానం ఇంకా రాలేదు</Text>
            <Text style={[styles.noTodayHint, { color: colors.textSecondary }]}>Check back later today for an uplifting verse.</Text>
          </View>
        ) : null}

        <View style={styles.historySection}>
          <Text style={[styles.historyLabel, { color: colors.text }]}>Past promises</Text>
          <View style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(() => {
              const now = new Date();
              const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
              const sevenDaysAgoStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;

              const pastPromises = promises.filter(p => {
                if (!p.date) return false;
                if (p.status === 'Draft') return false;
                return p.date < todayStr && p.date >= sevenDaysAgoStr;
              });

              if (pastPromises.length === 0) {
                return (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, fontStyle: 'italic' }}>
                      No past promises available.
                    </Text>
                  </View>
                );
              }

              return pastPromises.map((item, index) => {
                const refString = `${item.verseReferenceEn || ''}${item.verseReferenceEn && item.verseReferenceTe ? ' - ' : ''}${item.verseReferenceTe || ''}` || stripHtml(item.verse).substring(0, 25) + '...';

                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => {
                      setSelectedPromise(item);
                      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                    }}
                    style={[
                      styles.historyItem,
                      { borderBottomColor: colors.border },
                      selectedPromise?.id === item.id && { backgroundColor: colors.background },
                      index === pastPromises.length - 1 && { borderBottomWidth: 0 }
                    ]}
                  >
                    <View style={styles.historyItemContent}>
                      <Text style={[styles.historyItemRef, { color: colors.text }]}>{refString}</Text>
                      <Text style={[styles.historyItemVakyam, { color: colors.textSecondary }]} numberOfLines={1}>{stripHtml(item.verseTelugu) || 'వాగ్దానము'}</Text>
                      <Text style={[styles.historyItemDate, { color: colors.accent }]}>
                        {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' })}
                      </Text>
                    </View>
                    <ChevronRight size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                );
              });
            })()}
          </View>
        </View>
        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F2' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
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
  headerCenterTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
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
  pageSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '500' },
  scroll: { paddingBottom: 140 },
  dailyVersesBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
  },
  dailyVersesBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  dailyVersesBannerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dailyVersesBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  dailyVersesBannerSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  mainContent: { padding: 16 },
  topDate: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textAlign: 'center', marginBottom: 15, letterSpacing: 0.5 },

  heroCardOuter: { borderRadius: 24, elevation: 4, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 15, overflow: 'hidden' },
  heroCapture: { padding: 24 },
  heroActionsContainer: { paddingHorizontal: 24, paddingBottom: 24 },
  heroHeader: { marginBottom: 20 },
  heroRefEn: { fontSize: 14, fontWeight: '800' },
  heroRefTe: { color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  verseEn: { fontSize: 15, fontWeight: '500', fontStyle: 'italic', textAlign: 'center', lineHeight: 24, marginBottom: 16 },
  verseTe: { fontSize: 17, fontWeight: '700', fontStyle: 'italic', textAlign: 'center', lineHeight: 28, marginBottom: 14 },

  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, justifyContent: 'center' },
  actionBtn: { flex: 1, borderWidth: 1, borderRadius: 25, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  actionBtnTxt: { fontSize: 13, fontWeight: '700' },

  reflectionBox: { backgroundColor: '#fff', borderRadius: 20, padding: 22, marginTop: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  reflectionTitle: { fontSize: 13, fontWeight: '800', color: '#111827', marginBottom: 12 },
  reflectionText: { fontSize: 14, color: '#475569', lineHeight: 24, marginBottom: 15 },
  reflectionAuthor: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },

  devotionalBar: { borderRadius: 20, padding: 16, marginTop: 15, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderWidth: 1 },
  playCircle: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  devotionalInfo: { flex: 1 },
  devotionalTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  devotionalSubTe: { fontSize: 12, marginBottom: 4, fontWeight: '600' },
  devotionalSub: { fontSize: 11, color: '#94a3b8' },

  noTodayCard: { backgroundColor: '#fff', borderRadius: 24, padding: 30, margin: 16, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  noTodayIcon: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  noTodayTxt: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' },
  noTodaySubTe: { fontSize: 14, color: '#c0392b', marginBottom: 15, fontWeight: '600', textAlign: 'center' },
  noTodayHint: { fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 18 },

  historySection: { paddingHorizontal: 16, paddingBottom: 20 },
  historyLabel: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 10, marginBottom: 15, marginLeft: 4 },
  historyCard: { backgroundColor: '#fff', borderRadius: 24, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  historyItem: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  historyItemContent: { flex: 1 },
  historyItemRef: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 },
  historyItemVakyam: { fontSize: 14, color: '#475569', marginBottom: 6, fontStyle: 'italic' },
  historyItemDate: { fontSize: 13, color: '#b45309', fontWeight: '500' },
});
