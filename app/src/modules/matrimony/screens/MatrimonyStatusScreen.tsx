import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Image,
  StatusBar,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Edit3,
  PauseCircle,
  RefreshCw,
} from 'lucide-react-native';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import { matrimonyApi, isMatrimonyInactiveError } from '../services/matrimonyApi';
import { MatrimonyStatusResponse } from '../types/matrimony';

const ORANGE = '#EA580C';

export default function MatrimonyStatusScreen({ navigation }: any) {
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const [loading, setLoading] = useState(true);
  const [statusData, setStatusData] = useState<MatrimonyStatusResponse | null>(null);

  const handleBackToApp = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    const parentNav = navigation.getParent();
    if (parentNav) {
      parentNav.goBack();
    }
  }, [navigation]);

  const loadStatus = useCallback(async (force = true) => {
    setLoading(true);
    try {
      const res = await matrimonyApi.getStatus({ force });
      if (res?.profileStatus === 'not_started' || res?.profileStatus === 'deleted') {
        navigation.replace('MatrimonyWelcome');
        return;
      }
      setStatusData(res);
    } catch (err: any) {
      if (isMatrimonyInactiveError(err)) {
        const regRes = await matrimonyApi.startRegistration({ force: true }).catch(() => null);
        if (regRes && !regRes.eligible) {
          navigation.replace('MatrimonyWelcome', { preloadedData: regRes });
          return;
        }
      }
      console.warn('getMatrimonyStatus error:', err);
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useEffect(() => {
    loadStatus(true);
    const unsubFocus = navigation.addListener('focus', () => loadStatus(true));
    const uid = auth().currentUser?.uid;
    const unsubDoc = uid
      ? firestore()
          .collection('matrimony_profiles')
          .doc(uid)
          .onSnapshot(
            (snap) => {
              if (!snap.exists) {
                navigation.replace('MatrimonyWelcome');
                return;
              }
              const docData = snap.data() || {};
              const liveStatus = String(docData.profileStatus || '');
              if (liveStatus === 'deleted' || liveStatus === 'not_started') {
                navigation.replace('MatrimonyWelcome');
                return;
              }
              if (liveStatus === 'approved') {
                navigation.replace('MatrimonyHome');
                return;
              }
              setStatusData((prev) =>
                prev
                  ? {
                      ...prev,
                      profileStatus: (liveStatus || prev.profileStatus) as any,
                      visibility: docData.visibility || prev.visibility,
                      inactiveReason: docData.inactiveReason ?? prev.inactiveReason,
                      rejectionReason: docData.rejectionReason ?? prev.rejectionReason,
                      profile: prev.profile
                        ? {
                            ...prev.profile,
                            profileStatus: (liveStatus || prev.profile.profileStatus) as any,
                            visibility: docData.visibility || prev.profile.visibility,
                            inactiveReason: docData.inactiveReason ?? prev.profile.inactiveReason,
                          }
                        : prev.profile,
                    }
                  : prev
              );
            },
            () => {}
          )
      : undefined;

    return () => {
      unsubFocus();
      unsubDoc?.();
    };
  }, [loadStatus, navigation]);

  const status = statusData?.profileStatus || 'pending';
  const isInactive = status === 'inactive' || status === 'suspended';
  const isDeleted = status === 'deleted';
  const inactiveReason =
    statusData?.inactiveReason || statusData?.profile?.inactiveReason || null;
  const deletionReason = statusData?.profile?.deletionReason || null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.bg} />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBackToApp}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily, fontSize: scaleFont(18) }]}>
          Matrimony Status
        </Text>
        <TouchableOpacity
          onPress={() => loadStatus(true)}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <RefreshCw size={18} color={colors.text} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={ORANGE} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {status === 'approved' ? (
              <CheckCircle2 size={44} color="#15803D" />
            ) : isInactive ? (
              <PauseCircle size={44} color="#D97706" />
            ) : isDeleted || status === 'rejected' ? (
              <XCircle size={44} color="#B91C1C" />
            ) : (
              <Clock size={44} color={ORANGE} />
            )}

            <Text style={[styles.statusTitle, { color: colors.text, fontFamily, fontSize: scaleFont(20) }]}>
              {status === 'approved'
                ? 'Profile Verified & Active'
                : isInactive
                ? 'Profile Currently Inactive'
                : isDeleted
                ? 'Profile Deleted'
                : status === 'rejected'
                ? 'Profile Not Approved'
                : 'Pending Admin Verification'}
            </Text>

            <Text style={[styles.statusDesc, { color: colors.textSecondary, fontFamily }]}>
              {status === 'approved'
                ? 'Your Rhema Matrimony profile has been verified by Church Admin and is now active.'
                : isInactive
                ? 'Your Rhema Matrimony profile is currently inactive and hidden from matches. Once Church Administration activates your profile, you can continue using Rhema Matrimony.'
                : isDeleted
                ? deletionReason
                  ? `You deleted your Rhema Matrimony profile.\nReason: ${deletionReason}`
                  : 'You have deleted your Rhema Matrimony profile.'
                : status === 'rejected'
                ? statusData?.rejectionReason || 'Please contact church administration for details.'
                : 'All your profile details, photo, and interests have been submitted and sent to Church Admin for verification.'}
            </Text>

            {isInactive && inactiveReason ? (
              <View
                style={[
                  styles.inactiveReasonBox,
                  {
                    backgroundColor: isDark ? 'rgba(217, 119, 6, 0.14)' : '#FFFBEB',
                    borderColor: isDark ? 'rgba(217, 119, 6, 0.35)' : '#FDE68A',
                  },
                ]}
              >
                <Text
                  style={[
                    styles.inactiveReasonLabel,
                    { color: isDark ? '#FBBF24' : '#92400E', fontFamily },
                  ]}
                >
                  Admin Note
                </Text>
                <Text
                  style={[
                    styles.inactiveReasonText,
                    { color: isDark ? '#FDE68A' : '#78350F', fontFamily },
                  ]}
                >
                  {inactiveReason}
                </Text>
              </View>
            ) : null}

            {statusData?.signedProfilePhoto && (
              <Image source={{ uri: statusData.signedProfilePhoto }} style={styles.previewImg} />
            )}

            <View style={[styles.metaRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.metaLabel, { color: colors.textSecondary, fontFamily }]}>Status</Text>
              <Text style={[styles.metaValue, { color: colors.text, fontFamily }]}>
                {isInactive ? 'Inactive' : status.replace(/_/g, ' ')}
              </Text>
            </View>
            <View style={[styles.metaRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.metaLabel, { color: colors.textSecondary, fontFamily }]}>Completion</Text>
              <Text style={[styles.metaValue, { color: colors.text, fontFamily }]}>
                {statusData?.profileCompletion ?? 0}%
              </Text>
            </View>
            <View style={[styles.metaRow, { borderTopColor: colors.border }]}>
              <Text style={[styles.metaLabel, { color: colors.textSecondary, fontFamily }]}>Visibility</Text>
              <Text style={[styles.metaValue, { color: colors.text, fontFamily }]}>
                {statusData?.visibility || 'hidden'}
              </Text>
            </View>
          </View>

          {status === 'approved' ? (
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.replace('MatrimonyHome')}
            >
              <Text style={[styles.primaryBtnText, { fontFamily, fontSize: scaleFont(15) }]}>
                Open Rhema Matrimony
              </Text>
            </TouchableOpacity>
          ) : isDeleted ? (
            <TouchableOpacity
              style={[
                styles.secondaryBtn,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
              onPress={handleBackToApp}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
                Back to Rhema App
              </Text>
            </TouchableOpacity>
          ) : isInactive ? (
            <View style={styles.inactiveActionsCol}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => loadStatus(true)}
              >
                <RefreshCw size={18} color="#FFFFFF" />
                <Text style={[styles.primaryBtnText, { fontFamily, fontSize: scaleFont(15) }]}>
                  Check Status
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={handleBackToApp}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
                  Back to Rhema App
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.inactiveActionsCol}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => navigation.navigate('MatrimonyEditProfile')}
              >
                <Edit3 size={18} color="#FFFFFF" />
                <Text style={[styles.primaryBtnText, { fontFamily, fontSize: scaleFont(15) }]}>
                  Review / Edit Submitted Details
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.secondaryBtn,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
                onPress={handleBackToApp}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}>
                  Back to Rhema App
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}
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
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontWeight: '800' },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 16 },
  card: {
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    gap: 10,
  },
  statusTitle: { fontWeight: '800', marginTop: 4 },
  statusDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  previewImg: { width: 88, height: 88, borderRadius: 44, marginTop: 8 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metaLabel: { fontSize: 13, fontWeight: '600' },
  metaValue: { fontSize: 13, fontWeight: '800', textTransform: 'capitalize' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ORANGE,
    borderRadius: 26,
    paddingVertical: 14,
  },
  primaryBtnText: { color: '#FFFFFF', fontWeight: '800' },
  inactiveReasonBox: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
    marginTop: 4,
  },
  inactiveReasonLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  inactiveReasonText: { fontSize: 13.5, lineHeight: 19, fontWeight: '600' },
  inactiveActionsCol: { gap: 10 },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 14,
  },
  secondaryBtnText: { fontWeight: '700' },
});
