import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Platform,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckCircle,
  XCircle,
  Clock,
  BookOpen,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  Unlock,
  ChevronRight,
  LayoutGrid,
} from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { QuizAttempt, BibleQuiz, QuizDifficulty } from '../../types/Quiz';
import { useQuizLanguage } from '../../context/QuizLanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';
import { getQuizStrings } from '../../constants/BibleQuizTranslations';

export default function BibleQuizResultScreen() {
  const { isDark: _adminIsDark, colors: adminColors, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor: adminBorderColor, appFontFamily, barStyle, scaleFont } = useAdminTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { quizLanguage } = useQuizLanguage();
  const { isDark } = useTheme();

  const attempt: QuizAttempt = route?.params?.attempt;
  const quiz: BibleQuiz = route?.params?.quiz;
  const category: string | undefined = route?.params?.category;
  const categoryTitleParam: string = route?.params?.categoryTitle || category || 'Bible Quiz';
  const categoryImage: string | undefined = route?.params?.categoryImage;
  const difficulty: QuizDifficulty = route?.params?.difficulty || 'easy';
  const level: number | undefined = route?.params?.level;

  const ui = getQuizStrings(quizLanguage);
  const categoryDisplayName =
    category && ui.categories[category] ? ui.categories[category] : categoryTitleParam;

  // Theme tokens
  const bg = screenBg;
  const cardBg = cardSurface;
  const cardBorder = adminBorderColor;
  const textPrimary = primaryText;
  const textMuted = secondaryText;
  const divider = adminBorderColor;

  const isPassed = attempt?.passed;
  const isChurchQuiz = !level;
  const hasNextLevel = Boolean(!isChurchQuiz && isPassed && level && level < 30);
  const nextLevel = level ? level + 1 : 2;

  // Bulletproof back navigation:
  // For church quizzes, go back to ChurchQuizzes screen.
  // For category quizzes: Prefer BibleQuizStages in the stack (Levels → Stages → Player → Result).
  // Fall back to BibleQuizLevels if Stages isn't present (legacy deep links).
  const handleBackToLevels = () => {
    if (isChurchQuiz) {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.replace('ChurchQuizzes');
      }
      return;
    }

    const state = navigation.getState();
    const routes = state?.routes || [];

    // Try BibleQuizStages first (new flow)
    const stagesIndex = routes.findLastIndex
      ? routes.findLastIndex((r: any) => r.name === 'BibleQuizStages')
      : routes.map((r: any) => r.name).lastIndexOf('BibleQuizStages');

    if (stagesIndex >= 0) {
      const currentIndex = state.index ?? routes.length - 1;
      const popCount = currentIndex - stagesIndex;
      if (popCount > 0) {
        navigation.pop(popCount);
        return;
      }
    }

    // Fallback: try BibleQuizLevels
    const levelsIndex = routes.findLastIndex
      ? routes.findLastIndex((r: any) => r.name === 'BibleQuizLevels')
      : routes.map((r: any) => r.name).lastIndexOf('BibleQuizLevels');

    if (levelsIndex >= 0) {
      const currentIndex = state.index ?? routes.length - 1;
      const popCount = currentIndex - levelsIndex;
      if (popCount > 0) {
        navigation.pop(popCount);
        return;
      }
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    if (category) {
      navigation.replace('BibleQuizStages', {
        category,
        difficulty,
        categoryTitle: categoryTitleParam,
        categoryImage,
      });
    } else {
      navigation.replace('BibleQuizHome');
    }
  };

  // Intercept Android hardware back button
  useEffect(() => {
    const onBackPress = () => {
      handleBackToLevels();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [category, categoryTitleParam, categoryImage, isChurchQuiz]);

  if (!attempt) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: bg }]}>
        <Text style={[styles.errorTxt, { color: textMuted }]}>No attempt data found.</Text>
        <TouchableOpacity
          style={styles.backHomeBtn}
          onPress={handleBackToLevels}
        >
          <Text style={styles.backHomeBtnTxt}>
            {isChurchQuiz ? (quizLanguage === 'te' ? 'వెనుకకు' : 'Go Back') : ui.viewAllLevels}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const goToPlayer = (lvl: number) => {
    navigation.replace('BibleQuizPlayer', {
      category,
      categoryTitle: categoryTitleParam,
      categoryImage,
      difficulty,
      level: lvl,
    });
  };

  const handlePrimary = () => {
    if (isChurchQuiz) {
      const qId = quiz?.id || attempt?.quizId;
      if (qId) {
        navigation.replace('BibleQuizPlayer', { quizId: qId, quiz });
      } else {
        handleBackToLevels();
      }
      return;
    }
    if (!category || !level) return handleBackToLevels();
    goToPlayer(hasNextLevel ? nextLevel : level);
  };

  const formatTime = (secs: number) => {
    const s = Math.max(0, Math.round(secs || 0));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}m ${r < 10 ? '0' : ''}${r}s`;
  };

  const safeBottomPadding =
    Platform.OS === 'android'
      ? Math.max(insets.bottom, 24) + 40
      : Math.max(insets.bottom, 20) + 30;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={bg} />

      {/* ── Screen Header: Circular Back, Centered Title, Right Status Badge ── */}
      <View
        style={[
          styles.headerRow,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) + 8,
            backgroundColor: isDark ? '#000000' : '#FFFFFF',
            borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1',
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.circularBtn,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#E2E8F0',
            },
          ]}
          onPress={handleBackToLevels}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.8}
        >
          <ArrowLeft size={20} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text
            style={[
              styles.headerTitleText,
              { color: isDark ? '#FFFFFF' : '#0F172A' },
            ]}
            numberOfLines={1}
          >
            {level ? `${categoryDisplayName} · ${ui.level} ${level}` : ui.quizCompleted}
          </Text>
        </View>

        <View
          style={[
            styles.circularBtn,
            {
              backgroundColor: isDark
                ? isPassed
                  ? 'rgba(16, 185, 129, 0.2)'
                  : 'rgba(239, 68, 68, 0.2)'
                : isPassed
                ? '#DCFCE7'
                : '#FEE2E2',
              borderColor: isPassed ? '#10B981' : '#EF4444',
            },
          ]}
        >
          <CheckCircle size={18} color={isPassed ? '#10B981' : '#EF4444'} />
        </View>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: safeBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Main Celebration Card */}
        <View style={[styles.celebrationCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          {/* Heading */}
          <Text style={[styles.congratsTitle, { color: textPrimary }]}>
            {isPassed ? ui.wellDone : ui.goodEffort}
          </Text>

          {/* Subtitle */}
          <Text style={[styles.congratsSubtitle, { color: textMuted }]}>
            {isChurchQuiz
              ? isPassed
                ? quizLanguage === 'te'
                  ? 'మీరు ఈ క్విజ్‌ను విజయవంతంగా పూర్తి చేశారు!'
                  : 'You successfully completed this quiz!'
                : quizLanguage === 'te'
                ? 'ఈసారి ఉత్తీర్ణత సాధించలేకపోయారు. మళ్ళీ ప్రయత్నించండి!'
                : 'You did not pass this quiz. Try again to improve!'
              : isPassed
              ? ui.passedLevelMsg(level || 1)
              : ui.failedLevelMsg}
          </Text>

          {/* Score Container */}
          <View style={styles.scoreContainer}>
            <Text
              style={[
                styles.scorePercentage,
                { color: isPassed ? '#10B981' : '#EF4444' },
              ]}
            >
              {attempt.percentage}%
            </Text>
            <Text style={[styles.scoreFraction, { color: secondaryText }]}>
              {attempt.score} / {attempt.totalMarks} {ui.pointsEarned}
            </Text>
          </View>

          {/* Next Level Unlocked Banner */}
          {hasNextLevel ? (
            <View
              style={[
                styles.unlockedBanner,
                {
                  backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5',
                  borderColor: isDark ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0',
                },
              ]}
            >
              <Unlock size={15} color="#10B981" />
              <Text style={styles.unlockedBannerTxt}>{ui.levelUnlocked(nextLevel)}</Text>
            </View>
          ) : null}
        </View>

        {/* 2. Unified 3-Column Stats Card */}
        <View style={[styles.statsCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={styles.statCell}>
            <View
              style={[
                styles.statIconWrap,
                { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.16)' : '#ECFDF5' },
              ]}
            >
              <CheckCircle size={18} color="#10B981" />
            </View>
            <Text style={[styles.statVal, { color: textPrimary }]}>{attempt.correctCount}</Text>
            <Text style={[styles.statLbl, { color: textMuted }]} numberOfLines={1}>
              {ui.correct}
            </Text>
          </View>

          <View style={[styles.statDivider, { backgroundColor: divider }]} />

          <View style={styles.statCell}>
            <View
              style={[
                styles.statIconWrap,
                { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.16)' : '#FEF2F2' },
              ]}
            >
              <XCircle size={18} color="#EF4444" />
            </View>
            <Text style={[styles.statVal, { color: textPrimary }]}>{attempt.wrongCount}</Text>
            <Text style={[styles.statLbl, { color: textMuted }]} numberOfLines={1}>
              {ui.incorrect}
            </Text>
          </View>

          <View style={[styles.statDivider, { backgroundColor: divider }]} />

          <View style={styles.statCell}>
            <View
              style={[
                styles.statIconWrap,
                { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9' },
              ]}
            >
              <Clock size={18} color={isDark ? '#E2E8F0' : '#475569'} />
            </View>
            <Text style={[styles.statVal, { color: textPrimary }]}>
              {formatTime(attempt.timeTakenSeconds)}
            </Text>
            <Text style={[styles.statLbl, { color: textMuted }]} numberOfLines={1}>
              {ui.time}
            </Text>
          </View>
        </View>

        {/* 3. Encouraging Scripture Card */}
        <View style={[styles.verseCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={[styles.verseAccent, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]} />
          <Text style={[styles.verseTxt, { color: textPrimary }]}>
            {ui.scriptureQuote}
          </Text>
        </View>

        {/* 4. Action Buttons Stack */}
        <View style={styles.actionsStack}>
          {/* Primary CTA: Continue or Retry */}
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              {
                backgroundColor: isDark ? '#FFFFFF' : '#000000',
              },
            ]}
            onPress={handlePrimary}
            activeOpacity={0.88}
          >
            {hasNextLevel ? null : <RotateCcw size={19} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.4} />}
            <Text
              style={[
                styles.primaryBtnTxt,
                { color: isDark ? '#000000' : '#FFFFFF' },
              ]}
              numberOfLines={1}
            >
              {hasNextLevel
                ? ui.continueToLevel(nextLevel)
                : isChurchQuiz
                ? quizLanguage === 'te'
                  ? 'క్విజ్ మళ్ళీ ప్రయత్నించండి'
                  : 'Retry Quiz'
                : ui.retryLevel}
            </Text>
            {hasNextLevel ? <ArrowRight size={19} color={isDark ? '#000000' : '#FFFFFF'} strokeWidth={2.4} /> : null}
          </TouchableOpacity>

          {/* Secondary CTA: Review Answers */}
          <TouchableOpacity
            style={[styles.actionCardBtn, { backgroundColor: cardBg, borderColor: cardBorder }]}
            onPress={() => navigation.navigate('BibleQuizReview', { attempt, quiz })}
            activeOpacity={0.85}
          >
            <View style={styles.actionCardLeft}>
              <View
                style={[
                  styles.actionIconBubble,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
                    borderWidth: 1,
                  },
                ]}
              >
                <BookOpen size={19} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.2} />
              </View>
              <Text style={[styles.actionCardTxt, { color: textPrimary }]} numberOfLines={1}>
                {ui.reviewAnswers}
              </Text>
            </View>
            <ChevronRight size={18} color={isDark ? '#94A3B8' : '#64748B'} strokeWidth={2.2} />
          </TouchableOpacity>

          {/* Tertiary CTA: View All Levels (Only shown for multi-level category quizzes) */}
          {!isChurchQuiz && (
            <TouchableOpacity
              style={[styles.actionCardBtn, { backgroundColor: cardBg, borderColor: cardBorder }]}
              onPress={handleBackToLevels}
              activeOpacity={0.85}
            >
              <View style={styles.actionCardLeft}>
                <View
                  style={[
                    styles.actionIconBubble,
                    {
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E8F0',
                      borderWidth: 1,
                    },
                  ]}
                >
                  <LayoutGrid size={19} color={isDark ? '#FFFFFF' : '#000000'} strokeWidth={2.2} />
                </View>
                <Text style={[styles.actionCardTxt, { color: textPrimary }]} numberOfLines={1}>
                  {ui.viewAllLevels}
                </Text>
              </View>
              <ChevronRight size={18} color={isDark ? '#94A3B8' : '#64748B'} strokeWidth={2.2} />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorTxt: { fontSize: 15, marginBottom: 14 },
  backHomeBtn: {
    backgroundColor: '#2b52a1',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  backHomeBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1.5,
  },
  circularBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // 1. Celebration Card
  celebrationCard: {
    borderRadius: 22,
    paddingTop: 26,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 14,
  },
  congratsTitle: {
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 6,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  congratsSubtitle: {
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  scoreContainer: {
    alignItems: 'center',
  },
  scorePercentage: {
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  scoreFraction: {
    fontSize: 13.5,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  unlockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 22,
    marginTop: 14,
    borderWidth: 1,
  },
  unlockedBannerTxt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10B981',
  },

  // 2. Stats Card
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 6,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 2,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  statDivider: {
    width: 1,
    height: 38,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statVal: {
    fontSize: 18,
    fontWeight: '900',
    marginBottom: 2,
  },
  statLbl: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },

  // 3. Verse Card
  verseCard: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 18,
  },
  verseAccent: {
    width: 4,
  },
  verseTxt: {
    flex: 1,
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },

  // 4. Action Buttons Stack
  actionsStack: {
    gap: 12,
    marginBottom: 8,
  },
  primaryBtn: {
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnTxt: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  actionCardBtn: {
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1.5,
  },
  actionCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  actionIconBubble: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardTxt: {
    fontSize: 14.5,
    fontWeight: '700',
    flexShrink: 1,
  },
}));
