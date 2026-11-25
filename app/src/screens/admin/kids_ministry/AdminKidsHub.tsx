import React, { useState, useEffect, useMemo, useContext } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  TextInput,
  Dimensions,
  Platform,
  Alert,
  Modal,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Users,
  Calendar,
  Shield,
  Search,
  X,
  Plus,
  Camera,
  Sparkles,
  Award,
  ChevronRight,
  AlertTriangle,
  UserCheck,
  CheckCircle,
  GraduationCap,
  Edit3,
  Trash2,
  ShieldCheck,
  Clock,
  BookOpen,
  TrendingUp,
  Layers,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { AdminTabContext } from '../../../context/AdminTabContext';
import KidsMinistryService from '../../../services/KidsMinistryService';
import { CustomAlert } from '../../../components/CustomAlert';
import { useAdminTheme } from '../../../utils/adminThemeHelper';
import { formatDateDisplay, toStandardDateString } from '../../../utils/DateUtils';
import {
  ChildRecord,
  KidsClassRecord,
  KidsTeacherRecord,
  KidsBibleStory,
  KidsQuiz,
  KidsWorshipSong,
  KidsCurriculumLesson,
  KidsCurriculumConfig,
  KidsVBSEventRecord,
  KidsCertificateData,
  KidsCertificateSettings,
  KidsAttendanceSession,
  KidsProgramType,
  KidsSessionRecord,
  KidsTeacherAttendanceRecord,
  resolveActiveCurriculumLesson,
  splitCurriculumLessons,
  formatCurriculumDateDisplay,
  getCurriculumWeekDate,
  getKidsProgramVisual,
} from '../../../types/KidsMinistryTypes';
import TeacherEnrollChildModal from '../../kids_ministry/components/TeacherEnrollChildModal';
import EditClassModal from './components/EditClassModal';
import ClassRosterModal from './components/ClassRosterModal';
import PromotionManagerModal from './components/PromotionManagerModal';
import AdminTeachersModal from './components/AdminTeachersModal';
import AdminContentManagerModal from './components/AdminContentManagerModal';
import AdminCurriculumModal from './components/AdminCurriculumModal';
import AdminAICopilotModal from './components/AdminAICopilotModal';
import AdminVBSManagerModal from './components/AdminVBSManagerModal';
import KidsCertificateModal from '../../kids_ministry/components/KidsCertificateModal';
import AdminKidsReportsModal from './components/AdminKidsReportsModal';
import ChildProfileDetailModal from './components/ChildProfileDetailModal';
import AdminSessionManagerModal from './components/AdminSessionManagerModal';

const { width } = Dimensions.get('window');

const formatDateMonthYear = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '';
  const clean = String(dateStr).trim().split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    const y = parts[0];
    const m = parseInt(parts[1], 10) - 1;
    const d = parts[2].padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (m >= 0 && m < 12) {
      return `${d} ${months[m]} ${y}`;
    }
    return `${d}-${parts[1]}-${y}`;
  }
  return clean;
};

export default function AdminKidsHub({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isDark, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor, barStyle } = useAdminTheme();
  const { member } = useAuth();
  const churchId = member?.churchId || 'rhema';
  const adminTabCtx = useContext(AdminTabContext);

  const handleBack = () => {
    if (adminTabCtx?.goBack) {
      adminTabCtx.goBack();
    } else if (adminTabCtx?.setTabByName) {
      adminTabCtx.setTabByName('Dashboard');
    } else if (adminTabCtx?.setActiveTab) {
      adminTabCtx.setActiveTab(0);
    } else if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    }
  };

  // Tabs: 'overview' | 'children' | 'classes' | 'curriculum'
  const [activeTab, setActiveTab] = useState<'overview' | 'children' | 'classes' | 'curriculum'>('overview');
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [classes, setClasses] = useState<KidsClassRecord[]>([]);
  const [teachers, setTeachers] = useState<KidsTeacherRecord[]>([]);
  const [todayTeacherAttendance, setTodayTeacherAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [selectedClassForEdit, setSelectedClassForEdit] = useState<KidsClassRecord | null>(null);
  const [selectedClassForRoster, setSelectedClassForRoster] = useState<KidsClassRecord | null>(null);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [showTeachersModal, setShowTeachersModal] = useState(false);
  const [showContentManagerModal, setShowContentManagerModal] = useState(false);
  const [showCurriculumModal, setShowCurriculumModal] = useState(false);
  const [showAICopilotModal, setShowAICopilotModal] = useState(false);
  const [showVBSModal, setShowVBSModal] = useState(false);
  const [resumeVBSOnCertClose, setResumeVBSOnCertClose] = useState(false);
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [selectedCertData, setSelectedCertData] = useState<KidsCertificateData | null>(null);
  const [certSettings, setCertSettings] = useState<KidsCertificateSettings | null>(null);
  const [selectedChildProfile, setSelectedChildProfile] = useState<ChildRecord | null>(null);

  // Program-based Attendance Sessions state
  const [programSessions, setProgramSessions] = useState<KidsAttendanceSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<KidsAttendanceSession | null>(null);
  const [sessionCustodyRecords, setSessionCustodyRecords] = useState<KidsSessionRecord[]>([]);
  const [sessionAttendanceLogs, setSessionAttendanceLogs] = useState<any[]>([]);
  const [sessionTeacherAttendance, setSessionTeacherAttendance] = useState<KidsTeacherAttendanceRecord[]>([]);
  const [sessionFilterType, setSessionFilterType] = useState<'all' | KidsProgramType>('all');
  const [showSessionManagerModal, setShowSessionManagerModal] = useState(false);
  const [sessionToEdit, setSessionToEdit] = useState<KidsAttendanceSession | null>(null);
  const [sessionManagerTab, setSessionManagerTab] = useState<'create' | 'list'>('create');
  const [finalizingSession, setFinalizingSession] = useState(false);

  const handleFinalizeSelectedSession = () => {
    if (!selectedSession || finalizingSession) return;
    if (selectedSession.attendanceFinalized) {
      Alert.alert(
        'Already Finalized',
        `Attendance for "${selectedSession.programTitle}" (${formatDateDisplay(selectedSession.date)}) has already been finalized.`
      );
      return;
    }

    const activeEnrolledCount = children.filter(
      c => c.enrollmentStatus !== 'inactive' && c.enrollmentStatus !== 'graduated'
    ).length;
    const presentIds = new Set(sessionCustodyRecords.map(r => r.childDocId));
    sessionAttendanceLogs.forEach(a => {
      if (a?.childDocId && a?.status !== 'absent') presentIds.add(a.childDocId);
    });
    const unrecordedCount = Math.max(0, activeEnrolledCount - presentIds.size);

    Alert.alert(
      'Finalize Program Attendance?',
      `"${selectedSession.programTitle}" (${formatDateDisplay(selectedSession.date)})\n\n• Checked In / Present: ${presentIds.size}\n• Enrolled Not Checked In (will be marked Absent): ${unrecordedCount}\n\nParents of children not checked in will now receive an absent notification.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finalize & Notify',
          style: 'default',
          onPress: async () => {
            try {
              setFinalizingSession(true);
              const staffName =
                member?.name ||
                `${member?.firstName || ''} ${member?.lastName || ''}`.trim() ||
                'Kids Ministry Admin';
              const res = await KidsMinistryService.finalizeProgramAttendance(churchId, {
                session: selectedSession,
                enrolledChildren: children,
                finalizedByMemberId: member?.id || 'admin',
                finalizedByName: staffName,
              });
              setSelectedSession(prev =>
                prev && prev.id === selectedSession.id
                  ? {
                      ...prev,
                      status: 'completed',
                      attendanceFinalized: true,
                      presentCount: res.presentCount,
                      absentCount: res.absentCount,
                    }
                  : prev
              );
              Alert.alert(
                'Attendance Finalized ✓',
                `Present: ${res.presentCount} · Absent: ${res.absentCount}. Parent attendance records & notifications updated.`
              );
            } catch (err: any) {
              Alert.alert('Finalization Failed', err?.message || 'Could not finalize attendance.');
            } finally {
              setFinalizingSession(false);
            }
          },
        },
      ]
    );
  };

  const handleOpenAddSession = () => {
    setSessionToEdit(null);
    setSessionManagerTab('create');
    setShowSessionManagerModal(true);
  };

  const handleOpenEditSession = (sess?: KidsAttendanceSession | null) => {
    const target = sess || selectedSession;
    if (!target) return;
    setSessionToEdit(target);
    setSessionManagerTab('create');
    setShowSessionManagerModal(true);
  };

  const handleDeleteSession = (sess?: KidsAttendanceSession | null) => {
    const target = sess || selectedSession;
    if (!target) return;
    Alert.alert(
      'Delete Program Session',
      `Are you sure you want to delete "${target.programTitle}" (${formatDateDisplay(target.date)})?\n\nHistorical child attendance and custody logs remain preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await KidsMinistryService.deleteProgramSession(churchId, target.id);
              if (selectedSession?.id === target.id) {
                const remaining = programSessions.filter(s => s.id !== target.id);
                setSelectedSession(remaining.length > 0 ? remaining[0] : null);
              }
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Could not delete session.');
            }
          },
        },
      ]
    );
  };

  // Beautiful Delete Confirmation Modal state
  const [childToDelete, setChildToDelete] = useState<{ id: string; name: string; childId?: string; parentName?: string; assignedClassName?: string } | null>(null);
  const [deletingChild, setDeletingChild] = useState(false);

  // Phase 5, 6 & 9: Learning content, 52-week curriculum & VBS state
  const [stories, setStories] = useState<KidsBibleStory[]>([]);
  const [quizzes, setQuizzes] = useState<KidsQuiz[]>([]);
  const [songs, setSongs] = useState<KidsWorshipSong[]>([]);
  const [curriculum, setCurriculum] = useState<KidsCurriculumLesson[]>([]);
  const [curriculumConfig, setCurriculumConfig] = useState<KidsCurriculumConfig | null>(null);
  const [vbsEvent, setVbsEvent] = useState<KidsVBSEventRecord | null>(null);

  // Load children, classes, teachers, curriculum & VBS (Realtime)
  useEffect(() => {
    // Sync all church registered children from Member module into Kids Ministry
    // (deferred so the heavy write-sync doesn't compete with first paint / listeners)
    const deferredSyncTimer = setTimeout(() => {
      KidsMinistryService.syncMemberChildrenToKidsMinistry(churchId).catch(err => {
        console.warn('[AdminKidsHub] Auto-sync church member children error:', err);
      });
      // Reconcile any unlinked household member profile photos onto Kids records
      KidsMinistryService.reconcileAllChildPhotos(churchId).catch(() => {});
    }, 1500);

    // 1. Realtime listener for Sunday School Classes
    const unsubClasses = KidsMinistryService.subscribeToClasses(churchId, classList => {
      setClasses(classList);
    });

    // 2. Realtime listener for all enrolled children
    const unsubKids = KidsMinistryService.subscribeToAllChildren(churchId, list => {
      setChildren(list);
      setLoading(false);
    });

    // 3. Realtime listener for teachers
    const unsubTeachers = KidsMinistryService.subscribeToTeachers(churchId, list => {
      setTeachers(list);
    });

    // 4. Realtime listener for today teacher clock-ins
    const unsubTeacherAtt = KidsMinistryService.subscribeToTodayTeacherAttendance(churchId, list => {
      setTodayTeacherAttendance(list);
    });

    // 5. Realtime listener for Bible Stories
    const unsubStories = KidsMinistryService.subscribeToStories(churchId, list => {
      setStories(list);
    });

    // 6. Realtime listener for Quizzes
    const unsubQuizzes = KidsMinistryService.subscribeToQuizzes(churchId, list => {
      setQuizzes(list);
    });

    // 7. Realtime listener for Action Songs
    const unsubSongs = KidsMinistryService.subscribeToSongs(churchId, list => {
      setSongs(list);
    });

    // 8. Realtime listener for 52-Week & Custom Curriculum
    const unsubCurriculum = KidsMinistryService.subscribeToCurriculum(churchId, list => {
      setCurriculum(list);
    });

    // 8b. Realtime listener for Curriculum Config (52-Week vs Custom Weekly)
    const unsubCurConfig = KidsMinistryService.subscribeToCurriculumConfig(churchId, cfg => {
      setCurriculumConfig(cfg);
    });

    // 9. Realtime listener for VBS Events
    const unsubVBS = KidsMinistryService.subscribeToVBSEvent(churchId, ev => {
      setVbsEvent(ev);
    });

    // 10. Realtime listener for Program Attendance Sessions
    const unsubSessions = KidsMinistryService.subscribeToProgramSessions(churchId, sessionList => {
      setProgramSessions(sessionList);
      setSelectedSession(prev => {
        if (prev) {
          const matching = sessionList.find(s => s.id === prev.id);
          if (matching) return matching;
        }
        if (sessionList.length === 0) return null;
        const today = toStandardDateString(new Date());
        const todaySess = sessionList.find(s => s.date === today && s.status === 'active');
        return todaySess || sessionList[0] || null;
      });
    });

    // Do NOT auto-create a Sunday School session with today's date; wait for explicit admin creation.

    // Load saved Sunday School Director & Senior Pastor certificate leadership defaults
    KidsMinistryService.getCertificateSettings(churchId)
      .then(cfg => {
        if (cfg) setCertSettings(cfg);
      })
      .catch(() => {});

    return () => {
      clearTimeout(deferredSyncTimer);
      unsubClasses();
      unsubKids();
      unsubTeachers();
      unsubTeacherAtt();
      unsubStories();
      unsubQuizzes();
      unsubSongs();
      unsubCurriculum();
      unsubCurConfig();
      unsubVBS();
      unsubSessions();
    };
  }, [churchId]);

  // Realtime subscription strictly scoped to the selected Program Session
  useEffect(() => {
    if (!selectedSession) {
      setSessionCustodyRecords([]);
      setSessionAttendanceLogs([]);
      setSessionTeacherAttendance([]);
      return;
    }

    const unsubCustody = KidsMinistryService.subscribeToSessionCustodyRecords(
      churchId,
      selectedSession,
      records => setSessionCustodyRecords(records)
    );

    const unsubLogs = KidsMinistryService.subscribeToSessionAttendanceLogs(
      churchId,
      selectedSession,
      logs => setSessionAttendanceLogs(logs)
    );

    const unsubTeachers = KidsMinistryService.subscribeToSessionTeacherAttendance(
      churchId,
      selectedSession,
      tRecords => setSessionTeacherAttendance(tRecords)
    );

    return () => {
      unsubCustody();
      unsubLogs();
      unsubTeachers();
    };
  }, [churchId, selectedSession?.id]);

  // Children eligible for next tier promotion
  const promotionCandidates = useMemo(() => {
    return KidsMinistryService.checkPromotionEligibility(children);
  }, [children]);

  // Filter program sessions by category
  const filteredSessions = useMemo(() => {
    if (sessionFilterType === 'all') return programSessions;
    return programSessions.filter(s => s.programType === sessionFilterType);
  }, [programSessions, sessionFilterType]);

  // Search filter for children roster
  const filteredChildren = useMemo(() => {
    if (!searchQuery.trim()) return children;
    const q = searchQuery.toLowerCase().trim();
    return children.filter(c => {
      const name = (c.fullName || '').toLowerCase();
      const id = (c.childId || '').toLowerCase();
      const parent = (c.parentName || '').toLowerCase();
      const phone = (c.parentPhone || '').replace(/\D/g, '');
      const cls = (c.assignedClassName || '').toLowerCase();
      return name.includes(q) || id.includes(q) || parent.includes(q) || phone.includes(q) || cls.includes(q);
    });
  }, [children, searchQuery]);

  const handleConfirmDeleteChild = async () => {
    if (!childToDelete) return;
    try {
      setDeletingChild(true);
      await KidsMinistryService.deleteChild(churchId, childToDelete.id);
      setChildToDelete(null);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not delete child');
    } finally {
      setDeletingChild(false);
    }
  };

  const getChildrenInClass = (cls: KidsClassRecord) => {
    return children.filter(c =>
      c.assignedClassId ? c.assignedClassId === cls.id : c.assignedTier === cls.tier
    );
  };

  const handleOpenCreateClass = () => {
    setSelectedClassForEdit(null);
    setShowClassModal(true);
  };

  const handleOpenEditClass = (cls: KidsClassRecord) => {
    setSelectedClassForEdit(cls);
    setShowClassModal(true);
  };

  const handleDeleteClass = (cls: KidsClassRecord, enrolledCount: number) => {
    const childWarning =
      enrolledCount > 0
        ? `\n\nNote: ${enrolledCount} enrolled ${enrolledCount === 1 ? 'child is' : 'children are'} currently linked to this class. Their profiles will NOT be deleted and can be reassigned anytime.`
        : '';

    Alert.alert(
      'Delete Classroom?',
      `Are you sure you want to permanently delete "${cls.name}"?${childWarning}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await KidsMinistryService.deleteClass(churchId, cls.id);
              Alert.alert('Deleted', `"${cls.name}" has been removed.`);
            } catch (e: any) {
              Alert.alert('Delete Failed', e.message || 'Could not delete classroom');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: screenBg, paddingTop: insets.top }]}>
      <StatusBar barStyle={barStyle} backgroundColor={screenBg} />

      {/* ── TOP NAV HEADER ── */}
      <View style={[styles.headerRow, { backgroundColor: screenBg, borderBottomColor: borderColor }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: secondarySurface }]}
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={20} color={primaryText} strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.headerTitles}>
          <Text style={[styles.headerTitleSerif, { color: primaryText }]}>Kids Ministry Hub</Text>
          <Text style={[styles.headerSubtitle, { color: secondaryText }]}>Sunday School & Child Safety Administration</Text>
        </View>

        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: isDark ? '#FFFFFF' : '#0F172A' }]}
          onPress={() => setShowEnrollModal(true)}
          activeOpacity={0.8}
        >
          <Plus size={14} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.8} />
          <Text style={[styles.addBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>Enroll</Text>
        </TouchableOpacity>
      </View>

      {/* ── TAB PILLS (HORIZONTALLY SCROLLABLE SO NO TAB IS CLIPPED) ── */}
      <View style={[styles.tabsRowWrapper, { backgroundColor: screenBg, borderBottomColor: borderColor }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
          keyboardShouldPersistTaps="handled"
          bounces={true}
          overScrollMode="never"
        >
          <TouchableOpacity
            style={[
              styles.tabPill,
              { backgroundColor: secondarySurface, borderColor: borderColor },
              activeTab === 'overview' && { backgroundColor: isDark ? '#FFFFFF' : '#0F172A', borderColor: isDark ? '#FFFFFF' : '#0F172A' }
            ]}
            onPress={() => setActiveTab('overview')}
          >
            <Text style={[
              styles.tabPillText,
              { color: secondaryText },
              activeTab === 'overview' && { color: isDark ? '#000000' : '#FFFFFF', fontWeight: '800' }
            ]}>
              Overview
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabPill,
              { backgroundColor: secondarySurface, borderColor: borderColor },
              activeTab === 'children' && { backgroundColor: isDark ? '#FFFFFF' : '#0F172A', borderColor: isDark ? '#FFFFFF' : '#0F172A' }
            ]}
            onPress={() => setActiveTab('children')}
          >
            <Text style={[
              styles.tabPillText,
              { color: secondaryText },
              activeTab === 'children' && { color: isDark ? '#000000' : '#FFFFFF', fontWeight: '800' }
            ]}>
              Children ({children.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabPill,
              { backgroundColor: secondarySurface, borderColor: borderColor },
              activeTab === 'classes' && { backgroundColor: isDark ? '#FFFFFF' : '#0F172A', borderColor: isDark ? '#FFFFFF' : '#0F172A' }
            ]}
            onPress={() => setActiveTab('classes')}
          >
            <Text style={[
              styles.tabPillText,
              { color: secondaryText },
              activeTab === 'classes' && { color: isDark ? '#000000' : '#FFFFFF', fontWeight: '800' }
            ]}>
              Classes ({classes.length}){promotionCandidates.length > 0 ? ` · 🎓 ${promotionCandidates.length}` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabPill,
              { backgroundColor: secondarySurface, borderColor: borderColor },
              activeTab === 'curriculum' && { backgroundColor: isDark ? '#FFFFFF' : '#0F172A', borderColor: isDark ? '#FFFFFF' : '#0F172A' }
            ]}
            onPress={() => setActiveTab('curriculum')}
          >
            <Text style={[
              styles.tabPillText,
              { color: secondaryText },
              activeTab === 'curriculum' && { color: isDark ? '#000000' : '#FFFFFF', fontWeight: '800' }
            ]}>
              Curriculum
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── CONTENT BODY ── */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#FBBF24" />
          <Text style={styles.loadingText}>Loading Kids Ministry records...</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* ==================================================== */}
          {/* TAB 1: OVERVIEW METRICS                              */}
          {/* ==================================================== */}
          {activeTab === 'overview' && (
            <>
              {/* ── REDESIGNED MODERN PROGRAM ATTENDANCE CARD ── */}
              {(() => {
                if (!selectedSession) {
                  return (
                    <View style={[styles.compactEmptySessionCard, { backgroundColor: cardSurface, borderColor }]}>
                      <View style={styles.compactEmptyTopRow}>
                        <View
                          style={[
                            styles.compactEmptyIconBox,
                            {
                              backgroundColor: isDark ? 'rgba(59, 130, 246, 0.14)' : '#EFF6FF',
                              borderColor: isDark ? 'rgba(96, 165, 250, 0.3)' : '#BFDBFE',
                            },
                          ]}
                        >
                          <Calendar size={18} color={isDark ? '#60A5FA' : '#2563EB'} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.compactEmptyTitle, { color: primaryText }]} numberOfLines={1}>
                            No Program Session Created
                          </Text>
                          <Text style={[styles.compactEmptySub, { color: secondaryText }]} numberOfLines={2}>
                            Schedule a Sunday School, VBS, or event date to enable check-in.
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.compactCreateSessionBtn,
                          {
                            backgroundColor: isDark ? '#FFFFFF' : '#0F172A',
                          },
                        ]}
                        onPress={handleOpenAddSession}
                        activeOpacity={0.85}
                      >
                        <Plus size={14} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                        <Text
                          style={[
                            styles.compactCreateSessionBtnText,
                            { color: isDark ? '#000000' : '#FFFFFF' },
                          ]}
                        >
                          Create Program Session
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                }

                const visual = getKidsProgramVisual(selectedSession.programType, isDark);
                const displayTitle = selectedSession.programTitle || visual.label;
                const normTitle = displayTitle.trim().toLowerCase();
                const showDistinctCategory =
                  normTitle !== visual.label.trim().toLowerCase() &&
                  normTitle !== visual.shortLabel.trim().toLowerCase();

                const isFinalized = Boolean(selectedSession.attendanceFinalized);
                const statusMeta = isFinalized
                  ? {
                      label: 'FINALIZED',
                      dot: '#10B981',
                      text: isDark ? '#34D399' : '#047857',
                      bg: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5',
                      border: isDark ? 'rgba(52, 211, 153, 0.35)' : '#A7F3D0',
                    }
                  : selectedSession.status === 'upcoming'
                  ? {
                      label: 'UPCOMING',
                      dot: '#3B82F6',
                      text: isDark ? '#60A5FA' : '#1D4ED8',
                      bg: isDark ? 'rgba(59, 130, 246, 0.16)' : '#EFF6FF',
                      border: isDark ? 'rgba(96, 165, 250, 0.35)' : '#BFDBFE',
                    }
                  : selectedSession.status === 'completed'
                  ? {
                      label: 'COMPLETED',
                      dot: '#F59E0B',
                      text: isDark ? '#FBBF24' : '#B45309',
                      bg: isDark ? 'rgba(245, 158, 11, 0.16)' : '#FFFBEB',
                      border: isDark ? 'rgba(251, 191, 36, 0.35)' : '#FDE68A',
                    }
                  : {
                      label: 'ACTIVE',
                      dot: '#10B981',
                      text: isDark ? '#34D399' : '#059669',
                      bg: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5',
                      border: isDark ? 'rgba(52, 211, 153, 0.35)' : '#A7F3D0',
                    };

                const presentTotal = selectedSession.presentCount ?? sessionCustodyRecords.length;
                const absentTotal = selectedSession.absentCount ?? 0;
                const liveCheckedInCount = sessionCustodyRecords.filter(c => c.status === 'active').length;
                const assignedFacultyCount = selectedSession.assignedTeacherIds?.length || 0;

                return (
                  <View style={[styles.sessionHeroCard, { backgroundColor: cardSurface, borderColor }]}>
                    {/* Program Color Accent Strip */}
                    <View style={[styles.programCardAccentBar, { backgroundColor: visual.accentColor }]} />

                    <View style={styles.sessionCardBody}>
                      {/* Header Row: Icon + Program Name (+ Single Category Badge if distinct) + Status Pill */}
                      <View style={styles.sessionHeaderRow}>
                        <View
                          style={[
                            styles.programEmojiBox,
                            { backgroundColor: visual.softBg, borderColor: visual.softBorder },
                          ]}
                        >
                          <Image
                            source={visual.iconImage}
                            style={{ width: 30, height: 30 }}
                            resizeMode="contain"
                          />
                        </View>

                        <View style={{ flex: 1, paddingRight: 8 }}>
                          {showDistinctCategory && (
                            <View
                              style={[
                                styles.categoryTagInline,
                                { backgroundColor: visual.softBg, borderColor: visual.softBorder },
                              ]}
                            >
                              <Text style={[styles.categoryTagInlineText, { color: visual.accentColor }]}>
                                {visual.shortLabel.toUpperCase()}
                              </Text>
                            </View>
                          )}
                          <Text style={[styles.selectedSessionTitle, { color: primaryText }]} numberOfLines={2}>
                            {displayTitle}
                          </Text>
                          <Text style={[styles.programSessionSub, { color: secondaryText }]} numberOfLines={1}>
                            {selectedSession.description?.trim() || 'Kids Ministry Attendance Session'}
                          </Text>
                        </View>

                        <View
                          style={[
                            styles.liveStatusPill,
                            { backgroundColor: statusMeta.bg, borderColor: statusMeta.border },
                          ]}
                        >
                          <View style={[styles.livePulseDot, { backgroundColor: statusMeta.dot }]} />
                          <Text style={[styles.liveStatusText, { color: statusMeta.text }]}>
                            {statusMeta.label}
                          </Text>
                        </View>
                      </View>

                      {/* 3-Column Equal Metadata Grid (Single Clear Date, Time, Faculty) */}
                      <View style={styles.sessionMetaGrid}>
                        <View style={[styles.metaGridTile, { backgroundColor: secondarySurface, borderColor }]}>
                          <View style={styles.metaGridLabelRow}>
                            <Calendar size={12} color={visual.accentColor} />
                            <Text style={[styles.metaGridEyebrow, { color: secondaryText }]}>DATE</Text>
                          </View>
                          <Text style={[styles.metaGridValue, { color: primaryText }]} numberOfLines={1}>
                            {formatDateMonthYear(selectedSession.date) || 'Not Set'}
                          </Text>
                        </View>

                        <View style={[styles.metaGridTile, { backgroundColor: secondarySurface, borderColor }]}>
                          <View style={styles.metaGridLabelRow}>
                            <Clock size={12} color="#3B82F6" />
                            <Text style={[styles.metaGridEyebrow, { color: secondaryText }]}>TIME</Text>
                          </View>
                          <Text style={[styles.metaGridValue, { color: primaryText }]} numberOfLines={1}>
                            {selectedSession.startTime || 'Not Set'}
                          </Text>
                        </View>

                        <View style={[styles.metaGridTile, { backgroundColor: secondarySurface, borderColor }]}>
                          <View style={styles.metaGridLabelRow}>
                            <Users size={12} color="#10B981" />
                            <Text style={[styles.metaGridEyebrow, { color: secondaryText }]}>FACULTY</Text>
                          </View>
                          <Text style={[styles.metaGridValue, { color: primaryText }]} numberOfLines={1}>
                            {assignedFacultyCount} Assigned
                          </Text>
                        </View>
                      </View>

                      {/* Attendance Summary Banner */}
                      {selectedSession ? (
                        <View
                          style={[
                            styles.finalizeBar,
                            {
                              backgroundColor: isFinalized
                                ? isDark
                                  ? 'rgba(16, 185, 129, 0.12)'
                                  : '#F0FDF4'
                                : secondarySurface,
                              borderColor: isFinalized
                                ? isDark
                                  ? 'rgba(52, 211, 153, 0.35)'
                                  : '#BBF7D0'
                                : borderColor,
                            },
                          ]}
                        >
                          <View style={styles.finalizeLeft}>
                            <CheckCircle
                              size={16}
                              color={isFinalized ? '#10B981' : '#3B82F6'}
                            />
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[
                                  styles.finalizeBarTitle,
                                  { color: isFinalized ? (isDark ? '#34D399' : '#047857') : primaryText },
                                ]}
                              >
                                {isFinalized ? 'Attendance Finalized' : 'Attendance Open'}
                              </Text>
                              {!isFinalized && (
                                <Text style={[styles.finalizeBarSub, { color: secondaryText }]}>
                                  {liveCheckedInCount} checked in · Tap finalize after service
                                </Text>
                              )}
                            </View>
                          </View>

                          {isFinalized ? (
                            <View style={styles.attendanceStatsPills}>
                              <View
                                style={[
                                  styles.attStatChip,
                                  {
                                    backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#DCFCE7',
                                  },
                                ]}
                              >
                                <Text style={[styles.attStatChipText, { color: isDark ? '#6EE7B7' : '#047857' }]}>
                                  {presentTotal} Present
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.attStatChip,
                                  {
                                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
                                  },
                                ]}
                              >
                                <Text style={[styles.attStatChipText, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}>
                                  {absentTotal} Absent
                                </Text>
                              </View>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={[
                                styles.finalizeActionBtn,
                                { backgroundColor: '#10B981', opacity: finalizingSession ? 0.7 : 1 },
                              ]}
                              onPress={handleFinalizeSelectedSession}
                              disabled={finalizingSession}
                              activeOpacity={0.85}
                            >
                              {finalizingSession ? (
                                <ActivityIndicator size="small" color="#FFFFFF" />
                              ) : (
                                <Text style={styles.finalizeActionBtnText}>Finalize</Text>
                              )}
                            </TouchableOpacity>
                          )}
                        </View>
                      ) : null}

                      {/* Clean Uniform 3-Button Action Toolbar (Add | Edit | Delete) */}
                      <View style={styles.sessionActionsToolbar}>
                        <TouchableOpacity
                          style={[
                            styles.toolbarPrimaryBtn,
                            { backgroundColor: isDark ? '#FFFFFF' : '#0F172A' },
                          ]}
                          onPress={handleOpenAddSession}
                          activeOpacity={0.85}
                        >
                          <Plus size={14} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.5} />
                          <Text
                            style={[
                              styles.toolbarPrimaryBtnText,
                              { color: isDark ? '#000000' : '#FFFFFF' },
                            ]}
                          >
                            Add
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.toolbarSecondaryBtn,
                            { backgroundColor: secondarySurface, borderColor },
                          ]}
                          onPress={() => handleOpenEditSession(selectedSession)}
                          activeOpacity={0.82}
                        >
                          <Edit3 size={14} color={primaryText} />
                          <Text style={[styles.toolbarSecondaryBtnText, { color: primaryText }]}>
                            Edit
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.toolbarDeleteBtn,
                            {
                              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.14)' : '#FEF2F2',
                              borderColor: isDark ? 'rgba(239, 68, 68, 0.35)' : '#FECACA',
                            },
                          ]}
                          onPress={() => handleDeleteSession(selectedSession)}
                          activeOpacity={0.82}
                        >
                          <Trash2 size={14} color="#EF4444" />
                          <Text style={styles.toolbarDeleteBtnText}>Delete</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Session Switcher Tray */}
                      {programSessions.length > 0 && (
                        <View style={[styles.sessionSwitcherTray, { borderTopColor: borderColor }]}>
                          <View style={styles.trayHeaderRow}>
                            <Text style={[styles.trayHeading, { color: secondaryText }]}>
                              PROGRAM SESSIONS
                            </Text>
                            <TouchableOpacity
                              style={[
                                styles.manageAllBtn,
                                {
                                  backgroundColor: isDark ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
                                },
                              ]}
                              onPress={() => {
                                setSessionToEdit(null);
                                setSessionManagerTab('list');
                                setShowSessionManagerModal(true);
                              }}
                              activeOpacity={0.8}
                            >
                              <Text style={[styles.trayCount, { color: isDark ? '#60A5FA' : '#2563EB' }]}>
                                Manage All ({filteredSessions.length})
                              </Text>
                              <ChevronRight size={13} color={isDark ? '#60A5FA' : '#2563EB'} />
                            </TouchableOpacity>
                          </View>

                          {programSessions.length > 1 && (
                            <>
                              {/* Quick Program Type Filter Chips */}
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.sessionTypeChipsRow}
                              >
                                {(
                                  [
                                    'all',
                                    'sunday_school',
                                    'vbs',
                                    'special_meeting',
                                    'childrens_worship',
                                    'summer_camp',
                                    'bible_study',
                                  ] as const
                                ).map(pType => {
                                  const isSel = sessionFilterType === pType;
                                  const chipLabel =
                                    pType === 'all'
                                      ? 'All'
                                      : getKidsProgramVisual(pType, isDark).shortLabel;
                                  return (
                                    <TouchableOpacity
                                      key={pType}
                                      style={[
                                        styles.sessionTypeChip,
                                        { backgroundColor: secondarySurface, borderColor },
                                        isSel && {
                                          backgroundColor: isDark ? '#FFFFFF' : '#0F172A',
                                          borderColor: isDark ? '#FFFFFF' : '#0F172A',
                                        },
                                      ]}
                                      onPress={() => setSessionFilterType(pType)}
                                    >
                                      <Text
                                        style={[
                                          styles.sessionTypeChipText,
                                          { color: secondaryText },
                                          isSel && {
                                            color: isDark ? '#000000' : '#FFFFFF',
                                            fontWeight: '800',
                                          },
                                        ]}
                                      >
                                        {chipLabel}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </ScrollView>

                              {/* Horizontal Sessions Carousel */}
                              <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.sessionsCarousel}
                              >
                                {filteredSessions.map(sess => {
                                  const isSelected = selectedSession?.id === sess.id;
                                  const sessVisual = getKidsProgramVisual(sess.programType, isDark);
                                  const pillBadge = sess.attendanceFinalized
                                    ? 'Finalized'
                                    : isSelected
                                    ? 'Active'
                                    : sess.status === 'upcoming'
                                    ? 'Upcoming'
                                    : 'Open';
                                  return (
                                    <TouchableOpacity
                                      key={sess.id}
                                      style={[
                                        styles.sessionCardPill,
                                        { backgroundColor: secondarySurface, borderColor },
                                        isSelected && {
                                          borderColor: sessVisual.accentColor,
                                          borderWidth: 1.5,
                                          backgroundColor: sessVisual.softBg,
                                        },
                                      ]}
                                      onPress={() => setSelectedSession(sess)}
                                      activeOpacity={0.82}
                                    >
                                      <View style={styles.sessionPillTopRow}>
                                        <View
                                          style={[
                                            styles.sessionPillEmojiWrap,
                                            { backgroundColor: isSelected ? cardSurface : sessVisual.softBg },
                                          ]}
                                        >
                                          <Image
                                            source={sessVisual.iconImage}
                                            style={{ width: 17, height: 17 }}
                                            resizeMode="contain"
                                          />
                                        </View>
                                        <View
                                          style={[
                                            styles.activeTagBadge,
                                            {
                                              backgroundColor: isSelected
                                                ? sessVisual.accentColor
                                                : isDark
                                                ? 'rgba(148, 163, 184, 0.2)'
                                                : '#E2E8F0',
                                            },
                                          ]}
                                        >
                                          <Text
                                            style={[
                                              styles.activeTagText,
                                              {
                                                color: isSelected ? '#FFFFFF' : secondaryText,
                                              },
                                            ]}
                                          >
                                            {pillBadge}
                                          </Text>
                                        </View>
                                      </View>

                                      <Text
                                        style={[styles.sessionPillTitle, { color: primaryText }]}
                                        numberOfLines={1}
                                      >
                                        {sess.programTitle}
                                      </Text>

                                      <Text style={[styles.sessionPillDate, { color: secondaryText }]} numberOfLines={1}>
                                        {formatDateMonthYear(sess.date)}
                                        {sess.startTime ? ` · ${sess.startTime}` : ''}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </ScrollView>
                            </>
                          )}
                        </View>
                      )}
                    </View>
                  </View>
                );
              })()}

              {/* 4 Clean & Truthful Program-Scoped Executive Metric Cards */}
              <View style={styles.kpiGrid}>
                {/* 1. Enrolled Children */}
                <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }]}>
                  <View style={styles.kpiHeaderRow}>
                    <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                      <Users size={16} color="#60A5FA" />
                    </View>
                    <Text style={[styles.kpiNumber, { color: primaryText }]}>{children.length}</Text>
                  </View>
                  <Text style={[styles.kpiTitle, { color: primaryText }]}>Enrolled Kids</Text>
                  <Text style={[styles.kpiSub, { color: secondaryText }]}>Total registered</Text>
                </View>

                {/* 2. Checked-In for Selected Program Session */}
                <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }]}>
                  <View style={styles.kpiHeaderRow}>
                    <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                      <UserCheck size={16} color="#34D399" />
                    </View>
                    <Text style={[styles.kpiNumber, { color: '#34D399' }]}>
                      {sessionCustodyRecords.filter(c => c.status === 'active').length}
                    </Text>
                  </View>
                  <Text style={[styles.kpiTitle, { color: primaryText }]}>Checked-In</Text>
                  <Text style={[styles.kpiSub, { color: secondaryText }]} numberOfLines={1}>
                    {selectedSession?.programTitle || 'No active session'}
                  </Text>
                </View>

                {/* 3. Faculty On Duty for Selected Session */}
                <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }]}>
                  <View style={styles.kpiHeaderRow}>
                    <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                      <Clock size={16} color="#FBBF24" />
                    </View>
                    <Text style={[styles.kpiNumber, { color: '#FBBF24' }]}>
                      {selectedSession
                        ? `${sessionTeacherAttendance.length}/${selectedSession.assignedTeacherIds?.length || teachers.length || 0}`
                        : '0/0'}
                    </Text>
                  </View>
                  <Text style={[styles.kpiTitle, { color: primaryText }]}>Faculty On Duty</Text>
                  <Text style={[styles.kpiSub, { color: secondaryText }]}>Present / Assigned</Text>
                </View>

                {/* 4. Verified Face Scans in Selected Session */}
                <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }]}>
                  <View style={styles.kpiHeaderRow}>
                    <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                      <Camera size={16} color="#C084FC" />
                    </View>
                    <Text style={[styles.kpiNumber, { color: '#A78BFA' }]}>
                      {sessionAttendanceLogs.filter(a => a.status !== 'absent' && a.method === 'face_scan').length}
                    </Text>
                  </View>
                  <Text style={[styles.kpiTitle, { color: primaryText }]}>Face Scans</Text>
                  <Text style={[styles.kpiSub, { color: secondaryText }]}>Verified this session</Text>
                </View>
              </View>

              {/* Active Program Attendance Stations */}
              <View style={{ gap: 8, marginTop: 14, marginBottom: 4 }}>
                <Text style={[styles.sectionHeading, { color: secondaryText }]}>
                  ACTIVE ATTENDANCE STATIONS ·{' '}
                  {selectedSession ? selectedSession.programTitle.toUpperCase() : 'NO SESSION SELECTED'}
                </Text>

                <View style={styles.stationsRow}>
                  {/* Face Scan Entrance Check-In */}
                  <TouchableOpacity
                    style={[styles.stationCard, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => {
                      if (!selectedSession) {
                        Alert.alert(
                          'Create a Program Session First',
                          'Please create a program session with its event date first so face scans and check-ins are linked to the right event.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Create Session', onPress: handleOpenAddSession },
                          ]
                        );
                        return;
                      }
                      navigation.navigate('KidsFaceScanKiosk', {
                        targetSessionId: selectedSession.id,
                        sessionTitle: selectedSession.programTitle,
                        programType: selectedSession.programType,
                        sessionDate: selectedSession.date,
                      });
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.stationIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                      <Camera size={18} color="#60A5FA" />
                    </View>
                    <Text style={[styles.stationTitle, { color: primaryText }]}>Entrance Check-In</Text>
                    <Text style={[styles.stationSub, { color: secondaryText }]}>
                      {selectedSession
                        ? `Face, QR · ${formatDateMonthYear(selectedSession.date)}`
                        : 'Select or create a session'}
                    </Text>
                    <View style={styles.stationArrow}>
                      <ChevronRight size={14} color="#60A5FA" />
                    </View>
                  </TouchableOpacity>

                  {/* Teacher Exit Scanner */}
                  <TouchableOpacity
                    style={[styles.stationCard, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => {
                      if (!selectedSession) {
                        Alert.alert(
                          'Create a Program Session First',
                          'Please create or select a program session before opening the dismissal scanner.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Create Session', onPress: handleOpenAddSession },
                          ]
                        );
                        return;
                      }
                      navigation.navigate('KidsCheckOutScanner', {
                        targetSessionId: selectedSession.id,
                        sessionTitle: selectedSession.programTitle,
                        programType: selectedSession.programType,
                        sessionDate: selectedSession.date,
                      });
                    }}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.stationIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                      <UserCheck size={18} color="#34D399" />
                    </View>
                    <Text style={[styles.stationTitle, { color: primaryText }]}>Teacher Exit</Text>
                    <Text style={[styles.stationSub, { color: secondaryText }]}>
                      {selectedSession
                        ? `Dismissal · ${formatDateMonthYear(selectedSession.date)}`
                        : 'Dismissal scanner'}
                    </Text>
                    <View style={styles.stationArrow}>
                      <ChevronRight size={14} color="#34D399" />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Management Portals - Clean 2x4 Grid (All 8 Portals in uniform card design) */}
              <View style={{ gap: 8, marginTop: 12 }}>
                <Text style={[styles.sectionHeading, { color: secondaryText }]}>MANAGEMENT PORTALS</Text>

                <View style={styles.portalGrid2x2}>
                  {/* Grid 1: Children Roster */}
                  <TouchableOpacity
                    style={[styles.portalGridCard, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => setActiveTab('children')}
                    activeOpacity={0.82}
                  >
                    <View style={styles.portalCardHeader}>
                      <View style={[styles.portalGridIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                        <Users size={18} color="#60A5FA" />
                      </View>
                      <ChevronRight size={15} color={secondaryText} />
                    </View>
                    <Text style={[styles.portalGridTitle, { color: primaryText }]}>Children Roster</Text>
                    <Text style={[styles.portalGridSub, { color: secondaryText }]}>
                      {children.length} enrolled · Medical & alerts
                    </Text>
                  </TouchableOpacity>

                  {/* Grid 2: Classrooms & Capacities */}
                  <TouchableOpacity
                    style={[styles.portalGridCard, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => setActiveTab('classes')}
                    activeOpacity={0.82}
                  >
                    <View style={styles.portalCardHeader}>
                      <View style={[styles.portalGridIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                        <Calendar size={18} color="#34D399" />
                      </View>
                      <ChevronRight size={15} color={secondaryText} />
                    </View>
                    <Text style={[styles.portalGridTitle, { color: primaryText }]}>Classrooms</Text>
                    <Text style={[styles.portalGridSub, { color: secondaryText }]}>
                      {classes.length} rooms · Capacities & age tiers
                    </Text>
                  </TouchableOpacity>

                  {/* Grid 3: Sunday School Faculty */}
                  <TouchableOpacity
                    style={[styles.portalGridCard, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => setShowTeachersModal(true)}
                    activeOpacity={0.82}
                  >
                    <View style={styles.portalCardHeader}>
                      <View style={[styles.portalGridIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                        <ShieldCheck size={18} color="#FBBF24" />
                      </View>
                      <ChevronRight size={15} color={secondaryText} />
                    </View>
                    <Text style={[styles.portalGridTitle, { color: primaryText }]}>Faculty & Helpers</Text>
                    <Text style={[styles.portalGridSub, { color: secondaryText }]}>
                      {teachers.length} members · {sessionTeacherAttendance.length > 0 ? sessionTeacherAttendance.length : todayTeacherAttendance.length} on duty
                    </Text>
                  </TouchableOpacity>

                  {/* Grid 4: Bible Learning Center CMS */}
                  <TouchableOpacity
                    style={[styles.portalGridCard, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => setShowContentManagerModal(true)}
                    activeOpacity={0.82}
                  >
                    <View style={styles.portalCardHeader}>
                      <View style={[styles.portalGridIconBox, { backgroundColor: 'rgba(168, 85, 247, 0.12)' }]}>
                        <BookOpen size={18} color="#C084FC" />
                      </View>
                      <ChevronRight size={15} color={secondaryText} />
                    </View>
                    <Text style={[styles.portalGridTitle, { color: primaryText }]}>Bible LMS CMS</Text>
                    <Text style={[styles.portalGridSub, { color: secondaryText }]}>
                      {stories.length} stories · {quizzes.length} quizzes · {songs.length} songs
                    </Text>
                  </TouchableOpacity>

                  {/* Grid 5: 52-Week Curriculum */}
                  <TouchableOpacity
                    style={[styles.portalGridCard, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => setShowCurriculumModal(true)}
                    activeOpacity={0.82}
                  >
                    <View style={styles.portalCardHeader}>
                      <View style={[styles.portalGridIconBox, { backgroundColor: 'rgba(244, 114, 182, 0.12)' }]}>
                        <Sparkles size={18} color="#F472B6" />
                      </View>
                      <ChevronRight size={15} color={secondaryText} />
                    </View>
                    <Text style={[styles.portalGridTitle, { color: primaryText }]}>52-Wk Curriculum</Text>
                    <Text style={[styles.portalGridSub, { color: secondaryText }]}>
                      52 weekly scripture & memory plans
                    </Text>
                  </TouchableOpacity>

                  {/* Grid 6: AI Lesson Studio */}
                  <TouchableOpacity
                    style={[styles.portalGridCard, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => setShowAICopilotModal(true)}
                    activeOpacity={0.82}
                  >
                    <View style={styles.portalCardHeader}>
                      <View style={[styles.portalGridIconBox, { backgroundColor: 'rgba(147, 51, 234, 0.12)' }]}>
                        <Sparkles size={18} color="#A855F7" />
                      </View>
                      <ChevronRight size={15} color={secondaryText} />
                    </View>
                    <Text style={[styles.portalGridTitle, { color: primaryText }]}>Rhema AI Studio</Text>
                    <Text style={[styles.portalGridSub, { color: secondaryText }]}>
                      Automated crafts, stories & quiz maker
                    </Text>
                  </TouchableOpacity>

                  {/* Grid 7: VBS & Special Camps */}
                  <TouchableOpacity
                    style={[styles.portalGridCard, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => setShowVBSModal(true)}
                    activeOpacity={0.82}
                  >
                    <View style={styles.portalCardHeader}>
                      <View style={[styles.portalGridIconBox, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                        <Award size={18} color="#EF4444" />
                      </View>
                      <ChevronRight size={15} color={secondaryText} />
                    </View>
                    <Text style={[styles.portalGridTitle, { color: primaryText }]}>VBS & Camps</Text>
                    <Text style={[styles.portalGridSub, { color: secondaryText }]}>
                      Vacation Bible School registrations
                    </Text>
                  </TouchableOpacity>

                  {/* Grid 8: Analytics & Safety Reports */}
                  <TouchableOpacity
                    style={[styles.portalGridCard, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => setShowReportsModal(true)}
                    activeOpacity={0.82}
                  >
                    <View style={styles.portalCardHeader}>
                      <View style={[styles.portalGridIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                        <TrendingUp size={18} color="#34D399" />
                      </View>
                      <ChevronRight size={15} color={secondaryText} />
                    </View>
                    <Text style={[styles.portalGridTitle, { color: primaryText }]}>Safety Reports</Text>
                    <Text style={[styles.portalGridSub, { color: secondaryText }]}>
                      Attendance logs, incident records & PDF
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}

          {/* ==================================================== */}
          {/* TAB 2: CHILDREN ROSTER                               */}
          {/* ==================================================== */}
          {activeTab === 'children' && (
            <>
              {/* Search Bar */}
              <View style={[styles.searchBar, { backgroundColor: secondarySurface, borderColor }]}>
                <Search size={16} color={secondaryText} />
                <TextInput
                  style={[styles.searchInput, { color: primaryText }]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Filter children by name, phone, or ID..."
                  placeholderTextColor={secondaryText}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <X size={16} color={secondaryText} />
                  </TouchableOpacity>
                )}
              </View>

              {filteredChildren.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: cardSurface, borderColor }]}>
                  <Text style={[styles.emptyCardText, { color: secondaryText }]}>No children found matching "{searchQuery}"</Text>
                </View>
              ) : (
                filteredChildren.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.childCard, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => setSelectedChildProfile(c)}
                    activeOpacity={0.82}
                  >
                    <View style={styles.childCardHeader}>
                      <View style={styles.avatarWrap}>
                        <View style={[styles.avatarCircle, { overflow: 'hidden' }]}>
                          {c.photoUrl ? (
                            <Image
                              source={{ uri: c.photoUrl }}
                              style={{ width: '100%', height: '100%' }}
                              resizeMode="cover"
                            />
                          ) : (
                            <Text style={styles.avatarInitials}>
                              {c.firstName.charAt(0)}{c.lastName ? c.lastName.charAt(0) : ''}
                            </Text>
                          )}
                        </View>
                        {c.faceEnrolled && (
                          <View style={[styles.faceCheckDot, { borderColor: cardSurface }]}>
                            <Text style={{ fontSize: 8, color: '#FFFFFF' }}>✓</Text>
                          </View>
                        )}
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.childNameSerif, { color: primaryText }]}>{c.fullName}</Text>

                        <Text style={[styles.childMeta, { color: secondaryText }]}>
                          Age: {c.age} · {c.gender === 'male' ? 'Boy' : 'Girl'} · {c.assignedClassName || 'Class'}
                        </Text>

                        {/* Kid ID Badge shown below Age */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                          <View style={[styles.idBadge, { backgroundColor: secondarySurface, borderColor }]}>
                            <Text style={styles.idBadgeText}>ID: {c.childId}</Text>
                          </View>
                        </View>

                        {/* Medical Alert Tag */}
                        {c.medical?.hasAllergies && (
                          <View style={styles.allergyTag}>
                            <AlertTriangle size={10} color="#F87171" />
                            <Text style={styles.allergyTagText}>
                              {c.medical.allergiesList.join(', ')}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Delete Child Button */}
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() =>
                          setChildToDelete({
                            id: c.id,
                            name: c.fullName,
                            childId: c.childId,
                            parentName: c.parentName,
                            assignedClassName: c.assignedClassName,
                          })
                        }
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.7}
                      >
                        <Trash2 size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>

                    <View style={[styles.childCardDivider, { backgroundColor: borderColor }]} />

                    <View style={styles.guardianRow}>
                      <Text style={[styles.guardianText, { color: secondaryText }]} numberOfLines={1}>
                        Parent: {c.parentName} ({c.parentPhone || 'No phone'})
                      </Text>
                      <View style={[styles.pickupPill, { backgroundColor: secondarySurface }]}>
                        <Text style={[styles.pickupPillText, { color: primaryText }]}>
                          {c.guardians ? c.guardians.length : 1} Pickups · View ›
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </>
          )}

          {/* ==================================================== */}
          {/* TAB 3: CLASSES (5 TIERS)                             */}
          {/* ==================================================== */}
          {activeTab === 'classes' && (
            <View style={{ gap: 14 }}>
              {/* Annual Age Promotion Center Banner */}
              <View style={[styles.promotionBannerCard, { backgroundColor: cardSurface, borderColor }]}>
                <View style={styles.promotionBannerHeader}>
                  <View style={styles.gradIconBox}>
                    <GraduationCap size={22} color="#FBBF24" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.promotionBannerTitle, { color: primaryText }]}>Annual Age Promotion Center</Text>
                    <Text style={[styles.promotionBannerSub, { color: secondaryText }]}>
                      {promotionCandidates.length > 0
                        ? `${promotionCandidates.length} children ready to graduate to next Sunday School tier`
                        : 'All children currently in their age-appropriate classes'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.promotionActionBtn}
                    onPress={() => setShowPromotionModal(true)}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.promotionActionText}>
                      {promotionCandidates.length > 0 ? `Review (${promotionCandidates.length})` : 'Manage'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Classes Action Header Bar */}
              <View style={[styles.classesActionBar, { backgroundColor: cardSurface, borderColor }]}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={[styles.classesHeaderTitle, { color: primaryText }]} numberOfLines={1}>
                    Sunday School Classes ({classes.length})
                  </Text>
                  <Text style={[styles.classesHeaderSub, { color: secondaryText }]} numberOfLines={2}>
                    Create, edit, or delete classrooms
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.createClassBtn}
                  onPress={handleOpenCreateClass}
                  activeOpacity={0.85}
                >
                  <Plus size={14} color="#000000" strokeWidth={2.8} />
                  <Text style={styles.createClassBtnText}>Create Class</Text>
                </TouchableOpacity>
              </View>

              {classes.length === 0 ? (
                <View style={[styles.emptyClassesCard, { backgroundColor: cardSurface, borderColor }]}>
                  <GraduationCap size={34} color={secondaryText} />
                  <Text style={[styles.emptyClassesTitle, { color: primaryText }]}>No Sunday School Classes Yet</Text>
                  <Text style={[styles.emptyClassesSub, { color: secondaryText }]}>
                    Create your first classroom to start assigning children and teachers.
                  </Text>
                  <TouchableOpacity
                    style={styles.createClassBtn}
                    onPress={handleOpenCreateClass}
                    activeOpacity={0.85}
                  >
                    <Plus size={14} color="#000000" strokeWidth={2.8} />
                    <Text style={styles.createClassBtnText}>Create First Class</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                classes.map(cls => {
                  const enrolledInClass = getChildrenInClass(cls).length;
                  const capacity = cls.maxCapacity || 25;
                  const percent = Math.min(100, Math.round((enrolledInClass / capacity) * 100));
                  const barColor =
                    enrolledInClass >= capacity
                      ? '#EF4444'
                      : percent > 75
                      ? '#FBBF24'
                      : '#10B981';

                  return (
                    <View key={cls.id} style={[styles.classCard, { backgroundColor: cardSurface, borderColor }]}>
                      <View style={styles.classCardHeader}>
                        <View style={{ flex: 1 }}>
                          <View style={styles.tierTag}>
                            <Text style={styles.tierTagText}>
                              {cls.tier === 'mixed'
                                ? 'Mixed Age Group · All Ages'
                                : `Age ${cls.ageRange?.min ?? 0}–${cls.ageRange?.max ?? 14} yrs`}
                            </Text>
                          </View>
                          <Text style={[styles.classTitle, { color: primaryText }]}>{cls.name}</Text>
                          <Text style={[styles.classSchedule, { color: secondaryText }]}>
                            {cls.roomNumber} · {cls.schedule?.dayOfWeek || 'Sunday'}s {cls.schedule?.startTime || '09:30'}–{cls.schedule?.endTime || '11:30'}
                          </Text>
                        </View>

                        <View style={styles.capacityBadge}>
                          <Text style={[styles.capacityText, { color: barColor }]}>
                            {enrolledInClass} / {capacity}
                          </Text>
                          <Text style={[styles.capacitySub, { color: secondaryText }]}>{percent}% Capacity</Text>
                        </View>
                      </View>

                      {/* Visual Capacity Bar */}
                      <View style={[styles.capacityBarTrack, { backgroundColor: secondarySurface }]}>
                        <View
                          style={[
                            styles.capacityBarFill,
                            {
                              width: `${percent}%`,
                              backgroundColor: barColor,
                            },
                          ]}
                        />
                      </View>

                      <View style={[styles.childCardDivider, { backgroundColor: borderColor }]} />

                      <View style={styles.classFooter}>
                        <Text style={[styles.teacherName, { color: primaryText }]} numberOfLines={1}>
                          Lead: {cls.leadTeacherName || 'TBD'}
                        </Text>

                        <View style={styles.classActionsRow}>
                          <TouchableOpacity
                            style={styles.deleteClassBtn}
                            onPress={() => handleDeleteClass(cls, enrolledInClass)}
                            activeOpacity={0.8}
                          >
                            <Trash2 size={12} color="#EF4444" />
                            <Text style={styles.deleteClassBtnText}>Delete</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.editClassBtn, { backgroundColor: secondarySurface }]}
                            onPress={() => handleOpenEditClass(cls)}
                            activeOpacity={0.8}
                          >
                            <Edit3 size={12} color={secondaryText} />
                            <Text style={[styles.editClassBtnText, { color: secondaryText }]}>Edit</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.viewRosterBtn}
                            onPress={() => setSelectedClassForRoster(cls)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.viewRosterText}>
                              Roster ({enrolledInClass}) &rsaquo;
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* ==================================================== */}
          {/* TAB 4: CURRICULUM (52-WEEK OR CUSTOM WEEKLY)         */}
          {/* ==================================================== */}
          {activeTab === 'curriculum' && (() => {
            const { fiftyTwoWeekLessons, customLessons } = splitCurriculumLessons(curriculum);
            const { lesson: activeLesson, mode: activeMode, activeDate } = resolveActiveCurriculumLesson({
              config: curriculumConfig,
              lessons: curriculum,
            });

            // Compute next upcoming lesson dynamically
            let nextLesson: KidsCurriculumLesson | null = null;
            let nextLessonDate: string | null = null;
            if (activeMode === '52_week' && activeLesson) {
              nextLesson = fiftyTwoWeekLessons.find(l => l.weekNumber === activeLesson.weekNumber + 1) || null;
              if (nextLesson && curriculumConfig?.officialLaunchDate) {
                nextLessonDate = getCurriculumWeekDate(curriculumConfig.officialLaunchDate, nextLesson.weekNumber);
              }
            } else if (activeMode === 'custom' && activeLesson) {
              const idx = customLessons.findIndex(l => l.id === activeLesson.id);
              nextLesson = idx >= 0 && idx + 1 < customLessons.length ? customLessons[idx + 1] : null;
              nextLessonDate = nextLesson?.scheduledDate || null;
            }

            return (
              <View style={{ gap: 12 }}>
                <View style={[styles.curriculumHero, { backgroundColor: cardSurface, borderColor }]}>
                  <Sparkles size={20} color="#FBBF24" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.curriculumHeroTitle, { color: primaryText }]}>
                      {activeMode === '52_week' ? '52-Week Bilingual Curriculum' : 'Custom Weekly Curriculum'}
                    </Text>
                    <Text style={[styles.curriculumHeroSub, { color: secondaryText }]}>
                      {activeMode === '52_week'
                        ? `${fiftyTwoWeekLessons.length || 52} Weeks · ${
                            curriculumConfig?.officialLaunchDate
                              ? `Starts ${formatCurriculumDateDisplay(curriculumConfig.officialLaunchDate)}`
                              : 'Start date not confirmed yet'
                          }`
                        : `${customLessons.length} Custom Weekly Lessons · Admin Scheduled Dates`}
                    </Text>
                  </View>
                </View>

                {/* Curriculum Manager Launcher (52-Week Toggle + Custom Builder) */}
                <TouchableOpacity
                  style={[styles.portalCard, { backgroundColor: cardSurface, borderColor: '#10B981', borderWidth: 1 }]}
                  onPress={() => setShowCurriculumModal(true)}
                  activeOpacity={0.88}
                >
                  <View style={[styles.portalIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                    <Calendar size={22} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.portalTitle, { color: '#10B981' }]}>
                      Manage 52-Week & Custom Curriculum
                    </Text>
                    <Text style={[styles.portalSub, { color: secondaryText }]}>
                      Toggle 52-Week Plan, confirm start date, or create custom weekly schedules
                    </Text>
                  </View>
                  <ChevronRight size={18} color="#10B981" />
                </TouchableOpacity>

                {/* Learning Content CMS Quick Launcher */}
                <TouchableOpacity
                  style={[styles.portalCard, { backgroundColor: cardSurface, borderColor: '#FBBF24', borderWidth: 1 }]}
                  onPress={() => setShowContentManagerModal(true)}
                  activeOpacity={0.88}
                >
                  <View style={[styles.portalIconBox, { backgroundColor: 'rgba(251, 191, 36, 0.2)' }]}>
                    <BookOpen size={22} color="#FBBF24" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.portalTitle, { color: '#FBBF24' }]}>
                      Open Bible Learning Center CMS
                    </Text>
                    <Text style={[styles.portalSub, { color: secondaryText }]}>
                      Manage {stories.length} stories, {quizzes.length} interactive quizzes & {songs.length} action songs
                    </Text>
                  </View>
                  <ChevronRight size={18} color="#FBBF24" />
                </TouchableOpacity>

                {/* Rhema AI Studio Launcher */}
                <TouchableOpacity
                  style={[styles.portalCard, { backgroundColor: cardSurface, borderColor: '#8B5CF6', borderWidth: 1 }]}
                  onPress={() => setShowAICopilotModal(true)}
                  activeOpacity={0.88}
                >
                  <View style={[styles.portalIconBox, { backgroundColor: 'rgba(139, 92, 246, 0.2)' }]}>
                    <Sparkles size={22} color="#C084FC" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.portalTitle, { color: '#C084FC' }]}>
                      Launch Rhema AI Studio
                    </Text>
                    <Text style={[styles.portalSub, { color: secondaryText }]}>
                      Generate bilingual lesson plans, 4-choice quizzes, storybooks & craft ideas
                    </Text>
                  </View>
                  <ChevronRight size={18} color="#C084FC" />
                </TouchableOpacity>

                {/* Active Lesson Card (Dynamic from Firestore) */}
                {activeLesson ? (
                  <View style={[styles.lessonCard, { backgroundColor: cardSurface, borderColor: '#10B981' }]}>
                    <View style={styles.lessonHeader}>
                      <Text style={[styles.lessonWeek, { color: '#10B981' }]}>
                        {activeMode === '52_week' ? `WEEK ${activeLesson.weekNumber}` : 'CUSTOM SCHEDULE'}
                        {activeDate ? ` · ${formatCurriculumDateDisplay(activeDate).toUpperCase()}` : ' · ACTIVE SUNDAY'}
                      </Text>
                      <Text style={styles.approvedBadge}>✓ Live Across App</Text>
                    </View>
                    <Text style={[styles.lessonTitle, { color: primaryText }]}>{activeLesson.title}</Text>
                    <Text style={[styles.lessonRef, { color: '#FBBF24' }]}>
                      {activeLesson.titleTelugu}
                    </Text>
                    <Text style={[styles.lessonRef, { color: secondaryText }]}>
                      {activeLesson.scriptureRef} · {activeLesson.scriptureRefTelugu}
                    </Text>
                    <Text style={[styles.lessonVerse, { color: primaryText }]}>
                      "{activeLesson.memoryVerse.verseEnglish}"
                    </Text>
                    {!!activeLesson.memoryVerse.verseTelugu && (
                      <Text style={[styles.lessonVerse, { color: secondaryText, fontStyle: 'normal' }]}>
                        "{activeLesson.memoryVerse.verseTelugu}" — {activeLesson.memoryVerse.reference}
                      </Text>
                    )}
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.lessonCard, { backgroundColor: cardSurface, borderColor: '#F59E0B' }]}
                    onPress={() => setShowCurriculumModal(true)}
                  >
                    <Text style={[styles.lessonTitle, { color: primaryText }]}>
                      No Custom Weekly Lesson Scheduled Yet
                    </Text>
                    <Text style={[styles.lessonRef, { color: secondaryText, marginTop: 4 }]}>
                      Tap "Manage 52-Week & Custom Curriculum" above to create your first custom lesson.
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Next Upcoming Lesson Preview (Dynamic) */}
                {nextLesson && (
                  <View style={[styles.lessonCard, { backgroundColor: cardSurface, borderColor }]}>
                    <View style={styles.lessonHeader}>
                      <Text style={styles.lessonWeek}>
                        {activeMode === '52_week' ? `WEEK ${nextLesson.weekNumber}` : 'UPCOMING'}
                        {nextLessonDate ? ` · ${formatCurriculumDateDisplay(nextLessonDate).toUpperCase()}` : ' · NEXT SUNDAY'}
                      </Text>
                      <Text style={styles.approvedBadge}>✓ Upcoming</Text>
                    </View>
                    <Text style={[styles.lessonTitle, { color: primaryText }]}>
                      {nextLesson.title} ({nextLesson.titleTelugu})
                    </Text>
                    <Text style={[styles.lessonRef, { color: secondaryText }]}>
                      {nextLesson.scriptureRef} · {nextLesson.scriptureRefTelugu}
                    </Text>
                    <Text style={[styles.lessonVerse, { color: primaryText }]}>
                      "{nextLesson.memoryVerse.verseEnglish}" — {nextLesson.memoryVerse.reference}
                    </Text>
                  </View>
                )}
              </View>
            );
          })()}
        </ScrollView>
      )}

      {/* ── ENROLL CHILD MODAL (WITH FATHER / PARENT CHURCH MEMBER SEARCH) ── */}
      {showEnrollModal && (
        <TeacherEnrollChildModal
          visible={showEnrollModal}
          onClose={() => setShowEnrollModal(false)}
          churchId={churchId}
          actingMember={member}
          allClasses={classes}
          onChildEnrolled={() => {
            // Realtime updates
          }}
        />
      )}

      {/* ── CREATE / EDIT CLASS MODAL ── */}
      {showClassModal && (
        <EditClassModal
          visible={showClassModal}
          classData={selectedClassForEdit}
          churchId={churchId}
          enrolledCount={selectedClassForEdit ? getChildrenInClass(selectedClassForEdit).length : 0}
          onClose={() => {
            setShowClassModal(false);
            setSelectedClassForEdit(null);
          }}
        />
      )}

      {/* ── CLASS ROSTER MODAL ── */}
      {selectedClassForRoster && (
        <ClassRosterModal
          visible={!!selectedClassForRoster}
          classData={selectedClassForRoster}
          childrenInClass={getChildrenInClass(selectedClassForRoster)}
          allClasses={classes}
          churchId={churchId}
          onClose={() => setSelectedClassForRoster(null)}
        />
      )}

      {/* ── PROMOTION MANAGER MODAL ── */}
      {showPromotionModal && (
        <PromotionManagerModal
          visible={showPromotionModal}
          children={children}
          classes={classes}
          churchId={churchId}
          onClose={() => setShowPromotionModal(false)}
        />
      )}

      {/* ── TEACHERS & SAFEGUARDING MODAL ── */}
      {showTeachersModal && (
        <AdminTeachersModal
          visible={showTeachersModal}
          teachers={teachers}
          todayAttendance={todayTeacherAttendance}
          churchId={churchId}
          onClose={() => setShowTeachersModal(false)}
        />
      )}

      {/* ── BIBLE LEARNING CENTER CMS MODAL ── */}
      {showContentManagerModal && (
        <AdminContentManagerModal
          visible={showContentManagerModal}
          stories={stories}
          quizzes={quizzes}
          songs={songs}
          churchId={churchId}
          onClose={() => setShowContentManagerModal(false)}
        />
      )}

      {/* ── 52-WEEK & CUSTOM CURRICULUM SYLLABUS MODAL ── */}
      {showCurriculumModal && (
        <AdminCurriculumModal
          visible={showCurriculumModal}
          curriculum={curriculum}
          churchId={churchId}
          stories={stories}
          quizzes={quizzes}
          songs={songs}
          onClose={() => setShowCurriculumModal(false)}
        />
      )}

      {/* ── CLAUDE 3.5 SONNET AI STUDIO MODAL ── */}
      {showAICopilotModal && (
        <AdminAICopilotModal
          visible={showAICopilotModal}
          churchId={churchId}
          onClose={() => setShowAICopilotModal(false)}
        />
      )}

      {/* ── VBS & SUMMER CAMPS MANAGER MODAL ── */}
      {showVBSModal && (
        <AdminVBSManagerModal
          visible={showVBSModal}
          event={vbsEvent}
          churchId={churchId}
          onClose={() => setShowVBSModal(false)}
          onOpenCertificateGenerator={() => {
            const sampleChild = children[0];
            setShowVBSModal(false);
            setResumeVBSOnCertClose(true);
            setSelectedCertData({
              childName: sampleChild?.fullName || 'Ethan Joshua Raj',
              childId: sampleChild?.childId || 'KID-2026-0001',
              eventName: vbsEvent?.title || 'Kingdom Champions VBS 2026',
              eventNameTelugu: vbsEvent?.titleTelugu || 'పరలోక రాజ్య వీరులు VBS 2026',
              tierOrHouse: sampleChild?.assignedClassName || 'Gold Lions (జయము)',
              dateIssued: new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }),
              academicYear: '2026-2027',
              directorName: certSettings?.directorName || 'Sunday School Director',
              directorTitle: certSettings?.directorTitle || 'Sunday School Director',
              pastorName: certSettings?.pastorName || 'Senior Pastor',
              pastorTitle: certSettings?.pastorTitle || 'Senior Pastor',
              churchName:
                certSettings?.churchName ||
                (member as any)?.churchName ||
                'Rhema Global Ministries',
              verse: 'Be strong in the Lord and in his mighty power. — Ephesians 6:10',
              verseTelugu: 'ప్రభువు యొక్క మహాబలమునుబట్టి ఆయనయందు బలవంతులై యుండుడి. — ఎఫెసీ 6:10',
            });
          }}
        />
      )}

      {/* ── CHILD PROFILE DETAIL MODAL ── */}
      {selectedChildProfile && (
        <ChildProfileDetailModal
          visible={!!selectedChildProfile}
          child={selectedChildProfile}
          onClose={() => setSelectedChildProfile(null)}
          onDeleteRequest={c => {
            setSelectedChildProfile(null);
            setChildToDelete({
              id: c.id,
              name: c.fullName,
              childId: c.childId,
              parentName: c.parentName,
              assignedClassName: c.assignedClassName,
            });
          }}
        />
      )}

      {/* ── BILINGUAL GRADUATION & VBS CERTIFICATE MODAL ── */}
      {selectedCertData && (
        <KidsCertificateModal
          visible={!!selectedCertData}
          data={selectedCertData}
          editable
          childrenList={children}
          onUpdateData={updated => setSelectedCertData(updated)}
          onSaveDefaults={async settings => {
            await KidsMinistryService.saveCertificateSettings(churchId, settings);
            setCertSettings(settings);
          }}
          onClose={() => {
            setSelectedCertData(null);
            if (resumeVBSOnCertClose) {
              setResumeVBSOnCertClose(false);
              setShowVBSModal(true);
            }
          }}
        />
      )}

      {/* ── BEAUTIFUL DELETE CONFIRMATION MODAL ── */}
      <Modal
        visible={!!childToDelete}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!deletingChild) setChildToDelete(null);
        }}
      >
        <View style={styles.confirmBackdrop}>
          <View style={[styles.confirmCard, { backgroundColor: cardSurface, borderColor }]}>
            <View style={styles.confirmIconBubble}>
              <Trash2 size={24} color="#EF4444" />
            </View>

            <Text style={[styles.confirmTitle, { color: primaryText }]}>Remove Registration?</Text>
            <Text style={[styles.confirmSubtitle, { color: secondaryText }]}>
              Are you sure you want to remove <Text style={{ color: primaryText, fontWeight: '800' }}>{childToDelete?.name}</Text> from Sunday School?
            </Text>

            {/* Information Summary Box */}
            <View style={[styles.confirmChildInfoBox, { backgroundColor: secondarySurface, borderColor }]}>
              <View style={styles.confirmInfoRow}>
                <Text style={[styles.confirmInfoLabel, { color: secondaryText }]}>Child ID</Text>
                <Text style={[styles.confirmInfoVal, { color: primaryText }]}>{childToDelete?.childId || 'N/A'}</Text>
              </View>
              {childToDelete?.assignedClassName && (
                <View style={styles.confirmInfoRow}>
                  <Text style={[styles.confirmInfoLabel, { color: secondaryText }]}>Classroom</Text>
                  <Text style={[styles.confirmInfoVal, { color: primaryText }]}>{childToDelete?.assignedClassName}</Text>
                </View>
              )}
              {childToDelete?.parentName && (
                <View style={styles.confirmInfoRow}>
                  <Text style={[styles.confirmInfoLabel, { color: secondaryText }]}>Parent</Text>
                  <Text style={[styles.confirmInfoVal, { color: primaryText }]}>{childToDelete?.parentName}</Text>
                </View>
              )}
            </View>

            <View style={styles.confirmNoticePill}>
              <Shield size={14} color="#38BDF8" />
              <Text style={styles.confirmNoticeText}>
                The member's church family card under the Members tab will remain 100% safe and unaffected.
              </Text>
            </View>

            <View style={styles.confirmActionsRow}>
              <TouchableOpacity
                style={[styles.confirmCancelBtn, { backgroundColor: secondarySurface, borderColor }]}
                onPress={() => setChildToDelete(null)}
                disabled={deletingChild}
                activeOpacity={0.8}
              >
                <Text style={[styles.confirmCancelText, { color: primaryText }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmDeleteBtn}
                onPress={handleConfirmDeleteChild}
                disabled={deletingChild}
                activeOpacity={0.85}
              >
                {deletingChild ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Trash2 size={16} color="#FFFFFF" />
                    <Text style={styles.confirmDeleteText}>Remove Child</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── EXECUTIVE HEALTH & ANALYTICS REPORT MODAL ── */}
      {showReportsModal && (
        <AdminKidsReportsModal
          visible={showReportsModal}
          children={children}
          classes={classes}
          teachers={teachers}
          teacherAttendance={todayTeacherAttendance}
          churchName={(member as any)?.churchName || 'Rhema Global Ministries'}
          onClose={() => setShowReportsModal(false)}
        />
      )}

      {/* ── PROGRAM ATTENDANCE SESSION MANAGER MODAL ── */}
      {showSessionManagerModal && (
        <AdminSessionManagerModal
          visible={showSessionManagerModal}
          churchId={churchId}
          teachers={teachers}
          activeSession={selectedSession}
          sessionToEdit={sessionToEdit}
          initialTab={sessionManagerTab}
          onSelectSession={sess => setSelectedSession(sess)}
          onClose={() => {
            setShowSessionManagerModal(false);
            setSessionToEdit(null);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    alignItems: 'center',
  },
  headerTitleSerif: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  addBtnText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '800',
  },
  tabsRowWrapper: {
    width: '100%',
    borderBottomWidth: 1,
    borderBottomColor: '#121215',
    backgroundColor: '#000000',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 40,
    paddingVertical: 10,
    gap: 8,
  },
  tabPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  tabPillActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  tabPillText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  tabPillTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  sessionHeroCard: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  compactEmptySessionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 11,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  compactEmptyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  compactEmptyIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactEmptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  compactEmptySub: {
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 1.5,
  },
  compactCreateSessionBtn: {
    height: 36,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
  },
  compactCreateSessionBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  programCardAccentBar: {
    height: 4,
    width: '100%',
  },
  sessionCardBody: {
    padding: 16,
    gap: 13,
  },
  sessionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  programEmojiBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTagInline: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 4,
  },
  categoryTagInlineText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  selectedSessionTitle: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.35,
    lineHeight: 24,
  },
  programSessionSub: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  liveStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  livePulseDot: {
    width: 6.5,
    height: 6.5,
    borderRadius: 3.5,
  },
  liveStatusText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  sessionMetaGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  metaGridTile: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
  },
  metaGridLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaGridEyebrow: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  metaGridValue: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  finalizeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  finalizeLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  finalizeBarTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  finalizeBarSub: {
    fontSize: 11,
    marginTop: 1,
  },
  attendanceStatsPills: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attStatChip: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  attStatChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  finalizeActionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finalizeActionBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  sessionActionsToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolbarPrimaryBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
  },
  toolbarPrimaryBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  toolbarSecondaryBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
  },
  toolbarSecondaryBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  toolbarDeleteBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  toolbarDeleteBtnText: {
    color: '#EF4444',
    fontSize: 12.5,
    fontWeight: '700',
  },
  sessionSwitcherTray: {
    borderTopWidth: 1,
    paddingTop: 13,
    gap: 10,
  },
  trayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trayHeading: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  manageAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  trayCount: {
    fontSize: 11,
    fontWeight: '800',
  },
  sessionTypeChipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  sessionTypeChip: {
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 999,
    borderWidth: 1,
  },
  sessionTypeChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  sessionsCarousel: {
    flexDirection: 'row',
    gap: 9,
    paddingTop: 2,
  },
  sessionCardPill: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 5,
    width: 172,
  },
  sessionPillTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  sessionPillEmojiWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeTagBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  activeTagText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  sessionPillTitle: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  sessionPillDate: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpiCard: {
    width: (width - 48) / 2,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kpiIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiNumber: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#FFFFFF',
  },
  kpiTitle: {
    fontSize: 13,
    color: '#F1F5F9',
    fontWeight: '700',
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  stationsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stationCard: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: '#1E293B',
    position: 'relative',
  },
  stationIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stationTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  stationSub: {
    fontSize: 10.5,
    color: '#94A3B8',
    lineHeight: 14,
  },
  stationArrow: {
    position: 'absolute',
    top: 10,
    right: 8,
  },
  portalGrid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  portalGridCard: {
    width: (width - 48) / 2,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  portalCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  portalGridIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalGridTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  portalGridSub: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 15,
    marginTop: 2,
  },
  additionalPortalsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 6,
  },
  smallPortalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  smallPortalPillText: {
    fontSize: 10.5,
    color: '#E2E8F0',
    fontWeight: '700',
  },
  portalCard: {
    backgroundColor: '#18181B',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  portalIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portalTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  portalSub: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  searchBar: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    padding: 0,
  },
  emptyCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  emptyCardText: {
    color: '#9CA3AF',
    fontSize: 13,
  },
  childCard: {
    backgroundColor: '#18181B',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 10,
  },
  childCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  faceCheckDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#18181B',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  childNameSerif: {
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  idBadge: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  idBadgeText: {
    fontSize: 9,
    color: '#93C5FD',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  childMeta: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  allergyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  allergyTagText: {
    color: '#F87171',
    fontSize: 10,
    fontWeight: '700',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childCardDivider: {
    height: 1,
    backgroundColor: '#27272A',
  },
  guardianRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guardianText: {
    fontSize: 11,
    color: '#9CA3AF',
    flex: 1,
  },
  pickupPill: {
    backgroundColor: '#27272A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pickupPillText: {
    color: '#D4D4D8',
    fontSize: 10,
    fontWeight: '600',
  },
  // ── CONFIRMATION MODAL STYLES ──
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#0F172A',
    borderRadius: 22,
    padding: 22,
    borderWidth: 1.5,
    borderColor: '#334155',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  confirmIconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  confirmTitle: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
  },
  confirmSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 16,
  },
  confirmChildInfoBox: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
    marginBottom: 14,
  },
  confirmInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confirmInfoLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  confirmInfoVal: {
    fontSize: 12,
    color: '#F1F5F9',
    fontWeight: '700',
  },
  confirmNoticePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    marginBottom: 20,
    width: '100%',
  },
  confirmNoticeText: {
    fontSize: 11,
    color: '#7DD3FC',
    lineHeight: 15,
    flex: 1,
  },
  confirmActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  confirmDeleteBtn: {
    flex: 1.2,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  confirmDeleteText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  classCard: {
    backgroundColor: '#18181B',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 10,
  },
  promotionBannerCard: {
    backgroundColor: '#18181B',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  promotionBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gradIconBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promotionBannerTitle: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  promotionBannerSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
    lineHeight: 15,
  },
  promotionActionBtn: {
    backgroundColor: '#FBBF24',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  promotionActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#000000',
  },
  capacityBarTrack: {
    height: 6,
    backgroundColor: '#27272A',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  capacityBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  classActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 8,
  },
  editClassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#27272A',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  editClassBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  viewRosterBtn: {
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  viewRosterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FBBF24',
  },
  classCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tierTag: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  tierTagText: {
    color: '#93C5FD',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
  },
  classTitle: {
    fontSize: 17,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  classSchedule: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  capacityBadge: {
    alignItems: 'flex-end',
  },
  capacityText: {
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '900',
    color: '#34D399',
  },
  capacitySub: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  classFooter: {
    flexDirection: 'column',
    gap: 10,
  },
  teacherName: {
    fontSize: 11,
    color: '#D4D4D8',
    fontWeight: '500',
  },
  viewRosterLink: {
    fontSize: 11,
    color: '#FBBF24',
    fontWeight: '700',
  },
  curriculumHero: {
    backgroundColor: '#18181B',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  curriculumHeroTitle: {
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  curriculumHeroSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  lessonCard: {
    backgroundColor: '#18181B',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 6,
  },
  lessonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lessonWeek: {
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: '#FBBF24',
    letterSpacing: 1.2,
  },
  approvedBadge: {
    fontSize: 10,
    color: '#34D399',
    fontWeight: '600',
  },
  lessonTitle: {
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
  },
  lessonRef: {
    fontSize: 11,
    color: '#93C5FD',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  lessonVerse: {
    fontSize: 12,
    color: '#D1D5DB',
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 4,
  },
  classesActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#18181B',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    overflow: 'hidden',
  },
  classesHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  classesHeaderSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
    lineHeight: 15,
  },
  createClassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    gap: 5,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
  },
  createClassBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
  },
  emptyClassesCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 8,
  },
  emptyClassesTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  emptyClassesSub: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 8,
  },
  deleteClassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
  },
  deleteClassBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
});
