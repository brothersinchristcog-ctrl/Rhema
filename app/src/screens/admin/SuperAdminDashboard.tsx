import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, Platform, BackHandler } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Shield, X, Search, ChevronLeft } from 'lucide-react-native';
import SuperAdminVersesManager from './SuperAdminVersesManager';
import SuperAdminDailyQuizManager from './SuperAdminDailyQuizManager';
import { AdminTabContext } from '../../context/AdminTabContext';

export default function SuperAdminDashboard({ navigation }: any) {
  const { setTabByName, goBack } = React.useContext(AdminTabContext) || {};
  const insets = useSafeAreaInsets();
  const { member, isPlatformSuperAdmin, user } = useAuth();
  const isSuper =
    isPlatformSuperAdmin ||
    String(member?.userType || '').toUpperCase().includes('SUPER') ||
    Boolean(
      user?.uid &&
        [
          'sXjfTqNTkKOT6dYVxkpbhjritCi2',
        ].includes(user.uid)
    );

  const [activeTab, setActiveTab] = useState<'verses' | 'daily_quiz'>('verses');
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
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor="transparent" translucent={true} />
      <View style={styles.content}>
        <View style={{ paddingTop: insets.top }}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <TouchableOpacity
                onPress={handleAdminBack}
                style={{ marginRight: 8 }}
              >
                <ChevronLeft size={28} color="#f4f6fb" />
              </TouchableOpacity>
              <LinearGradient colors={['#f0b429', '#b8860b']} style={styles.headerEmblem}>
                <Shield size={17} color="#1a1200" />
              </LinearGradient>
              <Text style={styles.headerTitle}>Platform Admin</Text>
            </View>
          </View>

          {/* Tab Bar: Daily Verse & Church Quiz */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'verses' && styles.tabActive]}
              onPress={() => setActiveTab('verses')}
            >
              <Text
                style={[styles.tabText, activeTab === 'verses' && styles.tabTextActive]}
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
                style={[styles.tabText, activeTab === 'daily_quiz' && styles.tabTextActive]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                Church Quiz
              </Text>
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Search size={18} color="#64748b" />
            <TextInput
              style={[styles.searchInput, { flex: 1 }]}
              placeholder={
                activeTab === 'verses'
                  ? 'Search daily verses...'
                  : 'Search church quizzes, date, scripture...'
              }
              placeholderTextColor="#64748b"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                <X size={16} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tab Content */}
        {activeTab === 'verses' ? (
          <SuperAdminVersesManager searchQuery={searchQuery} />
        ) : (
          <SuperAdminDailyQuizManager searchQuery={searchQuery} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1e' },
  header: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
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
