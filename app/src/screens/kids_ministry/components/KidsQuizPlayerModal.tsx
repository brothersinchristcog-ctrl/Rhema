import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import {
  X,
  Award,
  CheckCircle,
  XCircle,
  Sparkles,
  HelpCircle,
  RefreshCw,
  Trophy,
} from 'lucide-react-native';
import { KidsQuiz, KidsQuizQuestion } from '../../../types/KidsMinistryTypes';

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
  if (!quiz) return null;

  const questions = quiz.questions || [];
  const totalQuestions = questions.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  const currentQ: KidsQuizQuestion | undefined = questions[currentIndex];

  const handleSelectOption = (idx: number) => {
    if (selectedOption !== null || !currentQ) return; // Prevent changing after answer
    setSelectedOption(idx);
    if (idx === currentQ.correctIndex) {
      setScore(prev => prev + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
    } else {
      setQuizFinished(true);
    }
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setScore(0);
    setQuizFinished(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTitles}>
            <Text style={styles.headerTitleSerif}>{quiz.title}</Text>
            <Text style={styles.headerTeluguSub}>{quiz.titleTelugu}</Text>
          </View>

          <View style={styles.scoreBadge}>
            <Text style={styles.scoreBadgeText}>{score * 10} pts</Text>
          </View>
        </View>

        {!quizFinished && currentQ ? (
          <>
            {/* Progress Bar */}
            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${((currentIndex + 1) / totalQuestions) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                Question {currentIndex + 1} of {totalQuestions}
              </Text>
            </View>

            {/* Question Card */}
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
              <View style={styles.questionCard}>
                <View style={styles.qEmojiBubble}>
                  <Text style={{ fontSize: 32 }}>{quiz.coverEmoji || '❓'}</Text>
                </View>

                <Text style={styles.qEnglishText}>{currentQ.questionEnglish}</Text>
                {currentQ.questionTelugu ? (
                  <Text style={styles.qTeluguText}>{currentQ.questionTelugu}</Text>
                ) : null}
              </View>

              {/* 4 Options */}
              <View style={styles.optionsList}>
                {currentQ.options.map((opt, idx) => {
                  const isSelected = selectedOption === idx;
                  const isCorrect = currentQ.correctIndex === idx;
                  const showResult = selectedOption !== null;

                  let optCardStyle: any = styles.optionCard;
                  let optLetterStyle: any = styles.optionLetter;

                  if (showResult) {
                    if (isCorrect) {
                      optCardStyle = [styles.optionCard, styles.optionCorrect];
                      optLetterStyle = [styles.optionLetter, styles.optionLetterCorrect];
                    } else if (isSelected) {
                      optCardStyle = [styles.optionCard, styles.optionWrong];
                      optLetterStyle = [styles.optionLetter, styles.optionLetterWrong];
                    }
                  }

                  const letters = ['A', 'B', 'C', 'D'];

                  return (
                    <TouchableOpacity
                      key={idx}
                      style={optCardStyle}
                      onPress={() => handleSelectOption(idx)}
                      disabled={showResult}
                      activeOpacity={0.85}
                    >
                      <View style={optLetterStyle}>
                        <Text style={styles.letterText}>{letters[idx]}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.optText}>{opt}</Text>
                        {currentQ.optionsTelugu && currentQ.optionsTelugu[idx] ? (
                          <Text style={styles.optSubTelugu}>
                            {currentQ.optionsTelugu[idx]}
                          </Text>
                        ) : null}
                      </View>

                      {showResult && isCorrect && <CheckCircle size={18} color="#10B981" />}
                      {showResult && isSelected && !isCorrect && <XCircle size={18} color="#EF4444" />}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Explanation Box */}
              {selectedOption !== null && (
                <View style={styles.explanationBox}>
                  <Text style={styles.explanationTitle}>SCRIPTURE CONTEXT:</Text>
                  <Text style={styles.explanationText}>{currentQ.explanation}</Text>
                </View>
              )}
            </ScrollView>

            {/* Bottom Next Button */}
            {selectedOption !== null && (
              <View style={styles.footerNav}>
                <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
                  <Text style={styles.nextBtnText}>
                    {currentIndex === totalQuestions - 1 ? 'Show My Results' : 'Next Question &rsaquo;'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          /* Quiz Results Trophy Screen */
          <View style={styles.resultsContainer}>
            <View style={styles.trophyBubble}>
              <Trophy size={48} color="#FBBF24" />
            </View>

            <Text style={styles.congratsTitle}>Quiz Completed!</Text>
            <Text style={styles.congratsSub}>
              You answered {score} out of {totalQuestions} questions correctly!
            </Text>

            {/* Points Award Card */}
            <View style={styles.rewardCard}>
              <View style={styles.rewardRow}>
                <Text style={{ fontSize: 24 }}>⭐</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rewardTitle}>+{score * 10} Bible Star Points</Text>
                  <Text style={styles.rewardSub}>Added to your Rhema Kids profile</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.rewardRow}>
                <Text style={{ fontSize: 24 }}>{quiz.badgeReward.split(' ')[0]}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rewardTitle}>{quiz.badgeReward}</Text>
                  <Text style={styles.rewardSub}>Unlocked badge for memory verses</Text>
                </View>
              </View>
            </View>

            {/* Actions */}
            <View style={styles.resultsActions}>
              <TouchableOpacity style={styles.finishQuizBtn} onPress={onClose}>
                <Text style={styles.finishQuizBtnText}>Claim Rewards & Close</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.retryBtn} onPress={handleRestart}>
                <RefreshCw size={14} color="#9CA3AF" />
                <Text style={styles.retryBtnText}>Play Again</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
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
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 54 : 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    alignItems: 'center',
    flex: 1,
  },
  headerTitleSerif: {
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerTeluguSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  scoreBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FBBF24',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
    gap: 6,
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#18181B',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FBBF24',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  questionCard: {
    backgroundColor: '#18181B',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
  },
  qEmojiBubble: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#09090B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#27272A',
  },
  qEnglishText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 22,
  },
  qTeluguText: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  optionsList: {
    gap: 10,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#18181B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 12,
  },
  optionCorrect: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: '#10B981',
  },
  optionWrong: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: '#EF4444',
  },
  optionLetter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLetterCorrect: {
    backgroundColor: '#064E3B',
  },
  optionLetterWrong: {
    backgroundColor: '#7F1D1D',
  },
  letterText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  optText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  optSubTelugu: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  explanationBox: {
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
  },
  explanationTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 1,
    marginBottom: 4,
  },
  explanationText: {
    fontSize: 12,
    color: '#E4E4E7',
    lineHeight: 18,
  },
  footerNav: {
    padding: 20,
    backgroundColor: '#000000',
    borderTopWidth: 1,
    borderTopColor: '#18181B',
  },
  nextBtn: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
  },
  resultsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  trophyBubble: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FBBF24',
    marginBottom: 16,
  },
  congratsTitle: {
    fontSize: 22,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  congratsSub: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
  },
  rewardCard: {
    width: '100%',
    backgroundColor: '#18181B',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 12,
    marginBottom: 24,
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rewardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rewardSub: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  divider: {
    height: 1,
    backgroundColor: '#27272A',
  },
  resultsActions: {
    width: '100%',
    gap: 10,
  },
  finishQuizBtn: {
    backgroundColor: '#FBBF24',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  finishQuizBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#000000',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  retryBtnText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '600',
  },
});
