import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, User, Mail, Phone } from 'lucide-react-native';
import { useAuth } from '../../../context/AuthContext';
import { useTheme, FONT_STYLE_OPTIONS } from '../../../context/ThemeContext';
import MatrimonyProgressBar from '../components/MatrimonyProgressBar';
import { MatrimonyPendingRegistrationDraft, StartRegistrationResponse } from '../types/matrimony';

const ORANGE = '#EA580C';

export default function MatrimonyBasicDetailsScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { member, user } = useAuth();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const initialData: StartRegistrationResponse | undefined = route?.params?.initialData;

  const [fullName, setFullName] = useState(
    initialData?.contactInfo?.fullName ||
      initialData?.profile?.displayName ||
      member?.name ||
      ''
  );
  const [email, setEmail] = useState(
    initialData?.contactInfo?.email || member?.email || user?.email || ''
  );
  const [phone, setPhone] = useState(
    initialData?.contactInfo?.phone || member?.phone || user?.phoneNumber || ''
  );

  const handleNext = () => {
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      Alert.alert('Name Required', 'Please enter your full name.');
      return;
    }

    const existingDraft: MatrimonyPendingRegistrationDraft = route?.params?.draftData || {};
    const draftData: MatrimonyPendingRegistrationDraft = {
      ...existingDraft,
      basic: {
        fullName: trimmedName,
        email: trimmedEmail,
        phone: trimmedPhone,
      },
    };

    navigation.navigate('MatrimonyPersonalDetails', {
      draftData,
      initialData: initialData
        ? {
            ...initialData,
            contactInfo: {
              fullName: trimmedName,
              email: trimmedEmail,
              phone: trimmedPhone,
            },
            profile: initialData.profile
              ? { ...initialData.profile, displayName: trimmedName }
              : initialData.profile,
          }
        : initialData,
    });
  };

  const inputWrapStyle = [
    styles.inputWrap,
    {
      backgroundColor: isDark ? '#1E293B' : '#F8FAFC',
      borderColor: colors.border,
    },
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <StatusBar barStyle={colors.barStyle} backgroundColor={colors.bg} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text, fontFamily, fontSize: scaleFont(18) }]}>
          Basic Details
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {/* R-H-E-M-A Progress Bar */}
      <MatrimonyProgressBar currentStep={1} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text, fontFamily, fontSize: scaleFont(18) }]}>
            Your Basic Details
          </Text>
          <Text style={[styles.cardSub, { color: colors.textSecondary, fontFamily }]}>
            Pre-filled from your Rhema Global Ministries profile. Phone and email remain private by default.
          </Text>

          <Text style={[styles.label, { color: colors.text, fontFamily }]}>Full Name *</Text>
          <View style={inputWrapStyle}>
            <User size={18} color={ORANGE} />
            <TextInput
              style={[styles.input, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}
              placeholder="Enter your full name"
              placeholderTextColor={colors.textSecondary}
              value={fullName}
              onChangeText={setFullName}
            />
          </View>

          <Text style={[styles.label, { color: colors.text, fontFamily }]}>Email Address</Text>
          <View style={inputWrapStyle}>
            <Mail size={18} color={ORANGE} />
            <TextInput
              style={[styles.input, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}
              placeholder="Enter your email address"
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <Text style={[styles.label, { color: colors.text, fontFamily }]}>Phone Number</Text>
          <View style={inputWrapStyle}>
            <Phone size={18} color={ORANGE} />
            <TextInput
              style={[styles.input, { color: colors.text, fontFamily, fontSize: scaleFont(15) }]}
              placeholder="Enter your phone number"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
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
          style={styles.primaryBtn}
          onPress={handleNext}
          activeOpacity={0.9}
        >
          <Text style={[styles.primaryBtnText, { fontFamily, fontSize: scaleFont(16) }]}>
            Next
          </Text>
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
  progressBarBg: { height: 4, marginHorizontal: 16, borderRadius: 2 },
  progressBarFill: { height: 4, backgroundColor: ORANGE, borderRadius: 2 },
  content: { padding: 16, paddingBottom: 24, gap: 18 },
  card: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    gap: 10,
  },
  cardTitle: { fontWeight: '800' },
  cardSub: { fontSize: 13, lineHeight: 19, marginBottom: 4 },
  label: { fontSize: 13, fontWeight: '700', marginTop: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
  },
  bottomFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
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
