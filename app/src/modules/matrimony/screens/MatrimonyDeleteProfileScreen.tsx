import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import MatrimonyGradientHeader from '../components/MatrimonyGradientHeader';
import { isMatrimonyInactiveError, matrimonyApi } from '../services/matrimonyApi';

const CORAL_RED = '#E04B5A';

const DELETE_REASONS = [
  'Already married',
  'Getting married soon',
  'Other reason',
] as const;

type DeleteReason = (typeof DELETE_REASONS)[number];

export default function MatrimonyDeleteProfileScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const [selectedReason, setSelectedReason] = useState<DeleteReason>('Already married');
  const [otherDetails, setOtherDetails] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleContinue = () => {
    if (deleting) return;
    if (selectedReason === 'Other reason' && !otherDetails.trim()) {
      Alert.alert('Reason Required', 'Please share a brief reason before continuing.');
      return;
    }

    Alert.alert(
      'Delete Profile',
      `Are you sure you want to delete your Rhema Matrimony profile?\n\nReason: ${
        selectedReason === 'Other reason' ? otherDetails.trim() : selectedReason
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Profile',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await matrimonyApi.deleteMyAccount(
                selectedReason,
                selectedReason === 'Other reason' ? otherDetails.trim() : undefined
              );
              Alert.alert(
                'Profile Deleted',
                'Your Rhema Matrimony profile has been deleted from Firebase. If this was a mistake, you can create a new profile anytime.',
                [
                  {
                    text: 'Back to App',
                    style: 'cancel',
                    onPress: () => {
                      const parentNav = navigation.getParent();
                      if (parentNav?.canGoBack?.()) {
                        parentNav.goBack();
                      } else {
                        navigation.reset({ index: 0, routes: [{ name: 'MatrimonyWelcome' }] });
                      }
                    },
                  },
                  {
                    text: 'Create New Profile',
                    onPress: () => {
                      navigation.reset({ index: 0, routes: [{ name: 'MatrimonyWelcome' }] });
                    },
                  },
                ]
              );
            } catch (err: any) {
              if (isMatrimonyInactiveError(err)) {
                navigation.reset({ index: 0, routes: [{ name: 'MatrimonyStatus' }] });
                return;
              }
              Alert.alert('Delete Failed', err?.message || 'Unable to delete your profile right now.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const pageBg = isDark ? colors.bg : '#FFFFFF';
  const dividerColor = isDark ? 'rgba(255,255,255,0.12)' : '#E5E7EB';

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      <MatrimonyGradientHeader title="Delete Profile" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 22,
            paddingTop: 22,
            paddingBottom: Math.max(insets.bottom + 28, 36),
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            style={[
              styles.heading,
              { color: colors.text, fontFamily, fontSize: scaleFont(16.5) },
            ]}
          >
            Reason for deleting your profile
          </Text>

          <View style={styles.reasonsList}>
            {DELETE_REASONS.map((reason) => {
              const selected = selectedReason === reason;
              return (
                <TouchableOpacity
                  key={reason}
                  style={styles.radioRow}
                  activeOpacity={0.75}
                  onPress={() => setSelectedReason(reason)}
                >
                  <View
                    style={[
                      styles.radioOuter,
                      {
                        borderColor: selected
                          ? CORAL_RED
                          : isDark
                          ? '#64748B'
                          : '#71717A',
                      },
                    ]}
                  >
                    {selected ? <View style={styles.radioInner} /> : null}
                  </View>
                  <Text
                    style={[
                      styles.radioLabel,
                      { color: colors.text, fontFamily, fontSize: scaleFont(15.5) },
                    ]}
                  >
                    {reason}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedReason === 'Other reason' ? (
            <TextInput
              value={otherDetails}
              onChangeText={setOtherDetails}
              placeholder="Please enter your reason..."
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={300}
              style={[
                styles.reasonInput,
                {
                  color: colors.text,
                  borderColor: dividerColor,
                  backgroundColor: isDark ? colors.surface : '#F8FAFC',
                  fontFamily,
                },
              ]}
            />
          ) : null}

          <TouchableOpacity
            style={[styles.continueBtn, deleting && { opacity: 0.72 }]}
            activeOpacity={0.88}
            disabled={deleting}
            onPress={handleContinue}
          >
            {deleting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={[styles.continueBtnText, { fontFamily, fontSize: scaleFont(15.5) }]}>
                Continue
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: {
    fontWeight: '800',
    marginBottom: 18,
  },
  reasonsList: {
    gap: 18,
    marginBottom: 22,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
  radioLabel: {
    fontWeight: '400',
  },
  reasonInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 88,
    textAlignVertical: 'top',
    fontSize: 14.5,
    marginBottom: 22,
  },
  continueBtn: {
    marginTop: 10,
    backgroundColor: CORAL_RED,
    borderRadius: 24,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: CORAL_RED,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
