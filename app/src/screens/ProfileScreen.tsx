import React, { useEffect, useState, useRef } from 'react';
import { 
  SafeAreaView,
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Platform,
  Dimensions,
  Modal,
  TextInput,
  Alert,
  Image,
  Switch,
  Share,
  Animated,
  KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { 
  ArrowLeft,
  Camera,
  Palette,
  ChevronRight, 
  LogOut, 
  User, 
  Bell, 
  Moon, 
  Heart, 
  CreditCard,
  Droplets,
  Globe,
  Check,
  X,
  CheckCircle2,
  HelpCircle,
  MapPin,
  Crown,
  Award,
  Shield,
  Sun,
  Sparkles,
  Search
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import FirestoreService, { AppMember } from '../services/FirestoreService';
import { useChurch } from '../context/ChurchContext';
import SecurityService from '../services/SecurityService';
import * as ImagePicker from 'expo-image-picker';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Lock } from 'lucide-react-native';
import storage from '@react-native-firebase/storage';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { formatDateDisplay } from '../utils/DateUtils';
import { CHURCH_SKILL_CATEGORIES, ALL_PREDEFINED_SKILLS } from '../constants/churchSkills';

const { width } = Dimensions.get('window');

// Helper to parse multiple skills from string or array
const parseSkillsList = (val: any): string[] => {
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === 'string' && val.trim()) {
    return val.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
  return [];
};

export default function ProfileScreen({ navigation }: any) {
  const { user, signOut, member: authMember, setViewMode, switchViewMode, setMember: setGlobalMember } = useAuth();
  const { activeChurch, isImpersonating, impersonatedBranchName, stopImpersonation } = useChurch();
  const { isDark, toggleTheme, colors, currentThemeOption } = useTheme();
  const { language, setLanguage, languages, currentLanguageOption, t } = useLanguage();
  
  const [member, setMember] = useState<AppMember | null>(authMember as AppMember | null);
  const [loading, setLoading] = useState(!authMember);
  const [refreshing, setRefreshing] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isLanguageModalVisible, setIsLanguageModalVisible] = useState(false);
  const [isNotifyModalVisible, setIsNotifyModalVisible] = useState(false);
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | null>(null);
  
  // Notification States
  const [dailyPromiseNotify, setDailyPromiseNotify] = useState(true);
  const [newSermonNotify, setNewSermonNotify] = useState(true);
  const [eventReminderNotify, setEventReminderNotify] = useState(true);
  const [prayerNotify, setPrayerNotify] = useState(false);
  // Skill Picker States
  const [skillPickerVisible, setSkillPickerVisible] = useState(false);
  const [activeSkillField, setActiveSkillField] = useState<'primarySkill' | 'secondarySkill' | null>(null);
  const [skillSearchText, setSkillSearchText] = useState('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('all');
  const [customSkillInput, setCustomSkillInput] = useState('');

  const [editForm, setEditForm] = useState({
    firstName: authMember?.firstName || '',
    lastName: authMember?.lastName || '',
    email: authMember?.email || '',
    city: authMember?.city || authMember?.village || authMember?.mailingCity || '',
    mailingStreet: authMember?.mailingStreet || '',
    mailingState: authMember?.mailingState || '',
    dob: authMember?.dob || '',
    baptismDate: authMember?.baptismDate || '',
    anniversaryDate: authMember?.anniversaryDate || '',
    primarySkill: authMember?.primarySkill || '',
    secondarySkill: authMember?.secondarySkill || ''
  });
  const [updating, setUpdating] = useState(false);

  // Animated 3-card profile photo banner (Boy card in center + two girl cards reveal slightly after 1.5s)
  const fanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let animTimer: any;
    if (isEditModalVisible && !localPhotoUrl) {
      fanAnim.setValue(0);

      // Wait 1.5 seconds after entering screen before gently revealing behind cards
      animTimer = setTimeout(() => {
        Animated.spring(fanAnim, {
          toValue: 1,
          friction: 7,
          tension: 32,
          useNativeDriver: true,
        }).start();
      }, 1500);
    } else {
      fanAnim.setValue(0);
    }

    return () => {
      if (animTimer) clearTimeout(animTimer);
    };
  }, [isEditModalVisible, localPhotoUrl]);
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [activeDateField, setActiveDateField] = useState<'dob' | 'baptismDate' | 'anniversaryDate' | null>(null);

  const filteredSkillList = React.useMemo(() => {
    let list: string[] = [];
    if (selectedCategoryTab === 'all') {
      list = ALL_PREDEFINED_SKILLS;
    } else {
      const cat = CHURCH_SKILL_CATEGORIES.find(c => c.id === selectedCategoryTab);
      list = cat ? cat.skills : ALL_PREDEFINED_SKILLS;
    }

    if (skillSearchText.trim()) {
      const query = skillSearchText.trim().toLowerCase();
      return ALL_PREDEFINED_SKILLS.filter(s => s.toLowerCase().includes(query));
    }
    return list;
  }, [selectedCategoryTab, skillSearchText]);

  const handleConfirmDate = (date: Date) => {
    const formattedDate = date.toISOString().split('T')[0];
    if (activeDateField === 'dob') setEditForm({ ...editForm, dob: formattedDate });
    if (activeDateField === 'baptismDate') setEditForm({ ...editForm, baptismDate: formattedDate });
    if (activeDateField === 'anniversaryDate') setEditForm({ ...editForm, anniversaryDate: formattedDate });
    setDatePickerVisibility(false);
  };
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  
  // Custom Alert Modals
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [infoModalVisible, setInfoModalVisible] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{title: string, message: string, onConfirm: () => Promise<void>, isDestructive?: boolean}>({ title: '', message: '', onConfirm: async () => {}, isDestructive: false });

  const fetchProfileData = async () => {
    try {
      const searchPhone = user?.phoneNumber || (member as AppMember)?.phone || (member as any)?.phoneNumber;
      if (searchPhone) {
        const contactCheck = await FirestoreService.checkContactExists(searchPhone);
        if (contactCheck?.exists && contactCheck.member) {
          setMember(contactCheck.member);
          if (setGlobalMember) {
            setGlobalMember(contactCheck.member);
          }
          setEditForm({
            firstName: contactCheck.member.firstName || '',
            lastName: contactCheck.member.lastName || '',
            email: contactCheck.member.email || '',
            city: contactCheck.member.city || contactCheck.member.village || contactCheck.member.mailingCity || '',
            mailingStreet: contactCheck.member.mailingStreet || '',
            mailingState: contactCheck.member.mailingState || '',
            dob: contactCheck.member.dob || '',
            baptismDate: contactCheck.member.baptismDate || '',
            anniversaryDate: contactCheck.member.anniversaryDate || '',
            primarySkill: contactCheck.member.primarySkill || '',
            secondarySkill: contactCheck.member.secondarySkill || ''
          });
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!member) return;
    setUpdating(true);
    try {
      const updatedDetails = {
        ...editForm,
        mailingCity: editForm.city, // Keep synced for any legacy UI
        name: `${editForm.firstName || ''} ${editForm.lastName || ''}`.trim()
      };
      await FirestoreService.updateMemberProfile(member.churchId || activeChurch?.id || '', member.id, updatedDetails);
      if (user) {
        await user.updateProfile({ displayName: updatedDetails.name });
      }
      setIsEditModalVisible(false);
      setSuccessMessage('Your personal details (Name, Email, and Address) have been updated directly in your church record.');
      setTimeout(() => setSuccessModalVisible(true), 300);
      fetchProfileData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update profile');
    } finally {
      setUpdating(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const selectedUri = result.assets[0].uri;
      
      setConfirmConfig({
        title: 'Confirm Photo',
        message: 'Do you want to set this cropped image as your profile photo?',
        isDestructive: false,
        onConfirm: async () => {
          try {
            setUpdating(true);
            if (user) {
              // Upload to Firebase Storage
              const reference = storage().ref(`profile_photos/${user.uid}/profile_${Date.now()}.jpg`);
              await reference.putFile(selectedUri);
              const downloadUrl = await reference.getDownloadURL();

              setLocalPhotoUrl(downloadUrl);
              
              await user.updateProfile({
                photoURL: downloadUrl
              });
              
              // Sync the photo URL to the Firestore member document so admins can see it
              if (member && (member.churchId || activeChurch?.id)) {
                await FirestoreService.updateMemberProfile(member.churchId || activeChurch?.id || '', member.id, {
                  profilePhoto: downloadUrl,
                  photoRemoved: false
                });
              }

              setConfirmModalVisible(false);
              setSuccessMessage(t('profile.photoUpdatedSuccess'));
              setTimeout(() => setSuccessModalVisible(true), 300);
            }
          } catch (error: any) {
            Alert.alert(t('common.error'), t('common.error') + ': ' + error.message);
          } finally {
            setUpdating(false);
          }
        }
      });
      setConfirmModalVisible(true);
    }
  };

  const handleRemovePhoto = async () => {
    setConfirmConfig({
      title: t('profile.removePhotoConfirmTitle'),
      message: t('profile.removePhotoConfirmMsg'),
      isDestructive: true,
      onConfirm: async () => {
        try {
          setUpdating(true);
          if (user) {
            setLocalPhotoUrl(null);
            await user.updateProfile({
              photoURL: null as any
            });

            // Sync the removal to the Firestore member document
            if (member && (member.churchId || activeChurch?.id)) {
              await FirestoreService.updateMemberProfile(member.churchId || activeChurch?.id || '', member.id, {
                profilePhoto: null,
                photoURL: null,
                photoUrl: null,
                profileImageUrl: null,
                PhotoUrl: null,
                Photo: null,
                photoRemoved: true
              });
            }

            setConfirmModalVisible(false);
            setSuccessMessage(t('profile.photoRemovedSuccess'));
            setTimeout(() => setSuccessModalVisible(true), 300);
          }
        } catch (error: any) {
          Alert.alert('Error', 'Failed to remove photo: ' + error.message);
        } finally {
          setUpdating(false);
        }
      }
    });
    setConfirmModalVisible(true);
  };

    useEffect(() => {
      fetchProfileData();
      checkBiometrics();
    }, [user]);

    useEffect(() => {
      const m: any = member;
      let dbPhoto = null;
      if (m) {
        if (m.photoRemoved || m.profilePhoto === null) {
          dbPhoto = null;
        } else {
          dbPhoto = m.profilePhoto || m.photoURL || m.photoUrl || m.profileImageUrl || m.PhotoUrl || m.Photo;
        }
      }
      
      if (member) {
        setLocalPhotoUrl(dbPhoto || null);
      } else {
        setLocalPhotoUrl(user?.photoURL || null);
      }
    }, [user, member]);

  const checkBiometrics = async () => {
    const available = await SecurityService.isBiometricAvailable();
    const enabled = await SecurityService.isBiometricEnabled();
    setBiometricAvailable(available);
    setBiometricEnabled(enabled);
  };

  const toggleBiometrics = async (val: boolean) => {
    if (val) {
      const success = await SecurityService.authenticate(activeChurch?.name);
      if (success) {
        await SecurityService.setBiometricPreference(true);
        setBiometricEnabled(true);
      } else {
        setBiometricEnabled(false);
      }
    } else {
      await SecurityService.setBiometricPreference(false);
      setBiometricEnabled(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfileData();
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name[0].toUpperCase();
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color="#FCD34D" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.headerGradient ? colors.headerGradient[0] : (isDark ? '#000000' : '#1a2d5a')} />

      {isImpersonating ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Shield size={64} color="#1a2d5a" style={{ marginBottom: 20 }} />
          <Text style={{ fontSize: 24, fontWeight: '800', color: '#1a2d5a', textAlign: 'center', marginBottom: 12 }}>
            Admin View
          </Text>
          <Text style={{ fontSize: 16, color: '#64748b', textAlign: 'center', marginBottom: 30, lineHeight: 24 }}>
            You are currently viewing {impersonatedBranchName} as an administrator. Your personal profile is not active in this view.
          </Text>
          <TouchableOpacity 
            style={{ backgroundColor: '#1a2d5a', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 }}
            onPress={stopImpersonation}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Return to Main Church</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <ScrollView 
            showsVerticalScrollIndicator={false} 
            contentContainerStyle={styles.scrollContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? "#FFFFFF" : "#1a2d5a"} />}
            bounces={true}
          >
          {/* ── Hero Section (Navy) ── */}
      <LinearGradient 
        colors={colors.headerGradient || (isDark ? ['#18181B', '#000000'] : ['#1E293B', '#0F172A'])}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroSection}
      >
        <View style={styles.headerTop}>
          <View style={{ width: 40 }} />
          <TouchableOpacity style={styles.themeToggle} onPress={() => navigation.navigate('Appearance')}>
            <Palette size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── Hero Content ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 14, width: '100%' }}>
          {/* Avatar */}
          <View style={[styles.avatarContainer, { marginTop: 0, marginRight: 18 }]}>
            {localPhotoUrl ? (
              <Image source={{ uri: localPhotoUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarCircle}>
                <User size={42} color="#fff" strokeWidth={1.5} />
              </View>
            )}
          </View>

          {/* Name + Greeting */}
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', lineHeight: 28 }}>
              {member?.firstName ? `${member.firstName} ${member.lastName || ''}` : member?.name || user?.displayName || 'Beloved Member'}
            </Text>
            {/* Member Since Pill */}
            <View style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 }}>
              <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '500' }}>
                {t('profile.memberSince', { year: member?.joinDate ? new Date(member.joinDate).getFullYear() : '2026' })}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Stats Row ── */}
        <View style={{ paddingHorizontal: 16, width: '100%', marginTop: 20 }}>
          <View style={styles.statsCard}>
            <View style={styles.statItem}>
              <View style={[styles.statIconContainer, { backgroundColor: '#3b82f6' }]}>
                <MapPin size={14} color="#fff" strokeWidth={2.5} />
              </View>
              <View style={styles.statTextCol}>
                <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit>{t('profile.village')}</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{member?.mailingCity || 'N/A'}</Text>
              </View>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <View style={[styles.statIconContainer, { backgroundColor: '#10b981' }]}>
                <Globe size={14} color="#fff" strokeWidth={2.5} />
              </View>
              <View style={styles.statTextCol}>
                <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit>{t('profile.language')}</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>{currentLanguageOption.nativeName}</Text>
              </View>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statItem}>
              <View style={[styles.statIconContainer, { backgroundColor: '#8b5cf6' }]}>
                <Crown size={14} color="#fff" strokeWidth={2.5} />
              </View>
              <View style={styles.statTextCol}>
                <Text style={styles.statLabel} numberOfLines={1} adjustsFontSizeToFit>{t('profile.role')}</Text>
                <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
                  {(member?.userType || 'MEMBER').toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          {/* Member Skills Badges in Hero */}
          {(member?.primarySkill || member?.secondarySkill) ? (
            <View style={{ marginTop: 12, width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {parseSkillsList(member?.primarySkill).map((sk, idx) => (
                <View key={'p-' + idx} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}>
                  <Award size={12} color="#FDE68A" style={{ marginRight: 5 }} />
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                    {sk}
                  </Text>
                </View>
              ))}
              {parseSkillsList(member?.secondarySkill).map((sk, idx) => (
                <View key={'s-' + idx} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}>
                  <Sparkles size={12} color="#C7D2FE" style={{ marginRight: 5 }} />
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                    {sk}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </LinearGradient>

        {/* Stats removed for accuracy */}

        {/* ── All Buttons "n-shaped" Card overlapping the Top Card ── */}
        <View 
          style={[
            styles.buttonsCard, 
            { 
              backgroundColor: colors.background,
            }
          ]}
        >
        {/* ── Account Section (Instagram-Style Flat, Borderless) ── */}
        <View style={styles.igSection}>
          <Text style={[styles.igSectionHeader, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
            {t('profile.accountSection') || 'Account'}
          </Text>

          {(String(member?.userType || '').toUpperCase().includes('ADMIN') || String(member?.userType || '').toUpperCase().includes('SUPER')) && (
            <MenuItem 
              icon={<Shield size={22} color={colors.text} strokeWidth={1.8} />} 
              title={t('profile.adminDashboard')} 
              sub={t('profile.adminDashboardSub')} 
              onPress={() => {
                switchViewMode('admin', () => {
                  if (navigation?.navigate) {
                    navigation.navigate('AdminRoot');
                  }
                });
              }}
              textColor={colors.text}
              subColor={colors.textSecondary}
            />
          )}
          <MenuItem 
            icon={<User size={22} color={colors.text} strokeWidth={1.8} />} 
            title={t('profile.myProfile')} 
            sub={t('profile.myProfileSub')} 
            onPress={() => setIsEditModalVisible(true)}
            textColor={colors.text}
            subColor={colors.textSecondary}
          />
          <MenuItem 
            icon={<CreditCard size={22} color={colors.text} strokeWidth={1.8} />} 
            title={t('profile.givingHistory')} 
            sub={t('profile.givingHistorySub')} 
            onPress={() => navigation.navigate('GivingHistory')}
            textColor={colors.text}
            subColor={colors.textSecondary}
          />
          <MenuItem 
            icon={<Droplets size={22} color={colors.text} strokeWidth={1.8} />} 
            title="Baptism" 
            sub="Submit request & track approval status" 
            onPress={() => navigation.navigate('BaptismRequest')}
            textColor={colors.text}
            subColor={colors.textSecondary}
          />

          {(String(member?.userType || '').toUpperCase().includes('ADMIN') || String(member?.userType || '').toUpperCase().includes('SUPER') || String(member?.userType || '').toUpperCase().includes('PASTOR')) && (
            <MenuItem 
              icon={<CreditCard size={22} color={colors.text} strokeWidth={1.8} />} 
              title={t('profile.churchSubscription')} 
              sub={t('profile.churchSubscriptionSub')} 
              onPress={() => navigation.navigate('Subscription')}
              textColor={colors.text}
              subColor={colors.textSecondary}
            />
          )}
        </View>

        {/* Gray Divider Band between sections (Instagram style) */}
        <View style={[styles.igSectionDividerBand, { backgroundColor: isDark ? '#141416' : '#F1F5F9' }]} />

        {/* ── Settings Section ── */}
        <View style={styles.igSection}>
          <Text style={[styles.igSectionHeader, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
            {t('profile.settingsSection') || 'Settings'}
          </Text>

          <MenuItem 
            icon={<Bell size={22} color={colors.text} strokeWidth={1.8} />} 
            title={t('profile.notifications')} 
            sub={t('profile.notificationsSub')} 
            onPress={() => {
              setIsLanguageModalVisible(false);
              setIsNotifyModalVisible(true);
            }}
            textColor={colors.text}
            subColor={colors.textSecondary}
          />
          <MenuItem 
            icon={<Globe size={22} color={colors.text} strokeWidth={1.8} />} 
            title={t('profile.language')} 
            value={`${currentLanguageOption.nativeName} (${currentLanguageOption.name})`} 
            onPress={() => {
              setIsNotifyModalVisible(false);
              setIsLanguageModalVisible(true);
            }}
            textColor={colors.text}
            subColor={colors.textSecondary}
          />
          <MenuItem 
            icon={<Palette size={22} color={colors.text} strokeWidth={1.8} />} 
            title="Appearance" 
            value={currentThemeOption?.name || 'Warm white'} 
            onPress={() => navigation.navigate('Appearance')}
            textColor={colors.text}
            subColor={colors.textSecondary}
          />
        </View>

        {/* Gray Divider Band between sections */}
        {biometricAvailable && (
          <>
            <View style={[styles.igSectionDividerBand, { backgroundColor: isDark ? '#141416' : '#F1F5F9' }]} />

            {/* ── Security Section ── */}
            <View style={styles.igSection}>
              <Text style={[styles.igSectionHeader, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                {t('profile.securitySection') || 'Security'}
              </Text>

              <View style={styles.igRow}>
                <View style={styles.igIconWrap}>
                  <Lock size={22} color={colors.text} strokeWidth={1.8} />
                </View>
                <View style={styles.igContentWrap}>
                  <Text style={[styles.igTitle, { color: colors.text }]}>{t('profile.biometricLock')}</Text>
                  <Text style={[styles.igSub, { color: colors.textSecondary }]}>{t('profile.biometricSub')}</Text>
                </View>
                <Switch 
                  value={biometricEnabled} 
                  onValueChange={toggleBiometrics}
                  trackColor={{ false: isDark ? '#3F3F46' : '#E2E8F0', true: colors.accent || '#10B981' }}
                  thumbColor={Platform.OS === 'android' ? (biometricEnabled ? '#FFFFFF' : '#F4F3F4') : undefined}
                />
              </View>
            </View>
          </>
        )}

        {/* Gray Divider Band between sections */}
        <View style={[styles.igSectionDividerBand, { backgroundColor: isDark ? '#141416' : '#F1F5F9' }]} />

        {/* ── Sign Out Button ── */}
        <TouchableOpacity 
          style={[
            styles.signOutBtn,
            {
              backgroundColor: isDark ? '#18181B' : '#F8FAFC',
              borderColor: isDark ? '#27272A' : '#E2E8F0',
            }
          ]}
          onPress={signOut}
          activeOpacity={0.8}
        >
          <LogOut size={18} color="#EF4444" style={{ marginRight: 8 }} />
          <Text style={{ color: '#EF4444', fontSize: 15, fontWeight: '700' }}>{t('profile.signOut')}</Text>
        </TouchableOpacity>

        <Text style={styles.versionTxt}>
          {t('profile.version')} {Constants.expoConfig?.version || '1.0.6'}
        </Text>
        </View>
      </ScrollView>

      {/* ── Edit Profile Screen (Full Screen, Theme-Styled) ── */}
      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <StatusBar 
            barStyle={isDark ? "light-content" : "dark-content"} 
            backgroundColor={colors.background} 
          />

          {/* Full Screen Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ? StatusBar.currentHeight + 14 : 42) : 16,
            paddingBottom: 14,
            backgroundColor: colors.background,
          }}>
            <TouchableOpacity 
              onPress={() => setIsEditModalVisible(false)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: isDark ? '#18181B' : '#E2E8F0',
              }}
              activeOpacity={0.7}
            >
              <ArrowLeft size={22} color={colors.text} />
            </TouchableOpacity>

            <Text style={{ fontSize: 19, fontWeight: '800', color: colors.text, textAlign: 'center', flex: 1, marginHorizontal: 8 }}>
              {t('profile.editProfile') || 'My Profile'}
            </Text>

            {/* Balancer to guarantee exact horizontal centering */}
            <View style={{ width: 40 }} />
          </View>

          {/* Form Content */}
          <ScrollView 
            showsVerticalScrollIndicator={false} 
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 60 }}
            style={{ flex: 1, backgroundColor: colors.background }}
          >
            {/* ── Profile Image Section: 3-Cards Fan Animation OR Single User Card ── */}
            {localPhotoUrl ? (
              <View style={{ alignItems: 'center', marginBottom: 28, marginTop: 6 }}>
                {/* Single Card with User Image */}
                <TouchableOpacity 
                  activeOpacity={0.9} 
                  onPress={pickImage}
                  style={{
                    width: 154,
                    height: 204,
                    borderRadius: 24,
                    overflow: 'hidden',
                    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                    borderWidth: 2,
                    borderColor: colors.accent || (isDark ? '#38BDF8' : '#0F766E'),
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: isDark ? 0.3 : 0.12,
                    shadowRadius: 12,
                    elevation: 6,
                  }}
                >
                  <Image 
                    source={{ uri: localPhotoUrl }} 
                    style={{ width: '100%', height: '100%' }} 
                    resizeMode="cover" 
                  />
                  {/* Camera Badge Overlay */}
                  <View style={{
                    position: 'absolute',
                    bottom: 10,
                    right: 10,
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: colors.accent || (isDark ? '#38BDF8' : '#0F766E'),
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
                  }}>
                    <Camera size={16} color="#FFFFFF" strokeWidth={2.2} />
                  </View>
                </TouchableOpacity>

                {/* Action Buttons for user image */}
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
                  <TouchableOpacity 
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: isDark ? '#27272A' : '#F1F5F9',
                      paddingHorizontal: 16,
                      paddingVertical: 9,
                      borderRadius: 20,
                      gap: 6,
                    }} 
                    onPress={pickImage}
                    activeOpacity={0.7}
                  >
                    <Camera size={15} color={colors.text} strokeWidth={2} />
                    <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                      {(t('profile.changePhoto') && t('profile.changePhoto') !== 'profile.changePhoto') ? t('profile.changePhoto') : 'Change Photo'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2',
                      paddingHorizontal: 16,
                      paddingVertical: 9,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: 'rgba(239,68,68,0.25)',
                      gap: 6,
                    }} 
                    onPress={handleRemovePhoto}
                    activeOpacity={0.7}
                  >
                    <X size={15} color="#EF4444" strokeWidth={2.2} />
                    <Text style={{ color: '#EF4444', fontSize: 13, fontWeight: '700' }}>
                      {(t('profile.removePhoto') && t('profile.removePhoto') !== 'profile.removePhoto') ? t('profile.removePhoto') : 'Remove'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ alignItems: 'center', marginBottom: 20, marginTop: -6 }}>
                {/* 3 Animated Cards: Boy card in middle, two girl cards reveal more after 1.5s */}
                <TouchableOpacity 
                  activeOpacity={0.92} 
                  onPress={pickImage}
                  style={{
                    width: width - 40,
                    height: 196,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  {/* Behind Left Card: Girl in white dress (reveals more to left after 1.5s) */}
                  <Animated.View style={{
                    position: 'absolute',
                    width: 138,
                    height: 172,
                    zIndex: 1,
                    transform: [
                      { translateX: fanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -68] }) },
                      { translateY: fanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) },
                      { rotate: fanAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-9deg'] }) },
                      { scale: fanAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 0.96] }) },
                    ],
                    opacity: fanAnim.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.7, 1] }),
                    shadowColor: isDark ? '#000' : 'transparent',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: isDark ? 0.2 : 0,
                    shadowRadius: isDark ? 8 : 0,
                    elevation: isDark ? 2 : 0,
                  }}>
                    <Image 
                      source={require('../../assets/profile_card_center.png')} 
                      style={{ width: '100%', height: '100%' }} 
                      resizeMode="contain" 
                    />
                  </Animated.View>

                  {/* Behind Right Card: Denim Girl card (reveals more to right after 1.5s) */}
                  <Animated.View style={{
                    position: 'absolute',
                    width: 138,
                    height: 172,
                    zIndex: 2,
                    transform: [
                      { translateX: fanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 68] }) },
                      { translateY: fanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) },
                      { rotate: fanAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '9deg'] }) },
                      { scale: fanAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 0.96] }) },
                    ],
                    opacity: fanAnim.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.7, 1] }),
                    shadowColor: isDark ? '#000' : 'transparent',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: isDark ? 0.2 : 0,
                    shadowRadius: isDark ? 8 : 0,
                    elevation: isDark ? 2 : 0,
                  }}>
                    <Image 
                      source={require('../../assets/profile_card_right.png')} 
                      style={{ width: '100%', height: '100%' }} 
                      resizeMode="contain" 
                    />
                  </Animated.View>

                  {/* Front Center Card: Boy card in middle (upright and crisp, zero shadow on light themes) */}
                  <View style={{
                    width: 142,
                    height: 182,
                    zIndex: 3,
                    shadowColor: isDark ? '#000' : 'transparent',
                    shadowOffset: { width: 0, height: 6 },
                    shadowOpacity: isDark ? 0.25 : 0,
                    shadowRadius: isDark ? 10 : 0,
                    elevation: isDark ? 3 : 0,
                  }}>
                    <Image 
                      source={require('../../assets/profile_card_boy_center.png')} 
                      style={{ width: '100%', height: '100%' }} 
                      resizeMode="contain" 
                    />
                  </View>
                </TouchableOpacity>

                {/* Below cards: Display text matching user reference */}
                <Text style={{
                  fontSize: 24,
                  fontWeight: '800',
                  color: colors.text,
                  textAlign: 'center',
                  marginTop: 12,
                  letterSpacing: -0.3,
                }}>
                  Your profile
                </Text>

                <Text style={{
                  fontSize: 14.5,
                  lineHeight: 21,
                  color: colors.textSecondary,
                  textAlign: 'center',
                  marginTop: 6,
                  paddingHorizontal: 20,
                }}>
                  {'Add your photo and keep your details up to\ndate so your church family can reach you.'}
                </Text>

                {/* Choose Photo Button */}
                <TouchableOpacity 
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.accent || (isDark ? '#38BDF8' : '#0F766E'),
                    paddingVertical: 12,
                    paddingHorizontal: 24,
                    borderRadius: 25,
                    marginTop: 14,
                    gap: 8,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 3 },
                    shadowOpacity: 0.15,
                    shadowRadius: 6,
                    elevation: 3,
                  }}
                  onPress={pickImage}
                  activeOpacity={0.8}
                >
                  <Camera size={17} color="#FFFFFF" strokeWidth={2.2} />
                  <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '700' }}>
                    {(t('profile.uploadPhoto') && t('profile.uploadPhoto') !== 'profile.uploadPhoto') ? t('profile.uploadPhoto') : 'Choose Photo'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('profile.firstName')}</Text>
              <TextInput 
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={editForm.firstName}
                onChangeText={(t) => setEditForm({...editForm, firstName: t})}
                placeholder={t('profile.firstName')}
                placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('profile.lastName')}</Text>
              <TextInput 
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={editForm.lastName}
                onChangeText={(t) => setEditForm({...editForm, lastName: t})}
                placeholder={t('profile.lastName')}
                placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('profile.email')}</Text>
              <TextInput 
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={editForm.email}
                onChangeText={(t) => setEditForm({...editForm, email: t})}
                placeholder={t('profile.email')}
                placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('profile.birthday')}</Text>
              <TouchableOpacity 
                style={[styles.input, { justifyContent: 'center', backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => {
                  setActiveDateField('dob');
                  setDatePickerVisibility(true);
                }}
              >
                <Text style={{ fontSize: 15, color: editForm.dob ? colors.text : (isDark ? '#71717A' : '#94a3b8') }}>
                  {editForm.dob ? formatDateDisplay(editForm.dob) : t('profile.selectDate')}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('profile.baptismDate')}</Text>
              <TouchableOpacity 
                style={[styles.input, { justifyContent: 'center', backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => {
                  setActiveDateField('baptismDate');
                  setDatePickerVisibility(true);
                }}
              >
                <Text style={{ fontSize: 15, color: editForm.baptismDate ? colors.text : (isDark ? '#71717A' : '#94a3b8') }}>
                  {editForm.baptismDate ? formatDateDisplay(editForm.baptismDate) : t('profile.selectDate')}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('profile.weddingAnniversaryDate')}</Text>
              <TouchableOpacity 
                style={[styles.input, { justifyContent: 'center', backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => {
                  setActiveDateField('anniversaryDate');
                  setDatePickerVisibility(true);
                }}
              >
                <Text style={{ fontSize: 15, color: editForm.anniversaryDate ? colors.text : (isDark ? '#71717A' : '#94a3b8') }}>
                  {editForm.anniversaryDate ? formatDateDisplay(editForm.anniversaryDate) : t('profile.selectDate')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Primary Skill */}
            <View style={styles.inputGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Primary Skill</Text>
                {editForm.primarySkill ? (
                  <TouchableOpacity onPress={() => setEditForm({ ...editForm, primarySkill: '' })}>
                    <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '600' }}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity 
                style={[styles.input, { justifyContent: 'space-between', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => {
                  setActiveSkillField('primarySkill');
                  setSkillSearchText('');
                  setSelectedCategoryTab('all');
                  setCustomSkillInput('');
                  setSkillPickerVisible(true);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8, flexWrap: 'wrap', gap: 4 }}>
                  <Award size={16} color={editForm.primarySkill ? (colors.accent || '#0F766E') : (isDark ? '#71717A' : '#94a3b8')} style={{ marginRight: 4 }} />
                  {parseSkillsList(editForm.primarySkill).length > 0 ? (
                    parseSkillsList(editForm.primarySkill).map((sk, idx) => (
                      <View key={idx} style={{ backgroundColor: isDark ? 'rgba(56, 189, 248, 0.15)' : '#F0FDF4', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: isDark ? 'rgba(56, 189, 248, 0.3)' : '#BBF7D0' }}>
                        <Text style={{ fontSize: 12, color: isDark ? '#38BDF8' : '#166534', fontWeight: '700' }}>{sk}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={{ fontSize: 15, color: isDark ? '#71717A' : '#94a3b8' }}>Select Primary Skills</Text>
                  )}
                </View>
                <ChevronRight size={18} color={isDark ? '#71717A' : '#94a3b8'} />
              </TouchableOpacity>
            </View>

            {/* Secondary Skill */}
            <View style={styles.inputGroup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Secondary Skill</Text>
                {editForm.secondarySkill ? (
                  <TouchableOpacity onPress={() => setEditForm({ ...editForm, secondarySkill: '' })}>
                    <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '600' }}>Clear</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity 
                style={[styles.input, { justifyContent: 'space-between', flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => {
                  setActiveSkillField('secondarySkill');
                  setSkillSearchText('');
                  setSelectedCategoryTab('all');
                  setCustomSkillInput('');
                  setSkillPickerVisible(true);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8, flexWrap: 'wrap', gap: 4 }}>
                  <Sparkles size={16} color={editForm.secondarySkill ? (colors.accent || '#4338CA') : (isDark ? '#71717A' : '#94a3b8')} style={{ marginRight: 4 }} />
                  {parseSkillsList(editForm.secondarySkill).length > 0 ? (
                    parseSkillsList(editForm.secondarySkill).map((sk, idx) => (
                      <View key={idx} style={{ backgroundColor: isDark ? 'rgba(192, 132, 252, 0.15)' : '#F5F3FF', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: isDark ? 'rgba(192, 132, 252, 0.3)' : '#DDD6FE' }}>
                        <Text style={{ fontSize: 12, color: isDark ? '#C084FC' : '#4338ca', fontWeight: '700' }}>{sk}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={{ fontSize: 15, color: isDark ? '#71717A' : '#94a3b8' }}>Select Secondary Skills</Text>
                  )}
                </View>
                <ChevronRight size={18} color={isDark ? '#71717A' : '#94a3b8'} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('profile.phoneManagedByAuth')}</Text>
              <TextInput 
                style={[styles.input, { backgroundColor: isDark ? '#18181B' : '#f1f5f9', borderColor: colors.border, color: colors.textSecondary }]}
                value={user?.phoneNumber || ''}
                editable={false}
              />
            </View>

            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('profile.city')}</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  value={editForm.city}
                  onChangeText={(t) => setEditForm({...editForm, city: t})}
                  placeholder={t('profile.city')}
                  placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 10 }]}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('profile.state')}</Text>
                <TextInput 
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                  value={editForm.mailingState}
                  onChangeText={(t) => setEditForm({...editForm, mailingState: t})}
                  placeholder={t('profile.state')}
                  placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{t('profile.streetAddress')}</Text>
              <TextInput 
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={editForm.mailingStreet}
                onChangeText={(t) => setEditForm({...editForm, mailingStreet: t})}
                placeholder={t('profile.streetAddress')}
                placeholderTextColor={isDark ? '#71717A' : '#94A3B8'}
                multiline
              />
            </View>

            <TouchableOpacity 
              style={[styles.saveBtn, { backgroundColor: colors.accent || (isDark ? '#38BDF8' : '#0F766E') }, updating && { opacity: 0.7 }]} 
              onPress={handleUpdateProfile}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveBtnText}>{t('profile.updateProfileBtn')}</Text>
              )}
            </TouchableOpacity>
            
            <View style={{ height: 60 }} />
          </ScrollView>

          <DateTimePickerModal
            isVisible={isDatePickerVisible}
            mode="date"
            onConfirm={handleConfirmDate}
            onCancel={() => setDatePickerVisibility(false)}
            date={
              activeDateField && editForm[activeDateField] 
              ? new Date(editForm[activeDateField]) 
              : new Date()
            }
            maximumDate={new Date()}
          />

          {/* Skill Picker Modal */}
          <Modal
            visible={skillPickerVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setSkillPickerVisible(false)}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
            >
              <View style={{ width: '100%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: skillSearchText.trim().length > 0 ? '90%' : '78%', paddingBottom: 24 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {activeSkillField === 'primarySkill' ? (
                      <Award size={20} color={colors.accent || (isDark ? '#38BDF8' : '#0F766E')} style={{ marginRight: 8 }} />
                    ) : (
                      <Sparkles size={20} color={colors.accent || (isDark ? '#C084FC' : '#4338CA')} style={{ marginRight: 8 }} />
                    )}
                    <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>
                      {activeSkillField === 'primarySkill' ? 'Select Primary Skill' : 'Select Secondary Skill'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setSkillPickerVisible(false)} style={{ backgroundColor: colors.accent || (isDark ? '#38BDF8' : '#1a2d5a'), paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14 }}>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>Done</Text>
                  </TouchableOpacity>
                </View>

                {/* Category Tabs - hide when searching to give full height to search results */}
                {!skillSearchText.trim() && (
                  <View style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                      <TouchableOpacity
                        style={[
                          styles.catTab,
                          { backgroundColor: isDark ? '#1F1F23' : '#f1f5f9' },
                          selectedCategoryTab === 'all' && { backgroundColor: colors.accent || (isDark ? '#38BDF8' : '#0F766E') }
                        ]}
                        onPress={() => setSelectedCategoryTab('all')}
                      >
                        <Text style={[styles.catTabTxt, { color: selectedCategoryTab === 'all' ? '#FFFFFF' : colors.textSecondary }]}>All Skills</Text>
                      </TouchableOpacity>
                      {CHURCH_SKILL_CATEGORIES.map(cat => (
                        <TouchableOpacity
                          key={cat.id}
                          style={[
                            styles.catTab,
                            { backgroundColor: isDark ? '#1F1F23' : '#f1f5f9' },
                            selectedCategoryTab === cat.id && { backgroundColor: colors.accent || (isDark ? '#38BDF8' : '#0F766E') }
                          ]}
                          onPress={() => setSelectedCategoryTab(cat.id)}
                        >
                          <Text style={[styles.catTabTxt, { color: selectedCategoryTab === cat.id ? '#FFFFFF' : colors.textSecondary }]}>{cat.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Search Input */}
                <View style={{ paddingHorizontal: 16, marginTop: skillSearchText.trim() ? 8 : 0, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#18181B' : '#f1f5f9', borderRadius: 10, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: colors.border }}>
                    <Search size={16} color={isDark ? '#71717A' : '#94a3b8'} style={{ marginRight: 8 }} />
                    <TextInput
                      placeholder="Search skill..."
                      placeholderTextColor={isDark ? '#71717A' : '#94a3b8'}
                      value={skillSearchText}
                      onChangeText={setSkillSearchText}
                      style={{ flex: 1, fontSize: 13, color: colors.text }}
                    />
                    {skillSearchText ? (
                      <TouchableOpacity onPress={() => setSkillSearchText('')}>
                        <X size={14} color={isDark ? '#71717A' : '#94a3b8'} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>

                {/* Skills List */}
                <ScrollView style={{ paddingHorizontal: 16, flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={true} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                  {filteredSkillList.map((skill) => {
                    const currentSelected = activeSkillField ? parseSkillsList(editForm[activeSkillField]) : [];
                    const isSelected = currentSelected.includes(skill);
                    return (
                      <TouchableOpacity
                        key={skill}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          paddingVertical: 12,
                          paddingHorizontal: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                          backgroundColor: isSelected ? (isDark ? '#27272A' : '#eff6ff') : 'transparent',
                          borderRadius: 8
                        }}
                        onPress={() => {
                          if (activeSkillField) {
                            const exists = currentSelected.includes(skill);
                            const updated = exists
                              ? currentSelected.filter(s => s !== skill)
                              : [...currentSelected, skill];
                            setEditForm(prev => ({ ...prev, [activeSkillField]: updated.join(', ') }));
                          }
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: isSelected ? '700' : '500', color: isSelected ? (colors.accent || (isDark ? '#38BDF8' : '#1a2d5a')) : colors.text }}>
                          {skill}
                        </Text>
                        {isSelected && <Check size={18} color={colors.accent || (isDark ? '#38BDF8' : '#1a2d5a')} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Custom Skill Input */}
                <View style={{ paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: 6, textTransform: 'uppercase' }}>
                    Or Add Custom Skill
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput
                      style={{ flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, height: 42, color: colors.text, backgroundColor: isDark ? '#18181B' : '#FFFFFF', fontSize: 13 }}
                      placeholder="Type custom skill..."
                      placeholderTextColor={isDark ? '#71717A' : '#94a3b8'}
                      value={customSkillInput}
                      onChangeText={setCustomSkillInput}
                    />
                    <TouchableOpacity
                      style={{ backgroundColor: colors.accent || (isDark ? '#38BDF8' : '#0F766E'), paddingHorizontal: 14, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}
                      onPress={() => {
                        if (customSkillInput.trim() && activeSkillField) {
                          const trimmed = customSkillInput.trim();
                          const current = parseSkillsList(editForm[activeSkillField]);
                          if (!current.includes(trimmed)) {
                            setEditForm(prev => ({ ...prev, [activeSkillField]: [...current, trimmed].join(', ') }));
                          }
                          setCustomSkillInput('');
                        }
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Apply</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        </SafeAreaView>
      </Modal>

      {/* ── Language Selection Modal ── */}
      {isLanguageModalVisible && (
        <View style={styles.modalOverlay}>
          <View style={[styles.bottomSheetContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('profile.selectLanguage')}</Text>
              <TouchableOpacity onPress={() => setIsLanguageModalVisible(false)}>
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false} bounces={false}>
              <View style={styles.langList}>
                {languages.map((lang) => (
                  <TouchableOpacity 
                    key={lang.code}
                    style={[
                      styles.langItem,
                      { backgroundColor: isDark ? '#18181B' : '#f8fafc', borderColor: colors.border },
                      language === lang.code && { backgroundColor: isDark ? '#27272A' : '#eff6ff', borderColor: colors.accent || '#0F766E' }
                    ]}
                    onPress={() => {
                      setLanguage(lang.code);
                      setTimeout(() => setIsLanguageModalVisible(false), 200);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={[
                        { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
                        language === lang.code
                          ? { backgroundColor: colors.accent || '#0F766E' }
                          : { backgroundColor: isDark ? '#27272A' : '#f1f5f9' }
                      ]}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: language === lang.code ? '#fff' : colors.textSecondary }}>
                          {lang.nativeName.charAt(0)}
                        </Text>
                      </View>
                      <View>
                        <Text style={[
                          styles.langName,
                          { color: colors.text },
                          language === lang.code && { color: colors.accent || '#0F766E' }
                        ]}>{lang.nativeName}</Text>
                        <Text style={[styles.langNative, { color: colors.textSecondary }]}>{lang.name}</Text>
                      </View>
                    </View>
                    {language === lang.code && (
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent || '#0F766E', justifyContent: 'center', alignItems: 'center' }}>
                        <Check size={14} color="#fff" />
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      )}

      {/* ── Notification Preferences Modal ── */}
      {isNotifyModalVisible && (
        <View style={styles.modalOverlay}>
          <View style={[styles.bottomSheetContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>{t('profile.notifications')}</Text>
              <TouchableOpacity onPress={() => setIsNotifyModalVisible(false)}>
                <X size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.notifyList}>
              <View style={styles.notifyItem}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notifyName, { color: colors.text }]}>{t('profile.dailyPromiseNotif')}</Text>
                  <Text style={[styles.notifyDesc, { color: colors.textSecondary }]}>{t('profile.dailyPromiseNotifDesc')}</Text>
                </View>
                <Switch 
                  value={dailyPromiseNotify} 
                  onValueChange={setDailyPromiseNotify}
                  trackColor={{ false: isDark ? '#3F3F46' : '#e2e8f0', true: colors.accent || '#0F766E' }}
                />
              </View>

              <View style={styles.notifyItem}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notifyName, { color: colors.text }]}>{t('profile.newSermonsNotif')}</Text>
                  <Text style={[styles.notifyDesc, { color: colors.textSecondary }]}>{t('profile.newSermonsNotifDesc')}</Text>
                </View>
                <Switch 
                  value={newSermonNotify} 
                  onValueChange={setNewSermonNotify}
                  trackColor={{ false: isDark ? '#3F3F46' : '#e2e8f0', true: colors.accent || '#0F766E' }}
                />
              </View>

              <View style={styles.notifyItem}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notifyName, { color: colors.text }]}>{t('profile.eventsNotif')}</Text>
                  <Text style={[styles.notifyDesc, { color: colors.textSecondary }]}>{t('profile.eventsNotifDesc')}</Text>
                </View>
                <Switch 
                  value={eventReminderNotify} 
                  onValueChange={setEventReminderNotify}
                  trackColor={{ false: isDark ? '#3F3F46' : '#e2e8f0', true: colors.accent || '#0F766E' }}
                />
              </View>

              <View style={styles.notifyItem}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.notifyName, { color: colors.text }]}>{t('profile.prayerNotif')}</Text>
                  <Text style={[styles.notifyDesc, { color: colors.textSecondary }]}>{t('profile.prayerNotifDesc')}</Text>
                </View>
                <Switch 
                  value={prayerNotify} 
                  onValueChange={setPrayerNotify}
                  trackColor={{ false: isDark ? '#3F3F46' : '#e2e8f0', true: colors.accent || '#0F766E' }}
                />
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Success Modal */}
      <Modal visible={successModalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 32, width: '100%', alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#dcfce7', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <CheckCircle2 size={32} color="#16a34a" />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#1e293b', marginBottom: 8 }}>{t('profile.successTitle')}</Text>
            <Text style={{ fontSize: 15, color: '#64748b', textAlign: 'center', marginBottom: 24, lineHeight: 22 }}>
              {successMessage}
            </Text>
            <TouchableOpacity 
              style={{ backgroundColor: '#1a2d5a', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 24, width: '100%', alignItems: 'center' }}
              onPress={() => setSuccessModalVisible(false)}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{t('common.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Info / Coming Soon Modal */}
      <Modal visible={infoModalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 32, width: '100%', alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <HelpCircle size={32} color="#0284c7" />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#1e293b', marginBottom: 8 }}>Coming Soon!</Text>
            <Text style={{ fontSize: 15, color: '#64748b', textAlign: 'center', marginBottom: 24, lineHeight: 22 }}>
              {infoMessage}
            </Text>
            <TouchableOpacity 
              style={{ backgroundColor: '#0284c7', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 24, width: '100%', alignItems: 'center' }}
              onPress={() => setInfoModalVisible(false)}
            >
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{t('common.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Confirm Modal */}
      <Modal visible={confirmModalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 24, padding: 32, width: '100%', alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20 }}>
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: confirmConfig.isDestructive ? '#fee2e2' : '#e0e7ff', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <HelpCircle size={32} color={confirmConfig.isDestructive ? '#ef4444' : '#4f46e5'} />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#1e293b', marginBottom: 8 }}>{confirmConfig.title}</Text>
            <Text style={{ fontSize: 15, color: '#64748b', textAlign: 'center', marginBottom: 28, lineHeight: 22 }}>
              {confirmConfig.message}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: '100%' }}>
              <TouchableOpacity 
                style={{ flex: 1, backgroundColor: '#f1f5f9', paddingVertical: 14, borderRadius: 24, alignItems: 'center' }}
                onPress={() => setConfirmModalVisible(false)}
                disabled={updating}
              >
                <Text style={{ color: '#64748b', fontSize: 15, fontWeight: '700' }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={{ flex: 1, backgroundColor: confirmConfig.isDestructive ? '#ef4444' : '#1a2d5a', paddingVertical: 14, borderRadius: 24, alignItems: 'center' }}
                onPress={() => confirmConfig.onConfirm()}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{confirmConfig.isDestructive ? t('common.delete') : t('common.confirm')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </>
      )}
    </View>
  );
}

function MenuItem({ icon, title, sub, value, onPress, textColor, subColor }: any) {
  return (
    <TouchableOpacity 
      style={styles.igRow} 
      onPress={onPress}
      activeOpacity={0.65}
    >
      <View style={styles.igIconWrap}>
        {icon}
      </View>
      <View style={styles.igContentWrap}>
        <Text style={[styles.igTitle, { color: textColor || '#0F172A' }]}>{title}</Text>
        {sub ? <Text style={[styles.igSub, { color: subColor || '#64748B' }]}>{sub}</Text> : null}
      </View>
      {value ? (
        <Text style={[styles.igValue, { color: subColor || '#64748B' }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      <ChevronRight size={18} color={subColor || '#94A3B8'} strokeWidth={1.8} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Hero Section - Normal flat bottom (no U shape)
  heroSection: { 
    backgroundColor: 'transparent', 
    paddingTop: Platform.OS === 'ios' ? 60 : (StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 45), 
    paddingBottom: 44,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    alignItems: 'center'
  },
  // All Buttons Card - "n-shaped" card with rounded top corners overlapping top card (no top line)
  buttonsCard: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -24,
    paddingTop: 14,
    paddingBottom: 20,
    overflow: 'hidden',
    zIndex: 2,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, alignItems: 'center', alignSelf: 'stretch' },
  themeToggle: { backgroundColor: 'rgba(255,255,255,0.15)', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  themeToggleText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  avatarContainer: { alignItems: 'center', marginTop: 0 },
  avatarCircle: { 
    width: 90, height: 90, borderRadius: 45, backgroundColor: '#c0392b', 
    justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#e0c88a'
  },
  avatarImg: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#e0c88a' },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  verifiedBadge: { 
    position: 'absolute', 
    bottom: 0, 
    right: -5, 
    backgroundColor: '#FCD34D', 
    width: 24, 
    height: 24, 
    borderRadius: 12, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 2, 
    borderColor: '#1a2d5a',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 3
  },

  userInfo: { alignItems: 'center', marginTop: 15 },
  userName: { fontSize: 20, fontWeight: '800', color: '#fff' },
  userSub: { fontSize: 12, color: '#aac4e8', marginTop: 4 },
  
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 15 },
  badge: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  badgeActive: { backgroundColor: 'rgba(252,211,77,0.2)' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 20,
    width: '100%'
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  statIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8
  },
  statTextCol: {
    justifyContent: 'center',
    flex: 1
  },
  statLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 2
  },
  statValue: {
    color: '#cbd5e1',
    fontSize: 9,
    fontWeight: '500'
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 10
  },

  scrollContent: { paddingBottom: 150 },

  // Menu List - Instagram Style (Flat, Borderless, Group Divider Bands)
  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.8, marginHorizontal: 25, marginTop: 25, marginBottom: 12 },
  igSection: {
    paddingVertical: 6,
  },
  igSectionHeader: {
    fontSize: 13.5,
    fontWeight: '700',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 6,
    letterSpacing: -0.1,
  },
  igSectionDividerBand: {
    height: 8,
    width: '100%',
  },
  igRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  igIconWrap: {
    width: 26,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  igContentWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  igTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  igSub: {
    fontSize: 12,
    marginTop: 2,
    letterSpacing: -0.1,
  },
  igValue: {
    fontSize: 14,
    marginRight: 8,
    fontWeight: '400',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 100,
    alignSelf: 'center',
    marginTop: 32,
    marginBottom: 20,
    borderWidth: 1,
  },

  // Modal
  modalOverlay: { 
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)', 
    justifyContent: 'flex-end', 
    zIndex: 1000 
  },
  modalContent: { 
    backgroundColor: '#fff', 
    borderTopLeftRadius: 30, 
    borderTopRightRadius: 30, 
    height: '85%',
    padding: 24, 
    zIndex: 1001,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10
  },
  bottomSheetContent: {
    backgroundColor: '#fff', 
    borderTopLeftRadius: 30, 
    borderTopRightRadius: 30, 
    padding: 24, 
    paddingBottom: 120, // Keep this high to clear the tab bar
    zIndex: 1001,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1a2d5a' },
  closeText: { color: '#ef4444', fontWeight: '700' },
  modalScroll: { flex: 1 },
  
  photoEditSection: { alignItems: 'center', marginBottom: 30, backgroundColor: '#f8fafc', padding: 20, borderRadius: 20, borderStyle: 'dashed', borderWidth: 1, borderColor: '#cbd5e1' },
  modalAvatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#c0392b', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  modalAvatarImg: { width: 80, height: 80, borderRadius: 40 },
  modalAvatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  changePhotoBtn: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#1a2d5a' },
  changePhotoText: { color: '#1a2d5a', fontSize: 12, fontWeight: '700' },
  removePhotoBtn: { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#ef4444' },
  removePhotoText: { color: '#ef4444', fontSize: 12, fontWeight: '700' },

  inputGroup: { marginBottom: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 8, marginLeft: 4 },
  input: { 
    backgroundColor: '#f8fafc', 
    borderWidth: 1.5, 
    borderColor: '#e2e8f0', 
    borderRadius: 15, 
    padding: 15, 
    fontSize: 15, 
    color: '#1e293b' 
  },
  saveBtn: { 
    backgroundColor: '#1a2d5a', 
    padding: 18, 
    borderRadius: 15, 
    alignItems: 'center', 
    marginTop: 10,
    marginBottom: 40,
    elevation: 4,
    shadowColor: '#1a2d5a',
    shadowOpacity: 0.3,
    shadowRadius: 10
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  versionTxt: { textAlign: 'center', fontSize: 11, color: '#cbd5e1', marginTop: 40 },

  // Language Modal
  langList: { gap: 6 },
  langItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingVertical: 10,
    paddingHorizontal: 14, 
    borderRadius: 12, 
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#e2e8f0'
  },
  langItemActive: { 
    backgroundColor: '#eff6ff', 
    borderColor: '#1a2d5a' 
  },
  langName: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  langTextActive: { color: '#1a2d5a' },
  langNative: { fontSize: 11, color: '#64748b', marginTop: 1 },

  // Notification Modal
  notifyList: { gap: 16 },
  notifyItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingVertical: 8 
  },
  notifyName: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  notifyDesc: { fontSize: 12, color: '#64748b', marginTop: 2 },

  catTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
  },
  catTabActive: {
    backgroundColor: '#1a2d5a',
  },
  catTabTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  catTabTxtActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
