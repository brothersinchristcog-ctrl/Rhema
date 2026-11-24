import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import MatrimonyGradientHeader from '../components/MatrimonyGradientHeader';
import { isMatrimonyInactiveError, matrimonyApi } from '../services/matrimonyApi';
import { MatrimonyNotificationPreferences } from '../types/matrimony';

const CORAL_RED = '#E04B5A';
const CORAL_TRACK = '#F5B5BC';

const DEFAULT_PREFS: MatrimonyNotificationPreferences = {
  request: true,
  shortlist: true,
  profileViews: true,
  interestAcceptance: true,
  recentlyJoined: true,
  dailyMatches: true,
  cityMatches: true,
  photoMatches: true,
  similarMatches: true,
  newMatches: true,
  dailyRecommendations: true,
  basedOnActivity: true,
  membershipOffers: true,
};

type PrefKey = keyof MatrimonyNotificationPreferences;

const MEMBER_ACTIVITY_ITEMS: { key: PrefKey; title: string; subtitle: string }[] = [
  {
    key: 'request',
    title: 'Request',
    subtitle: 'Receive notifications when members request details about your profile',
  },
  {
    key: 'shortlist',
    title: 'Shortlist',
    subtitle: 'Receive notifications when members who match your preferences shortlist you',
  },
  {
    key: 'profileViews',
    title: 'Profile Views',
    subtitle: 'Get instant notifications when members who match your preferences view your profile',
  },
  {
    key: 'interestAcceptance',
    title: 'Interest Acceptance',
    subtitle: 'Get instant notifications when members accept your interest',
  },
];

const MATCHES_ITEMS: { key: PrefKey; title: string; subtitle: string }[] = [
  {
    key: 'recentlyJoined',
    title: 'Recently Joined',
    subtitle: 'Get matches who recently joined and match your preferences',
  },
  {
    key: 'dailyMatches',
    title: 'Daily Matches',
    subtitle: 'Get recommended profiles everyday',
  },
  {
    key: 'cityMatches',
    title: 'City Matches',
    subtitle: 'Get weekly update on matches living in your city',
  },
  {
    key: 'photoMatches',
    title: 'Photo Matches',
    subtitle: 'Get weekly update on matches who recently added photo',
  },
  {
    key: 'similarMatches',
    title: 'Similar Matches',
    subtitle: 'Get match recommendations based on the members you have contacted recently',
  },
  {
    key: 'newMatches',
    title: 'New Matches',
    subtitle: 'Everyday',
  },
  {
    key: 'dailyRecommendations',
    title: 'Daily Recommendations',
    subtitle: 'Everyday',
  },
  {
    key: 'basedOnActivity',
    title: 'Based on your activity',
    subtitle: 'Get notified about profiles similar to the ones you like',
  },
];

const PREMIUM_ITEMS: { key: PrefKey; title: string; subtitle: string }[] = [
  {
    key: 'membershipOffers',
    title: 'Membership Offers',
    subtitle: 'Packages, Discounts, etc',
  },
];

export default function MatrimonyNotificationsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const [prefs, setPrefs] = useState<MatrimonyNotificationPreferences>(() => {
    const cached = matrimonyApi.getCachedRegistration()?.profile?.notificationPreferences;
    return { ...DEFAULT_PREFS, ...(cached || {}) };
  });
  const [loading, setLoading] = useState(false);

  const loadPrefs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await matrimonyApi.startRegistration({ force: true });
      if (res.profile?.notificationPreferences) {
        setPrefs({ ...DEFAULT_PREFS, ...res.profile.notificationPreferences });
      }
    } catch (err: any) {
      if (isMatrimonyInactiveError(err)) {
        navigation.reset({ index: 0, routes: [{ name: 'MatrimonyStatus' }] });
      }
    } finally {
      setLoading(false);
    }
  }, [navigation]);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  const handleToggle = async (key: PrefKey, nextVal: boolean) => {
    const prev = prefs;
    const updated = { ...prefs, [key]: nextVal };
    setPrefs(updated);
    try {
      await matrimonyApi.saveNotificationPreferences({ [key]: nextVal });
    } catch (err: any) {
      setPrefs(prev);
      Alert.alert('Save Failed', err?.message || 'Unable to update notification preference.');
    }
  };

  const pageBg = isDark ? colors.bg : '#FFFFFF';
  const dividerColor = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';

  const renderToggleSection = (
    heading: string,
    description: string,
    items: { key: PrefKey; title: string; subtitle: string }[]
  ) => (
    <View style={styles.sectionWrap}>
      <Text
        style={[
          styles.sectionTitle,
          { color: colors.text, fontFamily, fontSize: scaleFont(17) },
        ]}
      >
        {heading}
      </Text>
      <Text
        style={[
          styles.sectionDesc,
          { color: colors.textSecondary, fontFamily, fontSize: scaleFont(13.5) },
        ]}
      >
        {description}
      </Text>

      <View style={styles.itemsList}>
        {items.map((item, idx) => {
          const value = Boolean(prefs[item.key]);
          return (
            <View
              key={item.key}
              style={[
                styles.toggleRow,
                idx < items.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: dividerColor,
                },
              ]}
            >
              <View style={styles.toggleTextCol}>
                <Text
                  style={[
                    styles.itemTitle,
                    { color: colors.text, fontFamily, fontSize: scaleFont(15.5) },
                  ]}
                >
                  {item.title}
                </Text>
                <Text
                  style={[
                    styles.itemSub,
                    { color: colors.textSecondary, fontFamily, fontSize: scaleFont(13) },
                  ]}
                >
                  {item.subtitle}
                </Text>
              </View>
              <Switch
                value={value}
                onValueChange={(val) => handleToggle(item.key, val)}
                trackColor={{
                  false: isDark ? '#334155' : '#CBD5E1',
                  true: isDark ? 'rgba(224,75,90,0.48)' : CORAL_TRACK,
                }}
                thumbColor={value ? CORAL_RED : isDark ? '#94A3B8' : '#F8FAFC'}
              />
            </View>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      <MatrimonyGradientHeader title="Notifications" onBack={() => navigation.goBack()} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingTop: 18,
          paddingBottom: Math.max(insets.bottom + 28, 36),
        }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={CORAL_RED} />
          </View>
        ) : null}

        {renderToggleSection(
          'Member Activity',
          "If you turn these off, you won't be notified about the activity of other members on your profile.",
          MEMBER_ACTIVITY_ITEMS
        )}

        <View style={[styles.groupDivider, { backgroundColor: dividerColor }]} />

        <Text style={[styles.moreAlertsLabel, { color: colors.textSecondary, fontFamily }]}>
          More Alerts
        </Text>

        {renderToggleSection(
          'Matches',
          'If you turn these off you will miss out on our recommendations based on your preferences.',
          MATCHES_ITEMS
        )}

        <View style={[styles.groupDivider, { backgroundColor: dividerColor }]} />

        {renderToggleSection(
          'Premium',
          'If you turn these off, you might miss out on offers & promotions',
          PREMIUM_ITEMS
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingWrap: {
    paddingBottom: 10,
    alignItems: 'center',
  },
  sectionWrap: {
    paddingTop: 4,
  },
  sectionTitle: {
    fontWeight: '800',
    marginBottom: 6,
  },
  sectionDesc: {
    lineHeight: 20,
    marginBottom: 10,
  },
  itemsList: {
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    gap: 14,
  },
  toggleTextCol: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    fontWeight: '700',
  },
  itemSub: {
    lineHeight: 19,
  },
  groupDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 14,
  },
  moreAlertsLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    marginBottom: 12,
  },
});
