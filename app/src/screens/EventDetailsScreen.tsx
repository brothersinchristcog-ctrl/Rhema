import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  Image, 
  ScrollView, 
  TouchableOpacity, 
  StatusBar, 
  Dimensions, 
  Platform, 
  Share, 
  Alert, 
  Linking, 
  ActivityIndicator 
} from 'react-native';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  ChevronLeft, 
  ArrowLeft, 
  Share2, 
  Info, 
  Play, 
  Video, 
  Radio, 
  Lock, 
  CheckCircle2,
  Navigation,
  Music,
  Sliders,
  QrCode
} from 'lucide-react-native';
import { openZoomMeeting } from '../utils/ZoomLauncher';
import YoutubePlayer from 'react-native-youtube-iframe';
import { WebView } from 'react-native-webview';
import firestore from '@react-native-firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import RNShare from 'react-native-share';
import ViewShot from 'react-native-view-shot';

import { findEventVideo, findActiveLiveStream, getChannelId } from '../services/YouTubeService';
import { useAuth } from '../context/AuthContext';
import { useChurch } from '../context/ChurchContext';
import EventRsvpPollCard from '../components/EventRsvpPollCard';
import EventRsvpAnalyticsModal from './admin/EventRsvpAnalyticsModal';
import { useTheme } from '../context/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FirestoreService, { WorshipSong, EventServiceItem } from '../services/FirestoreService';
import SongDetailModal from '../components/SongDetailModal';

const { width, height } = Dimensions.get('window');

/**
 * Determine event status:
 *  - 'upcoming' : event date+startTime is in the future
 *  - 'live'     : right now is between startTime and endTime on event date
 *  - 'completed': event date+endTime is in the past
 */
function getEventStatus(event: any): 'upcoming' | 'live' | 'completed' {
  if (event?.status === 'completed') return 'completed';
  if (event?.status === 'cancelled') return 'completed';

  const today = new Date();

  // Parse date string like "2026-06-10" or "10-06-2026"
  const rawDate = event?.date || '';
  let eventYear = today.getFullYear();
  let eventMonth = today.getMonth();
  let eventDay = today.getDate();

  if (rawDate.includes('-')) {
    const parts = rawDate.split('T')[0].split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        eventYear = parseInt(parts[0], 10);
        eventMonth = parseInt(parts[1], 10) - 1;
        eventDay = parseInt(parts[2], 10);
      } else {
        // DD-MM-YYYY
        eventDay = parseInt(parts[0], 10);
        eventMonth = parseInt(parts[1], 10) - 1;
        eventYear = parseInt(parts[2], 10);
      }
    }
  }

  const parseTime = (timeStr: string) => {
    if (!timeStr) return null;
    const timePart = timeStr.includes('T') ? timeStr.split('T')[1] : timeStr;
    const [h, m, s] = timePart.split(':').map(Number);
    return new Date(eventYear, eventMonth, eventDay, h || 0, m || 0, s || 0);
  };

  const startDt = parseTime(event?.startTime);
  const endDt = parseTime(event?.endTime);

  if (!startDt) {
    const eventDate = new Date(eventYear, eventMonth, eventDay, 23, 59, 59);
    return today > eventDate ? 'completed' : 'upcoming';
  }

  if (today < startDt) return 'upcoming';

  if (endDt) {
    if (today > endDt) return 'completed';
    return 'live';
  }

  // If no explicit endTime, assume 3 hours duration or end of day
  const defaultEndDt = new Date(startDt.getTime() + 3 * 60 * 60 * 1000);
  const endOfDay = new Date(eventYear, eventMonth, eventDay, 23, 59, 59);
  const effectiveEndDt = defaultEndDt > endOfDay ? endOfDay : defaultEndDt;

  if (today > effectiveEndDt) return 'completed';
  return 'live';
}

function extractYoutubeVideoId(urlOrId?: string): string {
  if (!urlOrId || typeof urlOrId !== 'string') return '';
  const clean = urlOrId.trim();
  if (/^[\w-]{11}$/.test(clean)) return clean;
  const liveMatch = clean.match(/\/live\/([\w-]{11})/);
  if (liveMatch) return liveMatch[1];
  const watchMatch = clean.match(/[?&]v=([\w-]{11})/);
  if (watchMatch) return watchMatch[1];
  const shortMatch = clean.match(/youtu\.be\/([\w-]{11})/);
  if (shortMatch) return shortMatch[1];
  const embedMatch = clean.match(/\/embed\/([\w-]{11})/);
  if (embedMatch) return embedMatch[1];
  return '';
}

export default function EventDetailsScreen({ route, navigation }: any) {
  const initialEvent = route?.params?.event || route?.params || {};
  const eventId = route?.params?.eventId || route?.params?.id || initialEvent.id || initialEvent.eventId;
  if (!initialEvent.id && eventId) {
    initialEvent.id = eventId;
  }
  const [eventData, setEventData] = useState<any>(initialEvent);
  const { activeChurch } = useChurch();
  const { user, member } = useAuth();
  const [showRsvpAnalytics, setShowRsvpAnalytics] = useState(false);
  const isAdmin = useMemo(() => {
    const role = ((member as any)?.role || member?.userType || '').toLowerCase();
    return role.includes('admin') || role.includes('pastor') || role.includes('leader') || (member as any)?.isAdmin === true;
  }, [member]);
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [imageAspectRatio, setImageAspectRatio] = useState<number>(16 / 9);
  const [isSharing, setIsSharing] = useState(false);
  const [activeServiceIdx, setActiveServiceIdx] = useState<number>(0);
  const [selectedEventSong, setSelectedEventSong] = useState<WorshipSong | null>(null);
  const captureEventRef = useRef<ViewShot>(null);

  // Sync with fresh server event record if available
  useEffect(() => {
    const idToFind = initialEvent.id || eventId;
    if (idToFind) {
      FirestoreService.getEvents().then((events) => {
        const found = events.find(e => e.id === idToFind || (e as any).eventId === idToFind);
        if (found) {
          setEventData((prev: any) => ({ ...prev, ...found }));
        }
      }).catch(() => {});
    }
  }, [initialEvent.id, eventId]);

  const event = eventData;
  const status = getEventStatus(event);
  const manualYoutubeId = event.youtubeId;
  const churchYoutubeHandle = activeChurch?.socialLinks?.youtube || ''; // e.g. @MyChurch

  const [autoYoutubeId, setAutoYoutubeId] = useState<string | null>(null);
  const [videoSearching, setVideoSearching] = useState(false);

  // Dynamically compute exact aspect ratio of the event flyer/image
  useEffect(() => {
    const uri = event.image || event.bannerUrl;
    if (uri && typeof uri === 'string' && uri.startsWith('http')) {
      Image.getSize(
        uri,
        (w, h) => {
          if (w > 0 && h > 0) {
            const r = Math.max(0.75, Math.min(2.2, w / h));
            setImageAspectRatio(r);
          }
        },
        () => {}
      );
    }
  }, [event.image, event.bannerUrl]);

  useEffect(() => {
    // Auto-search YouTube if event is completed, no manual ID, and church has a YouTube handle
    if (status === 'completed' && !manualYoutubeId && churchYoutubeHandle) {
      setVideoSearching(true);
      findEventVideo(event.date, event.title || event.name || '', churchYoutubeHandle)
        .then(id => setAutoYoutubeId(id))
        .finally(() => setVideoSearching(false));
    }
  }, [event.id, status, manualYoutubeId, churchYoutubeHandle]);

  // Live Stream state for inline playback & tab navigation
  const [liveStreamVideoId, setLiveStreamVideoId] = useState<string | null>(null);
  const [liveStreamChannelId, setLiveStreamChannelId] = useState<string | null>(null);
  const [liveStreamLoading, setLiveStreamLoading] = useState<boolean>(false);

  // HTML5 Live Stream Embed - passes strict-origin headers to completely prevent YouTube Error 153
  const htmlLiveEmbed = useMemo(() => {
    const embedSrc = liveStreamVideoId
      ? `https://www.youtube-nocookie.com/embed/${liveStreamVideoId}?autoplay=1&playsinline=1&rel=0&modestbranding=1`
      : `https://www.youtube-nocookie.com/embed/live_stream?channel=${liveStreamChannelId || 'UC3J_2zP2bIuCwEia_ASvghw'}&autoplay=1&playsinline=1&rel=0&modestbranding=1`;

    return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      html, body { width:100%; height:100%; background:#000000; overflow:hidden; }
      iframe { width:100%; height:100%; border:none; display:block; }
    </style>
  </head>
  <body>
    <iframe
      src="${embedSrc}"
      frameborder="0"
      referrerpolicy="strict-origin-when-cross-origin"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen>
    </iframe>
  </body>
</html>`;
  }, [liveStreamVideoId, liveStreamChannelId]);

  // Resolve live stream video ID / channel ID when status is live
  useEffect(() => {
    let isMounted = true;
    const churchId = activeChurch?.id || 'rhema';

    // 1. Direct video ID check in event fields
    const directId = extractYoutubeVideoId(event.youtubeId || event.liveUrl || event.livestreamUrl);
    if (directId) {
      setLiveStreamVideoId(directId);
      return;
    }

    // 2. Real-time listener for church youtubeLiveState (broadcast from pastor/admin)
    const unsubChurch = firestore()
      .collection('Rhema Church')
      .doc(churchId)
      .onSnapshot(
        (doc) => {
          if (!isMounted) return;
          if (doc.exists) {
            const lData = doc.data()?.youtubeLiveState;
            const liveVid = lData?.videoId || lData?.lastNotifiedVideoId || lData?.latestVideoId;
            if (liveVid) {
              setLiveStreamVideoId((prev) => prev || liveVid);
            }
          }
        },
        () => {}
      );

    // 3. Resolve channel or live URL via YouTubeService
    const targetUrl =
      event.liveUrl ||
      event.livestreamUrl ||
      activeChurch?.socialLinks?.youtube ||
      churchYoutubeHandle ||
      '@Brothersinchristfellowship';

    if (targetUrl) {
      setLiveStreamLoading(true);
      findActiveLiveStream(targetUrl)
        .then((res) => {
          if (!isMounted) return;
          if (res?.videoId) {
            setLiveStreamVideoId(res.videoId);
          } else {
            getChannelId(targetUrl).then((cId) => {
              if (isMounted && cId) {
                setLiveStreamChannelId(cId);
              }
            });
          }
        })
        .catch(() => {
          getChannelId(targetUrl).then((cId) => {
            if (isMounted && cId) {
              setLiveStreamChannelId(cId);
            }
          });
        })
        .finally(() => {
          if (isMounted) setLiveStreamLoading(false);
        });
    }

    return () => {
      isMounted = false;
      unsubChurch();
    };
  }, [event.id, event.liveUrl, event.livestreamUrl, event.youtubeId, status, activeChurch?.id, churchYoutubeHandle]);

  const youtubeId = manualYoutubeId || autoYoutubeId;
  const liveUrl = event.liveUrl || event.livestreamUrl || (manualYoutubeId ? `https://www.youtube.com/watch?v=${manualYoutubeId}` : '') || (churchYoutubeHandle ? `https://www.youtube.com/${churchYoutubeHandle}/streams` : '');

  const recordingVideoId =
    youtubeId ||
    liveStreamVideoId ||
    extractYoutubeVideoId(event.youtubeId || event.liveUrl || event.livestreamUrl);

  // HTML5 Recording Embed - plays completed event recording directly inside EventDetailsScreen
  const htmlRecordingEmbed = useMemo(() => {
    const embedSrc = recordingVideoId
      ? `https://www.youtube-nocookie.com/embed/${recordingVideoId}?autoplay=0&playsinline=1&rel=0&modestbranding=1`
      : `https://www.youtube-nocookie.com/embed/live_stream?channel=${liveStreamChannelId || 'UC3J_2zP2bIuCwEia_ASvghw'}&autoplay=0&playsinline=1&rel=0&modestbranding=1`;

    return `<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      html, body { width:100%; height:100%; background:#000000; overflow:hidden; }
      iframe { width:100%; height:100%; border:none; display:block; }
    </style>
  </head>
  <body>
    <iframe
      src="${embedSrc}"
      frameborder="0"
      referrerpolicy="strict-origin-when-cross-origin"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen>
    </iframe>
  </body>
</html>`;
  }, [recordingVideoId, liveStreamChannelId]);

  // Navigate directly to the in-app YouTube Live Tab
  const handleJoinLiveStream = () => {
    const rawTarget =
      event.liveUrl ||
      event.livestreamUrl ||
      (manualYoutubeId ? `https://www.youtube.com/watch?v=${manualYoutubeId}` : '') ||
      activeChurch?.socialLinks?.youtube ||
      'https://www.youtube.com/@Brothersinchristfellowship/live';

    if (rawTarget.includes('zoom.us')) {
      openZoomMeeting({
        meetingLink: rawTarget,
        password: event?.passcode || event?.password,
        userName: undefined,
      });
      return;
    }

    navigation.navigate('YouTubeLive', {
      url: rawTarget,
      videoId: liveStreamVideoId || manualYoutubeId || undefined,
      title: event.title || event.name || 'Live Service',
      churchId: activeChurch?.id,
    });
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '--:--';
    try {
      const timePart = timeStr.includes('T') ? timeStr.split('T')[1].split('.')[0] : timeStr;
      const [hours, minutes] = timePart.split(':');
      const h = parseInt(hours);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 || 12;
      return `${displayH}:${minutes} ${ampm}`;
    } catch { return timeStr; }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      if (dateStr.includes('-') && dateStr.split('-').length === 3) {
        const parts = dateStr.split('-').map(Number);
        let dt: Date;
        if (dateStr.split('-')[0].length === 4) {
          dt = new Date(parts[0], parts[1] - 1, parts[2]);
        } else {
          dt = new Date(parts[2], parts[1] - 1, parts[0]);
        }
        return dt.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
      }
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return dateStr; }
  };

  const formatTeluguDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      let d = new Date();
      if (dateStr.includes('-') && dateStr.split('-').length === 3) {
        const parts = dateStr.split('-').map(Number);
        if (dateStr.split('-')[0].length === 4) {
          d = new Date(parts[0], parts[1] - 1, parts[2]);
        } else {
          d = new Date(parts[2], parts[1] - 1, parts[0]);
        }
      } else {
        d = new Date(dateStr);
      }
      const monthsTe = ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జూలై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్'];
      return `${monthsTe[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
    } catch { return dateStr; }
  };

  const handleOpenMaps = () => {
    const locQuery = [event.location, event.address].filter(Boolean).join(', ') || 'Church';
    const encoded = encodeURIComponent(locQuery);
    const url = Platform.select({
      ios: `maps:0,0?q=${encoded}`,
      android: `geo:0,0?q=${encoded}`,
    }) || `https://www.google.com/maps/search/?api=1&query=${encoded}`;

    Linking.canOpenURL(url).then((supported) => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`);
      }
    }).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`);
    });
  };

  const onShare = async () => {
    setIsSharing(true);
    try {
      const title = event.title || event.name || 'Church Event';
      const titleTe = event.titleTelugu || event.titleTe || '';
      const churchName = activeChurch?.name ? `${activeChurch.name}` : '';
      const dateStr = formatDate(event.date);
      const timeStr = (event.startTime || event.endTime)
        ? `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`
        : (event.time || '');
      const locStr = [event.location, event.address].filter(Boolean).join(' - ') || 'Church Main Hall';
      const descStr = (event.description || event.descEn || '').trim();

      let message = `📅 ${title}${titleTe ? ` · ${titleTe}` : ''}\n\n`;
      if (dateStr) message += `🗓️ Date: ${dateStr}\n`;
      if (timeStr) message += `⏰ Time: ${timeStr}\n`;
      if (locStr) message += `📍 Location: ${locStr}\n`;
      if (descStr) {
        message += `\n📝 Details:\n${descStr}\n`;
      }
      if (event.youtubeId) {
        message += `\n🎥 Watch / Stream: https://youtu.be/${event.youtubeId}\n`;
      }
      if (churchName) {
        message += `\n${churchName} 🙏`;
      }

      // Copy text to clipboard as safety backup for apps that drop caption
      try {
        await Clipboard.setStringAsync(message);
      } catch (_) {}

      // Target event image
      const imageUrl = event.image || event.bannerUrl;
      let localFileUri: string | null = null;
      let mimeType = 'image/jpeg';

      if (imageUrl && !imageUrl.includes('unsplash.com/photo-1438232992991-995b7058bbb3')) {
        try {
          if (imageUrl.startsWith('file://') || imageUrl.startsWith('content://') || imageUrl.startsWith('data:')) {
            localFileUri = imageUrl;
          } else {
            const isPng = imageUrl.toLowerCase().includes('.png');
            mimeType = isPng ? 'image/png' : 'image/jpeg';
            const ext = isPng ? 'png' : 'jpg';
            const filename = `event_share_${event.id || Date.now()}.${ext}`;
            const destination = `${FileSystem.cacheDirectory}${filename}`;
            const downloadRes = await FileSystem.downloadAsync(imageUrl, destination);
            localFileUri = downloadRes.uri;
          }
        } catch (dlErr) {
          console.warn('Could not download event image, trying capture fallback:', dlErr);
        }
      }

      // If no remote thumbnail or download failed, capture event card via ViewShot
      if (!localFileUri && captureEventRef.current?.capture) {
        try {
          const capturedUri = await captureEventRef.current.capture();
          localFileUri = capturedUri;
          mimeType = 'image/png';
        } catch (capErr) {
          console.warn('ViewShot event card capture failed:', capErr);
        }
      }

      // Clear loading indicator before presenting share sheet
      setIsSharing(false);

      if (localFileUri) {
        let fileUri = localFileUri;
        if (!fileUri.startsWith('file://') && !fileUri.startsWith('content://') && !fileUri.startsWith('data:')) {
          fileUri = `file://${fileUri}`;
        }

        // Attempt 1: Native Share with image and caption attached (react-native-share)
        try {
          await RNShare.open({
            title: `${title} · ${churchName || 'Event Details'}`,
            message,
            url: fileUri,
            type: mimeType,
            subject: `${title} · ${churchName || 'Event Details'}`,
          });
          return;
        } catch (shareOpenErr: any) {
          const errMsg = shareOpenErr?.message || String(shareOpenErr);
          if (errMsg.includes('User did not share') || errMsg.includes('dismiss') || errMsg.includes('cancel') || shareOpenErr?.code === 'CANCELLED') {
            return;
          }
          console.warn('RNShare.open failed, trying expo-sharing fallback:', shareOpenErr);
        }

        // Attempt 2: expo-sharing fallback with the image file
        try {
          const isSharingAvailable = await Sharing.isAvailableAsync();
          if (isSharingAvailable) {
            await Sharing.shareAsync(fileUri, {
              dialogTitle: `${title} · ${churchName || 'Event Details'}`,
              mimeType,
              UTI: mimeType === 'image/png' ? 'public.png' : 'public.jpeg',
            });
            return;
          }
        } catch (expoShareErr: any) {
          console.warn('Expo sharing failed:', expoShareErr);
        }
      }

      // Attempt 3: Built-in text sharing fallback
      await Share.share({ message });
    } catch (error) {
      console.error('Error sharing event:', error);
    } finally {
      setIsSharing(false);
    }
  };

  const handleRSVP = () => {
    Alert.alert("Success · విజయం", "Thank you for your interest! We'll keep you updated.\nమీ ఆసక్తికి ధన్యవాదాలు! మేము మిమ్మల్ని అప్‌డేట్ చేస్తాము.");
  };

  // Status badge config
  const statusConfig = ({
    upcoming: { label: 'UPCOMING', color: '#FFFFFF', icon: <Clock size={12} color="#FFFFFF" strokeWidth={2.4} /> },
    live:     { label: '● LIVE NOW', color: '#FFFFFF', icon: <Radio size={12} color="#FFFFFF" strokeWidth={2.4} /> },
    completed:{ label: 'COMPLETED',  color: '#FFFFFF', icon: <CheckCircle2 size={12} color="#FFFFFF" strokeWidth={2.4} /> },
  } as any)[status] || { label: 'UPCOMING', color: '#FFFFFF', icon: <Clock size={12} color="#FFFFFF" strokeWidth={2.4} /> };

  const heroImageUri = event.image || event.bannerUrl || 'https://images.unsplash.com/photo-1438232992991-995b7058bbb3?q=80&w=800';

  const startDateFormatted = formatDate(event.date);
  const startDateTeFormatted = formatTeluguDate(event.date);
  const endDateValue = event.endDate || event.date;
  const endDateFormatted = formatDate(endDateValue);
  const endDateTeFormatted = formatTeluguDate(endDateValue);
  const displayStartTime = event.startTime
    ? formatTime(event.startTime)
    : (event.time ? (event.time.includes('-') ? event.time.split('-')[0].trim() : event.time) : '--:--');
  const displayEndTime = event.endTime
    ? formatTime(event.endTime)
    : (event.time && event.time.includes('-') ? event.time.split('-')[1].trim() : '--:--');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={colors.barStyle || (isDark ? 'light-content' : 'dark-content')} backgroundColor={colors.background} />

      {/* ── Screen Header (Clean circular back button & title & share on right) ── */}
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

        <Text style={[styles.headerTitleText, { color: isDark ? '#FFFFFF' : '#000000' }]} numberOfLines={1}>
          Event Details
        </Text>

        <TouchableOpacity
          style={[styles.circularBackBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={onShare}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          <Share2 size={18} color={colors.text} />
        </TouchableOpacity>
      </View>
      
      <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        {/* --- Hero Image Section (Full image displayed with dynamic aspect ratio, no cropping, wrapped with ash color line) --- */}
        <View style={[styles.heroWrapper, { backgroundColor: colors.background }]}>
          <View style={[
            styles.heroContainer, 
            { 
              aspectRatio: imageAspectRatio, 
              backgroundColor: colors.background,
              borderRadius: 20,
              borderWidth: 1.5,
              borderColor: isDark ? '#52525B' : '#9CA3AF',
              overflow: 'hidden',
            }
          ]}>
            <Image 
              source={{ uri: heroImageUri }}
              style={styles.heroImage}
              resizeMode="contain"
            />
          </View>
        </View>

        {/* --- Content Card --- */}
        <View style={[styles.contentCard, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
          <View style={[styles.indicator, { backgroundColor: colors.border }]} />
          
          {/* Header Badges: Status + Category + Church (Black badges with bold white text) */}
          <View style={styles.headerBadgeRow}>
            <View style={[styles.statusPill, styles.blackPill, isDark && styles.blackPillDark]}>
              {statusConfig.icon}
              <Text style={styles.blackPillText}>{statusConfig.label}</Text>
            </View>

            {event.category ? (
              <View style={[styles.categoryPill, styles.blackPill, isDark && styles.blackPillDark]}>
                <Text style={styles.blackPillText}>{event.category.toUpperCase()}</Text>
              </View>
            ) : null}

            {activeChurch?.name ? (
              <View style={[styles.churchPill, styles.blackPill, isDark && styles.blackPillDark]}>
                <Text style={styles.blackPillText} numberOfLines={1}>{activeChurch.name}</Text>
              </View>
            ) : null}
          </View>

          {/* Title Area */}
          <View style={styles.titleSection}>
            <Text style={[styles.titleEn, { color: isDark ? '#F2F0E8' : '#000000' }]}>{event.title || event.name}</Text>
            {(event.titleTelugu || event.titleTe) ? (
              <Text style={[styles.titleTe, { color: isDark ? 'rgba(242, 240, 232, 0.75)' : '#4B5563' }]}>{event.titleTelugu || event.titleTe}</Text>
            ) : null}
          </View>

          {/* Schedule Card: Unified Event Dates & Timing Window in One Card */}
          <View style={styles.badgeRow}>
            <View style={[
              styles.scheduleCard, 
              isDark 
                ? { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.12)' }
                : { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }
            ]}>
              {/* ── Section 1: Event Dates ── */}
              <View style={styles.scheduleCardHeader}>
                <View style={[
                  styles.badgeIconCircle, 
                  { 
                    backgroundColor: isDark ? 'rgba(184, 165, 214, 0.18)' : 'rgba(107, 33, 168, 0.1)',
                    borderColor: isDark ? 'rgba(184, 165, 214, 0.35)' : 'rgba(107, 33, 168, 0.22)',
                    borderWidth: 1,
                  }
                ]}>
                  <Calendar size={17} color={isDark ? '#B8A5D6' : '#6B21A8'} strokeWidth={2.2} />
                </View>
                <Text style={[
                  styles.scheduleCardTitle, 
                  { color: isDark ? '#B8A5D6' : '#6B21A8' }
                ]}>
                  EVENT DATES · ప్రారంభం & ముగింపు తేదీలు
                </Text>
              </View>

              {/* Start Date */}
              <View style={styles.dateBlock}>
                <Text style={[styles.fieldMiniLabel, isDark && styles.fieldMiniLabelDark]}>
                  START DATE · ప్రారంభ తేదీ
                </Text>
                <View style={styles.dateSingleRow}>
                  <Text style={[styles.dateTextMain, isDark && styles.dateTextMainDark]}>
                    {startDateFormatted}
                  </Text>
                  {startDateTeFormatted ? (
                    <>
                      <Text style={[styles.dateDotSeparator, isDark && styles.dateDotSeparatorDark]}>·</Text>
                      <Text style={[styles.dateTextTelugu, isDark && styles.dateTextTeluguDark]}>
                        {startDateTeFormatted}
                      </Text>
                    </>
                  ) : null}
                </View>
              </View>

              {/* Subtle divider between Start Date & End Date */}
              <View style={[styles.dateRowDivider, isDark && styles.dateRowDividerDark]} />

              {/* End Date */}
              <View style={styles.dateBlock}>
                <Text style={[styles.fieldMiniLabel, isDark && styles.fieldMiniLabelDark]}>
                  END DATE · ముగింపు తేదీ
                </Text>
                <View style={styles.dateSingleRow}>
                  <Text style={[styles.dateTextMain, isDark && styles.dateTextMainDark]}>
                    {endDateFormatted}
                  </Text>
                  {endDateTeFormatted ? (
                    <>
                      <Text style={[styles.dateDotSeparator, isDark && styles.dateDotSeparatorDark]}>·</Text>
                      <Text style={[styles.dateTextTelugu, isDark && styles.dateTextTeluguDark]}>
                        {endDateTeFormatted}
                      </Text>
                    </>
                  ) : null}
                </View>
              </View>

              {/* ── Mid-Card Divider between Dates & Timings ── */}
              <View style={[styles.scheduleSectionDivider, isDark && styles.scheduleSectionDividerDark]} />

              {/* ── Section 2: Timing Window ── */}
              <View style={styles.scheduleCardHeader}>
                <View style={[
                  styles.badgeIconCircle, 
                  { 
                    backgroundColor: isDark ? 'rgba(184, 165, 214, 0.18)' : 'rgba(107, 33, 168, 0.1)',
                    borderColor: isDark ? 'rgba(184, 165, 214, 0.35)' : 'rgba(107, 33, 168, 0.22)',
                    borderWidth: 1,
                  }
                ]}>
                  <Clock size={17} color={isDark ? '#B8A5D6' : '#6B21A8'} strokeWidth={2.2} />
                </View>
                <Text style={[
                  styles.scheduleCardTitle, 
                  { color: isDark ? '#B8A5D6' : '#6B21A8' }
                ]}>
                  TIMING WINDOW · సమయం
                </Text>
              </View>

              <View style={styles.timeScheduleRow}>
                <View style={styles.timeCol}>
                  <Text style={[styles.fieldMiniLabel, isDark && styles.fieldMiniLabelDark]}>
                    START TIME · ప్రారంభం
                  </Text>
                  <Text style={[styles.timeTextMain, isDark && styles.timeTextMainDark]}>
                    {displayStartTime}
                  </Text>
                </View>

                <View style={[styles.timeVerticalDivider, isDark && styles.timeVerticalDividerDark]} />

                <View style={styles.timeCol}>
                  <Text style={[styles.fieldMiniLabel, isDark && styles.fieldMiniLabelDark]}>
                    END TIME · ముగింపు
                  </Text>
                  <Text style={[styles.timeTextMain, isDark && styles.timeTextMainDark]}>
                    {displayEndTime}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Location Section with Directions Button */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? 'rgba(185, 200, 189, 0.15)' : 'rgba(49, 92, 80, 0.12)' }]}>
                <MapPin size={18} color={isDark ? '#B9C8BD' : '#315C50'} />
              </View>
              <Text style={[styles.sectionTitle, { color: isDark ? '#B9C8BD' : '#315C50', flex: 1 }]}>Location · స్థలం</Text>
            </View>
            <View style={[styles.locCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.locName, { color: colors.text }]}>{event.location || event.address || 'Church Main Hall'}</Text>
              {event.location && event.address && event.location !== event.address ? (
                <Text style={[styles.locSub, { color: colors.textSecondary, fontWeight: '600' }]}>{event.address}</Text>
              ) : null}
              <TouchableOpacity 
                style={styles.mapBtnTouchable} 
                onPress={handleOpenMaps} 
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#227FFF', '#62B2FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.mapBtnGradient}
                >
                  <Navigation size={14} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={styles.mapBtnGradientText}>Get Directions / Open in Maps</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* QR Code Requirement Notice */}
          {(event.requireEventQR === true || (event as any).requireEventQr === true) && (
            <View style={[
              styles.qrReqBanner,
              isDark 
                ? { backgroundColor: '#18181B', borderColor: 'rgba(255, 255, 255, 0.12)' }
                : { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }
            ]}>
              <View style={[
                styles.qrReqIconBox,
                { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7' }
              ]}>
                <QrCode size={18} color={isDark ? '#FBBF24' : '#B45309'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.qrReqTitle, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
                  Event QR Code Required for Check-In
                </Text>
                <Text style={[styles.qrReqSub, { color: isDark ? '#94A3B8' : '#64748B' }]}>
                  Attendance marking is restricted to this event's unique QR code. Please scan the QR code displayed at the entrance to check in.
                </Text>
              </View>
            </View>
          )}

          {/* Description Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.iconCircle, { backgroundColor: isDark ? 'rgba(198, 166, 107, 0.15)' : 'rgba(152, 113, 61, 0.12)' }]}>
                <Info size={18} color={isDark ? '#C6A66B' : '#98713D'} />
              </View>
              <Text style={[styles.sectionTitle, { color: isDark ? '#C6A66B' : '#98713D', flex: 1 }]}>About Event · కార్యక్రమం గురించి</Text>
            </View>
            <View style={[styles.descCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.description, { color: colors.text }]}>
                {event.description || event.descEn || "Join us for a powerful time of prayer and fellowship. We invite all members to gather as we seek God's presence together.\n\n'For where two or three gather in my name, there am I with them.' - Matthew 18:20"}
              </Text>
            </View>
          </View>

          {/* ── MEMBER RSVP PARTICIPATION POLL (Active for Upcoming/Live events; hidden once Completed) ── */}
          {event?.rsvpEnabled === true && status !== 'completed' && (
            <EventRsvpPollCard
              eventId={event.id}
              churchId={activeChurch?.id}
              eventTitle={event.title || event.name || 'Church Event'}
              eventDate={formatDate(event.date)}
              rsvpDeadline={event.rsvpDeadline}
              isCompleted={false}
              currentUser={{
                id: member?.id || user?.uid || '',
                name: member?.name || (member as any)?.fullName || user?.displayName || 'Member',
                phone: member?.phone || (member as any)?.phoneNumber || user?.phoneNumber || '',
                photo: (member as any)?.photoUrl || (member as any)?.profilePicture || (member as any)?.photo || user?.photoURL || '',
              }}
              isAdmin={isAdmin}
              onViewAnalytics={() => setShowRsvpAnalytics(true)}
              isDark={isDark}
            />
          )}

          {/* ── WORSHIP SERVICES & SONGS SECTION ── */}
          {Array.isArray(event.services) && event.services.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.iconCircle, { backgroundColor: isDark ? 'rgba(156, 199, 232, 0.15)' : 'rgba(2, 132, 199, 0.12)' }]}>
                  <Music size={18} color={isDark ? '#9CC7E8' : '#0284C7'} />
                </View>
                <Text style={[styles.sectionTitle, { color: isDark ? '#9CC7E8' : '#0284C7', flex: 1 }]}>
                  Worship Songs · ఆరాధన గీతాలు
                </Text>
              </View>

              {/* Service Tabs if multiple services exist */}
              {event.services.length > 1 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, marginBottom: 12 }}
                >
                  {event.services.map((srv: EventServiceItem, idx: number) => {
                    const isSelected = activeServiceIdx === idx;
                    return (
                      <TouchableOpacity
                        key={srv.id || idx}
                        onPress={() => setActiveServiceIdx(idx)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderRadius: 10,
                          backgroundColor: isSelected 
                            ? (isDark ? '#2563EB' : '#1a2d5a') 
                            : (isDark ? '#27272A' : '#F1F5F9'),
                          borderWidth: 1,
                          borderColor: isSelected 
                            ? (isDark ? '#3B82F6' : '#1a2d5a') 
                            : (isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0'),
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <Text style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: isSelected ? '#FFFFFF' : (isDark ? '#E4E4E7' : '#475569')
                        }}>
                          {srv.name || `Service ${idx + 1}`}
                        </Text>
                        <View style={{
                          backgroundColor: isSelected 
                            ? 'rgba(255,255,255,0.2)' 
                            : (isDark ? '#3F3F46' : '#CBD5E1'),
                          paddingHorizontal: 5,
                          paddingVertical: 1,
                          borderRadius: 6
                        }}>
                          <Text style={{
                            fontSize: 10,
                            fontWeight: '800',
                            color: isSelected ? '#FFFFFF' : (isDark ? '#FFFFFF' : '#1E293B')
                          }}>
                            {srv.songs?.length || 0}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Active Service Card */}
              {(() => {
                const currentService: EventServiceItem = event.services[activeServiceIdx] || event.services[0];
                if (!currentService) return null;
                const serviceSongs = currentService.songs || [];

                return (
                  <View style={{
                    backgroundColor: isDark ? '#18181B' : '#F8FAFC',
                    borderRadius: 14,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0'
                  }}>
                    {/* Service Header Info */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: isDark ? '#FFFFFF' : '#1a2d5a' }}>
                          {currentService.name}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                          {currentService.time ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Clock size={11} color={isDark ? '#94A3B8' : '#64748B'} />
                              <Text style={{ fontSize: 11, fontWeight: '600', color: isDark ? '#94A3B8' : '#64748B' }}>
                                {currentService.time}
                              </Text>
                            </View>
                          ) : null}
                          {currentService.songLeader ? (
                            <Text style={{ fontSize: 11, fontWeight: '700', color: isDark ? '#34D399' : '#047857' }}>
                              🎤 {currentService.songLeader}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      <View style={{
                        backgroundColor: isDark ? 'rgba(99, 102, 241, 0.25)' : '#EEF2FF',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 6
                      }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#A5B4FC' : '#4338CA' }}>
                          {serviceSongs.length} {serviceSongs.length === 1 ? 'Song' : 'Songs'}
                        </Text>
                      </View>
                    </View>

                    {/* Songs List */}
                    {serviceSongs.length === 0 ? (
                      <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                        <Music size={22} color={isDark ? '#71717A' : '#94A3B8'} />
                        <Text style={{ fontSize: 12, color: isDark ? '#A1A1AA' : '#64748B', marginTop: 4 }}>
                          No songs scheduled for this service.
                        </Text>
                      </View>
                    ) : (
                      serviceSongs.map((s, songIdx) => (
                        <TouchableOpacity
                          key={s.id || songIdx}
                          activeOpacity={0.8}
                          onPress={() => setSelectedEventSong(s)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: isDark ? '#27272A' : '#FFFFFF',
                            borderRadius: 10,
                            padding: 10,
                            marginBottom: 6,
                            borderWidth: 1,
                            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0'
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginRight: 8 }}>
                            <View style={{
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              backgroundColor: isDark ? 'rgba(99, 102, 241, 0.25)' : '#EEF2FF',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: isDark ? '#A5B4FC' : '#4338CA' }}>
                                {songIdx + 1}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: isDark ? '#FFFFFF' : '#1a2d5a' }} numberOfLines={1}>
                                {s.title}
                              </Text>
                              {s.titleTe ? (
                                <Text style={{ fontSize: 11, color: isDark ? '#A1A1AA' : '#64748B' }} numberOfLines={1}>
                                  {s.titleTe}
                                </Text>
                              ) : null}
                            </View>
                            {s.key ? (
                              <View style={{ backgroundColor: isDark ? '#3F3F46' : '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ fontSize: 10, fontWeight: '800', color: isDark ? '#E4E4E7' : '#475569' }}>{s.key}</Text>
                              </View>
                            ) : null}
                          </View>

                          <Play size={13} color={isDark ? '#60A5FA' : '#2563EB'} fill={isDark ? '#60A5FA' : '#2563EB'} />
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                );
              })()}
            </View>
          )}

          {/* ── VIDEO SECTION — shown based on status ── */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={[styles.iconCircle, { backgroundColor: '#fee2e2' }]}>
                <Video size={18} color="#dc2626" />
              </View>
              <Text style={[styles.sectionTitle, { color: colors.text, flex: 1 }]}>
                {status === 'upcoming' ? 'Event Video · వీడియో' :
                 status === 'live'     ? 'Live Now · లైవ్ ఇప్పుడు' :
                                        'Event Recording · కార్యక్రమం వీడియో'}
              </Text>
            </View>

            {/* UPCOMING — not started yet */}
            {status === 'upcoming' && (
              <View style={[styles.lockedCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.lockedIconWrap}>
                  <Lock size={32} color="#94a3b8" />
                </View>
                <Text style={[styles.lockedTitle, { color: colors.text }]}>Event Has Not Started Yet</Text>
                <Text style={styles.lockedTitleTe}>కార్యక్రమం ఇంకా ప్రారంభం కాలేదు</Text>
                <View style={styles.lockedDateRow}>
                  <Calendar size={14} color="#1a2d5a" />
                  <Text style={[styles.lockedDate, { color: colors.text }]}>
                    Scheduled for {formatDate(event.date)}
                  </Text>
                </View>
                <View style={styles.lockedDateRow}>
                  <Clock size={14} color="#1a2d5a" />
                  <Text style={styles.lockedDate}>
                    {formatTime(event.startTime)} – {formatTime(event.endTime)}
                  </Text>
                </View>
                <Text style={[styles.lockedSub, { color: colors.textSecondary }]}>
                  The recording will be available here after the event ends.
                  {'\n'}కార్యక్రమం ముగిసిన తర్వాత వీడియో ఇక్కడ అందుబాటులో ఉంటుంది.
                </Text>
              </View>
            )}

            {/* LIVE — show embedded live stream player window */}
            {status === 'live' && (
              <View>
                <View style={styles.liveBanner}>
                  <Radio size={18} color="#fff" />
                  <Text style={styles.liveBannerText}>This event is happening RIGHT NOW! · లైవ్ ప్రసారం అవుతోంది</Text>
                </View>

                {/* ── EMBEDDED LIVE STREAM PLAYER WINDOW ── */}
                <View style={styles.liveStreamPlayerContainer}>
                  {liveStreamLoading && !liveStreamVideoId && !liveStreamChannelId ? (
                    <View style={styles.liveVideoSearching}>
                      <ActivityIndicator size="large" color="#dc2626" />
                      <Text style={styles.liveVideoSearchingText}>Connecting to Live Stream...</Text>
                      <Text style={styles.liveVideoSearchingSubText}>లైవ్ స్ట్రీమ్ లోడ్ అవుతోంది...</Text>
                    </View>
                  ) : (
                    <View style={styles.videoContainer}>
                      <WebView
                        source={{
                          html: htmlLiveEmbed,
                          baseUrl: 'https://www.youtube.com',
                        }}
                        style={{ width: '100%', height: width * 0.55, backgroundColor: '#000000' }}
                        originWhitelist={['*']}
                        allowsInlineMediaPlayback={true}
                        mediaPlaybackRequiresUserAction={false}
                        javaScriptEnabled={true}
                        domStorageEnabled={true}
                        allowsFullscreenVideo={true}
                        onShouldStartLoadWithRequest={(req) => {
                          if (
                            req.url.includes('youtube') ||
                            req.url.includes('googlevideo') ||
                            req.url.includes('about:blank') ||
                            req.url.startsWith('data:')
                          ) {
                            return true;
                          }
                          return false;
                        }}
                      />
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* COMPLETED — show event recording directly inside EventDetailsScreen */}
            {status === 'completed' && (
              videoSearching && !recordingVideoId ? (
                <View style={styles.videoSearching}>
                  <ActivityIndicator size="large" color="#dc2626" />
                  <Text style={styles.videoSearchingText}>Finding event recording...</Text>
                  <Text style={styles.videoSearchingSubText}>వీడియో శోధిస్తున్నాం...</Text>
                </View>
              ) : (
                <View style={styles.videoContainer}>
                  <WebView
                    source={{
                      html: htmlRecordingEmbed,
                      baseUrl: 'https://www.youtube.com',
                    }}
                    style={{ width: '100%', height: width * 0.55, backgroundColor: '#000000' }}
                    originWhitelist={['*']}
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    allowsFullscreenVideo={true}
                    onShouldStartLoadWithRequest={(req) => {
                      if (
                        req.url.includes('youtube') ||
                        req.url.includes('googlevideo') ||
                        req.url.includes('about:blank') ||
                        req.url.startsWith('data:')
                      ) {
                        return true;
                      }
                      return false;
                    }}
                  />
                </View>
              )
            )}
          </View>

          {/* --- Share Button (Placed below Event Recording section, safe from device navigation bar) --- */}
          <View style={[styles.inlineShareContainer, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
            {status === 'live' ? (
              <TouchableOpacity
                style={styles.singleShareBtn}
                onPress={handleJoinLiveStream}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#EF4444', '#DC2626']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.singleShareGradient}
                >
                  <Radio size={18} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={[styles.singleShareText, { color: '#FFFFFF' }]}>● JOIN LIVE STREAM</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.singleShareBtn}
                onPress={onShare}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#227FFF', '#62B2FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.singleShareGradient}
                >
                  <Share2 size={18} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={styles.singleShareText}>SHARE EVENT DETAILS</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Sharing Overlay Spinner */}
      {isSharing && (
        <View style={StyleSheet.absoluteFillObject}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', zIndex: 99999 }}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={{ color: '#ffffff', marginTop: 14, fontWeight: '700', fontSize: 15 }}>
              Preparing event to share...
            </Text>
          </View>
        </View>
      )}

      {/* Hidden capture view for fallback event card */}
      <View style={{ position: 'absolute', top: -10000, left: -10000 }}>
        <ViewShot ref={captureEventRef} options={{ format: 'png', quality: 1 }}>
          <View style={{ width, minHeight: width * 1.3, backgroundColor: '#0a1945' }} collapsable={false}>
            <LinearGradient
              colors={['#17357a', '#0a1945']}
              style={StyleSheet.absoluteFillObject}
            />
            {/* Decorative circles */}
            <View style={{ position: 'absolute', top: -40, right: -40, width: 180, height: 180, borderRadius: 90, borderWidth: 1.5, borderColor: 'rgba(203, 213, 225, 0.15)' }} />
            <View style={{ position: 'absolute', bottom: -40, left: -20, width: 160, height: 160, borderRadius: 80, borderWidth: 1.5, borderColor: 'rgba(203, 213, 225, 0.1)' }} />

            <View style={{ flex: 1, padding: 26, justifyContent: 'space-between' }}>
              <View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#fbbf24', letterSpacing: 1.5 }}>
                    CHURCH EVENT · ప్రత్యేక కార్యక్రమం
                  </Text>
                  <View style={{ backgroundColor: statusConfig.bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: statusConfig.color }}>{statusConfig.label}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 22, fontWeight: '900', color: '#ffffff', lineHeight: 30 }}>
                  {event.title || event.name}
                </Text>
                {(event.titleTelugu || event.titleTe) ? (
                  <Text style={{ fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.8)', marginTop: 4 }}>
                    {event.titleTelugu || event.titleTe}
                  </Text>
                ) : null}
              </View>

              <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 16, padding: 18, marginVertical: 18, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Calendar size={18} color="#fbbf24" />
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#ffffff' }}>
                    {formatDate(event.date)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Clock size={18} color="#fbbf24" />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#ffffff' }}>
                    {formatTime(event.startTime)} – {formatTime(event.endTime)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MapPin size={18} color="#fbbf24" />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#ffffff', flex: 1 }}>
                    {event.location || event.address || 'Church Main Hall'}
                  </Text>
                </View>
              </View>

              <View style={{ alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)', paddingTop: 16 }}>
                <Text style={{ fontSize: 15, color: '#ffffff', fontWeight: '800', letterSpacing: 0.5 }}>
                  {activeChurch?.name || 'Church of GOD'} 🙏
                </Text>
              </View>
            </View>
          </View>
        </ViewShot>
      </View>

      {selectedEventSong && (
        <SongDetailModal
          visible={!!selectedEventSong}
          song={selectedEventSong}
          onClose={() => setSelectedEventSong(null)}
          isDark={isDark}
        />
      )}

      {/* ── Admin RSVP Participation Modal ── */}
      {isAdmin && (
        <EventRsvpAnalyticsModal
          visible={showRsvpAnalytics}
          onClose={() => setShowRsvpAnalytics(false)}
          eventId={event.id}
          eventTitle={event.title || event.name || 'Church Event'}
          eventDate={formatDate(event.date)}
          churchId={activeChurch?.id}
          isDark={isDark}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  heroWrapper: {
    width: '100%',
    paddingTop: 6,
    paddingHorizontal: 16,
  },
  heroContainer: { 
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden'
  },
  heroImage: { 
    width: '100%', 
    height: '100%', 
    borderRadius: 18.5,
  },
  headerActions: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : (StatusBar.currentHeight || 24) + 12,
    left: 16, right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20
  },
  circleBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(10, 25, 69, 0.65)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6
  },

  contentCard: {
    flex: 1, backgroundColor: '#fff',
    borderTopLeftRadius: 30, borderTopRightRadius: 30,
    padding: 22, minHeight: height * 0.65,
    marginTop: 10,
    elevation: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10
  },
  indicator: {
    width: 40, height: 5, backgroundColor: '#f1f5f9', borderRadius: 3,
    alignSelf: 'center', marginBottom: 20
  },
  blackPill: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#27272A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 2,
  },
  blackPillDark: {
    borderColor: 'rgba(255, 255, 255, 0.22)',
    shadowOpacity: 0.4,
  },
  blackPillText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  headerBadgeRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20,
  },
  statusPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  categoryPill: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20,
  },
  categoryPillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  churchPill: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, maxWidth: 180
  },
  churchPillText: { fontSize: 11, fontWeight: '700' },

  titleSection: { marginBottom: 16 },
  titleEn: { fontSize: 17, fontWeight: '900', marginBottom: 4, letterSpacing: -0.3 },
  titleTe: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  
  badgeRow: { marginBottom: 24 },
  scheduleCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  scheduleCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  scheduleCardTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  dateBlock: {
    paddingVertical: 2,
  },
  dateSingleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 2,
  },
  dateTextMain: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  dateTextMainDark: {
    color: '#FFFFFF',
  },
  dateDotSeparator: {
    fontSize: 14,
    fontWeight: '800',
    color: '#94A3B8',
  },
  dateDotSeparatorDark: {
    color: '#64748B',
  },
  dateTextTelugu: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  dateTextTeluguDark: {
    color: '#E2E8F0',
  },
  dateRowDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 8,
  },
  dateRowDividerDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  scheduleSectionDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 14,
  },
  scheduleSectionDividerDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  fieldMiniLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  fieldMiniLabelDark: {
    color: '#94A3B8',
  },
  timeScheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  timeCol: {
    flex: 1,
  },
  timeTextMain: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  timeTextMainDark: {
    color: '#FFFFFF',
  },
  timeVerticalDivider: {
    width: 1,
    height: 34,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 16,
  },
  timeVerticalDividerDark: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  dateBadge: { 
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fffbeb', padding: 14, borderRadius: 18,
    borderWidth: 1, borderColor: '#fef3c7', gap: 12
  },
  timeBadge: { 
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8fafc', padding: 14, borderRadius: 18,
    borderWidth: 1, borderColor: '#f1f5f9', gap: 12
  },
  badgeIconCircle: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#fef3c7', justifyContent: 'center', alignItems: 'center'
  },
  badgeValue: { fontSize: 15, fontWeight: '800', color: '#1a2d5a' },
  badgeSubValue: { fontSize: 11, color: '#94a3b8', fontWeight: '600', marginTop: 2 },
  timeValue: { fontSize: 14, fontWeight: '800', color: '#c0392b' },
  
  section: { marginBottom: 28 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  iconCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f0f9ff', justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#1a2d5a', letterSpacing: -0.2 },
  
  locCard: { backgroundColor: '#f8fafc', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#f1f5f9' },
  locName: { fontSize: 16, fontWeight: '700', color: '#1e293b', lineHeight: 22, marginBottom: 4 },
  locSub: { fontSize: 13, color: '#64748b', marginBottom: 8 },
  mapBtnTouchable: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderRadius: 24,
    shadowColor: '#227FFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  mapBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 24,
  },
  mapBtnGradientText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  descCard: { backgroundColor: '#fff', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#f1f5f9' },
  description: { fontSize: 15, color: '#475569', lineHeight: 26, fontWeight: '400' },
  qrReqBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    gap: 12,
  },
  qrReqIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrReqTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  qrReqSub: {
    fontSize: 11.5,
    lineHeight: 16,
  },

  // ── UPCOMING — locked card ──
  lockedCard: {
    backgroundColor: '#f8fafc', borderRadius: 20, padding: 28,
    alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', gap: 8,
  },
  lockedIconWrap: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center',
    marginBottom: 8,
  },
  lockedTitle: { fontSize: 17, fontWeight: '800', color: '#1e293b', textAlign: 'center' },
  lockedTitleTe: { fontSize: 14, color: '#64748b', fontWeight: '600', textAlign: 'center' },
  lockedDateRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 },
  lockedDate: { fontSize: 13, color: '#1a2d5a', fontWeight: '700' },
  lockedSub: { fontSize: 12, color: '#94a3b8', textAlign: 'center', lineHeight: 20, marginTop: 12 },

  // ── LIVE ──
  liveBanner: {
    backgroundColor: '#dc2626', borderRadius: 12, padding: 14,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12,
  },
  liveBannerText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  liveBtn: {
    backgroundColor: '#dc2626', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', padding: 18, borderRadius: 16, gap: 14,
    elevation: 6, shadowColor: '#dc2626', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  liveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  liveBtnSub: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '500', marginTop: 2 },

  // ── COMPLETED ──
  videoContainer: {
    backgroundColor: '#000', elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10,
    borderRadius: 16, overflow: 'hidden'
  },
  youtubeChannelBtn: {
    backgroundColor: '#dc2626', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', padding: 18, borderRadius: 16, gap: 14,
    elevation: 3, shadowColor: '#dc2626', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }
  },
  youtubeChannelBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  youtubeChannelBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '500', marginTop: 2 },
  videoSearching: {
    backgroundColor: '#fff5f5', borderRadius: 16, padding: 28,
    alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#fee2e2'
  },
  videoSearchingText: { fontSize: 14, fontWeight: '700', color: '#dc2626', marginTop: 6 },
  videoSearchingSubText: { fontSize: 12, color: '#94a3b8', fontWeight: '500' },

  inlineShareContainer: {
    marginTop: 26,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleShareBtn: {
    width: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#227FFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  singleShareGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderRadius: 28,
  },
  singleShareText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  mainBtn: {
    flex: 1,
    backgroundColor: '#1a2d5a', borderRadius: 18, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
    elevation: 8, shadowColor: '#1a2d5a', shadowOpacity: 0.35, shadowRadius: 8
  },
  mainBtnText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },

  // ── LIVE STREAM PLAYER WINDOW ──
  liveStreamPlayerContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  liveVideoSearching: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: width * 0.55,
  },
  liveVideoSearchingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F8FAFC',
    marginTop: 6,
  },
  liveVideoSearchingSubText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
});
