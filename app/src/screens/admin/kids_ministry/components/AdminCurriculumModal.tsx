import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
  Alert,
  Platform,
  StatusBar,
  TextInput,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Sparkles,
  Calendar,
  BookOpen,
  CheckCircle2,
  Clock,
  Share2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Plus,
  Edit3,
  Trash2,
  Save,
  Award,
  Music,
  Check,
  Layers,
} from 'lucide-react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import {
  KidsCurriculumLesson,
  CurriculumQuarter,
  CurriculumMode,
  KidsClassTier,
  KidsCurriculumConfig,
  KidsBibleStory,
  KidsQuiz,
  KidsWorshipSong,
  calculateCurriculumWeek,
  getCurriculumWeekDate,
  getNextSundayDateString,
  formatCurriculumDateDisplay,
  splitCurriculumLessons,
  toIsoDateString,
} from '../../../../types/KidsMinistryTypes';
import KidsMinistryService from '../../../../services/KidsMinistryService';
import { useAdminTheme } from '../../../../utils/adminThemeHelper';
import BibleReferencePickerModal, { BiblePickerResult } from '../../quiz/BibleReferencePickerModal';

interface Props {
  visible: boolean;
  curriculum: KidsCurriculumLesson[];
  churchId: string;
  stories?: KidsBibleStory[];
  quizzes?: KidsQuiz[];
  songs?: KidsWorshipSong[];
  onClose: () => void;
}

const QUARTERS: Array<{ id: 'ALL' | CurriculumQuarter; label: string; sub: string }> = [
  { id: 'ALL', label: 'All 52 Weeks', sub: 'Full Year' },
  { id: 'Q1', label: 'Q1: Weeks 1-13', sub: 'Foundations of Faith' },
  { id: 'Q2', label: 'Q2: Weeks 14-26', sub: 'Wisdom & Prophets' },
  { id: 'Q3', label: 'Q3: Weeks 27-39', sub: 'Life & Ministry of Jesus' },
  { id: 'Q4', label: 'Q4: Weeks 40-52', sub: 'Resurrection & Armor of God' },
];

const TIER_DEFS: Array<{ id: KidsClassTier; label: string; defaultTitle: string; focusAge: string }> = [
  { id: 'nursery', label: 'Nursery (1-3)', defaultTitle: 'Nursery Angels (Ages 0-2)', focusAge: '0-2 years' },
  { id: 'beginners', label: 'Beginners (4-5)', defaultTitle: 'Beginners Kingdom (Ages 3-5)', focusAge: '3-5 years' },
  { id: 'primary', label: 'Primary (6-8)', defaultTitle: 'Primary Stars (Ages 6-8)', focusAge: '6-8 years' },
  { id: 'junior', label: 'Junior (9-11)', defaultTitle: 'Junior Champions (Ages 9-11)', focusAge: '9-11 years' },
  { id: 'teens', label: 'Teens (12-14)', defaultTitle: 'Teens for Christ (Ages 12-14)', focusAge: '12-14 years' },
];

function buildDefaultTierGuides(titleEn: string, titleTe: string) {
  return {
    nursery: {
      tier: 'nursery' as KidsClassTier,
      tierName: 'Nursery Angels (Ages 0-2)',
      focusAge: '0-2 years',
      objective: titleEn,
      objectiveTelugu: titleTe,
      activityName: 'Sensory Play & Song',
      activityInstructions: 'Simple coloring & clapping worship song.',
      activityInstructionsTelugu: 'రంగులు వేయుట మరియు పాటలు పాడుట.',
      discussionQuestions: ['Who loves you? Jesus loves me!'],
    },
    beginners: {
      tier: 'beginners' as KidsClassTier,
      tierName: 'Beginners Kingdom (Ages 3-5)',
      focusAge: '3-5 years',
      objective: titleEn,
      objectiveTelugu: titleTe,
      activityName: 'Story Drama & Craft',
      activityInstructions: 'Act out the Bible story together with picture cards.',
      activityInstructionsTelugu: 'కథను నటించి బొమ్మలకు రంగులు వేయుట.',
      discussionQuestions: ['What did God do in our story today?'],
    },
    primary: {
      tier: 'primary' as KidsClassTier,
      tierName: 'Primary Stars (Ages 6-8)',
      focusAge: '6-8 years',
      objective: titleEn,
      objectiveTelugu: titleTe,
      activityName: 'Memory Verse Drill',
      activityInstructions: 'Recite the memory verse with hand motions and activity sheet.',
      activityInstructionsTelugu: 'కంఠస్థ వాక్యమును అభినయముతో నేర్చుకొనుట.',
      discussionQuestions: ['How can we obey God this week at home?'],
    },
    junior: {
      tier: 'junior' as KidsClassTier,
      tierName: 'Junior Champions (Ages 9-11)',
      focusAge: '9-11 years',
      objective: titleEn,
      objectiveTelugu: titleTe,
      activityName: 'Bible Sword Drill & Trivia',
      activityInstructions: 'Look up the passage in Bibles and discuss key application points.',
      activityInstructionsTelugu: 'బైబిల్‌లో వాక్యమును వెతికి చర్చించుట.',
      discussionQuestions: ['How does this truth help you at school with friends?'],
    },
    teens: {
      tier: 'teens' as KidsClassTier,
      tierName: 'Teens for Christ (Ages 12-14)',
      focusAge: '12-14 years',
      objective: titleEn,
      objectiveTelugu: titleTe,
      activityName: 'Apologetics & Journaling',
      activityInstructions: 'Small group discussion and personal faith commitment journaling.',
      activityInstructionsTelugu: 'చిన్న బృంద చర్చ మరియు వ్యక్తిగత తీర్మానము.',
      discussionQuestions: ['How can we live out this scripture in our daily decisions?'],
    },
  };
}

export default function AdminCurriculumModal({
  visible,
  curriculum,
  churchId,
  stories: propStories,
  quizzes: propQuizzes,
  songs: propSongs,
  onClose,
}: Props) {
  const {
    isDark,
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor,
    barStyle,
  } = useAdminTheme();

  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 44) + 6;

  // Config & View Mode State
  const [curriculumConfig, setCurriculumConfig] = useState<KidsCurriculumConfig | null>(null);
  const [activeViewTab, setActiveViewTab] = useState<CurriculumMode>('52_week');
  const [hasInitializedTab, setHasInitializedTab] = useState(false);
  const [loadingCurriculum, setLoadingCurriculum] = useState(true);
  const [biblePickerTarget, setBiblePickerTarget] = useState<null | 'lesson_scripture' | 'memory_verse'>(null);

  // CMS Content State (for linking stories, quizzes, songs)
  const [localStories, setLocalStories] = useState<KidsBibleStory[]>([]);
  const [localQuizzes, setLocalQuizzes] = useState<KidsQuiz[]>([]);
  const [localSongs, setLocalSongs] = useState<KidsWorshipSong[]>([]);

  const stories = propStories && propStories.length > 0 ? propStories : localStories;
  const quizzes = propQuizzes && propQuizzes.length > 0 ? propQuizzes : localQuizzes;
  const songs = propSongs && propSongs.length > 0 ? propSongs : localSongs;

  // 52-Week Browser State
  const [selectedQuarter, setSelectedQuarter] = useState<'ALL' | CurriculumQuarter>('ALL');
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [selectedTierTab, setSelectedTierTab] = useState<KidsClassTier>('primary');
  const [updatingLessonId, setUpdatingLessonId] = useState<string | null>(null);

  // Date Pickers
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showCustomDatePicker, setShowCustomDatePicker] = useState(false);

  // Lesson Editor Modal State (shared cleanly for both 52-week and custom lessons)
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editorMode, setEditorMode] = useState<CurriculumMode>('52_week');
  const [editingLesson, setEditingLesson] = useState<KidsCurriculumLesson | null>(null);

  const [editWeekNumber, setEditWeekNumber] = useState('1');
  const [editQuarter, setEditQuarter] = useState<CurriculumQuarter>('Q1');
  const [editScheduledDate, setEditScheduledDate] = useState(getNextSundayDateString());
  const [editTitleEn, setEditTitleEn] = useState('');
  const [editTitleTe, setEditTitleTe] = useState('');
  const [editScriptureEn, setEditScriptureEn] = useState('');
  const [editScriptureTe, setEditScriptureTe] = useState('');
  const [editBigIdeaEn, setEditBigIdeaEn] = useState('');
  const [editBigIdeaTe, setEditBigIdeaTe] = useState('');
  const [editVerseRef, setEditVerseRef] = useState('');
  const [editVerseEn, setEditVerseEn] = useState('');
  const [editVerseTe, setEditVerseTe] = useState('');

  // Linked CMS Materials & Activities
  const [editStoryId, setEditStoryId] = useState<string>('');
  const [editQuizId, setEditQuizId] = useState<string>('');
  const [editSongId, setEditSongId] = useState<string>('');
  const [editCustomStorySummary, setEditCustomStorySummary] = useState('');
  const [editCustomActivityNotes, setEditCustomActivityNotes] = useState('');
  const [editSuppliesText, setEditSuppliesText] = useState('Bible, Activity Sheets, Color Pencils');
  const [editPrayerFocusEn, setEditPrayerFocusEn] = useState('');
  const [editorTierTab, setEditorTierTab] = useState<KidsClassTier>('primary');
  const [editTierGuides, setEditTierGuides] = useState<KidsCurriculumLesson['tierGuides']>(() =>
    buildDefaultTierGuides('', '')
  );
  const [savingLesson, setSavingLesson] = useState(false);

  // Subscribe to Curriculum Config & Manage Loading Indicator
  useEffect(() => {
    if (!visible) {
      setHasInitializedTab(false);
      setLoadingCurriculum(true);
      return;
    }

    setLoadingCurriculum(true);
    let mounted = true;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;

    const ensureLoaded = async () => {
      try {
        if (curriculum.length === 0) {
          await KidsMinistryService.getOrInitCurriculum(churchId);
        }
      } catch {
        // Realtime listener will update if offline cache exists
      } finally {
        readyTimer = setTimeout(() => {
          if (mounted) setLoadingCurriculum(false);
        }, 180);
      }
    };

    const unsub = KidsMinistryService.subscribeToCurriculumConfig(churchId, cfg => {
      if (!mounted) return;
      setCurriculumConfig(cfg);
      if (!hasInitializedTab) {
        const initialMode: CurriculumMode =
          cfg.is52WeekEnabled === false || cfg.mode === 'custom' ? 'custom' : '52_week';
        setActiveViewTab(initialMode);
        setHasInitializedTab(true);
      }
    });

    ensureLoaded();

    return () => {
      mounted = false;
      if (readyTimer) clearTimeout(readyTimer);
      unsub();
    };
  }, [visible, churchId]);

  // Fallback subscriptions if stories/quizzes/songs not passed as props
  useEffect(() => {
    if (!visible) return;
    const unsubs: Array<() => void> = [];
    if (!propStories) {
      unsubs.push(KidsMinistryService.subscribeToStories(churchId, setLocalStories));
    }
    if (!propQuizzes) {
      unsubs.push(KidsMinistryService.subscribeToQuizzes(churchId, setLocalQuizzes));
    }
    if (!propSongs) {
      unsubs.push(KidsMinistryService.subscribeToSongs(churchId, setLocalSongs));
    }
    return () => unsubs.forEach(u => u());
  }, [visible, churchId, propStories, propQuizzes, propSongs]);

  const { fiftyTwoWeekLessons, customLessons } = useMemo(
    () => splitCurriculumLessons(curriculum),
    [curriculum]
  );

  const is52WeekEnabled =
    curriculumConfig?.is52WeekEnabled !== undefined
      ? curriculumConfig.is52WeekEnabled
      : curriculumConfig?.mode !== 'custom';

  const currentActiveWeek = calculateCurriculumWeek(curriculumConfig);
  const todayIso = toIsoDateString(new Date());

  // Handlers: Toggle 52-Week Curriculum Plan ON/OFF
  const handleToggle52WeekPlan = async (enable: boolean) => {
    if (enable) {
      const existingDate = curriculumConfig?.officialLaunchDate;
      const nextSunday = getNextSundayDateString();

      if (existingDate) {
        Alert.alert(
          'Enable 52-Week Curriculum Plan',
          `Your confirmed curriculum start date is ${formatCurriculumDateDisplay(existingDate)}. All 52 weekly dates are automatically calculated from this date.\n\nWould you like to keep this start date or choose a new one?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Change Start Date',
              onPress: async () => {
                await KidsMinistryService.setCurriculumModeConfig(churchId, {
                  is52WeekEnabled: true,
                  mode: '52_week',
                });
                setActiveViewTab('52_week');
                setShowStartDatePicker(true);
              },
            },
            {
              text: 'Confirm & Enable',
              onPress: async () => {
                await KidsMinistryService.setCurriculumModeConfig(churchId, {
                  is52WeekEnabled: true,
                  mode: '52_week',
                  isLaunched: true,
                });
                setActiveViewTab('52_week');
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'Confirm Curriculum Start Date',
          `To enable the 52-Week Curriculum Plan, please confirm the start date for Week 1. All 52 weekly Sunday dates will be calculated automatically.\n\nSuggested Next Sunday: ${formatCurriculumDateDisplay(nextSunday)}`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Pick Start Date',
              onPress: () => setShowStartDatePicker(true),
            },
            {
              text: `Start ${formatCurriculumDateDisplay(nextSunday)}`,
              onPress: async () => {
                await KidsMinistryService.setCurriculumLaunchDate(churchId, nextSunday);
                setActiveViewTab('52_week');
              },
            },
          ]
        );
      }
    } else {
      Alert.alert(
        'Disable 52-Week Curriculum?',
        'This will switch Rhema Sunday School to Custom Weekly Curriculum mode so you can select your own dates and create independent weekly lessons.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Use Custom Curriculum',
            onPress: async () => {
              try {
                await KidsMinistryService.setCurriculumModeConfig(churchId, {
                  is52WeekEnabled: false,
                  mode: 'custom',
                });
                setActiveViewTab('custom');
              } catch (e: any) {
                Alert.alert('Error', e.message || 'Could not switch mode');
              }
            },
          },
        ]
      );
    }
  };

  const handleConfirmStartDate = async (date: Date) => {
    setShowStartDatePicker(false);
    const dateStr = toIsoDateString(date);
    const week52EndDate = getCurriculumWeekDate(dateStr, 52);

    try {
      await KidsMinistryService.setCurriculumLaunchDate(churchId, dateStr);
      setActiveViewTab('52_week');
      Alert.alert(
        '52-Week Start Date Confirmed!',
        `Week 1 starts on ${formatCurriculumDateDisplay(dateStr)} and Week 52 concludes on ${formatCurriculumDateDisplay(week52EndDate)}.\n\nAll 52 weekly lesson dates are now calculated automatically.`
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not set start date');
    }
  };

  const handleResetLaunchDate = () => {
    Alert.alert(
      'Reset Start Date?',
      'This will put the 52-Week Curriculum back into Pending Start Date standby (Week 1).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset to Standby',
          style: 'destructive',
          onPress: async () => {
            try {
              await KidsMinistryService.resetCurriculumLaunchDate(churchId);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const handleOpenCreate = (targetMode?: CurriculumMode) => {
    const modeToUse = targetMode || activeViewTab;
    setEditorMode(modeToUse);
    setEditingLesson(null);

    if (modeToUse === 'custom') {
      const nextIndex = customLessons.length + 1;
      setEditWeekNumber(String(nextIndex));
      setEditQuarter('Q1');
      setEditScheduledDate(getNextSundayDateString());
    } else {
      const nextWeek = fiftyTwoWeekLessons.length + 1;
      setEditWeekNumber(String(nextWeek));
      setEditQuarter(nextWeek <= 13 ? 'Q1' : nextWeek <= 26 ? 'Q2' : nextWeek <= 39 ? 'Q3' : 'Q4');
      setEditScheduledDate(
        curriculumConfig?.officialLaunchDate
          ? getCurriculumWeekDate(curriculumConfig.officialLaunchDate, nextWeek) || getNextSundayDateString()
          : getNextSundayDateString()
      );
    }

    setEditTitleEn('');
    setEditTitleTe('');
    setEditScriptureEn('');
    setEditScriptureTe('');
    setEditBigIdeaEn('');
    setEditBigIdeaTe('');
    setEditVerseRef('');
    setEditVerseEn('');
    setEditVerseTe('');
    setEditStoryId('');
    setEditQuizId('');
    setEditSongId('');
    setEditCustomStorySummary('');
    setEditCustomActivityNotes('');
    setEditSuppliesText('Bible, Activity Sheets, Color Pencils');
    setEditPrayerFocusEn('');
    setEditorTierTab('primary');
    setEditTierGuides(buildDefaultTierGuides('', ''));
    setShowEditorModal(true);
  };

  const handleOpenEdit = (lesson: KidsCurriculumLesson) => {
    const modeToUse: CurriculumMode = lesson.type === 'custom' ? 'custom' : '52_week';
    setEditorMode(modeToUse);
    setEditingLesson(lesson);
    setEditWeekNumber(String(lesson.weekNumber || 1));
    setEditQuarter(lesson.quarter || 'Q1');
    setEditScheduledDate(
      lesson.scheduledDate ||
        (modeToUse === '52_week' && curriculumConfig?.officialLaunchDate
          ? getCurriculumWeekDate(curriculumConfig.officialLaunchDate, lesson.weekNumber) || getNextSundayDateString()
          : getNextSundayDateString())
    );
    setEditTitleEn(lesson.title || '');
    setEditTitleTe(lesson.titleTelugu || '');
    setEditScriptureEn(lesson.scriptureRef || '');
    setEditScriptureTe(lesson.scriptureRefTelugu || '');
    setEditBigIdeaEn(lesson.bigIdea || '');
    setEditBigIdeaTe(lesson.bigIdeaTelugu || '');
    setEditVerseRef(lesson.memoryVerse?.reference || '');
    setEditVerseEn(lesson.memoryVerse?.verseEnglish || '');
    setEditVerseTe(lesson.memoryVerse?.verseTelugu || '');
    setEditStoryId(lesson.storyId || '');
    setEditQuizId(lesson.quizId || '');
    setEditSongId(lesson.songId || '');
    setEditCustomStorySummary(lesson.customStorySummary || '');
    setEditCustomActivityNotes(lesson.customActivityNotes || '');
    setEditSuppliesText(
      lesson.teacherPrep?.suppliesNeeded?.length
        ? lesson.teacherPrep.suppliesNeeded.join(', ')
        : 'Bible, Activity Sheets, Color Pencils'
    );
    setEditPrayerFocusEn(lesson.teacherPrep?.prayerFocus || '');
    setEditorTierTab('primary');
    setEditTierGuides(
      lesson.tierGuides
        ? JSON.parse(JSON.stringify(lesson.tierGuides))
        : buildDefaultTierGuides(lesson.title || '', lesson.titleTelugu || '')
    );
    setShowEditorModal(true);
  };

  const updateCurrentTierField = (
    field: 'objective' | 'activityName' | 'activityInstructions' | 'activityInstructionsTelugu' | 'discussionQuestionsText',
    value: string
  ) => {
    setEditTierGuides(prev => {
      const current = prev[editorTierTab];
      const updated = { ...current };
      if (field === 'discussionQuestionsText') {
        updated.discussionQuestions = value
          .split('\n')
          .map(s => s.trim())
          .filter(Boolean);
      } else {
        (updated as any)[field] = value;
      }
      return {
        ...prev,
        [editorTierTab]: updated,
      };
    });
  };

  const handleSaveLesson = async () => {
    if (!editTitleEn.trim()) {
      Alert.alert('Missing Field', 'Please enter a lesson title.');
      return;
    }

    try {
      setSavingLesson(true);
      const weekNum = parseInt(editWeekNumber, 10) || 1;
      const supplies = editSuppliesText
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const finalTitleEn = editTitleEn.trim();
      const finalTitleTe = editTitleTe.trim() || finalTitleEn;

      // Ensure tier guides have fallback objectives filled if left blank
      const mergedTierGuides = { ...editTierGuides };
      (['nursery', 'beginners', 'primary', 'junior', 'teens'] as KidsClassTier[]).forEach(tKey => {
        if (!mergedTierGuides[tKey].objective) {
          mergedTierGuides[tKey] = {
            ...mergedTierGuides[tKey],
            objective: finalTitleEn,
            objectiveTelugu: finalTitleTe,
          };
        }
      });

      const lessonPayload: Omit<KidsCurriculumLesson, 'id'> = {
        type: editorMode,
        weekNumber: weekNum,
        scheduledDate: editorMode === 'custom' ? editScheduledDate : undefined,
        quarter: editQuarter,
        quarterTheme:
          editorMode === 'custom'
            ? 'Custom Weekly Schedule'
            : editQuarter === 'Q1'
            ? 'Foundations of Faith'
            : editQuarter === 'Q2'
            ? 'Wisdom & Prophets'
            : editQuarter === 'Q3'
            ? 'Life & Ministry of Jesus'
            : 'Resurrection & Armor of God',
        title: finalTitleEn,
        titleTelugu: finalTitleTe,
        scriptureRef: editScriptureEn.trim() || 'Genesis 1:1',
        scriptureRefTelugu: editScriptureTe.trim() || editScriptureEn.trim(),
        bigIdea: editBigIdeaEn.trim() || 'God is faithful and loves us.',
        bigIdeaTelugu: editBigIdeaTe.trim() || editBigIdeaEn.trim(),
        memoryVerse: {
          reference: editVerseRef.trim() || 'Genesis 1:1',
          referenceTelugu: editVerseRef.trim() || 'ఆదికాండము 1:1',
          verseEnglish: editVerseEn.trim() || '',
          verseTelugu: editVerseTe.trim() || '',
        },
        storyId: editStoryId || undefined,
        quizId: editQuizId || undefined,
        songId: editSongId || undefined,
        customStorySummary: editCustomStorySummary.trim() || undefined,
        customActivityNotes: editCustomActivityNotes.trim() || undefined,
        teacherPrep: {
          prayerFocus:
            editPrayerFocusEn.trim() || `Pray that students understand: "${editBigIdeaEn.trim() || finalTitleEn}"`,
          prayerFocusTelugu:
            editingLesson?.teacherPrep?.prayerFocusTelugu ||
            `పిల్లలు "${editBigIdeaTe.trim() || finalTitleTe}" గ్రహించాలని ప్రార్థించండి.`,
          suppliesNeeded: supplies.length > 0 ? supplies : ['Bible', 'Activity Sheets'],
          schedule: editingLesson?.teacherPrep?.schedule || [
            { timeMinutes: 5, segment: 'Welcome & Prayer', description: 'Open in prayer.' },
            { timeMinutes: 10, segment: 'Praise & Songs', description: 'Action songs.' },
            { timeMinutes: 15, segment: 'Scripture Lesson', description: finalTitleEn },
            { timeMinutes: 10, segment: 'Craft & Activity', description: 'Discussion and craft.' },
            { timeMinutes: 5, segment: 'Memory Verse & Dismissal', description: 'Recite verse.' },
          ],
        },
        tierGuides: mergedTierGuides,
        isCurrentWeek: editingLesson?.isCurrentWeek || false,
        academicYear: '2026-2027',
        createdAt: editingLesson?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (editingLesson) {
        await KidsMinistryService.updateCurriculumLesson(churchId, editingLesson.id, lessonPayload);
        Alert.alert(
          'Lesson Updated!',
          editorMode === 'custom'
            ? `"${finalTitleEn}" (${formatCurriculumDateDisplay(editScheduledDate)}) saved.`
            : `Week ${weekNum}: "${finalTitleEn}" saved successfully.`
        );
      } else {
        await KidsMinistryService.createCurriculumLesson(churchId, lessonPayload);
        Alert.alert(
          'Lesson Created!',
          editorMode === 'custom'
            ? `"${finalTitleEn}" scheduled for ${formatCurriculumDateDisplay(editScheduledDate)}.`
            : `Week ${weekNum}: "${finalTitleEn}" added to 52-Week Curriculum.`
        );
      }

      setShowEditorModal(false);
      setEditingLesson(null);
    } catch (err: any) {
      Alert.alert('Save Failed', err.message || 'Could not save lesson');
    } finally {
      setSavingLesson(false);
    }
  };

  const handleDeleteLesson = (lesson: KidsCurriculumLesson) => {
    const label =
      lesson.type === 'custom'
        ? `"${lesson.title}" (${formatCurriculumDateDisplay(lesson.scheduledDate)})`
        : `Week ${lesson.weekNumber}: "${lesson.title}"`;
    Alert.alert('Delete Lesson?', `Are you sure you want to remove ${label} from the curriculum?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await KidsMinistryService.deleteCurriculumLesson(churchId, lesson.id);
            Alert.alert('Deleted', `${label} removed.`);
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  const handleSetActiveWeek = async (lesson: KidsCurriculumLesson) => {
    try {
      setUpdatingLessonId(lesson.id);
      if (lesson.type === 'custom') {
        await KidsMinistryService.setActiveCustomLesson(churchId, lesson.id);
        Alert.alert(
          'Active Custom Lesson Updated',
          `"${lesson.title}" (${formatCurriculumDateDisplay(lesson.scheduledDate)}) is now active across classrooms and the member app!`
        );
      } else {
        await KidsMinistryService.setCurrentActiveWeek(churchId, lesson.weekNumber);
        Alert.alert(
          'Active Lesson Updated',
          `Week ${lesson.weekNumber} is now set as the active lesson across all Sunday School classrooms and member apps!`
        );
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not set active lesson');
    } finally {
      setUpdatingLessonId(null);
    }
  };

  const handleShareToTeachers = async (lesson: KidsCurriculumLesson, calculatedDate?: string | null) => {
    try {
      const scheduleText = (lesson.teacherPrep?.schedule || [])
        .map(s => `• ${s.timeMinutes}m - ${s.segment}: ${s.description}`)
        .join('\n');

      const dateLabel = calculatedDate
        ? ` (${formatCurriculumDateDisplay(calculatedDate)})`
        : lesson.scheduledDate
        ? ` (${formatCurriculumDateDisplay(lesson.scheduledDate)})`
        : '';

      const headerLine =
        lesson.type === 'custom'
          ? `*CUSTOM LESSON${dateLabel}*: ${lesson.title}`
          : `*WEEK ${lesson.weekNumber}${dateLabel}*: ${lesson.title}`;

      const message =
        `📖 *RHEMA SUNDAY SCHOOL CURRICULUM*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `${headerLine}\n` +
        `*తెలుగు*: ${lesson.titleTelugu}\n` +
        `*Scripture*: ${lesson.scriptureRef} (${lesson.scriptureRefTelugu})\n\n` +
        `🎯 *BIG IDEA / ప్రధాన సత్యం*:\n${lesson.bigIdea}\n${lesson.bigIdeaTelugu}\n\n` +
        `✨ *MEMORY VERSE / కంఠస్థ వాక్యము*:\n` +
        `"${lesson.memoryVerse.verseEnglish}" — ${lesson.memoryVerse.reference}\n` +
        `"${lesson.memoryVerse.verseTelugu}" — ${lesson.memoryVerse.referenceTelugu}\n\n` +
        `🙏 *TEACHER PRAYER FOCUS*:\n${lesson.teacherPrep?.prayerFocus || ''}\n\n` +
        `📦 *SUPPLIES NEEDED*:\n${(lesson.teacherPrep?.suppliesNeeded || []).join(', ')}\n\n` +
        `⏰ *CLASSROOM SCHEDULE*:\n${scheduleText}\n\n` +
        `_Rhema Kids Ministry · Mark 10:14_`;

      await Share.share({
        message,
        title: `${lesson.title} Sunday School Lesson`,
      });
    } catch (err: any) {
      // User dismissed share
    }
  };

  const filtered52WeekLessons = useMemo(() => {
    if (selectedQuarter === 'ALL') return fiftyTwoWeekLessons;
    return fiftyTwoWeekLessons.filter(lesson => lesson.quarter === selectedQuarter);
  }, [fiftyTwoWeekLessons, selectedQuarter]);

  const startDateStr = curriculumConfig?.officialLaunchDate;
  const week52EndDate = startDateStr ? getCurriculumWeekDate(startDateStr, 52) : null;

  const renderLessonCard = (lesson: KidsCurriculumLesson, index: number) => {
    const isCustom = lesson.type === 'custom';
    const isExpanded = expandedLessonId === lesson.id;

    const calculatedDate = isCustom
      ? lesson.scheduledDate || null
      : startDateStr
      ? getCurriculumWeekDate(startDateStr, lesson.weekNumber)
      : null;

    const isCurrent = isCustom
      ? curriculumConfig?.customActiveLessonId
        ? curriculumConfig.customActiveLessonId === lesson.id
        : !!lesson.isCurrentWeek
      : is52WeekEnabled
      ? currentActiveWeek === lesson.weekNumber || !!lesson.isCurrentWeek
      : false;

    const linkedStory = lesson.storyId ? stories.find(s => s.id === lesson.storyId) : undefined;
    const linkedQuiz = lesson.quizId ? quizzes.find(q => q.id === lesson.quizId) : undefined;
    const linkedSong = lesson.songId ? songs.find(s => s.id === lesson.songId) : undefined;

    const dateStatus =
      calculatedDate && !isCurrent
        ? calculatedDate < todayIso
          ? 'completed'
          : 'upcoming'
        : null;

    return (
      <View
        key={lesson.id}
        style={[
          styles.lessonCard,
          { backgroundColor: cardSurface, borderColor },
          isCurrent && [
            styles.lessonCardActive,
            { backgroundColor: isDark ? '#091512' : '#ECFDF5', borderColor: '#10B981' },
          ],
        ]}
      >
        {/* Lesson Header */}
        <TouchableOpacity
          style={styles.lessonTopRow}
          onPress={() => setExpandedLessonId(isExpanded ? null : lesson.id)}
          activeOpacity={0.88}
        >
          <View style={{ flex: 1 }}>
            <View style={[styles.badgeRow, { flexWrap: 'wrap' }]}>
              <View
                style={[
                  styles.weekPill,
                  { backgroundColor: secondarySurface },
                  isCurrent && styles.weekPillActive,
                ]}
              >
                <Text style={[styles.weekPillText, { color: secondaryText }, isCurrent && styles.weekPillTextActive]}>
                  {isCustom ? `LESSON ${index + 1}` : `WEEK ${lesson.weekNumber} · ${lesson.quarter}`}
                </Text>
              </View>

              {calculatedDate && (
                <View style={[styles.datePill, { backgroundColor: secondarySurface, borderColor }]}>
                  <Calendar size={10} color="#F59E0B" />
                  <Text style={[styles.datePillText, { color: primaryText }]}>
                    {formatCurriculumDateDisplay(calculatedDate)}
                  </Text>
                </View>
              )}

              {isCurrent && (
                <View style={styles.currentActiveBadge}>
                  <CheckCircle2 size={12} color="#10B981" />
                  <Text style={styles.currentActiveBadgeText}>ACTIVE SUNDAY</Text>
                </View>
              )}

              {!isCurrent && dateStatus === 'completed' && (
                <View style={[styles.statusTag, { backgroundColor: secondarySurface }]}>
                  <Text style={[styles.statusTagText, { color: secondaryText }]}>PAST</Text>
                </View>
              )}
            </View>

            <Text style={[styles.lessonTitleEn, { color: primaryText }]}>{lesson.title}</Text>
            <Text style={styles.lessonTitleTe}>{lesson.titleTelugu}</Text>
            <Text style={[styles.scriptureRefText, { color: secondaryText }]}>
              📖 {lesson.scriptureRef} · {lesson.scriptureRefTelugu}
            </Text>
          </View>

          <View style={styles.chevronBox}>
            {isExpanded ? (
              <ChevronUp size={20} color={secondaryText} />
            ) : (
              <ChevronDown size={20} color={secondaryText} />
            )}
          </View>
        </TouchableOpacity>

        {/* Linked Content Badges */}
        {(linkedStory || linkedQuiz || linkedSong || lesson.customStorySummary) && (
          <View style={styles.linkedChipsRow}>
            {(linkedStory || lesson.customStorySummary) && (
              <View style={[styles.linkedChip, { backgroundColor: 'rgba(59, 130, 246, 0.12)', borderColor: 'rgba(59, 130, 246, 0.3)' }]}>
                <BookOpen size={11} color="#3B82F6" />
                <Text style={[styles.linkedChipText, { color: '#3B82F6' }]} numberOfLines={1}>
                  Story: {linkedStory ? linkedStory.title : 'Custom Story'}
                </Text>
              </View>
            )}
            {linkedQuiz && (
              <View style={[styles.linkedChip, { backgroundColor: 'rgba(16, 185, 129, 0.12)', borderColor: 'rgba(16, 185, 129, 0.3)' }]}>
                <Award size={11} color="#10B981" />
                <Text style={[styles.linkedChipText, { color: '#10B981' }]} numberOfLines={1}>
                  Quiz: {linkedQuiz.title}
                </Text>
              </View>
            )}
            {linkedSong && (
              <View style={[styles.linkedChip, { backgroundColor: 'rgba(168, 85, 247, 0.12)', borderColor: 'rgba(168, 85, 247, 0.3)' }]}>
                <Music size={11} color="#A855F7" />
                <Text style={[styles.linkedChipText, { color: '#A855F7' }]} numberOfLines={1}>
                  Song: {linkedSong.title}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Big Idea Preview */}
        <View style={[styles.bigIdeaBox, { backgroundColor: secondarySurface }]}>
          <Text style={styles.bigIdeaLabel}>BIG IDEA / ప్రధాన సత్యం:</Text>
          <Text style={[styles.bigIdeaEn, { color: primaryText }]}>{lesson.bigIdea}</Text>
          <Text style={[styles.bigIdeaTe, { color: secondaryText }]}>{lesson.bigIdeaTelugu}</Text>
        </View>

        {/* Action Bar */}
        <View style={[styles.actionBar, { borderTopColor: borderColor }]}>
          {!isCurrent ? (
            <TouchableOpacity
              style={[styles.setWeekBtn, { backgroundColor: secondarySurface }]}
              onPress={() => handleSetActiveWeek(lesson)}
              disabled={updatingLessonId === lesson.id}
            >
              <CheckCircle2 size={14} color="#F59E0B" />
              <Text style={styles.setWeekBtnText}>
                {updatingLessonId === lesson.id ? 'Setting...' : 'Set Active'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.activeLockedNotice}>
              <CheckCircle2 size={14} color="#10B981" />
              <Text style={styles.activeLockedText}>Live Across Rhema</Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => handleOpenEdit(lesson)}
              activeOpacity={0.8}
            >
              <Edit3 size={14} color="#F59E0B" />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shareBtn, { backgroundColor: secondarySurface }]}
              onPress={() => handleShareToTeachers(lesson, calculatedDate)}
            >
              <Share2 size={14} color={primaryText} />
            </TouchableOpacity>

            {isCustom && (
              <TouchableOpacity
                style={styles.deleteInlineBtn}
                onPress={() => handleDeleteLesson(lesson)}
              >
                <Trash2 size={14} color="#EF4444" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Expanded Details */}
        {isExpanded && (
          <View style={[styles.expandedSection, { borderTopColor: borderColor }]}>
            {/* Weekly Memory Verse */}
            <View style={styles.verseBox}>
              <Text style={styles.verseBoxHeading}>⭐ MEMORY VERSE / కంఠస్థ వాక్యము</Text>
              <Text style={[styles.verseEn, { color: primaryText }]}>"{lesson.memoryVerse.verseEnglish}"</Text>
              <Text style={styles.verseRefTag}>— {lesson.memoryVerse.reference}</Text>
              {!!lesson.memoryVerse.verseTelugu && (
                <>
                  <Text style={[styles.verseTe, { color: secondaryText }]}>"{lesson.memoryVerse.verseTelugu}"</Text>
                  <Text style={styles.verseRefTag}>— {lesson.memoryVerse.referenceTelugu}</Text>
                </>
              )}
            </View>

            {/* Custom Story / Activity Summary if set */}
            {(lesson.customStorySummary || lesson.customActivityNotes) && (
              <View style={[styles.teacherPrepCard, { backgroundColor: secondarySurface, borderColor }]}>
                {lesson.customStorySummary ? (
                  <>
                    <Text style={[styles.prepHeading, { color: secondaryText }]}>📖 BIBLE STORY OUTLINE</Text>
                    <Text style={[styles.prepPrayerEn, { color: primaryText, marginBottom: 8 }]}>
                      {lesson.customStorySummary}
                    </Text>
                  </>
                ) : null}
                {lesson.customActivityNotes ? (
                  <>
                    <Text style={[styles.prepHeading, { color: secondaryText }]}>🎨 ACTIVITY & CRAFT NOTES</Text>
                    <Text style={[styles.prepPrayerEn, { color: primaryText }]}>
                      {lesson.customActivityNotes}
                    </Text>
                  </>
                ) : null}
              </View>
            )}

            {/* Teacher Prayer & Supplies */}
            {lesson.teacherPrep && (
              <View style={[styles.teacherPrepCard, { backgroundColor: secondarySurface, borderColor }]}>
                <Text style={[styles.prepHeading, { color: secondaryText }]}>🙏 TEACHER PREPARATION & PRAYER</Text>
                <Text style={[styles.prepPrayerEn, { color: primaryText }]}>{lesson.teacherPrep.prayerFocus}</Text>
                <Text style={[styles.prepPrayerTe, { color: secondaryText }]}>{lesson.teacherPrep.prayerFocusTelugu}</Text>

                <View style={[styles.suppliesRow, { borderTopColor: borderColor }]}>
                  <Text style={styles.suppliesLabel}>Supplies Needed: </Text>
                  <Text style={[styles.suppliesText, { color: primaryText }]}>
                    {(lesson.teacherPrep.suppliesNeeded || []).join(', ')}
                  </Text>
                </View>

                <Text style={[styles.prepHeading, { color: secondaryText, marginTop: 12 }]}>
                  ⏰ CLASSROOM SCHEDULE
                </Text>
                <View style={styles.timelineBox}>
                  {(lesson.teacherPrep.schedule || []).map((item, idx) => (
                    <View key={idx} style={[styles.timelineRow, { backgroundColor: cardSurface }]}>
                      <View style={[styles.timeTag, { backgroundColor: secondarySurface }]}>
                        <Clock size={11} color="#F59E0B" />
                        <Text style={styles.timeTagText}>{item.timeMinutes}m</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.timelineSegment, { color: primaryText }]}>{item.segment}</Text>
                        <Text style={[styles.timelineDesc, { color: secondaryText }]}>{item.description}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Tier-Specific Curriculum Guides */}
            {lesson.tierGuides && (
              <View style={styles.tierSection}>
                <Text style={[styles.tierSectionHeading, { color: secondaryText }]}>
                  🎯 CLASSROOM TIER ADAPTATIONS
                </Text>

                <View style={styles.tierNavRow}>
                  {TIER_DEFS.map(t => {
                    const isTierActive = selectedTierTab === t.id;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[
                          styles.tierPill,
                          { backgroundColor: secondarySurface },
                          isTierActive && styles.tierPillActive,
                        ]}
                        onPress={() => setSelectedTierTab(t.id)}
                      >
                        <Text
                          style={[
                            styles.tierPillText,
                            { color: secondaryText },
                            isTierActive && styles.tierPillTextActive,
                          ]}
                        >
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {lesson.tierGuides[selectedTierTab] && (
                  <View style={[styles.tierGuideCard, { backgroundColor: secondarySurface, borderColor }]}>
                    <Text style={styles.tierGuideTitle}>{lesson.tierGuides[selectedTierTab].tierName}</Text>

                    <View style={styles.tierField}>
                      <Text style={[styles.tierFieldLabel, { color: primaryText }]}>Learning Objective:</Text>
                      <Text style={[styles.tierFieldValEn, { color: primaryText }]}>
                        {lesson.tierGuides[selectedTierTab].objective}
                      </Text>
                      <Text style={[styles.tierFieldValTe, { color: secondaryText }]}>
                        {lesson.tierGuides[selectedTierTab].objectiveTelugu}
                      </Text>
                    </View>

                    <View style={styles.tierField}>
                      <Text style={[styles.tierFieldLabel, { color: primaryText }]}>
                        🎨 Activity: {lesson.tierGuides[selectedTierTab].activityName}
                      </Text>
                      <Text style={[styles.tierFieldValEn, { color: primaryText }]}>
                        {lesson.tierGuides[selectedTierTab].activityInstructions}
                      </Text>
                      <Text style={[styles.tierFieldValTe, { color: secondaryText }]}>
                        {lesson.tierGuides[selectedTierTab].activityInstructionsTelugu}
                      </Text>
                    </View>

                    <View style={styles.tierField}>
                      <Text style={[styles.tierFieldLabel, { color: primaryText }]}>💬 Discussion Questions:</Text>
                      {(lesson.tierGuides[selectedTierTab].discussionQuestions || []).map((q, i) => (
                        <Text key={i} style={[styles.tierQuestionItem, { color: secondaryText }]}>
                          • {q}
                        </Text>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: screenBg, paddingTop: safeTop }]}>
        <StatusBar barStyle={barStyle} backgroundColor={screenBg} />

        {/* Header */}
        <View style={[styles.headerRow, { borderBottomColor: borderColor }]}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: secondarySurface }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={20} color={primaryText} />
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text
              style={[styles.titleSerif, { color: primaryText }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              Sunday School Curriculum
            </Text>
            <Text style={[styles.subtitle, { color: secondaryText }]} numberOfLines={1}>
              {is52WeekEnabled ? '52-Week Plan Active' : 'Custom Weekly Curriculum Active'}
            </Text>
          </View>
          {/* Fixed Duplicate '+' Issue: single Plus icon + "Lesson" text */}
          <TouchableOpacity
            style={styles.addLessonHeaderBtn}
            onPress={() => handleOpenCreate(activeViewTab)}
            activeOpacity={0.85}
          >
            <Plus size={14} color="#000000" strokeWidth={3} />
            <Text style={styles.addLessonHeaderBtnText}>Lesson</Text>
          </TouchableOpacity>
        </View>

        {/* Option 1 vs Option 2 Toggle & View Switcher */}
        <View style={[styles.modeBarWrapper, { backgroundColor: cardSurface, borderBottomColor: borderColor }]}>
          {/* 52-Week Plan Enable/Disable Toggle Row */}
          <View style={[styles.toggleRow, { backgroundColor: secondarySurface, borderColor }]}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={[styles.toggleTitle, { color: primaryText }]}>
                Use 52-Week Curriculum Plan
              </Text>
              <Text style={[styles.toggleSub, { color: secondaryText }]}>
                {is52WeekEnabled
                  ? 'Enabled · Auto-calculates 52 weekly dates from start date'
                  : 'Disabled · Using your Custom Weekly Curriculum schedule'}
              </Text>
            </View>
            <Switch
              value={is52WeekEnabled}
              onValueChange={handleToggle52WeekPlan}
              trackColor={{ false: isDark ? '#3F3F46' : '#CBD5E1', true: '#10B981' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Segmented Tabs: Option 1 (52-Week) vs Option 2 (Custom Weekly) */}
          <View style={styles.modeTabsRow}>
            <TouchableOpacity
              style={[
                styles.modeTabBtn,
                { backgroundColor: secondarySurface, borderColor },
                activeViewTab === '52_week' && styles.modeTabBtnActive,
              ]}
              onPress={() => setActiveViewTab('52_week')}
              activeOpacity={0.85}
            >
              <Layers size={14} color={activeViewTab === '52_week' ? '#000000' : secondaryText} />
              <Text
                style={[
                  styles.modeTabText,
                  { color: secondaryText },
                  activeViewTab === '52_week' && styles.modeTabTextActive,
                ]}
              >
                52-Week Plan ({fiftyTwoWeekLessons.length})
              </Text>
              {is52WeekEnabled && <View style={styles.liveDot} />}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeTabBtn,
                { backgroundColor: secondarySurface, borderColor },
                activeViewTab === 'custom' && styles.modeTabBtnActive,
              ]}
              onPress={() => setActiveViewTab('custom')}
              activeOpacity={0.85}
            >
              <Sparkles size={14} color={activeViewTab === 'custom' ? '#000000' : secondaryText} />
              <Text
                style={[
                  styles.modeTabText,
                  { color: secondaryText },
                  activeViewTab === 'custom' && styles.modeTabTextActive,
                ]}
              >
                Custom Weekly ({customLessons.length})
              </Text>
              {!is52WeekEnabled && <View style={styles.liveDot} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* LOADING INDICATOR WHILE PREPARING 52-WEEK CURRICULUM */}
        {loadingCurriculum ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color="#FBBF24" />
            <Text style={[styles.loadingTitle, { color: primaryText }]}>
              Loading 52-Week Curriculum...
            </Text>
            <Text style={[styles.loadingSub, { color: secondaryText }]}>
              Fetching bilingual lessons, schedules & dates
            </Text>
          </View>
        ) : (
          <>
        {/* OPTION 1: 52-WEEK CURRICULUM VIEW */}
        {activeViewTab === '52_week' && (
          <>
            {/* Quarter Selector Tabs */}
            <View style={[styles.quarterNav, { backgroundColor: screenBg, borderBottomColor: borderColor }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quarterScroll}>
                {QUARTERS.map(q => {
                  const active = selectedQuarter === q.id;
                  return (
                    <TouchableOpacity
                      key={q.id}
                      style={[
                        styles.quarterChip,
                        { backgroundColor: cardSurface, borderColor },
                        active && styles.quarterChipActive,
                      ]}
                      onPress={() => setSelectedQuarter(q.id)}
                    >
                      <Text
                        style={[
                          styles.quarterChipText,
                          { color: primaryText },
                          active && styles.quarterChipTextActive,
                        ]}
                      >
                        {q.label}
                      </Text>
                      <Text
                        style={[
                          styles.quarterChipSub,
                          { color: secondaryText },
                          active && styles.quarterChipSubActive,
                        ]}
                      >
                        {q.sub}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <ScrollView contentContainerStyle={styles.scrollList} showsVerticalScrollIndicator={false}>
              {!is52WeekEnabled && (
                <View style={[styles.standbyNoticeCard, { backgroundColor: cardSurface, borderColor: '#F59E0B' }]}>
                  <Text style={[styles.standbyNoticeTitle, { color: primaryText }]}>
                    52-Week Curriculum is Currently Paused
                  </Text>
                  <Text style={[styles.standbyNoticeSub, { color: secondaryText }]}>
                    Turn ON the toggle above to activate the 52-Week Curriculum Plan for members and teachers.
                  </Text>
                </View>
              )}

              {/* Start Date Confirmation & Auto-Calculated Schedule Card */}
              <View style={[styles.launchCard, { backgroundColor: cardSurface }]}>
                <View style={styles.launchCardTop}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    <Calendar size={14} color="#F59E0B" />
                    <Text style={styles.launchHeading} numberOfLines={1} ellipsizeMode="tail">
                      START DATE & SCHEDULE
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.launchStatusBadge,
                      curriculumConfig?.isLaunched && startDateStr ? styles.launchActiveBadge : styles.launchPendingBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.launchStatusText,
                        curriculumConfig?.isLaunched && startDateStr ? { color: '#10B981' } : { color: '#F59E0B' },
                      ]}
                    >
                      {curriculumConfig?.isLaunched && startDateStr ? 'CONFIRMED' : 'NEEDS START DATE'}
                    </Text>
                  </View>
                </View>

                {curriculumConfig?.isLaunched && startDateStr ? (
                  <View style={{ gap: 6 }}>
                    <View style={[styles.dateSummaryGrid, { backgroundColor: secondarySurface, borderColor }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.dateSummaryLabel, { color: secondaryText }]}>WEEK 1 START DATE</Text>
                        <Text style={[styles.dateSummaryValue, { color: primaryText }]}>
                          {formatCurriculumDateDisplay(startDateStr)}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.dateSummaryLabel, { color: secondaryText }]}>WEEK 52 END DATE</Text>
                        <Text style={[styles.dateSummaryValue, { color: primaryText }]}>
                          {formatCurriculumDateDisplay(week52EndDate)}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.launchDescription, { color: secondaryText }]}>
                      All 52 weekly dates are automatically calculated every 7 days. Active lesson is Week {currentActiveWeek}.
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.launchDescription, { color: secondaryText }]}>
                    Confirm your Week 1 Start Date below. Once confirmed, all 52 weekly Sunday lesson dates will be calculated automatically and progress week by week!
                  </Text>
                )}

                <View style={styles.launchActionRow}>
                  <TouchableOpacity
                    style={styles.setLaunchDateBtn}
                    onPress={() => setShowStartDatePicker(true)}
                    activeOpacity={0.85}
                  >
                    <Calendar size={14} color="#000000" />
                    <Text style={styles.setLaunchDateBtnText}>
                      {startDateStr ? 'Change Start Date' : 'Confirm Start Date'}
                    </Text>
                  </TouchableOpacity>

                  {curriculumConfig?.isLaunched && (
                    <TouchableOpacity
                      style={[styles.resetLaunchBtn, { backgroundColor: secondarySurface }]}
                      onPress={handleResetLaunchDate}
                      activeOpacity={0.8}
                    >
                      <RotateCcw size={12} color={primaryText} />
                      <Text style={[styles.resetLaunchBtnText, { color: primaryText }]}>Reset</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {filtered52WeekLessons.map((lesson, idx) => renderLessonCard(lesson, idx))}
            </ScrollView>
          </>
        )}

        {/* OPTION 2: CUSTOM WEEKLY CURRICULUM VIEW */}
        {activeViewTab === 'custom' && (
          <ScrollView contentContainerStyle={styles.scrollList} showsVerticalScrollIndicator={false}>
            <View style={[styles.launchCard, { backgroundColor: cardSurface, borderColor: 'rgba(16, 185, 129, 0.35)' }]}>
              <View style={styles.launchCardTop}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                  <Sparkles size={15} color="#10B981" />
                  <Text style={[styles.launchHeading, { color: '#10B981' }]} numberOfLines={1} ellipsizeMode="tail">
                    CUSTOM WEEKLY CURRICULUM
                  </Text>
                </View>
                <View
                  style={[
                    styles.launchStatusBadge,
                    !is52WeekEnabled ? styles.launchActiveBadge : styles.launchPendingBadge,
                  ]}
                >
                  <Text style={[styles.launchStatusText, { color: !is52WeekEnabled ? '#10B981' : '#F59E0B' }]}>
                    {!is52WeekEnabled ? 'ACTIVE MODE' : 'STANDBY'}
                  </Text>
                </View>
              </View>

              <Text style={[styles.launchDescription, { color: secondaryText }]}>
                Pick your own preferred dates and create weekly lessons, memory verses, Bible stories, quizzes, songs, and classroom activities independently.
              </Text>

              <View style={styles.launchActionRow}>
                <TouchableOpacity
                  style={[styles.setLaunchDateBtn, { backgroundColor: '#10B981' }]}
                  onPress={() => handleOpenCreate('custom')}
                  activeOpacity={0.85}
                >
                  <Plus size={15} color="#FFFFFF" strokeWidth={2.8} />
                  <Text style={[styles.setLaunchDateBtnText, { color: '#FFFFFF' }]}>
                    Create Custom Lesson
                  </Text>
                </TouchableOpacity>

                {is52WeekEnabled && (
                  <TouchableOpacity
                    style={[styles.resetLaunchBtn, { backgroundColor: secondarySurface }]}
                    onPress={() => handleToggle52WeekPlan(false)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.resetLaunchBtnText, { color: primaryText }]}>Activate Mode</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {customLessons.length === 0 ? (
              <View style={[styles.emptyCustomCard, { backgroundColor: cardSurface, borderColor }]}>
                <Calendar size={34} color={secondaryText} />
                <Text style={[styles.emptyCustomTitle, { color: primaryText }]}>
                  No Custom Weekly Lessons Yet
                </Text>
                <Text style={[styles.emptyCustomSub, { color: secondaryText }]}>
                  Tap "Create Custom Lesson" above to choose a date and build your first custom lesson with verses, stories, quizzes & activities.
                </Text>
              </View>
            ) : (
              customLessons.map((lesson, idx) => renderLessonCard(lesson, idx))
            )}
          </ScrollView>
        )}
          </>
        )}

        {/* MANUAL / CUSTOM LESSON EDITOR MODAL */}
        <Modal
          visible={showEditorModal}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setShowEditorModal(false)}
        >
          <View style={[styles.container, { backgroundColor: screenBg, paddingTop: safeTop }]}>
            <View style={[styles.headerRow, { borderBottomColor: borderColor }]}>
              <TouchableOpacity
                onPress={() => setShowEditorModal(false)}
                style={[styles.closeBtn, { backgroundColor: secondarySurface }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={primaryText} />
              </TouchableOpacity>
              <View style={styles.headerTitles}>
                <Text style={[styles.titleSerif, { color: primaryText }]}>
                  {editingLesson
                    ? editorMode === 'custom'
                      ? 'Edit Custom Lesson'
                      : `Edit Week ${editingLesson.weekNumber}`
                    : editorMode === 'custom'
                    ? 'New Custom Lesson'
                    : 'New 52-Week Lesson'}
                </Text>
                <Text style={[styles.subtitle, { color: secondaryText }]}>
                  Lessons, Verses, Stories, Quizzes & Activities
                </Text>
              </View>
              {editingLesson ? (
                <TouchableOpacity
                  onPress={() => {
                    setShowEditorModal(false);
                    handleDeleteLesson(editingLesson);
                  }}
                  style={styles.deleteHeaderBtn}
                >
                  <Trash2 size={16} color="#EF4444" />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 36 }} />
              )}
            </View>

            <ScrollView contentContainerStyle={styles.editorScroll} showsVerticalScrollIndicator={false}>
              {/* Schedule Date (for Custom) OR Week Number & Quarter (for 52-Week) */}
              {editorMode === 'custom' ? (
                <View style={styles.editorGroup}>
                  <Text style={[styles.editorLabel, { color: primaryText }]}>
                    Preferred Lesson Date *
                  </Text>
                  <TouchableOpacity
                    style={[styles.dateSelectBtn, { backgroundColor: cardSurface, borderColor }]}
                    onPress={() => setShowCustomDatePicker(true)}
                    activeOpacity={0.85}
                  >
                    <Calendar size={16} color="#F59E0B" />
                    <Text style={[styles.dateSelectBtnText, { color: primaryText }]}>
                      {formatCurriculumDateDisplay(editScheduledDate)} ({editScheduledDate})
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#F59E0B' }}>Change</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.editorRow}>
                  <View style={[styles.editorGroup, { flex: 1 }]}>
                    <Text style={[styles.editorLabel, { color: primaryText }]}>Week Number (1-52)</Text>
                    <TextInput
                      style={[styles.editorInput, { backgroundColor: cardSurface, borderColor, color: primaryText }]}
                      value={editWeekNumber}
                      onChangeText={setEditWeekNumber}
                      keyboardType="number-pad"
                      placeholder="e.g. 1"
                      placeholderTextColor={secondaryText}
                    />
                  </View>
                  <View style={[styles.editorGroup, { flex: 1.5 }]}>
                    <Text style={[styles.editorLabel, { color: primaryText }]}>Quarter</Text>
                    <View style={styles.quarterPickerRow}>
                      {(['Q1', 'Q2', 'Q3', 'Q4'] as CurriculumQuarter[]).map(q => (
                        <TouchableOpacity
                          key={q}
                          style={[
                            styles.quarterMiniChip,
                            { backgroundColor: cardSurface, borderColor },
                            editQuarter === q && styles.quarterMiniChipActive,
                          ]}
                          onPress={() => setEditQuarter(q)}
                        >
                          <Text
                            style={[
                              styles.quarterMiniChipText,
                              { color: secondaryText },
                              editQuarter === q && styles.quarterMiniChipTextActive,
                            ]}
                          >
                            {q}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              )}

              {/* Title (English & Telugu) */}
              <View style={styles.editorGroup}>
                <Text style={[styles.editorLabel, { color: primaryText }]}>Lesson Title (English) *</Text>
                <TextInput
                  style={[styles.editorInput, { backgroundColor: cardSurface, borderColor, color: primaryText }]}
                  value={editTitleEn}
                  onChangeText={setEditTitleEn}
                  placeholder="e.g. God Creates the Heavens and the Earth"
                  placeholderTextColor={secondaryText}
                />
              </View>

              <View style={styles.editorGroup}>
                <Text style={[styles.editorLabel, { color: primaryText }]}>పాఠం శీర్షిక (Telugu)</Text>
                <TextInput
                  style={[styles.editorInput, { backgroundColor: cardSurface, borderColor, color: primaryText }]}
                  value={editTitleTe}
                  onChangeText={setEditTitleTe}
                  placeholder="ఉదా: దేవుడు ఆకాశమును భూమిని సృష్టించెను"
                  placeholderTextColor={secondaryText}
                />
              </View>

              {/* Scripture Reference with Direct Bible Picker */}
              <View style={styles.editorGroup}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={[styles.editorLabel, { color: primaryText }]}>Scripture Passage</Text>
                  <TouchableOpacity
                    style={[styles.biblePickerTriggerBtn, { backgroundColor: 'rgba(245, 158, 11, 0.14)', borderColor: 'rgba(245, 158, 11, 0.4)' }]}
                    onPress={() => setBiblePickerTarget('lesson_scripture')}
                    activeOpacity={0.85}
                  >
                    <BookOpen size={13} color="#D97706" />
                    <Text style={styles.biblePickerTriggerText}>Select from Bible</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.editorRow}>
                  <View style={[styles.editorGroup, { flex: 1 }]}>
                    <Text style={[styles.editorLabel, { color: secondaryText, fontSize: 11 }]}>Scripture (English)</Text>
                    <TextInput
                      style={[styles.editorInput, { backgroundColor: cardSurface, borderColor, color: primaryText }]}
                      value={editScriptureEn}
                      onChangeText={setEditScriptureEn}
                      placeholder="e.g. Genesis 1:1-31"
                      placeholderTextColor={secondaryText}
                    />
                  </View>
                  <View style={[styles.editorGroup, { flex: 1 }]}>
                    <Text style={[styles.editorLabel, { color: secondaryText, fontSize: 11 }]}>వాక్య భాగం (Telugu)</Text>
                    <TextInput
                      style={[styles.editorInput, { backgroundColor: cardSurface, borderColor, color: primaryText }]}
                      value={editScriptureTe}
                      onChangeText={setEditScriptureTe}
                      placeholder="ఉదా: ఆదికాండము 1:1-31"
                      placeholderTextColor={secondaryText}
                    />
                  </View>
                </View>
              </View>

              {/* Big Idea */}
              <View style={styles.editorGroup}>
                <Text style={[styles.editorLabel, { color: primaryText }]}>Big Idea / Main Truth (English)</Text>
                <TextInput
                  style={[styles.editorInput, { backgroundColor: cardSurface, borderColor, color: primaryText, minHeight: 60 }]}
                  value={editBigIdeaEn}
                  onChangeText={setEditBigIdeaEn}
                  placeholder="e.g. God is Almighty and created everything good."
                  placeholderTextColor={secondaryText}
                  multiline
                />
              </View>

              <View style={styles.editorGroup}>
                <Text style={[styles.editorLabel, { color: primaryText }]}>ప్రధాన సత్యం (Telugu)</Text>
                <TextInput
                  style={[styles.editorInput, { backgroundColor: cardSurface, borderColor, color: primaryText, minHeight: 60 }]}
                  value={editBigIdeaTe}
                  onChangeText={setEditBigIdeaTe}
                  placeholder="ఉదా: దేవుడు సర్వశక్తిమంతుడు, ప్రతిదానిని మంచిగా సృష్టించెను."
                  placeholderTextColor={secondaryText}
                  multiline
                />
              </View>

              {/* Memory Verse */}
              <View style={[styles.editorSectionCard, { backgroundColor: cardSurface, borderColor }]}>
                <Text style={[styles.editorSectionHeading, { color: '#F59E0B' }]}>
                  MEMORY VERSE
                </Text>
                <View style={styles.editorGroup}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={[styles.editorLabel, { color: primaryText }]}>Memory Verse Reference</Text>
                    <TouchableOpacity
                      style={[styles.biblePickerTriggerBtn, { backgroundColor: 'rgba(245, 158, 11, 0.14)', borderColor: 'rgba(245, 158, 11, 0.4)' }]}
                      onPress={() => setBiblePickerTarget('memory_verse')}
                      activeOpacity={0.85}
                    >
                      <BookOpen size={13} color="#D97706" />
                      <Text style={styles.biblePickerTriggerText}>Select from Bible</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={[styles.editorInput, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                    value={editVerseRef}
                    onChangeText={setEditVerseRef}
                    placeholder="e.g. Genesis 1:1 / ఆదికాండము 1:1"
                    placeholderTextColor={secondaryText}
                  />
                </View>

                <View style={styles.editorGroup}>
                  <Text style={[styles.editorLabel, { color: primaryText }]}>Memory Verse (English)</Text>
                  <TextInput
                    style={[styles.editorInput, { backgroundColor: secondarySurface, borderColor, color: primaryText, minHeight: 60 }]}
                    value={editVerseEn}
                    onChangeText={setEditVerseEn}
                    placeholder="e.g. In the beginning God created the heavens and the earth."
                    placeholderTextColor={secondaryText}
                    multiline
                  />
                </View>

                <View style={styles.editorGroup}>
                  <Text style={[styles.editorLabel, { color: primaryText }]}>కంఠస్థ వాక్యము (Telugu)</Text>
                  <TextInput
                    style={[styles.editorInput, { backgroundColor: secondarySurface, borderColor, color: primaryText, minHeight: 60 }]}
                    value={editVerseTe}
                    onChangeText={setEditVerseTe}
                    placeholder="ఉదా: ఆదియందు దేవుడు భూమ్యాకాశములను సృజించెను."
                    placeholderTextColor={secondaryText}
                    multiline
                  />
                </View>
              </View>

              {/* Link Bible Story, Quiz, Song */}
              <View style={[styles.editorSectionCard, { backgroundColor: cardSurface, borderColor }]}>
                <Text style={[styles.editorSectionHeading, { color: '#3B82F6' }]}>
                  LINKED BIBLE STORY, QUIZ & WORSHIP SONG
                </Text>

                {/* Story Picker */}
                <View style={styles.editorGroup}>
                  <Text style={[styles.editorLabel, { color: primaryText }]}>Attach Bible Story</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerChipsRow}>
                    <TouchableOpacity
                      style={[
                        styles.pickerChip,
                        { backgroundColor: secondarySurface, borderColor },
                        !editStoryId && styles.pickerChipActive,
                      ]}
                      onPress={() => setEditStoryId('')}
                    >
                      <Text style={[styles.pickerChipText, { color: !editStoryId ? '#000000' : secondaryText }]}>
                        None
                      </Text>
                    </TouchableOpacity>
                    {stories.map(st => {
                      const selected = editStoryId === st.id;
                      return (
                        <TouchableOpacity
                          key={st.id}
                          style={[
                            styles.pickerChip,
                            { backgroundColor: secondarySurface, borderColor },
                            selected && styles.pickerChipActive,
                          ]}
                          onPress={() => setEditStoryId(st.id)}
                        >
                          {selected && <Check size={12} color="#000000" />}
                          <Text style={[styles.pickerChipText, { color: selected ? '#000000' : primaryText }]}>
                            {st.coverEmoji || '📖'} {st.title}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Custom Story Outline / Notes */}
                <View style={styles.editorGroup}>
                  <Text style={[styles.editorLabel, { color: primaryText }]}>
                    Bible Story Outline / Summary (Optional)
                  </Text>
                  <TextInput
                    style={[styles.editorInput, { backgroundColor: secondarySurface, borderColor, color: primaryText, minHeight: 60 }]}
                    value={editCustomStorySummary}
                    onChangeText={setEditCustomStorySummary}
                    placeholder="Key points or custom story narrative for teachers & parents..."
                    placeholderTextColor={secondaryText}
                    multiline
                  />
                </View>

                {/* Quiz Picker */}
                <View style={styles.editorGroup}>
                  <Text style={[styles.editorLabel, { color: primaryText }]}>Attach Interactive Quiz</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerChipsRow}>
                    <TouchableOpacity
                      style={[
                        styles.pickerChip,
                        { backgroundColor: secondarySurface, borderColor },
                        !editQuizId && styles.pickerChipActive,
                      ]}
                      onPress={() => setEditQuizId('')}
                    >
                      <Text style={[styles.pickerChipText, { color: !editQuizId ? '#000000' : secondaryText }]}>
                        None
                      </Text>
                    </TouchableOpacity>
                    {quizzes.map(qz => {
                      const selected = editQuizId === qz.id;
                      return (
                        <TouchableOpacity
                          key={qz.id}
                          style={[
                            styles.pickerChip,
                            { backgroundColor: secondarySurface, borderColor },
                            selected && styles.pickerChipActive,
                          ]}
                          onPress={() => setEditQuizId(qz.id)}
                        >
                          {selected && <Check size={12} color="#000000" />}
                          <Text style={[styles.pickerChipText, { color: selected ? '#000000' : primaryText }]}>
                            {qz.coverEmoji || '🏆'} {qz.title}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Worship Song Picker */}
                <View style={styles.editorGroup}>
                  <Text style={[styles.editorLabel, { color: primaryText }]}>Attach Action / Worship Song</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerChipsRow}>
                    <TouchableOpacity
                      style={[
                        styles.pickerChip,
                        { backgroundColor: secondarySurface, borderColor },
                        !editSongId && styles.pickerChipActive,
                      ]}
                      onPress={() => setEditSongId('')}
                    >
                      <Text style={[styles.pickerChipText, { color: !editSongId ? '#000000' : secondaryText }]}>
                        None
                      </Text>
                    </TouchableOpacity>
                    {songs.map(sg => {
                      const selected = editSongId === sg.id;
                      return (
                        <TouchableOpacity
                          key={sg.id}
                          style={[
                            styles.pickerChip,
                            { backgroundColor: secondarySurface, borderColor },
                            selected && styles.pickerChipActive,
                          ]}
                          onPress={() => setEditSongId(sg.id)}
                        >
                          {selected && <Check size={12} color="#000000" />}
                          <Text style={[styles.pickerChipText, { color: selected ? '#000000' : primaryText }]}>
                            {sg.coverEmoji || '🎵'} {sg.title}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>

              {/* Activities & Teacher Preparation */}
              <View style={[styles.editorSectionCard, { backgroundColor: cardSurface, borderColor }]}>
                <Text style={[styles.editorSectionHeading, { color: '#10B981' }]}>
                  ACTIVITIES, SUPPLIES & AGE-GROUP ADAPTATIONS
                </Text>

                <View style={styles.editorGroup}>
                  <Text style={[styles.editorLabel, { color: primaryText }]}>General Activity / Craft Notes</Text>
                  <TextInput
                    style={[styles.editorInput, { backgroundColor: secondarySurface, borderColor, color: primaryText, minHeight: 54 }]}
                    value={editCustomActivityNotes}
                    onChangeText={setEditCustomActivityNotes}
                    placeholder="e.g. Memory verse craft, team relay game, coloring pages..."
                    placeholderTextColor={secondaryText}
                    multiline
                  />
                </View>

                <View style={styles.editorGroup}>
                  <Text style={[styles.editorLabel, { color: primaryText }]}>Supplies Needed (comma separated)</Text>
                  <TextInput
                    style={[styles.editorInput, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                    value={editSuppliesText}
                    onChangeText={setEditSuppliesText}
                    placeholder="Bible, Crayons, Craft Paper"
                    placeholderTextColor={secondaryText}
                  />
                </View>

                <View style={styles.editorGroup}>
                  <Text style={[styles.editorLabel, { color: primaryText }]}>Teacher Prayer Focus</Text>
                  <TextInput
                    style={[styles.editorInput, { backgroundColor: secondarySurface, borderColor, color: primaryText, minHeight: 54 }]}
                    value={editPrayerFocusEn}
                    onChangeText={setEditPrayerFocusEn}
                    placeholder="Pray that children encounter Jesus..."
                    placeholderTextColor={secondaryText}
                    multiline
                  />
                </View>

                {/* Tier Activity Switcher inside Editor */}
                <Text style={[styles.editorLabel, { color: primaryText, marginTop: 4 }]}>
                  Age-Tier Activity Customization
                </Text>
                <View style={styles.tierNavRow}>
                  {TIER_DEFS.map(t => {
                    const isTierActive = editorTierTab === t.id;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[
                          styles.tierPill,
                          { backgroundColor: secondarySurface },
                          isTierActive && styles.tierPillActive,
                        ]}
                        onPress={() => setEditorTierTab(t.id)}
                      >
                        <Text
                          style={[
                            styles.tierPillText,
                            { color: secondaryText },
                            isTierActive && styles.tierPillTextActive,
                          ]}
                        >
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.editorGroup}>
                  <Text style={[styles.editorLabel, { color: primaryText }]}>
                    Activity Name ({editTierGuides[editorTierTab]?.tierName})
                  </Text>
                  <TextInput
                    style={[styles.editorInput, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                    value={editTierGuides[editorTierTab]?.activityName || ''}
                    onChangeText={val => updateCurrentTierField('activityName', val)}
                    placeholder="Activity title"
                    placeholderTextColor={secondaryText}
                  />
                </View>

                <View style={styles.editorGroup}>
                  <Text style={[styles.editorLabel, { color: primaryText }]}>Activity Instructions</Text>
                  <TextInput
                    style={[styles.editorInput, { backgroundColor: secondarySurface, borderColor, color: primaryText, minHeight: 54 }]}
                    value={editTierGuides[editorTierTab]?.activityInstructions || ''}
                    onChangeText={val => updateCurrentTierField('activityInstructions', val)}
                    placeholder="Instructions for teachers"
                    placeholderTextColor={secondaryText}
                    multiline
                  />
                </View>

                <View style={styles.editorGroup}>
                  <Text style={[styles.editorLabel, { color: primaryText }]}>
                    Discussion Questions (one per line)
                  </Text>
                  <TextInput
                    style={[styles.editorInput, { backgroundColor: secondarySurface, borderColor, color: primaryText, minHeight: 64 }]}
                    value={(editTierGuides[editorTierTab]?.discussionQuestions || []).join('\n')}
                    onChangeText={val => updateCurrentTierField('discussionQuestionsText', val)}
                    placeholder="Question 1&#10;Question 2"
                    placeholderTextColor={secondaryText}
                    multiline
                  />
                </View>
              </View>

              <TouchableOpacity
                style={styles.saveLessonBtn}
                onPress={handleSaveLesson}
                disabled={savingLesson}
                activeOpacity={0.85}
              >
                {savingLesson ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <>
                    <Save size={16} color="#000000" />
                    <Text style={styles.saveLessonBtnText}>
                      {editingLesson ? 'Save Changes' : editorMode === 'custom' ? 'Create Custom Lesson' : 'Create & Add Lesson'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>

            {/* Custom Lesson Preferred Date Picker */}
            <DateTimePickerModal
              isVisible={showCustomDatePicker}
              mode="date"
              date={editScheduledDate ? new Date(`${editScheduledDate}T12:00:00`) : new Date()}
              onConfirm={date => {
                setShowCustomDatePicker(false);
                setEditScheduledDate(toIsoDateString(date));
              }}
              onCancel={() => setShowCustomDatePicker(false)}
            />

            {/* Direct Bible Reference Picker (Consistent with AI Studio) */}
            <BibleReferencePickerModal
              visible={biblePickerTarget !== null}
              onClose={() => setBiblePickerTarget(null)}
              mode="reference"
              onSelectReference={(res: BiblePickerResult) => {
                if (biblePickerTarget === 'memory_verse') {
                  setEditVerseRef(
                    res.referenceStringTelugu && res.referenceStringTelugu !== res.referenceString
                      ? `${res.referenceString} / ${res.referenceStringTelugu}`
                      : res.referenceString
                  );
                } else {
                  setEditScriptureEn(res.referenceString);
                  setEditScriptureTe(res.referenceStringTelugu || res.referenceString);
                }
              }}
            />
          </View>
        </Modal>

        {/* 52-Week Curriculum Start Date Picker */}
        <DateTimePickerModal
          isVisible={showStartDatePicker}
          mode="date"
          date={
            curriculumConfig?.officialLaunchDate
              ? new Date(`${curriculumConfig.officialLaunchDate}T12:00:00`)
              : new Date(`${getNextSundayDateString()}T12:00:00`)
          }
          onConfirm={handleConfirmStartDate}
          onCancel={() => setShowStartDatePicker(false)}
        />
      </View>
    </Modal>
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
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#27272A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitles: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 8,
  },
  titleSerif: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 17,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
    textAlign: 'center',
  },
  addLessonHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 9,
  },
  addLessonHeaderBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },
  modeBarWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  toggleSub: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  modeTabsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  modeTabBtnActive: {
    backgroundColor: '#FBBF24',
    borderColor: '#FBBF24',
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modeTabTextActive: {
    color: '#000000',
    fontWeight: '800',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  quarterNav: {
    borderBottomWidth: 1,
  },
  quarterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  quarterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  quarterChipActive: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderColor: '#FBBF24',
  },
  quarterChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  quarterChipTextActive: {
    color: '#D97706',
  },
  quarterChipSub: {
    fontSize: 10,
    marginTop: 2,
  },
  quarterChipSubActive: {
    color: '#F59E0B',
  },
  scrollList: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  standbyNoticeCard: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  standbyNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  standbyNoticeSub: {
    fontSize: 11,
    marginTop: 3,
    lineHeight: 16,
  },
  launchCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.35)',
    gap: 10,
  },
  launchCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  launchHeading: {
    flexShrink: 1,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '800',
    color: '#F59E0B',
    letterSpacing: 0.4,
  },
  launchStatusBadge: {
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  launchActiveBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: '#10B981',
  },
  launchPendingBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#F59E0B',
  },
  launchStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  dateSummaryGrid: {
    flexDirection: 'row',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  dateSummaryLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  dateSummaryValue: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
  launchDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
  launchActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  setLaunchDateBtn: {
    flex: 1,
    backgroundColor: '#FBBF24',
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  setLaunchDateBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },
  resetLaunchBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resetLaunchBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyCustomCard: {
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    gap: 8,
  },
  emptyCustomTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  emptyCustomSub: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  lessonCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  lessonCardActive: {
    borderWidth: 1.5,
  },
  lessonTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  weekPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  weekPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  weekPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  weekPillTextActive: {
    color: '#10B981',
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  datePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  currentActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  currentActiveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
  },
  statusTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  statusTagText: {
    fontSize: 9,
    fontWeight: '700',
  },
  lessonTitleEn: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  lessonTitleTe: {
    fontSize: 14,
    color: '#D97706',
    marginBottom: 4,
  },
  scriptureRefText: {
    fontSize: 12,
  },
  chevronBox: {
    padding: 4,
  },
  linkedChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  linkedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: '100%',
  },
  linkedChipText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  bigIdeaBox: {
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  bigIdeaLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  bigIdeaEn: {
    fontSize: 12,
    fontWeight: '600',
  },
  bigIdeaTe: {
    fontSize: 11,
    marginTop: 2,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 8,
  },
  setWeekBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
  },
  setWeekBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#D97706',
  },
  activeLockedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  activeLockedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 8,
  },
  editBtnText: {
    color: '#D97706',
    fontSize: 12,
    fontWeight: '700',
  },
  deleteInlineBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 8,
  },
  expandedSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 14,
  },
  verseBox: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  verseBoxHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  verseEn: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  verseRefTag: {
    fontSize: 11,
    color: '#D97706',
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 2,
  },
  verseTe: {
    fontSize: 12,
    lineHeight: 18,
  },
  teacherPrepCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  prepHeading: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  prepPrayerEn: {
    fontSize: 12,
    lineHeight: 17,
  },
  prepPrayerTe: {
    fontSize: 11,
    marginTop: 3,
    lineHeight: 16,
  },
  suppliesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  suppliesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  suppliesText: {
    fontSize: 11,
    flex: 1,
  },
  timelineBox: {
    marginTop: 6,
    gap: 6,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 8,
    borderRadius: 6,
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  timeTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
  },
  timelineSegment: {
    fontSize: 12,
    fontWeight: '700',
  },
  timelineDesc: {
    fontSize: 11,
    marginTop: 1,
  },
  tierSection: {
    marginTop: 4,
  },
  tierSectionHeading: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  tierNavRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  tierPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tierPillActive: {
    backgroundColor: '#FBBF24',
  },
  tierPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tierPillTextActive: {
    color: '#000000',
  },
  tierGuideCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  tierGuideTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#D97706',
    marginBottom: 2,
  },
  tierField: {
    gap: 2,
  },
  tierFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  tierFieldValEn: {
    fontSize: 12,
    lineHeight: 17,
  },
  tierFieldValTe: {
    fontSize: 11,
    lineHeight: 16,
  },
  tierQuestionItem: {
    fontSize: 11,
    lineHeight: 16,
    marginLeft: 4,
  },
  deleteHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editorScroll: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  editorRow: {
    flexDirection: 'row',
    gap: 12,
  },
  editorGroup: {
    gap: 6,
  },
  editorLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  editorInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  dateSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dateSelectBtnText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
  },
  quarterPickerRow: {
    flexDirection: 'row',
    gap: 6,
  },
  quarterMiniChip: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
  },
  quarterMiniChipActive: {
    backgroundColor: '#FBBF24',
    borderColor: '#FBBF24',
  },
  quarterMiniChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  quarterMiniChipTextActive: {
    color: '#000000',
  },
  editorSectionCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 12,
  },
  editorSectionHeading: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  pickerChipsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  pickerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  pickerChipActive: {
    backgroundColor: '#FBBF24',
    borderColor: '#FBBF24',
  },
  pickerChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  saveLessonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FBBF24',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 6,
  },
  saveLessonBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 6,
  },
  loadingSub: {
    fontSize: 12,
    textAlign: 'center',
  },
  biblePickerTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  biblePickerTriggerText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
  },
});
