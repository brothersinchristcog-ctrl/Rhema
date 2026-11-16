import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  BackHandler,
  Platform,
  Image,
  Modal,
  Alert,
  KeyboardAvoidingView,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Defs,
  Rect,
  RadialGradient as SvgRadialGradient,
  Stop,
  Path,
} from 'react-native-svg';
import * as DocumentPicker from 'expo-document-picker';
import firestore from '@react-native-firebase/firestore';
import {
  Briefcase,
  Search,
  CheckCircle2,
  Clock,
  MapPin,
  Send,
  X,
  User,
  Upload,
  FileText,
  Trash2,
  Bell,
  ChevronRight,
  Compass,
} from 'lucide-react-native';
import { RHEMA_LOGO_PATH, RHEMA_LOGO_VIEWBOX } from '../auth/rhemaLogoPath';
import { useAuth } from '../../context/AuthContext';
import { useChurch } from '../../context/ChurchContext';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../theme/Theme';
import JobCircleService from '../../services/JobCircleService';
import FirestoreService from '../../services/FirestoreService';
import { JobOpportunity, AttachmentInfo } from '../../types/jobCircle';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;

interface JobCircleScreenProps {
  navigation: any;
  route?: {
    params?: {
      skipSplash?: boolean;
      initialTab?: string;
      applicationId?: string;
      opportunityId?: string;
    };
  };
}

export default function JobCircleScreen({ navigation, route }: JobCircleScreenProps) {
  const insets = useSafeAreaInsets();
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const { colors, isDark } = useTheme();

  // Responsive dynamic colors (following Rhema Navy Blue & MD3 Theme)
  const screenBg = isDark ? '#000000' : (colors.background || '#FAF7F2');
  const cardSurface = isDark ? '#141416' : (colors.surface || '#FFFFFF');
  const cardBorder = isDark ? '#262629' : (colors.border || '#E2E8F0');
  const primaryText = isDark ? '#FFFFFF' : (colors.text || '#0F172A');
  const secondaryText = isDark ? '#94A3B8' : (colors.textSecondary || '#64748B');

  const churchId = activeChurch?.id || 'rhema';

  // Screen View State: Splash Screen vs Main Opportunities Screen
  // If navigated directly with skipSplash or application deep link, skip splash
  const [showSplash, setShowSplash] = useState<boolean>(!route?.params?.skipSplash && !route?.params?.applicationId);
  const bgFade = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [opportunities, setOpportunities] = useState<JobOpportunity[]>([]);
  const [creatorProfiles, setCreatorProfiles] = useState<{ [uid: string]: { name: string; photo?: string } }>({});
  const [expandedDescIds, setExpandedDescIds] = useState<{ [key: string]: boolean }>({});
  const [appliedOppIds, setAppliedOppIds] = useState<string[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Carousel Active Index
  const [activeCarouselIdx, setActiveCarouselIdx] = useState(0);

  // Direct Apply Modal State
  const [selectedOppForApply, setSelectedOppForApply] = useState<JobOpportunity | null>(null);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string; mimeType?: string; size?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Splash Screen Fade & Auto-Transition
  useEffect(() => {
    if (!showSplash) return;

    Animated.parallel([
      Animated.timing(bgFade, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(contentFade, {
        toValue: 1,
        duration: 650,
        delay: 120,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1800);

    return () => clearTimeout(timer);
  }, [showSplash, bgFade, contentFade]);

  // Android hardware back handler: maintain proper back navigation to Member Dashboard
  useEffect(() => {
    const onBackPress = () => {
      if (selectedOppForApply) {
        setSelectedOppForApply(null);
        return true;
      }
      if (navigation.canGoBack()) {
        navigation.goBack();
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [navigation, selectedOppForApply]);

  useEffect(() => {
    loadAllOpportunities();
    loadAppliedStatus();
  }, [churchId]);

  // Listen to Job Circle notifications to display real-time unread badge
  useEffect(() => {
    if (!churchId) return;
    try {
      const unsub = firestore()
        .collection('Rhema Church')
        .doc(churchId)
        .collection('notifications')
        .where('read', '==', false)
        .onSnapshot(snap => {
          if (snap) {
            const count = snap.docs.filter(doc => {
              const d = doc.data();
              return (
                d.type === 'job_opportunity_new' ||
                d.type === 'job_application_admin' ||
                d.type === 'job_application_member' ||
                d.opportunityId ||
                d.applicationId ||
                d.referenceType === 'job_circle_opportunity' ||
                d.referenceType === 'job_circle_application'
              );
            }).length;
            setUnreadNotifCount(count);
          }
        }, err => {
          console.warn('[JobCircleScreen] notifications listener error:', err?.message || err);
        });

      return () => unsub();
    } catch (e) {
      console.warn('[JobCircleScreen] notifications listener caught error:', e);
    }
  }, [churchId]);

  const loadAppliedStatus = async () => {
    if (!user?.uid) return;
    try {
      const myApps = await JobCircleService.getMyApplications(churchId, user.uid);
      const activeIds = myApps
        .filter(a => a.status !== 'withdrawn' && a.status !== 'rejected')
        .map(a => a.opportunityId);
      setAppliedOppIds(activeIds);
    } catch (e) {
      console.warn('Error loading applied opportunities:', e);
    }
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const maxSizeBytes = 25 * 1024 * 1024; // 25MB limit
        if (file.size && file.size > maxSizeBytes) {
          Alert.alert('File Too Large', 'Please select a resume file smaller than 25MB.');
          return;
        }
        setSelectedFile({
          uri: file.uri,
          name: file.name,
          mimeType: file.mimeType || 'application/pdf',
          size: file.size,
        });
      }
    } catch (err) {
      console.warn('Document picker error:', err);
      Alert.alert('Error', 'Unable to pick document. Please try again.');
    }
  };

  const handleSubmitApplication = async () => {
    if (!user?.uid || !selectedOppForApply) return;

    try {
      setSubmitting(true);
      let resumeAttachment: AttachmentInfo | undefined = undefined;

      if (selectedFile) {
        resumeAttachment = await JobCircleService.uploadAttachment(
          churchId,
          user.uid,
          selectedFile.uri,
          selectedFile.name,
          selectedFile.mimeType
        );
      }

      await JobCircleService.applyForOpportunity(
        churchId,
        selectedOppForApply,
        {
          id: user.uid,
          name: member?.name || user.displayName || 'Church Member',
          phone: member?.phone || user.phoneNumber || '',
          email: member?.email || user.email || '',
        },
        {
          applicationMessage: applicationMessage.trim(),
          resumeAttachment,
        }
      );

      setAppliedOppIds(prev => [...prev, selectedOppForApply.id]);
      setSelectedOppForApply(null);
      setApplicationMessage('');
      setSelectedFile(null);
      Alert.alert('Application Submitted', 'Your ministry application has been received! Church ministry leaders will prayerfully review your calling.');
    } catch (err: any) {
      console.error('Submit application error:', err);
      Alert.alert('Submission Error', err.message || 'Could not submit application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleDescExpand = (oppId: string) => {
    setExpandedDescIds(prev => ({ ...prev, [oppId]: !prev[oppId] }));
  };

  const formatPostedDate = (createdAt: any): string => {
    if (!createdAt) return 'Recently posted';
    try {
      const ms = createdAt.toMillis ? createdAt.toMillis() : (createdAt.seconds ? createdAt.seconds * 1000 : new Date(createdAt).getTime());
      if (!ms || isNaN(ms)) return 'Recently posted';
      const diffSecs = Math.floor((Date.now() - ms) / 1000);
      if (diffSecs < 60) return 'Just now';
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
      return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    } catch {
      return 'Recently posted';
    }
  };

  const loadAllOpportunities = async () => {
    try {
      setLoading(true);
      // Fetch approved opportunities dynamically from Firebase
      const opps = await JobCircleService.getOpportunities(churchId, { onlyApproved: true });
      setOpportunities(opps);

      // Fetch creator member profiles to display actual poster name and profile picture
      const creatorUids = Array.from(new Set(opps.map(o => o.createdById).filter(Boolean)));
      if (creatorUids.length > 0) {
        const profileEntries: { [uid: string]: { name: string; photo?: string } } = {};
        await Promise.all(
          creatorUids.map(async uid => {
            try {
              const mem = await FirestoreService.getMemberProfile(churchId, uid);
              if (mem) {
                const photo =
                  (mem as any).profilePhoto ||
                  (mem as any).photoURL ||
                  (mem as any).photoUrl ||
                  (mem as any).profileImageUrl ||
                  '';
                profileEntries[uid] = {
                  name: mem.name || (mem as any).fullName || 'Church Leader',
                  photo: photo || undefined,
                };
              }
            } catch (e) {
              console.warn('Could not fetch creator profile:', e);
            }
          })
        );
        setCreatorProfiles(profileEntries);
      }
    } catch (err) {
      console.error('Error loading Job Circle opportunities:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadAllOpportunities();
    loadAppliedStatus();
  };

  // Search query filters by title, role/category, requiredSkills, and location
  const filteredOpportunities = opportunities.filter(opp => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;

    const matchesTitle = opp.title?.toLowerCase().includes(q);
    const matchesCategory = opp.categoryName?.toLowerCase().includes(q);
    const matchesLocation = opp.location?.toLowerCase().includes(q);
    const matchesDescription = opp.description?.toLowerCase().includes(q);
    const matchesSkills = Array.isArray(opp.requiredSkills) && opp.requiredSkills.some(s => s.toLowerCase().includes(q));

    return matchesTitle || matchesCategory || matchesLocation || matchesDescription || matchesSkills;
  });

  // User Profile Photo
  const memberPhotoUrl =
    (member as any)?.profilePhoto ||
    (member as any)?.photoURL ||
    (member as any)?.photoUrl ||
    (member as any)?.profileImageUrl ||
    user?.photoURL ||
    '';
  const memberDisplayName = member?.name || (member as any)?.fullName || user?.displayName || 'Member';

  // Navigation Handlers
  const handleOpenProfile = () => {
    try {
      navigation.navigate('Tabs', { screen: 'Profile' });
    } catch (e) {
      console.warn('Profile navigation error:', e);
    }
  };

  const handleOpenNotifications = () => {
    try {
      navigation.navigate('Updates', {
        filterCategory: 'job_circle',
        filterTitle: 'Job Circle Notifications',
        highlightType: 'job_circle',
      });
    } catch (e) {
      console.warn('Updates navigation error:', e);
    }
  };

  // Carousel Scroll Handler
  const onCarouselScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (CARD_WIDTH + 16));
    if (index >= 0 && index !== activeCarouselIdx) {
      setActiveCarouselIdx(index);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // RENDER: MINISTRY OPPORTUNITY CARD
  // ─────────────────────────────────────────────────────────────
  const renderOpportunityCard = (opp: JobOpportunity, isCarousel: boolean = false) => {
    const isPaid = opp.compensationType !== 'unpaid';
    const isExpanded = !!expandedDescIds[opp.id];
    const postedTimeAgo = formatPostedDate(opp.createdAt);
    const hasLongDesc = (opp.description || '').length > 130;

    // Poster name & photo
    const creatorInfo = creatorProfiles[opp.createdById];
    const posterName = creatorInfo?.name || opp.createdByName || '';
    const posterPhoto = creatorInfo?.photo || opp.createdByPhoto || '';
    const posterRole = opp.createdByRole && opp.createdByRole !== 'Ministry Coordinator' ? opp.createdByRole : '';
    const isApplied = appliedOppIds.includes(opp.id);

    return (
      <View
        key={opp.id}
        style={[
          styles.oppCard,
          isCarousel && { width: CARD_WIDTH, marginRight: 16 },
          {
            backgroundColor: cardSurface,
            borderColor: cardBorder,
          },
        ]}
      >
        {/* ── TOP SECTION: Posted-by member profile picture, name, posted date/time ── */}
        <View style={styles.cardHeaderRow}>
          {posterPhoto ? (
            <Image source={{ uri: posterPhoto }} style={styles.posterAvatar} resizeMode="cover" />
          ) : (
            <View style={[styles.posterAvatarPlaceholder, { backgroundColor: isDark ? '#1E3A8A' : '#DBEAFE' }]}>
              <User size={20} color={isDark ? '#93C5FD' : '#1E40AF'} />
            </View>
          )}

          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.posterNameText, { color: primaryText }]} numberOfLines={1}>
                {posterName || 'Rhema Ministries'}
              </Text>
              <CheckCircle2 size={13} color="#2563EB" />
            </View>
            <Text style={[styles.posterSubtitleText, { color: secondaryText }]} numberOfLines={1}>
              {posterRole ? `${posterRole} • ${postedTimeAgo}` : postedTimeAgo}
            </Text>
          </View>

          <View style={[styles.typeBadge, { backgroundColor: isPaid ? (isDark ? '#F59E0B25' : '#FEF3C7') : (isDark ? '#10B98125' : '#ECFDF5') }]}>
            <Text style={[styles.typeBadgeTxt, { color: isPaid ? (isDark ? '#FBBF24' : '#B45309') : (isDark ? '#34D399' : '#047857') }]}>
              {opp.opportunityType.replace(/_/g, ' ').toUpperCase()}
            </Text>
          </View>
        </View>

        {/* ── IMAGE SECTION: Admin thumbnail/banner image maintaining aspect ratio ── */}
        <TouchableOpacity
          onPress={() => navigation.navigate('OpportunityDetailScreen', { opportunity: opp })}
          activeOpacity={0.92}
          style={styles.cardBannerWrap}
        >
          {opp.thumbnailUrl ? (
            <Image
              source={{ uri: opp.thumbnailUrl }}
              style={styles.cardBannerImg}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.defaultBannerPlaceholder, { backgroundColor: isDark ? '#182234' : '#0F172A' }]}>
              <View style={styles.placeholderWatermark}>
                <Compass size={84} color="rgba(255,255,255,0.06)" />
              </View>
              <View style={styles.placeholderContent}>
                <View style={styles.placeholderChurchTag}>
                  <Text style={styles.placeholderChurchTagTxt}>RHEMA MINISTRIES</Text>
                </View>
                <Text style={styles.placeholderTitle} numberOfLines={2}>
                  {opp.title}
                </Text>
                <Text style={styles.placeholderSub}>
                  {opp.categoryName || 'Ministry Role'} • {opp.location || 'Main Campus'}
                </Text>
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* ── OPPORTUNITY DETAILS: Ministry position title, Role / Ministry name, Location ── */}
        <View style={styles.cardDetailsBox}>
          <Text style={[styles.cardTitleText, { color: primaryText }]} numberOfLines={2}>
            {opp.title}
          </Text>

          <View style={styles.cardMetadataRow}>
            <View style={styles.metaItem}>
              <Briefcase size={14} color={isDark ? '#60A5FA' : '#1D4ED8'} />
              <Text style={[styles.metaItemTxt, { color: secondaryText }]} numberOfLines={1}>
                {opp.categoryName || opp.title}
              </Text>
            </View>

            <View style={styles.metaItem}>
              <MapPin size={14} color={isDark ? '#60A5FA' : '#1D4ED8'} />
              <Text style={[styles.metaItemTxt, { color: secondaryText }]} numberOfLines={1}>
                {opp.location || 'Rhema Main Campus'}
              </Text>
            </View>
          </View>

          {/* Schedule / Time commitment if available */}
          {opp.timeCommitment ? (
            <View style={[styles.metaItem, { marginTop: 4 }]}>
              <Clock size={14} color={secondaryText} />
              <Text style={[styles.metaItemTxt, { color: secondaryText }]} numberOfLines={1}>
                {opp.timeCommitment}
              </Text>
            </View>
          ) : null}

          {/* Description */}
          {opp.description ? (
            <View style={{ marginTop: 8 }}>
              <Text
                style={[styles.descText, { color: primaryText }]}
                numberOfLines={isExpanded ? undefined : 2}
              >
                {opp.description}
              </Text>
              {hasLongDesc && (
                <TouchableOpacity onPress={() => toggleDescExpand(opp.id)} style={{ alignSelf: 'flex-start', marginTop: 3 }}>
                  <Text style={{ color: isDark ? '#60A5FA' : '#1D4ED8', fontWeight: '700', fontSize: 12.5 }}>
                    {isExpanded ? 'Show less' : '...more'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>

        {/* ── BOTTOM ACTION BUTTONS: Apply Now or Status ── */}
        <View style={styles.cardBottomRow}>
          <TouchableOpacity
            style={[styles.detailsLinkBtn, { borderColor: cardBorder }]}
            onPress={() => navigation.navigate('OpportunityDetailScreen', { opportunity: opp })}
            activeOpacity={0.8}
          >
            <Text style={[styles.detailsLinkTxt, { color: isDark ? '#E4E4E7' : '#334155' }]}>
              View Details
            </Text>
            <ChevronRight size={15} color={secondaryText} />
          </TouchableOpacity>

          {isApplied ? (
            <View
              style={[
                styles.appliedStatusPill,
                {
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                  borderColor: isDark ? '#065F46' : '#A7F3D0',
                },
              ]}
            >
              <CheckCircle2 size={16} color="#059669" />
              <Text style={[styles.appliedStatusTxt, { color: isDark ? '#34D399' : '#047857' }]}>
                Applied
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.applyPrimaryBtn, { backgroundColor: isDark ? '#FFFFFF' : '#1a2d5a' }]}
              onPress={() => setSelectedOppForApply(opp)}
              activeOpacity={0.85}
            >
              <Send size={14} color={isDark ? '#000000' : '#FFFFFF'} />
              <Text style={[styles.applyPrimaryTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                Apply Now
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  // ─────────────────────────────────────────────────────────────
  // 1. SPLASH / ENTRY SCREEN (Simple text-only "Rhema Job Circle")
  // ─────────────────────────────────────────────────────────────
  if (showSplash) {
    return (
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => setShowSplash(false)}
        style={styles.splashContainer}
      >
        <StatusBar
          barStyle="dark-content"
          backgroundColor="#FFFFFF"
          translucent
        />

        {/* Pristine White & Pearl Silk Background */}
        <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: bgFade }]}>
          <LinearGradient
            colors={['#FFFFFF', '#FAF9FD', '#F4F2FA', '#ECE7F6', '#F7F5FC', '#FFFFFF']}
            locations={[0, 0.2, 0.45, 0.75, 0.9, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />

          <Svg style={StyleSheet.absoluteFillObject} width="100%" height="100%">
            <Defs>
              <SvgRadialGradient id="topWhiteGlow" cx="50%" cy="0%" r="55%">
                <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
                <Stop offset="70%" stopColor="#FFFFFF" stopOpacity="0.4" />
                <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
              </SvgRadialGradient>
              <SvgRadialGradient id="softLilacGlow" cx="80%" cy="60%" r="50%">
                <Stop offset="0%" stopColor="#E8E1F7" stopOpacity="0.5" />
                <Stop offset="100%" stopColor="#E8E1F7" stopOpacity="0" />
              </SvgRadialGradient>
              <SvgRadialGradient id="softGoldGlow" cx="20%" cy="85%" r="45%">
                <Stop offset="0%" stopColor="#F9F2E3" stopOpacity="0.55" />
                <Stop offset="100%" stopColor="#F9F2E3" stopOpacity="0" />
              </SvgRadialGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#topWhiteGlow)" />
            <Rect width="100%" height="100%" fill="url(#softLilacGlow)" />
            <Rect width="100%" height="100%" fill="url(#softGoldGlow)" />
          </Svg>
        </Animated.View>

        {/* "Rhema Job Circle" Centered Navy-Blue Branding */}
        <Animated.View style={[styles.splashCenterContainer, { opacity: contentFade }]}>
          <View style={styles.brandScaleWrap}>
            <View style={styles.brandLogoBox}>
              <Svg width="100%" height="100%" viewBox={RHEMA_LOGO_VIEWBOX}>
                <Path d={RHEMA_LOGO_PATH} fill="#0B1F5C" fillRule="evenodd" />
              </Svg>
              <Text style={styles.brandSub} numberOfLines={1} adjustsFontSizeToFit>
                JOB CIRCLE
              </Text>
            </View>
          </View>
        </Animated.View>
      </TouchableOpacity>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 2. MAIN JOB CIRCLE SCREEN
  // ─────────────────────────────────────────────────────────────
  const isMultiple = filteredOpportunities.length > 1;

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={screenBg}
      />

      {/* ── HEADER LAYOUT ── */}
      {/* Top-left: Logged-in member's profile picture */}
      {/* Middle: Prominent Search Bar ("Search ministry opportunities...") */}
      {/* Top-right: Notification bell icon with unread badge */}
      <View
        style={[
          styles.mainHeaderRow,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8,
            backgroundColor: screenBg,
            borderBottomColor: cardBorder,
          },
        ]}
      >
        {/* Top-Left: Member Profile Picture */}
        <TouchableOpacity
          onPress={handleOpenProfile}
          activeOpacity={0.8}
          style={styles.profileAvatarTouchable}
        >
          {memberPhotoUrl ? (
            <Image source={{ uri: memberPhotoUrl }} style={styles.memberAvatarImg} resizeMode="cover" />
          ) : (
            <View style={[styles.memberAvatarFallback, { backgroundColor: isDark ? '#1E293B' : '#E0E7FF' }]}>
              <User size={18} color={isDark ? '#93C5FD' : '#1a2d5a'} />
            </View>
          )}
        </TouchableOpacity>

        {/* Center Header Space: Prominent Search Bar */}
        <View style={[styles.headerSearchBox, { backgroundColor: cardSurface, borderColor: cardBorder }]}>
          <Search size={17} color={secondaryText} />
          <TextInput
            style={[styles.searchInput, { color: primaryText }]}
            placeholder="Search ministry opportunities..."
            placeholderTextColor={secondaryText}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color={secondaryText} />
            </TouchableOpacity>
          )}
        </View>

        {/* Top-Right: Notification Bell with Unread Badge */}
        <TouchableOpacity
          onPress={handleOpenNotifications}
          activeOpacity={0.8}
          style={[styles.bellBtn, { backgroundColor: cardSurface, borderColor: cardBorder }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Bell size={20} color={primaryText} />
          {unreadNotifCount > 0 && (
            <View style={styles.notifBadge}>
              <View style={styles.notifBadgeDot} />
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── MAIN CONTENT: Single Card or Horizontal Carousel ── */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={isDark ? '#60A5FA' : Colors.primary} />
          <Text style={{ marginTop: 12, fontSize: 13, color: secondaryText }}>
            Loading ministry opportunities...
          </Text>
        </View>
      ) : filteredOpportunities.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          <View style={[styles.emptyBox, { backgroundColor: cardSurface, borderColor: cardBorder }]}>
            <Briefcase size={44} color={secondaryText} style={{ marginBottom: 12 }} />
            <Text style={{ color: primaryText, fontWeight: '800', fontSize: 17, marginBottom: 6 }}>
              No Opportunities Found
            </Text>
            <Text style={{ color: secondaryText, textAlign: 'center', lineHeight: 20, fontSize: 13.5 }}>
              {searchQuery.trim()
                ? 'No ministry positions match your search query. Try clearing your search.'
                : 'Approved ministry openings and volunteer callings will appear here when published.'}
            </Text>
          </View>
        </ScrollView>
      ) : isMultiple ? (
        // ── 6. OPPORTUNITY CAROUSEL: Horizontal scrolling when multiple opportunities ──
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.carouselHeaderRow}>
            <Text style={[styles.carouselSectionTitle, { color: primaryText }]}>
              Ministry Opportunities
            </Text>
            <Text style={{ fontSize: 12.5, color: secondaryText, fontWeight: '600' }}>
              {activeCarouselIdx + 1} of {filteredOpportunities.length}
            </Text>
          </View>

          <FlatList
            data={filteredOpportunities}
            keyExtractor={item => item.id}
            renderItem={({ item }) => renderOpportunityCard(item, true)}
            horizontal
            pagingEnabled={false}
            snapToInterval={CARD_WIDTH + 16}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.carouselContentContainer}
            onScroll={onCarouselScroll}
            scrollEventThrottle={16}
          />

          {/* Carousel Dot Indicators */}
          <View style={styles.carouselIndicatorsRow}>
            {filteredOpportunities.map((_, idx) => (
              <View
                key={idx}
                style={[
                  styles.carouselDot,
                  idx === activeCarouselIdx
                    ? [styles.carouselDotActive, { backgroundColor: isDark ? '#60A5FA' : '#1D4ED8' }]
                    : [styles.carouselDotInactive, { backgroundColor: isDark ? '#3F3F46' : '#CBD5E1' }],
                ]}
              />
            ))}
          </View>
        </ScrollView>
      ) : (
        // ── Single Opportunity Card (Normal display without carousel controls) ──
        <ScrollView
          contentContainerStyle={[styles.singleCardScroll, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.carouselHeaderRow}>
            <Text style={[styles.carouselSectionTitle, { color: primaryText }]}>
              Ministry Opportunity
            </Text>
            <Text style={{ fontSize: 12.5, color: secondaryText, fontWeight: '600' }}>
              1 Available
            </Text>
          </View>

          {renderOpportunityCard(filteredOpportunities[0], false)}
        </ScrollView>
      )}

      {/* ── DIRECT IN-SCREEN APPLICATION BOTTOM SHEET MODAL ── */}
      <Modal
        visible={!!selectedOppForApply}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (!submitting) setSelectedOppForApply(null);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={[styles.modalSheet, { backgroundColor: cardSurface, borderColor: cardBorder }]}>
            <View style={styles.modalDragHandle} />

            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitleText, { color: primaryText }]} numberOfLines={1}>
                  Apply: {selectedOppForApply?.title}
                </Text>
                <Text style={[styles.modalSubtitleText, { color: secondaryText }]}>
                  Attach your CV/Resume and share a brief message of calling.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedOppForApply(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.modalCloseBtn}
              >
                <X size={20} color={secondaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* Message Input */}
              <Text style={[styles.fieldLabel, { color: primaryText }]}>
                Message / Calling Statement
              </Text>
              <TextInput
                style={[
                  styles.messageTextArea,
                  {
                    backgroundColor: isDark ? '#27272A80' : '#F8FAFC',
                    borderColor: cardBorder,
                    color: primaryText,
                  },
                ]}
                placeholder="Share your heart for this ministry, previous experience, or questions..."
                placeholderTextColor={secondaryText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                value={applicationMessage}
                onChangeText={setApplicationMessage}
              />

              {/* Resume / Document Picker */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 8 }}>
                <Text style={[styles.fieldLabel, { color: primaryText, marginBottom: 0 }]}>
                  Resume / CV Attachment (Optional)
                </Text>
                <Text style={{ fontSize: 11.5, color: secondaryText, fontWeight: '500' }}>
                  Max 25MB
                </Text>
              </View>
              {selectedFile ? (
                <View
                  style={[
                    styles.fileSelectedBox,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
                      borderColor: isDark ? '#3B82F6' : '#BFDBFE',
                    },
                  ]}
                >
                  <FileText size={22} color={isDark ? '#60A5FA' : '#2563EB'} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.fileNameTxt, { color: primaryText }]} numberOfLines={1}>
                      {selectedFile.name}
                    </Text>
                    {selectedFile.size ? (
                      <Text style={[styles.fileSizeTxt, { color: secondaryText }]}>
                        {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedFile(null)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Trash2 size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.uploadDottedBox,
                    {
                      backgroundColor: isDark ? '#27272A50' : '#F8FAFC',
                      borderColor: isDark ? '#3F3F46' : '#CBD5E1',
                    },
                  ]}
                  onPress={handlePickDocument}
                  activeOpacity={0.8}
                >
                  <Upload size={22} color={isDark ? '#93C5FD' : '#2563EB'} />
                  <Text style={[styles.uploadBoxPrompt, { color: primaryText }]}>
                    Tap to upload Resume / CV (PDF or DOCX)
                  </Text>
                  <Text style={{ fontSize: 11.5, color: secondaryText }}>
                    Up to 25MB supported
                  </Text>
                </TouchableOpacity>
              )}

              {/* Action Buttons */}
              <View style={styles.modalActionsRow}>
                <TouchableOpacity
                  style={[
                    styles.modalCancelBtn,
                    {
                      backgroundColor: isDark ? '#27272A' : '#F1F5F9',
                      borderColor: cardBorder,
                      borderWidth: 1,
                    },
                  ]}
                  onPress={() => setSelectedOppForApply(null)}
                  disabled={submitting}
                >
                  <Text style={[styles.modalCancelTxt, { color: primaryText }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.modalSubmitBtn,
                    {
                      backgroundColor: isDark ? '#FFFFFF' : '#1a2d5a',
                    },
                    submitting && { opacity: 0.7 },
                  ]}
                  onPress={handleSubmitApplication}
                  disabled={submitting}
                  activeOpacity={0.85}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
                  ) : (
                    <>
                      <Send size={16} color={isDark ? '#000000' : '#FFFFFF'} />
                      <Text style={[styles.modalSubmitTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                        Submit Application
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── SPLASH SCREEN STYLES ──
  splashContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashCenterContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  brandScaleWrap: {
    width: 210,
    height: 88,
    transform: [{ scale: 1.3 }],
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandLogoBox: {
    width: 210,
    height: 88,
  },
  brandSub: {
    position: 'absolute',
    left: 73,
    top: 67,
    width: 136,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.8,
    color: '#07153F',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },

  // ── MAIN HEADER STYLES (Profile Left + Search Bar Center + Bell Right) ──
  mainHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  profileAvatarTouchable: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#1a2d5a',
  },
  memberAvatarImg: {
    width: '100%',
    height: '100%',
  },
  memberAvatarFallback: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSearchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13.5,
    paddingVertical: 0,
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  notifBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF4444',
  },

  // ── CONTENT FEED / CAROUSEL STYLES ──
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  carouselHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    marginTop: 14,
    marginBottom: 12,
  },
  carouselSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  carouselContentContainer: {
    paddingHorizontal: 16,
  },
  singleCardScroll: {
    paddingHorizontal: 16,
  },
  carouselIndicatorsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  carouselDot: {
    height: 6,
    borderRadius: 3,
  },
  carouselDotActive: {
    width: 22,
  },
  carouselDotInactive: {
    width: 6,
  },

  // ── OPPORTUNITY CARD STYLES ──
  oppCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  posterAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: '#3B82F6',
  },
  posterAvatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posterNameText: {
    fontSize: 14.5,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  posterSubtitleText: {
    fontSize: 12,
    marginTop: 1,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeTxt: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  cardBannerWrap: {
    width: '100%',
    height: 190,
    backgroundColor: '#0F172A',
  },
  cardBannerImg: {
    width: '100%',
    height: '100%',
  },
  defaultBannerPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    padding: 20,
  },
  placeholderWatermark: {
    position: 'absolute',
    right: -10,
    bottom: -10,
  },
  placeholderContent: {
    alignItems: 'center',
    zIndex: 1,
  },
  placeholderChurchTag: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  placeholderChurchTagTxt: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  placeholderTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  placeholderSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    textAlign: 'center',
  },
  cardDetailsBox: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  cardTitleText: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  cardMetadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaItemTxt: {
    fontSize: 13,
    fontWeight: '500',
  },
  descText: {
    fontSize: 13,
    lineHeight: 19,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.12)',
    gap: 12,
  },
  detailsLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  detailsLinkTxt: {
    fontSize: 13,
    fontWeight: '700',
  },
  applyPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  applyPrimaryTxt: {
    fontSize: 13.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  appliedStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.2,
  },
  appliedStatusTxt: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyBox: {
    padding: 28,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },

  // ── IN-SCREEN MODAL STYLES ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  modalDragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#94A3B8',
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitleText: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  modalSubtitleText: {
    fontSize: 13,
    lineHeight: 18,
  },
  modalCloseBtn: {
    padding: 4,
    marginLeft: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  messageTextArea: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 100,
  },
  uploadDottedBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadBoxPrompt: {
    fontSize: 13,
    fontWeight: '600',
  },
  fileSelectedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
    borderRadius: 12,
    padding: 12,
  },
  fileNameTxt: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  fileSizeTxt: {
    fontSize: 11.5,
    marginTop: 2,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelTxt: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  modalSubmitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  modalSubmitTxt: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
