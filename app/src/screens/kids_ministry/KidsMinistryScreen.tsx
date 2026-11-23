import React, { useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  Platform,
  Alert,
  Linking,
  Image,
  Modal,
  BackHandler,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Users,
  Shield,
  BookOpen,
  Award,
  Calendar,
  User,
  Plus,
  CheckCircle2,
  UserCheck,
  Phone,
  MessageCircle,
  Check,
  AlertTriangle,
  ArrowUpRight,
  ChevronRight,
} from 'lucide-react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import KidsMinistryService from '../../services/KidsMinistryService';
import {
  ChildRecord,
  KidsClassRecord,
  KidsTeacherRecord,
  KidsBibleStory,
  KidsQuiz,
  KidsWorshipSong,
  KidsCurriculumLesson,
  KidsVBSEventRecord,
  KidsBadge,
  KidsCertificateData,
  KidsCurriculumConfig,
  KidsAttendanceSession,
  KidsSessionRecord,
  KidsAttendanceLogRecord,
  resolveActiveCurriculumLesson,
  formatCurriculumDateDisplay,
  resolveLessonTierKey,
  resolveChildConsentInfo,
  buildChildProgramAttendanceEntries,
} from '../../types/KidsMinistryTypes';
import KidsSplashScreen from './components/KidsSplashScreen';
import EnrollChildModal from './components/EnrollChildModal';
import KidsStoryReaderModal from './components/KidsStoryReaderModal';
import { getFullStoryContent, estimateStoryReadTime } from './components/BibleStoryReaderContent';
import KidsQuizPlayerModal from './components/KidsQuizPlayerModal';
import KidsSongPlayerModal from './components/KidsSongPlayerModal';
import KidsLessonDetailModal from './components/KidsLessonDetailModal';
import KidsCertificateModal from './components/KidsCertificateModal';
import KidsExploreCategoryModal, { KidsExploreCategory } from './components/KidsExploreCategoryModal';
import KidsAttendanceSafetyModal, { KidsSafetyModalSection } from './components/KidsAttendanceSafetyModal';

const { width } = Dimensions.get('window');

const KIDS_CATEGORY_ICONS = {
  stories: require('../../../assets/kids_cat_stories.png'),
  quizzes: require('../../../assets/kids_cat_quizzes.png'),
  lessons: require('../../../assets/kids_cat_lessons.png'),
  songs: require('../../../assets/kids_cat_songs.png'),
  attendance: require('../../../assets/3d_attendance.png'),
  safety: require('../../../assets/3d_members_family.png'),
  classroom: require('../../../assets/3d_sermon_notes.png'),
  history: require('../../../assets/3d_events.png'),
  enroll: require('../../../assets/3d_members.png'),
};

const KIDS_BIBLE_QUOTES = [
  {
    text: 'Let the little children come to me, and do not hinder them, for the kingdom of heaven belongs to such as these.',
    ref: 'Matthew 19:14',
  },
  {
    text: 'I can do all things through Christ who strengthens me.',
    ref: 'Philippians 4:13',
  },
  {
    text: 'Be strong and courageous. Do not be afraid; for the LORD your God will be with you wherever you go.',
    ref: 'Joshua 1:9',
  },
  {
    text: 'Your word is a lamp to my feet and a light to my path.',
    ref: 'Psalm 119:105',
  },
  {
    text: 'The LORD is my shepherd; I shall not want.',
    ref: 'Psalm 23:1',
  },
  {
    text: 'Train up a child in the way he should go; even when he is old he will not depart from it.',
    ref: 'Proverbs 22:6',
  },
  {
    text: 'Children, obey your parents in the Lord, for this is right.',
    ref: 'Ephesians 6:1',
  },
];

export default function KidsMinistryScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const { isDark, colors: themeColors } = useTheme();
  const churchId = member?.churchId || 'rhema';

  // Dynamic Theme Palette Support (Modern Pastel White & Dark)
  const isLight = !isDark;
  const theme = useMemo(() => {
    return {
      isDark,
      isLight,
      screenBg: isDark ? '#0B0F19' : '#FFFDF9',
      headerBg: isDark ? '#0B0F19' : '#FFFDF9',
      cardBg: isDark ? '#161C2E' : '#FFFFFF',
      innerCardBg: isDark ? '#1E2538' : '#F8FAFC',
      border: isDark ? '#283149' : '#E2E8F0',
      borderLight: isDark ? '#1E2538' : '#F1F5F9',
      textPrimary: isDark ? '#F8FAFC' : '#111827',
      textSecondary: isDark ? '#94A3B8' : '#64748B',
      textMuted: isDark ? '#64748B' : '#94A3B8',
      goldAccent: isDark ? '#FBBF24' : '#D97706',
      goldBg: isDark ? 'rgba(251, 191, 36, 0.15)' : '#FEF3C7',
      coralPrimary: '#FF6B4A',
      purpleAccent: '#7C3AED',
      peachBg: isDark ? '#291D1B' : '#FFF0EC',
      peachBorder: isDark ? '#422B27' : '#FED7AA',
      skyBg: isDark ? '#13283A' : '#DCF2FF',
      skyBorder: isDark ? '#1E3E59' : '#BAE6FD',
      lavenderBg: isDark ? '#231B3C' : '#EFE9FE',
      lavenderBorder: isDark ? '#382B60' : '#DDD6FE',
      amberBg: isDark ? '#2B2212' : '#FEF3C7',
      mintBg: isDark ? '#112A22' : '#DCFCE7',
      roseBg: isDark ? '#2D1725' : '#FCE7F3',
      tabBarBg: isDark ? '#161C2E' : '#FFFFFF',
      tabPillInactiveBg: isDark ? '#1E2538' : '#F1F5F9',
      tabPillInactiveBorder: isDark ? '#283149' : '#E2E8F0',
      tabPillInactiveText: isDark ? '#94A3B8' : '#64748B',
      tabPillActiveBg: '#FF6B4A',
      tabPillActiveBorder: '#FF6B4A',
      tabPillActiveText: '#FFFFFF',
      backBtnBg: isDark ? '#1E2538' : '#FFFFFF',
      backBtnIcon: isDark ? '#F8FAFC' : '#111827',
      addKidBtnBg: isDark ? '#7C3AED' : '#111827',
      addKidBtnText: '#FFFFFF',
      childBarBg: isDark ? '#111726' : '#FFFFFF',
      childBarBorder: isDark ? '#283149' : '#E2E8F0',
      childChipInactiveBg: isDark ? '#1E2538' : '#F8FAFC',
      childChipInactiveBorder: isDark ? '#283149' : '#E2E8F0',
      childChipActiveBg: isDark ? '#231B3C' : '#EFE9FE',
      childChipActiveBorder: '#7C3AED',
      dropdownBg: isDark ? '#161C2E' : '#FFFFFF',
    };
  }, [isDark, themeColors]);

  // Splash Screen State
  const [showSplash, setShowSplash] = useState(true);

  // Data State
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [classes, setClasses] = useState<KidsClassRecord[]>([]);
  const [teachers, setTeachers] = useState<KidsTeacherRecord[]>([]);
  const [stories, setStories] = useState<KidsBibleStory[]>([]);
  const [quizzes, setQuizzes] = useState<KidsQuiz[]>([]);
  const [songs, setSongs] = useState<KidsWorshipSong[]>([]);
  const [curriculum, setCurriculum] = useState<KidsCurriculumLesson[]>([]);
  const [loadingCurriculum, setLoadingCurriculum] = useState(true);
  const [curriculumConfig, setCurriculumConfig] = useState<KidsCurriculumConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedChildIndex, setSelectedChildIndex] = useState(0);
  const [existingHousehold, setExistingHousehold] = useState<any[]>([]);
  const [goalChecks, setGoalChecks] = useState<[boolean, boolean, boolean]>([false, false, false]);

  // Modals state
  const [selectedStoryForReader, setSelectedStoryForReader] = useState<KidsBibleStory | null>(null);
  const [selectedQuizForPlayer, setSelectedQuizForPlayer] = useState<KidsQuiz | null>(null);
  const [selectedSongForPlayer, setSelectedSongForPlayer] = useState<KidsWorshipSong | null>(null);
  const [selectedLessonForModal, setSelectedLessonForModal] = useState<KidsCurriculumLesson | null>(null);
  const [selectedLessonDate, setSelectedLessonDate] = useState<string | null>(null);
  const [exploreCategory, setExploreCategory] = useState<KidsExploreCategory | null>(null);
  const [selectedCertData, setSelectedCertData] = useState<KidsCertificateData | null>(null);
  const [vbsEvent, setVbsEvent] = useState<KidsVBSEventRecord | null>(null);
  const [kingdomBadges] = useState<KidsBadge[]>(() => KidsMinistryService.getKingdomBadges());

  // Navigation Tabs: 'home' | 'classroom'
  const [activeTab, setActiveTab] = useState<'home' | 'classroom'>('home');
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showChildPicker, setShowChildPicker] = useState(false);
  const [confirmingConsent, setConfirmingConsent] = useState(false);

  // Program-Wise Attendance & Parent Safety State (strictly tagged by active childDocId)
  const [programSessions, setProgramSessions] = useState<KidsAttendanceSession[]>([]);
  const [childCustodyState, setChildCustodyState] = useState<{
    childDocId: string | null;
    records: KidsSessionRecord[];
    loading: boolean;
  }>({ childDocId: null, records: [], loading: false });
  const [childAttendanceState, setChildAttendanceState] = useState<{
    childDocId: string | null;
    logs: KidsAttendanceLogRecord[];
    loading: boolean;
  }>({ childDocId: null, logs: [], loading: false });
  const [safetyModalSection, setSafetyModalSection] = useState<KidsSafetyModalSection | null>(null);
  const [safetyInitialProgramId, setSafetyInitialProgramId] = useState<string | null>(null);

  // Load registered children for the family in realtime
  useEffect(() => {
    if (!member) {
      setLoading(false);
      return;
    }

    const familyId = member.accountId || member.id;

    // Automatically sync registered children from Member tab to Rhema Kids (single source of truth)
    KidsMinistryService.syncMemberChildrenToKidsMinistry(churchId, familyId).catch(err => {
      console.warn('[KidsMinistryScreen] Auto-sync children error:', err);
    });

    // Load existing household members for seamless pre-fill (without touching existing screens)
    KidsMinistryService.getExistingFamilyMembers(churchId, familyId).then(contacts => {
      setExistingHousehold(contacts);
    });

    // Realtime subscription to Sunday School classes
    const unsubClasses = KidsMinistryService.subscribeToClasses(churchId, classList => {
      setClasses(classList);
    });

    // Realtime subscription to Sunday School faculty/teachers
    const unsubTeachers = KidsMinistryService.subscribeToTeachers(churchId, teacherList => {
      setTeachers(teacherList);
    });

    // Realtime subscription to Bible Stories (only published stories visible to members)
    const unsubStories = KidsMinistryService.subscribeToStories(churchId, storyList => {
      setStories(storyList.filter(s => s.isPublished !== false));
    });

    // Realtime subscription to Quizzes (only published quizzes visible to members)
    const unsubQuizzes = KidsMinistryService.subscribeToQuizzes(churchId, quizList => {
      setQuizzes(quizList.filter(q => q.isPublished !== false));
    });

    // Realtime subscription to Action Songs
    const unsubSongs = KidsMinistryService.subscribeToSongs(churchId, songList => {
      setSongs(songList);
    });

    // Realtime subscription to 52-Week Curriculum
    const unsubCurriculum = KidsMinistryService.subscribeToCurriculum(churchId, curList => {
      setCurriculum(curList);
      setLoadingCurriculum(false);
    });

    // Realtime subscription to Curriculum Launch Config
    const unsubCurConfig = KidsMinistryService.subscribeToCurriculumConfig(churchId, cfg => {
      setCurriculumConfig(cfg);
    });

    // Realtime subscription to VBS 2026
    const unsubVBS = KidsMinistryService.subscribeToVBSEvent(churchId, ev => {
      setVbsEvent(ev);
    });

    // Realtime subscription to all church Kids Ministry program sessions
    const unsubProgramSessions = KidsMinistryService.subscribeToProgramSessions(churchId, list => {
      setProgramSessions(list);
    });

    // Realtime subscription to children linked strictly to this family/parent
    const unsubscribe = KidsMinistryService.subscribeToFamilyChildren(
      churchId,
      familyId,
      kidList => {
        setChildren(kidList);
        setLoading(false);
      },
      { parentMemberId: member.id }
    );

    return () => {
      unsubClasses();
      unsubTeachers();
      unsubStories();
      unsubQuizzes();
      unsubSongs();
      unsubCurriculum();
      unsubCurConfig();
      unsubVBS();
      unsubProgramSessions();
      unsubscribe();
    };
  }, [member?.id, member?.accountId, churchId]);

  const safeSelectedChildIndex =
    children.length > 0 ? Math.min(selectedChildIndex, children.length - 1) : 0;
  const activeChild = children[safeSelectedChildIndex] || null;

  const activeChildId = activeChild?.id || null;

  // Realtime subscriptions for active child's attendance & custody history (strictly scoped by childDocId)
  useEffect(() => {
    if (!activeChildId) {
      setChildCustodyState({ childDocId: null, records: [], loading: false });
      setChildAttendanceState({ childDocId: null, logs: [], loading: false });
      return;
    }

    let cancelled = false;
    setChildCustodyState({ childDocId: activeChildId, records: [], loading: true });
    setChildAttendanceState({ childDocId: activeChildId, logs: [], loading: true });

    const unsubCustody = KidsMinistryService.subscribeToChildCustodyHistory(
      churchId,
      activeChildId,
      records => {
        if (cancelled) return;
        setChildCustodyState({
          childDocId: activeChildId,
          records: records.filter(r => !r.childDocId || r.childDocId === activeChildId),
          loading: false,
        });
      }
    );
    const unsubLogs = KidsMinistryService.subscribeToChildAttendanceLogs(
      churchId,
      activeChildId,
      logs => {
        if (cancelled) return;
        setChildAttendanceState({
          childDocId: activeChildId,
          logs: logs.filter(l => !l.childDocId || l.childDocId === activeChildId),
          loading: false,
        });
      }
    );
    return () => {
      cancelled = true;
      unsubCustody();
      unsubLogs();
    };
  }, [churchId, activeChildId]);

  const childCustodyRecords = useMemo(
    () =>
      activeChildId && childCustodyState.childDocId === activeChildId
        ? childCustodyState.records
        : [],
    [activeChildId, childCustodyState]
  );

  const childAttendanceLogs = useMemo(
    () =>
      activeChildId && childAttendanceState.childDocId === activeChildId
        ? childAttendanceState.logs
        : [],
    [activeChildId, childAttendanceState]
  );

  const loadingChildAttendance = Boolean(
    activeChildId &&
      (childCustodyState.childDocId !== activeChildId ||
        childCustodyState.loading ||
        childAttendanceState.childDocId !== activeChildId ||
        childAttendanceState.loading)
  );

  // Handle deep-linking from Kids Check-In / Check-Out / Absent / Consent push notifications
  useEffect(() => {
    const p = route?.params;
    if (!p || loading) return;
    const cat = p.initialCategory;
    if (cat === 'attendance' || cat === 'consent' || cat === 'history') {
      if (p.childDocId && children.length > 0) {
        const idx = children.findIndex(c => c.id === p.childDocId || c.childId === p.childDocId);
        if (idx >= 0) setSelectedChildIndex(idx);
      }
      setShowSplash(false);
      setSafetyInitialProgramId(p.programSessionId || null);
      setSafetyModalSection(cat === 'consent' ? 'consent' : cat === 'history' ? 'history' : 'overview');
      navigation?.setParams?.({
        initialCategory: undefined,
        childDocId: undefined,
        programSessionId: undefined,
      });
    }
  }, [route?.params, loading, children]);

  const programAttendanceEntries = useMemo(
    () =>
      buildChildProgramAttendanceEntries({
        child: activeChild,
        programSessions,
        custodyRecords: childCustodyRecords,
        attendanceLogs: childAttendanceLogs,
        classes,
        teachers,
      }),
    [activeChild, programSessions, childCustodyRecords, childAttendanceLogs, classes, teachers]
  );

  const activeTodayEntry = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return (
      programAttendanceEntries.find(e => e.attendanceStatus === 'present') ||
      programAttendanceEntries.find(e => e.date === todayStr) ||
      programAttendanceEntries[0] ||
      null
    );
  }, [programAttendanceEntries]);

  const activeConsentInfo = useMemo(() => resolveChildConsentInfo(activeChild), [activeChild]);

  // Maintain intuitive stack on Android hardware back button:
  // Classroom / Learn -> Home Screen -> Welcome Screen -> Exit Rhema Kids
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (
        showEnrollModal ||
        showChildPicker ||
        selectedStoryForReader ||
        selectedQuizForPlayer ||
        selectedSongForPlayer ||
        selectedLessonForModal ||
        exploreCategory ||
        safetyModalSection ||
        selectedCertData
      ) {
        return false;
      }
      if (!showSplash && activeTab !== 'home') {
        setActiveTab('home');
        return true;
      }
      if (!showSplash) {
        setShowSplash(true);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [
    showSplash,
    activeTab,
    showEnrollModal,
    showChildPicker,
    selectedStoryForReader,
    selectedQuizForPlayer,
    selectedSongForPlayer,
    selectedLessonForModal,
    exploreCategory,
    safetyModalSection,
    selectedCertData,
  ]);

  const assignedClass = useMemo(() => {
    if (!activeChild) return null;
    return (
      classes.find(c => activeChild.assignedClassId && c.id === activeChild.assignedClassId) ||
      classes.find(c => c.tier === activeChild.assignedTier) ||
      null
    );
  }, [classes, activeChild]);

  const assignedTeacherRecord = useMemo(() => {
    if (!teachers.length) return null;
    if (assignedClass?.leadTeacherId) {
      const byId = teachers.find(
        t => t.id === assignedClass.leadTeacherId || t.memberId === assignedClass.leadTeacherId
      );
      if (byId) return byId;
    }
    if (assignedClass?.leadTeacherName) {
      const target = assignedClass.leadTeacherName.trim().toLowerCase();
      const byName = teachers.find(t => (t.name || '').trim().toLowerCase() === target);
      if (byName) return byName;
    }
    if (activeChild?.assignedTier) {
      return (
        teachers.find(t => t.assignedClassTier === activeChild.assignedTier && t.role === 'lead_teacher') ||
        teachers.find(t => t.assignedClassTier === activeChild.assignedTier) ||
        null
      );
    }
    return null;
  }, [teachers, assignedClass, activeChild?.assignedTier]);

  const leadTeacherDisplayName =
    assignedClass?.leadTeacherName || assignedTeacherRecord?.name || 'Sunday School Teacher';
  const leadTeacherPhone =
    (assignedClass?.leadTeacherPhone || assignedTeacherRecord?.phone || '').trim();

  const activeLessonInfo = useMemo(
    () => resolveActiveCurriculumLesson({ config: curriculumConfig, lessons: curriculum }),
    [curriculumConfig, curriculum]
  );

  const homeworkStorageKey = useMemo(() => {
    const childKey = activeChild?.id || 'default';
    const lessonKey = activeLessonInfo.lesson?.id || 'current';
    return `rhema_kids_hw_${childKey}_${lessonKey}`;
  }, [activeChild?.id, activeLessonInfo.lesson?.id]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(homeworkStorageKey)
      .then(raw => {
        if (!active) return;
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length === 3) {
            setGoalChecks([Boolean(parsed[0]), Boolean(parsed[1]), Boolean(parsed[2])]);
            return;
          }
        }
        setGoalChecks([false, false, false]);
      })
      .catch(() => {
        if (active) setGoalChecks([false, false, false]);
      });
    return () => {
      active = false;
    };
  }, [homeworkStorageKey]);

  const updateGoalChecks = (next: [boolean, boolean, boolean]) => {
    setGoalChecks(next);
    AsyncStorage.setItem(homeworkStorageKey, JSON.stringify(next)).catch(() => {});
  };

  const handleToggleSingleGoal = (idx: 0 | 1 | 2) => {
    const next: [boolean, boolean, boolean] = [...goalChecks] as [boolean, boolean, boolean];
    next[idx] = !next[idx];
    updateGoalChecks(next);
    if (next.every(Boolean)) {
      Alert.alert(
        'Great Job! 🎉',
        `All weekly goals completed for ${activeChild?.firstName || 'your child'}! +25 Bible Star Points earned!`
      );
    }
  };

  const homeworkDone = goalChecks.every(Boolean);

  const handleCallTeacher = () => {
    if (!leadTeacherPhone) {
      Alert.alert(
        'Teacher Phone Not Added',
        `No phone number has been recorded for ${leadTeacherDisplayName} yet. Please ask the church admin to add their contact in Faculty & Helpers.`
      );
      return;
    }
    const dialNumber = leadTeacherPhone.replace(/[^\d+]/g, '');
    Linking.openURL(`tel:${dialNumber}`).catch(() => {
      Alert.alert('Unable to Call', `Please dial ${leadTeacherDisplayName} directly at ${leadTeacherPhone}`);
    });
  };

  const handleWhatsAppTeacher = () => {
    if (!leadTeacherPhone) {
      Alert.alert(
        'Teacher WhatsApp Not Added',
        `No mobile number has been recorded for ${leadTeacherDisplayName} yet.`
      );
      return;
    }
    let digits = leadTeacherPhone.replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length === 11) {
      digits = digits.slice(1);
    }
    if (digits.length === 10) {
      digits = `91${digits}`;
    }
    const msg = encodeURIComponent(
      `Praise the Lord ${leadTeacherDisplayName}! Reaching out regarding ${
        activeChild?.fullName || 'my child'
      } in ${assignedClass?.name || activeChild?.assignedClassName || 'Sunday School'}.`
    );
    const waMeUrl = `https://wa.me/${digits}?text=${msg}`;
    const schemeUrl = `whatsapp://send?phone=${digits}&text=${msg}`;
    Linking.openURL(waMeUrl).catch(() => {
      Linking.openURL(schemeUrl).catch(() => {
        Alert.alert(
          'WhatsApp Unavailable',
          `Could not open WhatsApp on this device. Teacher phone: ${leadTeacherPhone}`
        );
      });
    });
  };

  const handleConfirmParentConsent = async () => {
    if (!activeChild || !member) return;
    try {
      setConfirmingConsent(true);
      const parentName =
        member?.name || `${member?.firstName || ''} ${member?.lastName || ''}`.trim() || 'Parent';
      await KidsMinistryService.confirmParentConsent(
        churchId,
        activeChild.id,
        member.id || '',
        parentName
      );
      Alert.alert(
        'Enrollment & Consent Confirmed ✓',
        `Thank you! ${activeChild.fullName}'s Sunday School profile and guardian consent are now confirmed.`
      );
    } catch (e: any) {
      Alert.alert('Confirmation Error', e.message || 'Could not confirm consent right now.');
    } finally {
      setConfirmingConsent(false);
    }
  };

  const enrollModalEl = showEnrollModal ? (
    <EnrollChildModal
      visible={showEnrollModal}
      onClose={() => setShowEnrollModal(false)}
      churchId={churchId}
      member={member}
      existingFamilyMembers={existingHousehold}
      onChildEnrolled={() => {
        // Updated automatically via realtime subscribeToFamilyChildren + Members sync
      }}
    />
  ) : null;

  // Dedicated Rhema Kids Welcome / Entry Screen
  if (showSplash) {
    return (
      <View style={{ flex: 1 }}>
        <KidsSplashScreen
          childrenList={children}
          loadingChildren={loading}
          selectedChildIndex={safeSelectedChildIndex}
          onSelectChild={idx => setSelectedChildIndex(idx)}
          onContinue={() => setShowSplash(false)}
          onAddKid={() => setShowEnrollModal(true)}
          onBack={() => navigation.goBack()}
          churchName={(member as any)?.churchName || 'RHEMA GLOBAL MINISTRIES'}
        />
        {enrollModalEl}
      </View>
    );
  }

  const goalsCompletedCount = goalChecks.filter(Boolean).length;
  const progressPct = Math.round((goalsCompletedCount / 3) * 100);
  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - progressPct / 100);

  return (
    <View style={[styles.container, { backgroundColor: theme.screenBg, paddingTop: insets.top }]}>
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.screenBg}
      />

      {/* ── MODERN CHILD-FRIENDLY TOP HEADER ── */}
      <View style={[styles.modernTopBar, { backgroundColor: theme.headerBg }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: theme.backBtnBg, borderWidth: 1, borderColor: theme.border }]}
          onPress={() => (activeTab !== 'home' ? setActiveTab('home') : setShowSplash(true))}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={19} color={theme.backBtnIcon} strokeWidth={2.5} />
        </TouchableOpacity>

        {activeTab === 'home' ? (
          activeChild ? (
            <TouchableOpacity
              style={[
                styles.greetingProfileTrigger,
                children.length > 1 && {
                  backgroundColor: theme.cardBg,
                  borderWidth: 1,
                  borderColor: theme.border,
                  paddingRight: 10,
                },
              ]}
              onPress={() => {
                if (children.length > 1) {
                  setShowChildPicker(prev => !prev);
                }
              }}
              activeOpacity={children.length > 1 ? 0.75 : 1}
            >
              <View style={[styles.greetingAvatarCircle, { borderColor: theme.coralPrimary }]}>
                {activeChild.photoUrl ? (
                  <Image
                    source={{ uri: activeChild.photoUrl }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#7C3AED' }}>
                    {(activeChild.firstName || activeChild.fullName || 'K').charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text
                    style={[styles.greetingNameText, { color: theme.textPrimary }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    Hi, {activeChild.firstName || activeChild.fullName} 👋
                  </Text>
                  {children.length > 1 && (
                    showChildPicker ? (
                      <ChevronUp size={16} color={theme.coralPrimary} strokeWidth={2.8} />
                    ) : (
                      <ChevronDown size={16} color={theme.coralPrimary} strokeWidth={2.8} />
                    )
                  )}
                </View>
                <Text
                  style={[styles.greetingSubText, { color: theme.textSecondary }]}
                  numberOfLines={2}
                >
                  Age {activeChild.age} · {assignedClass?.name || activeChild.assignedClassName || 'Sunday School'}
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.appTitleSerif, { color: theme.textPrimary, flex: 1 }]}>Rhema Kids</Text>
          )
        ) : (
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <Text style={[styles.subpageHeaderTitle, { color: theme.textPrimary }]} numberOfLines={1}>
              {activeTab === 'classroom'
                ? assignedClass?.name || activeChild?.assignedClassName || 'Classroom Details'
                : 'Bible Learning'}
            </Text>
            {activeChild ? (
              <Text style={[styles.greetingSubText, { color: theme.textSecondary }]} numberOfLines={1}>
                {activeChild.fullName} · Age {activeChild.age}
              </Text>
            ) : null}
          </View>
        )}
      </View>

      {/* ── MULTIPLE CHILDREN DROPDOWN SELECTION PANEL ── */}
      <Modal
        visible={showChildPicker && children.length > 1}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChildPicker(false)}
      >
        <TouchableOpacity
          style={styles.childPickerBackdrop}
          activeOpacity={1}
          onPress={() => setShowChildPicker(false)}
        >
          <View
            style={[
              styles.childPickerSheet,
              {
                backgroundColor: theme.dropdownBg,
                borderColor: theme.border,
                marginTop: insets.top + 64,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <Text style={[styles.dropdownHeader, { color: theme.textSecondary, marginBottom: 0 }]}>
                SELECT CHILD PROFILE
              </Text>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                onPress={() => {
                  setShowChildPicker(false);
                  setShowEnrollModal(true);
                }}
              >
                <Plus size={13} color={theme.purpleAccent} strokeWidth={2.6} />
                <Text style={{ fontSize: 12, fontWeight: '800', color: theme.purpleAccent }}>
                  Add Kid
                </Text>
              </TouchableOpacity>
            </View>

            {children.map((k, idx) => {
              const selected = idx === safeSelectedChildIndex;
              return (
                <TouchableOpacity
                  key={k.id}
                  style={[
                    styles.childModalRow,
                    {
                      backgroundColor: selected ? theme.childChipActiveBg : theme.innerCardBg,
                      borderColor: selected ? theme.purpleAccent : theme.border,
                    },
                  ]}
                  onPress={() => {
                    setSelectedChildIndex(idx);
                    setShowChildPicker(false);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.childModalAvatar}>
                    {k.photoUrl ? (
                      <Image
                        source={{ uri: k.photoUrl }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={{ fontSize: 18, fontWeight: '800', color: '#7C3AED' }}>
                        {(k.firstName || k.fullName || 'K').charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.childModalName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {k.fullName}
                    </Text>
                    <Text style={[styles.childModalMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                      Age {k.age} · {k.assignedClassName || 'Sunday School'}
                    </Text>
                  </View>
                  {selected && (
                    <View style={styles.childModalCheck}>
                      <Check size={13} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── MAIN BODY CONTENT ── */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={theme.coralPrimary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading Rhema Kids...</Text>
        </View>
      ) : children.length === 0 ? (
        /* Empty State: No child enrolled yet */
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconBox, { backgroundColor: theme.lavenderBg, borderColor: theme.lavenderBorder }]}>
            <Text style={{ fontSize: 36 }}>👶🏽</Text>
          </View>
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Welcome to Rhema Kids!</Text>
          <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
            Register your children to access Sunday School, bilingual Bible stories, quizzes, and action songs.
          </Text>

          <TouchableOpacity
            style={[styles.enrollNowBtn, { backgroundColor: theme.purpleAccent }]}
            onPress={() => setShowEnrollModal(true)}
            activeOpacity={0.88}
          >
            <Plus size={18} color="#FFFFFF" strokeWidth={2.8} />
            <Text style={[styles.enrollNowBtnText, { color: '#FFFFFF' }]}>Add Kid</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: 40 }]}
        >
          {/* ==================================================== */}
          {/* TAB 1: HOME DASHBOARD (MATCHING DESIGN SCREENSHOT 2) */}
          {/* ==================================================== */}
          {activeTab === 'home' && (
            <>
              {/* Inspiring Bible Quote for Kids */}
              {(() => {
                const dailyQuote = KIDS_BIBLE_QUOTES[new Date().getDay() % KIDS_BIBLE_QUOTES.length];
                return (
                  <View
                    style={[
                      styles.kidsQuoteCard,
                      {
                        backgroundColor: theme.isDark ? '#1A162D' : '#F6F2FF',
                        borderColor: theme.isDark ? '#342A5E' : '#E5DCFD',
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.kidsQuoteGlowCircle,
                        {
                          backgroundColor: theme.isDark
                            ? 'rgba(139, 92, 246, 0.14)'
                            : 'rgba(124, 58, 237, 0.08)',
                        },
                      ]}
                      pointerEvents="none"
                    />
                    <View style={styles.kidsQuoteHeaderRow}>
                      <View
                        style={[
                          styles.kidsQuoteBadge,
                          {
                            backgroundColor: theme.isDark
                              ? 'rgba(139, 92, 246, 0.25)'
                              : '#EDE9FE',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.kidsQuoteBadgeText,
                            { color: theme.isDark ? '#DDD6FE' : '#6D28D9' },
                          ]}
                        >
                          BIBLE QUOTE FOR KIDS
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.kidsQuoteRefText,
                          { color: theme.isDark ? '#C4B5FD' : '#6D28D9' },
                        ]}
                      >
                        {dailyQuote.ref}
                      </Text>
                    </View>
                    <Text style={[styles.kidsQuoteText, { color: theme.textPrimary }]}>
                      “{dailyQuote.text}”
                    </Text>
                  </View>
                );
              })()}

              {/* Parent Review & Consent Prompt for Teacher-Enrolled Children */}
              {activeChild?.parentConsentStatus === 'pending_review' && (
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: theme.cardBg,
                      borderColor: '#F59E0B',
                      borderWidth: 1.5,
                      gap: 10,
                    },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Shield size={18} color="#F59E0B" />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#F59E0B', flex: 1 }}>
                      REVIEW & CONFIRM SUNDAY SCHOOL CONSENT
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12.5, color: theme.textPrimary, lineHeight: 18 }}>
                    {activeChild.fullName} (DOB: {activeChild.dob} · {activeChild.assignedClassName}) was directly enrolled by{' '}
                    <Text style={{ fontWeight: '800' }}>
                      {activeChild.enrolledByTeacherName || 'Sunday School Teacher'}
                    </Text>
                    . Please review the details and confirm parental consent.
                  </Text>
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#10B981',
                      paddingVertical: 11,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 6,
                      opacity: confirmingConsent ? 0.7 : 1,
                    }}
                    onPress={handleConfirmParentConsent}
                    disabled={confirmingConsent}
                    activeOpacity={0.85}
                  >
                    {confirmingConsent ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <CheckCircle2 size={16} color="#FFFFFF" />
                        <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 13 }}>
                          Confirm Details & Approve Consent
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ paddingVertical: 6, alignItems: 'center' }}
                    onPress={() => {
                      setSafetyInitialProgramId(null);
                      setSafetyModalSection('consent');
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#D97706' }}>
                      Review Release Permissions & Pickup Guardians &rsaquo;
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Soft Peach Sunday School Classroom & Progress Card */}
              <TouchableOpacity
                style={[
                  styles.peachProgressCard,
                  { backgroundColor: theme.peachBg, borderColor: theme.peachBorder },
                ]}
                onPress={() => setActiveTab('classroom')}
                activeOpacity={0.88}
              >
                <View
                  style={[
                    styles.peachDecorRingA,
                    {
                      borderColor: theme.isDark
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(255, 107, 74, 0.18)',
                    },
                  ]}
                  pointerEvents="none"
                />
                <View
                  style={[
                    styles.peachDecorRingB,
                    {
                      borderColor: theme.isDark
                        ? 'rgba(255,255,255,0.06)'
                        : 'rgba(255, 107, 74, 0.12)',
                    },
                  ]}
                  pointerEvents="none"
                />

                <View style={{ flex: 1, paddingRight: 12 }}>
                  <View style={styles.peachTopTagsRow}>
                    <View
                      style={[
                        styles.peachClassBadge,
                        {
                          backgroundColor: theme.isDark
                            ? 'rgba(255, 107, 74, 0.2)'
                            : '#FFFFFF',
                        },
                      ]}
                    >
                      <Text style={styles.peachClassBadgeText}>SUNDAY SCHOOL</Text>
                    </View>
                    {activeChild?.custodyStatus === 'checked_in' && (
                      <View style={styles.checkedInMiniPill}>
                        <Text style={styles.checkedInMiniText}>Checked In ✓</Text>
                      </View>
                    )}
                  </View>

                  <Text style={[styles.peachTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                    {assignedClass?.name || activeChild?.assignedClassName || 'Sunday School'}
                  </Text>

                  <Text style={[styles.peachMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                    {assignedClass?.roomNumber || 'Room 204'} · {assignedClass?.schedule?.dayOfWeek || 'Sunday'}s{' '}
                    {assignedClass?.schedule?.startTime || '09:30 AM'}
                  </Text>

                  <View style={styles.peachPillsRow}>
                    <View
                      style={[
                        styles.peachMiniStatPill,
                        {
                          backgroundColor: theme.isDark
                            ? 'rgba(255,255,255,0.1)'
                            : 'rgba(255,255,255,0.78)',
                        },
                      ]}
                    >
                      <Text style={[styles.peachStat, { color: theme.textPrimary }]}>
                        {goalsCompletedCount}/3 Goals
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.peachMiniStatPill,
                        {
                          backgroundColor: theme.isDark
                            ? 'rgba(16, 185, 129, 0.18)'
                            : '#ECFDF5',
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.peachStat,
                          {
                            color:
                              activeTodayEntry?.attendanceStatus === 'absent'
                                ? '#EF4444'
                                : theme.isDark
                                ? '#6EE7B7'
                                : '#047857',
                          },
                        ]}
                      >
                        {activeTodayEntry?.attendanceStatus === 'present' || activeChild?.custodyStatus === 'checked_in'
                          ? 'Present ✓'
                          : activeTodayEntry?.attendanceStatus === 'checked_out'
                          ? 'Checked Out ✓'
                          : activeTodayEntry?.attendanceStatus === 'absent'
                          ? 'Absent'
                          : 'Enrolled ✓'}
                      </Text>
                    </View>

                    <View style={styles.peachViewHint}>
                      <Text style={styles.peachViewHintText}>Class</Text>
                      <ChevronRight size={13} color={theme.coralPrimary} strokeWidth={2.6} />
                    </View>
                  </View>
                </View>

                {/* Circular Progress Ring */}
                <View style={styles.progressRingBox}>
                  <Svg width={64} height={64}>
                    <Circle
                      cx={32}
                      cy={32}
                      r={ringRadius}
                      stroke={theme.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,107,74,0.18)'}
                      strokeWidth={5.5}
                      fill="none"
                    />
                    <Circle
                      cx={32}
                      cy={32}
                      r={ringRadius}
                      stroke={theme.coralPrimary}
                      strokeWidth={5.5}
                      fill="none"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringOffset}
                      strokeLinecap="round"
                      rotation="-90"
                      origin="32, 32"
                    />
                  </Svg>
                  <Text style={[styles.progressRingPct, { color: theme.textPrimary }]}>
                    {progressPct}%
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Categories — Responsive 3 × 3 Bento Grid */}
              <View>
                <View style={styles.sectionTitleRow}>
                  <Text style={[styles.modernSectionTitle, { color: theme.textPrimary }]}>
                    Categories
                  </Text>
                </View>

                {(() => {
                  const isLiveInClass =
                    activeTodayEntry?.attendanceStatus === 'present' ||
                    activeChild?.custodyStatus === 'checked_in';
                  const consentPending = !activeConsentInfo.isConfirmed;

                  const categoryRows = [
                    [
                      {
                        key: 'stories',
                        label: 'Bible Stories',
                        icon: KIDS_CATEGORY_ICONS.stories,
                        badgeDot: null as string | null,
                        onPress: () => setExploreCategory('stories'),
                      },
                      {
                        key: 'quizzes',
                        label: 'Kids Quizzes',
                        icon: KIDS_CATEGORY_ICONS.quizzes,
                        badgeDot: null as string | null,
                        onPress: () => setExploreCategory('quizzes'),
                      },
                      {
                        key: 'lessons',
                        label: 'Weekly Lessons',
                        icon: KIDS_CATEGORY_ICONS.lessons,
                        badgeDot: null as string | null,
                        onPress: () => setExploreCategory('lessons'),
                      },
                    ],
                    [
                      {
                        key: 'songs',
                        label: 'Action Songs',
                        icon: KIDS_CATEGORY_ICONS.songs,
                        badgeDot: null as string | null,
                        onPress: () => setExploreCategory('songs'),
                      },
                      {
                        key: 'classroom',
                        label: 'My Classroom',
                        icon: KIDS_CATEGORY_ICONS.classroom,
                        badgeDot: null as string | null,
                        onPress: () => setActiveTab('classroom'),
                      },
                      {
                        key: 'attendance',
                        label: 'Attendance',
                        icon: KIDS_CATEGORY_ICONS.attendance,
                        badgeDot: isLiveInClass ? '#10B981' : null,
                        onPress: () => {
                          setSafetyInitialProgramId(activeTodayEntry?.programSessionId || null);
                          setSafetyModalSection('overview');
                        },
                      },
                    ],
                    [
                      {
                        key: 'history',
                        label: 'History',
                        icon: KIDS_CATEGORY_ICONS.history,
                        badgeDot: null as string | null,
                        onPress: () => {
                          setSafetyInitialProgramId(activeTodayEntry?.programSessionId || null);
                          setSafetyModalSection('history');
                        },
                      },
                      {
                        key: 'consent_safety',
                        label: 'Consent & Safety',
                        icon: KIDS_CATEGORY_ICONS.safety,
                        badgeDot: consentPending ? '#F59E0B' : '#10B981',
                        onPress: () => {
                          setSafetyInitialProgramId(null);
                          setSafetyModalSection('consent');
                        },
                      },
                      {
                        key: 'enroll_child',
                        label: 'Enroll Child',
                        icon: KIDS_CATEGORY_ICONS.enroll,
                        badgeDot: null as string | null,
                        onPress: () => setShowEnrollModal(true),
                      },
                    ],
                  ];

                  return (
                    <View style={styles.categoryGrid}>
                      {categoryRows.map((row, rowIdx) => (
                        <View key={rowIdx} style={styles.categoryGridRow}>
                          {row.map(cat => (
                            <TouchableOpacity
                              key={cat.key}
                              style={styles.categoryGridTile}
                              onPress={cat.onPress}
                              activeOpacity={0.75}
                            >
                              <View style={styles.categoryIconCircle}>
                                <Image
                                  source={cat.icon}
                                  style={styles.categoryIconImg}
                                  resizeMode="contain"
                                />
                              </View>
                              <View
                                style={[
                                  styles.categoryLabelPill,
                                  {
                                    backgroundColor: theme.isDark ? '#1A2234' : '#F4EFE6',
                                    borderColor: theme.isDark ? '#2D374E' : '#E5DEC9',
                                  },
                                ]}
                              >
                                {cat.badgeDot ? (
                                  <View
                                    style={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: 3,
                                      backgroundColor: cat.badgeDot,
                                    }}
                                  />
                                ) : null}
                                <Text
                                  style={[styles.categoryTileLabel, { color: theme.textPrimary }]}
                                  numberOfLines={1}
                                  adjustsFontSizeToFit
                                  minimumFontScale={0.76}
                                >
                                  {cat.label}
                                </Text>
                                <ChevronRight
                                  size={11}
                                  color={theme.coralPrimary}
                                  strokeWidth={2.6}
                                />
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </View>

              {/* Redesigned Modern This Sunday's Lesson Card */}
              {(() => {
                const { lesson: activeLesson, mode: activeMode, activeDate } = resolveActiveCurriculumLesson({
                  config: curriculumConfig,
                  lessons: curriculum,
                });
                const verseEn = activeLesson?.memoryVerse?.verseEnglish || 'In the beginning God created the heavens and the earth.';
                const verseTe = activeLesson?.memoryVerse?.verseTelugu || 'ఆదియందు దేవుడు భూమ్యాకాశములను సృజించెను.';
                const verseRef = activeLesson?.memoryVerse?.reference || 'Genesis 1:1';
                const lessonTitle = activeLesson?.title || 'In the Beginning: God Created All Things';
                const tagLabel =
                  activeMode === 'custom' && activeDate
                    ? formatCurriculumDateDisplay(activeDate)
                    : `Week ${activeLesson?.weekNumber || 1} Lesson`;
                const accentSky = theme.isDark ? '#38BDF8' : '#0284C7';
                const verseSurface = theme.isDark ? 'rgba(15, 23, 42, 0.55)' : 'rgba(255, 255, 255, 0.85)';

                return (
                  <View>
                    <View style={styles.sectionTitleRow}>
                      <Text style={[styles.modernSectionTitle, { color: theme.textPrimary }]}>
                        This Sunday's Lesson
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.featuredLessonCard,
                        styles.featuredLessonFullCard,
                        { backgroundColor: theme.skyBg, borderColor: theme.skyBorder },
                      ]}
                      onPress={() => {
                        if (activeLesson) {
                          setSelectedLessonDate(activeDate);
                          setSelectedLessonForModal(activeLesson);
                        }
                      }}
                      activeOpacity={0.9}
                    >
                      {/* Top Color Accent Strip */}
                      <View style={[styles.lessonAccentStrip, { backgroundColor: accentSky }]} />

                      <View style={styles.lessonCardInner}>
                        {/* Header Row: Illustrated Emblem + Week & Scripture Pills */}
                        <View style={styles.featuredTopRow}>
                          <View
                            style={[
                              styles.featuredLessonIllust,
                              {
                                backgroundColor: theme.isDark ? 'rgba(56, 189, 248, 0.14)' : '#FFFFFF',
                                borderColor: theme.isDark ? 'rgba(56, 189, 248, 0.28)' : '#BAE6FD',
                              },
                            ]}
                          >
                            <BookOpen size={22} color={accentSky} strokeWidth={2.2} />
                          </View>

                          <View style={{ flex: 1, gap: 6 }}>
                            <View style={styles.lessonPillsRow}>
                              <View
                                style={[
                                  styles.lessonWeekPill,
                                  {
                                    backgroundColor: theme.isDark ? 'rgba(56, 189, 248, 0.16)' : '#E0F2FE',
                                  },
                                ]}
                              >
                                <Calendar size={11} color={accentSky} />
                                <Text style={[styles.lessonWeekPillText, { color: accentSky }]}>
                                  {tagLabel}
                                </Text>
                              </View>

                              <View
                                style={[
                                  styles.lessonRefPill,
                                  {
                                    backgroundColor: theme.isDark ? 'rgba(251, 191, 36, 0.15)' : '#FEF3C7',
                                  },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.lessonRefPillText,
                                    { color: theme.isDark ? '#FBBF24' : '#B45309' },
                                  ]}
                                >
                                  {verseRef}
                                </Text>
                              </View>
                            </View>

                            <Text style={[styles.featuredTitle, { color: theme.textPrimary }]} numberOfLines={2}>
                              {lessonTitle}
                            </Text>
                          </View>
                        </View>

                        {/* Framed Memory Verse Block */}
                        <View
                          style={[
                            styles.memoryVerseBox,
                            {
                              backgroundColor: verseSurface,
                              borderColor: theme.skyBorder,
                            },
                          ]}
                        >
                          <View style={[styles.memoryVerseStripe, { backgroundColor: accentSky }]} />
                          <View style={{ flex: 1, gap: 4 }}>
                            <View style={styles.memoryVerseHeader}>
                              <Text style={[styles.memoryVerseEyebrow, { color: accentSky }]}>
                                MEMORY VERSE
                              </Text>
                              <Text style={[styles.memoryVerseLangTag, { color: theme.textSecondary }]}>
                                {verseTe ? 'తెలుగు · ENG' : 'ENG'}
                              </Text>
                            </View>

                            <Text style={[styles.featuredVerseText, { color: theme.textPrimary }]}>
                              “{verseTe || verseEn}”
                            </Text>
                            {!!verseTe && (
                              <Text style={[styles.featuredVerseSub, { color: theme.textSecondary }]}>
                                “{verseEn}”
                              </Text>
                            )}
                          </View>
                        </View>

                        {/* Clean Footer Action Row */}
                        <View
                          style={[
                            styles.featuredBottomRow,
                            {
                              borderTopColor: theme.isDark
                                ? 'rgba(255,255,255,0.08)'
                                : 'rgba(14, 165, 233, 0.18)',
                            },
                          ]}
                        >
                          <View style={styles.lessonMetaChipsRow}>
                            <View
                              style={[
                                styles.lessonMetaMiniChip,
                                { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)' },
                              ]}
                            >
                              <Award size={12} color={theme.coralPrimary} />
                              <Text style={[styles.lessonMetaMiniText, { color: theme.textPrimary }]}>
                                3 Goals
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.lessonMetaMiniChip,
                                { backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.72)' },
                              ]}
                            >
                              <Text style={[styles.lessonMetaMiniText, { color: theme.textSecondary }]}>
                                Story & Activity
                              </Text>
                            </View>
                          </View>

                          <View style={[styles.openLessonPillBtn, { backgroundColor: accentSky }]}>
                            <Text style={styles.openLessonPillText}>Open Lesson</Text>
                            <ArrowUpRight size={14} color="#FFFFFF" strokeWidth={2.5} />
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  </View>
                );
              })()}

              {/* Popular Learning Highlights (View all button removed as requested) */}
              <View>
                <View style={styles.sectionTitleRow}>
                  <Text style={[styles.modernSectionTitle, { color: theme.textPrimary }]}>
                    Popular Learning
                  </Text>
                </View>

                <View style={{ gap: 10 }}>
                  {stories[0] && (
                    <TouchableOpacity
                      style={[styles.popularRowCard, { backgroundColor: theme.amberBg, borderColor: theme.border }]}
                      onPress={() => setSelectedStoryForReader(stories[0])}
                      activeOpacity={0.86}
                    >
                      <View style={[styles.popularStoryThumb16x9, { backgroundColor: '#FFFFFF', borderColor: theme.border }]}>
                        {stories[0].coverImageUrl ? (
                          <Image source={{ uri: stories[0].coverImageUrl }} style={styles.storyCoverImg} resizeMode="cover" />
                        ) : (
                          <Text style={{ fontSize: 26 }}>{stories[0].coverEmoji || '📖'}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.popularTag, { color: '#D97706' }]}>
                          Bible Story{stories[0].scriptureRef ? ` · ${stories[0].scriptureRef}` : ''}
                        </Text>
                        <Text style={[styles.popularTitle, { color: theme.textPrimary }]} numberOfLines={2}>
                          {stories[0].title}
                        </Text>
                        <Text style={[styles.popularSub, { color: theme.textSecondary }]} numberOfLines={1}>
                          {stories[0].readTime || estimateStoryReadTime(getFullStoryContent(stories[0]))}
                        </Text>
                      </View>
                      <View style={styles.arrowActionCircle}>
                        <ArrowUpRight size={15} color="#FFFFFF" strokeWidth={2.5} />
                      </View>
                    </TouchableOpacity>
                  )}

                  {quizzes[0] && (
                    <TouchableOpacity
                      style={[styles.popularRowCard, { backgroundColor: theme.mintBg, borderColor: theme.border }]}
                      onPress={() => setSelectedQuizForPlayer(quizzes[0])}
                      activeOpacity={0.86}
                    >
                      <View style={[styles.popularStoryThumb16x9, { backgroundColor: '#FFFFFF', borderColor: theme.border }]}>
                        {quizzes[0].thumbnailUrl ? (
                          <Image
                            source={{ uri: quizzes[0].thumbnailUrl }}
                            style={styles.storyCoverImg}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text style={{ fontSize: 26 }}>{quizzes[0].coverEmoji || '🏆'}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.popularTag, { color: '#059669' }]}>
                          Kids Quiz · {quizzes[0].questions?.length || 0} Qs
                        </Text>
                        <Text style={[styles.popularTitle, { color: theme.textPrimary }]} numberOfLines={2}>
                          {quizzes[0].title}
                        </Text>
                        <Text style={[styles.popularSub, { color: theme.textSecondary }]} numberOfLines={1}>
                          {quizzes[0].scriptureRef || 'Bible Quiz'} · +{quizzes[0].pointsReward || 50} Stars
                        </Text>
                      </View>
                      <View style={[styles.arrowActionCircle, { backgroundColor: '#059669' }]}>
                        <ArrowUpRight size={15} color="#FFFFFF" strokeWidth={2.5} />
                      </View>
                    </TouchableOpacity>
                  )}

                  {songs[0] && (
                    <TouchableOpacity
                      style={[styles.popularRowCard, { backgroundColor: theme.roseBg, borderColor: theme.border }]}
                      onPress={() => setSelectedSongForPlayer(songs[0])}
                      activeOpacity={0.86}
                    >
                      <View style={[styles.popularThumbBox, { backgroundColor: '#FFFFFF' }]}>
                        {songs[0].thumbnailUrl ? (
                          <Image source={{ uri: songs[0].thumbnailUrl }} style={styles.storyCoverImg} />
                        ) : (
                          <Text style={{ fontSize: 26 }}>{songs[0].coverEmoji || '🎵'}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.popularTag, { color: '#DB2777' }]}>Action Worship Song</Text>
                        <Text style={[styles.popularTitle, { color: theme.textPrimary }]} numberOfLines={1}>
                          {songs[0].title}
                        </Text>
                        <Text style={[styles.popularSub, { color: theme.textSecondary }]} numberOfLines={1}>
                          {songs[0].titleTelugu} · {songs[0].duration || '3:00'}
                        </Text>
                      </View>
                      <View style={[styles.arrowActionCircle, { backgroundColor: '#DB2777' }]}>
                        <ArrowUpRight size={15} color="#FFFFFF" strokeWidth={2.5} />
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </>
          )}

          {/* ==================================================== */}
          {/* TAB 2: SUNDAY SCHOOL CLASSROOM                       */}
          {/* ==================================================== */}
          {activeTab === 'classroom' && (
            <>
              <View style={styles.subpageBackRow}>
                <TouchableOpacity
                  style={[
                    styles.subpageBackBtn,
                    { backgroundColor: theme.cardBg, borderColor: theme.border },
                  ]}
                  onPress={() => setActiveTab('home')}
                  activeOpacity={0.82}
                >
                  <ArrowLeft size={16} color={theme.textPrimary} strokeWidth={2.5} />
                  <Text style={[styles.subpageBackText, { color: theme.textPrimary }]}>
                    Back to Home
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
                <View style={styles.classHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardHeaderTag, { color: theme.goldAccent }]}>ASSIGNED SUNDAY SCHOOL CLASS</Text>
                    <Text style={[styles.classTitleBig, { color: theme.textPrimary }]}>
                      {assignedClass?.name || activeChild?.assignedClassName || 'Sunday School'}
                    </Text>
                  </View>
                  <View style={styles.tierPill}>
                    <Text style={styles.tierPillText}>
                      {assignedClass
                        ? assignedClass.tier === 'mixed'
                          ? 'Mixed Age · All Ages'
                          : `Ages ${assignedClass.ageRange.min}–${assignedClass.ageRange.max}`
                        : `Age ${activeChild?.age}`}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.classAgeRange, { color: theme.textSecondary }]}>
                  Student: {activeChild?.fullName} (Age {activeChild?.age})
                </Text>

                <View style={[styles.divider, { backgroundColor: theme.border }]} />

                <View style={styles.metaRow}>
                  <Text style={[styles.metaKey, { color: theme.textSecondary }]}>Room Location:</Text>
                  <Text style={[styles.metaVal, { color: theme.textPrimary }]}>{assignedClass?.roomNumber || 'Room 201 (2nd Floor)'}</Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={[styles.metaKey, { color: theme.textSecondary }]}>Weekly Schedule:</Text>
                  <Text style={[styles.metaVal, { color: theme.textPrimary }]}>
                    {assignedClass?.schedule?.dayOfWeek || 'Sunday'}s{' '}
                    {assignedClass?.schedule?.startTime
                      ? /am|pm/i.test(assignedClass.schedule.startTime)
                        ? assignedClass.schedule.startTime
                        : `${assignedClass.schedule.startTime} AM`
                      : '09:30 AM'}{' '}
                    –{' '}
                    {assignedClass?.schedule?.endTime
                      ? /am|pm/i.test(assignedClass.schedule.endTime)
                        ? assignedClass.schedule.endTime
                        : `${assignedClass.schedule.endTime} AM`
                      : '11:30 AM'}
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={[styles.metaKey, { color: theme.textSecondary }]}>Lead Teacher:</Text>
                  <Text style={[styles.metaVal, { color: theme.textPrimary }]}>
                    {leadTeacherDisplayName}
                  </Text>
                </View>

                {leadTeacherPhone ? (
                  <View style={styles.metaRow}>
                    <Text style={[styles.metaKey, { color: theme.textSecondary }]}>Teacher Contact:</Text>
                    <Text style={[styles.metaVal, { color: theme.textPrimary }]}>
                      {leadTeacherPhone}
                    </Text>
                  </View>
                ) : null}

                {/* Teacher Contact Bar */}
                <View style={[styles.teacherContactBox, { backgroundColor: theme.innerCardBg, borderColor: theme.border }]}>
                  <Text style={[styles.teacherContactLabel, { color: theme.textSecondary }]}>
                    {leadTeacherPhone
                      ? `Need to notify ${leadTeacherDisplayName} about attendance?`
                      : 'Teacher contact number not set in Classroom/Faculty settings'}
                  </Text>
                  <View style={styles.teacherButtonsRow}>
                    <TouchableOpacity
                      style={[styles.teacherBtn, { backgroundColor: theme.cardBg, borderColor: theme.border }]}
                      onPress={handleCallTeacher}
                      activeOpacity={0.85}
                    >
                      <Phone size={13} color="#10B981" />
                      <Text style={[styles.teacherBtnText, { color: theme.textPrimary }]}>Call Teacher</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.teacherBtn, { backgroundColor: '#064E3B' }]}
                      onPress={handleWhatsAppTeacher}
                      activeOpacity={0.85}
                    >
                      <MessageCircle size={13} color="#34D399" />
                      <Text style={[styles.teacherBtnText, { color: '#34D399' }]}>WhatsApp</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Program Attendance & Consent Shortcut Inside Classroom */}
              <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.border, gap: 10 }]}>
                <Text style={[styles.cardHeaderTag, { color: theme.purpleAccent }]}>
                  PROGRAM ATTENDANCE & PICKUP SAFETY
                </Text>
                <Text style={{ fontSize: 12.5, color: theme.textSecondary, lineHeight: 18 }}>
                  {activeTodayEntry
                    ? `${activeTodayEntry.programTitle}: ${
                        activeTodayEntry.attendanceStatus === 'present'
                          ? 'Present in Class ✓'
                          : activeTodayEntry.attendanceStatus === 'checked_out'
                          ? 'Checked Out Safely ✓'
                          : activeTodayEntry.attendanceStatus === 'absent'
                          ? 'Marked Absent'
                          : 'Not Yet Checked In'
                      }`
                    : 'View program-wise check-in/out logs, release permissions & pickup guardians.'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity
                    style={[styles.teacherBtn, { backgroundColor: theme.innerCardBg, borderColor: theme.border }]}
                    onPress={() => {
                      setSafetyInitialProgramId(activeTodayEntry?.programSessionId || null);
                      setSafetyModalSection('overview');
                    }}
                    activeOpacity={0.85}
                  >
                    <Calendar size={13} color={theme.purpleAccent} />
                    <Text style={[styles.teacherBtnText, { color: theme.textPrimary }]}>Attendance History</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.teacherBtn, { backgroundColor: theme.innerCardBg, borderColor: theme.border }]}
                    onPress={() => {
                      setSafetyInitialProgramId(null);
                      setSafetyModalSection('consent');
                    }}
                    activeOpacity={0.85}
                  >
                    <Shield size={13} color="#10B981" />
                    <Text style={[styles.teacherBtnText, { color: theme.textPrimary }]}>Consent & Pickups</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Weekly Homework & Goal Checklist (Synced to Active Sunday Lesson) */}
              {(() => {
                const hwLesson = activeLessonInfo.lesson;
                const childTier = resolveLessonTierKey(activeChild?.assignedTier, activeChild?.age ?? 7);
                const tierGuide = hwLesson?.tierGuides ? (hwLesson.tierGuides as any)[childTier] : null;
                const goalsList: Array<{ label: string; text: string }> = [
                  {
                    label: 'Bible Reading',
                    text: hwLesson
                      ? `Read ${hwLesson.scriptureRef} (“${hwLesson.title}”) with family`
                      : 'Read this Sunday’s Bible lesson passage with family',
                  },
                  {
                    label: 'Memory Verse',
                    text: hwLesson?.memoryVerse?.reference
                      ? `Practice ${hwLesson.memoryVerse.reference} in Telugu or English`
                      : 'Recite this week’s memory verse in Telugu or English',
                  },
                  {
                    label: 'Lesson Activity & Class Prep',
                    text:
                      hwLesson?.customActivityNotes ||
                      (tierGuide?.activityName
                        ? `Complete “${tierGuide.activityName}” & bring your Bible to class`
                        : hwLesson?.bigIdea
                        ? `Discuss “${hwLesson.bigIdea}” & bring your Bible to class`
                        : 'Bring your physical Bible & activity booklet to class'),
                  },
                ];

                return (
                  <View style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
                    <View style={styles.homeworkHeader}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={[styles.cardTitleMedium, { color: theme.textPrimary }]}>
                          This Week's Homework & Goals
                        </Text>
                        {hwLesson ? (
                          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.goldAccent, marginTop: 2 }}>
                            {hwLesson.type === 'custom'
                              ? hwLesson.title
                              : `Week ${hwLesson.weekNumber}: ${hwLesson.title}`}
                          </Text>
                        ) : null}
                      </View>
                      {homeworkDone ? (
                        <View style={styles.donePill}>
                          <Text style={styles.donePillText}>★ Completed</Text>
                        </View>
                      ) : hwLesson ? (
                        <TouchableOpacity
                          onPress={() => {
                            setSelectedLessonDate(activeLessonInfo.activeDate);
                            setSelectedLessonForModal(hwLesson);
                          }}
                        >
                          <Text style={{ fontSize: 11.5, fontWeight: '700', color: theme.goldAccent }}>
                            View Lesson &rsaquo;
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <Text style={[styles.homeworkDesc, { color: theme.textSecondary }]}>
                      Tap each step below as {activeChild?.firstName || 'your child'} finishes it at home ({goalChecks.filter(Boolean).length}/3 done):
                    </Text>

                    {goalsList.map((goal, idx) => {
                      const checked = goalChecks[idx];
                      return (
                        <TouchableOpacity
                          key={idx}
                          style={styles.checkGoalItem}
                          onPress={() => handleToggleSingleGoal(idx as 0 | 1 | 2)}
                          activeOpacity={0.85}
                        >
                          <View style={[styles.checkCircle, { borderColor: theme.border }, checked && styles.checkCircleActive]}>
                            {checked && <Check size={12} color="#000000" strokeWidth={3} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: theme.goldAccent, marginBottom: 1 }}>
                              {idx + 1}. {goal.label.toUpperCase()}
                            </Text>
                            <Text style={[styles.goalText, { color: theme.textPrimary }, checked && styles.goalTextDone]}>
                              {goal.text}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}

                    <TouchableOpacity
                      style={[styles.homeworkBtn, { backgroundColor: theme.addKidBtnBg }, homeworkDone && { backgroundColor: '#064E3B' }]}
                      onPress={() => {
                        const nextAll = !homeworkDone;
                        updateGoalChecks([nextAll, nextAll, nextAll]);
                        if (nextAll) {
                          Alert.alert(
                            'Great Job! 🎉',
                            `Homework marked complete for ${activeChild?.firstName || 'your child'}! +25 Bible Star Points earned!`
                          );
                        }
                      }}
                    >
                      <CheckCircle2 size={16} color={homeworkDone ? '#34D399' : theme.addKidBtnText} />
                      <Text style={[styles.homeworkBtnText, { color: theme.addKidBtnText }, homeworkDone && { color: '#34D399' }]}>
                        {homeworkDone ? 'Homework Completed ✓' : 'Mark All Goals Completed'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}
            </>
          )}

        </ScrollView>
      )}

      {/* ── ENROLL CHILD MODAL ── */}
      {enrollModalEl}

      {/* ── BIBLE STORY READER MODAL ── */}
      {selectedStoryForReader && (
        <KidsStoryReaderModal
          visible={!!selectedStoryForReader}
          story={selectedStoryForReader}
          churchId={churchId}
          childId={activeChild?.id}
          onClose={() => setSelectedStoryForReader(null)}
        />
      )}

      {/* ── BIBLE QUIZ PLAYER MODAL ── */}
      {selectedQuizForPlayer && (
        <KidsQuizPlayerModal
          visible={!!selectedQuizForPlayer}
          quiz={selectedQuizForPlayer}
          onClose={() => setSelectedQuizForPlayer(null)}
        />
      )}

      {/* ── WORSHIP SONG PLAYER MODAL ── */}
      {selectedSongForPlayer && (
        <KidsSongPlayerModal
          visible={!!selectedSongForPlayer}
          song={selectedSongForPlayer}
          allSongs={songs}
          onClose={() => setSelectedSongForPlayer(null)}
          onSelectSong={s => setSelectedSongForPlayer(s)}
        />
      )}

      {/* ── EXPLORE CATEGORY DEDICATED VIEW (STORIES / QUIZZES / LESSONS / SONGS) ── */}
      {exploreCategory && (
        <KidsExploreCategoryModal
          visible={!!exploreCategory}
          category={exploreCategory}
          stories={stories}
          quizzes={quizzes}
          songs={songs}
          curriculum={curriculum}
          curriculumConfig={curriculumConfig}
          loadingLessons={loadingCurriculum}
          onSelectStory={story => {
            setExploreCategory(null);
            setSelectedStoryForReader(story);
          }}
          onSelectQuiz={quiz => {
            setExploreCategory(null);
            setSelectedQuizForPlayer(quiz);
          }}
          onSelectSong={song => {
            setExploreCategory(null);
            setSelectedSongForPlayer(song);
          }}
          onSelectLesson={(lesson, scheduledDate) => {
            setExploreCategory(null);
            setSelectedLessonDate(scheduledDate);
            setSelectedLessonForModal(lesson);
          }}
          onClose={() => setExploreCategory(null)}
        />
      )}

      {/* ── SUNDAY BIBLE LESSON & MEMORY DETAIL MODAL ── */}
      {selectedLessonForModal && (
        <KidsLessonDetailModal
          visible={!!selectedLessonForModal}
          lesson={selectedLessonForModal}
          child={activeChild}
          scheduledDate={
            selectedLessonDate ??
            resolveActiveCurriculumLesson({
              config: curriculumConfig,
              lessons: curriculum,
            }).activeDate
          }
          linkedStory={
            selectedLessonForModal.storyId
              ? stories.find(s => s.id === selectedLessonForModal.storyId) || null
              : null
          }
          linkedQuiz={
            selectedLessonForModal.quizId
              ? quizzes.find(q => q.id === selectedLessonForModal.quizId) || null
              : null
          }
          linkedSong={
            selectedLessonForModal.songId
              ? songs.find(s => s.id === selectedLessonForModal.songId) || null
              : null
          }
          onOpenStory={story => {
            setSelectedLessonForModal(null);
            setSelectedStoryForReader(story);
          }}
          onOpenQuiz={quiz => {
            setSelectedLessonForModal(null);
            setSelectedQuizForPlayer(quiz);
          }}
          onOpenSong={song => {
            setSelectedLessonForModal(null);
            setSelectedSongForPlayer(song);
          }}
          onClose={() => {
            setSelectedLessonForModal(null);
            setSelectedLessonDate(null);
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

      {/* ── PROGRAM-WISE ATTENDANCE & PARENT SAFETY MODAL ── */}
      {safetyModalSection && (
        <KidsAttendanceSafetyModal
          visible={!!safetyModalSection}
          initialSection={safetyModalSection}
          initialProgramSessionId={safetyInitialProgramId}
          childrenList={children}
          selectedChildIndex={safeSelectedChildIndex}
          onSelectChild={idx => setSelectedChildIndex(idx)}
          churchId={churchId}
          member={member}
          programSessions={programSessions}
          custodyRecords={childCustodyRecords}
          attendanceLogs={childAttendanceLogs}
          loadingAttendance={loadingChildAttendance}
          classes={classes}
          teachers={teachers}
          onClose={() => {
            setSafetyModalSection(null);
            setSafetyInitialProgramId(null);
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
  headerCenter: {
    alignItems: 'center',
  },
  titleWithCrown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  crownEmoji: {
    fontSize: 16,
  },
  appTitleSerif: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.4,
  },
  childSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  childSwitcherInteractive: {
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  childSwitcherText: {
    fontSize: 11,
    color: '#FBBF24',
    fontWeight: '700',
    maxWidth: 180,
  },
  childSwitcherSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  childBarContainer: {
    backgroundColor: '#0D0D11',
    borderBottomWidth: 1,
    borderBottomColor: '#1F1F24',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  childBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  childBarLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  childBarLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  childBarSub: {
    fontSize: 10,
    color: '#71717A',
    fontWeight: '500',
  },
  childChipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 20,
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  childChipActive: {
    backgroundColor: '#1E1B13',
    borderColor: '#FBBF24',
  },
  childChipInactive: {
    backgroundColor: '#18181B',
    borderColor: '#27272A',
  },
  childChipEmoji: {
    fontSize: 16,
  },
  childChipName: {
    fontSize: 12,
    fontWeight: '700',
  },
  childChipNameActive: {
    color: '#FFFFFF',
  },
  childChipNameInactive: {
    color: '#D4D4D8',
  },
  childChipMeta: {
    fontSize: 10,
    marginTop: 1,
  },
  childChipMetaActive: {
    color: '#FBBF24',
    fontWeight: '600',
  },
  childChipMetaInactive: {
    color: '#71717A',
  },
  childChipActiveBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FBBF24',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  topActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    flexShrink: 0,
  },
  topActionBtnText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: '800',
  },
  dropdownPicker: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 6,
    padding: 10,
    gap: 4,
    zIndex: 50,
  },
  dropdownHeader: {
    fontSize: 10,
    color: '#9CA3AF',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    marginBottom: 4,
  },
  dropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
  },
  dropdownItemText: {
    color: '#D4D4D8',
    fontSize: 12,
  },
  dropdownItemTextActive: {
    color: '#FBBF24',
    fontWeight: '700',
  },
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#121215',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
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
  tabText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  tabTextActive: {
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
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyIconBox: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 19,
  },
  enrollNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
    marginTop: 10,
  },
  enrollNowBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  heroStatusCard: {
    backgroundColor: '#18181B',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveBadgeText: {
    color: '#34D399',
    fontSize: 10,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  codeLabel: {
    color: '#9CA3AF',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  statusDetailsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  classTierSub: {
    fontSize: 11,
    color: '#FBBF24',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  classRoomTitle: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
  },
  scheduleMeta: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  pickupCodeBadge: {
    backgroundColor: '#000000',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FBBF24',
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  codeTag: {
    fontSize: 8,
    color: '#9CA3AF',
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  codeDigits: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FBBF24',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    paddingTop: 10,
  },
  allergySummary: {
    fontSize: 11,
    fontWeight: '600',
  },
  viewPassLink: {
    paddingVertical: 2,
  },
  viewPassLinkText: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#18181B',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 8,
  },
  cardHeaderSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardHeaderTag: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: '#FBBF24',
  },
  verseRef: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  verseTelugu: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
    lineHeight: 20,
  },
  verseEnglish: {
    fontSize: 12,
    color: '#9CA3AF',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  verseFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    paddingTop: 10,
    marginTop: 4,
  },
  audioListenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  audioListenText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '700',
  },
  starBadge: {
    backgroundColor: '#27272A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  starBadgeText: {
    color: '#FEF3C7',
    fontSize: 10,
    fontWeight: '700',
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  grid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: (width - 50) / 2,
    backgroundColor: '#18181B',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 4,
  },
  gridEmoji: {
    fontSize: 24,
    marginBottom: 2,
  },
  gridTitle: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gridSub: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  classHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  tierPill: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tierPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#93C5FD',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  teacherContactBox: {
    backgroundColor: '#09090B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#27272A',
    marginTop: 8,
    gap: 8,
  },
  teacherContactLabel: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  teacherButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  teacherBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#18181B',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 6,
  },
  teacherBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  homeworkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  donePill: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  donePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#34D399',
  },
  checkGoalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#52525B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleActive: {
    backgroundColor: '#34D399',
    borderColor: '#34D399',
  },
  goalText: {
    fontSize: 12,
    color: '#E4E4E7',
    lineHeight: 16,
  },
  goalTextDone: {
    textDecorationLine: 'line-through',
    color: '#6B7280',
  },
  classTitleBig: {
    fontSize: 20,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  classAgeRange: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  divider: {
    height: 1,
    backgroundColor: '#27272A',
    marginVertical: 4,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  metaKey: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  metaVal: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  cardTitleMedium: {
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  homeworkDesc: {
    fontSize: 12,
    color: '#D1D5DB',
    lineHeight: 18,
  },
  homeworkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 6,
  },
  homeworkBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  quizCard: {
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
    gap: 12,
  },
  quizHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quizHeaderTag: {
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: '#FBBF24',
    letterSpacing: 1.2,
  },
  quizTitle: {
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 2,
  },
  quizTeluguSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  quizRewardBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 4,
  },
  quizPointsPill: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  quizPointsText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
  },
  quizBadgePill: {
    backgroundColor: '#27272A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  quizBadgePillText: {
    fontSize: 10,
    color: '#E4E4E7',
    fontWeight: '600',
  },
  startQuizBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FBBF24',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
    marginTop: 4,
  },
  startQuizBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#000000',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionHeaderSub: {
    fontSize: 10,
    color: '#FBBF24',
    fontWeight: '600',
  },
  storyEmojiBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#09090B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#27272A',
    overflow: 'hidden',
  },
  storyCoverImg: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  storyTeluguText: {
    fontSize: 11,
    color: '#E4E4E7',
    fontWeight: '600',
    marginTop: 1,
  },
  storyMeta: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  storyReadPill: {
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  storyReadPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FBBF24',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  itemDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  songListCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 12,
    marginBottom: 8,
  },
  songEmojiBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#09090B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  songTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  songTeluguSub: {
    fontSize: 11,
    color: '#E4E4E7',
    marginTop: 1,
  },
  songDurationMeta: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  songPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizQuestion: {
    fontSize: 13,
    color: '#E4E4E7',
    fontWeight: '600',
  },
  quizOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quizOptionBtn: {
    width: (width - 66) / 2,
    backgroundColor: '#09090B',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  quizOptionCorrect: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  quizOptionText: {
    color: '#D4D4D8',
    fontSize: 11,
  },
  quizOptionTextCorrect: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700',
  },
  storyCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  storyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  storySub: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  storyLink: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '700',
  },
  passCard: {
    backgroundColor: '#18181B',
    borderRadius: 28,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
    gap: 10,
  },
  passAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FDE68A',
  },
  passAvatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
  },
  passChildName: {
    fontSize: 20,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    color: '#FFFFFF',
  },
  passClassRoom: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  passChildId: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#FBBF24',
  },
  passCodeBox: {
    width: '100%',
    backgroundColor: '#000000',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3F3F46',
    padding: 12,
    alignItems: 'center',
    marginVertical: 4,
  },
  passCodeLabel: {
    fontSize: 9,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#9CA3AF',
    fontWeight: '700',
    letterSpacing: 1,
  },
  passCodeDigits: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 4,
    marginVertical: 4,
  },
  passCodeSub: {
    fontSize: 10,
    color: '#10B981',
  },
  qrContainer: {
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  guardiansList: {
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    paddingTop: 12,
    gap: 4,
  },
  guardiansHeader: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: '#9CA3AF',
    marginBottom: 2,
  },
  guardianItem: {
    fontSize: 11,
    color: '#D4D4D8',
  },
  passStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 6,
  },
  statusPillHold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  statusPillTextHold: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EF4444',
  },
  statusPillIn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPillTextIn: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
  },
  statusPillOut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusPillTextOut: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
  },
  academicBadge: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '700',
  },
  passIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    marginVertical: 4,
  },
  passCodeTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  refreshCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#27272A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  refreshCodeBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FBBF24',
  },
  qrHint: {
    fontSize: 9,
    color: '#6B7280',
    marginTop: 6,
  },
  emergencyHoldBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    width: '100%',
    marginTop: 6,
  },
  emergencyHoldBtnActive: {
    backgroundColor: '#DC2626',
    borderColor: '#EF4444',
  },
  emergencyHoldBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },
  emergencyHoldBtnTextActive: {
    color: '#FFFFFF',
  },
  safeguardCard: {
    backgroundColor: '#18181B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 8,
  },
  safeguardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  safeguardTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  allergyAlertBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },
  allergyAlertTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EF4444',
    marginBottom: 2,
  },
  allergyAlertList: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  medicalNotesText: {
    fontSize: 11,
    color: '#D1D5DB',
    marginTop: 3,
  },
  noAllergyText: {
    fontSize: 12,
    color: '#34D399',
  },
  bloodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  bloodLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  bloodVal: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  guardiansCard: {
    backgroundColor: '#18181B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 10,
  },
  guardiansHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  guardiansHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  guardiansSub: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 1,
  },
  addGuardianBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  addGuardianBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#000000',
  },
  guardiansListWrap: {
    gap: 8,
  },
  guardianCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09090B',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  guardianInfo: {
    flex: 1,
  },
  guardianNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  guardianName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  relationTag: {
    backgroundColor: '#27272A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  relationTagText: {
    fontSize: 9,
    color: '#D1D5DB',
    fontWeight: '600',
  },
  primaryBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  primaryBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FBBF24',
  },
  guardianPhone: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  guardianActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callGuardianBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteGuardianBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  teacherContactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 10,
  },
  teacherContactHeading: {
    fontSize: 9,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  teacherName: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 2,
  },
  teacherLocation: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  teacherBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teacherCallBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  teacherWaBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rewardsCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    marginTop: 14,
    gap: 12,
  },
  rewardsTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rewardsHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  pointsBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pointsBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
  },
  badgesScrollRow: {
    gap: 10,
    paddingVertical: 2,
  },
  badgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#09090B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 8,
  },
  badgeEmoji: {
    fontSize: 20,
  },
  badgeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  badgeTitleTe: {
    fontSize: 10,
    color: '#FBBF24',
  },
  certLaunchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FBBF24',
    paddingVertical: 12,
    borderRadius: 10,
  },
  certLaunchBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
  },
  modernTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 10,
  },
  greetingProfileTrigger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 999,
  },
  greetingAvatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  greetingNameText: {
    fontSize: 15,
    fontWeight: '800',
    flexShrink: 1,
  },
  greetingSubText: {
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 15,
    marginTop: 1,
  },
  subpageHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  subpageBackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  subpageBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  subpageBackText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  childPickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    paddingHorizontal: 18,
  },
  childPickerSheet: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 10,
  },
  childModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  childModalAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#EFE9FE',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  childModalName: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  childModalMeta: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 1,
  },
  childModalCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kidsQuoteCard: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  kidsQuoteGlowCircle: {
    position: 'absolute',
    top: -32,
    right: -24,
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  kidsQuoteHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  kidsQuoteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  kidsQuoteBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  kidsQuoteRefText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  kidsQuoteText: {
    fontSize: 15.5,
    lineHeight: 23,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    fontStyle: 'italic',
  },
  peachProgressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  peachDecorRingA: {
    position: 'absolute',
    right: -22,
    top: -28,
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 1.5,
  },
  peachDecorRingB: {
    position: 'absolute',
    right: 18,
    bottom: -44,
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1.5,
  },
  peachTopTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  peachClassBadge: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
  },
  peachClassBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FF6B4A',
    letterSpacing: 0.6,
  },
  peachTitle: {
    fontSize: 18.5,
    fontWeight: '900',
    flexShrink: 1,
    letterSpacing: -0.2,
  },
  peachMeta: {
    fontSize: 12.5,
    fontWeight: '600',
    marginTop: 2,
  },
  peachPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  peachMiniStatPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  peachStat: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  peachViewHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: 2,
  },
  peachViewHintText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FF6B4A',
  },
  checkedInMiniPill: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  checkedInMiniText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  progressRingBox: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  progressRingPct: {
    position: 'absolute',
    fontSize: 13.5,
    fontWeight: '800',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modernSectionTitle: {
    fontSize: 17.5,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  categoryGrid: {
    gap: 10,
  },
  categoryGridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryGridTile: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: 'transparent',
  },
  categoryIconCircle: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIconImg: {
    width: '100%',
    height: '100%',
  },
  categoryLabelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  categoryTileLabel: {
    fontSize: 10.8,
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
  },
  featuredLessonCard: {
    width: width - 86,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
  },
  featuredLessonFullCard: {
    width: '100%',
  },
  lessonAccentStrip: {
    height: 4,
    width: '100%',
  },
  lessonCardInner: {
    padding: 16,
    gap: 12,
  },
  featuredTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featuredLessonIllust: {
    width: 50,
    height: 50,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  lessonWeekPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  lessonWeekPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  lessonRefPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  lessonRefPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  featuredTitle: {
    fontSize: 16.5,
    fontWeight: '800',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  memoryVerseBox: {
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    padding: 12,
    gap: 10,
  },
  memoryVerseStripe: {
    width: 3.5,
    borderRadius: 2,
  },
  memoryVerseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  memoryVerseEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  memoryVerseLangTag: {
    fontSize: 10,
    fontWeight: '700',
  },
  featuredVerseText: {
    fontSize: 13.5,
    fontWeight: '700',
    lineHeight: 19.5,
  },
  featuredVerseSub: {
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 17.5,
  },
  featuredBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  lessonMetaChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    flexWrap: 'wrap',
  },
  lessonMetaMiniChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  lessonMetaMiniText: {
    fontSize: 11,
    fontWeight: '700',
  },
  openLessonPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 7.5,
    borderRadius: 999,
  },
  openLessonPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  arrowActionCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popularRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
  },
  popularThumbBox: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  popularTag: {
    fontSize: 11,
    fontWeight: '800',
  },
  popularTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    marginTop: 2,
  },
  popularSub: {
    fontSize: 11.5,
    fontWeight: '500',
    marginTop: 1,
  },
  popularStoryThumb16x9: {
    width: 112,
    aspectRatio: 16 / 9,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
