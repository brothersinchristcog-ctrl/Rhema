import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CheckSquare,
  ChevronRight,
  Clock,
  History,
  Info,
  Lock,
  RefreshCw,
  Save,
  Shield,
  ShieldCheck,
  Sliders,
  Square,
  UserCheck,
  Users,
  X,
} from 'lucide-react-native';
import {
  AdminModuleCategory,
  AdminModuleDefinition,
  buildDefaultNewAdminModules,
  DELEGABLE_ADMIN_MODULES,
  DELEGABLE_MODULE_KEYS,
  getAdminModuleDefinition,
  PROTECTED_SUPER_ADMIN_MODULES,
} from '../../constants/AdminModules';
import { useChurch } from '../../context/ChurchContext';
import AdminPermissionService, {
  AdminDirectoryEntry,
  AdminPermissionAuditLog,
} from '../../services/AdminPermissionService';
import { useAdminTheme } from '../../utils/adminThemeHelper';

interface AdminPermissionsManagerProps {
  searchQuery?: string;
}

const CATEGORY_ORDER: AdminModuleCategory[] = [
  'Ministry & Word',
  'People & Fellowship',
  'Services & Events',
  'Media & Communications',
  'Church Management',
];

function formatDateTime(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms)) return 'Not updated yet';
  try {
    return new Date(ms).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return new Date(ms).toISOString();
  }
}

function normalizeModulesMap(raw?: Record<string, boolean> | null): Record<string, boolean> {
  const out: Record<string, boolean> = { dashboard: true };
  for (const key of DELEGABLE_MODULE_KEYS) {
    out[key] = Boolean(raw && raw[key] === true);
  }
  return out;
}

function moduleLabelList(keys: string[]): string {
  return keys
    .map((k) => getAdminModuleDefinition(k as any)?.label || k)
    .join(', ');
}

export default function AdminPermissionsManager({
  searchQuery = '',
}: AdminPermissionsManagerProps) {
  const { activeChurch } = useChurch();
  const insets = useSafeAreaInsets();
  const {
    isDark,
    screenBg,
    cardSurface,
    secondarySurface,
    primaryText,
    secondaryText,
    borderColor,
    appFontFamily,
  } = useAdminTheme();

  const churchId = activeChurch?.id || 'rhema';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);

  const [admins, setAdmins] = useState<AdminDirectoryEntry[]>([]);
  const [roleFilter, setRoleFilter] = useState<'all' | 'admins' | 'super_admins'>('all');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [showEditorWindow, setShowEditorWindow] = useState(false);
  const [draftModules, setDraftModules] = useState<Record<string, boolean>>({
    dashboard: true,
  });

  // Default new-admin template modal
  const [defaultModules, setDefaultModules] = useState<Record<string, boolean>>(() =>
    buildDefaultNewAdminModules(null)
  );
  const [defaultsDraft, setDefaultsDraft] = useState<Record<string, boolean>>(() =>
    buildDefaultNewAdminModules(null)
  );
  const [showDefaultsModal, setShowDefaultsModal] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);

  // Audit Log modal
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AdminPermissionAuditLog[]>([]);

  const loadDirectory = useCallback(
    async (isPull = false) => {
      if (isPull) setRefreshing(true);
      else setLoading(true);
      setErrorMsg(null);

      try {
        const res = await AdminPermissionService.listChurchAdminsWithPermissions(
          churchId
        );
        setAdmins(res.admins);
        setDefaultModules(res.defaultModules);
        setDefaultsDraft(res.defaultModules);
        setUsingFallback(Boolean(res.fromFirestoreFallback));

        setSelectedUid((prevUid) => {
          if (!prevUid) return null;
          const prevStillPresent = res.admins.find((a) => a.uid === prevUid);
          if (prevStillPresent) {
            setDraftModules(normalizeModulesMap(prevStillPresent.modules));
            return prevStillPresent.uid;
          }
          setShowEditorWindow(false);
          return null;
        });
      } catch (err: any) {
        console.warn('AdminPermissions loadDirectory notice:', err?.message || err);
        setErrorMsg(
          err?.message || 'Unable to load church administrators and permissions.'
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [churchId]
  );

  useEffect(() => {
    loadDirectory(false);
  }, [loadDirectory]);

  const filteredAdmins = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter((a) => {
      const hay = `${a.name} ${a.phone} ${a.email} ${a.userType} ${a.role}`.toLowerCase();
      return hay.includes(q);
    });
  }, [admins, searchQuery]);

  const standardAdminMembers = useMemo(
    () => filteredAdmins.filter((a) => !a.isSuperAdmin),
    [filteredAdmins]
  );
  const superAdminMembers = useMemo(
    () => filteredAdmins.filter((a) => a.isSuperAdmin),
    [filteredAdmins]
  );

  const selectedAdmin = useMemo(
    () => admins.find((a) => a.uid === selectedUid) || null,
    [admins, selectedUid]
  );

  const handleOpenAdminWindow = (admin: AdminDirectoryEntry) => {
    setSelectedUid(admin.uid);
    setDraftModules(normalizeModulesMap(admin.modules));
    setShowEditorWindow(true);
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!selectedAdmin || selectedAdmin.isSuperAdmin) return false;
    const saved = normalizeModulesMap(selectedAdmin.modules);
    return DELEGABLE_MODULE_KEYS.some(
      (k) => Boolean(draftModules[k]) !== Boolean(saved[k])
    );
  }, [selectedAdmin, draftModules]);

  const handleCloseAdminWindow = () => {
    if (saving) return;
    if (hasUnsavedChanges) {
      Alert.alert(
        'Discard Unsaved Changes?',
        'You have modified module toggles for this administrator without saving.',
        [
          { text: 'Keep Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setShowEditorWindow(false);
              setSelectedUid(null);
            },
          },
        ]
      );
      return;
    }
    setShowEditorWindow(false);
    setSelectedUid(null);
  };

  const enabledCountForDraft = useMemo(
    () => DELEGABLE_MODULE_KEYS.filter((k) => draftModules[k] === true).length,
    [draftModules]
  );

  const groupedModules = useMemo(() => {
    const map = new Map<AdminModuleCategory, AdminModuleDefinition[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const def of DELEGABLE_ADMIN_MODULES) {
      const list = map.get(def.category) || [];
      list.push(def);
      map.set(def.category, list);
    }
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      items: map.get(cat) || [],
    })).filter((g) => g.items.length > 0);
  }, []);

  const handleToggleModule = (key: string, nextVal: boolean) => {
    setDraftModules((prev) => ({
      ...prev,
      dashboard: true,
      [key]: nextVal,
    }));
  };

  const handleSelectAll = () => {
    const allOn: Record<string, boolean> = { dashboard: true };
    for (const key of DELEGABLE_MODULE_KEYS) allOn[key] = true;
    setDraftModules(allOn);
  };

  const handleDeselectAll = () => {
    const allOff: Record<string, boolean> = { dashboard: true };
    for (const key of DELEGABLE_MODULE_KEYS) allOff[key] = false;
    setDraftModules(allOff);
  };

  const handleSavePermissions = async () => {
    if (!selectedAdmin || selectedAdmin.isSuperAdmin || saving) return;
    setSaving(true);
    try {
      const payload = normalizeModulesMap(draftModules);
      const res = await AdminPermissionService.saveAdminModulePermissions({
        churchId,
        targetUid: selectedAdmin.uid,
        modules: payload,
      });

      const savedModules = normalizeModulesMap(res?.modules || payload);
      setDraftModules(savedModules);
      setUsingFallback(false);
      setAdmins((prev) =>
        prev.map((a) =>
          a.uid === selectedAdmin.uid
            ? {
                ...a,
                modules: savedModules,
                hasExplicitDoc: true,
                updatedAtMs: Date.now(),
                updatedByName: 'Super Admin',
              }
            : a
        )
      );

      Alert.alert(
        'Permissions Saved',
        `Updated dashboard access for ${selectedAdmin.name} (${
          DELEGABLE_MODULE_KEYS.filter((k) => savedModules[k] === true).length
        }/${DELEGABLE_MODULE_KEYS.length} modules enabled).`
      );
    } catch (err: any) {
      Alert.alert(
        'Save Failed',
        err?.message || 'Unable to save administrator permissions.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDefaults = () => {
    setDefaultsDraft(normalizeModulesMap(defaultModules));
    setShowDefaultsModal(true);
  };

  const handleSaveDefaults = async () => {
    if (savingDefaults) return;
    setSavingDefaults(true);
    try {
      const cleaned = normalizeModulesMap(defaultsDraft);
      const res = await AdminPermissionService.saveDefaultAdminPermissions({
        churchId,
        defaultModules: cleaned,
      });
      const updated = normalizeModulesMap(res?.defaultModules || cleaned);
      setDefaultModules(updated);
      setShowDefaultsModal(false);
      Alert.alert(
        'Default Template Updated',
        'Newly promoted administrators will automatically start with these permissions.'
      );
    } catch (err: any) {
      Alert.alert(
        'Update Failed',
        err?.message || 'Could not update default new-admin permissions.'
      );
    } finally {
      setSavingDefaults(false);
    }
  };

  const handleOpenAuditLogs = async () => {
    setShowAuditModal(true);
    setLoadingLogs(true);
    try {
      const logs = await AdminPermissionService.listPermissionAuditLogs(
        churchId,
        50
      );
      setAuditLogs(logs);
    } catch (err: any) {
      console.warn('Audit log fetch notice:', err?.message);
      setAuditLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  const accentGold = '#f0b429';
  const accentBlue = '#3B82F6';
  const mutedBorder = isDark ? 'rgba(255,255,255,0.08)' : borderColor;

  const renderAdminCardRow = (adm: AdminDirectoryEntry) => {
    const enabledCount = DELEGABLE_MODULE_KEYS.filter(
      (k) => adm.modules?.[k] === true
    ).length;
    const initials =
      adm.name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w.charAt(0).toUpperCase())
        .join('') || 'A';

    return (
      <TouchableOpacity
        key={adm.uid}
        onPress={() => handleOpenAdminWindow(adm)}
        activeOpacity={0.82}
        style={[
          styles.memberRowCard,
          {
            backgroundColor: secondarySurface,
            borderColor: mutedBorder,
            borderWidth: 1,
          },
        ]}
      >
        <View
          style={[
            styles.avatarCircle,
            {
              backgroundColor: adm.isSuperAdmin
                ? 'rgba(240, 180, 41, 0.2)'
                : 'rgba(59, 130, 246, 0.16)',
            },
          ]}
        >
          <Text
            style={[
              styles.avatarInitials,
              { color: adm.isSuperAdmin ? accentGold : accentBlue },
            ]}
          >
            {initials}
          </Text>
        </View>

        <View style={{ flex: 1, marginRight: 6 }}>
          <Text
            style={[styles.adminCardName, { color: primaryText }]}
            numberOfLines={1}
          >
            {adm.name}
          </Text>
          <Text
            style={[styles.adminCardMeta, { color: secondaryText }]}
            numberOfLines={1}
          >
            {adm.userType || adm.role || (adm.isSuperAdmin ? 'Super Admin' : 'Admin')}
            {adm.phone ? ` · ${adm.phone}` : ''}
          </Text>
        </View>

        {adm.isSuperAdmin ? (
          <View style={styles.superPill}>
            <Shield size={10} color="#1a1200" />
            <Text style={styles.superPillText}>SUPER ADMIN</Text>
          </View>
        ) : (
          <View
            style={[
              styles.countPill,
              {
                backgroundColor: isDark
                  ? 'rgba(59, 130, 246, 0.2)'
                  : '#DBEAFE',
              },
            ]}
          >
            <Text style={[styles.countPillText, { color: accentBlue }]}>
              {enabledCount}/{DELEGABLE_MODULE_KEYS.length} tabs
            </Text>
          </View>
        )}

        <ChevronRight size={16} color={secondaryText} />
      </TouchableOpacity>
    );
  };

  if (loading && admins.length === 0) {
    return (
      <View style={[styles.centerWrap, { backgroundColor: screenBg }]}>
        <ActivityIndicator size="large" color={accentGold} />
        <Text style={[styles.loadingText, { color: secondaryText }]}>
          Loading Admin & Super Admin members...
        </Text>
      </View>
    );
  }

  const totalAdminCount = admins.filter((a) => !a.isSuperAdmin).length;
  const totalSuperCount = admins.filter((a) => a.isSuperAdmin).length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: screenBg }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadDirectory(true)}
          tintColor={accentGold}
        />
      }
    >
      {/* Top Action Bar */}
      <View
        style={[
          styles.headerBanner,
          { backgroundColor: cardSurface, borderColor: mutedBorder },
        ]}
      >
        <View style={styles.headerBannerTop}>
          <View style={styles.headerBannerTitleRow}>
            <View style={styles.headerIconBadge}>
              <ShieldCheck size={18} color="#1a1200" />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={[
                  styles.sectionHeading,
                  { color: primaryText, fontFamily: appFontFamily },
                ]}
              >
                Admin Permissions
              </Text>
              <Text style={[styles.sectionSub, { color: secondaryText }]}>
                {totalAdminCount} Admin Member{totalAdminCount === 1 ? '' : 's'} ·{' '}
                {totalSuperCount} Super Admin{totalSuperCount === 1 ? '' : 's'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => loadDirectory(true)}
            style={[
              styles.iconPillBtn,
              { backgroundColor: secondarySurface, borderColor: mutedBorder },
            ]}
          >
            <RefreshCw size={15} color={primaryText} />
          </TouchableOpacity>
        </View>

        <View style={styles.topActionRow}>
          <TouchableOpacity
            onPress={handleOpenDefaults}
            style={[
              styles.topActionBtn,
              { backgroundColor: secondarySurface, borderColor: mutedBorder },
            ]}
            activeOpacity={0.8}
          >
            <Sliders size={14} color={accentBlue} />
            <Text style={[styles.topActionBtnText, { color: primaryText }]}>
              New Admin Defaults
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleOpenAuditLogs}
            style={[
              styles.topActionBtn,
              { backgroundColor: secondarySurface, borderColor: mutedBorder },
            ]}
            activeOpacity={0.8}
          >
            <History size={14} color={accentGold} />
            <Text style={[styles.topActionBtnText, { color: primaryText }]}>
              Audit Logs
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {usingFallback && (
        <View
          style={[
            styles.infoBanner,
            {
              backgroundColor: isDark
                ? 'rgba(245, 158, 11, 0.12)'
                : '#FFFBEB',
              borderColor: 'rgba(245, 158, 11, 0.45)',
            },
          ]}
        >
          <Info size={16} color="#F59E0B" />
          <Text style={[styles.infoBannerText, { color: primaryText }]}>
            Showing Admin & Super Admin members from Firestore. Deploy Cloud
            Functions & Rules (`firebase deploy --only functions,firestore:rules`)
            to save and enforce changes live.
          </Text>
        </View>
      )}

      {errorMsg && (
        <View
          style={[
            styles.errorBox,
            { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderColor: '#EF4444' },
          ]}
        >
          <Text style={styles.errorText}>{errorMsg}</Text>
        </View>
      )}

      {/* Role Filter Chips & Admin/Super Admin Member Directory */}
      <View
        style={[
          styles.directoryCard,
          { backgroundColor: cardSurface, borderColor: mutedBorder },
        ]}
      >
        <View style={styles.blockHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Users size={15} color={accentGold} />
            <Text style={[styles.blockTitle, { color: primaryText }]}>
              Admin & Super Admin Members
            </Text>
          </View>
          <Text style={[styles.blockCount, { color: secondaryText }]}>
            Tap any admin to manage
          </Text>
        </View>

        <View style={styles.filterPillsRow}>
          {[
            { id: 'all' as const, label: `All (${filteredAdmins.length})` },
            {
              id: 'admins' as const,
              label: `Admins (${standardAdminMembers.length})`,
            },
            {
              id: 'super_admins' as const,
              label: `Super Admins (${superAdminMembers.length})`,
            },
          ].map((pill) => {
            const active = roleFilter === pill.id;
            return (
              <TouchableOpacity
                key={pill.id}
                onPress={() => setRoleFilter(pill.id)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: active ? accentGold : secondarySurface,
                    borderColor: active ? accentGold : mutedBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: active ? '#1a1200' : primaryText },
                  ]}
                >
                  {pill.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {filteredAdmins.length === 0 ? (
          <Text style={[styles.emptyText, { color: secondaryText }]}>
            No admin or super admin members match your search query.
          </Text>
        ) : (
          <View style={styles.memberSectionsWrap}>
            {(roleFilter === 'all' || roleFilter === 'admins') && (
              <View style={styles.memberGroupBlock}>
                <Text style={[styles.groupHeading, { color: accentBlue }]}>
                  Admin Members ({standardAdminMembers.length})
                </Text>
                {standardAdminMembers.length === 0 ? (
                  <Text style={[styles.groupEmptyText, { color: secondaryText }]}>
                    No standard Admin members found yet. Promote a member in
                    Members tab to assign custom tab access.
                  </Text>
                ) : (
                  <View style={styles.groupList}>
                    {standardAdminMembers.map(renderAdminCardRow)}
                  </View>
                )}
              </View>
            )}

            {(roleFilter === 'all' || roleFilter === 'super_admins') && (
              <View style={styles.memberGroupBlock}>
                <Text style={[styles.groupHeading, { color: accentGold }]}>
                  Super Admin Members ({superAdminMembers.length})
                </Text>
                {superAdminMembers.length === 0 ? (
                  <Text style={[styles.groupEmptyText, { color: secondaryText }]}>
                    No Super Admin members found.
                  </Text>
                ) : (
                  <View style={styles.groupList}>
                    {superAdminMembers.map(renderAdminCardRow)}
                  </View>
                )}
              </View>
            )}
          </View>
        )}
      </View>

      {/* Dedicated Next Window for Selected Administrator Permissions */}
      <Modal
        visible={showEditorWindow && Boolean(selectedAdmin)}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleCloseAdminWindow}
      >
        <SafeAreaView
          edges={['left', 'right']}
          style={[styles.windowContainer, { backgroundColor: screenBg }]}
        >
          {/* Window Top Header Bar */}
          <View
            style={[
              styles.windowHeader,
              {
                paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 14 : 12),
                backgroundColor: cardSurface,
                borderBottomColor: mutedBorder,
              },
            ]}
          >
            <TouchableOpacity
              onPress={handleCloseAdminWindow}
              style={styles.windowBackBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <ArrowLeft size={22} color={primaryText} />
            </TouchableOpacity>

            <View style={{ flex: 1 }}>
              <View style={styles.editorNameRow}>
                <UserCheck
                  size={17}
                  color={selectedAdmin?.isSuperAdmin ? accentGold : accentBlue}
                />
                <Text
                  style={[styles.editorName, { color: primaryText }]}
                  numberOfLines={1}
                >
                  {selectedAdmin?.name || 'Administrator'}
                </Text>
              </View>
              <Text
                style={[styles.windowSubText, { color: secondaryText }]}
                numberOfLines={1}
              >
                {selectedAdmin?.userType || selectedAdmin?.role || 'Admin'}
                {selectedAdmin?.phone ? ` · ${selectedAdmin.phone}` : ''}
              </Text>
            </View>

            {selectedAdmin?.isSuperAdmin ? (
              <View style={styles.superPill}>
                <Shield size={11} color="#1a1200" />
                <Text style={styles.superPillText}>SUPER ADMIN</Text>
              </View>
            ) : (
              <View
                style={[
                  styles.countPill,
                  {
                    backgroundColor: isDark
                      ? 'rgba(16, 185, 129, 0.16)'
                      : '#DCFCE7',
                  },
                ]}
              >
                <Text style={[styles.countPillText, { color: '#10B981' }]}>
                  {enabledCountForDraft}/{DELEGABLE_MODULE_KEYS.length} ON
                </Text>
              </View>
            )}
          </View>

          {selectedAdmin && (
            <ScrollView
              style={styles.windowScroll}
              contentContainerStyle={styles.windowScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Last Updated & Context Card */}
              <View
                style={[
                  styles.metaBanner,
                  { backgroundColor: cardSurface, borderColor: mutedBorder },
                ]}
              >
                <Clock size={14} color={secondaryText} />
                <Text style={[styles.lastUpdatedText, { color: secondaryText }]}>
                  Last updated: {formatDateTime(selectedAdmin.updatedAtMs)}
                  {selectedAdmin.updatedByName
                    ? ` by ${selectedAdmin.updatedByName}`
                    : ''}
                </Text>
              </View>

              {selectedAdmin.isSuperAdmin ? (
                <View
                  style={[
                    styles.superLockedBox,
                    {
                      backgroundColor: isDark
                        ? 'rgba(240, 180, 41, 0.12)'
                        : '#FFFBEB',
                      borderColor: 'rgba(240, 180, 41, 0.45)',
                    },
                  ]}
                >
                  <Lock size={20} color="#D97706" />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.superLockedTitle, { color: primaryText }]}
                    >
                      Super Admin Privileges Locked
                    </Text>
                    <Text
                      style={[styles.superLockedDesc, { color: secondaryText }]}
                    >
                      Super Admins automatically retain full access to every
                      Admin Dashboard tab plus Care Cells, Expense, Donations,
                      Daily Verses, and App Admin. Super Admin permissions cannot
                      be disabled or revoked.
                    </Text>
                  </View>
                </View>
              ) : (
                <View
                  style={[
                    styles.editorCard,
                    { backgroundColor: cardSurface, borderColor: mutedBorder },
                  ]}
                >
                  {/* Select All / Deselect All Toolbar */}
                  <View
                    style={[
                      styles.toolbarRow,
                      { borderBottomColor: mutedBorder },
                    ]}
                  >
                    <View style={styles.bulkButtonsRow}>
                      <TouchableOpacity
                        onPress={handleSelectAll}
                        style={[
                          styles.bulkBtn,
                          {
                            backgroundColor: secondarySurface,
                            borderColor: mutedBorder,
                          },
                        ]}
                      >
                        <CheckSquare size={14} color="#10B981" />
                        <Text
                          style={[styles.bulkBtnText, { color: primaryText }]}
                        >
                          Select All
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={handleDeselectAll}
                        style={[
                          styles.bulkBtn,
                          {
                            backgroundColor: secondarySurface,
                            borderColor: mutedBorder,
                          },
                        ]}
                      >
                        <Square size={14} color="#EF4444" />
                        <Text
                          style={[styles.bulkBtnText, { color: primaryText }]}
                        >
                          Deselect All
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <Text
                      style={[styles.moduleCounterText, { color: secondaryText }]}
                    >
                      {enabledCountForDraft}/{DELEGABLE_MODULE_KEYS.length} Active
                    </Text>
                  </View>

                  {/* Core Always-ON Dashboard Row */}
                  <View
                    style={[
                      styles.moduleRow,
                      { borderBottomColor: mutedBorder },
                    ]}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text
                        style={[styles.moduleTitle, { color: primaryText }]}
                      >
                        Dashboard
                      </Text>
                      <Text
                        style={[styles.moduleDesc, { color: secondaryText }]}
                      >
                        Core Admin home hub (always enabled for active Admins)
                      </Text>
                    </View>
                    <View style={styles.alwaysOnBadge}>
                      <Text style={styles.alwaysOnText}>ALWAYS ON</Text>
                    </View>
                  </View>

                  {/* Categorized Delegable Module Switches */}
                  {groupedModules.map((group) => (
                    <View key={group.category} style={styles.categorySection}>
                      <Text
                        style={[styles.categoryTitle, { color: accentGold }]}
                      >
                        {group.category}
                      </Text>

                      {group.items.map((mod) => {
                        const enabled = draftModules[mod.key] === true;
                        return (
                          <View
                            key={mod.key}
                            style={[
                              styles.moduleRow,
                              { borderBottomColor: mutedBorder },
                            ]}
                          >
                            <View style={{ flex: 1, paddingRight: 12 }}>
                              <Text
                                style={[
                                  styles.moduleTitle,
                                  { color: primaryText },
                                ]}
                              >
                                {mod.label}
                              </Text>
                              <Text
                                style={[
                                  styles.moduleDesc,
                                  { color: secondaryText },
                                ]}
                              >
                                {mod.description}
                              </Text>
                            </View>
                            <Switch
                              value={enabled}
                              onValueChange={(val) =>
                                handleToggleModule(mod.key, val)
                              }
                              trackColor={{
                                false: isDark ? '#3F3F46' : '#CBD5E1',
                                true: '#10B981',
                              }}
                              thumbColor="#FFFFFF"
                            />
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              )}

              {/* Super Admin Protected Modules Lock Card */}
              <View
                style={[
                  styles.protectedCard,
                  { backgroundColor: cardSurface, borderColor: mutedBorder },
                ]}
              >
                <View style={styles.protectedHeader}>
                  <Lock size={16} color="#F59E0B" />
                  <Text
                    style={[styles.protectedTitle, { color: primaryText }]}
                  >
                    Super Admin Protected Modules
                  </Text>
                </View>
                <Text style={[styles.protectedSub, { color: secondaryText }]}>
                  Care Cells, Expense, Donations, Daily Verses, and App Admin
                  remain strictly controlled by Super Admin and cannot be
                  delegated here.
                </Text>

                {PROTECTED_SUPER_ADMIN_MODULES.map((mod) => (
                  <View
                    key={mod.key}
                    style={[
                      styles.moduleRow,
                      { borderBottomColor: mutedBorder },
                    ]}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text
                        style={[styles.moduleTitle, { color: primaryText }]}
                      >
                        {mod.label}
                      </Text>
                      <Text
                        style={[styles.moduleDesc, { color: secondaryText }]}
                      >
                        {mod.description}
                      </Text>
                    </View>
                    <View style={styles.lockedBadge}>
                      <Lock size={11} color="#F59E0B" />
                      <Text style={styles.lockedBadgeText}>SUPER ADMIN</Text>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {/* Pinned Bottom Action Bar in Window */}
          {selectedAdmin && !selectedAdmin.isSuperAdmin && (
            <View
              style={[
                styles.windowFooter,
                {
                  backgroundColor: cardSurface,
                  borderTopColor: mutedBorder,
                  paddingBottom: Math.max(insets.bottom, 14),
                },
              ]}
            >
              <TouchableOpacity
                onPress={handleSavePermissions}
                disabled={saving || !hasUnsavedChanges}
                activeOpacity={0.85}
                style={[
                  styles.saveBtnFooter,
                  {
                    backgroundColor: hasUnsavedChanges ? '#10B981' : '#64748B',
                    opacity: saving || !hasUnsavedChanges ? 0.65 : 1,
                  },
                ]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Save size={17} color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>
                      {hasUnsavedChanges ? 'Save Changes' : 'All Changes Saved'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Default New Admin Permissions Modal */}
      <Modal
        visible={showDefaultsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDefaultsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: cardSurface, borderColor: mutedBorder },
            ]}
          >
            <View
              style={[styles.modalHeader, { borderBottomColor: mutedBorder }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: primaryText }]}>
                  Default New Admin Permissions
                </Text>
                <Text style={[styles.modalSub, { color: secondaryText }]}>
                  Assigned automatically when promoting a member to Admin
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowDefaultsModal(false)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color={primaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {DELEGABLE_ADMIN_MODULES.map((mod) => (
                <View
                  key={mod.key}
                  style={[styles.moduleRow, { borderBottomColor: mutedBorder }]}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.moduleTitle, { color: primaryText }]}>
                      {mod.label}
                    </Text>
                    <Text style={[styles.moduleDesc, { color: secondaryText }]}>
                      {mod.description}
                    </Text>
                  </View>
                  <Switch
                    value={defaultsDraft[mod.key] === true}
                    onValueChange={(v) =>
                      setDefaultsDraft((prev) => ({
                        ...prev,
                        dashboard: true,
                        [mod.key]: v,
                      }))
                    }
                    trackColor={{
                      false: isDark ? '#3F3F46' : '#CBD5E1',
                      true: accentBlue,
                    }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              ))}
            </ScrollView>

            <View
              style={[
                styles.modalFooter,
                { paddingBottom: Math.max(insets.bottom, 6) },
              ]}
            >
              <TouchableOpacity
                onPress={() =>
                  setDefaultsDraft(buildDefaultNewAdminModules(null))
                }
                style={[
                  styles.modalSecondaryBtn,
                  {
                    backgroundColor: secondarySurface,
                    borderColor: mutedBorder,
                  },
                ]}
              >
                <Text style={[styles.modalSecondaryText, { color: primaryText }]}>
                  Dashboard Only
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveDefaults}
                disabled={savingDefaults}
                style={styles.modalPrimaryBtn}
              >
                {savingDefaults ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalPrimaryText}>Save Defaults</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Permission Change Audit Log Modal */}
      <Modal
        visible={showAuditModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAuditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: cardSurface, borderColor: mutedBorder },
            ]}
          >
            <View
              style={[styles.modalHeader, { borderBottomColor: mutedBorder }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: primaryText }]}>
                  Permission Audit Log
                </Text>
                <Text style={[styles.modalSub, { color: secondaryText }]}>
                  Recent Super Admin permission and role updates
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowAuditModal(false)}
                style={styles.modalCloseBtn}
              >
                <X size={20} color={primaryText} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {loadingLogs ? (
                <View style={styles.centerWrap}>
                  <ActivityIndicator size="small" color={accentGold} />
                </View>
              ) : auditLogs.length === 0 ? (
                <Text style={[styles.emptyText, { color: secondaryText }]}>
                  No permission changes recorded yet.
                </Text>
              ) : (
                auditLogs.map((log) => (
                  <View
                    key={log.id}
                    style={[
                      styles.logItem,
                      { borderBottomColor: mutedBorder },
                    ]}
                  >
                    <View style={styles.logTopRow}>
                      <Text style={[styles.logAction, { color: accentGold }]}>
                        {log.action.replace(/_/g, ' ')}
                      </Text>
                      <Text style={[styles.logDate, { color: secondaryText }]}>
                        {formatDateTime(log.createdAtMs)}
                      </Text>
                    </View>
                    <Text style={[styles.logActor, { color: primaryText }]}>
                      {log.actorName} updated {log.targetName}
                    </Text>
                    {log.addedModules.length > 0 && (
                      <Text style={styles.logAdded}>
                        + Granted: {moduleLabelList(log.addedModules)}
                      </Text>
                    )}
                    {log.removedModules.length > 0 && (
                      <Text style={styles.logRemoved}>
                        - Revoked: {moduleLabelList(log.removedModules)}
                      </Text>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40, gap: 14 },
  centerWrap: { padding: 36, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 10, fontSize: 13 },

  headerBanner: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  headerBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#f0b429',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeading: { fontSize: 16, fontWeight: '800' },
  sectionSub: { fontSize: 12, marginTop: 2 },
  iconPillBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topActionRow: { flexDirection: 'row', gap: 10 },
  topActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  topActionBtnText: { fontSize: 12.5, fontWeight: '700' },

  infoBanner: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
  },
  infoBannerText: { flex: 1, fontSize: 12, lineHeight: 17 },

  errorBox: { borderRadius: 12, borderWidth: 1, padding: 12 },
  errorText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },

  directoryCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  blockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  blockTitle: { fontSize: 14.5, fontWeight: '800' },
  blockCount: { fontSize: 11.5, fontWeight: '600' },

  filterPillsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: { fontSize: 12, fontWeight: '700' },

  memberSectionsWrap: { gap: 14 },
  memberGroupBlock: { gap: 8 },
  groupHeading: {
    fontSize: 11.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  groupList: { gap: 8 },
  groupEmptyText: { fontSize: 12.5, lineHeight: 18, paddingVertical: 4 },

  memberRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 11,
    gap: 10,
  },
  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },

  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 13, fontWeight: '800' },
  superPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0b429',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 6,
  },
  superPillText: { fontSize: 9.5, fontWeight: '900', color: '#1a1200' },
  countPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  countPillText: { fontSize: 11, fontWeight: '700' },
  adminCardName: { fontSize: 14, fontWeight: '700' },
  adminCardMeta: { fontSize: 11.5, marginTop: 1 },

  // Dedicated Next Window styles
  windowContainer: { flex: 1 },
  windowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  windowBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  windowSubText: { fontSize: 11.5, marginTop: 2 },
  windowScroll: { flex: 1 },
  windowScrollContent: { padding: 16, gap: 14, paddingBottom: 28 },
  metaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  windowFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },

  editorCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  editorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editorName: { fontSize: 16, fontWeight: '800', flexShrink: 1 },
  lastUpdatedText: { fontSize: 11.5, flex: 1 },

  superLockedBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  superLockedTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  superLockedDesc: { fontSize: 12.5, lineHeight: 18 },

  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  bulkButtonsRow: { flexDirection: 'row', gap: 8 },
  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  bulkBtnText: { fontSize: 12, fontWeight: '700' },
  moduleCounterText: { fontSize: 12, fontWeight: '700' },

  categorySection: { marginTop: 14 },
  categoryTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  moduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  moduleTitle: { fontSize: 14, fontWeight: '700' },
  moduleDesc: { fontSize: 11.5, marginTop: 2, lineHeight: 16 },
  alwaysOnBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
  },
  alwaysOnText: { color: '#10B981', fontSize: 10.5, fontWeight: '800' },

  saveBtnFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  protectedCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  protectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 4,
  },
  protectedTitle: { fontSize: 14.5, fontWeight: '800' },
  protectedSub: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  lockedBadgeText: { color: '#F59E0B', fontSize: 10, fontWeight: '800' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '85%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingBottom: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 16.5, fontWeight: '800' },
  modalSub: { fontSize: 12, marginTop: 2 },
  modalCloseBtn: { padding: 6 },
  modalScroll: { paddingHorizontal: 16 },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  modalSecondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalSecondaryText: { fontSize: 13.5, fontWeight: '700' },
  modalPrimaryBtn: {
    flex: 1.2,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },
  modalPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

  logItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 3,
  },
  logTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  logAction: { fontSize: 11, fontWeight: '800' },
  logDate: { fontSize: 11 },
  logActor: { fontSize: 13, fontWeight: '700' },
  logAdded: { fontSize: 11.5, color: '#10B981', marginTop: 2 },
  logRemoved: { fontSize: 11.5, color: '#EF4444', marginTop: 1 },
});
