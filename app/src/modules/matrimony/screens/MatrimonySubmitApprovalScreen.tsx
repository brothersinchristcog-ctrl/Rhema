import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CheckCircle2,
  ChevronLeft,
  Lock,
  Send,
  ShieldCheck,
  User,
} from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import { matrimonyApi } from '../services/matrimonyApi';
import { StartRegistrationResponse } from '../types/matrimony';

const ORANGE = '#EA580C';
const GREEN = '#15803D';

export default function MatrimonySubmitApprovalScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { member } = useAuth();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const initialData: StartRegistrationResponse | undefined = route?.params?.initialData;
  const passedInterestsCount: number | undefined = route?.params?.interestsCount;

  const [regData, setRegData] = useState<StartRegistrationResponse | null>(initialData || null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    matrimonyApi
      .startRegistration({ force: true })
      .then((res) => {
        if (active && res?.profile) {
          setRegData(res);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const profile = regData?.profile;
  const displayName =
    profile?.displayName ||
    regData?.contactInfo?.fullName ||
    member?.displayName ||
    member?.name ||
    'Rhema Member';
  const avatarUri = profile?.signedProfilePhoto || null;
  const cityState = [profile?.location?.village || profile?.location?.city, profile?.location?.state]
    .filter(Boolean)
    .join(', ');
  const interestsObj = profile?.interests || {};
  const computedInterestsCount = [
    interestsObj.hobbies,
    interestsObj.music,
    interestsObj.reading,
    interestsObj.movies,
    interestsObj.sports,
    interestsObj.food,
    interestsObj.languages,
  ].reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
  const interestsCount =
    computedInterestsCount > 0 ? computedInterestsCount : passedInterestsCount ?? 0;

  const handleSendForApproval = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await matrimonyApi.submitProfile();
      navigation.reset({
        index: 0,
        routes: [{ name: 'MatrimonyStatus' }],
      });
    } catch (err: any) {
      Alert.alert(
        'Submission Error',
        err?.message || 'Unable to submit your profile for admin approval. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.bg }]}
      edges={['top', 'bottom']}
    >
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.bg} />

      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (navigation.canGoBack()) navigation.goBack();
            else navigation.replace('MatrimonyInterests', { initialData: regData });
          }}
          style={[styles.backBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <ChevronLeft size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily, fontSize: scaleFont(18) }]}>
          Profile Verification
        </Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCenter}>
          <View
            style={[
              styles.iconHalo,
              { backgroundColor: isDark ? 'rgba(234, 88, 12, 0.2)' : '#FFF7ED' },
            ]}
          >
            <View style={styles.iconCircle}>
              <ShieldCheck size={34} color="#FFFFFF" />
            </View>
          </View>
          <Text style={[styles.title, { color: colors.text, fontFamily, fontSize: scaleFont(21) }]}>
            Ready for Admin Approval
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily }]}>
            Thank you for completing your Rhema Matrimony profile, photo, and interests. To keep our
            church matrimony community authentic, respectful, and safe, Church Administration
            reviews every profile before it becomes visible to matches.
          </Text>
        </View>

        <View style={[styles.profileCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} resizeMode="cover" />
          ) : (
            <View
              style={[
                styles.avatarPlaceholder,
                { backgroundColor: isDark ? '#1E293B' : '#F1F5F9' },
              ]}
            >
              <User size={28} color={colors.textSecondary} />
            </View>
          )}
          <View style={styles.profileTextCol}>
            <Text style={[styles.profileName, { color: colors.text, fontFamily }]} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={[styles.profileMeta, { color: colors.textSecondary, fontFamily }]} numberOfLines={1}>
              {[profile?.age ? `${profile.age} yrs` : null, profile?.gender, cityState]
                .filter(Boolean)
                .join(' • ') || 'Rhema Global Ministries Member'}
            </Text>
            <View style={styles.completionPill}>
              <Text style={[styles.completionText, { fontFamily }]}>
                {profile?.profileCompletion ?? 85}% Profile Complete
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.checklistCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.checklistTitle, { color: colors.text, fontFamily }]}>
            Completed Steps
          </Text>

          <View style={styles.checkRow}>
            <CheckCircle2 size={18} color={GREEN} />
            <Text style={[styles.checkLabel, { color: colors.text, fontFamily }]}>
              Personal, family, faith & privacy consent saved
            </Text>
          </View>

          <View style={styles.checkRow}>
            <CheckCircle2 size={18} color={GREEN} />
            <Text style={[styles.checkLabel, { color: colors.text, fontFamily }]}>
              Profile photo verified and uploaded
            </Text>
          </View>

          <View style={styles.checkRow}>
            <CheckCircle2 size={18} color={GREEN} />
            <Text style={[styles.checkLabel, { color: colors.text, fontFamily }]}>
              {interestsCount > 0
                ? `Hobbies & interests added (${interestsCount} selected)`
                : 'Hobbies & interests step completed'}
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.privacyBox,
            {
              backgroundColor: isDark ? 'rgba(21, 128, 61, 0.14)' : '#F0FDF4',
              borderColor: isDark ? 'rgba(21, 128, 61, 0.35)' : '#BBF7D0',
            },
          ]}
        >
          <Lock size={16} color={GREEN} />
          <Text
            style={[
              styles.privacyText,
              { color: isDark ? '#BBF7D0' : '#166534', fontFamily },
            ]}
          >
            Your mobile number, email address, and exact date of birth stay private. Only Church
            Administration can verify your details before activating your profile.
          </Text>
        </View>
      </ScrollView>

      <View
        style={[
          styles.bottomFooter,
          {
            backgroundColor: colors.bg,
            borderTopColor: colors.border,
            paddingBottom: Platform.OS === 'android' && insets.bottom === 0 ? 56 : 16,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.primaryBtn, submitting && { opacity: 0.75 }]}
          onPress={handleSendForApproval}
          disabled={submitting}
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Send size={17} color="#FFFFFF" />
              <Text style={[styles.primaryBtnText, { fontFamily, fontSize: scaleFont(15) }]}>
                Send for Admin Approval
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
  content: { padding: 18, paddingBottom: 28, gap: 16 },
  heroCenter: {
    alignItems: 'center',
    gap: 10,
    paddingTop: 4,
  },
  iconHalo: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: ORANGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
  },
  avatarPlaceholder: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileTextCol: {
    flex: 1,
    gap: 4,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '800',
  },
  profileMeta: {
    fontSize: 13,
    fontWeight: '500',
  },
  completionPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(234, 88, 12, 0.12)',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 3,
    marginTop: 2,
  },
  completionText: {
    color: ORANGE,
    fontSize: 11.5,
    fontWeight: '700',
  },
  checklistCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  checklistTitle: {
    fontSize: 14.5,
    fontWeight: '800',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkLabel: {
    flex: 1,
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 19,
  },
  privacyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 13,
  },
  privacyText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '600',
  },
  bottomFooter: {
    paddingHorizontal: 18,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ORANGE,
    borderRadius: 24,
    paddingVertical: 14,
    shadowColor: ORANGE,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
