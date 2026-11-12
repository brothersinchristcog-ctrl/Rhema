import React, { useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Platform } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { AdminTabContext } from '../../context/AdminTabContext';
import SuperAdminVersesManager from './SuperAdminVersesManager';
import { useAdminTheme, createAdminThemedStyles } from '../../utils/adminThemeHelper';

export default function AdminDailyVersesManager() {
  const { isDark, screenBg, primaryText, secondaryText, barStyle } = useAdminTheme();
  const { goBack, setTabByName } = useContext(AdminTabContext);

  return (
    <View style={[styles.safeArea, { backgroundColor: screenBg }]}>
      <StatusBar barStyle={barStyle} backgroundColor={screenBg} />
      {/* Top Header Bar */}
      <View style={[styles.header, { backgroundColor: screenBg, borderBottomColor: isDark ? '#2E2E2E' : '#CBD5E1' }]}>
        <TouchableOpacity
          onPress={() => (goBack ? goBack() : setTabByName?.('Dashboard'))}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.8}
        >
          <ArrowLeft size={22} color={primaryText} strokeWidth={2.2} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: primaryText }]} numberOfLines={1}>Daily Verses Manager</Text>
          <Text style={[styles.headerSubtitle, { color: secondaryText }]} numberOfLines={1}>5,863 Automated Scripture Verses · 4 Slots/Day</Text>
        </View>
        <View style={{ width: 40, height: 40 }} />
      </View>

      {/* Main Fully-Scrollable Verses Manager */}
      <View style={{ flex: 1, backgroundColor: screenBg }}>
        <SuperAdminVersesManager />
      </View>
    </View>
  );
}

const styles = createAdminThemedStyles(StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    borderBottomWidth: 1.2,
    borderBottomColor: '#CBD5E1',
    backgroundColor: 'transparent',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.3,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
    textAlign: 'center',
  },
}));
