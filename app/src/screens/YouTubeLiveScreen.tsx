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
} from 'lucide-react-native';
import firestore from '@react-native-firebase/firestore';
import { useChurch } from '../context/ChurchContext';
import { useLanguage } from '../context/LanguageContext';
import { useAdminTheme, createAdminThemedStyles } from '../utils/adminThemeHelper';
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
        if (paramVideoId) {
          setActiveVideoId(paramVideoId);
          setIsLive(true);
          if (paramTitle) setStreamTitle(paramTitle);
          setLoading(false);
          setRefreshing(false);
          return;
        }

        const targetChurchId = churchId || 'rhema';
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

        const targetUrl = paramUrl || configuredChannelUrl;
        if (targetUrl) {
          const directId = extractYoutubeVideoId(targetUrl);
          if (directId) {
            setActiveVideoId(directId);
            setIsLive(true);
            setLoading(false);
            setRefreshing(false);
            return;
          }

          const liveResult = await findActiveLiveStream(targetUrl);
          if (liveResult?.videoId) {
            setActiveVideoId(liveResult.videoId);
            setStreamTitle(liveResult.title);
            setIsLive(true);
            setLoading(false);
            setRefreshing(false);
            return;
          }

          const cId = await getChannelId(targetUrl);
          if (cId) {
            setResolvedChannelId(cId);
          }
        }

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
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.backButton,
            { backgroundColor: cardSurface, borderColor: adminBorderColor, borderWidth: 1 },
          ]}
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
          ) : activeVideoId ? (
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
                  onShouldStartLoadWithRequest: (req) => {
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
                <Radio size={36} color={secondaryText} />
              </View>
              <Text style={[styles.offlineTitle, { color: primaryText }]}>
                Stream is Not Currently Live
              </Text>
              <Text style={[styles.offlineDesc, { color: secondaryText }]}>
                {churchName} is not broadcasting live on YouTube at this moment. You will
                automatically receive a push notification as soon as the live stream begins.
              </Text>
              <TouchableOpacity
                style={styles.refreshPill}
                onPress={() => resolveLiveStream(true)}
                activeOpacity={0.8}
              >
                <RefreshCw size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.refreshPillTxt}>Check Again</Text>
              </TouchableOpacity>
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
          <View style={styles.detailsTopRow}>
            <View
              style={[
                styles.liveTag,
                {
                  backgroundColor: isLive ? '#DC2626' : secondarySurface,
                  borderWidth: isLive ? 0 : 1,
                  borderColor: adminBorderColor,
                },
              ]}
            >
              <Radio
                size={12}
                color={isLive ? '#FFFFFF' : primaryText}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.liveTagTxt,
                  { color: isLive ? '#FFFFFF' : primaryText },
                ]}
              >
                {isLive ? 'LIVE NOW' : 'STREAM WAITING'}
              </Text>
            </View>

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

          {/* Title */}
          <Text style={[styles.streamTitle, { color: primaryText }]}>
            {streamTitle ||
              (isLive
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
    paddingHorizontal: 18,
    paddingBottom: 12,
    zIndex: 10,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
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
    width: 42,
    height: 42,
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
    marginBottom: 6,
    textAlign: 'center',
  },
  offlineDesc: {
    fontSize: 12.5,
    lineHeight: 18,
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
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    marginBottom: 14,
    letterSpacing: -0.3,
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
