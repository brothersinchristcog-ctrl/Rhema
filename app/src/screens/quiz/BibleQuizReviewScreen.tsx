import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  BookOpen,
} from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { QuizAttempt, BibleQuiz } from '../../types/Quiz';
import { useQuizLanguage } from '../../context/QuizLanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';
import {
  getQuizStrings,
  localizeBibleReference,
} from '../../constants/BibleQuizTranslations';
import { getLocalizedDailyQuestion } from '../../constants/DailyQuizTranslations';

export default function BibleQuizReviewScreen() {
  const { isDark: _adminIsDark, colors: adminColors, screenBg, cardSurface, secondarySurface, primaryText, secondaryText, borderColor: adminBorderColor, appFontFamily, barStyle, scaleFont } = useAdminTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { quizLanguage } = useQuizLanguage();
  const { isDark } = useTheme();

  const attempt: QuizAttempt = route?.params?.attempt;
  const quiz: BibleQuiz = route?.params?.quiz;
  const ui = getQuizStrings(quizLanguage);

  if (!attempt || !attempt.answers) {
    return (
      <View
        style={[
          styles.container,
          styles.center,
          { backgroundColor: screenBg },
        ]}
      >
        <Text style={[styles.errorTxt, { color: secondaryText }]}>
          No review data found.
        </Text>
        <TouchableOpacity
          style={[
            styles.backBtn,
            { backgroundColor: isDark ? '#FFFFFF' : '#000000' },
          ]}
          onPress={() => navigation.goBack()}
        >
          <Text
            style={[
              styles.backBtnTxt,
              { color: isDark ? '#000000' : '#FFFFFF' },
            ]}
          >
            {ui.results}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const safeBottomPadding =
    Platform.OS === 'android'
      ? Math.max(insets.bottom, 24) + 24
      : Math.max(insets.bottom, 16) + 20;

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={screenBg} />

      {/* Screen Header */}
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
            {ui.questionReview}
          </Text>
        </View>

        <View
          style={[
            styles.scorePill,
            {
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#F1F5F9',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1',
            },
          ]}
        >
          <Text style={[styles.scorePillTxt, { color: isDark ? '#FFFFFF' : '#0F172A' }]}>
            {attempt.percentage}%
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={{ padding: 16, paddingBottom: safeBottomPadding }}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Bar */}
        <View
          style={[
            styles.summaryBar,
            {
              backgroundColor: cardSurface,
              borderColor: adminBorderColor,
            },
          ]}
        >
          <Text
            style={[
              styles.summaryBarTxt,
              { color: primaryText },
            ]}
          >
            {ui.summaryBar(
              attempt.score,
              attempt.totalMarks,
              attempt.correctCount,
              attempt.wrongCount
            )}
          </Text>
        </View>

        {attempt.answers.map((ans, idx) => {
          const localized = getLocalizedDailyQuestion(
            {
              question: ans.question,
              bibleReference: ans.bibleReference,
              explanation: ans.explanation,
              correctAnswer: ans.correctAnswer,
            },
            quizLanguage
          );
          const locRef = localized.bibleReference || localizeBibleReference(ans.bibleReference || '', quizLanguage);
          const displayedQuestion = localized.question || ans.question;
          const displayedExp = localized.explanation || ans.explanation;
          const displayedCorrect = (quizLanguage !== 'en' && localized.correctAnswer) ? localized.correctAnswer : ans.correctAnswer;

          return (
            <View
              key={ans.questionId || idx}
              style={[
                styles.reviewCard,
                {
                  backgroundColor: cardSurface,
                  borderColor: adminBorderColor,
                },
              ]}
            >
              {/* Question Header */}
              <View style={styles.cardHeaderRow}>
                <View
                  style={[
                    styles.statusIconWrap,
                    ans.isCorrect
                      ? { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.2)' : '#ECFDF5' }
                      : { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEF2F2' },
                  ]}
                >
                  {ans.isCorrect ? (
                    <CheckCircle size={16} color="#10B981" />
                  ) : (
                    <XCircle size={16} color="#EF4444" />
                  )}
                  <Text
                    style={[
                      styles.statusTxt,
                      ans.isCorrect ? { color: '#10B981' } : { color: '#EF4444' },
                    ]}
                  >
                    {ans.isCorrect ? ui.correct : ui.incorrect}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.marksEarned,
                    { color: secondaryText },
                  ]}
                >
                  +{ans.marksAwarded} / {ans.possibleMarks} pt
                </Text>
              </View>

              <Text
                style={[
                  styles.questionText,
                  { color: primaryText },
                ]}
              >
                Q{idx + 1}. {displayedQuestion}
              </Text>

              {/* Member's Answer */}
              <View
                style={[
                  styles.answerRow,
                  ans.isCorrect
                    ? {
                        backgroundColor: isDark
                          ? 'rgba(16, 185, 129, 0.14)'
                          : '#ECFDF5',
                        borderColor: isDark ? '#065F46' : '#A7F3D0',
                      }
                    : {
                        backgroundColor: isDark
                          ? 'rgba(239, 68, 68, 0.14)'
                          : '#FEF2F2',
                        borderColor: isDark ? '#991B1B' : '#FECACA',
                      },
                ]}
              >
                <Text
                  style={[
                    styles.answerLabel,
                    { color: secondaryText },
                  ]}
                >
                  {ui.yourAnswer}
                </Text>
                <Text
                  style={[
                    styles.answerValue,
                    ans.isCorrect
                      ? { color: isDark ? '#34D399' : '#065F46' }
                      : { color: isDark ? '#F87171' : '#991B1B' },
                  ]}
                >
                  {Array.isArray(ans.selectedAnswer)
                    ? ans.selectedAnswer.join(', ')
                    : ans.selectedAnswer || ui.notAnswered}
                </Text>
              </View>

              {/* Correct Answer (if member was wrong) */}
              {!ans.isCorrect && (
                <View
                  style={[
                    styles.answerRow,
                    {
                      backgroundColor: isDark
                        ? 'rgba(16, 185, 129, 0.14)'
                        : '#ECFDF5',
                      borderColor: isDark ? '#065F46' : '#A7F3D0',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.answerLabel,
                      { color: secondaryText },
                    ]}
                  >
                    {ui.correctAnswer}
                  </Text>
                  <Text
                    style={[
                      styles.answerValue,
                      {
                        color: isDark ? '#34D399' : '#065F46',
                        fontWeight: '700',
                      },
                    ]}
                  >
                    {Array.isArray(displayedCorrect)
                      ? displayedCorrect.join(', ')
                      : displayedCorrect}
                  </Text>
                </View>
              )}

              {/* Scripture Reference Link */}
              {locRef ? (
                <View
                  style={[
                    styles.scriptureRefRow,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255, 255, 255, 0.08)'
                        : '#F1F5F9',
                    },
                  ]}
                >
                  <BookOpen size={14} color={primaryText} />
                  <Text
                    style={[
                      styles.scriptureRefTxt,
                      { color: primaryText },
                    ]}
                  >
                    {ui.scriptureReference}: {locRef}
                  </Text>
                </View>
              ) : null}

              {/* Detailed Explanation */}
              {displayedExp ? (
                <View
                  style={[
                    styles.explanationBox,
                    {
                      backgroundColor: isDark
                        ? 'rgba(255, 255, 255, 0.04)'
                        : '#F8FAFC',
                      borderColor: adminBorderColor,
                      borderLeftColor: isDark ? '#FFFFFF' : '#000000',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.explanationTitle,
                      { color: primaryText },
                    ]}
                  >
                    {ui.biblicalInsight}:
                  </Text>
                  <Text
                    style={[
                      styles.explanationTxt,
                      { color: secondaryText },
                    ]}
                  >
                    {displayedExp}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTxt: {
    fontSize: 15,
    marginBottom: 14,
  },
  backBtn: {
    backgroundColor: '#2b52a1',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  backBtnTxt: {
    color: '#ffffff',
    fontWeight: '700',
  },
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
  scorePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePillTxt: {
    fontSize: 13,
    fontWeight: '800',
  },
  scrollArea: {
    flex: 1,
  },
  summaryBar: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
    alignItems: 'center',
  },
  summaryBarTxt: {
    fontSize: 13,
    fontWeight: '700',
  },
  reviewCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusIconWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusTxt: {
    fontSize: 12,
    fontWeight: '800',
  },
  marksEarned: {
    fontSize: 12,
    fontWeight: '700',
  },
  questionText: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 12,
  },
  answerRow: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  answerLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  answerValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  scriptureRefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  scriptureRefTxt: {
    fontSize: 12,
    fontWeight: '700',
  },
  explanationBox: {
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 3,
    marginTop: 4,
  },
  explanationTitle: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 3,
  },
  explanationTxt: {
    fontSize: 13,
    lineHeight: 18,
  },
}));
