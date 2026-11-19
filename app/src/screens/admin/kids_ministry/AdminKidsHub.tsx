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
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { AdminTabContext } from '../../../context/AdminTabContext';
import KidsMinistryService from '../../../services/KidsMinistryService';
import { CustomAlert } from '../../../components/CustomAlert';
import { useAdminTheme } from '../../../utils/adminThemeHelper';
import {
  ChildRecord,
  KidsClassRecord,
  KidsTeacherRecord,
  KidsBibleStory,
  KidsQuiz,
  KidsWorshipSong,
  KidsCurriculumLesson,
  KidsVBSEventRecord,
  KidsCertificateData,
} from '../../../types/KidsMinistryTypes';
import EnrollChildModal from '../../kids_ministry/components/EnrollChildModal';
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

const { width } = Dimensions.get('window');

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
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [selectedCertData, setSelectedCertData] = useState<KidsCertificateData | null>(null);

  // Beautiful Delete Confirmation Modal state
  const [childToDelete, setChildToDelete] = useState<{ id: string; name: string; childId?: string; parentName?: string; assignedClassName?: string } | null>(null);
  const [deletingChild, setDeletingChild] = useState(false);

  // Phase 5, 6 & 9: Learning content, 52-week curriculum & VBS state
  const [stories, setStories] = useState<KidsBibleStory[]>([]);
  const [quizzes, setQuizzes] = useState<KidsQuiz[]>([]);
  const [songs, setSongs] = useState<KidsWorshipSong[]>([]);
  const [curriculum, setCurriculum] = useState<KidsCurriculumLesson[]>([]);
  const [vbsEvent, setVbsEvent] = useState<KidsVBSEventRecord | null>(null);

  // Load children, classes, teachers, curriculum & VBS (Realtime)
  useEffect(() => {
    // Sync all church registered children from Member module into Kids Ministry
    KidsMinistryService.syncMemberChildrenToKidsMinistry(churchId).catch(err => {
      console.warn('[AdminKidsHub] Auto-sync church member children error:', err);
    });

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

    // 8. Realtime listener for 52-Week Curriculum
    const unsubCurriculum = KidsMinistryService.subscribeToCurriculum(churchId, list => {
      setCurriculum(list);
    });

    // 9. Realtime listener for VBS Events
    const unsubVBS = KidsMinistryService.subscribeToVBSEvent(churchId, ev => {
      setVbsEvent(ev);
    });

    return () => {
      unsubClasses();
      unsubKids();
      unsubTeachers();
      unsubTeacherAtt();
      unsubStories();
      unsubQuizzes();
      unsubSongs();
      unsubCurriculum();
      unsubVBS();
    };
  }, [churchId]);

  // Children eligible for next tier promotion
  const promotionCandidates = useMemo(() => {
    return KidsMinistryService.checkPromotionEligibility(children);
  }, [children]);

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
              {/* 4 Clean & Compact Executive Metric Cards */}
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
                  <Text style={[styles.kpiSub, { color: secondaryText }]}>Total Sunday School</Text>
                </View>

                {/* 2. Checked-In Today */}
                <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }]}>
                  <View style={styles.kpiHeaderRow}>
                    <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                      <UserCheck size={16} color="#34D399" />
                    </View>
                    <Text style={[styles.kpiNumber, { color: '#34D399' }]}>
                      {children.filter(c => c.custodyStatus === 'checked_in').length}
                    </Text>
                  </View>
                  <Text style={[styles.kpiTitle, { color: primaryText }]}>Checked-In</Text>
                  <Text style={[styles.kpiSub, { color: secondaryText }]}>Active today in class</Text>
                </View>

                {/* 3. Faculty On Duty */}
                <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }]}>
                  <View style={styles.kpiHeaderRow}>
                    <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                      <Clock size={16} color="#FBBF24" />
                    </View>
                    <Text style={[styles.kpiNumber, { color: '#FBBF24' }]}>
                      {todayTeacherAttendance.length}/{teachers.length || 5}
                    </Text>
                  </View>
                  <Text style={[styles.kpiTitle, { color: primaryText }]}>Faculty On Duty</Text>
                  <Text style={[styles.kpiSub, { color: secondaryText }]}>Clocked-in teachers</Text>
                </View>

                {/* 4. Face Scan Ready */}
                <View style={[styles.kpiCard, { backgroundColor: cardSurface, borderColor }]}>
                  <View style={styles.kpiHeaderRow}>
                    <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(139, 92, 246, 0.15)' }]}>
                      <Camera size={16} color="#C084FC" />
                    </View>
                    <Text style={[styles.kpiNumber, { color: '#A78BFA' }]}>
                      {children.filter(c => c.faceEnrolled).length}
                    </Text>
                  </View>
                  <Text style={[styles.kpiTitle, { color: primaryText }]}>Face Scan</Text>
                  <Text style={[styles.kpiSub, { color: secondaryText }]}>Biometric profiles</Text>
                </View>
              </View>

              {/* Sunday Morning Stations */}
              <View style={{ gap: 8, marginTop: 14, marginBottom: 4 }}>
                <Text style={[styles.sectionHeading, { color: secondaryText }]}>SUNDAY MORNING ACTIVE STATIONS</Text>

                <View style={styles.stationsRow}>
                  {/* Face Scan Kiosk */}
                  <TouchableOpacity
                    style={[styles.stationCard, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => navigation.navigate('KidsFaceScanKiosk')}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.stationIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                      <Camera size={18} color="#60A5FA" />
                    </View>
                    <Text style={[styles.stationTitle, { color: primaryText }]}>Face Scan</Text>
                    <Text style={[styles.stationSub, { color: secondaryText }]}>Entrance kiosk</Text>
                    <View style={styles.stationArrow}>
                      <ChevronRight size={14} color="#60A5FA" />
                    </View>
                  </TouchableOpacity>

                  {/* Teacher Exit */}
                  <TouchableOpacity
                    style={[styles.stationCard, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => navigation.navigate('KidsCheckOutScanner')}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.stationIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                      <UserCheck size={18} color="#34D399" />
                    </View>
                    <Text style={[styles.stationTitle, { color: primaryText }]}>Teacher Exit</Text>
                    <Text style={[styles.stationSub, { color: secondaryText }]}>Dismissal scanner</Text>
                    <View style={styles.stationArrow}>
                      <ChevronRight size={14} color="#34D399" />
                    </View>
                  </TouchableOpacity>

                  {/* Faculty Clock-In */}
                  <TouchableOpacity
                    style={[styles.stationCard, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => navigation.navigate('KidsTeacherKiosk')}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.stationIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                      <Clock size={18} color="#FBBF24" />
                    </View>
                    <Text style={[styles.stationTitle, { color: primaryText }]}>Clock-In</Text>
                    <Text style={[styles.stationSub, { color: secondaryText }]}>Teacher arrival</Text>
                    <View style={styles.stationArrow}>
                      <ChevronRight size={14} color="#FBBF24" />
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
                      {teachers.length} members · {todayTeacherAttendance.length} on duty
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
                    onPress={() => setActiveTab('curriculum')}
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
                    <Text style={[styles.portalGridTitle, { color: primaryText }]}>Claude AI Studio</Text>
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
                  <View key={c.id} style={[styles.childCard, { backgroundColor: cardSurface, borderColor }]}>
                    <View style={styles.childCardHeader}>
                      <View style={styles.avatarWrap}>
                        <View style={styles.avatarCircle}>
                          <Text style={styles.avatarInitials}>
                            {c.firstName.charAt(0)}{c.lastName ? c.lastName.charAt(0) : ''}
                          </Text>
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
                          {c.guardians ? c.guardians.length : 1} Pickups
                        </Text>
                      </View>
                    </View>
                  </View>
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
                              Age {cls.ageRange?.min ?? 0}–{cls.ageRange?.max ?? 14} yrs
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
          {/* TAB 4: 52-WEEK CURRICULUM                            */}
          {/* ==================================================== */}
          {activeTab === 'curriculum' && (
            <View style={{ gap: 12 }}>
              <View style={[styles.curriculumHero, { backgroundColor: cardSurface, borderColor }]}>
                <Sparkles size={20} color="#FBBF24" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.curriculumHeroTitle, { color: primaryText }]}>52-Week Bilingual Curriculum</Text>
                  <Text style={[styles.curriculumHeroSub, { color: secondaryText }]}>
                    {curriculum.length || 52} Weeks · Telugu & English Syllabus for 2026-2027
                  </Text>
                </View>
              </View>

              {/* 52-Week Full Syllabus Launcher */}
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
                    Open 52-Week Curriculum Syllabus
                  </Text>
                  <Text style={[styles.portalSub, { color: secondaryText }]}>
                    Browse Q1-Q4 schedules, set live Sunday active week & export to WhatsApp
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

              {/* Claude 3.5 Sonnet AI Studio Launcher */}
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
                    Launch Claude 3.5 Sonnet AI Studio
                  </Text>
                  <Text style={[styles.portalSub, { color: secondaryText }]}>
                    Generate bilingual lesson plans, 4-choice quizzes, storybooks & craft ideas
                  </Text>
                </View>
                <ChevronRight size={18} color="#C084FC" />
              </TouchableOpacity>

              {/* Active Lesson Card (Dynamic from Firestore) */}
              {(() => {
                const activeLesson = curriculum.find(l => l.isCurrentWeek) || curriculum[0];
                if (!activeLesson) return null;
                return (
                  <View style={[styles.lessonCard, { backgroundColor: cardSurface, borderColor: '#10B981' }]}>
                    <View style={styles.lessonHeader}>
                      <Text style={[styles.lessonWeek, { color: '#10B981' }]}>
                        WEEK {activeLesson.weekNumber} · CURRENT ACTIVE SUNDAY
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
                    <Text style={[styles.lessonVerse, { color: secondaryText, fontStyle: 'normal' }]}>
                      "{activeLesson.memoryVerse.verseTelugu}" — {activeLesson.memoryVerse.reference}
                    </Text>
                  </View>
                );
              })()}

              <View style={[styles.lessonCard, { backgroundColor: cardSurface, borderColor }]}>
                <View style={styles.lessonHeader}>
                  <Text style={styles.lessonWeek}>WEEK 43 · NEXT SUNDAY</Text>
                  <Text style={styles.approvedBadge}>✓ Approved</Text>
                </View>
                <Text style={[styles.lessonTitle, { color: primaryText }]}>Daniel in the Lions' Den (విశ్వాసము / Faith)</Text>
                <Text style={[styles.lessonRef, { color: secondaryText }]}>Daniel 6 · దానియేలు 6</Text>
                <Text style={[styles.lessonVerse, { color: primaryText }]}>
                  "నా దేవుడు తన దూతను పంపి సింహముల నోళ్లు మూయించెను." — Dan 6:22
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── ENROLL CHILD MODAL ── */}
      {showEnrollModal && (
        <EnrollChildModal
          visible={showEnrollModal}
          onClose={() => setShowEnrollModal(false)}
          churchId={churchId}
          member={member}
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

      {/* ── 52-WEEK CURRICULUM SYLLABUS MODAL ── */}
      {showCurriculumModal && (
        <AdminCurriculumModal
          visible={showCurriculumModal}
          curriculum={curriculum}
          churchId={churchId}
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
            setSelectedCertData({
              childName: sampleChild?.fullName || 'Ethan Joshua Raj',
              childId: sampleChild?.childId || 'KID-2026-0001',
              eventName: 'Kingdom Champions VBS 2026',
              eventNameTelugu: 'పరలోక రాజ్య వీరులు VBS 2026',
              tierOrHouse: 'Gold Lions (జయము)',
              dateIssued: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
              academicYear: '2026-2027',
              directorName: 'Mrs. Sarah Jenkins',
              pastorName: 'Rev. Dr. P. Johnson',
              churchName: (member as any)?.churchName || 'Rhema Global Ministries',
              verse: 'Be strong in the Lord and in his mighty power. — Ephesians 6:10',
              verseTelugu: 'ప్రభువు యొక్క మహాబలమునుబట్టి ఆయనయందు బలవంతులై యుండుడి. — ఎఫెసీ 6:10',
            });
          }}
        />
      )}

      {/* ── BILINGUAL GRADUATION & VBS CERTIFICATE MODAL ── */}
      {selectedCertData && (
        <KidsCertificateModal
          visible={!!selectedCertData}
          data={selectedCertData}
          onClose={() => setSelectedCertData(null)}
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
