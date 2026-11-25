import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Share,
  StatusBar,
  Platform,
  Modal,
  Animated,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Share2,
  Play,
  Clock,
  Video,
  ChevronRight,
  Bell,
  BellOff,
  BookOpen,
  Sparkles,
  CheckCircle2,
  User,
  RefreshCw,
  X,
} from 'lucide-react-native';
import RhemaYouTubePlayer, { cleanVideoId } from '../components/RhemaYouTubePlayer';
import { CachedImage } from '../components/CachedImage';
import FirestoreService from '../services/FirestoreService';
import { useAuth } from '../context/AuthContext';
import { useChurch } from '../context/ChurchContext';
import { useAdminTheme } from '../utils/adminThemeHelper';
import { formatSermonDuration, formatDateDisplay } from '../utils/DateUtils';
import { resolveRhemaYoutubeUrl, RHEMA_YOUTUBE_CHANNEL_URL } from '../services/YouTubeService';
import { getInstantMemory, loadWithInstantCache, makeScopedCacheKey } from '../utils/instantCache';

const { width } = Dimensions.get('window');
const PLAYER_WIDTH = Math.min(width - 28, 600);
const PLAYER_HEIGHT = Math.round(PLAYER_WIDTH * 0.5625);

interface DevotionalVideo {
  id: string;
  title: string;
  youtubeId: string;
  date?: string;
  publishedAt?: string;
  duration?: string;
  pastor?: string;
  scriptureRef?: string;
  devotionalNote?: string;
  sortMs: number;
}

function parseSortableDateMs(raw?: any): number {
  if (!raw) return 0;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (!s || s === 'Today') return Date.now();

  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const dt = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    if (!isNaN(dt.getTime())) return dt.getTime();
  }
  const dmy = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (dmy) {
    const dt = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    if (!isNaN(dt.getTime())) return dt.getTime();
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function formatDevotionalDate(dateVal?: string): string {
  if (!dateVal || dateVal === 'Today') return 'Today';
  const clean = dateVal.trim();
  const ymd = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }
  }
  const dmy = clean.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    }
  }
  const formatted = formatDateDisplay(clean);
  return formatted && formatted !== 'Invalid Date' ? formatted : clean;
}

export default function DailyVideoScreen({ navigation, route }: any) {
  const { user } = useAuth();
  const { activeChurch, churchId } = useChurch();
  const dailyVideosCacheKey = makeScopedCacheKey('daily_videos_v1', churchId || activeChurch?.id, user?.uid);
  const initialDailyCache = getInstantMemory<DevotionalVideo[]>(dailyVideosCacheKey);

  const [videos, setVideos] = useState<DevotionalVideo[]>(() => initialDailyCache || []);
  const [loading, setLoading] = useState(() => !initialDailyCache?.length);
  const [refreshing, setRefreshing] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [activeVideo, setActiveVideo] = useState<DevotionalVideo | null>(() => {
    const paramId = cleanVideoId(route?.params?.youtubeId);
    if (paramId) {
      return initialDailyCache?.find((v) => v.youtubeId === paramId) || {
        id: `direct_${paramId}`,
        title: route?.params?.videoTitle || "Today's Devotional",
        youtubeId: paramId,
        publishedAt: 'Today',
        date: 'Today',
        duration: '',
        pastor: route?.params?.pastor || 'Pastor',
        sortMs: Date.now(),
      };
    }
    return initialDailyCache?.[0] || null;
  });
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showUnsubModal, setShowUnsubModal] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const {
    isDark,
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor: adminBorderColor,
    scaleFont,
    appFontFamily,
  } = useAdminTheme();

  const churchName = activeChurch?.name || 'Rhema Global Ministries';
  const churchAvatar = (activeChurch as any)?.logoUrl || (activeChurch as any)?.photoUrl;
  const channelUrl = resolveRhemaYoutubeUrl(
    activeChurch?.socialLinks?.youtube || RHEMA_YOUTUBE_CHANNEL_URL
  );
  const subKey = `@rhema_youtube_subscribed_${user?.uid || 'anon'}`;

  // Bell ringing animation for Subscribe CTA matching SermonVideoScreen (paused once subscribed)
  const bellAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (isSubscribed) {
      bellAnim.setValue(0);
      return;
    }
    const ringSequence = Animated.loop(
      Animated.sequence([
        Animated.delay(1800),
        Animated.timing(bellAnim, { toValue: 1, duration: 75, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: -1, duration: 75, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: 0.7, duration: 70, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: -0.7, duration: 70, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: 0, duration: 65, useNativeDriver: true }),
      ])
    );
    ringSequence.start();
    return () => ringSequence.stop();
  }, [bellAnim, isSubscribed]);

  const bellRotation = bellAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-18deg', '0deg', '18deg'],
  });

  useEffect(() => {
    AsyncStorage.getItem(subKey)
      .then((val) => {
        if (val === 'true') setIsSubscribed(true);
      })
      .catch(() => { });
  }, [subKey]);

  const applyDailyVideos = useCallback(
    (sortedList: DevotionalVideo[]) => {
      setVideos(sortedList);
      const paramId = cleanVideoId(route?.params?.youtubeId);
      const paramTitle = route?.params?.videoTitle;
      const paramPastor = route?.params?.pastor;

      if (paramId) {
        const found = sortedList.find((v) => v.youtubeId === paramId);
        if (found) {
          setActiveVideo(found);
        } else {
          setActiveVideo({
            id: `direct_${paramId}`,
            title: paramTitle || "Today's Devotional",
            youtubeId: paramId,
            publishedAt: 'Today',
            date: 'Today',
            duration: '',
            pastor: paramPastor || 'Pastor',
            sortMs: Date.now(),
          });
        }
      } else if (sortedList.length > 0) {
        setActiveVideo((prev) => prev || sortedList[0]);
      } else {
        setActiveVideo(null);
      }
      setLoading(false);
    },
    [route?.params?.youtubeId, route?.params?.videoTitle, route?.params?.pastor]
  );

  const loadDevotionals = useCallback(
    async (isRefresh = false) => {
      const memHit = getInstantMemory<DevotionalVideo[]>(dailyVideosCacheKey);
      if (isRefresh) setRefreshing(true);
      else if (!memHit?.length && !route?.params?.youtubeId) setLoading(true);

      try {
        await loadWithInstantCache<DevotionalVideo[]>({
          key: dailyVideosCacheKey,
          screenName: 'DailyVideo',
          freshSkipMs: 2 * 60 * 1000,
          forceRefresh: isRefresh,
          fetcher: async () => {
            const [promiseData, dailyVideoData] = await Promise.all([
              FirestoreService.getDailyPromisesArchive(45).catch(() => []),
              FirestoreService.getDailyVideos(20).catch(() => []),
            ]);

            const byYoutubeId = new Map<string, DevotionalVideo>();

            // 1. Collect videos from Daily Promises (richest metadata: scripture ref, note, pastor)
            promiseData.forEach((p) => {
              const vidId = cleanVideoId(p.youtubeId);
              if (!vidId) return;
              const dateVal = p.date || '';
              byYoutubeId.set(vidId, {
                id: p.id || `promise_${vidId}`,
                title: p.videoTitle || p.verseReferenceEn || p.verseReference || "Today's Devotional",
                youtubeId: vidId,
                publishedAt: dateVal,
                date: dateVal,
                duration: p.duration || '',
                pastor: p.pastor || 'Pastor',
                scriptureRef: p.verseReferenceEn || p.verseReference || '',
                devotionalNote: p.devotionalNote || '',
                sortMs: parseSortableDateMs(dateVal || p.id),
              });
            });

            // 2. Merge / enrich from dailyVideos collection
            dailyVideoData.forEach((dv) => {
              const vidId = cleanVideoId(dv.youtubeId);
              if (!vidId) return;
              const existing = byYoutubeId.get(vidId);
              if (existing) {
                if (!existing.duration && dv.duration) existing.duration = dv.duration;
                if ((!existing.title || existing.title === "Today's Devotional") && dv.title) {
                  existing.title = dv.title;
                }
                if (!existing.sortMs && dv.publishedAt) {
                  existing.sortMs = parseSortableDateMs(dv.publishedAt);
                }
              } else {
                const dateStr =
                  typeof dv.publishedAt === 'string'
                    ? dv.publishedAt
                    : dv.id || '';
                byYoutubeId.set(vidId, {
                  id: dv.id || `dv_${vidId}`,
                  title: dv.title || "Daily Video Devotional",
                  youtubeId: vidId,
                  publishedAt: dateStr,
                  date: dateStr,
                  duration: dv.duration || '',
                  pastor: (dv as any).pastor || 'Pastor',
                  sortMs: parseSortableDateMs(dv.publishedAt || dv.id),
                });
              }
            });

            return Array.from(byYoutubeId.values()).sort(
              (a, b) => b.sortMs - a.sortMs
            );
          },
          onCached: (cached) => {
            if (cached?.length) applyDailyVideos(cached);
          },
          onFresh: (fresh) => {
            applyDailyVideos(fresh);
          },
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dailyVideosCacheKey, applyDailyVideos, route?.params?.youtubeId]
  );

  useEffect(() => {
    loadDevotionals();
  }, [loadDevotionals]);

  const onPlayerStateChange = useCallback((state: string) => {
    if (state === 'ended') setPlaying(false);
  }, []);

  const handleShare = async () => {
    if (!activeVideo) return;
    try {
      const vidId = cleanVideoId(activeVideo.youtubeId);
      const shareUrl = vidId ? `https://youtu.be/${vidId}` : channelUrl;
      await Share.share({
        title: activeVideo.title,
        message: `Watch this daily devotional from ${churchName}: "${activeVideo.title}" - ${shareUrl}`,
      });
    } catch (error) {
      console.warn('Error sharing devotional:', error);
    }
  };

  const handleSubscribeToggle = async () => {
    if (isSubscribed) {
      setShowUnsubModal(true);
    } else {
      try {
        await Linking.openURL(channelUrl);
      } catch (err) {
        console.warn('Failed to open YouTube channel:', err);
      }
      setIsSubscribed(true);
      await AsyncStorage.setItem(subKey, 'true').catch(() => { });
    }
  };

  const confirmUnsubscribe = async () => {
    setShowUnsubModal(false);
    setIsSubscribed(false);
    await AsyncStorage.setItem(subKey, 'false').catch(() => { });
    try {
      await Linking.openURL(channelUrl);
    } catch (err) {
      console.warn('Failed to open YouTube channel:', err);
    }
  };

  const activeVidId = cleanVideoId(activeVideo?.youtubeId);
  const pastVideos = videos.filter((v) => v.youtubeId !== activeVidId);
  const accentRed = '#DC2626';

  if (loading && !activeVideo) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: screenBg }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor={screenBg}
        />
        <ActivityIndicator size="large" color={accentRed} />
        <Text
          style={[
            styles.loadingText,
            { color: secondaryText, fontFamily: appFontFamily, fontSize: scaleFont(13) },
          ]}
        >
          Loading Daily Devotional...
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={screenBg}
      />

      {/* ── CLEAN MODERN HEADER (Matches YouTube Live & Sermon Video) ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop:
              Math.max(
                insets.top,
                Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 28
              ) + 10,
            backgroundColor: screenBg,
            borderBottomColor: isDark ? '#27272A' : '#E2E8F0',
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.circularBtn,
            { backgroundColor: cardSurface, borderColor: adminBorderColor },
          ]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.8}
        >
          <ArrowLeft size={20} color={primaryText} strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text
            style={[
              styles.headerTitle,
              { color: primaryText, fontFamily: appFontFamily, fontSize: scaleFont(18) },
            ]}
            numberOfLines={1}
          >
            Video Devotional
          </Text>
          <Text
            style={[
              styles.headerSub,
              { color: secondaryText, fontFamily: appFontFamily, fontSize: scaleFont(11.5) },
            ]}
            numberOfLines={1}
          >
            ప్రార్థన సందేశం
          </Text>
        </View>

        {activeVideo ? (
          <TouchableOpacity
            style={[
              styles.circularBtn,
              { backgroundColor: cardSurface, borderColor: adminBorderColor },
            ]}
            onPress={handleShare}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.8}
          >
            <Share2 size={18} color={primaryText} strokeWidth={2.2} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadDevotionals(true)}
            tintColor={accentRed}
            colors={[accentRed]}
          />
        }
      >
        {/* ── HERO VIDEO PLAYER CARD ── */}
        <View
          style={[
            styles.playerCard,
            {
              backgroundColor: cardSurface,
              borderColor: adminBorderColor,
            },
          ]}
        >
          {activeVidId ? (
            <View style={styles.playerFrame}>
              <RhemaYouTubePlayer
                key={`dev_yt_${activeVidId}`}
                width={PLAYER_WIDTH}
                height={PLAYER_HEIGHT}
                play={playing}
                autoPlay={true}
                videoId={activeVidId}
                title={activeVideo?.title}
                onChangeState={onPlayerStateChange}
              />
            </View>
          ) : (
            <View style={[styles.emptyPlayerBox, { backgroundColor: cardSurface }]}>
              <View
                style={[
                  styles.emptyIconRing,
                  { backgroundColor: secondarySurface, borderColor: adminBorderColor },
                ]}
              >
                <Video size={32} color={secondaryText} />
              </View>
              <Text
                style={[
                  styles.emptyTitle,
                  { color: primaryText, fontFamily: appFontFamily, fontSize: scaleFont(16) },
                ]}
              >
                No Video Devotional Today
              </Text>
              <Text style={styles.emptyTelugu}>ప్రస్తుతం వీడియో సందేశం అందుబాటులో లేదు</Text>
              <Text
                style={[
                  styles.emptyDesc,
                  { color: secondaryText, fontFamily: appFontFamily },
                ]}
              >
                New daily devotional teachings will appear here automatically. You can explore past
                sermons meanwhile.
              </Text>
              <View style={styles.emptyActionsRow}>
                <TouchableOpacity
                  style={[styles.emptyPrimaryBtn, { backgroundColor: '#2563EB' }]}
                  onPress={() => navigation.navigate('Sermons')}
                  activeOpacity={0.85}
                >
                  <Video size={14} color="#FFFFFF" />
                  <Text style={styles.emptyPrimaryTxt}>Browse Sermons</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.emptySecondaryBtn,
                    { borderColor: adminBorderColor },
                  ]}
                  onPress={() => loadDevotionals(true)}
                  activeOpacity={0.85}
                >
                  <RefreshCw size={13} color={primaryText} />
                  <Text style={[styles.emptySecondaryTxt, { color: primaryText }]}>Refresh</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ── HERO DETAILS CARD ── */}
        {activeVideo && (
          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: cardSurface,
                borderColor: adminBorderColor,
              },
            ]}
          >
            {/* Top Tag + Quick Share Pill */}
            <View style={styles.heroTopRow}>
              <View
                style={[
                  styles.featuredTag,
                  {
                    backgroundColor: isDark ? 'rgba(220, 38, 38, 0.16)' : '#FEF2F2',
                    borderColor: isDark ? 'rgba(248, 113, 113, 0.28)' : '#FECACA',
                  },
                ]}
              >
                <Sparkles size={12} color={isDark ? '#F87171' : '#DC2626'} />
                <Text
                  style={[
                    styles.featuredTagTxt,
                    { color: isDark ? '#FCA5A5' : '#B91C1C' },
                  ]}
                >
                  FEATURED DEVOTIONAL
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.sharePillBtn,
                  {
                    backgroundColor: secondarySurface,
                    borderColor: adminBorderColor,
                  },
                ]}
                onPress={handleShare}
                activeOpacity={0.82}
              >
                <Share2 size={13} color={primaryText} />
                <Text style={[styles.sharePillTxt, { color: primaryText }]}>Share</Text>
              </TouchableOpacity>
            </View>

            {/* Video Title */}
            <Text
              style={[
                styles.heroTitle,
                {
                  color: primaryText,
                  fontFamily: appFontFamily,
                  fontSize: scaleFont(18.5),
                },
              ]}
            >
              {activeVideo.title || `${churchName} Daily Devotional`}
            </Text>

            {/* Meta Row (Date + Duration) */}
            <View style={styles.metaRow}>
              <View style={styles.metaChip}>
                <Clock size={12.5} color={secondaryText} />
                <Text
                  style={[
                    styles.metaTxt,
                    { color: secondaryText, fontFamily: appFontFamily },
                  ]}
                >
                  {formatDevotionalDate(activeVideo.date)}
                </Text>
              </View>

              {activeVideo.duration && formatSermonDuration(activeVideo.duration) ? (
                <>
                  <Text style={[styles.metaDot, { color: secondaryText }]}>•</Text>
                  <Text
                    style={[
                      styles.metaTxt,
                      { color: secondaryText, fontFamily: appFontFamily },
                    ]}
                  >
                    {formatSermonDuration(activeVideo.duration)}
                  </Text>
                </>
              ) : null}
            </View>

            {activeVideo.scriptureRef ? (
              <View
                style={[
                  styles.scripturePill,
                  {
                    backgroundColor: secondarySurface,
                    borderColor: adminBorderColor,
                  },
                ]}
              >
                <BookOpen size={13} color={isDark ? '#FBBF24' : '#B45309'} />
                <Text
                  style={[
                    styles.scriptureTxt,
                    { color: primaryText, fontFamily: appFontFamily },
                  ]}
                  numberOfLines={1}
                >
                  {activeVideo.scriptureRef}
                </Text>
              </View>
            ) : null}

            {activeVideo.devotionalNote ? (
              <Text
                style={[
                  styles.notePreview,
                  { color: secondaryText, fontFamily: appFontFamily },
                ]}
                numberOfLines={3}
              >
                {activeVideo.devotionalNote}
              </Text>
            ) : null}

            {/* Ministry / Pastor Author Row */}
            <View style={[styles.authorRow, { borderTopColor: adminBorderColor }]}>
              <View style={styles.avatarWrap}>
                {churchAvatar ? (
                  <CachedImage
                    source={{ uri: churchAvatar }}
                    style={styles.avatarImg}
                    resizeMode="cover"
                  />
                ) : (
                  <LinearGradient
                    colors={['#DC2626', '#991B1B']}
                    style={styles.avatarFallback}
                  >
                    <User size={18} color="#FFFFFF" strokeWidth={2.2} />
                  </LinearGradient>
                )}
              </View>

              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text
                  style={[
                    styles.pastorName,
                    { color: primaryText, fontFamily: appFontFamily },
                  ]}
                  numberOfLines={1}
                >
                  {activeVideo.pastor || 'Pastor'}
                </Text>
                <Text
                  style={[
                    styles.pastorRole,
                    { color: secondaryText, fontFamily: appFontFamily },
                  ]}
                  numberOfLines={1}
                >
                  {churchName}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleSubscribeToggle}
                style={styles.subBtnWrapper}
              >
                {isSubscribed ? (
                  <View
                    style={[
                      styles.subscribedBtn,
                      {
                        backgroundColor: secondarySurface,
                        borderColor: adminBorderColor,
                      },
                    ]}
                  >
                    <CheckCircle2 size={13} color="#10B981" />
                    <Text style={[styles.subscribedTxt, { color: primaryText }]}>
                      Subscribed
                    </Text>
                  </View>
                ) : (
                  <LinearGradient
                    colors={['#FF0000', '#B91C1C']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.subscribeGradBtn}
                  >
                    <Animated.View style={{ transform: [{ rotate: bellRotation }] }}>
                      <Bell size={13} color="#FFFFFF" fill="#FFFFFF" />
                    </Animated.View>
                    <Text style={styles.subscribeTxt}>Subscribe</Text>
                  </LinearGradient>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── PAST DEVOTIONALS ARCHIVE ── */}
        <View style={styles.archiveSection}>
          <View style={styles.sectionHeaderRow}>
            <Text
              style={[
                styles.sectionTitle,
                { color: primaryText, fontFamily: appFontFamily, fontSize: scaleFont(16) },
              ]}
            >
              Past Devotionals
            </Text>
            {pastVideos.length > 0 && (
              <View
                style={[
                  styles.countPill,
                  { backgroundColor: secondarySurface, borderColor: adminBorderColor },
                ]}
              >
                <Text style={[styles.countPillTxt, { color: secondaryText }]}>
                  {pastVideos.length}
                </Text>
              </View>
            )}
          </View>

          <View
            style={[
              styles.archiveCard,
              { backgroundColor: cardSurface, borderColor: adminBorderColor },
            ]}
          >
            {pastVideos.length === 0 ? (
              <View style={styles.emptyArchiveBox}>
                <Text style={[styles.emptyArchiveTxt, { color: secondaryText }]}>
                  No other archived video devotionals available yet.
                </Text>
              </View>
            ) : (
              pastVideos.slice(0, 15).map((video, idx) => {
                const vidId = cleanVideoId(video.youtubeId);
                const formattedDur = video.duration ? formatSermonDuration(video.duration) : '';
                const isLast = idx === Math.min(pastVideos.length, 15) - 1;
                return (
                  <TouchableOpacity
                    key={`${video.id}_${vidId}`}
                    style={[
                      styles.archiveItem,
                      !isLast && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: adminBorderColor,
                      },
                    ]}
                    activeOpacity={0.78}
                    onPress={() => {
                      setActiveVideo(video);
                      setPlaying(true);
                      scrollRef.current?.scrollTo({ y: 0, animated: true });
                    }}
                  >
                    <View style={styles.thumbBox}>
                      <CachedImage
                        source={{ uri: `https://img.youtube.com/vi/${vidId}/mqdefault.jpg` }}
                        style={styles.thumb}
                        resizeMode="cover"
                      />
                      <View style={styles.playOverlay}>
                        <View style={styles.playBadgeCircle}>
                          <Play size={11} color="#FFFFFF" fill="#FFFFFF" />
                        </View>
                      </View>
                      {formattedDur ? (
                        <View style={styles.durationPill}>
                          <Text style={styles.durationPillTxt}>{formattedDur}</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.itemInfo}>
                      <Text
                        style={[
                          styles.itemTitle,
                          { color: primaryText, fontFamily: appFontFamily },
                        ]}
                        numberOfLines={2}
                      >
                        {video.title}
                      </Text>
                      <Text
                        style={[
                          styles.itemMeta,
                          { color: secondaryText, fontFamily: appFontFamily },
                        ]}
                        numberOfLines={1}
                      >
                        {video.pastor ? `${video.pastor} • ` : ''}
                        {formatDevotionalDate(video.date)}
                      </Text>
                    </View>

                    <ChevronRight size={17} color={secondaryText} />
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>
      </ScrollView>

      {/* ── UNSUBSCRIBE CONFIRMATION MODAL ── */}
      <Modal
        visible={showUnsubModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUnsubModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setShowUnsubModal(false)}
          />
          <View
            style={[
              styles.unsubModalCard,
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                borderColor: adminBorderColor,
                borderWidth: 1,
              },
            ]}
          >
            <TouchableOpacity
              style={[
                styles.modalCloseBtn,
                { backgroundColor: isDark ? '#27272A' : '#F3F4F6' },
              ]}
              onPress={() => setShowUnsubModal(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={16} color={secondaryText} />
            </TouchableOpacity>

            <View
              style={[
                styles.unsubIconBadge,
                { backgroundColor: isDark ? 'rgba(220, 38, 38, 0.18)' : '#FEE2E2' },
              ]}
            >
              <BellOff size={26} color="#DC2626" />
            </View>

            <Text style={[styles.unsubModalTitle, { color: primaryText }]}>
              Unsubscribe?
            </Text>
            <Text style={[styles.unsubModalMessage, { color: secondaryText }]}>
              Are you sure you want to unsubscribe from{'\n'}
              <Text style={{ fontWeight: '700', color: primaryText }}>{churchName}</Text>?
            </Text>

            <Text style={[styles.unsubModalSubtext, { color: secondaryText }]}>
              You won't receive YouTube updates when new daily video devotionals are published.
            </Text>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={[
                  styles.modalCancelBtn,
                  { backgroundColor: isDark ? '#27272A' : '#F3F4F6' },
                ]}
                onPress={() => setShowUnsubModal(false)}
                activeOpacity={0.75}
              >
                <Text style={[styles.modalCancelBtnTxt, { color: primaryText }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={confirmUnsubscribe}
                activeOpacity={0.82}
              >
                <Text style={styles.modalConfirmBtnTxt}>Unsubscribe</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 14, fontWeight: '600' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  circularBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  headerSub: {
    fontWeight: '600',
    marginTop: 1,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },

  scrollContent: { paddingBottom: 42 },

  // Player Card
  playerCard: {
    marginHorizontal: 14,
    marginTop: 14,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    minHeight: PLAYER_HEIGHT,
    alignSelf: 'center',
    width: PLAYER_WIDTH,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
  },
  playerFrame: {
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    backgroundColor: '#000000',
  },
  emptyPlayerBox: {
    minHeight: PLAYER_HEIGHT + 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  emptyIconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  emptyTelugu: {
    fontSize: 12.5,
    color: '#94A3B8',
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emptyPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  emptyPrimaryTxt: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  emptySecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  emptySecondaryTxt: {
    fontSize: 12.5,
    fontWeight: '700',
  },

  // Hero Details Card
  heroCard: {
    marginHorizontal: 14,
    marginTop: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  featuredTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  featuredTagTxt: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  sharePillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  sharePillTxt: {
    fontSize: 12,
    fontWeight: '600',
  },
  heroTitle: {
    fontWeight: '800',
    lineHeight: 25,
    letterSpacing: -0.2,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaTxt: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaDot: {
    fontSize: 12,
    fontWeight: '800',
    marginHorizontal: 7,
  },
  scripturePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  scriptureTxt: {
    fontSize: 12,
    fontWeight: '700',
  },
  notePreview: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  avatarImg: {
    width: 40,
    height: 40,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastorName: {
    fontSize: 14,
    fontWeight: '700',
  },
  pastorRole: {
    fontSize: 11.5,
    marginTop: 1,
  },
  subBtnWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  subscribeGradBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
  },
  subscribeTxt: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  subscribedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7.5,
    borderRadius: 20,
    borderWidth: 1,
  },
  subscribedTxt: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Archive
  archiveSection: {
    marginTop: 20,
    marginHorizontal: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  countPillTxt: {
    fontSize: 11,
    fontWeight: '700',
  },
  archiveCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  emptyArchiveBox: {
    padding: 22,
    alignItems: 'center',
  },
  emptyArchiveTxt: {
    fontSize: 12.5,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  archiveItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  thumbBox: {
    width: 96,
    height: 56,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0F172A',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBadgeCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationPill: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    backgroundColor: 'rgba(0,0,0,0.78)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  durationPillTxt: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '700',
  },
  itemInfo: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  itemMeta: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 4,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  unsubModalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    position: 'relative',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unsubIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  unsubModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  unsubModalMessage: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 8,
  },
  unsubModalSubtext: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 22,
  },
  modalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnTxt: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  modalConfirmBtn: {
    flex: 1,
    backgroundColor: '#DC2626',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmBtnTxt: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
});
