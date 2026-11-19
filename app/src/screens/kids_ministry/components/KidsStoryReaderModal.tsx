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
  Dimensions,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react-native';
import { KidsBibleStory } from '../../../types/KidsMinistryTypes';

const { width } = Dimensions.get('window');

interface KidsStoryReaderModalProps {
  visible: boolean;
  story: KidsBibleStory | null;
  onClose: () => void;
}

export default function KidsStoryReaderModal({
  visible,
  story,
  onClose,
}: KidsStoryReaderModalProps) {
  if (!story) return null;

  const insets = useSafeAreaInsets();
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [langMode, setLangMode] = useState<'both' | 'english' | 'telugu'>('both');

  const pages = story.pages || [];
  const totalPages = pages.length;
  const currentPage = pages[currentPageIndex] || null;
  const isLastPage = currentPageIndex === totalPages - 1;

  const handleNext = () => {
    if (currentPageIndex < totalPages - 1) {
      setCurrentPageIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(prev => prev - 1);
    }
  };

  const handleCompleteStory = () => {
    Alert.alert(
      'Story Completed! 🌟',
      `You completed "${story.title}"!\n\n★ +15 Bible Star Points added to your account!`,
      [{ text: 'Praise the Lord!', onPress: onClose }]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 28) }]}>
        <StatusBar barStyle="light-content" backgroundColor="#000000" />

        {/* ── TOP NAV HEADER ── */}
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTitles}>
            <Text style={styles.headerTitleSerif} numberOfLines={1}>{story.title}</Text>
            <Text style={styles.headerTeluguSub} numberOfLines={1}>{story.titleTelugu}</Text>
          </View>

          {/* Spacer to keep center title balanced without audio button */}
          <View style={styles.headerSpacer} />
        </View>

        {/* ── LANGUAGE FILTER BAR & PROGRESS ── */}
        <View style={styles.controlBar}>
          {/* Page Progress Indicator */}
          <View style={styles.pageIndicator}>
            <Text style={styles.pageIndicatorText}>
              Page {currentPageIndex + 1} of {totalPages}
            </Text>
          </View>

          {/* Lang Selector */}
          <View style={styles.langPillsRow}>
            {(['both', 'english', 'telugu'] as const).map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.langPill, langMode === m && styles.langPillActive]}
                onPress={() => setLangMode(m)}
              >
                <Text style={[styles.langPillText, langMode === m && styles.langPillTextActive]}>
                  {m === 'both' ? 'Bilingual' : m.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── MAIN STORY PAGE CONTENT ── */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {currentPage && (
            <View style={styles.pageCard}>
              {/* Giant Illustration Bubble */}
              <View style={styles.illustrationBubble}>
                <Text style={styles.illustrationEmoji}>{currentPage.illustrationEmoji || '📖'}</Text>
              </View>

              {/* Page Heading */}
              <Text style={styles.pageHeading}>{currentPage.heading}</Text>
              <Text style={styles.scriptureRefBadge}>{story.scriptureRef}</Text>

              <View style={styles.divider} />

              {/* English Narrative */}
              {(langMode === 'both' || langMode === 'english') && (
                <View style={styles.textSection}>
                  <Text style={styles.langTag}>ENGLISH</Text>
                  <Text style={styles.englishParagraph}>{currentPage.textEnglish}</Text>
                </View>
              )}

              {/* Telugu Narrative */}
              {(langMode === 'both' || langMode === 'telugu') && (
                <View style={styles.textSection}>
                  <Text style={[styles.langTag, { color: '#FBBF24' }]}>తెలుగు (TELUGU)</Text>
                  <Text style={styles.teluguParagraph}>{currentPage.textTelugu}</Text>
                </View>
              )}
            </View>
          )}

          {/* If last page: show reflection questions */}
          {isLastPage && story.reflectionQuestions && story.reflectionQuestions.length > 0 && (
            <View style={styles.reflectionCard}>
              <View style={styles.reflectionHeader}>
                <HelpCircle size={18} color="#FBBF24" />
                <Text style={styles.reflectionTitle}>Family Discussion Questions</Text>
              </View>
              {story.reflectionQuestions.map((q, idx) => (
                <View key={idx} style={styles.questionItem}>
                  <Text style={styles.questionEng}>Q{idx + 1}. {q.questionEnglish}</Text>
                  <Text style={styles.questionTel}>— {q.questionTelugu}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* ── BOTTOM PAGINATION NAVIGATION ── */}
        <View style={styles.footerNav}>
          <TouchableOpacity
            style={[styles.navBtn, currentPageIndex === 0 && styles.navBtnDisabled]}
            onPress={handlePrev}
            disabled={currentPageIndex === 0}
          >
            <ChevronLeft size={18} color={currentPageIndex === 0 ? '#52525B' : '#FFFFFF'} />
            <Text style={[styles.navBtnText, currentPageIndex === 0 && { color: '#52525B' }]}>
              Previous
            </Text>
          </TouchableOpacity>

          {/* Page Dots */}
          <View style={styles.dotsRow}>
            {pages.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, i === currentPageIndex && styles.dotActive]}
              />
            ))}
          </View>

          {isLastPage ? (
            <TouchableOpacity style={styles.finishBtn} onPress={handleCompleteStory}>
              <Sparkles size={16} color="#000000" />
              <Text style={styles.finishBtnText}>Finish Story</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.navBtn} onPress={handleNext}>
              <Text style={styles.navBtnText}>Next</Text>
              <ChevronRight size={18} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
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
    paddingTop: 8,
    paddingBottom: 12,
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
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: 8,
  },
  headerTitleSerif: {
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerTeluguSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
    height: 36,
  },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#18181B',
  },
  pageIndicator: {
    backgroundColor: '#18181B',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pageIndicatorText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FBBF24',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  langPillsRow: {
    flexDirection: 'row',
    backgroundColor: '#18181B',
    borderRadius: 8,
    padding: 2,
  },
  langPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  langPillActive: {
    backgroundColor: '#FFFFFF',
  },
  langPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  langPillTextActive: {
    color: '#000000',
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  pageCard: {
    backgroundColor: '#18181B',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    borderColor: '#27272A',
    alignItems: 'center',
  },
  illustrationBubble: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#09090B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FBBF24',
    marginBottom: 16,
  },
  illustrationEmoji: {
    fontSize: 44,
  },
  pageHeading: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  scriptureRefBadge: {
    fontSize: 10,
    color: '#9CA3AF',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#27272A',
    marginVertical: 16,
  },
  textSection: {
    width: '100%',
    marginBottom: 14,
  },
  langTag: {
    fontSize: 9,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 1,
    marginBottom: 6,
  },
  englishParagraph: {
    fontSize: 15,
    color: '#E4E4E7',
    lineHeight: 24,
    fontWeight: '400',
  },
  teluguParagraph: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 26,
    fontWeight: '500',
  },
  reflectionCard: {
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.25)',
    gap: 10,
  },
  reflectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reflectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FBBF24',
  },
  questionItem: {
    gap: 2,
  },
  questionEng: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  questionTel: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  footerNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#18181B',
    backgroundColor: '#000000',
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#18181B',
  },
  navBtnDisabled: {
    backgroundColor: 'transparent',
  },
  navBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#27272A',
  },
  dotActive: {
    backgroundColor: '#FBBF24',
    width: 14,
  },
  finishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#FBBF24',
  },
  finishBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#000000',
  },
});
