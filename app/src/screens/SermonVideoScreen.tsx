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
import { WebView } from 'react-native-webview';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  ChevronLeft, 
  ArrowLeft,
  Share2, 
  Play, 
  Clock, 
  Video, 
  ExternalLink,
  ChevronRight,
  Heart,
  BellOff,
  X,
  BookOpen,
  Maximize2,
  ChevronUp,
  ChevronDown,
  Calendar as CalendarIcon,
  Folder
} from 'lucide-react-native';
import FirestoreService from '../services/FirestoreService';
import { useChurch } from '../context/ChurchContext';
import { useLanguage } from '../context/LanguageContext';
import { formatSermonDuration, formatDateDisplay } from '../utils/DateUtils';

const { width } = Dimensions.get('window');

const extractYoutubeId = (url: string) => {
  if (!url || typeof url !== 'string') return '';
  const cleanUrl = url.trim();
  const match = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]+)/);
  const id = match ? match[1] : cleanUrl;
  return id;
};

import { useSafeAreaInsets } from 'react-native-safe-area-context';

const formatSermonDate = (dateVal: string | null | undefined): string => {
  if (!dateVal) return '';
  const clean = dateVal.trim();
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  }
  return formatDateDisplay(clean);
};

const formatNotesTitle = (fileName?: string) => {
  if (!fileName) return 'Sermon Study Notes';
  let name = fileName.replace(/\.(pdf|docx?|txt)$/i, '');
  name = name.replace(/[_-]+/g, ' ').trim();
  name = name.replace(/sermonpdf$/i, 'Sermon Notes');
  name = name.replace(/pdf$/i, '');
  name = name.split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  if (!name.toLowerCase().includes('note') && !name.toLowerCase().includes('sermon')) {
    name += ' Notes';
  }
  return name.trim() || 'Sermon Study Notes';
};

const injectedGviewCSS = `
  (function() {
    try {
      var style = document.createElement('style');
      style.innerHTML = "body, html, #drive-viewer-root, .drive-viewer-paginated-scrollable { background: #FFFFFF !important; background-color: #FFFFFF !important; margin: 0 !important; padding: 0 !important; } .drive-viewer-toolstrip { display: none !important; } .drive-viewer-page-container { margin: 6px auto !important; box-shadow: 0 1px 3px rgba(0,0,0,0.12) !important; border: 1px solid #E5E7EB !important; } img { max-width: 100% !important; }";
      document.head.appendChild(style);
    } catch(e) {}
  })();
  true;
`;

export default function SermonVideoScreen({ navigation, route }: any) {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [activeVideo, setActiveVideo] = useState<any | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showUnsubModal, setShowUnsubModal] = useState(false);
  const [inlineNotesText, setInlineNotesText] = useState<string>('');
  const [loadingTextNotes, setLoadingTextNotes] = useState(false);
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [showFullscreenNotes, setShowFullscreenNotes] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const { activeChurch } = useChurch();
  const { t } = useLanguage();
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
    let isCancelled = false;
    const init = async () => {
      setLoading(true);
      const promiseData = await FirestoreService.getSermons(50);
      const data: any[] = promiseData
        .filter(p => p.youtubeId && p.youtubeId.trim() !== '' && p.youtubeId !== 'mock')
        .map(p => ({
          ...p,
          id: p.id,
          title: p.title || 'Sermon',
          youtubeId: p.youtubeId,
          date: p.date,
          duration: p.duration || '',
          pastor: p.pastor || 'Pastor',
          thumbnailUrl: p.thumbnailUrl || p.imageUrl || '',
          notesUrl: p.notesUrl || '',
          notesFileName: p.notesFileName || '',
          notesFileType: p.notesFileType || '',
          notesText: p.notesText || '',
        }));
      if (isCancelled) return;
      setVideos(data);
      
      const sermonData = route?.params?.sermonData;
      const targetSermonId = route?.params?.sermonId || sermonData?.id;

      if (targetSermonId) {
        const cleanTargetId = String(targetSermonId).replace(/^sermon_/, '').trim();
        // 1. Check in fetched data
        const match = data.find(v => v.id === cleanTargetId || v.id === targetSermonId);
        if (match) {
          setActiveVideo(match);
          setPlaying(true);
          setLoading(false);
          return;
        }
        // 2. Direct fetch from Firestore if not in the first 50
        const directSermon = await FirestoreService.getSermonById(cleanTargetId);
        if (!isCancelled && directSermon) {
          const formattedDirect = {
            ...directSermon,
            id: directSermon.id,
            title: directSermon.title || 'Sermon',
            youtubeId: directSermon.youtubeId || '',
            date: directSermon.date || 'Today',
            duration: directSermon.duration || '',
            pastor: directSermon.pastor || 'Pastor',
            thumbnailUrl: directSermon.thumbnailUrl || directSermon.imageUrl || '',
            notesUrl: directSermon.notesUrl || '',
            notesFileName: directSermon.notesFileName || '',
            notesFileType: directSermon.notesFileType || '',
            notesText: directSermon.notesText || '',
          };
          setActiveVideo(formattedDirect);
          setPlaying(true);
          setLoading(false);
          return;
        }
      }

      // 3. Match by Sermon Title if ID lookup didn't match
      const targetTitle = route?.params?.title || route?.params?.sermonTitle;
      if (targetTitle) {
        const cleanTitle = String(targetTitle)
          .replace(/^[^\w\s]+/, '')
          .replace(/^New Sermon:\s*/i, '')
          .trim()
          .toLowerCase();
        if (cleanTitle.length > 2) {
          const match = data.find(v => {
            const vt = (v.title || v.titleEn || '').toLowerCase();
            return vt.includes(cleanTitle) || cleanTitle.includes(vt);
          });
          if (match) {
            setActiveVideo(match);
            setPlaying(true);
            setLoading(false);
            return;
          }
        }
      }

      if (sermonData) {
        setActiveVideo({
          ...sermonData,
          id: sermonData.id || 'direct',
          title: sermonData.title || 'Sermon',
          youtubeId: sermonData.youtubeId || '',
          date: sermonData.date || 'Today',
          duration: sermonData.duration || '',
          pastor: sermonData.pastor || 'Pastor',
          notesUrl: sermonData.notesUrl || '',
          notesFileName: sermonData.notesFileName || '',
          notesFileType: sermonData.notesFileType || '',
          notesText: sermonData.notesText || '',
        });
        setPlaying(true);
      } else if (data.length > 0) {
        setActiveVideo(data[0]);
      }
      setLoading(false);
    };
    init();
    return () => { isCancelled = true; };
  }, [route?.params?.sermonId, route?.params?.sermonData, route?.params?.youtubeId]);

  // Load text notes if needed
  useEffect(() => {
    if (activeVideo?.notesText) {
      setInlineNotesText(activeVideo.notesText);
    } else if (activeVideo?.notesUrl && (activeVideo?.notesFileType === 'txt' || activeVideo?.notesFileName?.toLowerCase()?.endsWith('.txt'))) {
      setLoadingTextNotes(true);
      fetch(activeVideo.notesUrl)
        .then(res => res.text())
        .then(txt => setInlineNotesText(txt))
        .catch(err => console.warn('Could not load text notes:', err))
        .finally(() => setLoadingTextNotes(false));
    } else {
      setInlineNotesText('');
    }
  }, [activeVideo]);

  const onStateChange = useCallback((state: string) => {
    if (state === 'ended') setPlaying(false);
  }, []);

  const handleShare = async () => {
    if (!activeVideo) return;
    try {
      await Share.share({
        message: `Watch this powerful teaching: "${activeVideo.title}" - https://youtu.be/${extractYoutubeId(activeVideo.youtubeId)}`,
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

  const hasNotes = Boolean(
    activeVideo?.notesUrl || 
    activeVideo?.notesText || 
    activeVideo?.notesFileName
  );

  const detectedFileType = (activeVideo?.notesFileType || (
    activeVideo?.notesFileName?.toLowerCase()?.endsWith('.pdf') ? 'pdf' :
    activeVideo?.notesFileName?.toLowerCase()?.endsWith('.docx') ? 'docx' :
    activeVideo?.notesFileName?.toLowerCase()?.endsWith('.doc') ? 'doc' :
    activeVideo?.notesFileName?.toLowerCase()?.endsWith('.txt') ? 'txt' : 'pdf'
  )).toLowerCase();

  const isTextDoc = detectedFileType === 'txt' || (inlineNotesText && !activeVideo?.notesUrl);

  const cleanDocTitle = formatNotesTitle(activeVideo?.notesFileName);

  const primaryCategory = (() => {
    if (!activeVideo?.categories) return '';
    if (typeof activeVideo.categories === 'string') {
      const first = activeVideo.categories.split(';')[0]?.trim();
      return first || '';
    }
    if (Array.isArray(activeVideo.categories) && activeVideo.categories.length > 0) {
      return activeVideo.categories[0];
    }
    return '';
  })();

  const finalVideoId = extractYoutubeId(activeVideo?.youtubeId || '');
  const hasValidVideo = finalVideoId.length > 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a2d5a" />
      
      {/* ── Page Header ── */}
      <View style={{ backgroundColor: '#000' }}>
        <LinearGradient 
          colors={['#2b52a1', '#1a3673']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pageHeader}
        >
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={{top:10, bottom:10, left:10, right:10}}>
            <ArrowLeft size={24} color="#fff" />
          </TouchableOpacity>
          
          <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <View style={styles.headerCenter}>
              <Text style={styles.pageTitle}>{t('sermons.videoTitle')}</Text>
              <Text style={styles.pageSub}>{t('sermons.title')}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        
        {/* ── Video Player ── */}
        <View style={styles.playerSection}>
          {hasValidVideo ? (
            <YoutubePlayer
              height={width * 0.56}
              play={playing}
              videoId={finalVideoId}
              onChangeState={onStateChange}
            />
          ) : (
            <View style={{ height: width * 0.56, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827' }}>
              <Video size={40} color="#374151" />
              <Text style={{ color: '#9CA3AF', marginTop: 10, fontSize: 12, fontWeight: '600' }}>{t('sermons.noVideoLink')}</Text>
            </View>
          )}
        </View>

        {/* ── Video Details ── */}
        <View style={styles.videoDetails}>
          <Text style={styles.videoTitle}>{activeVideo?.title || t('home.exploreSermons')}</Text>
          <View style={styles.metaRow}>
            {/* 1. Highlighted Category Badge FIRST */}
            {primaryCategory ? (
              <View style={styles.categoryBadge}>
                <Folder size={11} color="#FCD34D" fill="#FCD34D" style={{ marginRight: 4 }} />
                <Text style={styles.categoryBadgeTxt}>{primaryCategory}</Text>
              </View>
            ) : null}

            {/* 2. Formatted Date */}
            {activeVideo?.date ? (
              <View style={styles.metaItem}>
                <CalendarIcon size={12} color="#6B7280" />
                <Text style={styles.metaTxt}>{formatSermonDate(activeVideo.date)}</Text>
              </View>
            ) : null}

            {/* 3. Duration */}
            {activeVideo?.duration && formatSermonDuration(activeVideo.duration) ? (
              <View style={styles.metaItem}>
                <Clock size={12} color="#6B7280" />
                <Text style={styles.metaTxt}>{formatSermonDuration(activeVideo.duration)}</Text>
              </View>
            ) : null}

            {/* 4. Scripture reference */}
            {activeVideo?.scripture ? (
              <View style={styles.metaItem}>
                <BookOpen size={12} color="#1a2d5a" />
                <Text style={[styles.metaTxt, { color: '#1a2d5a', fontWeight: '600' }]}>
                  {activeVideo.scripture}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.pastorCard}>
            <View style={styles.pastorAv}><Text style={styles.pastorAvTxt}>P</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pastorName}>{activeVideo?.pastor || t('sermons.pastor')}</Text>
              <Text style={styles.pastorRole}>{t('sermons.mainSpeaker')}</Text>
            </View>
            <TouchableOpacity 
              style={isSubscribed ? styles.unsubBtn : styles.subBtn} 
              onPress={handleSubscribeToggle}
            >
              <Text style={isSubscribed ? styles.unsubBtnTxt : styles.subBtnTxt}>
                {isSubscribed ? 'Unsubscribe' : t('sermons.subscribe')}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Share2 size={16} color="#fff" />
            <Text style={styles.shareBtnTxt}>{t('sermons.shareThisMessage')}</Text>
          </TouchableOpacity>
        </View>

        {/* ── Sermon Notes Section (Directly Below Video Details) ── */}
        {hasNotes && (
          <View style={styles.notesSection}>
            <View style={styles.notesCard}>
              {/* Card Header Bar */}
              <View style={styles.notesHeaderBar}>
                <View style={styles.notesHeaderIconBox}>
                  <BookOpen size={18} color="#1a2d5a" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.notesHeaderTitle}>Sermon Notes</Text>
                    <View style={[
                      styles.notesBadge,
                      detectedFileType === 'pdf' ? styles.badgePdf :
                      (detectedFileType === 'doc' || detectedFileType === 'docx') ? styles.badgeDoc :
                      styles.badgeTxt
                    ]}>
                      <Text style={[
                        styles.notesBadgeTxt,
                        detectedFileType === 'pdf' ? styles.badgePdfTxt :
                        (detectedFileType === 'doc' || detectedFileType === 'docx') ? styles.badgeDocTxt :
                        styles.badgeTxtTxt
                      ]}>
                        {detectedFileType.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.notesFileName} numberOfLines={1}>
                    {cleanDocTitle}
                  </Text>
                </View>
              </View>

              {/* Action Buttons: Read Fullscreen (Primary) & Inline Preview Toggle */}
              <View style={styles.notesActionBox}>
                <TouchableOpacity
                  style={styles.notesReadPrimaryBtn}
                  onPress={() => setShowFullscreenNotes(true)}
                  activeOpacity={0.88}
                >
                  <BookOpen size={16} color="#FFFFFF" />
                  <Text style={styles.notesReadPrimaryBtnTxt}>Read Full Document (In-App)</Text>
                  <Maximize2 size={13} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.notesInlineToggleBtn}
                  onPress={() => {
                    const next = !isNotesExpanded;
                    setIsNotesExpanded(next);
                    if (next) {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }, 100);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.notesInlineToggleTxt}>
                    {isNotesExpanded ? 'Hide Inline Preview' : 'Show Inline Preview'}
                  </Text>
                  {isNotesExpanded ? (
                    <ChevronUp size={14} color="#1a2d5a" />
                  ) : (
                    <ChevronDown size={14} color="#1a2d5a" />
                  )}
                </TouchableOpacity>
              </View>

              {/* Plain Text Notes Container */}
              {isTextDoc && isNotesExpanded && (
                <View style={styles.notesContentWrap}>
                  <View style={styles.notesTextContainer}>
                    {loadingTextNotes ? (
                      <View style={styles.notesLoadingBox}>
                        <ActivityIndicator size="small" color="#1a2d5a" />
                        <Text style={styles.notesLoadingTxt}>Loading sermon text…</Text>
                      </View>
                    ) : (
                      <ScrollView
                        style={styles.notesTextScroll}
                        nestedScrollEnabled={true}
                        showsVerticalScrollIndicator={true}
                      >
                        <Text style={styles.notesTextContent} selectable={true}>
                          {inlineNotesText || 'No text content available.'}
                        </Text>
                      </ScrollView>
                    )}
                  </View>
                </View>
              )}

              {/* Pre-mounted PDF/DOC WebView (Loads in background for instant display) */}
              {!isTextDoc && activeVideo?.notesUrl ? (
                <View style={[
                  styles.notesContentWrap,
                  !isNotesExpanded && { height: 0, opacity: 0, overflow: 'hidden', borderTopWidth: 0 }
                ]}>
                  <View style={styles.notesWebViewBox}>
                    <WebView
                      source={{
                        uri: (detectedFileType === 'pdf' && Platform.OS === 'ios')
                          ? activeVideo.notesUrl
                          : `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(activeVideo.notesUrl)}`
                      }}
                      style={styles.notesWebView}
                      injectedJavaScript={injectedGviewCSS}
                      nestedScrollEnabled={true}
                      javaScriptEnabled={true}
                      domStorageEnabled={true}
                      cacheEnabled={true}
                      scalesPageToFit={true}
                      startInLoadingState={true}
                      renderLoading={() => (
                        <View style={styles.notesLoadingBox}>
                          <ActivityIndicator size="small" color="#1a2d5a" />
                          <Text style={styles.notesLoadingTxt}>Loading sermon notes…</Text>
                        </View>
                      )}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        )}

                {/* ── Archive ── */}
        <Text style={styles.secLbl}>{t('sermons.pastSermons')}</Text>
        <View style={styles.archiveList}>
          {videos.filter(v => v.id !== activeVideo?.id).length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#9CA3AF', fontSize: 12, fontStyle: 'italic' }}>{t('sermons.noPastSermons')}</Text>
            </View>
          ) : (
            videos.filter(v => v.id !== activeVideo?.id).map((video) => (
              <TouchableOpacity 
                key={video.id} 
                style={styles.archiveItem}
                onPress={() => setActiveVideo(video)}
              >
                <View style={styles.thumbBox}>
                  <Image 
                    source={{ uri: video.thumbnailUrl || `https://img.youtube.com/vi/${extractYoutubeId(video.youtubeId)}/mqdefault.jpg` }} 
                    style={styles.thumb} 
                  />
                  <View style={styles.playIcon}><Play size={10} color="#fff" fill="#fff" /></View>
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemTitle} numberOfLines={1}>{video.title}</Text>
                  <Text style={styles.itemMeta}>{video.date ? new Date(video.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}{video.duration && formatSermonDuration(video.duration) ? ` · ${formatSermonDuration(video.duration)}` : ''}</Text>
                </View>
                <ChevronRight size={16} color="#D1D5DB" />
              </TouchableOpacity>
            ))
          )}
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
              You won't receive notification updates when new sermons & video devotionals are released.
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

      {/* ── Fullscreen In-App Sermon Notes Reader ── */}
      <Modal
        visible={showFullscreenNotes}
        animationType="slide"
        onRequestClose={() => setShowFullscreenNotes(false)}
      >
        <View style={styles.fullscreenModalContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#1a2d5a" />
          {/* Modal Header */}
          <View style={styles.fullscreenModalHeader}>
            <TouchableOpacity 
              style={styles.fullscreenCloseBtn}
              onPress={() => setShowFullscreenNotes(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ArrowLeft size={20} color="#fff" />
              <Text style={styles.fullscreenCloseTxt}>Back to Sermon</Text>
            </TouchableOpacity>

            <View style={{ flex: 1, paddingHorizontal: 8 }}>
              <Text style={styles.fullscreenTitle} numberOfLines={1}>
                {cleanDocTitle}
              </Text>
              <Text style={styles.fullscreenSubtitle} numberOfLines={1}>
                {activeVideo?.title || 'Rhema Global Ministries'}
              </Text>
            </View>

            <View style={[
              styles.notesBadge,
              detectedFileType === 'pdf' ? styles.badgePdf :
              (detectedFileType === 'doc' || detectedFileType === 'docx') ? styles.badgeDoc :
              styles.badgeTxt
            ]}>
              <Text style={[
                styles.notesBadgeTxt,
                detectedFileType === 'pdf' ? styles.badgePdfTxt :
                (detectedFileType === 'doc' || detectedFileType === 'docx') ? styles.badgeDocTxt :
                styles.badgeTxtTxt
              ]}>
                {(detectedFileType || 'DOC').toUpperCase()}
              </Text>
            </View>
          </View>

          {/* Fullscreen Body */}
          <View style={{ flex: 1, backgroundColor: '#fff' }}>
            {isTextDoc ? (
              <ScrollView style={{ flex: 1, padding: 18 }} showsVerticalScrollIndicator={true}>
                <Text style={[styles.notesTextContent, { fontSize: 16, lineHeight: 26 }]} selectable={true}>
                  {inlineNotesText || 'No text content available.'}
                </Text>
              </ScrollView>
            ) : activeVideo?.notesUrl ? (
              <WebView
                source={{
                  uri: (detectedFileType === 'pdf' && Platform.OS === 'ios')
                    ? activeVideo.notesUrl
                    : `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(activeVideo.notesUrl)}`
                }}
                style={{ flex: 1 }}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                renderLoading={() => (
                  <View style={styles.notesLoadingBox}>
                    <ActivityIndicator size="large" color="#1a2d5a" />
                    <Text style={styles.notesLoadingTxt}>Loading full document…</Text>
                  </View>
                )}
              />
            ) : null}
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
    paddingTop: Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight ?? 24) + 12,
    paddingHorizontal: 20,
    paddingBottom: 30,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    minHeight: Platform.OS === 'ios' ? 140 : 120,
  },
  headerCenter: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 24 },
  backBtn: { zIndex: 10, padding: 5, marginLeft: -8, marginBottom: 8 },
  pageTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 2 },
  pageSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11, fontWeight: '500' },

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

  // Meta Details Row
  categoryBadge: {
    backgroundColor: '#1a2d5a',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 4.5,
    borderRadius: 8,
    shadowColor: '#1a2d5a',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  categoryBadgeTxt: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // ─── Sermon Notes In-App Reader Styles ──────────────────────────────
  notesSection: {
    marginTop: 14,
    marginHorizontal: 12,
  },
  notesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#1a2d5a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  notesHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
    gap: 10,
  },
  notesHeaderIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  notesHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  notesFileName: {
    fontSize: 11.5,
    color: '#4B5563',
    fontWeight: '600',
    marginTop: 2,
  },
  notesBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  notesBadgeTxt: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  badgePdf: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  badgePdfTxt: { color: '#DC2626' },
  badgeDoc: { backgroundColor: '#DBEAFE', borderColor: '#93C5FD' },
  badgeDocTxt: { color: '#2563EB' },
  badgeTxt: { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' },
  badgeTxtTxt: { color: '#16A34A' },

  notesActionBox: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  notesReadPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a2d5a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    shadowColor: '#1a2d5a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  notesReadPrimaryBtnTxt: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  notesInlineToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  notesInlineToggleTxt: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#1a2d5a',
  },

  notesContentWrap: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  notesTextContainer: {
    padding: 16,
    backgroundColor: '#FAFAF9',
  },
  notesTextScroll: {
    maxHeight: 320,
  },
  notesTextContent: {
    fontSize: 14,
    lineHeight: 23,
    color: '#1F2937',
  },
  notesWebViewBox: {
    width: '100%',
    height: 380,
    backgroundColor: '#FFFFFF',
  },
  notesWebView: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  notesLoadingBox: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  notesLoadingTxt: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },

  // Fullscreen In-App Modal Reader
  fullscreenModalContainer: {
    flex: 1,
    backgroundColor: '#1a2d5a',
  },
  fullscreenModalHeader: {
    paddingTop: Platform.OS === 'ios' ? 52 : (StatusBar.currentHeight ?? 24) + 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1a2d5a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  fullscreenCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingRight: 6,
  },
  fullscreenCloseTxt: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  fullscreenTitle: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  fullscreenSubtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 10.5,
  },
});