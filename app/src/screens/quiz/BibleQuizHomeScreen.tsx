import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ImageBackground,
  StatusBar,
  Platform,
  RefreshControl,
  Modal,
  ActivityIndicator,
} from 'react-native';
import {
  ArrowLeft,
  ChevronRight,
  Globe,
  BookOpen,
  Award,
  CheckCircle,
  Sparkles,
  Clock,
  Play,
  Flame,
  Coins,
  Trophy,
  Calendar,
  Lock,
  RotateCcw,
  X,
  Users,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { QUIZ_CATEGORIES } from '../../constants/BibleQuizCategories';
import {
  getLocalizedDailyQuizTitle,
  getLocalizedDailyQuizDescription,
} from '../../constants/DailyQuizTranslations';
import { useQuizLanguage } from '../../context/QuizLanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';
import { useChurch } from '../../context/ChurchContext';
import { RHEMA_CHURCH_ID } from '../../constants/ChurchConfig';
import { useAuth } from '../../context/AuthContext';
import { getQuizStrings } from '../../constants/BibleQuizTranslations';
import { QuizService } from '../../services/QuizService';
import { BibleQuiz, QuizAttempt } from '../../types/Quiz';
import { isQuizScheduledLocked, formatQuizTime } from '../../utils/QuizScheduleUtils';
import { formatDateDisplay } from '../../utils/DateUtils';
import QuizLanguageModal from './QuizLanguageModal';
import QuizAlertModal from './QuizAlertModal';

export default function BibleQuizHomeScreen() {
  const {
    isDark: adminIsDark,
    colors: adminColors,
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor: adminBorderColor,
  } = useAdminTheme();

  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { quizLanguage, quizLanguageOption } = useQuizLanguage();
  const { isDark, colors } = useTheme();
  const { activeChurch } = useChurch();

  const [langModalVisible, setLangModalVisible] = useState<boolean>(false);
  const [pointsModalVisible, setPointsModalVisible] = useState<boolean>(false);
  const [leaderboardModalVisible, setLeaderboardModalVisible] = useState<boolean>(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState<boolean>(false);
  const [leaderboardData, setLeaderboardData] = useState<QuizAttempt[]>([]);

  const [quizzes, setQuizzes] = useState<BibleQuiz[]>([]);
  const [userAttempts, setUserAttempts] = useState<Record<string, QuizAttempt>>({});
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [now, setNow] = useState<Date>(() => new Date());

  const [scheduledAlertModal, setScheduledAlertModal] = useState<{
    visible: boolean;
    quiz: BibleQuiz | null;
    unlockTimeStr: string;
  }>({
    visible: false,
    quiz: null,
    unlockTimeStr: '',
  });

  const ui = getQuizStrings(quizLanguage);
  const churchId = activeChurch?.id || RHEMA_CHURCH_ID;

  // Real-time timer to unlock scheduled quizzes
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [churchId, user?.uid, quizLanguage])
  );

  const loadData = async (isManualRefresh = false) => {
    try {
      QuizService.clearCache();
      // Fetch all prepared church quizzes (including pastor/admin prepared quizzes from admin dashboard)
      const [list, attempts] = await Promise.all([
        QuizService.getQuizzes(churchId, {
          isAdmin: true, // Ensures all pastor/admin prepared quizzes from admin dashboard are loaded
          forceRefresh: true,
          targetLanguage: quizLanguage,
        }),
        user?.uid
          ? QuizService.getUserAttemptsMap(user.uid, churchId, true)
          : Promise.resolve({} as Record<string, QuizAttempt>),
      ]);

      setQuizzes(list);
      setUserAttempts(attempts);
    } catch (err) {
      console.warn('[BibleQuizHomeScreen] Error loading quiz data:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  // Compute stats: streak, accuracy, completed count, total points
  const attemptsList = useMemo(() => Object.values(userAttempts), [userAttempts]);
  const completedCount = attemptsList.length;

  const { totalPoints, accuracyPercent, streakCount } = useMemo(() => {
    let correctSum = 0;
    let questionsSum = 0;
    let points = 0;

    attemptsList.forEach(att => {
      const totalQ = att.totalQuestions || 5;
      const correct =
        att.correctCount != null
          ? att.correctCount
          : att.percentage != null
          ? Math.round((att.percentage / 100) * totalQ)
          : 0;

      correctSum += correct;
      questionsSum += totalQ;
      points += att.score && att.score > 0 ? att.score : correct * 2;
    });

    const accuracy =
      questionsSum > 0
        ? Math.round((correctSum / questionsSum) * 100)
        : completedCount > 0
        ? 80
        : 0;

    // Consecutive day streak calculation
    const datesSet = new Set<string>();
    attemptsList.forEach(a => {
      let dateStr = '';
      if (a.submittedAt) {
        if (typeof (a.submittedAt as any).toDate === 'function') {
          const d = (a.submittedAt as any).toDate();
          dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        } else {
          const d = new Date(a.submittedAt);
          if (!isNaN(d.getTime())) {
            dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          }
        }
      }
      if (dateStr) datesSet.add(dateStr);
    });

    const curr = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const todayStr = fmt(curr);
    const yesterday = new Date(curr);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = fmt(yesterday);

    let streak = 0;
    const anchor = datesSet.has(todayStr)
      ? curr
      : datesSet.has(yesterdayStr)
      ? yesterday
      : null;

    if (anchor) {
      const runner = new Date(anchor);
      while (datesSet.has(fmt(runner))) {
        streak += 1;
        runner.setDate(runner.getDate() - 1);
      }
    }

    return {
      totalPoints: points > 0 ? points : completedCount * 10,
      accuracyPercent: accuracy,
      streakCount: streak > 0 ? streak : completedCount > 0 ? 1 : 0,
    };
  }, [attemptsList, completedCount]);

  // Today's Daily Quiz IDs & Info
  const todayDateObj = new Date();
  const todayStr = `${todayDateObj.getFullYear()}-${String(todayDateObj.getMonth() + 1).padStart(2, '0')}-${String(todayDateObj.getDate()).padStart(2, '0')}`;
  const dailyQuizId = `daily_quiz_${todayStr}`;
  const todayAttempt = userAttempts[dailyQuizId];
  const isDailyDone = Boolean(todayAttempt);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const todayFormattedDate = `${dayNames[todayDateObj.getDay()]}, ${todayDateObj.getDate()} ${monthNames[todayDateObj.getMonth()]}`;

  // Church Quizzes prepared by Pastor / Admin
  const churchQuizzes = useMemo(() => {
    return quizzes.filter(q => {
      // Exclude all daily quizzes (they are already featured in Today's Challenge top card)
      if (
        q.isDailyQuiz ||
        q.id === dailyQuizId ||
        q.id?.startsWith('daily_') ||
        q.id?.startsWith('daily_quiz_') ||
        q.category?.toLowerCase() === 'daily quiz' ||
        q.category?.toLowerCase() === 'daily' ||
        Boolean(q.dailyDate)
      ) {
        return false;
      }
      // Only display published or scheduled quizzes (exclude drafts)
      if (q.status === 'draft') return false;
      return true;
    });
  }, [quizzes, dailyQuizId]);

  // Handle scheduled locked alert
  const showScheduledQuizAlert = (quiz: BibleQuiz) => {
    const unlockTimeStr = formatQuizTime(quiz.scheduledTime, quiz.scheduledDate, now);
    setScheduledAlertModal({
      visible: true,
      quiz,
      unlockTimeStr,
    });
  };

  // Open church leaderboard modal
  const handleOpenLeaderboard = async () => {
    setLeaderboardModalVisible(true);
    setLeaderboardLoading(true);
    try {
      const board = await QuizService.getLeaderboard(churchId);
      setLeaderboardData(board);
    } catch (err) {
      console.warn('[BibleQuizHomeScreen] Error fetching leaderboard:', err);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  // Flow: Select Category → Levels
  const handleSelectCategory = (cat: typeof QUIZ_CATEGORIES[0]) => {
    navigation.navigate('BibleQuizLevels', {
      category: cat.id,
      categoryTitle: cat.name,
      categoryTelugu: cat.teluguName,
      categoryImage: cat.imageUrl,
    });
  };

  // Flow: Select Quiz from Church Quizzes
  const handleSelectQuiz = (quiz: BibleQuiz) => {
    if (isQuizScheduledLocked(quiz, now)) {
      showScheduledQuizAlert(quiz);
      return;
    }
    navigation.navigate('BibleQuizDetail', { quiz });
  };

  const handleStartQuizDirect = (quiz: BibleQuiz) => {
    if (isQuizScheduledLocked(quiz, now)) {
      showScheduledQuizAlert(quiz);
      return;
    }
    navigation.navigate('BibleQuizPlayer', {
      quizId: quiz.id,
      category: quiz.category,
      difficulty: quiz.difficulty,
      categoryTitle: quiz.title,
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={screenBg} />

      {/* ── Screen Header: Circular Back, Centered Title, Language Selector ── */}
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
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
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
            {ui.quizTitle}
          </Text>
        </View>

        <View style={styles.headerRightGroup}>
          <TouchableOpacity
            style={[
              styles.circularBtn,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#E2E8F0',
                marginRight: 8,
              },
            ]}
            onPress={() => navigation.navigate('BibleQuizLeaderboard')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.8}
          >
            <Trophy size={18} color={isDark ? '#FBBF24' : '#D97706'} strokeWidth={2.2} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.circularBtn,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#E2E8F0',
              },
            ]}
            onPress={() => setLangModalVisible(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.8}
          >
            <Globe size={18} color={isDark ? '#FFFFFF' : '#000000'} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Scrollable Body ── */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. STATS ROW (Day Streak, Accuracy, Completed) ── */}
        <View
          style={[
            styles.statsCardContainer,
            {
              backgroundColor: cardSurface,
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor,
            },
          ]}
        >
          <View style={styles.statCol}>
            <View
              style={[
                styles.statIconCircle,
                { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7' },
              ]}
            >
              <Flame size={20} color="#F59E0B" />
            </View>
            <View style={styles.statColText}>
              <Text style={[styles.statValue, { color: primaryText }]}>{streakCount}</Text>
              <Text style={[styles.statLabel, { color: secondaryText }]}>Day Streak</Text>
            </View>
          </View>

          <View style={styles.statCol}>
            <View
              style={[
                styles.statIconCircle,
                { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#D1FAE5' },
              ]}
            >
              <CheckCircle size={20} color="#10B981" />
            </View>
            <View style={styles.statColText}>
              <Text style={[styles.statValue, { color: primaryText }]}>{accuracyPercent}%</Text>
              <Text style={[styles.statLabel, { color: secondaryText }]}>Accuracy</Text>
            </View>
          </View>

          <View style={styles.statCol}>
            <View
              style={[
                styles.statIconCircle,
                { backgroundColor: isDark ? 'rgba(139, 92, 246, 0.2)' : '#EDE9FE' },
              ]}
            >
              <Award size={20} color="#8B5CF6" />
            </View>
            <View style={styles.statColText}>
              <Text style={[styles.statValue, { color: primaryText }]}>{completedCount}</Text>
              <Text style={[styles.statLabel, { color: secondaryText }]}>Completed</Text>
            </View>
          </View>
        </View>

        {/* ── 2. QUIZ POINTS BAR ── */}
        <TouchableOpacity
          style={[
            styles.pointsBarCard,
            {
              backgroundColor: isDark ? '#231d14' : '#FEF9EE',
              borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
            },
          ]}
          onPress={() => setPointsModalVisible(true)}
          activeOpacity={0.85}
        >
          <View
            style={[
              styles.pointsIconBadge,
              { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.25)' : '#FDE68A' },
            ]}
          >
            <Coins size={22} color="#D97706" />
          </View>
          <View style={styles.pointsTextWrap}>
            <Text style={[styles.pointsBadgeSub, { color: isDark ? '#FBBF24' : '#B45309' }]}>
              QUIZ POINTS • 2 Points / Question
            </Text>
            <Text style={[styles.pointsEarnedMain, { color: primaryText }]}>
              {totalPoints} Points Earned
            </Text>
          </View>
          <View
            style={[
              styles.pointsChevronCircle,
              { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#F5E6CA' },
            ]}
          >
            <ChevronRight size={16} color={isDark ? '#FBBF24' : '#B45309'} />
          </View>
        </TouchableOpacity>

        {/* ── 3. DAILY SCRIPTURE CHALLENGE CARD ── */}
        <View style={styles.dailyCardWrapper}>
          <LinearGradient
            colors={isDark ? ['#1e1b4b', '#2e2570', '#1e1b4b'] : ['#261c6a', '#392a8e', '#4835a8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.dailyCardGradient}
          >
            {/* Title & Date in single line */}
            <View style={styles.dailyTitleRow}>
              <Text style={styles.dailyCardTitle}>
                {quizLanguage === 'te'
                  ? 'రోజువారీ బైబిల్ క్విజ్'
                  : 'Daily Bible Quiz'}
              </Text>
              <Text style={styles.dailyDateInlineTxt}>
                · {todayFormattedDate}
              </Text>
            </View>

            {/* Subtitle / Description */}
            <Text style={styles.dailyCardDesc}>
              {quizLanguage === 'te'
                ? 'మీ వాక్య పరిజ్ఞానాన్ని మెరుగుపరచుకోవడానికి మరియు మీ ధ్యాన ప్రయాణాన్ని కొనసాగించడానికి తాజా ప్రశ్నలు.'
                : getLocalizedDailyQuizDescription(todayStr, quizLanguage)}
            </Text>

            {/* Actions: Start Quiz & Leaderboard */}
            <View style={styles.dailyActionCol}>
              {isDailyDone ? (
                <TouchableOpacity
                  style={styles.dailyCompletedBtn}
                  onPress={() => {
                    navigation.navigate('BibleQuizResult', {
                      attempt: todayAttempt,
                      quiz: {
                        id: dailyQuizId,
                        title: 'Daily Scripture Challenge',
                        isDailyQuiz: true,
                      },
                    });
                  }}
                  activeOpacity={0.88}
                >
                  <CheckCircle size={17} color="#15803d" />
                  <Text style={styles.dailyCompletedBtnTxt}>
                    {quizLanguage === 'te'
                      ? `పూర్తయింది · ${todayAttempt?.percentage ?? 100}% (ఫలితాలు చూడండి)`
                      : `Completed · ${todayAttempt?.percentage ?? 100}% (View Results)`}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.dailyStartBtn}
                  onPress={() => {
                    navigation.navigate('BibleQuizDetail', {
                      quizId: dailyQuizId,
                      churchId,
                    });
                  }}
                  activeOpacity={0.88}
                >
                  <Play size={17} color="#1C1917" fill="#1C1917" />
                  <Text style={styles.dailyStartBtnTxt}>
                    {quizLanguage === 'te' ? 'ఈ రోజు క్విజ్ ప్రారంభించండి' : "Start Today's Quiz"}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.dailyLeaderboardBtn}
                onPress={() => navigation.navigate('BibleQuizLeaderboard')}
                activeOpacity={0.85}
              >
                <Trophy size={16} color="#FEF08A" />
                <Text style={styles.dailyLeaderboardBtnTxt}>
                  {quizLanguage === 'te' ? 'చర్చి లీడర్‌బోర్డ్' : 'Leaderboard'}
                </Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        {/* ── 4. FAITH CATEGORIES (2-Column Grid) ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: primaryText }]}>
            {quizLanguage === 'te' ? 'విశ్వాస వర్గాలు' : 'Faith Categories'}
          </Text>
          <View
            style={[
              styles.sectionBadge,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
              },
            ]}
          >
            <Text
              style={[
                styles.sectionBadgeTxt,
                { color: isDark ? '#E2E8F0' : '#475569' },
              ]}
            >
              12 Themes
            </Text>
          </View>
        </View>

        <View style={styles.categoriesGrid}>
          {QUIZ_CATEGORIES.map(cat => {
            const localizedName = ui.categories[cat.id] || cat.name;

            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryGridCard,
                  isDark && {
                    borderWidth: 1,
                    borderColor: 'rgba(255, 255, 255, 0.15)',
                  },
                ]}
                onPress={() => handleSelectCategory(cat)}
                activeOpacity={0.88}
              >
                <ImageBackground
                  source={{ uri: cat.imageUrl }}
                  style={styles.catGridImageBg}
                  imageStyle={styles.catGridImage}
                >
                  <LinearGradient
                    colors={['transparent', 'rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.85)']}
                    locations={[0.2, 0.55, 1]}
                    style={styles.catGridOverlay}
                  >
                    <View style={styles.catGridContent}>
                      <Text style={styles.catGridTitle} numberOfLines={1}>
                        {localizedName}
                      </Text>
                      <View style={styles.catArrowCircle}>
                        <ChevronRight size={14} color="#FFFFFF" />
                      </View>
                    </View>
                  </LinearGradient>
                </ImageBackground>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── 5. CHURCH QUIZZES (Prepared by Pastor / Admin) ── */}
        <View style={[styles.sectionHeaderRow, { marginTop: 24 }]}>
          <Text style={[styles.sectionTitle, { color: primaryText }]}>
            {quizLanguage === 'te' ? 'చర్చి క్విజ్‌లు' : 'Church Quizzes'}
          </Text>
          <View
            style={[
              styles.sectionBadge,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
              },
            ]}
          >
            <Text
              style={[
                styles.sectionBadgeTxt,
                { color: isDark ? '#E2E8F0' : '#475569' },
              ]}
            >
              {churchQuizzes.length} Quizzes
            </Text>
          </View>
        </View>

        {churchQuizzes.length === 0 ? (
          <View
            style={[
              styles.emptyChurchCard,
              {
                backgroundColor: cardSurface,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor,
              },
            ]}
          >
            <BookOpen size={28} color={secondaryText} style={{ marginBottom: 8 }} />
            <Text style={[styles.emptyChurchTitle, { color: primaryText }]}>
              {ui.noQuizzesAvailable || 'No Church Quizzes Available'}
            </Text>
            <Text style={[styles.emptyChurchSub, { color: secondaryText }]}>
              {ui.noQuizzesAvailableSub ||
                'New quizzes prepared by your pastor or church admin will appear here.'}
            </Text>
          </View>
        ) : (
          churchQuizzes.map(quiz => {
            const isEasy = quiz.difficulty === 'easy';
            const isMedium = quiz.difficulty === 'medium';
            const diffColor = isEasy ? '#2563EB' : isMedium ? '#D97706' : '#059669';
            const attempt = userAttempts[quiz.id];
            const isScheduledLocked = isQuizScheduledLocked(quiz, now);

            return (
              <TouchableOpacity
                key={quiz.id}
                style={[
                  styles.churchQuizCard,
                  {
                    backgroundColor: cardSurface,
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor,
                  },
                ]}
                onPress={() => handleSelectQuiz(quiz)}
                activeOpacity={0.88}
              >
                {/* Top Badge Row */}
                <View style={styles.churchQuizTopRow}>
                  <View style={[styles.diffPill, { backgroundColor: `${diffColor}18` }]}>
                    <Text style={[styles.diffPillTxt, { color: diffColor }]}>
                      {quiz.difficulty ? quiz.difficulty.toUpperCase() : 'MEDIUM'}
                    </Text>
                  </View>

                  {isScheduledLocked && (
                    <View style={styles.scheduledPill}>
                      <Clock size={11} color="#2563EB" />
                      <Text style={styles.scheduledPillTxt}>
                        {quiz.scheduledDate}
                        {quiz.scheduledTime
                          ? ` · ${formatQuizTime(quiz.scheduledTime, quiz.scheduledDate, now)}`
                          : ''}
                      </Text>
                    </View>
                  )}

                  {attempt ? (
                    <View style={styles.completedBadge}>
                      <CheckCircle size={11} color="#10B981" />
                      <Text style={styles.completedBadgeTxt}>
                        {attempt.percentage !== undefined
                          ? `${ui.completed} · ${attempt.percentage}%`
                          : ui.completed}
                      </Text>
                    </View>
                  ) : quiz.timeLimitMinutes > 0 ? (
                    <View style={styles.timeLimitChip}>
                      <Clock size={11} color="#64748B" />
                      <Text style={styles.timeLimitChipTxt}>{quiz.timeLimitMinutes}m</Text>
                    </View>
                  ) : null}
                </View>

                {/* Title & Description */}
                <Text style={[styles.churchQuizTitle, { color: primaryText }]} numberOfLines={2}>
                  {quiz.translations?.[quizLanguage]?.title || quiz.title}
                </Text>

                {Boolean(quiz.description && quiz.description !== quiz.title) && (
                  <Text style={[styles.churchQuizDesc, { color: secondaryText }]} numberOfLines={2}>
                    {quiz.translations?.[quizLanguage]?.description || quiz.description}
                  </Text>
                )}

                {/* Divider Line above questions count and date */}
                <View
                  style={[
                    styles.cardDividerLine,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255, 255, 255, 0.1)'
                        : '#E2E8F0',
                    },
                  ]}
                />

                {/* 5 Questions & Date in Middle */}
                <View style={styles.churchMetaCenter}>
                  <BookOpen size={13} color="#64748B" />
                  <Text style={styles.churchMetaTxt}>
                    {ui.questionsCount(quiz.totalQuestions || quiz.questions?.length || 0)}
                  </Text>
                  {Boolean(quiz.scheduledDate) && (
                    <>
                      <Text style={styles.metaDot}>·</Text>
                      <Calendar size={12} color="#64748B" />
                      <Text style={styles.churchMetaTxt}>
                        {formatDateDisplay(quiz.scheduledDate)}
                      </Text>
                    </>
                  )}
                </View>

                {/* Start / Result & Retry Buttons below */}
                {attempt ? (
                  <View style={styles.churchCardActionsFull}>
                    <TouchableOpacity
                      style={[
                        styles.actionBtnSecondaryFull,
                        {
                          borderColor: isDark
                            ? 'rgba(255, 255, 255, 0.2)'
                            : '#CBD5E1',
                          backgroundColor: isDark
                            ? 'rgba(255, 255, 255, 0.05)'
                            : '#F8FAFC',
                        },
                      ]}
                      onPress={() =>
                        navigation.navigate('BibleQuizResult', { attempt, quiz })
                      }
                      activeOpacity={0.82}
                    >
                      <Award size={14} color={isDark ? '#93C5FD' : '#2563EB'} />
                      <Text
                        style={[
                          styles.actionBtnSecondaryTxt,
                          { color: isDark ? '#93C5FD' : '#2563EB' },
                        ]}
                      >
                        {ui.results}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.actionBtnPrimaryFull,
                        { backgroundColor: isDark ? '#FFFFFF' : '#000000' },
                      ]}
                      onPress={() => handleStartQuizDirect(quiz)}
                      activeOpacity={0.85}
                    >
                      <RotateCcw size={14} color={isDark ? '#000000' : '#FFFFFF'} />
                      <Text
                        style={[
                          styles.actionBtnPrimaryTxt,
                          { color: isDark ? '#000000' : '#FFFFFF' },
                        ]}
                      >
                        {ui.retry}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : isScheduledLocked ? (
                  <TouchableOpacity
                    style={styles.scheduledLockedBtnFull}
                    onPress={() => showScheduledQuizAlert(quiz)}
                    activeOpacity={0.8}
                  >
                    <Lock size={13} color="#475569" />
                    <Text style={styles.scheduledLockedBtnTxt}>Scheduled Quiz · Locked</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.actionBtnPrimaryFull,
                      { backgroundColor: isDark ? '#FFFFFF' : '#000000' },
                    ]}
                    onPress={() => handleSelectQuiz(quiz)}
                    activeOpacity={0.85}
                  >
                    <Play
                      size={14}
                      color={isDark ? '#000000' : '#FFFFFF'}
                      fill={isDark ? '#000000' : '#FFFFFF'}
                    />
                    <Text
                      style={[
                        styles.actionBtnPrimaryTxt,
                        { color: isDark ? '#000000' : '#FFFFFF' },
                      ]}
                    >
                      {ui.start}
                    </Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* ── Language Modal ── */}
      <QuizLanguageModal
        visible={langModalVisible}
        onClose={() => setLangModalVisible(false)}
      />

      {/* ── Scheduled Locked Modal ── */}
      <QuizAlertModal
        visible={scheduledAlertModal.visible}
        type="locked"
        badgeText="QUIZ SCHEDULED"
        title="Quiz Scheduled"
        message={`This quiz will start at ${scheduledAlertModal.unlockTimeStr} on ${scheduledAlertModal.quiz?.scheduledDate}.\n\nIt is currently locked and will become accessible to play from ${scheduledAlertModal.unlockTimeStr} onwards.`}
        highlightText={`Unlocks on ${scheduledAlertModal.quiz?.scheduledDate} at ${scheduledAlertModal.unlockTimeStr}`}
        highlightIcon="lock"
        primaryBtnText="View Details"
        secondaryBtnText="OK"
        onPrimary={() => {
          const q = scheduledAlertModal.quiz;
          setScheduledAlertModal({ visible: false, quiz: null, unlockTimeStr: '' });
          if (q) navigation.navigate('BibleQuizDetail', { quiz: q });
        }}
        onSecondary={() => {
          setScheduledAlertModal({ visible: false, quiz: null, unlockTimeStr: '' });
        }}
        onClose={() => {
          setScheduledAlertModal({ visible: false, quiz: null, unlockTimeStr: '' });
        }}
      />

      {/* ── Points Information Modal ── */}
      <Modal
        visible={pointsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPointsModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.infoModalCard,
              {
                backgroundColor: cardSurface,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor,
              },
            ]}
          >
            <View style={styles.infoModalTopRow}>
              <View
                style={[
                  styles.infoModalIconCircle,
                  { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7' },
                ]}
              >
                <Coins size={24} color="#D97706" />
              </View>
              <TouchableOpacity
                onPress={() => setPointsModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={secondaryText} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.infoModalTitle, { color: primaryText }]}>
              Bible Quiz Points
            </Text>
            <Text style={[styles.infoModalSubtitle, { color: secondaryText }]}>
              Earn points with every quiz you take and grow deeper in Scripture knowledge!
            </Text>

            <View style={styles.infoRulesBox}>
              <View style={styles.infoRuleRow}>
                <Sparkles size={16} color="#D97706" style={{ marginTop: 2 }} />
                <Text style={[styles.infoRuleTxt, { color: primaryText }]}>
                  <Text style={{ fontWeight: '800' }}>2 Points Per Question:</Text> Earned for every
                  correct answer in Daily Scripture Challenges & Church Quizzes.
                </Text>
              </View>
              <View style={styles.infoRuleRow}>
                <Flame size={16} color="#EA580C" style={{ marginTop: 2 }} />
                <Text style={[styles.infoRuleTxt, { color: primaryText }]}>
                  <Text style={{ fontWeight: '800' }}>Daily Streak Bonus:</Text> Play consistently
                  every day to increase your streak and climb the church leaderboard.
                </Text>
              </View>
              <View style={styles.infoRuleRow}>
                <Trophy size={16} color="#CA8A04" style={{ marginTop: 2 }} />
                <Text style={[styles.infoRuleTxt, { color: primaryText }]}>
                  <Text style={{ fontWeight: '800' }}>Church Rankings:</Text> Compete with fellow
                  members for the top spot on the church leaderboard.
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.infoModalCloseBtn,
                { backgroundColor: isDark ? '#FFFFFF' : '#000000' },
              ]}
              onPress={() => setPointsModalVisible(false)}
              activeOpacity={0.88}
            >
              <Text
                style={[
                  styles.infoModalCloseBtnTxt,
                  { color: isDark ? '#000000' : '#FFFFFF' },
                ]}
              >
                Got It
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Church Leaderboard Modal ── */}
      <Modal
        visible={leaderboardModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLeaderboardModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.leaderboardModalCard,
              {
                backgroundColor: cardSurface,
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : adminBorderColor,
              },
            ]}
          >
            <View style={styles.leaderboardModalHeader}>
              <View style={styles.leaderboardTitleGroup}>
                <View style={styles.trophyCircle}>
                  <Trophy size={20} color="#D97706" />
                </View>
                <View>
                  <Text style={[styles.leaderboardTitle, { color: primaryText }]}>
                    Church Leaderboard
                  </Text>
                  <Text style={[styles.leaderboardSubtitle, { color: secondaryText }]}>
                    Top scores & participation
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setLeaderboardModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={22} color={secondaryText} />
              </TouchableOpacity>
            </View>

            {leaderboardLoading ? (
              <View style={styles.leaderboardLoader}>
                <ActivityIndicator size="small" color="#D97706" />
                <Text style={[styles.leaderboardLoadingTxt, { color: secondaryText }]}>
                  Loading Church Standings...
                </Text>
              </View>
            ) : leaderboardData.length === 0 ? (
              <View style={styles.emptyLeaderboardBox}>
                <Users size={32} color={secondaryText} style={{ marginBottom: 8 }} />
                <Text style={[styles.emptyLeaderboardTitle, { color: primaryText }]}>
                  Be the First!
                </Text>
                <Text style={[styles.emptyLeaderboardSub, { color: secondaryText }]}>
                  Complete today's challenge to set the benchmark on the church leaderboard.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.leaderboardScroll}
                showsVerticalScrollIndicator={false}
              >
                {leaderboardData.map((item, idx) => {
                  const rank = idx + 1;
                  const isTop3 = rank <= 3;
                  const medalEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉';

                  return (
                    <View
                      key={item.id || String(idx)}
                      style={[
                        styles.leaderboardRow,
                        {
                          backgroundColor: isDark
                            ? 'rgba(255, 255, 255, 0.04)'
                            : idx % 2 === 0
                            ? '#F8FAFC'
                            : '#FFFFFF',
                          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
                        },
                      ]}
                    >
                      <View style={styles.rankBadge}>
                        {isTop3 ? (
                          <Text style={styles.medalEmojiTxt}>{medalEmoji}</Text>
                        ) : (
                          <Text style={[styles.rankNumberTxt, { color: secondaryText }]}>
                            #{rank}
                          </Text>
                        )}
                      </View>

                      <View style={styles.leaderboardUserInfo}>
                        <Text style={[styles.leaderboardUserName, { color: primaryText }]} numberOfLines={1}>
                          {item.memberName || 'Church Member'}
                        </Text>
                        <Text style={[styles.leaderboardUserSub, { color: secondaryText }]}>
                          {item.totalQuestions ? `${item.correctCount || 0}/${item.totalQuestions} Correct` : 'Quiz Complete'}
                        </Text>
                      </View>

                      <View style={styles.leaderboardScoreCol}>
                        <Text style={[styles.leaderboardScorePercent, { color: primaryText }]}>
                          {item.percentage}%
                        </Text>
                        <Text style={styles.leaderboardScorePts}>
                          {item.score || (item.correctCount || 0) * 2} pts
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[
                styles.infoModalCloseBtn,
                { backgroundColor: isDark ? '#FFFFFF' : '#000000', marginTop: 14 },
              ]}
              onPress={() => setLeaderboardModalVisible(false)}
              activeOpacity={0.88}
            >
              <Text
                style={[
                  styles.infoModalCloseBtnTxt,
                  { color: isDark ? '#000000' : '#FFFFFF' },
                ]}
              >
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = createAdminThemedStyles(
  StyleSheet.create({
    container: {
      flex: 1,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 12,
      borderBottomWidth: 1.5,
      zIndex: 10,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    circularBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
    headerRightGroup: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerTitleWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    headerTitleText: {
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.2,
      textAlign: 'center',
    },
    scrollArea: {
      flex: 1,
    },

    // ── 1. Stats Row ─────────────────────────────────────────────────────────────
    statsCardContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 8,
      borderWidth: 1,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
      elevation: 2,
    },
    statCol: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    statIconCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statColText: {
      justifyContent: 'center',
    },
    statValue: {
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    statLabel: {
      fontSize: 11,
      fontWeight: '600',
      marginTop: 1,
    },

    // ── 2. Points Bar ────────────────────────────────────────────────────────────
    pointsBarCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 18,
      paddingVertical: 11,
      paddingHorizontal: 14,
      borderWidth: 1,
      marginBottom: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 2,
    },
    pointsIconBadge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pointsTextWrap: {
      flex: 1,
      marginHorizontal: 12,
    },
    pointsBadgeSub: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    pointsEarnedMain: {
      fontSize: 17,
      fontWeight: '800',
    },
    pointsChevronCircle: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── 3. Daily Challenge Card ──────────────────────────────────────────────────
    dailyCardWrapper: {
      borderRadius: 22,
      overflow: 'hidden',
      marginBottom: 20,
      shadowColor: '#2e2570',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.28,
      shadowRadius: 10,
      elevation: 5,
    },
    dailyCardGradient: {
      padding: 18,
      borderRadius: 22,
    },
    dailyBadgesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    dailyBadgePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(255, 255, 255, 0.16)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
    },
    dailyBadgePillTxt: {
      fontSize: 11,
      fontWeight: '800',
      color: '#FDE047',
      letterSpacing: 0.5,
    },
    dailyMetaPill: {
      backgroundColor: 'rgba(255, 255, 255, 0.16)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
    },
    dailyMetaPillTxt: {
      fontSize: 11,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    dailyTitleRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 6,
    },
    dailyCardTitle: {
      fontSize: 20,
      fontWeight: '900',
      color: '#FFFFFF',
      letterSpacing: -0.3,
    },
    dailyDateInlineTxt: {
      fontSize: 13,
      fontWeight: '700',
      color: '#FDE047',
    },
    dailyCardDesc: {
      fontSize: 13,
      color: 'rgba(255, 255, 255, 0.88)',
      lineHeight: 18,
      marginBottom: 16,
    },
    dailyActionCol: {
      gap: 10,
    },
    dailyStartBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#F59E0B',
      paddingVertical: 12,
      borderRadius: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 4,
      elevation: 3,
    },
    dailyStartBtnTxt: {
      fontSize: 15,
      fontWeight: '800',
      color: '#1C1917',
    },
    dailyCompletedBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: '#DCFCE7',
      paddingVertical: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#86EFAC',
    },
    dailyCompletedBtnTxt: {
      fontSize: 14,
      fontWeight: '800',
      color: '#15803D',
    },
    dailyLeaderboardBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      paddingVertical: 11,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.25)',
    },
    dailyLeaderboardBtnTxt: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },

    // ── 4. Faith Categories (2-Column Grid) ──────────────────────────────────────
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
    sectionBadge: {
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 12,
    },
    sectionBadgeTxt: {
      fontSize: 11,
      fontWeight: '700',
    },
    categoriesGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    categoryGridCard: {
      width: '48.5%',
      height: 90,
      borderRadius: 15,
      overflow: 'hidden',
      marginBottom: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 5,
      elevation: 2,
    },
    catGridImageBg: {
      flex: 1,
      width: '100%',
      height: '100%',
    },
    catGridImage: {
      borderRadius: 15,
    },
    catGridOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      paddingHorizontal: 12,
      paddingBottom: 10,
    },
    catGridContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    catGridTitle: {
      fontSize: 14,
      fontWeight: '800',
      color: '#FFFFFF',
      textShadowColor: 'rgba(0, 0, 0, 0.75)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
      flex: 1,
      marginRight: 6,
    },
    catArrowCircle: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(255, 255, 255, 0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── 5. Available Church Quizzes ──────────────────────────────────────────────
    emptyChurchCard: {
      borderRadius: 16,
      borderWidth: 1,
      paddingVertical: 24,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyChurchTitle: {
      fontSize: 15,
      fontWeight: '700',
      marginBottom: 4,
    },
    emptyChurchSub: {
      fontSize: 12.5,
      textAlign: 'center',
      lineHeight: 18,
    },
    churchQuizCard: {
      borderRadius: 16,
      borderWidth: 1,
      padding: 14,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 5,
      elevation: 2,
    },
    churchQuizTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 8,
      flexWrap: 'wrap',
    },
    diffPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
    },
    diffPillTxt: {
      fontSize: 10.5,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    scheduledPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(37, 99, 235, 0.1)',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
    },
    scheduledPillTxt: {
      fontSize: 11,
      fontWeight: '700',
      color: '#2563EB',
    },
    completedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 6,
    },
    completedBadgeTxt: {
      fontSize: 11,
      fontWeight: '700',
      color: '#10B981',
    },
    timeLimitChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: 'rgba(100, 116, 139, 0.1)',
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 6,
    },
    timeLimitChipTxt: {
      fontSize: 11,
      fontWeight: '600',
      color: '#64748B',
    },
    churchQuizTitle: {
      fontSize: 16,
      fontWeight: '800',
      letterSpacing: -0.2,
      marginBottom: 4,
    },
    churchQuizDesc: {
      fontSize: 12.5,
      lineHeight: 17,
      marginBottom: 10,
    },
    cardDividerLine: {
      height: 1,
      width: '100%',
      marginTop: 10,
      marginBottom: 10,
    },
    churchMetaCenter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 12,
    },
    churchCardActionsFull: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    actionBtnPrimaryFull: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    actionBtnSecondaryFull: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
    },
    scheduledLockedBtnFull: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: 'rgba(71, 85, 105, 0.1)',
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
    },
    churchQuizFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: 'rgba(0, 0, 0, 0.05)',
    },
    churchMetaLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    churchMetaTxt: {
      fontSize: 12,
      fontWeight: '600',
      color: '#64748B',
    },
    metaDot: {
      fontSize: 12,
      color: '#94A3B8',
    },
    completedActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    actionBtnSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
    },
    actionBtnSecondaryTxt: {
      fontSize: 12,
      fontWeight: '700',
    },
    actionBtnPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    actionBtnPrimaryTxt: {
      fontSize: 12,
      fontWeight: '800',
    },
    scheduledLockedBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: 'rgba(71, 85, 105, 0.1)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
    },
    scheduledLockedBtnTxt: {
      fontSize: 12,
      fontWeight: '700',
      color: '#475569',
    },

    // ── Modals ───────────────────────────────────────────────────────────────────
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    infoModalCard: {
      width: '100%',
      maxWidth: 400,
      borderRadius: 20,
      borderWidth: 1,
      padding: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 6,
    },
    infoModalTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    infoModalIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoModalTitle: {
      fontSize: 19,
      fontWeight: '800',
      marginBottom: 4,
    },
    infoModalSubtitle: {
      fontSize: 13,
      lineHeight: 18,
      marginBottom: 16,
    },
    infoRulesBox: {
      gap: 12,
      marginBottom: 20,
    },
    infoRuleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    infoRuleTxt: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
    },
    infoModalCloseBtn: {
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoModalCloseBtnTxt: {
      fontSize: 15,
      fontWeight: '800',
    },

    // Leaderboard Modal
    leaderboardModalCard: {
      width: '100%',
      maxWidth: 420,
      maxHeight: '80%',
      borderRadius: 20,
      borderWidth: 1,
      padding: 18,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 6,
    },
    leaderboardModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0, 0, 0, 0.08)',
      marginBottom: 12,
    },
    leaderboardTitleGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    trophyCircle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: '#FEF3C7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    leaderboardTitle: {
      fontSize: 17,
      fontWeight: '800',
    },
    leaderboardSubtitle: {
      fontSize: 12,
    },
    leaderboardLoader: {
      paddingVertical: 40,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    leaderboardLoadingTxt: {
      fontSize: 13,
      fontWeight: '600',
    },
    emptyLeaderboardBox: {
      paddingVertical: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyLeaderboardTitle: {
      fontSize: 16,
      fontWeight: '800',
      marginBottom: 4,
    },
    emptyLeaderboardSub: {
      fontSize: 13,
      textAlign: 'center',
      maxWidth: 260,
      lineHeight: 18,
    },
    leaderboardScroll: {
      maxHeight: 340,
    },
    leaderboardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 8,
    },
    rankBadge: {
      width: 32,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 6,
    },
    medalEmojiTxt: {
      fontSize: 18,
    },
    rankNumberTxt: {
      fontSize: 14,
      fontWeight: '800',
    },
    leaderboardUserInfo: {
      flex: 1,
      marginRight: 10,
    },
    leaderboardUserName: {
      fontSize: 14,
      fontWeight: '800',
      marginBottom: 2,
    },
    leaderboardUserSub: {
      fontSize: 11,
    },
    leaderboardScoreCol: {
      alignItems: 'flex-end',
    },
    leaderboardScorePercent: {
      fontSize: 15,
      fontWeight: '800',
    },
    leaderboardScorePts: {
      fontSize: 11,
      color: '#D97706',
      fontWeight: '700',
    },
  })
);
