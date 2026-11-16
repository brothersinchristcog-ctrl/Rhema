import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  Share,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Briefcase,
  MapPin,
  Clock,
  Heart,
  Calendar,
  Upload,
  FileText,
  Trash2,
  CheckCircle2,
  Share2,
  X,
  Send,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../../context/AuthContext';
import { useChurch } from '../../context/ChurchContext';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../theme/Theme';
import JobCircleService from '../../services/JobCircleService';
import { JobOpportunity, AttachmentInfo } from '../../types/jobCircle';

interface OpportunityDetailScreenProps {
  navigation: any;
  route: {
    params: {
      opportunityId?: string;
      opportunity?: JobOpportunity;
    };
  };
}

export default function OpportunityDetailScreen({ navigation, route }: OpportunityDetailScreenProps) {
  const insets = useSafeAreaInsets();
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const { colors, currentThemeOption, isDark } = useTheme();
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

  const [opportunity, setOpportunity] = useState<JobOpportunity | null>(route.params.opportunity || null);
  const [loading, setLoading] = useState<boolean>(!route.params.opportunity);
  
  // Application modal state
  const [applyModalVisible, setApplyModalVisible] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<{ uri: string; name: string; mimeType?: string; size?: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);

  const [userApplication, setUserApplication] = useState<any>(null);

  useEffect(() => {
    loadOpportunity();
  }, [route.params?.opportunityId, route.params?.opportunity]);

  useEffect(() => {
    if (opportunity?.id) {
      checkIfAlreadyApplied();
    }
  }, [opportunity?.id, user?.uid]);

  const loadOpportunity = async () => {
    if (route.params.opportunity) {
      setOpportunity(route.params.opportunity);
      setLoading(false);
      return;
    }
    if (!route.params.opportunityId) return;

    try {
      setLoading(true);
      const opp = await JobCircleService.getOpportunityById(churchId, route.params.opportunityId);
      setOpportunity(opp);
    } catch (err) {
      console.error('Error loading opportunity:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkIfAlreadyApplied = async () => {
    if (!user?.uid || !opportunity?.id) return;
    try {
      const myApps = await JobCircleService.getMyApplications(churchId, user.uid);
      const existingApp = myApps.find(app => app.opportunityId === opportunity.id && app.status !== 'withdrawn');
      if (existingApp) {
        setUserApplication(existingApp);
        setHasApplied(existingApp.status !== 'rejected');
      } else {
        setUserApplication(null);
        setHasApplied(false);
      }
    } catch (err) {
      console.warn('Error checking existing application:', err);
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
    if (!user?.uid || !opportunity) return;

    try {
      setSubmitting(true);
      let resumeAttachment: AttachmentInfo | undefined = undefined;

      // 1. Upload CV / Resume if selected
      if (selectedFile) {
        resumeAttachment = await JobCircleService.uploadAttachment(
          churchId,
          user.uid,
          selectedFile.uri,
          selectedFile.name,
          selectedFile.mimeType
        );
      }

      // 2. Submit application
      await JobCircleService.applyForOpportunity(
        churchId,
        opportunity,
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

      setHasApplied(true);
      setApplyModalVisible(false);
      Alert.alert('Application Submitted', 'Your ministry application and attachments have been received! The ministry team will review your calling.');
    } catch (err: any) {
      console.error('Submit application error:', err);
      Alert.alert('Submission Error', err.message || 'Could not submit application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent || Colors.primary} />
      </View>
    );
  }

  if (!opportunity) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <Text style={[styles.errorText, { color: theme.textSecondary }]}>Ministry Opportunity not found.</Text>
        <TouchableOpacity style={[styles.backBtn, { backgroundColor: theme.accent || Colors.primary }]} onPress={() => navigation.goBack()}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isPaid = opportunity.compensationType !== 'unpaid';

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <LinearGradient
        colors={theme.headerGradient || ['#1a2d5a', '#2c3e6b']}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <ArrowLeft size={22} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {opportunity.title}
          </Text>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => {
              Share.share({
                message: `📢 Ministry Calling at ${activeChurch?.name || 'Rhema Church'}:\n\n` +
                  `💼 Position: ${opportunity.title}\n` +
                  `📍 Location: ${opportunity.location}\n` +
                  `⏰ Time: ${opportunity.timeCommitment}\n` +
                  `\nDescription: ${opportunity.description}\n\nJoin hands in God's service through Rhema Church Job Circle!`,
                title: opportunity.title,
              }).catch(() => {});
            }}
          >
            <Share2 size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Member Application Status Card (if applied) */}
        {userApplication ? (
          <View
            style={[
              styles.sectionCard,
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                borderColor:
                  userApplication.status === 'selected'
                    ? '#10B981'
                    : userApplication.status === 'meeting_scheduled'
                    ? '#F59E0B'
                    : userApplication.status === 'under_review'
                    ? '#3B82F6'
                    : userApplication.status === 'rejected'
                    ? '#EF4444'
                    : theme.border,
                borderWidth: 1.5,
                marginBottom: 16,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>
                Your Application Status
              </Text>
              <View
                style={[
                  styles.typeBadge,
                  {
                    backgroundColor:
                      userApplication.status === 'selected'
                        ? (isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5')
                        : userApplication.status === 'meeting_scheduled'
                        ? (isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7')
                        : userApplication.status === 'under_review'
                        ? (isDark ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE')
                        : userApplication.status === 'rejected'
                        ? (isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2')
                        : (isDark ? 'rgba(148, 163, 184, 0.2)' : '#F1F5F9'),
                  },
                ]}
              >
                <Text
                  style={[
                    styles.typeBadgeText,
                    {
                      color:
                        userApplication.status === 'selected'
                          ? '#059669'
                          : userApplication.status === 'meeting_scheduled'
                          ? '#B45309'
                          : userApplication.status === 'under_review'
                          ? '#2563EB'
                          : userApplication.status === 'rejected'
                          ? '#DC2626'
                          : '#475569',
                    },
                  ]}
                >
                  {userApplication.status.replace(/_/g, ' ').toUpperCase()}
                </Text>
              </View>
            </View>

            {userApplication.status === 'meeting_scheduled' ? (
              <View style={{ backgroundColor: isDark ? 'rgba(245, 158, 11, 0.1)' : '#FFFBEB', padding: 12, borderRadius: 10, marginTop: 4 }}>
                <Text style={{ fontWeight: '700', color: isDark ? '#FBBF24' : '#B45309', fontSize: 14, marginBottom: 4 }}>
                  📅 Ministry Interview Scheduled
                </Text>
                {userApplication.meetingDate ? (
                  <Text style={{ color: theme.text, fontSize: 13, marginTop: 2 }}>
                    Date: <Text style={{ fontWeight: '600' }}>{userApplication.meetingDate}</Text>
                  </Text>
                ) : null}
                {userApplication.meetingTime ? (
                  <Text style={{ color: theme.text, fontSize: 13, marginTop: 2 }}>
                    Time: <Text style={{ fontWeight: '600' }}>{userApplication.meetingTime}</Text>
                  </Text>
                ) : null}
                {userApplication.meetingLocation ? (
                  <Text style={{ color: theme.text, fontSize: 13, marginTop: 2 }}>
                    Location / Link: <Text style={{ fontWeight: '600' }}>{userApplication.meetingLocation}</Text>
                  </Text>
                ) : null}
                {userApplication.meetingNotes ? (
                  <Text style={{ color: theme.textSecondary, fontSize: 12.5, marginTop: 4, fontStyle: 'italic' }}>
                    "{userApplication.meetingNotes}"
                  </Text>
                ) : null}
              </View>
            ) : userApplication.status === 'selected' ? (
              <Text style={{ color: isDark ? '#34D399' : '#059669', fontSize: 13, lineHeight: 18, marginTop: 4 }}>
                🎉 Congratulations! You have been appointed to serve in this ministry. A ministry leader will connect with you soon.
              </Text>
            ) : userApplication.status === 'under_review' ? (
              <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4 }}>
                Your calling and application are currently being prayerfully reviewed by ministry leaders.
              </Text>
            ) : userApplication.status === 'rejected' ? (
              <View style={{ backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2', padding: 10, borderRadius: 8, marginTop: 4 }}>
                <Text style={{ color: isDark ? '#F87171' : '#DC2626', fontSize: 13 }}>
                  Thank you for your heart to serve. This application has not been selected at this time.
                </Text>
                {userApplication.adminNotes ? (
                  <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4, fontStyle: 'italic' }}>
                    Leader Note: {userApplication.adminNotes}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4 }}>
                Application received. You will receive notifications as leaders review your calling.
              </Text>
            )}
          </View>
        ) : null}

        {/* Opportunity Banner Image (if uploaded) */}
        {opportunity.thumbnailUrl ? (
          <View style={styles.detailBannerWrap}>
            <Image
              source={{ uri: opportunity.thumbnailUrl }}
              style={styles.detailBannerImg}
              resizeMode="cover"
            />
          </View>
        ) : null}

        {/* Main Card */}
        <View style={[styles.mainCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.badgeRow}>
            <View style={[styles.typeBadge, { backgroundColor: isPaid ? Colors.goldLight : '#E1F5EE' }]}>
              <Text style={[styles.typeBadgeText, { color: isPaid ? Colors.warning : Colors.success }]}>
                {opportunity.opportunityType.replace('_', ' ').toUpperCase()}
              </Text>
            </View>
            <View style={[styles.compBadge, { backgroundColor: '#EFF6FF' }]}>
              <Text style={[styles.compBadgeText, { color: '#2563EB' }]}>
                {opportunity.compensationType.toUpperCase()}
              </Text>
            </View>
          </View>

          <Text style={[styles.title, { color: theme.text }]}>{opportunity.title}</Text>
          <Text style={[styles.categoryName, { color: theme.accent || Colors.primary }]}>
            {opportunity.categoryName}
          </Text>

          {opportunity.compensationDetails ? (
            <View style={styles.metaRow}>
              <View style={[styles.rupeeIconCircle, { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7' }]}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: isDark ? '#FBBF24' : '#B45309' }}>₹</Text>
              </View>
              <Text style={[styles.metaText, { color: isDark ? '#FBBF24' : '#B45309', fontWeight: '700' }]}>
                {opportunity.compensationDetails}
              </Text>
            </View>
          ) : null}

          <View style={styles.metaRow}>
            <MapPin size={16} color={theme.textSecondary} />
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>{opportunity.location}</Text>
          </View>

          <View style={styles.metaRow}>
            <Clock size={16} color={theme.textSecondary} />
            <Text style={[styles.metaText, { color: theme.textSecondary }]}>{opportunity.timeCommitment}</Text>
          </View>

          {opportunity.applicationDeadline ? (
            <View style={styles.metaRow}>
              <Calendar size={16} color={theme.textSecondary} />
              <Text style={[styles.metaText, { color: theme.textSecondary }]}>
                Deadline: {new Date(opportunity.applicationDeadline.seconds ? opportunity.applicationDeadline.seconds * 1000 : opportunity.applicationDeadline).toLocaleDateString()}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Description */}
        <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Description</Text>
          <Text style={[styles.bodyText, { color: theme.textSecondary }]}>{opportunity.description}</Text>
        </View>

        {/* Responsibilities */}
        {opportunity.responsibilities && opportunity.responsibilities.length > 0 && (
          <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Key Responsibilities</Text>
            {opportunity.responsibilities.map((resp, idx) => (
              <View key={idx} style={styles.bulletRow}>
                <Text style={[styles.bullet, { color: theme.accent || Colors.primary }]}>•</Text>
                <Text style={[styles.bulletText, { color: theme.textSecondary }]}>{resp}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Required Skills */}
        {opportunity.requiredSkills && opportunity.requiredSkills.length > 0 && (
          <View style={[styles.sectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Required Skills & Calling</Text>
            <View style={styles.chipsWrap}>
              {opportunity.requiredSkills.map((skill, idx) => (
                <View key={idx} style={[styles.skillChip, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                  <Text style={[styles.skillChipText, { color: theme.text }]}>{skill}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Sticky Action */}
      <View style={[styles.bottomBar, { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: insets.bottom + 8 }]}>
        {hasApplied ? (
          <View style={styles.appliedBanner}>
            <CheckCircle2 size={20} color={Colors.success} />
            <Text style={[styles.appliedText, { color: Colors.success }]}>Application Submitted</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.applyBtn, { backgroundColor: theme.accent || Colors.primary }]}
            onPress={() => setApplyModalVisible(true)}
          >
            <Briefcase size={18} color="#ffffff" style={{ marginRight: 8 }} />
            <Text style={styles.applyBtnText}>Apply for Ministry</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Apply Modal with CV Attachment */}
      <Modal visible={applyModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                borderColor: isDark ? '#3F3F46' : '#E2E8F0',
                paddingBottom: Math.max(insets.bottom + 12, 24),
              },
            ]}
          >
            <View style={styles.modalDragHandle} />

            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={1}>
                  Apply: {opportunity.title}
                </Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>
                  Attach your CV/Resume and share a brief message of calling.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setApplyModalVisible(false)}
                style={styles.modalCloseBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Note / Message */}
              <Text style={[styles.inputLabel, { color: theme.text }]}>Message / Calling Statement</Text>
              <TextInput
                style={[
                  styles.textArea,
                  {
                    backgroundColor: isDark ? '#27272A' : '#F8FAFC',
                    borderColor: isDark ? '#3F3F46' : '#CBD5E1',
                    color: theme.text,
                  },
                ]}
                placeholder="Share your heart for this ministry, previous experience, or questions..."
                placeholderTextColor={theme.textSecondary}
                multiline
                numberOfLines={4}
                value={applicationMessage}
                onChangeText={setApplicationMessage}
              />

              {/* CV / Resume Attachment Section */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 6 }}>
                <Text style={[styles.inputLabel, { color: theme.text, marginBottom: 0 }]}>
                  Resume / CV Attachment (Optional)
                </Text>
                <Text style={{ fontSize: 11.5, color: theme.textSecondary, fontWeight: '500' }}>
                  Max 25MB
                </Text>
              </View>

              {selectedFile ? (
                <View
                  style={[
                    styles.filePreviewCard,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
                      borderColor: isDark ? '#3B82F6' : '#BFDBFE',
                    },
                  ]}
                >
                  <FileText size={22} color={isDark ? '#60A5FA' : Colors.primary} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[styles.fileName, { color: theme.text }]} numberOfLines={1}>
                      {selectedFile.name}
                    </Text>
                    {selectedFile.size ? (
                      <Text style={{ fontSize: 11.5, color: theme.textSecondary, marginTop: 2 }}>
                        {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity onPress={() => setSelectedFile(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Trash2 size={18} color={Colors.error} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.uploadBox,
                    {
                      borderColor: isDark ? '#3F3F46' : '#CBD5E1',
                      backgroundColor: isDark ? '#27272A50' : '#F8FAFC',
                    },
                  ]}
                  onPress={handlePickDocument}
                  activeOpacity={0.8}
                >
                  <Upload size={22} color={isDark ? '#93C5FA' : '#2563EB'} />
                  <Text style={[styles.uploadBoxText, { color: theme.text }]}>
                    Tap to upload Resume / CV (PDF or DOCX)
                  </Text>
                  <Text style={{ fontSize: 11.5, color: theme.textSecondary }}>
                    Up to 25MB supported
                  </Text>
                </TouchableOpacity>
              )}

              <View style={styles.modalBtnRow}>
                <TouchableOpacity
                  style={[
                    styles.modalCancelBtn,
                    {
                      borderColor: isDark ? '#3F3F46' : '#CBD5E1',
                      backgroundColor: isDark ? '#27272A' : '#F1F5F9',
                    },
                  ]}
                  onPress={() => setApplyModalVisible(false)}
                  disabled={submitting}
                >
                  <Text style={{ color: theme.text, fontWeight: '700', fontSize: 14 }}>Cancel</Text>
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
                      <Send size={15} color={isDark ? '#000000' : '#FFFFFF'} style={{ marginRight: 6 }} />
                      <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontWeight: 'bold', fontSize: 14 }}>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, marginBottom: 16 },
  backBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#ffffff', marginHorizontal: 12 },
  iconBtn: { padding: 8 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  detailBannerWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  detailBannerImg: {
    width: '100%',
    height: 200,
  },
  mainCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  compBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  compBadgeText: { fontSize: 11, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  categoryName: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  metaText: { fontSize: 14 },
  sectionCard: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  bodyText: { fontSize: 14, lineHeight: 22 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  bullet: { fontSize: 16, marginRight: 8, lineHeight: 20 },
  bulletText: { flex: 1, fontSize: 14, lineHeight: 20 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  skillChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  skillChipText: { fontSize: 13, fontWeight: '500' },
  bottomBar: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1 },
  applyBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14, borderRadius: 12 },
  applyBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  appliedBanner: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 14 },
  appliedText: { fontSize: 16, fontWeight: '700' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, marginBottom: 16 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  textArea: { borderWidth: 1, borderRadius: 12, padding: 12, textAlignVertical: 'top', minHeight: 90 },
  uploadBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, padding: 20, alignItems: 'center', justifyContent: 'center', gap: 8 },
  uploadBoxText: { fontSize: 13, textAlign: 'center' },
  filePreviewCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, gap: 12 },
  fileName: { flex: 1, fontSize: 14, fontWeight: '500' },
  modalBtnRow: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modalSubmitBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  rupeeIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(156, 163, 175, 0.4)',
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(156, 163, 175, 0.15)',
  },
});
