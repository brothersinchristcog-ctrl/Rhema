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
import { ChevronLeft, ArrowLeft, ChevronRight, Download, Share2, Calendar, Play, BookOpen } from 'lucide-react-native';
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
    <View style={[styles.container, { backgroundColor: '#FAF7F2' }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAF7F2" />

      {/* ── Page Header ── */}
      <View
        style={[
          styles.headerCardWrapper,
          { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 6 }
        ]}
      >
        <LinearGradient 
          colors={['#527C78', '#355B56']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pageHeader}
        >
          <View style={styles.headerDecoCircle1} pointerEvents="none" />
          <View style={styles.headerDecoCircle2} pointerEvents="none" />

          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.8}
          >
            <ArrowLeft size={20} color="#355B56" />
          </TouchableOpacity>
          
          <View style={styles.headerCenterTitleWrap} pointerEvents="none">
            <Text style={styles.pageTitle} numberOfLines={1} maxFontSizeMultiplier={1.15}>
              {t('nav.promise')}
            </Text>
            <View style={styles.headerTitleAccentBar} />
          </View>

          <View style={styles.headerRightIconBadge}>
            <BookOpen size={18} color="#355B56" />
          </View>
        </LinearGradient>
      </View>

      <ScrollView 
        ref={scrollViewRef}
        style={{ flex: 1, backgroundColor: '#FAF7F2' }}
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1a2d5a" />
        }
      >
        {selectedPromise ? (
          <View style={styles.mainContent}>
            <Text style={styles.topDate}>{formatDisplayDate(selectedPromise.date)}</Text>

            {/* --- Hero Card --- */}
            <View style={styles.heroCardOuter}>
              <ViewShot ref={viewShotRef} options={{ format: 'jpg', quality: 1 }} style={styles.heroCapture}>
                <View style={{ alignItems: 'center', marginBottom: 20 }}>
                  <Text style={{ color: '#FCD34D', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 }}>
                    {activeChurch?.name?.toUpperCase() || "TODAY'S PROMISE"}
                  </Text>
                  <View style={{ height: 1.5, width: 30, backgroundColor: 'rgba(255,255,255,0.3)', marginTop: 10 }} />
                </View>

                <View style={styles.heroHeader}>
                  <Text style={[styles.heroRefEn, { textAlign: 'center' }]}>
                    {selectedPromise.verseReferenceEn || ''}
                    {selectedPromise.verseReferenceEn && selectedPromise.verseReferenceTe ? ' - ' : ''}
                    {selectedPromise.verseReferenceTe || (!selectedPromise.verseReferenceEn ? stripHtml(selectedPromise.verse).substring(0, 30) + '...' : '')}
                  </Text>
                </View>

                <Text style={styles.verseEn}>"{stripHtml(selectedPromise.verse)}"</Text>
                <Text style={styles.verseTe}>"{stripHtml(selectedPromise.verseTelugu) || 'వాగ్దానము'}"</Text>
                
                <View style={{ alignItems: 'center', marginTop: 10 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '600', letterSpacing: 1 }}>
                    {formatDisplayDate(selectedPromise.date)}
                  </Text>
                </View>
              </ViewShot>

              <View style={styles.heroActionsContainer}>
                <View style={styles.heroActions}>
                  <TouchableOpacity style={styles.actionBtn} onPress={handleSaveCard}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      <Calendar size={18} color="#fff" />
                      <Text style={styles.actionBtnTxt}>Save card</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleShare(selectedPromise)}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      <Share2 size={18} color="#fff" />
                      <Text style={styles.actionBtnTxt}>Share</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* --- Devotional Note --- */}
            <View style={[styles.reflectionBox, { backgroundColor: isDark ? '#14234b' : '#fff', borderColor: isDark ? '#1d3266' : '#FAF7F2' }]}>
              <Text style={[styles.reflectionTitle, { color: isDark ? '#e0e7ff' : '#1a2d5a' }]}>Devotional Note</Text>
              <Text style={[styles.reflectionText, { color: isDark ? '#94a3b8' : '#475569' }]}>
                {stripHtml(selectedPromise.devotionalNote) || "In all seasons of life — in trials, in weakness, in uncertainty — we are not alone."}
              </Text>
              <Text style={styles.reflectionAuthor}>— Pastor {selectedPromise.pastor || 'Daniel Raju'}</Text>
            </View>

            {/* --- 1-min Devotional Bar --- */}
            {selectedPromise.youtubeId && (
              <TouchableOpacity
                style={styles.devotionalBar}
                onPress={() => navigation.navigate('DailyVideo', { youtubeId: selectedPromise.youtubeId, videoTitle: selectedPromise.videoTitle, pastor: selectedPromise.pastor })}
              >
                <View style={styles.playCircle}>
                  <Play size={20} color="#c0392b" fill="#c0392b" />
                </View>
                <View style={styles.devotionalInfo}>
                  <Text style={styles.devotionalTitle}>Today's 1-min devotional</Text>
                  <Text style={styles.devotionalSubTe}>నేటి 1 నిమిషాల సందేశం</Text>
                  <Text style={styles.devotionalSub}>
                    {selectedPromise.verseReferenceEn || selectedPromise.verseReferenceTe || 'Bible Reference'} · {selectedPromise.duration || '58 seconds'}
                  </Text>
                </View>
                <ChevronRight size={24} color="#c0392b" />
              </TouchableOpacity>
            )}
          </View>
        ) : !loading ? (
          <View style={[styles.noTodayCard, { backgroundColor: isDark ? '#14234b' : '#fff', borderColor: isDark ? '#1d3266' : '#FAF7F2' }]}>
            <View style={[styles.noTodayIcon, { backgroundColor: isDark ? '#1d3266' : '#FAF7F2' }]}>
              <BookOpen size={30} color={isDark ? '#64748b' : '#64748b'} />
            </View>
            <Text style={[styles.noTodayTxt, { color: isDark ? '#e0e7ff' : '#1a2d5a' }]}>No Promise Yet</Text>
            <Text style={styles.noTodaySubTe}>నేటి వాగ్దానం ఇంకా రాలేదు</Text>
            <Text style={styles.noTodayHint}>Check back later today for an uplifting verse.</Text>
          </View>
        ) : null}

        <View style={styles.historySection}>
          <Text style={[styles.historyLabel, { color: isDark ? '#e0e7ff' : '#1a2d5a' }]}>Past promises</Text>
          <View style={[styles.historyCard, { backgroundColor: isDark ? '#14234b' : '#fff', borderColor: isDark ? '#1d3266' : '#FAF7F2' }]}>
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
                    <Text style={{ color: isDark ? '#94a3b8' : '#9CA3AF', fontSize: 13, fontStyle: 'italic' }}>
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
                      { borderBottomColor: isDark ? '#1d3266' : '#FAF7F2' },
                      selectedPromise?.id === item.id && { backgroundColor: isDark ? '#1c3166' : '#FAF7F2' },
                      index === pastPromises.length - 1 && { borderBottomWidth: 0 }
                    ]}
                  >
                    <View style={styles.historyItemContent}>
                      <Text style={[styles.historyItemRef, { color: isDark ? '#f8fafc' : '#111827' }]}>{refString}</Text>
                      <Text style={[styles.historyItemVakyam, { color: isDark ? '#94a3b8' : '#475569' }]} numberOfLines={1}>{stripHtml(item.verseTelugu) || 'వాగ్దానము'}</Text>
                      <Text style={styles.historyItemDate}>
                        {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' })}
                      </Text>
                    </View>
                    <ChevronRight size={16} color="#D1D5DB" />
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
  mainContent: { padding: 16 },
  topDate: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textAlign: 'center', marginBottom: 15, letterSpacing: 0.5 },

  heroCardOuter: { backgroundColor: '#1a2d5a', borderRadius: 24, elevation: 12, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 15, overflow: 'hidden' },
  heroCapture: { padding: 24, backgroundColor: '#1a2d5a' },
  heroActionsContainer: { paddingHorizontal: 24, paddingBottom: 24 },
  heroHeader: { marginBottom: 20 },
  heroRefEn: { fontSize: 13, fontWeight: '800', color: '#FCD34D' },
  heroRefTe: { color: 'rgba(255,255,255,0.7)', fontWeight: '600' },

  verseEn: { fontSize: 19, fontWeight: '700', fontStyle: 'italic', color: '#fff', textAlign: 'center', lineHeight: 28, marginBottom: 15 },
  verseTe: { fontSize: 16, fontStyle: 'italic', color: '#aac4e8', textAlign: 'center', lineHeight: 26, marginBottom: 25 },

  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, justifyContent: 'center' },
  actionBtn: { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 25, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  actionBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  reflectionBox: { backgroundColor: '#fff', borderRadius: 20, padding: 22, marginTop: 15, elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  reflectionTitle: { fontSize: 13, fontWeight: '800', color: '#1a2d5a', marginBottom: 12 },
  reflectionText: { fontSize: 14, color: '#475569', lineHeight: 24, marginBottom: 15 },
  reflectionAuthor: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },

  devotionalBar: { backgroundColor: '#111827', borderRadius: 20, padding: 16, marginTop: 15, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#cbd5e1' },
  playCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  devotionalInfo: { flex: 1 },
  devotionalTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 2 },
  devotionalSubTe: { fontSize: 12, color: '#FCD34D', marginBottom: 4, fontWeight: '600' },
  devotionalSub: { fontSize: 11, color: '#94a3b8' },

  noTodayCard: { backgroundColor: '#fff', borderRadius: 24, padding: 30, margin: 16, alignItems: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  noTodayIcon: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  noTodayTxt: { fontSize: 17, fontWeight: '800', color: '#1a2d5a', marginBottom: 8, textAlign: 'center' },
  noTodaySubTe: { fontSize: 14, color: '#c0392b', marginBottom: 15, fontWeight: '600', textAlign: 'center' },
  noTodayHint: { fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 18 },

  historySection: { paddingHorizontal: 16, paddingBottom: 20 },
  historyLabel: { fontSize: 14, fontWeight: '700', color: '#1a2d5a', marginTop: 10, marginBottom: 15, marginLeft: 4 },
  historyCard: { backgroundColor: '#fff', borderRadius: 24, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  historyItem: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  historyItemContent: { flex: 1 },
  historyItemRef: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 2 },
  historyItemVakyam: { fontSize: 14, color: '#475569', marginBottom: 6, fontStyle: 'italic' },
  historyItemDate: { fontSize: 13, color: '#b45309', fontWeight: '500' },
});
