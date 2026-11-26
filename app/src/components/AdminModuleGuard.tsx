import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldAlert, ArrowLeft } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useAdminTheme } from '../utils/adminThemeHelper';
import {
  AdminModuleKey,
  getAdminModuleDefinition,
} from '../constants/AdminModules';

interface AdminModuleGuardProps {
  moduleKey: AdminModuleKey;
  navigation?: any;
  overrideAllowed?: boolean;
  children: React.ReactNode;
}

export const AdminModuleGuard: React.FC<AdminModuleGuardProps> = ({
  moduleKey,
  navigation,
  overrideAllowed,
  children,
}) => {
  const { loading, canAccessAdminModule, isSuperAdminUser } = useAuth();
  const { screenBg, cardSurface, primaryText, secondaryText, borderColor, colors } =
    useAdminTheme();

  if (loading) {
    return null;
  }

  const allowed =
    typeof overrideAllowed === 'boolean'
      ? overrideAllowed
      : isSuperAdminUser || canAccessAdminModule(moduleKey);

  if (allowed) {
    return <>{children}</>;
  }

  const def = getAdminModuleDefinition(moduleKey);
  const label = def?.label || moduleKey;

  const handleGoBack = () => {
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
      return;
    }
    navigation?.navigate?.('AdminRoot', { targetTab: 'Dashboard' });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: screenBg }]}>
      <View
        style={[
          styles.card,
          { backgroundColor: cardSurface, borderColor },
        ]}
      >
        <View style={styles.iconBadge}>
          <ShieldAlert size={34} color="#EF4444" />
        </View>
        <Text style={[styles.title, { color: primaryText }]}>
          Access Restricted
        </Text>
        <Text style={[styles.subtitle, { color: secondaryText }]}>
          You do not have permission to access {label}. Contact your Super Admin
          if you need access to this module.
        </Text>
        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.backBtn, { backgroundColor: colors?.primary || '#2563EB' }]}
          onPress={handleGoBack}
        >
          <ArrowLeft size={18} color="#FFFFFF" />
          <Text style={styles.backBtnText}>Return to Dashboard</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export function withAdminModuleGuard<P extends object>(
  Component: React.ComponentType<P>,
  moduleKey: AdminModuleKey
): React.FC<P & { navigation?: any }> {
  return function GuardedAdminScreen(props: P & { navigation?: any }) {
    return (
      <AdminModuleGuard moduleKey={moduleKey} navigation={props.navigation}>
        <Component {...props} />
      </AdminModuleGuard>
    );
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  iconBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 22,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
