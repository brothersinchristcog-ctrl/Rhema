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
  Filter,
  Trash2,
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

const SERIF = Platform.OS === 'ios' ? 'Georgia' : 'serif';

const colors = {
  moss: '#2E7D32',
  mossDeep: '#1B5E20',
  gold: '#F59E0B',
  goldDeep: '#B45309',
  clay: '#D97706',
  ink: '#0F172A',
  inkSoft: '#475569',
};

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
  } = useAdminTheme();

  const churchId = activeChurch?.id || 'rhema';

  const [activeTab, setActiveTab] = useState<'overview' | 'opportunities' | 'applications'>('overview');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'pending' | 'total'>('all');
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

  const handleDeleteOpportunity = (opp: JobOpportunity) => {
    Alert.alert(
      'Delete Opportunity',
      `Are you sure you want to delete "${opp.title}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await JobCircleService.deleteOpportunity(churchId, opp.id);
              setOpportunities(prev => prev.filter(o => o.id !== opp.id));
              Alert.alert('Deleted', 'Ministry opportunity removed successfully.');
            } catch (err: any) {
              console.error('Error deleting opp:', err);
              Alert.alert('Error', err?.message || 'Could not delete opportunity.');
            }
          },
        },
      ]
    );
  };

  // Metrics
  const activeOppsCount = opportunities.filter(o => o.status === 'approved').length;
  const pendingAppsCount = applications.filter(a => a.status === 'submitted' || a.status === 'under_review').length;
  const totalAppsCount = applications.length;

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      {/* ── 1. HERO SECTION (Exact Same Design As Daily Promise Tab) ── */}
      <View
        style={[
          styles.hero,
          {
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
            borderBottomWidth: 1,
            borderBottomColor: isDark ? '#27272A' : '#E2E8F0',
            paddingBottom: 14,
            marginBottom: 4,
          },
        ]}
      >
        <View style={styles.heroRow}>
          {/* Circular Back Button (Returns directly to Dashboard) */}
          <TouchableOpacity
            onPress={handleBack}
            style={[styles.circularBackBtn, { borderColor: isDark ? '#3F3F46' : '#E2E8F0', backgroundColor: isDark ? '#18181B' : '#FFFFFF' }]}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ArrowLeft size={22} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.2} />
          </TouchableOpacity>

          {/* Centered Serif Title */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text
              style={[
                styles.heroTitle,
                {
                  color: isDark ? '#FFFFFF' : '#0F172A',
                  fontFamily: SERIF,
                },
              ]}
              numberOfLines={1}
            >
              Job Circle
            </Text>
          </View>

          {/* Clean Pill Action Button matching Daily Promise "+ New Promise" */}
          <TouchableOpacity
            style={[
              styles.newBtn,
              {
                backgroundColor: isDark ? '#FFFFFF' : '#000000',
                borderColor: isDark ? '#FFFFFF' : '#000000',
              },
            ]}
            onPress={() => navigation.navigate('AdminOpportunityEditor')}
            activeOpacity={0.8}
          >
            <Text style={[styles.newBtnTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
              + New Role
            </Text>
          </TouchableOpacity>
        </View>

        {/* Sub-tabs segment (Overview / Openings / Applicants) */}
        <View style={{ paddingHorizontal: 16, marginTop: 12, marginBottom: 2 }}>
          <View style={styles.segmentContainer}>
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
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color="#1a2d5a" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 30 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {/* ── 2. STATISTICS CARDS (Exact Match to Daily Promise Stat Cards) ── */}
          {activeTab === 'overview' && (
            <View>
              <View style={styles.statsRow}>
                {/* 1. Active Opportunities (Moss Green / Success) */}
                <TouchableOpacity
                  style={[
                    styles.statBox,
                    {
                      backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                      borderColor: activeFilter === 'active'
                        ? (isDark ? '#34D399' : colors.moss)
                        : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(62, 107, 82, 0.22)'),
                      borderWidth: activeFilter === 'active' ? 1.8 : 1,
                    },
                  ]}
                  onPress={() => setActiveFilter(prev => (prev === 'active' ? 'all' : 'active'))}
                  activeOpacity={0.75}
                >
                  <LinearGradient
                    colors={
                      isDark
                        ? ['rgba(52, 211, 153, 0.14)', 'rgba(39, 39, 42, 0.55)', 'rgba(15, 15, 18, 0.90)']
                        : ['#FFFFFF', '#F7FCF9', '#ECFDF5']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.statGlassInner}
                  >
                    <View style={[styles.statNotch, { backgroundColor: isDark ? '#34D399' : colors.moss }]} />
                    <Text style={[styles.statNum, { color: isDark ? '#34D399' : colors.moss, fontFamily: SERIF }]}>
                      {activeOppsCount}
                    </Text>
                    <View style={styles.statLabelRow}>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: isDark ? '#E4E4E7' : colors.inkSoft },
                          activeFilter === 'active' && { color: isDark ? '#34D399' : colors.moss },
                        ]}
                      >
                        Active
                      </Text>
                      {activeFilter === 'active' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#34D399' : colors.moss }]} />}
                    </View>
                    <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                      {activeFilter === 'active' ? 'Active ✓' : 'Opportunities'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* 2. Pending Reviews (Amber Gold / Warning) */}
                <TouchableOpacity
                  style={[
                    styles.statBox,
                    {
                      backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                      borderColor: activeFilter === 'pending'
                        ? (isDark ? '#FBBF24' : colors.goldDeep)
                        : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(166, 124, 61, 0.24)'),
                      borderWidth: activeFilter === 'pending' ? 1.8 : 1,
                    },
                  ]}
                  onPress={() => setActiveFilter(prev => (prev === 'pending' ? 'all' : 'pending'))}
                  activeOpacity={0.75}
                >
                  <LinearGradient
                    colors={
                      isDark
                        ? ['rgba(251, 191, 36, 0.14)', 'rgba(39, 39, 42, 0.55)', 'rgba(15, 15, 18, 0.90)']
                        : ['#FFFFFF', '#FFFDF7', '#FEF3C7']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.statGlassInner}
                  >
                    <View style={[styles.statNotch, { backgroundColor: isDark ? '#FBBF24' : colors.gold }]} />
                    <Text style={[styles.statNum, { color: isDark ? '#FBBF24' : colors.goldDeep, fontFamily: SERIF }]}>
                      {pendingAppsCount}
                    </Text>
                    <View style={styles.statLabelRow}>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: isDark ? '#E4E4E7' : colors.inkSoft },
                          activeFilter === 'pending' && { color: isDark ? '#FBBF24' : colors.goldDeep },
                        ]}
                      >
                        Pending
                      </Text>
                      {activeFilter === 'pending' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#FBBF24' : colors.goldDeep }]} />}
                    </View>
                    <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                      {activeFilter === 'pending' ? 'Active ✓' : 'Reviews'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* 3. Total Applicants (Clay / Blue / Neutral) */}
                <TouchableOpacity
                  style={[
                    styles.statBox,
                    {
                      backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                      borderColor: activeFilter === 'total'
                        ? (isDark ? '#60A5FA' : '#1E40AF')
                        : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(30, 64, 175, 0.22)'),
                      borderWidth: activeFilter === 'total' ? 1.8 : 1,
                    },
                  ]}
                  onPress={() => setActiveFilter(prev => (prev === 'total' ? 'all' : 'total'))}
                  activeOpacity={0.75}
                >
                  <LinearGradient
                    colors={
                      isDark
                        ? ['rgba(96, 165, 250, 0.14)', 'rgba(39, 39, 42, 0.55)', 'rgba(15, 15, 18, 0.90)']
                        : ['#FFFFFF', '#F8FAFC', '#EFF6FF']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.statGlassInner}
                  >
                    <View style={[styles.statNotch, { backgroundColor: isDark ? '#60A5FA' : '#1E40AF' }]} />
                    <Text style={[styles.statNum, { color: isDark ? '#60A5FA' : '#1E40AF', fontFamily: SERIF }]}>
                      {totalAppsCount}
                    </Text>
                    <View style={styles.statLabelRow}>
                      <Text
                        style={[
                          styles.statLabel,
                          { color: isDark ? '#E4E4E7' : colors.inkSoft },
                          activeFilter === 'total' && { color: isDark ? '#60A5FA' : '#1E40AF' },
                        ]}
                      >
                        Total
                      </Text>
                      {activeFilter === 'total' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#60A5FA' : '#1E40AF' }]} />}
                    </View>
                    <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                      {activeFilter === 'total' ? 'Active ✓' : 'Applicants'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              {/* ── 3. REDESIGNED ACTION BUTTONS (Clean, Modern, Consistent) ── */}
              <View style={styles.actionBtnGroup}>
                {/* Primary Action: Post New Ministry Opportunity */}
                <TouchableOpacity
                  style={[
                    styles.primaryActionBtn,
                    {
                      backgroundColor: isDark ? '#FFFFFF' : '#000000',
                      borderColor: isDark ? '#FFFFFF' : '#000000',
                    },
                  ]}
                  onPress={() => navigation.navigate('AdminOpportunityEditor')}
                  activeOpacity={0.8}
                >
                  <Briefcase size={16} color={isDark ? '#000000' : '#FFFFFF'} />
                  <Text style={[styles.primaryActionTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                    Post New Ministry Opportunity
                  </Text>
                </TouchableOpacity>

                {/* Secondary Action: Open Volunteer Management */}
                <TouchableOpacity
                  style={[
                    styles.secondaryActionBtn,
                    {
                      backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                      borderColor: isDark ? '#3F3F46' : '#CBD5E1',
                    },
                  ]}
                  onPress={() => {
                    if (setTabByName) {
                      setTabByName('Volunteer Management');
                    } else if (navigation?.navigate) {
                      navigation.navigate('Admin', { targetTab: 'Volunteer Management' });
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <HeartHandshake size={16} color={isDark ? '#E2E8F0' : '#1a2d5a'} />
                  <Text style={[styles.secondaryActionTxt, { color: isDark ? '#E2E8F0' : '#1a2d5a' }]}>
                    Open Volunteer Management
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* OPPORTUNITIES TAB */}
          {activeTab === 'opportunities' && (
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { color: primaryText }]}>Ministry Postings</Text>
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

                    <TouchableOpacity
                      style={[styles.btnOutline, { borderColor: isDark ? '#3F3F46' : '#E2E8F0', paddingHorizontal: 10 }]}
                      onPress={() => handleDeleteOpportunity(opp)}
                    >
                      <Trash2 size={14} color="#DC2626" />
                    </TouchableOpacity>
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
    heroTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4 },
    newBtn: {
      borderRadius: 999,
      paddingHorizontal: 13,
      paddingVertical: 7.5,
      borderWidth: 1.5,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    newBtnTxt: { fontWeight: '800', fontSize: 12 },
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

    // ── STATS CARDS (Exact match to AdminPromiseList) ──
    statsRow: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 16,
    },
    statBox: {
      flex: 1,
      borderRadius: 16,
      alignItems: 'center',
      elevation: 2,
      shadowColor: '#0F172A',
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      borderWidth: 1,
      overflow: 'hidden',
    },
    statGlassInner: {
      width: '100%',
      paddingVertical: 12,
      alignItems: 'center',
      position: 'relative',
    },
    statNotch: {
      position: 'absolute',
      top: -1,
      width: 32,
      height: 3.5,
      borderBottomLeftRadius: 4,
      borderBottomRightRadius: 4,
    },
    statNum: {
      fontSize: 25,
      fontWeight: '700',
      marginBottom: 2,
    },
    statLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    statLabel: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 1.1, fontWeight: '700' },
    activeIndicatorDot: { width: 6, height: 6, borderRadius: 3 },
    statHintTxt: { fontSize: 8.5, fontWeight: '600', marginTop: 2, letterSpacing: 0.3 },

    // ── REDESIGNED ACTION BUTTONS ──
    actionBtnGroup: {
      flexDirection: 'column',
      gap: 10,
      marginBottom: 20,
    },
    primaryActionBtn: {
      width: '100%',
      borderRadius: 999,
      paddingVertical: 14,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1.5,
      elevation: 3,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
    },
    primaryActionTxt: {
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 0.2,
    },
    secondaryActionBtn: {
      width: '100%',
      borderRadius: 999,
      paddingVertical: 14,
      paddingHorizontal: 20,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1.5,
      elevation: 1,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
    },
    secondaryActionTxt: {
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0.2,
    },

    sectionTitle: { fontSize: 17, fontWeight: '700' },
    addBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
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
