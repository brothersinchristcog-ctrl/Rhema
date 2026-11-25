import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Flag,
  Image as ImageIcon,
  Mail,
  PauseCircle,
  Phone,
  PlayCircle,
  ShieldAlert,
  Trash2,
  User,
  X,
  XCircle,
} from 'lucide-react-native';
import { FONT_STYLE_OPTIONS, useTheme } from '../../context/ThemeContext';
import {
  AdminMatrimonyProfileDetail,
  MatrimonyProfileReport,
  matrimonyApi,
} from '../../modules/matrimony';

const CORAL = '#E05A5A';
const ACCENT_RED = '#C94A4A';
const GREEN = '#16A34A';
const RED = '#DC2626';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PREF_MARITAL_OPTIONS = [
  "Doesn't matter",
  'Never Married',
  'Widowed',
  'Divorced',
  'Awaiting Divorce',
];

function formatShortHeight(cm?: number | null): string {
  if (!cm || cm <= 0) return 'Not Specified';
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet} ft ${inches} in`;
}

function formatHeightDisplay(cm?: number | null): string {
  if (!cm || cm <= 0) return 'Not Specified';
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet} ft ${inches} in / ${cm} cm`;
}

function normalizeMaritalStatusLabel(val: string): string {
  const lower = val.trim().toLowerCase();
  if (lower === 'single' || lower === 'unmarried' || lower === 'never married') {
    return 'Never Married';
  }
  return val.trim();
}

function normalizePrefMaritalStatuses(list?: string[]): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    const norm = normalizeMaritalStatusLabel(item);
    if (PREF_MARITAL_OPTIONS.includes(norm) && norm !== "Doesn't matter" && !out.includes(norm)) {
      out.push(norm);
    }
  }
  return out;
}

function isOnlyNeverMarried(list?: string[]): boolean {
  const norm = normalizePrefMaritalStatuses(list);
  return norm.length === 1 && norm[0] === 'Never Married';
}

export default function AdminMatrimonyProfileDetailScreen({ navigation, route }: any) {
  const targetUid: string = route?.params?.targetUid;
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const [loading, setLoading] = useState(true);
  const [processingAction, setProcessingAction] = useState<
    'approve' | 'reject' | 'inactivate' | 'activate' | 'delete' | null
  >(null);
  const [resolvingReportId, setResolvingReportId] = useState<string | null>(null);
  const [data, setData] = useState<AdminMatrimonyProfileDetail | null>(null);
  const [expandPrefEdu, setExpandPrefEdu] = useState(false);

  const [galleryModalVisible, setGalleryModalVisible] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);

  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [inactivateModalVisible, setInactivateModalVisible] = useState(false);
  const [inactivateReason, setInactivateReason] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvt, (e) => {
      setKeyboardHeight(e.endCoordinates?.height || 0);
    });
    const subHide = Keyboard.addListener(hideEvt, () => {
      setKeyboardHeight(0);
    });
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const loadDetail = useCallback(async () => {
    if (!targetUid) return;
    setLoading(true);
    try {
      const res = await matrimonyApi.getAdminProfileDetail(targetUid);
      setData(res);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Unable to load Matrimony profile details.');
    } finally {
      setLoading(false);
    }
  }, [targetUid]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const profile = data?.profile;
  const contact = data?.contactInfo;
  const familyDetails = data?.familyDetails;
  const incomeDetails = data?.incomeDetails;
  const preferences = data?.preferences;

  const displayName = profile?.displayName || contact?.fullName || 'Member';
  const profileCode = String(
    profile?.matrimonyId ||
      profile?.profileCode ||
      route?.params?.profileCode ||
      (targetUid ? `RM${targetUid.slice(0, 7).toUpperCase()}` : '')
  )
    .trim()
    .toUpperCase();
  const photoUri = profile?.signedProfilePhoto || null;
  const galleryUris = useMemo(() => {
    const all: string[] = [];
    if (photoUri) all.push(photoUri);
    for (const g of profile?.signedGallery || []) {
      if (g && !all.includes(g)) all.push(g);
    }
    return all;
  }, [photoUri, profile?.signedGallery]);

  const totalPhotos = galleryUris.length;
  const status = profile?.profileStatus || 'pending';
  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';
  const isDeleted = status === 'deleted';
  const isInactive = status === 'inactive' || status === 'suspended';
  const inactiveReason = data?.inactiveReason || profile?.inactiveReason || null;
  const deletionReason = data?.deletionReason || profile?.deletionReason || null;
  const reports: MatrimonyProfileReport[] = data?.reports || [];
  const openReportsCount = reports.filter((r) => r.status === 'open').length;

  const handleApprove = () => {
    Alert.alert(
      'Approve & Verify Profile',
      `Verify ${displayName}'s Rhema Matrimony profile? It will become active immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setProcessingAction('approve');
            try {
              await matrimonyApi.approveAdminProfile(targetUid);
              setData((prev) =>
                prev
                  ? {
                      ...prev,
                      inactiveReason: null,
                      rejectionReason: null,
                      profile: prev.profile
                        ? {
                            ...prev.profile,
                            profileStatus: 'approved',
                            verificationStatus: 'verified',
                            visibility: 'discoverable',
                            inactiveReason: null,
                          }
                        : prev.profile,
                    }
                  : prev
              );
              loadDetail().catch(() => {});
              Alert.alert('Verified', `${displayName}'s profile is now approved and active.`);
            } catch (err: any) {
              Alert.alert('Approval Failed', err?.message || 'Unable to approve profile.');
            } finally {
              setProcessingAction(null);
            }
          },
        },
      ]
    );
  };

  const handleConfirmReject = async () => {
    const cleanReason =
      rejectionReason.trim() || 'Profile details or photos need updates before verification.';
    setProcessingAction('reject');
    try {
      await matrimonyApi.rejectAdminProfile(targetUid, cleanReason);
      setRejectModalVisible(false);
      setRejectionReason('');
      setData((prev) =>
        prev
          ? {
              ...prev,
              rejectionReason: cleanReason,
              profile: prev.profile
                ? {
                    ...prev.profile,
                    profileStatus: 'rejected',
                    verificationStatus: 'rejected',
                    visibility: 'hidden',
                  }
                : prev.profile,
            }
          : prev
      );
      loadDetail().catch(() => {});
      Alert.alert('Profile Revoked', `${displayName}'s verification has been revoked immediately.`);
    } catch (err: any) {
      Alert.alert('Rejection Failed', err?.message || 'Unable to reject profile.');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleOpenInactivateModal = () => {
    const firstOpen = reports.find((r) => r.status === 'open');
    if (firstOpen) {
      setInactivateReason(
        firstOpen.reason && firstOpen.reason !== firstOpen.category
          ? `${firstOpen.category}: ${firstOpen.reason}`
          : `Reported profile (${firstOpen.category})`
      );
    } else {
      setInactivateReason('');
    }
    setInactivateModalVisible(true);
  };

  const handleConfirmInactivate = async () => {
    const cleanReason =
      inactivateReason.trim() ||
      'Your Rhema Matrimony profile is currently inactive under Church Administration review.';
    setProcessingAction('inactivate');
    try {
      await matrimonyApi.inactivateAdminProfile(targetUid, cleanReason);
      setInactivateModalVisible(false);
      setInactivateReason('');
      setData((prev) =>
        prev
          ? {
              ...prev,
              inactiveReason: cleanReason,
              profile: prev.profile
                ? {
                    ...prev.profile,
                    profileStatus: 'inactive',
                    visibility: 'hidden',
                    inactiveReason: cleanReason,
                  }
                : prev.profile,
            }
          : prev
      );
      loadDetail().catch(() => {});
      Alert.alert(
        'Profile Marked Inactive',
        `${displayName}'s Matrimony profile is now inactive and hidden from matches until you activate it again.`
      );
    } catch (err: any) {
      Alert.alert('Update Failed', err?.message || 'Unable to mark profile inactive.');
    } finally {
      setProcessingAction(null);
    }
  };

  const handleActivateProfile = () => {
    Alert.alert(
      'Activate Matrimony Profile',
      data?.isLegacyBan
        ? `Restore ${displayName}'s access to Rhema Matrimony?`
        : `Activate ${displayName}'s Rhema Matrimony profile? They will immediately be able to continue using Matrimony.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Activate',
          onPress: async () => {
            setProcessingAction('activate');
            try {
              const res = await matrimonyApi.activateAdminProfile(targetUid);
              if (res.wasLegacyBan) {
                Alert.alert(
                  'Access Restored',
                  `${displayName}'s Rhema Matrimony access is active again. They can now create their profile cleanly.`,
                  [{ text: 'OK', onPress: () => navigation.goBack() }]
                );
                return;
              }
              setData((prev) =>
                prev
                  ? {
                      ...prev,
                      inactiveReason: null,
                      rejectionReason: null,
                      profile: prev.profile
                        ? {
                            ...prev.profile,
                            profileStatus: 'approved',
                            visibility: 'discoverable',
                            inactiveReason: null,
                          }
                        : prev.profile,
                    }
                  : prev
              );
              loadDetail().catch(() => {});
              Alert.alert(
                'Profile Activated',
                `${displayName}'s Rhema Matrimony profile is now active.`
              );
            } catch (err: any) {
              Alert.alert('Activation Failed', err?.message || 'Unable to activate profile.');
            } finally {
              setProcessingAction(null);
            }
          },
        },
      ]
    );
  };

  const handleResolveReport = async (
    reportId: string,
    resolutionStatus: 'resolved' | 'dismissed'
  ) => {
    setResolvingReportId(reportId);
    try {
      await matrimonyApi.resolveAdminReport(reportId, resolutionStatus);
      await loadDetail();
    } catch (err: any) {
      Alert.alert('Report Update Failed', err?.message || 'Unable to update report status.');
    } finally {
      setResolvingReportId(null);
    }
  };

  const handleDeleteProfile = () => {
    Alert.alert(
      'Delete Matrimony Profile',
      `Delete ${displayName}'s Rhema Matrimony profile and photos from Firebase? They will NOT be banned and can set up a new profile for admin approval again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Profile',
          style: 'destructive',
          onPress: async () => {
            setProcessingAction('delete');
            try {
              await matrimonyApi.deleteAdminProfile(targetUid);
              Alert.alert(
                'Profile Deleted',
                `${displayName}'s Matrimony profile has been deleted. They can set up a fresh profile and submit it for approval again.`,
                [{ text: 'OK', onPress: () => navigation.goBack() }]
              );
            } catch (err: any) {
              Alert.alert('Delete Failed', err?.message || 'Unable to delete Matrimony profile.');
            } finally {
              setProcessingAction(null);
            }
          },
        },
      ]
    );
  };

  const dividerColor = isDark ? 'rgba(255, 255, 255, 0.1)' : '#E5E7EB';
  const surfaceBg = isDark ? colors.bg : '#FFFFFF';
  const cardBg = colors.surface;

  const renderSectionHeader = (title: string) => (
    <View style={styles.sectionHeaderRow}>
      <Text style={[styles.sectionHeading, { color: colors.text, fontFamily, fontSize: scaleFont(19) }]}>
        {title}
      </Text>
    </View>
  );

  const renderKeyValue = (label: string, value?: string | null) => (
    <View style={styles.kvRow} key={label}>
      <Text style={[styles.kvLabel, { color: colors.textSecondary, fontFamily }]}>{label}</Text>
      <Text style={[styles.kvColon, { color: colors.textSecondary }]}>:</Text>
      <Text style={[styles.kvValue, { color: colors.text, fontFamily }]} selectable>
        {value && value.trim() ? value : 'Not Specified'}
      </Text>
    </View>
  );

  const interestsList = [
    ...(profile?.interests?.hobbies || []),
    ...(profile?.interests?.music || []),
    ...(profile?.interests?.sports || []),
    ...(profile?.interests?.reading || []),
    ...(profile?.interests?.movies || []),
    ...(profile?.interests?.food || []),
    ...(profile?.interests?.languages || []),
  ];

  const headerTextColor = isDark ? '#FFFFFF' : '#1E293B';

  return (
    <View style={[styles.container, { backgroundColor: surfaceBg }]}>
      <StatusBar
        barStyle={colors.barStyle}
        backgroundColor="transparent"
        translucent
      />

      {/* Orange Gradient Header Card with Back (left) & Delete (right) */}
      <LinearGradient
        colors={
          isDark
            ? ['rgba(251, 146, 60, 0.34)', 'rgba(234, 88, 12, 0.18)', '#1E293B']
            : ['#FFD4B3', '#FFE8D6', '#FFF5ED']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[
          styles.gradientHeaderCard,
          {
            paddingTop: insets.top + 10,
            borderBottomColor: isDark ? 'rgba(251, 146, 60, 0.35)' : '#FED7AA',
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerBackBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ArrowLeft size={22} color={headerTextColor} />
        </TouchableOpacity>

        <View style={styles.headerCenterCol}>
          <Text
            style={[
              styles.headerNameText,
              { color: headerTextColor, fontFamily, fontSize: scaleFont(17.5) },
            ]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {profileCode ? (
            <Text
              style={[
                styles.headerProfileIdText,
                {
                  color: isDark ? '#CBD5E1' : '#64748B',
                  fontFamily,
                },
              ]}
              numberOfLines={1}
              selectable
            >
              {`ID: ${profileCode}`}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={[
            styles.headerDeleteBtn,
            processingAction !== null && { opacity: 0.6 },
          ]}
          onPress={handleDeleteProfile}
          disabled={processingAction !== null}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {processingAction === 'delete' ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Trash2 size={18} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </LinearGradient>

      {loading && !data ? (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={CORAL} />
        </View>
      ) : (
        <>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 110, 120) }}
            showsVerticalScrollIndicator={false}
          >
            {/* Hero Photo Banner */}
            <TouchableOpacity
              style={styles.heroWrap}
              activeOpacity={0.95}
              onPress={() => {
                if (galleryUris.length > 0) {
                  setSelectedPhotoIndex(0);
                  setGalleryModalVisible(true);
                }
              }}
            >
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.heroImage} resizeMode="cover" />
              ) : (
                <View style={styles.heroPlaceholder}>
                  <User size={74} color="#CBD5E1" />
                  <Text style={styles.heroPlaceholderText}>No Profile Photo</Text>
                </View>
              )}

              <LinearGradient
                colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.52)']}
                locations={[0, 0.45, 1]}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              <View style={styles.heroBottomRow}>
                <View
                  style={[
                    styles.tierPill,
                    isApproved
                      ? { backgroundColor: '#DCFCE7', borderColor: '#16A34A' }
                      : isInactive
                      ? { backgroundColor: '#FEF3C7', borderColor: '#D97706' }
                      : isDeleted || isRejected
                      ? { backgroundColor: '#FEE2E2', borderColor: '#DC2626' }
                      : undefined,
                  ]}
                >
                  <Text
                    style={[
                      styles.tierPillText,
                      isApproved
                        ? { color: '#166534' }
                        : isInactive
                        ? { color: '#92400E' }
                        : isDeleted || isRejected
                        ? { color: '#991B1B' }
                        : undefined,
                    ]}
                  >
                    {isApproved
                      ? 'VERIFIED'
                      : isInactive
                      ? 'INACTIVE'
                      : isDeleted
                      ? 'DELETED'
                      : isRejected
                      ? 'REJECTED'
                      : 'PENDING REVIEW'}
                  </Text>
                </View>

                <View style={styles.heroPhotoActions}>
                  <TouchableOpacity
                    style={styles.heroCountBtn}
                    onPress={() => {
                      if (galleryUris.length > 0) {
                        setSelectedPhotoIndex(0);
                        setGalleryModalVisible(true);
                      }
                    }}
                    activeOpacity={0.85}
                  >
                    <ImageIcon size={16} color="#FFFFFF" />
                    <Text style={styles.heroPhotoText}>{totalPhotos}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>

            {/* Contact Summary Bar (Exact contactBar styling) */}
            <View style={[styles.contactBar, { borderBottomColor: dividerColor, backgroundColor: cardBg }]}>
              <View style={styles.contactAction}>
                <Phone size={17} color={GREEN} />
                <Text style={[styles.contactActionText, { color: colors.text, fontFamily }]} numberOfLines={1}>
                  {contact?.phone || 'No mobile number'}
                </Text>
              </View>

              <View style={[styles.contactDivider, { backgroundColor: dividerColor }]} />

              <View style={styles.contactAction}>
                <Mail size={17} color={GREEN} />
                <Text style={[styles.contactActionText, { color: colors.text, fontFamily }]} numberOfLines={1}>
                  {contact?.email || 'No email address'}
                </Text>
              </View>
            </View>

            {/* Gallery Strip when uploaded images exist */}
            {galleryUris.length > 0 && (
              <View style={[styles.galleryStripWrap, { borderBottomColor: dividerColor }]}>
                <Text style={[styles.galleryStripLabel, { color: colors.textSecondary, fontFamily }]}>
                  Uploaded Images ({galleryUris.length})
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.galleryStripRow}
                >
                  {galleryUris.map((uri, idx) => (
                    <TouchableOpacity
                      key={`${uri}-${idx}`}
                      activeOpacity={0.85}
                      onPress={() => {
                        setSelectedPhotoIndex(idx);
                        setGalleryModalVisible(true);
                      }}
                    >
                      <Image source={{ uri }} style={styles.galleryThumb} resizeMode="cover" />
                      {idx === 0 && (
                        <View style={styles.primaryTag}>
                          <Text style={styles.primaryTagText}>Primary</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Inactive profile banner */}
            {isInactive ? (
              <View style={styles.inactiveBanner}>
                <PauseCircle size={19} color="#B45309" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.inactiveBannerTitle}>Profile Currently Inactive</Text>
                  <Text style={styles.inactiveBannerText}>
                    {inactiveReason ||
                      'This profile is hidden from matches and cannot access Matrimony until activated.'}
                  </Text>
                  {data?.isLegacyBan ? (
                    <Text style={styles.inactiveBannerSub}>
                      Tap Activate Profile below to restore Matrimony access for this member.
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Rejection note banner if rejected */}
            {isRejected && data?.rejectionReason ? (
              <View style={styles.rejectionBanner}>
                <ShieldAlert size={18} color="#991B1B" />
                <Text style={styles.rejectionBannerText}>
                  Rejection Reason: {data.rejectionReason}
                </Text>
              </View>
            ) : null}

            {/* Self-deletion reason banner if deleted */}
            {isDeleted ? (
              <View style={styles.rejectionBanner}>
                <ShieldAlert size={18} color="#991B1B" />
                <Text style={styles.rejectionBannerText}>
                  Profile Deleted by Member{deletionReason ? ` • Reason: ${deletionReason}` : ''}
                </Text>
              </View>
            ) : null}

            {/* Attached Reports Section */}
            {reports.length > 0 ? (
              <View style={styles.reportsSection}>
                <View style={styles.reportsSectionHeader}>
                  <View style={styles.reportsTitleRow}>
                    <Flag size={16} color={RED} />
                    <Text style={[styles.reportsSectionTitle, { fontFamily }]}>
                      Profile Reports ({reports.length})
                    </Text>
                  </View>
                  {openReportsCount > 0 ? (
                    <View style={styles.openCountPill}>
                      <Text style={styles.openCountText}>{openReportsCount} Open</Text>
                    </View>
                  ) : null}
                </View>

                {reports.map((rep) => {
                  const isOpen = rep.status === 'open';
                  const statusLabel =
                    rep.status === 'open'
                      ? 'Open'
                      : rep.status === 'action_taken'
                      ? 'Action Taken'
                      : rep.status === 'dismissed'
                      ? 'Dismissed'
                      : 'Resolved';
                  const statusBg =
                    rep.status === 'open'
                      ? '#FEE2E2'
                      : rep.status === 'action_taken'
                      ? '#FEF3C7'
                      : '#E2E8F0';
                  const statusFg =
                    rep.status === 'open'
                      ? '#991B1B'
                      : rep.status === 'action_taken'
                      ? '#92400E'
                      : '#334155';
                  const dateLabel = rep.createdAtMs
                    ? new Date(rep.createdAtMs).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : 'Recently';

                  return (
                    <View
                      key={rep.id}
                      style={[
                        styles.reportCard,
                        {
                          backgroundColor: isDark ? colors.surface : '#FFFFFF',
                          borderColor: isOpen ? '#FCA5A5' : dividerColor,
                        },
                      ]}
                    >
                      <View style={styles.reportCardTop}>
                        <Text style={[styles.reportCategory, { color: colors.text, fontFamily }]}>
                          {rep.category}
                        </Text>
                        <View style={[styles.reportStatusPill, { backgroundColor: statusBg }]}>
                          <Text style={[styles.reportStatusText, { color: statusFg }]}>
                            {statusLabel}
                          </Text>
                        </View>
                      </View>

                      <Text style={[styles.reportMeta, { color: colors.textSecondary, fontFamily }]}>
                        Reported by {rep.reporterName}
                        {rep.reporterCode ? ` (${rep.reporterCode})` : ''} • {dateLabel} •{' '}
                        {rep.source === 'chat' ? 'From Chat' : 'From Profile'}
                      </Text>

                      {rep.reason && rep.reason !== rep.category ? (
                        <Text style={[styles.reportReason, { color: colors.text, fontFamily }]}>
                          &ldquo;{rep.reason}&rdquo;
                        </Text>
                      ) : null}

                      {isOpen ? (
                        <View style={styles.reportActionRow}>
                          <TouchableOpacity
                            style={styles.reportDismissBtn}
                            disabled={resolvingReportId === rep.id}
                            onPress={() => handleResolveReport(rep.id, 'dismissed')}
                          >
                            <Text style={styles.reportDismissText}>
                              {resolvingReportId === rep.id ? 'Updating...' : 'Dismiss'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.reportResolveBtn}
                            disabled={resolvingReportId === rep.id}
                            onPress={() => handleResolveReport(rep.id, 'resolved')}
                          >
                            <Text style={styles.reportResolveText}>Mark Resolved</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Personal Information Sections (Exact MatrimonyEditProfileScreen style) */}
            <View style={styles.bodyContent}>
              <Text style={[styles.superHeading, { fontFamily, fontSize: scaleFont(19) }]}>
                Personal Information
              </Text>

              {/* A Few Lines About Myself */}
              <View style={styles.sectionBlock}>
                {renderSectionHeader('A Few Lines About Myself')}
                <Text style={[styles.paragraphText, { color: colors.text, fontFamily }]}>
                  {profile?.aboutMe?.trim() || 'Not Specified'}
                </Text>
              </View>

              {/* Basic Details */}
              <View style={styles.sectionBlock}>
                {renderSectionHeader('Basic Details')}
                {renderKeyValue('Profile ID', profileCode)}
                {renderKeyValue('Name', displayName)}
                {renderKeyValue('Age', profile?.age ? `${profile.age} yrs` : 'Not Specified')}
                {renderKeyValue('Date of Birth', contact?.dob || 'Not Specified')}
                {renderKeyValue('Profile Created For', 'Self')}
                {renderKeyValue('Gender', profile?.gender)}
                {renderKeyValue('Height', formatHeightDisplay(profile?.heightCm))}
                {renderKeyValue('Marital Status', profile?.maritalStatus)}
                {renderKeyValue('Mother Tongue', profile?.motherTongue)}
                {renderKeyValue('Physical Status', profile?.physicalStatus || 'Normal')}
              </View>

              {/* Professional Information */}
              <View style={styles.sectionBlock}>
                {renderSectionHeader('Professional Information')}
                {renderKeyValue('Education', profile?.education?.qualification)}
                {renderKeyValue('Employed in', profile?.career?.employmentType)}
                {renderKeyValue('Occupation', profile?.career?.profession)}
                {renderKeyValue('Organization', profile?.career?.organization)}
                {renderKeyValue('Annual Income', incomeDetails?.annualIncomeRange)}
              </View>

              {/* Location */}
              <View style={styles.sectionBlock}>
                {renderSectionHeader('Location')}
                {renderKeyValue('Country', profile?.location?.country)}
                {renderKeyValue('State', profile?.location?.state)}
                {renderKeyValue('City', profile?.location?.village || profile?.location?.city)}
                {renderKeyValue('Pin Code', profile?.location?.pincode)}
                {renderKeyValue('Citizenship', profile?.location?.citizenship || profile?.location?.country)}
              </View>

              {/* Religious Information */}
              <View style={styles.sectionBlock}>
                {renderSectionHeader('Religious Information')}
                {renderKeyValue('Religion', profile?.faithSummary?.religion || 'Christian')}
                {renderKeyValue(
                  'Baptized',
                  profile?.faithSummary?.baptized === true
                    ? 'Yes'
                    : profile?.faithSummary?.baptized === false
                    ? 'No'
                    : 'Not Specified'
                )}
                {renderKeyValue('Religious Values', profile?.faithSummary?.religiousValues)}
                {renderKeyValue('Denomination', profile?.faithSummary?.denomination)}
                {renderKeyValue('Division', profile?.faithSummary?.division)}
              </View>

              {/* Hobbies & Interests */}
              <View style={styles.sectionBlock}>
                {renderSectionHeader('Hobbies & Interests')}
                {interestsList.length > 0 ? (
                  <Text style={[styles.paragraphText, { color: colors.text, fontFamily }]}>
                    {interestsList.join(', ')}
                  </Text>
                ) : (
                  <Text style={[styles.paragraphText, { color: colors.textSecondary, fontFamily }]}>
                    Not Specified
                  </Text>
                )}
              </View>

              {/* Habits */}
              <View style={styles.sectionBlock}>
                {renderSectionHeader('Habits')}
                {renderKeyValue('Eating Habits', profile?.habits?.eatingHabits)}
                {renderKeyValue('Smoking Habits', profile?.habits?.smokingHabits)}
                {renderKeyValue('Drinking Habits', profile?.habits?.drinkingHabits)}
              </View>

              {/* Trust Badge */}
              <View style={styles.sectionBlock}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionHeading, { color: colors.text, fontFamily, fontSize: scaleFont(19) }]}>
                    Trust Badge
                  </Text>
                  <View style={styles.trustCircle}>
                    <Check size={15} color="#0284C7" strokeWidth={2.5} />
                  </View>
                </View>
                <View style={styles.trustRow}>
                  <Check size={16} color={GREEN} strokeWidth={2.6} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.trustTitle, { color: colors.text, fontFamily }]}>
                      Contact & Membership Check
                    </Text>
                    <Text style={[styles.trustSub, { color: colors.textSecondary, fontFamily }]}>
                      {contact?.phone ? 'Mobile number on record' : 'Mobile number pending'} • Profile{' '}
                      {profile?.profileCompletion ?? 0}% complete
                    </Text>
                  </View>
                </View>
              </View>

              {/* Family Details */}
              <View style={styles.sectionBlock}>
                {renderSectionHeader('Family Details')}
                {renderKeyValue('Family Type', profile?.familySummary?.familyType)}
                {renderKeyValue('Family Values', profile?.familySummary?.familyValues)}
                {renderKeyValue('Family Status', profile?.familySummary?.familyStatus)}
                {renderKeyValue("Father's Occupation", familyDetails?.fatherOccupation)}
                {renderKeyValue("Mother's Occupation", familyDetails?.motherOccupation)}
                {renderKeyValue('Family Origin', familyDetails?.familyOrigin)}
                {renderKeyValue('No. of Brothers', familyDetails?.brothers || 'None')}
                {renderKeyValue('No. of Sisters', familyDetails?.sisters || 'None')}
                {renderKeyValue(
                  familyDetails?.brothers === '1' ? 'Brother Married' : 'Brothers Married',
                  familyDetails?.brothers === '1'
                    ? familyDetails?.brothersMarried === '1'
                      ? 'Yes'
                      : 'No'
                    : familyDetails?.brothersMarried || 'None'
                )}
                {renderKeyValue(
                  familyDetails?.sisters === '1' ? 'Sister Married' : 'Sisters Married',
                  familyDetails?.sisters === '1'
                    ? familyDetails?.sistersMarried === '1'
                      ? 'Yes'
                      : 'No'
                    : familyDetails?.sistersMarried || 'None'
                )}
              </View>

              {/* About my family */}
              <View style={styles.sectionBlock}>
                {renderSectionHeader('About my family')}
                <Text style={[styles.paragraphText, { color: colors.text, fontFamily }]}>
                  {familyDetails?.familyIntro?.trim() || 'Not Specified'}
                </Text>
              </View>

              {/* Partner Preference Section */}
              <View style={styles.partnerSectionWrap}>
                <View style={[styles.partnerDivider, { backgroundColor: dividerColor }]} />

                <View style={styles.partnerHeaderRow}>
                  <Text style={[styles.superHeading, { fontFamily, fontSize: scaleFont(19) }]}>
                    Partner Preference
                  </Text>
                </View>

                <View style={styles.sectionBlock}>
                  {renderSectionHeader('A Few Lines About My Partner')}
                  <Text style={[styles.paragraphText, { color: colors.text, fontFamily }]}>
                    {preferences?.partnerExpectations?.trim() || 'Not Specified'}
                  </Text>
                </View>

                <View style={styles.sectionBlock}>
                  {renderSectionHeader('Basic Details')}
                  {renderKeyValue(
                    'Age',
                    `${preferences?.age?.min ?? 20} - ${preferences?.age?.max ?? 35} Yrs`
                  )}
                  {renderKeyValue(
                    'Height',
                    `${formatShortHeight(preferences?.height?.minCm ?? 150)} - ${formatShortHeight(
                      preferences?.height?.maxCm ?? 190
                    )}`
                  )}
                  {renderKeyValue(
                    'Marital Status',
                    (() => {
                      const norm = normalizePrefMaritalStatuses(preferences?.maritalStatuses);
                      return norm.length ? norm.join(', ') : "Doesn't matter";
                    })()
                  )}
                  {!isOnlyNeverMarried(preferences?.maritalStatuses)
                    ? renderKeyValue('Have Children', preferences?.haveChildren || "Doesn't matter")
                    : null}
                  {renderKeyValue('Physical Status', preferences?.physicalStatus || 'Normal')}
                  {renderKeyValue('Mother Tongue', preferences?.motherTongue || 'Any')}
                </View>

                <View style={styles.sectionBlock}>
                  {renderSectionHeader('Religious Preference')}
                  {renderKeyValue('Denomination', preferences?.denomination || 'Any')}
                  {renderKeyValue('Division', preferences?.division || 'Any')}
                </View>

                <View style={styles.sectionBlock}>
                  {renderSectionHeader('Professional Preference')}
                  <View style={styles.kvRow}>
                    <Text style={[styles.kvLabel, { color: colors.textSecondary, fontFamily }]}>
                      Education
                    </Text>
                    <Text style={[styles.kvColon, { color: colors.textSecondary }]}>:</Text>
                    <View style={{ flex: 1 }}>
                      {(() => {
                        const eduList = preferences?.education?.acceptable || [];
                        const eduText = eduList.length ? eduList.join(', ') : 'Any';
                        const isLong = eduText.length > 56;
                        return (
                          <>
                            <Text
                              style={[styles.kvValue, { color: colors.text, fontFamily }]}
                              numberOfLines={!expandPrefEdu && isLong ? 2 : undefined}
                            >
                              {eduText}
                            </Text>
                            {isLong ? (
                              <TouchableOpacity
                                onPress={() => setExpandPrefEdu((prev) => !prev)}
                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              >
                                <Text style={styles.moreLink}>
                                  {expandPrefEdu ? 'less' : 'more'}
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </>
                        );
                      })()}
                    </View>
                  </View>
                  {renderKeyValue('Employed In', preferences?.employedIn || 'Any')}
                  {renderKeyValue('Occupation', preferences?.occupation || 'Any')}
                  {renderKeyValue('Annual Income', preferences?.annualIncome || 'Any')}
                </View>

                <View style={styles.sectionBlock}>
                  {renderSectionHeader('Location Preference')}
                  {renderKeyValue(
                    'Country',
                    preferences?.locations?.preferredCountries?.length
                      ? preferences.locations.preferredCountries.join(', ')
                      : 'Any'
                  )}
                  {preferences?.locations?.preferredStates?.length
                    ? renderKeyValue('State', preferences.locations.preferredStates.join(', '))
                    : null}
                  {preferences?.locations?.preferredCities?.length
                    ? renderKeyValue('City', preferences.locations.preferredCities.join(', '))
                    : null}
                </View>

                <View style={styles.sectionBlock}>
                  {renderSectionHeader('Habits Preferences')}
                  {renderKeyValue('Eating Habits', preferences?.eatingHabits || "Doesn't matter")}
                  {renderKeyValue('Drinking Habits', preferences?.drinkingHabits || "Doesn't matter")}
                  {renderKeyValue('Smoking Habits', preferences?.smokingHabits || "Doesn't matter")}
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Bottom Sticky Admin Action Bar */}
          <View
            style={[
              styles.bottomActionBar,
              {
                backgroundColor: cardBg,
                borderTopColor: dividerColor,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            {isInactive ? (
              <TouchableOpacity
                style={[
                  styles.adminApproveBtn,
                  processingAction !== null && { opacity: 0.7 },
                ]}
                disabled={processingAction !== null}
                onPress={handleActivateProfile}
              >
                {processingAction === 'activate' ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <PlayCircle size={18} color="#FFFFFF" />
                    <Text style={[styles.adminApproveText, { fontFamily }]}>
                      Activate Profile
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <>
                {isApproved ? (
                  <TouchableOpacity
                    style={[
                      styles.adminSingleRevokeBtn,
                      processingAction !== null && { opacity: 0.7 },
                    ]}
                    disabled={processingAction !== null}
                    onPress={() => setRejectModalVisible(true)}
                  >
                    {processingAction === 'reject' ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <XCircle size={18} color="#FFFFFF" />
                        <Text style={[styles.adminApproveText, { fontFamily }]}>Revoke</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.adminApproveBtn,
                      processingAction !== null && { opacity: 0.7 },
                    ]}
                    disabled={processingAction !== null}
                    onPress={handleApprove}
                  >
                    {processingAction === 'approve' ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <CheckCircle2 size={18} color="#FFFFFF" />
                        <Text style={[styles.adminApproveText, { fontFamily }]}>
                          Verify & Active
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[
                    styles.adminInactivateBtn,
                    processingAction !== null && { opacity: 0.7 },
                  ]}
                  disabled={processingAction !== null}
                  onPress={handleOpenInactivateModal}
                >
                  {processingAction === 'inactivate' ? (
                    <ActivityIndicator color="#B45309" />
                  ) : (
                    <>
                      <PauseCircle size={17} color="#B45309" />
                      <Text style={[styles.adminInactivateText, { fontFamily }]}>
                        Make Inactive
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </>
      )}

      {/* Fullscreen Photo Gallery Viewer */}
      <Modal
        visible={galleryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGalleryModalVisible(false)}
      >
        <View style={styles.lightboxBackdrop}>
          <View style={[styles.lightboxHeader, { paddingTop: insets.top + 10 }]}>
            <Text style={styles.lightboxCounter}>
              {selectedPhotoIndex + 1} / {galleryUris.length}
            </Text>
            <TouchableOpacity
              onPress={() => setGalleryModalVisible(false)}
              style={styles.lightboxCloseBtn}
            >
              <X size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={galleryUris}
            horizontal
            pagingEnabled
            initialScrollIndex={selectedPhotoIndex}
            getItemLayout={(_, index) => ({
              length: SCREEN_WIDTH,
              offset: SCREEN_WIDTH * index,
              index,
            })}
            keyExtractor={(item, idx) => `${item}-${idx}`}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setSelectedPhotoIndex(idx);
            }}
            renderItem={({ item }) => (
              <View style={styles.lightboxSlide}>
                <Image source={{ uri: item }} style={styles.lightboxImage} resizeMode="contain" />
              </View>
            )}
          />
        </View>
      </Modal>

      {/* Rejection Reason Modal */}
      <Modal
        visible={rejectModalVisible}
        transparent
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setKeyboardHeight(0);
          setRejectModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.rejectBackdrop,
            Platform.OS === 'android' && keyboardHeight > 0 && { paddingBottom: keyboardHeight },
          ]}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => {
              Keyboard.dismiss();
              setKeyboardHeight(0);
              setRejectModalVisible(false);
            }}
          />
          <View
            style={[
              styles.rejectCard,
              {
                backgroundColor: colors.bg,
                paddingBottom:
                  keyboardHeight > 0 ? 14 : Math.max(insets.bottom + 16, 22),
              },
            ]}
          >
            <View style={[styles.rejectHeader, { borderBottomColor: dividerColor }]}>
              <Text style={[styles.rejectTitle, { color: colors.text, fontFamily }]}>
                Revoke Verification
              </Text>
              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  setKeyboardHeight(0);
                  setRejectModalVisible(false);
                }}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.rejectHint, { color: colors.textSecondary, fontFamily }]}>
              Provide a short reason so {displayName} knows what to update before verification.
            </Text>
            <TextInput
              style={[
                styles.rejectInput,
                {
                  backgroundColor: colors.surface,
                  borderColor: dividerColor,
                  color: colors.text,
                  fontFamily,
                },
              ]}
              placeholder="e.g. Please upload a clearer face photo or update details"
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={400}
              value={rejectionReason}
              onChangeText={setRejectionReason}
            />
            <TouchableOpacity
              style={[styles.rejectConfirmBtn, processingAction === 'reject' && { opacity: 0.7 }]}
              onPress={handleConfirmReject}
              disabled={processingAction === 'reject'}
            >
              {processingAction === 'reject' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.rejectConfirmText, { fontFamily }]}>Confirm Revoke</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Make Inactive Modal */}
      <Modal
        visible={inactivateModalVisible}
        transparent
        statusBarTranslucent
        animationType="slide"
        onRequestClose={() => {
          Keyboard.dismiss();
          setKeyboardHeight(0);
          setInactivateModalVisible(false);
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.rejectBackdrop,
            Platform.OS === 'android' && keyboardHeight > 0 && { paddingBottom: keyboardHeight },
          ]}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => {
              Keyboard.dismiss();
              setKeyboardHeight(0);
              setInactivateModalVisible(false);
            }}
          />
          <View
            style={[
              styles.rejectCard,
              {
                backgroundColor: colors.bg,
                paddingBottom:
                  keyboardHeight > 0 ? 14 : Math.max(insets.bottom + 16, 22),
              },
            ]}
          >
            <View style={[styles.rejectHeader, { borderBottomColor: dividerColor }]}>
              <Text style={[styles.rejectTitle, { color: '#B45309', fontFamily }]}>
                Make Profile Inactive
              </Text>
              <TouchableOpacity
                onPress={() => {
                  Keyboard.dismiss();
                  setKeyboardHeight(0);
                  setInactivateModalVisible(false);
                }}
              >
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.rejectHint, { color: colors.textSecondary, fontFamily }]}>
              This temporarily hides {displayName}&apos;s profile from matches and pauses their access to Rhema Matrimony until you activate them again. All profile data, photos, and reports remain saved.
            </Text>
            <TextInput
              style={[
                styles.rejectInput,
                {
                  backgroundColor: colors.surface,
                  borderColor: dividerColor,
                  color: colors.text,
                  fontFamily,
                },
              ]}
              placeholder="Reason for marking inactive (e.g. Reported profile under review)"
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={400}
              value={inactivateReason}
              onChangeText={setInactivateReason}
            />
            <TouchableOpacity
              style={[
                styles.inactivateConfirmBtn,
                processingAction === 'inactivate' && { opacity: 0.7 },
              ]}
              onPress={handleConfirmInactivate}
              disabled={processingAction === 'inactivate'}
            >
              {processingAction === 'inactivate' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.rejectConfirmText, { fontFamily }]}>
                  Confirm Make Inactive
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gradientHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenterCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerNameText: {
    textAlign: 'center',
    fontWeight: '800',
  },
  headerProfileIdText: {
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: 1,
    letterSpacing: 0.4,
  },
  headerDeleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroWrap: {
    width: '100%',
    height: 290,
    backgroundColor: '#64748B',
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  heroPlaceholderText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  heroBottomRow: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tierPill: {
    backgroundColor: '#FDE68A',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#D4AF37',
  },
  tierPillText: {
    color: '#4B2E05',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  heroPhotoActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroCountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
  },
  heroPhotoText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  contactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  contactAction: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  contactActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  contactDivider: {
    width: 1,
    height: '72%',
  },
  galleryStripWrap: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  galleryStripLabel: {
    paddingHorizontal: 18,
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 8,
  },
  galleryStripRow: {
    paddingHorizontal: 18,
    gap: 10,
  },
  galleryThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  primaryTag: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.68)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  primaryTagText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '700',
  },
  rejectionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 18,
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
  },
  rejectionBannerText: {
    flex: 1,
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
  },
  inactiveBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 18,
    marginTop: 14,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  inactiveBannerTitle: {
    color: '#92400E',
    fontSize: 13.5,
    fontWeight: '800',
  },
  inactiveBannerText: {
    color: '#78350F',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  inactiveBannerSub: {
    color: '#B45309',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  reportsSection: {
    marginHorizontal: 18,
    marginTop: 16,
    gap: 10,
  },
  reportsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  reportsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  reportsSectionTitle: {
    color: RED,
    fontSize: 15.5,
    fontWeight: '800',
  },
  openCountPill: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  openCountText: {
    color: '#991B1B',
    fontSize: 11.5,
    fontWeight: '800',
  },
  reportCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  reportCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  reportCategory: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  reportStatusPill: {
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  reportStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  reportMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  reportReason: {
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  reportActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  reportDismissBtn: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  reportDismissText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  reportResolveBtn: {
    backgroundColor: '#16A34A',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  reportResolveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  bodyContent: {
    paddingHorizontal: 18,
    paddingTop: 18,
    gap: 22,
  },
  superHeading: {
    color: ACCENT_RED,
    fontWeight: '600',
  },
  sectionBlock: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionHeading: {
    fontWeight: '600',
  },
  paragraphText: {
    fontSize: 14.5,
    lineHeight: 22,
  },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 2,
  },
  kvLabel: {
    width: '42%',
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
    fontWeight: '500',
  },
  moreLink: {
    color: '#0284C7',
    fontWeight: '700',
    fontSize: 13.5,
    marginTop: 2,
  },
  trustCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: '#0284C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  trustTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  trustSub: {
    fontSize: 13.5,
  },
  partnerSectionWrap: {
    gap: 22,
    marginTop: 6,
  },
  partnerDivider: {
    height: 1,
    marginBottom: 2,
  },
  partnerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  bottomActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  adminSingleRevokeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: 24,
    backgroundColor: RED,
  },
  adminApproveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: 24,
    backgroundColor: GREEN,
  },
  adminApproveText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  adminInactivateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    backgroundColor: '#FFFBEB',
  },
  adminInactivateText: {
    color: '#B45309',
    fontSize: 13.5,
    fontWeight: '800',
  },
  inactivateConfirmBtn: {
    backgroundColor: '#D97706',
    borderRadius: 22,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  lightboxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  lightboxCounter: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  lightboxCloseBtn: {
    padding: 6,
  },
  lightboxSlide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT - 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightboxImage: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  rejectBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  rejectCard: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
  },
  rejectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rejectTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  rejectHint: {
    fontSize: 13.5,
    lineHeight: 19,
  },
  rejectInput: {
    borderWidth: 1.2,
    borderRadius: 12,
    padding: 12,
    minHeight: 96,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  rejectConfirmBtn: {
    backgroundColor: RED,
    borderRadius: 22,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectConfirmText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
