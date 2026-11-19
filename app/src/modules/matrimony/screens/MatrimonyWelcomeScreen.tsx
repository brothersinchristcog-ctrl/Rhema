import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronDown,
  HeartHandshake,
  AlertCircle,
  PauseCircle,
  RefreshCw,
  UserCheck,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import MotherTonguePickerModal from '../components/MotherTonguePickerModal';
import { matrimonyApi, resolveMatrimonyEntryRoute } from '../services/matrimonyApi';
import { MatrimonyPendingRegistrationDraft, StartRegistrationResponse } from '../types/matrimony';

const ORANGE = '#EA580C';
const ORANGE_BORDER = '#FDBA74';

const REASON_LABELS: Record<string, string> = {
  NOT_A_RHEMA_MEMBER: 'Active Rhema Global Ministries membership is required.',
  GUEST_NOT_ELIGIBLE: 'Guest accounts cannot register for Rhema Matrimony.',
  MEMBERSHIP_INACTIVE: 'Your Rhema membership is currently inactive or suspended.',
  OUTSIDE_RHEMA_SCOPE: 'Rhema Matrimony is currently available only to Rhema Global Ministries members.',
  DOB_MISSING_OR_INVALID: 'Please update your Date of Birth in your Rhema Profile to verify age eligibility.',
  UNDER_MINIMUM_AGE: 'Members must be at least 18 years old to join Rhema Matrimony.',
  MATRIMONY_ACCESS_REVOKED:
    'Your Rhema Matrimony profile is currently inactive. You cannot access Matrimony features until Church Administration reactivates your profile. You can continue using all other Rhema Global Ministries app features.',
};

export default function MatrimonyWelcomeScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { member, setMember } = useAuth();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const preloadedData: StartRegistrationResponse | undefined = route?.params?.preloadedData;

  const [loading, setLoading] = useState(!preloadedData);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StartRegistrationResponse | null>(preloadedData || null);

  const [selectedMyself, setSelectedMyself] = useState(false);
  const [baptized, setBaptized] = useState<boolean | null>(null);
  const [motherTongue, setMotherTongue] = useState<string>(
    preloadedData?.profile?.motherTongue || member?.motherTongue || ''
  );
  const [dropdownVisible, setDropdownVisible] = useState(false);

  const loadEligibility = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await matrimonyApi.startRegistration({ force });
      setData(res);

      const nextRoute = resolveMatrimonyEntryRoute(res);
      if (nextRoute.screen !== 'MatrimonyWelcome') {
        navigation.replace(nextRoute.screen, nextRoute.params);
      } else {
        const prefilledMt = res.profile?.motherTongue || member?.motherTongue || '';
        if (prefilledMt) {
          setMotherTongue(prefilledMt);
        }
      }
    } catch (err: any) {
      console.warn('startMatrimonyRegistration error:', err?.code, err?.message);
      const rawCode = String(err?.code || '').toLowerCase();
      const rawMsg = String(err?.message || '').trim();
      const normalizedMsg = rawMsg.toLowerCase();

      if (
        rawCode === 'unavailable' ||
        rawCode === 'functions/unavailable' ||
        normalizedMsg === 'unavailable' ||
        normalizedMsg.includes('network request failed')
      ) {
        setError(
          'Unable to reach the Rhema Matrimony verification service right now. Please check your internet connection and tap Try Again.'
        );
      } else if (
        rawCode === 'deadline-exceeded' ||
        rawCode === 'functions/deadline-exceeded' ||
        normalizedMsg.includes('aborted')
      ) {
        setError('Verification timed out. Please check your internet connection and tap Try Again.');
      } else if (rawCode === 'unauthenticated' || rawCode === 'functions/unauthenticated') {
        setError('Your session expired. Please sign out and sign in again to continue.');
      } else {
        setError(rawMsg || 'Unable to verify Rhema Matrimony eligibility.');
      }
    } finally {
      setLoading(false);
    }
  }, [navigation, member?.motherTongue]);

  useEffect(() => {
    if (!preloadedData) {
      loadEligibility();
    }
  }, [preloadedData, loadEligibility]);

  const canContinue = selectedMyself && baptized !== null && motherTongue.trim().length > 0;

  const handleContinue = () => {
    if (!canContinue || !data) return;
    const trimmedMt = motherTongue.trim();

    if (member && member.motherTongue !== trimmedMt) {
      setMember({ ...member, motherTongue: trimmedMt });
    }

    const existingDraft: MatrimonyPendingRegistrationDraft = route?.params?.draftData || {};
    const draftData: MatrimonyPendingRegistrationDraft = {
      ...existingDraft,
      welcome: { motherTongue: trimmedMt, baptized: Boolean(baptized) },
    };

    const patchedData: StartRegistrationResponse = {
      ...data,
      profile: data.profile
        ? {
            ...data.profile,
            motherTongue: trimmedMt,
            faithSummary: {
              ...(data.profile.faithSummary || {}),
              baptized,
            },
          }
        : data.profile,
    };
    navigation.navigate('MatrimonyBasicDetails', { initialData: patchedData, draftData });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.bg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily, fontSize: scaleFont(18) }]}>
          {data?.eligible && data?.profile ? 'Create Profile' : 'Eligibility'}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={ORANGE} />
            <Text style={[styles.loadingText, { color: colors.textSecondary, fontFamily }]}>
              Verifying eligibility...
            </Text>
          </View>
        ) : error ? (
          <View style={styles.errorCard}>
            <AlertCircle size={24} color="#B91C1C" />
            <Text style={[styles.errorTitle, { fontFamily }]}>Verification Error</Text>
            <Text style={[styles.errorMsg, { fontFamily }]}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => loadEligibility(true)}>
              <Text style={[styles.retryText, { fontFamily }]}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : data && !data.eligible ? (
          (data.reasons || []).includes('MATRIMONY_ACCESS_REVOKED') ? (
            <View style={styles.inactiveCard}>
              <PauseCircle size={26} color="#B45309" />
              <Text style={[styles.inactiveTitle, { fontFamily }]}>
                Profile Currently Inactive
              </Text>
              {data.banReason ? (
                <Text style={[styles.inactiveReasonNote, { fontFamily }]}>
                  Reason: {data.banReason}
                </Text>
              ) : null}
              <Text style={[styles.inactiveMsg, { fontFamily }]}>
                {REASON_LABELS.MATRIMONY_ACCESS_REVOKED}
              </Text>
              <View style={styles.inactiveBtnRow}>
                <TouchableOpacity
                  style={styles.inactiveRefreshBtn}
                  onPress={() => loadEligibility(true)}
                >
                  <RefreshCw size={15} color="#FFFFFF" />
                  <Text style={[styles.retryText, { fontFamily }]}>Refresh Status</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.inactiveBackBtn}
                  onPress={() => {
                    const parentNav = navigation.getParent();
                    if (parentNav) parentNav.goBack();
                    else navigation.goBack();
                  }}
                >
                  <Text style={[styles.inactiveBackText, { fontFamily }]}>Back to Rhema App</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.errorCard}>
              <AlertCircle size={24} color="#B91C1C" />
              <Text style={[styles.errorTitle, { fontFamily }]}>Not Eligible Yet</Text>
              {(data.reasons || []).map((r) => (
                <Text key={r} style={[styles.reasonItem, { fontFamily }]}>
                  • {REASON_LABELS[r] || r}
                </Text>
              ))}
            </View>
          )
        ) : data?.profile ? (
          <>
            <View style={styles.welcomeHeader}>
              <View style={styles.emblemCircle}>
                <HeartHandshake size={32} color="#FFFFFF" />
              </View>
              <Text style={[styles.welcomeTitle, { color: colors.text, fontFamily, fontSize: scaleFont(20) }]}>
                Welcome to Rhema Matrimony!
              </Text>
              <Text style={[styles.welcomeDesc, { color: colors.textSecondary, fontFamily, fontSize: scaleFont(14) }]}>
                You have already created a profile in Rhema Global Ministries, so continue with your existing profile.
              </Text>
            </View>
            <View style={styles.questionSection}>
              <Text style={[styles.questionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(16) }]}>
                I am creating this profile for
              </Text>
              <View style={styles.pillRow}>
                <TouchableOpacity
                  style={[
                    styles.optionPill,
                    {
                      backgroundColor: selectedMyself
                        ? isDark
                          ? 'rgba(234, 88, 12, 0.22)'
                          : 'rgba(234, 88, 12, 0.12)'
                        : colors.surface,
                      borderColor: selectedMyself ? ORANGE : ORANGE_BORDER,
                    },
                  ]}
                  onPress={() => setSelectedMyself((prev) => !prev)}
                  activeOpacity={0.85}
                >
                  <UserCheck size={16} color={selectedMyself ? (isDark ? '#FDBA74' : '#C2410C') : ORANGE} />
                  <Text
                    style={[
                      styles.optionPillText,
                      {
                        color: selectedMyself ? (isDark ? '#FDBA74' : '#C2410C') : colors.text,
                        fontFamily,
                        fontSize: scaleFont(15),
                      },
                    ]}
                  >
                    Myself
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {selectedMyself && (
              <>
                <View style={styles.questionSection}>
                  <Text style={[styles.questionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(16) }]}>
                    Have you baptized?
                  </Text>
                  <View style={styles.pillRow}>
                    {[
                      { label: 'Yes', value: true },
                      { label: 'No', value: false },
                    ].map((opt) => {
                      const isSelected = baptized === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.label}
                          style={[
                            styles.optionPill,
                            {
                              backgroundColor: isSelected
                                ? isDark
                                  ? 'rgba(234, 88, 12, 0.22)'
                                  : 'rgba(234, 88, 12, 0.12)'
                                : colors.surface,
                              borderColor: isSelected ? ORANGE : ORANGE_BORDER,
                            },
                          ]}
                          onPress={() => setBaptized(opt.value)}
                          activeOpacity={0.85}
                        >
                          <Text
                            style={[
                              styles.optionPillText,
                              {
                                color: isSelected ? (isDark ? '#FDBA74' : '#C2410C') : colors.text,
                                fontFamily,
                                fontSize: scaleFont(15),
                              },
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {baptized !== null && (
                  <View style={styles.questionSection}>
                    <Text style={[styles.questionTitle, { color: colors.text, fontFamily, fontSize: scaleFont(16) }]}>
                      Mother tongue
                    </Text>

                    <View style={styles.floatingBoxWrap}>
                      <Text
                        style={[
                          styles.floatingLabel,
                          {
                            backgroundColor: colors.bg,
                            color: colors.textSecondary,
                            fontFamily,
                          },
                        ]}
                      >
                        Your mother tongue
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.dropdownBtn,
                          {
                            backgroundColor: colors.surface,
                            borderColor: motherTongue ? ORANGE : colors.border,
                          },
                        ]}
                        onPress={() => setDropdownVisible(true)}
                        activeOpacity={0.85}
                      >
                        <Text
                          style={[
                            styles.dropdownBtnText,
                            {
                              color: motherTongue ? colors.text : colors.textSecondary,
                              fontFamily,
                              fontSize: scaleFont(15),
                            },
                          ]}
                        >
                          {motherTongue || 'Select your mother tongue'}
                        </Text>

                        <View style={styles.dropdownIcons}>
                          {motherTongue ? (
                            <TouchableOpacity
                              onPress={() => setMotherTongue('')}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              style={styles.clearIconBtn}
                            >
                              <X size={17} color={colors.textSecondary} />
                            </TouchableOpacity>
                          ) : null}
                          <ChevronDown size={20} color={ORANGE} />
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </>
            )}
          </>
        ) : null}
      </ScrollView>

      {canContinue && (
        <View
          style={[
            styles.bottomFooter,
            {
              backgroundColor: colors.bg,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={handleContinue}
            activeOpacity={0.9}
          >
            <Text style={[styles.primaryBtnText, { fontFamily, fontSize: scaleFont(16) }]}>
              Next
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <MotherTonguePickerModal
        visible={dropdownVisible}
        selectedValue={motherTongue}
        onSelect={(val) => setMotherTongue(val)}
        onClose={() => setDropdownVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontWeight: '700' },
  content: { padding: 20, paddingBottom: 24, gap: 24 },
  welcomeHeader: {
    alignItems: 'center',
    paddingTop: 8,
    gap: 10,
  },
  emblemCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  welcomeTitle: {
    fontWeight: '700',
    textAlign: 'center',
  },
  welcomeDesc: {
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  centerBox: { paddingVertical: 36, alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, fontWeight: '600' },
  errorCard: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 8,
  },
  errorTitle: { fontSize: 16, fontWeight: '800', color: '#991B1B' },
  errorMsg: { fontSize: 14, color: '#7F1D1D' },
  reasonItem: { fontSize: 14, color: '#7F1D1D', lineHeight: 20 },
  inactiveCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: 10,
  },
  inactiveTitle: { fontSize: 17, fontWeight: '800', color: '#92400E' },
  inactiveReasonNote: { fontSize: 13.5, fontWeight: '700', color: '#B45309', lineHeight: 19 },
  inactiveMsg: { fontSize: 14, color: '#78350F', lineHeight: 20 },
  inactiveBtnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  inactiveRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ORANGE,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 12,
  },
  inactiveBackBtn: {
    borderWidth: 1,
    borderColor: '#D97706',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
  },
  inactiveBackText: { color: '#92400E', fontWeight: '700', fontSize: 13 },
  retryBtn: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: ORANGE,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  questionSection: { gap: 12 },
  questionTitle: { fontWeight: '800' },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  optionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.4,
  },
  optionPillText: { fontWeight: '700' },
  floatingBoxWrap: {
    position: 'relative',
    paddingTop: 8,
  },
  floatingLabel: {
    position: 'absolute',
    top: 0,
    left: 14,
    zIndex: 2,
    paddingHorizontal: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  dropdownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  dropdownBtnText: { fontWeight: '700', flex: 1 },
  dropdownIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clearIconBtn: {
    padding: 2,
  },
  bottomFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryBtn: {
    backgroundColor: ORANGE,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800' },
});
