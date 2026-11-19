import React, { useState } from 'react';
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
  Layers,
  Heart,
  ExternalLink,
  RotateCcw,
  Plus,
  Edit3,
  Trash2,
  Save,
} from 'lucide-react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import {
  KidsCurriculumLesson,
  CurriculumQuarter,
  KidsClassTier,
  KidsCurriculumConfig,
  calculateCurriculumWeek,
} from '../../../../types/KidsMinistryTypes';
import KidsMinistryService from '../../../../services/KidsMinistryService';

interface Props {
  visible: boolean;
  curriculum: KidsCurriculumLesson[];
  churchId: string;
  onClose: () => void;
}

const QUARTERS: Array<{ id: 'ALL' | CurriculumQuarter; label: string; sub: string }> = [
  { id: 'ALL', label: 'All 52 Weeks', sub: 'Full Year' },
  { id: 'Q1', label: 'Q1: Weeks 1-13', sub: 'Foundations of Faith' },
  { id: 'Q2', label: 'Q2: Weeks 14-26', sub: 'Wisdom & Prophets' },
  { id: 'Q3', label: 'Q3: Weeks 27-39', sub: 'Life & Ministry of Jesus' },
  { id: 'Q4', label: 'Q4: Weeks 40-52', sub: 'Resurrection & Armor of God' },
];

export default function AdminCurriculumModal({
  visible,
  curriculum,
  churchId,
  onClose,
}: Props) {
  const [selectedQuarter, setSelectedQuarter] = useState<'ALL' | CurriculumQuarter>('ALL');
  const [expandedWeek, setExpandedWeek] = useState<number | null>(1);
  const [selectedTierTab, setSelectedTierTab] = useState<KidsClassTier>('primary');
  const [updatingWeek, setUpdatingWeek] = useState<number | null>(null);
  const [curriculumConfig, setCurriculumConfig] = useState<KidsCurriculumConfig | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const insets = useSafeAreaInsets();
  const safeTop = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 44) + 6;

  // Manual Lesson Editor State
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState<KidsCurriculumLesson | null>(null);
  const [editWeekNumber, setEditWeekNumber] = useState('1');
  const [editQuarter, setEditQuarter] = useState<CurriculumQuarter>('Q1');
  const [editTitleEn, setEditTitleEn] = useState('');
  const [editTitleTe, setEditTitleTe] = useState('');
  const [editScriptureEn, setEditScriptureEn] = useState('');
  const [editScriptureTe, setEditScriptureTe] = useState('');
  const [editBigIdeaEn, setEditBigIdeaEn] = useState('');
  const [editBigIdeaTe, setEditBigIdeaTe] = useState('');
  const [editVerseEn, setEditVerseEn] = useState('');
  const [editVerseTe, setEditVerseTe] = useState('');
  const [editVerseRef, setEditVerseRef] = useState('');
  const [savingLesson, setSavingLesson] = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    const unsub = KidsMinistryService.subscribeToCurriculumConfig(churchId, cfg => {
      setCurriculumConfig(cfg);
    });
    return () => unsub();
  }, [visible, churchId]);

  const currentActiveWeek = calculateCurriculumWeek(curriculumConfig);

  const handleConfirmLaunchDate = async (date: Date) => {
    setShowDatePicker(false);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    try {
      await KidsMinistryService.setCurriculumLaunchDate(churchId, dateStr);
      Alert.alert(
        'Launch Date Activated! 🚀',
        `Sunday School official launch date is set to ${day}-${month}-${year}.\n\nWeek 1 begins on that date, and the app will automatically progress to Week 2, 3, 4 every following Sunday!`
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not set launch date');
    }
  };

  const handleResetLaunchDate = () => {
    Alert.alert(
      'Reset Launch Date?',
      'This will put Sunday School back into Pending Launch status (Week 1 standby).',
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

  const formatDisplayDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Not Scheduled Yet';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day}-${month}-${year} (${day} ${months[parseInt(month, 10) - 1] || ''} ${year})`;
    }
    return dateStr;
  };

  const handleOpenCreate = () => {
    const nextWeek = curriculum.length + 1;
    setEditingLesson(null);
    setEditWeekNumber(String(nextWeek));
    setEditQuarter(nextWeek <= 13 ? 'Q1' : nextWeek <= 26 ? 'Q2' : nextWeek <= 39 ? 'Q3' : 'Q4');
    setEditTitleEn('');
    setEditTitleTe('');
    setEditScriptureEn('');
    setEditScriptureTe('');
    setEditBigIdeaEn('');
    setEditBigIdeaTe('');
    setEditVerseEn('');
    setEditVerseTe('');
    setEditVerseRef('');
    setShowEditorModal(true);
  };

  const handleOpenEdit = (lesson: KidsCurriculumLesson) => {
    setEditingLesson(lesson);
    setEditWeekNumber(String(lesson.weekNumber));
    setEditQuarter(lesson.quarter);
    setEditTitleEn(lesson.title);
    setEditTitleTe(lesson.titleTelugu);
    setEditScriptureEn(lesson.scriptureRef);
    setEditScriptureTe(lesson.scriptureRefTelugu);
    setEditBigIdeaEn(lesson.bigIdea);
    setEditBigIdeaTe(lesson.bigIdeaTelugu);
    setEditVerseEn(lesson.memoryVerse?.verseEnglish || '');
    setEditVerseTe(lesson.memoryVerse?.verseTelugu || '');
    setEditVerseRef(lesson.memoryVerse?.reference || '');
    setShowEditorModal(true);
  };

  const handleSaveLesson = async () => {
    if (!editTitleEn.trim()) {
      Alert.alert('Missing Field', 'Please enter lesson title');
      return;
    }

    try {
      setSavingLesson(true);
      const weekNum = parseInt(editWeekNumber, 10) || 1;
      const lessonPayload: Omit<KidsCurriculumLesson, 'id'> = {
        weekNumber: weekNum,
        quarter: editQuarter,
        quarterTheme: editQuarter === 'Q1' ? 'Foundations of Faith' : editQuarter === 'Q2' ? 'Wisdom & Prophets' : editQuarter === 'Q3' ? 'Life & Ministry of Jesus' : 'Resurrection & Armor of God',
        title: editTitleEn.trim(),
        titleTelugu: editTitleTe.trim() || editTitleEn.trim(),
        scriptureRef: editScriptureEn.trim() || 'Genesis 1:1',
        scriptureRefTelugu: editScriptureTe.trim() || editScriptureEn.trim(),
        bigIdea: editBigIdeaEn.trim() || 'God is Almighty and created everything good.',
        bigIdeaTelugu: editBigIdeaTe.trim() || editBigIdeaEn.trim(),
        memoryVerse: {
          reference: editVerseRef.trim() || 'Genesis 1:1',
          referenceTelugu: editVerseRef.trim() || 'ఆదికాండము 1:1',
          verseEnglish: editVerseEn.trim() || '',
          verseTelugu: editVerseTe.trim() || '',
        },
        teacherPrep: editingLesson?.teacherPrep || {
          prayerFocus: `Pray that students understand: "${editBigIdeaEn.trim()}"`,
          prayerFocusTelugu: `పిల్లలు "${editBigIdeaTe.trim()}" గ్రహించాలని ప్రార్థించండి.`,
          suppliesNeeded: ['Bible', 'Activity Sheets', 'Color Pencils'],
          schedule: [
            { timeMinutes: 5, segment: 'Welcome & Prayer', description: 'Open in prayer.' },
            { timeMinutes: 10, segment: 'Praise & Songs', description: 'Action songs.' },
            { timeMinutes: 15, segment: 'Scripture Lesson', description: editTitleEn.trim() },
            { timeMinutes: 10, segment: 'Craft & Activity', description: 'Discussion and craft.' },
            { timeMinutes: 5, segment: 'Memory Verse & Dismissal', description: 'Recite verse.' },
          ],
        },
        tierGuides: editingLesson?.tierGuides || {
          nursery: { tier: 'nursery', tierName: 'Nursery Angels (Ages 0-2)', focusAge: '0-2 years', objective: editTitleEn.trim(), objectiveTelugu: editTitleTe.trim(), activityName: 'Sensory play', activityInstructions: 'Simple coloring', activityInstructionsTelugu: 'రంగులు వేయుట', discussionQuestions: ['Who loves you? God!'] },
          beginners: { tier: 'beginners', tierName: 'Beginners Kingdom (Ages 3-5)', focusAge: '3-5 years', objective: editTitleEn.trim(), objectiveTelugu: editTitleTe.trim(), activityName: 'Coloring & drama', activityInstructions: 'Act out the story', activityInstructionsTelugu: 'కథను నటించుట', discussionQuestions: ['What did God do?'] },
          primary: { tier: 'primary', tierName: 'Primary Stars (Ages 6-8)', focusAge: '6-8 years', objective: editTitleEn.trim(), objectiveTelugu: editTitleTe.trim(), activityName: 'Memory drill', activityInstructions: 'Recite memory verse', activityInstructionsTelugu: 'వాక్య పఠనం', discussionQuestions: ['How can we obey God?'] },
          junior: { tier: 'junior', tierName: 'Junior Champions (Ages 9-11)', focusAge: '9-11 years', objective: editTitleEn.trim(), objectiveTelugu: editTitleTe.trim(), activityName: 'Bible trivia', activityInstructions: 'Sword drill', activityInstructionsTelugu: 'బైబిల్ క్విజ్', discussionQuestions: ['How does this apply to school?'] },
          teens: { tier: 'teens', tierName: 'Teens for Christ (Ages 12-14)', focusAge: '12-14 years', objective: editTitleEn.trim(), objectiveTelugu: editTitleTe.trim(), activityName: 'Journaling', activityInstructions: 'Discussion', activityInstructionsTelugu: 'గ్రూప్ డిస్కషన్', discussionQuestions: ['How to defend this faith?'] },
        },
        isCurrentWeek: editingLesson?.isCurrentWeek || false,
        academicYear: '2026-2027',
        createdAt: editingLesson?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      if (editingLesson) {
        await KidsMinistryService.updateCurriculumLesson(churchId, editingLesson.id, lessonPayload);
        Alert.alert('Lesson Updated! ✅', `Week ${weekNum}: "${editTitleEn}" saved successfully.`);
      } else {
        await KidsMinistryService.createCurriculumLesson(churchId, lessonPayload);
        Alert.alert('Lesson Created! 🎉', `Week ${weekNum}: "${editTitleEn}" added to 52-Week Curriculum.`);
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
    Alert.alert(
      'Delete Lesson?',
      `Are you sure you want to remove Week ${lesson.weekNumber}: "${lesson.title}" from the curriculum?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await KidsMinistryService.deleteCurriculumLesson(churchId, lesson.id);
              Alert.alert('Deleted', `Week ${lesson.weekNumber} removed.`);
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  };

  const filteredLessons = curriculum.filter(lesson => {
    if (selectedQuarter === 'ALL') return true;
    return lesson.quarter === selectedQuarter;
  });

  const handleSetActiveWeek = async (weekNumber: number) => {
    try {
      setUpdatingWeek(weekNumber);
      await KidsMinistryService.setCurrentActiveWeek(churchId, weekNumber);
      Alert.alert(
        'Active Lesson Updated',
        `Week ${weekNumber} is now set as the active lesson across all Sunday School classrooms and member apps!`
      );
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not set active week');
    } finally {
      setUpdatingWeek(null);
    }
  };

  const handleShareToTeachers = async (lesson: KidsCurriculumLesson) => {
    try {
      const scheduleText = lesson.teacherPrep.schedule
        .map(s => `• ${s.timeMinutes}m - ${s.segment}: ${s.description}`)
        .join('\n');

      const message = `📖 *RHEMA SUNDAY SCHOOL CURRICULUM*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `*WEEK ${lesson.weekNumber}*: ${lesson.title}\n` +
        `*తెలుగు*: ${lesson.titleTelugu}\n` +
        `*Scripture*: ${lesson.scriptureRef} (${lesson.scriptureRefTelugu})\n\n` +
        `🎯 *BIG IDEA / ప్రధాన సత్యం*:\n${lesson.bigIdea}\n${lesson.bigIdeaTelugu}\n\n` +
        `✨ *MEMORY VERSE / కంఠస్థ వాక్యము*:\n` +
        `"${lesson.memoryVerse.verseEnglish}" — ${lesson.memoryVerse.reference}\n` +
        `"${lesson.memoryVerse.verseTelugu}" — ${lesson.memoryVerse.referenceTelugu}\n\n` +
        `🙏 *TEACHER PRAYER FOCUS*:\n${lesson.teacherPrep.prayerFocus}\n\n` +
        `📦 *SUPPLIES NEEDED*:\n${lesson.teacherPrep.suppliesNeeded.join(', ')}\n\n` +
        `⏰ *CLASSROOM SCHEDULE*:\n${scheduleText}\n\n` +
        `_Rhema Kids Ministry · Mark 10:14_`;

      await Share.share({
        message,
        title: `Week ${lesson.weekNumber} Sunday School Lesson`,
      });
    } catch (err: any) {
      // User dismissed share
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: safeTop }]}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={styles.titleSerif}>52-Week Curriculum</Text>
            <Text style={styles.subtitle}>Bilingual Telugu & English Syllabus (2026-2027)</Text>
          </View>
          <TouchableOpacity
            style={styles.addLessonHeaderBtn}
            onPress={handleOpenCreate}
            activeOpacity={0.85}
          >
            <Plus size={14} color="#000000" strokeWidth={3} />
            <Text style={styles.addLessonHeaderBtnText}>+ Lesson</Text>
          </TouchableOpacity>
        </View>

        {/* Quarter Selector Tabs */}
        <View style={styles.quarterNav}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quarterScroll}>
            {QUARTERS.map(q => {
              const active = selectedQuarter === q.id;
              return (
                <TouchableOpacity
                  key={q.id}
                  style={[styles.quarterChip, active && styles.quarterChipActive]}
                  onPress={() => setSelectedQuarter(q.id)}
                >
                  <Text style={[styles.quarterChipText, active && styles.quarterChipTextActive]}>
                    {q.label}
                  </Text>
                  <Text style={[styles.quarterChipSub, active && styles.quarterChipSubActive]}>
                    {q.sub}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Lesson List */}
        <ScrollView contentContainerStyle={styles.scrollList} showsVerticalScrollIndicator={false}>
          {/* Official Launch Date & Automation Card */}
          <View style={styles.launchCard}>
            <View style={styles.launchCardTop}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                <Calendar size={14} color="#FBBF24" />
                <Text style={styles.launchHeading} numberOfLines={1}>OFFICIAL LAUNCH SCHEDULE</Text>
              </View>
              <View style={[styles.launchStatusBadge, curriculumConfig?.isLaunched ? styles.launchActiveBadge : styles.launchPendingBadge]}>
                <Text style={[styles.launchStatusText, curriculumConfig?.isLaunched ? { color: '#10B981' } : { color: '#FBBF24' }]}>
                  {curriculumConfig?.isLaunched ? '🚀 ACTIVE' : '⏳ PENDING'}
                </Text>
              </View>
            </View>

            <Text style={styles.launchDescription}>
              {curriculumConfig?.isLaunched
                ? `Sunday School officially launched on ${formatDisplayDate(curriculumConfig.officialLaunchDate)}. Current auto-progressed active lesson is Week ${currentActiveWeek}.`
                : 'Rhema has not launched Sunday School yet. The system is in Week 1 Standby mode. When you set the launch date, Week 1 will begin on that Sunday and automatically progress to Week 2, 3, 4 every following week!'}
            </Text>

            <View style={styles.launchActionRow}>
              <TouchableOpacity
                style={styles.setLaunchDateBtn}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.85}
              >
                <Calendar size={14} color="#000000" />
                <Text style={styles.setLaunchDateBtnText}>
                  {curriculumConfig?.isLaunched ? 'Change Launch Sunday 📅' : 'Set Official Launch Sunday 📅'}
                </Text>
              </TouchableOpacity>

              {curriculumConfig?.isLaunched && (
                <TouchableOpacity
                  style={styles.resetLaunchBtn}
                  onPress={handleResetLaunchDate}
                  activeOpacity={0.8}
                >
                  <RotateCcw size={12} color="#D4D4D8" />
                  <Text style={styles.resetLaunchBtnText}>Reset to Standby</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          {filteredLessons.map(lesson => {
            const isExpanded = expandedWeek === lesson.weekNumber;
            const isCurrent = lesson.isCurrentWeek;

            return (
              <View
                key={lesson.id}
                style={[styles.lessonCard, isCurrent && styles.lessonCardActive]}
              >
                {/* Lesson Header */}
                <TouchableOpacity
                  style={styles.lessonTopRow}
                  onPress={() => setExpandedWeek(isExpanded ? null : lesson.weekNumber)}
                  activeOpacity={0.88}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.badgeRow}>
                      <View style={[styles.weekPill, isCurrent && styles.weekPillActive]}>
                        <Text style={[styles.weekPillText, isCurrent && styles.weekPillTextActive]}>
                          WEEK {lesson.weekNumber} · {lesson.quarter}
                        </Text>
                      </View>
                      {isCurrent && (
                        <View style={styles.currentActiveBadge}>
                          <CheckCircle2 size={12} color="#10B981" />
                          <Text style={styles.currentActiveBadgeText}>CURRENT ACTIVE SUNDAY</Text>
                        </View>
                      )}
                    </View>

                    <Text style={styles.lessonTitleEn}>{lesson.title}</Text>
                    <Text style={styles.lessonTitleTe}>{lesson.titleTelugu}</Text>
                    <Text style={styles.scriptureRefText}>
                      📖 {lesson.scriptureRef} · {lesson.scriptureRefTelugu}
                    </Text>
                  </View>

                  <View style={styles.chevronBox}>
                    {isExpanded ? (
                      <ChevronUp size={20} color="#9CA3AF" />
                    ) : (
                      <ChevronDown size={20} color="#9CA3AF" />
                    )}
                  </View>
                </TouchableOpacity>

                {/* Big Idea Preview */}
                <View style={styles.bigIdeaBox}>
                  <Text style={styles.bigIdeaLabel}>BIG IDEA / ప్రధాన సత్యం:</Text>
                  <Text style={styles.bigIdeaEn}>{lesson.bigIdea}</Text>
                  <Text style={styles.bigIdeaTe}>{lesson.bigIdeaTelugu}</Text>
                </View>

                {/* Action Bar */}
                <View style={styles.actionBar}>
                  {!isCurrent ? (
                    <TouchableOpacity
                      style={styles.setWeekBtn}
                      onPress={() => handleSetActiveWeek(lesson.weekNumber)}
                      disabled={updatingWeek === lesson.weekNumber}
                    >
                      <CheckCircle2 size={14} color="#FBBF24" />
                      <Text style={styles.setWeekBtnText}>
                        {updatingWeek === lesson.weekNumber ? 'Setting...' : 'Set Active for Sunday'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.activeLockedNotice}>
                      <CheckCircle2 size={14} color="#10B981" />
                      <Text style={styles.activeLockedText}>Live Across Rhema</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => handleOpenEdit(lesson)}
                    activeOpacity={0.8}
                  >
                    <Edit3 size={14} color="#FBBF24" />
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.shareBtn}
                    onPress={() => handleShareToTeachers(lesson)}
                  >
                    <Share2 size={14} color="#E5E7EB" />
                    <Text style={styles.shareBtnText}>Share</Text>
                  </TouchableOpacity>
                </View>

                {/* Expanded Details: Teacher Prep & 5 Tiers */}
                {isExpanded && (
                  <View style={styles.expandedSection}>
                    {/* Weekly Memory Verse */}
                    <View style={styles.verseBox}>
                      <Text style={styles.verseBoxHeading}>⭐ MEMORY VERSE / కంఠస్థ వాక్యము</Text>
                      <Text style={styles.verseEn}>"{lesson.memoryVerse.verseEnglish}"</Text>
                      <Text style={styles.verseRefTag}>— {lesson.memoryVerse.reference}</Text>
                      <Text style={styles.verseTe}>"{lesson.memoryVerse.verseTelugu}"</Text>
                      <Text style={styles.verseRefTag}>— {lesson.memoryVerse.referenceTelugu}</Text>
                    </View>

                    {/* Teacher Prayer & Supplies */}
                    <View style={styles.teacherPrepCard}>
                      <Text style={styles.prepHeading}>🙏 TEACHER PREPARATION & PRAYER</Text>
                      <Text style={styles.prepPrayerEn}>{lesson.teacherPrep.prayerFocus}</Text>
                      <Text style={styles.prepPrayerTe}>{lesson.teacherPrep.prayerFocusTelugu}</Text>

                      <View style={styles.suppliesRow}>
                        <Text style={styles.suppliesLabel}>Supplies Needed: </Text>
                        <Text style={styles.suppliesText}>
                          {lesson.teacherPrep.suppliesNeeded.join(', ')}
                        </Text>
                      </View>

                      {/* Schedule breakdown */}
                      <Text style={[styles.prepHeading, { marginTop: 12 }]}>
                        ⏰ 45-MINUTE CLASSROOM SCHEDULE
                      </Text>
                      <View style={styles.timelineBox}>
                        {lesson.teacherPrep.schedule.map((item, idx) => (
                          <View key={idx} style={styles.timelineRow}>
                            <View style={styles.timeTag}>
                              <Clock size={11} color="#FBBF24" />
                              <Text style={styles.timeTagText}>{item.timeMinutes}m</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.timelineSegment}>{item.segment}</Text>
                              <Text style={styles.timelineDesc}>{item.description}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>

                    {/* Tier-Specific Curriculum Guides */}
                    <View style={styles.tierSection}>
                      <Text style={styles.tierSectionHeading}>
                        🎯 CLASSROOM TIER ADAPTATIONS
                      </Text>

                      {/* Tier Switcher Pills */}
                      <View style={styles.tierNavRow}>
                        {(
                          [
                            { id: 'nursery', label: 'Nursery (1-3)' },
                            { id: 'beginners', label: 'Beginners (4-5)' },
                            { id: 'primary', label: 'Primary (6-8)' },
                            { id: 'junior', label: 'Junior (9-11)' },
                            { id: 'teens', label: 'Teens (12-14)' },
                          ] as const
                        ).map(t => {
                          const isTierActive = selectedTierTab === t.id;
                          return (
                            <TouchableOpacity
                              key={t.id}
                              style={[styles.tierPill, isTierActive && styles.tierPillActive]}
                              onPress={() => setSelectedTierTab(t.id)}
                            >
                              <Text style={[styles.tierPillText, isTierActive && styles.tierPillTextActive]}>
                                {t.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Active Tier Content */}
                      {lesson.tierGuides && lesson.tierGuides[selectedTierTab] && (
                        <View style={styles.tierGuideCard}>
                          <Text style={styles.tierGuideTitle}>
                            {lesson.tierGuides[selectedTierTab].tierName}
                          </Text>

                          <View style={styles.tierField}>
                            <Text style={styles.tierFieldLabel}>Learning Objective:</Text>
                            <Text style={styles.tierFieldValEn}>
                              {lesson.tierGuides[selectedTierTab].objective}
                            </Text>
                            <Text style={styles.tierFieldValTe}>
                              {lesson.tierGuides[selectedTierTab].objectiveTelugu}
                            </Text>
                          </View>

                          <View style={styles.tierField}>
                            <Text style={styles.tierFieldLabel}>
                              🎨 Activity: {lesson.tierGuides[selectedTierTab].activityName}
                            </Text>
                            <Text style={styles.tierFieldValEn}>
                              {lesson.tierGuides[selectedTierTab].activityInstructions}
                            </Text>
                            <Text style={styles.tierFieldValTe}>
                              {lesson.tierGuides[selectedTierTab].activityInstructionsTelugu}
                            </Text>
                          </View>

                          <View style={styles.tierField}>
                            <Text style={styles.tierFieldLabel}>💬 Discussion Questions:</Text>
                            {lesson.tierGuides[selectedTierTab].discussionQuestions.map((q, i) => (
                              <Text key={i} style={styles.tierQuestionItem}>
                                • {q}
                              </Text>
                            ))}
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        {/* Manual Lesson Editor Modal */}
        <Modal
          visible={showEditorModal}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setShowEditorModal(false)}
        >
          <View style={[styles.container, { paddingTop: safeTop }]}>
            <View style={styles.headerRow}>
              <TouchableOpacity
                onPress={() => setShowEditorModal(false)}
                style={styles.closeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.headerTitles}>
                <Text style={styles.titleSerif}>
                  {editingLesson ? `Edit Week ${editingLesson.weekNumber}` : 'New Curriculum Lesson'}
                </Text>
                <Text style={styles.subtitle}>Bilingual Telugu & English Content</Text>
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
              {/* Week Number & Quarter */}
              <View style={styles.editorRow}>
                <View style={[styles.editorGroup, { flex: 1 }]}>
                  <Text style={styles.editorLabel}>Week Number (1-52)</Text>
                  <TextInput
                    style={styles.editorInput}
                    value={editWeekNumber}
                    onChangeText={setEditWeekNumber}
                    keyboardType="number-pad"
                    placeholder="e.g. 1"
                    placeholderTextColor="#71717A"
                  />
                </View>
                <View style={[styles.editorGroup, { flex: 1.5 }]}>
                  <Text style={styles.editorLabel}>Quarter</Text>
                  <View style={styles.quarterPickerRow}>
                    {(['Q1', 'Q2', 'Q3', 'Q4'] as CurriculumQuarter[]).map(q => (
                      <TouchableOpacity
                        key={q}
                        style={[styles.quarterMiniChip, editQuarter === q && styles.quarterMiniChipActive]}
                        onPress={() => setEditQuarter(q)}
                      >
                        <Text style={[styles.quarterMiniChipText, editQuarter === q && styles.quarterMiniChipTextActive]}>
                          {q}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Title (English & Telugu) */}
              <View style={styles.editorGroup}>
                <Text style={styles.editorLabel}>Lesson Title (English) *</Text>
                <TextInput
                  style={styles.editorInput}
                  value={editTitleEn}
                  onChangeText={setEditTitleEn}
                  placeholder="e.g. God Creates the Heavens and the Earth"
                  placeholderTextColor="#71717A"
                />
              </View>

              <View style={styles.editorGroup}>
                <Text style={styles.editorLabel}>పాఠం శీర్షిక (Telugu)</Text>
                <TextInput
                  style={styles.editorInput}
                  value={editTitleTe}
                  onChangeText={setEditTitleTe}
                  placeholder="ఉదా: దేవుడు ఆకాశమును భూమిని సృష్టించెను"
                  placeholderTextColor="#71717A"
                />
              </View>

              {/* Scripture Reference */}
              <View style={styles.editorRow}>
                <View style={[styles.editorGroup, { flex: 1 }]}>
                  <Text style={styles.editorLabel}>Scripture (English)</Text>
                  <TextInput
                    style={styles.editorInput}
                    value={editScriptureEn}
                    onChangeText={setEditScriptureEn}
                    placeholder="e.g. Genesis 1:1-31"
                    placeholderTextColor="#71717A"
                  />
                </View>
                <View style={[styles.editorGroup, { flex: 1 }]}>
                  <Text style={styles.editorLabel}>వాక్య భాగం (Telugu)</Text>
                  <TextInput
                    style={styles.editorInput}
                    value={editScriptureTe}
                    onChangeText={setEditScriptureTe}
                    placeholder="ఉదా: ఆదికాండము 1:1-31"
                    placeholderTextColor="#71717A"
                  />
                </View>
              </View>

              {/* Big Idea */}
              <View style={styles.editorGroup}>
                <Text style={styles.editorLabel}>Big Idea / Main Truth (English)</Text>
                <TextInput
                  style={[styles.editorInput, { height: 60 }]}
                  value={editBigIdeaEn}
                  onChangeText={setEditBigIdeaEn}
                  placeholder="e.g. God is Almighty and created everything good."
                  placeholderTextColor="#71717A"
                  multiline
                />
              </View>

              <View style={styles.editorGroup}>
                <Text style={styles.editorLabel}>ప్రధాన సత్యం (Telugu)</Text>
                <TextInput
                  style={[styles.editorInput, { height: 60 }]}
                  value={editBigIdeaTe}
                  onChangeText={setEditBigIdeaTe}
                  placeholder="ఉదా: దేవుడు సర్వశక్తిమంతుడు, ప్రతిదానిని మంచిగా సృష్టించెను."
                  placeholderTextColor="#71717A"
                  multiline
                />
              </View>

              {/* Memory Verse */}
              <View style={styles.editorGroup}>
                <Text style={styles.editorLabel}>Memory Verse Reference</Text>
                <TextInput
                  style={styles.editorInput}
                  value={editVerseRef}
                  onChangeText={setEditVerseRef}
                  placeholder="e.g. Genesis 1:1 / ఆదికాండము 1:1"
                  placeholderTextColor="#71717A"
                />
              </View>

              <View style={styles.editorGroup}>
                <Text style={styles.editorLabel}>Memory Verse (English)</Text>
                <TextInput
                  style={[styles.editorInput, { height: 60 }]}
                  value={editVerseEn}
                  onChangeText={setEditVerseEn}
                  placeholder="e.g. In the beginning God created the heavens and the earth."
                  placeholderTextColor="#71717A"
                  multiline
                />
              </View>

              <View style={styles.editorGroup}>
                <Text style={styles.editorLabel}>కంఠస్థ వాక్యము (Telugu)</Text>
                <TextInput
                  style={[styles.editorInput, { height: 60 }]}
                  value={editVerseTe}
                  onChangeText={setEditVerseTe}
                  placeholder="ఉదా: ఆదియందు దేవుడు భూమ్యాకాశములను సృజించెను."
                  placeholderTextColor="#71717A"
                  multiline
                />
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
                      {editingLesson ? 'Save Changes' : 'Create & Add Lesson'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Modal>

        <DateTimePickerModal
          isVisible={showDatePicker}
          mode="date"
          date={curriculumConfig?.officialLaunchDate ? new Date(curriculumConfig.officialLaunchDate) : new Date()}
          onConfirm={handleConfirmLaunchDate}
          onCancel={() => setShowDatePicker(false)}
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
  launchCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
    marginBottom: 16,
    gap: 10,
  },
  launchCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  launchHeading: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 1,
  },
  launchStatusBadge: {
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
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderColor: '#FBBF24',
  },
  launchStatusText: {
    fontSize: 10,
    fontWeight: '800',
  },
  launchDescription: {
    fontSize: 12,
    color: '#D4D4D8',
    lineHeight: 18,
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
    backgroundColor: '#27272A',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  resetLaunchBtnText: {
    color: '#D4D4D8',
    fontSize: 11,
    fontWeight: '600',
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
  },
  titleSerif: {
    fontFamily: 'Georgia',
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  quarterNav: {
    backgroundColor: '#09090B',
    borderBottomWidth: 1,
    borderBottomColor: '#27272A',
  },
  quarterScroll: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  quarterChip: {
    backgroundColor: '#18181B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  quarterChipActive: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    borderColor: '#FBBF24',
  },
  quarterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D1D5DB',
  },
  quarterChipTextActive: {
    color: '#FBBF24',
  },
  quarterChipSub: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  quarterChipSubActive: {
    color: '#FCD34D',
  },
  scrollList: {
    padding: 16,
    gap: 14,
  },
  lessonCard: {
    backgroundColor: '#18181B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  lessonCardActive: {
    borderColor: '#10B981',
    backgroundColor: '#091512',
  },
  lessonTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  weekPill: {
    backgroundColor: '#27272A',
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
    color: '#9CA3AF',
    letterSpacing: 0.5,
  },
  weekPillTextActive: {
    color: '#10B981',
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
    fontWeight: '700',
    color: '#10B981',
  },
  lessonTitleEn: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  lessonTitleTe: {
    fontSize: 14,
    color: '#FBBF24',
    marginBottom: 4,
  },
  scriptureRefText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  chevronBox: {
    padding: 4,
  },
  bigIdeaBox: {
    backgroundColor: '#09090B',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#FBBF24',
  },
  bigIdeaLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  bigIdeaEn: {
    fontSize: 12,
    color: '#F3F4F6',
    fontWeight: '600',
  },
  bigIdeaTe: {
    fontSize: 11,
    color: '#D1D5DB',
    marginTop: 2,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    gap: 10,
  },
  setWeekBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#27272A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  setWeekBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FBBF24',
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
    gap: 6,
    backgroundColor: '#27272A',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  expandedSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    gap: 14,
  },
  verseBox: {
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
  },
  verseBoxHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  verseEn: {
    fontSize: 13,
    color: '#FFFFFF',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  verseRefTag: {
    fontSize: 11,
    color: '#FBBF24',
    fontWeight: '700',
    marginBottom: 6,
    marginTop: 2,
  },
  verseTe: {
    fontSize: 12,
    color: '#E5E7EB',
    lineHeight: 18,
  },
  teacherPrepCard: {
    backgroundColor: '#09090B',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  prepHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  prepPrayerEn: {
    fontSize: 12,
    color: '#E5E7EB',
    lineHeight: 17,
  },
  prepPrayerTe: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 3,
    lineHeight: 16,
  },
  suppliesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#18181B',
  },
  suppliesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FBBF24',
  },
  suppliesText: {
    fontSize: 11,
    color: '#D1D5DB',
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
    backgroundColor: '#18181B',
    padding: 8,
    borderRadius: 6,
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#27272A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  timeTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
  },
  timelineSegment: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  timelineDesc: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 1,
  },
  tierSection: {
    marginTop: 6,
  },
  tierSectionHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  tierNavRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  tierPill: {
    backgroundColor: '#27272A',
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
    color: '#9CA3AF',
  },
  tierPillTextActive: {
    color: '#000000',
  },
  tierGuideCard: {
    backgroundColor: '#09090B',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 8,
  },
  tierGuideTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FBBF24',
    marginBottom: 4,
  },
  tierField: {
    gap: 2,
  },
  tierFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  tierFieldValEn: {
    fontSize: 12,
    color: '#D1D5DB',
    lineHeight: 17,
  },
  tierFieldValTe: {
    fontSize: 11,
    color: '#9CA3AF',
    lineHeight: 16,
  },
  tierQuestionItem: {
    fontSize: 11,
    color: '#9CA3AF',
    lineHeight: 16,
    marginLeft: 4,
  },
  addLessonHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addLessonHeaderBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '800',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  editBtnText: {
    color: '#FBBF24',
    fontSize: 12,
    fontWeight: '700',
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
    color: '#D4D4D8',
  },
  editorInput: {
    backgroundColor: '#18181B',
    borderWidth: 1,
    borderColor: '#27272A',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#FFFFFF',
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
    backgroundColor: '#18181B',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  quarterMiniChipActive: {
    backgroundColor: '#FBBF24',
    borderColor: '#FBBF24',
  },
  quarterMiniChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A1A1AA',
  },
  quarterMiniChipTextActive: {
    color: '#000000',
  },
  saveLessonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FBBF24',
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 10,
  },
  saveLessonBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
});
