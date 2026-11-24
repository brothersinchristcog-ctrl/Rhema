import React, { useEffect } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Ban,
  ChevronRight,
  EyeOff,
  Trash2,
  UserX,
} from 'lucide-react-native';
import { FONT_STYLE_OPTIONS, useTheme } from '../../../context/ThemeContext';
import MatrimonyGradientHeader from '../components/MatrimonyGradientHeader';
import { matrimonyApi } from '../services/matrimonyApi';

const CORAL_RED = '#E04B5A';

interface AccountSettingItem {
  key: 'ignored' | 'blocked' | 'deactivate' | 'delete';
  title: string;
  subtitle: string;
  Icon: any;
  destructive?: boolean;
}

const ACCOUNT_SETTING_ITEMS: AccountSettingItem[] = [
  {
    key: 'ignored',
    title: 'Ignored Profiles',
    subtitle: "View or restore profiles you marked Don't Show",
    Icon: UserX,
  },
  {
    key: 'blocked',
    title: 'Blocked Profiles',
    subtitle: 'Manage profiles you have blocked',
    Icon: Ban,
  },
  {
    key: 'deactivate',
    title: 'Deactivate / Hide Account',
    subtitle: 'Temporarily hide your profile from matches',
    Icon: EyeOff,
  },
  {
    key: 'delete',
    title: 'Delete Account',
    subtitle: 'Permanently delete your matrimony profile',
    Icon: Trash2,
    destructive: true,
  },
];

export default function MatrimonyAccountSettingsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, fontStyle, scaleFont } = useTheme();
  const fontFamily = FONT_STYLE_OPTIONS.find((f) => f.id === fontStyle)?.family;

  const surfaceBg = isDark ? colors.surface : '#FFFFFF';
  const pageBg = isDark ? colors.bg : '#F8FAFC';
  const dividerColor = isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB';

  useEffect(() => {
    matrimonyApi.getHiddenProfiles('dont_show').catch(() => {});
    matrimonyApi.getHiddenProfiles('blocked').catch(() => {});
  }, []);

  const handlePressItem = (item: AccountSettingItem) => {
    if (item.key === 'ignored') {
      navigation.navigate('MatrimonyHiddenProfiles', { mode: 'ignored' });
      return;
    }
    if (item.key === 'blocked') {
      navigation.navigate('MatrimonyHiddenProfiles', { mode: 'blocked' });
      return;
    }
    if (item.key === 'deactivate') {
      navigation.navigate('MatrimonyDeactivateAccount');
      return;
    }
    if (item.key === 'delete') {
      navigation.navigate('MatrimonyDeleteProfile');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: surfaceBg }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? 'light-content' : 'dark-content'}
      />

      <MatrimonyGradientHeader
        title="Account settings"
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={{ flex: 1, backgroundColor: pageBg }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: Math.max(insets.bottom + 24, 32),
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: surfaceBg,
              borderColor: dividerColor,
            },
          ]}
        >
          {ACCOUNT_SETTING_ITEMS.map((item, idx) => {
            const { key, title, subtitle, Icon, destructive } = item;
            const iconColor = destructive ? CORAL_RED : colors.textSecondary;
            const titleColor = destructive ? CORAL_RED : colors.text;

            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.row,
                  idx < ACCOUNT_SETTING_ITEMS.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: dividerColor,
                  },
                ]}
                activeOpacity={0.75}
                onPress={() => handlePressItem(item)}
              >
                <View
                  style={[
                    styles.iconBox,
                    {
                      backgroundColor: destructive
                        ? isDark
                          ? 'rgba(224,75,90,0.16)'
                          : '#FFF1F2'
                        : isDark
                        ? 'rgba(255,255,255,0.06)'
                        : '#F1F5F9',
                    },
                  ]}
                >
                  <Icon size={19} color={iconColor} />
                </View>

                <View style={styles.textCol}>
                  <Text
                    style={[
                      styles.rowTitle,
                      { color: titleColor, fontFamily, fontSize: scaleFont(15.5) },
                    ]}
                  >
                    {title}
                  </Text>
                  <Text
                    style={[
                      styles.rowSub,
                      { color: colors.textSecondary, fontFamily, fontSize: scaleFont(12.5) },
                    ]}
                  >
                    {subtitle}
                  </Text>
                </View>

                <ChevronRight size={19} color={colors.textSecondary} />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontWeight: '700',
  },
  rowSub: {
    fontWeight: '400',
    lineHeight: 18,
  },
});
