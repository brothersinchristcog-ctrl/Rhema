import React, { useState, useEffect } from 'react';
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
  Alert,
  BackHandler,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Briefcase,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  MapPin,
  DollarSign,
  User,
  HeartHandshake,
  Layers,
  ArrowRight,
  ArrowLeft,
  BookOpen,
  Music,
  Video,
  FileText,
  Upload,
  Sparkles,
  ChevronRight,
  Plus,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../../context/AuthContext';
import { useChurch } from '../../context/ChurchContext';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../theme/Theme';
import JobCircleService from '../../services/JobCircleService';
import {
  JobOpportunity,
  JobApplication,
  JobCategory,
  MinistryProfile,
  DEFAULT_MINISTRY_CATEGORIES,
  COMMON_MINISTRY_SKILLS,
  AttachmentInfo,
} from '../../types/jobCircle';
import { VolunteerApplication } from '../../types/volunteer';

const { width } = Dimensions.get('window');

type ActiveTab = 'home' | 'explore' | 'applications' | 'service' | 'profile';

interface JobCircleScreenProps {
  navigation: any;
}

export default function JobCircleScreen({ navigation }: JobCircleScreenProps) {
  const insets = useSafeAreaInsets();
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const { colors, currentThemeOption } = useTheme();
  const theme = {
    bg: colors.bgSecondary,
    surface: colors.bgPrimary,
    text: colors.textPrimary,
    textSecondary: colors.textSecondary,
    border: colors.border,
    accent: colors.accent,
    headerGradient: currentThemeOption?.headerGradient || ['#1a2d5a', '#2c3e6b'],
  };
  const churchId = activeChurch?.id || 'rhema';
  const { isDark } = useTheme();

  // Responsive dynamic colors
  const screenBg = isDark ? '#000000' : (colors.background || '#FAF7F2');
  const cardSurface = isDark ? '#18181B' : (colors.surface || '#FFFFFF');
  const cardBorder = isDark ? '#27272A' : (colors.border || '#E2E8F0');
  const primaryText = isDark ? '#FFFFFF' : (colors.text || '#0F172A');
  const secondaryText = isDark ? '#A1A1AA' : (colors.textSecondary || '#64748B');

  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Android hardware back handler
  useEffect(() => {
    const onBackPress = () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [navigation]);

  // Data states
  const [categories, setCategories] = useState<JobCategory[]>(DEFAULT_MINISTRY_CATEGORIES);
  const [opportunities, setOpportunities] = useState<JobOpportunity[]>([]);
  const [myApplications, setMyApplications] = useState<JobApplication[]>([]);
  const [volunteerApplications, setVolunteerApplications] = useState<VolunteerApplication[]>([]);
  const [ministryProfile, setMinistryProfile] = useState<MinistryProfile | null>(null);

  // Search & Filters in Explore Tab
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');

  // Profile Edit State
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [introText, setIntroText] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);

  useEffect(() => {
    loadAllData();
  }, [churchId]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [cats, opps, unified] = await Promise.all([
        JobCircleService.getCategories(churchId),
        JobCircleService.getOpportunities(churchId, { onlyApproved: true }),
        user?.uid
          ? JobCircleService.getUnifiedMemberEngagements(churchId, user.uid)
          : Promise.resolve({ jobApplications: [], volunteerApplications: [] }),
      ]);

      setCategories(cats);
      setOpportunities(opps);
      setMyApplications(unified.jobApplications);
      setVolunteerApplications(unified.volunteerApplications);

      if (user?.uid) {
        const prof = await JobCircleService.getMinistryProfile(churchId, user.uid);
        if (prof) {
          setMinistryProfile(prof);
          setSelectedSkills(prof.skillsAndTalents || []);
          setIntroText(prof.shortIntroduction || '');
        }
      }
    } catch (err) {
      console.error('Error loading Job Circle data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadAllData();
  };

  // Upload or update default resume in profile
  const handlePickDefaultResume = async () => {
    if (!user?.uid) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setUploadingResume(true);
        const file = result.assets[0];
        const uploaded = await JobCircleService.uploadAttachment(
          churchId,
          user.uid,
          file.uri,
          file.name,
          file.mimeType
        );

        const updatedProfile: MinistryProfile = {
          id: user.uid,
          churchId,
          memberId: user.uid,
          memberName: member?.name || user.displayName || 'Church Member',
          memberPhone: member?.phone || user.phoneNumber || '',
          memberEmail: member?.email || user.email || '',
          ministryInterests: ministryProfile?.ministryInterests || [],
          skillsAndTalents: selectedSkills,
          languagesKnown: ministryProfile?.languagesKnown || ['English', 'Telugu'],
          preferredMinistries: ministryProfile?.preferredMinistries || [],
          availabilityDays: ministryProfile?.availabilityDays || ['Sunday'],
          availabilityTimeSlots: ministryProfile?.availabilityTimeSlots || ['Morning'],
          shortIntroduction: introText,
          isProfileVisibleToLeaders: true,
          defaultResume: uploaded,
          updatedAt: new Date(),
        };

        await JobCircleService.saveMinistryProfile(churchId, updatedProfile);
        setMinistryProfile(updatedProfile);
        Alert.alert('Resume Uploaded', 'Your CV / Resume has been saved to your Ministry Profile for fast 1-click applications.');
      }
    } catch (err) {
      console.error('Pick resume error:', err);
      Alert.alert('Upload Error', 'Could not upload CV/Resume. Please try again.');
    } finally {
      setUploadingResume(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.uid) return;
    try {
      setSavingProfile(true);
      const payload: MinistryProfile = {
        id: user.uid,
        churchId,
        memberId: user.uid,
        memberName: member?.name || user.displayName || 'Church Member',
        memberPhone: member?.phone || user.phoneNumber || '',
        memberEmail: member?.email || user.email || '',
        ministryInterests: ministryProfile?.ministryInterests || [],
        skillsAndTalents: selectedSkills,
        languagesKnown: ministryProfile?.languagesKnown || ['English', 'Telugu'],
        preferredMinistries: ministryProfile?.preferredMinistries || [],
        availabilityDays: ministryProfile?.availabilityDays || ['Sunday'],
        availabilityTimeSlots: ministryProfile?.availabilityTimeSlots || ['Morning'],
        shortIntroduction: introText,
        isProfileVisibleToLeaders: true,
        defaultResume: ministryProfile?.defaultResume,
        updatedAt: new Date(),
      };

      await JobCircleService.saveMinistryProfile(churchId, payload);
      setMinistryProfile(payload);
      Alert.alert('Saved', 'Your Church Ministry Profile has been updated.');
    } catch (err) {
      console.error('Save profile error:', err);
      Alert.alert('Error', 'Could not save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const toggleSkill = (skill: string) => {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(selectedSkills.filter(s => s !== skill));
    } else {
      setSelectedSkills([...selectedSkills, skill]);
    }
  };

  // Filtered Opportunities for Explore tab
  const filteredOpportunities = opportunities.filter(opp => {
    const matchesSearch =
      opp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opp.categoryName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (opp.description && opp.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCat = selectedCategory === 'all' || opp.categoryId === selectedCategory;
    const matchesType =
      selectedType === 'all' ||
      (selectedType === 'paid' && opp.compensationType !== 'unpaid') ||
      (selectedType === 'volunteer' && opp.compensationType === 'unpaid');

    return matchesSearch && matchesCat && matchesType;
  });

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      {/* ── Screen Header matching Member Dashboard tabs ── */}
      <View
        style={[
          styles.headerRow,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8,
            borderBottomWidth: 1.2,
            borderBottomColor: isDark ? '#2E2E2E' : '#CBD5E1',
            backgroundColor: screenBg,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.circularBackBtn, { backgroundColor: cardSurface, borderColor: cardBorder }]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          <ArrowLeft size={20} color={primaryText} strokeWidth={2.4} />
        </TouchableOpacity>

        <Text style={[styles.headerTitleText, { color: primaryText }]} numberOfLines={1}>
          Job Circle & Calling
        </Text>

        <View style={styles.headerRightSpacer} />
      </View>

      {/* 5-Tab Navigation Bar matching Member tabs */}
      <View
        style={[
          styles.tabContainer,
          isDark ? styles.tabContainerDark : styles.tabContainerLight,
        ]}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScrollWrap}>
          {(
            [
              { id: 'home', label: 'Home' },
              { id: 'explore', label: 'Explore' },
              { id: 'applications', label: `My Applications (${myApplications.length})` },
              { id: 'service', label: 'My Service' },
              { id: 'profile', label: 'Ministry Profile' },
            ] as const
          ).map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={[
                  styles.tabBtn,
                  isActive && styles.tabBtnActive,
                ]}
                activeOpacity={0.8}
              >
                {isActive && (
                  <View style={styles.activeTabGradientWrap} pointerEvents="none">
                    <LinearGradient
                      colors={isDark ? ['#1e3a8a', '#3b82f6'] : ['#1a2d5a', '#2c3e6b']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                  </View>
                )}
                <Text
                  style={[
                    styles.tabTxt,
                    isActive
                      ? styles.tabTxtActive
                      : isDark
                      ? styles.tabTxtInactiveDark
                      : styles.tabTxtInactiveLight,
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Content Area */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={theme.accent || Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {/* TAB 1: HOME */}
          {activeTab === 'home' && (
            <View>
              {/* Inspiration Hero Card matching Events / Volunteer */}
              <View
                style={[
                  styles.bannerCard,
                  {
                    backgroundColor: isDark ? '#064E3B20' : '#ECFDF5',
                    borderColor: isDark ? '#065F46' : '#A7F3D0',
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Sparkles size={16} color="#059669" />
                  <Text style={[styles.bannerTitle, { color: isDark ? '#6EE7B7' : '#047857' }]}>
                    Discover Your Calling
                  </Text>
                </View>
                <Text
                  style={[
                    styles.bannerQuote,
                    { color: isDark ? '#D1FAE5' : '#065F46' },
                  ]}
                >
                  "Each of you should use whatever gift you have received to serve others, as faithful stewards of God’s grace." — 1 Peter 4:10
                </Text>
                <TouchableOpacity
                  style={[styles.exploreBtn, { backgroundColor: isDark ? '#FFFFFF' : '#1a2d5a' }]}
                  onPress={() => setActiveTab('explore')}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.exploreBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>Browse Openings</Text>
                  <ArrowRight size={15} color={isDark ? '#000000' : '#FFFFFF'} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              </View>

              {/* Ministry Categories Grid */}
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: primaryText }]}>Ministry Categories</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.catCard, { backgroundColor: cardSurface, borderColor: cardBorder }]}
                    onPress={() => {
                      setSelectedCategory(cat.id);
                      setActiveTab('explore');
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.catIconWrap, { backgroundColor: isDark ? '#27272A' : '#EFF6FF' }]}>
                      <Briefcase size={20} color={isDark ? '#60A5FA' : '#1E40AF'} />
                    </View>
                    <Text style={[styles.catName, { color: primaryText }]} numberOfLines={1}>
                      {cat.name}
                    </Text>
                    <Text style={[styles.catTelugu, { color: secondaryText }]} numberOfLines={1}>
                      {cat.nameTelugu}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Latest Opportunities */}
              <View style={[styles.sectionHeader, { marginTop: 24 }]}>
                <Text style={[styles.sectionTitle, { color: primaryText }]}>Featured Opportunities</Text>
                <TouchableOpacity onPress={() => setActiveTab('explore')}>
                  <Text style={[styles.viewAllText, { color: isDark ? '#60A5FA' : '#1E40AF' }]}>View All</Text>
                </TouchableOpacity>
              </View>

              {opportunities.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: cardSurface, borderColor: cardBorder }]}>
                  <Text style={{ color: secondaryText }}>No approved ministry opportunities at this time.</Text>
                </View>
              ) : (
                opportunities.slice(0, 5).map(opp => {
                  const isPaid = opp.compensationType !== 'unpaid';
                  return (
                    <TouchableOpacity
                      key={opp.id}
                      style={[styles.oppCard, { backgroundColor: cardSurface, borderColor: cardBorder }]}
                      onPress={() => navigation.navigate('OpportunityDetailScreen', { opportunity: opp })}
                      activeOpacity={0.8}
                    >
                      <View style={styles.oppHeader}>
                        <View style={[styles.oppBadge, { backgroundColor: isPaid ? (isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7') : (isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5') }]}>
                          <Text style={[styles.oppBadgeText, { color: isPaid ? (isDark ? '#FBBF24' : '#B45309') : (isDark ? '#34D399' : '#047857') }]}>
                            {opp.opportunityType.replace('_', ' ').toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.categoryPill, { color: isDark ? '#60A5FA' : '#1E40AF' }]}>
                          {opp.categoryName}
                        </Text>
                      </View>

                      <Text style={[styles.oppTitle, { color: primaryText }]}>{opp.title}</Text>

                      <View style={styles.oppMetaRow}>
                        <MapPin size={14} color={secondaryText} />
                        <Text style={[styles.oppMetaText, { color: secondaryText }]}>{opp.location}</Text>
                        <Clock size={14} color={secondaryText} style={{ marginLeft: 12 }} />
                        <Text style={[styles.oppMetaText, { color: secondaryText }]}>{opp.timeCommitment}</Text>
                      </View>

                      {opp.compensationDetails ? (
                        <View style={[styles.oppMetaRow, { marginTop: 6 }]}>
                          <DollarSign size={14} color={isDark ? '#FBBF24' : '#B45309'} />
                          <Text style={[styles.oppMetaText, { color: primaryText, fontWeight: '600' }]}>
                            {opp.compensationDetails}
                          </Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {/* TAB 2: EXPLORE */}
          {activeTab === 'explore' && (
            <View>
              {/* Search Bar */}
              <View style={[styles.searchBox, { backgroundColor: cardSurface, borderColor: cardBorder }]}>
                <Search size={18} color={secondaryText} />
                <TextInput
                  style={[styles.searchInput, { color: primaryText }]}
                  placeholder="Search role, skills, calling..."
                  placeholderTextColor={secondaryText}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>

              {/* Type Filter Chips */}
              <View style={styles.filterRow}>
                {(['all', 'paid', 'volunteer'] as const).map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.filterChip,
                      selectedType === type
                        ? { backgroundColor: isDark ? '#FFFFFF' : '#1a2d5a' }
                        : { backgroundColor: cardSurface, borderColor: cardBorder, borderWidth: 1 },
                    ]}
                    onPress={() => setSelectedType(type)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedType === type
                          ? { color: isDark ? '#000000' : '#FFFFFF', fontWeight: '700' }
                          : { color: primaryText },
                      ]}
                    >
                      {type === 'all' ? 'All Roles' : type === 'paid' ? 'Paid / Staff' : 'Volunteer'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Results */}
              <Text style={[styles.resultsCount, { color: secondaryText }]}>
                Showing {filteredOpportunities.length} opportunities
              </Text>

              {filteredOpportunities.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: cardSurface, borderColor: cardBorder }]}>
                  <Text style={{ color: secondaryText }}>No opportunities matching your criteria.</Text>
                </View>
              ) : (
                filteredOpportunities.map(opp => {
                  const isPaid = opp.compensationType !== 'unpaid';
                  return (
                    <TouchableOpacity
                      key={opp.id}
                      style={[styles.oppCard, { backgroundColor: cardSurface, borderColor: cardBorder }]}
                      onPress={() => navigation.navigate('OpportunityDetailScreen', { opportunity: opp })}
                      activeOpacity={0.8}
                    >
                      <View style={styles.oppHeader}>
                        <View style={[styles.oppBadge, { backgroundColor: isPaid ? (isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7') : (isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5') }]}>
                          <Text style={[styles.oppBadgeText, { color: isPaid ? (isDark ? '#FBBF24' : '#B45309') : (isDark ? '#34D399' : '#047857') }]}>
                            {opp.opportunityType.replace('_', ' ').toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.categoryPill, { color: isDark ? '#60A5FA' : '#1E40AF' }]}>
                          {opp.categoryName}
                        </Text>
                      </View>
                      <Text style={[styles.oppTitle, { color: primaryText }]}>{opp.title}</Text>
                      <Text style={[styles.oppDesc, { color: secondaryText }]} numberOfLines={2}>
                        {opp.description}
                      </Text>
                      <View style={styles.oppMetaRow}>
                        <MapPin size={14} color={secondaryText} />
                        <Text style={[styles.oppMetaText, { color: secondaryText }]}>{opp.location}</Text>
                        <Clock size={14} color={secondaryText} style={{ marginLeft: 12 }} />
                        <Text style={[styles.oppMetaText, { color: secondaryText }]}>{opp.timeCommitment}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {/* TAB 3: MY APPLICATIONS */}
          {activeTab === 'applications' && (
            <View>
              <Text style={[styles.sectionTitle, { color: primaryText, marginBottom: 12 }]}>
                My Ministry Applications
              </Text>
              {myApplications.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: cardSurface, borderColor: cardBorder }]}>
                  <Text style={{ color: secondaryText }}>You haven't submitted any ministry applications yet.</Text>
                </View>
              ) : (
                myApplications.map(app => (
                  <View
                    key={app.id}
                    style={[styles.appCard, { backgroundColor: cardSurface, borderColor: cardBorder }]}
                  >
                    <View style={styles.appHeader}>
                      <Text style={[styles.appTitle, { color: primaryText }]}>{app.opportunityTitle}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(59, 130, 246, 0.2)' : '#EFF6FF' }]}>
                        <Text style={[styles.statusText, { color: isDark ? '#60A5FA' : '#2563EB' }]}>
                          {app.status.replace('_', ' ').toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.appCategory, { color: secondaryText }]}>{app.categoryName}</Text>
                    {app.resumeAttachment && (
                      <View style={styles.attachmentRow}>
                        <FileText size={16} color={isDark ? '#60A5FA' : '#1E40AF'} />
                        <Text style={[styles.attachmentName, { color: primaryText }]} numberOfLines={1}>
                          {app.resumeAttachment.fileName}
                        </Text>
                      </View>
                    )}
                    {app.adminNotes ? (
                      <View style={[styles.adminNotesBox, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}>
                        <Text style={[styles.adminNotesText, { color: secondaryText }]}>
                          Note from Leader: {app.adminNotes}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          )}

          {/* TAB 4: MY SERVICE (UNIFIED WITH VOLUNTEER SYSTEM) */}
          {activeTab === 'service' && (
            <View>
              <Text style={[styles.sectionTitle, { color: primaryText, marginBottom: 12 }]}>
                My Active Ministry & Volunteer Service
              </Text>

              {/* Event & General Volunteer Engagements */}
              <Text style={[styles.subHeading, { color: secondaryText }]}>Volunteer Engagements</Text>
              {volunteerApplications.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: cardSurface, borderColor: cardBorder, marginBottom: 16 }]}>
                  <Text style={{ color: secondaryText }}>No volunteer applications found.</Text>
                </View>
              ) : (
                volunteerApplications.map(vApp => (
                  <View
                    key={vApp.id}
                    style={[styles.appCard, { backgroundColor: cardSurface, borderColor: cardBorder, marginBottom: 12 }]}>
                    <View style={styles.appHeader}>
                      <Text style={[styles.appTitle, { color: primaryText }]}>
                        {vApp.eventTitle || 'General Church Volunteering'}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#E1F5EE' }]}>
                        <Text style={[styles.statusText, { color: isDark ? '#34D399' : Colors.success }]}>
                          {vApp.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    {vApp.assignedRole ? (
                      <Text style={[styles.roleAssigned, { color: isDark ? '#60A5FA' : '#1E40AF' }]}>
                        Assigned Role: {vApp.assignedRole}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          )}

          {/* TAB 5: MINISTRY PROFILE & CV ATTACHMENT */}
          {activeTab === 'profile' && (
            <View>
              <View style={[styles.profileCard, { backgroundColor: cardSurface, borderColor: cardBorder }]}>
                <Text style={[styles.sectionTitle, { color: primaryText }]}>Spiritual Gifts & Ministry Talents</Text>
                <Text style={[styles.subDesc, { color: secondaryText }]}>
                  Select your skills and instruments to match with worship, technical, and teaching callings.
                </Text>

                {/* Skills Chips */}
                <View style={styles.skillsWrap}>
                  {COMMON_MINISTRY_SKILLS.map(skill => {
                    const isSelected = selectedSkills.includes(skill);
                    return (
                      <TouchableOpacity
                        key={skill}
                        style={[
                          styles.skillToggleChip,
                          isSelected
                            ? { backgroundColor: isDark ? '#FFFFFF' : '#1a2d5a', borderColor: isDark ? '#FFFFFF' : '#1a2d5a' }
                            : { backgroundColor: isDark ? '#27272A' : '#F1F5F9', borderColor: cardBorder },
                        ]}
                        onPress={() => toggleSkill(skill)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.skillToggleText,
                            {
                              color: isSelected ? (isDark ? '#000000' : '#FFFFFF') : primaryText,
                              fontWeight: isSelected ? '700' : '500',
                            },
                          ]}
                        >
                          {skill}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Introduction / Statement */}
                <Text style={[styles.fieldLabel, { color: primaryText, marginTop: 16 }]}>
                  Personal Calling & Experience
                </Text>
                <TextInput
                  style={[styles.textArea, { backgroundColor: isDark ? '#27272A' : '#F8FAFC', borderColor: cardBorder, color: primaryText }]}
                  placeholder="Tell ministry leaders about your journey, service background, or passion..."
                  placeholderTextColor={secondaryText}
                  multiline
                  numberOfLines={4}
                  value={introText}
                  onChangeText={setIntroText}
                />

                {/* Saved CV / Resume */}
                <Text style={[styles.fieldLabel, { color: primaryText, marginTop: 16 }]}>
                  Default Resume / CV (Attached for 1-Click Apply)
                </Text>
                {ministryProfile?.defaultResume ? (
                  <View style={[styles.resumeRow, { backgroundColor: isDark ? '#27272A' : '#F8FAFC', borderColor: cardBorder }]}>
                    <FileText size={24} color={isDark ? '#60A5FA' : '#1E40AF'} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resumeFileName, { color: primaryText }]} numberOfLines={1}>
                        {ministryProfile.defaultResume.fileName}
                      </Text>
                      <Text style={{ fontSize: 12, color: Colors.success }}>Attached to Profile</Text>
                    </View>
                    <TouchableOpacity onPress={handlePickDefaultResume} disabled={uploadingResume}>
                      <Text style={{ color: isDark ? '#60A5FA' : '#1E40AF', fontWeight: '600' }}>Change</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.uploadBox, { backgroundColor: isDark ? '#27272A' : '#F8FAFC', borderColor: cardBorder }]}
                    onPress={handlePickDefaultResume}
                    disabled={uploadingResume}
                  >
                    {uploadingResume ? (
                      <ActivityIndicator size="small" color={isDark ? '#FFFFFF' : '#1a2d5a'} />
                    ) : (
                      <>
                        <Upload size={20} color={secondaryText} />
                        <Text style={[styles.uploadText, { color: secondaryText }]}>
                          Attach CV / Resume (PDF / DOCX)
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {/* Save Button */}
                <TouchableOpacity
                  style={[styles.saveProfileBtn, { backgroundColor: isDark ? '#FFFFFF' : '#1a2d5a', marginTop: 24 }]}
                  onPress={handleSaveProfile}
                  disabled={savingProfile}
                  activeOpacity={0.8}
                >
                  {savingProfile ? (
                    <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
                  ) : (
                    <Text style={[styles.saveProfileBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>Save Ministry Profile</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleText: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  headerRightSpacer: {
    width: 40,
    height: 40,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  tabContainerLight: {
    backgroundColor: '#F8FAFC',
    borderBottomColor: '#E2E8F0',
  },
  tabContainerDark: {
    backgroundColor: '#09090B',
    borderBottomColor: '#27272A',
  },
  tabScrollWrap: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabBtnActive: {
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
  },
  activeTabGradientWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  tabTxt: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  tabTxtActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  tabTxtInactiveLight: {
    color: '#64748B',
  },
  tabTxtInactiveDark: {
    color: '#A1A1AA',
  },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16 },
  bannerCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 20,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  bannerQuote: {
    fontSize: 12.5,
    lineHeight: 18,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  exploreBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  viewAllText: { fontSize: 13, fontWeight: '600' },
  catScroll: { gap: 12, paddingBottom: 4 },
  catCard: { width: 130, padding: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
  catIconWrap: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  catName: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  catTelugu: { fontSize: 11, marginTop: 2, textAlign: 'center' },
  oppCard: { padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  oppHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  oppBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  oppBadgeText: { fontSize: 10, fontWeight: '700' },
  categoryPill: { fontSize: 12, fontWeight: '600' },
  oppTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  oppDesc: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  oppMetaRow: { flexDirection: 'row', alignItems: 'center' },
  oppMetaText: { fontSize: 12, marginLeft: 4 },
  emptyBox: { padding: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  resultsCount: { fontSize: 12, marginBottom: 12 },
  appCard: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  appHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700' },
  appCategory: { fontSize: 12, marginTop: 4 },
  attachmentRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  attachmentName: { fontSize: 12, fontWeight: '500', flex: 1 },
  adminNotesBox: { padding: 10, borderRadius: 8, marginTop: 10 },
  adminNotesText: { fontSize: 12, fontStyle: 'italic' },
  subHeading: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  roleAssigned: { fontSize: 13, fontWeight: '600', marginTop: 6 },
  profileCard: { padding: 18, borderRadius: 16, borderWidth: 1 },
  subDesc: { fontSize: 13, lineHeight: 18, marginBottom: 14 },
  skillsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillToggleChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  skillToggleText: { fontSize: 12 },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  textArea: { borderWidth: 1, borderRadius: 12, padding: 12, textAlignVertical: 'top' },
  resumeRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, gap: 12 },
  resumeFileName: { fontSize: 13, fontWeight: '600' },
  uploadBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', padding: 16, borderRadius: 12, gap: 8 },
  uploadText: { fontSize: 13, fontWeight: '500' },
  saveProfileBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveProfileBtnText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});
