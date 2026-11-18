import React, { useState, useEffect, useMemo } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ChevronDown,
  Shield,
  BookOpen,
  Award,
  Calendar,
  Clock,
  User,
  Plus,
  Volume2,
  CheckCircle2,
  Sparkles,
  Camera,
  UserCheck,
  Phone,
  MessageCircle,
  Check,
  RefreshCw,
  AlertTriangle,
  UserPlus,
  Trash2,
  ShieldAlert,
} from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import { useAuth } from '../../context/AuthContext';
import KidsMinistryService from '../../services/KidsMinistryService';
import {
  ChildRecord,
  KidsClassRecord,
  KidsBibleStory,
  KidsQuiz,
  KidsWorshipSong,
  KidsCurriculumLesson,
  generateDynamicPickupCode,
} from '../../types/KidsMinistryTypes';
import KidsSplashScreen from './components/KidsSplashScreen';
import EnrollChildModal from './components/EnrollChildModal';
import KidsStoryReaderModal from './components/KidsStoryReaderModal';
import KidsQuizPlayerModal from './components/KidsQuizPlayerModal';
import KidsSongPlayerModal from './components/KidsSongPlayerModal';
import KidsLessonDetailModal from './components/KidsLessonDetailModal';
import AddGuardianModal from './components/AddGuardianModal';

const { width } = Dimensions.get('window');

export default function KidsMinistryScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const churchId = member?.churchId || 'rhema';

  // Splash Screen State
  const [showSplash, setShowSplash] = useState(true);

  // Data State
  const [children, setChildren] = useState<ChildRecord[]>([]);
  const [classes, setClasses] = useState<KidsClassRecord[]>([]);
  const [stories, setStories] = useState<KidsBibleStory[]>([]);
  const [quizzes, setQuizzes] = useState<KidsQuiz[]>([]);
  const [songs, setSongs] = useState<KidsWorshipSong[]>([]);
  const [curriculum, setCurriculum] = useState<KidsCurriculumLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChildIndex, setSelectedChildIndex] = useState(0);
  const [existingHousehold, setExistingHousehold] = useState<any[]>([]);
  const [homeworkDone, setHomeworkDone] = useState(false);

  // Modals state
  const [selectedStoryForReader, setSelectedStoryForReader] = useState<KidsBibleStory | null>(null);
  const [selectedQuizForPlayer, setSelectedQuizForPlayer] = useState<KidsQuiz | null>(null);
  const [selectedSongForPlayer, setSelectedSongForPlayer] = useState<KidsWorshipSong | null>(null);
  const [selectedLessonForModal, setSelectedLessonForModal] = useState<KidsCurriculumLesson | null>(null);

  // Navigation Tabs: 'home' | 'classroom' | 'lms' | 'pass'
  const [activeTab, setActiveTab] = useState<'home' | 'classroom' | 'lms' | 'pass'>('home');
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showChildPicker, setShowChildPicker] = useState(false);
  const [showAddGuardianModal, setShowAddGuardianModal] = useState(false);
  const [togglingHold, setTogglingHold] = useState(false);

  // Daily dynamic pickup code per session (can be manually regenerated)
  const [dailyPickupCode, setDailyPickupCode] = useState(() => generateDynamicPickupCode());

  // Load registered children for the family in realtime
  useEffect(() => {
    if (!member) {
      setLoading(false);
      return;
    }

    const familyId = member.accountId || member.id;

    // Load existing household members for seamless pre-fill (without touching existing screens)
    KidsMinistryService.getExistingFamilyMembers(churchId, familyId).then(contacts => {
      setExistingHousehold(contacts);
    });

    // Realtime subscription to Sunday School classes
    const unsubClasses = KidsMinistryService.subscribeToClasses(churchId, classList => {
      setClasses(classList);
    });

    // Realtime subscription to Bible Stories
    const unsubStories = KidsMinistryService.subscribeToStories(churchId, storyList => {
      setStories(storyList);
    });

    // Realtime subscription to Quizzes
    const unsubQuizzes = KidsMinistryService.subscribeToQuizzes(churchId, quizList => {
      setQuizzes(quizList);
    });

    // Realtime subscription to Action Songs
    const unsubSongs = KidsMinistryService.subscribeToSongs(churchId, songList => {
      setSongs(songList);
    });

    // Realtime subscription to 52-Week Curriculum
    const unsubCurriculum = KidsMinistryService.subscribeToCurriculum(churchId, curList => {
      setCurriculum(curList);
    });

    // Realtime subscription to children
    const unsubscribe = KidsMinistryService.subscribeToFamilyChildren(
      churchId,
      familyId,
      kidList => {
        setChildren(kidList);
        setLoading(false);
      }
    );

    return () => {
      unsubClasses();
      unsubStories();
      unsubQuizzes();
      unsubSongs();
      unsubCurriculum();
      unsubscribe();
    };
  }, [member?.id, member?.accountId, churchId]);

  const activeChild = children[selectedChildIndex] || null;

  const assignedClass = useMemo(() => {
    if (!activeChild) return null;
    return classes.find(c => c.tier === activeChild.assignedTier) || null;
  }, [classes, activeChild]);

  // Custody Hold & Guardian Handlers
  const handleToggleEmergencyHold = (currentStatus: string) => {
    if (!activeChild) return;
    const isActivating = currentStatus !== 'emergency_hold';

    Alert.alert(
      isActivating ? 'Activate Emergency Hold?' : 'Release Emergency Hold?',
      isActivating
        ? 'Activating Emergency Hold will immediately freeze dismissal at the teacher checkout scanner. No one will be allowed to pick up your child until you release this hold.'
        : 'Are you sure you want to release the emergency hold and resume normal authorized guardian pickup?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isActivating ? 'Lock Dismissal' : 'Release Hold',
          style: isActivating ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setTogglingHold(true);
              await KidsMinistryService.toggleEmergencyHold(
                churchId,
                activeChild.id,
                isActivating,
                'Parent mobile app request'
              );
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not update custody status');
            } finally {
              setTogglingHold(false);
            }
          },
        },
      ]
    );
  };

  const handleRemoveGuardian = (guardianId: string, guardianName: string) => {
    if (!activeChild) return;
    Alert.alert(
      'Remove Guardian Authorization',
      `Are you sure you want to remove ${guardianName} from authorized pickup?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await KidsMinistryService.removeAuthorizedGuardian(churchId, activeChild.id, guardianId);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not remove guardian');
            }
          },
        },
      ]
    );
  };

  // If splash is showing, render cinematic splash screen
  if (showSplash) {
    return (
      <KidsSplashScreen
        onEnter={() => setShowSplash(false)}
        churchName={(member as any)?.churchName || 'RHEMA GLOBAL MINISTRIES'}
      />
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />

      {/* ── TOP APP HEADER ── */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={20} color="#FFFFFF" strokeWidth={2.4} />
        </TouchableOpacity>

        {/* Center: Title & Child Switcher */}
        <View style={styles.headerCenter}>
          <View style={styles.titleWithCrown}>
            <Text style={styles.crownEmoji}>👑</Text>
            <Text style={styles.appTitleSerif}>Rhema Kids</Text>
          </View>

          {children.length > 0 && activeChild ? (
            <TouchableOpacity
              style={styles.childSwitcher}
              onPress={() => setShowChildPicker(!showChildPicker)}
            >
              <Text style={styles.childSwitcherText} numberOfLines={1}>
                {activeChild.fullName} (Age {activeChild.age})
              </Text>
              <ChevronDown size={12} color="#FBBF24" />
            </TouchableOpacity>
          ) : (
            <Text style={styles.childSwitcherSub}>Sunday School Ministry</Text>
          )}
        </View>

        {/* Right Action: Enroll Kid or Pass */}
        <TouchableOpacity
          style={styles.topActionBtn}
          onPress={() => setShowEnrollModal(true)}
          activeOpacity={0.8}
        >
          <Plus size={14} color="#000000" strokeWidth={2.8} />
          <Text style={styles.topActionBtnText}>Add Kid</Text>
        </TouchableOpacity>
      </View>

      {/* Child Dropdown Menu (If family has multiple kids) */}
      {showChildPicker && children.length > 1 && (
        <View style={styles.dropdownPicker}>
          <Text style={styles.dropdownHeader}>SWITCH CHILD:</Text>
          {children.map((k, idx) => (
            <TouchableOpacity
              key={k.id}
              style={[
                styles.dropdownItem,
                idx === selectedChildIndex && styles.dropdownItemActive,
              ]}
              onPress={() => {
                setSelectedChildIndex(idx);
                setShowChildPicker(false);
              }}
            >
              <Text
                style={[
                  styles.dropdownItemText,
                  idx === selectedChildIndex && styles.dropdownItemTextActive,
                ]}
              >
                🧒 {k.fullName} · Age {k.age} ({k.assignedClassName || 'Class'})
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── TABS NAVIGATION (RHEMA PILLS) ── */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.tabPill, activeTab === 'home' && styles.tabPillActive]}
          onPress={() => setActiveTab('home')}
        >
          <Text style={[styles.tabText, activeTab === 'home' && styles.tabTextActive]}>
            Home
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabPill, activeTab === 'classroom' && styles.tabPillActive]}
          onPress={() => setActiveTab('classroom')}
        >
          <Text style={[styles.tabText, activeTab === 'classroom' && styles.tabTextActive]}>
            Sunday School
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabPill, activeTab === 'lms' && styles.tabPillActive]}
          onPress={() => setActiveTab('lms')}
        >
          <Text style={[styles.tabText, activeTab === 'lms' && styles.tabTextActive]}>
            Bible LMS
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabPill, activeTab === 'pass' && styles.tabPillActive]}
          onPress={() => setActiveTab('pass')}
        >
          <Text style={[styles.tabText, activeTab === 'pass' && styles.tabTextActive]}>
            Custody Pass
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── MAIN BODY CONTENT ── */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#FBBF24" />
          <Text style={styles.loadingText}>Loading Rhema Kids...</Text>
        </View>
      ) : children.length === 0 ? (
        /* Empty State: No child enrolled yet */
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconBox}>
            <Text style={{ fontSize: 36 }}>👶</Text>
          </View>
          <Text style={styles.emptyTitle}>Welcome to Rhema Kids!</Text>
          <Text style={styles.emptySub}>
            Register your children to access secure Sunday School attendance, live entrance face scan, and bilingual Bible learning.
          </Text>

          <TouchableOpacity
            style={styles.enrollNowBtn}
            onPress={() => setShowEnrollModal(true)}
            activeOpacity={0.88}
          >
            <Plus size={18} color="#000000" strokeWidth={2.8} />
            <Text style={styles.enrollNowBtnText}>Enroll Child in Sunday School</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* ==================================================== */}
          {/* TAB 1: HOME DASHBOARD                                */}
          {/* ==================================================== */}
          {activeTab === 'home' && (
            <>
              {/* Today's Sunday School Status Card */}
              <View style={styles.heroStatusCard}>
                <View style={styles.statusRow}>
                  <View style={styles.liveBadge}>
                    <View style={styles.livePulseDot} />
                    <Text style={styles.liveBadgeText}>SUNDAY SCHOOL TODAY</Text>
                  </View>
                  <Text style={styles.codeLabel}>{activeChild?.childId}</Text>
                </View>

                <View style={styles.statusDetailsRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.classTierSub}>
                      {activeChild?.assignedClassName || 'Sunday School'}
                    </Text>
                    <Text style={styles.classRoomTitle}>Room 204 · 2nd Floor</Text>
                    <Text style={styles.scheduleMeta}>Sundays 09:30 AM – 11:30 AM</Text>
                  </View>

                  {/* One-Time Pickup Code Badge */}
                  <View style={styles.pickupCodeBadge}>
                    <Text style={styles.codeTag}>PICKUP CODE</Text>
                    <Text style={styles.codeDigits}>{dailyPickupCode}</Text>
                  </View>
                </View>

                <View style={styles.cardFooter}>
                  <Text style={styles.allergySummary}>
                    {activeChild?.medical?.hasAllergies ? (
                      <Text style={{ color: '#F87171' }}>
                        ⚠️ {activeChild.medical.allergiesList.join(', ')}
                      </Text>
                    ) : (
                      <Text style={{ color: '#34D399' }}>✓ No Allergies Reported</Text>
                    )}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setActiveTab('pass')}
                    style={styles.viewPassLink}
                  >
                    <Text style={styles.viewPassLinkText}>View Pass &rsaquo;</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Dynamic Sunday Bible Lesson & Memory Verse Card */}
              {(() => {
                const activeLesson = curriculum.find(l => l.isCurrentWeek) || curriculum[0];
                const verseEn = activeLesson?.memoryVerse?.verseEnglish || "For the battle is the LORD's, and he will give you into our hands.";
                const verseTe = activeLesson?.memoryVerse?.verseTelugu || "యుద్ధము యెహోవాదే; ఆయన మిమ్మును మా చేతికి అప్పగించును.";
                const verseRef = activeLesson?.memoryVerse?.reference || "1 Samuel 17:47";
                const lessonTitle = activeLesson?.title || "David and Goliath";
                const weekNum = activeLesson?.weekNumber || 42;

                return (
                  <TouchableOpacity
                    style={[styles.card, { borderColor: '#FBBF24', borderWidth: 1 }]}
                    onPress={() => activeLesson && setSelectedLessonForModal(activeLesson)}
                    activeOpacity={0.88}
                  >
                    <View style={styles.cardHeaderSmall}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.cardHeaderTag, { color: '#FBBF24' }]}>
                          ⭐ WEEK {weekNum} SUNDAY LESSON
                        </Text>
                        <View style={{ backgroundColor: 'rgba(251, 191, 36, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: '#FBBF24' }}>TAP DETAILS &rsaquo;</Text>
                        </View>
                      </View>
                      <Text style={styles.verseRef}>{verseRef}</Text>
                    </View>

                    <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#FFFFFF', marginTop: 2, marginBottom: 4 }}>
                      {lessonTitle}
                    </Text>

                    <Text style={styles.verseTelugu}>
                      "{verseTe}"
                    </Text>
                    <Text style={styles.verseEnglish}>
                      "{verseEn}"
                    </Text>

                    <View style={styles.verseFooter}>
                      <TouchableOpacity
                        style={styles.audioListenBtn}
                        onPress={() => Alert.alert('Scripture Recitation', `"${verseEn}"\n\n"${verseTe}"\n\n— ${verseRef}`)}
                      >
                        <Volume2 size={14} color="#FBBF24" />
                        <Text style={styles.audioListenText}>Listen Audio (తెలుగు)</Text>
                      </TouchableOpacity>
                      <View style={styles.starBadge}>
                        <Text style={styles.starBadgeText}>★ 20 Points Award</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })()}

              {/* Quick Modules 2x2 Grid */}
              <View>
                <Text style={styles.sectionHeader}>EXPLORE RHEMA KIDS</Text>
                <View style={styles.grid2x2}>
                  <TouchableOpacity
                    style={styles.gridItem}
                    onPress={() => setActiveTab('lms')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.gridEmoji}>🎨</Text>
                    <Text style={styles.gridTitle}>Bible Stories</Text>
                    <Text style={styles.gridSub}>Illustrated & Telugu Audio</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.gridItem}
                    onPress={() => setActiveTab('lms')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.gridEmoji}>🏆</Text>
                    <Text style={styles.gridTitle}>Kids Quizzes</Text>
                    <Text style={styles.gridSub}>Earn Bible Star Badges</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.gridItem}
                    onPress={() => setActiveTab('classroom')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.gridEmoji}>📚</Text>
                    <Text style={styles.gridTitle}>52-Wk Lessons</Text>
                    <Text style={styles.gridSub}>Telugu & English Guides</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.gridItem}
                    onPress={() =>
                      Alert.alert(
                        'Worship Action Songs',
                        'Opening Christian kids action songs and choir playlist with Telugu lyrics!'
                      )
                    }
                    activeOpacity={0.8}
                  >
                    <Text style={styles.gridEmoji}>🎵</Text>
                    <Text style={styles.gridTitle}>Action Songs</Text>
                    <Text style={styles.gridSub}>Worship with Lyrics</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Entrance & Dismissal Stations */}
              <View style={{ marginTop: 16 }}>
                <Text style={styles.sectionHeader}>SAFETY & ATTENDANCE STATIONS</Text>
                <View style={styles.stationsRow}>
                  <TouchableOpacity
                    style={styles.stationCard}
                    onPress={() => navigation.navigate('KidsFaceScanKiosk')}
                    activeOpacity={0.88}
                  >
                    <View style={[styles.stationIconBox, { backgroundColor: 'rgba(251, 191, 36, 0.15)' }]}>
                      <Camera size={18} color="#FBBF24" />
                    </View>
                    <Text style={styles.stationTitle}>Entrance Kiosk</Text>
                    <Text style={styles.stationSub}>Face scan check-in</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.stationCard}
                    onPress={() => navigation.navigate('KidsCheckOutScanner')}
                    activeOpacity={0.88}
                  >
                    <View style={[styles.stationIconBox, { backgroundColor: 'rgba(52, 211, 153, 0.15)' }]}>
                      <UserCheck size={18} color="#34D399" />
                    </View>
                    <Text style={styles.stationTitle}>Teacher Exit</Text>
                    <Text style={styles.stationSub}>Guardian photo match</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.stationCard}
                    onPress={() => navigation.navigate('KidsTeacherKiosk')}
                    activeOpacity={0.88}
                  >
                    <View style={[styles.stationIconBox, { backgroundColor: 'rgba(96, 165, 250, 0.15)' }]}>
                      <Clock size={18} color="#60A5FA" />
                    </View>
                    <Text style={styles.stationTitle}>Faculty In</Text>
                    <Text style={styles.stationSub}>Face scan & PIN</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}

          {/* ==================================================== */}
          {/* TAB 2: SUNDAY SCHOOL CLASSROOM                       */}
          {/* ==================================================== */}
          {activeTab === 'classroom' && (
            <>
              <View style={styles.card}>
                <View style={styles.classHeaderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardHeaderTag}>ASSIGNED SUNDAY SCHOOL CLASS</Text>
                    <Text style={styles.classTitleBig}>
                      {assignedClass?.name || activeChild?.assignedClassName || 'Sunday School'}
                    </Text>
                  </View>
                  <View style={styles.tierPill}>
                    <Text style={styles.tierPillText}>
                      {assignedClass ? `Ages ${assignedClass.ageRange.min}–${assignedClass.ageRange.max}` : `Age ${activeChild?.age}`}
                    </Text>
                  </View>
                </View>

                <Text style={styles.classAgeRange}>
                  Student: {activeChild?.fullName} (Age {activeChild?.age}) · Academic Year {assignedClass?.academicYear || activeChild?.academicYear}
                </Text>

                <View style={styles.divider} />

                <View style={styles.metaRow}>
                  <Text style={styles.metaKey}>Room Location:</Text>
                  <Text style={styles.metaVal}>{assignedClass?.roomNumber || 'Room 201 (2nd Floor)'}</Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaKey}>Weekly Schedule:</Text>
                  <Text style={styles.metaVal}>
                    Sundays {assignedClass?.schedule?.startTime || '09:30'} AM – {assignedClass?.schedule?.endTime || '11:30'} AM
                  </Text>
                </View>

                <View style={styles.metaRow}>
                  <Text style={styles.metaKey}>Lead Teacher:</Text>
                  <Text style={styles.metaVal}>
                    {assignedClass?.leadTeacherName || 'Bro. Sunil Babu'}
                  </Text>
                </View>

                {/* Teacher Contact Bar */}
                <View style={styles.teacherContactBox}>
                  <Text style={styles.teacherContactLabel}>Need to notify teacher about attendance?</Text>
                  <View style={styles.teacherButtonsRow}>
                    <TouchableOpacity
                      style={styles.teacherBtn}
                      onPress={() => {
                        const phone = assignedClass?.leadTeacherPhone || '+919876543210';
                        Linking.openURL(`tel:${phone}`).catch(() => {
                          Alert.alert('Phone', `Contact: ${assignedClass?.leadTeacherName} (${phone})`);
                        });
                      }}
                    >
                      <Phone size={13} color="#34D399" />
                      <Text style={styles.teacherBtnText}>Call Teacher</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.teacherBtn, { backgroundColor: '#064E3B' }]}
                      onPress={() => {
                        const phone = (assignedClass?.leadTeacherPhone || '+919876543210').replace(/\D/g, '');
                        const msg = encodeURIComponent(`Hi ${assignedClass?.leadTeacherName || 'Teacher'}, regarding ${activeChild?.fullName} in ${assignedClass?.name}...`);
                        Linking.openURL(`whatsapp://send?phone=${phone}&text=${msg}`).catch(() => {
                          Alert.alert('WhatsApp', 'WhatsApp is not installed on this device.');
                        });
                      }}
                    >
                      <MessageCircle size={13} color="#34D399" />
                      <Text style={[styles.teacherBtnText, { color: '#34D399' }]}>WhatsApp</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Weekly Homework & Goal Checklist */}
              <View style={styles.card}>
                <View style={styles.homeworkHeader}>
                  <Text style={styles.cardTitleMedium}>This Week's Homework & Goals</Text>
                  {homeworkDone && (
                    <View style={styles.donePill}>
                      <Text style={styles.donePillText}>★ Completed</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.homeworkDesc}>
                  Practice these 3 discipleship goals at home before this Sunday:
                </Text>

                <TouchableOpacity
                  style={styles.checkGoalItem}
                  onPress={() => setHomeworkDone(!homeworkDone)}
                  activeOpacity={0.88}
                >
                  <View style={[styles.checkCircle, homeworkDone && styles.checkCircleActive]}>
                    {homeworkDone && <Check size={12} color="#000000" strokeWidth={3} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.goalText, homeworkDone && styles.goalTextDone]}>
                      1. Read 1 Samuel 17 (David & Goliath) with family
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.checkGoalItem}
                  onPress={() => setHomeworkDone(!homeworkDone)}
                  activeOpacity={0.88}
                >
                  <View style={[styles.checkCircle, homeworkDone && styles.checkCircleActive]}>
                    {homeworkDone && <Check size={12} color="#000000" strokeWidth={3} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.goalText, homeworkDone && styles.goalTextDone]}>
                      2. Recite memory verse (1 Sam 17:47) in Telugu or English
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.checkGoalItem}
                  onPress={() => setHomeworkDone(!homeworkDone)}
                  activeOpacity={0.88}
                >
                  <View style={[styles.checkCircle, homeworkDone && styles.checkCircleActive]}>
                    {homeworkDone && <Check size={12} color="#000000" strokeWidth={3} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.goalText, homeworkDone && styles.goalTextDone]}>
                      3. Bring your physical Bible & activity booklet to class
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.homeworkBtn, homeworkDone && { backgroundColor: '#064E3B' }]}
                  onPress={() => {
                    setHomeworkDone(!homeworkDone);
                    if (!homeworkDone) {
                      Alert.alert(
                        'Great Job! 🎉',
                        `Homework marked complete for ${activeChild?.firstName}! +25 Bible Star Points earned!`
                      );
                    }
                  }}
                >
                  <CheckCircle2 size={16} color={homeworkDone ? '#34D399' : '#000000'} />
                  <Text style={[styles.homeworkBtnText, homeworkDone && { color: '#34D399' }]}>
                    {homeworkDone ? 'Homework Completed ✓' : 'Mark Homework Completed'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* ==================================================== */}
          {/* TAB 3: BIBLE LMS (QUIZZES, STORIES & WORSHIP)        */}
          {/* ==================================================== */}
          {activeTab === 'lms' && (
            <>
              {/* Featured Bible Quiz Card */}
              {quizzes.length > 0 && (
                <View style={styles.quizCard}>
                  <View style={styles.quizHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.quizHeaderTag}>BIBLE CHALLENGE OF THE WEEK</Text>
                      <Text style={styles.quizTitle}>{quizzes[0].title}</Text>
                      <Text style={styles.quizTeluguSub}>{quizzes[0].titleTelugu} · {quizzes[0].scriptureRef}</Text>
                    </View>
                    <Text style={{ fontSize: 32 }}>{quizzes[0].coverEmoji || '🏆'}</Text>
                  </View>

                  <View style={styles.quizRewardBadgeRow}>
                    <View style={styles.quizPointsPill}>
                      <Text style={styles.quizPointsText}>★ +{quizzes[0].pointsReward} Star Points</Text>
                    </View>
                    <View style={styles.quizBadgePill}>
                      <Text style={styles.quizBadgePillText}>{quizzes[0].badgeReward}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.startQuizBtn}
                    onPress={() => setSelectedQuizForPlayer(quizzes[0])}
                    activeOpacity={0.88}
                  >
                    <Award size={16} color="#000000" />
                    <Text style={styles.startQuizBtnText}>Start Interactive Quiz &rsaquo;</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Illustrated Bilingual Bible Stories */}
              <View style={{ marginTop: 8 }}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeader}>ILLUSTRATED BIBLE STORIES</Text>
                  <Text style={styles.sectionHeaderSub}>Telugu & English</Text>
                </View>

                {stories.map(s => (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.storyCard}
                    onPress={() => setSelectedStoryForReader(s)}
                    activeOpacity={0.88}
                  >
                    <View style={styles.storyEmojiBubble}>
                      <Text style={{ fontSize: 26 }}>{s.coverEmoji || '📖'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.storyTitle}>{s.title}</Text>
                      <Text style={styles.storyTeluguText}>{s.titleTelugu}</Text>
                      <Text style={styles.storyMeta}>
                        {s.scriptureRef} · {s.readTime || '5 min'} · {s.pages?.length || 4} Illustrated Pages
                      </Text>
                    </View>
                    <View style={styles.storyReadPill}>
                      <Text style={styles.storyReadPillText}>Read &rsaquo;</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Action Worship Songs Playlist */}
              <View style={{ marginTop: 14 }}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeader}>KIDS ACTION WORSHIP SONGS</Text>
                  <Text style={styles.sectionHeaderSub}>Video & Lyrics</Text>
                </View>

                {songs.map(song => (
                  <TouchableOpacity
                    key={song.id}
                    style={styles.songListCard}
                    onPress={() => setSelectedSongForPlayer(song)}
                    activeOpacity={0.88}
                  >
                    <View style={styles.songEmojiBubble}>
                      <Text style={{ fontSize: 24 }}>{song.coverEmoji || '🎵'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.songTitle}>{song.title}</Text>
                      <Text style={styles.songTeluguSub}>{song.titleTelugu}</Text>
                      <Text style={styles.songDurationMeta}>Duration: {song.duration || '3:00'} · Action Dance</Text>
                    </View>
                    <View style={styles.songPlayBtn}>
                      <Volume2 size={14} color="#FBBF24" />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* ==================================================== */}
          {/* TAB 4: LIVE CUSTODY PASS & PARENT SAFEGUARDING PORTAL */}
          {/* ==================================================== */}
          {activeTab === 'pass' && (
            <View style={{ gap: 14 }}>
              {/* Main Live Custody Card */}
              <View style={styles.passCard}>
                {/* Realtime Custody Status Header */}
                <View style={styles.passStatusHeader}>
                  {activeChild?.custodyStatus === 'emergency_hold' ? (
                    <View style={styles.statusPillHold}>
                      <ShieldAlert size={14} color="#EF4444" />
                      <Text style={styles.statusPillTextHold}>EMERGENCY HOLD ACTIVE</Text>
                    </View>
                  ) : activeChild?.custodyStatus === 'checked_in' ? (
                    <View style={styles.statusPillIn}>
                      <View style={styles.livePulseDot} />
                      <Text style={styles.statusPillTextIn}>IN CLASSROOM · SUPERVISED</Text>
                    </View>
                  ) : (
                    <View style={styles.statusPillOut}>
                      <UserCheck size={14} color="#FBBF24" />
                      <Text style={styles.statusPillTextOut}>CHECKED OUT / WITH PARENT</Text>
                    </View>
                  )}
                  <Text style={styles.academicBadge}>2026-2027</Text>
                </View>

                {/* Child Identity Row */}
                <View style={styles.passIdentityRow}>
                  <View style={styles.passAvatar}>
                    <Text style={styles.passAvatarText}>
                      {activeChild?.firstName?.charAt(0) || 'K'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.passChildName}>{activeChild?.fullName}</Text>
                    <Text style={styles.passClassRoom}>
                      {activeChild?.assignedClassName} · Room 204
                    </Text>
                    <Text style={styles.passChildId}>Child ID: {activeChild?.childId}</Text>
                  </View>
                </View>

                {/* Dynamic Security Claim Code with Regenerate */}
                <View style={styles.passCodeBox}>
                  <View style={styles.passCodeTopRow}>
                    <Text style={styles.passCodeLabel}>DYNAMIC SECURE PICKUP CODE</Text>
                    <TouchableOpacity
                      style={styles.refreshCodeBtn}
                      onPress={() => {
                        setDailyPickupCode(generateDynamicPickupCode());
                        Alert.alert('New Code Generated', 'Pickup security code has been refreshed!');
                      }}
                    >
                      <RefreshCw size={12} color="#FBBF24" />
                      <Text style={styles.refreshCodeBtnText}>Refresh</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.passCodeDigits}>{dailyPickupCode}</Text>
                  <Text style={styles.passCodeSub}>
                    Present this dynamic token or QR to the teacher dismissal scanner
                  </Text>
                </View>

                {/* QR Code Container */}
                <View style={styles.qrContainer}>
                  <QRCode
                    value={`RHEMA_KIDS:${activeChild?.id}:${dailyPickupCode}`}
                    size={150}
                    color="#000000"
                    backgroundColor="#FFFFFF"
                  />
                  <Text style={styles.qrHint}>High-contrast scanner format · Verified matching</Text>
                </View>

                {/* Emergency Hold Toggle Action */}
                <TouchableOpacity
                  style={[
                    styles.emergencyHoldBtn,
                    activeChild?.custodyStatus === 'emergency_hold' && styles.emergencyHoldBtnActive,
                  ]}
                  onPress={() => handleToggleEmergencyHold(activeChild?.custodyStatus || 'checked_in')}
                  disabled={togglingHold}
                  activeOpacity={0.88}
                >
                  <ShieldAlert
                    size={16}
                    color={activeChild?.custodyStatus === 'emergency_hold' ? '#FFFFFF' : '#EF4444'}
                  />
                  <Text
                    style={[
                      styles.emergencyHoldBtnText,
                      activeChild?.custodyStatus === 'emergency_hold' && styles.emergencyHoldBtnTextActive,
                    ]}
                  >
                    {togglingHold
                      ? 'Updating...'
                      : activeChild?.custodyStatus === 'emergency_hold'
                      ? 'Release Emergency Dismissal Hold'
                      : 'Lock Child Dismissal (Emergency Hold)'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Medical & Allergies Safeguarding Passport */}
              <View style={styles.safeguardCard}>
                <View style={styles.safeguardHeader}>
                  <AlertTriangle
                    size={16}
                    color={activeChild?.medical?.hasAllergies ? '#EF4444' : '#10B981'}
                  />
                  <Text style={styles.safeguardTitle}>MEDICAL & ALLERGY SAFEGUARDING</Text>
                </View>

                {activeChild?.medical?.hasAllergies ? (
                  <View style={styles.allergyAlertBox}>
                    <Text style={styles.allergyAlertTitle}>⚠️ KNOWN ALLERGIES / CONDITIONS:</Text>
                    <Text style={styles.allergyAlertList}>
                      {activeChild.medical.allergiesList.join(' · ')}
                    </Text>
                    {activeChild.medical.medicalAlertNotes ? (
                      <Text style={styles.medicalNotesText}>
                        Notes: {activeChild.medical.medicalAlertNotes}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.noAllergyText}>
                    ✓ No severe allergies or dietary restrictions recorded for {activeChild?.firstName}.
                  </Text>
                )}

                <View style={styles.bloodRow}>
                  <Text style={styles.bloodLabel}>Blood Group: </Text>
                  <Text style={styles.bloodVal}>{activeChild?.medical?.bloodGroup || 'O+ (Recorded)'}</Text>
                </View>
              </View>

              {/* Authorized Guardians Roster */}
              <View style={styles.guardiansCard}>
                <View style={styles.guardiansHeaderRow}>
                  <View>
                    <Text style={styles.guardiansHeading}>AUTHORIZED FOR CUSTODY RELEASE</Text>
                    <Text style={styles.guardiansSub}>Verified by teacher before child leaves room</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.addGuardianBtn}
                    onPress={() => setShowAddGuardianModal(true)}
                  >
                    <UserPlus size={14} color="#000000" />
                    <Text style={styles.addGuardianBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.guardiansListWrap}>
                  {activeChild?.guardians && activeChild.guardians.length > 0 ? (
                    activeChild.guardians.map(g => (
                      <View key={g.id} style={styles.guardianCardRow}>
                        <View style={styles.guardianInfo}>
                          <View style={styles.guardianNameRow}>
                            <Text style={styles.guardianName}>{g.name}</Text>
                            <View style={styles.relationTag}>
                              <Text style={styles.relationTagText}>{g.relationship}</Text>
                            </View>
                            {g.isPrimaryContact && (
                              <View style={styles.primaryBadge}>
                                <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.guardianPhone}>{g.phone}</Text>
                        </View>

                        <View style={styles.guardianActions}>
                          <TouchableOpacity
                            style={styles.callGuardianBtn}
                            onPress={() => Linking.openURL(`tel:${g.phone}`).catch(() => {})}
                          >
                            <Phone size={14} color="#10B981" />
                          </TouchableOpacity>
                          {!g.isPrimaryContact && (
                            <TouchableOpacity
                              style={styles.deleteGuardianBtn}
                              onPress={() => handleRemoveGuardian(g.id, g.name)}
                            >
                              <Trash2 size={14} color="#EF4444" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={styles.guardianCardRow}>
                      <View style={styles.guardianInfo}>
                        <Text style={styles.guardianName}>
                          {activeChild?.parentName || 'Parent'}
                        </Text>
                        <Text style={styles.guardianPhone}>
                          {activeChild?.parentPhone || 'Phone Registered'}
                        </Text>
                      </View>
                      <View style={styles.primaryBadge}>
                        <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {/* Lead Teacher Contact Hotline */}
              <View style={styles.teacherContactCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.teacherContactHeading}>SUNDAY SCHOOL LEAD TEACHER</Text>
                  <Text style={styles.teacherName}>Mrs. Sarah Jenkins (Verified Lead)</Text>
                  <Text style={styles.teacherLocation}>Room 204 · Floor 2 · 09:30 AM – 11:30 AM</Text>
                </View>
                <View style={styles.teacherBtnRow}>
                  <TouchableOpacity
                    style={styles.teacherCallBtn}
                    onPress={() => Linking.openURL('tel:+919876543210').catch(() => {})}
                  >
                    <Phone size={15} color="#10B981" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.teacherWaBtn}
                    onPress={() => Linking.openURL('https://wa.me/919876543210').catch(() => {})}
                  >
                    <MessageCircle size={15} color="#FBBF24" />
                  </TouchableOpacity>
                </View>
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
          existingFamilyMembers={existingHousehold}
          onChildEnrolled={() => {
            // Handled via realtime subscription
          }}
        />
      )}

      {/* ── BIBLE STORY READER MODAL ── */}
      {selectedStoryForReader && (
        <KidsStoryReaderModal
          visible={!!selectedStoryForReader}
          story={selectedStoryForReader}
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

      {/* ── SUNDAY BIBLE LESSON & MEMORY DETAIL MODAL ── */}
      {selectedLessonForModal && (
        <KidsLessonDetailModal
          visible={!!selectedLessonForModal}
          lesson={selectedLessonForModal}
          child={activeChild}
          onClose={() => setSelectedLessonForModal(null)}
        />
      )}

      {/* ── ADD AUTHORIZED GUARDIAN MODAL ── */}
      {showAddGuardianModal && activeChild && (
        <AddGuardianModal
          visible={showAddGuardianModal}
          childDocId={activeChild.id}
          childName={activeChild.fullName}
          churchId={churchId}
          onClose={() => setShowAddGuardianModal(false)}
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
  },
  childSwitcherText: {
    fontSize: 11,
    color: '#FBBF24',
    fontWeight: '700',
    maxWidth: 160,
  },
  childSwitcherSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  topActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
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
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#121215',
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
  stationsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  stationCard: {
    flex: 1,
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  stationIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stationTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stationSub: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
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
});
