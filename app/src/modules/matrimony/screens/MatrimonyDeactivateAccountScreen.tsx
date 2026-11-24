import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import MatrimonyGradientHeader from '../components/MatrimonyGradientHeader';
import { isMatrimonyInactiveError, matrimonyApi } from '../services/matrimonyApi';

const CORAL_RED = '#E04B5A';

export default function MatrimonyDeactivateAccountScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const [isDeactivated, setIsDeactivated] = useState<boolean>(() =>
    Boolean(matrimonyApi.getCachedRegistration()?.profile?.selfDeactivated)
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    matrimonyApi
      .startRegistration({ force: true })
      .then((res) => {
        if (res.profile) {
          setIsDeactivated(Boolean(res.profile.selfDeactivated));
        }
      })
      .catch(() => undefined);
  }, []);

  const handleToggleDeactivate = () => {
    const nextActive = isDeactivated;
    Alert.alert(
      nextActive ? 'Reactivate Profile' : 'Deactivate Profile',
      nextActive
        ? 'Your profile will become visible to matching members again and you can contact them.'
        : 'Other members will not be able to view or contact your profile while deactivated.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: nextActive ? 'Reactivate' : 'Deactivate',
          style: nextActive ? 'default' : 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const res = await matrimonyApi.deactivateMyAccount(nextActive);
              setIsDeactivated(res.selfDeactivated);
              Alert.alert(
                res.selfDeactivated ? 'Profile Deactivated' : 'Profile Reactivated',
                res.selfDeactivated
                  ? 'Your profile is now hidden. You can reactivate it anytime from Account settings.'
                  : 'Your profile is visible again.'
              );
            } catch (err: any) {
              if (isMatrimonyInactiveError(err)) {
                navigation.reset({ index: 0, routes: [{ name: 'MatrimonyStatus' }] });
                return;
              }
              Alert.alert('Update Failed', err?.message || 'Unable to update account status.');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const pageBg = isDark ? colors.bg : '#FFFFFF';

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      <MatrimonyGradientHeader
        title="Deactivate/Hide Account"
        onBack={() => navigation.goBack()}
      />

      <View
        style={[
          styles.body,
          { paddingBottom: Math.max(insets.bottom + 24, 34) },
        ]}
      >
        <View>
          <Text
            style={[
              styles.description,
              { color: colors.text, fontFamily, fontSize: scaleFont(15.5) },
            ]}
          >
            Want to take a small break from matchmaking? Deactivate your profile. You can view
            other profiles but cannot contact them while other members cannot view or contact you.
          </Text>

          {isDeactivated ? (
            <View
              style={[
                styles.statusNotice,
                {
                  backgroundColor: isDark ? 'rgba(217, 119, 6, 0.16)' : '#FFFBEB',
                  borderColor: isDark ? 'rgba(217, 119, 6, 0.4)' : '#FDE68A',
                },
              ]}
            >
              <Text
                style={[
                  styles.statusNoticeText,
                  { color: isDark ? '#FDE68A' : '#92400E', fontFamily },
                ]}
              >
                Your profile is currently deactivated and hidden from other members.
              </Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={[
            styles.ctaBtn,
            { backgroundColor: isDeactivated ? '#16A34A' : CORAL_RED },
            busy && { opacity: 0.72 },
          ]}
          activeOpacity={0.88}
          disabled={busy}
          onPress={handleToggleDeactivate}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={[styles.ctaBtnText, { fontFamily, fontSize: scaleFont(15.5) }]}>
              {isDeactivated ? 'Reactivate Profile' : 'Deactivate Profile'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 22,
  },
  description: {
    lineHeight: 24,
    fontWeight: '400',
  },
  statusNotice: {
    marginTop: 18,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  statusNoticeText: {
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 20,
  },
  ctaBtn: {
    alignSelf: 'center',
    minWidth: 200,
    paddingHorizontal: 28,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  ctaBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
