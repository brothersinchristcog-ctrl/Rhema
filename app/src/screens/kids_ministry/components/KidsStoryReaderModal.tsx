import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { ArrowLeft, Sparkles } from 'lucide-react-native';
import { KidsBibleStory } from '../../../types/KidsMinistryTypes';
import { useTheme } from '../../../context/ThemeContext';
import BibleStoryReaderContent, {
  getFullStoryContent,
  getFullStoryTeluguContent,
} from './BibleStoryReaderContent';

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
  const { isDark, colors: themeColors } = useTheme();

  if (!story) return null;

  const screenBg = isDark ? '#000000' : (themeColors.background || '#FAF7F2');
  const cardBg = isDark ? '#18181B' : (themeColors.surface || '#FFFFFF');
  const border = isDark ? '#27272A' : (themeColors.border || '#E2E8F0');
  const textPrimary = isDark ? '#FFFFFF' : (themeColors.text || '#0F172A');
  const textSecondary = isDark ? '#9CA3AF' : (themeColors.textSecondary || '#64748B');
  const goldAccent = isDark ? '#FBBF24' : '#D97706';
  const barStyle = isDark ? 'light-content' : 'dark-content';

  const fullStoryContent = getFullStoryContent(story);
  const fullTeluguContent = getFullStoryTeluguContent(story);

  const handleCompleteStory = () => {
    Alert.alert(
      'Story Completed!',
      `Great job reading "${story.title}"!\n\n+15 Bible Star Points earned!`,
      [{ text: 'Praise the Lord!', onPress: onClose }]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top', 'bottom']}>
          <StatusBar barStyle={barStyle} backgroundColor={screenBg} />

          {/* ── TOP NAV HEADER ── */}
          <View style={[styles.headerRow, { borderBottomColor: border }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.backBtn, { backgroundColor: cardBg, borderColor: border }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ArrowLeft size={19} color={textPrimary} />
            </TouchableOpacity>

            <View style={styles.headerTitles}>
              <Text style={[styles.headerEyebrow, { color: goldAccent }]}>BIBLE STORY</Text>
              <Text style={[styles.headerTitleSerif, { color: textPrimary }]} numberOfLines={1}>
                {story.title}
              </Text>
            </View>

            <View style={styles.headerSpacer} />
          </View>

          {/* ── DEDICATED STORY DETAILS CONTENT ── */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <BibleStoryReaderContent
              title={story.title}
              titleTelugu={story.titleTelugu}
              scriptureRef={story.scriptureRef}
              thumbnailUrl={story.coverImageUrl}
              coverEmoji={story.coverEmoji}
              readTime={story.readTime}
              storyContent={fullStoryContent}
              teluguContent={fullTeluguContent}
              reflectionQuestions={story.reflectionQuestions}
            />

            <TouchableOpacity
              style={[styles.finishBtn, { backgroundColor: goldAccent }]}
              onPress={handleCompleteStory}
              activeOpacity={0.88}
            >
              <Sparkles size={16} color={isDark ? '#000000' : '#FFFFFF'} />
              <Text style={[styles.finishBtnText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                Finish Reading Story
              </Text>
            </TouchableOpacity>
          </ScrollView>
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
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitles: {
    flex: 1,
    alignItems: 'center',
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerTitleSerif: {
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    marginTop: 1,
  },
  headerSpacer: {
    width: 38,
    height: 38,
  },
  scroll: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 38,
  },
  finishBtn: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
  },
  finishBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
