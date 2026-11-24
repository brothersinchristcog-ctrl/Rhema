import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, RotateCcw, User } from 'lucide-react-native';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import MatrimonyGradientHeader from '../components/MatrimonyGradientHeader';
import { isMatrimonyInactiveError, matrimonyApi } from '../services/matrimonyApi';
import { MatrimonyHiddenProfileItem } from '../types/matrimony';

const CORAL_RED = '#E04B5A';

function formatCompactHeight(cm?: number | null): string | null {
  if (!cm || cm <= 0) return null;
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${feet}'${inches}"`;
}

export default function MatrimonyHiddenProfilesScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const mode: 'ignored' | 'blocked' =
    route?.params?.mode === 'blocked' ? 'blocked' : 'ignored';
  const apiType = mode === 'blocked' ? 'blocked' : 'dont_show';
  const title = mode === 'blocked' ? 'Blocked Profiles' : 'Ignored Profiles';
  const emptyText =
    mode === 'blocked'
      ? 'You have not blocked any profiles yet'
      : 'You have not ignored any profiles yet';
  const restoreLabel = mode === 'blocked' ? 'Unblock' : 'Restore';

  const [profiles, setProfiles] = useState<MatrimonyHiddenProfileItem[]>(
    () => matrimonyApi.getCachedHiddenProfiles(apiType) || []
  );
  const [loading, setLoading] = useState(
    () => !matrimonyApi.getCachedHiddenProfiles(apiType)
  );
  const [refreshing, setRefreshing] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const loadProfiles = useCallback(
    async (silent = false, force = false) => {
      await matrimonyApi.hydrateCacheFromStorage().catch(() => undefined);
      const cached = !force ? matrimonyApi.getCachedHiddenProfiles(apiType) : null;
      if (cached) {
        setProfiles(cached);
        setLoading(false);
      } else if (!silent) {
        setLoading(true);
      }
      try {
        const res = await matrimonyApi.getHiddenProfiles(apiType, { force });
        setProfiles(res.profiles || []);
      } catch (err: any) {
        if (isMatrimonyInactiveError(err)) {
          navigation.reset({ index: 0, routes: [{ name: 'MatrimonyStatus' }] });
          return;
        }
        if (!cached) {
          Alert.alert('Unable to Load', err?.message || `Could not load ${title.toLowerCase()}.`);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [apiType, navigation, title]
  );

  useEffect(() => {
    loadProfiles(false, false);
  }, [loadProfiles]);

  const handleRestore = async (item: MatrimonyHiddenProfileItem) => {
    if (busyUid) return;
    setBusyUid(item.uid);
    try {
      await matrimonyApi.restoreDismissedMatches(item.uid, apiType);
      setProfiles((prev) => prev.filter((p) => p.uid !== item.uid));
    } catch (err: any) {
      Alert.alert('Action Failed', err?.message || `Unable to ${restoreLabel.toLowerCase()} profile.`);
    } finally {
      setBusyUid(null);
    }
  };

  const pageBg = isDark ? colors.bg : '#FFFFFF';
  const cardBg = isDark ? colors.surface : '#FFFFFF';
  const dividerColor = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';

  const renderItem = ({ item }: { item: MatrimonyHiddenProfileItem }) => {
    const metaParts = [
      item.age ? `${item.age} Yrs` : null,
      formatCompactHeight(item.heightCm),
      item.occupation || null,
      item.city || null,
    ].filter(Boolean);

    return (
      <View
        style={[
          styles.rowCard,
          { backgroundColor: cardBg, borderColor: dividerColor },
        ]}
      >
        {item.signedProfilePhoto ? (
          <Image
            source={{ uri: item.signedProfilePhoto }}
            style={styles.avatar}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              styles.avatarPlaceholder,
              { backgroundColor: isDark ? '#334155' : '#E2E8F0' },
            ]}
          >
            <User size={22} color="#94A3B8" />
          </View>
        )}

        <View style={styles.infoCol}>
          <Text
            style={[
              styles.nameText,
              { color: colors.text, fontFamily, fontSize: scaleFont(15.5) },
            ]}
            numberOfLines={1}
          >
            {item.displayName}
          </Text>
          <Text
            style={[styles.codeText, { color: colors.textSecondary, fontFamily }]}
            numberOfLines={1}
          >
            {item.profileCode}
          </Text>
          {metaParts.length > 0 ? (
            <Text
              style={[styles.metaText, { color: colors.textSecondary, fontFamily }]}
              numberOfLines={2}
            >
              {metaParts.join(' • ')}
            </Text>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.restoreBtn, { borderColor: CORAL_RED }]}
          activeOpacity={0.8}
          disabled={busyUid === item.uid}
          onPress={() => handleRestore(item)}
        >
          {busyUid === item.uid ? (
            <ActivityIndicator size="small" color={CORAL_RED} />
          ) : (
            <>
              <RotateCcw size={13} color={CORAL_RED} />
              <Text style={[styles.restoreText, { fontFamily }]}>{restoreLabel}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
        translucent
      />
      <MatrimonyGradientHeader title={title} onBack={() => navigation.goBack()} />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={CORAL_RED} />
        </View>
      ) : (
        <FlatList
          data={profiles}
          keyExtractor={(item) => item.uid}
          renderItem={renderItem}
          contentContainerStyle={
            profiles.length === 0
              ? styles.emptyContainer
              : {
                  padding: 16,
                  gap: 12,
                  paddingBottom: Math.max(insets.bottom + 24, 32),
                }
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadProfiles(true, true);
              }}
              colors={[CORAL_RED]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <AlertTriangle
                size={52}
                color={isDark ? '#64748B' : '#BDBDBD'}
                strokeWidth={2}
              />
              <Text
                style={[
                  styles.emptyText,
                  { color: colors.textSecondary, fontFamily, fontSize: scaleFont(14.5) },
                ]}
              >
                {emptyText}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  emptyText: {
    fontWeight: '500',
    textAlign: 'center',
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  avatarPlaceholder: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCol: {
    flex: 1,
    gap: 2,
  },
  nameText: {
    fontWeight: '800',
  },
  codeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metaText: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  restoreText: {
    color: CORAL_RED,
    fontSize: 12.5,
    fontWeight: '700',
  },
});
