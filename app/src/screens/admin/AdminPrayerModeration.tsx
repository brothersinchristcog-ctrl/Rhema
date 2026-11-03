import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Platform,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  Animated,
  KeyboardAvoidingView,
  Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Heart,
  CheckCircle,
  XCircle,
  ShieldAlert,
  Clock,
  User,
  ShieldCheck,
  CheckCircle2,
  MessageSquare,
  Trash2,
  AlertCircle,
  Plus,
  Send,
  MoreVertical,
  Megaphone,
  ChevronLeft,
  FileDown,
  BookOpen,
  Share2,
  MessageCircle,
  ChevronDown,
  Check,
  Search,
  X
, ArrowLeft } from 'lucide-react-native';
import { FlatList, Keyboard } from 'react-native';
import PrayerVerseService, { BibleBookItem } from '../../services/PrayerVerseService';
import FirestoreService from '../../services/FirestoreService';
import Theme from '../../theme/Theme';
import { useAuth } from '../../context/AuthContext';
import { useChurch } from '../../context/ChurchContext';
import { AdminTabContext } from '../../context/AdminTabContext';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { documentDirectory, copyAsync } from 'expo-file-system/legacy';

const { width } = Dimensions.get('window');

const COLORS = {
  ink: '#151C33',
  ink2: '#22304F',
  inkSoft: '#6B7593',
  parchment: '#F3EAD9',
  paper: '#FFFCF5',
  gold: '#A67C3D',
  goldDeep: '#8C6428',
  goldBright: '#F4C430',
  clay: '#A24B34',
  clayBg: '#F3E1D6',
  clayLine: '#E3C3B2',
  moss: '#3E6B52',
  mossBg: '#E6EFE7',
  rule: '#DED0AC',
};

const FONTS = {
  serif: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  sans: Platform.OS === 'ios' ? 'System' : 'sans-serif',
};


export default function AdminPrayerModeration({ navigation, route, routeParams }: any) {
  const { member } = useAuth();
  const { activeChurch } = useChurch();
  const { setActiveTab } = React.useContext(AdminTabContext);
  const adminName = member?.name || 'Administrator';
  const targetPrayerId = routeParams?.prayerId || routeParams?.requestId || route?.params?.prayerId || route?.params?.requestId;
  const scrollViewRef = useRef<ScrollView>(null);
  const [detailPrayer, setDetailPrayer] = useState<any | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const churchName = activeChurch?.name || 'Church';
  const churchLogo = activeChurch?.theme?.logoUrl || null;

  const [prayers, setPrayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showPostAs, setShowPostAs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [adminResponses, setAdminResponses] = useState<{[key: string]: string}>({});
  const [selectedVerses, setSelectedVerses] = useState<{ [id: string]: { reference: string; referenceTe?: string; text: string; textTe?: string } }>({});
  const [bcvSelections, setBcvSelections] = useState<{ [id: string]: { bookIndex: number; chapter: number; verse: string } }>({});
  const [loadingScripture, setLoadingScripture] = useState<{ [id: string]: boolean }>({});
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const modalScrollRef = useRef<ScrollView>(null);

  // BCV Selection Modal State
  const [bcvPicker, setBcvPicker] = useState<{
    visible: boolean;
    reqId: string;
    step: 'book' | 'chapter' | 'verse';
    selectedBookIndex: number;
    selectedChapter: number;
    selectedVerse: string;
    searchQuery: string;
    testamentFilter: 'ALL' | 'OT' | 'NT';
  }>({
    visible: false,
    reqId: '',
    step: 'book',
    selectedBookIndex: 49,
    selectedChapter: 4,
    selectedVerse: '6-7',
    searchQuery: '',
    testamentFilter: 'ALL',
  });

  // Track keyboard show/hide to make modal and scrolling 100% keyboard aware
  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardHeight(0);
      }
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const [successModalData, setSuccessModalData] = useState<{ visible: boolean; title: string; sub: string }>({ visible: false, title: '', sub: '' });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [closeConfirmId, setCloseConfirmId] = useState<string | null>(null);
  const [showTopMenu, setShowTopMenu] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const successAnim = React.useRef(new Animated.Value(0)).current;

  const triggerSuccess = (title: string, sub: string) => {
    setSuccessModalData({ visible: true, title, sub });
    Animated.spring(successAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 50,
      friction: 7
    }).start();
  };

  const closeSuccess = () => {
    Animated.timing(successAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true
    }).start(() => setSuccessModalData(prev => ({ ...prev, visible: false })));
  };

  const handleMemberSearch = async (query: string) => {
    setMemberSearchQuery(query);
    if (query.length < 3) {
      setMemberSearchResults([]);
      return;
    }
    setSearchingMembers(true);
    try {
      const results = await FirestoreService.searchMembers(query);
      setMemberSearchResults(results);
    } catch (error) {
      console.error('Member search error:', error);
    } finally {
      setSearchingMembers(false);
    }
  };

  const prayerCategories = [
    'Pray for me',
    'Pray for my family',
    'Pray for healing',
    'Pray for peace and strength',
    'Other (if necessary)'
  ];

  const [pastorRequest, setPastorRequest] = useState({
    en: '',
    te: '',
    category: 'Pray for me',
    postAs: adminName
  });

  // Update default postAs when member info loads
  useEffect(() => {
    if (member?.name) {
      setPastorRequest(prev => ({ ...prev, postAs: member.name }));
    }
  }, [member]);

  const postAsOptions = [
    adminName,
    'Church — Corporate',
    'Anonymous'
  ];

  const fetchPrayers = useCallback(async (isRefreshing = false) => {
    if (!isRefreshing) setLoading(true);
    try {
      const data = await FirestoreService.getPrayerRequests({ isAdmin: true });
      setPrayers(data);
    } catch (error) {
      console.error('Error fetching admin prayers:', error);
      Alert.alert('Error', 'Failed to load prayer requests from Salesforce.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPrayers();
  }, [fetchPrayers]);

  useEffect(() => {
    if (targetPrayerId) {
      const match = prayers.find(p => p.id === targetPrayerId);
      if (match) {
        setDetailPrayer(match);
        setDetailModalVisible(true);
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        FirestoreService.getPrayerRequestById(targetPrayerId).then((fetched: any) => {
          if (fetched && (fetched.text || fetched.request || fetched.requestEn || fetched.name || fetched.memberName)) {
            setDetailPrayer(fetched);
            setDetailModalVisible(true);
            setPrayers(prev => {
              if (prev.some(p => p.id === fetched.id)) return prev;
              return [fetched, ...prev];
            });
            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
          }
        }).catch(err => {
          console.warn('Could not fetch target prayer request directly:', err);
        });
      }
    }
  }, [targetPrayerId, prayers.length, routeParams?.timestamp, route?.params?.timestamp]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPrayers(true);
  };

  const handleApprove = async (id: string, responseText?: string, verseParam?: any) => {
    try {
      const verse = verseParam !== undefined ? verseParam : selectedVerses[id];
      if (responseText && responseText.trim()) {
        await FirestoreService.addPrayerComment(id, responseText.trim(), adminName);
      }
      await FirestoreService.markAsAnswered(id, responseText, adminName, true, verse);
      
      setAdminResponses(prev => {
        const next = {...prev};
        delete next[id];
        return next;
      });
      setSelectedVerses(prev => {
        const next = {...prev};
        delete next[id];
        return next;
      });
      
      // Immediately update local state to move to 'Processed'
      setPrayers(prev => prev.map(p => p.id === id ? {
        ...p,
        isAnswered: true,
        isPublic: true,
        bibleVerse: verse?.reference || p.bibleVerse,
        verseReference: verse?.reference || p.verseReference,
        verseText: verse?.text || p.verseText,
        verseTextTe: verse?.textTe || p.verseTextTe
      } : p));
      
      triggerSuccess('Approved!', 'Prayer request approved with biblical encouragement.');
    } catch (err) {
      Alert.alert('Error', 'Failed to update status.');
    }
  };

  const handleRespondPrivately = async (id: string, responseText?: string, verseParam?: any) => {
    try {
      const verse = verseParam !== undefined ? verseParam : selectedVerses[id];
      if (responseText && responseText.trim()) {
        await FirestoreService.addPrayerComment(id, responseText.trim(), adminName);
      }
      await FirestoreService.markAsAnswered(id, responseText, adminName, false, verse);
      
      setAdminResponses(prev => {
        const next = {...prev};
        delete next[id];
        return next;
      });
      setSelectedVerses(prev => {
        const next = {...prev};
        delete next[id];
        return next;
      });
      
      // Mark answered but keep private (isPublic stays false)
      setPrayers(prev => prev.map(p => p.id === id ? {
        ...p,
        isAnswered: true,
        bibleVerse: verse?.reference || p.bibleVerse,
        verseReference: verse?.reference || p.verseReference,
        verseText: verse?.text || p.verseText,
        verseTextTe: verse?.textTe || p.verseTextTe
      } : p));
      
      triggerSuccess('Responded! 🙏', 'Your private response & verse have been sent to the member.');
    } catch (err) {
      Alert.alert('Error', 'Failed to send response.');
    }
  };

  // ── Bible Scripture & Pastoral Response Helpers ──
  const allBibleBooks = React.useMemo(() => PrayerVerseService.getBooksList(), []);

  const handleOpenBookPicker = (reqId: string) => {
    const existing = bcvSelections[reqId];
    setBcvPicker({
      visible: true,
      reqId,
      step: 'book',
      selectedBookIndex: existing ? existing.bookIndex : 49,
      selectedChapter: existing ? existing.chapter : 1,
      selectedVerse: existing ? existing.verse : '1',
      searchQuery: '',
      testamentFilter: 'ALL',
    });
  };

  const handleOpenChapterPicker = (reqId: string) => {
    const existing = bcvSelections[reqId];
    setBcvPicker(prev => ({
      ...prev,
      visible: true,
      reqId,
      step: 'chapter',
      selectedBookIndex: existing ? existing.bookIndex : 49,
      selectedChapter: existing ? existing.chapter : 1,
      selectedVerse: existing ? existing.verse : '1',
      searchQuery: '',
    }));
  };

  const handleOpenVersePicker = (reqId: string) => {
    const existing = bcvSelections[reqId];
    setBcvPicker(prev => ({
      ...prev,
      visible: true,
      reqId,
      step: 'verse',
      selectedBookIndex: existing ? existing.bookIndex : 49,
      selectedChapter: existing ? existing.chapter : 1,
      selectedVerse: existing ? existing.verse : '1',
      searchQuery: '',
    }));
  };

  const handleSelectBookInPicker = (bookIndex: number) => {
    setBcvPicker(prev => ({
      ...prev,
      selectedBookIndex: bookIndex,
      selectedChapter: 1,
      selectedVerse: '1',
      step: 'chapter',
    }));
  };

  const handleSelectChapterInPicker = (chapter: number) => {
    setBcvPicker(prev => ({
      ...prev,
      selectedChapter: chapter,
      selectedVerse: '1',
      step: 'verse',
    }));
  };

  const handleSelectVerseInPicker = async (verse: string | number) => {
    const reqId = bcvPicker.reqId;
    const bookIndex = bcvPicker.selectedBookIndex;
    const chapter = bcvPicker.selectedChapter;
    const verseStr = String(verse).trim() || '1';

    setBcvSelections(prev => ({
      ...prev,
      [reqId]: { bookIndex, chapter, verse: verseStr }
    }));

    setBcvPicker(prev => ({ ...prev, visible: false }));

    // Automatically lookup Scripture in English and Telugu!
    setLoadingScripture(prev => ({ ...prev, [reqId]: true }));
    try {
      const result = await PrayerVerseService.lookupScripture(bookIndex, chapter, verseStr);
      setSelectedVerses(prev => ({
        ...prev,
        [reqId]: {
          reference: result.reference,
          referenceTe: result.referenceTe,
          text: result.textEn,
          textTe: result.textTe,
        }
      }));
    } catch (err) {
      console.warn('Scripture lookup error:', err);
    } finally {
      setLoadingScripture(prev => ({ ...prev, [reqId]: false }));
    }
  };

  const handleClearVerse = (reqId: string) => {
    setSelectedVerses(prev => {
      const next = { ...prev };
      delete next[reqId];
      return next;
    });
    setBcvSelections(prev => {
      const next = { ...prev };
      delete next[reqId];
      return next;
    });
  };

  const handleShareMotivationalVerse = async (req: any, preferredChannel: 'whatsapp' | 'native' = 'whatsapp') => {
    if (!req) return;
    const reqId = req.id;
    let verse = selectedVerses[reqId] || (req.bibleVerse ? { reference: req.bibleVerse, referenceTe: req.verseReferenceTe, text: req.verseText, textTe: req.verseTextTe } : null);

    if (!verse || !verse.reference) {
      Alert.alert('Verse Required', 'Please select a Bible Book, Chapter, and Verse before sharing.');
      return;
    }

    const pastoralText = adminResponses[reqId] || req.lastAdminResponse || '';
    const memberName = req.name || req.authorName || req.memberName || 'Beloved Member';
    const prayerText = req.text || req.request || req.requestEn || '';
    const formattedMsg = PrayerVerseService.formatMotivationalMessage(
      memberName,
      prayerText,
      verse,
      pastoralText,
      churchName
    );

    const phone = req.phone || req.contactPhone;
    if (preferredChannel === 'whatsapp' && phone) {
      await PrayerVerseService.shareViaWhatsApp(phone, formattedMsg);
    } else {
      await PrayerVerseService.shareNative('Encouraging Scripture & Prayer Blessing', formattedMsg);
    }
  };

  const renderModerationWorkflow = (item: any, isDetailModal = false) => {
    if (!item?.id) return null;
    const reqId = item.id;
    const isPublic = item.isPublic;
    const currentVerse = selectedVerses[reqId];
    const currentBCV = bcvSelections[reqId];
    const currentReply = adminResponses[reqId] || '';
    const phone = item.phone || item.contactPhone;

    const currentBook = currentBCV !== undefined && currentBCV.bookIndex !== undefined
      ? allBibleBooks[currentBCV.bookIndex]
      : null;

    return (
      <View style={[styles.workflowContainer, isDetailModal && { backgroundColor: '#FFFFFF', borderWidth: 0, padding: 0 }]}>
        {isPublic && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Megaphone size={14} color="#D97706" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#D97706' }}>
              User requested this prayer to be PUBLIC
            </Text>
          </View>
        )}

        {/* ── 1. Bible Scripture Selection Fields (Book, Chapter, Verse) ── */}
        <View style={styles.sectionBox}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <BookOpen size={16} color="#92400E" />
              <Text style={styles.sectionTitle}>1. Bible Scripture Selection</Text>
            </View>
            {(currentVerse?.reference || currentBCV) && (
              <TouchableOpacity
                onPress={() => handleClearVerse(reqId)}
                style={styles.clearBtn}
              >
                <Text style={styles.clearBtnTxt}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Book, Chapter, Verse Selection Row */}
          <View style={styles.bcvRow}>
            {/* Book Selector */}
            <TouchableOpacity
              style={styles.bcvField}
              onPress={() => handleOpenBookPicker(reqId)}
              activeOpacity={0.7}
            >
              <Text style={styles.bcvLabel}>Bible Book</Text>
              <View style={styles.bcvBox}>
                <Text style={[styles.bcvVal, !currentBook && styles.bcvPlaceholder]} numberOfLines={1}>
                  {currentBook ? `${currentBook.nameEn} (${currentBook.nameTe})` : 'Select Book'}
                </Text>
                <ChevronDown size={14} color="#64748B" />
              </View>
            </TouchableOpacity>

            {/* Chapter Selector */}
            <TouchableOpacity
              style={styles.bcvFieldSmall}
              onPress={() => handleOpenChapterPicker(reqId)}
              activeOpacity={0.7}
            >
              <Text style={styles.bcvLabel}>Chapter</Text>
              <View style={styles.bcvBox}>
                <Text style={[styles.bcvVal, !currentBCV && styles.bcvPlaceholder]}>
                  {currentBCV ? `Ch ${currentBCV.chapter}` : 'Ch'}
                </Text>
                <ChevronDown size={14} color="#64748B" />
              </View>
            </TouchableOpacity>

            {/* Verse Selector */}
            <TouchableOpacity
              style={styles.bcvFieldSmall}
              onPress={() => handleOpenVersePicker(reqId)}
              activeOpacity={0.7}
            >
              <Text style={styles.bcvLabel}>Verse</Text>
              <View style={styles.bcvBox}>
                <Text style={[styles.bcvVal, !currentBCV && styles.bcvPlaceholder]}>
                  {currentBCV ? `v. ${currentBCV.verse}` : 'Verse'}
                </Text>
                <ChevronDown size={14} color="#64748B" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Automatic Scripture Display (English & Telugu) */}
          {loadingScripture[reqId] ? (
            <View style={styles.scriptureLoadingBox}>
              <ActivityIndicator size="small" color="#92400E" />
              <Text style={styles.scriptureLoadingTxt}>Looking up Holy Scripture in English & Telugu...</Text>
            </View>
          ) : currentVerse?.reference ? (
            <View style={styles.scriptureDisplayCard}>
              {/* Reference Title Header */}
              <View style={styles.scriptureRefHeader}>
                <BookOpen size={14} color="#92400E" />
                <Text style={styles.scriptureRefEn}>{currentVerse.reference}</Text>
                {currentVerse.referenceTe ? (
                  <Text style={styles.scriptureRefTe}>· {currentVerse.referenceTe}</Text>
                ) : null}
              </View>

              {/* English Scripture Words */}
              <View style={styles.scriptureTextBlock}>
                <Text style={styles.scriptureLangLabel}>ENGLISH (Holy Bible):</Text>
                <TextInput
                  style={styles.scriptureTextInput}
                  multiline
                  value={currentVerse.text}
                  onChangeText={(txt) => setSelectedVerses(prev => ({
                    ...prev,
                    [reqId]: { ...(prev[reqId] || { reference: '' }), text: txt }
                  }))}
                  placeholder="English scripture text..."
                  placeholderTextColor="#94A3B8"
                />
              </View>

              {/* Telugu Scripture Words */}
              {currentVerse.textTe ? (
                <View style={[styles.scriptureTextBlock, { borderTopWidth: 1, borderTopColor: '#FEF3C7', paddingTop: 8, marginTop: 8 }]}>
                  <Text style={[styles.scriptureLangLabel, { color: '#854D0E' }]}>TELUGU (పరిశుద్ధ గ్రంథము):</Text>
                  <TextInput
                    style={[styles.scriptureTextInput, { fontStyle: 'italic', color: '#713F12' }]}
                    multiline
                    value={currentVerse.textTe}
                    onChangeText={(txt) => setSelectedVerses(prev => ({
                      ...prev,
                      [reqId]: { ...(prev[reqId] || { reference: '' }), textTe: txt }
                    }))}
                    placeholder="Telugu scripture text..."
                    placeholderTextColor="#94A3B8"
                  />
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.selectScriptureHint}>
              Select Book, Chapter, and Verse above to display scripture text automatically in English & Telugu.
            </Text>
          )}
        </View>

        {/* ── 2. Admin Personal Prayer Response ── */}
        <View style={[styles.sectionBox, { marginTop: 12 }]}>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MessageSquare size={15} color="#1D4ED8" />
              <Text style={[styles.sectionTitle, { color: '#1D4ED8' }]}>2. Personal Prayer Response</Text>
            </View>
          </View>

          <Text style={styles.inputFieldSubtitle}>
            Enter your personal pastoral message, prayer, or encouragement for this member:
          </Text>

          <TextInput
            style={styles.personalResponseInput}
            placeholder="Type your personal prayer response to the member..."
            placeholderTextColor="#94A3B8"
            value={currentReply}
            onChangeText={(txt) => setAdminResponses(prev => ({ ...prev, [reqId]: txt }))}
            multiline
            onFocus={() => {
              if (isDetailModal) {
                setTimeout(() => {
                  modalScrollRef.current?.scrollToEnd({ animated: true });
                }, 250);
              }
            }}
          />
        </View>

        {/* ── 3. Motivational Sharing & Submit Actions ── */}
        <View style={{ marginTop: 14, gap: 10 }}>
          {/* Share Motivational Verse Row */}
          {(currentVerse?.reference || currentReply.trim() || item.bibleVerse) && (
            <View style={styles.shareRow}>
              {phone ? (
                <TouchableOpacity
                  style={styles.shareWaBtn}
                  onPress={() => handleShareMotivationalVerse(item, 'whatsapp')}
                  activeOpacity={0.8}
                >
                  <MessageCircle size={15} color="#FFFFFF" />
                  <Text style={styles.shareWaBtnTxt}>WhatsApp Motivational Verse</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                style={styles.shareNativeBtn}
                onPress={() => handleShareMotivationalVerse(item, 'native')}
                activeOpacity={0.8}
              >
                <Share2 size={14} color="#334155" />
                <Text style={styles.shareNativeBtnTxt}>Share Encouragement</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Primary Action Button */}
          {isPublic ? (
            <TouchableOpacity
              style={styles.approvePublicBtn}
              onPress={async () => {
                await handleApprove(reqId, currentReply, currentVerse);
                if (isDetailModal) {
                  setDetailPrayer((prev: any) => ({
                    ...prev,
                    isAnswered: true,
                    isPublic: true,
                    bibleVerse: currentVerse?.reference,
                    verseText: currentVerse?.text,
                    verseTextTe: currentVerse?.textTe
                  }));
                  setTimeout(() => setDetailModalVisible(false), 800);
                }
              }}
              activeOpacity={0.8}
            >
              <CheckCircle2 size={18} color="#FFFFFF" />
              <Text style={styles.approvePublicBtnTxt}>Approve & Make Public</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.respondPrivateBtn}
              onPress={async () => {
                await handleRespondPrivately(reqId, currentReply, currentVerse);
                if (isDetailModal) {
                  setDetailPrayer((prev: any) => ({
                    ...prev,
                    isAnswered: true,
                    bibleVerse: currentVerse?.reference,
                    verseText: currentVerse?.text,
                    verseTextTe: currentVerse?.textTe
                  }));
                  setTimeout(() => setDetailModalVisible(false), 800);
                }
              }}
              activeOpacity={0.8}
            >
              <CheckCircle2 size={18} color="#FFFFFF" />
              <Text style={styles.respondPrivateBtnTxt}>Send Private Response</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const handleClose = (id: string) => {
    setCloseConfirmId(id);
  };

  const handleAdminPray = async (id: string) => {
    if (!member) return;
    const uid = member?.id || 'admin';
    const name = member.name || adminName;
    // Prevent double-pray
    if (prayers.find(p => p.id === id)?.prayedBy?.includes(uid)) {
      triggerSuccess('Already Prayed', 'You have already prayed for this request.');
      return;
    }
    try {
      await FirestoreService.incrementPrayCount(id, uid, name);
      setPrayers(prev => prev.map(p => p.id === id
        ? {
            ...p,
            prayCount: (p.prayCount || 0) + 1,
            prayedBy: [...(p.prayedBy || []), uid],
            prayedByNames: [...(p.prayedByNames || []), name]
          }
        : p
      ));
      triggerSuccess('Amen! 🙏', 'Your prayer has been recorded for this request.');
    } catch (error) {
      Alert.alert('Error', 'Failed to record your prayer.');
    }
  };

  const confirmClose = async () => {
    if (!closeConfirmId) return;
    const id = closeConfirmId;
    setCloseConfirmId(null);
    try {
      await FirestoreService.closePrayerRequest(id);
      setPrayers(prev => prev.map(p => p.id === id ? { ...p, isClosed: true } : p));
      triggerSuccess('Closed', 'Prayer request closed successfully.');
    } catch (error) {
      Alert.alert('Error', 'Failed to close prayer request.');
    }
  };

  const handleRemove = async (id: string) => {
    Alert.alert(
      'Remove Request',
      'Are you sure you want to permanently delete this prayer request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setPrayers(prev => prev.filter(p => p.id !== id));
              if (detailPrayer?.id === id) {
                setDetailModalVisible(false);
                setDetailPrayer(null);
              }
              await FirestoreService.deletePrayerRequest(id);
              fetchPrayers(true);
            } catch (err) {
              Alert.alert('Error', 'Failed to delete request');
            }
          }
        }
      ]
    );
  };

  const handlePublish = async () => {
    if (!pastorRequest.en.trim()) {
      Alert.alert('Error', 'Please enter the prayer request text.');
      return;
    }

    setSubmitting(true);
    try {
      await FirestoreService.submitPrayerRequest({
        name: selectedMember ? selectedMember.name : pastorRequest.postAs,
        phone: selectedMember ? selectedMember.phone : null,
        contactId: selectedMember ? selectedMember?.id : null,
        requestEn: pastorRequest.en,
        requestTe: pastorRequest.te,
        category: pastorRequest.category
      });
      setPastorRequest({ ...pastorRequest, en: '', te: '' });
      setSelectedMember(null);
      setMemberSearchQuery('');
      setShowCreateModal(false);
      triggerSuccess('Request Published!', 'The prayer request has been successfully created and published.');
      fetchPrayers(true);
    } catch (err) {
      Alert.alert('Error', 'Failed to publish request.');
    } finally {
      setSubmitting(false);
    }
  };

  const [pdfFilter, setPdfFilter] = useState<'all' | 'pending' | 'answered'>('all');

  const isPdfExportingRef = useRef(false);

  const exportPrayersToPDF = async (filter: 'all' | 'pending' | 'answered' = pdfFilter) => {
    if (isPdfExportingRef.current) return;
    isPdfExportingRef.current = true;
    try {
      const today = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
      const logoHtml = churchLogo
        ? `<img src="${churchLogo}" style="width:80px; height:80px; object-fit:contain; border-radius:10px; margin-bottom:8px;" />`
        : `<div style="font-size:40px;">⛪</div>`;

      let filteredPrayers = prayers;
      let filterLabel = 'All Prayer Requests';
      if (filter === 'pending') {
        filteredPrayers = pendingPrayers;
        filterLabel = 'Pending Prayer Requests';
      } else if (filter === 'answered') {
        filteredPrayers = answeredPrayers;
        filterLabel = 'Processed Prayer Requests';
      }

      // Sort by latest first
      filteredPrayers = [...filteredPrayers].sort((a, b) => {
        const t1 = a.createdAt?.seconds || 0;
        const t2 = b.createdAt?.seconds || 0;
        return t2 - t1;
      });

      if (filteredPrayers.length === 0) {
        Alert.alert('No Requests', 'No prayer requests found for this filter.');
        return;
      }

      const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: Helvetica, sans-serif; padding: 24px; color: #333; }
              .header { text-align: center; margin-bottom: 30px; padding-bottom: 16px; border-bottom: 2px solid #1a2d5a; }
              h1 { color: #1a2d5a; font-size: 20px; margin: 6px 0 2px 0; }
              .subtitle { color: #666; font-size: 12px; }
              .filter-label { color: #1a2d5a; font-size: 11px; font-weight: bold; margin-top: 4px; }
              .prayer-box { border-bottom: 1px solid #ddd; padding: 12px 0; margin-bottom: 6px; }
              .row { display: flex; justify-content: space-between; align-items: center; }
              .author { font-weight: bold; color: #b91c1c; font-size: 14px; }
              .phone { color: #666; font-size: 11px; }
              .date { color: #999; font-size: 11px; }
              .text { margin-top: 6px; font-size: 13px; line-height: 1.6; color: #222; }
              .status-approved { font-style: italic; font-size: 11px; color: #059669; margin-top: 4px; }
              .status-pending { font-style: italic; font-size: 11px; color: #d97706; margin-top: 4px; }
              .footer { text-align: center; font-size: 10px; color: #aaa; margin-top: 30px; }
            </style>
          </head>
          <body>
            <div class="header">
              ${logoHtml}
              <h1>${churchName}</h1>
              <div class="subtitle">Generated on ${today}</div>
              <div class="filter-label">${filterLabel} (${filteredPrayers.length})</div>
            </div>
            ${filteredPrayers.map(p => `
              <div class="prayer-box">
                <div class="row">
                  <span class="author">${p.name || p.authorName || 'Member'}</span>
                  <span class="date">${p.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000).toLocaleDateString('en-IN') : ''}</span>
                </div>
                ${p.phone ? `<div class="phone">📱 ${p.phone}</div>` : ''}
                <div class="text">${p.text || ''}</div>
                ${p.isAnswered
                  ? '<div class="status-approved">✓ Answered / Approved</div>'
                  : '<div class="status-pending">⏳ Pending Review</div>'
                }
              </div>
            `).join('')}
            <div class="footer">${churchName} · ${today}</div>
          </body>
        </html>
      `;
      
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      
      const safeName = churchName.replace(/[^a-zA-Z0-9]/g, '_');
      const dateTag = new Date().toISOString().split('T')[0];
      const filterTag = filter === 'all' ? 'All' : filter === 'pending' ? 'Pending' : 'Answered';
      const fileName = `${safeName}_Prayers_${filterTag}_${dateTag}.pdf`;
      const newPath = `${documentDirectory}${fileName}`;
      await copyAsync({ from: uri, to: newPath });
      
      setShowDownloadModal(false);
      
      await Sharing.shareAsync(newPath, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: fileName,
      });
    } catch (error: any) {
      if (!error?.message?.includes('Another print request')) {
        console.error('Error generating PDF:', error);
        Alert.alert('Error', 'Failed to generate PDF.');
      }
    } finally {
      isPdfExportingRef.current = false;
    }
  };

  const pendingPrayers = prayers
    .filter(p => !p.isAnswered && !p.isClosed)
    .sort((a, b) => {
      if (targetPrayerId) {
        if (a.id === targetPrayerId) return -1;
        if (b.id === targetPrayerId) return 1;
      }
      return 0;
    });
  const answeredPrayers = prayers
    .filter(p => p.isAnswered && !p.isClosed)
    .sort((a, b) => {
      if (targetPrayerId) {
        if (a.id === targetPrayerId) return -1;
        if (b.id === targetPrayerId) return 1;
      }
      return 0;
    });

  const getTimeAgo = (rawDate: any) => {
    try {
      const date: Date = rawDate?.toDate ? rawDate.toDate() 
        : rawDate instanceof Date ? rawDate 
        : new Date(rawDate);

      if (!date || isNaN(date.getTime())) return 'Recently';

      const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
      if (seconds < 60) return 'Just now';
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days === 1) return 'Yesterday';
      if (days < 7) return `${days} days ago`;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return 'Recently';
    }
  };

  const renderPrayerCard = (item: any, isAnswered = false) => {
    if (!item || !item.id) return null;
    const hasValidContent = Boolean((item.text || item.request || item.requestEn || item.textTe || item.name || item.memberName || '').trim());
    if (!hasValidContent) return null;
    const isTarget = Boolean(targetPrayerId && item?.id === targetPrayerId);
    return (
    <TouchableOpacity 
      key={item.id} 
      activeOpacity={0.92}
      onPress={() => {
        setDetailPrayer(item);
        setDetailModalVisible(true);
      }}
      style={[
        styles.pCard, 
        isAnswered && styles.pCardAnswered,
        isTarget && {
          borderColor: '#7C3AED',
          borderWidth: 2,
          backgroundColor: '#FAF5FF',
          shadowColor: '#7C3AED',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          elevation: 4,
        }
      ]}
    >
      {isTarget && (
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#7C3AED',
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 8,
          marginBottom: 12,
          gap: 6,
        }}>
          <Heart size={14} color="#FFFFFF" fill="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>
            NEW PRAYER REQUEST FROM NOTIFICATION
          </Text>
        </View>
      )}
      <View style={styles.pCardHd}>
        <View style={[styles.pAvatar, { backgroundColor: isAnswered ? '#059669' : '#7C3AED' }]}>
          <Text style={styles.pAvatarTxt}>{(item.name || 'F').charAt(0)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <Text style={styles.pUserName}>{item.name}</Text>
            {isAnswered && (
              <View style={styles.ansBadge}>
                <CheckCircle2 size={10} color={COLORS.moss} />
                <Text style={styles.ansBadgeTxt}>Processed</Text>
              </View>
            )}
          </View>
          <Text style={styles.pTime}>{getTimeAgo(item.createdAt)}{item.phone ? ` · ${item.phone}` : ''}</Text>
        </View>
        {!isAnswered && (
          <TouchableOpacity onPress={() => handleRemove(item.id)}>
            <Trash2 size={18} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.pTextContainer}>
        <Text style={styles.pText}>{item.text}</Text>
        {item.textTe && item.textTe.trim() !== (item.text || '').trim() && (
          <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: '#e2e8f0' }}>
            <Text style={[styles.pText, { fontStyle: 'italic', color: '#475569' }]}>
              {item.textTe}
            </Text>
          </View>
        )}
      </View>

      {/* REPLIES / COMMENTS SECTION */}
      {item.replies && item.replies.length > 0 && (
        <View style={styles.repliesContainer}>
          <Text style={styles.repliesHeader}>Comments</Text>
          {item.replies.map((reply: any) => (
            <View key={reply.id} style={styles.replyCard}>
              <View style={styles.replyHeader}>
                <Text style={styles.replyAuthor}>{reply.author}</Text>
                <Text style={styles.replyDate}>{getTimeAgo(reply.date)}</Text>
              </View>
              <Text style={styles.replyBody}>{reply.body}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.pFooter}>
        <View style={styles.catBadge}>
          <View style={styles.catDot} />
          <Text style={styles.catTxt}>{item.category || 'General'}</Text>
        </View>
        <View style={styles.pActions}>
          {/* Pray button */}
          <TouchableOpacity
            style={[styles.pActionBtn, { backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, gap: 5 }]}
            onPress={() => handleAdminPray(item.id)}
          >
            <Heart size={14} color="#2563EB" />
            <Text style={[styles.pActionBtnTxt, { color: '#2563EB' }]}>Pray</Text>
          </TouchableOpacity>
          {/* Close button */}
          <TouchableOpacity
            style={[styles.pActionBtn, { backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 6 }]}
            onPress={() => handleClose(item.id)}
          >
            <Text style={[styles.pActionBtnTxt, { color: '#EF4444' }]}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Attached Bible Verse for Answered Requests */}
      {isAnswered && (item.bibleVerse || item.verseReference) && (
        <View style={styles.answeredVerseBox}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <BookOpen size={14} color="#854D0E" />
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#854D0E' }}>
                {item.bibleVerse || item.verseReference}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.answeredShareBtn}
              onPress={() => handleShareMotivationalVerse(item, item.phone ? 'whatsapp' : 'native')}
            >
              <Share2 size={12} color="#854D0E" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#854D0E' }}>Share Verse</Text>
            </TouchableOpacity>
          </View>
          {item.verseText ? (
            <Text style={{ fontSize: 13, fontStyle: 'italic', color: '#713F12', lineHeight: 18 }}>
              "{item.verseText}"
            </Text>
          ) : null}
          {item.verseTextTe && item.verseTextTe.trim() !== (item.verseText || '').trim() ? (
            <Text style={{ fontSize: 12, fontStyle: 'italic', color: '#854D0E', marginTop: 3 }}>
              "{item.verseTextTe}"
            </Text>
          ) : null}
        </View>
      )}

      {/* Moderation Workflow: Bible Verse Entry, AI Suggestions, Suggested Responses & Share */}
      {!isAnswered && renderModerationWorkflow(item)}
    </TouchableOpacity>
  );
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.ink} />
        <Text style={{ marginTop: 12, color: '#64748b' }}>Loading Prayer Wall...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* ── Hero Section ── */}
      <View style={styles.hero}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <TouchableOpacity
              onPress={() => setActiveTab(0)}
              style={styles.circularBackBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ArrowLeft size={20} color="#1a2d5a" strokeWidth={2.2} />
            </TouchableOpacity>
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.heroTitle}>Prayers</Text>
              <Text style={[styles.heroSub, { marginTop: 2 }]}>{pendingPrayers.length} new · {answeredPrayers.length} processed</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={{ padding: 8 }} onPress={() => setShowTopMenu(true)}>
              <MoreVertical size={22} color="#1a2d5a" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >

        {/* ── Stats Row ── */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={[styles.statVal, { color: COLORS.clay }]}>{pendingPrayers.length}</Text>
            <Text style={styles.statLbl}>New Requests</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statVal, { color: COLORS.moss }]}>{answeredPrayers.length}</Text>
            <Text style={styles.statLbl}>Processed</Text>
          </View>
        </View>

        {/* ── Pending Review ── */}
        {pendingPrayers.length > 0 && (
          <>
            <View style={styles.listHd}>
              <Text style={[styles.listHdTitle, { color: COLORS.goldDeep }]}>Requests for Review ({pendingPrayers.length})</Text>
            </View>
            {pendingPrayers.map(p => renderPrayerCard(p))}
          </>
        )}

        {/* ── Answered Section ── */}
        {answeredPrayers.length > 0 && (
          <>
            <View style={[styles.listHd, { marginTop: 20 }]}>
              <Text style={styles.listHdTitle}>Recent History</Text>
            </View>
            {answeredPrayers.slice(0, 5).map(p => renderPrayerCard(p, true))}
          </>
        )}

      </ScrollView>

      {/* ── Prayer Request Detail & Action Modal ── */}
      <Modal
        visible={detailModalVisible && !!detailPrayer}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => {
          Keyboard.dismiss();
          setDetailModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.detailModalOverlay}
        >
          {detailPrayer ? (
          <View style={[
            styles.detailModalContainer,
            keyboardHeight > 0 && Platform.OS === 'android' && {
              maxHeight: Dimensions.get('window').height - 40,
            }
          ]}>
            {/* Modal Header */}
            <View style={styles.detailModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
                <View style={[styles.pAvatar, { backgroundColor: detailPrayer?.isAnswered ? '#059669' : '#7C3AED', width: 44, height: 44, borderRadius: 22 }]}>
                  <Text style={[styles.pAvatarTxt, { fontSize: 18 }]}>{(detailPrayer?.name || 'M').charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: COLORS.ink }}>
                    {detailPrayer?.name || 'Church Member'}
                  </Text>
                  <Text style={{ fontSize: 13, color: COLORS.inkSoft, marginTop: 2 }}>
                    {getTimeAgo(detailPrayer?.createdAt)}{detailPrayer?.phone ? ` · ${detailPrayer.phone}` : ''}
                  </Text>
                </View>
              </View>
              {keyboardHeight > 0 && (
                <TouchableOpacity
                  onPress={() => Keyboard.dismiss()}
                  style={styles.dismissKbdHeaderBtn}
                >
                  <Text style={styles.dismissKbdHeaderTxt}>Done</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  setDetailModalVisible(false);
                }}
                style={styles.detailModalCloseBtn}
              >
                <XCircle size={26} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={modalScrollRef}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={{
                padding: 20,
                paddingBottom: keyboardHeight > 0 ? keyboardHeight + 80 : 120,
                flexGrow: 1
              }}
            >
              {/* Badges row */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                <View style={[styles.catBadge, { paddingHorizontal: 10, paddingVertical: 4 }]}>
                  <View style={styles.catDot} />
                  <Text style={[styles.catTxt, { fontSize: 13 }]}>{detailPrayer?.category || 'General'}</Text>
                </View>
                {detailPrayer?.isPublic ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 }}>
                    <Megaphone size={12} color="#D97706" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#D97706' }}>PUBLIC REQUEST</Text>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 }}>
                    <ShieldCheck size={12} color="#2563EB" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#2563EB' }}>PRIVATE (CONFIDENTIAL)</Text>
                  </View>
                )}
                {detailPrayer?.isAnswered && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#DCFCE7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 }}>
                    <CheckCircle2 size={12} color="#15803D" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#15803D' }}>PROCESSED</Text>
                  </View>
                )}
              </View>

              {/* Submitter phone call quick link */}
              {detailPrayer?.phone ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 }}>
                  <View>
                    <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>Contact Number</Text>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#1E293B', marginTop: 2 }}>{detailPrayer.phone}</Text>
                  </View>
                  <TouchableOpacity
                    style={{ backgroundColor: '#2563EB', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 }}
                    onPress={() => Linking.openURL(`tel:${detailPrayer.phone}`)}
                  >
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Call Member</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Prayer Request Full Text */}
              <View style={{ backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.inkSoft, textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>
                  Prayer Request
                </Text>
                <Text style={{ fontSize: 16, color: COLORS.ink, lineHeight: 24, fontWeight: '500' }}>
                  {detailPrayer?.text || detailPrayer?.request || ''}
                </Text>

                {detailPrayer?.textTe && detailPrayer?.textTe.trim() !== (detailPrayer?.text || '').trim() && (
                  <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.inkSoft, textTransform: 'uppercase', marginBottom: 6 }}>
                      Telugu Request
                    </Text>
                    <Text style={{ fontSize: 15, color: '#475569', lineHeight: 22, fontStyle: 'italic' }}>
                      {detailPrayer.textTe}
                    </Text>
                  </View>
                )}
              </View>

              {/* Comments History */}
              {detailPrayer?.replies && detailPrayer.replies.length > 0 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.ink, marginBottom: 8 }}>
                    Response History ({detailPrayer.replies.length})
                  </Text>
                  {detailPrayer.replies.map((reply: any) => (
                    <View key={reply.id} style={{ backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontWeight: '700', fontSize: 13, color: '#1E293B' }}>{reply.author}</Text>
                        <Text style={{ fontSize: 11, color: '#64748B' }}>{getTimeAgo(reply.date)}</Text>
                      </View>
                      <Text style={{ fontSize: 14, color: '#334155' }}>{reply.body}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Attached Bible Verse for Answered Requests in Detail Modal */}
              {detailPrayer?.isAnswered && (detailPrayer?.bibleVerse || detailPrayer?.verseReference) && (
                <View style={{ backgroundColor: '#FEF3C7', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <BookOpen size={16} color="#854D0E" />
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#854D0E' }}>
                        {detailPrayer.bibleVerse || detailPrayer.verseReference}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={{ backgroundColor: '#FDE68A', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 5 }}
                      onPress={() => handleShareMotivationalVerse(detailPrayer, detailPrayer.phone ? 'whatsapp' : 'native')}
                    >
                      <Share2 size={13} color="#854D0E" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#854D0E' }}>Share Verse</Text>
                    </TouchableOpacity>
                  </View>
                  {detailPrayer.verseText ? (
                    <Text style={{ fontSize: 14, fontStyle: 'italic', color: '#713F12', lineHeight: 20 }}>
                      "{detailPrayer.verseText}"
                    </Text>
                  ) : null}
                  {detailPrayer.verseTextTe && detailPrayer.verseTextTe.trim() !== (detailPrayer.verseText || '').trim() ? (
                    <Text style={{ fontSize: 13, fontStyle: 'italic', color: '#854D0E', marginTop: 4 }}>
                      "{detailPrayer.verseTextTe}"
                    </Text>
                  ) : null}
                </View>
              )}

              {/* Admin Reply & Action Section in Detail Modal */}
              {!detailPrayer?.isAnswered && (
                <View style={{ marginBottom: 20 }}>
                  {renderModerationWorkflow(detailPrayer, true)}
                </View>
              )}

              {/* Quick Actions (Pray / Close) */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 30 }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#EFF6FF', paddingVertical: 12, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#BFDBFE' }}
                  onPress={() => detailPrayer?.id && handleAdminPray(detailPrayer.id)}
                >
                  <Heart size={16} color="#2563EB" />
                  <Text style={{ color: '#2563EB', fontWeight: '700', fontSize: 14 }}>
                    Pray ({detailPrayer?.prayCount || 0})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#FEE2E2', paddingVertical: 12, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#FECACA' }}
                  onPress={() => {
                    setDetailModalVisible(false);
                    if (detailPrayer?.id) handleClose(detailPrayer.id);
                  }}
                >
                  <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 14 }}>Close Request</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Bible Book, Chapter, Verse Picker Modal ── */}
      <Modal
        visible={bcvPicker.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setBcvPicker(prev => ({ ...prev, visible: false }))}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.pickerOverlay}
        >
          <View style={styles.pickerContainer}>
            {/* Picker Header with Back Navigation & Close */}
            <View style={styles.pickerHeader}>
              {bcvPicker.step !== 'book' ? (
                <TouchableOpacity
                  style={styles.pickerNavBtn}
                  onPress={() => {
                    if (bcvPicker.step === 'verse') {
                      setBcvPicker(prev => ({ ...prev, step: 'chapter' }));
                    } else if (bcvPicker.step === 'chapter') {
                      setBcvPicker(prev => ({ ...prev, step: 'book' }));
                    }
                  }}
                >
                  <ChevronLeft size={22} color="#1E293B" />
                </TouchableOpacity>
              ) : (
                <View style={{ width: 32 }} />
              )}

              <View style={{ alignItems: 'center' }}>
                <Text style={styles.pickerTitle}>
                  {bcvPicker.step === 'book'
                    ? 'Select Bible Book'
                    : bcvPicker.step === 'chapter'
                    ? `${allBibleBooks[bcvPicker.selectedBookIndex]?.nameEn} · Select Chapter`
                    : `${allBibleBooks[bcvPicker.selectedBookIndex]?.nameEn} ${bcvPicker.selectedChapter} · Select Verse`}
                </Text>
                <Text style={styles.pickerSubtitle}>
                  {bcvPicker.step === 'book'
                    ? 'Choose from 66 Books of Scripture'
                    : bcvPicker.step === 'chapter'
                    ? `${allBibleBooks[bcvPicker.selectedBookIndex]?.totalChapters} Chapters available`
                    : 'Tap a verse or enter range (e.g. 6-7)'}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.pickerNavBtn}
                onPress={() => setBcvPicker(prev => ({ ...prev, visible: false }))}
              >
                <X size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Step 1: Book Selection */}
            {bcvPicker.step === 'book' && (
              <View style={{ flex: 1 }}>
                {/* Search bar */}
                <View style={styles.pickerSearchBox}>
                  <Search size={16} color="#94A3B8" />
                  <TextInput
                    style={styles.pickerSearchInput}
                    placeholder="Search by book name (e.g. John, యోహాను)..."
                    placeholderTextColor="#94A3B8"
                    value={bcvPicker.searchQuery}
                    onChangeText={(txt) => setBcvPicker(prev => ({ ...prev, searchQuery: txt }))}
                  />
                  {bcvPicker.searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setBcvPicker(prev => ({ ...prev, searchQuery: '' }))}>
                      <X size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* OT / NT Tabs */}
                <View style={styles.testamentTabBar}>
                  {(['ALL', 'OT', 'NT'] as const).map(tab => (
                    <TouchableOpacity
                      key={tab}
                      style={[styles.testamentTab, bcvPicker.testamentFilter === tab && styles.testamentTabActive]}
                      onPress={() => setBcvPicker(prev => ({ ...prev, testamentFilter: tab }))}
                    >
                      <Text style={[styles.testamentTabTxt, bcvPicker.testamentFilter === tab && styles.testamentTabTxtActive]}>
                        {tab === 'ALL' ? 'All (66)' : tab === 'OT' ? 'Old Testament (39)' : 'New Testament (27)'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Books List */}
                <FlatList
                  data={allBibleBooks.filter(b => {
                    if (bcvPicker.testamentFilter === 'OT' && b.testament !== 'OT') return false;
                    if (bcvPicker.testamentFilter === 'NT' && b.testament !== 'NT') return false;
                    if (bcvPicker.searchQuery.trim()) {
                      const q = bcvPicker.searchQuery.toLowerCase().trim();
                      return b.nameEn.toLowerCase().includes(q) || b.nameTe.toLowerCase().includes(q);
                    }
                    return true;
                  })}
                  keyExtractor={item => item.nameEn + item.index}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[styles.bookRow, bcvPicker.selectedBookIndex === item.index && styles.bookRowSelected]}
                      onPress={() => handleSelectBookInPicker(item.index)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.bookNameEn, bcvPicker.selectedBookIndex === item.index && styles.bookNameEnSelected]}>
                          {item.nameEn}
                        </Text>
                        <Text style={styles.bookNameTe}>{item.nameTe}</Text>
                      </View>
                      <View style={styles.chCountBadge}>
                        <Text style={styles.chCountText}>{item.totalChapters} Ch</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}

            {/* Step 2: Chapter Selection */}
            {bcvPicker.step === 'chapter' && (
              <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
                <Text style={styles.pickerSectionLabel}>Tap a Chapter Number:</Text>
                <View style={styles.gridContainer}>
                  {Array.from({ length: allBibleBooks[bcvPicker.selectedBookIndex]?.totalChapters || 1 }, (_, i) => i + 1).map(ch => (
                    <TouchableOpacity
                      key={ch}
                      style={[styles.gridCell, bcvPicker.selectedChapter === ch && styles.gridCellActive]}
                      onPress={() => handleSelectChapterInPicker(ch)}
                    >
                      <Text style={[styles.gridCellTxt, bcvPicker.selectedChapter === ch && styles.gridCellTxtActive]}>
                        {ch}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            {/* Step 3: Verse Selection */}
            {bcvPicker.step === 'verse' && (
              <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                {/* Custom Verse / Range input */}
                <View style={styles.customVerseInputRow}>
                  <Text style={styles.pickerSectionLabel}>Custom Verse or Range:</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    <TextInput
                      style={styles.customVerseInput}
                      placeholder="e.g. 6 or 6-7"
                      placeholderTextColor="#94A3B8"
                      value={bcvPicker.selectedVerse}
                      onChangeText={(txt) => setBcvPicker(prev => ({ ...prev, selectedVerse: txt }))}
                      keyboardType="numbers-and-punctuation"
                    />
                    <TouchableOpacity
                      style={styles.applyVerseBtn}
                      onPress={() => handleSelectVerseInPicker(bcvPicker.selectedVerse)}
                    >
                      <Text style={styles.applyVerseBtnTxt}>Confirm</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Quick Whole Chapter Option */}
                <TouchableOpacity
                  style={styles.entireChapterBtn}
                  onPress={() => handleSelectVerseInPicker(`1-${PrayerVerseService.getVerseCount(bcvPicker.selectedBookIndex, bcvPicker.selectedChapter)}`)}
                >
                  <Check size={16} color="#059669" />
                  <Text style={styles.entireChapterBtnTxt}>
                    Reference Entire Chapter ({allBibleBooks[bcvPicker.selectedBookIndex]?.nameEn} {bcvPicker.selectedChapter})
                  </Text>
                </TouchableOpacity>

                <Text style={[styles.pickerSectionLabel, { marginTop: 16 }]}>Or Tap a Verse Number:</Text>
                <View style={styles.gridContainer}>
                  {Array.from({ length: PrayerVerseService.getVerseCount(bcvPicker.selectedBookIndex, bcvPicker.selectedChapter) }, (_, i) => i + 1).map(v => (
                    <TouchableOpacity
                      key={v}
                      style={[styles.gridCell, bcvPicker.selectedVerse === String(v) && styles.gridCellActive]}
                      onPress={() => handleSelectVerseInPicker(v)}
                    >
                      <Text style={[styles.gridCellTxt, bcvPicker.selectedVerse === String(v) && styles.gridCellTxtActive]}>
                        {v}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Create Prayer Request Modal ── */}
      {showCreateModal && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000, backgroundColor: COLORS.paper }]}>
          <SafeAreaView style={{ flex: 1 }}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
              <View style={[styles.createModalContent, { flex: 1, height: undefined, borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
                <View style={[styles.createModalHeader, { borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
                  <Text style={styles.createModalTitle}>Create New Prayer Request</Text>
                  <TouchableOpacity onPress={() => setShowCreateModal(false)} style={styles.closeBtn}>
                    <XCircle size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>
                
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }}>
              {/* Member Lookup */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Church Member</Text>
                <View style={styles.searchBox}>
                  <TextInput
                    placeholder="Search by name or phone..."
                    style={styles.searchInput}
                    value={memberSearchQuery}
                    onChangeText={handleMemberSearch}
                  />
                  {searchingMembers && <ActivityIndicator size="small" color={COLORS.ink} />}
                </View>

                {memberSearchResults.length > 0 && !selectedMember && (
                  <View style={styles.searchResults}>
                    {memberSearchResults.map(m => (
                      <TouchableOpacity
                        key={m.id}
                        style={styles.searchItem}
                        onPress={() => {
                          setSelectedMember(m);
                          setMemberSearchResults([]);
                          setMemberSearchQuery(m.name);
                        }}
                      >
                        <View>
                          <Text style={styles.searchItemName}>{m.name}</Text>
                          <Text style={styles.searchItemPhone}>{m.phone || 'No Phone'}</Text>
                        </View>
                        <Plus size={14} color={COLORS.ink} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {selectedMember && (
                  <View style={styles.selectedBadge}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      <User size={14} color="#fff" />
                      <Text style={styles.selectedBadgeTxt}>{selectedMember.name}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setSelectedMember(null)}>
                      <XCircle size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Prayer Category</Text>
                <TouchableOpacity
                  style={styles.pickerBtn}
                  onPress={() => setShowPicker(!showPicker)}
                >
                  <Text style={styles.pickerTxt}>
                    {pastorRequest.category || 'Select Category'}
                  </Text>
                  <MoreVertical size={14} color="#64748b" />
                </TouchableOpacity>

                {showPicker && (
                  <View style={styles.categoryList}>
                    {prayerCategories.map(cat => (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.catOption, pastorRequest.category === cat && styles.catOptionActive]}
                        onPress={() => {
                          setPastorRequest({ ...pastorRequest, category: cat });
                          setShowPicker(false);
                        }}
                      >
                        <Text style={[styles.catOptionTxt, pastorRequest.category === cat && { color: '#fff' }]}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Prayer request text — English</Text>
                <View style={styles.textArea}>
                  <TextInput
                    placeholder="Type the prayer request details..."
                    style={[styles.textInput, { minHeight: 120 }]}
                    multiline
                    scrollEnabled={false}
                    value={pastorRequest.en}
                    onChangeText={t => setPastorRequest({ ...pastorRequest, en: t })}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Detailed Prayer Request</Text>
                <View style={styles.textArea}>
                  <TextInput
                    placeholder="ప్రార్థన మనవి వివరాలను టైప్ చేయండి..."
                    style={[styles.textInput, { minHeight: 120, fontStyle: 'italic' }]}
                    multiline
                    scrollEnabled={false}
                    value={pastorRequest.te}
                    onChangeText={t => setPastorRequest({ ...pastorRequest, te: t })}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Post as</Text>
                <TouchableOpacity
                  style={styles.pickerBtn}
                  onPress={() => setShowPostAs(!showPostAs)}
                >
                  <Text style={styles.pickerTxt}>{pastorRequest.postAs}</Text>
                  <MoreVertical size={14} color="#64748b" />
                </TouchableOpacity>

                {showPostAs && (
                  <View style={styles.categoryList}>
                    {postAsOptions.map(opt => (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.catOption, pastorRequest.postAs === opt && styles.catOptionActive]}
                        onPress={() => {
                          setPastorRequest({ ...pastorRequest, postAs: opt });
                          setShowPostAs(false);
                        }}
                      >
                        <Text style={[styles.catOptionTxt, pastorRequest.postAs === opt && { color: '#fff' }]}>
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.publishBtn, submitting && { opacity: 0.7 }, { marginTop: 10, marginBottom: 40 }]}
                onPress={handlePublish}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Megaphone size={16} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.publishBtnTxt}>Submit Prayer Request</Text>
                  </>
                )}
              </TouchableOpacity>
              <View style={{ height: 400 }} />
            </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      )}

      {/* ── Success Modal ── */}
      <Modal visible={successModalData.visible} transparent animationType="fade">
        <View style={styles.successModalOverlay}>
          <Animated.View 
            style={[
              styles.successCard,
              {
                transform: [
                  { scale: successAnim },
                  { translateY: successAnim.interpolate({ inputRange: [0, 1], outputRange: [50, 0] }) }
                ],
                opacity: successAnim
              }
            ]}
          >
            <View style={styles.successIconBox}>
              <CheckCircle2 size={40} color="#fff" />
            </View>
            <Text style={styles.successTitle}>{successModalData.title}</Text>
            <Text style={styles.successSub}>
              {successModalData.sub}
            </Text>
            
            <TouchableOpacity style={styles.successBtn} onPress={closeSuccess}>
              <Text style={styles.successBtnTxt}>Great, Thank you!</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      {/* Close Confirmation Modal */}
      <Modal visible={!!closeConfirmId} transparent animationType="fade">
        <View style={styles.createModalOverlay}>
          <View style={styles.closeConfirmCard}>
            <View style={styles.closeConfirmIconBox}>
              <XCircle size={40} color="#ef4444" />
            </View>
            <Text style={styles.successTitle}>Close Prayer Request?</Text>
            <Text style={styles.successSub}>This will hide the prayer request from the public view and remove it from the admin dashboard.</Text>
            
            <View style={styles.closeConfirmActions}>
              <TouchableOpacity style={styles.closeCancelBtn} onPress={() => setCloseConfirmId(null)}>
                <Text style={styles.closeCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeConfirmBtn} onPress={confirmClose}>
                <Text style={styles.closeConfirmTxt}>Close Request</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* ── Top Menu Modal ── */}
      <Modal transparent visible={showTopMenu} animationType="fade" onRequestClose={() => setShowTopMenu(false)}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowTopMenu(false)}>
          <View style={{ position: 'absolute', top: 90, right: 20, backgroundColor: '#fff', borderRadius: 12, padding: 8, elevation: 10, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, width: 220 }}>
            <TouchableOpacity 
              style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', flexDirection: 'row', alignItems: 'center', gap: 10 }}
              onPress={() => { setShowTopMenu(false); setShowCreateModal(true); }}
            >
              <Plus size={18} color={COLORS.ink} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.ink }}>New Prayer</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={{ padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}
              onPress={() => { setShowTopMenu(false); setShowDownloadModal(true); }}
            >
              <FileDown size={18} color={COLORS.ink} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.ink }}>Download Requests</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Download PDF Modal ── */}
      <Modal transparent visible={showDownloadModal} animationType="slide" onRequestClose={() => setShowDownloadModal(false)}>
        <View style={styles.createModalOverlay}>
          <View style={[styles.createModalContent, { height: 'auto', paddingBottom: 40 }]}>
            <View style={styles.createModalHeader}>
              <Text style={styles.createModalTitle}>Download Report</Text>
              <TouchableOpacity onPress={() => setShowDownloadModal(false)} style={styles.closeBtn}>
                <XCircle size={24} color={COLORS.inkSoft} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 24 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.ink, marginBottom: 12 }}>Select Filter</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
                {(['all', 'pending', 'answered'] as const).map(f => (
                  <TouchableOpacity
                    key={f}
                    onPress={() => setPdfFilter(f)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 20,
                      backgroundColor: pdfFilter === f ? COLORS.ink : COLORS.parchment,
                      borderWidth: 1,
                      borderColor: pdfFilter === f ? COLORS.ink : COLORS.rule,
                    }}
                  >
                    <Text style={{ color: pdfFilter === f ? '#fff' : COLORS.inkSoft, fontWeight: '700', fontSize: 13 }}>
                      {f === 'all' ? `All (${prayers.length})` : f === 'pending' ? `Pending (${pendingPrayers.length})` : `Answered (${answeredPrayers.length})`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                onPress={() => exportPrayersToPDF(pdfFilter)}
                style={{ backgroundColor: COLORS.goldDeep, borderRadius: 12, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <FileDown size={20} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Download Prayer Requests</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  circularBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  container: { flex: 1, backgroundColor: COLORS.parchment },
  scroll: { padding: 16, paddingBottom: 100 },

  hero: {
    backgroundColor: 'transparent',
    
    
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    overflow: 'visible',
    position: 'relative',
    marginBottom: 6,
  },
  heroTitle: { color: '#1a2d5a', fontSize: 20, fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontWeight: '600', letterSpacing: -0.5 },
  heroSub: { color: '#64748b', fontSize: 13 },
  
  newBtn: { 
    backgroundColor: '#C9A84C', 
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12, 
    paddingVertical: 6, 
    borderRadius: 10,
    shadowColor: '#C9A84C',
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4
  },
  newBtnTxt: { color: '#1a2d5a', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 18 },
  statCard: { flex: 1, backgroundColor: COLORS.paper, borderRadius: 16, paddingVertical: 18, alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, borderWidth: 1, borderColor: COLORS.rule },
  statVal: { fontSize: 24, fontWeight: '900', fontFamily: FONTS.serif },
  statLbl: { fontSize: 11, color: COLORS.inkSoft, marginTop: 4, fontWeight: '600' },

  listHd: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  listHdTitle: { fontSize: 14, fontWeight: '800', color: COLORS.ink, textTransform: 'uppercase', letterSpacing: 0.5 },

  pCard: { backgroundColor: COLORS.paper, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.rule },
  pCardAnswered: { backgroundColor: COLORS.mossBg, borderColor: '#C8E6C9' },
  pCardHd: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  pAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  pAvatarTxt: { color: '#fff', fontSize: 14, fontWeight: '800', fontFamily: FONTS.serif },
  pUserName: { fontSize: 14, fontWeight: '800', color: COLORS.ink, fontFamily: FONTS.serif },
  pTime: { fontSize: 11, color: COLORS.inkSoft, marginTop: 2, fontWeight: '500' },

  ansBadge: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  ansBadgeTxt: { fontSize: 9, fontWeight: '800', color: '#15803D' },

  pTextContainer: { backgroundColor: 'rgba(0,0,0,0.02)', borderRadius: 12, padding: 18, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  pText: { fontSize: 14, color: COLORS.ink, lineHeight: 22, fontFamily: FONTS.serif },

  pFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catBadge: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  catDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.goldDeep },
  catTxt: { fontSize: 11, fontWeight: '700', color: COLORS.inkSoft },

  pActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pActionBtn: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, backgroundColor: '#DCFCE7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  pActionBtnTxt: { fontSize: 11, fontWeight: '800', color: '#15803D' },

  pastorSection: { backgroundColor: COLORS.paper, borderRadius: 16, padding: 20, marginTop: 20, borderWidth: 1, borderColor: COLORS.rule },
  pastorSecTitle: { fontSize: 14, fontWeight: '800', color: COLORS.ink, marginBottom: 20 },
  inputGroup: { marginBottom: 15 },
  inputLabel: { fontSize: 12, fontWeight: '800', color: COLORS.ink, marginBottom: 8 },
  textArea: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.rule, borderRadius: 12, minHeight: 80, paddingHorizontal: 12, marginBottom: 10 },
  textInput: { fontSize: 13, color: COLORS.ink, paddingVertical: 12, textAlignVertical: 'top', fontFamily: FONTS.serif },
  pickerBtn: { height: 50, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.rule, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15 },
  pickerTxt: { fontSize: 14, color: COLORS.ink, fontWeight: '600' },
  categoryList: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.rule, borderRadius: 12, padding: 4, marginTop: 4, elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  catOption: { paddingVertical: 14, paddingHorizontal: 15, borderBottomWidth: 0.5, borderBottomColor: COLORS.rule },
  catOptionActive: { backgroundColor: COLORS.goldBright },
  catOptionTxt: { fontSize: 14, color: COLORS.ink, fontWeight: '500' },
  publishBtn: { height: 56, backgroundColor: COLORS.ink, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 },
  publishBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800', fontFamily: FONTS.serif },

  // Search Styles
  searchBox: { height: 50, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.rule, borderRadius: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', paddingHorizontal: 15, gap: 10 },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.ink, fontFamily: FONTS.serif },
  searchResults: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.rule, borderRadius: 12, marginTop: 4, maxHeight: 200, overflow: 'hidden', elevation: 5, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  searchItem: { padding: 14, borderBottomWidth: 0.5, borderBottomColor: COLORS.rule, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  searchItemName: { fontSize: 14, fontWeight: '800', color: COLORS.ink, fontFamily: FONTS.serif },
  searchItemPhone: { fontSize: 12, color: COLORS.inkSoft, marginTop: 2 },
  selectedBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.ink, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, marginTop: 8 },
  selectedBadgeTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  
  adminReplyInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    color: COLORS.ink,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  detailModalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.75)', justifyContent: 'flex-end' },
  detailModalContainer: { backgroundColor: '#F8FAFC', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12 },
  detailModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  detailModalCloseBtn: { padding: 4 },
  createModalOverlay: { flex: 1, backgroundColor: 'rgba(21, 28, 51, 0.75)', justifyContent: 'flex-end' },
  createModalContent: { backgroundColor: COLORS.parchment, borderTopLeftRadius: 30, borderTopRightRadius: 30, height: '85%' },
  createModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, backgroundColor: COLORS.paper, borderTopLeftRadius: 30, borderTopRightRadius: 30, borderBottomWidth: 1, borderBottomColor: COLORS.rule },
  createModalTitle: { fontSize: 18, fontWeight: '900', color: COLORS.ink, fontFamily: FONTS.serif },
  closeBtn: { padding: 4, backgroundColor: COLORS.clayBg, borderRadius: 20 },

  // Success Modal Styles
  successModalOverlay: { flex: 1, backgroundColor: 'rgba(21, 28, 51, 0.75)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  successCard: { width: '100%', backgroundColor: '#fff', borderRadius: 24, padding: 32, alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20 },
  successIconBox: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.moss, justifyContent: 'center', alignItems: 'center', marginBottom: 20, shadowColor: COLORS.moss, shadowOpacity: 0.4, shadowRadius: 12, elevation: 6 },
  successTitle: { fontSize: 22, fontWeight: '900', color: COLORS.ink, fontFamily: FONTS.serif, marginBottom: 8, textAlign: 'center' },
  successSub: { fontSize: 14, color: COLORS.inkSoft, textAlign: 'center', marginBottom: 30, lineHeight: 22 },
  successBtn: { width: '100%', height: 54, backgroundColor: COLORS.ink, borderRadius: 16, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.ink, shadowOpacity: 0.3, shadowRadius: 10, elevation: 4 },
  successBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },

  // Close Confirmation Styles
  closeConfirmCard: { width: '85%', alignSelf: 'center', backgroundColor: '#fff', borderRadius: 24, padding: 32, alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, marginBottom: '50%' },
  closeConfirmIconBox: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  closeConfirmActions: { flexDirection: 'row', gap: 12, width: '100%' },
  closeCancelBtn: { flex: 1, height: 50, backgroundColor: '#f1f5f9', borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  closeCancelTxt: { color: '#475569', fontSize: 14, fontWeight: '700' },
  closeConfirmBtn: { flex: 1, height: 50, backgroundColor: '#ef4444', borderRadius: 14, justifyContent: 'center', alignItems: 'center', shadowColor: '#ef4444', shadowOpacity: 0.3, shadowRadius: 6, elevation: 4 },
  closeConfirmTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Replies Styles
  repliesContainer: { marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: COLORS.rule },
  repliesHeader: { fontSize: 12, fontWeight: '800', color: COLORS.ink, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  replyCard: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.rule },
  replyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  replyAuthor: { fontSize: 12, fontWeight: '800', color: COLORS.ink, fontFamily: FONTS.serif },
  replyDate: { fontSize: 11, color: COLORS.inkSoft, fontWeight: '600' },

  replyBody: { fontSize: 14, color: COLORS.ink2, lineHeight: 22, fontFamily: FONTS.serif },

  // ── Moderation Workflow Styles ──
  workflowContainer: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  sectionBox: {
    backgroundColor: '#FAF5FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B21A8',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#FEE2E2',
    borderRadius: 6,
  },
  clearBtnTxt: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },

  // BCV Selection Fields Row
  bcvRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  bcvField: {
    flex: 2,
  },
  bcvFieldSmall: {
    flex: 1.1,
  },
  bcvLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  bcvBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bcvVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
    marginRight: 4,
  },
  bcvPlaceholder: {
    color: '#94A3B8',
    fontWeight: '500',
  },

  // Scripture Display Card
  selectScriptureHint: {
    fontSize: 12,
    color: '#7C3AED',
    fontStyle: 'italic',
    marginTop: 4,
    lineHeight: 18,
  },
  scriptureLoadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    marginTop: 6,
  },
  scriptureLoadingTxt: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
  scriptureDisplayCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  scriptureRefHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#FEF3C7',
  },
  scriptureRefEn: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
  },
  scriptureRefTe: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
  },
  scriptureTextBlock: {
    marginTop: 4,
  },
  scriptureLangLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  scriptureTextInput: {
    fontSize: 13,
    lineHeight: 20,
    color: '#78350F',
    padding: 0,
    minHeight: 36,
  },

  // Personal Response Input
  inputFieldSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 6,
  },
  personalResponseInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: COLORS.ink,
    minHeight: 90,
    textAlignVertical: 'top',
  },

  // Action Buttons
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  shareWaBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shareWaBtnTxt: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  shareNativeBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shareNativeBtnTxt: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  approvePublicBtn: {
    backgroundColor: '#15803D',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  approvePublicBtnTxt: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  respondPrivateBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  respondPrivateBtnTxt: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  answeredVerseBox: {
    marginTop: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  answeredShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dismissKbdHeaderBtn: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  dismissKbdHeaderTxt: {
    color: '#7C3AED',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── BCV Picker Modal Styles ──
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'flex-end',
  },
  pickerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '80%',
    maxHeight: 650,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerNavBtn: {
    padding: 6,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  pickerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  pickerSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  pickerSearchInput: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 13,
    color: '#1E293B',
  },
  testamentTabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    padding: 3,
  },
  testamentTab: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  testamentTabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  testamentTabTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  testamentTabTxtActive: {
    fontWeight: '800',
    color: '#7C3AED',
  },
  bookRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  bookRowSelected: {
    backgroundColor: '#F5F3FF',
  },
  bookNameEn: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  bookNameEnSelected: {
    color: '#7C3AED',
  },
  bookNameTe: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  chCountBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  chCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  pickerSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 10,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gridCell: {
    width: (width - 64) / 5,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridCellActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  gridCellTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  gridCellTxtActive: {
    color: '#FFFFFF',
  },
  customVerseInputRow: {
    marginBottom: 14,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customVerseInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#1E293B',
  },
  applyVerseBtn: {
    backgroundColor: '#7C3AED',
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyVerseBtnTxt: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  entireChapterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingVertical: 10,
    marginBottom: 14,
  },
  entireChapterBtnTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  }
});