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
} from 'react-native';
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
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={styles.titleSerif}>52-Week Curriculum</Text>
            <Text style={styles.subtitle}>Bilingual Telugu & English Syllabus (2026-2027)</Text>
          </View>
          <View style={{ width: 36 }} />
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Calendar size={16} color="#FBBF24" />
                <Text style={styles.launchHeading}>OFFICIAL LAUNCH & SUNDAY SCHEDULE</Text>
              </View>
              <View style={[styles.launchStatusBadge, curriculumConfig?.isLaunched ? styles.launchActiveBadge : styles.launchPendingBadge]}>
                <Text style={[styles.launchStatusText, curriculumConfig?.isLaunched ? { color: '#10B981' } : { color: '#FBBF24' }]}>
                  {curriculumConfig?.isLaunched ? '🚀 ACTIVE' : '⏳ PENDING LAUNCH'}
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
                      <CheckCircle2 size={15} color="#FBBF24" />
                      <Text style={styles.setWeekBtnText}>
                        {updatingWeek === lesson.weekNumber ? 'Setting...' : 'Set Active for Sunday'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.activeLockedNotice}>
                      <CheckCircle2 size={15} color="#10B981" />
                      <Text style={styles.activeLockedText}>Live Across Rhema</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.shareBtn}
                    onPress={() => handleShareToTeachers(lesson)}
                  >
                    <Share2 size={15} color="#E5E7EB" />
                    <Text style={styles.shareBtnText}>Share to Teachers</Text>
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
    paddingTop: 16,
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
});
