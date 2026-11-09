import React, { useState, useEffect, useContext, useRef } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  ActivityIndicator, 
  Dimensions, 
  StatusBar,
  Platform,
  Image,
  Modal,
  Alert
} from 'react-native';
import { MapPin, Clock, Calendar, Trash2, ChevronLeft, Plus, Users, QrCode, Download, Share2, X , ArrowLeft, Edit2, CheckCircle2 } from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import AttendanceService from '../../services/AttendanceService';
import { useNavigation } from '@react-navigation/native';
import { AdminTabContext } from '../../context/AdminTabContext';
import { LinearGradient } from 'expo-linear-gradient';

import FirestoreService from '../../services/FirestoreService';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';

const { width } = Dimensions.get('window');

const COLORS = {
  ink: '#151C33',
  ink2: '#22304F',
  inkSoft: '#6B7593',
  parchment: '#F3EAD9',
  paper: '#FFFCF5',
  gold: '#A67C3D',
  goldDeep: '#8C6428',
  goldBright: '#D8B369',
  clay: '#A24B34',
  clayBg: '#F3E1D6',
  clayLine: '#E3C3B2',
  moss: '#3E6B52',
  mossBg: '#E6EFE7',
  rule: '#DED0AC',
};

const FONTS = {
  serif: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  sans: Platform.OS === 'ios' ? 'System' : 'sans-serif',
};

export default function AdminEventList() {
  const { isDark, colors: adminColors, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor: adminBorderColor, appFontFamily, barStyle, scaleFont } = useAdminTheme();
  const navigation = useNavigation<any>();
  const { setActiveTab, setEditingData, setTabByName } = useContext(AdminTabContext);
  const [events, setEvents] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<'Upcoming' | 'Past' | 'Published'>('Upcoming');
  const [loading, setLoading] = useState(true);
  const [eventToDelete, setEventToDelete] = useState<any>(null);
  const [showDeleteSuccess, setShowDeleteSuccess] = useState(false);
  const [selectedQrEvent, setSelectedQrEvent] = useState<any>(null);
  const qrRef = useRef<any>(null);
  const [churchDetails, setChurchDetails] = useState({ id: '', name: 'Rhema Global Ministries', code: 'RHEMA' });

  useEffect(() => {
    fetchEvents();
    (async () => {
      try {
        const id = await FirestoreService.getChurchId();
        const doc = await FirestoreService.getChurchDoc();
        if (doc) {
          const snap = await doc.get();
          if (snap.exists) {
            const data = snap.data();
            setChurchDetails({
              id: id || '',
              name: data?.name || data?.churchName || 'Rhema Global Ministries',
              code: data?.churchCode || data?.code || 'RHEMA'
            });
          }
        }
      } catch (err) {
        console.warn('⚠️ [AdminEventList] Failed to load church info for QR:', err);
      }
    })();
  }, []);

  const handleSaveQR = async () => {
    if (qrRef.current) {
      qrRef.current.toDataURL(async (data: string) => {
        try {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission Denied', 'Please allow media library permissions to save the QR code.');
            return;
          }
          const filename = `${FileSystem.cacheDirectory}event-qr-${selectedQrEvent?.id || 'event'}.png`;
          await FileSystem.writeAsStringAsync(filename, data, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await MediaLibrary.saveToLibraryAsync(filename);
          Alert.alert('Saved!', 'Event QR code saved to your gallery.');
        } catch (e) {
          Alert.alert('Error', 'Failed to save QR code.');
        }
      });
    }
  };

  const handleShareQR = () => {
    if (qrRef.current) {
      qrRef.current.toDataURL(async (data: string) => {
        try {
          const filename = `${FileSystem.cacheDirectory}event-qr-${selectedQrEvent?.id || 'event'}.png`;
          await FileSystem.writeAsStringAsync(filename, data, {
            encoding: FileSystem.EncodingType.Base64,
          });
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(filename, {
              mimeType: 'image/png',
              dialogTitle: `${selectedQrEvent?.name || selectedQrEvent?.title || 'Event'} - Attendance QR Code`,
            });
          }
        } catch {
          Alert.alert('Error', 'Failed to share QR code.');
        }
      });
    }
  };

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const data = await FirestoreService.getEvents();
      console.log('📊 [AdminEventList] Fetched Events:', JSON.stringify(data.slice(0, 2), null, 2));
      setEvents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];
  const upcomingCount = events.filter(e => e.date >= today).length;
  const pastCount = events.filter(e => e.date < today).length;
  const publishedCount = events.filter(e => 
    !e.status || 
    e.status.toLowerCase().includes('pub') || 
    e.status.toLowerCase().includes('act')
  ).length;

  const formatDate = (sfDate: string) => {
    if (!sfDate) return '';
    try {
      const datePart = sfDate.split('T')[0];
      if (datePart.includes('-')) {
        const parts = datePart.split('-');
        if (parts[0].length === 4) {
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }
      const d = new Date(sfDate);
      if (isNaN(d.getTime())) return sfDate;
      const day = d.getDate().toString().padStart(2, '0');
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    } catch (e) {
      return sfDate;
    }
  };

  const formatDisplayTime = (sfTime: string) => {
    if (!sfTime || typeof sfTime !== 'string') return '';
    // If it's already formatted (e.g. "10:00 AM"), return as is
    if (sfTime.includes('AM') || sfTime.includes('PM')) return sfTime;
    
    try {
      // Salesforce Time field returns HH:mm:ss.SSSZ
      const timePart = sfTime.split('.')[0]; // Get HH:mm:ss
      const [hours, minutes] = timePart.split(':');
      let h = parseInt(hours, 10);
      if (isNaN(h)) return 'Time TBD'; // Fallback for corrupted data
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      h = h ? h : 12;
      return `${h}:${minutes} ${ampm}`;
    } catch (e) {
      return sfTime;
    }
  };

  const handleEdit = (event: any) => {
    setEditingData(event);
    if (setTabByName) setTabByName('New Event');
    else setActiveTab(10); // fallback
  };

  const confirmDeleteEvent = async (deleteMode?: 'single' | 'future') => {
    if (!eventToDelete?.id) return;
    try {
      setLoading(true);
      await FirestoreService.deleteEvent(eventToDelete.id, deleteMode);
      await fetchEvents();
      setEventToDelete(null);
      setShowDeleteSuccess(true);
      setTimeout(() => setShowDeleteSuccess(false), 2500);
    } catch (err: any) {
      Alert.alert('Delete Failed', err.message || 'Could not delete event.');
      setEventToDelete(null);
      setLoading(false);
    }
  };

  const handleDelete = (event: any) => {
    setEventToDelete(event);
  };

  if (loading && events.length === 0) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}>
        <ActivityIndicator size="large" color={isDark ? '#FFFFFF' : '#1A2D5A'} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* ── Top Header Card (with border line) ── */}
      <View style={[
        styles.hero,
        {
          backgroundColor: isDark ? '#000000' : '#FFFFFF',
          borderBottomWidth: 1.5,
          borderBottomColor: isDark ? '#27272A' : '#CBD5E1',
          paddingHorizontal: 16,
          paddingTop: Platform.OS === 'ios' ? 12 : 10,
          paddingBottom: 14,
          marginBottom: 4,
        }
      ]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          {/* Left: Circular Back Button */}
          <View style={{ minWidth: 40, alignItems: 'flex-start', justifyContent: 'center' }}>
            <TouchableOpacity
              onPress={() => setActiveTab(0)}
              style={[
                styles.circularBackBtn,
                {
                  backgroundColor: isDark ? '#000000' : '#FFFFFF',
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : '#CBD5E1',
                  borderWidth: 1.5,
                }
              ]}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ArrowLeft size={20} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          {/* Middle: Events Title */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
            <Text
              style={[
                styles.heroTitle,
                {
                  color: isDark ? '#FFFFFF' : '#0F172A',
                  textAlign: 'center',
                  fontSize: 20,
                  fontWeight: '800',
                  fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                  letterSpacing: -0.4,
                }
              ]}
              numberOfLines={1}
            >
              Events
            </Text>
          </View>

          {/* Right: + New Button */}
          <View style={{ minWidth: 40, alignItems: 'flex-end', justifyContent: 'center' }}>
            <TouchableOpacity 
              style={[
                styles.newBtn,
                {
                  backgroundColor: isDark ? '#FFFFFF' : '#000000',
                  borderColor: isDark ? '#FFFFFF' : '#000000',
                  borderWidth: 1.5,
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 20,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  shadowOpacity: 0,
                  elevation: 0,
                }
              ]} 
              onPress={() => { setEditingData(null); if (setTabByName) setTabByName('New Event'); else setActiveTab(10); }}
              activeOpacity={0.8}
            >
              <Plus size={14} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
              <Text 
                style={[
                  styles.newBtnTxt, 
                  { 
                    color: isDark ? '#000000' : '#FFFFFF',
                    fontSize: 13,
                    fontWeight: '800',
                    letterSpacing: 0.3
                  }
                ]}
                numberOfLines={1}
              >
                New
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      
      <ScrollView 
        style={{ backgroundColor: isDark ? '#000000' : '#FFFFFF' }} 
        contentContainerStyle={[styles.scroll, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]} 
        showsVerticalScrollIndicator={false}
      >

        {/* ── Stats Row (Matching Members Screen Glassmorphic Stat Cards) ── */}
        <View style={styles.statsRow}>
          {/* 1. Published Card */}
          <TouchableOpacity 
            style={[
              styles.statBox, 
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                borderColor: isDark ? '#34D399' : '#15803D',
                borderWidth: filterType === 'Published' ? 2 : 1.5,
                paddingVertical: 0,
                overflow: 'hidden',
              }
            ]}
            onPress={() => setFilterType('Published')}
            activeOpacity={0.75}
          >
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(52, 211, 153, 0.14)', 'rgba(39, 39, 42, 0.55)', 'rgba(15, 15, 18, 0.90)']
                  : ['#FFFFFF', '#F7FCF9', '#ECFDF5']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statGlassInner}
            >
              <View style={[styles.statNotch, { backgroundColor: isDark ? '#34D399' : '#15803D' }]} />
              <Text style={[styles.num, { color: isDark ? '#34D399' : '#15803D' }]}>{publishedCount}</Text>
              <View style={styles.statLabelRow}>
                <Text style={[styles.statLabel, { color: isDark ? '#E4E4E7' : '#475569' }, filterType === 'Published' && { color: isDark ? '#34D399' : '#15803D' }]}>Published</Text>
                {filterType === 'Published' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#34D399' : '#15803D' }]} />}
              </View>
              <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>{filterType === 'Published' ? 'Active ✓' : 'Tap to filter'}</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* 2. Upcoming Card */}
          <TouchableOpacity 
            style={[
              styles.statBox, 
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                borderColor: isDark ? '#60A5FA' : '#1A2D5A',
                borderWidth: filterType === 'Upcoming' ? 2 : 1.5,
                paddingVertical: 0,
                overflow: 'hidden',
              }
            ]}
            onPress={() => setFilterType('Upcoming')}
            activeOpacity={0.75}
          >
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(59, 130, 246, 0.14)', 'rgba(39, 39, 42, 0.55)', 'rgba(15, 15, 18, 0.90)']
                  : ['#FFFFFF', '#F8FAFC', '#EFF6FF']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statGlassInner}
            >
              <View style={[styles.statNotch, { backgroundColor: isDark ? '#60A5FA' : '#1A2D5A' }]} />
              <Text style={[styles.num, { color: isDark ? '#60A5FA' : '#1A2D5A' }]}>{upcomingCount}</Text>
              <View style={styles.statLabelRow}>
                <Text style={[styles.statLabel, { color: isDark ? '#E4E4E7' : '#475569' }, filterType === 'Upcoming' && { color: isDark ? '#60A5FA' : '#1A2D5A' }]}>Upcoming</Text>
                {filterType === 'Upcoming' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#60A5FA' : '#1A2D5A' }]} />}
              </View>
              <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>{filterType === 'Upcoming' ? 'Active ✓' : 'Tap to filter'}</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* 3. Past Card */}
          <TouchableOpacity 
            style={[
              styles.statBox, 
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                borderColor: isDark ? '#F87171' : '#DC2626',
                borderWidth: filterType === 'Past' ? 2 : 1.5,
                paddingVertical: 0,
                overflow: 'hidden',
              }
            ]}
            onPress={() => setFilterType('Past')}
            activeOpacity={0.75}
          >
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(248, 113, 113, 0.14)', 'rgba(39, 39, 42, 0.55)', 'rgba(15, 15, 18, 0.90)']
                  : ['#FFFFFF', '#FFF9F8', '#FEE2E2']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.statGlassInner}
            >
              <View style={[styles.statNotch, { backgroundColor: isDark ? '#F87171' : '#DC2626' }]} />
              <Text style={[styles.num, { color: isDark ? '#F87171' : '#DC2626' }]}>{pastCount}</Text>
              <View style={styles.statLabelRow}>
                <Text style={[styles.statLabel, { color: isDark ? '#E4E4E7' : '#475569' }, filterType === 'Past' && { color: isDark ? '#F87171' : '#DC2626' }]}>Past</Text>
                {filterType === 'Past' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#F87171' : '#DC2626' }]} />}
              </View>
              <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>{filterType === 'Past' ? 'Active ✓' : 'Tap to filter'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        <Text style={[styles.listLabel, isDark && { color: '#E4E4E7' }]}>
          {filterType === 'Upcoming' ? 'Upcoming events' : filterType === 'Published' ? 'Published events' : 'Past events'}
        </Text>

        {events
          .filter(e => {
            if (filterType === 'Published') {
              return !e.status || e.status.toLowerCase().includes('pub') || e.status.toLowerCase().includes('act');
            }
            return filterType === 'Upcoming' ? e.date >= today : e.date < today;
          })
          .sort((a, b) => filterType === 'Past' 
             ? new Date(b.date).getTime() - new Date(a.date).getTime()
             : new Date(a.date).getTime() - new Date(b.date).getTime()
          )
          .map((event, idx) => (
          <View 
            key={event.id} 
            style={[
              styles.eventItem, 
              isDark ? { 
                backgroundColor: '#18181B', 
                borderColor: 'rgba(255, 255, 255, 0.22)',
                borderWidth: 1.5,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.35,
                shadowRadius: 8,
                elevation: 4,
              } : {
                backgroundColor: '#FFFFFF',
                borderColor: '#CBD5E1',
                borderWidth: 1.5,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 3 },
                shadowOpacity: 0.08,
                shadowRadius: 8,
                elevation: 3,
              }
            ]}
          >
            {/* ── Top Event Details Row ── */}
            <View style={styles.eventCardTop}>
              <TouchableOpacity 
                style={[
                  styles.eiThumb, 
                  { 
                    backgroundColor: event.bannerColor || (isDark ? '#27272A' : '#1a2d5a'),
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1',
                    borderWidth: 1,
                  }
                ]} 
                onPress={() => handleEdit(event)}
                activeOpacity={0.8}
              >
                {event.bannerUrl ? (
                  <Image source={{ uri: event.bannerUrl }} style={styles.eiThumbImg} resizeMode="cover" />
                ) : (
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <Calendar size={20} color={isDark ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.75)'} />
                    <Text style={[styles.eiThumbTxt, { marginTop: 3 }]}>EVENT</Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.eiBody}>
                <Text style={[styles.eiTitle, { color: isDark ? '#FFFFFF' : '#0F172A', flexShrink: 1 }]} numberOfLines={2}>
                  {event.name || 'No Title'}
                </Text>
                {!!event.titleTe && (
                  <Text style={[styles.eiTe, { color: isDark ? '#94A3B8' : '#64748B', flexShrink: 1 }]} numberOfLines={1}>
                    {event.titleTe}
                  </Text>
                )}
                
                <View style={styles.eiMetaRow}>
                  <Calendar size={12} color={isDark ? '#F87171' : '#c0392b'} />
                  <Text style={[styles.eiMetaTxt, { color: isDark ? '#FCA5A5' : '#c0392b', fontWeight: '700' }]}>
                    {formatDate(event.date)}
                  </Text>
                </View>

                <View style={styles.eiMetaRow}>
                  <Clock size={12} color={isDark ? '#A1A1AA' : '#64748B'} />
                  <Text style={[styles.eiMetaTxt, { color: isDark ? '#E4E4E7' : '#334155', flexShrink: 1 }]} numberOfLines={1}>
                    {formatDisplayTime(event.startTime)}
                    {event.endTime ? ` — ${formatDisplayTime(event.endTime)}` : ''}
                  </Text>
                </View>

                <View style={styles.eiMetaRow}>
                  <MapPin size={12} color={isDark ? '#A1A1AA' : '#64748B'} />
                  <Text style={[styles.eiMetaTxt, { color: isDark ? '#E4E4E7' : '#334155', flexShrink: 1 }]} numberOfLines={1}>
                    {event.venueEn || event.location || 'No Venue'}
                  </Text>
                </View>
              </View>
            </View>

            {/* ── Status Row: Displayed under image card with dot separator ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingHorizontal: 2 }}>
              {event.status?.toLowerCase().includes('dra') ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: isDark ? '#94A3B8' : '#64748B' }} />
                  <Text style={{ color: isDark ? '#94A3B8' : '#64748B', fontSize: 12, fontWeight: '700' }}>
                    Draft
                  </Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <CheckCircle2 size={13} color={isDark ? '#34D399' : '#15803D'} strokeWidth={2.5} />
                  <Text style={{ color: isDark ? '#34D399' : '#15803D', fontSize: 12, fontWeight: '700' }}>
                    Published
                  </Text>
                </View>
              )}

              {(event.requireEventQR === true || event.requireEventQr === true) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={{ color: isDark ? '#71717A' : '#94A3B8', fontSize: 12, marginHorizontal: 6 }}>
                    •
                  </Text>
                  <QrCode size={12} color={isDark ? '#FBBF24' : '#B45309'} />
                  <Text style={{ color: isDark ? '#FBBF24' : '#B45309', fontSize: 12, fontWeight: '700' }}>
                    QR Required
                  </Text>
                </View>
              )}
            </View>

            {/* ── Divider Line (Crisp and visible in white theme) ── */}
            <View style={[styles.cardDivider, { height: 1.5, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.18)' : '#CBD5E1', marginTop: 10, marginBottom: 10 }]} />

            {/* ── Bottom Single Row Action Buttons (Natural Style) ── */}
            <View style={styles.cardActionsRow}>
              {/* 1. QR Button */}
              <TouchableOpacity 
                onPress={() => setSelectedQrEvent(event)} 
                style={[
                  styles.cardActionBtn,
                  {
                    backgroundColor: isDark ? '#27272A' : '#F8FAFC',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1',
                  }
                ]}
                activeOpacity={0.7}
              >
                <QrCode size={14} color={isDark ? '#E4E4E7' : '#334155'} />
                <Text style={[styles.cardActionTxt, { color: isDark ? '#E4E4E7' : '#334155' }]}>QR</Text>
              </TouchableOpacity>

              {/* 2. Attend Button */}
              <TouchableOpacity 
                onPress={() => navigation.navigate('EventAttendees', { eventId: event.id, eventName: event.name || event.title })} 
                style={[
                  styles.cardActionBtn,
                  {
                    backgroundColor: isDark ? '#27272A' : '#F8FAFC',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1',
                  }
                ]}
                activeOpacity={0.7}
              >
                <Users size={14} color={isDark ? '#E4E4E7' : '#334155'} />
                <Text style={[styles.cardActionTxt, { color: isDark ? '#E4E4E7' : '#334155' }]}>Attend</Text>
              </TouchableOpacity>

              {/* 3. Edit Button */}
              <TouchableOpacity 
                onPress={() => handleEdit(event)} 
                style={[
                  styles.cardActionBtn,
                  {
                    backgroundColor: isDark ? '#27272A' : '#F8FAFC',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1',
                  }
                ]}
                activeOpacity={0.7}
              >
                <Edit2 size={13} color={isDark ? '#E4E4E7' : '#334155'} />
                <Text style={[styles.cardActionTxt, { color: isDark ? '#E4E4E7' : '#334155' }]}>Edit</Text>
              </TouchableOpacity>

              {/* 4. Delete Button */}
              <TouchableOpacity 
                onPress={() => handleDelete(event)} 
                style={[
                  styles.cardActionBtn,
                  {
                    backgroundColor: isDark ? '#27272A' : '#F8FAFC',
                    borderColor: isDark ? 'rgba(248, 113, 113, 0.35)' : '#FECACA',
                  }
                ]}
                activeOpacity={0.7}
              >
                <Trash2 size={13} color={isDark ? '#F87171' : '#DC2626'} />
                <Text style={[styles.cardActionTxt, { color: isDark ? '#F87171' : '#DC2626' }]}>Del</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Event Attendance QR Code Modal ── */}
      {selectedQrEvent && (
        <Modal visible={!!selectedQrEvent} transparent animationType="fade" onRequestClose={() => setSelectedQrEvent(null)}>
          <View style={styles.qrModalOverlay}>
            <View style={styles.qrModalCard}>
              <View style={styles.qrModalHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.qrTypeBadge}>
                    <QrCode size={11} color="#1A2D5A" style={{ marginRight: 4 }} />
                    <Text style={styles.qrTypeBadgeTxt}>Event Attendance QR</Text>
                  </View>
                  <Text style={styles.qrModalTitle} numberOfLines={1}>
                    {selectedQrEvent.name || selectedQrEvent.title}
                  </Text>
                  <Text style={styles.qrModalSub}>
                    {formatDate(selectedQrEvent.date)} · {formatDisplayTime(selectedQrEvent.startTime)}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedQrEvent(null)} style={styles.qrModalCloseBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <X size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.qrWrapper}>
                <QRCode
                  value={
                    selectedQrEvent.qrPayload ||
                    selectedQrEvent.qrCode ||
                    AttendanceService.generateAttendanceQRPayload(
                      churchDetails.id,
                      churchDetails.name,
                      churchDetails.code,
                      selectedQrEvent.id,
                      selectedQrEvent.name || selectedQrEvent.title
                    )
                  }
                  size={200}
                  getRef={(ref: any) => { qrRef.current = ref; }}
                />
              </View>

              <Text style={styles.qrHintTxt}>
                {(selectedQrEvent.requireEventQR === true || selectedQrEvent.requireEventQr === true)
                  ? `⚠️ Attendance strictly requires this Event QR Code. The general Church QR will NOT work.`
                  : `Members can scan this QR code to mark attendance directly for this event. (Church QR is also allowed)`}
              </Text>

              <View style={styles.qrActionButtons}>
                <TouchableOpacity style={styles.qrSaveBtn} onPress={handleSaveQR}>
                  <Download size={16} color="#1A2D5A" />
                  <Text style={styles.qrSaveBtnTxt}>Save to Gallery</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.qrShareBtn} onPress={handleShareQR}>
                  <Share2 size={16} color="#FFFFFF" />
                  <Text style={styles.qrShareBtnTxt}>Share</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {eventToDelete && (
        <Modal transparent animationType="fade" visible>
          <View style={styles.successBg}>
            <View style={styles.successCard}>
              <View style={[styles.successIconOuter, { backgroundColor: '#FEF2F2' }]}>
                <View style={[styles.successIconInner, { backgroundColor: '#DC2626' }]}>
                  <Trash2 size={28} color="#fff" />
                </View>
              </View>
              <Text style={styles.successTitle}>Delete Event?</Text>
              <Text style={styles.successDesc}>
                {eventToDelete.recurringGroupId 
                  ? `You are deleting a recurring event. Do you want to delete only this specific occurrence, or this and all future occurrences?`
                  : `Are you sure you want to delete "${eventToDelete.name || 'this event'}"? This action cannot be undone.`}
              </Text>
              {eventToDelete.recurringGroupId ? (
                <View style={{ gap: 10, width: '100%' }}>
                  <TouchableOpacity style={[styles.successActionBtn, { backgroundColor: '#DC2626', marginBottom: 0 }]} onPress={() => confirmDeleteEvent('single')}>
                    <Text style={styles.successActionTxt}>Only this event</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.successActionBtn, { backgroundColor: '#DC2626', marginBottom: 0 }]} onPress={() => confirmDeleteEvent('future')}>
                    <Text style={styles.successActionTxt}>This and future events</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.successSecBtn} onPress={() => setEventToDelete(null)}>
                    <Text style={styles.successSecTxt}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%' }}>
                  <TouchableOpacity style={[styles.successSecBtn, { flex: 1 }]} onPress={() => setEventToDelete(null)}>
                    <Text style={styles.successSecTxt}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.successActionBtn, { flex: 1, backgroundColor: '#DC2626', marginBottom: 0 }]} onPress={() => confirmDeleteEvent('single')}>
                    <Text style={styles.successActionTxt}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* Delete Success Modal */}
      {showDeleteSuccess && (
        <View style={styles.toastOverlay}>
          <View style={styles.toastCard}>
            <View style={styles.toastIconBox}>
              <Trash2 size={24} color="#DC2626" />
            </View>
            <View>
              <Text style={styles.toastTitle}>Event Deleted</Text>
              <Text style={styles.toastSub}>The event has been permanently removed.</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  circularBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
  scroll: { paddingBottom: 80 },

  hero: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    overflow: 'visible',
    position: 'relative',
    marginBottom: 6,
  },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center' },
  heroTitle: { color: '#0F172A', fontSize: 20, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '800', letterSpacing: -0.4 },
  heroSub: { color: '#64748b', fontSize: 13 },
  
  newBtn: { 
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14, 
    paddingVertical: 7, 
    borderRadius: 20,
  },
  newBtnTxt: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginBottom: 16, marginTop: 12 },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  statGlassInner: {
    width: '100%',
    paddingVertical: 12,
    alignItems: 'center',
    position: 'relative',
  },
  statNotch: {
    position: 'absolute',
    top: -1,
    width: 32,
    height: 3.5,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  num: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginBottom: 4,
  },
  statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, color: '#475569', fontWeight: '700' },
  activeIndicatorDot: { width: 6, height: 6, borderRadius: 3 },
  statHintTxt: { fontSize: 8.5, color: '#94A3B8', fontWeight: '600', marginTop: 2, letterSpacing: 0.3 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#CBD5E1', shadowColor: '#1a2d5a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 1 },
  activeStatCard: { borderColor: '#1a2d5a', borderWidth: 2, backgroundColor: '#F8FAFC' },
  statNum: { fontSize: 22, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif' },
  statLbl: { fontSize: 9, color: '#64748B', marginTop: 2, textTransform: 'uppercase', fontWeight: '800', letterSpacing: 0.5 },

  listLabel: { fontSize: 12, fontWeight: '800', color: '#1a2d5a', marginBottom: 12, marginTop: 4, paddingHorizontal: 16, textTransform: 'uppercase', letterSpacing: 0.5 },

  eventItem: { 
    backgroundColor: '#fff', 
    borderRadius: 16, 
    padding: 14, 
    marginHorizontal: 16, 
    marginBottom: 14, 
    borderWidth: 1.5, 
    borderColor: '#CBD5E1', 
    shadowColor: '#000000', 
    shadowOffset: { width: 0, height: 3 }, 
    shadowOpacity: 0.08, 
    shadowRadius: 8, 
    elevation: 3 
  },
  eventCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  eiThumb: { 
    width: 104, 
    height: 62, 
    backgroundColor: '#1a2d5a', 
    borderRadius: 12, 
    justifyContent: 'center', 
    alignItems: 'center', 
    overflow: 'hidden' 
  },
  eiThumbImg: { width: '100%', height: '100%' },
  eiThumbTxt: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  
  eiBody: { flex: 1 },
  eiTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A', marginBottom: 2, letterSpacing: -0.2 },
  eiTe: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  
  eiMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  eiMetaTxt: { fontSize: 11.5, color: '#64748B', marginLeft: 6, flexShrink: 1 },
  
  eiFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  badgePub: { backgroundColor: '#F0FDF4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#86EFAC' },
  badgePubTxt: { color: '#15803D', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  badgePubDark: { backgroundColor: 'rgba(16, 185, 129, 0.18)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(52, 211, 153, 0.4)' },
  badgePubTxtDark: { color: '#34D399', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  badgeDraft: { backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#CBD5E1' },
  badgeDraftTxt: { color: '#64748B', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  badgeDraftDark: { backgroundColor: 'rgba(148, 163, 184, 0.18)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: 'rgba(148, 163, 184, 0.3)' },
  badgeDraftTxtDark: { color: '#94A3B8', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  badgeQrReq: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#FDE68A' },
  badgeQrReqDark: { backgroundColor: 'rgba(245, 158, 11, 0.18)', borderColor: 'rgba(245, 158, 11, 0.4)' },
  badgeQrReqTxt: { color: '#78350F', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

  cardDivider: {
    height: 1.5,
    backgroundColor: '#CBD5E1',
    marginTop: 10,
    marginBottom: 10,
  },

  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1.2,
    gap: 4,
  },
  cardActionTxt: {
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  
  eiLocRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 6 },
  eiLocTxt: { fontSize: 11, color: COLORS.inkSoft, flexShrink: 1 },
  eiStatusRow: { marginTop: 7 },

  // Toast
  toastOverlay: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 20 },
  toastCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, paddingRight: 24, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, shadowColor: '#1a2d5a', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6, borderWidth: 1, borderColor: 'rgba(26,45,90,0.05)', width: '100%' },
  toastIconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center' },
  toastTitle: { fontSize: 14, fontWeight: '800', color: '#1a2d5a' },
  toastSub: { fontSize: 11, color: '#6B7280', marginTop: 2, fontWeight: '500' },

  // Confirmation Modal
  successBg: { flex: 1, backgroundColor: 'rgba(15,23,42, 0.65)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  successCard: { backgroundColor: '#fff', borderRadius: 28, padding: 30, width: '92%', maxWidth: 400, alignItems: 'center', elevation: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
  successIconOuter: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 20, shadowColor: '#DC2626', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  successIconInner: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#DC2626', justifyContent: 'center', alignItems: 'center' },
  successTitle: { fontSize: 22, fontWeight: '900', color: '#1a2d5a', marginBottom: 12, textAlign: 'center', letterSpacing: -0.3 },
  successDesc: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 26, paddingHorizontal: 10 },
  successActionBtn: { backgroundColor: '#DC2626', height: 52, borderRadius: 14, width: '100%', justifyContent: 'center', alignItems: 'center', marginBottom: 12, shadowColor: '#DC2626', shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  successActionTxt: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  successSecBtn: { height: 52, borderRadius: 14, width: '100%', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
  successSecTxt: { color: '#475569', fontSize: 14, fontWeight: '800' },

  // QR Modal Styles
  qrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  qrModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  qrModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  qrTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  qrTypeBadgeTxt: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1A2D5A',
  },
  qrModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  qrModalSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  qrModalCloseBtn: {
    padding: 4,
  },
  qrWrapper: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  qrHintTxt: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 20,
    paddingHorizontal: 6,
  },
  qrActionButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  qrSaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  qrSaveBtnTxt: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1A2D5A',
  },
  qrShareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1A2D5A',
  },
  qrShareBtnTxt: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  }
}));

