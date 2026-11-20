import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  Dimensions,
  Image,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Plus,
  BookOpen,
  Award,
  Music,
  Trash2,
  Edit3,
  Eye,
  CheckCircle,
  AlertCircle,
  Upload,
  Globe,
  HelpCircle,
  FileText,
  Sparkles,
  ChevronRight,
  Layers,
  Video,
  Search,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import KidsMinistryService from '../../../../services/KidsMinistryService';
import { useAdminTheme } from '../../../../utils/adminThemeHelper';
import {
  KidsBibleStory,
  KidsQuiz,
  KidsWorshipSong,
  KidsBibleStoryPage,
  KidsQuizQuestion,
} from '../../../../types/KidsMinistryTypes';

const { width } = Dimensions.get('window');

interface AdminContentManagerModalProps {
  visible: boolean;
  stories: KidsBibleStory[];
  quizzes: KidsQuiz[];
  songs: KidsWorshipSong[];
  churchId: string;
  onClose: () => void;
}

export default function AdminContentManagerModal({
  visible,
  stories,
  quizzes,
  songs,
  churchId,
  onClose,
}: AdminContentManagerModalProps) {
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
  const safeBottom = Math.max(insets.bottom, 12);
  const accentBlue = isDark ? '#93C5FD' : '#2563EB';
  const placeholderColor = isDark ? '#64748B' : '#94A3B8';

  const [activeTab, setActiveTab] = useState<'stories' | 'quizzes' | 'songs'>('stories');
  const [searchQuery, setSearchQuery] = useState('');

  // ── STORY STATE & FORM ──
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
  const [storyTitle, setStoryTitle] = useState('');
  const [storyTelugu, setStoryTelugu] = useState('');
  const [storyRef, setStoryRef] = useState('Genesis 1');
  const [storySummary, setStorySummary] = useState('');
  const [storySummaryTelugu, setStorySummaryTelugu] = useState('');
  const [storyEmoji, setStoryEmoji] = useState('📖');
  const [storyCoverUrl, setStoryCoverUrl] = useState('');
  const [storyPages, setStoryPages] = useState<KidsBibleStoryPage[]>([
    {
      pageNumber: 1,
      heading: 'Part 1',
      textEnglish: '',
      textTelugu: '',
      illustrationEmoji: '📖',
      imageUrl: '',
    },
  ]);
  const [storyPublished, setStoryPublished] = useState(true);

  // ── QUIZ STATE & FORM ──
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [quizTitle, setQuizTitle] = useState('');
  const [quizTelugu, setQuizTelugu] = useState('');
  const [quizRef, setQuizRef] = useState('');
  const [quizReward, setQuizReward] = useState('50');
  const [quizBadge, setQuizBadge] = useState('Bible Star');
  const [quizEmoji, setQuizEmoji] = useState('🏆');
  const [quizDifficulty, setQuizDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [quizPublished, setQuizPublished] = useState(true);
  const [quizQuestions, setQuizQuestions] = useState<KidsQuizQuestion[]>([
    {
      id: 'q1',
      questionEnglish: '',
      questionTelugu: '',
      options: ['', '', '', ''],
      optionsTelugu: ['', '', '', ''],
      correctIndex: 0,
      explanation: '',
    },
  ]);

  // ── SONG STATE & FORM ──
  const [showSongModal, setShowSongModal] = useState(false);
  const [editingSongId, setEditingSongId] = useState<string | null>(null);
  const [songTitle, setSongTitle] = useState('');
  const [songTelugu, setSongTelugu] = useState('');
  const [songCategory, setSongCategory] = useState<'action_song' | 'praise' | 'hymn' | 'action_dance'>('action_song');
  const [songVideoId, setSongVideoId] = useState('');
  const [songAudioUrl, setSongAudioUrl] = useState('');
  const [songAudioName, setSongAudioName] = useState('');
  const [songThumbnailUrl, setSongThumbnailUrl] = useState('');
  const [songLyricsEng, setSongLyricsEng] = useState('');
  const [songLyricsTel, setSongLyricsTel] = useState('');
  const [songDuration, setSongDuration] = useState('3:00');
  const [songEmoji, setSongEmoji] = useState('🎵');
  const [songPublished, setSongPublished] = useState(true);

  const [saving, setSaving] = useState(false);

  // ──────────────────────────────────────────
  // STORY ACTIONS
  // ──────────────────────────────────────────
  const openNewStoryForm = () => {
    setEditingStoryId(null);
    setStoryTitle('');
    setStoryTelugu('');
    setStoryRef('');
    setStorySummary('');
    setStorySummaryTelugu('');
    setStoryEmoji('📖');
    setStoryCoverUrl('');
    setStoryPages([
      {
        pageNumber: 1,
        heading: '',
        textEnglish: '',
        textTelugu: '',
        illustrationEmoji: '📖',
        imageUrl: '',
      },
    ]);
    setStoryPublished(true);
    setShowStoryModal(true);
  };

  const openEditStoryForm = (s: KidsBibleStory) => {
    setEditingStoryId(s.id);
    setStoryTitle(s.title);
    setStoryTelugu(s.titleTelugu || '');
    setStoryRef(s.scriptureRef || '');
    setStorySummary(s.summary || '');
    setStorySummaryTelugu(s.summaryTelugu || '');
    setStoryEmoji(s.coverEmoji || '📖');
    setStoryCoverUrl(s.coverImageUrl || '');
    setStoryPages(
      s.pages && s.pages.length > 0
        ? s.pages
        : [
            {
              pageNumber: 1,
              heading: 'Part 1',
              textEnglish: s.summary || '',
              textTelugu: s.summaryTelugu || '',
              illustrationEmoji: s.coverEmoji || '📖',
              imageUrl: '',
            },
          ]
    );
    setStoryPublished(s.isPublished ?? true);
    setShowStoryModal(true);
  };

  const handlePickStoryCover = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });
      if (!res.canceled && res.assets && res.assets[0]?.uri) {
        setStoryCoverUrl(res.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Image Picker Error', err?.message || 'Could not pick image');
    }
  };

  const handleSaveStory = async () => {
    if (!storyTitle.trim()) {
      Alert.alert('Required', 'Please enter a story title in English');
      return;
    }
    try {
      setSaving(true);
      const payload: Partial<KidsBibleStory> = {
        title: storyTitle.trim(),
        titleTelugu: storyTelugu.trim() || storyTitle.trim(),
        scriptureRef: storyRef.trim(),
        theme: 'Bible Story',
        coverEmoji: storyEmoji.trim() || '📖',
        coverImageUrl: storyCoverUrl.trim() || undefined,
        readTime: '5 min',
        summary: storySummary.trim(),
        summaryTelugu: storySummaryTelugu.trim() || storySummary.trim(),
        pages: storyPages,
        reflectionQuestions: [
          {
            questionEnglish: 'What important truth did we learn from this story?',
            questionTelugu: 'ఈ కథ నుండి మనం ఏమి ముఖ్యమైన పాఠం నేర్చుకున్నాము?',
          },
        ],
        isPublished: storyPublished,
      };

      if (editingStoryId) {
        await KidsMinistryService.updateStory(churchId, editingStoryId, payload);
        Alert.alert('Story Updated! 📖', `"${storyTitle}" has been saved.`);
      } else {
        await KidsMinistryService.createStory(churchId, {
          storyId: `STORY-${Date.now().toString().slice(-4)}`,
          ...payload,
        });
        Alert.alert('Story Created! 🎉', `"${storyTitle}" has been published.`);
      }
      setShowStoryModal(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save story');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStory = (id: string, title: string) => {
    Alert.alert('Delete Story', `Are you sure you want to delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => KidsMinistryService.deleteStory(churchId, id) },
    ]);
  };

  // ──────────────────────────────────────────
  // QUIZ ACTIONS
  // ──────────────────────────────────────────
  const openNewQuizForm = () => {
    setEditingQuizId(null);
    setQuizTitle('');
    setQuizTelugu('');
    setQuizRef('Genesis 1');
    setQuizReward('50');
    setQuizBadge('Bible Star');
    setQuizEmoji('🏆');
    setQuizDifficulty('beginner');
    setQuizPublished(true);
    setQuizQuestions([
      {
        id: 'q1',
        questionEnglish: 'How many days did God take to create the world?',
        questionTelugu: 'దేవుడు ఎన్ని దినములలో సమస్తమును సృజించెను?',
        options: ['6 Days', '7 Days', '3 Days', '1 Day'],
        optionsTelugu: ['6 దినములు', '7 దినములు', '3 దినములు', '1 దినము'],
        correctIndex: 0,
        explanation: 'God created the heavens and earth in 6 days and rested on the 7th day.',
      },
    ]);
    setShowQuizModal(true);
  };

  const openEditQuizForm = (q: KidsQuiz) => {
    setEditingQuizId(q.id);
    setQuizTitle(q.title);
    setQuizTelugu(q.titleTelugu || '');
    setQuizRef(q.scriptureRef || '');
    setQuizReward(String(q.pointsReward || 50));
    setQuizBadge(q.badgeReward || 'Bible Star');
    setQuizEmoji(q.coverEmoji || '🏆');
    setQuizDifficulty(q.difficulty || 'beginner');
    setQuizPublished(q.isPublished ?? true);
    setQuizQuestions(
      q.questions && q.questions.length > 0
        ? q.questions
        : [
            {
              id: 'q1',
              questionEnglish: '',
              questionTelugu: '',
              options: ['', '', '', ''],
              correctIndex: 0,
              explanation: '',
            },
          ]
    );
    setShowQuizModal(true);
  };

  const handleSaveQuiz = async () => {
    if (!quizTitle.trim()) {
      Alert.alert('Required', 'Please enter a quiz title');
      return;
    }
    try {
      setSaving(true);
      const payload: Partial<KidsQuiz> = {
        title: quizTitle.trim(),
        titleTelugu: quizTelugu.trim() || quizTitle.trim(),
        scriptureRef: quizRef.trim(),
        pointsReward: parseInt(quizReward, 10) || 50,
        badgeReward: quizBadge.trim() || 'Bible Star',
        coverEmoji: quizEmoji.trim() || '🏆',
        difficulty: quizDifficulty,
        isPublished: quizPublished,
        questions: quizQuestions,
      };

      if (editingQuizId) {
        await KidsMinistryService.updateQuiz(churchId, editingQuizId, payload);
        Alert.alert('Quiz Updated! 🏆', `"${quizTitle}" has been saved.`);
      } else {
        await KidsMinistryService.createQuiz(churchId, {
          quizId: `QUIZ-${Date.now().toString().slice(-4)}`,
          ...payload,
        });
        Alert.alert('Quiz Created! 🎉', `"${quizTitle}" is now live for children.`);
      }
      setShowQuizModal(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save quiz');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuiz = (id: string, title: string) => {
    Alert.alert('Delete Quiz', `Are you sure you want to delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => KidsMinistryService.deleteQuiz(churchId, id) },
    ]);
  };

  // ──────────────────────────────────────────
  // WORSHIP SONGS ACTIONS
  // ──────────────────────────────────────────
  const openNewSongForm = () => {
    setEditingSongId(null);
    setSongTitle('');
    setSongTelugu('');
    setSongCategory('action_song');
    setSongVideoId('');
    setSongAudioUrl('');
    setSongAudioName('');
    setSongThumbnailUrl('');
    setSongLyricsEng('');
    setSongLyricsTel('');
    setSongDuration('3:00');
    setSongEmoji('🎵');
    setSongPublished(true);
    setShowSongModal(true);
  };

  const openEditSongForm = (s: KidsWorshipSong) => {
    setEditingSongId(s.id);
    setSongTitle(s.title);
    setSongTelugu(s.titleTelugu || '');
    setSongCategory(s.category || 'action_song');
    setSongVideoId(s.youtubeVideoId || '');
    setSongAudioUrl(s.audioUrl || '');
    setSongAudioName(s.audioFileName || '');
    setSongThumbnailUrl(s.thumbnailUrl || '');
    setSongLyricsEng(s.lyricsEnglish || '');
    setSongLyricsTel(s.lyricsTelugu || '');
    setSongDuration(s.duration || '3:00');
    setSongEmoji(s.coverEmoji || '🎵');
    setSongPublished(s.isPublished ?? true);
    setShowSongModal(true);
  };

  const handlePickAudioFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        setSongAudioUrl(asset.uri);
        setSongAudioName(asset.name || 'custom_audio.mp3');
        Alert.alert('Audio File Attached', `Selected: ${asset.name}`);
      }
    } catch (err: any) {
      Alert.alert('Audio Pick Error', err?.message || 'Could not select audio file');
    }
  };

  const handlePickSongThumbnail = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });
      if (!res.canceled && res.assets && res.assets[0]?.uri) {
        setSongThumbnailUrl(res.assets[0].uri);
      }
    } catch (err: any) {
      Alert.alert('Image Picker Error', err?.message || 'Could not pick thumbnail');
    }
  };

  const handleSaveSong = async () => {
    if (!songTitle.trim()) {
      Alert.alert('Required', 'Please enter a song title');
      return;
    }
    try {
      setSaving(true);
      // Clean YouTube ID if full URL was pasted
      let cleanVideoId = songVideoId.trim();
      if (cleanVideoId.includes('v=')) {
        cleanVideoId = cleanVideoId.split('v=')[1]?.split('&')[0] || cleanVideoId;
      } else if (cleanVideoId.includes('youtu.be/')) {
        cleanVideoId = cleanVideoId.split('youtu.be/')[1]?.split('?')[0] || cleanVideoId;
      }

      const payload: Partial<KidsWorshipSong> = {
        title: songTitle.trim(),
        titleTelugu: songTelugu.trim() || songTitle.trim(),
        category: songCategory,
        youtubeVideoId: cleanVideoId,
        audioUrl: songAudioUrl.trim() || undefined,
        audioFileName: songAudioName.trim() || undefined,
        thumbnailUrl: songThumbnailUrl.trim() || undefined,
        lyricsEnglish: songLyricsEng.trim(),
        lyricsTelugu: songLyricsTel.trim(),
        duration: songDuration.trim() || '3:00',
        coverEmoji: songEmoji.trim() || '🎵',
        isPublished: songPublished,
      };

      if (editingSongId) {
        await KidsMinistryService.updateSong(churchId, editingSongId, payload);
        Alert.alert('Song Updated! 🎵', `"${songTitle}" has been saved.`);
      } else {
        await KidsMinistryService.createSong(churchId, {
          songId: `SONG-${Date.now().toString().slice(-4)}`,
          ...payload,
        });
        Alert.alert('Song Added! 🎵', `"${songTitle}" is now ready for worship.`);
      }
      setShowSongModal(false);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save song');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSong = (id: string, title: string) => {
    Alert.alert('Delete Song', `Are you sure you want to delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => KidsMinistryService.deleteSong(churchId, id) },
    ]);
  };

  // ──────────────────────────────────────────
  // FILTERED LISTS
  // ──────────────────────────────────────────
  const filteredStories = stories.filter(s => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return s.title.toLowerCase().includes(q) || (s.titleTelugu || '').toLowerCase().includes(q) || (s.scriptureRef || '').toLowerCase().includes(q);
  });

  const filteredQuizzes = quizzes.filter(q => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true;
    return q.title.toLowerCase().includes(term) || (q.titleTelugu || '').toLowerCase().includes(term);
  });

  const filteredSongs = songs.filter(s => {
    const term = searchQuery.toLowerCase().trim();
    if (!term) return true;
    return s.title.toLowerCase().includes(term) || (s.titleTelugu || '').toLowerCase().includes(term);
  });

  const themedInputStyle = [
    styles.formInput,
    {
      backgroundColor: secondarySurface,
      borderColor,
      color: primaryText,
    },
  ];
  const themedCardStyle = [
    styles.formCardSection,
    {
      backgroundColor: cardSurface,
      borderColor,
    },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: screenBg, paddingTop: safeTop }]}>
        <StatusBar barStyle={barStyle} backgroundColor={screenBg} />

        {/* ── TOP HEADER (CLEAN, SAFE-AREA AWARE) ── */}
        <View style={[styles.topHeader, { borderBottomColor: borderColor }]}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.closeHeaderBtn, { backgroundColor: secondarySurface, borderColor }]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={20} color={primaryText} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={[styles.headerTitle, { color: primaryText }]} numberOfLines={1}>
              Bible Learning Center
            </Text>
            <Text style={[styles.headerSubtitle, { color: secondaryText }]} numberOfLines={1}>
              {stories.length} Stories · {quizzes.length} Quizzes · {songs.length} Songs
            </Text>
          </View>

          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => {
              if (activeTab === 'stories') openNewStoryForm();
              else if (activeTab === 'quizzes') openNewQuizForm();
              else openNewSongForm();
            }}
            activeOpacity={0.85}
          >
            <Plus size={15} color="#FFFFFF" strokeWidth={2.8} />
            <Text style={styles.createBtnText}>
              {activeTab === 'stories' ? 'Story' : activeTab === 'quizzes' ? 'Quiz' : 'Song'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── SEGMENT TABS (ALL 3 TABS VISIBLE WITHOUT CLIPPING) ── */}
        <View style={[styles.navBar, { borderBottomColor: borderColor }]}>
          <View style={[styles.segmentedTrack, { backgroundColor: secondarySurface, borderColor }]}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'stories' && styles.tabActive]}
              onPress={() => setActiveTab('stories')}
              activeOpacity={0.85}
            >
              <BookOpen size={14} color={activeTab === 'stories' ? '#FFFFFF' : secondaryText} />
              <Text
                style={[styles.tabText, { color: secondaryText }, activeTab === 'stories' && styles.tabTextActive]}
                numberOfLines={1}
              >
                Stories ({stories.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'quizzes' && styles.tabActive]}
              onPress={() => setActiveTab('quizzes')}
              activeOpacity={0.85}
            >
              <Award size={14} color={activeTab === 'quizzes' ? '#FFFFFF' : secondaryText} />
              <Text
                style={[styles.tabText, { color: secondaryText }, activeTab === 'quizzes' && styles.tabTextActive]}
                numberOfLines={1}
              >
                Quizzes ({quizzes.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'songs' && styles.tabActive]}
              onPress={() => setActiveTab('songs')}
              activeOpacity={0.85}
            >
              <Music size={14} color={activeTab === 'songs' ? '#FFFFFF' : secondaryText} />
              <Text
                style={[styles.tabText, { color: secondaryText }, activeTab === 'songs' && styles.tabTextActive]}
                numberOfLines={1}
              >
                Songs ({songs.length})
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── SEARCH BAR ── */}
        <View style={[styles.searchBarBox, { backgroundColor: cardSurface, borderColor }]}>
          <Search size={16} color={secondaryText} style={{ marginRight: 8 }} />
          <TextInput
            style={[styles.searchInput, { color: primaryText }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={`Search ${activeTab}...`}
            placeholderTextColor={placeholderColor}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color={secondaryText} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── BODY LIST ── */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentScroll}>
          {/* STORIES TAB */}
          {activeTab === 'stories' && (
            <View style={styles.itemsGrid}>
              {filteredStories.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: cardSurface, borderColor }]}>
                  <BookOpen size={28} color={secondaryText} />
                  <Text style={[styles.emptyTitle, { color: primaryText }]}>No Bible Stories Found</Text>
                  <Text style={[styles.emptySub, { color: secondaryText }]}>
                    Tap + Story above to add a bilingual illustrated story.
                  </Text>
                </View>
              ) : (
                filteredStories.map(s => (
                  <View
                    key={s.id}
                    style={[
                      styles.contentCard,
                      { backgroundColor: cardSurface, borderColor },
                      !isDark && styles.cardShadowLight,
                    ]}
                  >
                    <View
                      style={[
                        styles.cardCoverBox,
                        { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' },
                      ]}
                    >
                      {s.coverImageUrl ? (
                        <Image source={{ uri: s.coverImageUrl }} style={styles.cardImage} />
                      ) : (
                        <Text style={{ fontSize: 22 }}>{s.coverEmoji || '📖'}</Text>
                      )}
                    </View>

                    <View style={{ flex: 1, justifyContent: 'center' }}>
                      <View style={styles.cardTitleRow}>
                        <Text style={[styles.cardTitle, { color: primaryText }]} numberOfLines={1}>
                          {s.title}
                        </Text>
                        <View style={[styles.statusPill, s.isPublished !== false ? styles.publishedPill : styles.draftPill]}>
                          <Text
                            style={[
                              styles.statusPillText,
                              s.isPublished !== false ? styles.publishedPillText : styles.draftPillText,
                            ]}
                          >
                            {s.isPublished !== false ? 'Live' : 'Draft'}
                          </Text>
                        </View>
                      </View>
                      {s.titleTelugu ? (
                        <Text style={[styles.cardTeluguTitle, { color: accentBlue }]} numberOfLines={1}>
                          {s.titleTelugu}
                        </Text>
                      ) : null}
                      <Text style={[styles.cardRef, { color: secondaryText }]}>
                        {s.scriptureRef || 'Genesis'} · {s.pages?.length || 1} Pages
                      </Text>
                    </View>

                    <View style={styles.actionButtonsCol}>
                      <TouchableOpacity style={styles.editBtn} onPress={() => openEditStoryForm(s)}>
                        <Edit3 size={15} color="#2563EB" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteStory(s.id, s.title)}>
                        <Trash2 size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* QUIZZES TAB */}
          {activeTab === 'quizzes' && (
            <View style={styles.itemsGrid}>
              {filteredQuizzes.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: cardSurface, borderColor }]}>
                  <Award size={28} color={secondaryText} />
                  <Text style={[styles.emptyTitle, { color: primaryText }]}>No Bible Quizzes Found</Text>
                  <Text style={[styles.emptySub, { color: secondaryText }]}>
                    Tap + Quiz above to create an interactive kids quiz.
                  </Text>
                </View>
              ) : (
                filteredQuizzes.map(q => (
                  <View
                    key={q.id}
                    style={[
                      styles.contentCard,
                      { backgroundColor: cardSurface, borderColor },
                      !isDark && styles.cardShadowLight,
                    ]}
                  >
                    <View style={[styles.cardCoverBox, { backgroundColor: 'rgba(245, 158, 11, 0.14)' }]}>
                      <Text style={{ fontSize: 22 }}>{q.coverEmoji || '🏆'}</Text>
                    </View>

                    <View style={{ flex: 1, justifyContent: 'center' }}>
                      <View style={styles.cardTitleRow}>
                        <Text style={[styles.cardTitle, { color: primaryText }]} numberOfLines={1}>
                          {q.title}
                        </Text>
                        <View style={[styles.statusPill, q.isPublished !== false ? styles.publishedPill : styles.draftPill]}>
                          <Text
                            style={[
                              styles.statusPillText,
                              q.isPublished !== false ? styles.publishedPillText : styles.draftPillText,
                            ]}
                          >
                            {q.isPublished !== false ? 'Active' : 'Draft'}
                          </Text>
                        </View>
                      </View>
                      {q.titleTelugu ? (
                        <Text style={[styles.cardTeluguTitle, { color: accentBlue }]} numberOfLines={1}>
                          {q.titleTelugu}
                        </Text>
                      ) : null}
                      <Text style={[styles.cardRef, { color: secondaryText }]}>
                        {q.questions?.length || 0} Qs · +{q.pointsReward || 50} pts
                      </Text>
                    </View>

                    <View style={styles.actionButtonsCol}>
                      <TouchableOpacity style={styles.editBtn} onPress={() => openEditQuizForm(q)}>
                        <Edit3 size={15} color="#2563EB" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteQuiz(q.id, q.title)}>
                        <Trash2 size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {/* SONGS TAB */}
          {activeTab === 'songs' && (
            <View style={styles.itemsGrid}>
              {filteredSongs.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: cardSurface, borderColor }]}>
                  <Music size={28} color={secondaryText} />
                  <Text style={[styles.emptyTitle, { color: primaryText }]}>No Worship Songs Found</Text>
                  <Text style={[styles.emptySub, { color: secondaryText }]}>
                    Tap + Song above to add an action or praise song.
                  </Text>
                </View>
              ) : (
                filteredSongs.map(song => (
                  <View
                    key={song.id}
                    style={[
                      styles.contentCard,
                      { backgroundColor: cardSurface, borderColor },
                      !isDark && styles.cardShadowLight,
                    ]}
                  >
                    <View style={[styles.cardCoverBox, { backgroundColor: 'rgba(236, 72, 153, 0.14)' }]}>
                      {song.thumbnailUrl ? (
                        <Image source={{ uri: song.thumbnailUrl }} style={styles.cardImage} />
                      ) : (
                        <Text style={{ fontSize: 22 }}>{song.coverEmoji || '🎵'}</Text>
                      )}
                    </View>

                    <View style={{ flex: 1, justifyContent: 'center' }}>
                      <View style={styles.cardTitleRow}>
                        <Text style={[styles.cardTitle, { color: primaryText }]} numberOfLines={1}>
                          {song.title}
                        </Text>
                        <View style={[styles.statusPill, song.isPublished !== false ? styles.publishedPill : styles.draftPill]}>
                          <Text
                            style={[
                              styles.statusPillText,
                              song.isPublished !== false ? styles.publishedPillText : styles.draftPillText,
                            ]}
                          >
                            {song.isPublished !== false ? 'Ready' : 'Draft'}
                          </Text>
                        </View>
                      </View>
                      {song.titleTelugu ? (
                        <Text style={[styles.cardTeluguTitle, { color: accentBlue }]} numberOfLines={1}>
                          {song.titleTelugu}
                        </Text>
                      ) : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        <Video size={11} color="#EF4444" />
                        <Text style={[styles.cardRef, { color: secondaryText, marginTop: 0 }]}>
                          ID: {song.youtubeVideoId || 'N/A'}
                        </Text>
                        {song.audioUrl ? (
                          <Text style={[styles.cardRef, { color: '#10B981', marginTop: 0, fontWeight: '700' }]}>· MP3</Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.actionButtonsCol}>
                      <TouchableOpacity style={styles.editBtn} onPress={() => openEditSongForm(song)}>
                        <Edit3 size={15} color="#2563EB" />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteSong(song.id, song.title)}>
                        <Trash2 size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </ScrollView>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* STORY CREATE / EDIT MODAL                                    */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <Modal visible={showStoryModal} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowStoryModal(false)}>
          <View style={[styles.container, { backgroundColor: screenBg, paddingTop: safeTop }]}>
            <StatusBar barStyle={barStyle} backgroundColor={screenBg} />
            <View style={[styles.topHeader, { borderBottomColor: borderColor }]}>
              <TouchableOpacity
                onPress={() => setShowStoryModal(false)}
                style={[styles.closeHeaderBtn, { backgroundColor: secondarySurface, borderColor }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={primaryText} />
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <Text style={[styles.headerTitle, { color: primaryText }]} numberOfLines={1}>
                  {editingStoryId ? 'Edit Bible Story' : 'Create Bible Story'}
                </Text>
                <Text style={[styles.headerSubtitle, { color: secondaryText }]} numberOfLines={1}>
                  Bilingual Scripture & thematic story pages
                </Text>
              </View>
              <View style={{ width: 36 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorFullScroll}>
              {/* Section 1: Titles & Scripture */}
              <View style={themedCardStyle}>
                <Text style={[styles.formSectionHeading, { color: accentBlue }]}>1. STORY TITLES & SCRIPTURE REFERENCE</Text>
                <Text style={[styles.formSectionHelper, { color: secondaryText }]}>
                  You can write a direct Scripture passage (e.g. Genesis 1) or an adapted Sunday school thematic story (e.g. "Jesus Loves the Children").
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.inputMiniLabel, { color: primaryText }]}>English Story Title *</Text>
                  <TextInput
                    style={themedInputStyle}
                    value={storyTitle}
                    onChangeText={setStoryTitle}
                    placeholder="e.g. David and Goliath / The Good Samaritan"
                    placeholderTextColor={placeholderColor}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.inputMiniLabel, { color: primaryText }]}>Telugu Story Title (తెలుగు శీర్షిక)</Text>
                  <TextInput
                    style={themedInputStyle}
                    value={storyTelugu}
                    onChangeText={setStoryTelugu}
                    placeholder="e.g. దావీదు మరియు గొల్యాతు / మంచి సమరయుడు"
                    placeholderTextColor={placeholderColor}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.inputMiniLabel, { color: primaryText }]}>Scripture Reference (Bible Book & Chapter/Verse)</Text>
                  <TextInput
                    style={themedInputStyle}
                    value={storyRef}
                    onChangeText={setStoryRef}
                    placeholder="e.g. 1 Samuel 17:1-50 or Luke 10:25-37"
                    placeholderTextColor={placeholderColor}
                  />
                </View>
              </View>

              {/* Section 2: Cover Emoji & Upload Illustration */}
              <View style={themedCardStyle}>
                <Text style={[styles.formSectionHeading, { color: accentBlue }]}>2. COVER EMOJI & ILLUSTRATION IMAGE</Text>
                <Text style={[styles.formSectionHelper, { color: secondaryText }]}>
                  Choose a display emoji and/or upload a colorful illustration photo for kids.
                </Text>

                <View style={styles.coverRow}>
                  <View style={{ alignItems: 'center', gap: 4 }}>
                    <Text style={[styles.inputMiniLabel, { color: primaryText }]}>Cover Emoji</Text>
                    <TextInput
                      style={[themedInputStyle, styles.emojiInputBox]}
                      value={storyEmoji}
                      onChangeText={setStoryEmoji}
                      maxLength={2}
                    />
                  </View>

                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={[styles.inputMiniLabel, { color: primaryText }]}>Custom Illustration Image</Text>
                    <TouchableOpacity
                      style={[
                        styles.uploadImageBtn,
                        { backgroundColor: isDark ? '#1E3A8A' : 'rgba(37, 99, 235, 0.1)', borderColor: '#3B82F6' },
                      ]}
                      onPress={handlePickStoryCover}
                      activeOpacity={0.8}
                    >
                      <Upload size={16} color={accentBlue} />
                      <Text style={[styles.uploadImageBtnText, { color: accentBlue }]}>
                        {storyCoverUrl ? 'Change Uploaded Image' : 'Pick Image from Device'}
                      </Text>
                    </TouchableOpacity>
                    {storyCoverUrl ? (
                      <View style={styles.uploadedPreviewRow}>
                        <CheckCircle size={14} color="#10B981" />
                        <Text style={styles.uploadedSuccessText} numberOfLines={1}>
                          Image successfully selected
                        </Text>
                        <TouchableOpacity onPress={() => setStoryCoverUrl('')} style={{ marginLeft: 'auto' }}>
                          <Text style={styles.removeImageText}>Remove</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={[styles.noImageHint, { color: secondaryText }]}>No image selected (default emoji will be used)</Text>
                    )}
                  </View>
                </View>

                {storyCoverUrl ? (
                  <View style={[styles.imagePreviewBox, { borderColor }]}>
                    <Image source={{ uri: storyCoverUrl }} style={styles.imagePreviewImg} resizeMode="cover" />
                  </View>
                ) : null}
              </View>

              {/* Section 3: Bilingual Story Pages */}
              <View style={themedCardStyle}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[styles.formSectionHeading, { color: accentBlue }]}>3. BILINGUAL STORY NARRATIVE PAGES ({storyPages.length})</Text>
                </View>
                <Text style={[styles.formSectionHelper, { color: secondaryText }]}>
                  Break the story into bite-sized pages with English & Telugu paragraphs for children to read or listen.
                </Text>

                {storyPages.map((page, idx) => (
                  <View key={idx} style={[styles.pageCard, { backgroundColor: secondarySurface, borderColor }]}>
                    <View style={styles.pageCardTopRow}>
                      <View style={styles.pageNumBadge}>
                        <Text style={styles.pageNumBadgeText}>PAGE {idx + 1}</Text>
                      </View>
                      {storyPages.length > 1 && (
                        <TouchableOpacity
                          onPress={() => {
                            const updated = storyPages.filter((_, pIdx) => pIdx !== idx);
                            setStoryPages(updated);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Trash2 size={15} color="#EF4444" />
                        </TouchableOpacity>
                      )}
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={[styles.inputMiniLabel, { color: primaryText }]}>Page Heading</Text>
                      <TextInput
                        style={[themedInputStyle, { backgroundColor: cardSurface }]}
                        value={page.heading}
                        onChangeText={txt => {
                          const updated = [...storyPages];
                          updated[idx].heading = txt;
                          setStoryPages(updated);
                        }}
                        placeholder="e.g. Part 1: The Young Shepherd / భాగం 1"
                        placeholderTextColor={placeholderColor}
                      />
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={[styles.inputMiniLabel, { color: primaryText }]}>English Narrative (Page {idx + 1})</Text>
                      <TextInput
                        style={[themedInputStyle, styles.narrativeInput, { backgroundColor: cardSurface }]}
                        value={page.textEnglish}
                        onChangeText={txt => {
                          const updated = [...storyPages];
                          updated[idx].textEnglish = txt;
                          setStoryPages(updated);
                        }}
                        placeholder="Write the English story text for this page..."
                        placeholderTextColor={placeholderColor}
                        multiline
                      />
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={[styles.inputMiniLabel, { color: primaryText }]}>Telugu Narrative (తెలుగు కథనం)</Text>
                      <TextInput
                        style={[themedInputStyle, styles.narrativeInput, { backgroundColor: cardSurface }]}
                        value={page.textTelugu}
                        onChangeText={txt => {
                          const updated = [...storyPages];
                          updated[idx].textTelugu = txt;
                          setStoryPages(updated);
                        }}
                        placeholder="ఈ పేజీకి సంబంధించిన తెలుగు వివరణ ఇక్కడ రాయండి..."
                        placeholderTextColor={placeholderColor}
                        multiline
                      />
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.addPageBtn, { backgroundColor: secondarySurface, borderColor: '#3B82F6' }]}
                  onPress={() => {
                    setStoryPages([
                      ...storyPages,
                      {
                        pageNumber: storyPages.length + 1,
                        heading: '',
                        textEnglish: '',
                        textTelugu: '',
                        illustrationEmoji: '📖',
                      },
                    ]);
                  }}
                  activeOpacity={0.8}
                >
                  <Plus size={16} color={accentBlue} />
                  <Text style={[styles.addPageBtnText, { color: accentBlue }]}>Add Another Story Page (+ Page {storyPages.length + 1})</Text>
                </TouchableOpacity>
              </View>

              {/* Section 4: Publishing Status */}
              <View style={[themedCardStyle, styles.toggleRowCard]}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={[styles.toggleTitle, { color: primaryText }]}>Publish to Rhema Kids App</Text>
                  <Text style={[styles.toggleDesc, { color: secondaryText }]}>
                    {storyPublished
                      ? 'Live: Children and parents can read and listen to this story immediately.'
                      : 'Draft: Saved privately for Sunday School teachers to review before release.'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    { backgroundColor: secondarySurface, borderColor },
                    storyPublished && styles.toggleBtnActive,
                  ]}
                  onPress={() => setStoryPublished(!storyPublished)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.toggleBtnText, { color: secondaryText }, storyPublished && styles.toggleBtnTextActive]}>
                    {storyPublished ? 'Published' : 'Draft Only'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Bottom Actions Bar */}
            <View style={[styles.editorBottomBar, { backgroundColor: screenBg, borderTopColor: borderColor, paddingBottom: safeBottom }]}>
              <TouchableOpacity
                style={[styles.cancelActionBtn, { backgroundColor: secondarySurface, borderColor, borderWidth: 1 }]}
                onPress={() => setShowStoryModal(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.cancelActionText, { color: primaryText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveActionBtn} onPress={handleSaveStory} disabled={saving} activeOpacity={0.85}>
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveActionText}>{editingStoryId ? 'Save Changes' : 'Publish Bible Story'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* QUIZ CREATE / EDIT MODAL                                     */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <Modal visible={showQuizModal} animationType="slide" transparent onRequestClose={() => setShowQuizModal(false)}>
          <View style={styles.editorBackdrop}>
            <View style={[styles.editorCard, { backgroundColor: screenBg, borderColor, paddingBottom: safeBottom }]}>
              <View style={[styles.editorHeader, { borderBottomColor: borderColor }]}>
                <View>
                  <Text style={[styles.editorTag, { color: accentBlue }]}>INTERACTIVE BIBLE QUIZ</Text>
                  <Text style={[styles.editorTitle, { color: primaryText }]}>{editingQuizId ? 'Edit Quiz' : 'Create New Bible Quiz'}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowQuizModal(false)}
                  style={[styles.editorCloseBtn, { backgroundColor: secondarySurface }]}
                >
                  <X size={18} color={primaryText} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorFormScroll}>
                <Text style={[styles.formSectionHeading, { color: accentBlue }]}>1. QUIZ OVERVIEW</Text>
                <TextInput
                  style={themedInputStyle}
                  value={quizTitle}
                  onChangeText={setQuizTitle}
                  placeholder="Quiz Title (e.g. Life of Moses Quiz)"
                  placeholderTextColor={placeholderColor}
                />
                <TextInput
                  style={themedInputStyle}
                  value={quizTelugu}
                  onChangeText={setQuizTelugu}
                  placeholder="Telugu Title (e.g. మోషే జీవిత చరిత్ర క్విజ్)"
                  placeholderTextColor={placeholderColor}
                />
                <TextInput
                  style={themedInputStyle}
                  value={quizRef}
                  onChangeText={setQuizRef}
                  placeholder="Scripture Reference (e.g. Exodus 1-14)"
                  placeholderTextColor={placeholderColor}
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputMiniLabel, { color: primaryText }]}>Star Points Reward</Text>
                    <TextInput
                      style={themedInputStyle}
                      value={quizReward}
                      onChangeText={setQuizReward}
                      keyboardType="numeric"
                      placeholder="50"
                      placeholderTextColor={placeholderColor}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.inputMiniLabel, { color: primaryText }]}>Badge Title</Text>
                    <TextInput
                      style={themedInputStyle}
                      value={quizBadge}
                      onChangeText={setQuizBadge}
                      placeholder="Torah Champion"
                      placeholderTextColor={placeholderColor}
                    />
                  </View>
                </View>

                <Text style={[styles.formSectionHeading, { color: accentBlue }]}>2. MULTIPLE CHOICE QUESTIONS</Text>
                {quizQuestions.map((q, qIdx) => (
                  <View key={qIdx} style={[styles.questionCard, { backgroundColor: cardSurface, borderColor }]}>
                    <Text style={[styles.pageCardTitle, { color: '#D97706' }]}>Question {qIdx + 1}</Text>
                    <TextInput
                      style={themedInputStyle}
                      value={q.questionEnglish}
                      onChangeText={txt => {
                        const updated = [...quizQuestions];
                        updated[qIdx].questionEnglish = txt;
                        setQuizQuestions(updated);
                      }}
                      placeholder="Question in English..."
                      placeholderTextColor={placeholderColor}
                    />
                    <TextInput
                      style={themedInputStyle}
                      value={q.questionTelugu}
                      onChangeText={txt => {
                        const updated = [...quizQuestions];
                        updated[qIdx].questionTelugu = txt;
                        setQuizQuestions(updated);
                      }}
                      placeholder="ప్రశ్న తెలుగులో..."
                      placeholderTextColor={placeholderColor}
                    />

                    <Text style={[styles.inputMiniLabel, { color: primaryText, marginTop: 6 }]}>
                      Answer Options (Tap circle to mark correct answer):
                    </Text>
                    {q.options.map((opt, oIdx) => (
                      <View key={oIdx} style={styles.optionRow}>
                        <TouchableOpacity
                          style={[styles.radioCircle, q.correctIndex === oIdx && styles.radioCircleActive]}
                          onPress={() => {
                            const updated = [...quizQuestions];
                            updated[qIdx].correctIndex = oIdx;
                            setQuizQuestions(updated);
                          }}
                        >
                          {q.correctIndex === oIdx && <View style={styles.radioDot} />}
                        </TouchableOpacity>
                        <TextInput
                          style={[themedInputStyle, { flex: 1, marginBottom: 0 }]}
                          value={opt}
                          onChangeText={txt => {
                            const updated = [...quizQuestions];
                            updated[qIdx].options[oIdx] = txt;
                            setQuizQuestions(updated);
                          }}
                          placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                          placeholderTextColor={placeholderColor}
                        />
                      </View>
                    ))}

                    <TextInput
                      style={[themedInputStyle, { marginTop: 8 }]}
                      value={q.explanation}
                      onChangeText={txt => {
                        const updated = [...quizQuestions];
                        updated[qIdx].explanation = txt;
                        setQuizQuestions(updated);
                      }}
                      placeholder="Bible Verse Explanation / Answer Note"
                      placeholderTextColor={placeholderColor}
                    />
                  </View>
                ))}

                <TouchableOpacity
                  style={[styles.addPageBtn, { backgroundColor: secondarySurface, borderColor: '#3B82F6' }]}
                  onPress={() => {
                    setQuizQuestions([
                      ...quizQuestions,
                      {
                        id: `q${quizQuestions.length + 1}`,
                        questionEnglish: '',
                        questionTelugu: '',
                        options: ['', '', '', ''],
                        correctIndex: 0,
                        explanation: '',
                      },
                    ]);
                  }}
                >
                  <Plus size={14} color={accentBlue} />
                  <Text style={[styles.addPageBtnText, { color: accentBlue }]}>Add Another Question</Text>
                </TouchableOpacity>
              </ScrollView>

              <View style={[styles.editorActionsRow, { borderTopColor: borderColor }]}>
                <TouchableOpacity
                  style={[styles.cancelActionBtn, { backgroundColor: secondarySurface, borderColor, borderWidth: 1 }]}
                  onPress={() => setShowQuizModal(false)}
                >
                  <Text style={[styles.cancelActionText, { color: primaryText }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveActionBtn} onPress={handleSaveQuiz} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveActionText}>{editingQuizId ? 'Save Changes' : 'Publish Quiz'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* WORSHIP SONG CREATE / EDIT MODAL (FULL SCREEN SCROLLABLE)      */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <Modal visible={showSongModal} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setShowSongModal(false)}>
          <View style={[styles.container, { backgroundColor: screenBg, paddingTop: safeTop }]}>
            <StatusBar barStyle={barStyle} backgroundColor={screenBg} />
            {/* Top Header */}
            <View style={[styles.topHeader, { borderBottomColor: borderColor }]}>
              <TouchableOpacity
                onPress={() => setShowSongModal(false)}
                style={[styles.closeHeaderBtn, { backgroundColor: secondarySurface, borderColor }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={primaryText} />
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <Text style={[styles.headerTitle, { color: primaryText }]} numberOfLines={1}>
                  {editingSongId ? 'Edit Worship Song' : 'Add Worship Song'}
                </Text>
                <Text style={[styles.headerSubtitle, { color: secondaryText }]} numberOfLines={1}>
                  Action songs, bilingual lyrics, YouTube & audio
                </Text>
              </View>
              <View style={{ width: 36 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorFullScroll}>
              {/* Section 1: Titles & Category */}
              <View style={themedCardStyle}>
                <Text style={[styles.formSectionHeading, { color: accentBlue }]}>1. SONG TITLES & CATEGORY</Text>
                <Text style={[styles.formSectionHelper, { color: secondaryText }]}>
                  Enter the song title in English and Telugu, and select the song type for Sunday School children.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.inputMiniLabel, { color: primaryText }]}>English Song Title *</Text>
                  <TextInput
                    style={themedInputStyle}
                    value={songTitle}
                    onChangeText={setSongTitle}
                    placeholder="e.g. Read Your Bible, Pray Every Day / Father Abraham"
                    placeholderTextColor={placeholderColor}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.inputMiniLabel, { color: primaryText }]}>Telugu Song Title (తెలుగు పాట శీర్షిక)</Text>
                  <TextInput
                    style={themedInputStyle}
                    value={songTelugu}
                    onChangeText={setSongTelugu}
                    placeholder="e.g. బైబిల్ చదువు ప్రార్థన చేయి"
                    placeholderTextColor={placeholderColor}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.inputMiniLabel, { color: primaryText }]}>Song Category</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    {[
                      { key: 'action_song', label: 'Action Song' },
                      { key: 'praise', label: 'Praise & Worship' },
                      { key: 'hymn', label: 'Classic Hymn' },
                    ].map(c => (
                      <TouchableOpacity
                        key={c.key}
                        style={[
                          styles.categoryChip,
                          { backgroundColor: secondarySurface, borderColor },
                          songCategory === c.key && styles.categoryChipActive,
                        ]}
                        onPress={() => setSongCategory(c.key as any)}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.categoryChipText,
                            { color: secondaryText },
                            songCategory === c.key && styles.categoryChipTextActive,
                          ]}
                        >
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              {/* Section 2: Media Attachments */}
              <View style={themedCardStyle}>
                <Text style={[styles.formSectionHeading, { color: accentBlue }]}>2. MEDIA ATTACHMENTS (YOUTUBE / AUDIO / THUMBNAIL)</Text>
                <Text style={[styles.formSectionHelper, { color: secondaryText }]}>
                  Attach a YouTube video ID or full link, an MP3 audio track, or a colorful video thumbnail.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.inputMiniLabel, { color: primaryText }]}>YouTube Video ID or Link</Text>
                  <TextInput
                    style={themedInputStyle}
                    value={songVideoId}
                    onChangeText={setSongVideoId}
                    placeholder="e.g. AyKSwGvUbcY or https://youtu.be/..."
                    placeholderTextColor={placeholderColor}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.inputMiniLabel, { color: primaryText }]}>Audio Track & Custom Artwork</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity
                      style={[
                        styles.uploadImageBtn,
                        { flex: 1, backgroundColor: isDark ? '#1E3A8A' : 'rgba(37, 99, 235, 0.1)', borderColor: '#3B82F6' },
                      ]}
                      onPress={handlePickAudioFile}
                      activeOpacity={0.8}
                    >
                      <Upload size={14} color={accentBlue} />
                      <Text style={[styles.uploadImageBtnText, { color: accentBlue }]} numberOfLines={1}>
                        {songAudioName ? `Audio: ${songAudioName}` : 'Attach Audio (MP3)'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.uploadImageBtn,
                        { flex: 1, backgroundColor: isDark ? '#1E3A8A' : 'rgba(37, 99, 235, 0.1)', borderColor: '#3B82F6' },
                      ]}
                      onPress={handlePickSongThumbnail}
                      activeOpacity={0.8}
                    >
                      <Upload size={14} color={accentBlue} />
                      <Text style={[styles.uploadImageBtnText, { color: accentBlue }]} numberOfLines={1}>
                        {songThumbnailUrl ? 'Change Thumbnail' : 'Pick Thumbnail'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {songAudioName ? (
                    <View style={[styles.uploadedPreviewRow, { marginTop: 6 }]}>
                      <CheckCircle size={14} color="#10B981" />
                      <Text style={styles.uploadedSuccessText} numberOfLines={1}>Audio track linked: {songAudioName}</Text>
                      <TouchableOpacity onPress={() => { setSongAudioUrl(''); setSongAudioName(''); }} style={{ marginLeft: 'auto' }}>
                        <Text style={styles.removeImageText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {songThumbnailUrl ? (
                    <View style={[styles.uploadedPreviewRow, { marginTop: 6 }]}>
                      <CheckCircle size={14} color="#10B981" />
                      <Text style={styles.uploadedSuccessText} numberOfLines={1}>Custom thumbnail attached</Text>
                      <TouchableOpacity onPress={() => setSongThumbnailUrl('')} style={{ marginLeft: 'auto' }}>
                        <Text style={styles.removeImageText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* Section 3: Bilingual Lyrics */}
              <View style={themedCardStyle}>
                <Text style={[styles.formSectionHeading, { color: accentBlue }]}>3. BILINGUAL LYRICS</Text>
                <Text style={[styles.formSectionHelper, { color: secondaryText }]}>
                  Provide the lyrics with motion guides or verse lines for children and teachers.
                </Text>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.inputMiniLabel, { color: primaryText }]}>English Lyrics & Action Motions</Text>
                  <TextInput
                    style={[themedInputStyle, { height: 120, textAlignVertical: 'top' }]}
                    value={songLyricsEng}
                    onChangeText={setSongLyricsEng}
                    placeholder="English lyrics with action choreography (e.g. Clap hands, Jump up)..."
                    placeholderTextColor={placeholderColor}
                    multiline
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={[styles.inputMiniLabel, { color: primaryText }]}>Telugu Lyrics (తెలుగు పాట సాహిత్యం)</Text>
                  <TextInput
                    style={[themedInputStyle, { height: 120, textAlignVertical: 'top' }]}
                    value={songLyricsTel}
                    onChangeText={setSongLyricsTel}
                    placeholder="ఈ పాట యొక్క తెలుగు సాహిత్యం..."
                    placeholderTextColor={placeholderColor}
                    multiline
                  />
                </View>
              </View>

              {/* Section 4: Publishing Status */}
              <View style={[themedCardStyle, styles.toggleRowCard]}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={[styles.toggleTitle, { color: primaryText }]}>Publish to Rhema Kids App</Text>
                  <Text style={[styles.toggleDesc, { color: secondaryText }]}>
                    {songPublished
                      ? 'Live: Children and parents can sing along and practice actions immediately.'
                      : 'Draft: Saved privately for Sunday School teachers to review before release.'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.toggleBtn,
                    { backgroundColor: secondarySurface, borderColor },
                    songPublished && styles.toggleBtnActive,
                  ]}
                  onPress={() => setSongPublished(!songPublished)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.toggleBtnText, { color: secondaryText }, songPublished && styles.toggleBtnTextActive]}>
                    {songPublished ? 'Published' : 'Draft Only'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Bottom Actions Bar */}
            <View style={[styles.editorBottomBar, { backgroundColor: screenBg, borderTopColor: borderColor, paddingBottom: safeBottom }]}>
              <TouchableOpacity
                style={[styles.cancelActionBtn, { backgroundColor: secondarySurface, borderColor, borderWidth: 1 }]}
                onPress={() => setShowSongModal(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.cancelActionText, { color: primaryText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveActionBtn} onPress={handleSaveSong} disabled={saving} activeOpacity={0.85}>
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveActionText}>{editingSongId ? 'Save Changes' : 'Publish Song'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D', // Rich Navy Primary
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 10,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  hubBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  hubBadge: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  hubBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#93C5FD',
    letterSpacing: 0.8,
  },
  statsBadge: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statsBadgeText: {
    fontSize: 10.5,
    color: '#34D399',
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  closeHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  navBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  segmentedTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 6,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderRadius: 9,
  },
  tabActive: {
    backgroundColor: '#2563EB',
  },
  tabText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  createBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  searchBarBox: {
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    marginVertical: 10,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13.5,
    padding: 0,
  },
  contentScroll: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 10,
  },
  itemsGrid: {
    gap: 10,
  },
  contentCard: {
    backgroundColor: '#131C31',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardShadowLight: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 1,
  },
  emptyBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 28,
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
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
  cardCoverBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  cardTeluguTitle: {
    fontSize: 12,
    color: '#93C5FD',
    marginTop: 2,
  },
  cardRef: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  publishedPill: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
  },
  publishedPillText: {
    color: '#34D399',
  },
  draftPill: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  draftPillText: {
    color: '#F87171',
  },
  actionButtonsCol: {
    flexDirection: 'row',
    gap: 8,
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── EDITOR MODAL STYLES ──
  editorBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  editorCard: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: '92%',
    borderTopWidth: 1.5,
    borderColor: '#334155',
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  editorTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 1.2,
  },
  editorTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  editorCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorFormScroll: {
    paddingVertical: 14,
    gap: 12,
  },
  editorFullScroll: {
    padding: 16,
    paddingBottom: 110,
    gap: 14,
  },
  formCardSection: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 10,
  },
  formSectionHeading: {
    fontSize: 11,
    fontWeight: '800',
    color: '#60A5FA',
    letterSpacing: 1,
  },
  formSectionHelper: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16,
    marginTop: -4,
  },
  fieldGroup: {
    gap: 4,
  },
  formInput: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#FFFFFF',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputMiniLabel: {
    fontSize: 11,
    color: '#CBD5E1',
    fontWeight: '700',
  },
  coverRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  emojiInputBox: {
    width: 60,
    height: 48,
    textAlign: 'center',
    fontSize: 22,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  uploadImageBtn: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  uploadImageBtnText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '700',
  },
  uploadedPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(52, 211, 153, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
  },
  uploadedSuccessText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700',
  },
  removeImageText: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  noImageHint: {
    fontSize: 10.5,
    color: '#64748B',
    fontStyle: 'italic',
  },
  imagePreviewBox: {
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 4,
  },
  imagePreviewImg: {
    width: '100%',
    height: '100%',
  },
  pageCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FBBF24',
  },
  pageCard: {
    backgroundColor: '#162032',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#253349',
    gap: 10,
  },
  pageCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageNumBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pageNumBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FBBF24',
    letterSpacing: 0.8,
  },
  narrativeInput: {
    height: 80,
    textAlignVertical: 'top',
    fontSize: 12.5,
    lineHeight: 18,
  },
  addPageBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addPageBtnText: {
    color: '#93C5FD',
    fontSize: 12.5,
    fontWeight: '700',
  },
  toggleRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  toggleDesc: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 2,
    lineHeight: 14,
  },
  editorBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 12,
    color: '#E2E8F0',
    fontWeight: '700',
  },
  toggleBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  toggleBtnActive: {
    backgroundColor: '#065F46',
    borderColor: '#34D399',
  },
  toggleBtnText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
  },
  toggleBtnTextActive: {
    color: '#34D399',
  },
  editorActionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  cancelActionBtn: {
    flex: 1,
    height: 44,
    backgroundColor: '#334155',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelActionText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
  },
  saveActionBtn: {
    flex: 2,
    height: 44,
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  questionCard: {
    backgroundColor: '#162032',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#34D399',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34D399',
  },
  categoryChip: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  categoryChipActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#60A5FA',
  },
  categoryChipText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
