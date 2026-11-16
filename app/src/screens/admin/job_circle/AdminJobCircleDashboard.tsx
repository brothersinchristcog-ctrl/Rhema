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
  Alert,
  Modal,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
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
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { useTheme } from '../../../context/ThemeContext';
import { Colors } from '../../../theme/Theme';
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

  const [activeTab, setActiveTab] = useState<'overview' | 'opportunities' | 'applications' | 'teams' | 'volunteers'>('overview');
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
          <Text style={styles.headerTitle}>Job Circle Management</Text>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('AdminOpportunityEditor')}
          >
            <Plus size={22} color="#ffffff" />
          </TouchableOpacity>
        </View>

        {/* Tab Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {(
            [
              { id: 'overview', label: 'Overview' },
              { id: 'opportunities', label: `Openings (${opportunities.length})` },
              { id: 'applications', label: `Applicants (${applications.length})` },
              { id: 'teams', label: 'Ministry Teams' },
              { id: 'volunteers', label: 'Volunteers' },
            ] as const
          ).map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.tabPill,
                  isActive
                    ? { backgroundColor: '#ffffff' }
                    : { backgroundColor: 'rgba(255,255,255,0.15)' },
                ]}
                onPress={() => {
                  if (tab.id === 'volunteers') {
                    navigation.navigate('AdminVolunteerManagement');
                  } else if (tab.id === 'teams') {
                    navigation.navigate('AdminMinistryTeamsScreen');
                  } else {
                    setActiveTab(tab.id);
                  }
                }}
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

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={theme.accent || Colors.primary} />
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
                <View style={[styles.metricCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Briefcase size={22} color={theme.accent || Colors.primary} />
                  <Text style={[styles.metricNumber, { color: theme.text }]}>{activeOppsCount}</Text>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Active Opportunities</Text>
                </View>

                <View style={[styles.metricCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Clock size={22} color={Colors.warning} />
                  <Text style={[styles.metricNumber, { color: theme.text }]}>{pendingAppsCount}</Text>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Pending Reviews</Text>
                </View>

                <View style={[styles.metricCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Users size={22} color={Colors.success} />
                  <Text style={[styles.metricNumber, { color: theme.text }]}>{shortlistedAppsCount}</Text>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Shortlisted / Interview</Text>
                </View>

                <View style={[styles.metricCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <CheckCircle2 size={22} color={Colors.primary} />
                  <Text style={[styles.metricNumber, { color: theme.text }]}>{applications.length}</Text>
                  <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Total Applicants</Text>
                </View>
              </View>

              {/* Action Banners */}
              <TouchableOpacity
                style={[styles.actionBanner, { backgroundColor: theme.accent || Colors.primary }]}
                onPress={() => navigation.navigate('AdminOpportunityEditor')}
              >
                <Plus size={20} color="#fff" />
                <Text style={styles.actionBannerText}>Post New Ministry Opportunity</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBanner, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, marginTop: 12 }]}
                onPress={() => navigation.navigate('AdminVolunteerManagement')}
              >
                <HeartHandshake size={20} color={Colors.primary} />
                <Text style={[styles.actionBannerText, { color: theme.text }]}>Open Volunteer Management</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* OPPORTUNITIES TAB */}
          {activeTab === 'opportunities' && (
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Ministry Postings</Text>
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: theme.accent || Colors.primary }]}
                  onPress={() => navigation.navigate('AdminOpportunityEditor')}
                >
                  <Plus size={16} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>New</Text>
                </TouchableOpacity>
              </View>

              {opportunities.map(opp => (
                <View key={opp.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardTitle, { color: theme.text }]}>{opp.title}</Text>
                      <Text style={[styles.cardSub, { color: theme.textSecondary }]}>{opp.categoryName} • {opp.timeCommitment}</Text>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: opp.status === 'approved' ? '#E1F5EE' : Colors.goldLight }]}>
                      <Text style={[styles.statusText, { color: opp.status === 'approved' ? Colors.success : Colors.warning }]}>
                        {opp.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={[styles.btnOutline, { borderColor: theme.border }]}
                      onPress={() => navigation.navigate('AdminOpportunityEditor', { opportunity: opp })}
                    >
                      <Edit size={14} color={theme.text} style={{ marginRight: 4 }} />
                      <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>Edit</Text>
                    </TouchableOpacity>

                    {opp.status !== 'approved' && (
                      <TouchableOpacity
                        style={[styles.btnOutline, { borderColor: Colors.success, backgroundColor: '#E1F5EE' }]}
                        onPress={() => handleToggleOpportunityStatus(opp, 'approved')}
                      >
                        <CheckCircle2 size={14} color={Colors.success} style={{ marginRight: 4 }} />
                        <Text style={{ color: Colors.success, fontSize: 12, fontWeight: '600' }}>Approve</Text>
                      </TouchableOpacity>
                    )}

                    {opp.status === 'approved' && (
                      <TouchableOpacity
                        style={[styles.btnOutline, { borderColor: Colors.error }]}
                        onPress={() => handleToggleOpportunityStatus(opp, 'closed')}
                      >
                        <XCircle size={14} color={Colors.error} style={{ marginRight: 4 }} />
                        <Text style={{ color: Colors.error, fontSize: 12, fontWeight: '600' }}>Close</Text>
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
              <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 12 }]}>
                Applicant Review Pipeline
              </Text>

              {applications.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Text style={{ color: theme.textSecondary }}>No applications submitted yet.</Text>
                </View>
              ) : (
                applications.map(app => (
                  <TouchableOpacity
                    key={app.id}
                    style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}
                    onPress={() => handleOpenReview(app)}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styles.cardTitle, { color: theme.text }]}>{app.memberName}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: '#EFF6FF' }]}>
                        <Text style={[styles.statusText, { color: '#2563EB' }]}>
                          {app.status.replace('_', ' ').toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.cardSub, { color: theme.accent || Colors.primary, fontWeight: '600', marginTop: 2 }]}>
                      Applied for: {app.opportunityTitle}
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Phone size={13} color={theme.textSecondary} />
                        <Text style={{ fontSize: 12, color: theme.textSecondary }}>{app.memberPhone}</Text>
                      </View>
                      {app.resumeAttachment && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <FileText size={13} color={Colors.primary} />
                          <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '600' }}>CV Attached</Text>
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
          <View style={[styles.modalCard, { backgroundColor: theme.surface, maxHeight: '85%' }]}>
            {selectedApp && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>{selectedApp.memberName}</Text>
                <Text style={[styles.modalSub, { color: theme.accent || Colors.primary }]}>
                  Role: {selectedApp.opportunityTitle}
                </Text>

                {/* Candidate Contact */}
                <View style={[styles.detailBox, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                  <Text style={{ fontSize: 13, color: theme.text }}>Phone: {selectedApp.memberPhone}</Text>
                  {selectedApp.memberEmail ? (
                    <Text style={{ fontSize: 13, color: theme.text, marginTop: 4 }}>
                      Email: {selectedApp.memberEmail}
                    </Text>
                  ) : null}
                </View>

                {/* Calling Statement / Message */}
                {selectedApp.applicationMessage ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.fieldLabel, { color: theme.text }]}>Applicant Calling Statement</Text>
                    <View style={[styles.detailBox, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                      <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
                        {selectedApp.applicationMessage}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* CV / Resume Attachment Link */}
                {selectedApp.resumeAttachment ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.fieldLabel, { color: theme.text }]}>Attached Resume / CV</Text>
                    <TouchableOpacity
                      style={[styles.resumeLinkBox, { borderColor: Colors.primary }]}
                      onPress={() => Linking.openURL(selectedApp.resumeAttachment!.url)}
                    >
                      <FileText size={18} color={Colors.primary} />
                      <Text style={[styles.resumeName, { color: Colors.primary }]} numberOfLines={1}>
                        {selectedApp.resumeAttachment.fileName}
                      </Text>
                      <ExternalLink size={16} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Admin Notes */}
                <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 14 }]}>Admin / Leader Notes</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: theme.bg, borderColor: theme.border, color: theme.text }]}
                  placeholder="Internal review notes..."
                  placeholderTextColor={theme.textSecondary}
                  value={adminNotes}
                  onChangeText={setAdminNotes}
                />

                {/* Status Transitions */}
                <Text style={[styles.fieldLabel, { color: theme.text, marginTop: 16 }]}>Update Status</Text>
                <View style={styles.statusActionRow}>
                  <TouchableOpacity
                    style={[styles.statusBtn, { backgroundColor: '#EFF6FF' }]}
                    onPress={() => handleUpdateStatus('under_review')}
                    disabled={updatingStatus}
                  >
                    <Text style={{ color: '#2563EB', fontWeight: '700', fontSize: 12 }}>Under Review</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.statusBtn, { backgroundColor: Colors.goldLight }]}
                    onPress={() => handleUpdateStatus('meeting_scheduled')}
                    disabled={updatingStatus}
                  >
                    <Text style={{ color: Colors.warning, fontWeight: '700', fontSize: 12 }}>Schedule Interview</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.statusBtn, { backgroundColor: '#E1F5EE' }]}
                    onPress={() => handleUpdateStatus('selected')}
                    disabled={updatingStatus}
                  >
                    <Text style={{ color: Colors.success, fontWeight: '700', fontSize: 12 }}>Select / Appoint</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.statusBtn, { backgroundColor: '#FEE2E2' }]}
                    onPress={() => handleUpdateStatus('rejected')}
                    disabled={updatingStatus}
                  >
                    <Text style={{ color: Colors.error, fontWeight: '700', fontSize: 12 }}>Reject</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}

            <TouchableOpacity
              style={[styles.closeModalBtn, { borderColor: theme.border, marginTop: 16 }]}
              onPress={() => setReviewModalVisible(false)}
            >
              <Text style={{ color: theme.text, fontWeight: '600' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  iconBtn: { padding: 8 },
  tabRow: { flexDirection: 'row', gap: 8 },
  tabPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  tabPillText: { fontSize: 12, fontWeight: '600' },
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
});
