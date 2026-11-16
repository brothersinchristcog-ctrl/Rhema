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

  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Top Header */}
      <LinearGradient
        colors={theme.headerGradient || ['#1a2d5a', '#2c3e6b']}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerSubtitle}>Rhema Church</Text>
            <Text style={styles.headerTitle}>Job Circle & Calling</Text>
          </View>
          <TouchableOpacity
            style={[styles.volunteerBadge, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
            onPress={() => navigation.navigate('Volunteer')}
          >
            <HeartHandshake size={16} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.volunteerBadgeText}>Volunteer</Text>
          </TouchableOpacity>
        </View>

        {/* 5-Tab Navigation Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
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
                  styles.tabPill,
                  isActive
                    ? { backgroundColor: '#ffffff' }
                    : { backgroundColor: 'rgba(255,255,255,0.15)' },
                ]}
              >
                <Text
                  style={[
                    styles.tabPillText,
                    isActive ? { color: Colors.primary, fontWeight: '700' } : { color: '#ffffff' },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </LinearGradient>

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
              {/* Welcome Card */}
              <View style={[styles.welcomeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Sparkles size={24} color={Colors.gold} style={{ marginBottom: 8 }} />
                <Text style={[styles.welcomeTitle, { color: theme.text }]}>Discover Your Calling</Text>
                <Text style={[styles.welcomeDesc, { color: theme.textSecondary }]}>
                  Serve the body of Christ at Rhema Church. Explore open pastoral roles, worship ministry, technical operations, and volunteer opportunities.
                </Text>
                <TouchableOpacity
                  style={[styles.exploreBtn, { backgroundColor: theme.accent || Colors.primary }]}
                  onPress={() => setActiveTab('explore')}
                >
                  <Text style={styles.exploreBtnText}>Browse Openings</Text>
                  <ArrowRight size={16} color="#fff" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              </View>

              {/* Ministry Categories Grid */}
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Ministry Categories</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
                {categories.map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.catCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => {
                      setSelectedCategory(cat.id);
                      setActiveTab('explore');
                    }}
                  >
                    <View style={[styles.catIconWrap, { backgroundColor: Colors.goldLight }]}>
                      <Briefcase size={20} color={Colors.primary} />
                    </View>
                    <Text style={[styles.catName, { color: theme.text }]} numberOfLines={1}>
                      {cat.name}
                    </Text>
                    <Text style={[styles.catTelugu, { color: theme.textSecondary }]} numberOfLines={1}>
                      {cat.nameTelugu}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Latest Opportunities */}
              <View style={[styles.sectionHeader, { marginTop: 24 }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Featured Opportunities</Text>
                <TouchableOpacity onPress={() => setActiveTab('explore')}>
                  <Text style={[styles.viewAllText, { color: theme.accent || Colors.primary }]}>View All</Text>
                </TouchableOpacity>
              </View>

              {opportunities.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={{ color: theme.textSecondary }}>No approved ministry opportunities at this time.</Text>
                </View>
              ) : (
                opportunities.slice(0, 5).map(opp => {
                  const isPaid = opp.compensationType !== 'unpaid';
                  return (
                    <TouchableOpacity
                      key={opp.id}
                      style={[styles.oppCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                      onPress={() => navigation.navigate('OpportunityDetailScreen', { opportunity: opp })}
                    >
                      <View style={styles.oppHeader}>
                        <View style={[styles.oppBadge, { backgroundColor: isPaid ? Colors.goldLight : '#E1F5EE' }]}>
                          <Text style={[styles.oppBadgeText, { color: isPaid ? Colors.warning : Colors.success }]}>
                            {opp.opportunityType.replace('_', ' ').toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.categoryPill, { color: theme.accent || Colors.primary }]}>
                          {opp.categoryName}
                        </Text>
                      </View>

                      <Text style={[styles.oppTitle, { color: theme.text }]}>{opp.title}</Text>

                      <View style={styles.oppMetaRow}>
                        <MapPin size={14} color={theme.textSecondary} />
                        <Text style={[styles.oppMetaText, { color: theme.textSecondary }]}>{opp.location}</Text>
                        <Clock size={14} color={theme.textSecondary} style={{ marginLeft: 12 }} />
                        <Text style={[styles.oppMetaText, { color: theme.textSecondary }]}>{opp.timeCommitment}</Text>
                      </View>

                      {opp.compensationDetails ? (
                        <View style={[styles.oppMetaRow, { marginTop: 4 }]}>
                          <DollarSign size={14} color={Colors.warning} />
                          <Text style={[styles.oppMetaText, { color: theme.text, fontWeight: '600' }]}>
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
              <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Search size={18} color={theme.textSecondary} />
                <TextInput
                  style={[styles.searchInput, { color: theme.text }]}
                  placeholder="Search role, skills, calling..."
                  placeholderTextColor={theme.textSecondary}
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
                        ? { backgroundColor: theme.accent || Colors.primary }
                        : { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 },
                    ]}
                    onPress={() => setSelectedType(type)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        selectedType === type ? { color: '#ffffff' } : { color: theme.text },
                      ]}
                    >
                      {type === 'all' ? 'All Roles' : type === 'paid' ? 'Paid / Staff' : 'Volunteer'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Results */}
              <Text style={[styles.resultsCount, { color: theme.textSecondary }]}>
                Showing {filteredOpportunities.length} opportunities
              </Text>

              {filteredOpportunities.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={{ color: theme.textSecondary }}>No opportunities matching your criteria.</Text>
                </View>
              ) : (
                filteredOpportunities.map(opp => {
                  const isPaid = opp.compensationType !== 'unpaid';
                  return (
                    <TouchableOpacity
                      key={opp.id}
                      style={[styles.oppCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                      onPress={() => navigation.navigate('OpportunityDetailScreen', { opportunity: opp })}
                    >
                      <View style={styles.oppHeader}>
                        <View style={[styles.oppBadge, { backgroundColor: isPaid ? Colors.goldLight : '#E1F5EE' }]}>
                          <Text style={[styles.oppBadgeText, { color: isPaid ? Colors.warning : Colors.success }]}>
                            {opp.opportunityType.replace('_', ' ').toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.categoryPill, { color: theme.accent || Colors.primary }]}>
                          {opp.categoryName}
                        </Text>
                      </View>
                      <Text style={[styles.oppTitle, { color: theme.text }]}>{opp.title}</Text>
                      <Text style={[styles.oppDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                        {opp.description}
                      </Text>
                      <View style={styles.oppMetaRow}>
                        <MapPin size={14} color={theme.textSecondary} />
                        <Text style={[styles.oppMetaText, { color: theme.textSecondary }]}>{opp.location}</Text>
                        <Clock size={14} color={theme.textSecondary} style={{ marginLeft: 12 }} />
                        <Text style={[styles.oppMetaText, { color: theme.textSecondary }]}>{opp.timeCommitment}</Text>
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
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 12 }]}>
                My Ministry Applications
              </Text>
              {myApplications.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={{ color: theme.textSecondary }}>You haven't submitted any ministry applications yet.</Text>
                </View>
              ) : (
                myApplications.map(app => (
                  <View
                    key={app.id}
                    style={[styles.appCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                  >
                    <View style={styles.appHeader}>
                      <Text style={[styles.appTitle, { color: theme.text }]}>{app.opportunityTitle}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: '#EFF6FF' }]}>
                        <Text style={[styles.statusText, { color: '#2563EB' }]}>
                          {app.status.replace('_', ' ').toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.appCategory, { color: theme.textSecondary }]}>{app.categoryName}</Text>
                    {app.resumeAttachment && (
                      <View style={styles.attachmentRow}>
                        <FileText size={16} color={Colors.primary} />
                        <Text style={[styles.attachmentName, { color: theme.text }]} numberOfLines={1}>
                          {app.resumeAttachment.fileName}
                        </Text>
                      </View>
                    )}
                    {app.adminNotes ? (
                      <View style={[styles.adminNotesBox, { backgroundColor: theme.bg }]}>
                        <Text style={[styles.adminNotesText, { color: theme.textSecondary }]}>
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
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 12 }]}>
                My Active Ministry & Volunteer Service
              </Text>

              {/* Event & General Volunteer Engagements */}
              <Text style={[styles.subHeading, { color: theme.textSecondary }]}>Volunteer Engagements</Text>
              {volunteerApplications.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: theme.surface, borderColor: theme.border, marginBottom: 16 }]}>
                  <Text style={{ color: theme.textSecondary }}>No volunteer applications found.</Text>
                </View>
              ) : (
                volunteerApplications.map(vApp => (
                  <View
                    key={vApp.id}
                    style={[styles.appCard, { backgroundColor: theme.surface, borderColor: theme.border, marginBottom: 12 }]}>
                    <View style={styles.appHeader}>
                      <Text style={[styles.appTitle, { color: theme.text }]}>
                        {vApp.eventTitle || 'General Church Volunteering'}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: '#E1F5EE' }]}>
                        <Text style={[styles.statusText, { color: Colors.success }]}>
                          {vApp.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    {vApp.assignedRole ? (
                      <Text style={[styles.roleAssigned, { color: theme.accent || Colors.primary }]}>
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
              <View style={[styles.profileCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Spiritual Gifts & Ministry Talents</Text>
                <Text style={[styles.subDesc, { color: theme.textSecondary }]}>
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
                            ? { backgroundColor: theme.accent || Colors.primary, borderColor: theme.accent || Colors.primary }
                            : { backgroundColor: theme.bg, borderColor: theme.border },
                        ]}
                        onPress={() => toggleSkill(skill)}
                      >
                        <Text
                          style={[
                            styles.skillToggleText,
                            isSelected ? { color: '#ffffff', fontWeight: '700' } : { color: theme.text },
                          ]}
                        >
                          {skill}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Introduction / Statement */}
                <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 16 }]}>
                  Personal Calling & Experience
                </Text>
                <TextInput
                  style={[styles.textArea, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                  placeholder="Tell ministry leaders about your journey, service background, or passion..."
                  placeholderTextColor={theme.textSecondary}
                  multiline
                  numberOfLines={4}
                  value={introText}
                  onChangeText={setIntroText}
                />

                {/* Saved CV / Resume */}
                <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 16 }]}>
                  Default Resume / CV (Attached for 1-Click Apply)
                </Text>
                {ministryProfile?.defaultResume ? (
                  <View style={[styles.resumeRow, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                    <FileText size={24} color={Colors.primary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resumeFileName, { color: theme.text }]} numberOfLines={1}>
                        {ministryProfile.defaultResume.fileName}
                      </Text>
                      <Text style={{ fontSize: 12, color: Colors.success }}>Attached to Profile</Text>
                    </View>
                    <TouchableOpacity onPress={handlePickDefaultResume} disabled={uploadingResume}>
                      <Text style={{ color: theme.accent || Colors.primary, fontWeight: '600' }}>Change</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.uploadBox, { backgroundColor: theme.bg, borderColor: theme.border }]}
                    onPress={handlePickDefaultResume}
                    disabled={uploadingResume}
                  >
                    {uploadingResume ? (
                      <ActivityIndicator size="small" color={theme.accent || Colors.primary} />
                    ) : (
                      <>
                        <Upload size={20} color={theme.textSecondary} />
                        <Text style={[styles.uploadText, { color: theme.textSecondary }]}>
                          Attach CV / Resume (PDF / DOCX)
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {/* Save Button */}
                <TouchableOpacity
                  style={[styles.saveProfileBtn, { backgroundColor: theme.accent || Colors.primary, marginTop: 24 }]}
                  onPress={handleSaveProfile}
                  disabled={savingProfile}
                >
                  {savingProfile ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.saveProfileBtnText}>Save Ministry Profile</Text>
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
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  headerTitle: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  volunteerBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  volunteerBadgeText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  tabBar: { flexDirection: 'row', gap: 8, paddingBottom: 4 },
  tabPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  tabPillText: { fontSize: 13, fontWeight: '600' },
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16 },
  welcomeCard: { padding: 18, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  welcomeTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  welcomeDesc: { fontSize: 13, lineHeight: 20, marginBottom: 14 },
  exploreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10 },
  exploreBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
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
