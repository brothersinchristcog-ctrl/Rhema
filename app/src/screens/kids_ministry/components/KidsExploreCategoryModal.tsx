import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Image,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import {
  X,
  Search,
  BookOpen,
  Award,
  Calendar,
  Music,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Clock,
  Volume2,
  Play,
  HelpCircle,
} from 'lucide-react-native';
import {
  KidsBibleStory,
  KidsQuiz,
  KidsWorshipSong,
  KidsCurriculumLesson,
  KidsCurriculumConfig,
  resolveActiveCurriculumLesson,
  splitCurriculumLessons,
  getCurriculumWeekDate,
  formatCurriculumDateDisplay,
} from '../../../types/KidsMinistryTypes';
import { useTheme } from '../../../context/ThemeContext';
import { getFullStoryContent, estimateStoryReadTime } from './BibleStoryReaderContent';
import { estimateQuizMinutes } from '../../../services/KidsQuizDocumentService';
import { getSongCardColor, isColorLight } from '../../SongsScreen';
import { getSermonCardColor, POSTER as SERMON_POSTER_GRADIENTS } from '../../SermonsScreen';

export type KidsExploreCategory = 'stories' | 'quizzes' | 'lessons' | 'songs';

interface Props {
  visible: boolean;
  category: KidsExploreCategory | null;
  stories: KidsBibleStory[];
  quizzes: KidsQuiz[];
  songs: KidsWorshipSong[];
  curriculum: KidsCurriculumLesson[];
  curriculumConfig: KidsCurriculumConfig | null;
  loadingLessons?: boolean;
  onSelectStory: (story: KidsBibleStory) => void;
  onSelectQuiz: (quiz: KidsQuiz) => void;
  onSelectSong: (song: KidsWorshipSong) => void;
  onSelectLesson: (lesson: KidsCurriculumLesson, scheduledDate: string | null) => void;
  onClose: () => void;
}

export default function KidsExploreCategoryModal({
  visible,
  category,
  stories,
  quizzes,
  songs,
  curriculum,
  curriculumConfig,
  loadingLessons = false,
  onSelectStory,
  onSelectQuiz,
  onSelectSong,
  onSelectLesson,
  onClose,
}: Props) {
  const { isDark, colors: themeColors } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [openingLessonId, setOpeningLessonId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setSearchQuery('');
      setOpeningLessonId(null);
    }
  }, [visible, category]);

  const activeInfo = useMemo(
    () => resolveActiveCurriculumLesson({ config: curriculumConfig, lessons: curriculum }),
    [curriculumConfig, curriculum]
  );

  const visibleLessons = useMemo(() => {
    const { fiftyTwoWeekLessons, customLessons } = splitCurriculumLessons(curriculum);
    return activeInfo.mode === 'custom' ? customLessons : fiftyTwoWeekLessons;
  }, [curriculum, activeInfo.mode]);

  if (!category) return null;

  const screenBg = isDark ? '#0B0F19' : (themeColors.background || '#FDF9F6');
  const cardBg = isDark ? '#18181B' : (themeColors.surface || '#FFFFFF');
  const innerBg = isDark ? '#09090B' : '#F1F5F9';
  const border = isDark ? '#27272A' : (themeColors.border || '#E2E8F0');
  const textPrimary = isDark ? '#FFFFFF' : (themeColors.text || '#0F172A');
  const textSecondary = isDark ? '#9CA3AF' : (themeColors.textSecondary || '#64748B');
  const goldAccent = isDark ? '#FBBF24' : '#D97706';
  const goldBg = isDark ? 'rgba(251, 191, 36, 0.15)' : '#FEF3C7';
  const barStyle = isDark ? 'light-content' : 'dark-content';
  const placeholderColor = isDark ? '#6B7280' : '#94A3B8';

  const headerMeta: Record<KidsExploreCategory, { title: string; subtitle: string }> = {
    stories: {
      title: 'Bible Stories',
      subtitle: `${stories.length} stories · Latest uploads first`,
    },
    quizzes: {
      title: 'Kids Quizzes',
      subtitle: `${quizzes.length} interactive Bible quizzes`,
    },
    lessons: {
      title: 'Weekly Lessons',
      subtitle:
        activeInfo.mode === 'custom'
          ? `${visibleLessons.length} custom weekly Sunday lessons`
          : `${visibleLessons.length} weekly bilingual guides`,
    },
    songs: {
      title: 'Action Songs',
      subtitle: `${songs.length} worship videos & lyrics`,
    },
  };

  const term = searchQuery.trim().toLowerCase();

  const filteredStories = stories.filter(s =>
    !term
      ? true
      : s.title.toLowerCase().includes(term) ||
        (s.titleTelugu || '').toLowerCase().includes(term) ||
        (s.scriptureRef || '').toLowerCase().includes(term)
  );

  const filteredQuizzes = quizzes.filter(q =>
    !term
      ? true
      : q.title.toLowerCase().includes(term) ||
        (q.titleTelugu || '').toLowerCase().includes(term) ||
        (q.scriptureRef || '').toLowerCase().includes(term)
  );

  const filteredLessons = visibleLessons.filter(l =>
    !term
      ? true
      : l.title.toLowerCase().includes(term) ||
        (l.titleTelugu || '').toLowerCase().includes(term) ||
        (l.scriptureRef || '').toLowerCase().includes(term)
  );

  const filteredSongs = songs.filter(song =>
    !term
      ? true
      : song.title.toLowerCase().includes(term) ||
        (song.titleTelugu || '').toLowerCase().includes(term)
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]} edges={['top', 'bottom']}>
          <StatusBar barStyle={barStyle} backgroundColor={screenBg} />

          {/* Header */}
          <View style={[styles.headerRow, { borderBottomColor: 'transparent' }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[
                styles.closeBtn,
                {
                  backgroundColor: isDark ? '#18181B' : '#FFFFFF',
                  borderWidth: 1,
                  borderColor: border,
                },
              ]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ChevronLeft size={20} color={textPrimary} strokeWidth={2.5} />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={[styles.headerTitle, { color: textPrimary }]} numberOfLines={1}>
                {headerMeta[category].title}
              </Text>
              <Text style={[styles.headerSub, { color: textSecondary }]} numberOfLines={1}>
                {headerMeta[category].subtitle}
              </Text>
            </View>
            <View style={{ width: 36 }} />
          </View>

          {/* Search */}
          <View style={[styles.searchBox, { backgroundColor: cardBg, borderColor: border }]}>
            <Search size={16} color={textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={[styles.searchInput, { color: textPrimary }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={`Search ${headerMeta[category].title.toLowerCase()}...`}
              placeholderTextColor={placeholderColor}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={16} color={textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Category List */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* ONLY BIBLE STORIES */}
            {category === 'stories' &&
              (filteredStories.length === 0 ? (
                <EmptyCategory icon={<BookOpen size={30} color={textSecondary} />} title="No Bible Stories Yet" textPrimary={textPrimary} textSecondary={textSecondary} cardBg={cardBg} border={border} />
              ) : (
                filteredStories.map((s, idx) => {
                  const fullBody = getFullStoryContent(s);
                  const readTimeLabel = s.readTime || estimateStoryReadTime(fullBody);
                  const baseIndex = stories.findIndex(item => item.id === s.id);
                  const colorIndex = baseIndex >= 0 ? baseIndex : idx;
                  const cardColor = getSongCardColor(colorIndex).color;
                  const isLight = isColorLight(cardColor);

                  const cardBorderColor = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.16)';
                  const titleColor = isLight ? '#0F172A' : '#FFFFFF';
                  const eyebrowColor = isLight ? '#334155' : 'rgba(255, 255, 255, 0.84)';
                  const pillBg = isLight ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.16)';
                  const pillBorder = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.22)';
                  const pillTextColor = isLight ? '#1E293B' : '#FFFFFF';
                  const ringColor = isLight ? 'rgba(255, 255, 255, 0.42)' : 'rgba(255, 255, 255, 0.12)';
                  const actionBg = isLight ? '#111827' : 'rgba(255, 255, 255, 0.94)';
                  const actionIconColor = isLight ? '#FFFFFF' : '#0F172A';
                  const thumbBorderColor = isLight ? 'rgba(15, 23, 42, 0.10)' : 'rgba(255, 255, 255, 0.28)';

                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[
                        styles.pastelStoryCard,
                        {
                          backgroundColor: cardColor,
                          borderColor: cardBorderColor,
                          shadowColor: '#000',
                          shadowOpacity: isLight ? 0.06 : 0.22,
                          shadowRadius: 5,
                          shadowOffset: { width: 0, height: 2 },
                          elevation: 2.5,
                        },
                      ]}
                      onPress={() => onSelectStory(s)}
                      activeOpacity={0.86}
                    >
                      {/* Decorative overlapping curved rings */}
                      <View
                        style={[styles.storyDecorRingA, { borderColor: ringColor }]}
                        pointerEvents="none"
                      />
                      <View
                        style={[styles.storyDecorRingB, { borderColor: ringColor }]}
                        pointerEvents="none"
                      />

                      <View style={styles.pastelStoryTopRow}>
                        <View
                          style={[
                            styles.pastelStoryThumb16x9,
                            {
                              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                              borderWidth: 1.5,
                              borderColor: thumbBorderColor,
                            },
                          ]}
                        >
                          {s.coverImageUrl ? (
                            <Image
                              source={{ uri: s.coverImageUrl }}
                              style={styles.thumbImg}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={styles.storyFallbackHero}>
                              <Text style={{ fontSize: 30 }}>{s.coverEmoji || '📖'}</Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.pastelStoryInfoCol}>
                          <Text
                            style={[
                              styles.pastelStoryEyebrow,
                              { color: eyebrowColor },
                            ]}
                            numberOfLines={1}
                          >
                            {s.scriptureRef || 'Bible Story'}
                          </Text>
                          <Text
                            style={[
                              styles.pastelStoryTitle,
                              { color: titleColor },
                            ]}
                            numberOfLines={2}
                          >
                            {s.title}
                          </Text>
                          <View
                            style={[
                              styles.pastelTimeChip,
                              {
                                backgroundColor: pillBg,
                                borderWidth: 1,
                                borderColor: pillBorder,
                              },
                            ]}
                          >
                            <Clock
                              size={11}
                              color={pillTextColor}
                              strokeWidth={2.4}
                            />
                            <Text
                              style={[
                                styles.pastelTimeText,
                                { color: pillTextColor },
                              ]}
                            >
                              {readTimeLabel}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.pastelStoryBottomRow}>
                        <Text
                          style={[
                            styles.pastelStoryFooterTag,
                            { color: titleColor },
                          ]}
                          numberOfLines={1}
                        >
                          <Text style={{ fontWeight: '900' }}>Story {idx + 1}</Text>
                          <Text style={{ fontWeight: '500', opacity: 0.82 }}> · Read Story</Text>
                        </Text>

                        <View style={[styles.pastelActionCircle, { backgroundColor: actionBg }]}>
                          <ArrowUpRight size={17} color={actionIconColor} strokeWidth={2.5} />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              ))}

            {/* ONLY KIDS QUIZZES (Sleek Compact Challenge Cards with 16:9 Thumbnails) */}
            {category === 'quizzes' &&
              (filteredQuizzes.length === 0 ? (
                <EmptyCategory icon={<Award size={30} color={textSecondary} />} title="No Kids Quizzes Yet" textPrimary={textPrimary} textSecondary={textSecondary} cardBg={cardBg} border={border} />
              ) : (
                filteredQuizzes.map((q, idx) => {
                  const quizPalettes = isDark
                    ? [
                        { accent: '#A78BFA', border: '#2D264B', footerBg: 'rgba(139, 92, 246, 0.10)', softBg: '#1F1B38', divider: 'rgba(139, 92, 246, 0.18)' },
                        { accent: '#38BDF8', border: '#1E3A54', footerBg: 'rgba(56, 189, 248, 0.10)', softBg: '#13283A', divider: 'rgba(56, 189, 248, 0.18)' },
                        { accent: '#34D399', border: '#1D4235', footerBg: 'rgba(16, 185, 129, 0.10)', softBg: '#122E24', divider: 'rgba(16, 185, 129, 0.18)' },
                        { accent: '#FBBF24', border: '#4A3619', footerBg: 'rgba(245, 158, 11, 0.10)', softBg: '#2F2211', divider: 'rgba(245, 158, 11, 0.18)' },
                        { accent: '#F472B6', border: '#4C2139', footerBg: 'rgba(236, 72, 153, 0.10)', softBg: '#301725', divider: 'rgba(236, 72, 153, 0.18)' },
                        { accent: '#2DD4BF', border: '#1B4347', footerBg: 'rgba(20, 184, 166, 0.10)', softBg: '#132C30', divider: 'rgba(20, 184, 166, 0.18)' },
                      ]
                    : [
                        { accent: '#7C3AED', border: '#E4DBFE', footerBg: '#F6F3FF', softBg: '#EFE9FE', divider: '#EAE3FD' },
                        { accent: '#0284C7', border: '#CBE9FC', footerBg: '#F0F9FF', softBg: '#E0F2FE', divider: '#DCEFFB' },
                        { accent: '#059669', border: '#C6F4D9', footerBg: '#EFFDF5', softBg: '#DCFCE7', divider: '#D5F7E3' },
                        { accent: '#D97706', border: '#FCE4B0', footerBg: '#FFFBEB', softBg: '#FEF3C7', divider: '#FBECC3' },
                        { accent: '#DB2777', border: '#FBD1E5', footerBg: '#FDF2F8', softBg: '#FCE7F3', divider: '#FADCEB' },
                        { accent: '#0D9488', border: '#B9F2E9', footerBg: '#F0FDFA', softBg: '#CCFBF1', divider: '#C6F4EC' },
                      ];
                  const baseIdx = quizzes.findIndex(item => item.id === q.id);
                  const qPalette = quizPalettes[(baseIdx >= 0 ? baseIdx : idx) % quizPalettes.length];
                  const qCount = q.questions?.length || 0;
                  const estMins = estimateQuizMinutes(q);

                  return (
                    <TouchableOpacity
                      key={q.id}
                      style={[
                        styles.quizChallengeCard,
                        {
                          backgroundColor: isDark ? '#151B2B' : '#FFFFFF',
                          borderColor: qPalette.border,
                        },
                        !isDark && styles.quizCardShadow,
                      ]}
                      onPress={() => onSelectQuiz(q)}
                      activeOpacity={0.86}
                    >
                      {/* Vibrant Top Accent Strip */}
                      <View style={[styles.quizTopAccentBar, { backgroundColor: qPalette.accent }]} />

                      {/* Main Horizontal Content Row: Clean 16:9 Thumbnail + Clear Details */}
                      <View style={styles.quizMainRow}>
                        <View
                          style={[
                            styles.quizThumb16x9Compact,
                            {
                              backgroundColor: qPalette.softBg,
                              borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.07)',
                            },
                          ]}
                        >
                          {q.thumbnailUrl ? (
                            <Image
                              source={{ uri: q.thumbnailUrl }}
                              style={styles.thumbImg}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={styles.storyFallbackHero}>
                              <Text style={{ fontSize: 28 }}>{q.coverEmoji || '🏆'}</Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.quizInfoCol}>
                          <View style={styles.quizTopMetaRow}>
                            <Text style={[styles.quizScriptureLabel, { color: qPalette.accent }]} numberOfLines={1}>
                              {q.scriptureRef || 'Bible Quiz'}
                            </Text>
                            <View
                              style={[
                                styles.quizStarMiniPill,
                                { backgroundColor: isDark ? 'rgba(251, 191, 36, 0.16)' : '#FEF3C7' },
                              ]}
                            >
                              <Text style={[styles.quizStarMiniText, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                                ★ +{q.pointsReward || qCount * 10 || 50}
                              </Text>
                            </View>
                          </View>

                          <Text style={[styles.quizCardTitle, { color: textPrimary }]} numberOfLines={2}>
                            {q.title}
                          </Text>

                          {q.titleTelugu && q.titleTelugu.trim() !== q.title.trim() ? (
                            <Text style={[styles.quizCardSubTe, { color: textSecondary }]} numberOfLines={1}>
                              {q.titleTelugu}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      {/* Structured Footer Strip: Question Count, Est. Time & Easy Start Quiz Button */}
                      <View
                        style={[
                          styles.quizFooterStrip,
                          {
                            backgroundColor: qPalette.footerBg,
                            borderTopColor: qPalette.divider,
                          },
                        ]}
                      >
                        <View style={styles.quizFooterMetrics}>
                          <View style={styles.quizMetricItem}>
                            <HelpCircle size={13} color={qPalette.accent} />
                            <Text style={[styles.quizMetricText, { color: textPrimary }]}>
                              {qCount} {qCount === 1 ? 'Question' : 'Questions'}
                            </Text>
                          </View>
                          <Text style={[styles.quizMetricDot, { color: textSecondary }]}>·</Text>
                          <View style={styles.quizMetricItem}>
                            <Clock size={12.5} color={textSecondary} />
                            <Text style={[styles.quizMetricText, { color: textSecondary }]}>
                              ~{estMins} min
                            </Text>
                          </View>
                        </View>

                        <View style={[styles.startQuizCta, { backgroundColor: qPalette.accent }]}>
                          <Play size={11} color="#FFFFFF" fill="#FFFFFF" />
                          <Text style={styles.startQuizCtaText}>Start Quiz</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              ))}

            {/* ONLY WEEKLY LESSONS (Songs Color Palette) */}
            {category === 'lessons' &&
              (loadingLessons && curriculum.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: border, paddingVertical: 44 }]}>
                  <ActivityIndicator size="large" color={goldAccent} />
                  <Text style={[styles.emptyTitle, { color: textPrimary, marginTop: 12 }]}>
                    Loading Weekly Lessons...
                  </Text>
                  <Text style={[styles.emptySub, { color: textSecondary }]}>
                    Preparing your Sunday School bilingual study guide
                  </Text>
                </View>
              ) : filteredLessons.length === 0 ? (
                <EmptyCategory icon={<Calendar size={30} color={textSecondary} />} title="No Weekly Lessons Yet" textPrimary={textPrimary} textSecondary={textSecondary} cardBg={cardBg} border={border} />
              ) : (
                filteredLessons.map((lesson, idx) => {
                  const isActive = activeInfo.lesson?.id === lesson.id;
                  const isOpeningThis = openingLessonId === lesson.id;
                  const lessonDate =
                    lesson.type === 'custom'
                      ? lesson.scheduledDate || null
                      : curriculumConfig?.officialLaunchDate
                      ? getCurriculumWeekDate(curriculumConfig.officialLaunchDate, lesson.weekNumber || idx + 1)
                      : null;

                  const baseIndex = visibleLessons.findIndex(item => item.id === lesson.id);
                  const colorIndex = baseIndex >= 0 ? baseIndex : idx;
                  const cardColor = getSongCardColor(colorIndex).color;
                  const isLight = isColorLight(cardColor);

                  const cardBorderColor = isActive
                    ? (isLight ? '#0F172A' : '#FFFFFF')
                    : (isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.16)');
                  const titleColor = isLight ? '#0F172A' : '#FFFFFF';
                  const subColor = isLight ? '#334155' : 'rgba(255, 255, 255, 0.86)';
                  const metaColor = isLight ? '#475569' : 'rgba(255, 255, 255, 0.80)';
                  const pillBg = isLight ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.18)';
                  const pillBorder = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.22)';
                  const pillTextColor = isLight ? '#0F172A' : '#FFFFFF';
                  const ringColor = isLight ? 'rgba(255, 255, 255, 0.42)' : 'rgba(255, 255, 255, 0.12)';
                  const actionBg = isLight ? '#111827' : 'rgba(255, 255, 255, 0.92)';
                  const actionIconColor = isLight ? '#FFFFFF' : '#0F172A';

                  return (
                    <TouchableOpacity
                      key={lesson.id}
                      style={[
                        styles.lessonCard,
                        {
                          backgroundColor: cardColor,
                          borderColor: cardBorderColor,
                          borderWidth: isActive ? 2 : 1,
                          shadowColor: '#000',
                          shadowOpacity: isLight ? 0.06 : 0.22,
                          shadowRadius: 5,
                          shadowOffset: { width: 0, height: 2 },
                          elevation: 2.5,
                        },
                      ]}
                      onPress={() => {
                        if (openingLessonId) return;
                        setOpeningLessonId(lesson.id);
                        setTimeout(() => {
                          onSelectLesson(lesson, lessonDate);
                          setOpeningLessonId(null);
                        }, 90);
                      }}
                      disabled={!!openingLessonId}
                      activeOpacity={0.86}
                    >
                      {/* Subtle decorative rings */}
                      <View style={[styles.storyDecorRingA, { borderColor: ringColor }]} pointerEvents="none" />
                      <View style={[styles.storyDecorRingB, { borderColor: ringColor }]} pointerEvents="none" />

                      <View style={styles.lessonTopRow}>
                        <View
                          style={[
                            styles.weekPill,
                            {
                              backgroundColor: pillBg,
                              borderWidth: 1,
                              borderColor: pillBorder,
                            },
                          ]}
                        >
                          <Text style={[styles.weekPillText, { color: pillTextColor }]}>
                            {lesson.type === 'custom'
                              ? lessonDate
                                ? formatCurriculumDateDisplay(lessonDate)
                                : `LESSON ${idx + 1}`
                              : `WEEK ${lesson.weekNumber || idx + 1}`}
                          </Text>
                        </View>
                        {lesson.type !== 'custom' && lessonDate ? (
                          <Text style={[styles.lessonDateText, { color: metaColor }]}>
                            {formatCurriculumDateDisplay(lessonDate)}
                          </Text>
                        ) : null}
                        {isActive && (
                          <View
                            style={[
                              styles.activeBadge,
                              { backgroundColor: isLight ? '#059669' : '#34D399' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.activeBadgeText,
                                { color: isLight ? '#FFFFFF' : '#064E3B' },
                              ]}
                            >
                              ACTIVE
                            </Text>
                          </View>
                        )}
                      </View>

                      <Text style={[styles.lessonTitleText, { color: titleColor }]} numberOfLines={2}>
                        {lesson.title}
                      </Text>
                      {lesson.titleTelugu ? (
                        <Text style={[styles.lessonSubTe, { color: subColor }]} numberOfLines={1}>
                          {lesson.titleTelugu}
                        </Text>
                      ) : null}

                      <View style={styles.lessonBottomRow}>
                        <Text style={[styles.lessonMetaText, { color: metaColor, flex: 1 }]} numberOfLines={1}>
                          📖 {lesson.scriptureRef}
                          {lesson.memoryVerse?.reference ? ` · ⭐ ${lesson.memoryVerse.reference}` : ''}
                        </Text>
                        <View style={[styles.lessonArrowCircle, { backgroundColor: actionBg }]}>
                          {isOpeningThis ? (
                            <ActivityIndicator size="small" color={actionIconColor} />
                          ) : (
                            <ChevronRight size={15} color={actionIconColor} strokeWidth={2.5} />
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              ))}

            {/* ONLY ACTION SONGS (Exact Sermons Screen Folder-Tab Card Design) */}
            {category === 'songs' &&
              (filteredSongs.length === 0 ? (
                <EmptyCategory icon={<Music size={30} color={textSecondary} />} title="No Action Songs Yet" textPrimary={textPrimary} textSecondary={textSecondary} cardBg={cardBg} border={border} />
              ) : (
                filteredSongs.map((song, idx) => {
                  const baseIdx = songs.findIndex(item => item.id === song.id);
                  const colorIdx = baseIdx >= 0 ? baseIdx : idx;
                  const cardColor = getSermonCardColor(colorIdx).color;
                  const isLight = isColorLight(cardColor);

                  const titleColor = isLight ? '#0F172A' : '#FFFFFF';
                  const subColor = isLight ? '#334155' : 'rgba(255, 255, 255, 0.82)';
                  const iconPillBg = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.18)';
                  const dividerColor = isDark ? 'rgba(255, 255, 255, 0.25)' : '#94A3B8';
                  const metaColor = isDark ? 'rgba(255, 255, 255, 0.75)' : '#64748B';

                  const tabCategoryLabel =
                    song.category === 'action_dance'
                      ? 'Action Dance'
                      : song.category === 'praise'
                      ? 'Kids Praise'
                      : song.category === 'hymn'
                      ? 'Kids Hymn'
                      : 'Action Song';

                  const subtitleText = song.audioUrl
                    ? 'Worship Audio & Lyrics'
                    : song.youtubeVideoId
                    ? 'Worship Video & Lyrics'
                    : 'Worship & Lyrics';

                  const idHash = Math.abs(
                    (song.id || song.title || '')
                      .split('')
                      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
                  );
                  const posterColors = SERMON_POSTER_GRADIENTS[idHash % SERMON_POSTER_GRADIENTS.length];
                  let thumbUri =
                    song.thumbnailUrl ||
                    (song.youtubeVideoId
                      ? `https://img.youtube.com/vi/${song.youtubeVideoId}/mqdefault.jpg`
                      : '');
                  if (thumbUri && thumbUri.includes('hqdefault.jpg')) {
                    thumbUri = thumbUri.replace('hqdefault.jpg', 'mqdefault.jpg');
                  }

                  return (
                    <View key={song.id} style={styles.sermonItem}>
                      <TouchableOpacity
                        style={{ flex: 1, minWidth: 0 }}
                        onPress={() => onSelectSong(song)}
                        activeOpacity={0.86}
                      >
                        <View style={styles.sermonTabRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-end', flex: 1 }}>
                            <View style={[styles.sermonTab, { backgroundColor: cardColor }]}>
                              <Text numberOfLines={1} style={[styles.sermonTabTxt, { color: titleColor }]}>
                                {tabCategoryLabel}
                              </Text>
                            </View>
                            {/* Inverted corner connecting tab to card body seamlessly */}
                            <Svg width={16} height={16} style={{ marginLeft: -0.5 }}>
                              <Path d="M0 0L0 16L16 16A16 16 0 0 1 0 0Z" fill={cardColor} />
                            </Svg>

                            <View style={styles.sermonDurTag}>
                              <Clock size={13} color={metaColor} />
                              <Text style={[styles.sermonDurTxt, { color: metaColor }]}>
                                {song.duration || '3:00'}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View style={[styles.sermonCard, { backgroundColor: cardColor }]}>
                          <View style={styles.sermonR1}>
                            <View style={styles.sermonTh}>
                              <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor: '#0F172A' }]}>
                                {thumbUri ? (
                                  <Image
                                    source={{ uri: thumbUri }}
                                    style={[StyleSheet.absoluteFill, { borderRadius: 8 }]}
                                    resizeMode="cover"
                                  />
                                ) : (
                                  <LinearGradient
                                    colors={posterColors}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={[
                                      StyleSheet.absoluteFill,
                                      { padding: 5, justifyContent: 'center' },
                                    ]}
                                  >
                                    <Text
                                      numberOfLines={2}
                                      style={{
                                        color: '#ffd34d',
                                        fontWeight: '800',
                                        fontSize: 8,
                                        lineHeight: 10,
                                      }}
                                    >
                                      {song.title}
                                    </Text>
                                  </LinearGradient>
                                )}
                              </View>
                              <View style={styles.sermonPlayDot}>
                                <View style={styles.sermonPlayTriangle} />
                              </View>
                            </View>

                            <View style={{ flex: 1, minWidth: 0, paddingLeft: 4 }}>
                              <Text numberOfLines={1} style={[styles.sermonTi, { color: titleColor }]}>
                                {song.title}
                              </Text>
                              {song.titleTelugu ? (
                                <Text numberOfLines={1} style={[styles.sermonTe, { color: titleColor, opacity: 0.9 }]}>
                                  {song.titleTelugu}
                                </Text>
                              ) : null}
                              <Text numberOfLines={1} style={[styles.sermonSp, { color: subColor }]}>
                                {subtitleText}
                              </Text>
                              <Text numberOfLines={1} style={[styles.sermonVs, { color: subColor, opacity: 0.95 }]}>
                                {song.coverEmoji || '🎵'} Bilingual Lyrics
                              </Text>
                            </View>

                            <View style={[styles.sermonMn, { backgroundColor: iconPillBg }]}>
                              <Volume2 size={14} color={titleColor} />
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>

                      {/* Dashed divider between song cards */}
                      <View style={styles.sermonCardDivider}>
                        <Svg width="100%" height={2}>
                          <Path
                            d="M 0,1 L 1200,1"
                            stroke={dividerColor}
                            strokeWidth={1.5}
                            strokeDasharray="6, 5"
                          />
                        </Svg>
                      </View>
                    </View>
                  );
                })
              ))}
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function EmptyCategory({
  icon,
  title,
  textPrimary,
  textSecondary,
  cardBg,
  border,
}: {
  icon: React.ReactNode;
  title: string;
  textPrimary: string;
  textSecondary: string;
  cardBg: string;
  border: string;
}) {
  return (
    <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: border }]}>
      {icon}
      <Text style={[styles.emptyTitle, { color: textPrimary }]}>{title}</Text>
      <Text style={[styles.emptySub, { color: textSecondary }]}>Check back soon for updated Kids Ministry material.</Text>
    </View>
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
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
  },
  headerSub: {
    fontSize: 11.5,
    marginTop: 1,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  searchInput: {
    flex: 1,
    fontSize: 13.5,
    padding: 0,
  },
  scroll: {
    padding: 16,
    gap: 10,
    paddingBottom: 32,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    gap: 12,
  },
  lightShadow: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  thumbBox: {
    width: 50,
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  pastelStoryCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 4,
    gap: 12,
  },
  storyDecorRingA: {
    position: 'absolute',
    right: -18,
    bottom: -28,
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 1.5,
  },
  storyDecorRingB: {
    position: 'absolute',
    right: 18,
    bottom: -44,
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 1.5,
  },
  pastelStoryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  pastelStoryThumb16x9: {
    width: 120,
    aspectRatio: 16 / 9,
    borderRadius: 14,
    overflow: 'hidden',
    flexShrink: 0,
  },
  storyFallbackHero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastelStoryInfoCol: {
    flex: 1,
    gap: 4,
  },
  pastelStoryEyebrow: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  pastelStoryTitle: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21,
  },
  pastelTimeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    marginTop: 2,
  },
  pastelTimeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pastelStoryBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  pastelStoryFooterTag: {
    fontSize: 13.5,
  },
  pastelActionCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  itemSubTe: {
    fontSize: 12,
    marginTop: 2,
  },
  itemMeta: {
    fontSize: 11,
    marginTop: 3,
  },
  actionPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  actionPillText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  playCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lessonCard: {
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    gap: 7,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 4,
  },
  lessonTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weekPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  weekPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  lessonDateText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  activeBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  activeBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  lessonTitleText: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 21,
  },
  lessonSubTe: {
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: -2,
  },
  lessonBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 2,
  },
  lessonMetaText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  lessonArrowCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  emptySub: {
    fontSize: 12,
    textAlign: 'center',
  },
  quizChallengeCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,
  },
  quizCardShadow: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  quizTopAccentBar: {
    height: 4,
    width: '100%',
  },
  quizMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 12,
  },
  quizThumb16x9Compact: {
    width: 124,
    aspectRatio: 16 / 9,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    flexShrink: 0,
  },
  quizInfoCol: {
    flex: 1,
    gap: 4,
  },
  quizTopMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  quizScriptureLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  quizStarMiniPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    flexShrink: 0,
  },
  quizStarMiniText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  quizCardTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    lineHeight: 20,
  },
  quizCardSubTe: {
    fontSize: 12,
    fontWeight: '600',
  },
  quizFooterStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderTopWidth: 1,
  },
  quizFooterMetrics: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quizMetricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  quizMetricText: {
    fontSize: 12,
    fontWeight: '700',
  },
  quizMetricDot: {
    fontSize: 13,
    fontWeight: '700',
  },
  startQuizCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },
  startQuizCtaText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },
  // ── EXACT SERMONS SCREEN FOLDER-TAB DESIGN FOR ACTION SONGS ──
  sermonItem: {
    paddingVertical: 8,
  },
  sermonTabRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  sermonTab: {
    paddingTop: 8,
    paddingBottom: 7,
    paddingHorizontal: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  sermonTabTxt: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  sermonDurTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 8,
    paddingBottom: 6,
  },
  sermonDurTxt: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  sermonCard: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
    padding: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  sermonR1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sermonTh: {
    width: 94,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
  },
  sermonPlayDot: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    marginTop: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sermonPlayTriangle: {
    marginLeft: 2,
    borderLeftWidth: 24 * 0.38,
    borderTopWidth: 24 * 0.23,
    borderBottomWidth: 24 * 0.23,
    borderLeftColor: '#FFFFFF',
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  sermonTi: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sermonTe: {
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 1,
  },
  sermonSp: {
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 2,
  },
  sermonVs: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  sermonMn: {
    alignSelf: 'center',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sermonCardDivider: {
    marginTop: 18,
    width: '100%',
    height: 2,
    overflow: 'hidden',
  },
});
