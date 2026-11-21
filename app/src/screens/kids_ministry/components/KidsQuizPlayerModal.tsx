import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Award,
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  Play,
  RefreshCw,
  Trophy,
  ChevronRight,
} from 'lucide-react-native';
import { KidsQuiz, KidsQuizQuestion } from '../../../types/KidsMinistryTypes';
import { useTheme } from '../../../context/ThemeContext';
import { estimateQuizMinutes } from '../../../services/KidsQuizDocumentService';

export type QuizLangMode = 'both' | 'english' | 'telugu';

interface KidsQuizExperienceProps {
  quiz: KidsQuiz;
  onClose: () => void;
  isPreview?: boolean;
}

/**
 * Shared Quiz Experience View (Intro Details -> Bilingual Questions -> Final Results).
 * Used by both Member View (KidsQuizPlayerModal) and Admin Quiz Preview.
 */
export function KidsQuizExperienceView({
  quiz,
  onClose,
  isPreview = false,
}: KidsQuizExperienceProps) {
  const { isDark, colors: themeColors } = useTheme();
  const [stage, setStage] = useState<'intro' | 'playing' | 'results'>('intro');
  const [langMode, setLangMode] = useState<QuizLangMode>('both');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [answersRecord, setAnswersRecord] = useState<boolean[]>([]);

  useEffect(() => {
    setStage('intro');
    setCurrentIndex(0);
    setSelectedOption(null);
    setScore(0);
    setAnswersRecord([]);
  }, [quiz.id, quiz.title]);

  const screenBg = isDark ? '#0B0F19' : (themeColors.background || '#FFFDF9');
  const cardBg = isDark ? '#161C2E' : (themeColors.surface || '#FFFFFF');
  const innerBg = isDark ? '#1E2538' : '#FBF8F1';
  const border = isDark ? '#283149' : (themeColors.border || '#E7E0D0');
  const textPrimary = isDark ? '#F8FAFC' : (themeColors.text || '#111827');
  const textSecondary = isDark ? '#94A3B8' : (themeColors.textSecondary || '#64748B');
  const violetAccent = '#7C3AED';
  const goldAccent = isDark ? '#FBBF24' : '#D97706';

  const questions = quiz.questions || [];
  const totalQuestions = questions.length;
  const estMins = estimateQuizMinutes(quiz);
  const currentQ: KidsQuizQuestion | undefined = questions[currentIndex];
  const hasTeluguContent = questions.some(
    q =>
      (q.questionTelugu && q.questionTelugu.trim() && q.questionTelugu !== q.questionEnglish) ||
      (q.optionsTelugu && q.optionsTelugu.length > 0)
  );

  const handleSelectOption = (idx: number) => {
    if (selectedOption !== null || !currentQ) return;
    setSelectedOption(idx);
    const isCorrect = idx === currentQ.correctIndex;
    if (isCorrect) {
      setScore(prev => prev + 1);
    }
    setAnswersRecord(prev => [...prev, isCorrect]);
  };

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
    } else {
      setStage('results');
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setScore(0);
    setAnswersRecord([]);
    setStage('playing');
  };

  const renderLanguageSelector = (compact = false) => {
    if (!hasTeluguContent) return null;
    const modes: Array<{ key: QuizLangMode; label: string }> = compact
      ? [
          { key: 'both', label: 'EN+TE' },
          { key: 'english', label: 'EN' },
          { key: 'telugu', label: 'తె' },
        ]
      : [
          { key: 'both', label: 'English + తెలుగు' },
          { key: 'english', label: 'English' },
          { key: 'telugu', label: 'తెలుగు' },
        ];

    return (
      <View
        style={[
          compact ? styles.langPillCompactRow : styles.langPillRow,
          { backgroundColor: innerBg, borderColor: border },
        ]}
      >
        {modes.map(m => {
          const active = langMode === m.key;
          return (
            <TouchableOpacity
              key={m.key}
              style={[
                compact ? styles.langPillCompact : styles.langPill,
                active && { backgroundColor: violetAccent },
              ]}
              onPress={() => setLangMode(m.key)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  compact ? styles.langPillCompactText : styles.langPillText,
                  { color: active ? '#FFFFFF' : textSecondary },
                ]}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // ─────────────────────────────────────────────
  // STAGE 1: QUIZ DETAILS & 16:9 THUMBNAIL HERO
  // ─────────────────────────────────────────────
  if (stage === 'intro') {
    return (
      <View style={[styles.root, { backgroundColor: screenBg }]}>
        <View style={[styles.headerRow, { borderBottomColor: border }]}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.backCircleBtn, { backgroundColor: cardBg, borderColor: border }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={19} color={textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerEyebrow, { color: violetAccent }]}>
              {isPreview ? 'QUIZ PREVIEW' : 'BIBLE QUIZ'}
            </Text>
            <Text style={[styles.headerTitleSerif, { color: textPrimary }]} numberOfLines={1}>
              {quiz.title}
            </Text>
          </View>

          <View style={{ width: 38 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.introScroll}>
          {/* Prominent 16:9 Uploaded Thumbnail */}
          <View style={[styles.heroThumb16x9, { backgroundColor: innerBg, borderColor: border }]}>
            {quiz.thumbnailUrl ? (
              <Image
                source={{ uri: quiz.thumbnailUrl }}
                style={styles.heroThumbImg}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.heroThumbFallback}>
                <Text style={{ fontSize: 52 }}>{quiz.coverEmoji || '🏆'}</Text>
                <Text style={[styles.heroFallbackLabel, { color: textSecondary }]}>
                  Bible Quiz Challenge
                </Text>
              </View>
            )}
          </View>

          {/* Quiz Title & Scripture Reference */}
          <View style={styles.introTitleBlock}>
            {quiz.scriptureRef ? (
              <View
                style={[
                  styles.scriptureBadge,
                  {
                    backgroundColor: isDark ? 'rgba(124, 58, 237, 0.22)' : '#EFE9FE',
                    borderColor: isDark ? '#4C1D95' : '#DDD6FE',
                  },
                ]}
              >
                <BookOpen size={12} color={isDark ? '#C4B5FD' : violetAccent} />
                <Text style={[styles.scriptureBadgeText, { color: isDark ? '#DDD6FE' : violetAccent }]}>
                  {quiz.scriptureRef}
                </Text>
              </View>
            ) : null}

            <Text style={[styles.introTitle, { color: textPrimary }]}>{quiz.title}</Text>
            {quiz.titleTelugu && quiz.titleTelugu.trim() !== quiz.title.trim() ? (
              <Text style={[styles.introTitleTelugu, { color: textSecondary }]}>
                {quiz.titleTelugu}
              </Text>
            ) : null}
          </View>

          {/* Summary Stat Chips */}
          <View style={styles.statsRow}>
            <View style={[styles.statTile, { backgroundColor: isDark ? '#1A243C' : '#EFF6FF', borderColor: border }]}>
              <HelpCircle size={18} color="#2563EB" />
              <Text style={[styles.statVal, { color: textPrimary }]}>{totalQuestions}</Text>
              <Text style={[styles.statLbl, { color: textSecondary }]}>Questions</Text>
            </View>

            <View style={[styles.statTile, { backgroundColor: isDark ? '#133426' : '#ECFDF5', borderColor: border }]}>
              <Clock size={18} color="#059669" />
              <Text style={[styles.statVal, { color: textPrimary }]}>{estMins} Min</Text>
              <Text style={[styles.statLbl, { color: textSecondary }]}>Est. Time</Text>
            </View>

            <View style={[styles.statTile, { backgroundColor: isDark ? '#302412' : '#FFFBEB', borderColor: border }]}>
              <Award size={18} color={goldAccent} />
              <Text style={[styles.statVal, { color: textPrimary }]}>+{quiz.pointsReward || totalQuestions * 10}</Text>
              <Text style={[styles.statLbl, { color: textSecondary }]}>Star Pts</Text>
            </View>
          </View>

          {/* Language Selector Card */}
          {hasTeluguContent && (
            <View style={[styles.langCard, { backgroundColor: cardBg, borderColor: border }]}>
              <Text style={[styles.langCardLabel, { color: textPrimary }]}>
                Choose Quiz Language
              </Text>
              {renderLanguageSelector(false)}
            </View>
          )}

          {/* Start Quiz CTA */}
          <TouchableOpacity
            style={[styles.startQuizBtn, totalQuestions === 0 && { opacity: 0.5 }]}
            onPress={() => setStage('playing')}
            disabled={totalQuestions === 0}
            activeOpacity={0.86}
          >
            <Play size={18} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.startQuizBtnText}>
              {totalQuestions === 0 ? 'No Questions Yet' : 'Start Quiz'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ─────────────────────────────────────────────
  // STAGE 2: ACTIVE QUESTION INTERFACE
  // ─────────────────────────────────────────────
  if (stage === 'playing' && currentQ) {
    const letters = ['A', 'B', 'C', 'D'];
    const showEnglish = langMode === 'both' || langMode === 'english';
    const showTelugu = langMode === 'both' || langMode === 'telugu';

    return (
      <View style={[styles.root, { backgroundColor: screenBg }]}>
        {/* Header */}
        <View style={[styles.headerRow, { borderBottomColor: border }]}>
          <TouchableOpacity
            onPress={() => setStage('intro')}
            style={[styles.backCircleBtn, { backgroundColor: cardBg, borderColor: border }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ArrowLeft size={19} color={textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitleSerif, { color: textPrimary }]} numberOfLines={1}>
              {quiz.title}
            </Text>
            <Text style={[styles.playingProgressSub, { color: textSecondary }]}>
              Question {currentIndex + 1} of {totalQuestions}
            </Text>
          </View>

          <View style={[styles.scoreBadge, { backgroundColor: isDark ? 'rgba(251, 191, 36, 0.15)' : '#FEF3C7' }]}>
            <Text style={[styles.scoreBadgeText, { color: goldAccent }]}>
              {score}/{totalQuestions}
            </Text>
          </View>
        </View>

        {/* Progress + Quick Language Switcher Bar */}
        <View style={[styles.progressBarWrap, { borderBottomColor: border }]}>
          <View style={[styles.progressTrack, { backgroundColor: isDark ? '#1E2538' : '#EDE9FE' }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${((currentIndex + 1) / Math.max(1, totalQuestions)) * 100}%` },
              ]}
            />
          </View>
          {renderLanguageSelector(true)}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.playingScroll}>
          {/* Question Card */}
          <View
            style={[
              styles.questionBox,
              {
                backgroundColor: isDark ? '#1A162D' : '#F6F2FF',
                borderColor: isDark ? '#342A5E' : '#E5DCFD',
              },
            ]}
          >
            <View style={styles.qBadgeRow}>
              <View style={[styles.qNumPill, { backgroundColor: violetAccent }]}>
                <Text style={styles.qNumPillText}>Q{currentIndex + 1}</Text>
              </View>
              {quiz.scriptureRef ? (
                <Text style={[styles.qRefHint, { color: isDark ? '#C4B5FD' : '#6D28D9' }]} numberOfLines={1}>
                  {quiz.scriptureRef}
                </Text>
              ) : null}
            </View>

            {showEnglish && (
              <Text style={[styles.qEnglishText, { color: textPrimary }]}>
                {currentQ.questionEnglish}
              </Text>
            )}
            {showTelugu && currentQ.questionTelugu ? (
              <Text
                style={[
                  showEnglish ? styles.qTeluguText : styles.qEnglishText,
                  { color: showEnglish ? textSecondary : textPrimary },
                ]}
              >
                {currentQ.questionTelugu}
              </Text>
            ) : null}
          </View>

          {/* Answer Options */}
          <View style={styles.optionsList}>
            {(currentQ.options || []).map((optEn, idx) => {
              const optTe = currentQ.optionsTelugu?.[idx] || '';
              const isSelected = selectedOption === idx;
              const isCorrect = currentQ.correctIndex === idx;
              const showResult = selectedOption !== null;

              let optCardBg = cardBg;
              let optBorder = border;
              let letterBg = isDark ? '#232B42' : '#F3EFE6';
              let letterTextCol = textPrimary;

              if (showResult) {
                if (isCorrect) {
                  optCardBg = isDark ? '#112A22' : '#ECFDF5';
                  optBorder = '#10B981';
                  letterBg = '#10B981';
                  letterTextCol = '#FFFFFF';
                } else if (isSelected) {
                  optCardBg = isDark ? '#2D161A' : '#FEF2F2';
                  optBorder = '#EF4444';
                  letterBg = '#EF4444';
                  letterTextCol = '#FFFFFF';
                }
              }

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.optionCard,
                    { backgroundColor: optCardBg, borderColor: optBorder },
                  ]}
                  onPress={() => handleSelectOption(idx)}
                  disabled={showResult}
                  activeOpacity={0.84}
                >
                  <View style={[styles.optionLetter, { backgroundColor: letterBg }]}>
                    <Text style={[styles.letterText, { color: letterTextCol }]}>
                      {letters[idx] || String(idx + 1)}
                    </Text>
                  </View>

                  <View style={{ flex: 1, gap: 2 }}>
                    {showEnglish && (
                      <Text style={[styles.optText, { color: textPrimary }]}>{optEn}</Text>
                    )}
                    {showTelugu && optTe ? (
                      <Text
                        style={[
                          showEnglish ? styles.optSubTelugu : styles.optText,
                          { color: showEnglish ? textSecondary : textPrimary },
                        ]}
                      >
                        {optTe}
                      </Text>
                    ) : null}
                  </View>

                  {showResult && isCorrect && (
                    <CheckCircle2 size={20} color="#10B981" strokeWidth={2.5} />
                  )}
                  {showResult && isSelected && !isCorrect && (
                    <XCircle size={20} color="#EF4444" strokeWidth={2.5} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Explanation Feedback */}
          {selectedOption !== null && (currentQ.explanation || currentQ.explanationTelugu) ? (
            <View
              style={[
                styles.explanationBox,
                {
                  backgroundColor: isDark ? '#2A2212' : '#FFFBEB',
                  borderColor: isDark ? '#54421B' : '#FDE68A',
                },
              ]}
            >
              <Text style={[styles.explanationTitle, { color: goldAccent }]}>
                SCRIPTURE INSIGHT
              </Text>
              {showEnglish && currentQ.explanation ? (
                <Text style={[styles.explanationText, { color: textPrimary }]}>
                  {currentQ.explanation}
                </Text>
              ) : null}
              {showTelugu && currentQ.explanationTelugu ? (
                <Text style={[styles.explanationSubTe, { color: textSecondary }]}>
                  {currentQ.explanationTelugu}
                </Text>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {/* Bottom Next Button */}
        {selectedOption !== null && (
          <View style={[styles.footerNav, { backgroundColor: screenBg, borderTopColor: border }]}>
            <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.86}>
              <Text style={styles.nextBtnText}>
                {currentIndex === totalQuestions - 1 ? 'View Quiz Results' : 'Next Question'}
              </Text>
              <ChevronRight size={18} color="#FFFFFF" strokeWidth={2.6} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ─────────────────────────────────────────────
  // STAGE 3: FINAL SCORE & RESULTS SCREEN
  // ─────────────────────────────────────────────
  const pct = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
  const earnedStars = score * 10;

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.resultsScroll}
      >
        <View style={[styles.trophyBubble, { backgroundColor: isDark ? '#2A2212' : '#FEF3C7' }]}>
          <Trophy size={48} color={goldAccent} />
        </View>

        <Text style={[styles.congratsTitle, { color: textPrimary }]}>
          {pct >= 70 ? 'Awesome Job!' : 'Quiz Completed!'}
        </Text>
        <Text style={[styles.congratsSub, { color: textSecondary }]}>
          You answered {score} out of {totalQuestions} questions correctly ({pct}%)
        </Text>

        {/* Question Breakdown Chips */}
        {answersRecord.length > 0 && (
          <View style={styles.breakdownRow}>
            {answersRecord.map((correct, i) => (
              <View
                key={i}
                style={[
                  styles.breakdownPill,
                  {
                    backgroundColor: correct
                      ? isDark
                        ? '#112A22'
                        : '#DCFCE7'
                      : isDark
                      ? '#2D161A'
                      : '#FEE2E2',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.breakdownPillText,
                    { color: correct ? '#10B981' : '#EF4444' },
                  ]}
                >
                  Q{i + 1} {correct ? '✓' : '✕'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Rewards Summary Card */}
        <View style={[styles.rewardCard, { backgroundColor: cardBg, borderColor: border }]}>
          <View style={styles.rewardRow}>
            <View style={[styles.rewardIconBox, { backgroundColor: isDark ? '#2A2212' : '#FEF3C7' }]}>
              <Text style={{ fontSize: 22 }}>⭐</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rewardTitle, { color: textPrimary }]}>
                +{earnedStars} Bible Star Points
              </Text>
              <Text style={[styles.rewardSub, { color: textSecondary }]}>
                {isPreview ? 'Preview score summary' : 'Added to your Rhema Kids score'}
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: border }]} />

          <View style={styles.rewardRow}>
            <View style={[styles.rewardIconBox, { backgroundColor: isDark ? '#271E4A' : '#EFE9FE' }]}>
              <Award size={20} color={violetAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rewardTitle, { color: textPrimary }]}>
                {quiz.badgeReward || 'Bible Quiz Star'}
              </Text>
              <Text style={[styles.rewardSub, { color: textSecondary }]}>
                {quiz.scriptureRef || quiz.title}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.resultsActions}>
          <TouchableOpacity style={styles.finishQuizBtn} onPress={onClose} activeOpacity={0.86}>
            <Text style={styles.finishQuizBtnText}>
              {isPreview ? 'Back to Quiz Editor' : 'Done · Back to Quizzes'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: cardBg, borderColor: border }]}
            onPress={handleRestart}
            activeOpacity={0.82}
          >
            <RefreshCw size={15} color={textPrimary} />
            <Text style={[styles.retryBtnText, { color: textPrimary }]}>Play Again</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

interface KidsQuizPlayerModalProps {
  visible: boolean;
  quiz: KidsQuiz | null;
  onClose: () => void;
}

export default function KidsQuizPlayerModal({
  visible,
  quiz,
  onClose,
}: KidsQuizPlayerModalProps) {
  const { isDark, colors: themeColors } = useTheme();
  if (!quiz) return null;

  const screenBg = isDark ? '#0B0F19' : (themeColors.background || '#FFFDF9');
  const barStyle = isDark ? 'light-content' : 'dark-content';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={{ flex: 1, backgroundColor: screenBg }} edges={['top', 'bottom']}>
          <StatusBar barStyle={barStyle} backgroundColor={screenBg} />
          <KidsQuizExperienceView quiz={quiz} onClose={onClose} />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
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
    gap: 10,
  },
  backCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerTitleSerif: {
    fontSize: 15.5,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    marginTop: 1,
  },
  playingProgressSub: {
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 1,
  },
  introScroll: {
    padding: 18,
    paddingBottom: 38,
    gap: 18,
  },
  heroThumb16x9: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  heroThumbImg: {
    width: '100%',
    height: '100%',
  },
  heroThumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  heroFallbackLabel: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  introTitleBlock: {
    gap: 8,
  },
  scriptureBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  scriptureBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  introTitle: {
    fontSize: 24,
    lineHeight: 31,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
  },
  introTitleTelugu: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statTile: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 4,
  },
  statVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  statLbl: {
    fontSize: 11,
    fontWeight: '600',
  },
  langCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  langCardLabel: {
    fontSize: 13,
    fontWeight: '800',
  },
  langPillRow: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  langPill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  langPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  langPillCompactRow: {
    flexDirection: 'row',
    borderRadius: 9,
    borderWidth: 1,
    padding: 2,
    gap: 2,
  },
  langPillCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  langPillCompactText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  startQuizBtn: {
    height: 56,
    borderRadius: 999,
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  startQuizBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  scoreBadge: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 999,
  },
  scoreBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  progressBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 4,
  },
  playingScroll: {
    padding: 18,
    paddingBottom: 34,
    gap: 14,
  },
  questionBox: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    gap: 10,
  },
  qBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  qNumPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  qNumPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  qRefHint: {
    fontSize: 11.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  qEnglishText: {
    fontSize: 17.5,
    fontWeight: '800',
    lineHeight: 25,
  },
  qTeluguText: {
    fontSize: 14.5,
    fontWeight: '600',
    lineHeight: 22,
  },
  optionsList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 14,
    gap: 12,
  },
  optionLetter: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterText: {
    fontSize: 13,
    fontWeight: '800',
  },
  optText: {
    fontSize: 14.5,
    fontWeight: '700',
    lineHeight: 20,
  },
  optSubTelugu: {
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 18,
  },
  explanationBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 5,
  },
  explanationTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  explanationText: {
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '500',
  },
  explanationSubTe: {
    fontSize: 12.5,
    lineHeight: 19,
  },
  footerNav: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  nextBtn: {
    height: 52,
    borderRadius: 999,
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  resultsScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  trophyBubble: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  congratsTitle: {
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
  },
  congratsSub: {
    fontSize: 14.5,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 21,
  },
  breakdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  breakdownPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  breakdownPillText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  rewardCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginTop: 6,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rewardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  rewardSub: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  resultsActions: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  finishQuizBtn: {
    height: 54,
    borderRadius: 999,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishQuizBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  retryBtn: {
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
