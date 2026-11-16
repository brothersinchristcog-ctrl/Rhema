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
  BackHandler,
  Platform,
  Image,
  Modal,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import {
  Briefcase,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  MapPin,
  DollarSign,
  ArrowLeft,
  Send,
  X,
  User,
  Upload,
  FileText,
  Trash2,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useChurch } from '../../context/ChurchContext';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../theme/Theme';
import JobCircleService from '../../services/JobCircleService';
import FirestoreService from '../../services/FirestoreService';
import { JobOpportunity, AttachmentInfo } from '../../types/jobCircle';

export default function JobCircleScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const { colors, isDark } = useTheme();

  // Responsive dynamic colors
  const screenBg = isDark ? '#000000' : (colors.background || '#FAF7F2');
  const cardSurface = isDark ? '#18181B' : (colors.surface || '#FFFFFF');
  const cardBorder = isDark ? '#27272A' : (colors.border || '#E2E8F0');
  const primaryText = isDark ? '#FFFFFF' : (colors.text || '#0F172A');
  const secondaryText = isDark ? '#A1A1AA' : (colors.textSecondary || '#64748B');

  const churchId = activeChurch?.id || 'rhema';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [opportunities, setOpportunities] = useState<JobOpportunity[]>([]);
  const [creatorProfiles, setCreatorProfiles] = useState<{ [uid: string]: { name: string; photo?: string } }>({});
  const [expandedDescIds, setExpandedDescIds] = useState<{ [key: string]: boolean }>({});
  const [appliedOppIds, setAppliedOppIds] = useState<string[]>([]);

  // Search & Type Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');

  // Direct Apply Modal State
  const [selectedOppForApply, setSelectedOppForApply] = useState<JobOpportunity | null>(null);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string; mimeType?: string; size?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Android hardware back handler
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
      Alert.alert('Application Submitted', 'Your ministry application has been received! The ministry leader will review your calling.');
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
      const opps = await JobCircleService.getOpportunities(churchId, { onlyApproved: true });
      setOpportunities(opps);

      // Fetch creator member profiles to guarantee real person name and photo
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
  };

  // Filtered Opportunities for Feed / Search
  const filteredOpportunities = opportunities.filter(opp => {
    const matchesSearch =
      opp.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (opp.categoryName && opp.categoryName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (opp.location && opp.location.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (opp.description && opp.description.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesType =
      selectedType === 'all' ||
      (selectedType === 'paid' && opp.compensationType !== 'unpaid') ||
      (selectedType === 'volunteer' && opp.compensationType === 'unpaid');

    return matchesSearch && matchesType;
  });

  // ── LINKEDIN STYLE POST CARD RENDERER ──
  const renderPostCard = (opp: JobOpportunity) => {
    const isPaid = opp.compensationType !== 'unpaid';
    const isExpanded = !!expandedDescIds[opp.id];
    const postedTimeAgo = formatPostedDate(opp.createdAt);
    const hasLongDesc = (opp.description || '').length > 140;

    // Poster name & photo: Use the creator's real name and picture
    const creatorInfo = creatorProfiles[opp.createdById];
    const posterName =
      creatorInfo?.name ||
      opp.createdByName ||
      '';
    const posterPhoto =
      creatorInfo?.photo ||
      opp.createdByPhoto ||
      '';
    // Display only explicitly assigned designation; never invent a title
    const posterRole = opp.createdByRole && opp.createdByRole !== 'Ministry Coordinator' ? opp.createdByRole : '';

    return (
      <View
        key={opp.id}
        style={[
          styles.postCard,
          {
            backgroundColor: cardSurface,
            borderColor: cardBorder,
          },
        ]}
      >
        {/* Post Header: Person Who Posted the Job (Name & Profile Picture) */}
        <View style={styles.postHeaderRow}>
          {posterPhoto ? (
            <Image source={{ uri: posterPhoto }} style={styles.posterAvatar} resizeMode="cover" />
          ) : (
            <View style={[styles.posterAvatarPlaceholder, { backgroundColor: isDark ? '#1E3A8A' : '#DBEAFE' }]}>
              <User size={20} color={isDark ? '#93C5FD' : '#1E40AF'} />
            </View>
          )}

          <View style={{ flex: 1, marginLeft: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={[styles.postAuthorName, { color: primaryText }]} numberOfLines={1}>
                {posterName || 'Church Ministry'}
              </Text>
              <View style={styles.officialBadge}>
                <CheckCircle2 size={13} color="#2563EB" />
              </View>
            </View>
            <Text style={[styles.postAuthorSubtitle, { color: secondaryText }]} numberOfLines={1}>
              {posterRole ? `${posterRole} • ${postedTimeAgo}` : postedTimeAgo}
            </Text>
          </View>
        </View>

        {/* Post Headline: Natural church ministry invitation */}
        <View style={styles.postHeadlineBox}>
          <Text style={[styles.postHeadlineTitle, { color: primaryText }]}>
            {posterName ? (
              <>
                <Text style={{ color: isDark ? '#60A5FA' : '#1D4ED8', fontWeight: '800' }}>{posterName}</Text>
                {' is inviting members to serve in the '}
                <Text style={{ fontWeight: '800' }}>{opp.title} Ministry</Text>
              </>
            ) : (
              <>
                <Text style={{ fontWeight: '800' }}>{opp.title} Ministry</Text>
                {' – Volunteers Needed'}
              </>
            )}
          </Text>
        </View>

        {/* Clean Job Metadata Rows (Clean Modern Text Rows) */}
        <View style={styles.postDetailsBox}>
          <View style={styles.detailRow}>
            <MapPin size={15} color={isDark ? '#60A5FA' : '#1D4ED8'} style={styles.detailIcon} />
            <Text style={[styles.detailLabel, { color: secondaryText }]}>Location:</Text>
            <Text style={[styles.detailVal, { color: primaryText }]} numberOfLines={1}>
              {opp.location || 'Rhema Main Campus'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Briefcase size={15} color={isDark ? '#60A5FA' : '#1D4ED8'} style={styles.detailIcon} />
            <Text style={[styles.detailLabel, { color: secondaryText }]}>Role & Category:</Text>
            <Text style={[styles.detailVal, { color: primaryText }]} numberOfLines={1}>
              {opp.categoryName || opp.title}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Filter size={15} color={isDark ? '#60A5FA' : '#1D4ED8'} style={styles.detailIcon} />
            <Text style={[styles.detailLabel, { color: secondaryText }]}>Opportunity Type:</Text>
            <View style={[styles.typePill, { backgroundColor: isPaid ? (isDark ? '#F59E0B25' : '#FEF3C7') : (isDark ? '#10B98125' : '#ECFDF5') }]}>
              <Text style={[styles.typePillTxt, { color: isPaid ? (isDark ? '#FBBF24' : '#B45309') : (isDark ? '#34D399' : '#047857') }]}>
                {opp.opportunityType.replace(/_/g, ' ').toUpperCase()}
              </Text>
            </View>
          </View>

          {opp.compensationDetails ? (
            <View style={styles.detailRow}>
              <View style={[styles.rupeeIconCircle, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7' }]}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: isDark ? '#FBBF24' : '#B45309' }}>₹</Text>
              </View>
              <Text style={[styles.detailLabel, { color: secondaryText }]}>Compensation:</Text>
              <Text style={[styles.detailVal, { color: isDark ? '#FBBF24' : '#B45309', fontWeight: '700' }]}>
                {opp.compensationDetails}
              </Text>
            </View>
          ) : null}

          <View style={styles.detailRow}>
            <Clock size={15} color={isDark ? '#60A5FA' : '#1D4ED8'} style={styles.detailIcon} />
            <Text style={[styles.detailLabel, { color: secondaryText }]}>Schedule:</Text>
            <Text style={[styles.detailVal, { color: primaryText }]} numberOfLines={1}>
              {opp.timeCommitment}
            </Text>
          </View>
        </View>

        {/* Opportunity Description with "...more" Toggle */}
        <View style={styles.postBodyWrap}>
          <Text
            style={[styles.postDescription, { color: primaryText }]}
            numberOfLines={isExpanded ? undefined : 3}
          >
            {opp.description}
          </Text>
          {hasLongDesc && (
            <TouchableOpacity onPress={() => toggleDescExpand(opp.id)} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
              <Text style={{ color: isDark ? '#60A5FA' : '#1D4ED8', fontWeight: '700', fontSize: 13 }}>
                {isExpanded ? 'Show less' : '...more'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Key Responsibilities or Calling Points (if any) */}
        {opp.responsibilities && opp.responsibilities.length > 0 && isExpanded && (
          <View style={styles.expandedSection}>
            <Text style={[styles.expandedSecTitle, { color: primaryText }]}>Key Responsibilities:</Text>
            {opp.responsibilities.map((resp, i) => (
              <View key={i} style={styles.bulletItem}>
                <Text style={{ color: '#2563EB', marginRight: 6 }}>•</Text>
                <Text style={[styles.bulletTxt, { color: secondaryText }]}>{resp}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Uploaded Opportunity Banner / Thumbnail Image */}
        <TouchableOpacity
          onPress={() => navigation.navigate('OpportunityDetailScreen', { opportunity: opp })}
          activeOpacity={0.92}
          style={styles.postBannerWrap}
        >
          {opp.thumbnailUrl ? (
            <Image
              source={{ uri: opp.thumbnailUrl }}
              style={styles.postBannerImg}
              resizeMode="cover"
            />
          ) : (
            // Clean Default Graphic Placeholder
            <View style={[styles.defaultBannerPlaceholder, { backgroundColor: isDark ? '#1E293B' : '#0F172A' }]}>
              <View style={styles.placeholderWatermark}>
                <Briefcase size={80} color="rgba(255,255,255,0.08)" />
              </View>
              <View style={styles.placeholderContent}>
                <View style={styles.placeholderChurchTag}>
                  <Text style={styles.placeholderChurchTagTxt}>{posterName.toUpperCase()}</Text>
                </View>
                <Text style={styles.placeholderTitle} numberOfLines={2}>
                  {opp.title}
                </Text>
                <Text style={styles.placeholderSub}>
                  {opp.categoryName} • {opp.location}
                </Text>
              </View>
            </View>
          )}
        </TouchableOpacity>

        {/* Apply Now Primary Action Strip */}
        <View style={styles.postApplyStrip}>
          {appliedOppIds.includes(opp.id) ? (
            <View
              style={[
                styles.appliedPill,
                {
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
                  borderColor: isDark ? '#065F46' : '#A7F3D0',
                },
              ]}
            >
              <CheckCircle2 size={18} color="#059669" />
              <Text style={[styles.appliedPillTxt, { color: isDark ? '#34D399' : '#047857' }]}>
                Application Submitted
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.applyNowButton, { backgroundColor: isDark ? '#FFFFFF' : '#1a2d5a' }]}
              onPress={() => setSelectedOppForApply(opp)}
              activeOpacity={0.85}
            >
              <Send size={15} color={isDark ? '#000000' : '#FFFFFF'} />
              <Text style={[styles.applyNowTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                Apply Now
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

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

      {/* Main Content Feed */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={isDark ? '#60A5FA' : Colors.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Search Box */}
          <View style={[styles.searchBox, { backgroundColor: cardSurface, borderColor: cardBorder }]}>
            <Search size={18} color={secondaryText} />
            <TextInput
              style={[styles.searchInput, { color: primaryText }]}
              placeholder="Search ministry role, calling, location..."
              placeholderTextColor={secondaryText}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={16} color={secondaryText} />
              </TouchableOpacity>
            )}
          </View>

          {/* Filter Chips: All, Paid, Volunteer */}
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

          {/* Count Header */}
          <View style={[styles.sectionHeader, { marginBottom: 12 }]}>
            <Text style={{ fontSize: 13, color: secondaryText, fontWeight: '600' }}>
              {filteredOpportunities.length} {filteredOpportunities.length === 1 ? 'Opportunity' : 'Opportunities'} available
            </Text>
          </View>

          {/* Feed List */}
          {filteredOpportunities.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: cardSurface, borderColor: cardBorder }]}>
              <Briefcase size={40} color={secondaryText} style={{ marginBottom: 12 }} />
              <Text style={{ color: primaryText, fontWeight: '700', fontSize: 16, marginBottom: 4 }}>
                No Postings Found
              </Text>
              <Text style={{ color: secondaryText, textAlign: 'center', lineHeight: 20 }}>
                {searchQuery.trim()
                  ? 'No ministry openings match your search keyword. Try clearing filters.'
                  : 'New ministry positions and volunteer opportunities will appear directly in this feed when published.'}
              </Text>
            </View>
          ) : (
            filteredOpportunities.map(opp => renderPostCard(opp))
          )}
        </ScrollView>
      )}

      {/* Direct In-Screen Application Modal */}
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
  centerLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16 },

  // Search & Filters
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  // ── LINKEDIN STYLE POST CARD STYLES ──
  postCard: {
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  postHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  posterAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: '#3B82F6',
  },
  posterAvatarPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAuthorName: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  officialBadge: {
    marginTop: 1,
  },
  postAuthorSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  postHeadlineBox: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  postHeadlineTitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  postDetailsBox: {
    paddingHorizontal: 16,
    paddingVertical: 4,
    gap: 7,
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  detailIcon: {
    marginRight: 8,
  },
  rupeeIconCircle: {
    width: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginRight: 6,
  },
  detailVal: {
    fontSize: 13.5,
    fontWeight: '600',
    flex: 1,
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  typePillTxt: {
    fontSize: 11,
    fontWeight: '700',
  },
  postBodyWrap: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  postDescription: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  expandedSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  expandedSecTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  bulletTxt: {
    fontSize: 12.5,
    lineHeight: 18,
    flex: 1,
  },
  postBannerWrap: {
    width: '100%',
    overflow: 'hidden',
  },
  postBannerImg: {
    width: '100%',
    height: 220,
  },
  defaultBannerPlaceholder: {
    width: '100%',
    height: 190,
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
    marginBottom: 10,
  },
  placeholderChurchTagTxt: {
    color: '#93C5FD',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  placeholderTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  placeholderSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12.5,
    textAlign: 'center',
  },
  postApplyStrip: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  applyNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  applyNowTxt: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  appliedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.2,
  },
  appliedPillTxt: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  emptyBox: {
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },

  // In-Screen Modal Styles
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
