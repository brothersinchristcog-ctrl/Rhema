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
import { LinearGradient } from 'expo-linear-gradient';
import YoutubePlayer from 'react-native-youtube-iframe';
import { WebView } from 'react-native-webview';
import {
  ChevronLeft,
  Radio,
  Share2,
  RefreshCw,
  Play,
  Heart,
  BookOpen,
  Video,
  ShieldCheck,
  Tv,
} from 'lucide-react-native';
import firestore from '@react-native-firebase/firestore';
import { useChurch } from '../context/ChurchContext';
import { useLanguage } from '../context/LanguageContext';
import { findActiveLiveStream, getChannelId } from '../services/YouTubeService';

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

  return '';
}

export default function YouTubeLiveScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { activeChurch } = useChurch();
  const { t } = useLanguage();

  const churchId = route?.params?.churchId || activeChurch?.id || 'rhema';
  const churchName = activeChurch?.name || 'Rhema Fellowship';
  const churchAvatar = activeChurch?.logoUrl || activeChurch?.photoUrl;
  const configuredChannelUrl = activeChurch?.socialLinks?.youtube?.trim() || '';

  // Input params
  const paramVideoId = extractYoutubeVideoId(route?.params?.videoId || route?.params?.url);
  const paramUrl = route?.params?.url || route?.params?.channelUrl || configuredChannelUrl;
  const paramTitle = route?.params?.title || '';

  const [activeVideoId, setActiveVideoId] = useState<string>(paramVideoId);
  const [streamTitle, setStreamTitle] = useState<string>(paramTitle);
  const [isLive, setIsLive] = useState<boolean>(Boolean(paramVideoId));
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
    // Listen directly to Rhema Church/rhema document for live status
    const unsubscribeChurch = firestore()
      .collection('Rhema Church')
      .doc(churchId || 'rhema')
      .onSnapshot(
        (doc) => {
          if (doc.exists) {
            const data = doc.data();
            const liveState = data?.youtubeLiveState;
            if (liveState?.isLive) {
              setIsLive(true);
              if (liveState.videoId) setActiveVideoId(liveState.videoId);
              if (liveState.title) setStreamTitle(liveState.title);
            } else if (!paramVideoId) {
              setIsLive(false);
            }
          }
        },
        (err) => console.warn('[YouTubeLiveScreen] church snapshot notice:', err)
      );

    // Also check if there's an active online_meeting
    const unsubscribeMeetings = firestore()
      .collection('Rhema Church')
      .doc(churchId || 'rhema')
      .collection('online_meetings')
      .where('status', '==', 'live')
      .limit(1)
      .onSnapshot(
        (snapshot) => {
          if (snapshot && !snapshot.empty) {
            const mData = snapshot.docs[0].data();
            if (mData.youtubeLive?.watchUrl || mData.youtubeLive?.broadcastId) {
              const liveVidId =
                mData.youtubeLive.broadcastId ||
                extractYoutubeVideoId(mData.youtubeLive.watchUrl);
              if (liveVidId) {
                setActiveVideoId(liveVidId);
                setIsLive(true);
                if (mData.title) setStreamTitle(mData.title);
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
        // Step 1: If an explicit videoId was passed in route params, honor it
        if (paramVideoId) {
          setActiveVideoId(paramVideoId);
          setIsLive(true);
          if (paramTitle) setStreamTitle(paramTitle);
          setLoading(false);
          setRefreshing(false);
          return;
        }

        const targetChurchId = churchId || 'rhema';
        // Step 2: Check live state directly from Rhema Church/rhema document
        const churchDoc = await firestore()
          .collection('Rhema Church')
          .doc(targetChurchId)
          .get();

        if (churchDoc.exists) {
          const cData = churchDoc.data();
          const lData = cData?.youtubeLiveState;
          if (lData?.isLive && lData?.videoId) {
            setActiveVideoId(lData.videoId);
            setIsLive(true);
            if (lData.title) setStreamTitle(lData.title);
            setLoading(false);
            setRefreshing(false);
            return;
          }
        }

        // Step 3: Check channel handle or URL using YouTubeService search API
        const targetUrl = paramUrl || configuredChannelUrl;
        if (targetUrl) {
          // Try to extract videoId if URL points to a specific video
          const directId = extractYoutubeVideoId(targetUrl);
          if (directId) {
            setActiveVideoId(directId);
            setIsLive(true);
            setLoading(false);
            setRefreshing(false);
            return;
          }

          // Search for active live broadcast via YouTube Data API
          const liveResult = await findActiveLiveStream(targetUrl);
          if (liveResult?.videoId) {
            setActiveVideoId(liveResult.videoId);
            setStreamTitle(liveResult.title);
            setIsLive(true);
            setLoading(false);
            setRefreshing(false);
            return;
          }

          // Resolve channel ID for embed fallback
          const cId = await getChannelId(targetUrl);
          if (cId) {
            setResolvedChannelId(cId);
          }
        }

        // No active live stream found
        setIsLive(false);
      } catch (err) {
        console.warn('[YouTubeLiveScreen] resolveLiveStream error:', err);
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

  const channelEmbedUri = resolvedChannelId
    ? `https://www.youtube-nocookie.com/embed/live_stream?channel=${resolvedChannelId}&autoplay=1&playsinline=1`
    : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0B111A" />

      {/* ── TOP HEADER ── */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <ChevronLeft size={22} color="#FFFFFF" strokeWidth={2.5} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            YouTube Live
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {churchName}
          </Text>
        </View>

        {/* Live indicator badge */}
        <View
          style={[
            styles.headerLiveBadge,
            { backgroundColor: isLive ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.08)' },
          ]}
        >
          {isLive && (
            <Animated.View
              style={[
                styles.livePulseDot,
                { opacity: pulseAnim, backgroundColor: '#EF4444' },
              ]}
            />
          )}
          <Text
            style={[
              styles.headerLiveBadgeTxt,
              { color: isLive ? '#EF4444' : '#94A3B8' },
            ]}
          >
            {isLive ? 'LIVE' : 'OFFLINE'}
          </Text>
        </View>
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
        <View style={styles.playerContainer}>
          {loading ? (
            <View style={styles.playerPlaceholder}>
              <ActivityIndicator size="large" color="#EF4444" />
              <Text style={styles.placeholderTxt}>Connecting to Live Stream...</Text>
            </View>
          ) : activeVideoId ? (
            // Native YouTube IFrame Player (In-App)
            <View style={styles.playerFrame}>
              <YoutubePlayer
                height={VIDEO_HEIGHT}
                play={playing}
                videoId={activeVideoId}
                onChangeState={onPlayerStateChange}
                webViewProps={{
                  allowsFullscreenVideo: true,
                  androidLayerType: 'hardware',
                  scrollEnabled: false,
                  // STRICT: Prevent any redirect to external YouTube app or browser
                  onShouldStartLoadWithRequest: (req) => {
                    // Only allow requests that stay inside youtube iframe/embed
                    if (
                      req.url.includes('youtube.com/embed') ||
                      req.url.includes('googlevideo.com') ||
                      req.url.includes('about:blank')
                    ) {
                      return true;
                    }
                    return false;
                  },
                }}
              />
            </View>
          ) : isLive && channelEmbedUri ? (
            // Embedded Channel Live Stream WebView (In-App)
            <View style={styles.playerFrame}>
              <WebView
                source={{ uri: channelEmbedUri }}
                style={{ width: width - 24, height: VIDEO_HEIGHT, backgroundColor: '#000' }}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                allowsFullscreenVideo={true}
                onShouldStartLoadWithRequest={(req) => {
                  if (
                    req.url.includes('youtube') ||
                    req.url.includes('googlevideo') ||
                    req.url.includes('about:blank')
                  ) {
                    return true;
                  }
                  return false;
                }}
              />
            </View>
          ) : (
            // Stream Offline / Waiting Placeholder
            <LinearGradient
              colors={['#182333', '#0F1722', '#0A0E17']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.offlineBox}
            >
              <View style={styles.offlineIconRing}>
                <Radio size={36} color="#94A3B8" />
              </View>
              <Text style={styles.offlineTitle}>Stream is Not Currently Live</Text>
              <Text style={styles.offlineDesc}>
                {churchName} is not broadcasting live on YouTube at this moment.
                You will automatically receive a push notification as soon as the live stream begins.
              </Text>
              <TouchableOpacity
                style={styles.refreshPill}
                onPress={() => resolveLiveStream(true)}
                activeOpacity={0.8}
              >
                <RefreshCw size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.refreshPillTxt}>Check Again</Text>
              </TouchableOpacity>
            </LinearGradient>
          )}
        </View>

        {/* ── STREAM DETAILS CARD ── */}
        <View style={styles.detailsCard}>
          {/* Status pill & share */}
          <View style={styles.detailsTopRow}>
            <View
              style={[
                styles.liveTag,
                { backgroundColor: isLive ? '#DC2626' : '#334155' },
              ]}
            >
              <Radio size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.liveTagTxt}>
                {isLive ? 'LIVE NOW' : 'STREAM WAITING'}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.shareBtn}
              onPress={handleShare}
              activeOpacity={0.8}
            >
              <Share2 size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.shareBtnTxt}>Share Stream</Text>
            </TouchableOpacity>
          </View>

          {/* Title */}
          <Text style={styles.streamTitle}>
            {streamTitle ||
              (isLive
                ? `${churchName} Live Worship Service`
                : `${churchName} YouTube Live Channel`)}
          </Text>

          {/* Church Author Row */}
          <View style={styles.churchRow}>
            <View style={styles.churchAvatarBox}>
              {churchAvatar ? (
                <Image
                  source={{ uri: churchAvatar }}
                  style={styles.churchAvatar}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.churchAvatarPlaceholder}>
                  <Text style={styles.churchAvatarLetter}>
                    {churchName.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.churchNameTxt} numberOfLines={1}>
                  {churchName}
                </Text>
                <ShieldCheck size={14} color="#3B82F6" style={{ marginLeft: 5 }} />
              </View>
              <Text style={styles.churchSubTxt}>Official Church Live Broadcast</Text>
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
            <LinearGradient
              colors={['#1E293B', '#0F172A']}
              style={styles.quickTileGrad}
            >
              <View style={[styles.quickTileIconBox, { backgroundColor: '#7C3AED22' }]}>
                <Video size={18} color="#A78BFA" />
              </View>
              <Text style={styles.quickTileTitle}>Past Sermons</Text>
              <Text style={styles.quickTileSub}>Watch recordings</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Daily Devotional */}
          <TouchableOpacity
            style={styles.quickTile}
            onPress={() => navigation.navigate('DailyVideo')}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#1E293B', '#0F172A']}
              style={styles.quickTileGrad}
            >
              <View style={[styles.quickTileIconBox, { backgroundColor: '#DC262622' }]}>
                <Play size={18} color="#F87171" />
              </View>
              <Text style={styles.quickTileTitle}>Devotional</Text>
              <Text style={styles.quickTileSub}>Daily message</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Prayer Wall */}
          <TouchableOpacity
            style={styles.quickTile}
            onPress={() => navigation.navigate('PrayerWall')}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#1E293B', '#0F172A']}
              style={styles.quickTileGrad}
            >
              <View style={[styles.quickTileIconBox, { backgroundColor: '#0284C722' }]}>
                <Heart size={18} color="#38BDF8" />
              </View>
              <Text style={styles.quickTileTitle}>Prayer Wall</Text>
              <Text style={styles.quickTileSub}>Ask for prayer</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── IN-APP STREAMING PROMISE ── */}
        <View style={styles.infoBanner}>
          <Tv size={18} color="#60A5FA" style={{ marginRight: 10, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoBannerTitle}>Seamless In-App Worship</Text>
            <Text style={styles.infoBannerDesc}>
              This live stream plays directly inside the Rhema app so you can worship,
              follow scripture, and engage without switching to external apps.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B111A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: '#0B111A',
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 1,
  },
  headerLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 5,
  },
  headerLiveBadgeTxt: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
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
    backgroundColor: '#000000',
    minHeight: VIDEO_HEIGHT,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
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
    backgroundColor: '#0F172A',
  },
  placeholderTxt: {
    color: '#94A3B8',
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
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  offlineTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
    textAlign: 'center',
  },
  offlineDesc: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 14,
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
    backgroundColor: '#111927',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
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
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  shareBtnTxt: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  streamTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 24,
    marginBottom: 14,
    letterSpacing: -0.3,
  },
  churchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
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
    backgroundColor: '#2563EB',
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
    color: '#FFFFFF',
  },
  churchSubTxt: {
    fontSize: 11.5,
    color: '#94A3B8',
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
    borderColor: 'rgba(255, 255, 255, 0.05)',
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
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  quickTileSub: {
    color: '#94A3B8',
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
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  infoBannerTitle: {
    color: '#93C5FD',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 3,
  },
  infoBannerDesc: {
    color: '#94A3B8',
    fontSize: 11.5,
    lineHeight: 16,
  },
});

