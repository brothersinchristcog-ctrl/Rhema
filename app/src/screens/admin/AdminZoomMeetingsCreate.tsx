import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, 
  ScrollView, ActivityIndicator, KeyboardAvoidingView, 
  Platform, Modal, StatusBar 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import firebase from '@react-native-firebase/app';
import '@react-native-firebase/functions';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { 
  Calendar, Clock, Book, User, Type, AlignLeft, 
  Link as LinkIcon, Copy, CheckCircle, AlertCircle, X, ArrowLeft, Video 
} from 'lucide-react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import * as Clipboard from 'expo-clipboard';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';
import { isMeetingAdmin, saveEditedOnlineMeeting } from '../../utils/meetingActions';

function toJsDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val?.toDate === 'function') return val.toDate();
  if (typeof val?.seconds === 'number') return new Date(val.seconds * 1000);
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const parsed = new Date(val);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function formatTime12h(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDateDDMMYYYY(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function resolveInitialProvider(
  editingMeeting: any,
  initialProvider: 'zoom' | 'google_meet'
): 'zoom' | 'google_meet' {
  if (editingMeeting) {
    return editingMeeting.provider === 'zoom' || editingMeeting.meetingType === 'zoom'
      ? 'zoom'
      : 'google_meet';
  }
  return initialProvider;
}

function buildInitialForm(editingMeeting: any, fallbackTeacher: string) {
  if (!editingMeeting) {
    return {
      title: '',
      topic: '',
      bibleBook: '',
      date: '',
      startTime: '',
      endTime: '',
      teacherName: fallbackTeacher || '',
      meetingLink: '',
      zoomMeetingId: '',
      password: '',
    };
  }
  const startDt = toJsDate(editingMeeting.startTime);
  const endDt = toJsDate(editingMeeting.endTime);

  let dateStr = String(editingMeeting.date || '').trim();
  if (!dateStr && typeof editingMeeting.scheduledDate === 'string' && editingMeeting.scheduledDate.includes('-')) {
    const parts = editingMeeting.scheduledDate.split('-');
    if (parts.length === 3 && parts[0]?.length === 4) {
      dateStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  if (!dateStr && startDt) {
    dateStr = formatDateDDMMYYYY(startDt);
  }

  return {
    title: String(editingMeeting.title || ''),
    topic: String(editingMeeting.topic || editingMeeting.subtitle || editingMeeting.description || ''),
    bibleBook: String(editingMeeting.bibleBook || ''),
    date: dateStr,
    startTime: String(editingMeeting.startTimeLabel || (startDt ? formatTime12h(startDt) : '')),
    endTime: String(editingMeeting.endTimeLabel || (endDt ? formatTime12h(endDt) : '')),
    teacherName: String(editingMeeting.teacherName || editingMeeting.teacher || fallbackTeacher || ''),
    meetingLink: String(editingMeeting.meetingLink || editingMeeting.meetingUrl || editingMeeting.url || ''),
    zoomMeetingId: String(editingMeeting.meetingId || ''),
    password: String(editingMeeting.password || ''),
  };
}

export default function AdminZoomMeetingsCreate({
  onBack,
  initialProvider = 'zoom',
  hideHeader = false,
  editingMeeting = null,
  onSaved,
}: {
  onBack: () => void;
  initialProvider?: 'zoom' | 'google_meet';
  hideHeader?: boolean;
  editingMeeting?: any | null;
  onSaved?: (updatedMeeting: any) => void;
}) {
  const { isDark, screenBg, cardSurface, primaryText, secondaryText, borderColor: adminBorderColor, barStyle } = useAdminTheme();
  const insets = useSafeAreaInsets();
  const { member, isPlatformSuperAdmin } = useAuth();
  const canManageMeetings = isMeetingAdmin(member, isPlatformSuperAdmin);
  const isEditing = Boolean(editingMeeting?.id);
  const [provider, setProvider] = useState<'zoom' | 'google_meet'>(() =>
    resolveInitialProvider(editingMeeting, initialProvider)
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setProvider(resolveInitialProvider(editingMeeting, initialProvider));
  }, [initialProvider, editingMeeting]);
  
  // Custom Popup State
  const [popup, setPopup] = useState({
    visible: false,
    type: 'success' as 'success' | 'error' | 'link',
    title: '',
    message: '',
    link: '',
    onClose: () => {}
  });

  const showPopup = (type: 'success'|'error'|'link', title: string, message: string, link: string = '', onClose: () => void = () => {}) => {
    setPopup({ visible: true, type, title, message, link, onClose });
  };

  const closePopup = () => {
    const onC = popup.onClose;
    setPopup(prev => ({ ...prev, visible: false }));
    if (onC) onC();
  };

  const copyToClipboard = async (text: string) => {
    if (!text) return;
    await Clipboard.setStringAsync(text);
  };

  const parseDateTimeToMs = (dateStr: string, timeStr: string) => {
    try {
      const [day, month, year] = dateStr.split('-');
      
      const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return null;

      let hours = parseInt(match[1], 10);
      const minutes = match[2];
      const modifier = match[3].toUpperCase();
      
      if (hours === 12) {
        hours = modifier === 'AM' ? 0 : 12;
      } else if (modifier === 'PM') {
        hours += 12;
      }
      
      const hoursStr = String(hours).padStart(2, '0');
      const isoString = `${year}-${month}-${day}T${hoursStr}:${minutes}:00`;
      return new Date(isoString).getTime();
    } catch (e) {
      return null;
    }
  };

  const [form, setForm] = useState(() =>
    buildInitialForm(editingMeeting, member?.name || '')
  );

  useEffect(() => {
    if (editingMeeting) {
      setForm(buildInitialForm(editingMeeting, member?.name || ''));
    }
  }, [editingMeeting?.id]);

  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [isStartTimePickerVisible, setStartTimePickerVisibility] = useState(false);
  const [isEndTimePickerVisible, setEndTimePickerVisibility] = useState(false);

  const formatTime = formatTime12h;

  const handleChange = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  // ── 1. Zoom Link Generation (via Asia-South1 Cloud Function) ──
  const handleGenerateZoomLink = async () => {
    try {
      setLoading(true);

      const startTimestamp = parseDateTimeToMs(form.date, form.startTime);
      const endTimestamp = parseDateTimeToMs(form.date, form.endTime);
      const isoStartTime = startTimestamp ? new Date(startTimestamp).toISOString() : new Date().toISOString();
      const duration =
        startTimestamp && endTimestamp && endTimestamp > startTimestamp
          ? Math.max(15, Math.round((endTimestamp - startTimestamp) / 60000))
          : 60;

      const generateZoom = firebase.app().functions('asia-south1').httpsCallable('generateZoomMeetingLink');
      const response = await generateZoom({
        topic: form.title || 'Church Online Meeting',
        startTime: isoStartTime,
        duration,
      });

      const data = response.data as any;
      const resolvedUrl = data?.meetingUri || data?.meetingUrl;
      if (data?.success && resolvedUrl) {
        setForm(prev => ({
          ...prev,
          meetingLink: resolvedUrl,
          zoomMeetingId: String(data?.meetingId || prev.zoomMeetingId || ''),
          password: String(data?.password || prev.password || ''),
        }));
        showPopup('link', 'Zoom Link Generated!', 'Your official Zoom Meeting has been created. Members can join via this link.', resolvedUrl);
      } else {
        showPopup('error', 'Error', data?.message || 'Failed to generate Zoom link.');
      }
    } catch (error: any) {
      console.error('Zoom link generation error:', error);
      const errMsg =
        error?.message ||
        'Could not connect to Zoom. Please deploy the Zoom backend functions and set ZOOM credentials in functions/.env.';
      showPopup('error', 'Zoom Link Error', errMsg);
    } finally {
      setLoading(false);
    }
  };

  // ── 2. Google Meet Link Generation (via Google Meet API & GoogleSignin) ──
  const generateMeetLinkWithToken = async (accessToken: string) => {
    const res = await fetch('https://meet.googleapis.com/v2/spaces', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        config: { accessType: 'OPEN' }
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || 'Failed to create Google Meet space');
    }

    const data = await res.json();
    const meetLink = data.meetingUri;
    
    if (meetLink) {
      setForm(prev => ({ ...prev, meetingLink: meetLink }));
      showPopup('link', 'Google Meet Generated!', 'Your official Google Meet link has been created. Members can join via this link.', meetLink);
    } else {
      throw new Error("No meeting URI returned from Meet API.");
    }
  };

  const handleGenerateGoogleMeetLink = async () => {
    setLoading(true);
    try {
      const configuredWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
      GoogleSignin.configure({
        scopes: ['https://www.googleapis.com/auth/meetings.space.created'],
        offlineAccess: false,
        ...(configuredWebClientId ? { webClientId: configuredWebClientId } : {}),
      });
      await GoogleSignin.hasPlayServices();

      let accessToken: string | null = null;
      try {
        await GoogleSignin.signInSilently();
        const tokens = await GoogleSignin.getTokens();
        accessToken = tokens.accessToken;
      } catch (silentError) {
        await GoogleSignin.signOut().catch(() => {});
        const res = await GoogleSignin.signIn();
        const tokens = await GoogleSignin.getTokens();
        accessToken = tokens.accessToken;
      }

      if (!accessToken) {
        throw new Error('No access token received from Google.');
      }

      await generateMeetLinkWithToken(accessToken);

    } catch (error: any) {
      if (error?.message?.includes('SIGN_IN_CANCELLED')) {
        return;
      }
      
      if (error?.message?.includes('UNAUTHENTICATED') || error?.message?.includes('401') || error?.message?.includes('invalid authentication credentials')) {
        await GoogleSignin.signOut().catch(() => {});
        showPopup('error', 'Session Expired', 'Session expired or access revoked. Please click Generate Link again to reconnect.');
        return;
      }

      if (error?.message?.includes('403') || error?.message?.includes('PERMISSION_DENIED') || error?.message?.includes('insufficient')) {
        showPopup('error', 'Permission Denied', 'Please ensure you check the box to allow Meet space creation during sign-in.');
        return;
      }

      showPopup('error', 'Error', error?.message || 'Failed to generate Google Meet link.');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLink = () => {
    if (!canManageMeetings) {
      showPopup('error', 'Admin Access Only', 'Only church admins or pastors can generate meeting links.');
      return;
    }
    if (provider === 'google_meet') {
      handleGenerateGoogleMeetLink();
    } else {
      handleGenerateZoomLink();
    }
  };

  const handleCreate = async () => {
    if (!canManageMeetings) {
      showPopup('error', 'Admin Access Only', 'Only church admins or pastors can create or edit online meetings.');
      return;
    }

    if (!form.title.trim() || !form.date || !form.startTime || !form.endTime || !form.meetingLink.trim()) {
      showPopup('error', 'Missing Fields', 'Please fill out all required fields, including the Meeting Link.');
      return;
    }

    const startTimestamp = parseDateTimeToMs(form.date, form.startTime);
    const endTimestamp = parseDateTimeToMs(form.date, form.endTime);
    if (startTimestamp && endTimestamp && endTimestamp <= startTimestamp) {
      showPopup('error', 'Invalid Time Range', 'End Time must be later than Start Time.');
      return;
    }

    setLoading(true);
    try {
      const targetChurchId = editingMeeting?.churchId || member?.churchId || 'rhema';

      if (isEditing && editingMeeting?.id) {
        const startMs = startTimestamp || Date.now();
        const endMs = endTimestamp && endTimestamp > startMs ? endTimestamp : startMs + 60 * 60 * 1000;
        const cleanTitle = form.title.trim();
        const cleanTopic = form.topic.trim();
        const cleanBook = form.bibleBook.trim();
        const cleanTeacher = form.teacherName.trim() || 'Church Admin';
        const cleanLink = form.meetingLink.trim();

        await saveEditedOnlineMeeting({
          churchId: targetChurchId,
          meetingId: editingMeeting.id,
          title: cleanTitle,
          topic: cleanTopic,
          bibleBook: cleanBook,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          teacherId: editingMeeting.teacherId || member?.id || 'admin',
          teacherName: cleanTeacher,
          meetingLink: cleanLink,
          provider,
          startTimestamp: startMs,
          endTimestamp: endMs,
        });

        const updatedMeeting = {
          ...editingMeeting,
          title: cleanTitle,
          topic: cleanTopic,
          description: cleanTopic,
          bibleBook: cleanBook,
          date: form.date,
          startTimeLabel: form.startTime,
          endTimeLabel: form.endTime,
          startTime: { seconds: Math.floor(startMs / 1000) },
          endTime: { seconds: Math.floor(endMs / 1000) },
          teacherName: cleanTeacher,
          meetingLink: cleanLink,
          meetingUrl: cleanLink,
          url: cleanLink,
          provider,
          meetingType: provider,
        };

        showPopup(
          'success',
          'Meeting Updated!',
          `${provider === 'google_meet' ? 'Google Meet' : 'Zoom Meeting'} changes have been saved.`,
          '',
          () => {
            if (onSaved) onSaved(updatedMeeting);
            else onBack();
          }
        );
        return;
      }

      const createBibleClass = firebase.app().functions('asia-south1').httpsCallable('createBibleClass');
      const result = await createBibleClass({
        churchId: targetChurchId,
        title: form.title.trim(),
        topic: form.topic.trim(),
        bibleBook: form.bibleBook.trim(),
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        teacherId: member?.id || 'admin',
        teacherName: form.teacherName.trim(),
        meetingLink: form.meetingLink.trim(),
        provider: provider,
        meetingType: provider,
        recurrence: 'NONE',
        ...(form.zoomMeetingId ? { meetingId: form.zoomMeetingId } : {}),
        ...(form.password ? { password: form.password } : {}),
        startTimestamp,
        endTimestamp,
      });

      const data = result.data as any;
      if (data.success) {
        showPopup(
          'success',
          'Meeting Scheduled!',
          `${provider === 'google_meet' ? 'Google Meet' : 'Zoom Meeting'} has been scheduled and members have been notified. Tap "Go Live" when you start the meeting to send a live join alert.`,
          '',
          onBack
        );
      } else {
        showPopup('error', 'Error', data.message || 'Failed to create class');
      }
    } catch (error: any) {
      console.error(error);
      showPopup('error', 'Error', error.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const isGoogle = provider === 'google_meet';

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <StatusBar barStyle={barStyle} backgroundColor={isDark ? '#000000' : '#FFFFFF'} />

      {/* ── Pinned Top Header Bar (when not hidden by parent screen) ── */}
      {!hideHeader && (
        <View
          style={[
            styles.topbar,
            {
              backgroundColor: isDark ? '#000000' : '#FFFFFF',
              borderBottomWidth: 1.5,
              borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
              paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 20 : 12),
              paddingBottom: 10,
              paddingHorizontal: 16,
            }
          ]}
        >
          <View style={styles.headerTopRow}>
            <TouchableOpacity 
              onPress={onBack}
              style={styles.circularBackBtn} 
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ArrowLeft color={primaryText} size={22} strokeWidth={2.4} />
            </TouchableOpacity>

            <Text style={[styles.headerTitle, { color: primaryText }]} numberOfLines={1}>
              {isEditing
                ? isGoogle
                  ? 'Edit Google Meet'
                  : 'Edit Zoom Meeting'
                : isGoogle
                ? 'Schedule Google Meet'
                : 'Schedule Zoom Meeting'}
            </Text>

            <View style={{ width: 40 }} />
          </View>
        </View>
      )}

      {!canManageMeetings ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <AlertCircle size={40} color="#EF4444" style={{ marginBottom: 12 }} />
          <Text style={[styles.screenHeading, { color: primaryText, textAlign: 'center', marginBottom: 6 }]}>
            Admin Access Required
          </Text>
          <Text style={[styles.subtitle, { color: secondaryText, textAlign: 'center', marginBottom: 0 }]}>
            Only church admins and pastors can create or edit online meetings.
          </Text>
        </View>
      ) : (
        <KeyboardAvoidingView 
          style={{ flex: 1 }} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <ScrollView 
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 28 : 20) + 40 }
          ]} 
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.screenHeading, { color: primaryText }]}>Meeting Details</Text>
          <Text style={[styles.subtitle, { color: secondaryText }]}>
            {isEditing
              ? `Update the scheduled ${isGoogle ? 'Google Meet' : 'Zoom Meeting'} time, topic, host, or link.`
              : isGoogle
              ? 'Schedule a new Bible class with an automatic Google Meet space link for members.'
              : 'Generate an official Zoom Meet link automatically, and notifications will be sent to members.'}
          </Text>
          
          {/* Class Title */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: secondaryText }]}>Class Title *</Text>
            <View style={[styles.inputContainer, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}>
              <Type size={18} color={secondaryText} />
              <TextInput
                style={[styles.input, { color: primaryText }]}
                placeholder="e.g. Wednesday Night Bible Study"
                placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                value={form.title}
                onChangeText={(t) => handleChange('title', t)}
              />
            </View>
          </View>

          {/* Topic / Theme */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: secondaryText }]}>Topic / Theme</Text>
            <View style={[styles.inputContainer, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}>
              <AlignLeft size={18} color={secondaryText} />
              <TextInput
                style={[styles.input, { color: primaryText }]}
                placeholder="e.g. Faith & Grace"
                placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                value={form.topic}
                onChangeText={(t) => handleChange('topic', t)}
              />
            </View>
          </View>

          {/* Bible Book */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: secondaryText }]}>Bible Book (Optional)</Text>
            <View style={[styles.inputContainer, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}>
              <Book size={18} color={secondaryText} />
              <TextInput
                style={[styles.input, { color: primaryText }]}
                placeholder="e.g. Romans 8"
                placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                value={form.bibleBook}
                onChangeText={(t) => handleChange('bibleBook', t)}
              />
            </View>
          </View>

          {/* Date */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: secondaryText }]}>Date *</Text>
            <TouchableOpacity 
              style={[styles.inputContainer, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}
              onPress={() => setDatePickerVisibility(true)}
              activeOpacity={0.8}
            >
              <Calendar size={18} color={secondaryText} />
              <Text style={[styles.input, { color: form.date ? primaryText : (isDark ? '#64748B' : '#94A3B8'), lineHeight: 20 }]}>
                {form.date || 'DD-MM-YYYY'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Times */}
          <View style={styles.row}>
            <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={[styles.label, { color: secondaryText }]}>Start Time *</Text>
              <TouchableOpacity 
                style={[styles.inputContainer, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}
                onPress={() => setStartTimePickerVisibility(true)}
                activeOpacity={0.8}
              >
                <Clock size={18} color={secondaryText} />
                <Text style={[styles.input, { color: form.startTime ? primaryText : (isDark ? '#64748B' : '#94A3B8'), lineHeight: 20 }]}>
                  {form.startTime || 'e.g. 7:00 PM'}
                </Text>
              </TouchableOpacity>
            </View>
            
            <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={[styles.label, { color: secondaryText }]}>End Time *</Text>
              <TouchableOpacity 
                style={[styles.inputContainer, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}
                onPress={() => setEndTimePickerVisibility(true)}
                activeOpacity={0.8}
              >
                <Clock size={18} color={secondaryText} />
                <Text style={[styles.input, { color: form.endTime ? primaryText : (isDark ? '#64748B' : '#94A3B8'), lineHeight: 20 }]}>
                  {form.endTime || 'e.g. 8:30 PM'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Teacher / Host Name */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: secondaryText }]}>Teacher / Host Name</Text>
            <View style={[styles.inputContainer, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor }]}>
              <User size={18} color={secondaryText} />
              <TextInput
                style={[styles.input, { color: primaryText }]}
                placeholder="Teacher Name"
                placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                value={form.teacherName}
                onChangeText={(t) => handleChange('teacherName', t)}
              />
            </View>
          </View>

          {/* Meeting Link */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: secondaryText }]}>Meeting Link *</Text>
            {form.meetingLink ? (
              <View style={[styles.inputContainer, { backgroundColor: cardSurface, borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor, justifyContent: 'space-between', paddingRight: 8 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, overflow: 'hidden' }}>
                  <LinkIcon size={18} color={isGoogle ? '#10B981' : (isDark ? '#60A5FA' : '#2563EB')} />
                  <TextInput
                    style={[styles.input, { color: isGoogle ? '#10B981' : (isDark ? '#60A5FA' : '#2563EB'), fontWeight: '600' }]}
                    value={form.meetingLink}
                    onChangeText={(t) => handleChange('meetingLink', t)}
                    placeholder="https://meet.google.com/..."
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => copyToClipboard(form.meetingLink)} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Copy size={16} color={secondaryText} />
                  </TouchableOpacity>
                  <View style={{ width: 1, height: 18, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#E2E8F0', marginHorizontal: 6 }} />
                  <TouchableOpacity onPress={() => setForm(prev => ({ ...prev, meetingLink: '' }))} style={{ padding: 6 }}>
                    <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '700' }}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity 
                style={[
                  styles.inputContainer, 
                  { 
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9', 
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1', 
                    justifyContent: 'center' 
                  }
                ]}
                onPress={handleGenerateLink}
                disabled={loading}
                activeOpacity={0.8}
              >
                <Text style={{ color: primaryText, fontWeight: '700', fontSize: 15 }}>
                  {isGoogle ? '+ Generate Google Meet Link' : '+ Generate Zoom Meet Link'}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Action Button: Black in white theme, White in dark mode */}
          <TouchableOpacity 
            style={[
              styles.submitBtn,
              { backgroundColor: isDark ? '#FFFFFF' : '#000000' }
            ]} 
            activeOpacity={0.85}
            onPress={handleCreate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={isDark ? '#000000' : '#FFFFFF'} />
            ) : (
              <Text style={[styles.submitBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                {isEditing ? 'Save Changes' : 'Schedule Meeting'}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
        </KeyboardAvoidingView>
      )}

      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        onConfirm={(d) => {
          setDatePickerVisibility(false);
          handleChange('date', formatDateDDMMYYYY(d));
        }}
        onCancel={() => setDatePickerVisibility(false)}
      />
      
      <DateTimePickerModal
        isVisible={isStartTimePickerVisible}
        mode="time"
        onConfirm={(d) => {
          setStartTimePickerVisibility(false);
          handleChange('startTime', formatTime(d));
        }}
        onCancel={() => setStartTimePickerVisibility(false)}
      />

      <DateTimePickerModal
        isVisible={isEndTimePickerVisible}
        mode="time"
        onConfirm={(d) => {
          setEndTimePickerVisibility(false);
          handleChange('endTime', formatTime(d));
        }}
        onCancel={() => setEndTimePickerVisibility(false)}
      />

      {/* ── Custom Themed Popup Modal ── */}
      <Modal
        visible={popup.visible}
        transparent
        animationType="fade"
        onRequestClose={closePopup}
      >
        <View style={styles.modalOverlay}>
          <View style={[
            styles.modalContent, 
            { 
              backgroundColor: cardSurface,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : adminBorderColor,
              borderWidth: 1.5,
            }
          ]}>
            <View style={styles.modalHeader}>
              <View style={[
                styles.iconCircle, 
                { backgroundColor: popup.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)' }
              ]}>
                {popup.type === 'error' ? (
                  <AlertCircle size={30} color="#EF4444" />
                ) : (
                  <CheckCircle size={30} color="#10B981" />
                )}
              </View>
              <TouchableOpacity onPress={closePopup} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color={secondaryText} />
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.modalTitle, { color: primaryText }]}>{popup.title}</Text>
            <Text style={[styles.modalMessage, { color: secondaryText }]}>{popup.message}</Text>
            
            {popup.type === 'link' && popup.link ? (
              <View style={[
                styles.linkBox,
                {
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
                }
              ]}>
                <Text style={[styles.linkBoxText, { color: primaryText }]} numberOfLines={1}>{popup.link}</Text>
                <TouchableOpacity 
                  onPress={() => copyToClipboard(popup.link)} 
                  style={[styles.copyBtn, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0' }]}
                >
                  <Copy size={15} color={primaryText} />
                  <Text style={[styles.copyBtnText, { color: primaryText }]}>Copy</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            
            <TouchableOpacity 
              style={[
                styles.modalActionBtn, 
                { 
                  backgroundColor: popup.type === 'error' ? '#EF4444' : (isDark ? '#FFFFFF' : '#000000') 
                }
              ]} 
              onPress={closePopup}
              activeOpacity={0.85}
            >
              <Text style={[
                styles.modalActionText,
                { color: popup.type === 'error' ? '#FFFFFF' : (isDark ? '#000000' : '#FFFFFF') }
              ]}>
                {popup.type === 'error' ? 'Okay, got it' : (popup.type === 'link' ? 'Awesome!' : 'Done')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  container: { 
    flex: 1 
  },
  topbar: {
    zIndex: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  circularBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  scroll: { 
    padding: 16 
  },
  platformToggleRow: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 18,
    gap: 4,
  },
  platformToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  platformToggleTxt: {
    fontSize: 13,
    fontWeight: '800',
  },
  screenHeading: { 
    fontSize: 22, 
    fontWeight: '800', 
    letterSpacing: -0.4,
    marginBottom: 4 
  },
  subtitle: { 
    fontSize: 14, 
    marginBottom: 20, 
    lineHeight: 20 
  },
  formGroup: { 
    marginBottom: 16 
  },
  label: { 
    fontSize: 12, 
    fontWeight: '700', 
    letterSpacing: 0.6,
    marginBottom: 6, 
    marginLeft: 2 
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  input: { 
    flex: 1, 
    marginLeft: 10, 
    fontSize: 15,
    fontWeight: '500',
  },
  iconBtn: { 
    padding: 6 
  },
  row: { 
    flexDirection: 'row' 
  },
  submitBtn: {
    height: 54,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  submitBtnText: { 
    fontSize: 16, 
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 22,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  modalMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  linkBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  linkBoxText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  copyBtnText: {
    fontWeight: '700',
    fontSize: 12,
  },
  modalActionBtn: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalActionText: {
    fontWeight: '800',
    fontSize: 15,
  }
}));
