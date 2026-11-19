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
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import KidsMinistryService from '../../../../services/KidsMinistryService';
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
  const insets = useSafeAreaInsets();
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
    setStoryRef('Genesis 1');
    setStorySummary('');
    setStorySummaryTelugu('');
    setStoryEmoji('📖');
    setStoryCoverUrl('');
    setStoryPages([
      {
        pageNumber: 1,
        heading: 'Creation / సృష్టి',
        textEnglish: 'In the beginning God created the heavens and the earth.',
        textTelugu: 'ఆదియందు దేవుడు భూమ్యాకాశములను సృజించెను.',
        illustrationEmoji: '🌍',
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

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* ── TOP HEADER (FULL-SCREEN LMS/CMS) ── */}
        <View style={styles.topHeader}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <View style={styles.hubBadgeRow}>
              <View style={styles.hubBadge}>
                <BookOpen size={11} color="#93C5FD" />
                <Text style={styles.hubBadgeText}>BIBLE LEARNING CENTER</Text>
              </View>
              <View style={styles.statsBadge}>
                <Text style={styles.statsBadgeText}>
                  {stories.length}S · {quizzes.length}Q · {songs.length}M
                </Text>
              </View>
            </View>
            <Text style={styles.headerTitle}>Bible Learning Center</Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              Bilingual stories, interactive quizzes & praise songs
            </Text>
          </View>

          <TouchableOpacity onPress={onClose} style={styles.closeHeaderBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <X size={18} color="#94A3B8" />
          </TouchableOpacity>
        </View>

        {/* ── SEGMENT TABS (STORIES / QUIZZES / SONGS) ── */}
        <View style={styles.navBar}>
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'stories' && styles.tabActive]}
              onPress={() => setActiveTab('stories')}
            >
              <BookOpen size={15} color={activeTab === 'stories' ? '#FFFFFF' : '#94A3B8'} />
              <Text style={[styles.tabText, activeTab === 'stories' && styles.tabTextActive]}>
                Stories ({stories.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'quizzes' && styles.tabActive]}
              onPress={() => setActiveTab('quizzes')}
            >
              <Award size={15} color={activeTab === 'quizzes' ? '#FFFFFF' : '#94A3B8'} />
              <Text style={[styles.tabText, activeTab === 'quizzes' && styles.tabTextActive]}>
                Quizzes ({quizzes.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'songs' && styles.tabActive]}
              onPress={() => setActiveTab('songs')}
            >
              <Music size={15} color={activeTab === 'songs' ? '#FFFFFF' : '#94A3B8'} />
              <Text style={[styles.tabText, activeTab === 'songs' && styles.tabTextActive]}>
                Songs ({songs.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Create Button depending on active tab */}
          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => {
              if (activeTab === 'stories') openNewStoryForm();
              else if (activeTab === 'quizzes') openNewQuizForm();
              else openNewSongForm();
            }}
            activeOpacity={0.88}
          >
            <Plus size={16} color="#FFFFFF" strokeWidth={2.6} />
            <Text style={styles.createBtnText}>
              {activeTab === 'stories' ? 'New Story' : activeTab === 'quizzes' ? 'New Quiz' : 'New Song'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── SEARCH BAR ── */}
        <View style={styles.searchBarBox}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={`Search ${activeTab}...`}
            placeholderTextColor="#64748B"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* ── BODY LIST ── */}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentScroll}>
          {/* STORIES TAB */}
          {activeTab === 'stories' && (
            <View style={styles.itemsGrid}>
              {filteredStories.map(s => (
                <View key={s.id} style={styles.contentCard}>
                  <View style={styles.cardCoverBox}>
                    {s.coverImageUrl ? (
                      <Image source={{ uri: s.coverImageUrl }} style={styles.cardImage} />
                    ) : (
                      <Text style={{ fontSize: 20 }}>{s.coverEmoji || '📖'}</Text>
                    )}
                  </View>

                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{s.title}</Text>
                      <View style={[styles.statusPill, s.isPublished !== false ? styles.publishedPill : styles.draftPill]}>
                        <Text style={[styles.statusPillText, s.isPublished !== false ? styles.publishedPillText : styles.draftPillText]}>
                          {s.isPublished !== false ? 'Live' : 'Draft'}
                        </Text>
                      </View>
                    </View>
                    {s.titleTelugu ? <Text style={styles.cardTeluguTitle} numberOfLines={1}>{s.titleTelugu}</Text> : null}
                    <Text style={styles.cardRef}>{s.scriptureRef || 'Genesis'} · {s.pages?.length || 1} Pages</Text>
                  </View>

                  <View style={styles.actionButtonsCol}>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => openEditStoryForm(s)}
                    >
                      <Edit3 size={14} color="#3B82F6" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteStory(s.id, s.title)}
                    >
                      <Trash2 size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* QUIZZES TAB */}
          {activeTab === 'quizzes' && (
            <View style={styles.itemsGrid}>
              {filteredQuizzes.map(q => (
                <View key={q.id} style={styles.contentCard}>
                  <View style={[styles.cardCoverBox, { backgroundColor: 'rgba(251, 191, 36, 0.15)' }]}>
                    <Text style={{ fontSize: 20 }}>{q.coverEmoji || '🏆'}</Text>
                  </View>

                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{q.title}</Text>
                      <View style={[styles.statusPill, q.isPublished !== false ? styles.publishedPill : styles.draftPill]}>
                        <Text style={[styles.statusPillText, q.isPublished !== false ? styles.publishedPillText : styles.draftPillText]}>
                          {q.isPublished !== false ? 'Active' : 'Draft'}
                        </Text>
                      </View>
                    </View>
                    {q.titleTelugu ? <Text style={styles.cardTeluguTitle} numberOfLines={1}>{q.titleTelugu}</Text> : null}
                    <Text style={styles.cardRef}>
                      {q.questions?.length || 0} Qs · +{q.pointsReward || 50} pts
                    </Text>
                  </View>

                  <View style={styles.actionButtonsCol}>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => openEditQuizForm(q)}
                    >
                      <Edit3 size={14} color="#3B82F6" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteQuiz(q.id, q.title)}
                    >
                      <Trash2 size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* SONGS TAB */}
          {activeTab === 'songs' && (
            <View style={styles.itemsGrid}>
              {filteredSongs.map(song => (
                <View key={song.id} style={styles.contentCard}>
                  <View style={[styles.cardCoverBox, { backgroundColor: 'rgba(244, 114, 182, 0.15)' }]}>
                    {song.thumbnailUrl ? (
                      <Image source={{ uri: song.thumbnailUrl }} style={styles.cardImage} />
                    ) : (
                      <Text style={{ fontSize: 20 }}>{song.coverEmoji || '🎵'}</Text>
                    )}
                  </View>

                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <View style={styles.cardTitleRow}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{song.title}</Text>
                      <View style={[styles.statusPill, song.isPublished !== false ? styles.publishedPill : styles.draftPill]}>
                        <Text style={[styles.statusPillText, song.isPublished !== false ? styles.publishedPillText : styles.draftPillText]}>
                          {song.isPublished !== false ? 'Ready' : 'Draft'}
                        </Text>
                      </View>
                    </View>
                    {song.titleTelugu ? <Text style={styles.cardTeluguTitle} numberOfLines={1}>{song.titleTelugu}</Text> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
                      <Video size={10} color="#EF4444" />
                      <Text style={styles.cardRef}>ID: {song.youtubeVideoId || 'N/A'}</Text>
                      {song.audioUrl ? (
                        <Text style={[styles.cardRef, { color: '#34D399' }]}>· MP3</Text>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.actionButtonsCol}>
                    <TouchableOpacity
                      style={styles.editBtn}
                      onPress={() => openEditSongForm(song)}
                    >
                      <Edit3 size={14} color="#3B82F6" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteSong(song.id, song.title)}
                    >
                      <Trash2 size={14} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* STORY CREATE / EDIT MODAL                                    */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <Modal visible={showStoryModal} animationType="slide" transparent onRequestClose={() => setShowStoryModal(false)}>
          <View style={styles.editorBackdrop}>
            <View style={styles.editorCard}>
              <View style={styles.editorHeader}>
                <View>
                  <Text style={styles.editorTag}>ILLUSTRATED BIBLE STORY</Text>
                  <Text style={styles.editorTitle}>{editingStoryId ? 'Edit Bible Story' : 'Create New Story'}</Text>
                </View>
                <TouchableOpacity onPress={() => setShowStoryModal(false)} style={styles.editorCloseBtn}>
                  <X size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorFormScroll}>
                <Text style={styles.formSectionHeading}>1. TITLES & SCRIPTURE REFERENCE</Text>
                <TextInput
                  style={styles.formInput}
                  value={storyTitle}
                  onChangeText={setStoryTitle}
                  placeholder="English Story Title (e.g. David and Goliath)"
                  placeholderTextColor="#64748B"
                />
                <TextInput
                  style={styles.formInput}
                  value={storyTelugu}
                  onChangeText={setStoryTelugu}
                  placeholder="Telugu Story Title (e.g. దావీదు మరియు గొల్యాతు)"
                  placeholderTextColor="#64748B"
                />
                <TextInput
                  style={styles.formInput}
                  value={storyRef}
                  onChangeText={setStoryRef}
                  placeholder="Scripture Reference (e.g. 1 Samuel 17:1-50)"
                  placeholderTextColor="#64748B"
                />

                <Text style={styles.formSectionHeading}>2. COVER EMOJI & ILLUSTRATION</Text>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <TextInput
                    style={[styles.formInput, { width: 70, textAlign: 'center', fontSize: 20 }]}
                    value={storyEmoji}
                    onChangeText={setStoryEmoji}
                    maxLength={2}
                  />
                  <TouchableOpacity style={styles.uploadImageBtn} onPress={handlePickStoryCover}>
                    <Upload size={14} color="#93C5FD" />
                    <Text style={styles.uploadImageBtnText}>
                      {storyCoverUrl ? 'Change Cover Image' : 'Upload Illustration'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.formSectionHeading}>3. BILINGUAL NARRATIVE PAGES</Text>
                {storyPages.map((page, idx) => (
                  <View key={idx} style={styles.pageCard}>
                    <Text style={styles.pageCardTitle}>Page {idx + 1}</Text>
                    <TextInput
                      style={styles.formInput}
                      value={page.heading}
                      onChangeText={txt => {
                        const updated = [...storyPages];
                        updated[idx].heading = txt;
                        setStoryPages(updated);
                      }}
                      placeholder="Page Heading (English / Telugu)"
                      placeholderTextColor="#64748B"
                    />
                    <TextInput
                      style={[styles.formInput, { height: 70, textAlignVertical: 'top' }]}
                      value={page.textEnglish}
                      onChangeText={txt => {
                        const updated = [...storyPages];
                        updated[idx].textEnglish = txt;
                        setStoryPages(updated);
                      }}
                      placeholder="English story narrative for this page..."
                      placeholderTextColor="#64748B"
                      multiline
                    />
                    <TextInput
                      style={[styles.formInput, { height: 70, textAlignVertical: 'top' }]}
                      value={page.textTelugu}
                      onChangeText={txt => {
                        const updated = [...storyPages];
                        updated[idx].textTelugu = txt;
                        setStoryPages(updated);
                      }}
                      placeholder="తెలుగు వివరణ..."
                      placeholderTextColor="#64748B"
                      multiline
                    />
                  </View>
                ))}

                <TouchableOpacity
                  style={styles.addPageBtn}
                  onPress={() => {
                    setStoryPages([
                      ...storyPages,
                      {
                        pageNumber: storyPages.length + 1,
                        heading: `Part ${storyPages.length + 1}`,
                        textEnglish: '',
                        textTelugu: '',
                        illustrationEmoji: '📖',
                      },
                    ]);
                  }}
                >
                  <Plus size={14} color="#93C5FD" />
                  <Text style={styles.addPageBtnText}>Add Another Story Page</Text>
                </TouchableOpacity>

                {/* Publish Toggle */}
                <View style={styles.toggleRow}>
                  <Text style={styles.toggleLabel}>Publish to Kids Bible Reader App:</Text>
                  <TouchableOpacity
                    style={[styles.toggleBtn, storyPublished && styles.toggleBtnActive]}
                    onPress={() => setStoryPublished(!storyPublished)}
                  >
                    <Text style={[styles.toggleBtnText, storyPublished && styles.toggleBtnTextActive]}>
                      {storyPublished ? 'Published' : 'Draft Only'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>

              <View style={styles.editorActionsRow}>
                <TouchableOpacity style={styles.cancelActionBtn} onPress={() => setShowStoryModal(false)}>
                  <Text style={styles.cancelActionText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveActionBtn} onPress={handleSaveStory} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveActionText}>{editingStoryId ? 'Save Changes' : 'Publish Story'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* QUIZ CREATE / EDIT MODAL                                     */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <Modal visible={showQuizModal} animationType="slide" transparent onRequestClose={() => setShowQuizModal(false)}>
          <View style={styles.editorBackdrop}>
            <View style={styles.editorCard}>
              <View style={styles.editorHeader}>
                <View>
                  <Text style={styles.editorTag}>INTERACTIVE BIBLE QUIZ</Text>
                  <Text style={styles.editorTitle}>{editingQuizId ? 'Edit Quiz' : 'Create New Bible Quiz'}</Text>
                </View>
                <TouchableOpacity onPress={() => setShowQuizModal(false)} style={styles.editorCloseBtn}>
                  <X size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorFormScroll}>
                <Text style={styles.formSectionHeading}>1. QUIZ OVERVIEW</Text>
                <TextInput
                  style={styles.formInput}
                  value={quizTitle}
                  onChangeText={setQuizTitle}
                  placeholder="Quiz Title (e.g. Life of Moses Quiz)"
                  placeholderTextColor="#64748B"
                />
                <TextInput
                  style={styles.formInput}
                  value={quizTelugu}
                  onChangeText={setQuizTelugu}
                  placeholder="Telugu Title (e.g. మోషే జీవిత చరిత్ర క్విజ్)"
                  placeholderTextColor="#64748B"
                />
                <TextInput
                  style={styles.formInput}
                  value={quizRef}
                  onChangeText={setQuizRef}
                  placeholder="Scripture Reference (e.g. Exodus 1-14)"
                  placeholderTextColor="#64748B"
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputMiniLabel}>Star Points Reward</Text>
                    <TextInput
                      style={styles.formInput}
                      value={quizReward}
                      onChangeText={setQuizReward}
                      keyboardType="numeric"
                      placeholder="50"
                      placeholderTextColor="#64748B"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputMiniLabel}>Badge Title</Text>
                    <TextInput
                      style={styles.formInput}
                      value={quizBadge}
                      onChangeText={setQuizBadge}
                      placeholder="Torah Champion"
                      placeholderTextColor="#64748B"
                    />
                  </View>
                </View>

                <Text style={styles.formSectionHeading}>2. MULTIPLE CHOICE QUESTIONS</Text>
                {quizQuestions.map((q, qIdx) => (
                  <View key={qIdx} style={styles.questionCard}>
                    <Text style={styles.pageCardTitle}>Question {qIdx + 1}</Text>
                    <TextInput
                      style={styles.formInput}
                      value={q.questionEnglish}
                      onChangeText={txt => {
                        const updated = [...quizQuestions];
                        updated[qIdx].questionEnglish = txt;
                        setQuizQuestions(updated);
                      }}
                      placeholder="Question in English..."
                      placeholderTextColor="#64748B"
                    />
                    <TextInput
                      style={styles.formInput}
                      value={q.questionTelugu}
                      onChangeText={txt => {
                        const updated = [...quizQuestions];
                        updated[qIdx].questionTelugu = txt;
                        setQuizQuestions(updated);
                      }}
                      placeholder="ప్రశ్న తెలుగులో..."
                      placeholderTextColor="#64748B"
                    />

                    <Text style={[styles.inputMiniLabel, { marginTop: 6 }]}>
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
                          style={[styles.formInput, { flex: 1, marginBottom: 0 }]}
                          value={opt}
                          onChangeText={txt => {
                            const updated = [...quizQuestions];
                            updated[qIdx].options[oIdx] = txt;
                            setQuizQuestions(updated);
                          }}
                          placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                          placeholderTextColor="#64748B"
                        />
                      </View>
                    ))}

                    <TextInput
                      style={[styles.formInput, { marginTop: 8 }]}
                      value={q.explanation}
                      onChangeText={txt => {
                        const updated = [...quizQuestions];
                        updated[qIdx].explanation = txt;
                        setQuizQuestions(updated);
                      }}
                      placeholder="Bible Verse Explanation / Answer Note"
                      placeholderTextColor="#64748B"
                    />
                  </View>
                ))}

                <TouchableOpacity
                  style={styles.addPageBtn}
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
                  <Plus size={14} color="#93C5FD" />
                  <Text style={styles.addPageBtnText}>Add Another Question</Text>
                </TouchableOpacity>
              </ScrollView>

              <View style={styles.editorActionsRow}>
                <TouchableOpacity style={styles.cancelActionBtn} onPress={() => setShowQuizModal(false)}>
                  <Text style={styles.cancelActionText}>Cancel</Text>
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
        {/* WORSHIP SONG CREATE / EDIT MODAL                             */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <Modal visible={showSongModal} animationType="slide" transparent onRequestClose={() => setShowSongModal(false)}>
          <View style={styles.editorBackdrop}>
            <View style={styles.editorCard}>
              <View style={styles.editorHeader}>
                <View>
                  <Text style={styles.editorTag}>WORSHIP & PRAISE SONGS</Text>
                  <Text style={styles.editorTitle}>{editingSongId ? 'Edit Worship Song' : 'Add Worship Song'}</Text>
                </View>
                <TouchableOpacity onPress={() => setShowSongModal(false)} style={styles.editorCloseBtn}>
                  <X size={18} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.editorFormScroll}>
                <Text style={styles.formSectionHeading}>1. SONG TITLES & CATEGORY</Text>
                <TextInput
                  style={styles.formInput}
                  value={songTitle}
                  onChangeText={setSongTitle}
                  placeholder="Song Title (e.g. Read Your Bible, Pray Every Day)"
                  placeholderTextColor="#64748B"
                />
                <TextInput
                  style={styles.formInput}
                  value={songTelugu}
                  onChangeText={setSongTelugu}
                  placeholder="Telugu Title (e.g. బైబిల్ చదువు ప్రార్థన చేయి)"
                  placeholderTextColor="#64748B"
                />

                <Text style={styles.inputMiniLabel}>Song Category</Text>
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                  {[
                    { key: 'action_song', label: 'Action Song' },
                    { key: 'praise', label: 'Praise & Worship' },
                    { key: 'hymn', label: 'Classic Hymn' },
                  ].map(c => (
                    <TouchableOpacity
                      key={c.key}
                      style={[styles.categoryChip, songCategory === c.key && styles.categoryChipActive]}
                      onPress={() => setSongCategory(c.key as any)}
                    >
                      <Text style={[styles.categoryChipText, songCategory === c.key && styles.categoryChipTextActive]}>
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.formSectionHeading}>2. MEDIA ATTACHMENTS (YOUTUBE / AUDIO / THUMBNAIL)</Text>
                <TextInput
                  style={styles.formInput}
                  value={songVideoId}
                  onChangeText={setSongVideoId}
                  placeholder="YouTube Video ID or Full URL (e.g. AyKSwGvUbcY)"
                  placeholderTextColor="#64748B"
                />

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  <TouchableOpacity style={[styles.uploadImageBtn, { flex: 1 }]} onPress={handlePickAudioFile}>
                    <Upload size={14} color="#93C5FD" />
                    <Text style={styles.uploadImageBtnText} numberOfLines={1}>
                      {songAudioName ? `Audio: ${songAudioName}` : 'Attach Audio (MP3)'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[styles.uploadImageBtn, { flex: 1 }]} onPress={handlePickSongThumbnail}>
                    <Upload size={14} color="#93C5FD" />
                    <Text style={styles.uploadImageBtnText} numberOfLines={1}>
                      {songThumbnailUrl ? 'Thumbnail Added' : 'Custom Thumbnail'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.formSectionHeading}>3. BILINGUAL LYRICS</Text>
                <TextInput
                  style={[styles.formInput, { height: 90, textAlignVertical: 'top' }]}
                  value={songLyricsEng}
                  onChangeText={setSongLyricsEng}
                  placeholder="English lyrics with actions or verse lines..."
                  placeholderTextColor="#64748B"
                  multiline
                />
                <TextInput
                  style={[styles.formInput, { height: 90, textAlignVertical: 'top' }]}
                  value={songLyricsTel}
                  onChangeText={setSongLyricsTel}
                  placeholder="తెలుగు పాట సాహిత్యం..."
                  placeholderTextColor="#64748B"
                  multiline
                />
              </ScrollView>

              <View style={styles.editorActionsRow}>
                <TouchableOpacity style={styles.cancelActionBtn} onPress={() => setShowSongModal(false)}>
                  <Text style={styles.cancelActionText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveActionBtn} onPress={handleSaveSong} disabled={saving}>
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.saveActionText}>{editingSongId ? 'Save Changes' : 'Publish Song'}</Text>
                  )}
                </TouchableOpacity>
              </View>
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
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  hubBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  hubBadge: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hubBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#93C5FD',
    letterSpacing: 0.8,
  },
  statsBadge: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  statsBadgeText: {
    fontSize: 9.5,
    color: '#34D399',
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  closeHeaderBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    gap: 8,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tabActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  tabText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  createBtn: {
    backgroundColor: '#1E40AF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  createBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  searchBarBox: {
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12,
    padding: 0,
  },
  contentScroll: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 8,
  },
  itemsGrid: {
    gap: 8,
  },
  contentCard: {
    backgroundColor: '#131C31',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardCoverBox: {
    width: 38,
    height: 38,
    borderRadius: 8,
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
    gap: 6,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  cardTeluguTitle: {
    fontSize: 11,
    color: '#93C5FD',
    marginTop: 1,
  },
  cardRef: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 1,
  },
  statusPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  statusPillText: {
    fontSize: 9,
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
    gap: 6,
  },
  editBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
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
  formSectionHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#93C5FD',
    letterSpacing: 1,
    marginTop: 8,
  },
  formInput: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#FFFFFF',
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  inputMiniLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '700',
    marginBottom: 4,
  },
  uploadImageBtn: {
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  uploadImageBtnText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '700',
  },
  pageCard: {
    backgroundColor: '#162032',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  pageCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FBBF24',
  },
  addPageBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 10,
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
    fontSize: 12,
    fontWeight: '700',
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
