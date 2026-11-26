import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CheckSquare,
  Clock,
  History,
  Lock,
  RefreshCw,
  Save,
  Shield,
  ShieldCheck,
  Sliders,
  Square,
  UserCheck,
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

  const [admins, setAdmins] = useState<AdminDirectoryEntry[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
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

        setSelectedUid((prevUid) => {
          const prevStillPresent = prevUid
            ? res.admins.find((a) => a.uid === prevUid)
            : null;
          if (prevStillPresent) {
            setDraftModules(normalizeModulesMap(prevStillPresent.modules));
            return prevStillPresent.uid;
          }
          const firstStandard =
            res.admins.find((a) => !a.isSuperAdmin) || res.admins[0] || null;
          if (firstStandard) {
            setDraftModules(normalizeModulesMap(firstStandard.modules));
            return firstStandard.uid;
          }
          return null;
        });
      } catch (err: any) {
        console.error('loadDirectory error:', err);
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

  const selectedAdmin = useMemo(
    () => admins.find((a) => a.uid === selectedUid) || null,
    [admins, selectedUid]
  );

  const handleSelectAdmin = (admin: AdminDirectoryEntry) => {
    setSelectedUid(admin.uid);
    setDraftModules(normalizeModulesMap(admin.modules));
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!selectedAdmin || selectedAdmin.isSuperAdmin) return false;
    const saved = normalizeModulesMap(selectedAdmin.modules);
    return DELEGABLE_MODULE_KEYS.some(
      (k) => Boolean(draftModules[k]) !== Boolean(saved[k])
    );
  }, [selectedAdmin, draftModules]);

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
      console.warn('Audit log fetch warning:', err?.message);
    } finally {
      setLoadingLogs(false);
    }
  };

  const accentGold = '#f0b429';
  const accentBlue = '#3B82F6';
  const mutedBorder = isDark ? 'rgba(255,255,255,0.08)' : borderColor;

  if (loading && admins.length === 0) {
    return (
      <View style={[styles.centerWrap, { backgroundColor: screenBg }]}>
        <ActivityIndicator size="large" color={accentGold} />
        <Text style={[styles.loadingText, { color: secondaryText }]}>
          Loading church administrators...
        </Text>
      </View>
    );
  }

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
                {admins.length} registered administrator
                {admins.length === 1 ? '' : 's'} · Centralized access control
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

      {/* Select Administrator Horizontal List */}
      <View style={styles.blockHeader}>
        <Text style={[styles.blockTitle, { color: primaryText }]}>
          Select Administrator
        </Text>
        <Text style={[styles.blockCount, { color: secondaryText }]}>
          {filteredAdmins.length} shown
        </Text>
      </View>

      {filteredAdmins.length === 0 ? (
        <View
          style={[
            styles.emptyCard,
            { backgroundColor: cardSurface, borderColor: mutedBorder },
          ]}
        >
          <Text style={[styles.emptyText, { color: secondaryText }]}>
            No administrators match your search query.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.adminCarousel}
        >
          {filteredAdmins.map((adm) => {
            const isSelected = adm.uid === selectedUid;
            const enabledCount = DELEGABLE_MODULE_KEYS.filter(
              (k) => adm.modules?.[k] === true
            ).length;
            const initials = adm.name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w.charAt(0).toUpperCase())
              .join('') || 'A';

            return (
              <TouchableOpacity
                key={adm.uid}
                onPress={() => handleSelectAdmin(adm)}
                activeOpacity={0.85}
                style={[
                  styles.adminCard,
                  {
                    backgroundColor: cardSurface,
                    borderColor: isSelected
                      ? adm.isSuperAdmin
                        ? accentGold
                        : accentBlue
                      : mutedBorder,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
              >
                <View style={styles.adminCardTop}>
                  <View
                    style={[
                      styles.avatarCircle,
                      {
                        backgroundColor: adm.isSuperAdmin
                          ? 'rgba(240, 180, 41, 0.18)'
                          : 'rgba(59, 130, 246, 0.15)',
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
                  {adm.isSuperAdmin ? (
                    <View style={styles.superPill}>
                      <Shield size={11} color="#1a1200" />
                      <Text style={styles.superPillText}>SUPER ADMIN</Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.countPill,
                        { backgroundColor: secondarySurface },
                      ]}
                    >
                      <Text style={[styles.countPillText, { color: primaryText }]}>
                        {enabledCount}/{DELEGABLE_MODULE_KEYS.length} tabs
                      </Text>
                    </View>
                  )}
                </View>

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
                  {adm.userType || adm.role || 'Admin'}
                  {adm.phone ? ` · ${adm.phone}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Selected Administrator Permission Panel */}
      {selectedAdmin && (
        <View
          style={[
            styles.editorCard,
            { backgroundColor: cardSurface, borderColor: mutedBorder },
          ]}
        >
          <View style={styles.editorHeader}>
            <View style={{ flex: 1 }}>
              <View style={styles.editorNameRow}>
                <UserCheck
                  size={17}
                  color={selectedAdmin.isSuperAdmin ? accentGold : accentBlue}
                />
                <Text style={[styles.editorName, { color: primaryText }]}>
                  {selectedAdmin.name}
                </Text>
              </View>
              <View style={styles.lastUpdatedRow}>
                <Clock size={12} color={secondaryText} />
                <Text style={[styles.lastUpdatedText, { color: secondaryText }]}>
                  Last updated: {formatDateTime(selectedAdmin.updatedAtMs)}
                  {selectedAdmin.updatedByName
                    ? ` by ${selectedAdmin.updatedByName}`
                    : ''}
                </Text>
              </View>
            </View>
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
                <Text style={[styles.superLockedTitle, { color: primaryText }]}>
                  Super Admin Privileges Locked
                </Text>
                <Text style={[styles.superLockedDesc, { color: secondaryText }]}>
                  Super Admins retain full access to every Admin Dashboard tab
                  plus Care Cells, Expense, Donations, Daily Verses, and App
                  Admin. Super Admin permissions cannot be disabled or revoked.
                </Text>
              </View>
            </View>
          ) : (
            <>
              {/* Select All / Deselect All + Save Row */}
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
                    <Text style={[styles.bulkBtnText, { color: primaryText }]}>
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
                    <Text style={[styles.bulkBtnText, { color: primaryText }]}>
                      Deselect All
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.moduleCounterText, { color: secondaryText }]}>
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
                  <Text style={[styles.moduleTitle, { color: primaryText }]}>
                    Dashboard
                  </Text>
                  <Text style={[styles.moduleDesc, { color: secondaryText }]}>
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
                  <Text style={[styles.categoryTitle, { color: accentGold }]}>
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

              {/* Primary Save Changes Button */}
              <TouchableOpacity
                onPress={handleSavePermissions}
                disabled={saving || !hasUnsavedChanges}
                activeOpacity={0.85}
                style={[
                  styles.saveBtn,
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
            </>
          )}
        </View>
      )}

      {/* Strictly Super Admin Protected Section */}
      <View
        style={[
          styles.protectedCard,
          { backgroundColor: cardSurface, borderColor: mutedBorder },
        ]}
      >
        <View style={styles.protectedHeader}>
          <Lock size={16} color="#F59E0B" />
          <Text style={[styles.protectedTitle, { color: primaryText }]}>
            Super Admin Protected Modules
          </Text>
        </View>
        <Text style={[styles.protectedSub, { color: secondaryText }]}>
          Care Cells, Expense, Donations, Daily Verses, and App Admin remain
          strictly controlled by Super Admin and cannot be delegated here.
        </Text>

        {PROTECTED_SUPER_ADMIN_MODULES.map((mod) => (
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
            <View style={styles.lockedBadge}>
              <Lock size={11} color="#F59E0B" />
              <Text style={styles.lockedBadgeText}>SUPER ADMIN</Text>
            </View>
          </View>
        ))}
      </View>

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

            <View style={styles.modalFooter}>
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

  errorBox: { borderRadius: 12, borderWidth: 1, padding: 12 },
  errorText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },

  blockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  blockTitle: { fontSize: 14, fontWeight: '800' },
  blockCount: { fontSize: 12, fontWeight: '600' },

  emptyCard: { borderRadius: 14, borderWidth: 1, padding: 18, alignItems: 'center' },
  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },

  adminCarousel: { gap: 10, paddingVertical: 2 },
  adminCard: {
    width: 215,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  adminCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
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
    paddingVertical: 3,
    borderRadius: 6,
  },
  superPillText: { fontSize: 9.5, fontWeight: '900', color: '#1a1200' },
  countPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  countPillText: { fontSize: 11, fontWeight: '700' },
  adminCardName: { fontSize: 14, fontWeight: '700' },
  adminCardMeta: { fontSize: 11.5 },

  editorCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  editorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  editorName: { fontSize: 16, fontWeight: '800' },
  lastUpdatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  lastUpdatedText: { fontSize: 11.5 },

  superLockedBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'flex-start',
    marginTop: 4,
  },
  superLockedTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  superLockedDesc: { fontSize: 12.5, lineHeight: 18 },

  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
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

  saveBtn: {
    marginTop: 18,
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
