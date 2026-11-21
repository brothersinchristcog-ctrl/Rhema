import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { ArrowLeft, CheckCircle2 } from 'lucide-react-native';
import { KidsBibleStory } from '../../../types/KidsMinistryTypes';
import { useTheme } from '../../../context/ThemeContext';
import BibleStoryReaderContent, {
  getFullStoryContent,
  getFullStoryTeluguContent,
} from './BibleStoryReaderContent';

interface KidsStoryReaderModalProps {
  visible: boolean;
  story: KidsBibleStory | null;
  churchId?: string;
  childId?: string;
  onClose: () => void;
}

export default function KidsStoryReaderModal({
  visible,
  story,
  churchId = 'rhema',
  childId = 'family',
  onClose,
}: KidsStoryReaderModalProps) {
  const { isDark, colors: themeColors } = useTheme();
  const [isCompleted, setIsCompleted] = useState(false);

  const storageKey = story
    ? `@rhema_kids_story_done_${churchId}_${childId}_${story.id}`
    : '';

  useEffect(() => {
    let active = true;
    if (!visible || !storageKey) {
      return;
    }
    AsyncStorage.getItem(storageKey)
      .then(val => {
        if (active) setIsCompleted(val === '1');
      })
      .catch(() => {
        if (active) setIsCompleted(false);
      });
    return () => {
      active = false;
    };
  }, [visible, storageKey]);

  if (!story) return null;

  const screenBg = isDark ? '#0B0F19' : (themeColors.background || '#FFFDF9');
  const cardBg = isDark ? '#161C2E' : (themeColors.surface || '#FFFFFF');
  const border = isDark ? '#283149' : (themeColors.border || '#E2E8F0');
  const textPrimary = isDark ? '#F8FAFC' : (themeColors.text || '#0F172A');
  const goldAccent = isDark ? '#FBBF24' : '#B45309';
  const barStyle = isDark ? 'light-content' : 'dark-content';

  const fullStoryContent = getFullStoryContent(story);
  const fullTeluguContent = getFullStoryTeluguContent(story);

  const handleCompleteStory = async () => {
    if (isCompleted) return;
    setIsCompleted(true);
    if (storageKey) {
      await AsyncStorage.setItem(storageKey, '1').catch(() => {});
    }
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

            {/* Completion State: Hide Finish button once completed */}
            {isCompleted ? (
              <View
                style={[
                  styles.completedBanner,
                  {
                    backgroundColor: isDark ? '#112A22' : '#ECFDF5',
                    borderColor: isDark ? '#1E523D' : '#A7F3D0',
                  },
                ]}
              >
                <View style={styles.completedIconCircle}>
                  <CheckCircle2 size={20} color="#10B981" strokeWidth={2.4} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.completedTitle,
                      { color: isDark ? '#6EE7B7' : '#065F46' },
                    ]}
                  >
                    Already Completed
                  </Text>
                  <Text
                    style={[
                      styles.completedSub,
                      { color: isDark ? '#A7F3D0' : '#047857' },
                    ]}
                  >
                    You have finished reading this Bible story.
                  </Text>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.finishBtn}
                onPress={handleCompleteStory}
                activeOpacity={0.86}
              >
                <Text style={styles.finishBtnText}>Finish Reading Story</Text>
              </TouchableOpacity>
            )}
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
    paddingBottom: 40,
  },
  finishBtn: {
    marginTop: 26,
    height: 54,
    borderRadius: 999,
    backgroundColor: '#7C3AED',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 5,
  },
  finishBtnText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  completedBanner: {
    marginTop: 26,
    borderRadius: 18,
    borderWidth: 1,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  completedIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedTitle: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  completedSub: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
});
