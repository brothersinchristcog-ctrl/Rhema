import React, { useEffect, useMemo, useRef, useState } from 'react';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Linking,
  Modal,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, G } from 'react-native-svg';
import {
  ArrowLeft,
  Ban,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Flag,
  Heart,
  Home,
  Image as ImageIcon,
  Info,
  Lock,
  Mail,
  MessageCircle,
  MessageSquare,
  MoreVertical,
  Phone,
  Share2,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Undo2,
  User,
  X,
} from 'lucide-react-native';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import MatchPhotoCarousel from '../components/MatchPhotoCarousel';
import MatrimonyReportModal from '../components/MatrimonyReportModal';
import ProtectedPhotoPlaceholder from '../components/ProtectedPhotoPlaceholder';
import VerifiedRibbonBadge from '../components/VerifiedRibbonBadge';
import { matrimonyApi } from '../services/matrimonyApi';
import { MatrimonyMatchCandidate, MemberEntitlements } from '../types/matrimony';

const CORAL_RED = '#E04B5A';
const DARK_GREEN = '#0B4F3E';
const TEAL_CHECK = '#14B8A6';
const PURPLE_ACCENT = '#7C3AED';
const UPGRADE_AMBER = '#B87333';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function formatCompactHeight(cm?: number | null): string | null {
  if (!cm || cm <= 0) return null;
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

function formatRecencyLabel(joinedAtMs: number): string {
  if (!joinedAtMs) return 'Verified Member';
  const diffHours = Math.max(0, Math.floor((Date.now() - joinedAtMs) / (1000 * 60 * 60)));
  if (diffHours < 24) return 'Joined today';
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 7) return `Joined ${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks <= 4) return `Joined ${diffWeeks}w ago`;
  return 'Verified Member';
}

function isFemaleGender(raw?: string): boolean {
  const s = String(raw || '').trim().toLowerCase();
  return s === 'female' || s === 'f' || s === 'woman' || s === 'bride' || s === 'girl';
}

function formatShortSentDate(ms?: number): string {
  if (!ms) return 'Recently';
  try {
    return new Date(ms).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Recently';
  }
}

function formatUnlockedDob(raw?: string | null): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  return s;
}

export default function MatrimonyMatchDetailScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const initialMatches: MatrimonyMatchCandidate[] = route?.params?.matches || [];
  const initialIndex: number = route?.params?.initialIndex ?? 0;
  const initialPhotoIndex: number = route?.params?.initialPhotoIndex ?? 0;
  const tabTitle: string = route?.params?.tabTitle || 'All matches';
  const viewerPhoto: string | null = route?.params?.viewerPhoto || null;

  const [matchList, setMatchList] = useState<MatrimonyMatchCandidate[]>(initialMatches);
  const [currentIndex, setCurrentIndex] = useState<number>(
    Math.max(0, Math.min(initialIndex, Math.max(0, initialMatches.length - 1)))
  );
  const [scrollY, setScrollY] = useState(0);
  const [busy, setBusy] = useState(false);
  const [unlockingContact, setUnlockingContact] = useState(false);
  const [entitlements, setEntitlements] = useState<MemberEntitlements | null>(null);
  const [lightboxPhotos, setLightboxPhotos] = useState<string[]>([]);
  const [lightboxIdx, setLightboxIdx] = useState(0);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [switchingProfile, setSwitchingProfile] = useState(false);
  const [requestingPhoto, setRequestingPhoto] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const viewedUidsRef = useRef<Set<string>>(new Set());
  const transitionX = useRef(new Animated.Value(0)).current;
  const transitionOpacity = useRef(new Animated.Value(1)).current;
  const activeTransitionRef = useRef<Animated.CompositeAnimation | null>(null);
  const transitionSeqRef = useRef(0);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skeletonPulse = useRef(new Animated.Value(0.45)).current;
  const pendingSendMapRef = useRef<Map<string, Promise<any>>>(new Map());
  const interestToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [interestToast, setInterestToast] = useState<{
    kind: 'sent' | 'cancelled';
    uid: string;
    name: string;
  } | null>(null);
  const undoHiddenToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undoHiddenToast, setUndoHiddenToast] = useState<{
    uid: string;
    name: string;
    candidate: MatrimonyMatchCandidate;
    index: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
      if (interestToastTimerRef.current) {
        clearTimeout(interestToastTimerRef.current);
      }
      if (undoHiddenToastTimerRef.current) {
        clearTimeout(undoHiddenToastTimerRef.current);
      }
      activeTransitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!switchingProfile) {
      skeletonPulse.setValue(0.45);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonPulse, {
          toValue: 0.9,
          duration: 180,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(skeletonPulse, {
          toValue: 0.5,
          duration: 180,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [switchingProfile, skeletonPulse]);

  const candidate = matchList[currentIndex] || null;
  const activeCandidateUid = candidate?.uid || null;

  useEffect(() => {
    if (!activeCandidateUid || viewedUidsRef.current.has(activeCandidateUid)) return;
    viewedUidsRef.current.add(activeCandidateUid);
    matrimonyApi.recordProfileView(activeCandidateUid).catch(() => {});
  }, [activeCandidateUid]);

  const profilesYouMayLike = useMemo(() => {
    if (!candidate) return [];
    const map = new Map<string, MatrimonyMatchCandidate>();
    for (const m of matchList) {
      if (m?.uid && m.uid !== candidate.uid) map.set(m.uid, m);
    }
    const cachedAll =
      matrimonyApi.getCachedMatches({
        tab: 'all',
        matchBasis: 'partner_preferences',
        sortBy: 'best_match',
        filters: {},
      })?.matches ||
      matrimonyApi.getCachedMatches()?.matches ||
      [];
    for (const m of cachedAll) {
      if (m?.uid && m.uid !== candidate.uid && !map.has(m.uid)) {
        map.set(m.uid, m);
      }
    }

    const candAge = typeof candidate.age === 'number' ? candidate.age : null;
    const candCity = String(candidate.location?.village || candidate.location?.city || '').toLowerCase();
    const candState = String(candidate.location?.state || '').toLowerCase();
    const candTongue = String(candidate.motherTongue || '').toLowerCase();

    return Array.from(map.values())
      .map((item) => {
        let rank = item.matchScore || 0;
        if (!item.interestStatus) rank += 20;
        if (item.signedProfilePhoto) rank += 15;
        if (candAge !== null && typeof item.age === 'number' && Math.abs(item.age - candAge) <= 3) {
          rank += 8;
        }
        const itemCity = String(item.location?.village || item.location?.city || '').toLowerCase();
        const itemState = String(item.location?.state || '').toLowerCase();
        const itemTongue = String(item.motherTongue || '').toLowerCase();
        if (candCity && itemCity === candCity) rank += 6;
        else if (candState && itemState === candState) rank += 4;
        if (candTongue && itemTongue === candTongue) rank += 5;
        if (item.sharedInterests?.length) rank += Math.min(8, item.sharedInterests.length * 2);
        return { item, rank };
      })
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 8)
      .map((x) => x.item);
  }, [matchList, candidate]);

  useEffect(() => {
    const neighborUrls: string[] = [];
    for (const idx of [
      currentIndex - 2,
      currentIndex - 1,
      currentIndex + 1,
      currentIndex + 2,
      currentIndex + 3,
      currentIndex + 4,
    ]) {
      const item = matchList[idx];
      if (!item) continue;
      if (item.signedProfilePhoto) neighborUrls.push(item.signedProfilePhoto);
      if (Array.isArray(item.signedGallery)) {
        item.signedGallery.slice(0, 2).forEach((u) => u && neighborUrls.push(u));
      }
    }
    Array.from(new Set(neighborUrls)).forEach((uri) => {
      if (uri.startsWith('http')) {
        Image.prefetch(uri).catch(() => {});
      }
    });
  }, [currentIndex, matchList]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      matrimonyApi
        .getMemberEntitlements()
        .then((res) => {
          if (res?.entitlements) setEntitlements(res.entitlements);
        })
        .catch(() => undefined);

      const mem =
        matrimonyApi.getCachedRegistration()?.profile?.membership ||
        matrimonyApi.getCachedStatus()?.profile?.membership;
      const isNowPaid =
        mem?.status === 'active' &&
        mem.tier !== 'free' &&
        (!mem.validUntilMs || mem.validUntilMs > Date.now());
      if (isNowPaid && candidate && (!candidate.dob || !candidate.contactPhone)) {
        matrimonyApi
          .getMatches({ tab: 'all' }, { force: true })
          .then((res) => {
            if (!res?.matches?.length) return;
            const byUid = new Map(res.matches.map((m) => [m.uid, m]));
            setMatchList((prev) =>
              prev.map((m) => {
                const updated = byUid.get(m.uid);
                return updated
                  ? {
                      ...m,
                      dob: updated.dob ?? m.dob,
                      contactPhone: updated.contactPhone ?? m.contactPhone,
                    }
                  : m;
              })
            );
          })
          .catch(() => undefined);
      }
    });
    return unsub;
  }, [navigation, candidate?.uid, candidate?.dob, candidate?.contactPhone]);

  const currentCandidateUid = matchList[currentIndex]?.uid;
  const currentInterestStatus = matchList[currentIndex]?.interestStatus;

  useEffect(() => {
    const myUid = auth().currentUser?.uid || '';
    if (!currentCandidateUid) return;
    let active = true;
    const unsub = firestore()
      .collection('matrimony_profiles')
      .doc(currentCandidateUid)
      .onSnapshot(
        (snap) => {
          if (!snap.exists || !active) return;
          const d = snap.data() || {};
          const vis = String(d.photoVisibility || 'approved_members');
          const allowedUids: string[] = Array.isArray(d.protectedPhotoAllowedUids)
            ? d.protectedPhotoAllowedUids
            : [];
          const hasStoredPhoto = Boolean(
            d.profilePhoto || (Array.isArray(d.gallery) && d.gallery.length > 0)
          );
          const isPaid = Boolean(
            entitlements && entitlements.subscriptionStatus === 'active' && entitlements.tier !== 'free'
          );

          let canSee = true;
          if (vis === 'protect_photo') {
            canSee = Boolean(myUid && allowedUids.includes(myUid));
          } else if (vis === 'contacted_and_paid') {
            canSee = Boolean(
              (myUid && allowedUids.includes(myUid)) || isPaid || currentInterestStatus
            );
          } else if (vis === 'matches_only') {
            canSee = Boolean(
              (myUid && allowedUids.includes(myUid)) || currentInterestStatus === 'accepted'
            );
          }

          if (!canSee) {
            setMatchList((prev) =>
              prev.map((m) =>
                m.uid === currentCandidateUid
                  ? {
                      ...m,
                      signedProfilePhoto: null,
                      signedGallery: [],
                      photoCount: 0,
                      isPhotoProtected: hasStoredPhoto,
                      photoRequestStatus:
                        m.photoRequestStatus === 'approved' ? 'declined' : m.photoRequestStatus,
                      photoVisibility: vis as any,
                    }
                  : m
              )
            );
            matrimonyApi.patchCandidatePhotosInCache(currentCandidateUid, {
              signedProfilePhoto: null,
              signedGallery: [],
              photoCount: 0,
              isPhotoProtected: hasStoredPhoto,
              photoVisibility: vis,
            });
          } else {
            const rawPaths = [
              typeof d.profilePhoto === 'string' ? d.profilePhoto : null,
              ...(Array.isArray(d.gallery) ? d.gallery : []),
            ].filter((x): x is string => Boolean(x));
            if (rawPaths.length === 0) {
              setMatchList((prev) =>
                prev.map((m) =>
                  m.uid === currentCandidateUid
                    ? {
                        ...m,
                        signedProfilePhoto: null,
                        signedGallery: [],
                        photoCount: 0,
                        isPhotoProtected: false,
                        photoVisibility: vis as any,
                      }
                    : m
                )
              );
              return;
            }

            (async () => {
              const clientUrls = await Promise.all(
                rawPaths.map((p) => matrimonyApi.resolvePhotoUrl(p))
              ).catch(() => [] as (string | null)[]);
              if (!active) return;

              let clean = clientUrls.filter((u): u is string => Boolean(u));
              if (clean.length === 0) {
                const serverRes = await matrimonyApi
                  .getCandidatePhotos(currentCandidateUid)
                  .catch(() => null);
                if (!active) return;
                if (serverRes?.canSeePhotos && serverRes.signedProfilePhoto) {
                  clean = [
                    serverRes.signedProfilePhoto,
                    ...(Array.isArray(serverRes.signedGallery) ? serverRes.signedGallery : []),
                  ];
                }
              }

              const nextMain = clean[0] || null;
              if (!nextMain) return;
              const nextGal = clean.slice(1);
              const nextReqStatus = vis === 'protect_photo' ? 'approved' : undefined;

              setMatchList((prev) =>
                prev.map((m) =>
                  m.uid === currentCandidateUid
                    ? {
                        ...m,
                        signedProfilePhoto: nextMain,
                        signedGallery: nextGal,
                        photoCount: clean.length,
                        isPhotoProtected: false,
                        ...(nextReqStatus ? { photoRequestStatus: nextReqStatus } : {}),
                        photoVisibility: vis as any,
                      }
                    : m
                )
              );
              matrimonyApi.patchCandidatePhotosInCache(currentCandidateUid, {
                signedProfilePhoto: nextMain,
                signedGallery: nextGal,
                photoCount: clean.length,
                isPhotoProtected: false,
                photoVisibility: vis,
                ...(nextReqStatus ? { photoRequestStatus: nextReqStatus } : {}),
              });
            })().catch(() => undefined);
          }
        },
        () => {}
      );
    return () => {
      active = false;
      unsub();
    };
  }, [currentCandidateUid, currentInterestStatus, entitlements]);

  if (!candidate) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <View style={styles.emptyWrap}>
          <Text style={[styles.emptyTitle, { color: colors.text, fontFamily }]}>
            No more matches to display
          </Text>
          <TouchableOpacity style={styles.backFallbackBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backFallbackText}>Back to Matches</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isFemale = isFemaleGender(candidate.gender);
  const possessive = isFemale ? 'her' : 'his';
  const possessiveCap = isFemale ? 'Her' : 'His';

  const allPhotos: string[] = [];
  if (candidate.signedProfilePhoto) allPhotos.push(candidate.signedProfilePhoto);
  for (const g of candidate.signedGallery || []) {
    if (g && !allPhotos.includes(g)) allPhotos.push(g);
  }

  const animateCandidateChange = (
    direction: number,
    nextPhotoUri: string | null | undefined,
    onSwap: () => void
  ) => {
    activeTransitionRef.current?.stop();
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    const seq = ++transitionSeqRef.current;

    setSwitchingProfile(true);
    onSwap();
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setScrollY(0);

    if (nextPhotoUri && nextPhotoUri.startsWith('http')) {
      Image.prefetch(nextPhotoUri).catch(() => undefined);
    }

    transitionTimerRef.current = setTimeout(() => {
      transitionTimerRef.current = null;
      if (transitionSeqRef.current !== seq) return;
      transitionX.setValue(direction >= 0 ? 14 : -14);
      transitionOpacity.setValue(0.92);
      setSwitchingProfile(false);

      const enterAnim = Animated.parallel([
        Animated.timing(transitionOpacity, {
          toValue: 1,
          duration: 90,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(transitionX, {
          toValue: 0,
          duration: 90,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);
      activeTransitionRef.current = enterAnim;
      enterAnim.start();
    }, 180);
  };

  const stepMatch = (delta: number) => {
    const next = currentIndex + delta;
    if (next < 0 || next >= matchList.length) return;
    const nextCand = matchList[next];
    animateCandidateChange(delta, nextCand?.signedProfilePhoto, () => setCurrentIndex(next));
  };

  const handleToggleShortlist = async () => {
    const targetUid = candidate.uid;
    setMatchList((prev) =>
      prev.map((m) => (m.uid === targetUid ? { ...m, isShortlisted: !m.isShortlisted } : m))
    );
    try {
      const res = await matrimonyApi.toggleShortlist(targetUid);
      setMatchList((prev) =>
        prev.map((m) => (m.uid === targetUid ? { ...m, isShortlisted: res.shortlisted } : m))
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Unable to update shortlist.');
    }
  };

  const handleRequestPhotoAccess = async () => {
    if (!candidate?.uid || candidate.photoRequestStatus === 'pending') return;
    const targetUid = candidate.uid;
    if (pendingSendMapRef.current.has(`photo:${targetUid}`)) return;

    setMatchList((prev) =>
      prev.map((m) => (m.uid === targetUid ? { ...m, photoRequestStatus: 'pending' } : m))
    );

    const req = (async () => {
      try {
        const res = await matrimonyApi.requestPhotoAccess(targetUid);
        if (res?.status === 'approved') {
          const photoRes = await matrimonyApi.getCandidatePhotos(targetUid).catch(() => null);
          setMatchList((prev) =>
            prev.map((m) =>
              m.uid === targetUid
                ? {
                    ...m,
                    photoRequestStatus: 'approved',
                    ...(photoRes?.signedProfilePhoto
                      ? {
                          signedProfilePhoto: photoRes.signedProfilePhoto,
                          signedGallery: photoRes.signedGallery || [],
                          photoCount:
                            1 + (Array.isArray(photoRes.signedGallery) ? photoRes.signedGallery.length : 0),
                          isPhotoProtected: false,
                        }
                      : {}),
                  }
                : m
            )
          );
        }
      } catch (err: any) {
        setMatchList((prev) =>
          prev.map((m) => (m.uid === targetUid ? { ...m, photoRequestStatus: null } : m))
        );
        Alert.alert('Request Failed', err?.message || 'Unable to send photo request.');
      } finally {
        pendingSendMapRef.current.delete(`photo:${targetUid}`);
      }
    })();

    pendingSendMapRef.current.set(`photo:${targetUid}`, req);
  };

  const handleDontShow = (blockType: 'dont_show' | 'blocked' = 'dont_show') => {
    const removedCandidate = candidate;
    if (!removedCandidate?.uid) return;
    const targetUid = removedCandidate.uid;
    const prevList = matchList;
    const prevIndex = currentIndex;
    const remaining = prevList.filter((m) => m.uid !== targetUid);

    const preview = {
      uid: targetUid,
      displayName: removedCandidate.displayName,
      profileCode: removedCandidate.profileCode,
      age: removedCandidate.age ?? null,
      heightCm: removedCandidate.heightCm ?? null,
      occupation: String(
        removedCandidate.career?.profession ||
          removedCandidate.career?.occupationCategory ||
          removedCandidate.education?.qualification ||
          ''
      ).trim(),
      city: String(
        removedCandidate.location?.village ||
          removedCandidate.location?.city ||
          removedCandidate.location?.state ||
          ''
      ).trim(),
      signedProfilePhoto: removedCandidate.signedProfilePhoto || null,
    };

    if (remaining.length === 0) {
      matrimonyApi.dismissMatch(targetUid, blockType, preview).catch(() => {});
      navigation.goBack();
      return;
    }

    setMatchList(remaining);
    setCurrentIndex(Math.min(prevIndex, remaining.length - 1));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setScrollY(0);

    if (blockType === 'dont_show') {
      if (interestToastTimerRef.current) clearTimeout(interestToastTimerRef.current);
      setInterestToast(null);
      if (undoHiddenToastTimerRef.current) clearTimeout(undoHiddenToastTimerRef.current);
      setUndoHiddenToast({
        uid: targetUid,
        name: removedCandidate.displayName,
        candidate: removedCandidate,
        index: prevIndex,
      });
      undoHiddenToastTimerRef.current = setTimeout(() => {
        setUndoHiddenToast((prev) => (prev?.uid === targetUid ? null : prev));
      }, 6000);
    }

    matrimonyApi.dismissMatch(targetUid, blockType, preview).catch((err: any) => {
      if (blockType === 'dont_show') {
        if (undoHiddenToastTimerRef.current) clearTimeout(undoHiddenToastTimerRef.current);
        setUndoHiddenToast((prev) => (prev?.uid === targetUid ? null : prev));
      }
      setMatchList(prevList);
      setCurrentIndex(prevIndex);
      Alert.alert('Error', err?.message || 'Unable to hide profile.');
    });
  };

  const handleUndoDontShow = () => {
    if (!undoHiddenToast) return;
    const { uid: targetUid, candidate: restoredCandidate, index: insertIdx } = undoHiddenToast;
    if (undoHiddenToastTimerRef.current) clearTimeout(undoHiddenToastTimerRef.current);
    setUndoHiddenToast(null);

    let restoredPos = 0;
    setMatchList((prev) => {
      if (prev.some((m) => m.uid === targetUid)) {
        restoredPos = prev.findIndex((m) => m.uid === targetUid);
        return prev;
      }
      const next = [...prev];
      restoredPos = Math.max(0, Math.min(insertIdx, next.length));
      next.splice(restoredPos, 0, restoredCandidate);
      return next;
    });
    setCurrentIndex(Math.max(0, Math.min(insertIdx, matchList.length)));
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setScrollY(0);

    matrimonyApi.restoreDismissedMatches(targetUid, 'dont_show').catch((err: any) => {
      Alert.alert('Error', err?.message || 'Unable to restore profile.');
    });
  };

  const handleSkip = () => {
    if (currentIndex + 1 < matchList.length) {
      stepMatch(1);
    } else if (matchList.length > 1) {
      animateCandidateChange(1, matchList[0]?.signedProfilePhoto, () => setCurrentIndex(0));
    } else {
      navigation.goBack();
    }
  };

  const showInterestToast = (
    next: { kind: 'sent' | 'cancelled'; uid: string; name: string },
    durationMs: number
  ) => {
    if (interestToastTimerRef.current) clearTimeout(interestToastTimerRef.current);
    setInterestToast(next);
    interestToastTimerRef.current = setTimeout(() => {
      setInterestToast((prev) => (prev?.uid === next.uid && prev?.kind === next.kind ? null : prev));
    }, durationMs);
  };

  const handleUndoSendInterest = async (targetUid: string, targetName: string) => {
    setMatchList((prev) =>
      prev.map((m) =>
        m.uid === targetUid ? { ...m, interestStatus: null, interestSentAtMs: undefined } : m
      )
    );
    showInterestToast({ kind: 'cancelled', uid: targetUid, name: targetName }, 3000);
    try {
      const pendingReq = pendingSendMapRef.current.get(targetUid);
      if (pendingReq) {
        await pendingReq.catch(() => undefined);
      }
      await matrimonyApi.respondInterest(targetUid, 'withdraw');
    } catch (err: any) {
      console.warn('Detail handleUndoSendInterest warning:', err);
    }
  };

  const handleSendInterest = async () => {
    if (candidate.interestStatus) return;
    const targetUid = candidate.uid;
    const targetName = candidate.displayName;
    const optimisticSentAt = Date.now();
    // Instant optimistic transition to Call Now + Send Message & Undo toast
    setMatchList((prev) =>
      prev.map((m) =>
        m.uid === targetUid
          ? { ...m, interestStatus: 'pending', interestSentAtMs: optimisticSentAt }
          : m
      )
    );
    showInterestToast({ kind: 'sent', uid: targetUid, name: targetName }, 5500);

    const sendPromise = matrimonyApi.sendInterest(targetUid);
    pendingSendMapRef.current.set(targetUid, sendPromise);

    try {
      const res = await sendPromise;
      setMatchList((prev) =>
        prev.map((m) =>
          m.uid === targetUid && m.interestSentAtMs === optimisticSentAt
            ? { ...m, interestStatus: res.interestStatus, interestSentAtMs: optimisticSentAt }
            : m
        )
      );
      if (res.isMutual) {
        setInterestToast((prev) => (prev?.uid === targetUid ? null : prev));
        Alert.alert(
          'Mutual Match!',
          `${targetName} also expressed interest in your profile.`
        );
      }
      if (typeof (res as any).interestsSentThisMonth === 'number') {
        setEntitlements((prev) =>
          prev
            ? {
                ...prev,
                interestsSentThisMonth: (res as any).interestsSentThisMonth,
                interestsRemaining:
                  typeof (res as any).interestsRemaining === 'number'
                    ? (res as any).interestsRemaining
                    : prev.interestsRemaining,
              }
            : prev
        );
      }
    } catch (err: any) {
      setMatchList((prev) =>
        prev.map((m) =>
          m.uid === targetUid && m.interestSentAtMs === optimisticSentAt
            ? { ...m, interestStatus: null, interestSentAtMs: undefined }
            : m
        )
      );
      setInterestToast((prev) => (prev?.uid === targetUid ? null : prev));
      if (
        err?.details?.reasonCode === 'MONTHLY_INTEREST_LIMIT_REACHED' ||
        String(err?.message || '').toLowerCase().includes('month')
      ) {
        Alert.alert(
          'Monthly Interest Limit Reached',
          err?.message ||
            'Free members can send up to 20 interests per month. Upgrade to Silver, Gold, or Platinum for unlimited interests.',
          [
            { text: 'Not Now', style: 'cancel' },
            { text: 'Upgrade Plan', onPress: () => navigation.navigate('MatrimonyUpgrade') },
          ]
        );
      } else {
        Alert.alert('Error', err?.message || 'Unable to send interest.');
      }
    } finally {
      if (pendingSendMapRef.current.get(targetUid) === sendPromise) {
        pendingSendMapRef.current.delete(targetUid);
      }
    }
  };

  const handleUnlockContact = async () => {
    if (unlockingContact) return;
    if (candidate.mobilePrivacy === 'messages_only') {
      Alert.alert(
        'Messages Only',
        `${candidate.displayName} prefers to be contacted via Messages only.`
      );
      return;
    }
    if (!entitlements || entitlements.tier === 'free' || entitlements.contactNumberLimit === 0) {
      navigation.navigate('MatrimonyUpgrade');
      return;
    }
    setUnlockingContact(true);
    try {
      const res = await matrimonyApi.unlockContact(candidate.uid);
      setMatchList((prev) =>
        prev.map((m) =>
          m.uid === candidate.uid
            ? {
                ...m,
                contactPhone: res.contactPhone ?? m.contactPhone,
                dob: res.dob ?? m.dob,
                isContactUnlocked: true,
              }
            : m
        )
      );
      setEntitlements((prev) =>
        prev
          ? {
              ...prev,
              contactNumbersViewedCount: res.contactNumbersViewedCount,
              contactNumbersRemaining: res.contactNumbersRemaining,
              unlockedContactUids: prev.unlockedContactUids.includes(candidate.uid)
                ? prev.unlockedContactUids
                : [...prev.unlockedContactUids, candidate.uid],
            }
          : prev
      );
      if (!res.contactPhone && !res.dob) {
        Alert.alert('Unlocked', 'Contact details unlocked for this profile.');
      }
    } catch (err: any) {
      if (
        err?.details?.reasonCode === 'CONTACT_UNLOCK_LIMIT_REACHED' ||
        err?.details?.reasonCode === 'UPGRADE_REQUIRED'
      ) {
        Alert.alert(
          'Contact Limit Reached',
          err?.message || 'Upgrade your membership to unlock more contact numbers.',
          [
            { text: 'Not Now', style: 'cancel' },
            { text: 'Upgrade', onPress: () => navigation.navigate('MatrimonyUpgrade') },
          ]
        );
      } else {
        Alert.alert('Unlock Failed', err?.message || 'Unable to unlock contact right now.');
      }
    } finally {
      setUnlockingContact(false);
    }
  };

  const handleCallCandidate = () => {
    if (candidate.mobilePrivacy === 'messages_only') {
      Alert.alert(
        'Messages Only',
        `${candidate.displayName} has restricted phone calls to Messages only.`
      );
      return;
    }
    if (!entitlements || entitlements.tier === 'free' || !entitlements.callAccess) {
      Alert.alert(
        'Upgrade to Call',
        'Calling members directly is unlocked for Silver, Gold, and Platinum members.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Upgrade Plan', onPress: () => navigation.navigate('MatrimonyUpgrade') },
        ]
      );
      return;
    }
    if (candidate.contactPhone) {
      Linking.openURL(`tel:${candidate.contactPhone}`).catch(() => {
        Alert.alert('Call Failed', 'Could not open phone dialer.');
      });
      return;
    }
    Alert.alert(
      'Unlock Contact Number',
      `Unlock ${candidate.displayName}'s contact number (${
        entitlements.contactNumberLimit < 0
          ? 'Unlimited'
          : `${entitlements.contactNumbersRemaining}/${entitlements.contactNumberLimit} left`
      }) to call?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unlock & View', onPress: handleUnlockContact },
      ]
    );
  };

  const handleWhatsAppCandidate = () => {
    if (candidate.mobilePrivacy === 'messages_only') {
      Alert.alert(
        'Messages Only',
        `${candidate.displayName} has restricted direct calls to Messages only.`
      );
      return;
    }
    if (!entitlements || entitlements.tier === 'free' || !entitlements.whatsappAccess) {
      Alert.alert(
        'Upgrade for WhatsApp',
        'Opening WhatsApp chats is available for Silver, Gold, and Platinum members.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'Upgrade Plan', onPress: () => navigation.navigate('MatrimonyUpgrade') },
        ]
      );
      return;
    }
    if (!candidate.contactPhone) {
      handleUnlockContact();
      return;
    }
    const digits = candidate.contactPhone.replace(/[^\d]/g, '');
    const waDigits = digits.length === 10 ? `91${digits}` : digits;
    Linking.openURL(`https://wa.me/${waDigits}`).catch(() => {
      Alert.alert('WhatsApp Unavailable', 'Could not open WhatsApp on this device.');
    });
  };

  const handleSendMessageCandidate = () => {
    const isMutualMatch = candidate.interestStatus === 'accepted';
    const hasMessageAccess = Boolean(entitlements?.messageAccess);

    if (hasMessageAccess && !isMutualMatch) {
      Alert.alert(
        'Send Message',
        `Personalised messaging unlocks once ${candidate.displayName} accepts your interest.`
      );
      return;
    }

    setLightboxPhotos([]);
    navigation.navigate('MatrimonyChat', {
      targetUid: candidate.uid,
      isMutualMatch,
      peer: {
        uid: candidate.uid,
        displayName: candidate.displayName,
        profileCode: candidate.profileCode,
        signedProfilePhoto: candidate.signedProfilePhoto || null,
        age: candidate.age ?? null,
        heightCm: candidate.heightCm ?? null,
        occupation:
          candidate.career?.profession ||
          candidate.career?.occupationCategory ||
          candidate.career?.employmentType ||
          candidate.education?.qualification ||
          null,
        gender: candidate.gender || null,
        isVerified: true,
        city:
          candidate.location?.village ||
          candidate.location?.city ||
          candidate.location?.state ||
          '',
        contactPhone: candidate.contactPhone || null,
      },
    });
  };

  const handleShareProfile = async () => {
    try {
      const details = [
        candidate.age ? `${candidate.age} Yrs` : null,
        formatCompactHeight(candidate.heightCm),
        candidate.career?.profession || candidate.education?.qualification || null,
        candidate.location?.village || candidate.location?.city || candidate.location?.state || null,
      ]
        .filter(Boolean)
        .join(' • ');
      await Share.share({
        message: `Rhema Matrimony Profile: ${candidate.displayName} (${candidate.profileCode})${
          details ? `\n${details}` : ''
        }`,
      });
    } catch {
      // Share sheet dismissed
    }
  };

  const handleBlockProfile = () => {
    Alert.alert(
      'Block Profile',
      `Are you sure you want to block ${candidate.displayName}? They will no longer appear in your matches or be able to contact you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => handleDontShow('blocked') },
      ]
    );
  };

  const dividerColor = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';
  const showCompactHeader = scrollY > 360;

  const prefComparison = candidate.partnerPreferencesComparison;
  const hasSentInterest = Boolean(candidate.interestStatus);
  const isMutual = candidate.interestStatus === 'accepted';
  const sentDateStr = formatShortSentDate(candidate.interestSentAtMs);

  const summaryBits = [
    candidate.maritalStatus || 'Never Married',
    candidate.profileCreatedBy ? `Profile created by ${candidate.profileCreatedBy}` : null,
    candidate.age ? `${candidate.age} Yrs` : null,
    formatCompactHeight(candidate.heightCm),
    candidate.faithSummary?.division,
    candidate.faithSummary?.baptized === true ? 'Baptized' : null,
    candidate.education?.qualification,
    candidate.career?.profession,
    candidate.location?.village || candidate.location?.city || candidate.location?.state,
  ].filter(Boolean);

  const renderSectionBanner = (title: string, IconComp: any) => (
    <LinearGradient
      colors={
        isDark
          ? ['rgba(251, 146, 60, 0.24)', 'rgba(251, 146, 60, 0.08)', 'rgba(251, 146, 60, 0.0)']
          : ['#FFE8D6', '#FFF4EB', '#FFFFFF']
      }
      locations={[0, 0.45, 1]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={styles.sectionBanner}
    >
      <View
        style={[
          styles.sectionIconCircle,
          {
            backgroundColor: isDark ? 'rgba(251, 146, 60, 0.26)' : '#FCDAC2',
            borderColor: isDark ? 'rgba(253, 186, 116, 0.45)' : '#475569',
          },
        ]}
      >
        <IconComp size={16} color={isDark ? '#FED7AA' : '#334155'} strokeWidth={1.7} />
      </View>
      <Text
        style={[
          styles.sectionBannerTitle,
          { color: colors.text, fontFamily, fontSize: scaleFont(16.5) },
        ]}
      >
        {title}
      </Text>
    </LinearGradient>
  );

  const renderKvRow = (label: string, value?: string | null) => {
    if (!value || !String(value).trim()) return null;
    return (
      <View style={styles.kvRow} key={label}>
        <Text style={[styles.kvLabel, { color: colors.textSecondary, fontFamily }]}>{label}</Text>
        <Text style={[styles.kvColon, { color: colors.textSecondary }]}>:</Text>
        <Text style={[styles.kvValue, { color: colors.text, fontFamily }]}>{value}</Text>
      </View>
    );
  };

  const fam = candidate.familyDetails;
  const interests = candidate.interests || {};
  const languagesList = interests.languages || [];
  const unlockedDob = formatUnlockedDob(candidate.dob);
  const hasUnlockedDob = Boolean(unlockedDob);
  const dobDisplay = unlockedDob || '**/**/****';

  const handleSelectRecommended = (rec: MatrimonyMatchCandidate) => {
    const existingIdx = matchList.findIndex((m) => m.uid === rec.uid);
    if (existingIdx >= 0) {
      const dir = existingIdx >= currentIndex ? 1 : -1;
      animateCandidateChange(dir, rec.signedProfilePhoto, () => setCurrentIndex(existingIdx));
      return;
    }
    const nextIdx = matchList.length;
    setMatchList((prev) => [...prev, rec]);
    animateCandidateChange(1, rec.signedProfilePhoto, () => setCurrentIndex(nextIdx));
  };

  const handleUpgradeToView = () => {
    navigation.navigate('MatrimonyUpgrade');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.surface} />

      {/* Top Sticky Bar */}
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: colors.surface,
            borderBottomColor: dividerColor,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.topBackBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ArrowLeft size={22} color={colors.text} />
        </TouchableOpacity>

        <Text style={[styles.topTitle, { color: colors.text, fontFamily }]} numberOfLines={1}>
          {showCompactHeader
            ? candidate.profileCode
            : `${tabTitle} ${currentIndex + 1}/${matchList.length}`}
        </Text>

        <View style={[styles.topRightIcons, { minWidth: 32, justifyContent: 'flex-end' }]}>
          {showCompactHeader ? (
            <>
              <TouchableOpacity onPress={handleToggleShortlist} style={{ padding: 6 }}>
                <Bookmark
                  size={20}
                  color={candidate.isShortlisted ? CORAL_RED : colors.text}
                  fill={candidate.isShortlisted ? CORAL_RED : 'transparent'}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setMoreMenuOpen(true)}
                style={{ padding: 6 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MoreVertical size={20} color={colors.text} />
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </View>

      {/* Main Scroll Content or Full-Screen Skeleton Preview While Switching */}
      {switchingProfile ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 20, 28) }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ opacity: skeletonPulse }}>
            {/* Hero Image Skeleton */}
            <View
              style={[
                styles.skeletonHero,
                { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
              ]}
            >
              <View
                style={[
                  styles.skeletonPillTop,
                  { backgroundColor: isDark ? '#334155' : '#CBD5E1' },
                ]}
              />
            </View>

            {/* Name & Quick Summary Skeleton */}
            <View style={[styles.skeletonBodyWrap, { borderBottomColor: dividerColor }]}>
              <View
                style={[
                  styles.skeletonLine,
                  { width: '32%', height: 14, backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
                ]}
              />
              <View
                style={[
                  styles.skeletonLine,
                  { width: '62%', height: 24, marginTop: 10, backgroundColor: isDark ? '#334155' : '#CBD5E1' },
                ]}
              />
              <View
                style={[
                  styles.skeletonLine,
                  { width: '48%', height: 14, marginTop: 6, backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
                ]}
              />
              <View
                style={[
                  styles.skeletonLine,
                  { width: '90%', height: 14, marginTop: 10, backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
                ]}
              />
              <View
                style={[
                  styles.skeletonLine,
                  { width: '75%', height: 14, marginTop: 6, backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
                ]}
              />
            </View>

            {/* Section Detail Skeletons */}
            {[1, 2].map((sectionIdx) => (
              <View key={sectionIdx} style={styles.skeletonSection}>
                <View
                  style={[
                    styles.skeletonBannerBar,
                    { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' },
                  ]}
                />
                <View style={styles.skeletonRowsWrap}>
                  <View
                    style={[
                      styles.skeletonLine,
                      { width: '78%', height: 14, backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
                    ]}
                  />
                  <View
                    style={[
                      styles.skeletonLine,
                      { width: '64%', height: 14, backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
                    ]}
                  />
                  <View
                    style={[
                      styles.skeletonLine,
                      { width: '72%', height: 14, backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
                    ]}
                  />
                </View>
              </View>
            ))}
          </Animated.View>
        </ScrollView>
      ) : (
        <Animated.View
          style={{
            flex: 1,
            opacity: transitionOpacity,
            transform: [{ translateX: transitionX }],
          }}
        >
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 155 }}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
          >
        {/* Horizontally Scrollable Hero Gallery with Edge Next/Previous Match Buttons */}
        <View style={styles.heroOuter}>
          <MatchPhotoCarousel
            key={candidate.uid}
            carouselKey={candidate.uid}
            photos={allPhotos}
            height={390}
            initialIndex={currentIndex === initialIndex ? initialPhotoIndex : 0}
            emptyBackgroundColor={isDark ? '#1E293B' : '#E2E8F0'}
            emptyTextColor="#64748B"
            emptyLabel={
              candidate.isPhotoProtected
                ? 'Photo Protected by Member Privacy'
                : 'No Profile Photo'
            }
            customEmptyContent={
              candidate.isPhotoProtected && allPhotos.length === 0 ? (
                <ProtectedPhotoPlaceholder
                  gender={candidate.gender}
                  requestStatus={candidate.photoRequestStatus}
                  busy={requestingPhoto}
                  onRequestPhoto={handleRequestPhotoAccess}
                  fontFamily={fontFamily}
                />
              ) : undefined
            }
            onPressPhoto={(idx) => {
              if (allPhotos.length > 0) {
                setLightboxPhotos(allPhotos);
                setLightboxIdx(idx);
              }
            }}
            onPressCountBadge={(idx) => {
              if (allPhotos.length > 0) {
                setLightboxPhotos(allPhotos);
                setLightboxIdx(idx);
              }
            }}
          >
            {/* Top-right Shortlist pill + Three-dot overflow button */}
            <View style={styles.heroTopRight}>
              <TouchableOpacity
                style={[
                  styles.heroShortlistPill,
                  candidate.isShortlisted && { backgroundColor: CORAL_RED },
                ]}
                onPress={handleToggleShortlist}
                activeOpacity={0.85}
              >
                <Bookmark
                  size={14}
                  color="#FFFFFF"
                  fill={candidate.isShortlisted ? '#FFFFFF' : 'transparent'}
                />
                <Text style={styles.heroShortlistText}>
                  {candidate.isShortlisted ? 'Shortlisted' : 'Shortlist'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.heroMoreBtn}
                onPress={() => setMoreMenuOpen(true)}
                activeOpacity={0.85}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MoreVertical size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </MatchPhotoCarousel>
        </View>

        {/* Clean Verified Ribbon below hero image */}
        <View style={styles.verifiedPlainRow}>
          <VerifiedRibbonBadge
            fontFamily={fontFamily}
            variant={candidate.verificationSummary?.trustLevel}
            tier={candidate.candidateTier}
          />
        </View>

        {/* Member Summary Header */}
        <View style={[styles.summaryBlock, { borderBottomColor: dividerColor }]}>
          <Text style={[styles.memberName, { color: colors.text, fontFamily, fontSize: scaleFont(22) }]}>
            {candidate.displayName}
          </Text>
          <Text style={[styles.memberSubLine, { color: colors.textSecondary, fontFamily }]}>
            {candidate.profileCode}  •  {formatRecencyLabel(candidate.joinedAtMs)}
          </Text>
          <Text style={[styles.memberDotSummary, { color: colors.text, fontFamily, fontSize: scaleFont(14.5) }]}>
            {summaryBits.join('  •  ')}
          </Text>
        </View>

        {/* Personal Information */}
        <View style={styles.sectionWrap}>
          {renderSectionBanner('Personal Information', User)}
          <View style={styles.kvGroup}>
            {renderKvRow('Age', candidate.age ? `${candidate.age} Years` : 'Not Specified')}
            {renderKvRow('Height', formatCompactHeight(candidate.heightCm) || 'Not Specified')}
            {renderKvRow('Mother Tongue', candidate.motherTongue || 'Not Specified')}
            {languagesList.length > 0
              ? renderKvRow('Spoken Languages', languagesList.join(', '))
              : null}
            {renderKvRow('Profile created by', candidate.profileCreatedBy || 'Self')}
            {renderKvRow('Marital Status', candidate.maritalStatus || 'Never Married')}
            {renderKvRow(
              'Lives In',
              [
                candidate.location?.village || candidate.location?.city,
                candidate.location?.state,
              ]
                .filter(Boolean)
                .join(', ') || 'Not Specified'
            )}
            {renderKvRow('Eating Habits', candidate.habits?.eatingHabits)}
            {renderKvRow('Denomination', candidate.faithSummary?.denomination)}
            {renderKvRow('Division', candidate.faithSummary?.division)}
            {renderKvRow(
              'Baptized',
              candidate.faithSummary?.baptized === true
                ? 'Yes'
                : candidate.faithSummary?.baptized === false
                ? 'No'
                : undefined
            )}
            {renderKvRow('Employment', candidate.career?.employmentType)}
            {renderKvRow('Annual Income', candidate.annualIncomeRange)}
            {renderKvRow('Education', candidate.education?.qualification)}
            {renderKvRow('Occupation', candidate.career?.profession)}
            <View style={styles.kvRow}>
              <Text style={[styles.kvLabel, { color: colors.textSecondary, fontFamily }]}>
                Date of Birth
              </Text>
              <Text style={[styles.kvColon, { color: colors.textSecondary }]}>:</Text>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[styles.kvValue, { color: colors.text, fontFamily }]}>
                  {dobDisplay}
                </Text>
                {!hasUnlockedDob ? (
                  entitlements && entitlements.tier !== 'free' && entitlements.contactNumberLimit !== 0 ? (
                    <TouchableOpacity
                      style={styles.upgradeLinkRow}
                      onPress={handleUnlockContact}
                      disabled={unlockingContact}
                      activeOpacity={0.75}
                    >
                      <Lock size={14} color={UPGRADE_AMBER} />
                      <Text style={[styles.upgradeLinkText, { fontFamily }]}>
                        {unlockingContact
                          ? 'Unlocking...'
                          : `Unlock DOB & Contact (${
                              entitlements.contactNumberLimit < 0
                                ? 'Unlimited'
                                : `${entitlements.contactNumbersRemaining} left`
                            })`}
                      </Text>
                      <ChevronRight size={15} color={UPGRADE_AMBER} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.upgradeLinkRow}
                      onPress={handleUpgradeToView}
                      activeOpacity={0.75}
                    >
                      <Lock size={14} color={UPGRADE_AMBER} />
                      <Text style={[styles.upgradeLinkText, { fontFamily }]}>Upgrade to view</Text>
                      <ChevronRight size={15} color={UPGRADE_AMBER} />
                    </TouchableOpacity>
                  )
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {/* Family Information */}
        <View style={styles.sectionWrap}>
          {renderSectionBanner('Family Information', Home)}
          <View style={styles.kvGroup}>
            {renderKvRow('Family Type', candidate.familySummary?.familyType || 'Not Specified')}
            {renderKvRow('Family Values', candidate.familySummary?.familyValues)}
            {renderKvRow('Family Status', candidate.familySummary?.familyStatus)}
            {renderKvRow("Father's Occupation", fam?.fatherOccupation)}
            {renderKvRow("Mother's Occupation", fam?.motherOccupation)}
            {renderKvRow('Brothers', fam?.brothers)}
            {renderKvRow('Sisters', fam?.sisters)}
            {renderKvRow('Ancestral Origin', fam?.familyOrigin)}
          </View>
        </View>

        {/* Contact Information (masked privacy) */}
        <View style={styles.sectionWrap}>
          {renderSectionBanner('Contact Information', Phone)}
          <View style={styles.kvGroup}>
            <View style={styles.kvRow}>
              <Text style={[styles.kvLabel, { color: colors.textSecondary, fontFamily }]}>
                Mobile Number
              </Text>
              <Text style={[styles.kvColon, { color: colors.textSecondary }]}>:</Text>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[styles.kvValue, { color: colors.text, fontFamily }]}>
                  {candidate.contactPhone
                    ? candidate.contactPhone
                    : candidate.maskedPhone || '+91 **********'}
                </Text>
                {!candidate.contactPhone ? (
                  entitlements && entitlements.tier !== 'free' && entitlements.contactNumberLimit !== 0 ? (
                    <TouchableOpacity
                      style={styles.upgradeLinkRow}
                      onPress={handleUnlockContact}
                      disabled={unlockingContact}
                      activeOpacity={0.75}
                    >
                      <Lock size={14} color={UPGRADE_AMBER} />
                      <Text style={[styles.upgradeLinkText, { fontFamily }]}>
                        {unlockingContact
                          ? 'Unlocking contact...'
                          : `View Contact Number (${
                              entitlements.contactNumberLimit < 0
                                ? 'Unlimited'
                                : `${entitlements.contactNumbersRemaining}/${entitlements.contactNumberLimit} left`
                            })`}
                      </Text>
                      <ChevronRight size={15} color={UPGRADE_AMBER} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.upgradeLinkRow}
                      onPress={handleUpgradeToView}
                      activeOpacity={0.75}
                    >
                      <Lock size={14} color={UPGRADE_AMBER} />
                      <Text style={[styles.upgradeLinkText, { fontFamily }]}>Upgrade to view</Text>
                      <ChevronRight size={15} color={UPGRADE_AMBER} />
                    </TouchableOpacity>
                  )
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <TouchableOpacity
                      onPress={handleCallCandidate}
                      activeOpacity={0.8}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: isDark ? 'rgba(224,75,90,0.18)' : '#FEF2F2',
                        borderColor: CORAL_RED,
                        borderWidth: 1,
                        borderRadius: 16,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      }}
                    >
                      <Phone size={13} color={CORAL_RED} />
                      <Text style={{ color: CORAL_RED, fontWeight: '700', fontSize: 12, fontFamily }}>
                        Call
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleWhatsAppCandidate}
                      activeOpacity={0.8}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: isDark ? 'rgba(22,163,74,0.18)' : '#F0FDF4',
                        borderColor: '#16A34A',
                        borderWidth: 1,
                        borderRadius: 16,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                      }}
                    >
                      <MessageCircle size={13} color="#16A34A" />
                      <Text style={{ color: '#16A34A', fontWeight: '700', fontSize: 12, fontFamily }}>
                        WhatsApp
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        {/* About Myself */}
        <View style={styles.sectionWrap}>
          {renderSectionBanner('About Myself', User)}
          <Text style={[styles.aboutParagraph, { color: colors.text, fontFamily }]}>
            {candidate.aboutMe?.trim() || 'Not Specified'}
          </Text>
        </View>

        {/* Lifestyle */}
        <View style={styles.sectionWrap}>
          {renderSectionBanner('Lifestyle', Sparkles)}
          <View style={styles.kvGroup}>
            {interests.food?.length ? renderKvRow('Cuisine', interests.food.join(', ')) : null}
            {interests.hobbies?.length ? renderKvRow('Hobbies', interests.hobbies.join(', ')) : null}
            {interests.music?.length ? renderKvRow('Music', interests.music.join(', ')) : null}
            {interests.reading?.length ? renderKvRow('Reading', interests.reading.join(', ')) : null}
            {interests.movies?.length ? renderKvRow('Movies', interests.movies.join(', ')) : null}
            {interests.sports?.length ? renderKvRow('Sports', interests.sports.join(', ')) : null}
            {renderKvRow('Smoking Habits', candidate.habits?.smokingHabits || 'Not Specified')}
            {renderKvRow('Drinking Habits', candidate.habits?.drinkingHabits || 'Not Specified')}
          </View>
        </View>

        {/* Detailed Compatibility Insights (Gold & Platinum detailed breakdown; Free/Silver summary) */}
        {candidate.breakdown ? (
          <View style={styles.sectionWrap}>
            {renderSectionBanner(`Compatibility Breakdown (${candidate.matchScore}%)`, Sparkles)}
            {entitlements?.tier === 'gold' || entitlements?.tier === 'platinum' ? (
              <View style={{ gap: 8, paddingTop: 4 }}>
                {[
                  { label: 'Age Match', score: candidate.breakdown.ageScore, max: 15 },
                  { label: 'Faith & Baptism', score: candidate.breakdown.faithScore, max: 15 },
                  { label: 'Family Values', score: candidate.breakdown.familyScore ?? 0, max: 15 },
                  { label: 'Education', score: candidate.breakdown.educationScore ?? 0, max: 10 },
                  { label: 'Career', score: candidate.breakdown.careerScore, max: 10 },
                  { label: 'Location', score: candidate.breakdown.locationScore, max: 10 },
                  { label: 'Lifestyle', score: candidate.breakdown.lifestyleScore ?? candidate.breakdown.habitsScore, max: 10 },
                  { label: 'Height', score: candidate.breakdown.heightScore, max: 5 },
                  { label: 'Additional Prefs', score: candidate.breakdown.additionalScore ?? candidate.breakdown.interestsScore, max: 10 },
                ].map((row) => {
                  const pct = Math.max(0, Math.min(100, Math.round((row.score / row.max) * 100)));
                  return (
                    <View key={row.label} style={{ gap: 3 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 12.5, fontWeight: '600', color: colors.text, fontFamily }}>
                          {row.label}
                        </Text>
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#16A34A', fontFamily }}>
                          {row.score}/{row.max}
                        </Text>
                      </View>
                      <View style={{ height: 6, borderRadius: 4, backgroundColor: isDark ? '#334155' : '#E2E8F0', overflow: 'hidden' }}>
                        <View style={{ width: `${pct}%`, height: 6, backgroundColor: '#16A34A', borderRadius: 4 }} />
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleUpgradeToView}
                activeOpacity={0.8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor: isDark ? 'rgba(217,119,6,0.12)' : '#FFFBEB',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(217,119,6,0.35)' : '#FDE68A',
                }}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, fontFamily }}>
                    Overall Match Score: {candidate.matchScore}%
                  </Text>
                  <Text style={{ fontSize: 11.5, color: colors.textSecondary, fontFamily }}>
                    Upgrade to Gold or Platinum for factor-by-factor compatibility insights.
                  </Text>
                </View>
                <Lock size={16} color="#D97706" />
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* Her / His Partner Preferences Comparison Card (Screenshots 5-10) */}
        {prefComparison ? (
          <View style={styles.prefComparisonSection}>
            <View style={styles.prefTitleRow}>
              <Sparkles size={18} color="#C084FC" />
              <Text style={[styles.prefBigTitle, { color: colors.text, fontFamily, fontSize: scaleFont(19) }]}>
                {possessiveCap} Partner Preferences
              </Text>
              <Sparkles size={18} color="#C084FC" />
            </View>

            <LinearGradient
              colors={isDark ? ['#2E1065', '#1F2937'] : ['#FCE7F3', '#F3E8FF', '#FFFFFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[
                styles.comparisonBannerCard,
                { borderColor: isDark ? '#581C87' : '#E9D5FF' },
              ]}
            >
              <View style={[styles.thumbFrame, { borderColor: '#FFFFFF' }]}>
                {candidate.signedProfilePhoto ? (
                  <Image
                    source={{ uri: candidate.signedProfilePhoto }}
                    style={styles.thumbImg}
                    fadeDuration={0}
                  />
                ) : (
                  <View style={[styles.thumbPlaceholder, { backgroundColor: '#F3E8FF' }]}>
                    <User size={28} color="#9333EA" />
                  </View>
                )}
              </View>

              <View style={styles.comparisonCenter}>
                <Text style={[styles.comparisonTopText, { color: colors.text, fontFamily }]}>
                  You match{' '}
                  <Text style={styles.comparisonFraction}>
                    {prefComparison.matchedCount}/{prefComparison.totalCount}
                  </Text>
                </Text>
                <Text style={[styles.comparisonSubText, { color: colors.text, fontFamily }]}>
                  of {possessive} preferences
                </Text>
              </View>

              <View style={[styles.thumbFrame, { borderColor: '#FFFFFF' }]}>
                {viewerPhoto ? (
                  <Image source={{ uri: viewerPhoto }} style={styles.thumbImg} fadeDuration={0} />
                ) : (
                  <View style={[styles.thumbPlaceholder, { backgroundColor: '#E2E8F0' }]}>
                    <User size={28} color="#64748B" />
                  </View>
                )}
              </View>
            </LinearGradient>

            {/* Preference Sections Checklist */}
            {prefComparison.sections.map((sec, secIdx) => (
              <View key={sec.title} style={styles.prefGroupWrap}>
                <View style={styles.prefGroupHeaderRow}>
                  <LinearGradient
                    colors={
                      isDark
                        ? ['rgba(251, 146, 60, 0.24)', 'rgba(251, 146, 60, 0.0)']
                        : ['#FFE8D6', '#FFF4EB', '#FFFFFF']
                    }
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.prefGroupPill}
                  >
                    <Text
                      style={[
                        styles.prefGroupTitle,
                        { color: colors.text, fontFamily, fontSize: scaleFont(16) },
                      ]}
                    >
                      {sec.title}
                    </Text>
                  </LinearGradient>
                  {secIdx === 0 && (
                    <View style={styles.youMatchLegend}>
                      <Text style={[styles.youMatchLegendText, { color: colors.text, fontFamily }]}>
                        You match
                      </Text>
                      <View style={[styles.matchIconCircle, { borderColor: TEAL_CHECK }]}>
                        <Check size={12} color={TEAL_CHECK} strokeWidth={2.5} />
                      </View>
                    </View>
                  )}
                </View>

                {sec.items.map((item) => (
                  <View key={item.label} style={styles.prefCheckRow}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <View style={styles.prefLabelWithInfo}>
                        <Text
                          style={[
                            styles.prefItemLabel,
                            { color: colors.textSecondary, fontFamily },
                          ]}
                        >
                          {item.label}
                        </Text>
                        <Info size={13} color={colors.textSecondary} />
                      </View>
                      <Text style={[styles.prefItemValue, { color: colors.text, fontFamily }]}>
                        {item.value}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.matchStatusCircle,
                        {
                          borderColor: item.matched
                            ? TEAL_CHECK
                            : isDark
                            ? '#475569'
                            : '#CBD5E1',
                        },
                      ]}
                    >
                      {item.matched ? (
                        <Check size={13} color={TEAL_CHECK} strokeWidth={2.5} />
                      ) : (
                        <X size={12} color={isDark ? '#64748B' : '#94A3B8'} strokeWidth={2.2} />
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {/* Ornate Curve Flourish Divider at end of Partner Preferences */}
        <View style={styles.flourishWrap}>
          <Svg width={220} height={32} viewBox="0 0 220 32">
            {/* Center Lotus Motif */}
            <Path
              d="M110 7 C107 12 107 18 110 21 C113 18 113 12 110 7 Z"
              fill={isDark ? '#64748B' : '#B8BEC7'}
            />
            <Path
              d="M108 20 C102 18 99 13 102 10 C105 12 107 16 108 20 Z"
              fill={isDark ? '#475569' : '#C8CDD5'}
            />
            <Path
              d="M112 20 C118 18 121 13 118 10 C115 12 113 16 112 20 Z"
              fill={isDark ? '#475569' : '#C8CDD5'}
            />
            {/* Left Vine Curve */}
            <Path
              d="M98 20 C84 22 72 13 56 17 C42 20 30 22 18 16 C14 14 14 10 18 11 C21 12 21 16 17 16"
              stroke={isDark ? '#64748B' : '#B8BEC7'}
              strokeWidth="1.7"
              strokeLinecap="round"
              fill="none"
            />
            <Path
              d="M84 18 C77 12 69 12 66 16"
              stroke={isDark ? '#475569' : '#CBD1D9'}
              strokeWidth="1.3"
              strokeLinecap="round"
              fill="none"
            />
            {/* Right Mirrored Vine Curve */}
            <G transform="translate(220, 0) scale(-1, 1)">
              <Path
                d="M98 20 C84 22 72 13 56 17 C42 20 30 22 18 16 C14 14 14 10 18 11 C21 12 21 16 17 16"
                stroke={isDark ? '#64748B' : '#B8BEC7'}
                strokeWidth="1.7"
                strokeLinecap="round"
                fill="none"
              />
              <Path
                d="M84 18 C77 12 69 12 66 16"
                stroke={isDark ? '#475569' : '#CBD1D9'}
                strokeWidth="1.3"
                strokeLinecap="round"
                fill="none"
              />
            </G>
          </Svg>
        </View>

        {/* Profiles you may like — Smart Compatibility Recommendations */}
        {profilesYouMayLike.length > 0 ? (
          <View style={styles.recSection}>
            <View style={styles.recHeaderRow}>
              <Text style={[styles.recHeading, { color: colors.text, fontFamily, fontSize: scaleFont(17.5) }]}>
                Profiles you may like
              </Text>
              <TouchableOpacity
                style={styles.recSeeAllBtn}
                activeOpacity={0.75}
                onPress={() => navigation.navigate('MatrimonyMatches', { initialTab: 'all' })}
              >
                <Text style={[styles.recSeeAllText, { fontFamily }]}>See all</Text>
                <ChevronRight size={14} color={UPGRADE_AMBER} strokeWidth={2.4} />
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recScrollRow}
            >
              {profilesYouMayLike.map((rec) => {
                const recAge = rec.age ? `${rec.age} Yrs` : null;
                const recHeight = formatCompactHeight(rec.heightCm);
                const recMeta = [recAge, recHeight].filter(Boolean).join(', ');
                return (
                  <TouchableOpacity
                    key={rec.uid}
                    style={styles.recCard}
                    activeOpacity={0.88}
                    onPress={() => handleSelectRecommended(rec)}
                  >
                    <View
                      style={[
                        styles.recImgWrap,
                        { backgroundColor: isDark ? '#1E293B' : '#E2E8F0' },
                      ]}
                    >
                      {rec.signedProfilePhoto ? (
                        <Image
                          source={{ uri: rec.signedProfilePhoto }}
                          style={styles.recImg}
                          resizeMode="cover"
                          fadeDuration={0}
                        />
                      ) : (
                        <View style={styles.recImgPlaceholder}>
                          <User size={36} color={isDark ? '#64748B' : '#94A3B8'} />
                        </View>
                      )}
                    </View>
                    <Text
                      style={[styles.recName, { color: colors.text, fontFamily, fontSize: scaleFont(13.5) }]}
                      numberOfLines={1}
                    >
                      {rec.displayName}
                    </Text>
                    {recMeta ? (
                      <Text
                        style={[styles.recMeta, { color: colors.textSecondary, fontFamily, fontSize: scaleFont(12) }]}
                        numberOfLines={1}
                      >
                        {recMeta}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
        </ScrollView>
        </Animated.View>
      )}

      {/* Persistent Full-Screen Middle-Edge Previous & Next Match Buttons */}
      {!switchingProfile && currentIndex > 0 && (
        <TouchableOpacity
          style={[styles.stepArrowBtn, styles.stepArrowLeft]}
          onPress={() => stepMatch(-1)}
          activeOpacity={0.85}
          delayPressIn={0}
          hitSlop={{ top: 10, bottom: 10, left: 4, right: 10 }}
        >
          <ChevronLeft size={23} color="#FFFFFF" strokeWidth={2.4} />
        </TouchableOpacity>
      )}
      {!switchingProfile && currentIndex + 1 < matchList.length && (
        <TouchableOpacity
          style={[styles.stepArrowBtn, styles.stepArrowRight]}
          onPress={() => stepMatch(1)}
          activeOpacity={0.85}
          delayPressIn={0}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 4 }}
        >
          <ChevronRight size={23} color="#FFFFFF" strokeWidth={2.4} />
        </TouchableOpacity>
      )}

      {/* Floating Scroll to Top Button */}
      {!switchingProfile && scrollY > 340 && (
        <TouchableOpacity
          style={[
            styles.floatingTopBtn,
            {
              bottom: Math.max(insets.bottom, 10) + 124,
              backgroundColor: colors.surface,
              borderColor: dividerColor,
            },
          ]}
          onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
          activeOpacity={0.85}
        >
          <ChevronUp size={15} color={colors.text} />
          <Text style={[styles.floatingTopText, { color: colors.text, fontFamily }]}>Top</Text>
        </TouchableOpacity>
      )}

      {/* Sticky Bottom Action Bar matching Screenshots (hidden during full-screen skeleton loading) */}
      {!switchingProfile ? (
        <View
          style={[
            styles.stickyFooter,
            {
              backgroundColor: colors.surface,
              borderTopColor: dividerColor,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
        {hasSentInterest ? (
          <>
            <Text style={[styles.sentStatusText, { color: colors.text, fontFamily }]}>
              <Text style={{ fontWeight: '800' }}>
                {isMutual
                  ? `Interest accepted by ${candidate.displayName}`
                  : candidate.interestStatus === 'declined'
                  ? `Interest declined by ${candidate.displayName}`
                  : `You sent ${possessive} an interest`}
              </Text>
              <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>
                {` - ${sentDateStr}`}
              </Text>
            </Text>

            <View style={styles.footerSecondaryRow}>
              <TouchableOpacity
                style={[styles.callOutlineBtn, { borderColor: CORAL_RED }]}
                activeOpacity={0.82}
                onPress={handleCallCandidate}
              >
                <Phone size={15} color={CORAL_RED} strokeWidth={2} />
                <Text style={[styles.callOutlineText, { fontFamily }]}>Call Now</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sendMsgSolidBtn}
                activeOpacity={0.88}
                onPress={handleSendMessageCandidate}
              >
                <Mail size={15} color="#FFFFFF" strokeWidth={2} />
                <Text style={[styles.sendMsgSolidText, { fontFamily }]}>Send Message</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <View style={styles.footerSecondaryRow}>
              <TouchableOpacity
                style={[
                  styles.footerOutlineBtn,
                  { borderColor: isDark ? '#475569' : '#CBD5E1' },
                ]}
                disabled={busy}
                onPress={() => handleDontShow('dont_show')}
              >
                <X size={16} color={colors.textSecondary} />
                <Text style={[styles.footerOutlineText, { color: colors.textSecondary, fontFamily }]}>
                  Don&apos;t Show
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.footerOutlineBtn, { borderColor: '#FCA5A5' }]}
                disabled={busy}
                delayPressIn={0}
                onPress={handleSkip}
              >
                <SkipForward size={15} color={CORAL_RED} />
                <Text style={[styles.footerOutlineText, { color: CORAL_RED, fontFamily }]}>Skip</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.footerPrimaryBtn, busy && { opacity: 0.7 }]}
              disabled={busy}
              onPress={handleSendInterest}
              activeOpacity={0.9}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Heart size={18} color="#FFFFFF" />
                  <Text style={[styles.footerPrimaryText, { fontFamily }]}>Send Interest</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
        </View>
      ) : null}

      {/* Fullscreen Photo Gallery Lightbox matching Screenshot 3 */}
      <Modal
        visible={lightboxPhotos.length > 0}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setLightboxPhotos([])}
      >
        <View style={styles.lightboxBackdrop}>
          <View style={[styles.lightboxHeader, { paddingTop: Math.max(insets.top + 10, 18) }]}>
            <TouchableOpacity
              onPress={() => setLightboxPhotos([])}
              style={{ padding: 6 }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ArrowLeft size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.lightboxShortlistPill,
                candidate.isShortlisted && { backgroundColor: CORAL_RED, borderColor: CORAL_RED },
              ]}
              activeOpacity={0.85}
              onPress={handleToggleShortlist}
            >
              <Bookmark
                size={14}
                color="#FFFFFF"
                fill={candidate.isShortlisted ? '#FFFFFF' : 'transparent'}
              />
              <Text style={styles.lightboxShortlistText}>
                {candidate.isShortlisted ? 'Shortlisted' : 'Shortlist'}
              </Text>
            </TouchableOpacity>
          </View>

          <FlatList
            style={{ flex: 1 }}
            data={lightboxPhotos}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={lightboxIdx}
            getItemLayout={(_, idx) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * idx,
              index: idx,
            })}
            keyExtractor={(item, idx) => `${item}-${idx}`}
            onMomentumScrollEnd={(e) => {
              setLightboxIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
            }}
            renderItem={({ item }) => (
              <View style={styles.lightboxSlide}>
                <Image source={{ uri: item }} style={styles.lightboxImage} resizeMode="contain" />
              </View>
            )}
          />

          <View
            style={[
              styles.lightboxBottomBar,
              { paddingBottom: Math.max(insets.bottom + 14, 22) },
            ]}
          >
            <View style={styles.lightboxDotsRow}>
              <View style={{ width: 52 }} />
              <View style={styles.lightboxDotsCenter}>
                {lightboxPhotos.map((_, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.lightboxDot,
                      idx === lightboxIdx && styles.lightboxDotActive,
                    ]}
                  />
                ))}
              </View>
              <View style={styles.lightboxCountPill}>
                <Text style={styles.lightboxCountPillText}>
                  {lightboxIdx + 1}/{lightboxPhotos.length}
                </Text>
                <ImageIcon size={12} color="#0F172A" />
              </View>
            </View>

            {hasSentInterest ? (
              <>
                <Text style={[styles.lightboxStatusLine, { fontFamily }]}>
                  <Text style={{ fontWeight: '800', color: '#FFFFFF' }}>
                    {isMutual
                      ? `Interest accepted by ${candidate.displayName}`
                      : `You sent ${possessive} an interest`}
                  </Text>
                  <Text style={{ color: 'rgba(255,255,255,0.78)' }}>
                    {` - ${sentDateStr}`}
                  </Text>
                </Text>
                <Text style={[styles.lightboxSubLine, { fontFamily }]}>
                  Contact {possessive} directly!
                </Text>

                <View style={styles.footerSecondaryRow}>
                  <TouchableOpacity
                    style={[styles.callOutlineBtn, { borderColor: CORAL_RED, backgroundColor: 'transparent' }]}
                    activeOpacity={0.82}
                    onPress={handleCallCandidate}
                  >
                    <Phone size={15} color={CORAL_RED} strokeWidth={2} />
                    <Text style={[styles.callOutlineText, { fontFamily }]}>Call Now</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.sendMsgSolidBtn}
                    activeOpacity={0.88}
                    onPress={handleSendMessageCandidate}
                  >
                    <Mail size={15} color="#FFFFFF" strokeWidth={2} />
                    <Text style={[styles.sendMsgSolidText, { fontFamily }]}>Send Message</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity
                style={[styles.footerPrimaryBtn, busy && { opacity: 0.7 }]}
                disabled={busy}
                onPress={handleSendInterest}
                activeOpacity={0.9}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Heart size={18} color="#FFFFFF" />
                    <Text style={[styles.footerPrimaryText, { fontFamily }]}>Send Interest</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Floating Three-Dot Action Card */}
      <Modal
        visible={moreMenuOpen}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setMoreMenuOpen(false)}
      >
        <TouchableOpacity
          style={styles.moreDropdownBackdrop}
          activeOpacity={1}
          onPress={() => setMoreMenuOpen(false)}
        >
          <View
            style={[
              styles.moreDropdownCard,
              {
                top: insets.top + (showCompactHeader ? 54 : 108),
                backgroundColor: colors.surface,
                borderColor: dividerColor,
              },
            ]}
          >
            <TouchableOpacity
              style={[styles.moreDropdownItem, { borderBottomColor: dividerColor }]}
              activeOpacity={0.75}
              onPress={() => {
                setMoreMenuOpen(false);
                handleSendMessageCandidate();
              }}
            >
              <MessageSquare size={18} color={colors.textSecondary} />
              <Text style={[styles.moreDropdownText, { color: colors.text, fontFamily }]}>
                Send Message
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.moreDropdownItem, { borderBottomColor: dividerColor }]}
              activeOpacity={0.75}
              onPress={() => {
                setMoreMenuOpen(false);
                handleShareProfile();
              }}
            >
              <Share2 size={18} color={colors.textSecondary} />
              <Text style={[styles.moreDropdownText, { color: colors.text, fontFamily }]}>
                Share Profile
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.moreDropdownItem, { borderBottomColor: dividerColor }]}
              activeOpacity={0.75}
              onPress={() => {
                setMoreMenuOpen(false);
                setTimeout(() => handleBlockProfile(), 180);
              }}
            >
              <Ban size={18} color={colors.textSecondary} />
              <Text style={[styles.moreDropdownText, { color: colors.text, fontFamily }]}>
                Block Profile
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.moreDropdownItem, { borderBottomWidth: 0 }]}
              activeOpacity={0.75}
              onPress={() => {
                setMoreMenuOpen(false);
                setTimeout(() => setReportModalOpen(true), 120);
              }}
            >
              <Flag size={18} color={colors.textSecondary} />
              <Text style={[styles.moreDropdownText, { color: colors.text, fontFamily }]}>
                Report Profile
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <MatrimonyReportModal
        visible={reportModalOpen}
        targetUid={candidate.uid}
        targetName={candidate.displayName}
        targetCode={candidate.profileCode}
        source="profile"
        onClose={() => setReportModalOpen(false)}
        onReported={(hidden) => {
          if (hidden) {
            const targetUid = candidate.uid;
            const remaining = matchList.filter((m) => m.uid !== targetUid);
            if (remaining.length === 0) {
              navigation.goBack();
              return;
            }
            setMatchList(remaining);
            setCurrentIndex((prev) => Math.min(prev, remaining.length - 1));
            scrollRef.current?.scrollTo({ y: 0, animated: false });
          }
        }}
      />

      {undoHiddenToast ? (
        <View
          style={[
            styles.interestUndoToast,
            { bottom: Math.max(insets.bottom, 12) + 114 },
          ]}
        >
          <Text style={[styles.interestToastText, { fontFamily }]} numberOfLines={1}>
            {undoHiddenToast.name} hidden from matches
          </Text>
          <View style={styles.interestToastDivider} />
          <TouchableOpacity
            style={styles.interestToastUndoBtn}
            onPress={handleUndoDontShow}
            activeOpacity={0.8}
          >
            <Undo2 size={15} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={[styles.interestToastUndoText, { fontFamily }]}>Undo</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {interestToast ? (
        interestToast.kind === 'sent' ? (
          <View
            style={[
              styles.interestUndoToast,
              { bottom: Math.max(insets.bottom, 12) + 114 },
            ]}
          >
            <Text style={[styles.interestToastText, { fontFamily }]} numberOfLines={1}>
              Interest sent to {interestToast.name}
            </Text>
            <View style={styles.interestToastDivider} />
            <TouchableOpacity
              style={styles.interestToastUndoBtn}
              onPress={() => handleUndoSendInterest(interestToast.uid, interestToast.name)}
              activeOpacity={0.8}
            >
              <Undo2 size={15} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={[styles.interestToastUndoText, { fontFamily }]}>Undo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View
            style={[
              styles.interestCancelledToastWrap,
              { bottom: Math.max(insets.bottom, 12) + 114 },
            ]}
            pointerEvents="none"
          >
            <View style={styles.interestCancelledToast}>
              <Text style={[styles.interestCancelledText, { fontFamily }]}>
                Your interest has been cancelled
              </Text>
            </View>
          </View>
        )
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  backFallbackBtn: {
    backgroundColor: CORAL_RED,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 22,
  },
  backFallbackText: { color: '#FFFFFF', fontWeight: '700' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  topBackBtn: { padding: 4 },
  topTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
  },
  topRightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroOuter: {
    position: 'relative',
  },
  heroWrap: {
    width: '100%',
    height: 390,
    position: 'relative',
    backgroundColor: '#E2E8F0',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTopRight: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroShortlistPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  heroShortlistText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  heroMoreBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepArrowBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 38,
    height: 44,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 25,
    elevation: 6,
  },
  stepArrowLeft: {
    left: 0,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    paddingRight: 4,
  },
  stepArrowRight: {
    right: 0,
    borderTopLeftRadius: 22,
    borderBottomLeftRadius: 22,
    paddingLeft: 4,
  },
  photoCountBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  photoCountText: {
    color: '#0F172A',
    fontSize: 12.5,
    fontWeight: '700',
  },
  verifiedPlainRow: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verifiedPlainText: {
    color: '#0284C7',
    fontSize: 13.5,
    fontWeight: '700',
  },
  summaryBlock: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberName: {
    fontWeight: '800',
  },
  memberSubLine: {
    fontSize: 13,
    fontWeight: '500',
  },
  memberDotSummary: {
    marginTop: 4,
    lineHeight: 22,
    fontWeight: '500',
  },
  sectionWrap: {
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 10,
  },
  sectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  sectionIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionBannerTitle: {
    fontWeight: '700',
  },
  kvGroup: {
    paddingHorizontal: 4,
    gap: 10,
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  kvLabel: {
    width: '40%',
    fontSize: 14.5,
    lineHeight: 21,
  },
  kvColon: {
    width: 18,
    fontSize: 14.5,
    lineHeight: 21,
    textAlign: 'center',
  },
  kvValue: {
    flex: 1,
    fontSize: 14.5,
    lineHeight: 21,
    fontWeight: '700',
  },
  unlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  unlockText: {
    color: CORAL_RED,
    fontSize: 13.5,
    fontWeight: '700',
  },
  upgradeLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  upgradeLinkText: {
    color: UPGRADE_AMBER,
    fontSize: 13.5,
    fontWeight: '600',
  },
  flourishWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 22,
    paddingBottom: 6,
  },
  recSection: {
    paddingTop: 14,
    paddingBottom: 8,
  },
  recHeaderRow: {
    paddingHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recHeading: {
    fontWeight: '800',
  },
  recSeeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  recSeeAllText: {
    color: UPGRADE_AMBER,
    fontSize: 13.5,
    fontWeight: '600',
  },
  recScrollRow: {
    paddingHorizontal: 16,
    gap: 12,
  },
  recCard: {
    width: 132,
  },
  recImgWrap: {
    width: 132,
    height: 132,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 7,
  },
  recImg: {
    width: '100%',
    height: '100%',
  },
  recImgPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recName: {
    fontWeight: '700',
  },
  recMeta: {
    marginTop: 2,
    fontWeight: '500',
  },
  aboutParagraph: {
    paddingHorizontal: 4,
    fontSize: 15,
    lineHeight: 23,
  },
  prefComparisonSection: {
    paddingHorizontal: 16,
    paddingTop: 24,
    gap: 16,
  },
  prefTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  prefBigTitle: {
    fontWeight: '800',
  },
  comparisonBannerCard: {
    borderRadius: 18,
    borderWidth: 1.2,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  thumbFrame: {
    width: 70,
    height: 70,
    borderRadius: 14,
    borderWidth: 2,
    overflow: 'hidden',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comparisonCenter: {
    flex: 1,
    alignItems: 'center',
  },
  comparisonTopText: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  comparisonFraction: {
    color: PURPLE_ACCENT,
    fontSize: 17,
    fontWeight: '900',
  },
  comparisonSubText: {
    fontSize: 14.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  prefGroupWrap: {
    gap: 12,
    marginTop: 4,
  },
  prefGroupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  prefGroupPill: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
  },
  prefGroupTitle: {
    fontWeight: '700',
  },
  youMatchLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  youMatchLegendText: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  matchIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  prefLabelWithInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  prefItemLabel: {
    fontSize: 13.5,
    fontWeight: '500',
  },
  prefItemValue: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
  },
  matchStatusCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingTopBtn: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 4,
  },
  floatingTopText: {
    fontSize: 13,
    fontWeight: '700',
  },
  skeletonHero: {
    width: '100%',
    height: 390,
    position: 'relative',
  },
  skeletonPillTop: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 96,
    height: 30,
    borderRadius: 15,
  },
  skeletonBodyWrap: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  skeletonLine: {
    borderRadius: 8,
  },
  skeletonSection: {
    paddingHorizontal: 16,
    paddingTop: 18,
    gap: 12,
  },
  skeletonBannerBar: {
    height: 40,
    borderRadius: 10,
    width: '72%',
  },
  skeletonRowsWrap: {
    gap: 10,
    paddingLeft: 8,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
  },
  footerSecondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  footerOutlineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1.2,
  },
  footerOutlineText: {
    fontSize: 14,
    fontWeight: '700',
  },
  footerPrimaryBtn: {
    backgroundColor: CORAL_RED,
    borderRadius: 26,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  footerPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },
  sentStatusText: {
    fontSize: 13.5,
  },
  callOutlineBtn: {
    flex: 0.9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 24,
    borderWidth: 1.2,
  },
  callOutlineText: {
    color: CORAL_RED,
    fontSize: 14,
    fontWeight: '700',
  },
  sendMsgSolidBtn: {
    flex: 1.45,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 24,
    backgroundColor: CORAL_RED,
  },
  sendMsgSolidText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  lightboxShortlistPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  lightboxShortlistText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  lightboxCounter: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  lightboxSlide: {
    width: SCREEN_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  lightboxBottomBar: {
    backgroundColor: '#000000',
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 10,
  },
  lightboxDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lightboxDotsCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lightboxDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  lightboxDotActive: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#FFFFFF',
  },
  lightboxCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  lightboxCountPillText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '700',
  },
  lightboxStatusLine: {
    fontSize: 13.5,
    marginTop: 2,
  },
  lightboxSubLine: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14.5,
    fontWeight: '500',
    marginBottom: 4,
  },
  moreDropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.18)',
  },
  moreDropdownCard: {
    position: 'absolute',
    right: 14,
    width: 215,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 10,
  },
  moreDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  moreDropdownText: {
    fontSize: 15,
    fontWeight: '600',
  },
  interestUndoToast: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: '#3F3F46',
    borderRadius: 12,
    paddingLeft: 18,
    paddingRight: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 7,
  },
  interestToastText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  interestToastDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginRight: 14,
  },
  interestToastUndoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  interestToastUndoText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  interestCancelledToastWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  interestCancelledToast: {
    backgroundColor: '#3F3F46',
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 7,
  },
  interestCancelledText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
  },
});
