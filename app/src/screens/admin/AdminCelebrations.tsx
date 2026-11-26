import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Linking, Platform, BackHandler } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Share from 'react-native-share';
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Gift, Heart, PlusCircle, ChevronLeft, ArrowLeft } from 'lucide-react-native';
import FirestoreService from '../../services/FirestoreService';
import Theme from '../../theme/Theme';
import ChurchService from '../../services/ChurchService';
import { AdminTabContext } from '../../context/AdminTabContext';
import { useChurch } from '../../context/ChurchContext';
import { functions } from '../../services/firebaseConfig';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';
import {
  formatWhatsAppPhoneNumber,
  buildCelebrationWhatsAppMessage,
  buildWhatsAppDeepLinkUrls,
} from '../../utils/celebrationDateHelper';
import SuccessPopup from '../../components/SuccessPopup';
import {
  makeScopedCacheKey,
  getInstantMemory,
  readInstantCache,
  writeInstantCache,
} from '../../utils/instantCache';

type ViewMode = 'dashboard' | 'list' | 'details' | 'personalize' | 'themePicker' | 'customTheme' | 'versePicker' | 'photoPicker' | 'preview' | 'whatsapp' | 'confirm';

export default function AdminCelebrations({ navigation }: any) {
  const { isDark, colors: adminColors, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor: adminBorderColor, appFontFamily, barStyle, scaleFont } = useAdminTheme();
  const { activeChurch, setActiveChurch } = useChurch();
  const { setActiveTab } = React.useContext(AdminTabContext);
  const celebStatsCacheKey = React.useMemo(
    () => makeScopedCacheKey('admin_celebrations_stats_v1', activeChurch?.id, 'admin'),
    [activeChurch?.id]
  );
  const initialStatsCache = React.useMemo(
    () =>
      getInstantMemory<{
        total: number;
        today: number;
        thisWeek: number;
        birthdays: { total: number; thisWeek: number };
        anniversaries: { total: number; thisWeek: number };
        baptisms: { total: number; thisWeek: number };
      }>(celebStatsCacheKey),
    [celebStatsCacheKey]
  );
  const [loading, setLoading] = useState(!initialStatsCache);
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [activeDateFilter, setActiveDateFilter] = useState('Today');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState('All');
  const [selectedMember, setSelectedMember] = useState<any>(null);

  // Hoisted state for personalization flow
  const [layout, setLayout] = useState<'theme' | 'photo'>('theme');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const [selectedVerse, setSelectedVerse] = useState<{ ref: string, text: string } | null>(null);
  const [greetingMessage, setGreetingMessage] = useState<string>('');
  const [titleOverlay, setTitleOverlay] = useState<string>('');
  const [nameOverlay, setNameOverlay] = useState<string>('');

  // Toast & confirmation channel state
  const [toastMsg, setToastMsg] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sentChannel, setSentChannel] = useState<'push' | 'whatsapp'>('whatsapp');

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      switch (viewMode) {
        case 'confirm':
          setViewMode('dashboard');
          return true;
        case 'whatsapp':
          setViewMode('preview');
          return true;
        case 'preview':
          setViewMode('personalize');
          return true;
        case 'themePicker':
        case 'customTheme':
        case 'versePicker':
        case 'photoPicker':
          setViewMode('personalize');
          return true;
        case 'personalize':
          setViewMode('details');
          return true;
        case 'details':
          setViewMode('dashboard');
          return true;
        default:
          return false;
      }
    });
    return () => sub.remove();
  }, [viewMode]);

  const [stats, setStats] = useState({
    total: 0,
    today: 0,
    thisWeek: 0,
    birthdays: { total: 0, thisWeek: 0 },
    anniversaries: { total: 0, thisWeek: 0 },
    baptisms: { total: 0, thisWeek: 0 },
  });

  useEffect(() => {
    if (viewMode === 'list') {
      setViewMode('dashboard');
    }
  }, [viewMode]);

  useEffect(() => {
    let active = true;
    const mem = getInstantMemory<typeof stats>(celebStatsCacheKey);
    if (mem) {
      setStats(mem);
      setLoading(false);
    } else {
      readInstantCache<typeof stats>(celebStatsCacheKey).then((cached) => {
        if (active && cached?.data) {
          setStats(cached.data);
          setLoading(false);
        }
      });
    }

    const loadData = async () => {
      try {
        const data = await FirestoreService.getAllCelebrations();

        let total = 0;
        let today = 0;
        let thisWeek = 0;
        let bTotal = 0, bWeek = 0;
        let aTotal = 0, aWeek = 0;
        let baptTotal = 0, baptWeek = 0;

        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentDate = now.getDate();
        const currentYear = now.getFullYear();
        const todayUtc = Date.UTC(currentYear, now.getMonth(), currentDate);

        // Accurate UTC calendar-day week check (handles today + Dec -> Jan wraparound)
        const isThisWeek = (m: number, d: number) => {
          if (!m || !d) return false;
          let diffDays = Math.round((Date.UTC(currentYear, m - 1, d) - todayUtc) / 86400000);
          if (diffDays < 0) {
            diffDays = Math.round((Date.UTC(currentYear + 1, m - 1, d) - todayUtc) / 86400000);
          }
          return diffDays >= 0 && diffDays <= 7;
        };

        const isToday = (m: number, d: number) => {
          return m === currentMonth && d === currentDate;
        };

        data.forEach(rec => {
          if (rec.Birthdate) {
            total++;
            bTotal++;
            const parts = rec.Birthdate.split('-');
            const m = parseInt(parts[1], 10);
            const d = parseInt(parts[2], 10);
            if (isToday(m, d)) today++;
            if (isThisWeek(m, d)) {
              thisWeek++;
              bWeek++;
            }
          }
          if (rec.Baptism_Date__c) {
            total++;
            baptTotal++;
            const parts = rec.Baptism_Date__c.split('-');
            const m = parseInt(parts[1], 10);
            const d = parseInt(parts[2], 10);
            if (isToday(m, d)) today++;
            if (isThisWeek(m, d)) {
              thisWeek++;
              baptWeek++;
            }
          }
        });

        const accountGroups: { [accountId: string]: any[] } = {};
        data.forEach(rec => {
          if (rec.Anniversary_Date__c) {
            const accId = rec.AccountId || rec.Id;
            if (!accountGroups[accId]) accountGroups[accId] = [];
            accountGroups[accId].push(rec);
          }
        });

        Object.values(accountGroups).forEach(group => {
          if (group.length > 0) {
            const husband = group.find((m: any) => m.Gender__c === 'Male') || group[0];
            total++;
            aTotal++;
            const parts = husband.Anniversary_Date__c.split('-');
            const m = parseInt(parts[1], 10);
            const d = parseInt(parts[2], 10);
            if (isToday(m, d)) today++;
            if (isThisWeek(m, d)) {
              thisWeek++;
              aWeek++;
            }
          }
        });

        const nextStats = {
          total,
          today,
          thisWeek,
          birthdays: { total: bTotal, thisWeek: bWeek },
          anniversaries: { total: aTotal, thisWeek: aWeek },
          baptisms: { total: baptTotal, thisWeek: baptWeek },
        };
        setStats(nextStats);
        writeInstantCache(celebStatsCacheKey, nextStats).catch(() => { });
      } catch (err) {
        console.error("Error loading stats:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [celebStatsCacheKey]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#BE9A3A" />
      </View>
    );
  }

  if (viewMode === 'list') {
    return null;
  }

  const saveCardToGallerySafe = async (imageUri?: string) => {
    if (!imageUri) return;
    try {
      const existingPerm = await MediaLibrary.getPermissionsAsync(true);
      let finalStatus = existingPerm?.status;
      if (finalStatus !== 'granted' && existingPerm?.canAskAgain !== false) {
        const requested = await MediaLibrary.requestPermissionsAsync(true);
        finalStatus = requested?.status;
      }
      if (finalStatus === 'granted') {
        await MediaLibrary.saveToLibraryAsync(imageUri);
      }
    } catch (e) {
      console.log('Non-blocking media save:', e);
    }
  };

  const ensureShareableInternalCacheImage = async (sourceUri: string, cleanName: string): Promise<string> => {
    let normalizedUri = sourceUri;
    if (!normalizedUri.startsWith('file://') && !normalizedUri.startsWith('content://') && !normalizedUri.startsWith('data:')) {
      normalizedUri = `file://${normalizedUri}`;
    }
    if (Platform.OS !== 'android' || !FileSystem.cacheDirectory) {
      return normalizedUri;
    }
    try {
      const destUri = `${FileSystem.cacheDirectory}Celebration_${cleanName}_${Date.now()}.png`;
      await FileSystem.copyAsync({ from: normalizedUri, to: destUri });
      return destUri;
    } catch (copyErr) {
      console.log('Cache copy fallback to original URI:', copyErr);
      return normalizedUri;
    }
  };

  const handleSendWhatsApp = async (localImageUri?: string, sendMode: 'deeplink' | 'share_card' = 'deeplink') => {
    // Resolve the effective phone: direct phone first, then referencePhone (parent)
    const effectivePhone = selectedMember?.phone || selectedMember?.referencePhone;
    const formattedPhone = formatWhatsAppPhoneNumber(effectivePhone);

    if (sendMode === 'deeplink' && !formattedPhone) {
      Alert.alert(
        'Phone Number Required',
        'This member does not have a valid WhatsApp phone number on record. You can use "Share Card Image + Wish" below or add a phone number in Household.'
      );
      return;
    }

    const isUserCancel = (err: any) =>
      err?.dismissedAction === true || /cancel|user did not share|dismiss|abort/i.test(String(err?.message || ''));

    setIsSending(true);
    try {
      const text = buildCelebrationWhatsAppMessage({
        memberName: selectedMember?.name,
        nameOverlay,
        celebrationType: selectedMember?.celebrationType,
        titleOverlay,
        dateStr: selectedMember?.dateStr,
        age: selectedMember?.age,
        greetingMessage,
        verse: selectedVerse,
        churchName: activeChurch?.name,
      });

      // Copy full message text to clipboard as guaranteed backup
      try {
        await Clipboard.setStringAsync(text);
      } catch (clipErr) {
        console.log('Clipboard copy failed:', clipErr);
      }

      const memberCleanName = (selectedMember?.name || 'Member').replace(/[^a-zA-Z0-9]/g, '_') || 'Member';

      if (localImageUri) {
        await saveCardToGallerySafe(localImageUri);
      }

      // ── Mode A: Share Customized Wish Card Image + Complete Prepared Message ──
      // Uses Share.open (Android Intent.ACTION_SEND with single EXTRA_STREAM + EXTRA_TEXT)
      // because Share.shareSingle with whatsAppNumber (`jid`) or `urls` (`ACTION_SEND_MULTIPLE`)
      // drops EXTRA_TEXT and/or the attachment on modern Android WhatsApp.
      if (sendMode === 'share_card' && localImageUri) {
        const shareUri = await ensureShareableInternalCacheImage(localImageUri, memberCleanName);

        try {
          const openRes = await Share.open({
            title: `${selectedMember?.name || 'Member'}'s Celebration Card`,
            message: text,
            url: shareUri,
            type: 'image/png',
            filename: `Celebration_${memberCleanName}`,
            useInternalStorage: true,
            failOnCancel: true,
          });
          if (openRes?.dismissedAction) return;
          setSentChannel('whatsapp');
          setViewMode('confirm');
          return;
        } catch (shareOpenErr: any) {
          if (isUserCancel(shareOpenErr)) return;
          console.log('Share.open failed, attempting expo-sharing fallback:', shareOpenErr);
        }

        try {
          const isSharingAvailable = await Sharing.isAvailableAsync();
          if (isSharingAvailable) {
            await Sharing.shareAsync(shareUri, {
              dialogTitle: `Share ${selectedMember?.name || 'Member'}'s Celebration Card`,
              mimeType: 'image/png',
              UTI: 'public.png',
            });
            setSentChannel('whatsapp');
            setViewMode('confirm');
            return;
          }
        } catch (expoShareErr: any) {
          if (isUserCancel(expoShareErr)) return;
          console.log('Expo sharing failed:', expoShareErr);
        }

        if (!formattedPhone) {
          Alert.alert('Unable to Share', 'Could not open system share sheet on this device.');
          return;
        }
      }

      // ── Mode B: Direct Recipient WhatsApp Deep Link (`whatsapp://send?phone=...&text=...`) ──
      // Always populates recipient chat with complete prepared message (never opens empty).
      const { schemeUrl, apiUrl, waMeUrl } = buildWhatsAppDeepLinkUrls(formattedPhone, text);

      try {
        await Linking.openURL(schemeUrl);
        setSentChannel('whatsapp');
        setViewMode('confirm');
      } catch {
        try {
          await Linking.openURL(apiUrl);
          setSentChannel('whatsapp');
          setViewMode('confirm');
        } catch {
          try {
            await Linking.openURL(waMeUrl);
            setSentChannel('whatsapp');
            setViewMode('confirm');
          } catch {
            Alert.alert('Error', 'WhatsApp is not installed or could not be opened on your device.');
          }
        }
      }
    } catch (error: any) {
      console.error('Error sending WhatsApp message:', error);
      Alert.alert('Failed to Send', error.message || 'An unknown error occurred while sending the message.');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendPush = async (localImageUri?: string) => {
    if (!selectedMember || !activeChurch) return;
    setIsSending(true);
    try {
      let text = `Praise the Lord!\n\n${greetingMessage || ""}`;
      if (selectedVerse?.text) {
        text += `\n\n"${selectedVerse.text}"\n— ${selectedVerse.ref}`;
      }
      text += `\n\nWith Love ❤️\n${activeChurch?.name || 'Your Church'}`;

      let imageUrl = null;
      if (localImageUri) {
        try {
          const storage = require('@react-native-firebase/storage').default;
          const ext = localImageUri.substring(localImageUri.lastIndexOf('.') + 1) || 'jpg';
          const storagePath = `celebrations/image_${Date.now()}.${ext}`;
          const reference = storage().ref(storagePath);
          await reference.putFile(localImageUri);
          imageUrl = await reference.getDownloadURL();
        } catch (e) {
          console.error('Failed to upload celebration image', e);
        }
      }

      const cat = selectedMember?.celebrationType || 'Birthday';
      const lowerCat = String(cat).toLowerCase();
      const isBirthday = lowerCat.includes('birthday');
      const isWeddingAnniv = lowerCat.includes('anniversary') && !lowerCat.includes('baptism');
      const titlePrefix = isBirthday
        ? '🎂 Happy Birthday'
        : isWeddingAnniv
          ? '💐 Happy Wedding Anniversary'
          : '🕊️ Happy Baptism Anniversary';
      const pushType = isBirthday
        ? 'birthday'
        : isWeddingAnniv
          ? 'anniversary'
          : 'baptism_anniversary';

      await FirestoreService.createNotificationBroadcast({
        title: `${titlePrefix}, ${selectedMember.name}!`,
        content: text,
        date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
        type: pushType,
        celebrationCategory: cat,
        isCelebration: true,
        targetChurchId: activeChurch.id,
        targetMemberId: selectedMember.originalId || selectedMember.Id || selectedMember.id || '',
        targetPhone: selectedMember.phone || '',
        imageUrl,
        silent: false,
      });

      Alert.alert('Push Notification Sent', `A notification was sent directly to ${selectedMember.name}!`);
      setSentChannel('push');
      setViewMode('confirm');
    } catch (error: any) {
      console.error('Error sending Push:', error);
      Alert.alert('Failed to Send Push', error.message || 'An unknown error occurred.');
    } finally {
      setIsSending(false);
    }
  };

  switch (viewMode) {
    case 'details': {
      const AdminCelebrationsMemberDetails = require('./AdminCelebrationsMemberDetails').default;
      return (
        <AdminCelebrationsMemberDetails
          member={selectedMember}
          category={(selectedMember?.celebrationType || 'Birthday')}
          onBack={() => setViewMode('list')}
          onPrepareWish={() => {
            // Reset personalization state when starting a new wish
            setLayout('theme');
            setPhotoUri(null);
            setSelectedThemeId(null);
            setSelectedVerse(null);
            const name = (selectedMember?.name || '').split(' ')[0];
            const cat = selectedMember?.celebrationType || 'Birthday';
            let defaultMsg = `Dear ${name}, wishing you a joy-filled birthday surrounded by God's love and grace. May this new year of life be your best yet!`;
            if (cat === 'Wedding Anniversary') {
              defaultMsg = `Dear ${name}, wishing you a joyful Wedding Anniversary! May God continue to bless your marriage with love, peace, and happiness.`;
            } else if (cat === 'Baptism Anniversary') {
              defaultMsg = `Dear ${name}, happy Baptism Anniversary! May you continue to grow in faith and walk in God's grace.`;
            }
            setGreetingMessage(defaultMsg);
            setTitleOverlay(cat);
            setNameOverlay(selectedMember?.name || '');
            setViewMode('personalize');
          }}
        />
      );
    }
    case 'personalize': {
      const AdminCelebrationsPersonalize = require('./AdminCelebrationsPersonalize').default;
      return (
        <View style={{ flex: 1 }}>
          <AdminCelebrationsPersonalize
            member={selectedMember}
            category={(selectedMember?.celebrationType || 'Birthday')}
            layout={layout}
            onLayoutChange={setLayout}
            photoUri={photoUri}
            selectedThemeId={selectedThemeId}
            selectedVerse={selectedVerse}
            greetingMessage={greetingMessage}
            onMessageChange={setGreetingMessage}
            titleOverlay={titleOverlay}
            onTitleOverlayChange={setTitleOverlay}
            nameOverlay={nameOverlay}
            onNameOverlayChange={setNameOverlay}
            onBack={() => setViewMode('details')}
            onChooseTheme={() => setViewMode('themePicker')}
            onChoosePhoto={() => setViewMode('photoPicker')}
            onChooseVerse={() => setViewMode('versePicker')}
            onPreview={() => setViewMode('preview')}
          />
          <SuccessPopup visible={!!toastMsg} message={toastMsg} onDismiss={() => setToastMsg('')} />
        </View>
      );
    }
    case 'themePicker': {
      const AdminCelebrationsThemePicker = require('./AdminCelebrationsThemePicker').default;
      return (
        <View style={{ flex: 1 }}>
          <AdminCelebrationsThemePicker
            onBack={() => setViewMode('personalize')}
            onSelectTheme={(themeId: string) => {
              if (themeId === 'custom') {
                setViewMode('customTheme');
              } else {
                setSelectedThemeId(themeId);
                setViewMode('personalize');
              }
            }}
            onDeleteSuccess={() => setToastMsg('Custom Theme Deleted')}
          />
          <SuccessPopup visible={!!toastMsg} message={toastMsg} onDismiss={() => setToastMsg('')} />
        </View>
      );
    }
    case 'customTheme': {
      const AdminCelebrationsCustomTheme = require('./AdminCelebrationsCustomTheme').default;
      return (
        <View style={{ flex: 1 }}>
          <AdminCelebrationsCustomTheme
            onBack={() => setViewMode('themePicker')}
            onSave={(newTheme: any) => {
              if (activeChurch) {
                setActiveChurch({
                  ...activeChurch,
                  customThemes: [...(activeChurch.customThemes || []), newTheme]
                });
              }
              setSelectedThemeId(newTheme.id);
              setToastMsg('Custom Theme Saved Successfully!');
              setViewMode('personalize');
            }}
          />
          <SuccessPopup visible={!!toastMsg} message={toastMsg} onDismiss={() => setToastMsg('')} />
        </View>
      );
    }
    case 'versePicker': {
      const AdminCelebrationsVersePicker = require('./AdminCelebrationsVersePicker').default;
      return (
        <AdminCelebrationsVersePicker
          category={(selectedMember?.celebrationType || 'Birthday')}
          selectedVerseRef={selectedVerse?.ref}
          onBack={() => setViewMode('personalize')}
          onSelectVerse={(verse: any) => {
            setSelectedVerse(verse);
            setViewMode('personalize');
          }}
        />
      );
    }
    case 'photoPicker': {
      const AdminCelebrationsPhotoPicker = require('./AdminCelebrationsPhotoPicker').default;
      return (
        <AdminCelebrationsPhotoPicker
          member={selectedMember}
          onBack={() => setViewMode('personalize')}
          onSelectPhoto={(uri: string) => {
            setPhotoUri(uri);
            setViewMode('personalize');
          }}
        />
      );
    }
    case 'preview': {
      const AdminCelebrationsPreview = require('./AdminCelebrationsPreview').default;
      // Find full theme object (default to royalblue if not found)
      let themeObj = THEMES.find(t => t.id === selectedThemeId || (t.id === 'royalblue' && selectedThemeId === 'royal') || (t.id === 'royal' && selectedThemeId === 'royalblue'));
      if (!themeObj && selectedThemeId?.startsWith('custom_')) {
        themeObj = activeChurch?.customThemes?.find((t: any) => t.id === selectedThemeId);
      }
      if (!themeObj) themeObj = { id: 'royalblue', title: 'Royal Blue', color: '#1E2A63', c: ['#5A6BC4', '#1E2A63'] } as any;

      if (layout === 'photo' && photoUri) {
        themeObj = { ...themeObj, imageUrl: photoUri } as any;
      }

      return (
        <AdminCelebrationsPreview
          member={selectedMember}
          category={(selectedMember?.celebrationType || 'Birthday')}
          theme={themeObj}
          layout={layout}
          photoUri={photoUri}
          titleOverlay={titleOverlay}
          nameOverlay={nameOverlay}
          message={greetingMessage}
          verse={selectedVerse || { ref: '', text: '' }}
          churchName={activeChurch?.name || ''}
          onBack={() => setViewMode('personalize')}
          onEdit={() => setViewMode('personalize')}
          onContinue={() => setViewMode('whatsapp')}
        />
      );
    }
    case 'whatsapp': {
      const AdminCelebrationsWhatsAppPreview = require('./AdminCelebrationsWhatsAppPreview').default;
      let themeObj = THEMES.find(t => t.id === selectedThemeId || (t.id === 'royalblue' && selectedThemeId === 'royal') || (t.id === 'royal' && selectedThemeId === 'royalblue'));
      if (!themeObj && selectedThemeId?.startsWith('custom_')) {
        themeObj = activeChurch?.customThemes?.find((t: any) => t.id === selectedThemeId);
      }
      if (!themeObj) themeObj = { id: 'royalblue', title: 'Royal Blue', color: '#1E2A63', c: ['#5A6BC4', '#1E2A63'] } as any;
      if (layout === 'photo' && photoUri) {
        themeObj = { ...themeObj, imageUrl: photoUri } as any;
      }

      return (
        <AdminCelebrationsWhatsAppPreview
          member={selectedMember}
          category={(selectedMember?.celebrationType || 'Birthday')}
          theme={themeObj}
          layout={layout}
          photoUri={photoUri}
          titleOverlay={titleOverlay}
          nameOverlay={nameOverlay}
          message={greetingMessage}
          verse={selectedVerse || { ref: '', text: '' }}
          churchName={activeChurch?.name || ''}
          onEdit={() => setViewMode('personalize')}
          onSendWhatsApp={handleSendWhatsApp}
          onSendPush={handleSendPush}
        />
      );
    }
    case 'confirm': {
      const AdminCelebrationsConfirm = require('./AdminCelebrationsConfirm').default;
      return (
        <AdminCelebrationsConfirm
          member={selectedMember}
          category={(selectedMember?.celebrationType || 'Birthday')}
          channel={sentChannel}
          onDone={() => setViewMode('dashboard')}
        />
      );
    }
  }


  const AdminCelebrationsList = require('./AdminCelebrationsList').default;

  const dashboardHeader = (
    <>
      {/* Hero Card - Honey Amber Gradient Glassmorphism (same in dark & white theme) */}
      <LinearGradient
        colors={['#FFF2DF', '#FED5A5', '#FCAE68']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.1, y: 1 }}
        style={[
          styles.heroCard,
          {
            borderColor: 'rgba(255, 255, 255, 0.8)',
            borderWidth: 1.5,
            shadowColor: '#8C3B0D',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.18,
            shadowRadius: 18,
            elevation: 6,
            position: 'relative',
            overflow: 'hidden',
          }
        ]}
      >
        {/* Semi-circle button at right top corner */}
        <TouchableOpacity
          style={[
            styles.heroCornerBtn,
            {
              backgroundColor: 'rgba(255, 255, 255, 0.45)',
              borderColor: 'rgba(255, 255, 255, 0.75)',
            }
          ]}
          onPress={() => {
            const next = activeDateFilter === 'Today' ? 'Upcoming' : 'Today';
            setActiveDateFilter(next);
            setToastMsg(`Filtered to ${next} Celebrations`);
          }}
          activeOpacity={0.75}
        >
          <Gift size={20} color="#3D1403" strokeWidth={2.2} />
        </TouchableOpacity>

        <Text style={[styles.heroEyebrow, { color: '#8C3B0D' }]}>THIS SEASON</Text>
        <Text style={[
          styles.heroTitle,
          {
            color: '#3D1403',
            fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
          }
        ]}>
          Celebrations{'\n'}worth remembering
        </Text>
        <Text style={[styles.heroDesc, { color: '#78350F' }]}>
          Browse birthdays, anniversaries and baptisms across the parish, and prepare a beautiful wish in moments.
        </Text>

        {/* Frosted Glassmorphism Stats Tray with perfect column alignment */}
        <View style={[
          styles.statsRow,
          {
            backgroundColor: 'rgba(255, 255, 255, 0.42)',
            borderRadius: 14,
            paddingVertical: 10,
            paddingHorizontal: 8,
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.7)',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 4,
          }
        ]}>
          <View style={[styles.statItem, { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0, paddingHorizontal: 2, marginRight: 0 }]}>
            <Text style={[styles.statNumber, { color: '#3D1403', textAlign: 'center' }]} numberOfLines={1}>{stats.total}</Text>
            <Text style={[styles.statLabel, { color: '#8C3B0D', textAlign: 'center', fontSize: 9.5, letterSpacing: 0.3 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>TOTAL RECORDS</Text>
          </View>
          <View style={{ width: 1, height: 26, backgroundColor: 'rgba(61, 20, 3, 0.15)', alignSelf: 'center' }} />
          <View style={[styles.statItem, { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0, paddingHorizontal: 2, marginRight: 0 }]}>
            <Text style={[styles.statNumber, { color: '#3D1403', textAlign: 'center' }]} numberOfLines={1}>{stats.today}</Text>
            <Text style={[styles.statLabel, { color: '#8C3B0D', textAlign: 'center', fontSize: 9.5, letterSpacing: 0.3 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>TODAY</Text>
          </View>
          <View style={{ width: 1, height: 26, backgroundColor: 'rgba(61, 20, 3, 0.15)', alignSelf: 'center' }} />
          <View style={[styles.statItem, { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0, paddingHorizontal: 2, marginRight: 0 }]}>
            <Text style={[styles.statNumber, { color: '#3D1403', textAlign: 'center' }]} numberOfLines={1}>{stats.thisWeek}</Text>
            <Text style={[styles.statLabel, { color: '#8C3B0D', textAlign: 'center', fontSize: 9.5, letterSpacing: 0.3 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>THIS WEEK</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Date Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, marginBottom: 14 }}>
        {['Today', 'Upcoming', 'Week', 'Month', 'Past', 'All'].map(filter => {
          const isActive = activeDateFilter === filter;
          return (
            <TouchableOpacity
              key={filter}
              style={[
                styles.filterBtn,
                isActive ? {
                  backgroundColor: isDark ? '#FFFFFF' : '#000000',
                  borderColor: isDark ? '#FFFFFF' : '#000000',
                  borderWidth: 1.5,
                } : {
                  backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                  borderColor: isDark ? '#27272A' : '#CBD5E1',
                  borderWidth: 1.5,
                }
              ]}
              onPress={() => setActiveDateFilter(filter)}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.filterBtnTxt,
                  isActive ? {
                    color: isDark ? '#000000' : '#FFFFFF',
                    fontWeight: '700',
                  } : {
                    color: isDark ? '#A1A1AA' : '#64748B',
                    fontWeight: '600',
                  }
                ]}
              >
                {filter}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Category Buttons */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10, marginBottom: 16 }}>
        {['Birthday', 'Wedding Anniversary', 'Baptism Anniversary'].map(cat => {
          let bgColor = cat === 'Birthday' ? '#F3E4B6' : cat === 'Wedding Anniversary' ? '#E2E5F2' : '#DDF1E7';
          let textColor = cat === 'Birthday' ? '#B88A2E' : cat === 'Wedding Anniversary' ? '#455490' : '#358B6D';
          return (
            <TouchableOpacity
              key={cat}
              style={[{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: bgColor }, activeCategoryFilter === cat && { borderWidth: 2, borderColor: textColor }]}
              onPress={() => setActiveCategoryFilter(activeCategoryFilter === cat ? 'All' : cat)}
            >
              <Text style={[{ fontSize: 13, color: textColor }, activeCategoryFilter === cat && { fontWeight: '800' }]}>{cat}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </>
  );

  const dashboardFooter = activeChurch?.name?.trim() ? (
    <Text style={styles.footerText}>
      {activeChurch.name.trim().toUpperCase()}
    </Text>
  ) : null;

  return (
    <View style={[styles.container, { flex: 1 }]}>
      {/* ── Fixed Header ── */}
      <View style={[
        styles.header,
        {
          backgroundColor: isDark ? '#000000' : '#FFFFFF',
          borderBottomWidth: 1.5,
          borderBottomColor: isDark ? '#27272A' : '#CBD5E1',
          paddingBottom: 14,
          paddingTop: 12,
          paddingHorizontal: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }
      ]}>
        <TouchableOpacity
          style={styles.circularBackBtn}
          onPress={() => setActiveTab(0)}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.2} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[styles.headerTitle, { color: isDark ? '#FFFFFF' : '#0F172A', textAlign: 'center' }]}>Celebrations</Text>
          <Text style={[styles.headerSub, { color: isDark ? '#A1A1AA' : '#64748B', textAlign: 'center' }]}>Manage birthdays & anniversaries</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <AdminCelebrationsList
        category={activeCategoryFilter}
        activeTab={activeDateFilter}
        listHeaderComponent={dashboardHeader}
        listFooterComponent={dashboardFooter}
        onSelectMember={(member: any) => {
          setSelectedMember(member);
          setViewMode('details');
        }}
      />
      <SuccessPopup visible={!!toastMsg} message={toastMsg} onDismiss={() => setToastMsg('')} />
    </View>
  );
}

const THEMES = [
  { id: 'floral', title: 'Floral Celebration', c: ['#E7C767', '#BE9A3A'] },
  { id: 'golden', title: 'Golden Blessings', c: ['#F3D98B', '#B4842A'] },
  { id: 'royalblue', title: 'Royal Blue', color: '#1E2A63', c: ['#5A6BC4', '#1E2A63'] },
  { id: 'royal', title: 'Royal Blue', color: '#1E2A63', c: ['#5A6BC4', '#1E2A63'] },
  { id: 'worship', title: 'Church Worship', c: ['#8A6FBF', '#3D2C6B'] },
  { id: 'white', title: 'Elegant White', c: ['#FDFBF6', '#E4DAC2'] },
  { id: 'balloons', title: 'Balloons', c: ['#F09A9A', '#E7C767'] },
  { id: 'minimal', title: 'Minimal Modern', c: ['#DCD6C8', '#9C9483'] },
  { id: 'cross', title: 'Cross & Bible', c: ['#4FA6A6', '#1E2A63'] },
  { id: 'family', title: 'Family Celebration', c: ['#E39A6B', '#BE9A3A'] },
  { id: 'children', title: "Children's Theme", c: ['#7BC9E0', '#F3D98B'] },
];

const styles = createAdminThemedStyles(StyleSheet.create({
  circularBackBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#FAF8F0', // Ivory deep
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#FAF8F0',
    justifyContent: 'center',
    alignItems: 'center'
  },
  content: {
    padding: 0,
    paddingBottom: 40,
  },
  header: {
    backgroundColor: 'transparent',
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,


    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    position: 'relative',
    zIndex: 10,
    marginBottom: 12,
  },
  backBtn: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2, paddingVertical: 4, paddingHorizontal: 2 },
  backBtnTxt: { fontSize: 13, fontWeight: '700', color: '#fff' },
  heroTitles: { flex: 1, borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.2)', paddingLeft: 12 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#1a2d5a' },
  headerSub: { fontSize: 11, color: '#64748b', marginTop: 2 },
  heroCard: {
    borderRadius: 20,
    padding: 18,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    position: 'relative',
    overflow: 'hidden',
  },
  heroCornerBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 52,
    height: 52,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 52,
    borderLeftWidth: 1.5,
    borderBottomWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 8,
    paddingBottom: 8,
    zIndex: 5,
  },
  heroEyebrow: {
    color: '#D4AF37', // Gold
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    marginBottom: 8,
  },
  heroDesc: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statItem: {
    marginRight: 24,
  },
  statNumber: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    color: '#8B96C3',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
  },
  sectionTitle: {
    color: '#848796',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 16,
    marginHorizontal: 20,
  },
  categoryCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    marginHorizontal: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 20,
  },
  halfCard: {
    width: '48%',
    marginHorizontal: 0,
  },
  catIcon: {
    marginBottom: 16,
  },
  catTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  catDesc: {
    fontSize: 13,
  },
  footerText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 20,
    marginBottom: 40,
  },
  chipBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'transparent'
  },
  chipBtnTxt: {
    fontSize: 14,
    fontWeight: '600'
  },
  filterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
  },
  filterBtnActive: {
    backgroundColor: '#1a2d5a',
  },
  filterBtnTxt: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '600'
  },
  filterBtnTxtActive: {
    color: '#FFFFFF'
  }
}));
