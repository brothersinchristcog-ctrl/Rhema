import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Check,
  ChevronRight,
  Crown,
  Lock,
  Search,
  User,
  Users,
  X,
} from 'lucide-react-native';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import MatrimonyGradientHeader from '../components/MatrimonyGradientHeader';
import { isMatrimonyInactiveError, matrimonyApi } from '../services/matrimonyApi';
import {
  MatrimonyMatchCandidate,
  MatrimonyMobilePrivacy,
  MatrimonyPhotoRequestItem,
  MatrimonyPhotoVisibility,
  MemberEntitlements,
} from '../types/matrimony';

const CORAL_RED = '#E04B5A';
const RECOMMENDED_GREEN = '#16A34A';
const PAID_PURPLE = '#7C3AED';

type PrivacyTab = 'mobile' | 'photos';

export default function MatrimonyPrivacySettingsScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const initialTab: PrivacyTab = route?.params?.initialTab === 'photos' ? 'photos' : 'mobile';
  const [activeTab, setActiveTab] = useState<PrivacyTab>(initialTab);

  const cachedReg = matrimonyApi.getCachedRegistration();
  const [mobilePrivacy, setMobilePrivacy] = useState<MatrimonyMobilePrivacy>(() =>
    cachedReg?.profile?.mobilePrivacy === 'messages_only' ? 'messages_only' : 'show_all'
  );
  const [photoVisibility, setPhotoVisibility] = useState<MatrimonyPhotoVisibility>(() => {
    const raw = cachedReg?.profile?.photoVisibility;
    if (
      raw === 'contacted_and_paid' ||
      raw === 'protect_photo' ||
      raw === 'matches_only'
    ) {
      return raw === 'matches_only' ? 'contacted_and_paid' : raw;
    }
    return 'approved_members';
  });
  const [allowedUids, setAllowedUids] = useState<string[]>(() =>
    Array.isArray(cachedReg?.profile?.protectedPhotoAllowedUids)
      ? cachedReg.profile.protectedPhotoAllowedUids
      : []
  );

  const [entitlements, setEntitlements] = useState<MemberEntitlements | null>(null);
  const [saving, setSaving] = useState(false);

  // Member selector & incoming requests for Protect Photo
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberChoices, setMemberChoices] = useState<MatrimonyMatchCandidate[]>(() => {
    const cachedAll = matrimonyApi.getCachedMatches({
      tab: 'all',
      matchBasis: 'all_filters',
      matchTier: 'regular',
      sortBy: 'best_match',
      filters: {},
    });
    const cachedHub = matrimonyApi.getCachedInterestsHub();
    const map = new Map<string, MatrimonyMatchCandidate>();
    if (cachedHub) {
      [...(cachedHub.received || []), ...(cachedHub.sent || [])].forEach((e) => {
        if (e?.candidate?.uid) map.set(e.candidate.uid, e.candidate);
      });
    }
    (cachedAll?.matches || []).forEach((m) => {
      if (m?.uid && !map.has(m.uid)) map.set(m.uid, m);
    });
    return Array.from(map.values());
  });
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [customCountMode, setCustomCountMode] = useState(false);
  const [customCountInput, setCustomCountInput] = useState('');
  const [photoRequests, setPhotoRequests] = useState<MatrimonyPhotoRequestItem[]>(
    () => matrimonyApi.getCachedPhotoRequests() || []
  );
  const respondSeqMapRef = useRef<Map<string, number>>(new Map());
  const dirtyMobileRef = useRef(false);
  const dirtyPhotoVisRef = useRef(false);
  const dirtyAllowedRef = useRef(false);
  const loadSeqRef = useRef(0);

  const isPaidMember = useMemo(() => {
    if (entitlements) {
      return entitlements.subscriptionStatus === 'active' && entitlements.tier !== 'free';
    }
    const mem = cachedReg?.profile?.membership;
    return Boolean(
      mem &&
        mem.status === 'active' &&
        mem.tier !== 'free' &&
        (!mem.validUntilMs || mem.validUntilMs > Date.now())
    );
  }, [entitlements, cachedReg]);

  const loadSettings = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    try {
      const [regRes, entRes, reqRes] = await Promise.allSettled([
        matrimonyApi.startRegistration({ force: true }),
        matrimonyApi.getMemberEntitlements(),
        matrimonyApi.getPhotoRequests({ force: true }),
      ]);
      if (loadSeqRef.current !== seq) return;
      if (regRes.status === 'fulfilled' && regRes.value?.profile) {
        const p = regRes.value.profile;
        if (!dirtyMobileRef.current) {
          setMobilePrivacy(p.mobilePrivacy === 'messages_only' ? 'messages_only' : 'show_all');
        }
        if (!dirtyPhotoVisRef.current) {
          const vis = p.photoVisibility;
          if (vis === 'contacted_and_paid' || vis === 'protect_photo') {
            setPhotoVisibility(vis);
          } else if (vis === 'matches_only') {
            setPhotoVisibility('contacted_and_paid');
          } else {
            setPhotoVisibility('approved_members');
          }
        }
        if (!dirtyAllowedRef.current) {
          setAllowedUids(
            Array.isArray(p.protectedPhotoAllowedUids) ? p.protectedPhotoAllowedUids : []
          );
        }
      }
      if (entRes.status === 'fulfilled' && entRes.value?.entitlements) {
        setEntitlements(entRes.value.entitlements);
      }
      if (reqRes.status === 'fulfilled' && Array.isArray(reqRes.value?.requests)) {
        setPhotoRequests(reqRes.value.requests);
      }
    } catch (err: any) {
      if (isMatrimonyInactiveError(err)) {
        navigation.reset({ index: 0, routes: [{ name: 'MatrimonyStatus' }] });
      }
    }
  }, [navigation]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => {
      loadSettings();
    });
    return unsub;
  }, [navigation, loadSettings]);

  const openMemberPicker = async () => {
    setMemberPickerOpen(true);
    setMemberSearch('');
    const hasExisting = memberChoices.length > 0;
    if (!hasExisting) setLoadingMembers(true);
    try {
      const [hubRes, matchesRes] = await Promise.allSettled([
        matrimonyApi.getInterestsHub(),
        matrimonyApi.getMatches({ tab: 'all', matchBasis: 'all_filters', limit: 2000 }),
      ]);
      const map = new Map<string, MatrimonyMatchCandidate>();
      if (hubRes.status === 'fulfilled') {
        [...(hubRes.value.received || []), ...(hubRes.value.sent || [])].forEach((e) => {
          if (e?.candidate?.uid) map.set(e.candidate.uid, e.candidate);
        });
      }
      if (matchesRes.status === 'fulfilled') {
        (matchesRes.value.matches || []).forEach((m) => {
          if (m?.uid && !map.has(m.uid)) map.set(m.uid, m);
        });
      }
      if (map.size > 0) {
        setMemberChoices(Array.from(map.values()));
      }
    } catch {
      // Leave cached state if unavailable
    } finally {
      setLoadingMembers(false);
    }
  };

  const filteredMemberChoices = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return memberChoices;
    return memberChoices.filter((m) => {
      const hay = [
        m.displayName,
        m.profileCode,
        m.location?.village,
        m.location?.city,
        m.career?.profession,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [memberChoices, memberSearch]);

  const applyPresetCount = (count: number) => {
    dirtyAllowedRef.current = true;
    const capped = Math.max(0, Math.min(count, memberChoices.length));
    setAllowedUids(memberChoices.slice(0, capped).map((m) => m.uid));
    setCustomCountMode(false);
  };

  const handleApplyCustomCount = () => {
    dirtyAllowedRef.current = true;
    const parsed = parseInt(customCountInput.replace(/[^0-9]/g, ''), 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      Alert.alert('Enter Number', 'Please enter how many members you want to allow.');
      return;
    }
    const capped = Math.min(parsed, memberChoices.length);
    setAllowedUids(memberChoices.slice(0, capped).map((m) => m.uid));
    if (parsed > memberChoices.length) {
      Alert.alert(
        'Members Selected',
        `Allowed all ${capped} currently loaded members.`
      );
    }
  };

  const handleOpenRequesterProfile = (reqItem: MatrimonyPhotoRequestItem) => {
    const viewerPhoto =
      matrimonyApi.getCachedRegistration()?.profile?.signedProfilePhoto || null;
    const byUid = new Map<string, MatrimonyMatchCandidate>();

    memberChoices.forEach((m) => {
      if (m?.uid) byUid.set(m.uid, m);
    });
    const cachedHub = matrimonyApi.getCachedInterestsHub();
    if (cachedHub) {
      [...(cachedHub.received || []), ...(cachedHub.sent || [])].forEach((e) => {
        if (e?.candidate?.uid && !byUid.has(e.candidate.uid)) {
          byUid.set(e.candidate.uid, e.candidate);
        }
      });
    }
    photoRequests.forEach((r) => {
      if (r.candidate?.uid) byUid.set(r.candidate.uid, r.candidate);
    });

    const fallbackCandidate: MatrimonyMatchCandidate = {
      uid: reqItem.uid,
      displayName: reqItem.displayName,
      profileCode: reqItem.profileCode,
      gender: 'Male',
      age: reqItem.age,
      heightCm: reqItem.heightCm ?? null,
      maritalStatus: 'Never Married',
      education: {},
      career: { profession: reqItem.occupation || '' },
      location: { city: reqItem.city || '', state: '', country: '' },
      faithSummary: {},
      signedProfilePhoto: reqItem.signedProfilePhoto,
      signedGallery: [],
      photoCount: reqItem.signedProfilePhoto ? 1 : 0,
      matchScore: 0,
      matchReasons: [],
      sharedInterests: [],
      isShortlisted: false,
      interestStatus: null,
      joinedAtMs: reqItem.createdAtMs || 0,
      updatedAtMs: reqItem.updatedAtMs || 0,
    };

    const resolvedPool = photoRequests.map(
      (r) =>
        r.candidate ||
        byUid.get(r.uid) || {
          ...fallbackCandidate,
          uid: r.uid,
          displayName: r.displayName,
          profileCode: r.profileCode,
          age: r.age,
          heightCm: r.heightCm ?? null,
          career: { profession: r.occupation || '' },
          location: { city: r.city || '', state: '', country: '' },
          signedProfilePhoto: r.signedProfilePhoto,
          photoCount: r.signedProfilePhoto ? 1 : 0,
          joinedAtMs: r.createdAtMs || 0,
        }
    );
    const idx = Math.max(
      0,
      resolvedPool.findIndex((c) => c.uid === reqItem.uid)
    );

    navigation.navigate('MatrimonyMatchDetail', {
      matches: resolvedPool,
      initialIndex: idx,
      viewerPhoto,
      tabTitle: 'Photo View Requests',
    });
  };

  const toggleAllowedUid = (uid: string) => {
    dirtyAllowedRef.current = true;
    setAllowedUids((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const handleRespondPhotoRequest = (
    requesterUid: string,
    action: 'approve' | 'decline'
  ) => {
    const seq = (respondSeqMapRef.current.get(requesterUid) || 0) + 1;
    respondSeqMapRef.current.set(requesterUid, seq);

    const nextStatus = action === 'approve' ? 'approved' : 'declined';
    setPhotoRequests((prev) =>
      prev.map((r) => (r.uid === requesterUid ? { ...r, status: nextStatus } : r))
    );
    if (action === 'approve') {
      setAllowedUids((prev) => (prev.includes(requesterUid) ? prev : [...prev, requesterUid]));
    } else {
      setAllowedUids((prev) => prev.filter((id) => id !== requesterUid));
    }

    matrimonyApi
      .respondToPhotoRequest(requesterUid, action)
      .catch((err: any) => {
        if (respondSeqMapRef.current.get(requesterUid) !== seq) return;
        Alert.alert('Action Failed', err?.message || 'Unable to update photo request.');
        loadSettings();
      });
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (activeTab === 'mobile' && mobilePrivacy === 'messages_only' && !isPaidMember) {
      navigation.navigate('MatrimonyUpgrade');
      return;
    }

    setSaving(true);
    try {
      if (activeTab === 'mobile') {
        await matrimonyApi.savePrivacySettings({ mobilePrivacy });
        dirtyMobileRef.current = false;
      } else {
        await matrimonyApi.savePrivacySettings({
          photoVisibility,
          protectedPhotoAllowedUids: photoVisibility === 'protect_photo' ? allowedUids : undefined,
        });
        dirtyPhotoVisRef.current = false;
        dirtyAllowedRef.current = false;
      }
      Alert.alert(
        'Privacy Updated',
        activeTab === 'mobile'
          ? mobilePrivacy === 'messages_only'
            ? 'Your mobile number is now hidden; paid members can contact you via messages only.'
            : 'Paid members can now view your mobile number and call you directly.'
          : photoVisibility === 'approved_members'
          ? 'Your photos are now visible to all approved members.'
          : photoVisibility === 'contacted_and_paid'
          ? 'Your photos are now visible only to members you contacted/responded to and paid members.'
          : `Protect Photo is enabled (${allowedUids.length} member${
              allowedUids.length === 1 ? '' : 's'
            } allowed).`
      );
    } catch (err: any) {
      if (isMatrimonyInactiveError(err)) {
        navigation.reset({ index: 0, routes: [{ name: 'MatrimonyStatus' }] });
        return;
      }
      if (err?.details?.reasonCode === 'UPGRADE_REQUIRED_PRIVACY') {
        Alert.alert('Paid Feature', err?.message || 'Upgrade to unlock this privacy feature.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => navigation.navigate('MatrimonyUpgrade') },
        ]);
        return;
      }
      Alert.alert('Save Failed', err?.message || 'Unable to update privacy settings.');
    } finally {
      setSaving(false);
    }
  };

  const dividerColor = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';
  const surfaceBg = isDark ? colors.surface : '#FFFFFF';
  const pageBg = isDark ? colors.bg : '#FFFFFF';

  const renderRadioOrLock = (selected: boolean, locked: boolean) => {
    if (locked) {
      return <Lock size={19} color={isDark ? '#94A3B8' : '#71717A'} />;
    }
    return (
      <View
        style={[
          styles.radioOuter,
          {
            borderColor: selected ? CORAL_RED : isDark ? '#64748B' : '#9CA3AF',
          },
        ]}
      >
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: surfaceBg }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? 'light-content' : 'dark-content'}
      />

      <MatrimonyGradientHeader
        title="Privacy settings"
        onBack={() => navigation.goBack()}
      />

      {/* Mobile / Photos Tabs */}
      <View
        style={[
          styles.tabBar,
          { backgroundColor: surfaceBg, borderBottomColor: dividerColor },
        ]}
      >
        {(
          [
            { key: 'mobile', label: 'Mobile' },
            { key: 'photos', label: 'Photos' },
          ] as { key: PrivacyTab; label: string }[]
        ).map((tab) => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tabBtn,
                active && { borderBottomWidth: 2.5, borderBottomColor: CORAL_RED },
              ]}
              activeOpacity={0.8}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color: active ? CORAL_RED : colors.textSecondary,
                    fontWeight: active ? '800' : '700',
                    fontFamily,
                    fontSize: scaleFont(15.5),
                  },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: pageBg }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 22,
          paddingBottom: Math.max(insets.bottom + 28, 36),
        }}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'mobile' ? (
          <>
            <Text
              style={[
                styles.sectionHeading,
                { color: colors.text, fontFamily, fontSize: scaleFont(16.5) },
              ]}
            >
              Who can call me
            </Text>

            {/* Option 1: Show my mobile number */}
            <TouchableOpacity
              style={[styles.optionBlock, { borderBottomColor: dividerColor }]}
              activeOpacity={0.78}
              onPress={() => {
                dirtyMobileRef.current = true;
                setMobilePrivacy('show_all');
              }}
            >
              <View style={styles.optionLeft}>
                <View style={styles.optionTitleRow}>
                  <Text
                    style={[
                      styles.optionTitle,
                      { color: colors.text, fontFamily, fontSize: scaleFont(15.5) },
                    ]}
                  >
                    Show my mobile number
                  </Text>
                  <View style={styles.recommendedBadge}>
                    <Text style={[styles.recommendedText, { fontFamily }]}>Recommended</Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.optionSub,
                    { color: colors.textSecondary, fontFamily, fontSize: scaleFont(13.5) },
                  ]}
                >
                  Paid members can view my number and call me directly
                </Text>
              </View>
              {renderRadioOrLock(mobilePrivacy === 'show_all', false)}
            </TouchableOpacity>

            {/* Option 2: Messages only */}
            <TouchableOpacity
              style={[styles.optionBlock, { borderBottomColor: dividerColor }]}
              activeOpacity={0.78}
              onPress={() => {
                if (!isPaidMember) {
                  navigation.navigate('MatrimonyUpgrade');
                  return;
                }
                dirtyMobileRef.current = true;
                setMobilePrivacy('messages_only');
              }}
            >
              <View style={styles.optionLeft}>
                <View style={styles.optionTitleRow}>
                  <Text
                    style={[
                      styles.optionTitle,
                      { color: colors.text, fontFamily, fontSize: scaleFont(15.5) },
                    ]}
                  >
                    Messages only
                  </Text>
                  <View style={styles.paidBadge}>
                    <Crown size={11} color="#FFFFFF" />
                    <Text style={[styles.paidBadgeText, { fontFamily }]}>Paid feature</Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.optionSub,
                    { color: colors.textSecondary, fontFamily, fontSize: scaleFont(13.5) },
                  ]}
                >
                  Paid members can contact me only through messages
                </Text>
                {!isPaidMember ? (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('MatrimonyUpgrade')}
                    activeOpacity={0.75}
                    style={styles.upgradeLinkWrap}
                  >
                    <Text style={[styles.upgradeLinkText, { fontFamily }]}>
                      Upgrade to use this feature
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {renderRadioOrLock(mobilePrivacy === 'messages_only', !isPaidMember)}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text
              style={[
                styles.sectionHeading,
                { color: colors.text, fontFamily, fontSize: scaleFont(16.5) },
              ]}
            >
              Who can view my photo?
            </Text>

            {/* Option 1: Visible to all */}
            <TouchableOpacity
              style={[styles.optionBlock, { borderBottomColor: dividerColor }]}
              activeOpacity={0.78}
              onPress={() => {
                dirtyPhotoVisRef.current = true;
                setPhotoVisibility('approved_members');
                matrimonyApi
                  .savePrivacySettings({ photoVisibility: 'approved_members' })
                  .then(() => {
                    dirtyPhotoVisRef.current = false;
                  })
                  .catch(() => undefined);
              }}
            >
              <View style={styles.optionLeft}>
                <View style={styles.optionTitleRow}>
                  <Text
                    style={[
                      styles.optionTitle,
                      { color: colors.text, fontFamily, fontSize: scaleFont(15.5) },
                    ]}
                  >
                    Visible to all
                  </Text>
                  <View style={styles.recommendedBadge}>
                    <Text style={[styles.recommendedText, { fontFamily }]}>Recommended</Text>
                  </View>
                </View>
              </View>
              {renderRadioOrLock(photoVisibility === 'approved_members', false)}
            </TouchableOpacity>

            {/* Option 2: Contacted / Responded & Paid members */}
            <TouchableOpacity
              style={[styles.optionBlock, { borderBottomColor: dividerColor }]}
              activeOpacity={0.78}
              onPress={() => {
                dirtyPhotoVisRef.current = true;
                setPhotoVisibility('contacted_and_paid');
                matrimonyApi
                  .savePrivacySettings({ photoVisibility: 'contacted_and_paid' })
                  .then(() => {
                    dirtyPhotoVisRef.current = false;
                  })
                  .catch(() => undefined);
              }}
            >
              <View style={styles.optionLeft}>
                <Text
                  style={[
                    styles.optionTitle,
                    { color: colors.text, fontFamily, fontSize: scaleFont(15.5) },
                  ]}
                >
                  Visible to contacted &amp; paid members
                </Text>
                <Text
                  style={[
                    styles.optionSub,
                    { color: colors.textSecondary, fontFamily, fontSize: scaleFont(13.5) },
                  ]}
                >
                  Visible only to members whom I had Contacted / Responded and to all paid members
                </Text>
              </View>
              {renderRadioOrLock(photoVisibility === 'contacted_and_paid', false)}
            </TouchableOpacity>

            {/* Option 3: Protect Photo */}
            <TouchableOpacity
              style={[styles.optionBlock, { borderBottomColor: dividerColor }]}
              activeOpacity={0.78}
              onPress={() => {
                dirtyPhotoVisRef.current = true;
                setPhotoVisibility('protect_photo');
                matrimonyApi
                  .savePrivacySettings({
                    photoVisibility: 'protect_photo',
                    protectedPhotoAllowedUids: allowedUids,
                  })
                  .then(() => {
                    dirtyPhotoVisRef.current = false;
                  })
                  .catch(() => undefined);
              }}
            >
              <View style={styles.optionLeft}>
                <View style={styles.optionTitleRow}>
                  <Text
                    style={[
                      styles.optionTitle,
                      { color: colors.text, fontFamily, fontSize: scaleFont(15.5) },
                    ]}
                  >
                    Protect Photo
                  </Text>
                </View>
                <Text
                  style={[
                    styles.optionSub,
                    { color: colors.textSecondary, fontFamily, fontSize: scaleFont(13.5) },
                  ]}
                >
                  Allow photo access to only members of your choice.
                </Text>
                {photoVisibility === 'protect_photo' ? (
                  <TouchableOpacity
                    onPress={openMemberPicker}
                    activeOpacity={0.8}
                    style={[
                      styles.manageMembersBtn,
                      {
                        borderColor: CORAL_RED,
                        backgroundColor: isDark ? 'rgba(224,75,90,0.14)' : '#FFF1F2',
                      },
                    ]}
                  >
                    <Users size={15} color={CORAL_RED} />
                    <Text style={[styles.manageMembersText, { fontFamily }]}>
                      {`Choose Allowed Members (${allowedUids.length} selected)`}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {renderRadioOrLock(photoVisibility === 'protect_photo', false)}
            </TouchableOpacity>

            {(photoVisibility === 'protect_photo' || photoRequests.length > 0) ? (
              <View
                style={[
                  styles.requestsSection,
                  {
                    borderColor: dividerColor,
                    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
                  },
                ]}
              >
                <View style={styles.requestsHeaderRow}>
                  <Text
                    style={[
                      styles.requestsHeading,
                      { color: colors.text, fontFamily, fontSize: scaleFont(15) },
                    ]}
                  >
                    Photo View Requests
                  </Text>
                  <View style={styles.requestsBadge}>
                    <Text style={[styles.requestsBadgeText, { fontFamily }]}>
                      {photoRequests.filter((r) => r.status === 'pending').length} pending
                    </Text>
                  </View>
                </View>

                {photoRequests.length === 0 ? (
                  <Text
                    style={[
                      styles.requestsEmpty,
                      { color: colors.textSecondary, fontFamily, fontSize: scaleFont(13) },
                    ]}
                  >
                    When members tap &quot;Request to view photo&quot; on your protected photo, their requests will appear here.
                  </Text>
                ) : (
                  photoRequests.map((reqItem) => {
                    return (
                      <View
                        key={reqItem.uid}
                        style={[styles.requestRow, { borderTopColor: dividerColor }]}
                      >
                        <TouchableOpacity
                          style={styles.requestProfileTap}
                          activeOpacity={0.75}
                          onPress={() => handleOpenRequesterProfile(reqItem)}
                        >
                          {reqItem.signedProfilePhoto ? (
                            <Image
                              source={{ uri: reqItem.signedProfilePhoto }}
                              style={styles.requestAvatar}
                            />
                          ) : (
                            <View
                              style={[
                                styles.requestAvatarPlaceholder,
                                { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
                              ]}
                            >
                              <User size={18} color="#94A3B8" />
                            </View>
                          )}
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text
                                style={[styles.memberPickName, { color: colors.text, fontFamily, flexShrink: 1 }]}
                                numberOfLines={1}
                              >
                                {reqItem.displayName}
                              </Text>
                              <ChevronRight size={14} color={colors.textSecondary} />
                            </View>
                            <Text
                              style={[
                                styles.memberPickCode,
                                { color: colors.textSecondary, fontFamily },
                              ]}
                              numberOfLines={1}
                            >
                              {[
                                reqItem.age ? `${reqItem.age} yrs` : null,
                                reqItem.occupation,
                                reqItem.city,
                              ]
                                .filter(Boolean)
                                .join(' • ') || reqItem.profileCode}
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {/* Action buttons directly below the member name/details */}
                        <View style={styles.requestActionsBelowRow}>
                          {reqItem.status === 'pending' ? (
                            <View style={styles.requestBtnsRow}>
                              <TouchableOpacity
                                onPress={() => handleRespondPhotoRequest(reqItem.uid, 'approve')}
                                style={styles.approveReqBtn}
                                activeOpacity={0.8}
                              >
                                <Text style={[styles.approveReqText, { fontFamily }]}>Allow</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleRespondPhotoRequest(reqItem.uid, 'decline')}
                                style={[styles.declineReqBtn, { borderColor: dividerColor }]}
                                activeOpacity={0.8}
                              >
                                <Text style={[styles.declineReqText, { color: colors.textSecondary, fontFamily }]}>
                                  Deny
                                </Text>
                              </TouchableOpacity>
                            </View>
                          ) : reqItem.status === 'approved' ? (
                            <View style={styles.requestBtnsRow}>
                              <View
                                style={[
                                  styles.statusTagPill,
                                  {
                                    backgroundColor: isDark
                                      ? 'rgba(22,163,74,0.2)'
                                      : '#DCFCE7',
                                  },
                                ]}
                              >
                                <Text
                                  style={{
                                    color: RECOMMENDED_GREEN,
                                    fontSize: 12,
                                    fontWeight: '700',
                                    fontFamily,
                                  }}
                                >
                                  Allowed
                                </Text>
                              </View>
                              <TouchableOpacity
                                onPress={() => handleRespondPhotoRequest(reqItem.uid, 'decline')}
                                activeOpacity={0.8}
                                style={[
                                  styles.protectAgainBtn,
                                  {
                                    borderColor: CORAL_RED,
                                    backgroundColor: isDark
                                      ? 'rgba(224,75,90,0.12)'
                                      : '#FFF1F2',
                                  },
                                ]}
                              >
                                <Text style={[styles.protectAgainText, { fontFamily }]}>
                                  Protect
                                </Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <View style={styles.requestBtnsRow}>
                              <View
                                style={[
                                  styles.statusTagPill,
                                  {
                                    backgroundColor: isDark
                                      ? 'rgba(148,163,184,0.16)'
                                      : '#F1F5F9',
                                  },
                                ]}
                              >
                                <Text
                                  style={{
                                    color: colors.textSecondary,
                                    fontSize: 12,
                                    fontWeight: '700',
                                    fontFamily,
                                  }}
                                >
                                  Protected
                                </Text>
                              </View>
                              <TouchableOpacity
                                onPress={() => handleRespondPhotoRequest(reqItem.uid, 'approve')}
                                style={styles.approveReqBtn}
                                activeOpacity={0.8}
                              >
                                <Text style={[styles.approveReqText, { fontFamily }]}>
                                  Allow
                                </Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}
          </>
        )}

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.submitBtn, saving && { opacity: 0.72 }]}
          activeOpacity={0.88}
          disabled={saving}
          onPress={handleSubmit}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={[styles.submitBtnText, { fontFamily, fontSize: scaleFont(15.5) }]}>
              Submit
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Allowed Members Picker Modal for Protect Photo */}
      <Modal
        visible={memberPickerOpen}
        transparent
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => setMemberPickerOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: surfaceBg,
                paddingBottom: Math.max(insets.bottom + 16, 24),
              },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: dividerColor }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.text, fontFamily }]}>
                  Select Allowed Members
                </Text>
                <Text style={[styles.modalSub, { color: colors.textSecondary, fontFamily }]}>
                  Only selected members can view your profile &amp; gallery photos.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setMemberPickerOpen(false)}
                style={{ padding: 4 }}
              >
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            {!loadingMembers && memberChoices.length > 0 ? (
              <View style={[styles.presetSection, { borderBottomColor: dividerColor }]}>
                <View style={styles.presetRow}>
                  {[
                    {
                      key: 'all',
                      label: `All (${memberChoices.length})`,
                      active: !customCountMode && allowedUids.length === memberChoices.length,
                      onPress: () => applyPresetCount(memberChoices.length),
                    },
                    {
                      key: '30',
                      label: '30',
                      active:
                        !customCountMode &&
                        allowedUids.length === Math.min(30, memberChoices.length) &&
                        memberChoices.length >= 30,
                      onPress: () => applyPresetCount(30),
                    },
                    {
                      key: '50',
                      label: '50',
                      active:
                        !customCountMode &&
                        allowedUids.length === Math.min(50, memberChoices.length) &&
                        memberChoices.length >= 50,
                      onPress: () => applyPresetCount(50),
                    },
                    {
                      key: 'custom',
                      label: 'Custom',
                      active: customCountMode,
                      onPress: () => {
                        setCustomCountMode((prev) => !prev);
                        setCustomCountInput(
                          allowedUids.length > 0 ? String(allowedUids.length) : ''
                        );
                      },
                    },
                    {
                      key: 'none',
                      label: 'None (0)',
                      active: !customCountMode && allowedUids.length === 0,
                      onPress: () => applyPresetCount(0),
                    },
                  ].map((chip) => (
                    <TouchableOpacity
                      key={chip.key}
                      activeOpacity={0.8}
                      onPress={chip.onPress}
                      style={[
                        styles.presetChip,
                        {
                          backgroundColor: chip.active
                            ? CORAL_RED
                            : isDark
                            ? 'rgba(255,255,255,0.06)'
                            : '#F8FAFC',
                          borderColor: chip.active ? CORAL_RED : dividerColor,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          {
                            color: chip.active ? '#FFFFFF' : colors.text,
                            fontFamily,
                          },
                        ]}
                      >
                        {chip.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {customCountMode ? (
                  <View style={styles.customCountRow}>
                    <TextInput
                      style={[
                        styles.customCountInput,
                        {
                          backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                          borderColor: dividerColor,
                          color: colors.text,
                          fontFamily,
                        },
                      ]}
                      placeholder={`Count (0-${memberChoices.length})`}
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="number-pad"
                      maxLength={4}
                      value={customCountInput}
                      onChangeText={setCustomCountInput}
                    />
                    <TouchableOpacity
                      style={styles.customCountApplyBtn}
                      activeOpacity={0.85}
                      onPress={handleApplyCustomCount}
                    >
                      <Text style={[styles.approveReqText, { fontFamily }]}>Apply</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}

                <View
                  style={[
                    styles.memberSearchBox,
                    {
                      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
                      borderColor: dividerColor,
                    },
                  ]}
                >
                  <Search size={15} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.memberSearchInput, { color: colors.text, fontFamily }]}
                    placeholder="Search member by name, code, city..."
                    placeholderTextColor={colors.textSecondary}
                    value={memberSearch}
                    onChangeText={setMemberSearch}
                  />
                  {Boolean(memberSearch) ? (
                    <TouchableOpacity onPress={() => setMemberSearch('')}>
                      <X size={15} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ) : null}

            {loadingMembers ? (
              <View style={styles.modalCenter}>
                <ActivityIndicator size="large" color={CORAL_RED} />
              </View>
            ) : memberChoices.length === 0 ? (
              <View style={styles.modalCenter}>
                <Text style={[styles.modalEmptyText, { color: colors.textSecondary, fontFamily }]}>
                  No matches or contacted members found yet.
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredMemberChoices}
                keyExtractor={(item) => item.uid}
                style={{ maxHeight: 340 }}
                renderItem={({ item }) => {
                  const selected = allowedUids.includes(item.uid);
                  return (
                    <TouchableOpacity
                      style={[styles.memberPickRow, { borderBottomColor: dividerColor }]}
                      activeOpacity={0.75}
                      onPress={() => toggleAllowedUid(item.uid)}
                    >
                      {item.signedProfilePhoto ? (
                        <Image
                          source={{ uri: item.signedProfilePhoto }}
                          style={styles.memberPickAvatar}
                        />
                      ) : (
                        <View
                          style={[
                            styles.memberPickAvatarPlaceholder,
                            { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
                          ]}
                        >
                          <User size={18} color="#94A3B8" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.memberPickName, { color: colors.text, fontFamily }]}
                          numberOfLines={1}
                        >
                          {item.displayName}
                        </Text>
                        <Text
                          style={[
                            styles.memberPickCode,
                            { color: colors.textSecondary, fontFamily },
                          ]}
                          numberOfLines={1}
                        >
                          {[item.profileCode, item.location?.village || item.location?.city]
                            .filter(Boolean)
                            .join(' • ')}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.checkboxBox,
                          {
                            borderColor: selected
                              ? CORAL_RED
                              : isDark
                              ? '#64748B'
                              : '#9CA3AF',
                            backgroundColor: selected ? CORAL_RED : 'transparent',
                          },
                        ]}
                      >
                        {selected ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <TouchableOpacity
              style={styles.modalDoneBtn}
              activeOpacity={0.88}
              onPress={() => {
                setMemberPickerOpen(false);
                matrimonyApi
                  .savePrivacySettings({
                    photoVisibility: 'protect_photo',
                    protectedPhotoAllowedUids: allowedUids,
                  })
                  .then(() => {
                    dirtyPhotoVisRef.current = false;
                    dirtyAllowedRef.current = false;
                  })
                  .catch(() => undefined);
              }}
            >
              <Text style={[styles.submitBtnText, { fontFamily }]}>
                Done ({allowedUids.length} selected)
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  tabText: {
    letterSpacing: 0.1,
  },
  loadingRow: {
    paddingBottom: 12,
    alignItems: 'center',
  },
  sectionHeading: {
    fontWeight: '800',
    marginBottom: 8,
  },
  optionBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 14,
  },
  optionLeft: {
    flex: 1,
    gap: 6,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionTitle: {
    fontWeight: '800',
  },
  optionSub: {
    lineHeight: 20,
    fontWeight: '400',
  },
  recommendedBadge: {
    borderWidth: 1,
    borderColor: RECOMMENDED_GREEN,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  recommendedText: {
    color: RECOMMENDED_GREEN,
    fontSize: 11.5,
    fontWeight: '700',
  },
  paidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: PAID_PURPLE,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  paidBadgeText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  upgradeLinkWrap: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  upgradeLinkText: {
    color: CORAL_RED,
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  manageMembersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 6,
  },
  manageMembersText: {
    color: CORAL_RED,
    fontSize: 12.5,
    fontWeight: '700',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: CORAL_RED,
  },
  submitBtn: {
    marginTop: 28,
    backgroundColor: CORAL_RED,
    borderRadius: 24,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: CORAL_RED,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingTop: 18,
    paddingHorizontal: 18,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalSub: {
    fontSize: 12.5,
    marginTop: 2,
  },
  modalCenter: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalEmptyText: {
    fontSize: 13.5,
    textAlign: 'center',
  },
  memberPickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberPickAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  memberPickAvatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberPickName: {
    fontSize: 14.5,
    fontWeight: '700',
  },
  memberPickCode: {
    fontSize: 12,
    marginTop: 2,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1.6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDoneBtn: {
    marginTop: 14,
    backgroundColor: CORAL_RED,
    borderRadius: 22,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsSection: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  requestsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  requestsHeading: {
    fontWeight: '800',
  },
  requestsBadge: {
    backgroundColor: '#FFF1F2',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  requestsBadgeText: {
    color: CORAL_RED,
    fontSize: 12,
    fontWeight: '700',
  },
  requestsEmpty: {
    lineHeight: 19,
  },
  requestRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  requestProfileTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  requestActionsBelowRow: {
    paddingLeft: 50,
    flexDirection: 'row',
    alignItems: 'center',
  },
  protectAgainBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    minWidth: 68,
    alignItems: 'center',
  },
  protectAgainText: {
    color: CORAL_RED,
    fontSize: 12,
    fontWeight: '700',
  },
  presetSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  presetChipText: {
    fontSize: 12.5,
    fontWeight: '700',
  },
  customCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customCountInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 13.5,
  },
  customCountApplyBtn: {
    backgroundColor: CORAL_RED,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  memberSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  memberSearchInput: {
    flex: 1,
    fontSize: 13.5,
    paddingVertical: 2,
  },
  requestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  requestAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestBtnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  declineReqBtn: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  declineReqText: {
    fontSize: 12,
    fontWeight: '700',
  },
  approveReqBtn: {
    backgroundColor: CORAL_RED,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 56,
    alignItems: 'center',
  },
  approveReqText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  statusTagPill: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
});
