import React, { useState, useEffect, useContext } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Linking,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Briefcase,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  Calendar,
  Phone,
  Mail,
  FileText,
  Plus,
  Edit,
  ExternalLink,
  HeartHandshake,
  Search,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { AdminTabContext } from '../../../context/AdminTabContext';
import { useAdminTheme, createAdminThemedStyles } from '../../../utils/adminThemeHelper';
import JobCircleService from '../../../services/JobCircleService';
import {
  JobOpportunity,
  JobApplication,
  JobApplicationStatus,
} from '../../../types/jobCircle';

interface AdminJobCircleDashboardProps {
  navigation: any;
}

export default function AdminJobCircleDashboard({ navigation }: AdminJobCircleDashboardProps) {
  const insets = useSafeAreaInsets();
  const { user, member } = useAuth();
  const { activeChurch } = useChurch();
  const { setActiveTab: setAdminParentTab, setTabByName } = useContext(AdminTabContext) || {};

  const {
    isDark,
    screenBg,
    cardSurface,
    primaryText,
    secondaryText,
    borderColor: adminBorderColor,
    scaleFont,
    appFontFamily,
  } = useAdminTheme();

  const churchId = activeChurch?.id || 'rhema';

  const [activeTab, setActiveTab] = useState<'overview' | 'opportunities' | 'applications'>('overview');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data states
  const [opportunities, setOpportunities] = useState<JobOpportunity[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);

  // Application Review Modal State
  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    loadAdminData();
  }, [churchId]);

  const loadAdminData = async () => {
    try {
      setLoading(true);
      const [opps, apps] = await Promise.all([
        JobCircleService.getOpportunities(churchId),
        JobCircleService.getAllApplications(churchId),
      ]);
      setOpportunities(opps);
      setApplications(apps);
    } catch (err) {
      console.error('Error loading admin Job Circle data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadAdminData();
  };

  const handleBack = () => {
    // When inside Admin Tab navigator, 0 is the main Admin Dashboard
    if (setAdminParentTab) {
      setAdminParentTab(0);
    } else if (navigation?.goBack) {
      navigation.goBack();
    }
  };

  const handleOpenReview = (app: JobApplication) => {
    setSelectedApp(app);
    setAdminNotes(app.adminNotes || '');
    setMeetingNotes(app.meetingNotes || '');
    setReviewModalVisible(true);
  };

  const handleUpdateStatus = async (newStatus: JobApplicationStatus) => {
    if (!selectedApp) return;

    try {
      setUpdatingStatus(true);
      await JobCircleService.updateApplicationStatus(churchId, selectedApp.id, newStatus, {
        adminId: user?.uid || 'admin',
        adminName: member?.name || user?.displayName || 'Admin',
        adminNotes: adminNotes.trim(),
        meetingNotes: meetingNotes.trim(),
      });

      setApplications(prev =>
        prev.map(a =>
          a.id === selectedApp.id
            ? { ...a, status: newStatus, adminNotes: adminNotes.trim(), meetingNotes: meetingNotes.trim() }
            : a
        )
      );

      setReviewModalVisible(false);
      Alert.alert('Status Updated', `Application moved to ${newStatus.replace('_', ' ').toUpperCase()}`);
    } catch (err: any) {
      console.error('Update status error:', err);
      Alert.alert('Error', err.message || 'Could not update application status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleToggleOpportunityStatus = async (opp: JobOpportunity, newStatus: 'approved' | 'closed') => {
    try {
      await JobCircleService.setOpportunityStatus(churchId, opp.id, newStatus, {
        adminId: user?.uid || 'admin',
        adminName: member?.name || user?.displayName || 'Admin',
      });
      setOpportunities(prev =>
        prev.map(o => (o.id === opp.id ? { ...o, status: newStatus } : o))
      );
      Alert.alert('Updated', `Opportunity marked as ${newStatus}.`);
    } catch (err) {
      console.error('Error updating opp status:', err);
      Alert.alert('Error', 'Could not update opportunity status.');
    }
  };

  // Metrics
  const activeOppsCount = opportunities.filter(o => o.status === 'approved').length;
  const pendingOppsCount = opportunities.filter(o => o.status === 'pending').length;
  const pendingAppsCount = applications.filter(a => a.status === 'submitted' || a.status === 'under_review').length;
  const shortlistedAppsCount = applications.filter(a => a.status === 'shortlisted' || a.status === 'meeting_scheduled').length;

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      {/* ── STANDARD ADMIN HERO HEADER (Matching other Admin Screens) ── */}
      <View
        style={[
          styles.hero,
          {
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
            borderBottomWidth: 1,
            borderBottomColor: adminBorderColor,
            paddingTop: Math.max(insets.top, 8),
          },
        ]}
      >
        <View style={styles.heroRow}>
          {/* Back Button -> Safely returns to Admin Dashboard */}
          <TouchableOpacity
            onPress={handleBack}
            style={[styles.circularBackBtn, { borderColor: adminBorderColor, backgroundColor: cardSurface }]}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={22} color={isDark ? '#FFFFFF' : '#1a2d5a'} strokeWidth={2.2} />
          </TouchableOpacity>

          {/* Centered Admin Title */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
            <Text
              style={[
                styles.heroTitle,
                {
                  color: isDark ? '#FFFFFF' : '#1a2d5a',
                  fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                },
              ]}
              numberOfLines={1}
            >
              Job Circle Management
            </Text>
          </View>

          {/* Post Action */}
          <TouchableOpacity
            style={[styles.circularBackBtn, { borderColor: adminBorderColor, backgroundColor: cardSurface }]}
            onPress={() => navigation.navigate('AdminOpportunityEditor')}
            activeOpacity={0.7}
          >
            <Plus size={22} color={isDark ? '#FFFFFF' : '#1a2d5a'} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        {/* ── SEGMENT TABS (Standard Admin Style) ── */}
        <View style={{ paddingHorizontal: 16, marginTop: 12, marginBottom: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentContainer}>
            {(
              [
                { id: 'overview', label: 'Overview' },
                { id: 'opportunities', label: `Openings (${opportunities.length})` },
                { id: 'applications', label: `Applicants (${applications.length})` },
              ] as const
            ).map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.segmentTab,
                    isActive
                      ? { backgroundColor: isDark ? '#27272A' : '#1a2d5a' }
                      : { backgroundColor: 'transparent' },
                  ]}
                  onPress={() => setActiveTab(tab.id)}
                >
                  <Text
                    style={[
                      styles.segmentTabText,
                      { color: isActive ? '#FFFFFF' : secondaryText },
                      isActive && { fontWeight: '700' },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#1a2d5a" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <View>
              {/* Metric Cards Grid */}
              <View style={styles.metricsGrid}>
                <View style={[styles.metricCard, { backgroundColor: cardSurface, borderColor: adminBorderColor }]}>
                  <Briefcase size={22} color="#1a2d5a" />
                  <Text style={[styles.metricNumber, { color: primaryText }]}>{activeOppsCount}</Text>
                  <Text style={[styles.metricLabel, { color: secondaryText }]}>Active Opportunities</Text>
                </View>

                <View style={[styles.metricCard, { backgroundColor: cardSurface, borderColor: adminBorderColor }]}>
                  <Clock size={22} color="#b45309" />
                  <Text style={[styles.metricNumber, { color: primaryText }]}>{pendingAppsCount}</Text>
                  <Text style={[styles.metricLabel, { color: secondaryText }]}>Pending Reviews</Text>
                </View>

                <View style={[styles.metricCard, { backgroundColor: cardSurface, borderColor: adminBorderColor }]}>
                  <Users size={22} color="#15803d" />
                  <Text style={[styles.metricNumber, { color: primaryText }]}>{shortlistedAppsCount}</Text>
                  <Text style={[styles.metricLabel, { color: secondaryText }]}>Shortlisted / Interview</Text>
                </View>

                <View style={[styles.metricCard, { backgroundColor: cardSurface, borderColor: adminBorderColor }]}>
                  <CheckCircle2 size={22} color="#1a2d5a" />
                  <Text style={[styles.metricNumber, { color: primaryText }]}>{applications.length}</Text>
                  <Text style={[styles.metricLabel, { color: secondaryText }]}>Total Applicants</Text>
                </View>
              </View>

              {/* Action Banners */}
              <TouchableOpacity
                style={[styles.actionBanner, { backgroundColor: '#1a2d5a' }]}
                onPress={() => navigation.navigate('AdminOpportunityEditor')}
              >
                <Plus size={20} color="#fff" />
                <Text style={styles.actionBannerText}>Post New Ministry Opportunity</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBanner, { backgroundColor: cardSurface, borderColor: adminBorderColor, borderWidth: 1, marginTop: 12 }]}
                onPress={() => {
                  if (setTabByName) {
                    setTabByName('Volunteer Management');
                  } else if (navigation?.navigate) {
                    navigation.navigate('Admin', { targetTab: 'Volunteer Management' });
                  }
                }}
              >
                <HeartHandshake size={20} color="#1a2d5a" />
                <Text style={[styles.actionBannerText, { color: primaryText }]}>Open Volunteer Management</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* OPPORTUNITIES TAB */}
          {activeTab === 'opportunities' && (
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { color: primaryText }]}>Ministry Postings</Text>
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: '#1a2d5a' }]}
                  onPress={() => navigation.navigate('AdminOpportunityEditor')}
                >
                  <Plus size={16} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>New</Text>
                </TouchableOpacity>
              </View>

              {opportunities.map(opp => (
                <View key={opp.id} style={[styles.card, { backgroundColor: cardSurface, borderColor: adminBorderColor }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: primaryText }]}>{opp.title}</Text>
                      <Text style={[styles.cardSub, { color: secondaryText }]}>{opp.categoryName} • {opp.timeCommitment}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: opp.status === 'approved' ? '#E1F5EE' : '#FEF3C7' }]}>
                      <Text style={[styles.statusText, { color: opp.status === 'approved' ? '#15803d' : '#b45309' }]}>
                        {opp.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={[styles.btnOutline, { borderColor: adminBorderColor }]}
                      onPress={() => navigation.navigate('AdminOpportunityEditor', { opportunity: opp })}
                    >
                      <Edit size={14} color={primaryText} style={{ marginRight: 4 }} />
                      <Text style={{ color: primaryText, fontSize: 12, fontWeight: '600' }}>Edit</Text>
                    </TouchableOpacity>

                    {opp.status !== 'approved' && (
                      <TouchableOpacity
                        style={[styles.btnOutline, { borderColor: '#15803d', backgroundColor: '#E1F5EE' }]}
                        onPress={() => handleToggleOpportunityStatus(opp, 'approved')}
                      >
                        <CheckCircle2 size={14} color="#15803d" style={{ marginRight: 4 }} />
                        <Text style={{ color: '#15803d', fontSize: 12, fontWeight: '600' }}>Approve</Text>
                      </TouchableOpacity>
                    )}

                    {opp.status === 'approved' && (
                      <TouchableOpacity
                        style={[styles.btnOutline, { borderColor: '#dc2626' }]}
                        onPress={() => handleToggleOpportunityStatus(opp, 'closed')}
                      >
                        <XCircle size={14} color="#dc2626" style={{ marginRight: 4 }} />
                        <Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '600' }}>Close</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* APPLICATIONS TAB */}
          {activeTab === 'applications' && (
            <View>
              <Text style={[styles.sectionTitle, { color: primaryText, marginBottom: 12 }]}>
                Applicant Review Pipeline
              </Text>

              {applications.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: cardSurface, borderColor: adminBorderColor }]}>
                  <Text style={{ color: secondaryText }}>No applications submitted yet.</Text>
                </View>
              ) : (
                applications.map(app => (
                  <TouchableOpacity
                    key={app.id}
                    style={[styles.card, { backgroundColor: cardSurface, borderColor: adminBorderColor }]}
                    onPress={() => handleOpenReview(app)}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styles.cardTitle, { color: primaryText }]}>{app.memberName}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: '#EFF6FF' }]}>
                        <Text style={[styles.statusText, { color: '#2563EB' }]}>
                          {app.status.replace('_', ' ').toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.cardSub, { color: '#1a2d5a', fontWeight: '600', marginTop: 2 }]}>
                      Applied for: {app.opportunityTitle}
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Phone size={13} color={secondaryText} />
                        <Text style={{ fontSize: 12, color: secondaryText }}>{app.memberPhone}</Text>
                      </View>
                      {app.resumeAttachment && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <FileText size={13} color="#1a2d5a" />
                          <Text style={{ fontSize: 12, color: '#1a2d5a', fontWeight: '600' }}>CV Attached</Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* Review Modal */}
      <Modal visible={reviewModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardSurface, maxHeight: '85%' }]}>
            {selectedApp && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[styles.modalTitle, { color: primaryText }]}>{selectedApp.memberName}</Text>
                <Text style={[styles.modalSub, { color: '#1a2d5a' }]}>
                  Role: {selectedApp.opportunityTitle}
                </Text>

                {/* Candidate Contact */}
                <View style={[styles.detailBox, { backgroundColor: screenBg, borderColor: adminBorderColor }]}>
                  <Text style={{ fontSize: 13, color: primaryText }}>Phone: {selectedApp.memberPhone}</Text>
                  {selectedApp.memberEmail ? (
                    <Text style={{ fontSize: 13, color: primaryText, marginTop: 4 }}>
                      Email: {selectedApp.memberEmail}
                    </Text>
                  ) : null}
                </View>

                {/* Calling Statement / Message */}
                {selectedApp.applicationMessage ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.fieldLabel, { color: primaryText }]}>Applicant Calling Statement</Text>
                    <View style={[styles.detailBox, { backgroundColor: screenBg, borderColor: adminBorderColor }]}>
                      <Text style={{ fontSize: 13, color: secondaryText, lineHeight: 18 }}>
                        {selectedApp.applicationMessage}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* CV / Resume Attachment Link */}
                {selectedApp.resumeAttachment ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.fieldLabel, { color: primaryText }]}>Attached Resume / CV</Text>
                    <TouchableOpacity
                      style={[styles.resumeLinkBox, { borderColor: '#1a2d5a' }]}
                      onPress={() => Linking.openURL(selectedApp.resumeAttachment!.url)}
                    >
                      <FileText size={18} color="#1a2d5a" />
                      <Text style={[styles.resumeName, { color: '#1a2d5a' }]} numberOfLines={1}>
                        {selectedApp.resumeAttachment.fileName}
                      </Text>
                      <ExternalLink size={16} color="#1a2d5a" />
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Admin Notes */}
                <Text style={[styles.fieldLabel, { color: primaryText, marginTop: 14 }]}>Admin / Leader Notes</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: screenBg, borderColor: adminBorderColor, color: primaryText }]}
                  placeholder="Internal review notes..."
                  placeholderTextColor={secondaryText}
                  value={adminNotes}
                  onChangeText={setAdminNotes}
                />

                {/* Status Transitions */}
                <Text style={[styles.fieldLabel, { color: primaryText, marginTop: 16 }]}>Update Status</Text>
                <View style={styles.statusActionRow}>
                  <TouchableOpacity
                    style={[styles.statusBtn, { backgroundColor: '#EFF6FF' }]}
                    onPress={() => handleUpdateStatus('under_review')}
                    disabled={updatingStatus}
                  >
                    <Text style={{ color: '#2563EB', fontWeight: '700', fontSize: 12 }}>Under Review</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.statusBtn, { backgroundColor: '#FEF3C7' }]}
                    onPress={() => handleUpdateStatus('meeting_scheduled')}
                    disabled={updatingStatus}
                  >
                    <Text style={{ color: '#b45309', fontWeight: '700', fontSize: 12 }}>Schedule Interview</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.statusBtn, { backgroundColor: '#E1F5EE' }]}
                    onPress={() => handleUpdateStatus('selected')}
                    disabled={updatingStatus}
                  >
                    <Text style={{ color: '#15803d', fontWeight: '700', fontSize: 12 }}>Select / Appoint</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.statusBtn, { backgroundColor: '#FEE2E2' }]}
                    onPress={() => handleUpdateStatus('rejected')}
                    disabled={updatingStatus}
                  >
                    <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 12 }}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            <TouchableOpacity
              style={[styles.closeModalBtn, { borderColor: adminBorderColor, marginTop: 16 }]}
              onPress={() => setReviewModalVisible(false)}
            >
              <Text style={{ color: primaryText, fontWeight: '600' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = createAdminThemedStyles(
  StyleSheet.create({
    container: { flex: 1 },
    hero: { paddingBottom: 6 },
    heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
    circularBackBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    heroTitle: { fontSize: 19, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
    segmentContainer: {
      flexDirection: 'row',
      gap: 6,
      paddingVertical: 2,
    },
    segmentTab: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 18,
    },
    segmentTabText: {
      fontSize: 13,
      fontWeight: '600',
    },
    loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { padding: 16 },
    metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
    metricCard: { width: '48%', padding: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
    metricNumber: { fontSize: 24, fontWeight: '800', marginVertical: 4 },
    metricLabel: { fontSize: 12, textAlign: 'center' },
    actionBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, gap: 8 },
    actionBannerText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
    sectionTitle: { fontSize: 17, fontWeight: '700' },
    addBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    card: { padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
    cardTitle: { fontSize: 16, fontWeight: '700' },
    cardSub: { fontSize: 13, marginTop: 2 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    statusText: { fontSize: 11, fontWeight: '700' },
    cardActionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    btnOutline: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
    emptyBox: { padding: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
    modalTitle: { fontSize: 20, fontWeight: '700' },
    modalSub: { fontSize: 14, fontWeight: '600', marginBottom: 12 },
    detailBox: { padding: 12, borderRadius: 10, borderWidth: 1 },
    fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
    resumeLinkBox: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, borderWidth: 1, gap: 10 },
    resumeName: { flex: 1, fontSize: 13, fontWeight: '600' },
    input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14 },
    statusActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    statusBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
    closeModalBtn: { paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  })
);
