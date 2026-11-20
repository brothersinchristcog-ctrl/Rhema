import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Share,
  Alert,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import {
  X,
  Sparkles,
  BookOpen,
  Award,
  Share2,
  Volume2,
  Check,
  Music,
  ChevronRight,
  Calendar,
  RotateCcw,
} from 'lucide-react-native';
import {
  KidsCurriculumLesson,
  KidsClassTier,
  ChildRecord,
  KidsBibleStory,
  KidsQuiz,
  KidsWorshipSong,
  formatCurriculumDateDisplay,
  resolveLessonTierKey,
} from '../../../types/KidsMinistryTypes';
import { useTheme } from '../../../context/ThemeContext';

interface Props {
  visible: boolean;
  lesson: KidsCurriculumLesson | null;
  child?: ChildRecord | null;
  scheduledDate?: string | null;
  linkedStory?: KidsBibleStory | null;
  linkedQuiz?: KidsQuiz | null;
  linkedSong?: KidsWorshipSong | null;
  onOpenStory?: (story: KidsBibleStory) => void;
  onOpenQuiz?: (quiz: KidsQuiz) => void;
  onOpenSong?: (song: KidsWorshipSong) => void;
  onClose: () => void;
}

export default function KidsLessonDetailModal({
  visible,
  lesson,
  child,
  scheduledDate,
  linkedStory,
  linkedQuiz,
  linkedSong,
  onOpenStory,
  onOpenQuiz,
  onOpenSong,
  onClose,
}: Props) {
  const { isDark, colors: themeColors } = useTheme();
  const [verseMemorized, setVerseMemorized] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);
  const [orderedWordIds, setOrderedWordIds] = useState<number[]>([]);
  const [practiceHint, setPracticeHint] = useState<string | null>(null);
  const [shuffleSeed, setShuffleSeed] = useState(0);

  const memoryWords = useMemo(() => {
    const raw = (lesson?.memoryVerse?.verseEnglish || '').trim();
    return raw ? raw.split(/\s+/) : [];
  }, [lesson?.memoryVerse?.verseEnglish]);

  const shuffledWordItems = useMemo(() => {
    const items = memoryWords.map((word, idx) => ({ id: idx, word }));
    if (items.length <= 1) return items;
    const copy = [...items];
    // Deterministic Fisher-Yates seeded by lesson id & reset counter so chips stay stable while tapping
    let seed =
      shuffleSeed +
      (lesson?.id || 'lesson')
        .split('')
        .reduce((acc, ch) => acc + ch.charCodeAt(0), 17);
    for (let i = copy.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = seed % (i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    // Ensure scrambled order if possible
    if (copy.every((it, idx) => it.id === idx) && copy.length > 1) {
      [copy[0], copy[1]] = [copy[1], copy[0]];
    }
    return copy;
  }, [memoryWords, lesson?.id, shuffleSeed]);

  useEffect(() => {
    setOrderedWordIds([]);
    setPracticeHint(null);
    setVerseMemorized(false);
  }, [lesson?.id, visible]);

  if (!lesson) return null;

  const screenBg = isDark ? '#000000' : (themeColors.background || '#FAF7F2');
  const cardBg = isDark ? '#18181B' : (themeColors.surface || '#FFFFFF');
  const innerBg = isDark ? '#09090B' : '#F1F5F9';
  const border = isDark ? '#27272A' : (themeColors.border || '#E2E8F0');
  const textPrimary = isDark ? '#FFFFFF' : (themeColors.text || '#0F172A');
  const textSecondary = isDark ? '#9CA3AF' : (themeColors.textSecondary || '#64748B');
  const textBody = isDark ? '#D1D5DB' : '#334155';
  const goldAccent = isDark ? '#FBBF24' : '#D97706';
  const blueAccent = isDark ? '#60A5FA' : '#2563EB';
  const emeraldAccent = isDark ? '#34D399' : '#059669';
  const purpleAccent = isDark ? '#C084FC' : '#7C3AED';
  const barStyle = isDark ? 'light-content' : 'dark-content';

  const childTier = resolveLessonTierKey(child?.assignedTier as KidsClassTier | undefined, child?.age ?? 7);
  const tierGuide = lesson.tierGuides ? lesson.tierGuides[childTier] : null;
  const practiceComplete = memoryWords.length > 0 && orderedWordIds.length === memoryWords.length;

  const handleTapWordChip = (item: { id: number; word: string }) => {
    if (orderedWordIds.includes(item.id) || practiceComplete) return;
    const expectedWord = memoryWords[orderedWordIds.length];
    if (item.word === expectedWord) {
      setOrderedWordIds(prev => [...prev, item.id]);
      setPracticeHint(null);
    } else {
      setPracticeHint(
        `Try word #${orderedWordIds.length + 1} next (look closely at the verse above!)`
      );
    }
  };

  const handleResetPractice = () => {
    setOrderedWordIds([]);
    setPracticeHint(null);
    setShuffleSeed(prev => prev + 1);
  };

  const handleReciteAudio = () => {
    setPlayingAudio(true);
    setTimeout(() => {
      setPlayingAudio(false);
      Alert.alert(
        'Scripture Recitation',
        `"${lesson.memoryVerse.verseEnglish}"\n\n"${lesson.memoryVerse.verseTelugu}"\n\n— ${lesson.memoryVerse.reference}`
      );
    }, 400);
  };

  const handleMarkMemorized = () => {
    setVerseMemorized(true);
    Alert.alert(
      'Superstar Memory Champion! ⭐',
      `You mastered ${lesson.memoryVerse.reference}!\n+20 Kingdom Reward Points earned for Sunday!`
    );
  };

  const handleShareLesson = async () => {
    try {
      const msg = `🌟 *THIS SUNDAY AT RHEMA SUNDAY SCHOOL*\n` +
        `*Lesson*: ${lesson.title} (${lesson.titleTelugu})\n` +
        `*Scripture*: ${lesson.scriptureRef}\n\n` +
        `🎯 *BIG TRUTH*: ${lesson.bigIdea}\n\n` +
        `⭐ *MEMORY VERSE*:\n"${lesson.memoryVerse.verseEnglish}" — ${lesson.memoryVerse.reference}\n` +
        `"${lesson.memoryVerse.verseTelugu}" — ${lesson.memoryVerse.referenceTelugu}\n\n` +
        `_Practice together at home this week!_`;

      await Share.share({ message: msg });
    } catch (e) {
      // User dismissed share
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top', 'bottom']}>
          <StatusBar barStyle={barStyle} backgroundColor={screenBg} />

          {/* Header */}
          <View style={[styles.headerRow, { borderBottomColor: border }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: isDark ? '#27272A' : '#F1F5F9' }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={textPrimary} />
            </TouchableOpacity>
            <View style={styles.headerTitles}>
              <Text style={[styles.titleSerif, { color: textPrimary }]} numberOfLines={1}>
                Sunday Bible Lesson
              </Text>
              <Text style={[styles.subtitle, { color: textSecondary }]} numberOfLines={1}>
                {lesson.type === 'custom'
                  ? scheduledDate
                    ? formatCurriculumDateDisplay(scheduledDate)
                    : lesson.quarterTheme
                  : `Week ${lesson.weekNumber} · ${lesson.quarterTheme}`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleShareLesson}
              style={[styles.shareIconBtn, { backgroundColor: isDark ? 'rgba(251, 191, 36, 0.15)' : '#FEF3C7' }]}
            >
              <Share2 size={18} color={goldAccent} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Hero Lesson Card */}
            <View style={[styles.heroCard, { backgroundColor: cardBg, borderColor: border }, !isDark && styles.lightShadow]}>
              <View style={styles.heroBadgeRow}>
                <View style={[styles.weekTag, { backgroundColor: isDark ? 'rgba(251, 191, 36, 0.2)' : '#FEF3C7' }]}>
                  <Text style={[styles.weekTagText, { color: goldAccent }]}>
                    {lesson.type === 'custom' ? 'CUSTOM LESSON' : `WEEK ${lesson.weekNumber}`}
                  </Text>
                </View>
                {scheduledDate ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Calendar size={12} color={textSecondary} />
                    <Text style={[styles.academicYearText, { color: textSecondary }]}>
                      {formatCurriculumDateDisplay(scheduledDate)}
                    </Text>
                  </View>
                ) : null}
              </View>

              <Text style={[styles.lessonTitleEn, { color: textPrimary }]}>{lesson.title}</Text>
              <Text style={[styles.lessonTitleTe, { color: goldAccent }]}>{lesson.titleTelugu}</Text>
              <Text style={[styles.scriptureRefText, { color: textSecondary }]}>
                📖 Scripture: {lesson.scriptureRef} · {lesson.scriptureRefTelugu}
              </Text>
            </View>

            {/* Big Truth / ప్రధాన సత్యం Banner */}
            <View
              style={[
                styles.truthBanner,
                {
                  backgroundColor: isDark ? 'rgba(251, 191, 36, 0.08)' : '#FFFBEB',
                  borderLeftColor: goldAccent,
                },
              ]}
            >
              <View style={styles.truthHeader}>
                <Sparkles size={16} color={goldAccent} />
                <Text style={[styles.truthHeading, { color: goldAccent }]}>THIS WEEK'S BIG TRUTH / ప్రధాన సత్యం</Text>
              </View>
              <Text style={[styles.truthEn, { color: textPrimary }]}>{lesson.bigIdea}</Text>
              <Text style={[styles.truthTe, { color: textBody }]}>{lesson.bigIdeaTelugu}</Text>
            </View>

            {/* Interactive Memory Verse Card */}
            <View style={[styles.memoryCard, { backgroundColor: cardBg, borderColor: border }, !isDark && styles.lightShadow]}>
              <View style={styles.memoryCardHeader}>
                <View style={styles.memoryTitleGroup}>
                  <Award size={18} color={goldAccent} />
                  <Text style={[styles.memoryHeading, { color: goldAccent }]}>MEMORY VERSE CHALLENGE</Text>
                </View>
                <TouchableOpacity
                  style={[styles.listenBtn, { backgroundColor: isDark ? 'rgba(251, 191, 36, 0.15)' : '#FEF3C7' }]}
                  onPress={handleReciteAudio}
                  activeOpacity={0.8}
                >
                  <Volume2 size={14} color={goldAccent} />
                  <Text style={[styles.listenBtnText, { color: goldAccent }]}>
                    {playingAudio ? 'Playing...' : 'Listen'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={[styles.quoteBox, { backgroundColor: innerBg, borderWidth: 1, borderColor: border }]}>
                <Text style={[styles.quoteEn, { color: textPrimary }]}>"{lesson.memoryVerse.verseEnglish}"</Text>
                <Text style={[styles.quoteRef, { color: goldAccent }]}>— {lesson.memoryVerse.reference}</Text>
                <Text style={[styles.quoteTe, { color: textBody }]}>"{lesson.memoryVerse.verseTelugu}"</Text>
                <Text style={[styles.quoteRef, { color: goldAccent }]}>— {lesson.memoryVerse.referenceTelugu}</Text>
              </View>

              {/* Interactive Word Order Builder */}
              <View style={styles.wordPracticeHeader}>
                <Text style={[styles.wordPracticePrompt, { color: textSecondary }]}>
                  Tap words in order to practice ({orderedWordIds.length}/{memoryWords.length}):
                </Text>
                {orderedWordIds.length > 0 && (
                  <TouchableOpacity
                    style={[styles.resetPracticeBtn, { backgroundColor: innerBg, borderColor: border }]}
                    onPress={handleResetPractice}
                    activeOpacity={0.8}
                  >
                    <RotateCcw size={11} color={textSecondary} />
                    <Text style={[styles.resetPracticeText, { color: textSecondary }]}>Reset</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Sentence Builder Answer Tray */}
              <View
                style={[
                  styles.answerTray,
                  {
                    backgroundColor: innerBg,
                    borderColor: practiceComplete ? '#10B981' : border,
                  },
                ]}
              >
                {orderedWordIds.length === 0 ? (
                  <Text style={[styles.answerPlaceholder, { color: textSecondary }]}>
                    Tap the scrambled words below in the correct verse order...
                  </Text>
                ) : (
                  <View style={styles.wordsWrap}>
                    {orderedWordIds.map((wordId, seqIdx) => (
                      <View
                        key={`${wordId}-${seqIdx}`}
                        style={[
                          styles.builtWordChip,
                          practiceComplete && styles.builtWordChipComplete,
                        ]}
                      >
                        <Text
                          style={[
                            styles.builtWordText,
                            practiceComplete && { color: '#FFFFFF' },
                          ]}
                        >
                          {memoryWords[wordId]}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {practiceHint ? (
                <Text style={styles.practiceHintText}>{practiceHint}</Text>
              ) : practiceComplete ? (
                <View style={styles.practiceSuccessBanner}>
                  <Check size={14} color="#10B981" />
                  <Text style={styles.practiceSuccessText}>
                    Great job! You placed every word in the exact order!
                  </Text>
                </View>
              ) : null}

              {/* Scrambled Word Bank */}
              <View style={styles.wordsWrap}>
                {shuffledWordItems.map(item => {
                  const isUsed = orderedWordIds.includes(item.id);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.wordChip,
                        { backgroundColor: innerBg, borderColor: border, borderWidth: 1 },
                        isUsed && styles.wordChipUsed,
                      ]}
                      onPress={() => handleTapWordChip(item)}
                      disabled={isUsed || practiceComplete}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.wordChipText,
                          { color: textPrimary },
                          isUsed && { color: textSecondary, opacity: 0.45 },
                        ]}
                      >
                        {item.word}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Memorized Completion Button */}
              <TouchableOpacity
                style={[styles.memorizedBtn, verseMemorized && styles.memorizedBtnDone]}
                onPress={handleMarkMemorized}
                activeOpacity={0.88}
                disabled={verseMemorized}
              >
                {verseMemorized ? (
                  <>
                    <Check size={18} color="#FFFFFF" />
                    <Text style={styles.memorizedBtnTextDone}>Memorized! (+20 Points Earned)</Text>
                  </>
                ) : (
                  <>
                    <Award size={18} color="#000000" />
                    <Text style={styles.memorizedBtnText}>I Have Memorized This Verse! ⭐</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Linked Learning Materials (Bible Story, Quiz, Action Song) & Story Summary */}
            {(linkedStory || linkedQuiz || linkedSong || lesson.customStorySummary || lesson.customActivityNotes) && (
              <View style={[styles.linkedSection, { backgroundColor: cardBg, borderColor: border }, !isDark && styles.lightShadow]}>
                <Text style={[styles.scheduleHeading, { color: textSecondary }]}>WEEKLY ACTIVITIES, STORY & QUIZ</Text>

                {lesson.customStorySummary ? (
                  <View style={[styles.customNoteBox, { backgroundColor: innerBg, borderColor: border }]}>
                    <Text style={[styles.customNoteTitle, { color: goldAccent }]}>📖 Bible Story Summary</Text>
                    <Text style={[styles.customNoteText, { color: textBody }]}>{lesson.customStorySummary}</Text>
                  </View>
                ) : null}

                {lesson.customActivityNotes ? (
                  <View style={[styles.customNoteBox, { backgroundColor: innerBg, borderColor: border }]}>
                    <Text style={[styles.customNoteTitle, { color: goldAccent }]}>🎨 Weekly Activity & Craft</Text>
                    <Text style={[styles.customNoteText, { color: textBody }]}>{lesson.customActivityNotes}</Text>
                  </View>
                ) : null}

                {linkedStory && onOpenStory && (
                  <TouchableOpacity
                    style={[styles.linkedActionCard, { backgroundColor: innerBg, borderColor: border }]}
                    onPress={() => onOpenStory(linkedStory)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.linkedIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                      <BookOpen size={18} color={blueAccent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.linkedTag, { color: blueAccent }]}>READ BIBLE STORY</Text>
                      <Text style={[styles.linkedTitle, { color: textPrimary }]}>{linkedStory.title}</Text>
                    </View>
                    <ChevronRight size={18} color={blueAccent} />
                  </TouchableOpacity>
                )}

                {linkedQuiz && onOpenQuiz && (
                  <TouchableOpacity
                    style={[styles.linkedActionCard, { backgroundColor: innerBg, borderColor: border }]}
                    onPress={() => onOpenQuiz(linkedQuiz)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.linkedIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                      <Award size={18} color={emeraldAccent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.linkedTag, { color: emeraldAccent }]}>PLAY INTERACTIVE QUIZ</Text>
                      <Text style={[styles.linkedTitle, { color: textPrimary }]}>{linkedQuiz.title}</Text>
                    </View>
                    <ChevronRight size={18} color={emeraldAccent} />
                  </TouchableOpacity>
                )}

                {linkedSong && onOpenSong && (
                  <TouchableOpacity
                    style={[styles.linkedActionCard, { backgroundColor: innerBg, borderColor: border }]}
                    onPress={() => onOpenSong(linkedSong)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.linkedIconBox, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
                      <Music size={18} color={purpleAccent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.linkedTag, { color: purpleAccent }]}>SING WORSHIP SONG</Text>
                      <Text style={[styles.linkedTitle, { color: textPrimary }]}>{linkedSong.title}</Text>
                    </View>
                    <ChevronRight size={18} color={purpleAccent} />
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Tier-Specific Adaptation for this child */}
            {tierGuide && (
              <View style={[styles.tierActivityCard, { backgroundColor: cardBg, borderColor: border }, !isDark && styles.lightShadow]}>
                <View style={styles.tierHeader}>
                  <Text style={[styles.tierBadge, { color: emeraldAccent }]}>{tierGuide.tierName.toUpperCase()}</Text>
                </View>

                <Text style={[styles.activityTitle, { color: textPrimary }]}>🎨 {tierGuide.activityName}</Text>
                <Text style={[styles.activityInstructionsEn, { color: textBody }]}>
                  {tierGuide.activityInstructions}
                </Text>
                <Text style={[styles.activityInstructionsTe, { color: textSecondary }]}>
                  {tierGuide.activityInstructionsTelugu}
                </Text>

                {tierGuide.discussionQuestions?.length > 0 && (
                  <View style={[styles.discussionSection, { borderTopColor: border }]}>
                    <Text style={[styles.discussionHeading, { color: goldAccent }]}>Family Talk Questions:</Text>
                    {tierGuide.discussionQuestions.map((q, idx) => (
                      <View key={idx} style={styles.qItemRow}>
                        <Text style={[styles.qBullet, { color: goldAccent }]}>•</Text>
                        <Text style={[styles.qText, { color: textBody }]}>{q}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* Teacher Schedule Overview for Parents */}
            {lesson.teacherPrep?.schedule?.length > 0 && (
              <View style={[styles.classScheduleCard, { backgroundColor: cardBg, borderColor: border }, !isDark && styles.lightShadow]}>
                <Text style={[styles.scheduleHeading, { color: textSecondary }]}>SUNDAY CLASSROOM SCHEDULE (45 MIN)</Text>
                {lesson.teacherPrep.schedule.map((item, idx) => (
                  <View key={idx} style={[styles.schedRow, { backgroundColor: innerBg }]}>
                    <View style={[styles.schedPill, { backgroundColor: isDark ? '#27272A' : '#FEF3C7' }]}>
                      <Text style={[styles.schedPillText, { color: goldAccent }]}>{item.timeMinutes}m</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.schedSegment, { color: textPrimary }]}>{item.segment}</Text>
                      <Text style={[styles.schedDesc, { color: textSecondary }]}>{item.description}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
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
  lightShadow: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
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
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  shareIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekTag: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  weekTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  academicYearText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  lessonTitleEn: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 3,
  },
  lessonTitleTe: {
    fontSize: 15,
    color: '#FBBF24',
    marginBottom: 6,
  },
  scriptureRefText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  truthBanner: {
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#FBBF24',
  },
  truthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  truthHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  truthEn: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  truthTe: {
    fontSize: 13,
    color: '#E5E7EB',
    marginTop: 4,
    lineHeight: 18,
  },
  memoryCard: {
    backgroundColor: '#18181B',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 12,
  },
  memoryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memoryTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memoryHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  listenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  listenBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FBBF24',
  },
  quoteBox: {
    backgroundColor: '#09090B',
    padding: 12,
    borderRadius: 10,
    gap: 3,
  },
  quoteEn: {
    fontSize: 14,
    color: '#FFFFFF',
    fontStyle: 'italic',
    lineHeight: 20,
  },
  quoteRef: {
    fontSize: 11,
    color: '#FBBF24',
    fontWeight: '700',
    marginBottom: 4,
  },
  quoteTe: {
    fontSize: 13,
    color: '#E5E7EB',
    lineHeight: 18,
  },
  wordPracticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  wordPracticePrompt: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#9CA3AF',
    flex: 1,
  },
  resetPracticeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  resetPracticeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  answerTray: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 12,
    minHeight: 54,
    justifyContent: 'center',
  },
  answerPlaceholder: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  builtWordChip: {
    backgroundColor: '#FBBF24',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  builtWordChipComplete: {
    backgroundColor: '#059669',
  },
  builtWordText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#000000',
  },
  practiceHintText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#D97706',
  },
  practiceSuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  practiceSuccessText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
    flex: 1,
  },
  wordsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  wordChip: {
    backgroundColor: '#27272A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  wordChipUsed: {
    borderStyle: 'dashed',
  },
  wordChipActive: {
    backgroundColor: '#FBBF24',
  },
  wordChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#D1D5DB',
  },
  wordChipTextActive: {
    color: '#000000',
    fontWeight: 'bold',
  },
  memorizedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FBBF24',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  memorizedBtnDone: {
    backgroundColor: '#059669',
  },
  memorizedBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
  },
  memorizedBtnTextDone: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  tierActivityCard: {
    backgroundColor: '#18181B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 8,
  },
  tierHeader: {
    marginBottom: 2,
  },
  tierBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  activityTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  activityInstructionsEn: {
    fontSize: 12,
    color: '#D1D5DB',
    lineHeight: 18,
  },
  activityInstructionsTe: {
    fontSize: 11,
    color: '#9CA3AF',
    lineHeight: 16,
  },
  discussionSection: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#27272A',
    gap: 4,
  },
  discussionHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FBBF24',
    marginBottom: 2,
  },
  qItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  qBullet: {
    color: '#FBBF24',
    fontSize: 12,
  },
  qText: {
    fontSize: 12,
    color: '#D1D5DB',
    flex: 1,
    lineHeight: 17,
  },
  classScheduleCard: {
    backgroundColor: '#09090B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 8,
  },
  scheduleHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  schedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#18181B',
    padding: 8,
    borderRadius: 8,
  },
  schedPill: {
    backgroundColor: '#27272A',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  schedPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
  },
  schedSegment: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  schedDesc: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 1,
  },
  linkedSection: {
    backgroundColor: '#09090B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 10,
  },
  customNoteBox: {
    backgroundColor: '#18181B',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 4,
  },
  customNoteTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FBBF24',
  },
  customNoteText: {
    fontSize: 12,
    color: '#D1D5DB',
    lineHeight: 17,
  },
  linkedActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#18181B',
    padding: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  linkedIconBox: {
    width: 36,
    height: 36,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedTag: {
    fontSize: 9,
    fontWeight: '800',
    color: '#60A5FA',
    letterSpacing: 0.6,
  },
  linkedTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 1,
  },
});
