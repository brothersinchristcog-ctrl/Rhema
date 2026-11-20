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
} from 'react-native';
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
  Volume2,
  CheckCircle2,
  Sparkles,
  UserCheck,
  Phone,
  MessageCircle,
  Check,
  AlertTriangle,
  Trash2,
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
  resolveActiveCurriculumLesson,
  formatCurriculumDateDisplay,
  resolveLessonTierKey,
} from '../../types/KidsMinistryTypes';
import KidsSplashScreen from './components/KidsSplashScreen';
import EnrollChildModal from './components/EnrollChildModal';
import KidsStoryReaderModal from './components/KidsStoryReaderModal';
import KidsQuizPlayerModal from './components/KidsQuizPlayerModal';
import KidsSongPlayerModal from './components/KidsSongPlayerModal';
import KidsLessonDetailModal from './components/KidsLessonDetailModal';
import KidsCertificateModal from './components/KidsCertificateModal';
import KidsExploreCategoryModal, { KidsExploreCategory } from './components/KidsExploreCategoryModal';

const { width } = Dimensions.get('window');

export default function KidsMinistryScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const { isDark, colors: themeColors } = useTheme();
  const churchId = member?.churchId || 'rhema';

  // Dynamic Theme Palette Support (Pure White, Warm White & Dark)
  const isLight = !isDark;
  const theme = useMemo(() => {
    return {
      isDark,
      isLight,
      screenBg: isDark ? '#000000' : (themeColors.background || '#F8FAFC'),
      headerBg: isDark ? '#000000' : (themeColors.surface || '#FFFFFF'),
      cardBg: isDark ? '#18181B' : (themeColors.surface || '#FFFFFF'),
      innerCardBg: isDark ? '#09090B' : '#F1F5F9',
      border: isDark ? '#27272A' : (themeColors.border || '#E2E8F0'),
      borderLight: isDark ? '#18181B' : '#E2E8F0',
      textPrimary: isDark ? '#FFFFFF' : '#0F172A',
      textSecondary: isDark ? '#9CA3AF' : '#64748B',
      textMuted: isDark ? '#71717A' : '#94A3B8',
      goldAccent: isDark ? '#FBBF24' : '#D97706',
      goldBg: isDark ? 'rgba(251, 191, 36, 0.15)' : '#FEF3C7',
      tabBarBg: isDark ? '#000000' : (themeColors.surface || '#FFFFFF'),
      tabPillInactiveBg: isDark ? '#18181B' : '#F1F5F9',
      tabPillInactiveBorder: isDark ? '#27272A' : '#CBD5E1',
      tabPillInactiveText: isDark ? '#9CA3AF' : '#64748B',
      tabPillActiveBg: isDark ? '#FFFFFF' : '#0F172A',
      tabPillActiveBorder: isDark ? '#FFFFFF' : '#0F172A',
      tabPillActiveText: isDark ? '#000000' : '#FFFFFF',
      backBtnBg: isDark ? '#18181B' : '#F1F5F9',
      backBtnIcon: isDark ? '#FFFFFF' : '#0F172A',
      addKidBtnBg: isDark ? '#FFFFFF' : '#0F172A',
      addKidBtnText: isDark ? '#000000' : '#FFFFFF',
      childBarBg: isDark ? '#0D0D11' : (themeColors.surface || '#FFFFFF'),
      childBarBorder: isDark ? '#1F1F24' : '#E2E8F0',
      childChipInactiveBg: isDark ? '#18181B' : '#F1F5F9',
      childChipInactiveBorder: isDark ? '#27272A' : '#E2E8F0',
      childChipActiveBg: isDark ? '#1E1B13' : '#FEF3C7',
      childChipActiveBorder: isDark ? '#FBBF24' : '#D97706',
      dropdownBg: isDark ? '#18181B' : '#FFFFFF',
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

  // Navigation Tabs: 'home' | 'classroom' | 'lms'
  const [activeTab, setActiveTab] = useState<'home' | 'classroom' | 'lms'>('home');
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showChildPicker, setShowChildPicker] = useState(false);
  const [confirmingConsent, setConfirmingConsent] = useState(false);

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

    // Realtime subscription to Curriculum Launch Config
    const unsubCurConfig = KidsMinistryService.subscribeToCurriculumConfig(churchId, cfg => {
      setCurriculumConfig(cfg);
    });

    // Realtime subscription to VBS 2026
    const unsubVBS = KidsMinistryService.subscribeToVBSEvent(churchId, ev => {
      setVbsEvent(ev);
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
      unsubTeachers();
      unsubStories();
      unsubQuizzes();
      unsubSongs();
      unsubCurriculum();
      unsubCurConfig();
      unsubVBS();
      unsubscribe();
    };
  }, [member?.id, member?.accountId, churchId]);

  const activeChild = children[selectedChildIndex] || null;

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
      await KidsMinistryService.confirmParentConsent(
        churchId,
        activeChild.id,
        member.id || ''
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

  const handleDeleteStory = (storyId: string, storyTitle: string) => {
    Alert.alert(
      'Delete Bible Story',
      `Are you sure you want to delete "${storyTitle}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await KidsMinistryService.deleteStory(churchId, storyId);
              Alert.alert('Story Deleted', `"${storyTitle}" has been removed.`);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not delete story');
            }
          },
        },
      ]
    );
  };

  const handleDeleteSong = (songId: string, songTitle: string) => {
    Alert.alert(
      'Delete Worship Song',
      `Are you sure you want to delete "${songTitle}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await KidsMinistryService.deleteSong(churchId, songId);
              Alert.alert('Song Deleted', `"${songTitle}" has been removed.`);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Could not delete song');
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
    <View style={[styles.container, { backgroundColor: theme.screenBg, paddingTop: insets.top }]}>
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.screenBg}
      />

      {/* ── TOP APP HEADER ── */}
      <View style={[styles.headerRow, { backgroundColor: theme.headerBg, borderBottomColor: theme.border }]}>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: theme.backBtnBg }]}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={20} color={theme.backBtnIcon} strokeWidth={2.4} />
        </TouchableOpacity>

        {/* Center: Title & Child Switcher */}
        <View style={styles.headerCenter}>
          <View style={styles.titleWithCrown}>
            <Text style={styles.crownEmoji}>👑</Text>
            <Text style={[styles.appTitleSerif, { color: theme.textPrimary }]}>Rhema Kids</Text>
          </View>

          {children.length > 0 && activeChild ? (
            <TouchableOpacity
              style={[
                styles.childSwitcher,
                children.length > 1 && [styles.childSwitcherInteractive, { backgroundColor: theme.goldBg, borderColor: theme.goldAccent }],
              ]}
              onPress={() => {
                if (children.length > 1) {
                  setShowChildPicker(!showChildPicker);
                }
              }}
              activeOpacity={children.length > 1 ? 0.7 : 1}
            >
              <Text style={[styles.childSwitcherText, { color: theme.goldAccent }]} numberOfLines={1}>
                {activeChild.fullName} (Age {activeChild.age})
              </Text>
              {children.length > 1 && (
                showChildPicker ? (
                  <ChevronUp size={13} color={theme.goldAccent} strokeWidth={2.6} />
                ) : (
                  <ChevronDown size={13} color={theme.goldAccent} strokeWidth={2.6} />
                )
              )}
            </TouchableOpacity>
          ) : (
            <Text style={[styles.childSwitcherSub, { color: theme.textSecondary }]}>Sunday School Ministry</Text>
          )}
        </View>

        {/* Right Action: Enroll Kid or Pass */}
        <TouchableOpacity
          style={[styles.topActionBtn, { backgroundColor: theme.addKidBtnBg }]}
          onPress={() => setShowEnrollModal(true)}
          activeOpacity={0.8}
        >
          <Plus size={14} color={theme.addKidBtnText} strokeWidth={2.8} />
          <Text style={[styles.topActionBtnText, { color: theme.addKidBtnText }]}>Add Kid</Text>
        </TouchableOpacity>
      </View>

      {/* Prominent Multi-Child Switcher Banner (Shows clearly when family has multiple kids) */}
      {children.length > 1 && (
        <View style={[styles.childBarContainer, { backgroundColor: theme.childBarBg, borderBottomColor: theme.childBarBorder }]}>
          <View style={styles.childBarHeader}>
            <View style={styles.childBarLabelWrap}>
              <Users size={12} color={theme.goldAccent} />
              <Text style={[styles.childBarLabel, { color: theme.goldAccent }]}>ACTIVE CHILD</Text>
            </View>
            <Text style={[styles.childBarSub, { color: theme.textMuted }]}>Tap to switch</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.childChipsScroll}
          >
            {children.map((k, idx) => {
              const isSelected = idx === selectedChildIndex;
              return (
                <TouchableOpacity
                  key={k.id}
                  style={[
                    styles.childChip,
                    isSelected
                      ? [styles.childChipActive, { backgroundColor: theme.childChipActiveBg, borderColor: theme.childChipActiveBorder }]
                      : [styles.childChipInactive, { backgroundColor: theme.childChipInactiveBg, borderColor: theme.childChipInactiveBorder }],
                  ]}
                  onPress={() => {
                    setSelectedChildIndex(idx);
                    setShowChildPicker(false);
                  }}
                  activeOpacity={0.8}
                >
                  {k.photoUrl ? (
                    <Image
                      source={{ uri: k.photoUrl }}
                      style={{ width: 28, height: 28, borderRadius: 14 }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.childChipEmoji}>
                      {k.gender === 'female' ? '👧' : '🧒'}
                    </Text>
                  )}
                  <View style={{ flexShrink: 1 }}>
                    <Text
                      style={[
                        styles.childChipName,
                        isSelected
                          ? [styles.childChipNameActive, { color: theme.textPrimary }]
                          : [styles.childChipNameInactive, { color: theme.textSecondary }],
                      ]}
                      numberOfLines={1}
                    >
                      {k.fullName}
                    </Text>
                    <Text
                      style={[
                        styles.childChipMeta,
                        isSelected
                          ? [styles.childChipMetaActive, { color: theme.goldAccent }]
                          : [styles.childChipMetaInactive, { color: theme.textMuted }],
                      ]}
                    >
                      Age {k.age} · {k.assignedClassName || 'Sunday School'}
                    </Text>
                  </View>
                  {isSelected && (
                    <View style={styles.childChipActiveBadge}>
                      <Check size={11} color="#000000" strokeWidth={3} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Child Dropdown Menu (If opened from header chevron) */}
      {showChildPicker && children.length > 1 && (
        <View style={[styles.dropdownPicker, { backgroundColor: theme.dropdownBg, borderColor: theme.border }]}>
          <Text style={[styles.dropdownHeader, { color: theme.textMuted }]}>SWITCH CHILD PROFILE:</Text>
          {children.map((k, idx) => (
            <TouchableOpacity
              key={k.id}
              style={[
                styles.dropdownItem,
                idx === selectedChildIndex && [styles.dropdownItemActive, { backgroundColor: theme.goldBg }],
              ]}
              onPress={() => {
                setSelectedChildIndex(idx);
                setShowChildPicker(false);
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {k.photoUrl ? (
                  <Image
                    source={{ uri: k.photoUrl }}
                    style={{ width: 22, height: 22, borderRadius: 11 }}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={{ fontSize: 14 }}>{k.gender === 'female' ? '👧' : '🧒'}</Text>
                )}
                <Text
                  style={[
                    styles.dropdownItemText,
                    { color: theme.textSecondary, flex: 1 },
                    idx === selectedChildIndex && [styles.dropdownItemTextActive, { color: theme.goldAccent }],
                  ]}
                >
                  {k.fullName} · Age {k.age} ({k.assignedClassName || 'Class'})
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── TABS NAVIGATION (RHEMA PILLS - HORIZONTAL SCROLL FOR FULL VISIBILITY) ── */}
      <View style={[styles.tabsContainer, { backgroundColor: theme.tabBarBg, borderBottomColor: theme.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          <TouchableOpacity
            style={[
              styles.tabPill,
              { backgroundColor: theme.tabPillInactiveBg, borderColor: theme.tabPillInactiveBorder },
              activeTab === 'home' && { backgroundColor: theme.tabPillActiveBg, borderColor: theme.tabPillActiveBorder },
            ]}
            onPress={() => setActiveTab('home')}
          >
            <Text
              style={[
                styles.tabText,
                { color: theme.tabPillInactiveText },
                activeTab === 'home' && { color: theme.tabPillActiveText, fontWeight: '800' },
              ]}
            >
              Home
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabPill,
              { backgroundColor: theme.tabPillInactiveBg, borderColor: theme.tabPillInactiveBorder },
              activeTab === 'classroom' && { backgroundColor: theme.tabPillActiveBg, borderColor: theme.tabPillActiveBorder },
            ]}
            onPress={() => setActiveTab('classroom')}
          >
            <Text
              style={[
                styles.tabText,
                { color: theme.tabPillInactiveText },
                activeTab === 'classroom' && { color: theme.tabPillActiveText, fontWeight: '800' },
              ]}
            >
              Sunday School
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.tabPill,
              { backgroundColor: theme.tabPillInactiveBg, borderColor: theme.tabPillInactiveBorder },
              activeTab === 'lms' && { backgroundColor: theme.tabPillActiveBg, borderColor: theme.tabPillActiveBorder },
            ]}
            onPress={() => setActiveTab('lms')}
          >
            <Text
              style={[
                styles.tabText,
                { color: theme.tabPillInactiveText },
                activeTab === 'lms' && { color: theme.tabPillActiveText, fontWeight: '800' },
              ]}
            >
              Bible LMS
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── MAIN BODY CONTENT ── */}
      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={theme.goldAccent} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading Rhema Kids...</Text>
        </View>
      ) : children.length === 0 ? (
        /* Empty State: No child enrolled yet */
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconBox, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
            <Text style={{ fontSize: 36 }}>👶</Text>
          </View>
          <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Welcome to Rhema Kids!</Text>
          <Text style={[styles.emptySub, { color: theme.textSecondary }]}>
            Register your children to access secure Sunday School attendance, live entrance face scan, and bilingual Bible learning.
          </Text>

          <TouchableOpacity
            style={[styles.enrollNowBtn, { backgroundColor: theme.addKidBtnBg }]}
            onPress={() => setShowEnrollModal(true)}
            activeOpacity={0.88}
          >
            <Plus size={18} color={theme.addKidBtnText} strokeWidth={2.8} />
            <Text style={[styles.enrollNowBtnText, { color: theme.addKidBtnText }]}>Enroll Child in Sunday School</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* ==================================================== */}
          {/* TAB 1: HOME DASHBOARD                                */}
          {/* ==================================================== */}
          {activeTab === 'home' && (
            <>
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
                      borderRadius: 10,
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
                </View>
              )}

              {/* Today's Sunday School Status Card */}
              <View style={[styles.heroStatusCard, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
                <View style={styles.statusRow}>
                  <View style={styles.liveBadge}>
                    <View style={styles.livePulseDot} />
                    <Text style={styles.liveBadgeText}>SUNDAY SCHOOL TODAY</Text>
                  </View>
                  <Text style={[styles.codeLabel, { color: theme.textSecondary }]}>{activeChild?.childId}</Text>
                </View>

                <View style={styles.statusDetailsRow}>
                  {activeChild?.photoUrl ? (
                    <Image
                      source={{ uri: activeChild.photoUrl }}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 24,
                        marginRight: 12,
                        borderWidth: 1.5,
                        borderColor: theme.goldAccent,
                      }}
                      resizeMode="cover"
                    />
                  ) : null}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.classTierSub, { color: theme.goldAccent }]}>
                      {activeChild?.assignedClassName || 'Sunday School'}
                    </Text>
                    <Text style={[styles.classRoomTitle, { color: theme.textPrimary }]}>
                      {assignedClass?.roomNumber || 'Room 204 · 2nd Floor'}
                    </Text>
                    <Text style={[styles.scheduleMeta, { color: theme.textSecondary }]}>
                      {assignedClass?.schedule?.dayOfWeek || 'Sunday'}s{' '}
                      {assignedClass?.schedule?.startTime || '09:30 AM'} –{' '}
                      {assignedClass?.schedule?.endTime || '11:30 AM'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
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
                    onPress={() => setActiveTab('classroom')}
                    style={styles.viewPassLink}
                  >
                    <Text style={[styles.viewPassLinkText, { color: theme.goldAccent }]}>Class Info &rsaquo;</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Dynamic Sunday Bible Lesson & Memory Verse Card */}
              {(() => {
                const { lesson: activeLesson, mode: activeMode, activeDate } = resolveActiveCurriculumLesson({
                  config: curriculumConfig,
                  lessons: curriculum,
                });
                const verseEn = activeLesson?.memoryVerse?.verseEnglish || "In the beginning God created the heavens and the earth.";
                const verseTe = activeLesson?.memoryVerse?.verseTelugu || "ఆదియందు దేవుడు భూమ్యాకాశములను సృజించెను.";
                const verseRef = activeLesson?.memoryVerse?.reference || "Genesis 1:1";
                const lessonTitle = activeLesson?.title || "In the Beginning: God Created All Things";
                const headerTag =
                  activeMode === 'custom'
                    ? activeDate
                      ? `⭐ ${formatCurriculumDateDisplay(activeDate).toUpperCase()} LESSON`
                      : '⭐ THIS SUNDAY LESSON'
                    : activeDate
                    ? `⭐ WEEK ${activeLesson?.weekNumber || 1} · ${formatCurriculumDateDisplay(activeDate).toUpperCase()}`
                    : `⭐ WEEK ${activeLesson?.weekNumber || 1} SUNDAY LESSON`;

                return (
                  <TouchableOpacity
                    style={[styles.card, { backgroundColor: theme.cardBg, borderColor: theme.goldAccent, borderWidth: 1 }]}
                    onPress={() => {
                      if (activeLesson) {
                        setSelectedLessonDate(activeDate);
                        setSelectedLessonForModal(activeLesson);
                      }
                    }}
                    activeOpacity={0.88}
                  >
                    <View style={styles.cardHeaderSmall}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 6 }}>
                        <Text style={[styles.cardHeaderTag, { color: theme.goldAccent }]} numberOfLines={1}>
                          {headerTag}
                        </Text>
                        <View style={{ backgroundColor: theme.goldBg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: theme.goldAccent }}>TAP DETAILS &rsaquo;</Text>
                        </View>
                      </View>
                      <Text style={[styles.verseRef, { color: theme.textSecondary }]}>{verseRef}</Text>
                    </View>

                    <Text style={{ fontSize: 15, fontWeight: 'bold', color: theme.textPrimary, marginTop: 2, marginBottom: 4 }}>
                      {lessonTitle}
                    </Text>

                    {!!verseTe && (
                      <Text style={[styles.verseTelugu, { color: theme.textPrimary }]}>
                        "{verseTe}"
                      </Text>
                    )}
                    <Text style={[styles.verseEnglish, { color: theme.textSecondary }]}>
                      "{verseEn}"
                    </Text>
                  </TouchableOpacity>
                );
              })()}

              {/* Quick Modules 2x2 Grid */}
              <View>
                <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>EXPLORE RHEMA KIDS</Text>
                <View style={styles.grid2x2}>
                  <TouchableOpacity
                    style={[styles.gridItem, { backgroundColor: theme.cardBg, borderColor: theme.border }]}
                    onPress={() => setExploreCategory('stories')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.gridEmoji}>📖</Text>
                    <Text style={[styles.gridTitle, { color: theme.textPrimary }]}>Bible Stories</Text>
                    <Text style={[styles.gridSub, { color: theme.textSecondary }]}>Illustrated & Telugu Audio</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.gridItem, { backgroundColor: theme.cardBg, borderColor: theme.border }]}
                    onPress={() => setExploreCategory('quizzes')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.gridEmoji}>🏆</Text>
                    <Text style={[styles.gridTitle, { color: theme.textPrimary }]}>Kids Quizzes</Text>
                    <Text style={[styles.gridSub, { color: theme.textSecondary }]}>Earn Bible Star Badges</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.gridItem, { backgroundColor: theme.cardBg, borderColor: theme.border }]}
                    onPress={() => setExploreCategory('lessons')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.gridEmoji}>📚</Text>
                    <Text style={[styles.gridTitle, { color: theme.textPrimary }]}>Weekly Lessons</Text>
                    <Text style={[styles.gridSub, { color: theme.textSecondary }]}>Telugu & English Guides</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.gridItem, { backgroundColor: theme.cardBg, borderColor: theme.border }]}
                    onPress={() => setExploreCategory('songs')}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.gridEmoji}>🎵</Text>
                    <Text style={[styles.gridTitle, { color: theme.textPrimary }]}>Action Songs</Text>
                    <Text style={[styles.gridSub, { color: theme.textSecondary }]}>Worship with Lyrics</Text>
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

          {/* ==================================================== */}
          {/* TAB 3: BIBLE LMS (QUIZZES, STORIES & WORSHIP)        */}
          {/* ==================================================== */}
          {activeTab === 'lms' && (
            <>
              {/* Featured Bible Quiz Card */}
              {quizzes.length > 0 && (
                <View style={[styles.quizCard, { backgroundColor: theme.goldBg, borderColor: theme.goldAccent }]}>
                  <View style={styles.quizHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.quizHeaderTag, { color: theme.goldAccent }]}>BIBLE CHALLENGE OF THE WEEK</Text>
                      <Text style={[styles.quizTitle, { color: theme.textPrimary }]}>{quizzes[0].title}</Text>
                      <Text style={[styles.quizTeluguSub, { color: theme.textSecondary }]}>{quizzes[0].titleTelugu} · {quizzes[0].scriptureRef}</Text>
                    </View>
                    <Text style={{ fontSize: 32 }}>{quizzes[0].coverEmoji || '🏆'}</Text>
                  </View>

                  <View style={styles.quizRewardBadgeRow}>
                    <View style={[styles.quizPointsPill, { backgroundColor: theme.goldBg }]}>
                      <Text style={[styles.quizPointsText, { color: theme.goldAccent }]}>★ +{quizzes[0].pointsReward} Star Points</Text>
                    </View>
                    <View style={[styles.quizBadgePill, { backgroundColor: theme.cardBg, borderColor: theme.border, borderWidth: 1 }]}>
                      <Text style={[styles.quizBadgePillText, { color: theme.textPrimary }]}>{quizzes[0].badgeReward}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={[styles.startQuizBtn, { backgroundColor: theme.goldAccent }]}
                    onPress={() => setSelectedQuizForPlayer(quizzes[0])}
                    activeOpacity={0.88}
                  >
                    <Award size={16} color="#FFFFFF" />
                    <Text style={[styles.startQuizBtnText, { color: '#FFFFFF' }]}>Start Interactive Quiz &rsaquo;</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Illustrated Bilingual Bible Stories */}
              <View style={{ marginTop: 8 }}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>ILLUSTRATED BIBLE STORIES</Text>
                  <Text style={[styles.sectionHeaderSub, { color: theme.goldAccent }]}>Telugu & English</Text>
                </View>

                {stories.map(s => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.storyCard, { backgroundColor: theme.cardBg, borderColor: theme.border }]}
                    onPress={() => setSelectedStoryForReader(s)}
                    activeOpacity={0.88}
                  >
                    <View style={[styles.storyEmojiBubble, { backgroundColor: theme.innerCardBg, borderColor: theme.border }]}>
                      {s.coverImageUrl ? (
                        <Image source={{ uri: s.coverImageUrl }} style={styles.storyCoverImg} />
                      ) : (
                        <Text style={{ fontSize: 26 }}>{s.coverEmoji || '📖'}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.storyTitle, { color: theme.textPrimary }]}>{s.title}</Text>
                      <Text style={[styles.storyTeluguText, { color: theme.textPrimary }]}>{s.titleTelugu}</Text>
                      <Text style={[styles.storyMeta, { color: theme.textSecondary }]}>
                        {s.scriptureRef ? `${s.scriptureRef} · ` : ''}{s.readTime || '5 min'} · {s.pages?.length || 1} Pages
                      </Text>
                    </View>
                    <View style={styles.cardActionsRow}>
                      <View style={[styles.storyReadPill, { backgroundColor: theme.goldBg }]}>
                        <Text style={[styles.storyReadPillText, { color: theme.goldAccent }]}>Read &rsaquo;</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.itemDeleteBtn}
                        onPress={() => handleDeleteStory(s.id, s.title)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Trash2 size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Action Worship Songs Playlist */}
              <View style={{ marginTop: 14 }}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>KIDS ACTION WORSHIP SONGS</Text>
                  <Text style={[styles.sectionHeaderSub, { color: theme.goldAccent }]}>Video & Lyrics</Text>
                </View>

                {songs.map(song => (
                  <TouchableOpacity
                    key={song.id}
                    style={[styles.songListCard, { backgroundColor: theme.cardBg, borderColor: theme.border }]}
                    onPress={() => setSelectedSongForPlayer(song)}
                    activeOpacity={0.88}
                  >
                    <View style={[styles.songEmojiBubble, { backgroundColor: theme.innerCardBg, borderColor: theme.border }]}>
                      {song.thumbnailUrl ? (
                        <Image source={{ uri: song.thumbnailUrl }} style={styles.storyCoverImg} />
                      ) : (
                        <Text style={{ fontSize: 24 }}>{song.coverEmoji || '🎵'}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.songTitle, { color: theme.textPrimary }]}>{song.title}</Text>
                      <Text style={[styles.songTeluguSub, { color: theme.textSecondary }]}>{song.titleTelugu}</Text>
                      <Text style={[styles.songDurationMeta, { color: theme.textSecondary }]}>Duration: {song.duration || '3:00'} · Action Dance</Text>
                    </View>
                    <View style={styles.cardActionsRow}>
                      <View style={[styles.songPlayBtn, { backgroundColor: theme.innerCardBg }]}>
                        <Volume2 size={14} color={theme.goldAccent} />
                      </View>
                      <TouchableOpacity
                        style={styles.itemDeleteBtn}
                        onPress={() => handleDeleteSong(song.id, song.title)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Trash2 size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </>
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
});
