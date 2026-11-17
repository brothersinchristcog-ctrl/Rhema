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
  Eye,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../../context/AuthContext';
import { useChurch } from '../../context/ChurchContext';
import { useTheme } from '../../context/ThemeContext';
import { Colors } from '../../theme/Theme';
import JobCircleService from '../../services/JobCircleService';
import NotificationService from '../../services/NotificationService';
import InAppDocumentViewerModal, { InAppDocumentViewerDoc } from '../../components/InAppDocumentViewerModal';
import { JobOpportunity, AttachmentInfo } from '../../types/jobCircle';

interface OpportunityDetailScreenProps {
  navigation: any;
  route: {
    params: {
      opportunityId?: string;
      applicationId?: string;
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
    bg: isDark ? '#000000' : colors.bg,
    surface: isDark ? '#121214' : colors.surface,
    cardBorder: isDark ? '#27272A' : '#E2E8F0',
    text: isDark ? '#FFFFFF' : '#0F172A',
    textSecondary: isDark ? '#A1A1AA' : '#64748B',
    border: isDark ? '#27272A' : '#E2E8F0',
    accent: isDark ? '#60A5FA' : (colors.accent || Colors.primary),
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
  const [viewerDoc, setViewerDoc] = useState<InAppDocumentViewerDoc | null>(null);

  const [userApplication, setUserApplication] = useState<any>(null);

  const formatDocSize = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

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
      const targetAppId = route?.params?.applicationId;
      let existingApp = targetAppId
        ? myApps.find(app => app.id === targetAppId)
        : myApps.find(app => app.opportunityId === opportunity.id && app.status !== 'withdrawn');
      if (!existingApp) {
        existingApp = myApps.find(app => app.opportunityId === opportunity.id && app.status !== 'withdrawn');
      }
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

      // 2. Submit application (include active FCM token for targeted status push)
      const fcmToken = await NotificationService.messaging().getToken().catch(() => '');
      await JobCircleService.applyForOpportunity(
        churchId,
        opportunity,
        {
          id: user.uid,
          name: member?.name || user.displayName || 'Church Member',
          phone: member?.phone || user.phoneNumber || '',
          email: member?.email || user.email || '',
          fcmToken: fcmToken || '',
        },
        {
          applicationMessage: applicationMessage.trim(),
          resumeAttachment,
        }
      );

      setHasApplied(true);
      setApplyModalVisible(false);
      await checkIfAlreadyApplied();
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
  const dividerColor = isDark ? '#1F242D' : '#E2E8F0';
  const bodyCopyColor = isDark ? '#CBD5E1' : '#334155';
  const headingColor = isDark ? '#FFFFFF' : '#0F172A';
  const accentColor = isDark ? '#93C5FD' : '#1a2d5a';

  const formatCompensationSummary = () => {
    const typeKey = String(opportunity.compensationType || 'unpaid').toLowerCase();
    let label = 'Unpaid / Voluntary Service';
    if (typeKey === 'salary') label = 'Monthly Salary';
    else if (typeKey === 'stipend') label = 'Honorarium / Stipend';
    else if (typeKey !== 'unpaid') {
      label = String(opportunity.compensationType).replace(/_/g, ' ');
    }
    return opportunity.compensationDetails
      ? `${label} — ${opportunity.compensationDetails}`
      : label;
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#FFFFFF' }]}>
      {/* ── Screen Header matching Member Dashboard tabs ── */}
      <View
        style={[
          styles.headerRow,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8,
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.circularBackBtn,
            {
              backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              borderColor: isDark ? '#3F3F46' : '#E2E8F0',
            },
          ]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <ArrowLeft size={20} color={isDark ? '#FFFFFF' : '#0F172A'} strokeWidth={2.4} />
        </TouchableOpacity>

        <Text
          style={[styles.headerTitleText, { color: headingColor }]}
          numberOfLines={1}
        >
          {opportunity.title}
        </Text>

        <View style={styles.headerRightSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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

        {/* Clean Title & Role Header Block (plain text, no boxes or lines) */}
        <View style={styles.heroHeaderBlock}>
          <Text style={[styles.title, { color: headingColor }]}>{opportunity.title}</Text>
          <Text style={[styles.subtitlePlainText, { color: accentColor }]}>
            {opportunity.categoryName || 'Ministry Role'}
            {opportunity.opportunityType ? ` • ${opportunity.opportunityType.replace(/_/g, ' ')}` : ''}
          </Text>
        </View>

        {/* Application Status Notice (if applied) */}
        {userApplication ? (
          <View style={styles.detailSection}>
            <Text style={[styles.sectionHeading, { color: headingColor }]}>
              Your Application Status ({userApplication.status.replace(/_/g, ' ').toUpperCase()})
            </Text>

            {userApplication.status === 'meeting_scheduled' ? (
              <View style={{ marginTop: 2 }}>
                <Text style={[styles.sectionDescription, { color: isDark ? '#FBBF24' : '#B45309', fontWeight: '600' }]}>
                  Ministry Interview Scheduled
                </Text>
                {userApplication.meetingDate ? (
                  <Text style={[styles.sectionDescription, { color: bodyCopyColor, marginTop: 2 }]}>
                    Date: {userApplication.meetingDate}
                  </Text>
                ) : null}
                {userApplication.meetingTime ? (
                  <Text style={[styles.sectionDescription, { color: bodyCopyColor, marginTop: 2 }]}>
                    Time: {userApplication.meetingTime}
                  </Text>
                ) : null}
                {userApplication.meetingLocation ? (
                  <Text style={[styles.sectionDescription, { color: bodyCopyColor, marginTop: 2 }]}>
                    Location / Link: {userApplication.meetingLocation}
                  </Text>
                ) : null}
                {userApplication.meetingNotes ? (
                  <Text style={[styles.sectionDescription, { color: theme.textSecondary, marginTop: 4, fontStyle: 'italic' }]}>
                    "{userApplication.meetingNotes}"
                  </Text>
                ) : null}
              </View>
            ) : userApplication.status === 'selected' ? (
              <Text style={[styles.sectionDescription, { color: isDark ? '#34D399' : '#059669' }]}>
                Congratulations! You have been appointed to serve in this ministry. A ministry leader will connect with you soon.
              </Text>
            ) : userApplication.status === 'under_review' ? (
              <Text style={[styles.sectionDescription, { color: bodyCopyColor }]}>
                Your calling and application are currently being prayerfully reviewed by ministry leaders.
              </Text>
            ) : userApplication.status === 'rejected' ? (
              <View>
                <Text style={[styles.sectionDescription, { color: isDark ? '#FCA5A5' : '#DC2626' }]}>
                  Thank you for your heart to serve. This application has not been selected at this time.
                </Text>
                {userApplication.adminNotes ? (
                  <Text style={[styles.sectionDescription, { color: theme.textSecondary, marginTop: 4, fontStyle: 'italic' }]}>
                    Leader Note: {userApplication.adminNotes}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text style={[styles.sectionDescription, { color: bodyCopyColor }]}>
                Application received. You will receive notifications as leaders review your calling.
              </Text>
            )}
          </View>
        ) : null}

        {/* 1. Ministry Overview */}
        <View style={styles.detailSection}>
          <Text style={[styles.sectionHeading, { color: headingColor }]}>Ministry Overview</Text>
          <Text style={[styles.sectionDescription, { color: bodyCopyColor }]}>
            {opportunity.description || 'Details will be shared during orientation.'}
          </Text>
        </View>

        {/* Job Description Document (In-App Viewable) */}
        {opportunity.jdAttachment?.url ? (
          <View style={styles.detailSection}>
            <Text style={[styles.sectionHeading, { color: headingColor }]}>Job Description Document</Text>
            <View
              style={[
                styles.jdDocMemberCard,
                {
                  backgroundColor: isDark ? '#18181B' : '#F8FAFC',
                  borderColor: isDark ? '#27272A' : '#E2E8F0',
                },
              ]}
            >
              <View style={styles.jdDocMemberInfo}>
                <View
                  style={[
                    styles.jdDocMemberIconBox,
                    {
                      backgroundColor: opportunity.jdAttachment.fileName?.toLowerCase().endsWith('.pdf')
                        ? (isDark ? '#7F1D1D40' : '#FEE2E2')
                        : (isDark ? '#1E3A8A40' : '#DBEAFE'),
                    },
                  ]}
                >
                  <FileText
                    size={22}
                    color={
                      opportunity.jdAttachment.fileName?.toLowerCase().endsWith('.pdf')
                        ? '#EF4444'
                        : '#3B82F6'
                    }
                  />
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text
                    style={[styles.jdDocMemberTitle, { color: headingColor }]}
                    numberOfLines={1}
                  >
                    {opportunity.jdAttachment.fileName || 'Job Description Document'}
                  </Text>
                  <Text style={[styles.jdDocMemberSub, { color: theme.textSecondary }]}>
                    {[
                      formatDocSize(opportunity.jdAttachment.fileSize),
                      opportunity.jdAttachment.fileName?.toLowerCase().endsWith('.pdf') ? 'PDF Document' : 'Document',
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.jdDocViewButton,
                  { backgroundColor: isDark ? '#2563EB' : '#1a2d5a' },
                ]}
                onPress={() =>
                  setViewerDoc({
                    url: opportunity.jdAttachment!.url,
                    name: opportunity.jdAttachment!.fileName || 'Job Description',
                    mimeType: opportunity.jdAttachment!.mimeType,
                  })
                }
                activeOpacity={0.85}
              >
                <Eye size={15} color="#FFFFFF" strokeWidth={2.2} />
                <Text style={styles.jdDocViewButtonTxt}>View Document In-App</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* 2. Responsibilities */}
        {opportunity.responsibilities && opportunity.responsibilities.length > 0 ? (
          <View style={styles.detailSection}>
            <Text style={[styles.sectionHeading, { color: headingColor }]}>Responsibilities</Text>
            <Text style={[styles.sectionDescription, { color: bodyCopyColor }]}>
              {opportunity.responsibilities.join('\n')}
            </Text>
          </View>
        ) : null}

        {/* 3. Required Skills */}
        {opportunity.requiredSkills && opportunity.requiredSkills.length > 0 ? (
          <View style={styles.detailSection}>
            <Text style={[styles.sectionHeading, { color: headingColor }]}>Required Skills</Text>
            <Text style={[styles.sectionDescription, { color: bodyCopyColor }]}>
              {opportunity.requiredSkills.join(', ')}
            </Text>
          </View>
        ) : null}

        {/* 4. Location */}
        <View style={styles.detailSection}>
          <Text style={[styles.sectionHeading, { color: headingColor }]}>Location</Text>
          <Text style={[styles.sectionDescription, { color: bodyCopyColor }]}>
            {opportunity.location || 'Rhema Main Campus'}
          </Text>
        </View>

        {/* 5. Time Commitment */}
        <View style={styles.detailSection}>
          <Text style={[styles.sectionHeading, { color: headingColor }]}>Time Commitment</Text>
          <Text style={[styles.sectionDescription, { color: bodyCopyColor }]}>
            {opportunity.timeCommitment || 'Flexible schedule'}
          </Text>
        </View>

        {/* 6. Compensation */}
        <View style={styles.detailSection}>
          <Text style={[styles.sectionHeading, { color: headingColor }]}>Compensation</Text>
          <Text style={[styles.sectionDescription, { color: bodyCopyColor }]}>
            {formatCompensationSummary()}
          </Text>
        </View>

        {/* Optional Application Deadline */}
        {opportunity.applicationDeadline ? (
          <View style={styles.detailSection}>
            <Text style={[styles.sectionHeading, { color: headingColor }]}>Application Deadline</Text>
            <Text style={[styles.sectionDescription, { color: bodyCopyColor }]}>
              {new Date(
                opportunity.applicationDeadline.seconds
                  ? opportunity.applicationDeadline.seconds * 1000
                  : opportunity.applicationDeadline
              ).toLocaleDateString()}
            </Text>
          </View>
        ) : null}

        {/* Optional Additional Instructions */}
        {opportunity.additionalInstructions ? (
          <View style={styles.detailSection}>
            <Text style={[styles.sectionHeading, { color: headingColor }]}>Additional Notes</Text>
            <Text style={[styles.sectionDescription, { color: bodyCopyColor }]}>
              {opportunity.additionalInstructions}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Bottom Sticky Action */}
      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
            paddingBottom: Math.max(insets.bottom, 8) + 8,
          },
        ]}
      >
        {hasApplied ? (
          <View style={styles.appliedBanner}>
            <CheckCircle2 size={20} color={Colors.success} />
            <Text style={[styles.appliedText, { color: Colors.success }]}>Application Submitted</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.applyBtn, { backgroundColor: isDark ? '#FFFFFF' : '#1a2d5a' }]}
            onPress={() => setApplyModalVisible(true)}
            activeOpacity={0.85}
          >
            <Briefcase size={18} color={isDark ? '#000000' : '#FFFFFF'} style={{ marginRight: 8 }} />
            <Text style={[styles.applyBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>Apply Now</Text>
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

      {/* ── IN-APP DOCUMENT VIEWER MODAL ── */}
      <InAppDocumentViewerModal
        visible={!!viewerDoc}
        doc={viewerDoc}
        onClose={() => setViewerDoc(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 16, marginBottom: 16 },
  backBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  circularBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  headerRightSpacer: {
    width: 40,
    height: 40,
  },
  scrollContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 110 },
  detailBannerWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 18,
  },
  detailBannerImg: {
    width: '100%',
    height: 210,
  },
  heroHeaderBlock: { marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', lineHeight: 30, letterSpacing: -0.3 },
  subtitlePlainText: { fontSize: 14, fontWeight: '600', marginTop: 4, textTransform: 'capitalize' },
  detailSection: { marginBottom: 22 },
  sectionHeading: { fontSize: 16, fontWeight: '700', marginBottom: 6, letterSpacing: 0.1 },
  sectionDescription: { fontSize: 15, lineHeight: 23 },
  bottomBar: { paddingHorizontal: 20, paddingTop: 12 },
  applyBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 14, borderRadius: 999 },
  applyBtnText: { fontSize: 16, fontWeight: '700' },
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
  // In-App Viewable JD Document Styles
  jdDocMemberCard: {
    borderRadius: 14,
    borderWidth: 1.2,
    padding: 14,
    marginTop: 8,
    gap: 12,
  },
  jdDocMemberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  jdDocMemberIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jdDocMemberTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  jdDocMemberSub: {
    fontSize: 12,
    marginTop: 2,
  },
  jdDocViewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  jdDocViewButtonTxt: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
