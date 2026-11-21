import React, { useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
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
  ArrowLeft,
  Save,
  Send,
  Image as ImageIcon,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import KidsMinistryService from '../../../../services/KidsMinistryService';
import { useAdminTheme } from '../../../../utils/adminThemeHelper';
import {
  KidsBibleStory,
  KidsQuiz,
  KidsWorshipSong,
  KidsQuizQuestion,
} from '../../../../types/KidsMinistryTypes';
import BibleStoryReaderContent, {
  getFullStoryContent,
  getFullStoryTeluguContent,
  estimateStoryReadTime,
} from '../../../kids_ministry/components/BibleStoryReaderContent';
import KidsQuizDocumentService, {
  MAX_KIDS_QUIZ_QUESTIONS,
  estimateQuizMinutes,
} from '../../../../services/KidsQuizDocumentService';
import { KidsQuizExperienceView } from '../../../kids_ministry/components/KidsQuizPlayerModal';

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

  // ── STORY STATE & FORM (SINGLE-PAGE EDITOR) ──
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
  const [editingStorySource, setEditingStorySource] = useState<KidsBibleStory | null>(null);
  const [storyTitle, setStoryTitle] = useState('');
  const [storyTelugu, setStoryTelugu] = useState('');
  const [storyRef, setStoryRef] = useState('');
  const [storyEmoji, setStoryEmoji] = useState('📖');
  const [storyCoverUrl, setStoryCoverUrl] = useState('');
  const [storyContent, setStoryContent] = useState('');
  const [storyTeluguContent, setStoryTeluguContent] = useState('');
  const [storyPublished, setStoryPublished] = useState(true);
  const [storyPreviewMode, setStoryPreviewMode] = useState(false);
  const storyScrollRef = useRef<ScrollView>(null);

  // ── QUIZ STATE & FORM (DOC UPLOAD + MANUAL + 16:9 THUMBNAIL + PREVIEW) ──
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [quizCreationMode, setQuizCreationMode] = useState<'document' | 'manual'>('document');
  const [quizPreviewMode, setQuizPreviewMode] = useState(false);
  const [quizTitle, setQuizTitle] = useState('');
  const [quizTelugu, setQuizTelugu] = useState('');
  const [quizRef, setQuizRef] = useState('');
  const [quizThumbnailUrl, setQuizThumbnailUrl] = useState('');
  const [quizSourceDocName, setQuizSourceDocName] = useState('');
  const [quizReward, setQuizReward] = useState('50');
  const [quizBadge, setQuizBadge] = useState('Bible Star');
  const [quizEmoji, setQuizEmoji] = useState('🏆');
  const [quizDifficulty, setQuizDifficulty] = useState<'beginner' | 'intermediate' | 'advanced'>('beginner');
  const [quizPublished, setQuizPublished] = useState(true);
  const [extractingDoc, setExtractingDoc] = useState(false);
  const [translatingQIdx, setTranslatingQIdx] = useState<number | null>(null);
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
    setEditingStorySource(null);
    setStoryTitle('');
    setStoryTelugu('');
    setStoryRef('');
    setStoryEmoji('📖');
    setStoryCoverUrl('');
    setStoryContent('');
    setStoryTeluguContent('');
    setStoryPublished(false);
    setStoryPreviewMode(false);
    setShowStoryModal(true);
  };

  const openEditStoryForm = (s: KidsBibleStory) => {
    setEditingStoryId(s.id);
    setEditingStorySource(s);
    setStoryTitle(s.title || '');
    setStoryTelugu(s.titleTelugu && s.titleTelugu !== s.title ? s.titleTelugu : '');
    setStoryRef(s.scriptureRef || '');
    setStoryEmoji(s.coverEmoji || '📖');
    setStoryCoverUrl(s.coverImageUrl || '');
    setStoryContent(getFullStoryContent(s));
    const telText = getFullStoryTeluguContent(s);
    setStoryTeluguContent(telText && telText !== getFullStoryContent(s) ? telText : '');
    setStoryPublished(s.isPublished ?? true);
    setStoryPreviewMode(false);
    setShowStoryModal(true);
  };

  const pick16x9Thumbnail = async (onSelected: (uri: string) => void) => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.85,
      });
      if (!res.canceled && res.assets && res.assets[0]?.uri) {
        const asset = res.assets[0];
        if (asset.width && asset.height) {
          const ratio = asset.width / asset.height;
          if (Math.abs(ratio - 16 / 9) > 0.14) {
            Alert.alert(
              '16:9 Aspect Ratio Required',
              'Please crop the thumbnail using the 16:9 widescreen frame so it displays cleanly across Admin and Member views.'
            );
            return;
          }
        }
        onSelected(asset.uri);
      }
    } catch (err: any) {
      Alert.alert('Image Picker Error', err?.message || 'Could not pick image');
    }
  };

  const handlePickStoryCover = () => pick16x9Thumbnail(uri => setStoryCoverUrl(uri));

  const persistStory = async (publishNow: boolean) => {
    const trimmedTitle = storyTitle.trim();
    const trimmedContent = storyContent.trim();
    const trimmedCover = storyCoverUrl.trim();
    const trimmedTeluguContent = storyTeluguContent.trim();

    if (!trimmedTitle) {
      Alert.alert('Title Required', 'Please enter the Bible Story title.');
      return;
    }
    if (!trimmedCover) {
      Alert.alert(
        '16:9 Thumbnail Required',
        'Please upload a 16:9 widescreen thumbnail image for this Bible story.'
      );
      return;
    }
    if (publishNow && !trimmedContent) {
      Alert.alert('Content Required', 'Please enter the complete Bible story content before publishing.');
      return;
    }

    try {
      setSaving(true);
      const uploadedCoverUrl = await KidsMinistryService.uploadStoryThumbnail(
        churchId,
        trimmedCover
      );
      setStoryCoverUrl(uploadedCoverUrl);

      const readTime = estimateStoryReadTime(trimmedContent || trimmedTitle);
      const summarySnippet =
        trimmedContent.length > 180
          ? `${trimmedContent.slice(0, 177).trimEnd()}...`
          : trimmedContent || trimmedTitle;

      const payload: Partial<KidsBibleStory> = {
        title: trimmedTitle,
        titleTelugu: storyTelugu.trim() || trimmedTitle,
        scriptureRef: storyRef.trim(),
        theme: editingStorySource?.theme || 'Bible Story',
        coverEmoji: storyEmoji.trim() || '📖',
        coverImageUrl: uploadedCoverUrl || undefined,
        readTime,
        summary: summarySnippet,
        summaryTelugu:
          editingStorySource?.summaryTelugu ||
          (trimmedTeluguContent ? trimmedTeluguContent.slice(0, 180) : summarySnippet),
        storyContent: trimmedContent,
        storyContentTelugu: trimmedTeluguContent || undefined,
        pages: [
          {
            pageNumber: 1,
            heading: '',
            textEnglish: trimmedContent,
            textTelugu: trimmedTeluguContent,
            illustrationEmoji: storyEmoji.trim() || '📖',
            imageUrl: uploadedCoverUrl || undefined,
          },
        ],
        reflectionQuestions: editingStorySource?.reflectionQuestions || [
          {
            questionEnglish: 'What important truth did we learn from this Bible story?',
            questionTelugu: 'ఈ బైబిల్ కథ నుండి మనం ఏమి ముఖ్యమైన పాఠం నేర్చుకున్నాము?',
          },
        ],
        isPublished: publishNow,
      };

      setStoryPublished(publishNow);

      if (editingStoryId) {
        await KidsMinistryService.updateStory(churchId, editingStoryId, payload);
      } else {
        const createdId = await KidsMinistryService.createStory(churchId, {
          storyId: `STORY-${Date.now().toString().slice(-4)}`,
          ...payload,
        });
        setEditingStoryId(createdId);
      }

      if (publishNow) {
        Alert.alert(
          'Story Published!',
          `"${trimmedTitle}" is now live in Member View with its 16:9 thumbnail.`
        );
        setShowStoryModal(false);
      } else {
        Alert.alert(
          'Story Saved',
          `"${trimmedTitle}" has been saved as a draft. Tap Publish whenever ready for members.`
        );
      }
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
  // QUIZ ACTIONS (DOC EXTRACTION + MANUAL + PREVIEW + SAVE/PUBLISH)
  // ──────────────────────────────────────────
  const makeBlankQuizQuestion = (index: number): KidsQuizQuestion => ({
    id: `q${index + 1}_${Date.now().toString().slice(-4)}`,
    questionEnglish: '',
    questionTelugu: '',
    options: ['', '', '', ''],
    optionsTelugu: ['', '', '', ''],
    correctIndex: 0,
    explanation: '',
    explanationTelugu: '',
  });

  const openNewQuizForm = () => {
    setEditingQuizId(null);
    setQuizCreationMode('document');
    setQuizPreviewMode(false);
    setQuizTitle('');
    setQuizTelugu('');
    setQuizRef('');
    setQuizThumbnailUrl('');
    setQuizSourceDocName('');
    setQuizReward('50');
    setQuizBadge('Bible Star');
    setQuizEmoji('🏆');
    setQuizDifficulty('beginner');
    setQuizPublished(false);
    setQuizQuestions([makeBlankQuizQuestion(0)]);
    setShowQuizModal(true);
  };

  const openEditQuizForm = (q: KidsQuiz) => {
    setEditingQuizId(q.id);
    setQuizCreationMode('manual');
    setQuizPreviewMode(false);
    setQuizTitle(q.title);
    setQuizTelugu(q.titleTelugu && q.titleTelugu !== q.title ? q.titleTelugu : '');
    setQuizRef(q.scriptureRef || '');
    setQuizThumbnailUrl(q.thumbnailUrl || '');
    setQuizSourceDocName(q.sourceDocumentName || '');
    setQuizReward(String(q.pointsReward || 50));
    setQuizBadge(q.badgeReward || 'Bible Star');
    setQuizEmoji(q.coverEmoji || '🏆');
    setQuizDifficulty(q.difficulty || 'beginner');
    setQuizPublished(q.isPublished ?? true);
    const normalized = (q.questions && q.questions.length > 0
      ? q.questions.slice(0, MAX_KIDS_QUIZ_QUESTIONS)
      : [makeBlankQuizQuestion(0)]
    ).map((item, idx) => ({
      ...item,
      id: item.id || `q${idx + 1}`,
      options:
        item.options && item.options.length >= 2
          ? [...item.options]
          : ['', '', '', ''],
      optionsTelugu:
        item.optionsTelugu && item.optionsTelugu.length === (item.options?.length || 4)
          ? [...item.optionsTelugu]
          : (item.options || ['', '', '', '']).map((_, i) => item.optionsTelugu?.[i] || ''),
      correctIndex:
        typeof item.correctIndex === 'number' &&
        item.correctIndex >= 0 &&
        item.correctIndex < (item.options?.length || 4)
          ? item.correctIndex
          : 0,
    }));
    setQuizQuestions(normalized);
    setShowQuizModal(true);
  };

  const handlePickQuizCover = () => pick16x9Thumbnail(uri => setQuizThumbnailUrl(uri));

  const handleUploadQuizDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets || !res.assets[0]) return;
      const asset = res.assets[0];
      setExtractingDoc(true);
      const draft = await KidsQuizDocumentService.extractAndTranslateQuizDocument({
        uri: asset.uri,
        name: asset.name || 'quiz.pdf',
        mimeType: asset.mimeType || undefined,
      });
      if (!quizTitle.trim()) setQuizTitle(draft.title);
      if (!quizTelugu.trim()) setQuizTelugu(draft.titleTelugu);
      if (!quizRef.trim() && draft.scriptureRef) setQuizRef(draft.scriptureRef);
      setQuizSourceDocName(draft.sourceDocumentName);
      setQuizQuestions(draft.questions.slice(0, MAX_KIDS_QUIZ_QUESTIONS));
      Alert.alert(
        'Questions Extracted! Review Before Publishing',
        `Extracted ${draft.questions.length} bilingual (English & Telugu) questions from "${draft.sourceDocumentName}".\n\nPlease review questions, options, and correct answers below, then upload a 16:9 thumbnail and publish.`
      );
    } catch (err: any) {
      Alert.alert(
        'Document Extraction Failed',
        err?.message || 'Could not extract quiz questions from this PDF/DOCX file.'
      );
    } finally {
      setExtractingDoc(false);
    }
  };

  const handleTranslateQuestion = async (qIdx: number) => {
    const q = quizQuestions[qIdx];
    if (!q || !q.questionEnglish.trim()) {
      Alert.alert('Enter Question First', 'Please type the English question before translating.');
      return;
    }
    try {
      setTranslatingQIdx(qIdx);
      const translated = await KidsQuizDocumentService.translateQuestionToTelugu(q);
      setQuizQuestions(prev => prev.map((item, i) => (i === qIdx ? translated : item)));
    } catch (err: any) {
      Alert.alert('Translation Error', err?.message || 'Could not translate question to Telugu.');
    } finally {
      setTranslatingQIdx(null);
    }
  };

  const buildPreviewQuizObject = (): KidsQuiz => ({
    id: editingQuizId || 'preview_quiz',
    quizId: 'PREVIEW',
    churchId,
    title: quizTitle.trim() || 'Bible Quiz Preview',
    titleTelugu: quizTelugu.trim() || quizTitle.trim() || 'బైబిల్ క్విజ్',
    scriptureRef: quizRef.trim() || 'Bible Quiz',
    pointsReward: parseInt(quizReward, 10) || 50,
    badgeReward: quizBadge.trim() || 'Bible Star',
    coverEmoji: quizEmoji.trim() || '🏆',
    thumbnailUrl: quizThumbnailUrl.trim() || undefined,
    estimatedMinutes: Math.max(2, Math.ceil(quizQuestions.length * 0.5)),
    sourceDocumentName: quizSourceDocName || undefined,
    difficulty: quizDifficulty,
    isPublished: quizPublished,
    questions: quizQuestions,
    createdAt: Date.now(),
  });

  const persistQuiz = async (publishNow: boolean) => {
    const trimmedTitle = quizTitle.trim();
    if (!trimmedTitle) {
      Alert.alert('Title Required', 'Please enter a Quiz Title.');
      return;
    }

    const validQuestions = quizQuestions
      .slice(0, MAX_KIDS_QUIZ_QUESTIONS)
      .filter(q => q.questionEnglish.trim().length > 0 && q.options.some(o => o.trim().length > 0));

    if (validQuestions.length === 0) {
      Alert.alert(
        'Questions Required',
        'Please upload a quiz document or add at least 1 question with answer options.'
      );
      return;
    }

    if (publishNow && !quizThumbnailUrl.trim()) {
      Alert.alert(
        '16:9 Thumbnail Required',
        'Please upload a 16:9 thumbnail image for this Bible quiz before publishing.'
      );
      return;
    }

    // Validate every question has >= 2 non-empty options and valid correctIndex
    const cleanedQuestions: KidsQuizQuestion[] = validQuestions.map((q, idx) => {
      const pairs = (q.options || [])
        .map((optEn, oIdx) => ({
          en: (optEn || '').trim(),
          te: (q.optionsTelugu?.[oIdx] || '').trim(),
          wasCorrect: q.correctIndex === oIdx,
        }))
        .filter(p => p.en.length > 0);

      const finalOpts = pairs.length >= 2 ? pairs : [{ en: 'True', te: 'సత్యము', wasCorrect: true }, { en: 'False', te: 'అసత్యము', wasCorrect: false }];
      const newCorrectIdx = finalOpts.findIndex(p => p.wasCorrect);
      const safeCorrectIdx = newCorrectIdx >= 0 ? newCorrectIdx : 0;

      return {
        id: q.id || `q${idx + 1}`,
        questionEnglish: q.questionEnglish.trim(),
        questionTelugu: (q.questionTelugu || '').trim() || q.questionEnglish.trim(),
        options: finalOpts.map(p => p.en),
        optionsTelugu: finalOpts.map(p => p.te || p.en),
        correctIndex: safeCorrectIdx,
        explanation: (q.explanation || '').trim(),
        explanationTelugu: (q.explanationTelugu || '').trim(),
      };
    });

    try {
      setSaving(true);
      const uploadedThumbUrl = quizThumbnailUrl.trim()
        ? await KidsMinistryService.uploadQuizThumbnail(churchId, quizThumbnailUrl.trim())
        : '';
      if (uploadedThumbUrl) {
        setQuizThumbnailUrl(uploadedThumbUrl);
      }

      const estMins = Math.max(2, Math.ceil(cleanedQuestions.length * 0.5));
      const payload: Partial<KidsQuiz> = {
        title: trimmedTitle,
        titleTelugu: quizTelugu.trim() || trimmedTitle,
        scriptureRef: quizRef.trim(),
        pointsReward: parseInt(quizReward, 10) || cleanedQuestions.length * 10 || 50,
        badgeReward: quizBadge.trim() || 'Bible Star',
        coverEmoji: quizEmoji.trim() || '🏆',
        thumbnailUrl: uploadedThumbUrl || undefined,
        estimatedMinutes: estMins,
        sourceDocumentName: quizSourceDocName || undefined,
        difficulty: quizDifficulty,
        isPublished: publishNow,
        questions: cleanedQuestions,
      };

      setQuizPublished(publishNow);

      if (editingQuizId) {
        await KidsMinistryService.updateQuiz(churchId, editingQuizId, payload);
      } else {
        const createdId = await KidsMinistryService.createQuiz(churchId, {
          quizId: `QUIZ-${Date.now().toString().slice(-4)}`,
          ...payload,
        });
        setEditingQuizId(createdId);
      }

      if (publishNow) {
        Alert.alert(
          'Quiz Published!',
          `"${trimmedTitle}" (${cleanedQuestions.length} questions) is now live in Member View.`
        );
        setShowQuizModal(false);
      } else {
        Alert.alert(
          'Quiz Saved',
          `"${trimmedTitle}" has been saved as a draft. Tap Publish when ready for members.`
        );
      }
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
                        styles.storyThumb16x9List,
                        { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor },
                      ]}
                    >
                      {s.coverImageUrl ? (
                        <Image source={{ uri: s.coverImageUrl }} style={styles.cardImage} resizeMode="cover" />
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
                      {s.titleTelugu && s.titleTelugu !== s.title ? (
                        <Text style={[styles.cardTeluguTitle, { color: accentBlue }]} numberOfLines={1}>
                          {s.titleTelugu}
                        </Text>
                      ) : null}
                      <Text style={[styles.cardRef, { color: secondaryText }]}>
                        {s.scriptureRef || 'Bible Story'} · {s.readTime || estimateStoryReadTime(getFullStoryContent(s))}
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
                    <View style={[styles.storyThumb16x9List, { backgroundColor: 'rgba(245, 158, 11, 0.14)' }]}>
                      {q.thumbnailUrl ? (
                        <Image source={{ uri: q.thumbnailUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                      ) : (
                        <Text style={{ fontSize: 22 }}>{q.coverEmoji || '🏆'}</Text>
                      )}
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
                            {q.isPublished !== false ? 'Live' : 'Draft'}
                          </Text>
                        </View>
                      </View>
                      {q.titleTelugu ? (
                        <Text style={[styles.cardTeluguTitle, { color: accentBlue }]} numberOfLines={1}>
                          {q.titleTelugu}
                        </Text>
                      ) : null}
                      <Text style={[styles.cardRef, { color: secondaryText }]} numberOfLines={1}>
                        {(q.scriptureRef ? `${q.scriptureRef} · ` : '') +
                          `${q.questions?.length || 0} Qs · ~${estimateQuizMinutes(q)} min · +${q.pointsReward || 50} ★`}
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
        {/* STORY CREATE / EDIT SINGLE-PAGE EDITOR                       */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <Modal
          visible={showStoryModal}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => {
            if (storyPreviewMode) {
              setStoryPreviewMode(false);
            } else {
              setShowStoryModal(false);
            }
          }}
        >
          <KeyboardAvoidingView
            style={[
              styles.container,
              {
                backgroundColor: isDark ? '#0B0F19' : '#FFFDF9',
                paddingTop: safeTop,
              },
            ]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <StatusBar
              barStyle={barStyle}
              backgroundColor={isDark ? '#0B0F19' : '#FFFDF9'}
            />

            {/* Top Single-Page Header */}
            <View style={[styles.topHeader, { borderBottomColor: borderColor }]}>
              <TouchableOpacity
                onPress={() => {
                  if (storyPreviewMode) setStoryPreviewMode(false);
                  else setShowStoryModal(false);
                }}
                style={[styles.closeHeaderBtn, { backgroundColor: cardSurface, borderColor }]}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {storyPreviewMode ? (
                  <ArrowLeft size={20} color={primaryText} />
                ) : (
                  <X size={20} color={primaryText} />
                )}
              </TouchableOpacity>
              <View style={styles.headerCenter}>
                <Text style={[styles.headerTitle, { color: primaryText }]} numberOfLines={1}>
                  {storyPreviewMode
                    ? 'Story Preview'
                    : editingStoryId
                    ? 'Edit Bible Story'
                    : 'Create Bible Story'}
                </Text>
                <Text style={[styles.headerSubtitle, { color: secondaryText }]} numberOfLines={1}>
                  {storyPreviewMode
                    ? 'Member View appearance & layout'
                    : storyPublished
                    ? 'Published to Member View'
                    : 'Saved as Draft'}
                </Text>
              </View>
              <View
                style={[
                  styles.statusPill,
                  storyPublished ? styles.publishedPill : styles.draftPill,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    storyPublished ? styles.publishedPillText : styles.draftPillText,
                  ]}
                >
                  {storyPublished ? 'Live' : 'Draft'}
                </Text>
              </View>
            </View>

            {/* Full-Scrollable Single-Page Content (Edit or Preview) */}
            <ScrollView
              ref={storyScrollRef}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              automaticallyAdjustKeyboardInsets
              contentContainerStyle={[
                styles.singleStoryScroll,
                { paddingBottom: safeBottom + 36 },
              ]}
            >
              {storyPreviewMode ? (
                <BibleStoryReaderContent
                  title={storyTitle}
                  titleTelugu={storyTelugu}
                  scriptureRef={storyRef}
                  thumbnailUrl={storyCoverUrl}
                  coverEmoji={storyEmoji}
                  storyContent={storyContent}
                  teluguContent={storyTeluguContent}
                  reflectionQuestions={editingStorySource?.reflectionQuestions}
                  isPreviewBadge
                />
              ) : (
                <View style={styles.singlePageCanvas}>
                  {/* 1. Prominent Story Title Card */}
                  <View
                    style={[
                      styles.storySectionCard,
                      {
                        backgroundColor: isDark ? '#161C2E' : '#FFFFFF',
                        borderColor: isDark ? '#283149' : '#EAE4D7',
                      },
                    ]}
                  >
                    <Text style={[styles.singleFieldEyebrow, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>
                      STORY TITLE *
                    </Text>
                    <TextInput
                      style={[
                        styles.prominentTitleInput,
                        {
                          color: primaryText,
                          borderBottomColor: isDark ? '#283149' : '#F1EDE4',
                        },
                      ]}
                      value={storyTitle}
                      onChangeText={setStoryTitle}
                      placeholder="Enter Bible Story Title..."
                      placeholderTextColor={placeholderColor}
                      multiline
                      scrollEnabled={false}
                    />
                    <View style={styles.inlineMetaInputsRow}>
                      <TextInput
                        style={[
                          styles.compactMetaInput,
                          {
                            backgroundColor: isDark ? '#1E2538' : '#FBF8F1',
                            borderColor: isDark ? '#2D374E' : '#E7E0D0',
                            color: primaryText,
                          },
                        ]}
                        value={storyRef}
                        onChangeText={setStoryRef}
                        placeholder="Scripture (1 Sam 17)"
                        placeholderTextColor={placeholderColor}
                        numberOfLines={1}
                      />
                      <TextInput
                        style={[
                          styles.compactMetaInput,
                          {
                            backgroundColor: isDark ? '#1E2538' : '#FBF8F1',
                            borderColor: isDark ? '#2D374E' : '#E7E0D0',
                            color: primaryText,
                          },
                        ]}
                        value={storyTelugu}
                        onChangeText={setStoryTelugu}
                        placeholder="Telugu Title (optional)"
                        placeholderTextColor={placeholderColor}
                        numberOfLines={1}
                      />
                    </View>
                  </View>

                  {/* 2. Mandatory 16:9 Story Cover */}
                  <View
                    style={[
                      styles.storySectionCard,
                      {
                        backgroundColor: isDark ? '#161C2E' : '#FFFFFF',
                        borderColor: isDark ? '#283149' : '#EAE4D7',
                      },
                    ]}
                  >
                    <View style={styles.singleFieldLabelRow}>
                      <Text style={[styles.singleFieldEyebrow, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>
                        STORY COVER IMAGE *
                      </Text>
                      <View
                        style={[
                          styles.aspectRequiredPill,
                          { backgroundColor: isDark ? 'rgba(251, 191, 36, 0.16)' : '#FEF3C7' },
                        ]}
                      >
                        <Text style={[styles.aspectRequiredText, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                          16:9 Ratio
                        </Text>
                      </View>
                      {storyCoverUrl ? (
                        <TouchableOpacity
                          onPress={() => setStoryCoverUrl('')}
                          style={{ marginLeft: 'auto' }}
                        >
                          <Text style={styles.removeImageText}>Remove</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.storyUpload16x9Box,
                        {
                          backgroundColor: isDark ? '#1E2538' : '#FBF8F1',
                          borderColor: storyCoverUrl
                            ? isDark
                              ? '#2D374E'
                              : '#E7E0D0'
                            : isDark
                            ? '#7C3AED'
                            : '#C4B5FD',
                          borderStyle: storyCoverUrl ? 'solid' : 'dashed',
                        },
                      ]}
                      onPress={handlePickStoryCover}
                      activeOpacity={0.85}
                    >
                      {storyCoverUrl ? (
                        <>
                          <Image
                            source={{ uri: storyCoverUrl }}
                            style={styles.imagePreviewImg}
                            resizeMode="cover"
                          />
                          <View style={styles.changeThumbOverlay}>
                            <Upload size={13} color="#FFFFFF" />
                            <Text style={styles.changeThumbOverlayText}>Change 16:9 Cover</Text>
                          </View>
                        </>
                      ) : (
                        <View style={styles.uploadPlaceholderInner}>
                          <View
                            style={[
                              styles.uploadIconCircle,
                              { backgroundColor: isDark ? 'rgba(124, 58, 237, 0.25)' : '#EFE9FE' },
                            ]}
                          >
                            <ImageIcon size={24} color="#7C3AED" />
                          </View>
                          <Text style={[styles.uploadPlaceholderTitle, { color: primaryText }]}>
                            Tap to Upload 16:9 Thumbnail
                          </Text>
                          <Text style={[styles.uploadPlaceholderSub, { color: secondaryText }]}>
                            Auto-cropped to 16:9 for Admin & Member views
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* 3. Editorial Complete Story Canvas with Drop-Cap Accent */}
                  <View
                    style={[
                      styles.storySectionCard,
                      {
                        backgroundColor: isDark ? '#161C2E' : '#FFFFFF',
                        borderColor: isDark ? '#283149' : '#EAE4D7',
                      },
                    ]}
                  >
                    <View style={styles.singleFieldLabelRow}>
                      <Text style={[styles.singleFieldEyebrow, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>
                        BIBLE STORY CONTENT *
                      </Text>
                      <Text style={[styles.readTimeCounter, { color: secondaryText }]}>
                        {estimateStoryReadTime(storyContent)}
                      </Text>
                    </View>

                    {(() => {
                      const trimmed = storyContent.trim();
                      const firstChar = (
                        trimmed.charAt(0) ||
                        storyTitle.trim().charAt(0) ||
                        'B'
                      ).toUpperCase();
                      const dropCapGlowBg = isDark ? 'rgba(251, 191, 36, 0.14)' : '#FEF3C7';
                      const dropCapColor = isDark ? '#FBBF24' : '#B45309';

                      return (
                        <View style={styles.storyPaperBody}>
                          {/* Graceful Serif Drop-Cap + Opening */}
                          <View style={styles.editorDropCapHeaderRow}>
                            <View style={styles.editorDropCapFrame}>
                              <View
                                style={[
                                  styles.editorDropCapGlowCircle,
                                  { backgroundColor: dropCapGlowBg },
                                ]}
                              />
                              <Text style={[styles.editorDropCapGlyph, { color: dropCapColor }]}>
                                {firstChar}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[styles.editorDropCapHintTitle, { color: primaryText }]}
                                numberOfLines={2}
                              >
                                {trimmed
                                  ? trimmed.replace(/\n+/g, ' ').slice(0, 80) +
                                    (trimmed.length > 80 ? '...' : '')
                                  : 'Write your Bible story below'}
                              </Text>
                              <Text style={[styles.editorDropCapHintSub, { color: secondaryText }]}>
                                Opening letter “{firstChar}” displays as a large drop-cap
                              </Text>
                            </View>
                          </View>

                          <TextInput
                            style={[
                              styles.storyBodyTextArea,
                              {
                                color: primaryText,
                                backgroundColor: isDark ? '#1E2538' : '#FBF8F1',
                                borderColor: isDark ? '#2D374E' : '#EAE4D7',
                              },
                            ]}
                            value={storyContent}
                            onChangeText={setStoryContent}
                            placeholder="Write or paste the complete Bible story here. Kids will read it comfortably from top to bottom..."
                            placeholderTextColor={placeholderColor}
                            multiline
                            scrollEnabled={false}
                            textAlignVertical="top"
                            onFocus={() => {
                              setTimeout(() => {
                                storyScrollRef.current?.scrollToEnd({ animated: true });
                              }, 220);
                            }}
                          />
                        </View>
                      );
                    })()}

                    <TextInput
                      style={[
                        styles.storyTeluguOptionalArea,
                        {
                          backgroundColor: isDark ? '#1E2538' : '#FBF8F1',
                          borderColor: isDark ? '#2D374E' : '#EAE4D7',
                          color: primaryText,
                        },
                      ]}
                      value={storyTeluguContent}
                      onChangeText={setStoryTeluguContent}
                      placeholder="Telugu Story Content (optional) — తెలుగు కథనం..."
                      placeholderTextColor={placeholderColor}
                      multiline
                      scrollEnabled={false}
                      textAlignVertical="top"
                      onFocus={() => {
                        setTimeout(() => {
                          storyScrollRef.current?.scrollToEnd({ animated: true });
                        }, 220);
                      }}
                    />
                  </View>
                </View>
              )}

              {/* Inline Bottom Actions Row inside ScrollView so nothing covers text when keyboard opens */}
              <View style={styles.storyInlineActionsRow}>
                <TouchableOpacity
                  style={[
                    styles.storyActionSecondaryBtn,
                    {
                      backgroundColor: isDark ? '#161C2E' : '#FFFFFF',
                      borderColor: isDark ? '#2D374E' : '#DDD6FE',
                    },
                  ]}
                  onPress={() => persistStory(false)}
                  disabled={saving}
                  activeOpacity={0.82}
                >
                  <Save size={15} color={primaryText} />
                  <Text style={[styles.storyActionSecondaryText, { color: primaryText }]}>
                    Save
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.storyActionSecondaryBtn,
                    {
                      backgroundColor: storyPreviewMode
                        ? isDark
                          ? '#271E4A'
                          : '#EFE9FE'
                        : isDark
                        ? '#161C2E'
                        : '#FFFFFF',
                      borderColor: storyPreviewMode
                        ? '#7C3AED'
                        : isDark
                        ? '#2D374E'
                        : '#DDD6FE',
                    },
                  ]}
                  onPress={() => setStoryPreviewMode(prev => !prev)}
                  disabled={saving}
                  activeOpacity={0.82}
                >
                  <Eye size={15} color={storyPreviewMode ? '#7C3AED' : primaryText} />
                  <Text
                    style={[
                      styles.storyActionSecondaryText,
                      { color: storyPreviewMode ? '#7C3AED' : primaryText },
                    ]}
                  >
                    {storyPreviewMode ? 'Edit' : 'Preview'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.storyActionPublishBtn}
                  onPress={() => persistStory(true)}
                  disabled={saving}
                  activeOpacity={0.86}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Send size={15} color="#FFFFFF" />
                      <Text style={styles.storyActionPublishText}>Publish</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* QUIZ CREATE / EDIT MODAL (FULL SCREEN SCROLLABLE)            */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <Modal
          visible={showQuizModal}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => {
            if (quizPreviewMode) {
              setQuizPreviewMode(false);
            } else {
              setShowQuizModal(false);
            }
          }}
        >
          {quizPreviewMode ? (
            <KidsQuizExperienceView
              quiz={buildPreviewQuizObject()}
              onClose={() => setQuizPreviewMode(false)}
              isPreview
            />
          ) : (
            <KeyboardAvoidingView
              style={[
                styles.container,
                {
                  backgroundColor: isDark ? '#0B0F19' : '#FFFDF9',
                  paddingTop: safeTop,
                },
              ]}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
              <StatusBar
                barStyle={barStyle}
                backgroundColor={isDark ? '#0B0F19' : '#FFFDF9'}
              />

              {/* Top Header */}
              <View style={[styles.topHeader, { borderBottomColor: borderColor }]}>
                <TouchableOpacity
                  onPress={() => setShowQuizModal(false)}
                  style={[styles.closeHeaderBtn, { backgroundColor: cardSurface, borderColor }]}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X size={20} color={primaryText} />
                </TouchableOpacity>
                <View style={styles.headerCenter}>
                  <Text style={[styles.headerTitle, { color: primaryText }]} numberOfLines={1}>
                    {editingQuizId ? 'Edit Bible Quiz' : 'Create Bible Quiz'}
                  </Text>
                  <Text style={[styles.headerSubtitle, { color: secondaryText }]} numberOfLines={1}>
                    {quizPublished
                      ? 'Published to Member View'
                      : 'Review & approve before publishing'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statusPill,
                    quizPublished ? styles.publishedPill : styles.draftPill,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      quizPublished ? styles.publishedPillText : styles.draftPillText,
                    ]}
                  >
                    {quizPublished ? 'Live' : 'Draft'}
                  </Text>
                </View>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
                contentContainerStyle={[
                  styles.singleStoryScroll,
                  { paddingBottom: safeBottom + 40 },
                ]}
              >
                <View style={styles.singlePageCanvas}>
                  {/* Mode Selector: Upload Document vs Manual */}
                  <View
                    style={[
                      styles.quizModeSwitch,
                      {
                        backgroundColor: isDark ? '#161C2E' : '#F3EFE6',
                        borderColor: isDark ? '#283149' : '#E7E0D0',
                      },
                    ]}
                  >
                    <TouchableOpacity
                      style={[
                        styles.quizModeTab,
                        quizCreationMode === 'document' && {
                          backgroundColor: isDark ? '#7C3AED' : '#FFFFFF',
                        },
                      ]}
                      onPress={() => setQuizCreationMode('document')}
                      activeOpacity={0.85}
                    >
                      <FileText
                        size={14}
                        color={
                          quizCreationMode === 'document'
                            ? isDark
                              ? '#FFFFFF'
                              : '#6D28D9'
                            : secondaryText
                        }
                      />
                      <Text
                        style={[
                          styles.quizModeTabText,
                          {
                            color:
                              quizCreationMode === 'document'
                                ? isDark
                                  ? '#FFFFFF'
                                  : '#6D28D9'
                                : secondaryText,
                          },
                        ]}
                      >
                        Upload PDF / DOCX
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.quizModeTab,
                        quizCreationMode === 'manual' && {
                          backgroundColor: isDark ? '#7C3AED' : '#FFFFFF',
                        },
                      ]}
                      onPress={() => setQuizCreationMode('manual')}
                      activeOpacity={0.85}
                    >
                      <Sparkles
                        size={14}
                        color={
                          quizCreationMode === 'manual'
                            ? isDark
                              ? '#FFFFFF'
                              : '#6D28D9'
                            : secondaryText
                        }
                      />
                      <Text
                        style={[
                          styles.quizModeTabText,
                          {
                            color:
                              quizCreationMode === 'manual'
                                ? isDark
                                  ? '#FFFFFF'
                                  : '#6D28D9'
                                : secondaryText,
                          },
                        ]}
                      >
                        Manual Creation
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Document Upload Panel */}
                  {quizCreationMode === 'document' && (
                    <View
                      style={[
                        styles.storySectionCard,
                        {
                          backgroundColor: isDark ? '#161C2E' : '#FFFFFF',
                          borderColor: isDark ? '#283149' : '#EAE4D7',
                        },
                      ]}
                    >
                      <View style={styles.singleFieldLabelRow}>
                        <Text style={[styles.singleFieldEyebrow, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>
                          UPLOAD ENGLISH QUIZ DOCUMENT
                        </Text>
                        <View
                          style={[
                            styles.aspectRequiredPill,
                            { backgroundColor: isDark ? 'rgba(59,130,246,0.18)' : '#DBEAFE' },
                          ]}
                        >
                          <Text style={[styles.aspectRequiredText, { color: isDark ? '#93C5FD' : '#1D4ED8' }]}>
                            Max 10 Qs · Auto TE
                          </Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={[
                          styles.quizDocUploadCard,
                          {
                            backgroundColor: isDark ? '#1E2538' : '#FBF8F1',
                            borderColor: isDark ? '#7C3AED' : '#C4B5FD',
                          },
                        ]}
                        onPress={handleUploadQuizDocument}
                        disabled={extractingDoc}
                        activeOpacity={0.85}
                      >
                        {extractingDoc ? (
                          <View style={styles.uploadPlaceholderInner}>
                            <ActivityIndicator size="large" color="#7C3AED" />
                            <Text style={[styles.uploadPlaceholderTitle, { color: primaryText }]}>
                              Extracting & Translating to Telugu...
                            </Text>
                            <Text style={[styles.uploadPlaceholderSub, { color: secondaryText }]}>
                              Preserving numbering, options, and correct answers
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.uploadPlaceholderInner}>
                            <View
                              style={[
                                styles.uploadIconCircle,
                                { backgroundColor: isDark ? 'rgba(124, 58, 237, 0.25)' : '#EFE9FE' },
                              ]}
                            >
                              <Upload size={22} color="#7C3AED" />
                            </View>
                            <Text style={[styles.uploadPlaceholderTitle, { color: primaryText }]}>
                              {quizSourceDocName
                                ? 'Replace Quiz Document (PDF / DOCX)'
                                : 'Tap to Upload PDF or DOCX Quiz'}
                            </Text>
                            <Text style={[styles.uploadPlaceholderSub, { color: secondaryText }]}>
                              Auto-extracts up to 10 English questions & generates aligned Telugu translations
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      {quizSourceDocName ? (
                        <View
                          style={[
                            styles.quizReviewBanner,
                            {
                              backgroundColor: isDark ? 'rgba(16, 185, 129, 0.14)' : '#ECFDF5',
                              borderColor: isDark ? '#065F46' : '#A7F3D0',
                            },
                          ]}
                        >
                          <CheckCircle size={16} color={isDark ? '#34D399' : '#059669'} />
                          <Text
                            style={[
                              styles.quizReviewBannerText,
                              { color: isDark ? '#A7F3D0' : '#065F46' },
                            ]}
                          >
                            Extracted from "{quizSourceDocName}". Please review and edit questions, options, correct answers & Telugu text below before publishing.
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}

                  {/* 1. Quiz Overview */}
                  <View
                    style={[
                      styles.storySectionCard,
                      {
                        backgroundColor: isDark ? '#161C2E' : '#FFFFFF',
                        borderColor: isDark ? '#283149' : '#EAE4D7',
                      },
                    ]}
                  >
                    <Text style={[styles.singleFieldEyebrow, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>
                      QUIZ DETAILS *
                    </Text>
                    <TextInput
                      style={[
                        styles.prominentTitleInput,
                        {
                          color: primaryText,
                          borderBottomColor: isDark ? '#283149' : '#F1EDE4',
                        },
                      ]}
                      value={quizTitle}
                      onChangeText={setQuizTitle}
                      placeholder="Enter Bible Quiz Title..."
                      placeholderTextColor={placeholderColor}
                      multiline
                      scrollEnabled={false}
                    />
                    <View style={styles.inlineMetaInputsRow}>
                      <TextInput
                        style={[
                          styles.compactMetaInput,
                          {
                            backgroundColor: isDark ? '#1E2538' : '#FBF8F1',
                            borderColor: isDark ? '#2D374E' : '#E7E0D0',
                            color: primaryText,
                          },
                        ]}
                        value={quizRef}
                        onChangeText={setQuizRef}
                        placeholder="Scripture (Exodus 1-14)"
                        placeholderTextColor={placeholderColor}
                      />
                      <TextInput
                        style={[
                          styles.compactMetaInput,
                          {
                            backgroundColor: isDark ? '#1E2538' : '#FBF8F1',
                            borderColor: isDark ? '#2D374E' : '#E7E0D0',
                            color: primaryText,
                          },
                        ]}
                        value={quizTelugu}
                        onChangeText={setQuizTelugu}
                        placeholder="Telugu Title (తెలుగు శీర్షిక)"
                        placeholderTextColor={placeholderColor}
                      />
                    </View>

                    <View style={styles.inlineMetaInputsRow}>
                      <View style={{ flex: 0.7 }}>
                        <Text style={[styles.inputMiniLabel, { color: secondaryText }]}>Star Points</Text>
                        <TextInput
                          style={[
                            styles.compactMetaInput,
                            {
                              backgroundColor: isDark ? '#1E2538' : '#FBF8F1',
                              borderColor: isDark ? '#2D374E' : '#E7E0D0',
                              color: primaryText,
                            },
                          ]}
                          value={quizReward}
                          onChangeText={setQuizReward}
                          keyboardType="numeric"
                          placeholder="50"
                          placeholderTextColor={placeholderColor}
                        />
                      </View>
                      <View style={{ flex: 1.3 }}>
                        <Text style={[styles.inputMiniLabel, { color: secondaryText }]}>Reward Badge</Text>
                        <TextInput
                          style={[
                            styles.compactMetaInput,
                            {
                              backgroundColor: isDark ? '#1E2538' : '#FBF8F1',
                              borderColor: isDark ? '#2D374E' : '#E7E0D0',
                              color: primaryText,
                            },
                          ]}
                          value={quizBadge}
                          onChangeText={setQuizBadge}
                          placeholder="Bible Star"
                          placeholderTextColor={placeholderColor}
                        />
                      </View>
                    </View>
                  </View>

                  {/* 2. Mandatory 16:9 Quiz Thumbnail */}
                  <View
                    style={[
                      styles.storySectionCard,
                      {
                        backgroundColor: isDark ? '#161C2E' : '#FFFFFF',
                        borderColor: isDark ? '#283149' : '#EAE4D7',
                      },
                    ]}
                  >
                    <View style={styles.singleFieldLabelRow}>
                      <Text style={[styles.singleFieldEyebrow, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>
                        QUIZ THUMBNAIL *
                      </Text>
                      <View
                        style={[
                          styles.aspectRequiredPill,
                          { backgroundColor: isDark ? 'rgba(251, 191, 36, 0.16)' : '#FEF3C7' },
                        ]}
                      >
                        <Text style={[styles.aspectRequiredText, { color: isDark ? '#FBBF24' : '#B45309' }]}>
                          16:9 Required
                        </Text>
                      </View>
                      {quizThumbnailUrl ? (
                        <TouchableOpacity
                          onPress={() => setQuizThumbnailUrl('')}
                          style={{ marginLeft: 'auto' }}
                        >
                          <Text style={styles.removeImageText}>Remove</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.storyUpload16x9Box,
                        {
                          backgroundColor: isDark ? '#1E2538' : '#FBF8F1',
                          borderColor: quizThumbnailUrl
                            ? isDark
                              ? '#2D374E'
                              : '#E7E0D0'
                            : isDark
                            ? '#7C3AED'
                            : '#C4B5FD',
                          borderStyle: quizThumbnailUrl ? 'solid' : 'dashed',
                        },
                      ]}
                      onPress={handlePickQuizCover}
                      activeOpacity={0.85}
                    >
                      {quizThumbnailUrl ? (
                        <>
                          <Image
                            source={{ uri: quizThumbnailUrl }}
                            style={styles.imagePreviewImg}
                            resizeMode="cover"
                          />
                          <View style={styles.changeThumbOverlay}>
                            <Upload size={13} color="#FFFFFF" />
                            <Text style={styles.changeThumbOverlayText}>Crop / Change 16:9 Thumbnail</Text>
                          </View>
                        </>
                      ) : (
                        <View style={styles.uploadPlaceholderInner}>
                          <View
                            style={[
                              styles.uploadIconCircle,
                              { backgroundColor: isDark ? 'rgba(124, 58, 237, 0.25)' : '#EFE9FE' },
                            ]}
                          >
                            <ImageIcon size={24} color="#7C3AED" />
                          </View>
                          <Text style={[styles.uploadPlaceholderTitle, { color: primaryText }]}>
                            Tap to Upload & Crop 16:9 Thumbnail
                          </Text>
                          <Text style={[styles.uploadPlaceholderSub, { color: secondaryText }]}>
                            Same 16:9 cover appears in Admin & Member views
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* 3. Questions Review & Edit Section (Max 10) */}
                  <View
                    style={[
                      styles.storySectionCard,
                      {
                        backgroundColor: isDark ? '#161C2E' : '#FFFFFF',
                        borderColor: isDark ? '#283149' : '#EAE4D7',
                      },
                    ]}
                  >
                    <View style={styles.singleFieldLabelRow}>
                      <Text style={[styles.singleFieldEyebrow, { color: isDark ? '#C4B5FD' : '#6D28D9' }]}>
                        QUESTIONS ({quizQuestions.length}/{MAX_KIDS_QUIZ_QUESTIONS})
                      </Text>
                      <Text style={[styles.quizHintRight, { color: secondaryText }]}>
                        Consistent EN & TE Answers
                      </Text>
                    </View>

                    {quizQuestions.map((q, qIdx) => (
                      <View
                        key={q.id || qIdx}
                        style={[
                          styles.quizQCard,
                          {
                            backgroundColor: isDark ? '#1E2538' : '#FBF8F1',
                            borderColor: isDark ? '#2D374E' : '#E7E0D0',
                          },
                        ]}
                      >
                        {/* Question Card Top Header */}
                        <View style={styles.quizQHeaderRow}>
                          <View style={styles.quizQNumberPill}>
                            <Text style={styles.quizQNumberText}>Question {qIdx + 1}</Text>
                          </View>

                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <TouchableOpacity
                              style={[
                                styles.quizTranslateMiniBtn,
                                {
                                  backgroundColor: isDark ? 'rgba(59,130,246,0.18)' : '#EFF6FF',
                                  borderColor: isDark ? '#1D4ED8' : '#BFDBFE',
                                },
                              ]}
                              onPress={() => handleTranslateQuestion(qIdx)}
                              disabled={translatingQIdx === qIdx}
                            >
                              {translatingQIdx === qIdx ? (
                                <ActivityIndicator size="small" color={accentBlue} />
                              ) : (
                                <>
                                  <Globe size={12} color={accentBlue} />
                                  <Text style={[styles.quizTranslateMiniText, { color: accentBlue }]}>
                                    Auto Telugu
                                  </Text>
                                </>
                              )}
                            </TouchableOpacity>

                            {quizQuestions.length > 1 && (
                              <TouchableOpacity
                                style={[
                                  styles.quizDeleteQBtn,
                                  { backgroundColor: isDark ? 'rgba(239,68,68,0.18)' : '#FEE2E2' },
                                ]}
                                onPress={() =>
                                  setQuizQuestions(prev => prev.filter((_, i) => i !== qIdx))
                                }
                              >
                                <Trash2 size={14} color="#EF4444" />
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>

                        {/* English & Telugu Question Prompts */}
                        <TextInput
                          style={[
                            styles.quizFieldInput,
                            {
                              backgroundColor: isDark ? '#141A29' : '#FFFFFF',
                              borderColor: isDark ? '#2D374E' : '#E2DDD2',
                              color: primaryText,
                            },
                          ]}
                          value={q.questionEnglish}
                          onChangeText={txt => {
                            setQuizQuestions(prev =>
                              prev.map((item, i) => (i === qIdx ? { ...item, questionEnglish: txt } : item))
                            );
                          }}
                          placeholder={`Question ${qIdx + 1} in English...`}
                          placeholderTextColor={placeholderColor}
                          multiline
                        />
                        <TextInput
                          style={[
                            styles.quizFieldInput,
                            {
                              backgroundColor: isDark ? '#141A29' : '#FFFFFF',
                              borderColor: isDark ? '#2D374E' : '#E2DDD2',
                              color: primaryText,
                            },
                          ]}
                          value={q.questionTelugu}
                          onChangeText={txt => {
                            setQuizQuestions(prev =>
                              prev.map((item, i) => (i === qIdx ? { ...item, questionTelugu: txt } : item))
                            );
                          }}
                          placeholder={`ప్రశ్న ${qIdx + 1} తెలుగులో...`}
                          placeholderTextColor={placeholderColor}
                          multiline
                        />

                        {/* Answer Options (A/B/C/D consistent across English & Telugu) */}
                        <Text style={[styles.inputMiniLabel, { color: secondaryText, marginTop: 4 }]}>
                          Tap letter to mark the Correct Answer (same for English & Telugu):
                        </Text>

                        {q.options.map((opt, oIdx) => {
                          const isCorrect = q.correctIndex === oIdx;
                          const teOpt = q.optionsTelugu?.[oIdx] ?? '';
                          const letter = String.fromCharCode(65 + oIdx);
                          return (
                            <View
                              key={oIdx}
                              style={[
                                styles.quizOptionPairCard,
                                {
                                  backgroundColor: isCorrect
                                    ? isDark
                                      ? 'rgba(16, 185, 129, 0.12)'
                                      : '#ECFDF5'
                                    : isDark
                                    ? '#141A29'
                                    : '#FFFFFF',
                                  borderColor: isCorrect
                                    ? '#10B981'
                                    : isDark
                                    ? '#2D374E'
                                    : '#E2DDD2',
                                },
                              ]}
                            >
                              <TouchableOpacity
                                style={[
                                  styles.quizOptionLetterCircle,
                                  {
                                    backgroundColor: isCorrect
                                      ? '#10B981'
                                      : isDark
                                      ? '#283149'
                                      : '#EFECE6',
                                  },
                                ]}
                                onPress={() => {
                                  setQuizQuestions(prev =>
                                    prev.map((item, i) =>
                                      i === qIdx ? { ...item, correctIndex: oIdx } : item
                                    )
                                  );
                                }}
                              >
                                <Text
                                  style={[
                                    styles.quizOptionLetterText,
                                    { color: isCorrect ? '#FFFFFF' : primaryText },
                                  ]}
                                >
                                  {letter}
                                </Text>
                              </TouchableOpacity>

                              <View style={{ flex: 1, gap: 6 }}>
                                <TextInput
                                  style={[
                                    styles.quizOptionSubInput,
                                    {
                                      color: primaryText,
                                      borderBottomColor: isDark ? '#283149' : '#EEE9DE',
                                    },
                                  ]}
                                  value={opt}
                                  onChangeText={txt => {
                                    setQuizQuestions(prev =>
                                      prev.map((item, i) => {
                                        if (i !== qIdx) return item;
                                        const nextOpts = [...item.options];
                                        nextOpts[oIdx] = txt;
                                        return { ...item, options: nextOpts };
                                      })
                                    );
                                  }}
                                  placeholder={`Option ${letter} (English)`}
                                  placeholderTextColor={placeholderColor}
                                />
                                <TextInput
                                  style={[styles.quizOptionSubInput, { color: accentBlue, borderBottomWidth: 0 }]}
                                  value={teOpt}
                                  onChangeText={txt => {
                                    setQuizQuestions(prev =>
                                      prev.map((item, i) => {
                                        if (i !== qIdx) return item;
                                        const nextTe = item.options.map(
                                          (_, idx) => item.optionsTelugu?.[idx] || ''
                                        );
                                        nextTe[oIdx] = txt;
                                        return { ...item, optionsTelugu: nextTe };
                                      })
                                    );
                                  }}
                                  placeholder={`ఎంపిక ${letter} (తెలుగు)`}
                                  placeholderTextColor={placeholderColor}
                                />
                              </View>
                            </View>
                          );
                        })}

                        {/* Bilingual Explanations */}
                        <TextInput
                          style={[
                            styles.quizFieldInput,
                            {
                              backgroundColor: isDark ? '#141A29' : '#FFFFFF',
                              borderColor: isDark ? '#2D374E' : '#E2DDD2',
                              color: primaryText,
                              marginTop: 4,
                            },
                          ]}
                          value={q.explanation}
                          onChangeText={txt => {
                            setQuizQuestions(prev =>
                              prev.map((item, i) => (i === qIdx ? { ...item, explanation: txt } : item))
                            );
                          }}
                          placeholder="Bible verse explanation / answer note (English)"
                          placeholderTextColor={placeholderColor}
                          multiline
                        />
                        <TextInput
                          style={[
                            styles.quizFieldInput,
                            {
                              backgroundColor: isDark ? '#141A29' : '#FFFFFF',
                              borderColor: isDark ? '#2D374E' : '#E2DDD2',
                              color: primaryText,
                            },
                          ]}
                          value={q.explanationTelugu || ''}
                          onChangeText={txt => {
                            setQuizQuestions(prev =>
                              prev.map((item, i) =>
                                i === qIdx ? { ...item, explanationTelugu: txt } : item
                              )
                            );
                          }}
                          placeholder="వివరణ తెలుగులో (ఐచ్ఛికం)"
                          placeholderTextColor={placeholderColor}
                          multiline
                        />
                      </View>
                    ))}

                    {quizQuestions.length < MAX_KIDS_QUIZ_QUESTIONS ? (
                      <TouchableOpacity
                        style={[
                          styles.addPageBtn,
                          {
                            backgroundColor: isDark ? 'rgba(59,130,246,0.12)' : '#EFF6FF',
                            borderColor: '#3B82F6',
                          },
                        ]}
                        onPress={() =>
                          setQuizQuestions(prev => [...prev, makeBlankQuizQuestion(prev.length)])
                        }
                      >
                        <Plus size={14} color={accentBlue} />
                        <Text style={[styles.addPageBtnText, { color: accentBlue }]}>
                          Add Question ({quizQuestions.length}/{MAX_KIDS_QUIZ_QUESTIONS})
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={[styles.quizMaxReachedNote, { color: secondaryText }]}>
                        Maximum of {MAX_KIDS_QUIZ_QUESTIONS} questions reached for this Bible Quiz.
                      </Text>
                    )}
                  </View>

                  {/* Inline Bottom Actions Row: Save | Preview | Publish */}
                  <View style={styles.storyInlineActionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.storyActionSecondaryBtn,
                        { backgroundColor: cardSurface, borderColor },
                      ]}
                      onPress={() => persistQuiz(false)}
                      disabled={saving}
                    >
                      <Save size={15} color={primaryText} />
                      <Text style={[styles.storyActionSecondaryText, { color: primaryText }]}>
                        Save
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.storyActionSecondaryBtn,
                        { backgroundColor: cardSurface, borderColor },
                      ]}
                      onPress={() => setQuizPreviewMode(true)}
                      disabled={saving}
                    >
                      <Eye size={15} color={accentBlue} />
                      <Text style={[styles.storyActionSecondaryText, { color: accentBlue }]}>
                        Preview
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.storyActionPublishBtn}
                      onPress={() => persistQuiz(true)}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Send size={15} color="#FFFFFF" />
                          <Text style={styles.storyActionPublishText}>Publish</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          )}
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
  // ── SINGLE-PAGE BIBLE STORY CREATOR & 16:9 LIST THUMBNAILS ──
  storyThumb16x9List: {
    width: 96,
    aspectRatio: 16 / 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  singleStoryScroll: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  singlePageCanvas: {
    gap: 14,
  },
  storySectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 15,
    gap: 10,
  },
  singleFieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  singleFieldEyebrow: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  prominentTitleInput: {
    fontSize: 22,
    lineHeight: 28,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  inlineMetaInputsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,
  },
  compactMetaInput: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 12.5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  aspectRequiredPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  aspectRequiredText: {
    fontSize: 10,
    fontWeight: '800',
  },
  storyUpload16x9Box: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeThumbOverlay: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
  },
  changeThumbOverlayText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  uploadPlaceholderInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 5,
  },
  uploadIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  uploadPlaceholderTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  uploadPlaceholderSub: {
    fontSize: 11.5,
    textAlign: 'center',
  },
  readTimeCounter: {
    marginLeft: 'auto',
    fontSize: 11,
    fontWeight: '600',
  },
  storyPaperBody: {
    gap: 12,
  },
  editorDropCapHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  editorDropCapFrame: {
    width: 52,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  editorDropCapGlowCircle: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    opacity: 0.7,
  },
  editorDropCapGlyph: {
    fontSize: 48,
    lineHeight: 54,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '900',
    includeFontPadding: false,
  },
  editorDropCapHintTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  editorDropCapHintSub: {
    fontSize: 11,
    marginTop: 2,
  },
  storyBodyTextArea: {
    minHeight: 190,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15.5,
    lineHeight: 24,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  storyTeluguOptionalArea: {
    minHeight: 74,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 2,
  },
  storyInlineActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
  },
  storyActionSecondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  storyActionSecondaryText: {
    fontSize: 13,
    fontWeight: '700',
  },
  storyActionPublishBtn: {
    flex: 1.4,
    height: 48,
    borderRadius: 999,
    backgroundColor: '#7C3AED',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  storyActionPublishText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  // ── BILINGUAL QUIZ CREATOR & REVIEW STYLES ──
  quizModeSwitch: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    gap: 6,
  },
  quizModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    borderRadius: 11,
  },
  quizModeTabText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  quizDocUploadCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizReviewBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  quizReviewBannerText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
  },
  quizHintRight: {
    marginLeft: 'auto',
    fontSize: 11,
    fontWeight: '600',
  },
  quizQCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  quizQHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  quizQNumberPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  quizQNumberText: {
    color: '#D97706',
    fontSize: 11.5,
    fontWeight: '800',
  },
  quizTranslateMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  quizTranslateMiniText: {
    fontSize: 11,
    fontWeight: '700',
  },
  quizDeleteQBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizFieldInput: {
    borderRadius: 11,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 13.5,
    lineHeight: 19,
  },
  quizOptionPairCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  quizOptionLetterCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizOptionLetterText: {
    fontSize: 12,
    fontWeight: '900',
  },
  quizOptionSubInput: {
    fontSize: 13,
    paddingVertical: 3,
    borderBottomWidth: 1,
  },
  quizMaxReachedNote: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 6,
  },
});
