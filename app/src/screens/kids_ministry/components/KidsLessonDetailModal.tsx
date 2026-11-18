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
} from 'react-native';
import {
  X,
  Sparkles,
  BookOpen,
  Award,
  CheckCircle,
  Share2,
  Volume2,
  Heart,
  HelpCircle,
  Check,
} from 'lucide-react-native';
import {
  KidsCurriculumLesson,
  KidsClassTier,
  ChildRecord,
} from '../../../types/KidsMinistryTypes';

interface Props {
  visible: boolean;
  lesson: KidsCurriculumLesson | null;
  child?: ChildRecord | null;
  onClose: () => void;
}

export default function KidsLessonDetailModal({
  visible,
  lesson,
  child,
  onClose,
}: Props) {
  const [verseMemorized, setVerseMemorized] = useState(false);
  const [playingAudio, setPlayingAudio] = useState(false);
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);

  if (!lesson) return null;

  const childTier: KidsClassTier = (child?.assignedTier as KidsClassTier) || 'primary';
  const tierGuide = lesson.tierGuides ? lesson.tierGuides[childTier] : null;

  const memoryWords = lesson.memoryVerse.verseEnglish.split(' ');

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
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={styles.titleSerif}>Sunday Bible Lesson</Text>
            <Text style={styles.subtitle}>Week {lesson.weekNumber} · {lesson.quarterTheme}</Text>
          </View>
          <TouchableOpacity onPress={handleShareLesson} style={styles.shareIconBtn}>
            <Share2 size={18} color="#FBBF24" />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Hero Lesson Card */}
          <View style={styles.heroCard}>
            <View style={styles.heroBadgeRow}>
              <View style={styles.weekTag}>
                <Text style={styles.weekTagText}>WEEK {lesson.weekNumber}</Text>
              </View>
              <Text style={styles.academicYearText}>{lesson.academicYear}</Text>
            </View>

            <Text style={styles.lessonTitleEn}>{lesson.title}</Text>
            <Text style={styles.lessonTitleTe}>{lesson.titleTelugu}</Text>
            <Text style={styles.scriptureRefText}>
              📖 Scripture: {lesson.scriptureRef} · {lesson.scriptureRefTelugu}
            </Text>
          </View>

          {/* Big Truth / ప్రధాన సత్యం Banner */}
          <View style={styles.truthBanner}>
            <View style={styles.truthHeader}>
              <Sparkles size={16} color="#FBBF24" />
              <Text style={styles.truthHeading}>THIS WEEK'S BIG TRUTH / ప్రధాన సత్యం</Text>
            </View>
            <Text style={styles.truthEn}>{lesson.bigIdea}</Text>
            <Text style={styles.truthTe}>{lesson.bigIdeaTelugu}</Text>
          </View>

          {/* Interactive Memory Verse Card */}
          <View style={styles.memoryCard}>
            <View style={styles.memoryCardHeader}>
              <View style={styles.memoryTitleGroup}>
                <Award size={18} color="#FBBF24" />
                <Text style={styles.memoryHeading}>MEMORY VERSE CHALLENGE</Text>
              </View>
              <TouchableOpacity
                style={styles.listenBtn}
                onPress={handleReciteAudio}
                activeOpacity={0.8}
              >
                <Volume2 size={14} color="#FBBF24" />
                <Text style={styles.listenBtnText}>{playingAudio ? 'Playing...' : 'Listen'}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.quoteBox}>
              <Text style={styles.quoteEn}>"{lesson.memoryVerse.verseEnglish}"</Text>
              <Text style={styles.quoteRef}>— {lesson.memoryVerse.reference}</Text>
              <Text style={styles.quoteTe}>"{lesson.memoryVerse.verseTelugu}"</Text>
              <Text style={styles.quoteRef}>— {lesson.memoryVerse.referenceTelugu}</Text>
            </View>

            {/* Word Tap Recitation Practice */}
            <Text style={styles.wordPracticePrompt}>Tap words in order to practice:</Text>
            <View style={styles.wordsWrap}>
              {memoryWords.map((word, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[styles.wordChip, selectedWordIndex === idx && styles.wordChipActive]}
                  onPress={() => setSelectedWordIndex(idx)}
                >
                  <Text style={[styles.wordChipText, selectedWordIndex === idx && styles.wordChipTextActive]}>
                    {word}
                  </Text>
                </TouchableOpacity>
              ))}
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

          {/* Tier-Specific Adaptation for this child */}
          {tierGuide && (
            <View style={styles.tierActivityCard}>
              <View style={styles.tierHeader}>
                <Text style={styles.tierBadge}>{tierGuide.tierName.toUpperCase()}</Text>
              </View>

              <Text style={styles.activityTitle}>🎨 {tierGuide.activityName}</Text>
              <Text style={styles.activityInstructionsEn}>
                {tierGuide.activityInstructions}
              </Text>
              <Text style={styles.activityInstructionsTe}>
                {tierGuide.activityInstructionsTelugu}
              </Text>

              <View style={styles.discussionSection}>
                <Text style={styles.discussionHeading}>Family Talk Questions:</Text>
                {tierGuide.discussionQuestions.map((q, idx) => (
                  <View key={idx} style={styles.qItemRow}>
                    <Text style={styles.qBullet}>•</Text>
                    <Text style={styles.qText}>{q}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Teacher Schedule Overview for Parents */}
          <View style={styles.classScheduleCard}>
            <Text style={styles.scheduleHeading}>SUNDAY CLASSROOM SCHEDULE (45 MIN)</Text>
            {lesson.teacherPrep.schedule.map((item, idx) => (
              <View key={idx} style={styles.schedRow}>
                <View style={styles.schedPill}>
                  <Text style={styles.schedPillText}>{item.timeMinutes}m</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.schedSegment}>{item.segment}</Text>
                  <Text style={styles.schedDesc}>{item.description}</Text>
                </View>
              </View>
            ))}
          </View>
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
  titleSerif: {
    fontFamily: 'Georgia',
    fontSize: 19,
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
  wordPracticePrompt: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  wordsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  wordChip: {
    backgroundColor: '#27272A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  wordChipActive: {
    backgroundColor: '#FBBF24',
  },
  wordChipText: {
    fontSize: 12,
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
});
