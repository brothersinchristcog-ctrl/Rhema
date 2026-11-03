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
  Modal,
  Animated
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
  Bell,
  BellOff,
  X,
  BookOpen,
  Maximize2,
  ChevronUp,
  ChevronDown,
  Calendar as CalendarIcon,
  Folder,
  User
} from 'lucide-react-native';
import FirestoreService from '../services/FirestoreService';
import { useChurch } from '../context/ChurchContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
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
  const sermonDataParam = route?.params?.sermonData;
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(!sermonDataParam);
  const [playing, setPlaying] = useState(false);
  const [activeVideo, setActiveVideo] = useState<any | null>(() => {
    if (sermonDataParam && (sermonDataParam.youtubeId || sermonDataParam.id)) {
      return {
        ...sermonDataParam,
        id: sermonDataParam.id,
        title: sermonDataParam.title || 'Sermon',
        youtubeId: sermonDataParam.youtubeId || '',
        date: sermonDataParam.date,
        duration: sermonDataParam.duration || '',
        pastor: sermonDataParam.pastor || 'Pastor',
        thumbnailUrl: sermonDataParam.thumbnailUrl || sermonDataParam.imageUrl || '',
        notesUrl: sermonDataParam.notesUrl || '',
        notesFileName: sermonDataParam.notesFileName || '',
        notesFileType: sermonDataParam.notesFileType || '',
        notesText: sermonDataParam.notesText || '',
      };
    }
    return null;
  });
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showUnsubModal, setShowUnsubModal] = useState(false);
  const [inlineNotesText, setInlineNotesText] = useState<string>('');
  const [loadingTextNotes, setLoadingTextNotes] = useState(false);
  const [isNotesExpanded, setIsNotesExpanded] = useState(false);
  const [showFullscreenNotes, setShowFullscreenNotes] = useState(false);
  const [readerKey, setReaderKey] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const { activeChurch } = useChurch();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  // Bell ringing animation for Subscribe button
  const bellAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const ringSequence = Animated.loop(
      Animated.sequence([
        Animated.delay(1600),
        Animated.timing(bellAnim, { toValue: 1, duration: 75, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: -1, duration: 75, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: 0.8, duration: 70, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: -0.8, duration: 70, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: 0.4, duration: 65, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: -0.4, duration: 65, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: 0, duration: 65, useNativeDriver: true }),
      ])
    );
    ringSequence.start();
    return () => ringSequence.stop();
  }, [bellAnim]);

  const bellRotation = bellAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-20deg', '0deg', '20deg'],
  });

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
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={colors.barStyle || (isDark ? 'light-content' : 'dark-content')} backgroundColor={colors.background} />
        <ActivityIndicator size="large" color={colors.accent || colors.primary || '#c0392b'} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          {t('common.loading') || 'Loading sermon...'}
        </Text>
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
  const safeNotesUrl = (activeVideo?.notesUrl || '').trim();

  const primaryCategory = (() => {
    if (!activeVideo?.categories) return '';
    let cat = '';
    if (typeof activeVideo.categories === 'string') {
      const first = activeVideo.categories.split(';')[0]?.trim();
      cat = first || '';
    } else if (Array.isArray(activeVideo.categories) && activeVideo.categories.length > 0) {
      cat = activeVideo.categories[0] || '';
    }
    if (cat.toLowerCase().includes("women's fasting")) {
      return "Women's Fasting";
    }
    return cat;
  })();

  const finalVideoId = extractYoutubeId(activeVideo?.youtubeId || '');
  const hasValidVideo = finalVideoId.length > 0;
  const metaTextColor = isDark ? '#F8FAFC' : '#0F172A';

  const playerWidth = Math.min(width - 32, 600);
  const playerHeight = Math.round(playerWidth * 0.5625);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.barStyle || (isDark ? 'light-content' : 'dark-content')} backgroundColor={colors.background} />
      
      {/* ── Screen Header (Clean circular back button & title) ── */}
      <View
        style={[
          styles.headerRow,
          { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8 }
        ]}
      >
        <TouchableOpacity
          style={[styles.circularBackBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          <ArrowLeft size={20} color={colors.text} strokeWidth={2.4} />
        </TouchableOpacity>

        <Text style={[styles.headerTitleText, { color: colors.text }]} numberOfLines={1}>
          {t('sermons.videoTitle') || 'Sermon Video'}
        </Text>

        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        
        {/* ── Video Player (Spaced with rounded corners) ── */}
        <View style={styles.playerSection}>
          {hasValidVideo ? (
            <YoutubePlayer
              width={playerWidth}
              height={playerHeight}
              play={playing}
              videoId={finalVideoId}
              onChangeState={onStateChange}
              initialPlayerParams={{
                preventFullScreen: false,
                controls: true,
                rel: false,
                iv_load_policy: 3,
              }}
              webViewProps={{
                androidLayerType: 'hardware',
                injectedJavaScriptBeforeContentLoaded: `
                  (function() {
                    const hideCSS = \`
                      .ytp-youtube-button,
                      .ytp-impression-link,
                      .ytp-impression-link-content,
                      .ytp-watermark,
                      a.ytp-watermark,
                      .ytp-pause-overlay,
                      .ytp-title-channel,
                      a.ytp-title-link,
                      a[aria-label*="Watch on YouTube"],
                      a[title*="Watch on YouTube"],
                      a[aria-label*="Watch on"],
                      a[title*="Watch on"],
                      a[href*="youtube.com/watch"] {
                        display: none !important;
                        opacity: 0 !important;
                        visibility: hidden !important;
                        pointer-events: none !important;
                        width: 0 !important;
                        height: 0 !important;
                      }
                    \`;
                    const head = document.head || document.documentElement;
                    const style = document.createElement('style');
                    style.type = 'text/css';
                    style.appendChild(document.createTextNode(hideCSS));
                    head.appendChild(style);
                  })();
                  true;
                `,
                injectedJavaScript: `
                  (function() {
                    const hideWatchOnYT = () => {
                      try {
                        const els = document.querySelectorAll('.ytp-youtube-button, .ytp-impression-link, .ytp-watermark, a[aria-label*="Watch on"], a[title*="Watch on"], a[href*="youtube.com/watch"]');
                        els.forEach(el => {
                          el.style.display = 'none';
                          el.style.opacity = '0';
                          el.style.visibility = 'hidden';
                          el.style.pointerEvents = 'none';
                        });
                      } catch(e) {}
                    };
                    hideWatchOnYT();
                    setInterval(hideWatchOnYT, 600);
                  })();
                  true;
                `,
              }}
            />
          ) : (
            <View style={{ height: playerHeight, width: playerWidth, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827' }}>
              <Video size={40} color="#374151" />
              <Text style={{ color: '#9CA3AF', marginTop: 10, fontSize: 12, fontWeight: '600' }}>{t('sermons.noVideoLink')}</Text>
            </View>
          )}
        </View>

        {/* ── Video Details ── */}
        <View style={[styles.videoDetails, { backgroundColor: colors.surface, borderColor: isDark ? colors.border : '#E2E8F0' }]}>
          <Text style={[styles.videoTitle, { color: colors.text }]}>{activeVideo?.title || t('home.exploreSermons')}</Text>
          
          {/* Normal text row for Category, Date, Duration (All visible in a single row, no badges, no clipping) */}
          <View style={styles.metaRow}>
            {primaryCategory ? (
              <Text style={[styles.metaNormalTxt, { color: metaTextColor }]} numberOfLines={1}>
                {primaryCategory}
              </Text>
            ) : null}

            {primaryCategory && activeVideo?.date ? (
              <Text style={[styles.metaDot, { color: isDark ? 'rgba(255,255,255,0.4)' : '#64748B' }]}>•</Text>
            ) : null}

            {activeVideo?.date ? (
              <Text style={[styles.metaNormalTxt, { color: metaTextColor }]} numberOfLines={1}>
                {formatSermonDate(activeVideo.date)}
              </Text>
            ) : null}

            {activeVideo?.duration && formatSermonDuration(activeVideo.duration) ? (
              <>
                <Text style={[styles.metaDot, { color: isDark ? 'rgba(255,255,255,0.4)' : '#64748B' }]}>•</Text>
                <Text style={[styles.metaNormalTxt, { color: metaTextColor }]} numberOfLines={1}>
                  {formatSermonDuration(activeVideo.duration)}
                </Text>
              </>
            ) : null}
          </View>

          {activeVideo?.scripture ? (
            <View style={styles.scriptureRow}>
              <BookOpen size={12} color={colors.textSecondary} />
              <Text style={[styles.scriptureTxt, { color: colors.textSecondary }]} numberOfLines={1}>
                {activeVideo.scripture}
              </Text>
            </View>
          ) : null}

          <View style={styles.pastorCard}>
            <View style={styles.pastorAv}>
              <User size={18} color="#FFFFFF" strokeWidth={2.4} />
            </View>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.pastorName, { color: colors.text }]} numberOfLines={1}>
                {activeVideo?.pastor || t('sermons.pastor')}
              </Text>
              <Text style={[styles.pastorRole, { color: colors.textSecondary }]}>
                {t('sermons.mainSpeaker')}
              </Text>
            </View>
            <TouchableOpacity 
              activeOpacity={0.8}
              onPress={handleSubscribeToggle}
              style={styles.subBtnWrapper}
            >
              {isSubscribed ? (
                <View style={[styles.unsubBtn, { backgroundColor: isDark ? '#27272A' : '#F4F4F5', borderColor: isDark ? '#3F3F46' : '#E4E4E7' }]}>
                  <Bell size={13} color={isDark ? '#A1A1AA' : '#71717A'} fill={isDark ? '#A1A1AA' : '#71717A'} style={{ marginRight: 5 }} />
                  <Text style={[styles.unsubBtnTxt, { color: isDark ? '#D4D4D8' : '#52525B' }]}>
                    {t('sermons.subscribed') || 'Subscribed'}
                  </Text>
                </View>
              ) : (
                <LinearGradient
                  colors={['#FF0000', '#B91C1C']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.subGradientBtn}
                >
                  <Animated.View style={{ transform: [{ rotate: bellRotation }], marginRight: 5.5 }}>
                    <Bell size={13} color="#FFFFFF" fill="#FFFFFF" />
                  </Animated.View>
                  <Text style={styles.subBtnTxt}>
                    {t('sermons.subscribe') || 'Subscribe'}
                  </Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Sermon Notes Section (Directly Below Video Details) ── */}
        {hasNotes && (
          <View style={styles.notesSection}>
            <View style={[styles.notesCard, { backgroundColor: colors.surface, borderColor: isDark ? colors.border : '#E2E8F0' }]}>
              {/* Card Header Bar (Seamless dark theme, no line, book icon directly displayed) */}
              <View style={styles.notesHeaderBar}>
                <BookOpen size={20} color={isDark ? '#FFFFFF' : '#111827'} strokeWidth={2.2} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.notesHeaderTitle, { color: isDark ? '#FFFFFF' : '#111827' }]}>Sermon Notes</Text>
                    <View style={[
                      styles.notesBadge,
                      detectedFileType === 'pdf' ? (isDark ? styles.badgePdfDark : styles.badgePdf) :
                      (detectedFileType === 'doc' || detectedFileType === 'docx') ? (isDark ? styles.badgeDocDark : styles.badgeDoc) :
                      (isDark ? styles.badgeTxtDark : styles.badgeTxt)
                    ]}>
                      <Text style={[
                        styles.notesBadgeTxt,
                        detectedFileType === 'pdf' ? (isDark ? styles.badgePdfDarkTxt : styles.badgePdfTxt) :
                        (detectedFileType === 'doc' || detectedFileType === 'docx') ? (isDark ? styles.badgeDocDarkTxt : styles.badgeDocTxt) :
                        (isDark ? styles.badgeTxtDarkTxt : styles.badgeTxtTxt)
                      ]}>
                        {detectedFileType.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.notesFileName, { color: isDark ? '#94A3B8' : '#4B5563' }]} numberOfLines={1}>
                    {cleanDocTitle}
                  </Text>
                </View>
              </View>

              {/* Action Buttons: Badges in single row (Seamless dark theme, no dividing line) */}
              <View style={styles.notesActionBox}>
                {/* Button 1: Read In-App */}
                <TouchableOpacity
                  style={[
                    styles.notesBadgeBtn,
                    {
                      backgroundColor: isDark ? '#27272A' : '#1E293B',
                      borderColor: isDark ? '#52525B' : '#64748B',
                    }
                  ]}
                  onPress={() => {
                    setReaderKey(k => k + 1);
                    setShowFullscreenNotes(true);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.notesBadgeBtnTxt}>Read In-App</Text>
                  <Maximize2 size={12} color="#94A3B8" style={{ marginLeft: 6 }} />
                </TouchableOpacity>

                {/* Button 2: Inline Preview */}
                <TouchableOpacity
                  style={[
                    styles.notesBadgeBtn,
                    {
                      backgroundColor: isDark ? '#27272A' : '#1E293B',
                      borderColor: isDark ? '#52525B' : '#64748B',
                    }
                  ]}
                  onPress={() => {
                    const next = !isNotesExpanded;
                    setIsNotesExpanded(next);
                    if (next) {
                      setTimeout(() => {
                        scrollViewRef.current?.scrollToEnd({ animated: true });
                      }, 100);
                    }
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={styles.notesBadgeBtnTxt}>
                    {isNotesExpanded ? 'Hide Preview' : 'Inline Preview'}
                  </Text>
                  {isNotesExpanded ? (
                    <ChevronUp size={13} color="#94A3B8" style={{ marginLeft: 5 }} />
                  ) : (
                    <ChevronDown size={13} color="#94A3B8" style={{ marginLeft: 5 }} />
                  )}
                </TouchableOpacity>
              </View>

              {/* Plain Text Notes Container */}
              {isTextDoc && isNotesExpanded && (
                <View style={[styles.notesContentWrap, { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0', backgroundColor: colors.surface }]}>
                  <View style={[styles.notesTextContainer, { backgroundColor: isDark ? '#18181B' : '#FAFAF9' }]}>
                    {loadingTextNotes ? (
                      <View style={[styles.notesLoadingBox, { backgroundColor: isDark ? '#18181B' : '#FFFFFF' }]}>
                        <ActivityIndicator size="small" color={isDark ? '#60A5FA' : '#1a2d5a'} />
                        <Text style={[styles.notesLoadingTxt, { color: colors.textSecondary }]}>Loading sermon text…</Text>
                      </View>
                    ) : (
                      <ScrollView
                        style={styles.notesTextScroll}
                        nestedScrollEnabled={true}
                        showsVerticalScrollIndicator={true}
                      >
                        <Text style={[styles.notesTextContent, { color: isDark ? '#F1F5F9' : '#1F2937' }]} selectable={true}>
                          {inlineNotesText || 'No text content available.'}
                        </Text>
                      </ScrollView>
                    )}
                  </View>
                </View>
              )}

              {/* PDF/DOC WebView (Only rendered when user expands preview to avoid duplicate requests) */}
              {!isTextDoc && safeNotesUrl && isNotesExpanded ? (
                <View style={[
                  styles.notesContentWrap,
                  { borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0', backgroundColor: colors.surface }
                ]}>
                  <View style={[styles.notesWebViewBox, { backgroundColor: isDark ? '#18181B' : '#FFFFFF' }]}>
                    <WebView
                      source={{
                        uri: (detectedFileType === 'pdf' && Platform.OS === 'ios')
                          ? safeNotesUrl
                          : `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(safeNotesUrl)}`
                      }}
                      style={[styles.notesWebView, { backgroundColor: isDark ? '#18181B' : '#FFFFFF' }]}
                      originWhitelist={['*']}
                      injectedJavaScript={injectedGviewCSS}
                      nestedScrollEnabled={true}
                      javaScriptEnabled={true}
                      domStorageEnabled={true}
                      cacheEnabled={true}
                      scalesPageToFit={true}
                      startInLoadingState={true}
                      renderLoading={() => (
                        <View style={[styles.notesLoadingBox, { backgroundColor: isDark ? '#18181B' : '#FFFFFF' }]}>
                          <ActivityIndicator size="small" color={isDark ? '#60A5FA' : '#1a2d5a'} />
                          <Text style={[styles.notesLoadingTxt, { color: colors.textSecondary }]}>Loading sermon notes…</Text>
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
        <Text style={[styles.secLbl, { color: isDark ? '#FFFFFF' : '#000000' }]}>{t('sermons.pastSermons')}</Text>
        <View style={[styles.archiveList, { backgroundColor: colors.surface, borderColor: isDark ? colors.border : '#E2E8F0' }]}>
          {videos.filter(v => v.id !== activeVideo?.id).length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#9CA3AF', fontSize: 12, fontStyle: 'italic' }}>{t('sermons.noPastSermons')}</Text>
            </View>
          ) : (
            videos.filter(v => v.id !== activeVideo?.id).map((video) => {
              const formattedDate = video.date ? formatSermonDate(video.date) : '';
              const formattedDuration = video.duration && formatSermonDuration(video.duration) ? formatSermonDuration(video.duration) : '';
              const metaString = [formattedDate, formattedDuration].filter(Boolean).join(' · ');

              return (
                <TouchableOpacity 
                  key={video.id} 
                  style={[styles.archiveItem, { borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6' }]}
                  onPress={() => {
                    setActiveVideo(video);
                    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.thumbBox}>
                    <Image 
                      source={{ uri: video.thumbnailUrl || `https://img.youtube.com/vi/${extractYoutubeId(video.youtubeId)}/mqdefault.jpg` }} 
                      style={styles.thumb} 
                      resizeMode="cover"
                    />
                    <View style={styles.playIcon}><Play size={10} color="#fff" fill="#fff" /></View>
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]} numberOfLines={2}>
                      {video.title}
                    </Text>
                    {metaString ? (
                      <Text style={[styles.itemMeta, { color: isDark ? '#94A3B8' : '#64748B' }]} numberOfLines={1}>
                        {metaString}
                      </Text>
                    ) : null}
                  </View>
                  <ChevronRight size={16} color={isDark ? '#64748B' : '#CBD5E1'} />
                </TouchableOpacity>
              );
            })
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
          <StatusBar barStyle="light-content" backgroundColor="#000000" />
          
          {/* Modal Header: Only back arrow icon on left, document name in middle, spacer on right */}
          <View style={styles.fullscreenModalHeader}>
            <TouchableOpacity 
              style={styles.fullscreenCloseBtn}
              onPress={() => setShowFullscreenNotes(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
              accessibilityLabel="Back"
            >
              <ArrowLeft size={22} color="#FFFFFF" strokeWidth={2.4} />
            </TouchableOpacity>

            <Text style={styles.fullscreenCenterTitle} numberOfLines={1}>
              {cleanDocTitle}
            </Text>

            <View style={styles.fullscreenHeaderSpacer} />
          </View>

          {/* Fullscreen Body (Black background) */}
          <View style={{ flex: 1, backgroundColor: '#000000' }}>
            {isTextDoc ? (
              <ScrollView style={{ flex: 1, padding: 18, backgroundColor: '#000000' }} showsVerticalScrollIndicator={true}>
                <Text style={[styles.notesTextContent, { color: '#F8FAFC', fontSize: 16, lineHeight: 26 }]} selectable={true}>
                  {inlineNotesText || 'No text content available.'}
                </Text>
              </ScrollView>
            ) : safeNotesUrl ? (
              <WebView
                key={`fullscreen-doc-${readerKey}`}
                source={{
                  uri: (detectedFileType === 'pdf' && Platform.OS === 'ios')
                    ? safeNotesUrl
                    : `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(safeNotesUrl)}`
                }}
                style={{ flex: 1, backgroundColor: '#000000' }}
                originWhitelist={['*']}
                injectedJavaScript={injectedGviewCSS}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                scalesPageToFit={true}
                startInLoadingState={true}
                cacheEnabled={true}
                mixedContentMode="always"
                renderLoading={() => (
                  <View style={[styles.notesLoadingBox, { backgroundColor: '#000000' }]}>
                    <ActivityIndicator size="large" color="#FFFFFF" />
                    <Text style={[styles.notesLoadingTxt, { color: '#9CA3AF' }]}>Loading full document…</Text>
                  </View>
                )}
                renderError={() => (
                  <View style={styles.notesErrorContainer}>
                    <Text style={styles.notesErrorTitle}>Could not display document preview</Text>
                    <Text style={styles.notesErrorDesc}>Google Docs preview is taking too long to render.</Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                      <TouchableOpacity 
                        style={styles.notesRetryBtn}
                        onPress={() => setReaderKey(k => k + 1)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.notesRetryBtnTxt}>Retry</Text>
                      </TouchableOpacity>
                      <TouchableOpacity 
                        style={styles.notesExternalBtn}
                        onPress={() => Linking.openURL(safeNotesUrl)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.notesExternalBtnTxt}>Open Directly</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            ) : (
              <View style={styles.notesErrorContainer}>
                <Text style={styles.notesErrorTitle}>No document link available</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAF7F2' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 14, fontSize: 13, fontWeight: '600' },

  // Screen Header
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

  scroll: { paddingBottom: 40 },

  playerSection: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },

  videoDetails: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  videoTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 8 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    marginBottom: 14,
    marginTop: 2,
  },
  metaNormalTxt: {
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  metaDot: {
    fontSize: 13,
    fontWeight: '900',
    marginHorizontal: 6,
  },
  scriptureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  scriptureTxt: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaTxt: { fontSize: 11.5, fontWeight: '700', letterSpacing: -0.1 },

  pastorCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12, 
    paddingVertical: 10,
    paddingHorizontal: 0,
    backgroundColor: 'transparent', 
    borderRadius: 14, 
    marginBottom: 0,
    borderWidth: 0,
  },
  pastorAv: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#c0392b', justifyContent: 'center', alignItems: 'center' },
  pastorAvTxt: { color: '#fff', fontWeight: '700' },
  pastorName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  pastorRole: { fontSize: 10, color: '#6B7280', marginTop: 1 },
  subBtnWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 4,
  },
  subGradientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7.5,
    borderRadius: 20,
  },
  subBtnTxt: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  unsubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  unsubBtnTxt: {
    fontSize: 11.5,
    fontWeight: '700',
  },

  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 2,
  },
  cornerShareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  shareBtn: { backgroundColor: '#c0392b', paddingVertical: 14, borderRadius: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 8 },
  shareBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  secLbl: { 
    fontSize: 16, 
    fontWeight: '700', 
    color: '#000000', 
    marginHorizontal: 16, 
    marginBottom: 12, 
    marginTop: 22 
  },
  
  archiveList: { 
    marginHorizontal: 16, 
    borderRadius: 16, 
    overflow: 'hidden', 
    borderWidth: 1, 
    borderColor: '#e5e7eb',
    marginBottom: 24,
  },
  archiveItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 12, 
    borderBottomWidth: 0.5, 
    gap: 12 
  },
  thumbBox: { width: 84, height: 56, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  thumb: { width: '100%', height: '100%' },
  playIcon: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' },
  itemInfo: { flex: 1 },
  itemTitle: { fontSize: 13.5, fontWeight: '700', lineHeight: 18 },
  itemMeta: { fontSize: 12, fontWeight: '600', marginTop: 4 },

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
    backgroundColor: '#0F172A',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  categoryBadgeTxt: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  // ─── Sermon Notes In-App Reader Styles ──────────────────────────────
  notesSection: {
    marginTop: 14,
    marginHorizontal: 16,
  },
  notesCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 10,
    elevation: 4,
  },
  notesHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  notesHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  notesFileName: {
    fontSize: 11.5,
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
  badgePdfDark: { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)' },
  badgePdfDarkTxt: { color: '#F87171' },
  badgeDocDark: { backgroundColor: 'rgba(59,130,246,0.15)', borderColor: 'rgba(59,130,246,0.3)' },
  badgeDocDarkTxt: { color: '#60A5FA' },
  badgeTxtDark: { backgroundColor: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.3)' },
  badgeTxtDarkTxt: { color: '#4ADE80' },

  notesActionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    gap: 10,
  },
  notesBadgeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#64748B',
    borderRadius: 22,
    paddingVertical: 9,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  notesBadgeBtnTxt: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
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
    backgroundColor: '#000000',
  },
  fullscreenModalHeader: {
    paddingTop: Platform.OS === 'ios' ? 52 : (StatusBar.currentHeight ?? 24) + 8,
    paddingHorizontal: 16,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#27272A',
  },
  fullscreenCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  fullscreenCenterTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  fullscreenHeaderSpacer: {
    width: 44,
    height: 44,
  },
  notesErrorContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  notesErrorTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  notesErrorDesc: {
    color: '#94A3B8',
    fontSize: 12.5,
    textAlign: 'center',
    lineHeight: 18,
  },
  notesRetryBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  notesRetryBtnTxt: {
    color: '#000000',
    fontSize: 12.5,
    fontWeight: '700',
  },
  notesExternalBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  notesExternalBtnTxt: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '600',
  },
});