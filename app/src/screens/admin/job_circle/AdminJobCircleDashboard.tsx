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
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
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
  Eye,
  Star,
  UserCheck,
  MapPin,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useChurch } from '../../../context/ChurchContext';
import { AdminTabContext } from '../../../context/AdminTabContext';
import { useAdminTheme, createAdminThemedStyles } from '../../../utils/adminThemeHelper';
import JobCircleService from '../../../services/JobCircleService';
import InAppDocumentViewerModal from '../../../components/InAppDocumentViewerModal';
import {
  JobOpportunity,
  JobApplication,
  JobApplicationStatus,
} from '../../../types/jobCircle';

interface AdminJobCircleDashboardProps {
  navigation: any;
  routeParams?: any;
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

export default function AdminJobCircleDashboard({ navigation, routeParams }: AdminJobCircleDashboardProps) {
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

  // Integrated Stat Filters: all, active_opps, pending_opps, total_apps, under_review, shortlisted, selected, volunteers
  type StatFilter =
    | 'all'
    | 'active_opps'
    | 'pending_opps'
    | 'total_apps'
    | 'under_review'
    | 'shortlisted'
    | 'selected'
    | 'volunteers';

  const [selectedStat, setSelectedStat] = useState<StatFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data states
  const [opportunities, setOpportunities] = useState<JobOpportunity[]>([]);
  const [applications, setApplications] = useState<JobApplication[]>([]);

  // Application Review Modal State
  const [selectedApp, setSelectedApp] = useState<JobApplication | null>(null);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Interview Schedule Modal State
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [interviewDate, setInterviewDate] = useState(new Date());
  const [interviewTime, setInterviewTime] = useState('10:00 AM');
  const [interviewLocation, setInterviewLocation] = useState('Rhema Church / Online Meet');
  const [interviewNotes, setInterviewNotes] = useState('');
  const [isDatePickerVisible, setDatePickerVisible] = useState(false);
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);

  // In-App Resume / Document Viewer Modal State
  const [resumeDocToView, setResumeDocToView] = useState<{ url: string; name: string; mimeType?: string } | null>(null);

  useEffect(() => {
    loadAdminData();
  }, [churchId]);

  // Deep link handling when navigated with applicationId or targetTab from notification
  useEffect(() => {
    if (routeParams?.applicationId && applications.length > 0) {
      const target = applications.find(a => a.id === routeParams.applicationId);
      if (target) {
        handleOpenReview(target);
      }
    }
  }, [routeParams, applications]);

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
    setReviewModalVisible(true);
  };

  // Status Action: Under Review with confirmation dialog
  const handleSetUnderReview = () => {
    if (!selectedApp) return;
    Alert.alert(
      'Mark Under Review',
      `Move ${selectedApp.memberName}'s application for "${selectedApp.opportunityTitle}" into Under Review?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'default',
          onPress: async () => {
            try {
              setUpdatingStatus(true);
              await JobCircleService.updateApplicationStatus(churchId, selectedApp.id, 'under_review', {
                adminId: user?.uid || 'admin',
                adminName: member?.name || user?.displayName || 'Admin',
                adminNotes: adminNotes.trim(),
              });
              setApplications(prev =>
                prev.map(a => (a.id === selectedApp.id ? { ...a, status: 'under_review', adminNotes: adminNotes.trim() } : a))
              );
              setSelectedApp(prev => (prev ? { ...prev, status: 'under_review', adminNotes: adminNotes.trim() } : null));
              Alert.alert('Status Updated', 'Application marked as Under Review.');
            } catch (err: any) {
              console.error('Update status error:', err);
              Alert.alert('Error', err.message || 'Could not update application status.');
            } finally {
              setUpdatingStatus(false);
            }
          },
        },
      ]
    );
  };

  // Status Action: Open Interview Scheduler
  const handleOpenScheduleModal = () => {
    if (!selectedApp) return;
    setInterviewNotes(selectedApp.meetingNotes || '');
    setInterviewLocation(selectedApp.meetingLocation || 'Rhema Church / Online Meet');
    setInterviewTime(selectedApp.meetingTime || '10:00 AM');
    setScheduleModalVisible(true);
  };

  // Confirm Interview Schedule
  const handleConfirmScheduleInterview = async () => {
    if (!selectedApp) return;
    try {
      setUpdatingStatus(true);
      const dateStr = interviewDate.toISOString().split('T')[0];
      await JobCircleService.updateApplicationStatus(churchId, selectedApp.id, 'meeting_scheduled', {
        adminId: user?.uid || 'admin',
        adminName: member?.name || user?.displayName || 'Admin',
        meetingDate: dateStr,
        meetingTime: interviewTime.trim() || '10:00 AM',
        meetingLocation: interviewLocation.trim() || 'Rhema Church / Online Meet',
        meetingNotes: interviewNotes.trim(),
        adminNotes: adminNotes.trim(),
      });
      setApplications(prev =>
        prev.map(a =>
          a.id === selectedApp.id
            ? {
                ...a,
                status: 'meeting_scheduled',
                meetingDate: dateStr,
                meetingTime: interviewTime.trim() || '10:00 AM',
                meetingLocation: interviewLocation.trim() || 'Rhema Church / Online Meet',
                meetingNotes: interviewNotes.trim(),
                adminNotes: adminNotes.trim(),
              }
            : a
        )
      );
      setSelectedApp(prev =>
        prev
          ? {
              ...prev,
              status: 'meeting_scheduled',
              meetingDate: dateStr,
              meetingTime: interviewTime.trim() || '10:00 AM',
              meetingLocation: interviewLocation.trim() || 'Rhema Church / Online Meet',
              meetingNotes: interviewNotes.trim(),
            }
          : null
      );
      setScheduleModalVisible(false);
      Alert.alert('Interview Scheduled', `Meeting scheduled for ${dateStr} at ${interviewTime}. The applicant has been notified.`);
    } catch (err: any) {
      console.error('Schedule interview error:', err);
      Alert.alert('Error', err.message || 'Could not schedule interview.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Status Action: Select / Appoint
  const handleSelectAppoint = () => {
    if (!selectedApp) return;
    Alert.alert(
      'Confirm Appointment',
      `Are you sure you want to appoint ${selectedApp.memberName} to the "${selectedApp.opportunityTitle}" ministry?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Appoint',
          style: 'default',
          onPress: async () => {
            try {
              setUpdatingStatus(true);
              await JobCircleService.updateApplicationStatus(churchId, selectedApp.id, 'selected', {
                adminId: user?.uid || 'admin',
                adminName: member?.name || user?.displayName || 'Admin',
                adminNotes: adminNotes.trim(),
              });
              setApplications(prev =>
                prev.map(a => (a.id === selectedApp.id ? { ...a, status: 'selected', adminNotes: adminNotes.trim() } : a))
              );
              setSelectedApp(prev => (prev ? { ...prev, status: 'selected', adminNotes: adminNotes.trim() } : null));
              Alert.alert('Candidate Appointed', `${selectedApp.memberName} has been appointed to the ministry team!`);
            } catch (err: any) {
              console.error('Appoint error:', err);
              Alert.alert('Error', err.message || 'Could not appoint candidate.');
            } finally {
              setUpdatingStatus(false);
            }
          },
        },
      ]
    );
  };

  // Status Action: Reject with confirmation
  const handleRejectApplication = () => {
    if (!selectedApp) return;
    Alert.alert(
      'Confirm Rejection',
      `Are you sure you want to decline ${selectedApp.memberName}'s application for this ministry opportunity?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline Application',
          style: 'destructive',
          onPress: async () => {
            try {
              setUpdatingStatus(true);
              await JobCircleService.updateApplicationStatus(churchId, selectedApp.id, 'rejected', {
                adminId: user?.uid || 'admin',
                adminName: member?.name || user?.displayName || 'Admin',
                adminNotes: adminNotes.trim(),
              });
              setApplications(prev =>
                prev.map(a => (a.id === selectedApp.id ? { ...a, status: 'rejected', adminNotes: adminNotes.trim() } : a))
              );
              setSelectedApp(prev => (prev ? { ...prev, status: 'rejected', adminNotes: adminNotes.trim() } : null));
              Alert.alert('Application Updated', 'Application status updated to Rejected.');
            } catch (err: any) {
              console.error('Reject error:', err);
              Alert.alert('Error', err.message || 'Could not reject application.');
            } finally {
              setUpdatingStatus(false);
            }
          },
        },
      ]
    );
  };

  const handleDeleteApplication = (app: JobApplication) => {
    Alert.alert(
      'Delete Application',
      `Are you sure you want to delete the application submitted by "${app.memberName}" for "${app.opportunityTitle}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await JobCircleService.deleteApplication(churchId, app.id, app.opportunityId);
              setApplications(prev => prev.filter(a => a.id !== app.id));
              if (selectedApp?.id === app.id) {
                setReviewModalVisible(false);
                setSelectedApp(null);
              }
              Alert.alert('Deleted', 'Application removed successfully.');
            } catch (err: any) {
              console.error('Delete application error:', err);
              Alert.alert('Error', err?.message || 'Could not delete application.');
            }
          },
        },
      ]
    );
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
  const pendingOppsCount = opportunities.filter(o => o.status === 'pending' || o.status === 'draft').length;
  const totalOppsCount = opportunities.length;

  const totalAppsCount = applications.length;
  const underReviewCount = applications.filter(a => a.status === 'under_review').length;
  const shortlistedCount = applications.filter(a => a.status === 'shortlisted').length;
  const selectedCount = applications.filter(a => a.status === 'selected' || a.status === 'joined').length;
  const volunteerAppsCount = applications.filter(
    a => a.opportunityType === 'volunteer' || a.opportunityType === 'ministry_service'
  ).length;

  // Filtered Records based on the clicked Stat Card
  const showOpportunities =
    selectedStat === 'all' || selectedStat === 'active_opps' || selectedStat === 'pending_opps';
  const showApplications =
    selectedStat === 'all' ||
    selectedStat === 'total_apps' ||
    selectedStat === 'under_review' ||
    selectedStat === 'shortlisted' ||
    selectedStat === 'selected' ||
    selectedStat === 'volunteers';

  const filteredOpportunities = opportunities.filter(opp => {
    if (selectedStat === 'active_opps') return opp.status === 'approved';
    if (selectedStat === 'pending_opps') return opp.status === 'pending' || opp.status === 'draft';
    return true;
  });

  const filteredApplications = applications.filter(app => {
    if (selectedStat === 'under_review') return app.status === 'under_review';
    if (selectedStat === 'shortlisted') return app.status === 'shortlisted';
    if (selectedStat === 'selected') return app.status === 'selected' || app.status === 'joined';
    if (selectedStat === 'volunteers') {
      return app.opportunityType === 'volunteer' || app.opportunityType === 'ministry_service';
    }
    return true;
  });

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
            style={[
              styles.circularBackBtn,
              {
                borderColor: isDark ? '#3F3F46' : '#E2E8F0',
                backgroundColor: isDark ? '#18181B' : '#FFFFFF',
              },
            ]}
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
          {/* ── 2. INTERACTIVE STATISTICS CARDS (Clickable & Filter Records Below) ── */}
          <View style={styles.statsContainer}>
            {/* Row 1: Opportunities Stats */}
            <View style={styles.statsRow}>
              {/* Card 1: Total Opportunities */}
              <TouchableOpacity
                style={[
                  styles.statBox,
                  {
                    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                    borderColor:
                      selectedStat === 'all'
                        ? (isDark ? '#60A5FA' : '#1E40AF')
                        : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(30, 64, 175, 0.22)'),
                    borderWidth: selectedStat === 'all' ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedStat('all')}
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
                    {totalOppsCount}
                  </Text>
                  <View style={styles.statLabelRow}>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: isDark ? '#E4E4E7' : colors.inkSoft },
                        selectedStat === 'all' && { color: isDark ? '#60A5FA' : '#1E40AF' },
                      ]}
                    >
                      Total Roles
                    </Text>
                    {selectedStat === 'all' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#60A5FA' : '#1E40AF' }]} />}
                  </View>
                  <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                    {selectedStat === 'all' ? 'Selected ✓' : 'Tap to filter'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Card 2: Active Opportunities */}
              <TouchableOpacity
                style={[
                  styles.statBox,
                  {
                    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                    borderColor:
                      selectedStat === 'active_opps'
                        ? (isDark ? '#34D399' : colors.moss)
                        : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(62, 107, 82, 0.22)'),
                    borderWidth: selectedStat === 'active_opps' ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedStat(prev => (prev === 'active_opps' ? 'all' : 'active_opps'))}
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
                        selectedStat === 'active_opps' && { color: isDark ? '#34D399' : colors.moss },
                      ]}
                    >
                      Active
                    </Text>
                    {selectedStat === 'active_opps' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#34D399' : colors.moss }]} />}
                  </View>
                  <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                    {selectedStat === 'active_opps' ? 'Selected ✓' : 'Published'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Card 3: Pending Approvals */}
              <TouchableOpacity
                style={[
                  styles.statBox,
                  {
                    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                    borderColor:
                      selectedStat === 'pending_opps'
                        ? (isDark ? '#FBBF24' : colors.goldDeep)
                        : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(166, 124, 61, 0.24)'),
                    borderWidth: selectedStat === 'pending_opps' ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedStat(prev => (prev === 'pending_opps' ? 'all' : 'pending_opps'))}
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
                    {pendingOppsCount}
                  </Text>
                  <View style={styles.statLabelRow}>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: isDark ? '#E4E4E7' : colors.inkSoft },
                        selectedStat === 'pending_opps' && { color: isDark ? '#FBBF24' : colors.goldDeep },
                      ]}
                    >
                      Drafts
                    </Text>
                    {selectedStat === 'pending_opps' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#FBBF24' : colors.goldDeep }]} />}
                  </View>
                  <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                    {selectedStat === 'pending_opps' ? 'Selected ✓' : 'Unpublished'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Row 2: Applications Pipeline Stats */}
            <View style={[styles.statsRow, { marginTop: 10 }]}>
              {/* Card 4: Total Applications */}
              <TouchableOpacity
                style={[
                  styles.statBox,
                  {
                    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                    borderColor:
                      selectedStat === 'total_apps'
                        ? (isDark ? '#A78BFA' : '#7C3AED')
                        : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(124, 58, 237, 0.22)'),
                    borderWidth: selectedStat === 'total_apps' ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedStat(prev => (prev === 'total_apps' ? 'all' : 'total_apps'))}
                activeOpacity={0.75}
              >
                <LinearGradient
                  colors={
                    isDark
                      ? ['rgba(167, 139, 250, 0.14)', 'rgba(39, 39, 42, 0.55)', 'rgba(15, 15, 18, 0.90)']
                      : ['#FFFFFF', '#FAF5FF', '#F3E8FF']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.statGlassInner}
                >
                  <View style={[styles.statNotch, { backgroundColor: isDark ? '#A78BFA' : '#7C3AED' }]} />
                  <Text style={[styles.statNum, { color: isDark ? '#A78BFA' : '#7C3AED', fontFamily: SERIF }]}>
                    {totalAppsCount}
                  </Text>
                  <View style={styles.statLabelRow}>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: isDark ? '#E4E4E7' : colors.inkSoft },
                        selectedStat === 'total_apps' && { color: isDark ? '#A78BFA' : '#7C3AED' },
                      ]}
                    >
                      Applicants
                    </Text>
                    {selectedStat === 'total_apps' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#A78BFA' : '#7C3AED' }]} />}
                  </View>
                  <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                    {selectedStat === 'total_apps' ? 'Selected ✓' : 'All Candidates'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Card 5: Under Review */}
              <TouchableOpacity
                style={[
                  styles.statBox,
                  {
                    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                    borderColor:
                      selectedStat === 'under_review'
                        ? (isDark ? '#38BDF8' : '#0284C7')
                        : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(2, 132, 199, 0.22)'),
                    borderWidth: selectedStat === 'under_review' ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedStat(prev => (prev === 'under_review' ? 'all' : 'under_review'))}
                activeOpacity={0.75}
              >
                <LinearGradient
                  colors={
                    isDark
                      ? ['rgba(56, 189, 248, 0.14)', 'rgba(39, 39, 42, 0.55)', 'rgba(15, 15, 18, 0.90)']
                      : ['#FFFFFF', '#F0F9FF', '#E0F2FE']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.statGlassInner}
                >
                  <View style={[styles.statNotch, { backgroundColor: isDark ? '#38BDF8' : '#0284C7' }]} />
                  <Text style={[styles.statNum, { color: isDark ? '#38BDF8' : '#0284C7', fontFamily: SERIF }]}>
                    {underReviewCount}
                  </Text>
                  <View style={styles.statLabelRow}>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: isDark ? '#E4E4E7' : colors.inkSoft },
                        selectedStat === 'under_review' && { color: isDark ? '#38BDF8' : '#0284C7' },
                      ]}
                    >
                      In Review
                    </Text>
                    {selectedStat === 'under_review' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#38BDF8' : '#0284C7' }]} />}
                  </View>
                  <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                    {selectedStat === 'under_review' ? 'Selected ✓' : 'Under Review'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Card 6: Selected / Appointed */}
              <TouchableOpacity
                style={[
                  styles.statBox,
                  {
                    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                    borderColor:
                      selectedStat === 'selected'
                        ? (isDark ? '#34D399' : '#059669')
                        : (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(5, 150, 105, 0.22)'),
                    borderWidth: selectedStat === 'selected' ? 2 : 1,
                  },
                ]}
                onPress={() => setSelectedStat(prev => (prev === 'selected' ? 'all' : 'selected'))}
                activeOpacity={0.75}
              >
                <LinearGradient
                  colors={
                    isDark
                      ? ['rgba(52, 211, 153, 0.14)', 'rgba(39, 39, 42, 0.55)', 'rgba(15, 15, 18, 0.90)']
                      : ['#FFFFFF', '#ECFDF5', '#D1FAE5']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.statGlassInner}
                >
                  <View style={[styles.statNotch, { backgroundColor: isDark ? '#34D399' : '#059669' }]} />
                  <Text style={[styles.statNum, { color: isDark ? '#34D399' : '#059669', fontFamily: SERIF }]}>
                    {selectedCount}
                  </Text>
                  <View style={styles.statLabelRow}>
                    <Text
                      style={[
                        styles.statLabel,
                        { color: isDark ? '#E4E4E7' : colors.inkSoft },
                        selectedStat === 'selected' && { color: isDark ? '#34D399' : '#059669' },
                      ]}
                    >
                      Appointed
                    </Text>
                    {selectedStat === 'selected' && <View style={[styles.activeIndicatorDot, { backgroundColor: isDark ? '#34D399' : '#059669' }]} />}
                  </View>
                  <Text style={[styles.statHintTxt, { color: isDark ? '#A1A1AA' : '#64748B' }]}>
                    {selectedStat === 'selected' ? 'Selected ✓' : 'Appointed'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── 3. ACTION BUTTON ── */}
          <View style={styles.actionBtnGroup}>
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
          </View>

          {/* ── 4. FILTERED RECORDS (Displayed Directly Below Statistics Cards) ── */}

          {/* Section A: Ministry Openings (if relevant to selected stat) */}
          {showOpportunities && (
            <View style={{ marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { color: primaryText }]}>
                  Ministry Postings ({filteredOpportunities.length})
                </Text>
                {selectedStat !== 'all' && (
                  <TouchableOpacity onPress={() => setSelectedStat('all')}>
                    <Text style={{ color: isDark ? '#60A5FA' : '#1D4ED8', fontSize: 12, fontWeight: '700' }}>
                      Show All
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {filteredOpportunities.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: cardSurface, borderColor: adminBorderColor }]}>
                  <Text style={{ color: secondaryText }}>No ministry postings match this filter.</Text>
                </View>
              ) : (
                filteredOpportunities.map(opp => (
                  <View key={opp.id} style={[styles.card, { backgroundColor: cardSurface, borderColor: adminBorderColor }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardTitle, { color: primaryText }]}>{opp.title}</Text>
                        <Text style={[styles.cardSub, { color: isDark ? '#93C5FD' : '#1a2d5a', fontWeight: '600', marginTop: 2 }]}>
                          {opp.categoryName}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                          <Clock size={13} color={secondaryText} />
                          <Text style={{ fontSize: 12, color: secondaryText, flex: 1 }} numberOfLines={2}>
                            {opp.timeCommitment}
                          </Text>
                        </View>
                        {opp.location ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                            <MapPin size={13} color={secondaryText} />
                            <Text style={{ fontSize: 12, color: secondaryText }}>
                              {opp.location}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View
                        style={[
                          styles.statusBadge,
                          {
                            backgroundColor:
                              opp.status === 'approved'
                                ? (isDark ? 'rgba(16, 185, 129, 0.2)' : '#E1F5EE')
                                : (isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7'),
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusText,
                            {
                              color:
                                opp.status === 'approved'
                                  ? (isDark ? '#34D399' : '#15803d')
                                  : (isDark ? '#FBBF24' : '#b45309'),
                            },
                          ]}
                        >
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
                          style={[
                            styles.btnOutline,
                            {
                              borderColor: isDark ? '#059669' : '#15803d',
                              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : '#E1F5EE',
                            },
                          ]}
                          onPress={() => handleToggleOpportunityStatus(opp, 'approved')}
                        >
                          <CheckCircle2 size={14} color={isDark ? '#34D399' : '#15803d'} style={{ marginRight: 4 }} />
                          <Text style={{ color: isDark ? '#34D399' : '#15803d', fontSize: 12, fontWeight: '600' }}>
                            Publish
                          </Text>
                        </TouchableOpacity>
                      )}

                      {opp.status === 'approved' && (
                        <TouchableOpacity
                          style={[styles.btnOutline, { borderColor: isDark ? '#EF4444' : '#dc2626' }]}
                          onPress={() => handleToggleOpportunityStatus(opp, 'closed')}
                        >
                          <XCircle size={14} color={isDark ? '#F87171' : '#dc2626'} style={{ marginRight: 4 }} />
                          <Text style={{ color: isDark ? '#F87171' : '#dc2626', fontSize: 12, fontWeight: '600' }}>
                            Close
                          </Text>
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
                ))
              )}
            </View>
          )}

          {/* Section B: Applicant Review Pipeline */}
          {showApplications && (
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { color: primaryText }]}>
                  Applicant Review Pipeline ({filteredApplications.length})
                </Text>
                {selectedStat !== 'all' && (
                  <TouchableOpacity onPress={() => setSelectedStat('all')}>
                    <Text style={{ color: isDark ? '#60A5FA' : '#1D4ED8', fontSize: 12, fontWeight: '700' }}>
                      Show All
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {filteredApplications.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: cardSurface, borderColor: adminBorderColor }]}>
                  <Text style={{ color: secondaryText }}>No applications match the selected filter.</Text>
                </View>
              ) : (
                filteredApplications.map(app => (
                  <TouchableOpacity
                    key={app.id}
                    style={[styles.card, { backgroundColor: cardSurface, borderColor: adminBorderColor }]}
                    onPress={() => handleOpenReview(app)}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={[styles.cardTitle, { color: primaryText, flex: 1, marginRight: 8 }]} numberOfLines={1}>
                        {app.memberName}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor:
                                app.status === 'selected' || app.status === 'joined'
                                  ? (isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5')
                                  : app.status === 'meeting_scheduled'
                                  ? (isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7')
                                  : app.status === 'under_review'
                                  ? (isDark ? 'rgba(59, 130, 246, 0.2)' : '#DBEAFE')
                                  : app.status === 'rejected'
                                  ? (isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2')
                                  : (isDark ? 'rgba(148, 163, 184, 0.2)' : '#F1F5F9'),
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusText,
                              {
                                color:
                                  app.status === 'selected' || app.status === 'joined'
                                    ? (isDark ? '#34D399' : '#059669')
                                    : app.status === 'meeting_scheduled'
                                    ? (isDark ? '#FBBF24' : '#B45309')
                                    : app.status === 'under_review'
                                    ? (isDark ? '#60A5FA' : '#2563EB')
                                    : app.status === 'rejected'
                                    ? (isDark ? '#F87171' : '#DC2626')
                                    : (isDark ? '#94A3B8' : '#475569'),
                              },
                            ]}
                          >
                            {app.status.replace(/_/g, ' ').toUpperCase()}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={{
                            padding: 6,
                            borderRadius: 8,
                            backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
                          }}
                          onPress={() => handleDeleteApplication(app)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Trash2 size={16} color={isDark ? '#F87171' : '#DC2626'} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <Text style={[styles.cardSub, { color: isDark ? '#93C5FD' : '#1a2d5a', fontWeight: '600', marginTop: 2 }]}>
                      Applied for: {app.opportunityTitle}
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Phone size={13} color={secondaryText} />
                        <Text style={{ fontSize: 12, color: secondaryText }}>{app.memberPhone}</Text>
                      </View>
                      {app.resumeAttachment && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <FileText size={13} color={isDark ? '#93C5FD' : '#1a2d5a'} />
                          <Text style={{ fontSize: 12, color: isDark ? '#93C5FD' : '#1a2d5a', fontWeight: '600' }}>
                            CV Attached
                          </Text>
                        </View>
                      )}
                    </View>

                    {/* Interview info if scheduled */}
                    {app.status === 'meeting_scheduled' && app.meetingDate ? (
                      <View style={{ backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7', padding: 8, borderRadius: 8, marginTop: 8 }}>
                        <Text style={{ fontSize: 12, color: isDark ? '#FBBF24' : '#B45309', fontWeight: '700' }}>
                          📅 Interview: {app.meetingDate} {app.meetingTime ? `at ${app.meetingTime}` : ''}
                        </Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── 5. APPLICATION REVIEW MODAL ── */}
      <Modal visible={reviewModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardSurface, maxHeight: '88%' }]}>
            {selectedApp && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={[styles.modalTitle, { color: primaryText }]}>{selectedApp.memberName}</Text>
                    <Text style={[styles.modalSub, { color: isDark ? '#93C5FD' : '#1a2d5a' }]}>
                      Role: {selectedApp.opportunityTitle}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={{
                      padding: 8,
                      borderRadius: 8,
                      backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE2E2',
                    }}
                    onPress={() => handleDeleteApplication(selectedApp)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Trash2 size={18} color={isDark ? '#F87171' : '#DC2626'} />
                  </TouchableOpacity>
                </View>

                {/* Candidate Contact */}
                <View style={[styles.detailBox, { backgroundColor: isDark ? '#27272A50' : screenBg, borderColor: adminBorderColor }]}>
                  <Text style={{ fontSize: 13, color: primaryText, fontWeight: '600' }}>
                    Phone: {selectedApp.memberPhone}
                  </Text>
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
                    <View style={[styles.detailBox, { backgroundColor: isDark ? '#27272A50' : screenBg, borderColor: adminBorderColor }]}>
                      <Text style={{ fontSize: 13, color: secondaryText, lineHeight: 18 }}>
                        {selectedApp.applicationMessage}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {/* CV / Resume In-App Viewer Link */}
                {selectedApp.resumeAttachment ? (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.fieldLabel, { color: primaryText }]}>Attached Resume / CV</Text>
                    <TouchableOpacity
                      style={[
                        styles.resumeLinkBox,
                        {
                          borderColor: isDark ? '#3B82F6' : '#1a2d5a',
                          backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
                        },
                      ]}
                      onPress={() =>
                        setResumeDocToView({
                          url: selectedApp.resumeAttachment!.url,
                          name: selectedApp.resumeAttachment!.fileName || 'Resume.pdf',
                          mimeType: selectedApp.resumeAttachment!.mimeType || 'application/pdf',
                        })
                      }
                      activeOpacity={0.8}
                    >
                      <FileText size={18} color={isDark ? '#60A5FA' : '#1a2d5a'} />
                      <Text style={[styles.resumeName, { color: isDark ? '#FFFFFF' : '#1a2d5a' }]} numberOfLines={1}>
                        {selectedApp.resumeAttachment.fileName}
                      </Text>
                      <Eye size={16} color={isDark ? '#60A5FA' : '#1a2d5a'} />
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* Scheduled Meeting Info (if scheduled) */}
                {selectedApp.status === 'meeting_scheduled' ? (
                  <View style={{ backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7', padding: 12, borderRadius: 10, marginTop: 12 }}>
                    <Text style={{ fontWeight: '700', color: isDark ? '#FBBF24' : '#B45309', fontSize: 13, marginBottom: 4 }}>
                      📅 Interview Scheduled
                    </Text>
                    <Text style={{ color: primaryText, fontSize: 13 }}>
                      Date: {selectedApp.meetingDate || 'N/A'} at {selectedApp.meetingTime || 'N/A'}
                    </Text>
                    {selectedApp.meetingLocation ? (
                      <Text style={{ color: primaryText, fontSize: 12.5, marginTop: 2 }}>
                        Location / Link: {selectedApp.meetingLocation}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {/* Admin Notes */}
                <Text style={[styles.fieldLabel, { color: primaryText, marginTop: 14 }]}>Admin / Leader Notes</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? '#27272A50' : screenBg, borderColor: adminBorderColor, color: primaryText }]}
                  placeholder="Internal review notes..."
                  placeholderTextColor={secondaryText}
                  value={adminNotes}
                  onChangeText={setAdminNotes}
                  multiline
                />

                {/* Status Transitions */}
                <Text style={[styles.fieldLabel, { color: primaryText, marginTop: 16 }]}>Update Status</Text>
                <View style={styles.statusActionGrid}>
                  <TouchableOpacity
                    style={[
                      styles.statusGridBtn,
                      {
                        backgroundColor: isDark ? '#1E293B' : '#EFF6FF',
                        borderColor: isDark ? '#3B82F6' : '#93C5FD',
                      },
                    ]}
                    onPress={handleSetUnderReview}
                    disabled={updatingStatus}
                    activeOpacity={0.75}
                  >
                    <Clock size={16} color={isDark ? '#93C5FD' : '#2563EB'} />
                    <Text style={{ color: isDark ? '#93C5FD' : '#2563EB', fontWeight: '700', fontSize: 13, marginTop: 4 }}>
                      Under Review
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.statusGridBtn,
                      {
                        backgroundColor: isDark ? '#2D2012' : '#FEF3C7',
                        borderColor: isDark ? '#F59E0B' : '#FCD34D',
                      },
                    ]}
                    onPress={handleOpenScheduleModal}
                    disabled={updatingStatus}
                    activeOpacity={0.75}
                  >
                    <Calendar size={16} color={isDark ? '#FCD34D' : '#B45309'} />
                    <Text style={{ color: isDark ? '#FCD34D' : '#B45309', fontWeight: '700', fontSize: 13, marginTop: 4 }}>
                      Schedule Interview
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.statusGridBtn,
                      {
                        backgroundColor: isDark ? '#063B2F' : '#E1F5EE',
                        borderColor: isDark ? '#10B981' : '#6EE7B7',
                      },
                    ]}
                    onPress={handleSelectAppoint}
                    disabled={updatingStatus}
                    activeOpacity={0.75}
                  >
                    <CheckCircle2 size={16} color={isDark ? '#6EE7B7' : '#15803D'} />
                    <Text style={{ color: isDark ? '#6EE7B7' : '#15803D', fontWeight: '700', fontSize: 13, marginTop: 4 }}>
                      Select / Appoint
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.statusGridBtn,
                      {
                        backgroundColor: isDark ? '#3B1214' : '#FEE2E2',
                        borderColor: isDark ? '#EF4444' : '#FCA5A5',
                      },
                    ]}
                    onPress={handleRejectApplication}
                    disabled={updatingStatus}
                    activeOpacity={0.75}
                  >
                    <XCircle size={16} color={isDark ? '#FCA5A5' : '#DC2626'} />
                    <Text style={{ color: isDark ? '#FCA5A5' : '#DC2626', fontWeight: '700', fontSize: 13, marginTop: 4 }}>
                      Reject
                    </Text>
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

      {/* ── 6. SCHEDULE INTERVIEW MODAL ── */}
      <Modal visible={scheduleModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: cardSurface, maxHeight: '92%', height: '88%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={[styles.modalTitle, { color: primaryText }]}>Schedule Ministry Interview</Text>
                <Text style={[styles.modalSub, { color: isDark ? '#93C5FD' : '#1a2d5a', marginBottom: 0 }]}>
                  Applicant: {selectedApp?.memberName}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setScheduleModalVisible(false)}
                style={{ padding: 6, borderRadius: 20, backgroundColor: isDark ? '#27272A' : '#F1F5F9' }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={18} color={primaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={true}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Date Selection */}
              <Text style={[styles.fieldLabel, { color: primaryText, marginTop: 4 }]}>Interview Date</Text>
              <TouchableOpacity
                style={[styles.input, { backgroundColor: isDark ? '#27272A50' : screenBg, borderColor: adminBorderColor, justifyContent: 'center' }]}
                onPress={() => setDatePickerVisible(true)}
              >
                <Text style={{ color: primaryText, fontSize: 14 }}>
                  📅 {interviewDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </TouchableOpacity>

              {/* Time Selection */}
              <Text style={[styles.fieldLabel, { color: primaryText, marginTop: 12 }]}>Interview Time</Text>
              <TouchableOpacity
                style={[styles.input, { backgroundColor: isDark ? '#27272A50' : screenBg, borderColor: adminBorderColor, justifyContent: 'center' }]}
                onPress={() => setTimePickerVisible(true)}
              >
                <Text style={{ color: primaryText, fontSize: 14 }}>⏰ {interviewTime}</Text>
              </TouchableOpacity>

              {/* Meeting Location / Online Link */}
              <Text style={[styles.fieldLabel, { color: primaryText, marginTop: 12 }]}>
                Meeting Location or Meeting Link
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#27272A50' : screenBg, borderColor: adminBorderColor, color: primaryText }]}
                placeholder="e.g. Rhema Church Conference Room or Google Meet URL"
                placeholderTextColor={secondaryText}
                value={interviewLocation}
                onChangeText={setInterviewLocation}
              />

              {/* Optional Notes for Applicant */}
              <Text style={[styles.fieldLabel, { color: primaryText, marginTop: 12 }]}>Notes for Applicant (Optional)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? '#27272A50' : screenBg, borderColor: adminBorderColor, color: primaryText, minHeight: 70 }]}
                placeholder="Bring a Bible and portfolio, or prepare 5 minutes..."
                placeholderTextColor={secondaryText}
                value={interviewNotes}
                onChangeText={setInterviewNotes}
                multiline
                textAlignVertical="top"
              />

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 24, marginBottom: 8 }}>
                <TouchableOpacity
                  style={[styles.closeModalBtn, { flex: 1, borderColor: adminBorderColor }]}
                  onPress={() => setScheduleModalVisible(false)}
                >
                  <Text style={{ color: primaryText, fontWeight: '600' }}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.primaryActionBtn,
                    {
                      flex: 2,
                      backgroundColor: isDark ? '#FFFFFF' : '#1a2d5a',
                      borderColor: isDark ? '#FFFFFF' : '#1a2d5a',
                    },
                  ]}
                  onPress={handleConfirmScheduleInterview}
                  disabled={updatingStatus}
                >
                  {updatingStatus ? (
                    <ActivityIndicator size="small" color={isDark ? '#000000' : '#FFFFFF'} />
                  ) : (
                    <Text style={[styles.primaryActionTxt, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                      Confirm & Send Invite
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal */}
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        date={interviewDate}
        onConfirm={d => {
          setDatePickerVisible(false);
          setInterviewDate(d);
        }}
        onCancel={() => setDatePickerVisible(false)}
      />

      {/* Time Picker Modal */}
      <DateTimePickerModal
        isVisible={isTimePickerVisible}
        mode="time"
        date={interviewDate}
        onConfirm={d => {
          setTimePickerVisible(false);
          const timeFormatted = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
          setInterviewTime(timeFormatted);
        }}
        onCancel={() => setTimePickerVisible(false)}
      />

      {/* ── 7. IN-APP RESUME VIEWER MODAL ── */}
      <InAppDocumentViewerModal
        visible={!!resumeDocToView}
        doc={resumeDocToView}
        onClose={() => setResumeDocToView(null)}
      />
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
    statsContainer: {
      marginBottom: 16,
    },
    statsRow: {
      flexDirection: 'row',
      gap: 10,
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
    statusActionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 6,
    },
    statusGridBtn: {
      width: '48%',
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1.2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    statusBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 },
    closeModalBtn: { paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  })
);
