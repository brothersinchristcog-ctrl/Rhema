import React, { useState } from 'react';
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
} from 'react-native';
import {
  X,
  Sparkles,
  BookOpen,
  Award,
  Calendar,
  Check,
  Share2,
  Save,
  RefreshCw,
  Layers,
  Heart,
  ChevronRight,
  Send,
  Zap,
} from 'lucide-react-native';
import KidsAIService, { AIGeneratedLessonPlan } from '../../../../services/KidsAIService';
import KidsMinistryService from '../../../../services/KidsMinistryService';
import { KidsClassTier, KidsQuiz, KidsBibleStory } from '../../../../types/KidsMinistryTypes';

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
  const [mode, setMode] = useState<AIMode>('lesson');
  const [topicInput, setTopicInput] = useState('David and Goliath (1 Samuel 17)');
  const [selectedTier, setSelectedTier] = useState<KidsClassTier | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

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

    try {
      setLoading(true);
      if (mode === 'lesson') {
        const result = await KidsAIService.generateLessonPlan(
          topicInput.trim(),
          selectedTier === 'all' ? undefined : selectedTier,
          45
        );
        setGeneratedLesson(result);
      } else if (mode === 'quiz') {
        const result = await KidsAIService.generateQuiz(topicInput.trim(), 4, 'medium');
        setGeneratedQuiz(result);
      } else if (mode === 'story') {
        const result = await KidsAIService.generateStory(topicInput.trim());
        setGeneratedStory(result);
      } else if (mode === 'verse_actions') {
        const result = await KidsAIService.generateMemoryVerseAids(
          topicInput.trim(),
          'Key Scripture'
        );
        setGeneratedVerseAids(result);
      }
    } catch (e: any) {
      console.error('Claude AI Generation Error:', e);
      Alert.alert(
        'Generation Notice',
        e.message || 'Could not generate with Claude. Please check internet connection.'
      );
    } finally {
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
      const scheduleText = generatedLesson.schedule
        .map(s => `• ${s.timeMinutes}m - ${s.segment}: ${s.description}`)
        .join('\n');

      const message = `🌟 *AI SUNDAY SCHOOL LESSON BRIEF*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `*Lesson*: ${generatedLesson.title}\n` +
        `*తెలుగు*: ${generatedLesson.titleTelugu}\n` +
        `*Scripture*: ${generatedLesson.scriptureRef} (${generatedLesson.scriptureRefTelugu})\n\n` +
        `🎯 *BIG TRUTH*:\n${generatedLesson.bigIdea}\n${generatedLesson.bigIdeaTelugu}\n\n` +
        `⭐ *MEMORY VERSE*:\n"${generatedLesson.memoryVerse.verseEnglish}" — ${generatedLesson.memoryVerse.reference}\n` +
        `"${generatedLesson.memoryVerse.verseTelugu}" — ${generatedLesson.memoryVerse.referenceTelugu}\n\n` +
        `🙏 *TEACHER PRAYER*:\n${generatedLesson.teacherPrayer.english}\n${generatedLesson.teacherPrayer.telugu}\n\n` +
        `📦 *SUPPLIES*:\n${generatedLesson.suppliesNeeded.join(', ')}\n\n` +
        `⏰ *SCHEDULE*:\n${scheduleText}\n\n` +
        `_Generated via Rhema AI Kids Assistant (Claude 3.5 Sonnet)_`;

      await Share.share({ message });
    } catch (e) {
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
            <View style={styles.aiBadgeRow}>
              <Sparkles size={14} color="#FBBF24" />
              <Text style={styles.aiBadgeText}>CLAUDE 3.5 SONNET CO-PILOT</Text>
            </View>
            <Text style={styles.titleSerif}>AI Kids Ministry Studio</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Mode Selector Tabs */}
          <View style={styles.modeTabsRow}>
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
                  style={[styles.modeTab, active && styles.modeTabActive]}
                  onPress={() => {
                    setMode(tab.id);
                  }}
                >
                  <IconComp size={14} color={active ? '#000000' : '#9CA3AF'} />
                  <Text style={[styles.modeTabText, active && styles.modeTabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Topic Input Box */}
          <View style={styles.inputCard}>
            <Text style={styles.inputLabel}>SCRIPTURE PASSAGE OR BIBLE TOPIC</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. David & Goliath (1 Samuel 17), Fruit of the Spirit..."
                placeholderTextColor="#6B7280"
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
            <Text style={styles.chipsLabel}>Quick suggestions:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {SUGGESTION_CHIPS.map((chip, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.chip}
                  onPress={() => setTopicInput(chip)}
                >
                  <Text style={styles.chipText}>{chip}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Loading Indicator */}
          {loading && (
            <View style={styles.loadingCard}>
              <ActivityIndicator size="large" color="#FBBF24" />
              <Text style={styles.loadingTitle}>Claude 3.5 Sonnet is thinking...</Text>
              <Text style={styles.loadingSub}>
                Generating scriptural, bilingual Telugu & English material with teaching adaptations.
              </Text>
            </View>
          )}

          {/* RESULTS: MODE 1 LESSON PLAN */}
          {mode === 'lesson' && generatedLesson && !loading && (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultBadge}>AI GENERATED BILINGUAL LESSON</Text>
                  <Text style={styles.resultTitle}>{generatedLesson.title}</Text>
                  <Text style={styles.resultTitleTe}>{generatedLesson.titleTelugu}</Text>
                  <Text style={styles.resultRef}>
                    📖 {generatedLesson.scriptureRef} ({generatedLesson.scriptureRefTelugu})
                  </Text>
                </View>
                <TouchableOpacity style={styles.shareActionBtn} onPress={handleShareLesson}>
                  <Share2 size={16} color="#FBBF24" />
                </TouchableOpacity>
              </View>

              {/* Big Idea */}
              <View style={styles.highlightBox}>
                <Text style={styles.highlightLabel}>BIG TRUTH / ప్రధాన సత్యం:</Text>
                <Text style={styles.highlightEn}>{generatedLesson.bigIdea}</Text>
                <Text style={styles.highlightTe}>{generatedLesson.bigIdeaTelugu}</Text>
              </View>

              {/* Memory Verse */}
              <View style={styles.verseBox}>
                <Text style={styles.verseBoxLabel}>⭐ MEMORY VERSE:</Text>
                <Text style={styles.verseEn}>"{generatedLesson.memoryVerse.verseEnglish}"</Text>
                <Text style={styles.verseRefTag}>— {generatedLesson.memoryVerse.reference}</Text>
                <Text style={styles.verseTe}>"{generatedLesson.memoryVerse.verseTelugu}"</Text>
                <Text style={styles.verseRefTag}>— {generatedLesson.memoryVerse.referenceTelugu}</Text>
              </View>

              {/* Teacher Prayer Focus */}
              <View style={styles.prepBox}>
                <Text style={styles.prepLabel}>🙏 TEACHER PRAYER:</Text>
                <Text style={styles.prepEn}>{generatedLesson.teacherPrayer.english}</Text>
                <Text style={styles.prepTe}>{generatedLesson.teacherPrayer.telugu}</Text>
                <Text style={[styles.prepLabel, { marginTop: 8 }]}>📦 SUPPLIES:</Text>
                <Text style={styles.suppliesText}>{generatedLesson.suppliesNeeded.join(', ')}</Text>
              </View>

              {/* 45 Min Schedule */}
              <View style={styles.scheduleBox}>
                <Text style={styles.scheduleBoxLabel}>⏰ 45-MINUTE SCHEDULE:</Text>
                {generatedLesson.schedule.map((item, idx) => (
                  <View key={idx} style={styles.schedItem}>
                    <Text style={styles.schedTime}>{item.timeMinutes}m</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.schedName}>{item.segment}</Text>
                      <Text style={styles.schedDesc}>{item.description}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* RESULTS: MODE 2 QUIZ */}
          {mode === 'quiz' && generatedQuiz && !loading && (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultBadge}>AI GENERATED BIBLE QUIZ</Text>
                  <Text style={styles.resultTitle}>{generatedQuiz.title}</Text>
                  <Text style={styles.resultTitleTe}>{generatedQuiz.titleTelugu}</Text>
                  <Text style={styles.resultRef}>📖 {generatedQuiz.scriptureRef}</Text>
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
                  <View key={idx} style={styles.qCard}>
                    <Text style={styles.qIndex}>QUESTION {idx + 1}</Text>
                    <Text style={styles.qTextEn}>{q.questionEnglish}</Text>
                    <Text style={styles.qTextTe}>{q.questionTelugu}</Text>
                    <View style={styles.optionsWrap}>
                      {q.options?.map((opt: string, optIdx: number) => (
                        <View
                          key={optIdx}
                          style={[
                            styles.optPill,
                            optIdx === q.correctIndex && styles.optPillCorrect,
                          ]}
                        >
                          <Text
                            style={[
                              styles.optPillText,
                              optIdx === q.correctIndex && styles.optPillTextCorrect,
                            ]}
                          >
                            {optIdx === q.correctIndex ? '✓ ' : ''}{opt}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.qExplanation}>💡 {q.explanation}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* RESULTS: MODE 3 STORY */}
          {mode === 'story' && generatedStory && !loading && (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.resultBadge}>AI GENERATED STORYBOOK</Text>
                  <Text style={styles.resultTitle}>{generatedStory.title}</Text>
                  <Text style={styles.resultTitleTe}>{generatedStory.titleTelugu}</Text>
                  <Text style={styles.resultRef}>
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
                  <View key={idx} style={styles.storyPageCard}>
                    <View style={styles.storyPageHead}>
                      <Text style={styles.storyPageNum}>PAGE {p.pageNumber}</Text>
                      <Text style={styles.storyEmoji}>{p.emoji}</Text>
                    </View>
                    <Text style={styles.storyHeaderEn}>{p.headerEnglish}</Text>
                    <Text style={styles.storyHeaderTe}>{p.headerTelugu}</Text>
                    <Text style={styles.storyTextEn}>{p.textEnglish}</Text>
                    <Text style={styles.storyTextTe}>{p.textTelugu}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* RESULTS: MODE 4 VERSE ACTIONS */}
          {mode === 'verse_actions' && generatedVerseAids && !loading && (
            <View style={styles.resultCard}>
              <Text style={styles.resultBadge}>MEMORY VERSE HAND ACTIONS & RHYMES</Text>

              {/* Hand actions */}
              <View style={styles.actionsWrap}>
                <Text style={styles.actionsHeading}>🤲 HAND MOTIONS FOR KIDS:</Text>
                {generatedVerseAids.handActions?.map((item: any, idx: number) => (
                  <View key={idx} style={styles.motionRow}>
                    <Text style={styles.motionWord}>{item.word}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.motionGesture}>{item.gesture}</Text>
                      <Text style={styles.motionGestureTe}>{item.gestureTelugu}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Catchy Rhyme */}
              <View style={styles.rhymeBox}>
                <Text style={styles.rhymeHeading}>🎵 CATCHY RHYME TO REMEMBER:</Text>
                <Text style={styles.rhymeEn}>"{generatedVerseAids.mnemonicRhyme}"</Text>
                <Text style={styles.rhymeTe}>"{generatedVerseAids.mnemonicRhymeTelugu}"</Text>
              </View>

              {/* Family Talk Question */}
              <View style={styles.familyBox}>
                <Text style={styles.familyHeading}>🏡 BEDTIME FAMILY TALK PROMPT:</Text>
                <Text style={styles.familyEn}>{generatedVerseAids.familyTalkPrompt}</Text>
                <Text style={styles.familyTe}>{generatedVerseAids.familyTalkPromptTelugu}</Text>
              </View>
            </View>
          )}
        </ScrollView>
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
  aiBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 2,
  },
  aiBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  titleSerif: {
    fontFamily: 'Georgia',
    fontSize: 19,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  scroll: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  modeTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#18181B',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: '#FBBF24',
  },
  modeTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  modeTabTextActive: {
    color: '#000000',
  },
  inputCard: {
    backgroundColor: '#18181B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 10,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#09090B',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#27272A',
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
    color: '#6B7280',
  },
  chipsRow: {
    gap: 8,
  },
  chip: {
    backgroundColor: '#27272A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  chipText: {
    fontSize: 11,
    color: '#D1D5DB',
  },
  loadingCard: {
    backgroundColor: '#18181B',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272A',
    gap: 8,
  },
  loadingTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 4,
  },
  loadingSub: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },
  resultCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#27272A',
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
    color: '#FFFFFF',
  },
  resultTitleTe: {
    fontSize: 14,
    color: '#FBBF24',
    marginTop: 2,
  },
  resultRef: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  shareActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
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
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderRadius: 10,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#FBBF24',
  },
  highlightLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  highlightEn: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  highlightTe: {
    fontSize: 12,
    color: '#D1D5DB',
    marginTop: 2,
  },
  verseBox: {
    backgroundColor: '#09090B',
    borderRadius: 10,
    padding: 12,
  },
  verseBoxLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.5,
    marginBottom: 4,
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
    marginBottom: 4,
  },
  verseTe: {
    fontSize: 12,
    color: '#E5E7EB',
    lineHeight: 17,
  },
  prepBox: {
    backgroundColor: '#09090B',
    borderRadius: 10,
    padding: 12,
  },
  prepLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  prepEn: {
    fontSize: 12,
    color: '#E5E7EB',
    lineHeight: 17,
  },
  prepTe: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  suppliesText: {
    fontSize: 11,
    color: '#D1D5DB',
  },
  scheduleBox: {
    backgroundColor: '#09090B',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  scheduleBoxLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
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
    color: '#FBBF24',
    width: 28,
  },
  schedName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  schedDesc: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  qCard: {
    backgroundColor: '#09090B',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  qIndex: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FBBF24',
  },
  qTextEn: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  qTextTe: {
    fontSize: 12,
    color: '#D1D5DB',
  },
  optionsWrap: {
    gap: 4,
    marginTop: 4,
  },
  optPill: {
    backgroundColor: '#18181B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  optPillCorrect: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10B981',
    borderWidth: 1,
  },
  optPillText: {
    fontSize: 12,
    color: '#D1D5DB',
  },
  optPillTextCorrect: {
    color: '#10B981',
    fontWeight: '700',
  },
  qExplanation: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    fontStyle: 'italic',
  },
  storyPageCard: {
    backgroundColor: '#09090B',
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
    color: '#FBBF24',
  },
  storyEmoji: {
    fontSize: 18,
  },
  storyHeaderEn: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  storyHeaderTe: {
    fontSize: 12,
    color: '#FBBF24',
  },
  storyTextEn: {
    fontSize: 12,
    color: '#D1D5DB',
    lineHeight: 18,
    marginTop: 2,
  },
  storyTextTe: {
    fontSize: 11,
    color: '#9CA3AF',
    lineHeight: 16,
  },
  actionsWrap: {
    backgroundColor: '#09090B',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  actionsHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    marginBottom: 4,
  },
  motionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  motionWord: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    width: 90,
  },
  motionGesture: {
    fontSize: 12,
    color: '#D1D5DB',
  },
  motionGestureTe: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  rhymeBox: {
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  rhymeHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
  },
  rhymeEn: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rhymeTe: {
    fontSize: 12,
    color: '#D1D5DB',
  },
  familyBox: {
    backgroundColor: '#09090B',
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
    color: '#FFFFFF',
  },
  familyTe: {
    fontSize: 11,
    color: '#9CA3AF',
  },
});
