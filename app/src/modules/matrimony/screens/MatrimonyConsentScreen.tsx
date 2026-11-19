import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  StatusBar,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import MatrimonyProgressBar from '../components/MatrimonyProgressBar';
import { matrimonyApi } from '../services/matrimonyApi';
import { MatrimonyPendingRegistrationDraft, StartRegistrationResponse } from '../types/matrimony';

const ORANGE = '#EA580C';

export default function MatrimonyConsentScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { colors, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const initialData: StartRegistrationResponse | undefined = route?.params?.initialData;
  const draftData: MatrimonyPendingRegistrationDraft = route?.params?.draftData || {};

  const [profilePublication, setProfilePublication] = useState(
    Boolean(initialData?.consent?.profilePublication ?? true)
  );
  const [matchmaking, setMatchmaking] = useState(
    Boolean(initialData?.consent?.matchmaking ?? true)
  );
  const [communication, setCommunication] = useState(
    Boolean(initialData?.consent?.communication ?? true)
  );
  const [saving, setSaving] = useState(false);

  const handleComplete = async () => {
    if (saving) return;
    if (!profilePublication || !matchmaking || !communication) {
      Alert.alert(
        'Consent Required',
        'Please accept all three Privacy & Consent options to complete your profile.'
      );
      return;
    }

    setSaving(true);
    try {
      await matrimonyApi.completeRegistration({
        ...draftData,
        consent: {
          profilePublication,
          matchmaking,
          communication,
          managedBy: 'self',
        },
      });

      const updatedInitialData: StartRegistrationResponse | undefined = initialData
        ? {
            ...initialData,
            registered: true,
            profile: initialData.profile
              ? {
                  ...initialData.profile,
                  profileStatus: 'draft',
                  onboardingStage: 'photos_pending',
                }
              : initialData.profile,
            consent: {
              profilePublication,
              matchmaking,
              communication,
              consentVersion: '1.0',
            },
          }
        : initialData;

      navigation.navigate('MatrimonyProfileSuccess', { initialData: updatedInitialData });
    } catch (err: any) {
      Alert.alert(
        'Unable to Create Profile',
        err?.message || 'Could not save your Matrimony profile. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.bg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily, fontSize: scaleFont(18) }]}>
          Privacy & Consent
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <MatrimonyProgressBar currentStep={5} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontFamily, fontSize: scaleFont(18) }]}>
            Privacy & Consent
          </Text>
          <Text style={[styles.cardSub, { color: colors.textSecondary, fontFamily }]}>
            Your existing Rhema profile (name, age, gender, city, baptism status) is reused automatically. Phone, email, and exact DOB stay private.
          </Text>

          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: colors.text, fontFamily }]}>
              Publish my approved Matrimony profile to eligible Rhema members
            </Text>
            <Switch
              value={profilePublication}
              onValueChange={setProfilePublication}
              trackColor={{ false: '#CBD5E1', true: '#FDBA74' }}
              thumbColor={profilePublication ? ORANGE : '#F8FAFC'}
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: colors.text, fontFamily }]}>
              Use my preferences for reciprocal compatibility matching
            </Text>
            <Switch
              value={matchmaking}
              onValueChange={setMatchmaking}
              trackColor={{ false: '#CBD5E1', true: '#FDBA74' }}
              thumbColor={matchmaking ? ORANGE : '#F8FAFC'}
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={[styles.switchLabel, { color: colors.text, fontFamily }]}>
              Allow interest requests and match chat after mutual acceptance
            </Text>
            <Switch
              value={communication}
              onValueChange={setCommunication}
              trackColor={{ false: '#CBD5E1', true: '#FDBA74' }}
              thumbColor={communication ? ORANGE : '#F8FAFC'}
            />
          </View>
        </View>
      </ScrollView>

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
          style={[styles.primaryBtn, saving && { opacity: 0.75 }]}
          onPress={handleComplete}
          disabled={saving}
          activeOpacity={0.9}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={[styles.primaryBtnText, { fontFamily, fontSize: scaleFont(15) }]}>
              Complete Profile
            </Text>
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
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontWeight: '800' },
  content: { padding: 16, paddingBottom: 28 },
  card: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    gap: 12,
  },
  cardTitle: { fontWeight: '800' },
  cardSub: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
  },
  switchLabel: { flex: 1, fontSize: 13.5, fontWeight: '600', lineHeight: 19 },
  bottomFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryBtn: {
    backgroundColor: ORANGE,
    borderRadius: 22,
    paddingVertical: 12,
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
