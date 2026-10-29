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
  Alert,
  Modal 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import YoutubePlayer from 'react-native-youtube-iframe';
import { 
  ChevronLeft, 
  Share2, 
  Play, 
  Clock, 
  Video, 
  ExternalLink,
  ChevronRight,
  Heart,
  BellOff,
  X 
} from 'lucide-react-native';
import FirestoreService, { FirestoreVideo } from '../services/FirestoreService';
import { useChurch } from '../context/ChurchContext';

const { width } = Dimensions.get('window');

const extractYoutubeId = (url: string) => {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.trim();
  const match = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/);
  if (match) return match[1];

  if (/^[\w-]{11}$/.test(cleanUrl)) return cleanUrl;

  const secMatch = cleanUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11})(?:[&?]|$)/);
  if (secMatch) return secMatch[1];

  return cleanUrl.startsWith('http') ? '' : cleanUrl;
};

interface DevotionalVideo extends FirestoreVideo {
  date?: string;
  pastor?: string;
}

import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function DailyVideoScreen({ navigation, route }: any) {
  const [videos, setVideos] = useState<DevotionalVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [activeVideo, setActiveVideo] = useState<DevotionalVideo | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showUnsubModal, setShowUnsubModal] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { activeChurch } = useChurch();
  const insets = useSafeAreaInsets();

  // Load persistent subscription state
  useEffect(() => {
    AsyncStorage.getItem('@rhema_youtube_subscribed').then((val) => {
      if (val === 'true') {
        setIsSubscribed(true);
      }
    }).catch(() => {});
  }, []);

  // Initial load from params or fetch
  useEffect(() => {
    const init = async () => {
      const promiseData = await FirestoreService.getDailyPromisesArchive();
      const data: DevotionalVideo[] = promiseData
        .filter(p => p.youtubeId && extractYoutubeId(p.youtubeId))
        .map(p => ({
          id: p.id || '',
          title: p.videoTitle || "Today's Devotional",
          youtubeId: p.youtubeId || '',
          publishedAt: p.date,
          date: p.date,
          duration: p.duration || '',
          pastor: p.pastor || 'Pastor'
        }));
      setVideos(data);
      
      const paramId = route?.params?.youtubeId;
      const paramTitle = route?.params?.videoTitle;
      const paramPastor = route?.params?.pastor;

      if (paramId && extractYoutubeId(paramId)) {
        const found = data.find(v => extractYoutubeId(v.youtubeId) === extractYoutubeId(paramId));
        if (found) {
          setActiveVideo(found);
        } else {
          // If not in archive, create a direct video object using passed params
          setActiveVideo({
            id: 'direct-' + extractYoutubeId(paramId),
            title: paramTitle || 'Today\'s Devotional',
            youtubeId: paramId,
            publishedAt: 'Today',
            date: 'Today',
            duration: '',
            pastor: paramPastor || 'Pastor'
          });
        }
      } else if (data.length > 0) {
        // Fallback to the latest promise video from the church archive
        setActiveVideo(data[0]);
      } else {
        // Fallback to church's youtube live/channel
        const fallbackId = activeChurch?.socialLinks?.youtube ? extractYoutubeId(activeChurch.socialLinks.youtube) : '';
        setActiveVideo({
          id: 'church-live',
          title: activeChurch?.name ? `${activeChurch.name} Live / Channel` : 'Today\'s Devotional',
          youtubeId: fallbackId || 'live', 
          publishedAt: 'Today',
          date: 'Today',
          duration: '',
          pastor: 'Main Speaker'
        });
      }
      setLoading(false);
    };
    init();
  }, [route?.params?.youtubeId]);

  const onStateChange = useCallback((state: string) => {
    if (state === 'ended') setPlaying(false);
  }, []);

  const handleShare = async () => {
    if (!activeVideo) return;
    try {
      const vidId = extractYoutubeId(activeVideo.youtubeId);
      const shareUrl = vidId ? `https://youtu.be/${vidId}` : 'https://www.youtube.com/@RhemaGlobalMinistries';
      await Share.share({
        message: `Watch this powerful teaching: "${activeVideo.title}" - ${shareUrl}`,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleSubscribeToggle = async () => {
    if (isSubscribed) {
      setShowUnsubModal(true);
    } else {
      const channelUrl = 'https://www.youtube.com/@RhemaGlobalMinistries';
      try {
        await Linking.openURL(channelUrl);
      } catch (err) {
        console.error('Failed to open YouTube channel:', err);
      }
      setIsSubscribed(true);
      await AsyncStorage.setItem('@rhema_youtube_subscribed', 'true').catch(() => {});
    }
  };

  const confirmUnsubscribe = async () => {
    setShowUnsubModal(false);
    setIsSubscribed(false);
    await AsyncStorage.setItem('@rhema_youtube_subscribed', 'false').catch(() => {});
    const channelUrl = 'https://www.youtube.com/@RhemaGlobalMinistries';
    try {
      await Linking.openURL(channelUrl);
    } catch (err) {
      console.error('Failed to open YouTube channel:', err);
    }
  };

  if (loading && !activeVideo) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fbbf24" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a2d5a" />
      
      {/* ── Page Header ── */}
      <View style={[styles.pageHeader, { paddingTop: Platform.OS === 'ios' ? insets.top || 50 : insets.top || 20 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={20} color="#aac4e8" />
          <Text style={styles.backBtnTxt}>Back</Text>
        </TouchableOpacity>
        <View style={styles.titleCol}>
          <Text style={styles.pageTitle}>Video Devotional</Text>
          <Text style={styles.pageSub}>ప్రార్థన సందేశం</Text>
        </View>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        
        {/* ── Video Player ── */}
        <View style={styles.playerSection}>
          <YoutubePlayer
            height={width * 0.56}
            play={playing}
            videoId={extractYoutubeId(activeVideo?.youtubeId || '')}
            onChangeState={onStateChange}
          />
        </View>

        {/* ── Video Details ── */}
        <View style={styles.videoDetails}>
          <Text style={styles.videoTitle}>{activeVideo?.title || (activeChurch?.name ? `${activeChurch.name} Live` : 'Today\'s Devotional')}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Play size={12} color="#c0392b" fill="#c0392b" />
              <Text style={styles.metaTxt}>Featured Teaching</Text>
            </View>
            <View style={styles.metaItem}>
              <Clock size={12} color="#6B7280" />
              <Text style={styles.metaTxt}>{activeVideo?.date ? (activeVideo.date === 'Today' ? 'Today' : new Date(activeVideo.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })) : 'Today'}</Text>
            </View>
          </View>

          <View style={styles.pastorCard}>
            <View style={styles.pastorAv}><Text style={styles.pastorAvTxt}>P</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pastorName}>{activeVideo?.pastor || 'Pastor'}</Text>
              <Text style={styles.pastorRole}>Main Speaker</Text>
            </View>
            <TouchableOpacity 
              style={isSubscribed ? styles.unsubBtn : styles.subBtn} 
              onPress={handleSubscribeToggle}
            >
              <Text style={isSubscribed ? styles.unsubBtnTxt : styles.subBtnTxt}>
                {isSubscribed ? 'Unsubscribe' : 'Subscribe'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Share2 size={16} color="#fff" />
            <Text style={styles.shareBtnTxt}>Share this message</Text>
          </TouchableOpacity>
        </View>

        {/* ── Archive ── */}
        <Text style={styles.secLbl}>PAST PROMISES</Text>
        <View style={styles.archiveList}>
          {(() => {
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
            const sevenDaysAgoStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysAgo.getDate()).padStart(2, '0')}`;

            const pastVideos = videos.filter(v => {
              if (v.id === activeVideo?.id) return false;
              if (!v.date || v.date === 'Today') return false;
              return v.date < todayStr && v.date >= sevenDaysAgoStr;
            });

            if (pastVideos.length === 0) {
              return (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ color: '#9CA3AF', fontSize: 12, fontStyle: 'italic' }}>No other past video promises available.</Text>
                </View>
              );
            }

            return pastVideos.map((video) => {
              const vidId = extractYoutubeId(video.youtubeId);
              return (
                <TouchableOpacity 
                  key={video.id} 
                  style={styles.archiveItem}
                  onPress={() => {
                    setActiveVideo(video);
                    scrollRef.current?.scrollTo({ y: 0, animated: true });
                  }}
                >
                  <View style={styles.thumbBox}>
                    <Image 
                      source={{ uri: `https://img.youtube.com/vi/${vidId}/mqdefault.jpg` }} 
                      style={styles.thumb} 
                    />
                    <View style={styles.playIcon}><Play size={10} color="#fff" fill="#fff" /></View>
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle} numberOfLines={1}>{video.title}</Text>
                    <Text style={styles.itemMeta}>{video.date ? new Date(video.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''} · {video.duration}</Text>
                  </View>
                  <ChevronRight size={16} color="#D1D5DB" />
                </TouchableOpacity>
              );
            });
          })()}
        </View>

      </ScrollView>

      {/* ── Beautiful Unsubscribe Confirmation Modal ── */}
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
          <View style={styles.unsubModalCard}>
            <TouchableOpacity 
              style={styles.modalCloseBtn}
              onPress={() => setShowUnsubModal(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={16} color="#6B7280" />
            </TouchableOpacity>

            <View style={styles.unsubIconBadge}>
              <View style={styles.unsubIconInner}>
                <BellOff size={26} color="#DC2626" />
              </View>
            </View>

            <Text style={styles.unsubModalTitle}>Unsubscribe?</Text>
            <Text style={styles.unsubModalMessage}>
              Are you sure you want to unsubscribe from{'\n'}
              <Text style={{ fontWeight: '700', color: '#111827' }}>Rhema Global Ministries</Text>?
            </Text>

            <Text style={styles.unsubModalSubtext}>
              You won't receive notification updates when new daily promises & video devotionals are released.
            </Text>

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setShowUnsubModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelBtnTxt}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={confirmUnsubscribe}
                activeOpacity={0.8}
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
  container: { flex: 1, backgroundColor: '#FAF7F2' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a2d5a' },
  
  // Header
  pageHeader: {
    backgroundColor: '#1a2d5a',
    paddingTop: Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 45),
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, minWidth: 60 },
  backBtnTxt: { color: '#aac4e8', fontSize: 13, fontWeight: '500' },
  titleCol: { flex: 1, alignItems: 'center' },
  pageTitle: { color: '#fff', fontSize: 14, fontWeight: '600' },
  pageSub: { color: '#aac4e8', fontSize: 9.5, marginTop: 1 },

  scroll: { paddingBottom: 40 },

  playerSection: { backgroundColor: '#000', width: '100%' },

  videoDetails: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  videoTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 15, marginBottom: 20 },
  metaItem: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  metaTxt: { fontSize: 11, color: '#6B7280', fontWeight: '500' },

  pastorCard: { 
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 12, 
    backgroundColor: '#f9fafb', borderRadius: 14, marginBottom: 15,
    borderWidth: 0.5, borderColor: '#e5e7eb'
  },
  pastorAv: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#c0392b', justifyContent: 'center', alignItems: 'center' },
  pastorAvTxt: { color: '#fff', fontWeight: '700' },
  pastorName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  pastorRole: { fontSize: 10, color: '#6B7280', marginTop: 1 },
  subBtn: { backgroundColor: '#1a2d5a', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 },
  subBtnTxt: { color: '#fff', fontSize: 10, fontWeight: '700' },
  unsubBtn: { backgroundColor: '#e2e8f0', paddingHorizontal: 13, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' },
  unsubBtnTxt: { color: '#475569', fontSize: 10, fontWeight: '700' },

  shareBtn: { backgroundColor: '#c0392b', paddingVertical: 14, borderRadius: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8 },
  shareBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  secLbl: { fontSize: 10, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.6, marginHorizontal: 16, marginBottom: 12, marginTop: 20 },
  
  archiveList: { backgroundColor: '#fff', marginHorizontal: 12, borderRadius: 16, overflow: 'hidden', borderWidth: 0.5, borderColor: '#e5e7eb' },
  archiveItem: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', padding: 12, borderBottomWidth: 0.5, borderBottomColor: '#f3f4f6', gap: 12 },
  thumbBox: { width: 80, height: 60, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  thumb: { width: '100%', height: '100%' },
  playIcon: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  itemInfo: { flex: 1 },
  itemTitle: { fontSize: 12, fontWeight: '600', color: '#111827' },
  itemMeta: { fontSize: 9.5, color: '#9CA3AF', marginTop: 2 },

  // Beautiful Unsubscribe Modal Styles
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
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    position: 'relative',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unsubIconBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  unsubIconInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FEF2F2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
  },
  unsubModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  unsubModalMessage: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 10,
  },
  unsubModalSubtext: {
    fontSize: 11.5,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  modalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnTxt: {
    color: '#374151',
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
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  modalConfirmBtnTxt: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
});
