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
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import {
  X,
  Search,
  BookOpen,
  Award,
  Calendar,
  Music,
  ChevronRight,
  Volume2,
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

export type KidsExploreCategory = 'stories' | 'quizzes' | 'lessons' | 'songs';

interface Props {
  visible: boolean;
  category: KidsExploreCategory | null;
  stories: KidsBibleStory[];
  quizzes: KidsQuiz[];
  songs: KidsWorshipSong[];
  curriculum: KidsCurriculumLesson[];
  curriculumConfig: KidsCurriculumConfig | null;
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
  onSelectStory,
  onSelectQuiz,
  onSelectSong,
  onSelectLesson,
  onClose,
}: Props) {
  const { isDark, colors: themeColors } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!visible) {
      setSearchQuery('');
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

  const screenBg = isDark ? '#000000' : (themeColors.background || '#FAF7F2');
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
      subtitle: `${stories.length} illustrated bilingual stories`,
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
          <View style={[styles.headerRow, { borderBottomColor: border }]}>
            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: isDark ? '#18181B' : '#F1F5F9' }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={20} color={textPrimary} />
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
                filteredStories.map(s => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.itemCard, { backgroundColor: cardBg, borderColor: border }, !isDark && styles.lightShadow]}
                    onPress={() => onSelectStory(s)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.thumbBox, { backgroundColor: innerBg, borderColor: border }]}>
                      {s.coverImageUrl ? (
                        <Image source={{ uri: s.coverImageUrl }} style={styles.thumbImg} />
                      ) : (
                        <Text style={{ fontSize: 24 }}>{s.coverEmoji || '📖'}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemTitle, { color: textPrimary }]} numberOfLines={1}>{s.title}</Text>
                      {s.titleTelugu ? (
                        <Text style={[styles.itemSubTe, { color: textPrimary }]} numberOfLines={1}>{s.titleTelugu}</Text>
                      ) : null}
                      <Text style={[styles.itemMeta, { color: textSecondary }]}>
                        {s.scriptureRef ? `${s.scriptureRef} · ` : ''}{s.readTime || '5 min'} · {s.pages?.length || 1} Pages
                      </Text>
                    </View>
                    <View style={[styles.actionPill, { backgroundColor: goldBg }]}>
                      <Text style={[styles.actionPillText, { color: goldAccent }]}>Read &rsaquo;</Text>
                    </View>
                  </TouchableOpacity>
                ))
              ))}

            {/* ONLY KIDS QUIZZES */}
            {category === 'quizzes' &&
              (filteredQuizzes.length === 0 ? (
                <EmptyCategory icon={<Award size={30} color={textSecondary} />} title="No Kids Quizzes Yet" textPrimary={textPrimary} textSecondary={textSecondary} cardBg={cardBg} border={border} />
              ) : (
                filteredQuizzes.map(q => (
                  <TouchableOpacity
                    key={q.id}
                    style={[styles.itemCard, { backgroundColor: cardBg, borderColor: border }, !isDark && styles.lightShadow]}
                    onPress={() => onSelectQuiz(q)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.thumbBox, { backgroundColor: goldBg, borderColor: border }]}>
                      <Text style={{ fontSize: 24 }}>{q.coverEmoji || '🏆'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemTitle, { color: textPrimary }]} numberOfLines={1}>{q.title}</Text>
                      {q.titleTelugu ? (
                        <Text style={[styles.itemSubTe, { color: textPrimary }]} numberOfLines={1}>{q.titleTelugu}</Text>
                      ) : null}
                      <Text style={[styles.itemMeta, { color: textSecondary }]}>
                        {q.questions?.length || 0} Qs · +{q.pointsReward || 50} Star Pts
                        {q.scriptureRef ? ` · ${q.scriptureRef}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.actionPill, { backgroundColor: goldBg }]}>
                      <Text style={[styles.actionPillText, { color: goldAccent }]}>Play &rsaquo;</Text>
                    </View>
                  </TouchableOpacity>
                ))
              ))}

            {/* ONLY WEEKLY LESSONS */}
            {category === 'lessons' &&
              (filteredLessons.length === 0 ? (
                <EmptyCategory icon={<Calendar size={30} color={textSecondary} />} title="No Weekly Lessons Yet" textPrimary={textPrimary} textSecondary={textSecondary} cardBg={cardBg} border={border} />
              ) : (
                filteredLessons.map((lesson, idx) => {
                  const isActive = activeInfo.lesson?.id === lesson.id;
                  const lessonDate =
                    lesson.type === 'custom'
                      ? lesson.scheduledDate || null
                      : curriculumConfig?.officialLaunchDate
                      ? getCurriculumWeekDate(curriculumConfig.officialLaunchDate, lesson.weekNumber || idx + 1)
                      : null;

                  return (
                    <TouchableOpacity
                      key={lesson.id}
                      style={[
                        styles.lessonCard,
                        { backgroundColor: cardBg, borderColor: isActive ? goldAccent : border },
                        isActive && { borderWidth: 1.5 },
                        !isDark && styles.lightShadow,
                      ]}
                      onPress={() => onSelectLesson(lesson, lessonDate)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.lessonTopRow}>
                        <View style={[styles.weekPill, { backgroundColor: isActive ? goldBg : innerBg }]}>
                          <Text style={[styles.weekPillText, { color: isActive ? goldAccent : textSecondary }]}>
                            {lesson.type === 'custom'
                              ? lessonDate
                                ? formatCurriculumDateDisplay(lessonDate)
                                : `LESSON ${idx + 1}`
                              : `WEEK ${lesson.weekNumber || idx + 1}`}
                          </Text>
                        </View>
                        {lesson.type !== 'custom' && lessonDate ? (
                          <Text style={[styles.lessonDateText, { color: textSecondary }]}>
                            {formatCurriculumDateDisplay(lessonDate)}
                          </Text>
                        ) : null}
                        {isActive && (
                          <View style={styles.activeBadge}>
                            <Text style={styles.activeBadgeText}>ACTIVE</Text>
                          </View>
                        )}
                      </View>

                      <Text style={[styles.itemTitle, { color: textPrimary }]}>{lesson.title}</Text>
                      {lesson.titleTelugu ? (
                        <Text style={[styles.itemSubTe, { color: goldAccent }]}>{lesson.titleTelugu}</Text>
                      ) : null}

                      <View style={styles.lessonBottomRow}>
                        <Text style={[styles.itemMeta, { color: textSecondary, flex: 1 }]} numberOfLines={1}>
                          📖 {lesson.scriptureRef}
                          {lesson.memoryVerse?.reference ? ` · ⭐ ${lesson.memoryVerse.reference}` : ''}
                        </Text>
                        <ChevronRight size={16} color={goldAccent} />
                      </View>
                    </TouchableOpacity>
                  );
                })
              ))}

            {/* ONLY ACTION SONGS */}
            {category === 'songs' &&
              (filteredSongs.length === 0 ? (
                <EmptyCategory icon={<Music size={30} color={textSecondary} />} title="No Action Songs Yet" textPrimary={textPrimary} textSecondary={textSecondary} cardBg={cardBg} border={border} />
              ) : (
                filteredSongs.map(song => (
                  <TouchableOpacity
                    key={song.id}
                    style={[styles.itemCard, { backgroundColor: cardBg, borderColor: border }, !isDark && styles.lightShadow]}
                    onPress={() => onSelectSong(song)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.thumbBox, { backgroundColor: innerBg, borderColor: border }]}>
                      {song.thumbnailUrl ? (
                        <Image source={{ uri: song.thumbnailUrl }} style={styles.thumbImg} />
                      ) : (
                        <Text style={{ fontSize: 24 }}>{song.coverEmoji || '🎵'}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.itemTitle, { color: textPrimary }]} numberOfLines={1}>{song.title}</Text>
                      {song.titleTelugu ? (
                        <Text style={[styles.itemSubTe, { color: textSecondary }]} numberOfLines={1}>{song.titleTelugu}</Text>
                      ) : null}
                      <Text style={[styles.itemMeta, { color: textSecondary }]}>
                        Duration: {song.duration || '3:00'} · Worship & Lyrics
                      </Text>
                    </View>
                    <View style={[styles.playCircle, { backgroundColor: innerBg }]}>
                      <Volume2 size={15} color={goldAccent} />
                    </View>
                  </TouchableOpacity>
                ))
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
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 6,
  },
  lessonTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  weekPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  weekPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  lessonDateText: {
    fontSize: 11,
    fontWeight: '600',
  },
  activeBadge: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(16, 185, 129, 0.14)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  activeBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#10B981',
  },
  lessonBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
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
});
