import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar, Platform, Alert, ToastAndroid } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft, Calendar, Clock, User, BookOpen, Radio, ExternalLink, LogOut, Video, Key, Copy, CheckCircle } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAdminTheme, createAdminThemedStyles } from '../utils/adminThemeHelper';
import { useAuth } from '../context/AuthContext';
import { useChurch } from '../context/ChurchContext';
import { useLanguage } from '../context/LanguageContext';
import firestore from '@react-native-firebase/firestore';
import {
  launchOnlineMeetingUrl,
  parseMeetingTimestamp,
  resolveMeetingStatus,
} from '../utils/meetingActions';

const BRAND = '#1a2d5a';
const SHOW_YOUTUBE_LIVE = false;

export default function OnlineMeetingDetailScreen({ navigation, route }: any) {
  const { isDark: _adminIsDark, colors: adminColors, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor: adminBorderColor, appFontFamily, barStyle, scaleFont } = useAdminTheme();
  const insets = useSafeAreaInsets();
  const initialMeeting =
    route.params?.meeting ||
    (route.params?.meetingId
      ? { id: String(route.params.meetingId), churchId: String(route.params?.churchId || 'rhema') }
      : {});
  const [meeting, setMeeting] = useState<any>(initialMeeting);
  const { isDark } = useTheme();
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const { t } = useLanguage();

  const [hasJoined, setHasJoined] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (route.params?.meeting) {
      setMeeting(route.params.meeting);
    } else if (route.params?.meetingId) {
      setMeeting({
        id: String(route.params.meetingId),
        churchId: String(route.params?.churchId || activeChurch?.id || member?.churchId || 'rhema'),
      });
    }
  }, [route.params?.meeting, route.params?.meetingId, route.params?.churchId, activeChurch?.id, member?.churchId]);

  const bgColor = screenBg;
  const textColor = primaryText;

  // Real-time listener on the meeting doc so Scheduled -> Live -> Completed transitions reflect immediately
  useEffect(() => {
    const churchId = activeChurch?.id || meeting?.churchId || member?.churchId;
    if (!churchId || !meeting?.id) return;

    const unsubMeeting = firestore()
      .collection('Rhema Church')
      .doc(churchId)
      .collection('online_meetings')
      .doc(meeting.id)
      .onSnapshot(
        (doc) => {
          if (doc.exists) {
            setMeeting({ id: doc.id, ...doc.data() });
          }
        },
        () => {}
      );

    return () => unsubMeeting();
  }, [activeChurch?.id, meeting?.id, meeting?.churchId, member?.churchId]);

  useEffect(() => {
    const churchId = activeChurch?.id || meeting?.churchId || member?.churchId;
    const attendeeId = user?.uid || member?.id;
    if (!churchId || !meeting?.id || !attendeeId) {
      setLoading(false);
      return;
    }

    const unsubscribe = firestore()
      .collection('Rhema Church')
      .doc(churchId)
      .collection('online_meetings')
      .doc(meeting.id)
      .collection('attendees')
      .doc(attendeeId)
      .onSnapshot((doc) => {
        setHasJoined(doc.exists);
        setLoading(false);
      }, (error) => {
        console.warn("Attendance listener warning:", error);
        setLoading(false);
      });

    return () => unsubscribe();
  }, [activeChurch?.id, meeting?.id, meeting?.churchId, member?.id, member?.churchId, user?.uid]);

  const handleJoin = async () => {
    const rawLink = meeting?.meetingLink || meeting?.meetingUrl || meeting?.url || meeting?.link || '';
    if (!rawLink || !rawLink.trim()) {
      Alert.alert(t('meetings.alerts.noLinkTitle'), t('meetings.alerts.noLinkMsg'));
      return;
    }

    try {
      const opened = await launchOnlineMeetingUrl(
        meeting,
        member?.name || user?.displayName || 'Church Member'
      );
      if (!opened) {
        Alert.alert('Cannot Open Link', `Unable to open: ${rawLink}`);
      }
    } catch (launchErr: any) {
      console.error('Failed to open meeting URL:', launchErr);
      Alert.alert('Error', 'Could not open meeting link. Please make sure Google Meet or a web browser is installed.');
    }

    const churchId = activeChurch?.id || meeting?.churchId || member?.churchId;
    const attendeeId = user?.uid || member?.id;
    if (churchId && meeting?.id && attendeeId) {
      firestore()
        .collection('Rhema Church')
        .doc(churchId)
        .collection('online_meetings')
        .doc(meeting.id)
        .collection('attendees')
        .doc(attendeeId)
        .set({
          name: member?.name || user?.displayName || 'Church Member',
          profilePhoto: (member as any)?.profilePhoto || (member as any)?.photoURL || user?.photoURL || null,
          joinedAt: firestore.FieldValue.serverTimestamp()
        }, { merge: true })
        .then(() => setHasJoined(true))
        .catch((e) => {
          console.warn('Attendance log notice (non-fatal):', e);
        });
    }
  };

  const handleLeave = async () => {
    const churchId = activeChurch?.id || meeting?.churchId || member?.churchId;
    const attendeeId = user?.uid || member?.id;
    if (!churchId || !meeting?.id || !attendeeId) return;
    try {
      await firestore()
        .collection('Rhema Church')
        .doc(churchId)
        .collection('online_meetings')
        .doc(meeting.id)
        .collection('attendees')
        .doc(attendeeId)
        .delete();
      setHasJoined(false);
    } catch (e) {
      console.log('Leave error:', e);
      Alert.alert(t('common.error'), t('meetings.alerts.leaveError'));
    }
  };

  const startDt = parseMeetingTimestamp(meeting.startTime);
  const endDt = parseMeetingTimestamp(meeting.endTime);

  const formattedDate = startDt
    ? startDt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : meeting.date || 'TBA';

  const formattedTime = startDt && endDt
    ? `${startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${endDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : startDt
    ? startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : meeting.startTimeLabel || 'TBA';

  const canonicalStatus = resolveMeetingStatus(meeting, true);
  const isCompleted = canonicalStatus === 'completed';
  const isLive = canonicalStatus === 'live';

  const gradStart = isLive ? '#b91c1c' : isCompleted ? '#374151' : '#1a2d5a';
  const gradEnd = isLive ? '#7f1d1d' : isCompleted ? '#1f2937' : '#0f1e3d';

  const topPad = Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8;

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <StatusBar barStyle={barStyle} backgroundColor={bgColor} />

      {/* Clean Theme-Aligned Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad,
            backgroundColor: bgColor,
            borderBottomColor: isDark ? '#2E2E2E' : '#CBD5E1',
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={[styles.backBtn, { backgroundColor: cardSurface, borderColor: adminBorderColor }]}
          activeOpacity={0.8}
        >
          <ArrowLeft color={textColor} size={20} strokeWidth={2.4} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textColor }]} numberOfLines={1}>
          {t('meetings.meetingDetails')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.gradCard, { backgroundColor: gradStart }]}>
          {/* Decorative circle */}
          <View style={[styles.gradCircle, { backgroundColor: gradEnd }]} />

          {/* Status Pill + Platform Badge + YouTube Badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 6, flexWrap: 'wrap' }}>
            {isLive ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#4ADE80', marginRight: 6 }} />
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800', letterSpacing: 0.3 }}>LIVE NOW</Text>
              </View>
            ) : isCompleted ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                <Text style={{ color: '#E5E7EB', fontSize: 12, fontWeight: '700' }}>COMPLETED</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(245, 158, 11, 0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#FBBF24' }}>
                <Text style={{ color: '#FDE68A', fontSize: 12, fontWeight: '800' }}>SCHEDULED</Text>
              </View>
            )}

            {meeting.meetingType === 'zoom' || meeting.provider === 'zoom' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(45, 140, 255, 0.4)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#2D8CFF' }}>
                <Video size={13} color="#ffffff" style={{ marginRight: 5 }} />
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>Zoom Meeting</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16, 185, 129, 0.4)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#10B981' }}>
                <Video size={13} color="#ffffff" style={{ marginRight: 5 }} />
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>Google Meet</Text>
              </View>
            )}
            {SHOW_YOUTUBE_LIVE && meeting.youtubeLive?.enabled ? (
              <View style={{ 
                flexDirection: 'row', 
                alignItems: 'center', 
                backgroundColor: meeting.youtubeLive.status === 'live' ? 'rgba(220, 38, 38, 0.5)' : 'rgba(239, 68, 68, 0.3)', 
                paddingHorizontal: 10, 
                paddingVertical: 4, 
                borderRadius: 8, 
                borderWidth: 1, 
                borderColor: '#EF4444' 
              }}>
                <Radio size={12} color="#ffffff" style={{ marginRight: 5 }} />
                <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '700' }}>
                  {meeting.youtubeLive.status === 'live' ? '🔴 Live on YouTube' : 'YouTube Live'}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Title */}
          <Text style={styles.gradTitle} numberOfLines={3}>
            {meeting.title || t('meetings.onlineMeeting')}
          </Text>

          {/* Subtitle / Topic */}
          {(meeting.subtitle || meeting.topic) ? (
            <Text style={styles.gradSubtitle} numberOfLines={2}>
              {meeting.subtitle || meeting.topic}
            </Text>
          ) : null}

          {/* Divider */}
          <View style={styles.gradDivider} />

          {/* Info rows */}
          <View style={styles.gradInfoRow}>
            <Calendar size={18} color="rgba(255,255,255,0.75)" />
            <Text style={styles.gradInfoText}>{formattedDate}</Text>
          </View>

          <View style={styles.gradInfoRow}>
            <Clock size={18} color="rgba(255,255,255,0.75)" />
            <Text style={styles.gradInfoText}>{formattedTime}</Text>
          </View>

          {meeting.bibleBook ? (
            <View style={styles.gradInfoRow}>
              <BookOpen size={18} color="rgba(255,255,255,0.75)" />
              <Text style={styles.gradInfoText}>{meeting.bibleBook}</Text>
            </View>
          ) : null}

          {(meeting.teacher || meeting.teacherName) ? (
            <View style={styles.gradInfoRow}>
              <User size={18} color="rgba(255,255,255,0.75)" />
              <Text style={styles.gradInfoText}>{t('meetings.hostPrefix')} {meeting.teacher || meeting.teacherName}</Text>
            </View>
          ) : null}

          {meeting.password ? (
            <View style={[styles.gradInfoRow, { justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginTop: 6 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                <Key size={18} color="#FCD34D" />
                <Text style={[styles.gradInfoText, { marginLeft: 8 }]}>
                  Passcode: <Text style={{ fontWeight: '800', color: '#FCD34D' }}>{meeting.password}</Text>
                </Text>
              </View>
              <TouchableOpacity 
                onPress={async () => {
                  await Clipboard.setStringAsync(String(meeting.password));
                  if (Platform.OS === 'android') {
                    ToastAndroid.show(`Passcode ${meeting.password} copied!`, ToastAndroid.SHORT);
                  } else {
                    Alert.alert('Copied', `Meeting Passcode ${meeting.password} copied to clipboard!`);
                  }
                }}
                style={{ backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, flexDirection: 'row', alignItems: 'center' }}
              >
                <Copy size={13} color="#fff" style={{ marginRight: 4 }} />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Copy</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          
          {meeting.description && meeting.description !== meeting.topic && meeting.description !== meeting.subtitle ? (
            <View style={[styles.gradInfoRow, { alignItems: 'flex-start', marginTop: 8 }]}>
              <BookOpen size={18} color="rgba(255,255,255,0.75)" style={{ marginTop: 2 }} />
              <Text style={[styles.gradInfoText, { lineHeight: 22, opacity: 0.9 }]}>{meeting.description}</Text>
            </View>
          ) : null}

          {/* YouTube Live Stream Watch Option */}
          {SHOW_YOUTUBE_LIVE && meeting.youtubeLive?.enabled ? (
            <TouchableOpacity
              style={{
                backgroundColor: meeting.youtubeLive.status === 'live' ? '#DC2626' : '#B91C1C',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 14,
                borderRadius: 12,
                marginTop: 16,
                elevation: 4,
                shadowColor: '#DC2626',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.35,
                shadowRadius: 6,
              }}
              onPress={() => {
                const targetUrl = meeting.youtubeLive?.watchUrl || 'https://www.youtube.com';
                navigation.navigate('YouTubeLive', { url: targetUrl, videoId: meeting.youtubeLive?.broadcastId, title: meeting.title });
              }}
            >
              <Radio size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 }}>
                {meeting.youtubeLive.status === 'live' 
                  ? '🔴 Watch Live on YouTube' 
                  : (meeting.youtubeLive.status === 'ended' 
                    ? '▶ Watch Replay on YouTube' 
                    : '📺 Watch on YouTube')}
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* Action area based on canonical meeting status */}
          {isCompleted ? (
            <View style={[styles.gradActions, { marginTop: 20, justifyContent: 'center' }]}>
              <View style={[styles.gradLeaveBtn, { borderWidth: 0, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 32, flex: 1 }]}>
                <Text style={[styles.gradLeaveText, { opacity: 0.9 }]}>{t('meetings.meetingCompleted')}</Text>
              </View>
            </View>
          ) : !isLive ? (
            <View style={{ marginTop: 18 }}>
              <View style={styles.waitingBanner}>
                <Clock size={16} color="#FDE68A" />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13.5 }}>
                    Waiting for Host to Start
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2, lineHeight: 17 }}>
                    You will receive a live notification as soon as this meeting begins.
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={{ marginTop: 18, gap: 12 }}>
              {loading ? (
                <ActivityIndicator size="small" color="#fff" style={{ marginVertical: 10 }} />
              ) : hasJoined ? (
                <>
                  <View style={styles.joinedBanner}>
                    <CheckCircle size={18} color="#4ADE80" />
                    <Text style={styles.joinedBannerText}>
                      You joined this live session
                    </Text>
                  </View>

                  <View style={styles.gradActions}>
                    <TouchableOpacity
                      style={[styles.gradJoinBtn, { flex: 1.2, justifyContent: 'center' }]}
                      onPress={handleJoin}
                      activeOpacity={0.85}
                    >
                      <ExternalLink size={15} color={gradStart} />
                      <Text style={[styles.gradJoinText, { color: gradStart }]}>Open Meeting</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.gradLeaveBtn, { flex: 1 }]}
                      onPress={handleLeave}
                      activeOpacity={0.85}
                    >
                      <LogOut size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.gradLeaveText}>{t('meetings.leave')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.gradJoinBtn, { justifyContent: 'center' }]}
                  onPress={handleJoin}
                  activeOpacity={0.85}
                >
                  <Video size={17} color={gradStart} />
                  <Text style={[styles.gradJoinText, { color: gradStart }]}>
                    {meeting.meetingType === 'zoom' || meeting.provider === 'zoom'
                      ? 'Join Live Zoom Meeting'
                      : 'Join Live Google Meet'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.2, flex: 1, textAlign: 'center' },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  scrollContent: { padding: 16, paddingBottom: 44 },

  // Gradient card (Matching OnlineMeetingsScreen)
  gradCard: {
    borderRadius: 24,
    padding: 24,
    marginTop: 6,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  gradCircle: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -60,
    right: -50,
    opacity: 0.4,
  },
  gradTitle: {
    color: '#fff',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: 0.2,
    lineHeight: 32,
    marginBottom: 6,
  },
  gradSubtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 16,
    lineHeight: 22,
  },
  gradDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 18,
  },
  gradInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 14,
  },
  gradInfoText: {
    color: '#fff',
    fontSize: 15.5,
    fontWeight: '700',
    flex: 1,
  },
  waitingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  joinedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.45)',
  },
  joinedBannerText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
    flex: 1,
  },
  gradActions: {
    flexDirection: 'row',
    gap: 10,
  },
  gradJoinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  gradJoinText: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  gradLeaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 24,
  },
  gradLeaveText: {
    color: '#fff',
    fontSize: 14.5,
    fontWeight: '700',
  },
}));
