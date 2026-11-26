import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Share,
  StatusBar,
  Platform,
  RefreshControl,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import YoutubePlayer from 'react-native-youtube-iframe';
import { WebView } from 'react-native-webview';
import RhemaYouTubePlayer from '../components/RhemaYouTubePlayer';
import {
  ArrowLeft,
  Radio,
  Share2,
  RefreshCw,
  Play,
  Heart,
  Video,
  ShieldCheck,
  Tv,
  CheckCircle2,
  Maximize2,
  Minimize2,
} from 'lucide-react-native';
import { useVideoOrientationController } from '../utils/videoOrientation';
import firestore from '@react-native-firebase/firestore';
import { CachedImage } from '../components/CachedImage';
import { useChurch } from '../context/ChurchContext';
import { useLanguage } from '../context/LanguageContext';
import { useAdminTheme, createAdminThemedStyles } from '../utils/adminThemeHelper';
import { getInstantMemory, loadWithInstantCache, makeScopedCacheKey, writeInstantCache } from '../utils/instantCache';
import {
  findActiveLiveStream,
  getChannelId,
  checkVideoLiveStatus,
  resolveRhemaYoutubeUrl,
  RHEMA_YOUTUBE_CHANNEL_URL,
  RHEMA_YOUTUBE_CHANNEL_ID,
} from '../services/YouTubeService';

/**
 * Extracts 11-char YouTube video ID from various URL formats
 */
function extractYoutubeVideoId(urlOrId?: string): string {
  if (!urlOrId || typeof urlOrId !== 'string') return '';
  const clean = urlOrId.trim();

  // Pure 11-char ID
  if (/^[\w-]{11}$/.test(clean)) return clean;

  // youtube.com/live/VIDEO_ID
  const liveMatch = clean.match(/\/live\/([\w-]{11})/);
  if (liveMatch) return liveMatch[1];

  // youtube.com/watch?v=VIDEO_ID
  const watchMatch = clean.match(/[?&]v=([\w-]{11})/);
  if (watchMatch) return watchMatch[1];

  // youtu.be/VIDEO_ID
  const shortMatch = clean.match(/youtu\.be\/([\w-]{11})/);
  if (shortMatch) return shortMatch[1];

  // youtube.com/embed/VIDEO_ID
  const embedMatch = clean.match(/\/embed\/([\w-]{11})/);
  if (embedMatch) return embedMatch[1];

  return '';
}

/**
 * Formats raw YouTube title into clean, professional title removing
 * messy pipes, hashtags, and unformatted markers.
 */
function formatCleanStreamTitle(rawTitle?: string, isLive?: boolean): string {
  if (!rawTitle) return '';
  let s = rawTitle.trim();
  // Strip leading/trailing pipes, dashes, slashes, bullets
  s = s.replace(/^[|\s/-]+|[|\s/-]+$/g, '');
  // Clean repeated pipes into bullet separator
  s = s.replace(/\|{1,2}/g, ' • ');
  // Strip inline #hashtags
  s = s.replace(/#[\w-]+/g, '');
  // Strip standalone Live keyword from title string as status badge indicates it
  s = s.replace(/\bLive\b/gi, '').trim();
  // Add space after initials like Y.Rajesh -> Y. Rajesh
  s = s.replace(/([A-Za-z])\.([A-Za-z])/g, (_m, p1, p2) => p1 + '. ' + p2);
  // Normalize whitespace and dangling bullets
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s*•\s*(?:•\s*)+/g, ' • ');
  s = s.replace(/^[•\s/-]+|[•\s/-]+$/g, '').trim();
  return s;
}

export default function YouTubeLiveScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { activeChurch } = useChurch();
  const { t } = useLanguage();
  const {
    isDark,
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor: adminBorderColor,
  } = useAdminTheme();

  const churchId = route?.params?.churchId || activeChurch?.id || 'rhema';
  const churchName = activeChurch?.name || 'Rhema Global Ministries';
  const churchAvatar = (activeChurch as any)?.logoUrl || (activeChurch as any)?.photoUrl;
  const configuredChannelUrl = resolveRhemaYoutubeUrl(activeChurch?.socialLinks?.youtube);
  const channelHomeUrl = route?.params?.channelUrl
    ? resolveRhemaYoutubeUrl(route.params.channelUrl)
    : configuredChannelUrl;

  // Input params
  const paramVideoId = extractYoutubeVideoId(route?.params?.videoId || route?.params?.url);
  const paramUrl = route?.params?.url || route?.params?.channelUrl || configuredChannelUrl;
  const paramTitle = route?.params?.title || '';

  const liveCacheKey = makeScopedCacheKey('youtube_live_state_v1', churchId, paramVideoId);
  const initialLiveCache = getInstantMemory<{
    activeVideoId: string | null;
    streamTitle: string;
    streamStatus: 'loading' | 'live' | 'completed' | 'none';
    isLive: boolean;
  }>(liveCacheKey);

  const [activeVideoId, setActiveVideoId] = useState<string | null>(() => initialLiveCache?.activeVideoId || null);
  const [streamTitle, setStreamTitle] = useState<string>(() => paramTitle || initialLiveCache?.streamTitle || 'Church Live Stream');
  const [streamStatus, setStreamStatus] = useState<'loading' | 'live' | 'completed' | 'none'>(() => initialLiveCache?.streamStatus || 'loading');
  const [isLive, setIsLive] = useState<boolean>(() => initialLiveCache?.isLive || false);
  const [loading, setLoading] = useState<boolean>(() => !initialLiveCache);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [playing, setPlaying] = useState<boolean>(true);
  const [resolvedChannelId, setResolvedChannelId] = useState<string | null>(null);

  // Pulse animation runs ONLY while stream is live and stops cleanly
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const expectedChannelIdRef = useRef<{ target: string; id: string } | null>(null);

  const hasPlayableLiveStream = streamStatus === 'live' && Boolean(activeVideoId);
  const {
    windowWidth,
    windowHeight,
    isLandscape,
    playerWidth: responsiveWidth,
    playerHeight: responsiveHeight,
    handleFullScreenChange,
    toggleOrientation,
  } = useVideoOrientationController(
    isFocused && hasPlayableLiveStream,
    'screen:YouTubeLive',
    { theaterInLandscape: true, horizontalPadding: 24, maxPortraitWidth: 900 }
  );

  useEffect(() => {
    if (!isLive) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.35,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim, isLive]);

  const resolveExpectedChannelId = useCallback(async () => {
    const target = resolveRhemaYoutubeUrl(channelHomeUrl || configuredChannelUrl || RHEMA_YOUTUBE_CHANNEL_URL);
    if (target.toLowerCase().includes('rhemaglobalministries') || (churchId || 'rhema') === 'rhema') {
      return RHEMA_YOUTUBE_CHANNEL_ID;
    }
    if (expectedChannelIdRef.current?.target === target) {
      return expectedChannelIdRef.current.id;
    }
    const resolved = (await getChannelId(target)) || RHEMA_YOUTUBE_CHANNEL_ID;
    expectedChannelIdRef.current = { target, id: resolved };
    return resolved;
  }, [channelHomeUrl, configuredChannelUrl, churchId]);

  /**
   * Listen to real-time live status in Firestore for this church
   */
  useEffect(() => {
    const unsubscribeChurch = firestore()
      .collection('Rhema Church')
      .doc(churchId || 'rhema')
      .onSnapshot(
        async (doc) => {
          if (doc.exists) {
            const data = doc.data();
            const liveState = data?.youtubeLiveState;
            const expectedChannelId = await resolveExpectedChannelId();
            if (liveState?.isLive && liveState.videoId) {
              const vCheck = await checkVideoLiveStatus(liveState.videoId, expectedChannelId);
              if (vCheck.channelMismatch) {
                setIsLive(false);
                setStreamStatus('none');
                setActiveVideoId(null);
                return;
              }
              if (vCheck.status === 'live' || vCheck.isLiveNow) {
                setIsLive(true);
                setStreamStatus('live');
                setActiveVideoId(liveState.videoId);
                if (liveState.title || vCheck.title) setStreamTitle(liveState.title || vCheck.title);
                return;
              } else if (vCheck.status === 'completed' || vCheck.hasEnded) {
                setIsLive(false);
                setStreamStatus('completed');
                setActiveVideoId(null);
                return;
              }
            } else if (liveState && !liveState.isLive) {
              setIsLive(false);
              setStreamStatus('none');
              setActiveVideoId(null);
            }
          }
        },
        (err) => console.warn('[YouTubeLiveScreen] church snapshot notice:', err)
      );

    const unsubscribeMeetings = firestore()
      .collection('Rhema Church')
      .doc(churchId || 'rhema')
      .collection('online_meetings')
      .where('status', '==', 'live')
      .limit(1)
      .onSnapshot(
        async (snapshot) => {
          if (snapshot && !snapshot.empty) {
            const mData = snapshot.docs[0].data();
            if (mData.youtubeLive?.watchUrl || mData.youtubeLive?.broadcastId) {
              const liveVidId =
                mData.youtubeLive.broadcastId ||
                extractYoutubeVideoId(mData.youtubeLive.watchUrl);
              if (liveVidId) {
                const expectedChannelId = await resolveExpectedChannelId();
                const vCheck = await checkVideoLiveStatus(liveVidId, expectedChannelId);
                if (!vCheck.channelMismatch && (vCheck.status === 'live' || vCheck.isLiveNow)) {
                  setActiveVideoId(liveVidId);
                  setIsLive(true);
                  setStreamStatus('live');
                  if (mData.title || vCheck.title) setStreamTitle(mData.title || vCheck.title);
                }
              }
            }
          }
        },
        (err) => console.warn('[YouTubeLiveScreen] meetings snapshot notice:', err)
      );

    return () => {
      unsubscribeChurch();
      unsubscribeMeetings();
    };
  }, [churchId, paramVideoId, resolveExpectedChannelId]);

  const resolveLiveStream = useCallback(
    async (isManualRefresh = false) => {
      const memHit = getInstantMemory<{
        activeVideoId: string | null;
        streamTitle: string;
        streamStatus: 'loading' | 'live' | 'completed' | 'none';
        isLive: boolean;
      }>(liveCacheKey);
      if (isManualRefresh) setRefreshing(true);
      else if (!memHit) setLoading(true);

      const cacheResult = (
        vid: string | null,
        title: string,
        status: 'live' | 'completed' | 'none',
        liveFlag: boolean
      ) => {
        writeInstantCache(liveCacheKey, {
          activeVideoId: vid,
          streamTitle: title,
          streamStatus: status,
          isLive: liveFlag,
        }).catch(() => { });
      };

      try {
        // Rule: Quick Access YouTube Live should ONLY play active streams
        // strictly owned by the church's official YouTube channel.
        const expectedChannelId = await resolveExpectedChannelId();
        if (expectedChannelId) {
          setResolvedChannelId(expectedChannelId);
        }

        // Step 1: Check if paramVideoId is currently live AND belongs to this church channel
        if (paramVideoId) {
          const vCheck = await checkVideoLiveStatus(paramVideoId, expectedChannelId);
          if (!vCheck.channelMismatch) {
            if (vCheck.status === 'live' || vCheck.isLiveNow) {
              const title = paramTitle || vCheck.title || streamTitle;
              setActiveVideoId(paramVideoId);
              setIsLive(true);
              setStreamStatus('live');
              if (paramTitle || vCheck.title) setStreamTitle(paramTitle || vCheck.title);
              cacheResult(paramVideoId, title, 'live', true);
              return;
            } else if (vCheck.status === 'completed' || vCheck.hasEnded) {
              const title = paramTitle || vCheck.title || streamTitle;
              setActiveVideoId(null);
              setIsLive(false);
              setStreamStatus('completed');
              if (paramTitle || vCheck.title) setStreamTitle(paramTitle || vCheck.title);
              cacheResult(null, title, 'completed', false);
              return;
            }
          }
        }

        // Step 2: Check Firestore live broadcast state (strictly verified against expectedChannelId)
        const targetChurchId = churchId || 'rhema';
        const churchDoc = await firestore()
          .collection('Rhema Church')
          .doc(targetChurchId)
          .get();

        let churchData: any = null;
        if (churchDoc.exists) {
          churchData = churchDoc.data();
          const lData = churchData?.youtubeLiveState;
          const liveVid = lData?.videoId;
          if (lData?.isLive && liveVid) {
            const vCheck = await checkVideoLiveStatus(liveVid, expectedChannelId);
            if (!vCheck.channelMismatch) {
              if (vCheck.status === 'live' || vCheck.isLiveNow) {
                const title = lData.title || vCheck.title || streamTitle;
                setActiveVideoId(liveVid);
                setIsLive(true);
                setStreamStatus('live');
                if (lData.title || vCheck.title) setStreamTitle(lData.title || vCheck.title);
                cacheResult(liveVid, title, 'live', true);
                return;
              } else if (vCheck.status === 'completed' || vCheck.hasEnded) {
                setActiveVideoId(null);
                setIsLive(false);
                setStreamStatus('completed');
                cacheResult(null, streamTitle, 'completed', false);
                return;
              }
            }
          }
        }

        // Step 3: Check official church channel handle/URL using YouTubeService (never a raw watch paramUrl)
        const targetChannelUrl = resolveRhemaYoutubeUrl(
          configuredChannelUrl ||
          churchData?.socialLinks?.youtube ||
          churchData?.youtubeChannelUrl ||
          churchData?.youtubeLiveUrl ||
          RHEMA_YOUTUBE_CHANNEL_URL
        );

        if (targetChannelUrl) {
          const liveResult = await findActiveLiveStream(targetChannelUrl, expectedChannelId);
          if (liveResult.status === 'live' && liveResult.isLiveNow && liveResult.videoId) {
            const title = liveResult.title || streamTitle;
            setActiveVideoId(liveResult.videoId);
            if (liveResult.title) setStreamTitle(liveResult.title);
            setIsLive(true);
            setStreamStatus('live');
            setPlaying(true);
            cacheResult(liveResult.videoId, title, 'live', true);
            return;
          } else if (liveResult.status === 'completed' || liveResult.hasEnded) {
            const title = liveResult.title || streamTitle;
            setActiveVideoId(null);
            setIsLive(false);
            setStreamStatus('completed');
            if (liveResult.title) setStreamTitle(liveResult.title);
            cacheResult(null, title, 'completed', false);
            return;
          }
        }

        // Step 4: No live stream active
        setIsLive(false);
        setActiveVideoId(null);
        setStreamStatus('none');
        cacheResult(null, streamTitle, 'none', false);
      } catch (err) {
        console.warn('[YouTubeLiveScreen] resolveLiveStream error:', err);
        setIsLive(false);
        setActiveVideoId(null);
        setStreamStatus('none');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [churchId, configuredChannelUrl, paramTitle, paramVideoId, resolveExpectedChannelId, liveCacheKey]
  );

  useEffect(() => {
    resolveLiveStream();
  }, [resolveLiveStream]);

  const onPlayerStateChange = useCallback((state: string) => {
    if (state === 'ended') {
      setPlaying(false);
    }
  }, []);

  const handleShare = async () => {
    try {
      const shareUrl = activeVideoId
        ? `https://youtu.be/${activeVideoId}`
        : channelHomeUrl || RHEMA_YOUTUBE_CHANNEL_URL;
      await Share.share({
        title: streamTitle || `${churchName} Live`,
        message: `🔴 ${churchName} is streaming live on YouTube! Tap to watch worship with us: ${shareUrl}`,
      });
    } catch (e) {
      console.warn('Share error:', e);
    }
  };

  const scrollRef = useRef<ScrollView>(null);
  const isLandscapeTheater = isLandscape && hasPlayableLiveStream && Boolean(activeVideoId);

  useEffect(() => {
    if (isLandscapeTheater) {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [isLandscapeTheater]);

  return (
    <View style={[styles.container, { backgroundColor: isLandscapeTheater ? '#000000' : screenBg }]}>
      <StatusBar
        hidden={isLandscapeTheater}
        translucent={isLandscapeTheater}
        barStyle={isLandscapeTheater ? 'light-content' : (isDark ? 'light-content' : 'dark-content')}
        backgroundColor={isLandscapeTheater ? '#000000' : screenBg}
      />

      {/* ── TOP HEADER (Hidden in Landscape Theater) ── */}
      {!isLandscapeTheater ? (
        <View
          style={[
            styles.header,
            {
              paddingTop:
                Math.max(
                  insets.top,
                  Platform.OS === 'ios' ? 44 : StatusBar.currentHeight || 28
                ) + 12,
              backgroundColor: screenBg,
              borderBottomColor: isDark ? '#2E2E2E' : '#CBD5E1',
            },
          ]}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.8}
          >
            <ArrowLeft size={20} color={primaryText} strokeWidth={2.4} />
          </TouchableOpacity>

          <Text style={[styles.headerTitle, { color: primaryText }]} numberOfLines={1}>
            YouTube Live
          </Text>

          {hasPlayableLiveStream ? (
            <TouchableOpacity
              style={styles.backButton}
              onPress={toggleOrientation}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.8}
            >
              <Maximize2 size={18} color={primaryText} strokeWidth={2.2} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerRightSpacer} />
          )}
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        scrollEnabled={!isLandscapeTheater}
        style={styles.scroll}
        contentContainerStyle={isLandscapeTheater ? styles.landscapeScrollContent : styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            enabled={!isLandscapeTheater}
            refreshing={refreshing}
            onRefresh={() => resolveLiveStream(true)}
            tintColor="#EF4444"
            colors={['#EF4444']}
          />
        }
      >
        {/* ── VIDEO PLAYER SECTION (Same mounted instance across Portrait <-> Landscape) ── */}
        <View
          style={
            isLandscapeTheater
              ? styles.landscapeContainer
              : [
                  styles.playerContainer,
                  {
                    minHeight: responsiveHeight,
                    backgroundColor: cardSurface,
                    borderColor: adminBorderColor,
                    borderWidth: 1,
                  },
                ]
          }
        >
          {loading ? (
            <View style={[styles.playerPlaceholder, { height: responsiveHeight, backgroundColor: cardSurface }]}>
              <ActivityIndicator size="large" color="#EF4444" />
              <Text style={[styles.placeholderTxt, { color: secondaryText }]}>
                Connecting to Live Stream...
              </Text>
            </View>
          ) : streamStatus === 'live' && activeVideoId ? (
            <View
              style={
                isLandscapeTheater
                  ? { width: windowWidth, height: windowHeight, backgroundColor: '#000000' }
                  : [styles.playerFrame, { width: responsiveWidth, height: responsiveHeight }]
              }
            >
              <RhemaYouTubePlayer
                width={isLandscapeTheater ? windowWidth : responsiveWidth}
                height={isLandscapeTheater ? windowHeight : responsiveHeight}
                play={playing}
                autoPlay={true}
                isLive={true}
                videoId={activeVideoId}
                title={streamTitle}
                onChangeState={onPlayerStateChange}
                onFullScreenChange={handleFullScreenChange}
              />
              {isLandscapeTheater ? (
                <View
                  pointerEvents="box-none"
                  style={[
                    styles.landscapeOverlayBar,
                    {
                      top: Math.max(insets.top, 12),
                      left: Math.max(insets.left, 16),
                      right: Math.max(insets.right, 16),
                    },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.landscapePillBtn}
                    onPress={() => navigation.goBack()}
                    activeOpacity={0.8}
                  >
                    <ArrowLeft size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.landscapePillBtn}
                    onPress={toggleOrientation}
                    activeOpacity={0.8}
                  >
                    <Minimize2 size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ) : streamStatus === 'completed' ? (
            // Live Stream Completed — Do not play recorded video per Quick Access rules
            <View style={[styles.offlineBox, { minHeight: responsiveHeight + 20, backgroundColor: cardSurface }]}>
              <Text style={[styles.offlineTitle, { color: primaryText }]}>
                Live Stream Completed
              </Text>
              <Text style={styles.offlineTeluguTitle}>
                లైవ్ ప్రసారం ముగిసింది
              </Text>
              <Text style={[styles.offlineDesc, { color: secondaryText }]}>
                This live broadcast has concluded. Recorded worship services and sermon messages can be watched in the Sermons tab.
              </Text>
              <View style={styles.statusActionRow}>
                <TouchableOpacity
                  style={[styles.statusActionBtn, { backgroundColor: '#2563EB' }]}
                  onPress={() => navigation.navigate('Sermons')}
                  activeOpacity={0.85}
                >
                  <Video size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.statusActionBtnTxt}>Watch Past Sermons</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusActionBtn, styles.statusActionBtnSecondary, { borderColor: adminBorderColor }]}
                  onPress={() => resolveLiveStream(true)}
                  activeOpacity={0.85}
                >
                  <RefreshCw size={13} color={primaryText} style={{ marginRight: 5 }} />
                  <Text style={[styles.statusActionBtnTxt, { color: primaryText }]}>Check Again</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // No Live Stream Available Placeholder
            <View style={[styles.offlineBox, { minHeight: responsiveHeight + 20, backgroundColor: cardSurface }]}>
              <View
                style={[
                  styles.offlineIconRing,
                  {
                    backgroundColor: secondarySurface,
                    borderColor: adminBorderColor,
                  },
                ]}
              >
                <Radio size={34} color={secondaryText} />
              </View>
              <Text style={[styles.offlineTitle, { color: primaryText }]}>
                No Live Stream Available
              </Text>
              <Text style={styles.offlineTeluguTitle}>
                ప్రస్తుతం లైవ్ ప్రసారం అందుబాటులో లేదు
              </Text>
              <Text style={[styles.offlineDesc, { color: secondaryText }]}>
                {churchName} is not currently broadcasting live on YouTube. You will automatically receive a notification as soon as the live stream begins.
              </Text>
              <View style={styles.statusActionRow}>
                <TouchableOpacity
                  style={[styles.statusActionBtn, { backgroundColor: '#EF4444' }]}
                  onPress={() => resolveLiveStream(true)}
                  activeOpacity={0.85}
                >
                  <RefreshCw size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.statusActionBtnTxt}>Check Again</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusActionBtn, styles.statusActionBtnSecondary, { borderColor: adminBorderColor }]}
                  onPress={() => navigation.navigate('Sermons')}
                  activeOpacity={0.85}
                >
                  <Video size={14} color={primaryText} style={{ marginRight: 6 }} />
                  <Text style={[styles.statusActionBtnTxt, { color: primaryText }]}>Browse Sermons</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {!isLandscapeTheater ? (
          <>
        {/* ── STREAM DETAILS CARD ── */}
        <View
          style={[
            styles.detailsCard,
            {
              backgroundColor: cardSurface,
              borderColor: adminBorderColor,
            },
          ]}
        >
          {/* Status pill & share */}
          <View
            style={[
              styles.detailsTopRow,
              { justifyContent: streamStatus === 'live' ? 'space-between' : 'flex-end' },
            ]}
          >
            {streamStatus === 'live' && (
              <View
                style={[
                  styles.liveTag,
                  {
                    backgroundColor: '#DC2626',
                  },
                ]}
              >
                <Radio size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={[styles.liveTagTxt, { color: '#FFFFFF' }]}>
                  LIVE NOW · ప్రత్యక్ష ప్రసారం
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.shareBtn,
                {
                  backgroundColor: secondarySurface,
                  borderWidth: 1,
                  borderColor: adminBorderColor,
                },
              ]}
              onPress={handleShare}
              activeOpacity={0.8}
            >
              <Share2 size={15} color={primaryText} style={{ marginRight: 6 }} />
              <Text style={[styles.shareBtnTxt, { color: primaryText }]}>Share Stream</Text>
            </TouchableOpacity>
          </View>

          {/* Clean & Properly Aligned Title */}
          <Text style={[styles.streamTitle, { color: primaryText }]}>
            {formatCleanStreamTitle(streamTitle, streamStatus === 'live') ||
              (streamStatus === 'live'
                ? `${churchName} Live Worship Service`
                : `${churchName} YouTube Live Channel`)}
          </Text>

          {/* Church Author Row */}
          <View style={[styles.churchRow, { borderTopColor: adminBorderColor }]}>
            <View style={styles.churchAvatarBox}>
              {churchAvatar ? (
                <CachedImage
                  source={{ uri: churchAvatar }}
                  style={styles.churchAvatar}
                  resizeMode="cover"
                />
              ) : (
                <View
                  style={[
                    styles.churchAvatarPlaceholder,
                    { backgroundColor: isDark ? '#27272A' : '#000000' },
                  ]}
                >
                  <Text style={styles.churchAvatarLetter}>
                    {churchName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.churchNameTxt, { color: primaryText }]} numberOfLines={1}>
                  {churchName}
                </Text>
                <ShieldCheck size={14} color={primaryText} style={{ marginLeft: 5 }} />
              </View>
              <Text style={[styles.churchSubTxt, { color: secondaryText }]}>
                Official Church Live Broadcast
              </Text>
            </View>
          </View>
        </View>

        {/* ── QUICK ACTION TILES ── */}
        <View style={styles.quickTilesRow}>
          {/* Past Sermons */}
          <TouchableOpacity
            style={styles.quickTile}
            onPress={() => navigation.navigate('Sermons')}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.quickTileGrad,
                {
                  backgroundColor: cardSurface,
                  borderColor: adminBorderColor,
                },
              ]}
            >
              <View style={[styles.quickTileIconBox, { backgroundColor: '#7C3AED22' }]}>
                <Video size={18} color="#A78BFA" />
              </View>
              <Text style={[styles.quickTileTitle, { color: primaryText }]}>Past Sermons</Text>
              <Text style={[styles.quickTileSub, { color: secondaryText }]}>Watch recordings</Text>
            </View>
          </TouchableOpacity>

          {/* Daily Devotional */}
          <TouchableOpacity
            style={styles.quickTile}
            onPress={() => navigation.navigate('DailyVideo')}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.quickTileGrad,
                {
                  backgroundColor: cardSurface,
                  borderColor: adminBorderColor,
                },
              ]}
            >
              <View style={[styles.quickTileIconBox, { backgroundColor: '#DC262622' }]}>
                <Play size={18} color="#F87171" />
              </View>
              <Text style={[styles.quickTileTitle, { color: primaryText }]}>Devotional</Text>
              <Text style={[styles.quickTileSub, { color: secondaryText }]}>Daily message</Text>
            </View>
          </TouchableOpacity>

          {/* Prayer Wall */}
          <TouchableOpacity
            style={styles.quickTile}
            onPress={() => navigation.navigate('PrayerWall')}
            activeOpacity={0.85}
          >
            <View
              style={[
                styles.quickTileGrad,
                {
                  backgroundColor: cardSurface,
                  borderColor: adminBorderColor,
                },
              ]}
            >
              <View style={[styles.quickTileIconBox, { backgroundColor: secondarySurface }]}>
                <Heart size={18} color="#EF4444" />
              </View>
              <Text style={[styles.quickTileTitle, { color: primaryText }]}>Prayer Wall</Text>
              <Text style={[styles.quickTileSub, { color: secondaryText }]}>Ask for prayer</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── IN-APP STREAMING PROMISE ── */}
        <View
          style={[
            styles.infoBanner,
            {
              backgroundColor: cardSurface,
              borderColor: adminBorderColor,
            },
          ]}
        >
          <Tv size={18} color={primaryText} style={{ marginRight: 10, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoBannerTitle, { color: primaryText }]}>
              Seamless In-App Worship
            </Text>
            <Text style={[styles.infoBannerDesc, { color: secondaryText }]}>
              This live stream plays directly inside the Rhema app so you can worship,
              follow scripture, and engage without switching to external apps.
            </Text>
          </View>
        </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = createAdminThemedStyles({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1.2,
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    paddingHorizontal: 12,
  },
  headerRightSpacer: {
    width: 40,
    height: 40,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  playerContainer: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  playerFrame: {
    width: '100%',
    backgroundColor: '#000000',
    borderRadius: 16,
    overflow: 'hidden',
  },
  playerPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderTxt: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
  },
  offlineBox: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderRadius: 16,
  },
  landscapeScrollContent: {
    flexGrow: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  landscapeContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  landscapeOverlayBar: {
    position: 'absolute',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
  },
  landscapePillBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0, 0, 0, 0.56)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offlineIconRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  offlineTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  offlineTeluguTitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: '600',
  },
  offlineDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  statusActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
  },
  statusActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  statusActionBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  statusActionBtnTxt: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  refreshPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  refreshPillTxt: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },
  detailsCard: {
    marginHorizontal: 12,
    marginTop: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  detailsTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  liveTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveTagTxt: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  shareBtnTxt: {
    fontSize: 12,
    fontWeight: '600',
  },
  streamTitle: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
    marginBottom: 14,
    letterSpacing: -0.2,
    textAlign: 'left',
  },
  churchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  churchAvatarBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  churchAvatar: {
    width: 40,
    height: 40,
  },
  churchAvatarPlaceholder: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  churchAvatarLetter: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  churchNameTxt: {
    fontSize: 14,
    fontWeight: '700',
  },
  churchSubTxt: {
    fontSize: 11.5,
    marginTop: 1,
  },
  quickTilesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 12,
    marginTop: 14,
    gap: 8,
  },
  quickTile: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  quickTileGrad: {
    padding: 12,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
  },
  quickTileIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickTileTitle: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  quickTileSub: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  infoBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  infoBannerDesc: {
    fontSize: 11.5,
    lineHeight: 16,
  },
});
