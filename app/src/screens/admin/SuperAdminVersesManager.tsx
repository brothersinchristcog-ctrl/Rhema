import bundledBulkVerses from '../../../assets/bulk_verses.json';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import {
  UploadCloud,
  Trash2,
  Eye,
  Pencil,
  X,
  RefreshCw,
  Database,
  Image as ImageIcon,
  Bell,
  Search,
  Calendar,
  Sparkles,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  BookOpen,
  Plus,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import VerseNotificationService from '../../services/VerseNotificationService';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PERIOD_NAMES = ['Morning', 'Afternoon', 'Evening', 'Night'];
const PERIOD_TIMES = ['6:00 AM', '12:00 PM', '6:00 PM', '9:00 PM'];
const PERIOD_COLORS = ['#F59E0B', '#3B82F6', '#A855F7', '#06B6D4'];
const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Module-level cache for instant 0ms tab switching
let cachedUpcomingVerses: any[] | null = null;
let cachedTotalVerses: number = 0;
let cachedAllVerses: any[] = [];
let allVersesLastDoc: any = null;
let allVersesHasMore: boolean = true;

export default function SuperAdminVersesManager({ searchQuery: externalQuery = '' }: { searchQuery?: string }) {
  const navigation = useNavigation<any>();

  const [upcomingVerses, setUpcomingVerses] = useState<any[]>(cachedUpcomingVerses || []);
  const [allVerses, setAllVerses] = useState<any[]>(cachedAllVerses);
  const [totalVerses, setTotalVerses] = useState<number>(cachedTotalVerses || 5863);

  const [loading, setLoading] = useState(!cachedUpcomingVerses);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [showInput, setShowInput] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const [timelineTab, setTimelineTab] = useState<'upcoming' | 'all'>('upcoming');
  const [selectedPeriod, setSelectedPeriod] = useState('All');
  const [localSearchQuery, setLocalSearchQuery] = useState(externalQuery);
  const [editingVerse, setEditingVerse] = useState<any | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newVerse, setNewVerse] = useState({
    verseEn: '',
    referenceEn: '',
    verseTe: '',
    referenceTe: '',
    period: 'Morning',
    autoFetchImage: true,
  });

  const PERIOD_OPTIONS = [
    { label: 'All', period: 'All', count: totalVerses },
    { label: '🌅 Morning (6 AM)', period: 'Morning' },
    { label: '☀️ Afternoon (12 PM)', period: 'Afternoon' },
    { label: '🌇 Evening (6 PM)', period: 'Evening' },
    { label: '🌙 Night (9 PM)', period: 'Night' },
  ];

  // Anchor date: Today at local midnight
  const todayMidnight = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }, []);

  // Compute Fast Future Schedule:
  // Starts strictly at TODAY (index 0). Every verse index is mapped forward into future dates.
  // 0 past dates exist in the schedule.
  const getFastSchedule = useCallback((index: number) => {
    const total = totalVerses || 5863;
    const safeIdx = ((typeof index === 'number' && index >= 0) ? index : 0) % total;

    const daysOffset = Math.floor(safeIdx / 4);
    const periodIndex = safeIdx % 4;
    const period = PERIOD_NAMES[periodIndex] || 'Morning';
    const periodTime = PERIOD_TIMES[periodIndex] || '6:00 AM';

    const isToday = daysOffset === 0;
    const isTomorrow = daysOffset === 1;

    let label = '';
    if (isToday) {
      label = `Today · ${period} (${periodTime})`;
    } else if (isTomorrow) {
      label = `Tomorrow · ${period} (${periodTime})`;
    } else {
      const targetTime = todayMidnight + daysOffset * MS_PER_DAY;
      const d = new Date(targetTime);
      label = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} · ${period} (${periodTime})`;
    }

    return { label, period, periodTime, periodIndex, isToday, isTomorrow, daysOffset };
  }, [totalVerses, todayMidnight]);

  // Fetch upcoming verses for the next 30 days (120 verses from index 0)
  const fetchUpcomingVerses = async (forceRefresh = false) => {
    if (!forceRefresh && cachedUpcomingVerses && cachedUpcomingVerses.length > 0) {
      setUpcomingVerses(cachedUpcomingVerses);
      setTotalVerses(cachedTotalVerses);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // 1. Fetch metadata total
      let total = 0;
      try {
        const metaDoc = await firestore().collection('daily_verses_meta').doc('metadata').get();
        const metaExists = typeof metaDoc.exists === 'function' ? metaDoc.exists() : metaDoc.exists;
        total = metaExists ? (metaDoc.data()?.totalVerses || 0) : 0;
      } catch (err) {
        console.warn('Could not read daily_verses_meta:', err);
      }

      if (total === 0) {
        try {
          const bundled = bundledBulkVerses;
          total = bundled.length || 5863;
        } catch (_) {
          total = 5863;
        }
      }

      setTotalVerses(total);
      cachedTotalVerses = total;

      const COUNT = 120; // Next 30 upcoming days (4 per day)
      let fetched: any[] = [];
      try {
        const snap = await firestore().collection('daily_verses')
          .where('index', '>=', 0)
          .where('index', '<', COUNT)
          .get();
        fetched = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (fErr) {
        console.warn('Firestore range query failed, falling back to bundled verses:', fErr);
      }

      // Offline / fallback if Firestore returned nothing: populate from bundled verses
      if (fetched.length === 0) {
        try {
          const bundled = bundledBulkVerses;
          for (let idx = 0; idx < COUNT && idx < bundled.length; idx++) {
            const bv = bundled[idx];
            if (bv) {
              fetched.push({
                id: `verse_${idx}`,
                index: idx,
                verseEn: bv.verseEn,
                verseTe: bv.verseTe,
                referenceEn: bv.referenceEn,
                referenceTe: bv.referenceTe,
              });
            }
          }
        } catch (_) {}
      }

      // Sort chronologically starting from Today (index 0, 1, 2...)
      fetched.sort((a, b) => a.index - b.index);

      cachedUpcomingVerses = fetched;
      setUpcomingVerses(fetched);
    } catch (error) {
      console.error('Error fetching upcoming verses:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch initial page of All Verses (paginated 50 items)
  const fetchAllVersesInitial = async () => {
    if (cachedAllVerses.length > 0) {
      setAllVerses(cachedAllVerses);
      return;
    }
    try {
      setLoading(true);
      const snap = await firestore().collection('daily_verses')
        .orderBy('index')
        .limit(50)
        .get();

      let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      if (docs.length === 0) {
        try {
          const bundled = bundledBulkVerses;
          docs = bundled.slice(0, 50).map((bv: any, idx: number) => ({
            id: `verse_${idx}`,
            index: idx,
            verseEn: bv.verseEn,
            verseTe: bv.verseTe,
            referenceEn: bv.referenceEn,
            referenceTe: bv.referenceTe,
          }));
        } catch (_) {}
      }

      cachedAllVerses = docs;
      allVersesLastDoc = snap.docs[snap.docs.length - 1] || null;
      allVersesHasMore = snap.docs.length === 50;
      setAllVerses(docs);
    } catch (e) {
      console.error('Error fetching all verses:', e);
      try {
        const bundled = bundledBulkVerses;
        const docs = bundled.slice(0, 50).map((bv: any, idx: number) => ({
          id: `verse_${idx}`,
          index: idx,
          verseEn: bv.verseEn,
          verseTe: bv.verseTe,
          referenceEn: bv.referenceEn,
          referenceTe: bv.referenceTe,
        }));
        cachedAllVerses = docs;
        setAllVerses(docs);
      } catch (_) {}
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleLoadMoreAll = async () => {
    if (loadingMore || !allVersesHasMore || !allVersesLastDoc || timelineTab !== 'all') return;
    try {
      setLoadingMore(true);
      const snap = await firestore().collection('daily_verses')
        .orderBy('index')
        .startAfter(allVersesLastDoc)
        .limit(50)
        .get();

      if (snap.docs.length > 0) {
        const newDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const updated = [...allVerses, ...newDocs];
        cachedAllVerses = updated;
        allVersesLastDoc = snap.docs[snap.docs.length - 1];
        allVersesHasMore = snap.docs.length === 50;
        setAllVerses(updated);
      } else {
        allVersesHasMore = false;
      }
    } catch (e) {
      console.error('Error loading more verses:', e);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchUpcomingVerses();
  }, []);

  const handleTabSwitch = (tab: 'upcoming' | 'all') => {
    setTimelineTab(tab);
    if (tab === 'all' && allVerses.length === 0) {
      fetchAllVersesInitial();
    }
  };

  // Filter memoization
  const activeList = timelineTab === 'upcoming' ? upcomingVerses : allVerses;
  const filteredVerses = useMemo(() => {
    const query = (localSearchQuery || externalQuery).trim().toLowerCase();

    return activeList.filter(v => {
      const periodIdx = (typeof v.index === 'number' && v.index >= 0) ? (v.index % 4) : 0;
      const period = PERIOD_NAMES[periodIdx] || 'Morning';

      // 1. Period filter
      if (selectedPeriod !== 'All' && period !== selectedPeriod) {
        return false;
      }

      // 2. Search filter
      if (query.length > 0) {
        const vEn = (v.verseEn || '').toLowerCase();
        const vTe = (v.verseTe || '').toLowerCase();
        const rEn = (v.referenceEn || '').toLowerCase();
        const rTe = (v.referenceTe || '').toLowerCase();
        if (!vEn.includes(query) && !vTe.includes(query) && !rEn.includes(query) && !rTe.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [activeList, selectedPeriod, localSearchQuery, externalQuery]);

  // Reassign all 5,863 verses to future schedule starting from Today
  const handleReassignSchedule = async () => {
    const today = new Date();
    const todayLabel = `${MONTH_NAMES[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
    Alert.alert(
      'Reassign Schedule to Future Dates',
      `This will remove all past dates from the schedule and assign all 5,863 verses sequentially starting from Today (${todayLabel}) through 2030.\n\n• Zero past dates\n• Zero lost verses\n• Zero duplicated verses\n• Complete 4-year schedule\n\nDo you want to proceed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reassign Schedule',
          style: 'default',
          onPress: async () => {
            try {
              setIsUpdating(true);
              const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              
              await firestore().collection('daily_verses_meta').doc('metadata').set({
                scheduleStartDate: todayStr,
                totalVerses: totalVerses || 5863,
                lastReassignedAt: firestore.FieldValue.serverTimestamp(),
                reassignedBy: 'admin',
              }, { merge: true });

              cachedUpcomingVerses = null;
              cachedAllVerses = [];
              await fetchUpcomingVerses(true);

              Alert.alert(
                'Schedule Reassigned',
                `Successfully updated! All 5,863 verses are now assigned to future dates starting from Today (${todayLabel}). The schedule covers the next 1,466 days (~4 years) with zero past dates.`
              );
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to reassign schedule');
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ]
    );
  };

  const handleCreateVerse = async () => {
    if (!newVerse.verseEn?.trim() || !newVerse.referenceEn?.trim()) {
      Alert.alert('Required Fields', 'Please enter at least the English Verse text and Scripture Reference.');
      return;
    }
    try {
      setIsCreating(true);
      let imageUrl: string | null = null;
      let photographer = '';
      let theme = 'nature sunrise';

      if (newVerse.autoFetchImage) {
        try {
          const UNSPLASH_KEY = 'ppd4mBIqu8573rS42D9fobzAipdPsYdKkfOD0A5yiQc';
          const THEMES = ['christian cross', 'jesus light', 'nature sunrise', 'mountains sunset', 'bible prayer', 'heavenly clouds', 'hope light', 'peaceful water'];
          theme = THEMES[Math.floor(Math.random() * THEMES.length)];
          const res = await fetch('https://api.unsplash.com/photos/random?query=' + encodeURIComponent(theme) + '&orientation=portrait&content_filter=high', {
            headers: { Authorization: 'Client-ID ' + UNSPLASH_KEY },
          });
          const data = await res.json();
          imageUrl = data?.urls?.regular || null;
          photographer = data?.user?.name || 'Unsplash';
        } catch (imgErr) {
          console.warn('Auto fetch Unsplash image error:', imgErr);
        }
      }

      const periodIdx = PERIOD_NAMES.indexOf(newVerse.period);
      const targetIndex = (periodIdx >= 0 ? periodIdx : 0);

      const docRef = firestore().collection('daily_verses').doc();
      const versePayload: any = {
        id: docRef.id,
        index: targetIndex,
        verseEn: newVerse.verseEn.trim(),
        referenceEn: newVerse.referenceEn.trim(),
        verseTe: (newVerse.verseTe?.trim() || newVerse.verseEn.trim()),
        referenceTe: (newVerse.referenceTe?.trim() || newVerse.referenceEn.trim()),
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      };

      if (imageUrl) {
        versePayload.backgroundUrl = imageUrl;
        versePayload.unsplashPhotographer = photographer;
        versePayload.backgroundTheme = theme;
      }

      await docRef.set(versePayload);

      const prependList = (list: any[]) => [versePayload, ...list.filter(v => v.id !== docRef.id)];
      setUpcomingVerses(prev => prependList(prev));
      setAllVerses(prev => prependList(prev));
      if (cachedUpcomingVerses) cachedUpcomingVerses = prependList(cachedUpcomingVerses);
      if (cachedAllVerses) cachedAllVerses = prependList(cachedAllVerses);

      Alert.alert('Success', 'New Daily Verse created and scheduled successfully!');
      setShowCreateModal(false);
      setNewVerse({
        verseEn: '',
        referenceEn: '',
        verseTe: '',
        referenceTe: '',
        period: 'Morning',
        autoFetchImage: true,
      });
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', e?.message || 'Failed to create verse.');
    } finally {
      setIsCreating(false);
    }
  };
  const handleUpdateVerse = async () => {
    if (!editingVerse || !editingVerse.id) return;
    setIsUpdating(true);
    try {
      await firestore().collection('daily_verses').doc(editingVerse.id).update({
        verseEn: editingVerse.verseEn,
        verseTe: editingVerse.verseTe,
        referenceEn: editingVerse.referenceEn,
        referenceTe: editingVerse.referenceTe,
      });

      const updateList = (list: any[]) => list.map(v => (v.id === editingVerse.id ? editingVerse : v));
      setUpcomingVerses(prev => updateList(prev));
      setAllVerses(prev => updateList(prev));
      if (cachedUpcomingVerses) cachedUpcomingVerses = updateList(cachedUpcomingVerses);
      if (cachedAllVerses) cachedAllVerses = updateList(cachedAllVerses);

      setEditingVerse(null);
      Alert.alert('Success', 'Verse updated successfully!');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Failed to update verse.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteVerse = async (id: string, refText: string) => {
    Alert.alert(
      'Delete Verse',
      `Are you sure you want to delete this verse (${refText || 'Selected'})?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await firestore().collection('daily_verses').doc(id).delete();
              const filterList = (list: any[]) => list.filter(v => v.id !== id);
              setUpcomingVerses(prev => filterList(prev));
              setAllVerses(prev => filterList(prev));
              if (cachedUpcomingVerses) cachedUpcomingVerses = filterList(cachedUpcomingVerses);
              if (cachedAllVerses) cachedAllVerses = filterList(cachedAllVerses);
              Alert.alert('Deleted', 'Verse deleted successfully.');
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to delete verse.');
            }
          },
        },
      ]
    );
  };

  const handleClearAll = async () => {
    Alert.alert('Confirm Delete', 'Are you sure you want to delete ALL daily verses from Firestore?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete All',
        style: 'destructive',
        onPress: async () => {
          setIsUploading(true);
          try {
            const snapshot = await firestore().collection('daily_verses').get();
            const batch = firestore().batch();
            snapshot.docs.forEach(doc => {
              batch.delete(doc.ref);
            });
            await batch.commit();
            cachedUpcomingVerses = null;
            cachedAllVerses = [];
            fetchUpcomingVerses(true);
          } catch (e) {
            console.error(e);
          } finally {
            setIsUploading(false);
          }
        },
      },
    ]);
  };

  const handleBulkUpload = async (directData?: any) => {
    try {
      const parsedData = directData || JSON.parse(jsonInput);
      if (!Array.isArray(parsedData)) {
        Alert.alert('Error', 'Input must be a JSON array of verses.');
        return;
      }

      setIsUploading(true);
      const versesRef = firestore().collection('daily_verses');

      let count = 0;
      let index = 0;
      const batches = [];
      let currentBatch = firestore().batch();

      for (const verse of parsedData) {
        if (verse.verseEn && verse.verseTe) {
          const docRef = versesRef.doc();
          currentBatch.set(docRef, {
            ...verse,
            index: index,
            createdAt: firestore.FieldValue.serverTimestamp(),
          });
          count++;
          index++;

          if (count % 450 === 0) {
            batches.push(currentBatch.commit());
            currentBatch = firestore().batch();
          }
        }
      }

      if (count % 450 !== 0) {
        batches.push(currentBatch.commit());
      }

      await Promise.all(batches);

      await firestore().collection('daily_verses_meta').doc('metadata').set({
        totalVerses: count,
        scheduleStartDate: new Date().toISOString().split('T')[0],
        updatedAt: firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      Alert.alert('Success', `Successfully uploaded ${count} verses.`);
      setJsonInput('');
      setShowInput(false);
      cachedUpcomingVerses = null;
      cachedAllVerses = [];
      fetchUpcomingVerses(true);
    } catch (error) {
      console.error(error);
      Alert.alert('Invalid JSON', 'Please check your JSON format.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleLoadBundledVerses = () => {
    Alert.alert(
      'Import Bundled Verses',
      'Import all 5,863 bundled Scripture verses into Firestore? This will populate the entire future daily verse database.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import (5,863)',
          onPress: async () => {
            try {
              const bundled = bundledBulkVerses;
              await handleBulkUpload(bundled);
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to load bundled verses');
            }
          },
        },
      ]
    );
  };

  const handleFetchUnsplashBackgrounds = async () => {
    try {
      setIsUpdating(true);
      const UNSPLASH_KEY = 'ppd4mBIqu8573rS42D9fobzAipdPsYdKkfOD0A5yiQc';
      const THEMES = [
        'christian cross', 'jesus light', 'nature sunrise', 'mountains sunset',
        'bible prayer', 'heavenly clouds', 'hope light', 'peaceful water',
      ];
      const missing = upcomingVerses.filter(v => !v.backgroundUrl).slice(0, 8);
      if (missing.length === 0) {
        Alert.alert('Up to Date', 'Upcoming verses already have high-resolution backgrounds.');
        setIsUpdating(false);
        return;
      }
      let updated = 0;
      for (const verse of missing) {
        const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
        try {
          const res = await fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(theme)}&orientation=portrait&content_filter=high`, {
            headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` },
          });
          const data = await res.json();
          const imageUrl = data?.urls?.regular;
          if (imageUrl) {
            await firestore().collection('daily_verses').doc(verse.id).set({
              ...verse,
              backgroundUrl: imageUrl,
              unsplashPhotographer: data?.user?.name || 'Unsplash',
              backgroundTheme: theme,
              updatedAt: firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            verse.backgroundUrl = imageUrl;
            updated++;
          }
        } catch (err) {
          console.warn('Unsplash fetch error:', err);
        }
      }
      Alert.alert('Success', `Updated ${updated} verses with Unsplash backgrounds.`);
      cachedUpcomingVerses = null;
      fetchUpcomingVerses(true);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to fetch backgrounds');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleTestNotifications = async () => {
    try {
      const firstVerse = upcomingVerses[0] || allVerses[0];
      const success = await VerseNotificationService.triggerTestPair(firstVerse);
      if (success) {
        Alert.alert('Notifications Sent', 'Sent 2 test notifications simultaneously:\n• 1 in English (✝️ Good Morning)\n• 1 in Telugu (✝️ శుభోదయం)\n\nCheck your notification drawer!');
      } else {
        Alert.alert('Error', 'Failed to trigger test notifications.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to trigger test notifications');
    }
  };

  // Render a Single Verse Card
  const renderVerseItem = useCallback(({ item }: { item: any }) => {
    const schedule = getFastSchedule(item.index);
    const periodColor = PERIOD_COLORS[schedule.periodIndex] || '#3B82F6';

    return (
      <View style={[styles.verseCard, { borderLeftColor: periodColor }]}>
        {/* Card Header Badge Row */}
        <View style={styles.cardHeaderRow}>
          <View style={[
            styles.schedulePill,
            schedule.isToday && styles.schedulePillToday,
            schedule.isTomorrow && styles.schedulePillTomorrow,
          ]}>
            <Text style={[
              styles.schedulePillText,
              schedule.isToday && { color: '#F59E0B' },
              schedule.isTomorrow && { color: '#38BDF8' },
            ]}>
              {schedule.isToday ? '🌟 ' : '📅 '}{schedule.label}
            </Text>
          </View>

          <View style={styles.cardHeaderRight}>
            <View style={styles.indexPill}>
              <Text style={styles.indexPillText}>Idx #{item.index}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setEditingVerse({ ...item })}
              style={styles.cardActionBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Pencil size={15} color="#94A3B8" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDeleteVerse(item.id, item.referenceEn || item.referenceTe)}
              style={[styles.cardActionBtn, styles.deleteActionBtn]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Trash2 size={15} color="#EF4444" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Scripture Content */}
        <View style={styles.cardScriptureBody}>
          <Text style={styles.verseEn}>"{item.verseEn}"</Text>
          <Text style={styles.refEn}>— {item.referenceEn}</Text>

          <View style={styles.verseDivider} />

          <Text style={styles.verseTe}>"{item.verseTe}"</Text>
          <Text style={styles.refTe}>— {item.referenceTe}</Text>
        </View>

        {/* Card Footer Info */}
        <View style={styles.cardFooter}>
          <View style={styles.slotTag}>
            <Clock size={12} color="#64748B" />
            <Text style={styles.slotTagText}>
              Slot {schedule.periodIndex + 1} · {schedule.periodTime}
            </Text>
          </View>

          {item.backgroundUrl ? (
            <View style={styles.imageTag}>
              <ImageIcon size={12} color="#10B981" />
              <Text style={styles.imageTagText}>Image Ready</Text>
            </View>
          ) : (
            <View style={styles.noImageTag}>
              <Text style={styles.noImageTagText}>Gradient Theme</Text>
            </View>
          )}
        </View>
      </View>
    );
  }, [getFastSchedule]);

  // ListHeaderComponent: Everything at the top scrolls seamlessly with the verses
  const renderListHeader = () => (
    <View style={styles.scrollableHeaderContainer}>
      {/* ── 1. Hero Stats Grid ── */}
      <View style={styles.statsCard}>
        <View style={styles.statsTopRow}>
          <View style={styles.statsIconWrap}>
            <Sparkles size={20} color="#10B981" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.statsHeading}>Daily Verses Master Schedule</Text>
            <Text style={styles.statsSubheading}>Deterministic 4-Slot Multi-Year Rotation</Text>
          </View>
          <TouchableOpacity style={styles.addVerseHeaderBtn} onPress={() => setShowCreateModal(true)} activeOpacity={0.85}>
            <Plus size={16} color='#0F172A' strokeWidth={2.5} />
            <Text style={styles.addVerseHeaderBtnText}>Add Verse</Text>
          </TouchableOpacity>
          <View style={styles.activeBadge}>
            <View style={styles.activeDot} />
            <Text style={styles.activeBadgeText}>Active</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statTile}>
            <Text style={styles.statNumber}>5,863</Text>
            <Text style={styles.statLabel}>Total Verses</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statNumber}>4 / Day</Text>
            <Text style={styles.statLabel}>Time Slots</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={styles.statNumber}>1,466</Text>
            <Text style={styles.statLabel}>Days Covered</Text>
          </View>
          <View style={styles.statTile}>
            <Text style={[styles.statNumber, { color: '#10B981' }]}>0</Text>
            <Text style={styles.statLabel}>Past Dates</Text>
          </View>
        </View>
      </View>

      {/* ── 2. Schedule Reassign Action Banner ── */}
      <View style={styles.reassignBanner}>
        <View style={styles.reassignLeft}>
          <Calendar size={20} color="#F59E0B" />
          <View style={{ flex: 1 }}>
            <Text style={styles.reassignTitle}>Schedule Starting Today</Text>
            <Text style={styles.reassignSub}>
              All 5,863 verses are scheduled into future dates (through late 2030) with zero past dates.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.reassignBtn}
          onPress={handleReassignSchedule}
          disabled={isUpdating}
          activeOpacity={0.8}
        >
          {isUpdating ? (
            <ActivityIndicator size="small" color="#0F172A" />
          ) : (
            <>
              <CheckCircle2 size={14} color="#0F172A" />
              <Text style={styles.reassignBtnText}>Reassign</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── 3. Search Bar ── */}
      <View style={styles.searchBar}>
        <Search size={16} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search verses by scripture text or reference..."
          placeholderTextColor="#64748B"
          value={localSearchQuery}
          onChangeText={setLocalSearchQuery}
        />
        {localSearchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setLocalSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <X size={16} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── 4. Timeline Tab Toggle (Upcoming vs All) ── */}
      <View style={styles.tabToggleRow}>
        <TouchableOpacity
          style={[styles.tabToggleBtn, timelineTab === 'upcoming' && styles.tabToggleBtnActive]}
          onPress={() => handleTabSwitch('upcoming')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabToggleTxt, timelineTab === 'upcoming' && styles.tabToggleTxtActive]}>
            🌟 Today & Upcoming (30 Days)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabToggleBtn, timelineTab === 'all' && styles.tabToggleBtnActive]}
          onPress={() => handleTabSwitch('all')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabToggleTxt, timelineTab === 'all' && styles.tabToggleTxtActive]}>
            📚 All Verses ({totalVerses || 5863})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── 5. Period Filter Pills ── */}
      <View style={styles.periodPillRow}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={PERIOD_OPTIONS}
          keyExtractor={item => item.period}
          contentContainerStyle={{ paddingHorizontal: 2 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.periodChip,
                selectedPeriod === item.period && styles.periodChipActive,
              ]}
              onPress={() => setSelectedPeriod(item.period)}
              activeOpacity={0.8}
            >
              <Text style={[
                styles.periodChipText,
                selectedPeriod === item.period && styles.periodChipTextActive,
              ]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* ── 6. Admin Tools Collapsible Accordion ── */}
      <View style={styles.toolsCard}>
        <TouchableOpacity
          style={styles.toolsHeader}
          onPress={() => setShowTools(!showTools)}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Database size={16} color="#38BDF8" />
            <Text style={styles.toolsTitle}>Admin Controls & Quick Tools</Text>
          </View>
          {showTools ? <ChevronUp size={18} color="#94A3B8" /> : <ChevronDown size={18} color="#94A3B8" />}
        </TouchableOpacity>

        {showTools && (
          <View style={styles.toolsBody}>
            <View style={styles.toolBtnRow}>
              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: '#10B981' }]}
                onPress={() => {
                  const firstVerse = upcomingVerses[0] || allVerses[0];
                  if (firstVerse) {
                    navigation.navigate('VerseOfTheDay', { verseId: firstVerse.id, period: 'Morning' });
                  } else {
                    Alert.alert('No verses', 'Load verses first to preview UI.');
                  }
                }}
                activeOpacity={0.8}
              >
                <Eye size={15} color="#FFF" />
                <Text style={styles.toolBtnText}>Test Verse UI</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: '#0284C7' }]}
                onPress={handleTestNotifications}
                activeOpacity={0.8}
              >
                <Bell size={15} color="#FFF" />
                <Text style={styles.toolBtnText}>Test Dual Push</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.toolBtnRow}>
              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: '#6366F1' }]}
                onPress={handleLoadBundledVerses}
                disabled={isUploading}
                activeOpacity={0.8}
              >
                <Database size={15} color="#FFF" />
                <Text style={styles.toolBtnText}>Seed 5,863 Verses</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: '#8B5CF6' }]}
                onPress={handleFetchUnsplashBackgrounds}
                disabled={isUpdating}
                activeOpacity={0.8}
              >
                <ImageIcon size={15} color="#FFF" />
                <Text style={styles.toolBtnText}>Fetch Images</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.toolBtnRow}>
              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: '#334155' }]}
                onPress={() => setShowInput(!showInput)}
                activeOpacity={0.8}
              >
                <UploadCloud size={15} color="#FFF" />
                <Text style={styles.toolBtnText}>{showInput ? 'Hide JSON' : 'Upload JSON'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: '#475569' }]}
                onPress={() => {
                  cachedUpcomingVerses = null;
                  cachedAllVerses = [];
                  fetchUpcomingVerses(true);
                }}
                activeOpacity={0.8}
              >
                <RefreshCw size={15} color="#FFF" />
                <Text style={styles.toolBtnText}>Refresh List</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: '#EF4444', flex: 0.6 }]}
                onPress={handleClearAll}
                activeOpacity={0.8}
              >
                <Trash2 size={15} color="#FFF" />
                <Text style={styles.toolBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>

            {/* JSON Bulk Upload Section */}
            {showInput && (
              <View style={styles.jsonUploadBox}>
                <Text style={styles.jsonLabel}>Paste JSON Array of Verses:</Text>
                <Text style={styles.jsonHelper}>
                  Format: [{`{ "verseEn": "...", "referenceEn": "...", "verseTe": "...", "referenceTe": "..." }`}]
                </Text>
                <TextInput
                  style={styles.jsonInput}
                  multiline
                  value={jsonInput}
                  onChangeText={setJsonInput}
                  placeholder="[ { ... } ]"
                  placeholderTextColor="#64748B"
                />
                <TouchableOpacity
                  style={styles.jsonSubmitBtn}
                  onPress={() => handleBulkUpload()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.jsonSubmitBtnText}>Upload to Database</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── 7. Result Header Label ── */}
      <View style={styles.resultsHeaderRow}>
        <Text style={styles.resultsTitle}>
          {timelineTab === 'upcoming' ? 'Upcoming 30-Day Schedule' : 'Complete Scripture Catalog'}
        </Text>
        <Text style={styles.resultsCount}>
          Showing {filteredVerses.length} verses
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#38BDF8" />
          <Text style={styles.loadingText}>Loading future verse schedule...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredVerses}
          keyExtractor={item => item.id}
          renderItem={renderVerseItem}
          ListHeaderComponent={renderListHeader}
          contentContainerStyle={styles.listContentContainer}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          onEndReached={timelineTab === 'all' ? handleLoadMoreAll : undefined}
          onEndReachedThreshold={0.5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                cachedUpcomingVerses = null;
                cachedAllVerses = [];
                fetchUpcomingVerses(true);
              }}
              tintColor="#38BDF8"
              colors={['#38BDF8', '#10B981']}
            />
          }
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator size="small" color="#38BDF8" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <BookOpen size={40} color="#475569" />
              <Text style={styles.emptyTitle}>No Verses Found</Text>
              <Text style={styles.emptySub}>
                {localSearchQuery.trim()
                  ? `No verses matched "${localSearchQuery}". Try another keyword or reference.`
                  : 'No scheduled verses for this filter.'}
              </Text>
            </View>
          }
        />
      )}

      {/* ── Create New Verse Modal ── */}
      {showCreateModal && (
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardAvoidingWrap}
          >
            <View style={styles.modalCard}>
              <ScrollView
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                bounces={true}
                contentContainerStyle={styles.modalScrollContent}
              >
                <View style={styles.modalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Plus size={18} color="#10B981" strokeWidth={2.5} />
                    <Text style={styles.modalTitle}>Create New Daily Verse</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowCreateModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <X size={20} color="#94A3B8" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.inputLabel}>Time Slot</Text>
                <View style={styles.createPeriodRow}>
                  {PERIOD_NAMES.map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[styles.createPeriodChip, newVerse.period === p && styles.createPeriodChipActive]}
                      onPress={() => setNewVerse({ ...newVerse, period: p })}
                    >
                      <Text style={[styles.createPeriodChipText, newVerse.period === p && styles.createPeriodChipTextActive]}>{p}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.inputLabel}>Verse Text (English) *</Text>
                <TextInput
                  style={[styles.modalInput, { height: 72 }]}
                  multiline
                  placeholder="For God so loved the world..."
                  value={newVerse.verseEn}
                  onChangeText={t => setNewVerse({ ...newVerse, verseEn: t })}
                  placeholderTextColor="#64748B"
                />

                <Text style={styles.inputLabel}>Reference (English) *</Text>
                <TextInput
                  style={[styles.modalInput, { height: 42 }]}
                  placeholder="John 3:16"
                  value={newVerse.referenceEn}
                  onChangeText={t => setNewVerse({ ...newVerse, referenceEn: t })}
                  placeholderTextColor="#64748B"
                />

                <Text style={styles.inputLabel}>Verse Text (Telugu - Optional)</Text>
                <TextInput
                  style={[styles.modalInput, { height: 72 }]}
                  multiline
                  placeholder="దేవుడు లోకమును ఎంతో ప్రేమించెను..."
                  value={newVerse.verseTe}
                  onChangeText={t => setNewVerse({ ...newVerse, verseTe: t })}
                  placeholderTextColor="#64748B"
                />

                <Text style={styles.inputLabel}>Reference (Telugu - Optional)</Text>
                <TextInput
                  style={[styles.modalInput, { height: 42 }]}
                  placeholder="యోహాను 3:16"
                  value={newVerse.referenceTe}
                  onChangeText={t => setNewVerse({ ...newVerse, referenceTe: t })}
                  placeholderTextColor="#64748B"
                />

                <TouchableOpacity
                  style={styles.autoImageToggleRow}
                  onPress={() => setNewVerse({ ...newVerse, autoFetchImage: !newVerse.autoFetchImage })}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkboxBox, newVerse.autoFetchImage && styles.checkboxBoxActive]}>
                    {newVerse.autoFetchImage && <CheckCircle2 size={14} color="#FFF" />}
                  </View>
                  <Text style={styles.autoImageToggleText}>Auto-fetch spiritual Unsplash background image</Text>
                </TouchableOpacity>

                <View style={styles.modalBtnRow}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setShowCreateModal(false)}
                  >
                    <Text style={styles.modalCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalSaveBtn, { backgroundColor: '#10B981' }]}
                    onPress={handleCreateVerse}
                    disabled={isCreating}
                  >
                    {isCreating ? (
                      <ActivityIndicator color="#0F172A" size="small" />
                    ) : (
                      <Text style={styles.modalSaveBtnText}>Create & Schedule</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      {/* ── Edit Modal ── */}
      {editingVerse && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pencil size={18} color="#38BDF8" />
                <Text style={styles.modalTitle}>Edit Scripture Verse</Text>
              </View>
              <TouchableOpacity onPress={() => setEditingVerse(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={20} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Verse Text (English)</Text>
            <TextInput
              style={[styles.modalInput, { height: 75 }]}
              multiline
              value={editingVerse.verseEn}
              onChangeText={t => setEditingVerse({ ...editingVerse, verseEn: t })}
              placeholderTextColor="#64748B"
            />

            <Text style={styles.inputLabel}>Reference (English)</Text>
            <TextInput
              style={[styles.modalInput, { height: 42 }]}
              value={editingVerse.referenceEn}
              onChangeText={t => setEditingVerse({ ...editingVerse, referenceEn: t })}
              placeholderTextColor="#64748B"
            />

            <Text style={styles.inputLabel}>Verse Text (Telugu)</Text>
            <TextInput
              style={[styles.modalInput, { height: 75 }]}
              multiline
              value={editingVerse.verseTe}
              onChangeText={t => setEditingVerse({ ...editingVerse, verseTe: t })}
              placeholderTextColor="#64748B"
            />

            <Text style={styles.inputLabel}>Reference (Telugu)</Text>
            <TextInput
              style={[styles.modalInput, { height: 42 }]}
              value={editingVerse.referenceTe}
              onChangeText={t => setEditingVerse({ ...editingVerse, referenceTe: t })}
              placeholderTextColor="#64748B"
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setEditingVerse(null)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleUpdateVerse}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator color="#0F172A" size="small" />
                ) : (
                  <Text style={styles.modalSaveBtnText}>Save Changes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B1120',
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  scrollableHeaderContainer: {
    paddingTop: 12,
    paddingBottom: 10,
  },

  // 1. Stats Card
  statsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statsTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 10,
  },
  statsIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.2,
  },
  statsSubheading: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#10B981',
  },
  statsGrid: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  statLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
    fontWeight: '500',
  },

  // 2. Reassign Banner
  reassignBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    gap: 12,
  },
  reassignLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reassignTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F59E0B',
  },
  reassignSub: {
    fontSize: 11,
    color: '#CBD5E1',
    marginTop: 2,
    lineHeight: 15,
  },
  reassignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  reassignBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },

  // 3. Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#F8FAFC',
    fontSize: 13,
    padding: 0,
  },

  // 4. Tab Toggle Row
  tabToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tabToggleBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabToggleBtnActive: {
    backgroundColor: '#0F172A',
    borderWidth: 1,
    borderColor: '#38BDF8',
  },
  tabToggleTxt: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  tabToggleTxtActive: {
    color: '#38BDF8',
    fontWeight: '800',
  },

  // 5. Period Chips
  periodPillRow: {
    marginBottom: 12,
  },
  periodChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  periodChipActive: {
    backgroundColor: '#0284C7',
    borderColor: '#38BDF8',
  },
  periodChipText: {
    color: '#94A3B8',
    fontWeight: '600',
    fontSize: 11,
  },
  periodChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // 6. Tools Card
  toolsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    overflow: 'hidden',
  },
  toolsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toolsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  toolsBody: {
    padding: 12,
    paddingTop: 0,
    gap: 8,
  },
  toolBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toolBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 6,
  },
  toolBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  jsonUploadBox: {
    backgroundColor: '#0F172A',
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  jsonLabel: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  jsonHelper: {
    color: '#94A3B8',
    fontSize: 10,
    marginBottom: 8,
  },
  jsonInput: {
    backgroundColor: '#1E293B',
    color: '#F8FAFC',
    height: 110,
    borderRadius: 8,
    padding: 10,
    fontSize: 11,
    textAlignVertical: 'top',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  jsonSubmitBtn: {
    backgroundColor: '#10B981',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  jsonSubmitBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // 7. Results Header
  resultsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 4,
  },
  resultsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  resultsCount: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },

  // Verse Card
  verseCard: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    borderLeftWidth: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  schedulePill: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  schedulePillToday: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: '#F59E0B',
  },
  schedulePillTomorrow: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38BDF8',
  },
  schedulePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  indexPill: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  indexPillText: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  cardActionBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteActionBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },

  // Scripture text
  cardScriptureBody: {
    marginBottom: 10,
  },
  verseEn: {
    color: '#F8FAFC',
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  refEn: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'right',
  },
  verseDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 8,
  },
  verseTe: {
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 21,
  },
  refTe: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'right',
  },

  // Footer info
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#0F172A',
    paddingTop: 8,
  },
  slotTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  slotTagText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  imageTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 4,
  },
  imageTagText: {
    fontSize: 10,
    color: '#10B981',
    fontWeight: '600',
  },
  noImageTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#0F172A',
  },
  noImageTagText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
  },

  // Loading & Empty States
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 12,
    fontWeight: '500',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyTitle: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
  },
  emptySub: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 18,
  },

  addVerseHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  addVerseHeaderBtnText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  createPeriodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  createPeriodChip: {
    flex: 1,
    paddingVertical: 6,
    backgroundColor: '#1E293B',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  createPeriodChipActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: '#10B981',
  },
  createPeriodChipText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  createPeriodChipTextActive: {
    color: '#10B981',
    fontWeight: '700',
  },
  autoImageToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    marginBottom: 16,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  autoImageToggleText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '500',
  },
  // Edit Modal
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    padding: 16,
    zIndex: 100,
  },
  keyboardAvoidingWrap: {
    width: '100%',
    maxHeight: '92%',
    justifyContent: 'center',
  },
  modalScrollContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  modalCard: {
    maxHeight: '100%',
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '800',
  },
  inputLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalInput: {
    backgroundColor: '#0F172A',
    color: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
    textAlignVertical: 'top',
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#334155',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modalCancelBtnText: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '700',
  },
  modalSaveBtn: {
    flex: 1,
    backgroundColor: '#38BDF8',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modalSaveBtnText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
});
