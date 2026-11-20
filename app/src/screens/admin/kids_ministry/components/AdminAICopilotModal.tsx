import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Share,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Sparkles,
  BookOpen,
  Award,
  Calendar,
  Share2,
  Save,
  Heart,
  Zap,
} from 'lucide-react-native';
import KidsAIService, { AIGeneratedLessonPlan } from '../../../../services/KidsAIService';
import KidsMinistryService from '../../../../services/KidsMinistryService';
import { KidsClassTier, KidsQuiz, KidsBibleStory } from '../../../../types/KidsMinistryTypes';
import { useAdminTheme } from '../../../../utils/adminThemeHelper';
import BibleReferencePickerModal, { BiblePickerResult } from '../../quiz/BibleReferencePickerModal';

interface Props {
  visible: boolean;
  churchId: string;
  onClose: () => void;
  onContentSaved?: () => void;
}

type AIMode = 'lesson' | 'quiz' | 'story' | 'verse_actions';

const SUGGESTION_CHIPS = [
  'David & Goliath',
  'Daniel in the Lions’ Den',
  'Armor of God (Ephesians 6)',
  'Fruit of the Spirit',
  'Noah’s Ark & Covenant',
  'Feeding 5,000 with 5 Loaves',
  'Good Samaritan: Love Neighbor',
  'Paul & Silas Midnight Praise',
];

export default function AdminAICopilotModal({
  visible,
  churchId,
  onClose,
  onContentSaved,
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

  const [mode, setMode] = useState<AIMode>('lesson');
  const [topicInput, setTopicInput] = useState('David and Goliath (1 Samuel 17)');
  const [selectedTier] = useState<KidsClassTier | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showBiblePicker, setShowBiblePicker] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!loading) {
      setElapsedSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (!visible && abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setLoading(false);
    }
  }, [visible]);

  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  };

  // Results State
  const [generatedLesson, setGeneratedLesson] = useState<AIGeneratedLessonPlan | null>(null);
  const [generatedQuiz, setGeneratedQuiz] = useState<Partial<KidsQuiz> | null>(null);
  const [generatedStory, setGeneratedStory] = useState<Partial<KidsBibleStory> | null>(null);
  const [generatedVerseAids, setGeneratedVerseAids] = useState<any | null>(null);

  const handleGenerate = async () => {
    if (!topicInput.trim()) {
      Alert.alert('Missing Topic', 'Please enter a Scripture passage or Bible topic.');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      setLoading(true);
      setElapsedSeconds(0);
      if (mode === 'lesson') {
        const result = await KidsAIService.generateLessonPlan(
          topicInput.trim(),
          selectedTier === 'all' ? undefined : selectedTier,
          45,
          controller.signal
        );
        setGeneratedLesson(result);
      } else if (mode === 'quiz') {
        const result = await KidsAIService.generateQuiz(topicInput.trim(), 4, 'medium', controller.signal);
        setGeneratedQuiz(result);
      } else if (mode === 'story') {
        const result = await KidsAIService.generateStory(topicInput.trim(), controller.signal);
        setGeneratedStory(result);
      } else if (mode === 'verse_actions') {
        const result = await KidsAIService.generateMemoryVerseAids(
          topicInput.trim(),
          topicInput.trim(),
          controller.signal
        );
        setGeneratedVerseAids(result);
      }
    } catch (e: any) {
      if (e?.isUserCancelled || controller.signal.aborted) {
        return;
      }
      console.error('Rhema AI Generation Error:', e);
      Alert.alert(
        'Generation Notice',
        e.message || 'Could not generate content. Please check your internet connection.'
      );
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setLoading(false);
    }
  };

  const handleSaveQuizToDB = async () => {
    if (!generatedQuiz) return;
    try {
      setSaving(true);
      await KidsMinistryService.createQuiz(churchId, {
        quizId: `quiz_${Date.now()}`,
        churchId,
        title: generatedQuiz.title || 'Bible Quiz',
        titleTelugu: generatedQuiz.titleTelugu || 'బైబిల్ క్విజ్',
        scriptureRef: generatedQuiz.scriptureRef || topicInput,
        pointsReward: generatedQuiz.pointsReward || 50,
        badgeReward: generatedQuiz.badgeReward || 'Bible Star',
        coverEmoji: generatedQuiz.coverEmoji || '🏆',
        questions: (generatedQuiz.questions as any) || [],
      });
      Alert.alert('Saved to LMS! 🎉', 'This AI-generated quiz is now live for all Sunday School children.');
      if (onContentSaved) onContentSaved();
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Could not save quiz');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStoryToDB = async () => {
    if (!generatedStory) return;
    try {
      setSaving(true);
      await KidsMinistryService.createStory(churchId, {
        storyId: `story_${Date.now()}`,
        churchId,
        title: generatedStory.title || 'Bible Story',
        titleTelugu: generatedStory.titleTelugu || 'బైబిల్ కథ',
        scriptureRef: generatedStory.scriptureRef || topicInput,
        theme: generatedStory.theme || 'Faith',
        coverEmoji: generatedStory.coverEmoji || '📖',
        readTime: generatedStory.readTime || '3 min read',
        summary: generatedStory.summary || '',
        summaryTelugu: generatedStory.summaryTelugu || '',
        pages: generatedStory.pages || [],
        reflectionQuestions: generatedStory.reflectionQuestions || [],
      });
      Alert.alert('Saved to Stories! 🎨', 'This story is now in the Bible Learning Center story reader.');
      if (onContentSaved) onContentSaved();
    } catch (e: any) {
      Alert.alert('Save Failed', e.message || 'Could not save story');
    } finally {
      setSaving(false);
    }
  };

  const handleShareLesson = async () => {
    if (!generatedLesson) return;
    try {
      const scheduleText = (generatedLesson.schedule || [])
        .map(s => `• ${s.timeMinutes}m - ${s.segment}: ${s.description}`)
        .join('\n');

      const message =
        `🌟 *AI SUNDAY SCHOOL LESSON BRIEF*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `*Lesson*: ${generatedLesson.title}\n` +
        `*తెలుగు*: ${generatedLesson.titleTelugu}\n` +
        `*Scripture*: ${generatedLesson.scriptureRef} (${generatedLesson.scriptureRefTelugu})\n\n` +
        `🎯 *BIG TRUTH*:\n${generatedLesson.bigIdea}\n${generatedLesson.bigIdeaTelugu}\n\n` +
        `⭐ *MEMORY VERSE*:\n"${generatedLesson.memoryVerse?.verseEnglish || ''}" — ${generatedLesson.memoryVerse?.reference || ''}\n` +
        `"${generatedLesson.memoryVerse?.verseTelugu || ''}" — ${generatedLesson.memoryVerse?.referenceTelugu || ''}\n\n` +
        `🙏 *TEACHER PRAYER*:\n${generatedLesson.teacherPrayer?.english || ''}\n${generatedLesson.teacherPrayer?.telugu || ''}\n\n` +
        `📦 *SUPPLIES*:\n${(generatedLesson.suppliesNeeded || []).join(', ')}\n\n` +
        `⏰ *SCHEDULE*:\n${scheduleText}\n\n` +
        `_Generated via Rhema AI Kids Assistant_`;

      await Share.share({ message });
    } catch (e) {
      // User dismissed share
    }
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Sparkles size={16} color="#D97706" />
              <Text style={[styles.titleSerif, { color: primaryText }]} numberOfLines={1} adjustsFontSizeToFit>
                Rhema AI Studio
              </Text>
            </View>
            <Text style={{ fontSize: 11.5, color: secondaryText, marginTop: 2 }} numberOfLines={1}>
              Bilingual Kids Ministry Content Creator
            </Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Mode Selector Tabs (Clean 2x2 Grid so labels never clip or overlap) */}
          <View style={[styles.modeTabsGrid, { backgroundColor: cardSurface, borderColor }]}>
            {(
              [
                { id: 'lesson', label: 'Lesson Plan', icon: Calendar },
                { id: 'quiz', label: 'Interactive Quiz', icon: Award },
                { id: 'story', label: 'Illustrated Story', icon: BookOpen },
                { id: 'verse_actions', label: 'Verse Actions', icon: Heart },
              ] as const
            ).map(tab => {
              const active = mode === tab.id;
              const IconComp = tab.icon;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.modeTab,
                    { backgroundColor: secondarySurface, borderColor },
                    active && styles.modeTabActive,
                  ]}
                  onPress={() => setMode(tab.id)}
                  activeOpacity={0.85}
                >
                  <IconComp size={15} color={active ? '#000000' : secondaryText} />
                  <Text
                    style={[
                      styles.modeTabText,
                      { color: secondaryText },
                      active && styles.modeTabTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Topic Input Box */}
          <View style={[styles.inputCard, { backgroundColor: cardSurface, borderColor }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <Text style={styles.inputLabel}>SCRIPTURE PASSAGE OR BIBLE TOPIC</Text>
              <TouchableOpacity
                style={[styles.bibleSelectBtn, { backgroundColor: 'rgba(245, 158, 11, 0.14)', borderColor: 'rgba(245, 158, 11, 0.4)' }]}
                onPress={() => setShowBiblePicker(true)}
                activeOpacity={0.85}
              >
                <BookOpen size={13} color="#D97706" />
                <Text style={styles.bibleSelectBtnText}>Select from Bible</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.textInput, { backgroundColor: secondarySurface, borderColor, color: primaryText }]}
                placeholder="e.g. David & Goliath (1 Samuel 17), Fruit of the Spirit..."
                placeholderTextColor={secondaryText}
                value={topicInput}
                onChangeText={setTopicInput}
              />
              <TouchableOpacity
                style={styles.generateBtn}
                onPress={handleGenerate}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#000000" />
                ) : (
                  <>
                    <Zap size={16} color="#000000" />
                    <Text style={styles.generateBtnText}>Create</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Quick Suggestion Chips */}
            <Text style={[styles.chipsLabel, { color: secondaryText }]}>Quick suggestions:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {SUGGESTION_CHIPS.map((chip, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.chip, { backgroundColor: secondarySurface, borderColor }]}
                  onPress={() => setTopicInput(chip)}
                >
                  <Text style={[styles.chipText, { color: primaryText }]}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Loading Indicator */}
          {loading && (
            <View style={[styles.loadingCard, { backgroundColor: cardSurface, borderColor }]}>
              <ActivityIndicator size="large" color="#F59E0B" />
              <Text style={[styles.loadingTitle, { color: primaryText }]}>
                Creating with Rhema AI... ({elapsedSeconds}s)
              </Text>
              <Text style={[styles.loadingSub, { color: secondaryText }]}>
                Crafting scriptural, bilingual Telugu & English Kids Ministry content.
              </Text>
              <TouchableOpacity
                onPress={handleCancelGeneration}
                style={[styles.cancelGenBtn, { borderColor }]}
                activeOpacity={0.8}
              >
                <Text style={[styles.cancelGenBtnText, { color: secondaryText }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* RESULTS: MODE 1 LESSON PLAN */}
          {mode === 'lesson' && generatedLesson && !loading && (
            <View style={[styles.resultCard, { backgroundColor: cardSurface, borderColor }]}>
              <View style={styles.resultHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultBadge}>AI GENERATED BILINGUAL LESSON</Text>
                  <Text style={[styles.resultTitle, { color: primaryText }]}>{generatedLesson.title}</Text>
                  <Text style={styles.resultTitleTe}>{generatedLesson.titleTelugu}</Text>
                  <Text style={[styles.resultRef, { color: secondaryText }]}>
                    📖 {generatedLesson.scriptureRef} ({generatedLesson.scriptureRefTelugu})
                  </Text>
                </View>
                <TouchableOpacity style={styles.shareActionBtn} onPress={handleShareLesson}>
                  <Share2 size={16} color="#D97706" />
                </TouchableOpacity>
              </View>

              {/* Big Idea */}
              <View style={styles.highlightBox}>
                <Text style={styles.highlightLabel}>BIG TRUTH / ప్రధాన సత్యం:</Text>
                <Text style={[styles.highlightEn, { color: primaryText }]}>{generatedLesson.bigIdea}</Text>
                <Text style={[styles.highlightTe, { color: secondaryText }]}>{generatedLesson.bigIdeaTelugu}</Text>
              </View>

              {/* Memory Verse */}
              {!!generatedLesson.memoryVerse && (
                <View style={[styles.verseBox, { backgroundColor: secondarySurface }]}>
                  <Text style={styles.verseBoxLabel}>⭐ MEMORY VERSE:</Text>
                  <Text style={[styles.verseEn, { color: primaryText }]}>"{generatedLesson.memoryVerse.verseEnglish}"</Text>
                  <Text style={styles.verseRefTag}>— {generatedLesson.memoryVerse.reference}</Text>
                  <Text style={[styles.verseTe, { color: secondaryText }]}>"{generatedLesson.memoryVerse.verseTelugu}"</Text>
                  <Text style={styles.verseRefTag}>— {generatedLesson.memoryVerse.referenceTelugu}</Text>
                </View>
              )}

              {/* Teacher Prayer Focus */}
              <View style={[styles.prepBox, { backgroundColor: secondarySurface }]}>
                <Text style={[styles.prepLabel, { color: secondaryText }]}>🙏 TEACHER PRAYER:</Text>
                <Text style={[styles.prepEn, { color: primaryText }]}>{generatedLesson.teacherPrayer?.english}</Text>
                <Text style={[styles.prepTe, { color: secondaryText }]}>{generatedLesson.teacherPrayer?.telugu}</Text>
                <Text style={[styles.prepLabel, { color: secondaryText, marginTop: 8 }]}>📦 SUPPLIES:</Text>
                <Text style={[styles.suppliesText, { color: primaryText }]}>
                  {(generatedLesson.suppliesNeeded || []).join(', ')}
                </Text>
              </View>

              {/* 45 Min Schedule */}
              <View style={[styles.scheduleBox, { backgroundColor: secondarySurface }]}>
                <Text style={[styles.scheduleBoxLabel, { color: secondaryText }]}>⏰ 45-MINUTE SCHEDULE:</Text>
                {(generatedLesson.schedule || []).map((item, idx) => (
                  <View key={idx} style={styles.schedItem}>
                    <Text style={styles.schedTime}>{item.timeMinutes}m</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.schedName, { color: primaryText }]}>{item.segment}</Text>
                      <Text style={[styles.schedDesc, { color: secondaryText }]}>{item.description}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* RESULTS: MODE 2 QUIZ */}
          {mode === 'quiz' && generatedQuiz && !loading && (
            <View style={[styles.resultCard, { backgroundColor: cardSurface, borderColor }]}>
              <View style={styles.resultHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultBadge}>AI GENERATED BIBLE QUIZ</Text>
                  <Text style={[styles.resultTitle, { color: primaryText }]}>{generatedQuiz.title}</Text>
                  <Text style={styles.resultTitleTe}>{generatedQuiz.titleTelugu}</Text>
                  <Text style={[styles.resultRef, { color: secondaryText }]}>📖 {generatedQuiz.scriptureRef}</Text>
                </View>
                <TouchableOpacity
                  style={styles.saveActionBtn}
                  onPress={handleSaveQuizToDB}
                  disabled={saving}
                >
                  <Save size={16} color="#000000" />
                  <Text style={styles.saveActionBtnText}>{saving ? 'Saving...' : 'Save to LMS'}</Text>
                </TouchableOpacity>
              </View>

              {/* Questions List */}
              <View style={{ gap: 10, marginTop: 10 }}>
                {generatedQuiz.questions?.map((q: any, idx: number) => (
                  <View key={idx} style={[styles.qCard, { backgroundColor: secondarySurface }]}>
                    <Text style={styles.qIndex}>QUESTION {idx + 1}</Text>
                    <Text style={[styles.qTextEn, { color: primaryText }]}>{q.questionEnglish}</Text>
                    <Text style={[styles.qTextTe, { color: secondaryText }]}>{q.questionTelugu}</Text>
                    <View style={styles.optionsWrap}>
                      {q.options?.map((opt: string, optIdx: number) => (
                        <View
                          key={optIdx}
                          style={[
                            styles.optPill,
                            { backgroundColor: cardSurface },
                            optIdx === q.correctIndex && styles.optPillCorrect,
                          ]}
                        >
                          <Text
                            style={[
                              styles.optPillText,
                              { color: primaryText },
                              optIdx === q.correctIndex && styles.optPillTextCorrect,
                            ]}
                          >
                            {optIdx === q.correctIndex ? '✓ ' : ''}{opt}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <Text style={[styles.qExplanation, { color: secondaryText }]}>💡 {q.explanation}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* RESULTS: MODE 3 STORY */}
          {mode === 'story' && generatedStory && !loading && (
            <View style={[styles.resultCard, { backgroundColor: cardSurface, borderColor }]}>
              <View style={styles.resultHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultBadge}>AI GENERATED STORYBOOK</Text>
                  <Text style={[styles.resultTitle, { color: primaryText }]}>{generatedStory.title}</Text>
                  <Text style={styles.resultTitleTe}>{generatedStory.titleTelugu}</Text>
                  <Text style={[styles.resultRef, { color: secondaryText }]}>
                    📖 {generatedStory.scriptureRef} · {generatedStory.readTime}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.saveActionBtn}
                  onPress={handleSaveStoryToDB}
                  disabled={saving}
                >
                  <Save size={16} color="#000000" />
                  <Text style={styles.saveActionBtnText}>{saving ? 'Saving...' : 'Save Story'}</Text>
                </TouchableOpacity>
              </View>

              {/* Pages Preview */}
              <View style={{ gap: 10, marginTop: 10 }}>
                {generatedStory.pages?.map((p: any, idx: number) => (
                  <View key={idx} style={[styles.storyPageCard, { backgroundColor: secondarySurface }]}>
                    <View style={styles.storyPageHead}>
                      <Text style={styles.storyPageNum}>PAGE {p.pageNumber}</Text>
                      <Text style={styles.storyEmoji}>{p.emoji}</Text>
                    </View>
                    <Text style={[styles.storyHeaderEn, { color: primaryText }]}>{p.headerEnglish}</Text>
                    <Text style={styles.storyHeaderTe}>{p.headerTelugu}</Text>
                    <Text style={[styles.storyTextEn, { color: primaryText }]}>{p.textEnglish}</Text>
                    <Text style={[styles.storyTextTe, { color: secondaryText }]}>{p.textTelugu}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* RESULTS: MODE 4 VERSE ACTIONS */}
          {mode === 'verse_actions' && generatedVerseAids && !loading && (
            <View style={[styles.resultCard, { backgroundColor: cardSurface, borderColor }]}>
              <Text style={styles.resultBadge}>MEMORY VERSE HAND ACTIONS & RHYMES</Text>

              {/* Hand actions */}
              <View style={[styles.actionsWrap, { backgroundColor: secondarySurface }]}>
                <Text style={styles.actionsHeading}>🤲 HAND MOTIONS FOR KIDS:</Text>
                {generatedVerseAids.handActions?.map((item: any, idx: number) => (
                  <View key={idx} style={[styles.motionRow, { borderBottomColor: borderColor }]}>
                    <Text style={[styles.motionWord, { color: primaryText }]}>{item.word}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.motionGesture, { color: primaryText }]}>{item.gesture}</Text>
                      <Text style={[styles.motionGestureTe, { color: secondaryText }]}>{item.gestureTelugu}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Catchy Rhyme */}
              <View style={styles.rhymeBox}>
                <Text style={styles.rhymeHeading}>🎵 CATCHY RHYME TO REMEMBER:</Text>
                <Text style={[styles.rhymeEn, { color: primaryText }]}>"{generatedVerseAids.mnemonicRhyme}"</Text>
                <Text style={[styles.rhymeTe, { color: secondaryText }]}>"{generatedVerseAids.mnemonicRhymeTelugu}"</Text>
              </View>

              {/* Family Talk Question */}
              <View style={[styles.familyBox, { backgroundColor: secondarySurface }]}>
                <Text style={styles.familyHeading}>🏡 BEDTIME FAMILY TALK PROMPT:</Text>
                <Text style={[styles.familyEn, { color: primaryText }]}>{generatedVerseAids.familyTalkPrompt}</Text>
                <Text style={[styles.familyTe, { color: secondaryText }]}>{generatedVerseAids.familyTalkPromptTelugu}</Text>
              </View>
            </View>
          )}
        </ScrollView>

        <BibleReferencePickerModal
          visible={showBiblePicker}
          onClose={() => setShowBiblePicker(false)}
          mode="reference"
          onSelectReference={(res: BiblePickerResult) => {
            setTopicInput(res.referenceString);
          }}
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
  aiBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(251, 191, 36, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 3,
  },
  aiBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.5,
  },
  titleSerif: {
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  scroll: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  modeTabsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 14,
    padding: 8,
    gap: 8,
    borderWidth: 1,
  },
  modeTab: {
    width: '48.5%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  modeTabActive: {
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
  inputCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 10,
  },
  inputLabel: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.5,
  },
  bibleSelectBtn: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  bibleSelectBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textInput: {
    flex: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    borderWidth: 1,
  },
  generateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
  },
  generateBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000000',
  },
  chipsLabel: {
    fontSize: 10,
  },
  chipsRow: {
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  loadingCard: {
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
  },
  loadingTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 4,
  },
  loadingSub: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  cancelGenBtn: {
    marginTop: 6,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  cancelGenBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  resultCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  resultBadge: {
    fontSize: 9,
    fontWeight: '800',
    color: '#10B981',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  resultTitle: {
    fontSize: 17,
    fontWeight: 'bold',
  },
  resultTitleTe: {
    fontSize: 14,
    color: '#D97706',
    marginTop: 2,
  },
  resultRef: {
    fontSize: 12,
    marginTop: 4,
  },
  shareActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(251, 191, 36, 0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveActionBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
  },
  highlightBox: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  highlightLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  highlightEn: {
    fontSize: 13,
    fontWeight: '700',
  },
  highlightTe: {
    fontSize: 12,
    marginTop: 2,
  },
  verseBox: {
    borderRadius: 10,
    padding: 12,
  },
  verseBoxLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.5,
    marginBottom: 4,
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
    marginBottom: 4,
  },
  verseTe: {
    fontSize: 12,
    lineHeight: 17,
  },
  prepBox: {
    borderRadius: 10,
    padding: 12,
  },
  prepLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  prepEn: {
    fontSize: 12,
    lineHeight: 17,
  },
  prepTe: {
    fontSize: 11,
    marginTop: 2,
  },
  suppliesText: {
    fontSize: 11,
  },
  scheduleBox: {
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  scheduleBoxLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  schedItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  schedTime: {
    fontSize: 11,
    fontWeight: '800',
    color: '#D97706',
    width: 28,
  },
  schedName: {
    fontSize: 12,
    fontWeight: '700',
  },
  schedDesc: {
    fontSize: 11,
  },
  qCard: {
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  qIndex: {
    fontSize: 9,
    fontWeight: '800',
    color: '#D97706',
  },
  qTextEn: {
    fontSize: 13,
    fontWeight: '700',
  },
  qTextTe: {
    fontSize: 12,
  },
  optionsWrap: {
    gap: 4,
    marginTop: 4,
  },
  optPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  optPillCorrect: {
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    borderColor: '#10B981',
    borderWidth: 1,
  },
  optPillText: {
    fontSize: 12,
  },
  optPillTextCorrect: {
    color: '#10B981',
    fontWeight: '700',
  },
  qExplanation: {
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  storyPageCard: {
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  storyPageHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  storyPageNum: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
  },
  storyEmoji: {
    fontSize: 18,
  },
  storyHeaderEn: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  storyHeaderTe: {
    fontSize: 12,
    color: '#D97706',
  },
  storyTextEn: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  storyTextTe: {
    fontSize: 11,
    lineHeight: 16,
  },
  actionsWrap: {
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  actionsHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
    marginBottom: 4,
  },
  motionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
    borderBottomWidth: 1,
  },
  motionWord: {
    fontSize: 12,
    fontWeight: '800',
    width: 90,
  },
  motionGesture: {
    fontSize: 12,
  },
  motionGestureTe: {
    fontSize: 11,
  },
  rhymeBox: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  rhymeHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
  },
  rhymeEn: {
    fontSize: 13,
    fontWeight: '700',
  },
  rhymeTe: {
    fontSize: 12,
  },
  familyBox: {
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  familyHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#10B981',
  },
  familyEn: {
    fontSize: 12,
  },
  familyTe: {
    fontSize: 11,
  },
});
