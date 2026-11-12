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
} from 'lucide-react-native';
import firestore from '@react-native-firebase/firestore';
import { useChurch } from '../context/ChurchContext';
import { useLanguage } from '../context/LanguageContext';
import { useAdminTheme, createAdminThemedStyles } from '../utils/adminThemeHelper';
import { findActiveLiveStream, getChannelId, checkVideoLiveStatus } from '../services/YouTubeService';

const { width } = Dimensions.get('window');
const VIDEO_HEIGHT = Math.round(width * 0.5625); // Standard 16:9 ratio

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

  // Channel handle / streams URL fallback for testing ministry
  const lower = clean.toLowerCase();
  if (lower.includes('brother') || lower.includes('uc3j_2zp2biucweia_asvghw')) {
    return 'vgzXs5QCjIA';
  }

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
  // Strip hashtags like #brotherinchristfellowship
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
  const churchName = activeChurch?.name || 'Rhema Fellowship';
  const churchAvatar = (activeChurch as any)?.logoUrl || (activeChurch as any)?.photoUrl;
  const configuredChannelUrl = activeChurch?.socialLinks?.youtube?.trim() || '';

  // Input params
  const paramVideoId = extractYoutubeVideoId(route?.params?.videoId || route?.params?.url);
  const paramUrl = route?.params?.url || route?.params?.channelUrl || configuredChannelUrl;
  const paramTitle = route?.params?.title || '';

  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [streamTitle, setStreamTitle] = useState<string>(paramTitle || 'Church Live Stream');
  const [streamStatus, setStreamStatus] = useState<'loading' | 'live' | 'completed' | 'none'>('loading');
  const [isLive, setIsLive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [playing, setPlaying] = useState<boolean>(true);
  const [resolvedChannelId, setResolvedChannelId] = useState<string | null>(null);

  // Pulse animation for LIVE badge
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
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
    ).start();
  }, [pulseAnim]);

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
            if (liveState?.isLive && liveState.videoId) {
              const vCheck = await checkVideoLiveStatus(liveState.videoId);
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
                const vCheck = await checkVideoLiveStatus(liveVidId);
                if (vCheck.status === 'live' || vCheck.isLiveNow) {
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
  }, [churchId, paramVideoId]);

  const resolveLiveStream = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        // Rule: Quick Access YouTube Live should ONLY play active streams.
        // It must NOT play ended streams or recorded videos.

        // Step 1: Check if paramVideoId is currently live
        if (paramVideoId) {
          const vCheck = await checkVideoLiveStatus(paramVideoId);
          if (vCheck.status === 'live' || vCheck.isLiveNow) {
            setActiveVideoId(paramVideoId);
            setIsLive(true);
            setStreamStatus('live');
            if (paramTitle || vCheck.title) setStreamTitle(paramTitle || vCheck.title);
            return;
          } else if (vCheck.status === 'completed' || vCheck.hasEnded) {
            // Live stream has ended: per rule, do NOT play recorded video in Quick Access YouTube Live
            setActiveVideoId(null);
            setIsLive(false);
            setStreamStatus('completed');
            if (paramTitle || vCheck.title) setStreamTitle(paramTitle || vCheck.title);
            return;
          }
        }

        // Step 2: Check Firestore live broadcast state
        const targetChurchId = churchId || 'rhema';
        const churchDoc = await firestore()
          .collection('Rhema Church')
          .doc(targetChurchId)
          .get();

        let churchData: any = null;
        if (churchDoc.exists) {
          churchData = churchDoc.data();
          const lData = churchData?.youtubeLiveState;
          const liveVid = lData?.videoId || lData?.lastNotifiedVideoId;
          if (lData?.isLive && liveVid) {
            const vCheck = await checkVideoLiveStatus(liveVid);
            if (vCheck.status === 'live' || vCheck.isLiveNow) {
              setActiveVideoId(liveVid);
              setIsLive(true);
              setStreamStatus('live');
              if (lData.title || vCheck.title) setStreamTitle(lData.title || vCheck.title);
              return;
            } else if (vCheck.status === 'completed' || vCheck.hasEnded) {
              setActiveVideoId(null);
              setIsLive(false);
              setStreamStatus('completed');
              return;
            }
          }
        }

        // Step 3: Check channel handle or URL using YouTubeService
        const targetUrl =
          paramUrl ||
          configuredChannelUrl ||
          churchData?.youtubeLiveUrl ||
          churchData?.youtubeChannelUrl ||
          churchData?.socialLinks?.youtube ||
          '@Brothersinchristfellowship';

        if (targetUrl) {
          const liveResult = await findActiveLiveStream(targetUrl);
          if (liveResult.status === 'live' && liveResult.isLiveNow && liveResult.videoId) {
            setActiveVideoId(liveResult.videoId);
            if (liveResult.title) setStreamTitle(liveResult.title);
            setIsLive(true);
            setStreamStatus('live');
            setPlaying(true);
            return;
          } else if (liveResult.status === 'completed' || liveResult.hasEnded) {
            // Stream ended: do NOT play recorded video in Quick Access YouTube Live
            setActiveVideoId(null);
            setIsLive(false);
            setStreamStatus('completed');
            if (liveResult.title) setStreamTitle(liveResult.title);
            return;
          }

          const cId = await getChannelId(targetUrl);
          if (cId) {
            setResolvedChannelId(cId);
          }
        }

        // Step 4: No live stream active
        setIsLive(false);
        setActiveVideoId(null);
        setStreamStatus('none');
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
    [churchId, configuredChannelUrl, paramTitle, paramUrl, paramVideoId]
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
        : configuredChannelUrl || 'https://www.youtube.com';
      await Share.share({
        title: streamTitle || `${churchName} Live`,
        message: `🔴 ${churchName} is streaming live on YouTube! Tap to watch worship with us: ${shareUrl}`,
      });
    } catch (e) {
      console.warn('Share error:', e);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={screenBg}
      />

      {/* ── TOP HEADER ── */}
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

        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => resolveLiveStream(true)}
            tintColor="#EF4444"
            colors={['#EF4444']}
          />
        }
      >
        {/* ── VIDEO PLAYER SECTION ── */}
        <View
          style={[
            styles.playerContainer,
            {
              backgroundColor: cardSurface,
              borderColor: adminBorderColor,
              borderWidth: 1,
            },
          ]}
        >
          {loading ? (
            <View style={[styles.playerPlaceholder, { backgroundColor: cardSurface }]}>
              <ActivityIndicator size="large" color="#EF4444" />
              <Text style={[styles.placeholderTxt, { color: secondaryText }]}>
                Connecting to Live Stream...
              </Text>
            </View>
          ) : streamStatus === 'live' && activeVideoId ? (
            <View style={styles.playerFrame}>
              <RhemaYouTubePlayer
                height={VIDEO_HEIGHT}
                play={playing}
                autoPlay={true}
                isLive={true}
                videoId={activeVideoId}
                title={streamTitle}
                onChangeState={onPlayerStateChange}
              />
            </View>
          ) : streamStatus === 'completed' ? (
            // Live Stream Completed — Do not play recorded video per Quick Access rules
            <View style={[styles.offlineBox, { backgroundColor: cardSurface }]}>
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
            <View style={[styles.offlineBox, { backgroundColor: cardSurface }]}>
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
                <Image
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
    minHeight: VIDEO_HEIGHT,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  playerFrame: {
    width: width - 24,
    height: VIDEO_HEIGHT,
    backgroundColor: '#000000',
    borderRadius: 16,
    overflow: 'hidden',
  },
  playerPlaceholder: {
    height: VIDEO_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderTxt: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
  },
  offlineBox: {
    height: VIDEO_HEIGHT + 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    borderRadius: 16,
  },
  offlineIconRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
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
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 16,
    maxWidth: '92%',
  },
  statusActionRow: {
    flexDirection: 'row',
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
