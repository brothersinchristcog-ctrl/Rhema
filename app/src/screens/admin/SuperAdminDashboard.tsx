import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, Platform, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Shield, X, Search, ArrowLeft } from 'lucide-react-native';
import SuperAdminVersesManager from './SuperAdminVersesManager';
import SuperAdminDailyQuizManager from './SuperAdminDailyQuizManager';
import SuperAdminRoleManager from './SuperAdminRoleManager';
import { AdminTabContext } from '../../context/AdminTabContext';
import { useAdminTheme } from '../../utils/adminThemeHelper';

export default function SuperAdminDashboard({ navigation }: any) {
  const { isDark, screenBg, cardSurface, primaryText, secondaryText, borderColor } = useAdminTheme();
  const { setTabByName, goBack } = React.useContext(AdminTabContext) || {};
  const insets = useSafeAreaInsets();
  const { member, isPlatformSuperAdmin, user } = useAuth();
  const isSuper =
    isPlatformSuperAdmin ||
    String(member?.userType || '').toUpperCase().includes('SUPER') ||
    Boolean((member as any)?.isSuperAdmin);

  const [activeTab, setActiveTab] = useState<'verses' | 'daily_quiz' | 'super_admins'>('verses');
  const [searchQuery, setSearchQuery] = useState('');

  const handleAdminBack = () => {
    if (setTabByName) {
      setTabByName('Dashboard');
    } else if (goBack) {
      goBack();
    } else if (navigation?.canGoBack?.()) {
      navigation.goBack();
    }
  };

  useEffect(() => {
    const backAction = () => {
      handleAdminBack();
      return true;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [setTabByName, goBack]);

  useEffect(() => {
    if (!isSuper) {
      Alert.alert('Access Denied', 'You do not have permission to view this screen.');
      handleAdminBack();
    }
  }, [isSuper]);

  return (
    <View style={[styles.container, { backgroundColor: screenBg }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor="transparent" translucent={true} />
      <View style={[styles.content, { backgroundColor: screenBg }]}>
        <View style={{ paddingTop: insets.top }}>
          {/* Header */}
          <View style={[styles.header, { borderBottomWidth: 1.2, borderBottomColor: isDark ? '#2E2E2E' : '#CBD5E1', marginHorizontal: -16 }]}>
            <TouchableOpacity
              onPress={handleAdminBack}
              style={styles.backBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ArrowLeft size={22} color={primaryText} strokeWidth={2.4} />
            </TouchableOpacity>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <LinearGradient colors={['#f0b429', '#b8860b']} style={styles.headerEmblem}>
                <Shield size={17} color="#1a1200" />
              </LinearGradient>
              <Text style={[styles.headerTitle, { color: primaryText, textAlign: 'center' }]}>Platform Admin</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          {/* Tab Bar: Daily Verse, Church Quiz & Super Admins */}
          <View style={[styles.tabBar, { backgroundColor: screenBg, borderBottomColor: borderColor }]}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'verses' && styles.tabActive]}
              onPress={() => setActiveTab('verses')}
            >
              <Text
                style={[styles.tabText, { color: secondaryText }, activeTab === 'verses' && styles.tabTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                Daily Verse
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'daily_quiz' && styles.tabActive]}
              onPress={() => setActiveTab('daily_quiz')}
            >
              <Text
                style={[styles.tabText, { color: secondaryText }, activeTab === 'daily_quiz' && styles.tabTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                Church Quiz
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tab, activeTab === 'super_admins' && styles.tabActive]}
              onPress={() => setActiveTab('super_admins')}
            >
              <Text
                style={[styles.tabText, { color: secondaryText }, activeTab === 'super_admins' && styles.tabTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                Super Admins
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={[styles.searchBar, { backgroundColor: cardSurface, borderColor }]}>
            <Search size={18} color={secondaryText} />
            <TextInput
              style={[styles.searchInput, { flex: 1, color: primaryText }]}
              placeholder={
                activeTab === 'verses'
                  ? 'Search daily verses...'
                  : activeTab === 'daily_quiz'
                  ? 'Search church quizzes, date, scripture...'
                  : 'Search super admins by name or phone...'
              }
              placeholderTextColor={secondaryText}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                <X size={16} color={secondaryText} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tab Content */}
        {activeTab === 'verses' ? (
          <SuperAdminVersesManager searchQuery={searchQuery} />
        ) : activeTab === 'daily_quiz' ? (
          <SuperAdminDailyQuizManager searchQuery={searchQuery} />
        ) : (
          <SuperAdminRoleManager searchQuery={searchQuery} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  header: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerEmblem: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#f0b429',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#0a0f1e',
    marginHorizontal: -16,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#242e50',
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#f0b429' },
  tabText: { color: '#5c6890', fontSize: 14, fontWeight: '700' },
  tabTextActive: { color: '#f0b429' },

  content: { flex: 1, padding: 16, backgroundColor: '#0a0f1e' },

  searchBar: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#f4f6fb' },
});
