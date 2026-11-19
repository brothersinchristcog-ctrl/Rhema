import React, { useState, useEffect, useMemo, useContext } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  Dimensions,
  Image,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
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
  X,
  Palette,
  Heart,
  Calendar,
  Share2,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useAuth } from '../../../context/AuthContext';
import { AdminTabContext } from '../../../context/AdminTabContext';
import KidsMinistryService from '../../../services/KidsMinistryService';
import {
  KidsBibleStory,
  KidsQuiz,
  KidsWorshipSong,
  KidsMemoryVerse,
  KidsActivityItem,
  KidsDailyPromise,
  KidsBibleStoryPage,
  KidsQuizQuestion,
} from '../../../types/KidsMinistryTypes';

const { width } = Dimensions.get('window');

export type ContentCategory =
  | 'stories'
  | 'quizzes'
  | 'songs'
  | 'memory_verses'
  | 'activities'
  | 'coloring'
  | 'daily_promises';

interface CategoryConfig {
  id: ContentCategory;
  title: string;
  titleTelugu: string;
  icon: any;
  color: string;
  bgLight: string;
  description: string;
}

const CATEGORIES: CategoryConfig[] = [
  {
    id: 'stories',
    title: 'Bible Stories',
    titleTelugu: 'బైబిల్ కథలు',
    icon: BookOpen,
    color: '#3B82F6',
    bgLight: 'rgba(59, 130, 246, 0.14)',
    description: 'Bilingual illustrated stories with reflection questions',
  },
  {
    id: 'quizzes',
    title: 'Bible Quizzes',
    titleTelugu: 'బైబిల్ క్విజ్‌లు',
    icon: Award,
    color: '#F59E0B',
    bgLight: 'rgba(245, 158, 11, 0.14)',
    description: 'Interactive multiple choice trivia with Star Badges',
  },
  {
    id: 'songs',
    title: 'Worship Songs',
    titleTelugu: 'ఆరాధన పాటలు',
    icon: Music,
    color: '#EC4899',
    bgLight: 'rgba(236, 72, 153, 0.14)',
    description: 'Action songs & praise dances with audio / video links',
  },
  {
    id: 'memory_verses',
    title: 'Memory Verses',
    titleTelugu: 'కంఠస్థ వాక్యములు',
    icon: Sparkles,
    color: '#10B981',
    bgLight: 'rgba(16, 185, 129, 0.14)',
    description: 'Weekly scripture verses with bilingual translations',
  },
  {
    id: 'activities',
    title: 'Bible Activities',
    titleTelugu: 'బైబిల్ యాక్టివిటీస్',
    icon: Layers,
    color: '#8B5CF6',
    bgLight: 'rgba(139, 92, 246, 0.14)',
    description: 'Crafts, beanbag toss, object lessons & games',
  },
  {
    id: 'coloring',
    title: 'Coloring Sheets',
    titleTelugu: 'కలరింగ్ షీట్స్',
    icon: Palette,
    color: '#06B6D4',
    bgLight: 'rgba(6, 182, 212, 0.14)',
    description: 'Printable and digital coloring templates for kids',
  },
  {
    id: 'daily_promises',
    title: 'Daily Promises',
    titleTelugu: 'రోజువారీ వాగ్దానాలు',
    icon: Heart,
    color: '#F43F5E',
    bgLight: 'rgba(244, 63, 94, 0.14)',
    description: 'Daily scripture affirmations & faith declarations',
  },
];

interface AdminKidsContentCenterProps {
  navigation?: any;
  onBack?: () => void;
}

export default function AdminKidsContentCenter({ navigation, onBack }: AdminKidsContentCenterProps) {
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const churchId = member?.churchId || 'rhema';
  const adminTabCtx = useContext(AdminTabContext);

  const [activeCategory, setActiveCategory] = useState<ContentCategory>('stories');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [refreshing, setRefreshing] = useState(false);

  // Content collections
  const [stories, setStories] = useState<KidsBibleStory[]>([]);
  const [quizzes, setQuizzes] = useState<KidsQuiz[]>([]);
  const [songs, setSongs] = useState<KidsWorshipSong[]>([]);
  const [verses, setVerses] = useState<KidsMemoryVerse[]>([]);
  const [activities, setActivities] = useState<KidsActivityItem[]>([]);
  const [promises, setPromises] = useState<KidsDailyPromise[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal forms
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editorType, setEditorType] = useState<ContentCategory | null>(null);
  const [previewItem, setPreviewItem] = useState<{ type: ContentCategory; item: any } | null>(null);
  const [saving, setSaving] = useState(false);

  // ── LOAD REALTIME COLLECTIONS ──
  useEffect(() => {
    const unsubStories = KidsMinistryService.subscribeToStories(churchId, list => setStories(list));
    const unsubQuizzes = KidsMinistryService.subscribeToQuizzes(churchId, list => setQuizzes(list));
    const unsubSongs = KidsMinistryService.subscribeToSongs(churchId, list => setSongs(list));
    const unsubVerses = KidsMinistryService.subscribeToMemoryVerses(churchId, list => setVerses(list));
    const unsubActivities = KidsMinistryService.subscribeToActivities(churchId, list => {
      setActivities(list);
      setLoading(false);
    });
    const unsubPromises = KidsMinistryService.subscribeToDailyPromises(churchId, list => setPromises(list));

    return () => {
      unsubStories?.();
      unsubQuizzes?.();
      unsubSongs?.();
      unsubVerses?.();
      unsubActivities?.();
      unsubPromises?.();
    };
  }, [churchId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [s, q, so, v, a, p] = await Promise.all([
        KidsMinistryService.getOrInitStories(churchId),
        KidsMinistryService.getOrInitQuizzes(churchId),
        KidsMinistryService.getOrInitSongs(churchId),
        KidsMinistryService.getOrInitMemoryVerses(churchId),
        KidsMinistryService.getOrInitActivities(churchId),
        KidsMinistryService.getOrInitDailyPromises(churchId),
      ]);
      setStories(s);
      setQuizzes(q);
      setSongs(so);
      setVerses(v);
      setActivities(a);
      setPromises(p);
    } catch (e) {
      console.warn('[AdminKidsContentCenter] Refresh error:', e);
    } finally {
      setRefreshing(false);
    }
  };

  const handleBackPress = () => {
    if (onBack) {
      onBack();
    } else if (navigation?.canGoBack && navigation.canGoBack()) {
      navigation.goBack();
    } else if (adminTabCtx?.goBack) {
      adminTabCtx.goBack();
    } else if (adminTabCtx?.setTabByName) {
      adminTabCtx.setTabByName('Kids Ministry');
    }
  };

  // ── COUNTS ──
  const coloringList = useMemo(() => activities.filter(a => a.category === 'coloring'), [activities]);
  const activityList = useMemo(() => activities.filter(a => a.category !== 'coloring'), [activities]);

  const counts: Record<ContentCategory, number> = {
    stories: stories.length,
    quizzes: quizzes.length,
    songs: songs.length,
    memory_verses: verses.length,
    activities: activityList.length,
    coloring: coloringList.length,
    daily_promises: promises.length,
  };

  // ── FILTERED DATA ──
  const currentList = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    let data: any[] = [];
    if (activeCategory === 'stories') data = stories;
    else if (activeCategory === 'quizzes') data = quizzes;
    else if (activeCategory === 'songs') data = songs;
    else if (activeCategory === 'memory_verses') data = verses;
    else if (activeCategory === 'activities') data = activityList;
    else if (activeCategory === 'coloring') data = coloringList;
    else if (activeCategory === 'daily_promises') data = promises;

    return data.filter(item => {
      // Filter status
      if (filterStatus === 'published' && item.isPublished === false) return false;
      if (filterStatus === 'draft' && item.isPublished !== false) return false;
      // Search query
      if (!q) return true;
      const title = (item.title || item.verseEnglish || item.promiseEnglish || '').toLowerCase();
      const telugu = (item.titleTelugu || item.verseTelugu || item.promiseTelugu || '').toLowerCase();
      const ref = (item.scriptureRef || '').toLowerCase();
      return title.includes(q) || telugu.includes(q) || ref.includes(q);
    });
  }, [
    activeCategory,
    searchQuery,
    filterStatus,
    stories,
    quizzes,
    songs,
    verses,
    activityList,
    coloringList,
    promises,
  ]);

  // ── TOGGLE PUBLISH ──
  const handleTogglePublish = async (item: any) => {
    const newStatus = item.isPublished === false;
    try {
      if (activeCategory === 'stories') {
        await KidsMinistryService.updateStory(churchId, item.id, { isPublished: newStatus });
      } else if (activeCategory === 'quizzes') {
        await KidsMinistryService.updateQuiz(churchId, item.id, { isPublished: newStatus });
      } else if (activeCategory === 'songs') {
        await KidsMinistryService.updateSong(churchId, item.id, { isPublished: newStatus });
      } else if (activeCategory === 'memory_verses') {
        await KidsMinistryService.updateMemoryVerse(churchId, item.id, { isPublished: newStatus });
      } else if (activeCategory === 'activities' || activeCategory === 'coloring') {
        await KidsMinistryService.updateActivity(churchId, item.id, { isPublished: newStatus });
      } else if (activeCategory === 'daily_promises') {
        await KidsMinistryService.updateDailyPromise(churchId, item.id, { isPublished: newStatus });
      }
      Alert.alert(newStatus ? 'Published! ✅' : 'Set to Draft', `Status updated successfully.`);
    } catch (e: any) {
      Alert.alert('Update Failed', e.message);
    }
  };

  // ── DELETE ITEM ──
  const handleDeleteItem = (item: any) => {
    const title = item.title || item.verseEnglish || item.promiseEnglish || 'Item';
    Alert.alert('Delete Content', `Are you sure you want to delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (activeCategory === 'stories') await KidsMinistryService.deleteStory(churchId, item.id);
            else if (activeCategory === 'quizzes') await KidsMinistryService.deleteQuiz(churchId, item.id);
            else if (activeCategory === 'songs') await KidsMinistryService.deleteSong(churchId, item.id);
            else if (activeCategory === 'memory_verses') await KidsMinistryService.deleteMemoryVerse(churchId, item.id);
            else if (activeCategory === 'activities' || activeCategory === 'coloring') await KidsMinistryService.deleteActivity(churchId, item.id);
            else if (activeCategory === 'daily_promises') await KidsMinistryService.deleteDailyPromise(churchId, item.id);
          } catch (e: any) {
            Alert.alert('Error', e.message);
          }
        },
      },
    ]);
  };

  // Active Category Meta
  const currentCatMeta = CATEGORIES.find(c => c.id === activeCategory) || CATEGORIES[0];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0F1D" />

      {/* ── TOP NAV HEADER (CLEAR BACK BUTTON TO KIDS HUB) ── */}
      <View style={styles.topNavBar}>
        <TouchableOpacity
          onPress={handleBackPress}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color="#FFFFFF" strokeWidth={2.6} />
        </TouchableOpacity>

        <View style={styles.navTitles}>
          <Text style={styles.navMainTitle}>Bible Learning Center</Text>
          <Text style={styles.navSubTitle}>Sunday School LMS & CMS Dashboard</Text>
        </View>

        <TouchableOpacity
          style={styles.newActionBtn}
          onPress={() => {
            setEditingItem(null);
            setEditorType(activeCategory);
          }}
          activeOpacity={0.85}
        >
          <Plus size={16} color="#FFFFFF" strokeWidth={2.8} />
          <Text style={styles.newActionBtnText}>Create New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.mainScroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#3B82F6" />}
      >
        {/* ── HERO SECTION ── */}
        <View style={styles.heroCard}>
          <View style={styles.heroBadgeRow}>
            <View style={styles.heroPill}>
              <Sparkles size={11} color="#60A5FA" />
              <Text style={styles.heroPillText}>RHEMA KIDS LMS STUDIO</Text>
            </View>
            <View style={styles.statusLivePill}>
              <View style={styles.liveDot} />
              <Text style={styles.liveDotText}>Live Content Sync</Text>
            </View>
          </View>

          <Text style={styles.heroHeading}>Bible Learning Center</Text>
          <Text style={styles.heroSubheading}>
            Manage Bible Stories, Quizzes, Worship Songs, Memory Verses and Kids Learning Activities in bilingual Telugu and English.
          </Text>

          {/* 3 Executive Stat Tiles */}
          <View style={styles.statsTilesRow}>
            <View style={[styles.statTile, { borderColor: '#1E3A8A' }]}>
              <View style={[styles.statIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <BookOpen size={16} color="#60A5FA" />
              </View>
              <View>
                <Text style={styles.statTileNum}>{stories.length}</Text>
                <Text style={styles.statTileLabel}>Bible Stories</Text>
              </View>
            </View>

            <View style={[styles.statTile, { borderColor: '#78350F' }]}>
              <View style={[styles.statIconBox, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                <Award size={16} color="#FBBF24" />
              </View>
              <View>
                <Text style={[styles.statTileNum, { color: '#FBBF24' }]}>{quizzes.length}</Text>
                <Text style={styles.statTileLabel}>Interactive Quizzes</Text>
              </View>
            </View>

            <View style={[styles.statTile, { borderColor: '#831843' }]}>
              <View style={[styles.statIconBox, { backgroundColor: 'rgba(236, 72, 153, 0.15)' }]}>
                <Music size={16} color="#F472B6" />
              </View>
              <View>
                <Text style={[styles.statTileNum, { color: '#F472B6' }]}>{songs.length}</Text>
                <Text style={styles.statTileLabel}>Worship Songs</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 7 CONTENT CATEGORY NAVIGATION TABS (HORIZONTALLY SCROLLABLE) ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>CONTENT CATEGORIES</Text>
          <Text style={styles.sectionCount}>{counts[activeCategory]} Items in {currentCatMeta.title}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryScroll}
          keyboardShouldPersistTaps="handled"
        >
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            const isSelected = activeCategory === cat.id;
            const count = counts[cat.id];

            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryCard,
                  isSelected && { borderColor: cat.color, backgroundColor: '#131C31' },
                ]}
                onPress={() => setActiveCategory(cat.id)}
                activeOpacity={0.8}
              >
                <View style={[styles.categoryIconWrap, { backgroundColor: cat.bgLight }]}>
                  <Icon size={18} color={cat.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.categoryTitle, isSelected && { color: '#FFFFFF', fontWeight: '800' }]}>
                    {cat.title}
                  </Text>
                  <Text style={styles.categoryTelugu}>{cat.titleTelugu}</Text>
                </View>
                <View style={[styles.categoryBadge, isSelected && { backgroundColor: cat.color }]}>
                  <Text style={[styles.categoryBadgeText, isSelected && { color: '#FFFFFF' }]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── SEARCH & FILTER CONTROLS ── */}
        <View style={styles.searchFilterBox}>
          <View style={styles.searchInputRow}>
            <Search size={16} color="#64748B" />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={`Search ${currentCatMeta.title} by name, scripture or Telugu...`}
              placeholderTextColor="#64748B"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <X size={16} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.filterPillsRow}>
            <TouchableOpacity
              style={[styles.filterPill, filterStatus === 'all' && styles.filterPillActive]}
              onPress={() => setFilterStatus('all')}
            >
              <Text style={[styles.filterPillText, filterStatus === 'all' && styles.filterPillTextActive]}>
                All ({counts[activeCategory]})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, filterStatus === 'published' && styles.filterPillActive]}
              onPress={() => setFilterStatus('published')}
            >
              <Text style={[styles.filterPillText, filterStatus === 'published' && styles.filterPillTextActive]}>
                Published
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, filterStatus === 'draft' && styles.filterPillActive]}
              onPress={() => setFilterStatus('draft')}
            >
              <Text style={[styles.filterPillText, filterStatus === 'draft' && styles.filterPillTextActive]}>
                Drafts
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── CONTENT ITEMS LIST ── */}
        {loading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading {currentCatMeta.title}...</Text>
          </View>
        ) : currentList.length === 0 ? (
          <View style={styles.emptyStateBox}>
            <View style={[styles.emptyIconCircle, { backgroundColor: currentCatMeta.bgLight }]}>
              <currentCatMeta.icon size={28} color={currentCatMeta.color} />
            </View>
            <Text style={styles.emptyTitle}>No {currentCatMeta.title} Found</Text>
            <Text style={styles.emptySub}>
              {searchQuery ? 'Try matching another search term or filter' : `Tap "+ Create New" above to add the first ${currentCatMeta.title.slice(0, -1)}.`}
            </Text>
            <TouchableOpacity
              style={[styles.emptyCreateBtn, { backgroundColor: currentCatMeta.color }]}
              onPress={() => {
                setEditingItem(null);
                setEditorType(activeCategory);
              }}
            >
              <Plus size={16} color="#FFFFFF" strokeWidth={2.8} />
              <Text style={styles.emptyCreateBtnText}>Create New {currentCatMeta.title.slice(0, -1)}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cardsGrid}>
            {currentList.map(item => {
              const isPub = item.isPublished !== false;
              const title = item.title || item.verseEnglish || item.promiseEnglish;
              const titleTelugu = item.titleTelugu || item.verseTelugu || item.promiseTelugu;
              const emoji = item.coverEmoji || (activeCategory === 'stories' ? '📖' : activeCategory === 'quizzes' ? '🏆' : activeCategory === 'songs' ? '🎵' : '✨');

              return (
                <View key={item.id} style={styles.itemCard}>
                  {/* Left Icon / Image */}
                  <View style={[styles.itemCoverBox, { backgroundColor: currentCatMeta.bgLight }]}>
                    {item.coverImageUrl || item.thumbnailUrl ? (
                      <Image source={{ uri: item.coverImageUrl || item.thumbnailUrl }} style={styles.itemCoverImg} />
                    ) : (
                      <Text style={{ fontSize: 24 }}>{emoji}</Text>
                    )}
                  </View>

                  {/* Body */}
                  <View style={{ flex: 1 }}>
                    <View style={styles.cardHeaderRow}>
                      <Text style={styles.itemTitle} numberOfLines={1}>{title}</Text>
                      <TouchableOpacity
                        style={[styles.statusBadge, isPub ? styles.statusBadgePub : styles.statusBadgeDraft]}
                        onPress={() => handleTogglePublish(item)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.statusBadgeText, isPub ? styles.statusBadgeTextPub : styles.statusBadgeTextDraft]}>
                          {isPub ? 'Published' : 'Draft'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {titleTelugu ? (
                      <Text style={styles.itemTeluguTitle} numberOfLines={1}>{titleTelugu}</Text>
                    ) : null}

                    {/* Meta info depending on category */}
                    <View style={styles.metaRow}>
                      {item.scriptureRef ? (
                        <Text style={styles.itemScripture}>{item.scriptureRef}</Text>
                      ) : null}

                      {activeCategory === 'stories' && (
                        <Text style={styles.itemMeta}>· {item.pages?.length || 1} Pages</Text>
                      )}
                      {activeCategory === 'quizzes' && (
                        <Text style={styles.itemMeta}>· {item.questions?.length || 0} Questions · +{item.pointsReward || 50} pts</Text>
                      )}
                      {activeCategory === 'songs' && item.youtubeVideoId && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Video size={11} color="#EF4444" />
                          <Text style={styles.itemMeta}>YouTube ID: {item.youtubeVideoId}</Text>
                        </View>
                      )}
                      {activeCategory === 'memory_verses' && (
                        <Text style={styles.itemMeta}>· Week {item.weekNumber || 1}</Text>
                      )}
                      {(activeCategory === 'activities' || activeCategory === 'coloring') && item.ageGroup && (
                        <Text style={styles.itemMeta}>· {item.ageGroup}</Text>
                      )}
                    </View>
                  </View>

                  {/* Actions (Preview / Edit / Delete) */}
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={styles.actionBtnPreview}
                      onPress={() => setPreviewItem({ type: activeCategory, item })}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Eye size={15} color="#60A5FA" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtnEdit}
                      onPress={() => {
                        setEditingItem(item);
                        setEditorType(activeCategory);
                      }}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Edit3 size={15} color="#34D399" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionBtnDelete}
                      onPress={() => handleDeleteItem(item)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Trash2 size={15} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── SIMPLE CONTENT PREVIEW MODAL ── */}
      {previewItem && (
        <View style={styles.previewBackdrop}>
          <View style={styles.previewCard}>
            <View style={styles.previewHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewTag}>{previewItem.type.toUpperCase()} PREVIEW</Text>
                <Text style={styles.previewTitle} numberOfLines={1}>
                  {previewItem.item.title || previewItem.item.verseEnglish || previewItem.item.promiseEnglish}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setPreviewItem(null)} style={styles.previewCloseBtn}>
                <X size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.previewBody}>
              <View style={styles.previewCoverBox}>
                <Text style={{ fontSize: 44 }}>{previewItem.item.coverEmoji || '📖'}</Text>
              </View>
              <Text style={styles.previewEng}>
                {previewItem.item.title || previewItem.item.verseEnglish || previewItem.item.promiseEnglish}
              </Text>
              <Text style={styles.previewTel}>
                {previewItem.item.titleTelugu || previewItem.item.verseTelugu || previewItem.item.promiseTelugu}
              </Text>
              {previewItem.item.scriptureRef && (
                <Text style={styles.previewRef}>Reference: {previewItem.item.scriptureRef}</Text>
              )}
              {previewItem.item.summary && (
                <Text style={styles.previewText}>{previewItem.item.summary}</Text>
              )}
              {previewItem.item.description && (
                <Text style={styles.previewText}>{previewItem.item.description}</Text>
              )}
              {previewItem.item.instructions && (
                <View style={styles.previewBox}>
                  <Text style={styles.previewBoxTitle}>Instructions:</Text>
                  <Text style={styles.previewText}>{previewItem.item.instructions}</Text>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.previewDismissBtn} onPress={() => setPreviewItem(null)}>
              <Text style={styles.previewDismissBtnText}>Close Preview</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1D',
  },
  topNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0F172A',
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  navTitles: {
    flex: 1,
  },
  navMainTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  navSubTitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  newActionBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: '#60A5FA',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  newActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  mainScroll: {
    padding: 16,
    paddingBottom: 50,
    gap: 16,
  },
  heroCard: {
    backgroundColor: '#0F172A',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    gap: 8,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  heroPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#93C5FD',
    letterSpacing: 0.8,
  },
  statusLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
  },
  liveDotText: {
    fontSize: 9.5,
    color: '#34D399',
    fontWeight: '700',
  },
  heroHeading: {
    fontSize: 21,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroSubheading: {
    fontSize: 12.5,
    color: '#94A3B8',
    lineHeight: 18,
  },
  statsTilesRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  statTile: {
    flex: 1,
    backgroundColor: '#131C31',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTileNum: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#60A5FA',
  },
  statTileLabel: {
    fontSize: 9.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1.2,
  },
  sectionCount: {
    fontSize: 11,
    color: '#60A5FA',
    fontWeight: '700',
  },
  categoryScroll: {
    gap: 8,
    paddingRight: 12,
  },
  categoryCard: {
    width: 155,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 8,
    position: 'relative',
  },
  categoryIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  categoryTelugu: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  categoryBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#1E293B',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  categoryBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#94A3B8',
  },
  searchFilterBox: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 10,
  },
  searchInputRow: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 12.5,
    padding: 0,
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  filterPillActive: {
    backgroundColor: '#2563EB',
    borderColor: '#3B82F6',
  },
  filterPillText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  centerLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  emptyStateBox: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 8,
  },
  emptyIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  emptySub: {
    fontSize: 11.5,
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 16,
  },
  emptyCreateBtn: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emptyCreateBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  cardsGrid: {
    gap: 10,
  },
  itemCard: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemCoverBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  itemCoverImg: {
    width: '100%',
    height: '100%',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  itemTeluguTitle: {
    fontSize: 11.5,
    color: '#93C5FD',
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  itemScripture: {
    fontSize: 10.5,
    color: '#FBBF24',
    fontWeight: '600',
  },
  itemMeta: {
    fontSize: 10.5,
    color: '#94A3B8',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
  },
  statusBadgePub: {
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
  },
  statusBadgeDraft: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  statusBadgeTextPub: {
    color: '#34D399',
  },
  statusBadgeTextDraft: {
    color: '#F87171',
  },
  cardActionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  actionBtnPreview: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnEdit: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDelete: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Preview
  previewBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 999,
  },
  previewCard: {
    backgroundColor: '#0F172A',
    borderRadius: 20,
    width: '100%',
    maxHeight: '80%',
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  previewTag: {
    fontSize: 10,
    fontWeight: '800',
    color: '#38BDF8',
    letterSpacing: 1,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  previewCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBody: {
    paddingVertical: 14,
    gap: 8,
    alignItems: 'center',
  },
  previewCoverBox: {
    width: 70,
    height: 70,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  previewEng: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  previewTel: {
    fontSize: 13,
    color: '#93C5FD',
    textAlign: 'center',
  },
  previewRef: {
    fontSize: 11,
    color: '#FBBF24',
    fontWeight: '700',
  },
  previewText: {
    fontSize: 12,
    color: '#CBD5E1',
    lineHeight: 18,
    textAlign: 'center',
  },
  previewBox: {
    width: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  previewBoxTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#93C5FD',
    marginBottom: 4,
  },
  previewDismissBtn: {
    marginTop: 10,
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  previewDismissBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
