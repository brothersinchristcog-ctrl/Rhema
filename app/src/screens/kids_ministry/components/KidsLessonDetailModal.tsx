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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import {
  ArrowLeft,
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
  Clock,
  MessageCircle,
  Star,
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
import { getSongCardColor, isColorLight } from '../../SongsScreen';

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
  const { isDark } = useTheme();
  const [isPreparing, setIsPreparing] = useState(false);
  const [langMode, setLangMode] = useState<'both' | 'english' | 'telugu'>('both');
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
    if (copy.every((it, idx) => it.id === idx) && copy.length > 1) {
      [copy[0], copy[1]] = [copy[1], copy[0]];
    }
    return copy;
  }, [memoryWords, lesson?.id, shuffleSeed]);

  useEffect(() => {
    if (!visible || !lesson) return;
    setIsPreparing(false);
    setOrderedWordIds([]);
    setPracticeHint(null);
    setVerseMemorized(false);
  }, [lesson?.id, visible]);

  if (!lesson) return null;

  const screenBg = isDark ? '#0B0F19' : '#FFFDF9';
  const cardBg = isDark ? '#151B2B' : '#FFFFFF';
  const innerBg = isDark ? '#1E2538' : '#F8F4EC';
  const border = isDark ? '#283149' : '#EAE4D7';
  const textPrimary = isDark ? '#F8FAFC' : '#111827';
  const textSecondary = isDark ? '#94A3B8' : '#64748B';
  const textBody = isDark ? '#E2E8F0' : '#334155';
  const goldAccent = isDark ? '#FBBF24' : '#B45309';
  const goldBg = isDark ? 'rgba(251, 191, 36, 0.14)' : '#FEF3C7';
  const violetAccent = isDark ? '#A78BFA' : '#7C3AED';
  const blueAccent = isDark ? '#60A5FA' : '#2563EB';
  const emeraldAccent = isDark ? '#34D399' : '#059669';
  const purpleAccent = isDark ? '#C084FC' : '#7C3AED';
  const barStyle = isDark ? 'light-content' : 'dark-content';

  // Match week hero card with Songs palette
  const heroColorIdx = Math.max(0, (lesson.weekNumber || 1) - 1);
  const heroColor = getSongCardColor(heroColorIdx).color;
  const heroIsLight = isColorLight(heroColor);
  const heroTitleColor = heroIsLight ? '#0F172A' : '#FFFFFF';
  const heroSubColor = heroIsLight ? '#334155' : 'rgba(255, 255, 255, 0.86)';
  const heroPillBg = heroIsLight ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.18)';
  const heroPillBorder = heroIsLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.24)';
  const heroRingColor = heroIsLight ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.14)';

  const childTier = resolveLessonTierKey(
    child?.assignedTier as KidsClassTier | undefined,
    child?.age ?? 7
  );
  const tierGuide = lesson.tierGuides ? lesson.tierGuides[childTier] : null;
  const practiceComplete =
    memoryWords.length > 0 && orderedWordIds.length === memoryWords.length;

  const handleTapWordChip = (item: { id: number; word: string }) => {
    if (orderedWordIds.includes(item.id) || practiceComplete) return;
    const expectedWord = memoryWords[orderedWordIds.length];
    if (item.word === expectedWord) {
      setOrderedWordIds(prev => [...prev, item.id]);
      setPracticeHint(null);
    } else {
      setPracticeHint(
        `Hint: Try looking at word #${orderedWordIds.length + 1} in the verse above.`
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
    }, 350);
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
      const msg =
        `🌟 *THIS SUNDAY AT RHEMA SUNDAY SCHOOL*\n` +
        `*Lesson*: ${lesson.title} (${lesson.titleTelugu})\n` +
        `*Scripture*: ${lesson.scriptureRef}\n\n` +
        `🎯 *BIG TRUTH*: ${lesson.bigIdea}\n\n` +
        `⭐ *MEMORY VERSE*:\n"${lesson.memoryVerse.verseEnglish}" — ${lesson.memoryVerse.reference}\n` +
        `"${lesson.memoryVerse.verseTelugu}" — ${lesson.memoryVerse.referenceTelugu}\n\n` +
        `_Practice together at home this week!_`;

      await Share.share({ message: msg });
    } catch {
      // User dismissed share
    }
  };

  const showEng = langMode === 'both' || langMode === 'english';
  const showTel = langMode === 'both' || langMode === 'telugu';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top', 'bottom']}>
          <StatusBar barStyle={barStyle} backgroundColor={screenBg} />

          {/* Editorial Top Header */}
          <View style={[styles.headerRow, { borderBottomColor: border }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.iconCircleBtn, { backgroundColor: cardBg, borderColor: border }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ArrowLeft size={19} color={textPrimary} />
            </TouchableOpacity>

            <View style={styles.headerCenter}>
              <Text style={[styles.headerEyebrow, { color: violetAccent }]} numberOfLines={1}>
                {lesson.type === 'custom'
                  ? 'SUNDAY LESSON'
                  : `WEEK ${lesson.weekNumber} · ${(lesson.quarterTheme || 'BIBLE STUDY').toUpperCase()}`}
              </Text>
              <Text style={[styles.headerTitleSerif, { color: textPrimary }]} numberOfLines={1}>
                Weekly Bible Guide
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleShareLesson}
              style={[styles.iconCircleBtn, { backgroundColor: goldBg, borderColor: border }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Share2 size={17} color={goldAccent} />
            </TouchableOpacity>
          </View>

          {isPreparing ? (
            <View style={styles.loadingWrap}>
              <View style={[styles.loadingCard, { backgroundColor: cardBg, borderColor: border }]}>
                <ActivityIndicator size="large" color={violetAccent} />
                <Text style={[styles.loadingTitle, { color: textPrimary }]}>
                  Opening Week {lesson.weekNumber || ''} Lesson...
                </Text>
                <Text style={[styles.loadingSub, { color: textSecondary }]} numberOfLines={1}>
                  {lesson.title}
                </Text>
              </View>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
              {/* 1. Colorful Hero Lesson Banner */}
              <View
                style={[
                  styles.heroBannerCard,
                  {
                    backgroundColor: heroColor,
                    borderColor: heroIsLight
                      ? 'rgba(15, 23, 42, 0.08)'
                      : 'rgba(255, 255, 255, 0.16)',
                  },
                ]}
              >
                <View style={[styles.heroRingA, { borderColor: heroRingColor }]} pointerEvents="none" />
                <View style={[styles.heroRingB, { borderColor: heroRingColor }]} pointerEvents="none" />

                <View style={styles.heroMetaRow}>
                  <View
                    style={[
                      styles.heroPill,
                      { backgroundColor: heroPillBg, borderColor: heroPillBorder },
                    ]}
                  >
                    <Text style={[styles.heroPillText, { color: heroTitleColor }]}>
                      {lesson.type === 'custom' ? 'CUSTOM LESSON' : `WEEK ${lesson.weekNumber}`}
                    </Text>
                  </View>

                  {scheduledDate ? (
                    <View
                      style={[
                        styles.heroDatePill,
                        { backgroundColor: heroPillBg, borderColor: heroPillBorder },
                      ]}
                    >
                      <Calendar size={12} color={heroTitleColor} />
                      <Text style={[styles.heroDateText, { color: heroTitleColor }]}>
                        {formatCurriculumDateDisplay(scheduledDate)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text style={[styles.heroTitleEn, { color: heroTitleColor }]}>
                  {lesson.title}
                </Text>
                {lesson.titleTelugu ? (
                  <Text style={[styles.heroTitleTe, { color: heroSubColor }]}>
                    {lesson.titleTelugu}
                  </Text>
                ) : null}

                <View
                  style={[
                    styles.heroScriptureBar,
                    { backgroundColor: heroPillBg, borderColor: heroPillBorder },
                  ]}
                >
                  <BookOpen size={13.5} color={heroTitleColor} />
                  <Text style={[styles.heroScriptureText, { color: heroTitleColor }]} numberOfLines={2}>
                    {lesson.scriptureRef}
                    {lesson.scriptureRefTelugu ? ` · ${lesson.scriptureRefTelugu}` : ''}
                  </Text>
                </View>
              </View>

              {/* 2. Bilingual Language Switcher */}
              <View style={[styles.langSwitcher, { backgroundColor: innerBg, borderColor: border }]}>
                {(
                  [
                    { id: 'both', label: 'Bilingual' },
                    { id: 'english', label: 'English' },
                    { id: 'telugu', label: 'తెలుగు' },
                  ] as const
                ).map(tab => {
                  const active = langMode === tab.id;
                  return (
                    <TouchableOpacity
                      key={tab.id}
                      style={[
                        styles.langTab,
                        active && { backgroundColor: cardBg, borderColor: border, borderWidth: 1 },
                      ]}
                      onPress={() => setLangMode(tab.id)}
                      activeOpacity={0.85}
                    >
                      <Text
                        style={[
                          styles.langTabText,
                          { color: active ? violetAccent : textSecondary },
                          active && { fontWeight: '800' },
                        ]}
                      >
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 3. This Week's Big Truth Card */}
              <View
                style={[
                  styles.sectionCard,
                  {
                    backgroundColor: isDark ? 'rgba(251, 191, 36, 0.08)' : '#FFFBEB',
                    borderColor: isDark ? 'rgba(251, 191, 36, 0.25)' : '#FDE68A',
                  },
                ]}
              >
                <View style={styles.sectionHeaderRow}>
                  <View style={[styles.sectionIconCircle, { backgroundColor: goldBg }]}>
                    <Sparkles size={15} color={goldAccent} />
                  </View>
                  <Text style={[styles.sectionEyebrow, { color: goldAccent }]}>
                    THIS WEEK'S BIG TRUTH · ప్రధాన సత్యం
                  </Text>
                </View>
                {showEng && (
                  <Text style={[styles.truthEnText, { color: textPrimary }]}>{lesson.bigIdea}</Text>
                )}
                {showTel && lesson.bigIdeaTelugu ? (
                  <Text style={[styles.truthTeText, { color: textBody }]}>
                    {lesson.bigIdeaTelugu}
                  </Text>
                ) : null}
              </View>

              {/* 4. Interactive Memory Verse Challenge */}
              <View style={[styles.sectionCard, { backgroundColor: cardBg, borderColor: border }]}>
                <View style={styles.memoryHeaderRow}>
                  <View style={styles.sectionHeaderRow}>
                    <View
                      style={[
                        styles.sectionIconCircle,
                        { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.18)' : '#EFE9FE' },
                      ]}
                    >
                      <Star size={15} color={violetAccent} fill={violetAccent} />
                    </View>
                    <Text style={[styles.sectionEyebrow, { color: violetAccent }]}>
                      MEMORY VERSE CHALLENGE
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.listenPill, { backgroundColor: goldBg }]}
                    onPress={handleReciteAudio}
                    activeOpacity={0.82}
                  >
                    <Volume2 size={13} color={goldAccent} />
                    <Text style={[styles.listenPillText, { color: goldAccent }]}>
                      {playingAudio ? 'Playing...' : 'Recite'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.quoteShowcase, { backgroundColor: innerBg, borderColor: border }]}>
                  {showEng && (
                    <>
                      <Text style={[styles.quoteEnText, { color: textPrimary }]}>
                        “{lesson.memoryVerse.verseEnglish}”
                      </Text>
                      <Text style={[styles.quoteRefText, { color: violetAccent }]}>
                        — {lesson.memoryVerse.reference}
                      </Text>
                    </>
                  )}
                  {showEng && showTel && (
                    <View style={[styles.quoteDivider, { backgroundColor: border }]} />
                  )}
                  {showTel && (
                    <>
                      <Text style={[styles.quoteTeText, { color: textBody }]}>
                        “{lesson.memoryVerse.verseTelugu}”
                      </Text>
                      <Text style={[styles.quoteRefText, { color: goldAccent }]}>
                        — {lesson.memoryVerse.referenceTelugu}
                      </Text>
                    </>
                  )}
                </View>

                {/* Word Scramble Builder */}
                {memoryWords.length > 0 && (
                  <View style={styles.scrambleWrap}>
                    <View style={styles.scrambleHeaderRow}>
                      <Text style={[styles.scrambleLabel, { color: textSecondary }]}>
                        Build the verse ({orderedWordIds.length}/{memoryWords.length} words)
                      </Text>
                      {orderedWordIds.length > 0 && (
                        <TouchableOpacity
                          style={[styles.resetChip, { backgroundColor: innerBg, borderColor: border }]}
                          onPress={handleResetPractice}
                          activeOpacity={0.8}
                        >
                          <RotateCcw size={11} color={textSecondary} />
                          <Text style={[styles.resetChipText, { color: textSecondary }]}>Reset</Text>
                        </TouchableOpacity>
                      )}
                    </View>

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
                          Tap the word tiles below in exact verse order...
                        </Text>
                      ) : (
                        <View style={styles.wordsWrap}>
                          {orderedWordIds.map((wordId, seqIdx) => (
                            <View
                              key={`${wordId}-${seqIdx}`}
                              style={[
                                styles.builtWordChip,
                                practiceComplete && { backgroundColor: '#10B981' },
                              ]}
                            >
                              <Text style={styles.builtWordText}>{memoryWords[wordId]}</Text>
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
                          Awesome! You arranged the entire memory verse!
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.wordsWrap}>
                      {shuffledWordItems.map(item => {
                        const isUsed = orderedWordIds.includes(item.id);
                        return (
                          <TouchableOpacity
                            key={item.id}
                            style={[
                              styles.wordChip,
                              { backgroundColor: cardBg, borderColor: border },
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
                                isUsed && { color: textSecondary, opacity: 0.4 },
                              ]}
                            >
                              {item.word}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.memorizedBtn,
                    { backgroundColor: verseMemorized ? '#10B981' : violetAccent },
                  ]}
                  onPress={handleMarkMemorized}
                  activeOpacity={0.88}
                  disabled={verseMemorized}
                >
                  {verseMemorized ? (
                    <>
                      <Check size={18} color="#FFFFFF" />
                      <Text style={styles.memorizedBtnText}>Memorized! (+20 Points Earned)</Text>
                    </>
                  ) : (
                    <>
                      <Award size={18} color="#FFFFFF" />
                      <Text style={styles.memorizedBtnText}>
                        I Memorized This Verse! (+20 ★)
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              {/* 5. Linked Story, Quiz, Song & Custom Notes */}
              {(linkedStory ||
                linkedQuiz ||
                linkedSong ||
                lesson.customStorySummary ||
                lesson.customActivityNotes) && (
                <View style={[styles.sectionCard, { backgroundColor: cardBg, borderColor: border }]}>
                  <Text style={[styles.sectionEyebrow, { color: textSecondary }]}>
                    RELATED LEARNING MATERIALS
                  </Text>

                  {lesson.customStorySummary ? (
                    <View style={[styles.noteCard, { backgroundColor: innerBg, borderColor: border }]}>
                      <Text style={[styles.noteTitle, { color: goldAccent }]}>
                        📖 Bible Story Summary
                      </Text>
                      <Text style={[styles.noteBody, { color: textBody }]}>
                        {lesson.customStorySummary}
                      </Text>
                    </View>
                  ) : null}

                  {lesson.customActivityNotes ? (
                    <View style={[styles.noteCard, { backgroundColor: innerBg, borderColor: border }]}>
                      <Text style={[styles.noteTitle, { color: goldAccent }]}>
                        🎨 Weekly Activity & Craft
                      </Text>
                      <Text style={[styles.noteBody, { color: textBody }]}>
                        {lesson.customActivityNotes}
                      </Text>
                    </View>
                  ) : null}

                  {linkedStory && onOpenStory && (
                    <TouchableOpacity
                      style={[
                        styles.linkedCard,
                        {
                          backgroundColor: isDark ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF',
                          borderColor: isDark ? '#1D4ED8' : '#BFDBFE',
                        },
                      ]}
                      onPress={() => onOpenStory(linkedStory)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.linkedIconCircle, { backgroundColor: blueAccent }]}>
                        <BookOpen size={17} color="#FFFFFF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.linkedTag, { color: blueAccent }]}>
                          READ BIBLE STORY
                        </Text>
                        <Text style={[styles.linkedTitle, { color: textPrimary }]} numberOfLines={1}>
                          {linkedStory.title}
                        </Text>
                      </View>
                      <ChevronRight size={18} color={blueAccent} />
                    </TouchableOpacity>
                  )}

                  {linkedQuiz && onOpenQuiz && (
                    <TouchableOpacity
                      style={[
                        styles.linkedCard,
                        {
                          backgroundColor: isDark ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
                          borderColor: isDark ? '#065F46' : '#A7F3D0',
                        },
                      ]}
                      onPress={() => onOpenQuiz(linkedQuiz)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.linkedIconCircle, { backgroundColor: emeraldAccent }]}>
                        <Award size={17} color="#FFFFFF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.linkedTag, { color: emeraldAccent }]}>
                          PLAY INTERACTIVE QUIZ
                        </Text>
                        <Text style={[styles.linkedTitle, { color: textPrimary }]} numberOfLines={1}>
                          {linkedQuiz.title}
                        </Text>
                      </View>
                      <ChevronRight size={18} color={emeraldAccent} />
                    </TouchableOpacity>
                  )}

                  {linkedSong && onOpenSong && (
                    <TouchableOpacity
                      style={[
                        styles.linkedCard,
                        {
                          backgroundColor: isDark ? 'rgba(168, 85, 247, 0.12)' : '#F5F3FF',
                          borderColor: isDark ? '#6D28D9' : '#DDD6FE',
                        },
                      ]}
                      onPress={() => onOpenSong(linkedSong)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.linkedIconCircle, { backgroundColor: purpleAccent }]}>
                        <Music size={17} color="#FFFFFF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.linkedTag, { color: purpleAccent }]}>
                          SING ACTION SONG
                        </Text>
                        <Text style={[styles.linkedTitle, { color: textPrimary }]} numberOfLines={1}>
                          {linkedSong.title}
                        </Text>
                      </View>
                      <ChevronRight size={18} color={purpleAccent} />
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* 6. Age-Tier Activity & Family Talk Questions */}
              {tierGuide && (
                <View style={[styles.sectionCard, { backgroundColor: cardBg, borderColor: border }]}>
                  <View style={styles.tierHeader}>
                    <View
                      style={[
                        styles.tierBadgePill,
                        { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5' },
                      ]}
                    >
                      <Text style={[styles.tierBadgeText, { color: emeraldAccent }]}>
                        {tierGuide.tierName.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.activityTitle, { color: textPrimary }]}>
                    🎨 {tierGuide.activityName}
                  </Text>
                  {showEng && (
                    <Text style={[styles.activityDescEn, { color: textBody }]}>
                      {tierGuide.activityInstructions}
                    </Text>
                  )}
                  {showTel && tierGuide.activityInstructionsTelugu ? (
                    <Text style={[styles.activityDescTe, { color: textSecondary }]}>
                      {tierGuide.activityInstructionsTelugu}
                    </Text>
                  ) : null}

                  {tierGuide.discussionQuestions?.length > 0 && (
                    <View style={[styles.discussionBlock, { borderTopColor: border }]}>
                      <View style={styles.sectionHeaderRow}>
                        <MessageCircle size={15} color={goldAccent} />
                        <Text style={[styles.discussionHeading, { color: goldAccent }]}>
                          Family Talk Questions
                        </Text>
                      </View>
                      {tierGuide.discussionQuestions.map((q, idx) => (
                        <View
                          key={idx}
                          style={[styles.qRowCard, { backgroundColor: innerBg, borderColor: border }]}
                        >
                          <View style={[styles.qNumBadge, { backgroundColor: goldBg }]}>
                            <Text style={[styles.qNumText, { color: goldAccent }]}>{idx + 1}</Text>
                          </View>
                          <Text style={[styles.qRowText, { color: textBody }]}>{q}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* 7. Sunday Classroom Schedule */}
              {lesson.teacherPrep?.schedule?.length > 0 && (
                <View style={[styles.sectionCard, { backgroundColor: cardBg, borderColor: border }]}>
                  <View style={styles.sectionHeaderRow}>
                    <Clock size={14} color={textSecondary} />
                    <Text style={[styles.sectionEyebrow, { color: textSecondary }]}>
                      SUNDAY CLASSROOM SCHEDULE
                    </Text>
                  </View>

                  <View style={styles.schedList}>
                    {lesson.teacherPrep.schedule.map((item, idx) => (
                      <View
                        key={idx}
                        style={[styles.schedRow, { backgroundColor: innerBg, borderColor: border }]}
                      >
                        <View style={[styles.schedPill, { backgroundColor: goldBg }]}>
                          <Text style={[styles.schedPillText, { color: goldAccent }]}>
                            {item.timeMinutes}m
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.schedSegment, { color: textPrimary }]}>
                            {item.segment}
                          </Text>
                          <Text style={[styles.schedDesc, { color: textSecondary }]}>
                            {item.description}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  iconCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.0,
  },
  headerTitleSerif: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 1,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  loadingCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 30,
    paddingHorizontal: 22,
    alignItems: 'center',
    gap: 10,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },
  loadingSub: {
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 42,
    gap: 14,
  },
  heroBannerCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    overflow: 'hidden',
    position: 'relative',
    gap: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  heroRingA: {
    position: 'absolute',
    right: -24,
    bottom: -36,
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 1.5,
  },
  heroRingB: {
    position: 'absolute',
    right: 22,
    bottom: -56,
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 1.5,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  heroPill: {
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  heroPillText: {
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  heroDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  heroDateText: {
    fontSize: 11,
    fontWeight: '700',
  },
  heroTitleEn: {
    fontSize: 21,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    lineHeight: 27,
  },
  heroTitleTe: {
    fontSize: 14.5,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: -4,
  },
  heroScriptureBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 2,
  },
  heroScriptureText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 17,
  },
  langSwitcher: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  langTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  langTabText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  truthEnText: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 23,
  },
  truthTeText: {
    fontSize: 14.5,
    lineHeight: 22,
    fontWeight: '600',
  },
  memoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  listenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  listenPillText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  quoteShowcase: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  quoteEnText: {
    fontSize: 15.5,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '700',
    lineHeight: 23,
  },
  quoteRefText: {
    fontSize: 12,
    fontWeight: '800',
  },
  quoteDivider: {
    height: 1,
    width: '100%',
    marginVertical: 4,
  },
  quoteTeText: {
    fontSize: 14.5,
    lineHeight: 22,
    fontWeight: '600',
  },
  scrambleWrap: {
    gap: 10,
    marginTop: 2,
  },
  scrambleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  scrambleLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  resetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  resetChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  answerTray: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: 12,
    minHeight: 54,
    justifyContent: 'center',
  },
  answerPlaceholder: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  wordsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  builtWordChip: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  builtWordText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  wordChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  wordChipUsed: {
    opacity: 0.45,
  },
  wordChipText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  practiceHintText: {
    fontSize: 11.5,
    color: '#D97706',
    fontWeight: '600',
  },
  practiceSuccessBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  practiceSuccessText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  memorizedBtn: {
    borderRadius: 999,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  memorizedBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  noteCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 13,
    gap: 5,
  },
  noteTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  noteBody: {
    fontSize: 13.5,
    lineHeight: 20,
  },
  linkedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  linkedIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  linkedTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  linkedTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    marginTop: 2,
  },
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierBadgePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tierBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  activityDescEn: {
    fontSize: 14,
    lineHeight: 21,
  },
  activityDescTe: {
    fontSize: 13.5,
    lineHeight: 21,
    fontWeight: '500',
  },
  discussionBlock: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
    gap: 8,
  },
  discussionHeading: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  qRowCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 11,
    borderRadius: 13,
    borderWidth: 1,
  },
  qNumBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  qNumText: {
    fontSize: 12,
    fontWeight: '800',
  },
  qRowText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '500',
  },
  schedList: {
    gap: 8,
  },
  schedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    padding: 11,
    borderRadius: 14,
    borderWidth: 1,
  },
  schedPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  schedPillText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  schedSegment: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  schedDesc: {
    fontSize: 12,
    marginTop: 1,
    lineHeight: 17,
  },
});
