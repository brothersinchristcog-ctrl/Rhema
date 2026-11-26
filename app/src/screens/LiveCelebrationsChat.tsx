import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  Keyboard,
  Alert,
  StatusBar,
  Animated,
  InteractionManager,
  Modal
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import storage from '@react-native-firebase/storage';
import firestore from '@react-native-firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useChurch } from '../context/ChurchContext';
import { LinearGradient } from 'expo-linear-gradient';
import { e2eeService, E2EEStateSnapshot } from '../services/e2eeService';
import { roomKeyManager } from '../services/roomKeyManager';
import ChatEncryptionModal, { ChatEncryptionModalMode } from '../components/ChatEncryptionModal';
import { CachedImage } from '../components/CachedImage';
import {
  makeScopedCacheKey,
  getInstantMemory,
  readInstantCache,
  writeInstantCache,
} from '../utils/instantCache';
import FirestoreService from '../services/FirestoreService';
import {
  getIstCalendarParts,
  extractTodaysCelebrants,
  matchesIstCelebrationDay,
} from '../utils/celebrationDateHelper';
import UnreadMessagesDivider from '../components/UnreadMessagesDivider';
import {
  findFirstUnreadTimestampedMessageIndex,
  getChatMessageTimeMs,
  mergeCelebrationMessages,
} from '../utils/chatUnreadHelper';

const INITIAL_CELEB_PAGE_SIZE = 25;
const OLDER_CELEB_PAGE_SIZE = 25;

const WISH_DICTIONARY: Record<string, string[]> = {
  'Birthday': [
    "Happy Birthday! 🎉",
    "Wishing you a blessed birthday! 🎂",
    "Many more blessed years! ❤️"
  ],
  'Wedding Anniversary': [
    "Happy Anniversary! 💕",
    "Wishing you both endless love! 🥂",
    "God bless your marriage! 🙏"
  ],
  'Baptism': [
    "Happy Baptism Anniversary! 🕊️",
    "May God continue to bless your walk in Christ! 🙏",
    "God bless you on this special day! ✨"
  ],
  'Baptism Anniversary': [
    "Happy Baptism Anniversary! 🕊️",
    "May God continue to bless your walk in Christ! 🙏",
    "God bless you on this special day! ✨"
  ],
  'General': [
    "God bless you abundantly! 🙏",
    "Wishing you a blessed day! ✨"
  ]
};

// Colors from Stitch Midnight Celebration
const COLORS = {
  background: '#0A0E17',
  secondaryContainer: '#1A2232',
  surfaceContainerHigh: '#282a2b',
  primary: '#ffc880',
  onBackground: '#e2e2e2',
  onSurfaceVariant: '#d7c3ae',
  outlineVariant: '#524534',
  tertiaryContainer: '#1fd15b',
  bubbleOutboundStart: '#f59e0b',
  bubbleOutboundEnd: '#d97706',
};

const AnimatedSpikes = () => {
  const anim1 = useRef(new Animated.Value(0.3)).current;
  const anim2 = useRef(new Animated.Value(0.8)).current;
  const anim3 = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const startAnim = (anim: Animated.Value, duration: number) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(anim, { toValue: 1, duration, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration, useNativeDriver: true }),
        ])
      );
      loop.start();
      return loop;
    };
    const loops = [
      startAnim(anim1, 400),
      startAnim(anim2, 600),
      startAnim(anim3, 500),
    ];
    return () => {
      loops.forEach((l) => l.stop());
    };
  }, [anim1, anim2, anim3]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 12, gap: 2 }}>
      <Animated.View style={{ width: 3, height: 12, backgroundColor: COLORS.tertiaryContainer, transform: [{ scaleY: anim1 }] }} />
      <Animated.View style={{ width: 3, height: 12, backgroundColor: COLORS.tertiaryContainer, transform: [{ scaleY: anim2 }] }} />
      <Animated.View style={{ width: 3, height: 12, backgroundColor: COLORS.tertiaryContainer, transform: [{ scaleY: anim3 }] }} />
    </View>
  );
};

export default function LiveCelebrationsChat({ navigation, route }: any) {
  const { activeChurch } = useChurch();
  const { member, user } = useAuth();
  const targetChurchId = route.params?.churchId || activeChurch?.id || member?.churchId || 'rhema';
  const istParts = getIstCalendarParts();
  const todayStr = route.params?.dateStr || istParts.dateStr;
  const dateFormatted = istParts.displayDate;

  const celebMsgsCacheKey = React.useMemo(
    () => makeScopedCacheKey('live_celebrations_chat_v2', targetChurchId, user?.uid || member?.id, todayStr),
    [targetChurchId, user?.uid, member?.id, todayStr]
  );
  const initialCelebMsgs = React.useMemo(() => getInstantMemory<any[]>(celebMsgsCacheKey), [celebMsgsCacheKey]);

  const [latestMessages, setLatestMessages] = useState<any[]>(initialCelebMsgs || []);
  const [olderMessages, setOlderMessages] = useState<any[]>([]);
  const [optimisticMessages, setOptimisticMessages] = useState<any[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(!initialCelebMsgs);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingObj, setRecordingObj] = useState<Audio.Recording | null>(null);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const recordingWaveAnim = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef<FlatList<any>>(null);
  const [celebrations, setCelebrations] = useState<any[]>(() =>
    Array.isArray(route.params?.celebrations) ? route.params.celebrations : []
  );

  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [selectedCelebrantId, setSelectedCelebrantId] = useState<string | null>(null);
  const [selectedCelebrantName, setSelectedCelebrantName] = useState<string | null>(null);
  const [selectedCardCeleb, setSelectedCardCeleb] = useState<any | null>(null);
  const [longPressedMessage, setLongPressedMessage] = useState<any | null>(null);

  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutRef = useRef<any>(null);
  const isTypingLocally = useRef(false);

  const [initialLastReadTime, setInitialLastReadTime] = useState<number>(0);
  const [lastReadLoaded, setLastReadLoaded] = useState(false);
  const lastScrolledUnreadKeyRef = useRef<string | null>(null);
  const latestCelebMsgTimeRef = useRef<number>(0);

  // Pagination & Scroll refs
  const oldestLiveDocRef = useRef<any>(null);
  const oldestOlderDocRef = useRef<any>(null);
  const hasLoadedOlderPagesRef = useRef<boolean>(false);
  const loadingOlderRef = useRef<boolean>(false);
  const didInitialBottomScrollRef = useRef<boolean>(false);
  const scrollToBottomPendingRef = useRef<boolean>(false);
  const scrollToBottomTimerRef = useRef<any>(null);
  const userScrolledRef = useRef<boolean>(false);
  const prevScrollYRef = useRef<number>(0);
  const lastSentAtRef = useRef<number>(0);

  const messages = React.useMemo(
    () => mergeCelebrationMessages(olderMessages, latestMessages, optimisticMessages),
    [olderMessages, latestMessages, optimisticMessages]
  );

  const e2eeUid = user?.uid || member?.id || '';
  const [e2eeState, setE2eeState] = useState<E2EEStateSnapshot>(() => e2eeService.getState());
  const [e2eeModalMode, setE2eeModalMode] = useState<ChatEncryptionModalMode | null>(null);

  useEffect(() => {
    const paramCelebrations = Array.isArray(route.params?.celebrations) ? route.params.celebrations : [];
    if (paramCelebrations.length > 0) {
      const ist = getIstCalendarParts();
      const normalized = paramCelebrations.every((c: any) => Boolean(c.celebrationType))
        ? paramCelebrations
        : extractTodaysCelebrants(paramCelebrations, ist);
      setCelebrations(normalized.length > 0 ? normalized : paramCelebrations);
      return;
    }

    let active = true;
    const loadCelebrantsFallback = async () => {
      try {
        const allCelebs = await FirestoreService.getAllCelebrations(targetChurchId);
        const todays = extractTodaysCelebrants(allCelebs, getIstCalendarParts());
        if (active) {
          setCelebrations(todays);
          if (route.params?.celebrantId) {
            const match = todays.find(
              (c: any) => c.id === route.params.celebrantId || c.memberId === route.params.celebrantId || c.Id === route.params.celebrantId
            );
            if (match) setSelectedCardCeleb(match);
          }
        }
      } catch (err) {
        console.warn('[LiveCelebrationsChat] Failed loading today celebrants fallback:', err);
      }
    };
    loadCelebrantsFallback();
    return () => {
      active = false;
    };
  }, [route.params?.celebrations, route.params?.celebrantId, targetChurchId]);

  useEffect(() => {
    setE2eeState(e2eeService.getState());
    const unsub = e2eeService.subscribeState(setE2eeState);
    return () => unsub();
  }, []);

  useEffect(() => {
    let active = true;
    setLastReadLoaded(false);
    lastScrolledUnreadKeyRef.current = null;
    didInitialBottomScrollRef.current = false;
    userScrolledRef.current = false;
    prevScrollYRef.current = 0;

    // Hydrate disk cache immediately on cold opens so UI renders before Firestore responds
    if (!getInstantMemory(celebMsgsCacheKey)) {
      readInstantCache<any[]>(celebMsgsCacheKey).then((cached) => {
        if (active && cached && Array.isArray(cached.data) && cached.data.length > 0) {
          setLatestMessages((prev) => (prev.length === 0 ? cached.data : prev));
          setLoading(false);
        }
      });
    }

    const fetchLastRead = async () => {
      try {
        const lastRead = await AsyncStorage.getItem(`@lastReadCeleb_${todayStr}`);
        if (!active) return;
        const parsed = lastRead ? parseInt(lastRead, 10) : 0;
        setInitialLastReadTime(Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
      } catch {
        if (active) setInitialLastReadTime(0);
      } finally {
        if (active) setLastReadLoaded(true);
      }
    };
    fetchLastRead();
    return () => {
      active = false;
    };
  }, [todayStr, celebMsgsCacheKey]);

  useEffect(() => {
    if (messages.length > 0) {
      const maxMsgTs = messages.reduce(
        (acc, m) => Math.max(acc, getChatMessageTimeMs(m?.createdAt)),
        0
      );
      latestCelebMsgTimeRef.current = Math.max(Date.now(), maxMsgTs);
      // Delay writing the read marker so the unread divider stays visible while reading,
      // and also persist on unmount so backing out immediately updates the unread badge.
      const timer = setTimeout(() => {
        AsyncStorage.setItem(
          `@lastReadCeleb_${todayStr}`,
          Math.max(Date.now(), latestCelebMsgTimeRef.current).toString()
        ).catch(() => {});
      }, 3000);
      return () => {
        clearTimeout(timer);
        AsyncStorage.setItem(
          `@lastReadCeleb_${todayStr}`,
          Math.max(Date.now(), latestCelebMsgTimeRef.current).toString()
        ).catch(() => {});
      };
    }
  }, [messages, todayStr]);

  const updateTypingStatus = async (isTyping: boolean) => {
    const myId = member?.id || user?.uid;
    if (!targetChurchId || !myId) return;
    try {
      const typingRef = firestore()
        .collection('Rhema Church')
        .doc(targetChurchId)
        .collection('live_celebrations')
        .doc(todayStr)
        .collection('presence')
        .doc('typing');

      if (isTyping) {
        await typingRef.set({ [myId]: member?.name || user?.displayName || 'Someone' }, { merge: true });
      } else {
        await typingRef.update({ [myId]: firestore.FieldValue.delete() });
      }
    } catch (e) {
      // ignore
    }
  };

  const handleTextChange = (text: string) => {
    setInputText(text);

    // Typing Indicator Logic
    if (text.length > 0) {
      if (!isTypingLocally.current) {
        isTypingLocally.current = true;
        updateTypingStatus(true);
      }

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        isTypingLocally.current = false;
        updateTypingStatus(false);
      }, 2000);
    } else {
      if (isTypingLocally.current) {
        isTypingLocally.current = false;
        updateTypingStatus(false);
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    }

    const words = text.split(' ');
    const lastWord = words[words.length - 1];

    if (lastWord.startsWith('@')) {
      setMentionQuery(lastWord.substring(1).toLowerCase());
      setShowMentionPopup(true);
    } else {
      setShowMentionPopup(false);
    }

    if (selectedCelebrantName && !text.includes(`@${selectedCelebrantName}`)) {
      setSelectedCelebrantId(null);
      setSelectedCelebrantName(null);
    }
  };

  const selectMention = (celeb: any) => {
    const celebName = celeb.Name || celeb.name || 'Member';
    const words = inputText.split(' ');
    words.pop();
    const newText = (words.length > 0 ? words.join(' ') + ' ' : '') + `@${celebName} `;
    setInputText(newText);
    setSelectedCelebrantId(celeb.id || celeb.uid || celeb.Id);
    setSelectedCelebrantName(celebName);
    setShowMentionPopup(false);
  };

  const filteredMentionCelebrants = celebrations.filter((c: any) => {
    const name = (c.Name || c.name || '').toLowerCase();
    return name.includes(mentionQuery);
  });

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardVisible(true);
      if (Platform.OS === 'android') {
        setKeyboardHeight(e.endCoordinates.height);
      }
    });
    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      if (Platform.OS === 'android') {
        setKeyboardHeight(0);
      }
      if (scrollToBottomPendingRef.current || Date.now() - lastSentAtRef.current < 800) {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 60);
      }
    });
    return () => {
      keyboardDidHideListener.remove();
      keyboardDidShowListener.remove();
      if (scrollToBottomTimerRef.current) clearTimeout(scrollToBottomTimerRef.current);
    };
  }, []);

  const decryptCelebrationDocs = async (
    docs: Array<{ id: string; data: Record<string, any> }>,
    ctx: { scope: 'celebrations'; churchId: string; dateId: string }
  ): Promise<{ items: any[]; hasLocked: boolean }> => {
    if (docs.length === 0) return { items: [], hasLocked: false };

    const hasEncrypted =
      Boolean(e2eeUid) &&
      docs.some(({ data }) => typeof data.text === 'string' && e2eeService.isEncryptedPayload(data.text));

    if (!hasEncrypted) {
      return {
        items: docs.map(({ id, data }) => ({ id, ...data, text: typeof data.text === 'string' ? data.text : '' })),
        hasLocked: false,
      };
    }

    await e2eeService.initializeForUser(e2eeUid);
    let foundLocked = false;
    const decrypted = await Promise.all(
      docs.map(async ({ id, data }) => {
        const rawText = typeof data.text === 'string' ? data.text : '';
        let finalText = rawText;
        if (rawText && e2eeService.isEncryptedPayload(rawText) && e2eeUid) {
          const dec = await roomKeyManager.decryptString(ctx, e2eeUid, rawText);
          finalText = dec.text;
          if (dec.lockedReason) foundLocked = true;
        }
        return { id, ...data, text: finalText };
      })
    );
    return { items: decrypted, hasLocked: foundLocked };
  };

  useEffect(() => {
    setOlderMessages([]);
    setOptimisticMessages([]);
    oldestLiveDocRef.current = null;
    oldestOlderDocRef.current = null;
    hasLoadedOlderPagesRef.current = false;
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    setHasMoreOlder(false);
  }, [targetChurchId, todayStr]);

  useEffect(() => {
    if (!targetChurchId) return;

    const churchId = targetChurchId;
    const celebrationDocRef = firestore()
      .collection('Rhema Church')
      .doc(churchId)
      .collection('live_celebrations')
      .doc(todayStr);
    const ctx = { scope: 'celebrations' as const, churchId, dateId: todayStr };

    let disposed = false;
    let seq = 0;
    let latestDocs: Array<{ id: string; data: Record<string, any> }> = [];
    let hasLockedMessages = false;

    const processDocs = async (docs: Array<{ id: string; data: Record<string, any> }>) => {
      const currentSeq = ++seq;
      const { items: decrypted, hasLocked: foundLocked } = await decryptCelebrationDocs(docs, ctx);
      if (disposed || currentSeq !== seq) return;
      hasLockedMessages = foundLocked;
      setLatestMessages(decrypted);
      // Clean out any optimistic messages that have now arrived in the live snapshot
      setOptimisticMessages((prev) =>
        prev.filter((opt) => !decrypted.some((live) => live.clientMsgId && live.clientMsgId === opt.clientMsgId))
      );
      if (!foundLocked) {
        writeInstantCache(celebMsgsCacheKey, decrypted).catch(() => { });
      }
      setLoading(false);
    };

    const unsubscribe = celebrationDocRef
      .collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(INITIAL_CELEB_PAGE_SIZE)
      .onSnapshot(
        (snap) => {
          if (snap) {
            if (!hasLoadedOlderPagesRef.current) {
              oldestLiveDocRef.current = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
              setHasMoreOlder(snap.docs.length >= INITIAL_CELEB_PAGE_SIZE);
            }
            latestDocs = snap.docs
              .slice()
              .reverse()
              .map((doc) => ({ id: doc.id, data: doc.data() || {} }));
            processDocs(latestDocs);
          } else {
            setLoading(false);
          }
        },
        (err) => {
          console.error('Chat error:', err);
          setLoading(false);
        }
      );

    const typingUnsubscribe = celebrationDocRef
      .collection('presence')
      .doc('typing')
      .onSnapshot((snap) => {
        if (snap) {
          const data = typeof snap.data === 'function' ? snap.data() : null;
          if (data) {
            const activeTyping = Object.entries(data)
              .filter(([id]) => id !== member?.id)
              .map(([_, name]) => name as string);
            setTypingUsers(activeTyping);
          } else {
            setTypingUsers([]);
          }
        }
      });

    const keyReqsUnsubscribe = celebrationDocRef.collection('keyRequests').onSnapshot(
      (reqSnap) => {
        if (
          reqSnap &&
          !reqSnap.empty &&
          e2eeUid &&
          e2eeService.getState().status === 'ready'
        ) {
          InteractionManager.runAfterInteractions(() => {
            roomKeyManager.fulfillCelebrationsKeyRequests(ctx, e2eeUid).catch(() => { });
          });
        }
      },
      () => { }
    );

    const envelopesUnsubscribe = e2eeUid
      ? celebrationDocRef
        .collection('keyEnvelopes')
        .where('uid', '==', e2eeUid)
        .onSnapshot(
          () => {
            if (hasLockedMessages && latestDocs.length > 0) {
              processDocs(latestDocs);
            }
          },
          () => { }
        )
      : () => { };

    let prevStatus = e2eeService.getState().status;
    const unsubState = e2eeService.subscribeState((snap) => {
      if (snap.status !== prevStatus) {
        prevStatus = snap.status;
        if (snap.status === 'ready') {
          if (latestDocs.length > 0) {
            processDocs(latestDocs);
          }
          if (e2eeUid) {
            InteractionManager.runAfterInteractions(() => {
              roomKeyManager.fulfillCelebrationsKeyRequests(ctx, e2eeUid).catch(() => { });
            });
          }
        }
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
      typingUnsubscribe();
      keyReqsUnsubscribe();
      envelopesUnsubscribe();
      unsubState();
    };
  }, [targetChurchId, todayStr, e2eeUid, celebMsgsCacheKey]);

  const loadOlderMessages = async () => {
    if (loadingOlderRef.current || !hasMoreOlder || !targetChurchId) return;
    const cursor = oldestOlderDocRef.current || oldestLiveDocRef.current;
    if (!cursor) {
      setHasMoreOlder(false);
      return;
    }

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const ctx = { scope: 'celebrations' as const, churchId: targetChurchId, dateId: todayStr };
      const snap = await firestore()
        .collection('Rhema Church')
        .doc(targetChurchId)
        .collection('live_celebrations')
        .doc(todayStr)
        .collection('messages')
        .orderBy('createdAt', 'desc')
        .startAfter(cursor)
        .limit(OLDER_CELEB_PAGE_SIZE)
        .get();

      if (snap.empty) {
        setHasMoreOlder(false);
        return;
      }

      hasLoadedOlderPagesRef.current = true;
      oldestOlderDocRef.current = snap.docs[snap.docs.length - 1];
      setHasMoreOlder(snap.docs.length >= OLDER_CELEB_PAGE_SIZE);

      const docsAsc = snap.docs
        .slice()
        .reverse()
        .map((doc) => ({ id: doc.id, data: doc.data() || {} }));
      const { items: decrypted } = await decryptCelebrationDocs(docsAsc, ctx);

      setOlderMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const additions = decrypted.filter((m) => !seen.has(m.id));
        return additions.length > 0 ? [...additions, ...prev] : prev;
      });
    } catch (err) {
      console.warn('[LiveCelebrationsChat] Failed loading older wishes:', err);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  };

  const scrollToLatestMessage = (animated = true) => {
    scrollToBottomPendingRef.current = true;
    lastSentAtRef.current = Date.now();
    if (scrollToBottomTimerRef.current) clearTimeout(scrollToBottomTimerRef.current);

    requestAnimationFrame(() => {
      try {
        flatListRef.current?.scrollToEnd({ animated });
      } catch {
        // Fallback retry below
      }
    });
    setTimeout(() => {
      if (flatListRef.current && scrollToBottomPendingRef.current) {
        flatListRef.current.scrollToEnd({ animated });
      }
    }, 110);
    scrollToBottomTimerRef.current = setTimeout(() => {
      if (flatListRef.current && scrollToBottomPendingRef.current) {
        flatListRef.current.scrollToEnd({ animated: false });
      }
      scrollToBottomPendingRef.current = false;
    }, 360);
  };

  const sendMessage = async (text: string) => {
    const cleanText = text.trim();
    const senderId = member?.id || user?.uid || '';
    if (!cleanText || !targetChurchId || !senderId) return;

    const ctx = {
      scope: 'celebrations' as const,
      churchId: targetChurchId,
      dateId: todayStr,
    };

    const userPhoto =
      (member as any)?.profilePhoto ||
      (member as any)?.photoURL ||
      (member as any)?.photoUrl ||
      (member as any)?.profileImageUrl ||
      (member as any)?.PhotoUrl ||
      (member as any)?.Photo ||
      user?.photoURL ||
      null;
    const userName = member?.name || user?.displayName || 'Unknown';
    const targetCelebIdSnapshot = selectedCelebrantId;
    const targetCelebNameSnapshot = selectedCelebrantName;

    setInputText('');
    setShowMentionPopup(false);
    Keyboard.dismiss();
    isTypingLocally.current = false;
    updateTypingStatus(false);

    let optimisticId: string | null = null;
    if (!editingMsgId) {
      const now = Date.now();
      optimisticId = `opt_${now}_${Math.random().toString(36).slice(2, 7)}`;
      const optMsg = {
        id: optimisticId,
        clientMsgId: optimisticId,
        text: cleanText,
        userId: senderId,
        userName,
        userPhoto,
        createdAt: now,
        localCreatedAt: now,
        reactions: {},
        pending: true,
        ...(targetCelebIdSnapshot
          ? { targetCelebrantId: targetCelebIdSnapshot, targetCelebrantName: targetCelebNameSnapshot }
          : {}),
      };
      setOptimisticMessages((prev) => [...prev, optMsg]);
      setInitialLastReadTime(now);
      AsyncStorage.setItem(`@lastReadCeleb_${todayStr}`, now.toString()).catch(() => {});
      didInitialBottomScrollRef.current = true;
      scrollToLatestMessage(true);
    }

    let storedText = cleanText;
    if (e2eeUid) {
      try {
        const enc = await roomKeyManager.encryptString(ctx, e2eeUid, [e2eeUid], cleanText);
        storedText = enc.cipherText;
      } catch (encErr: any) {
        if (optimisticId) {
          setOptimisticMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        }
        setInputText(cleanText);
        if (encErr?.message === 'PIN_UNLOCK_REQUIRED') {
          setE2eeModalMode('unlock_backup');
          return;
        }
        Alert.alert('Encryption Error', encErr?.message || 'Unable to encrypt message.');
        return;
      }
    }

    try {
      if (editingMsgId) {
        await firestore()
          .collection('Rhema Church')
          .doc(targetChurchId)
          .collection('live_celebrations')
          .doc(todayStr)
          .collection('messages')
          .doc(editingMsgId)
          .update({
            text: storedText,
            encrypted: true,
            isEdited: true,
          });
        setEditingMsgId(null);
      } else {
        const batch = firestore().batch();
        const msgRef = firestore()
          .collection('Rhema Church')
          .doc(targetChurchId)
          .collection('live_celebrations')
          .doc(todayStr)
          .collection('messages')
          .doc();
        const localTs = Date.now();

        batch.set(msgRef, {
          text: storedText,
          encrypted: true,
          clientMsgId: optimisticId,
          localCreatedAt: localTs,
          userId: senderId,
          userName,
          userPhoto,
          createdAt: firestore.FieldValue.serverTimestamp(),
          reactions: {},
          ...(targetCelebIdSnapshot
            ? { targetCelebrantId: targetCelebIdSnapshot, targetCelebrantName: targetCelebNameSnapshot }
            : {}),
        });

        if (targetCelebIdSnapshot) {
          const matchedCeleb =
            selectedCardCeleb ||
            celebrations.find((c: any) => (c.id || c.uid || c.Id) === targetCelebIdSnapshot) ||
            {};
          const celebRef = firestore()
            .collection('Rhema Church')
            .doc(targetChurchId)
            .collection('live_celebrations')
            .doc(todayStr)
            .collection('celebrants')
            .doc(targetCelebIdSnapshot);

          const tokens = [...(matchedCeleb?.fcmTokens || [])];
          if (matchedCeleb?.fcmToken) tokens.push(matchedCeleb.fcmToken);

          batch.set(celebRef, {
            memberId: matchedCeleb?.memberId || matchedCeleb?.Id || targetCelebIdSnapshot,
            name: matchedCeleb?.Name || matchedCeleb?.name || targetCelebNameSnapshot || 'Member',
            unnotifiedWishes: firestore.FieldValue.increment(1),
            totalWishes: firestore.FieldValue.increment(1),
            type: getCelebrationType(matchedCeleb),
            fcmTokens: Array.from(new Set(tokens))
          }, { merge: true });
        }

        setSelectedCelebrantId(null);
        setSelectedCelebrantName(null);
        await batch.commit();
        const sentAt = Date.now();
        setInitialLastReadTime(sentAt);
        AsyncStorage.setItem(`@lastReadCeleb_${todayStr}`, sentAt.toString()).catch(() => {});
        scrollToLatestMessage(true);
      }
    } catch (e) {
      console.error('Send error:', e);
      if (optimisticId) {
        setOptimisticMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
      setInputText(cleanText);
    }
  };

  const handleMessageLongPress = (item: any) => {
    if (item.userId !== (member?.id || user?.uid)) return;
    setLongPressedMessage(item);
  };

  const deleteMessage = async (item: any) => {
    try {
      await firestore()
        .collection('Rhema Church')
        .doc(targetChurchId)
        .collection('live_celebrations')
        .doc(todayStr)
        .collection('messages')
        .doc(item.id)
        .delete();
      setLongPressedMessage(null);
    } catch (e) {
      console.error('Delete error', e);
    }
  };

  const editMessage = (item: any) => {
    setEditingMsgId(item.id);
    setInputText(item.text || '');
    setLongPressedMessage(null);
  };

  const startRecording = async () => {
    try {
      // Clean up any leftover recording object first
      if (recordingObj) {
        try { await recordingObj.stopAndUnloadAsync(); } catch (e) { }
        setRecordingObj(null);
      }

      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission needed', 'Please allow microphone access to send audio messages.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecordingObj(recording);
      setIsRecording(true);
      // Start wave animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(recordingWaveAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(recordingWaveAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } catch (e) {
      console.error('Recording start error:', e);
    }
  };

  const cancelRecording = async () => {
    if (recordingObj) {
      try {
        await recordingObj.stopAndUnloadAsync();
      } catch (e) { }
      setRecordingObj(null);
    }
    recordingWaveAnim.stopAnimation();
    recordingWaveAnim.setValue(0);
    setIsRecording(false);
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
  };

  const stopAndSendRecording = async () => {
    const senderId = member?.id || user?.uid || '';
    if (!recordingObj || !targetChurchId || !senderId) return;
    // Don't set isRecording to false yet, wait for upload to finish

    recordingWaveAnim.stopAnimation();
    recordingWaveAnim.setValue(0);
    setUploadingAudio(true);
    updateTypingStatus(false);
    try {
      await recordingObj.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingObj.getURI();
      setRecordingObj(null);
      if (!uri) {
        setIsRecording(false);
        return;
      }

      const fileName = `audio_${Date.now()}.m4a`;
      const ref = storage().ref(`Rhema Church/${targetChurchId}/live_celebrations/${todayStr}/${fileName}`);
      await ref.putFile(uri);
      const audioUrl = await ref.getDownloadURL();

      const batch = firestore().batch();
      const msgRef = firestore()
        .collection('Rhema Church')
        .doc(targetChurchId)
        .collection('live_celebrations')
        .doc(todayStr)
        .collection('messages')
        .doc();

      const localTs = Date.now();
      batch.set(msgRef, {
        audioUrl,
        localCreatedAt: localTs,
        userId: senderId,
        userName: member?.name || user?.displayName || 'Unknown',
        userPhoto: (member as any)?.profilePhoto || (member as any)?.photoURL || (member as any)?.photoUrl || (member as any)?.profileImageUrl || (member as any)?.PhotoUrl || (member as any)?.Photo || user?.photoURL || null,
        createdAt: firestore.FieldValue.serverTimestamp(),
        reactions: {},
        ...(selectedCelebrantId ? { targetCelebrantId: selectedCelebrantId, targetCelebrantName: selectedCelebrantName } : {})
      });

      if (selectedCelebrantId) {
        const matchedCeleb =
          selectedCardCeleb ||
          celebrations.find((c: any) => (c.id || c.uid || c.Id) === selectedCelebrantId) ||
          {};
        const celebRef = firestore()
          .collection('Rhema Church')
          .doc(targetChurchId)
          .collection('live_celebrations')
          .doc(todayStr)
          .collection('celebrants')
          .doc(selectedCelebrantId);

        const tokens = [...(matchedCeleb?.fcmTokens || [])];
        if (matchedCeleb?.fcmToken) tokens.push(matchedCeleb.fcmToken);

        batch.set(celebRef, {
          memberId: matchedCeleb?.memberId || matchedCeleb?.Id || selectedCelebrantId,
          name: matchedCeleb?.Name || matchedCeleb?.name || selectedCelebrantName || 'Member',
          unnotifiedWishes: firestore.FieldValue.increment(1),
          totalWishes: firestore.FieldValue.increment(1),
          type: getCelebrationType(matchedCeleb),
          fcmTokens: Array.from(new Set(tokens))
        }, { merge: true });
      }

      await batch.commit();
      const sentAt = Date.now();
      setInitialLastReadTime(sentAt);
      AsyncStorage.setItem(`@lastReadCeleb_${todayStr}`, sentAt.toString()).catch(() => {});
      setSelectedCelebrantId(null);
      setSelectedCelebrantName(null);
      scrollToLatestMessage(true);
    } catch (e) {
      console.error('Audio send error:', e);
      Alert.alert('Error', 'Failed to send audio. Please try again.');
    } finally {
      setUploadingAudio(false);
      setIsRecording(false);
    }
  };

  const playAudio = async (audioUrl: string, msgId: string) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (playingId === msgId) {
        setPlayingId(null);
        return;
      }
      setPlayingId(msgId);
      const { sound } = await Audio.Sound.createAsync({ uri: audioUrl }, { shouldPlay: true });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          setPlayingId(null);
          sound.unloadAsync();
        }
      });
    } catch (e) {
      console.error('Playback error:', e);
      setPlayingId(null);
    }
  };

  const getCelebrationIcon = (type: string) => {
    if (type.toLowerCase().includes('birthday')) return '🎂';
    if (type.toLowerCase().includes('wedding') || type.toLowerCase().includes('anniversary')) return '💕';
    if (type.toLowerCase().includes('baptism')) return '🕊️';
    return '🎉';
  };

  const formatTime = (timestamp: any) => {
    const ms = getChatMessageTimeMs(timestamp);
    if (!ms) return '';
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getCelebrationType = (celeb: any) => {
    if (celeb.celebrationType && celeb.celebrationType !== 'Celebration') return celeb.celebrationType;
    if (celeb.type && celeb.type !== 'Celebration') return celeb.type;
    if (celeb.title && celeb.title !== 'Celebration') return celeb.title;

    const ist = getIstCalendarParts();
    const bDate = celeb.Birthdate || celeb.dob || celeb.birthdate || celeb.dateOfBirth || celeb.birthday;
    const aDate = celeb.Anniversary_Date__c || celeb.anniversaryDate || celeb.marriageDate || celeb.weddingAnniversary || celeb.anniversary;
    const bapDate = celeb.Baptism_Date__c || celeb.baptismDate || celeb.baptism;

    if (matchesIstCelebrationDay(bDate, ist)) return 'Birthday';
    if (matchesIstCelebrationDay(aDate, ist)) return 'Wedding Anniversary';
    if (matchesIstCelebrationDay(bapDate, ist)) return 'Baptism Anniversary';

    return 'Birthday'; // Default fallback
  };

  const getPhotoUrl = (celeb: any) => {
    return celeb.photoUrl || celeb.photoURL || celeb.profilePhoto || celeb.Profile_Photo__c || celeb.image || null;
  };

  const displayedMessages = selectedCardCeleb
    ? messages.filter(m => {
      const celebId = selectedCardCeleb?.id || selectedCardCeleb?.uid || selectedCardCeleb?.Id;
      const celebMemberId = selectedCardCeleb?.memberId || selectedCardCeleb?.Id;
      const celebName = selectedCardCeleb?.Name || selectedCardCeleb?.name || '';
      if (m.targetCelebrantId) {
        return (
          m.targetCelebrantId === celebId ||
          (celebMemberId && m.targetCelebrantId === celebMemberId)
        );
      }
      return Boolean(m.targetCelebrantName && m.targetCelebrantName.toLowerCase() === celebName.toLowerCase());
    })
    : messages;

  const currentUserId = member?.id || user?.uid;
  const participantCount = displayedMessages.length > 0 ? [...new Set(displayedMessages.map(m => m.userId))].length : 0;

  // Compute the index of the first unread message (from other users) for both new and existing chats
  const firstUnreadIndex = React.useMemo(
    () =>
      findFirstUnreadTimestampedMessageIndex(
        displayedMessages,
        currentUserId || '',
        initialLastReadTime,
        lastReadLoaded
      ),
    [displayedMessages, initialLastReadTime, lastReadLoaded, currentUserId]
  );

  const selectedCelebScopeKey =
    selectedCardCeleb?.id || selectedCardCeleb?.uid || selectedCardCeleb?.Id || 'all';
  const firstUnreadMsgId = firstUnreadIndex >= 0 ? displayedMessages[firstUnreadIndex]?.id || null : null;

  useEffect(() => {
    lastScrolledUnreadKeyRef.current = null;
    didInitialBottomScrollRef.current = false;
  }, [selectedCelebScopeKey, todayStr]);

  const scrollToCelebMessageIndex = (index: number, animated = true) => {
    if (index < 0 || !flatListRef.current) return;
    try {
      flatListRef.current.scrollToIndex({
        index,
        animated,
        viewPosition: 0.08,
      });
    } catch {
      // Handled by onScrollToIndexFailed
    }
  };

  useEffect(() => {
    if (loading || !lastReadLoaded || displayedMessages.length === 0 || !flatListRef.current) return;
    if (scrollToBottomPendingRef.current) return;

    if (firstUnreadIndex >= 0 && firstUnreadMsgId) {
      const scopeKey = `${todayStr}::${selectedCelebScopeKey}::${firstUnreadMsgId}`;
      if (lastScrolledUnreadKeyRef.current === scopeKey) return;
      lastScrolledUnreadKeyRef.current = scopeKey;
      didInitialBottomScrollRef.current = true;
      requestAnimationFrame(() => {
        setTimeout(() => {
          scrollToCelebMessageIndex(firstUnreadIndex, true);
        }, 45);
      });
    } else if (!didInitialBottomScrollRef.current) {
      didInitialBottomScrollRef.current = true;
      scrollToBottomPendingRef.current = true;
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      });
      setTimeout(() => {
        if (scrollToBottomPendingRef.current) {
          flatListRef.current?.scrollToEnd({ animated: false });
          scrollToBottomPendingRef.current = false;
        }
      }, 180);
    }
  }, [loading, lastReadLoaded, firstUnreadIndex, firstUnreadMsgId, displayedMessages.length, selectedCelebScopeKey, todayStr]);

  const celebrationTypes = new Set(
    selectedCardCeleb
      ? [getCelebrationType(selectedCardCeleb)]
      : celebrations.map((c: any) => getCelebrationType(c))
  );
  let dynamicQuickWishes: string[] = [];

  if (celebrationTypes.has('Birthday')) dynamicQuickWishes.push(...WISH_DICTIONARY['Birthday']);
  if (celebrationTypes.has('Wedding Anniversary')) dynamicQuickWishes.push(...WISH_DICTIONARY['Wedding Anniversary']);
  if (celebrationTypes.has('Baptism') || celebrationTypes.has('Baptism Anniversary')) {
    dynamicQuickWishes.push(...WISH_DICTIONARY['Baptism Anniversary']);
  }

  if (dynamicQuickWishes.length === 0) {
    dynamicQuickWishes = WISH_DICTIONARY['General'];
  } else {
    // Add one general wish at the end just in case
    dynamicQuickWishes.push(WISH_DICTIONARY['General'][0]);
  }

  // Deduplicate just in case
  dynamicQuickWishes = [...new Set(dynamicQuickWishes)];

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top App Bar */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" color={COLORS.onBackground} size={22} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerEmoji}>🎉</Text>
            <Text
              style={styles.headerTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              Today's Celebrations
            </Text>
          </View>
          <Text style={styles.headerDate} numberOfLines={1}>{dateFormatted}</Text>
        </View>

        <View style={styles.headerRightBadges}>
          <TouchableOpacity
            onPress={() =>
              setE2eeModalMode(
                e2eeState.status === 'needs_pin_unlock' ? 'unlock_backup' : 'manage'
              )
            }
            activeOpacity={0.8}
            style={styles.e2eeBadge}
          >
            <MaterialIcons name="lock" size={11} color={COLORS.primary} />
            <Text style={styles.e2eeBadgeText}>
              {e2eeState.status === 'needs_pin_unlock' ? 'PIN' : 'E2EE'}
            </Text>
          </TouchableOpacity>

          <View style={styles.liveBadge}>
            <AnimatedSpikes />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        enabled={Platform.OS === 'ios'}
      >
        <FlatList
          ref={flatListRef}
          style={styles.scrollFlex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          data={loading ? [] : displayedMessages}
          keyExtractor={(item) => item.id}
          initialNumToRender={16}
          maxToRenderPerBatch={12}
          windowSize={9}
          removeClippedSubviews={Platform.OS === 'android'}
          maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 10 }}
          scrollEventThrottle={100}
          onScrollBeginDrag={() => {
            userScrolledRef.current = true;
          }}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            const isScrollingUpward = y < prevScrollYRef.current;
            prevScrollYRef.current = y;
            if (
              userScrolledRef.current &&
              isScrollingUpward &&
              y <= 220 &&
              hasMoreOlder &&
              !loadingOlderRef.current
            ) {
              loadOlderMessages();
            }
          }}
          onScrollToIndexFailed={(info) => {
            const approxOffset = Math.max(0, info.averageItemLength * info.index - 40);
            flatListRef.current?.scrollToOffset({ offset: approxOffset, animated: false });
            setTimeout(() => {
              if (flatListRef.current && info.index < displayedMessages.length) {
                flatListRef.current.scrollToIndex({
                  index: info.index,
                  animated: false,
                  viewPosition: 0.08,
                });
              }
            }, 90);
          }}
          onContentSizeChange={() => {
            if (scrollToBottomPendingRef.current && displayedMessages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
          onLayout={() => {
            if (scrollToBottomPendingRef.current && displayedMessages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: true });
            }
          }}
          ListHeaderComponent={
            <View>
              {/* Celebration Cards Section */}
              <View style={styles.celebrationsSection}>
                <View style={styles.tapInstructionRow}>
                  <Text style={styles.tapEmoji}>👉</Text>
                  <Text style={styles.tapText}>Tap a card to see their dedicated wishes</Text>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.cardsScroll}
                >
                  {celebrations.map((celeb: any, idx: number) => {
                    const photo = getPhotoUrl(celeb);
                    const celebId = celeb.id || celeb.uid || celeb.Id;
                    const celebMemberId = celeb.memberId || celeb.Id;
                    const celebName = celeb.Name || celeb.name || 'Member';
                    const wishCount = messages.filter(m => {
                      if (m.targetCelebrantId) {
                        return (
                          m.targetCelebrantId === celebId ||
                          (celebMemberId && m.targetCelebrantId === celebMemberId)
                        );
                      }
                      return Boolean(m.targetCelebrantName && m.targetCelebrantName.toLowerCase() === celebName.toLowerCase());
                    }).length;
                    return (
                      <TouchableOpacity key={idx} style={[styles.celebCard, selectedCardCeleb && (selectedCardCeleb.id || selectedCardCeleb.uid || selectedCardCeleb.Id) === celebId && { borderColor: COLORS.primary, borderWidth: 1 }]} onPress={() => {
                        const currentSelectedId = selectedCardCeleb?.id || selectedCardCeleb?.uid || selectedCardCeleb?.Id;
                        if (currentSelectedId === celebId) {
                          setSelectedCardCeleb(null);
                        } else {
                          setSelectedCardCeleb(celeb);
                        }
                      }}>
                        {photo ? (
                          <CachedImage source={{ uri: photo }} style={styles.celebImage} resizeMode="cover" />
                        ) : (
                          <View style={styles.celebInitialBox}>
                            <Text style={styles.celebInitial}>
                              {(celebName)[0].toUpperCase()}
                            </Text>
                          </View>
                        )}
                        <View style={styles.celebCardTextInfo}>
                          <Text style={styles.celebCardName} numberOfLines={1}>
                            {celebName}
                          </Text>
                          <View style={styles.celebCardTypeRow}>
                            <Text style={styles.celebCardTypeEmoji}>{getCelebrationIcon(getCelebrationType(celeb))}</Text>
                            <Text style={styles.celebCardTypeText} numberOfLines={1}>
                              {getCelebrationType(celeb)}
                            </Text>
                          </View>
                          {wishCount > 0 && (
                            <View style={styles.wishCountBadge}>
                              <MaterialIcons name="favorite" color="#ef4444" size={10} />
                              <Text style={styles.wishCountText}>{wishCount} {wishCount === 1 ? 'wish' : 'wishes'}</Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  {celebrations.length === 0 && (
                    <View style={styles.noCelebBox}>
                      <Text style={styles.tapText}>No celebrations today.</Text>
                    </View>
                  )}
                </ScrollView>
              </View>

              {/* Divider */}
              <View style={styles.divider} />

              {/* Live Wishes Chat Header Section */}
              <View style={styles.chatHeaderSection}>
                {e2eeState.status === 'needs_pin_unlock' ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setE2eeModalMode('unlock_backup')}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      borderRadius: 12,
                      marginBottom: 10,
                      backgroundColor: 'rgba(255, 200, 128, 0.14)',
                      borderWidth: 1,
                      borderColor: 'rgba(255, 200, 128, 0.38)',
                    }}
                  >
                    <MaterialIcons name="lock" size={14} color={COLORS.primary} />
                    <Text style={{ flex: 1, color: COLORS.primary, fontSize: 12, fontWeight: '700' }}>
                      Encrypted wishes locked on this device — Tap to enter Backup PIN
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <View style={styles.chatHeader}>
                  <View style={[styles.chatHeaderLeft, { flex: 1 }]}>
                    <Text style={{ fontSize: 20 }}>💬</Text>
                    <Text style={styles.chatHeaderText} numberOfLines={1}>
                      Live Wishes
                    </Text>
                  </View>
                  <View style={styles.chatParticipantBadge}>
                    <MaterialIcons name="group" color={COLORS.onSurfaceVariant} size={16} />
                    <Text style={styles.chatParticipantText}>{participantCount} members</Text>
                  </View>
                </View>

                {loading ? (
                  <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
                ) : (hasMoreOlder || loadingOlder) ? (
                  <TouchableOpacity
                    style={styles.loadEarlierBtn}
                    disabled={loadingOlder}
                    onPress={loadOlderMessages}
                    activeOpacity={0.8}
                  >
                    {loadingOlder ? (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                      <Text style={styles.loadEarlierText}>Load earlier wishes</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          }
          renderItem={({ item, index }) => {
            const isMe = item.userId === currentUserId;
            const showUnreadDivider = index === firstUnreadIndex;
            const msgTimeMs = getChatMessageTimeMs(item.createdAt) || (typeof item.localCreatedAt === 'number' ? item.localCreatedAt : 0);
            const isUnreadMsg =
              !isMe &&
              lastReadLoaded &&
              (initialLastReadTime <= 0 ? true : msgTimeMs > initialLastReadTime);
            return (
              <View style={styles.messageItemWrapper}>
                {showUnreadDivider && (
                  <UnreadMessagesDivider
                    label="Unread Messages"
                    lineColor="rgba(255, 200, 128, 0.3)"
                    pillBgColor="rgba(255, 200, 128, 0.14)"
                    pillBorderColor="rgba(255, 200, 128, 0.38)"
                    textColor={COLORS.primary}
                    containerStyle={{ marginVertical: 6 }}
                  />
                )}
                <View style={[styles.messageRow, isMe ? styles.messageRowRight : styles.messageRowLeft]}>
                  {!isMe && (
                    <View style={styles.avatarContainer}>
                      {item.userPhoto ? (
                        <CachedImage source={{ uri: item.userPhoto }} style={styles.avatarImage} resizeMode="cover" />
                      ) : (
                        <View style={[styles.avatarImage, { backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: 'bold' }}>{item.userName?.[0]?.toUpperCase()}</Text>
                        </View>
                      )}
                    </View>
                  )}

                  {isMe ? (
                    <TouchableOpacity activeOpacity={0.8} onLongPress={() => handleMessageLongPress(item)} style={{ maxWidth: '75%', flexShrink: 1 }}>
                      <LinearGradient
                        colors={[COLORS.bubbleOutboundStart, COLORS.bubbleOutboundEnd]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[styles.messageBubble, styles.messageBubbleOutbound, { maxWidth: '100%' }]}
                      >
                        {item.targetCelebrantName && (
                          <Text style={styles.mentionTag}>To @{item.targetCelebrantName}</Text>
                        )}
                        {item.audioUrl ? (
                          <View>
                            <TouchableOpacity style={styles.audioBubble} onPress={() => playAudio(item.audioUrl, item.id)}>
                              <MaterialIcons name={playingId === item.id ? 'stop' : 'play-arrow'} color="#452b00" size={28} />
                              <View style={styles.audioWaveform}>
                                {[...Array(10)].map((_, i) => <View key={i} style={[styles.audioBar, { height: 4 + (i % 4) * 6 }]} />)}
                              </View>
                            </TouchableOpacity>
                            <Text style={[styles.messageTimeOutbound, { position: 'relative', bottom: 0, right: 0, textAlign: 'right', marginTop: 4 }]}>
                              {formatTime(item.createdAt || item.localCreatedAt)}
                            </Text>
                          </View>
                        ) : (
                          <View>
                            <Text style={styles.messageTextOutbound}>{item.text}</Text>
                            <View style={styles.messageSpacer} />
                            <Text style={styles.messageTimeOutbound}>
                              {item.isEdited && <Text style={{ fontStyle: 'italic' }}>(edited) </Text>}
                              {formatTime(item.createdAt || item.localCreatedAt)}
                            </Text>
                          </View>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  ) : (
                    <View style={[styles.messageBubble, styles.messageBubbleInbound, { flexShrink: 1 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text style={[styles.messageSenderName, { marginBottom: 0 }]}>{item.userName}</Text>
                        {isUnreadMsg && (
                          <View style={{ backgroundColor: '#ef4444', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginLeft: 8 }}>
                            <Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>NEW</Text>
                          </View>
                        )}
                      </View>
                      {item.targetCelebrantName && (
                        <Text style={styles.mentionTag}>To @{item.targetCelebrantName}</Text>
                      )}
                      {item.audioUrl ? (
                        <View>
                          <TouchableOpacity style={styles.audioBubble} onPress={() => playAudio(item.audioUrl, item.id)}>
                            <MaterialIcons name={playingId === item.id ? 'stop' : 'play-arrow'} color={COLORS.primary} size={28} />
                            <View style={styles.audioWaveform}>
                              {[...Array(10)].map((_, i) => <View key={i} style={[styles.audioBar, { height: 4 + (i % 4) * 6, backgroundColor: COLORS.primary }]} />)}
                            </View>
                          </TouchableOpacity>
                          <Text style={[styles.messageTimeInbound, { position: 'relative', bottom: 0, right: 0, textAlign: 'right', marginTop: 4 }]}>{formatTime(item.createdAt || item.localCreatedAt)}</Text>
                        </View>
                      ) : (
                        <View>
                          <Text style={styles.messageTextInbound}>{item.text}</Text>
                          <View style={styles.messageSpacer} />
                          <Text style={styles.messageTimeInbound}>
                            {item.isEdited && <Text style={{ fontStyle: 'italic' }}>(edited) </Text>}
                            {formatTime(item.createdAt || item.localCreatedAt)}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {isMe && (
                    <View style={styles.avatarContainer}>
                      {item.userPhoto ? (
                        <CachedImage source={{ uri: item.userPhoto }} style={styles.avatarImage} resizeMode="cover" />
                      ) : (
                        <View style={[styles.avatarImage, { backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' }]}>
                          <Text style={{ color: '#ffffff', fontSize: 16, fontWeight: 'bold' }}>{item.userName?.[0]?.toUpperCase()}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          }}
        />

        {/* Bottom Action Area */}
        <View style={[styles.bottomArea, { paddingBottom: Platform.OS === 'ios' ? 24 : (isKeyboardVisible ? 8 : 48) }]}>
          {typingUsers.length > 0 && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
              <Text style={{ color: COLORS.onSurfaceVariant, fontSize: 12, fontStyle: 'italic' }}>
                {typingUsers.length === 1
                  ? `${typingUsers[0]} is typing...`
                  : `${typingUsers[0]} and ${typingUsers.length - 1} other${typingUsers.length > 2 ? 's' : ''} are typing...`}
              </Text>
            </View>
          )}

          {/* Quick replies - hidden while recording or editing */}
          {!isRecording && !editingMsgId && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRepliesScroll}>
              {dynamicQuickWishes.map((wish, idx) => (
                <TouchableOpacity key={idx} style={styles.quickReplyChip} onPress={() => sendMessage(wish)}>
                  <Text style={styles.quickReplyText}>{wish}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {isRecording ? (
            /* Recording UI */
            <View style={styles.recordingBarRow}>
              <TouchableOpacity style={styles.cancelRecordBtn} onPress={cancelRecording}>
                <MaterialIcons name="close" color="#ef4444" size={24} />
                <Text style={styles.cancelRecordText}>Cancel</Text>
              </TouchableOpacity>

              <View style={styles.recordingWaveContainer}>
                <Animated.View style={[styles.recordingDot, { opacity: recordingWaveAnim }]} />
                <View style={styles.recordingBars}>
                  {[...Array(12)].map((_, i) => {
                    const heights = [6, 14, 10, 18, 8, 20, 12, 16, 8, 14, 10, 6];
                    return (
                      <Animated.View
                        key={i}
                        style={[
                          styles.recordingBar,
                          {
                            height: heights[i],
                            opacity: recordingWaveAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0.4, 1],
                            }),
                            transform: [{
                              scaleY: recordingWaveAnim.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0.5, 1 + (i % 3) * 0.3],
                              })
                            }]
                          }
                        ]}
                      />
                    );
                  })}
                </View>
                <Text style={styles.recordingLabel}>Recording...</Text>
              </View>

              <TouchableOpacity
                style={styles.sendRecordBtn}
                onPress={stopAndSendRecording}
              >
                {uploadingAudio ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <MaterialIcons name="send" color="#fff" size={20} />
                )}
              </TouchableOpacity>
            </View>
          ) : (
            /* Normal Input UI */
            <>
              {showMentionPopup && filteredMentionCelebrants.length > 0 && (
                <View style={styles.mentionPopup}>
                  <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 150 }}>
                    {filteredMentionCelebrants.map((celeb: any, idx: number) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.mentionItem}
                        onPress={() => selectMention(celeb)}
                      >
                        <Text style={styles.mentionItemText}>
                          {celeb.Name || celeb.name || 'Member'} · {getCelebrationIcon(getCelebrationType(celeb))} {getCelebrationType(celeb)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
              <View style={styles.inputBarRow}>
                {editingMsgId && (
                  <TouchableOpacity
                    style={{ marginRight: 8, padding: 8, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 20 }}
                    onPress={() => {
                      setEditingMsgId(null);
                      setInputText('');
                      Keyboard.dismiss();
                    }}
                  >
                    <MaterialIcons name="close" color="#ef4444" size={20} />
                  </TouchableOpacity>
                )}
                <View style={[styles.inputContainer, editingMsgId && { borderColor: COLORS.primary, borderWidth: 1 }]}>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Type @ to mention or a blessing..."
                    placeholderTextColor="rgba(215, 195, 174, 0.5)"
                    value={inputText}
                    onChangeText={handleTextChange}
                    multiline
                    returnKeyType="send"
                    submitBehavior="submit"
                    onSubmitEditing={() => {
                      if (inputText.trim()) {
                        sendMessage(inputText);
                      }
                    }}
                    onKeyPress={(e) => {
                      if (
                        e.nativeEvent.key === 'Enter' &&
                        !(e.nativeEvent as any).shiftKey &&
                        inputText.trim()
                      ) {
                        (e as any).preventDefault?.();
                        sendMessage(inputText);
                      }
                    }}
                  />
                </View>

                <TouchableOpacity
                  style={styles.sendBtn}
                  onPress={() => {
                    if (inputText.trim()) {
                      sendMessage(inputText);
                    } else if (!editingMsgId) {
                      startRecording();
                    }
                  }}
                >
                  {editingMsgId ? (
                    <MaterialIcons name="check" color="#452b00" size={20} />
                  ) : inputText.trim() ? (
                    <MaterialIcons name="send" color="#452b00" size={20} />
                  ) : (
                    <MaterialIcons name="mic" color="#452b00" size={20} />
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
      {Platform.OS === 'android' && <View style={{ height: keyboardHeight > 0 ? keyboardHeight + (StatusBar.currentHeight || 24) + 20 : 0 }} />}

      {/* Beautiful Centered Pop-up Modal */}
      <Modal
        visible={!!longPressedMessage}
        transparent
        animationType="fade"
        onRequestClose={() => setLongPressedMessage(null)}
      >
        <TouchableOpacity
          style={styles.actionModalOverlay}
          activeOpacity={1}
          onPress={() => setLongPressedMessage(null)}
        >
          <View style={styles.actionModalCard}>
            <View style={styles.actionModalHeaderRow}>
              <Text style={styles.actionModalTitleText}>Options</Text>
            </View>

            <View style={styles.actionModalOptionsContainer}>
              {longPressedMessage && !longPressedMessage.audioUrl && (
                <>
                  <TouchableOpacity
                    style={styles.actionModalRowBtn}
                    onPress={() => editMessage(longPressedMessage)}
                  >
                    <View style={[styles.actionModalIconCircle, { backgroundColor: 'rgba(255, 200, 128, 0.15)' }]}>
                      <MaterialIcons name="edit" size={20} color={COLORS.primary} />
                    </View>
                    <Text style={styles.actionModalRowText}>Edit Message</Text>
                  </TouchableOpacity>
                  <View style={styles.actionModalDivider} />
                </>
              )}

              <TouchableOpacity
                style={styles.actionModalRowBtn}
                onPress={() => deleteMessage(longPressedMessage)}
              >
                <View style={[styles.actionModalIconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                  <MaterialIcons name="delete" size={20} color="#ef4444" />
                </View>
                <Text style={[styles.actionModalRowText, { color: '#ef4444' }]}>Delete Message</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      <ChatEncryptionModal
        visible={Boolean(e2eeModalMode)}
        uid={e2eeUid}
        mode={e2eeModalMode || 'manage'}
        isDark={true}
        accentColor={COLORS.primary}
        onClose={() => setE2eeModalMode(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  keyboardAvoid: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(82, 69, 52, 0.3)',
    backgroundColor: COLORS.background,
    zIndex: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.secondaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
  },
  headerEmoji: {
    fontSize: 16,
  },
  headerTitle: {
    color: COLORS.onBackground,
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  headerDate: {
    color: COLORS.onSurfaceVariant,
    fontSize: 12,
    opacity: 0.75,
    marginTop: 1,
  },
  headerRightBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 0,
  },
  e2eeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 200, 128, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 128, 0.35)',
  },
  e2eeBadgeText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '700',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(31, 209, 91, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(31, 209, 91, 0.3)',
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.tertiaryContainer,
  },
  liveText: {
    color: COLORS.tertiaryContainer,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  scrollFlex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  celebrationsSection: {
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  tapInstructionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  tapEmoji: {
    fontSize: 18,
  },
  tapText: {
    color: '#bfc6dc', // secondary
    fontSize: 13,
    fontWeight: '500',
  },
  cardsScroll: {
    gap: 12,
    paddingBottom: 8,
  },
  celebCard: {
    width: 260,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.secondaryContainer,
    borderWidth: 1,
    borderColor: 'rgba(156, 163, 175, 0.3)', // Ash color border
    borderRadius: 24, // Beautiful curved edges
    padding: 16,
    gap: 14,
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  noCelebBox: {
    padding: 12,
  },
  celebImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(156, 163, 175, 0.4)', // Ash color
  },
  celebInitialBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 200, 128, 0.15)',
    borderWidth: 2,
    borderColor: 'rgba(156, 163, 175, 0.4)', // Ash color
    justifyContent: 'center',
    alignItems: 'center',
  },
  celebInitial: {
    color: '#452b00',
    fontSize: 18,
    fontWeight: '600',
  },
  celebCardTextInfo: {
    flex: 1,
  },
  celebCardName: {
    color: COLORS.onBackground,
    fontSize: 14,
    fontWeight: '600',
  },
  celebCardTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  celebCardTypeEmoji: {
    fontSize: 14,
  },
  celebCardTypeText: {
    color: COLORS.primary,
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(82, 69, 52, 0.2)',
    marginHorizontal: 16,
  },
  chatSection: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  chatHeaderSection: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  loadEarlierBtn: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 128, 0.3)',
    backgroundColor: 'rgba(255, 200, 128, 0.08)',
    marginBottom: 8,
  },
  loadEarlierText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  messageItemWrapper: {
    paddingHorizontal: 16,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chatHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatHeaderText: {
    color: COLORS.onBackground,
    fontSize: 18,
    fontWeight: '600',
  },
  chatParticipantBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surfaceContainerHigh,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  chatParticipantText: {
    color: COLORS.onSurfaceVariant,
    fontSize: 12,
  },
  messagesContainer: {
    gap: 16,
    marginTop: 8,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 16,
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  avatarContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(82, 69, 52, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  messageBubbleOutbound: {
    borderRadius: 16,
    borderTopRightRadius: 4,
  },
  messageBubbleInbound: {
    backgroundColor: COLORS.secondaryContainer,
    borderWidth: 1,
    borderColor: 'rgba(82, 69, 52, 0.5)',
    borderRadius: 16,
    borderTopLeftRadius: 4,
  },
  messageTextOutbound: {
    color: '#ffffff', // on-primary
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  messageSenderName: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  messageTextInbound: {
    color: COLORS.onBackground,
    fontSize: 16,
    marginBottom: 4,
  },
  messageSpacer: {
    paddingBottom: 12,
  },
  messageTimeOutbound: {
    position: 'absolute',
    bottom: 6,
    right: 12,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  messageTimeInbound: {
    position: 'absolute',
    bottom: 6,
    right: 12,
    fontSize: 10,
    color: 'rgba(255, 200, 128, 0.7)',
  },
  bottomArea: {
    width: '100%',
    backgroundColor: COLORS.background,
    borderTopWidth: 1,
    borderTopColor: 'rgba(82, 69, 52, 0.3)',
  },
  quickRepliesScroll: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  quickReplyChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#0A0E17',
    borderWidth: 1,
    borderColor: COLORS.primary,
    marginRight: 8,
  },
  quickReplyText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  inputBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16, // Added for mobile responsiveness (safe area)
    gap: 12,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(82, 69, 52, 0.3)',
  },
  inputContainer: {
    flex: 1,
    backgroundColor: COLORS.secondaryContainer,
    borderWidth: 1,
    borderColor: 'rgba(82, 69, 52, 0.5)',
    borderRadius: 24,
    minHeight: 48,
    paddingVertical: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  textInput: {
    color: COLORS.onBackground,
    fontSize: 14,
    maxHeight: 100,
  },
  audioBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    minWidth: 160,
    maxWidth: 200,
  },
  audioWaveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
    overflow: 'hidden',
  },
  audioBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#452b00',
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  recordingBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 12,
  },
  cancelRecordBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  cancelRecordText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '600',
  },
  recordingWaveContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.secondaryContainer,
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  recordingBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  recordingBar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: '#ef4444',
  },
  recordingLabel: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  sendRecordBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  mentionPopup: {
    backgroundColor: COLORS.secondaryContainer,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    overflow: 'hidden',
  },
  mentionItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(82, 69, 52, 0.3)',
  },
  mentionItemText: {
    color: COLORS.onBackground,
    fontSize: 14,
    fontWeight: '600',
  },
  wishCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  wishCountText: {
    color: '#ef4444',
    fontSize: 10,
    fontWeight: '700',
  },
  mentionTag: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    opacity: 0.9,
  },
  dedicatedModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  dedicatedModalCard: {
    backgroundColor: COLORS.secondaryContainer,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  dedicatedModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(82, 69, 52, 0.4)',
  },
  dedicatedModalTitle: {
    color: COLORS.onBackground,
    fontSize: 18,
    fontWeight: '800',
  },
  dedicatedModalSubtitle: {
    color: COLORS.onSurfaceVariant,
    fontSize: 13,
    marginTop: 2,
  },
  dedicatedModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(82,69,52,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dedicatedEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  dedicatedEmptyText: {
    color: COLORS.onBackground,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  dedicatedEmptySubText: {
    color: COLORS.onSurfaceVariant,
    fontSize: 13,
    textAlign: 'center',
  },
  dedicatedWishesList: {
    flex: 1,
    marginBottom: 12,
  },
  dedicatedWishItem: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  dedicatedWishAvatar: {
    marginTop: 2,
  },
  dedicatedWishAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dedicatedWishBubble: {
    flex: 1,
    backgroundColor: 'rgba(82,69,52,0.25)',
    borderRadius: 14,
    padding: 10,
  },
  dedicatedWishSender: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  dedicatedWishText: {
    color: COLORS.onBackground,
    fontSize: 14,
    lineHeight: 20,
  },
  dedicatedWishTime: {
    color: COLORS.onSurfaceVariant,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },
  dedicatedWishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    justifyContent: 'center',
    marginTop: 4,
  },
  dedicatedWishBtnText: {
    color: '#452b00',
    fontWeight: '800',
    fontSize: 14,
  },
  actionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  actionModalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#1C2128',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  actionModalHeaderRow: {
    alignItems: 'center',
    marginBottom: 20,
  },
  actionModalTitleText: {
    color: COLORS.onBackground,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  actionModalOptionsContainer: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionModalRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 16,
  },
  actionModalIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionModalRowText: {
    color: COLORS.onBackground,
    fontSize: 16,
    fontWeight: '600',
  },
  actionModalDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginHorizontal: 16,
  }
});
